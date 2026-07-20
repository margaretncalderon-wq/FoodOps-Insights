"""
Cost Audit — FASE 1 (Read-Only Audit) of the cascade recalculation workstream.

Purpose:
    Detect drift between stored recipe costs and freshly recomputed costs, without
    writing anything back to production data. Super-admin only.

Design:
    For every recipe in every tenant we compute TWO numbers on the fly and compare
    them to what's stored:

    - `recalc_one_level`: uses stored `cost_per_yield` of any child recipe (this is
      what the current `calculate_recipe_cost` function does at save time). Diff vs.
      stored ⇒ "direct drift" — this recipe alone is stale even without the
      cascade.

    - `recalc_deep`: recursively recomputes the cost of every child recipe from
      its own ingredients (ignoring the child's stored value). Diff vs.
      `recalc_one_level` ⇒ "cascade drift" — stale because a descendant is stale.

Nothing here mutates recipes/ingredients. Audit runs persist to a new collection
`cost_audit_reports` so the FE can download the CSV any time. This collection is
metadata only; deleting it wipes reports but never touches costs.

Endpoints (all require is_super_admin):
    POST /api/cost-audit/run           → kicks off a background audit
    GET  /api/cost-audit/latest        → most recent audit summary
    GET  /api/cost-audit/{id}          → full report (rows paginated)
    GET  /api/cost-audit/{id}/report.csv
"""
from __future__ import annotations

import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from utils.legacy_units import convert_units
from utils.units import cost_for_recipe_line, normalize_unit

logger = logging.getLogger(__name__)

cost_audit_router = APIRouter(prefix="/cost-audit", tags=["Cost Audit"])

# ---------- config ----------
DRIFT_TOLERANCE_USD = 0.01     # user-approved threshold ($0.01)
MAX_DEPTH = 10                 # protection against runaway recursion
AFFECTED_ALERT_PCT = 20.0      # if >20% of recipes drift, we surface an alert


# ---------- guard ----------
async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if not getattr(user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="Super admin required")
    return user


# ---------- helpers ----------
def _num(value: Any, default: float = 0.0) -> float:
    """Coerce loosely-typed Mongo values to a finite float."""
    try:
        f = float(value)
        if f != f or f in (float("inf"), float("-inf")):  # NaN / Inf guard
            return default
        return f
    except (TypeError, ValueError):
        return default


def _stored_total(recipe: dict) -> float:
    """
    Pick the field the user *currently sees* as recipe total.
    The FE reads `food_cost` if present, falling back to `total_cost` (legacy).
    """
    for key in ("food_cost", "total_cost"):
        if key in recipe and recipe[key] is not None:
            return round(_num(recipe[key]), 4)
    return 0.0


async def _resolve_ingredient_line(
    ing: dict, company_id: str, warnings: List[Dict[str, Any]]
) -> float:
    """Cost of a single ingredient row. Same logic as calculate_recipe_cost."""
    item_type = ing.get("item_type")
    item_id = ing.get("item_id") or ing.get("ingredient_id")
    if not item_id or item_type == "recipe":
        return 0.0

    ingredient = await db.ingredients.find_one(
        {"ingredient_id": item_id, "company_id": company_id}, {"_id": 0}
    )
    if not ingredient:
        warnings.append({"kind": "orphan_ingredient", "item_id": item_id,
                         "name": ing.get("name") or "?"})
        return 0.0

    quantity = _num(ing.get("quantity"), 0)
    line_unit = ing.get("unit") or ingredient.get("base_unit") or ingredient.get("unit") or "g"
    raw_waste = ing.get("waste_factor_pct")
    if raw_waste is None or raw_waste == "":
        applied_waste = _num(ingredient.get("yield_waste_percent"), 0)
    else:
        applied_waste = _num(raw_waste, 0)
    effective = quantity * (1 + applied_waste / 100.0) if applied_waste > 0 else quantity
    try:
        return cost_for_recipe_line(effective, normalize_unit(line_unit), ingredient)
    except Exception as e:  # ultra-safe: never crash the audit on one bad line
        warnings.append({"kind": "line_calc_error", "item_id": item_id,
                         "error": str(e)[:120]})
        return 0.0


async def _cost_per_yield_deep(
    child_id: str,
    company_id: str,
    memo: Dict[str, Tuple[float, List[dict]]],
    visiting: set,
    depth: int,
) -> Tuple[float, List[dict]]:
    """Return (cost_per_yield_recomputed, warnings) for a child recipe, fully
    recursive. Guards against cycles and excessive depth."""
    key = f"{company_id}:{child_id}"
    if key in memo:
        return memo[key]
    if depth > MAX_DEPTH:
        return 0.0, [{"kind": "max_depth_exceeded", "recipe_id": child_id}]
    if key in visiting:
        return 0.0, [{"kind": "cycle_detected", "recipe_id": child_id}]

    child = await db.recipes.find_one(
        {"recipe_id": child_id, "company_id": company_id}, {"_id": 0}
    )
    if not child:
        return 0.0, [{"kind": "orphan_sub_recipe", "recipe_id": child_id}]

    visiting.add(key)
    total, warnings = await _recompute_recipe_food_cost(
        child, company_id, memo, visiting, depth + 1, mode="deep"
    )
    visiting.discard(key)

    yield_qty = _num(child.get("yield_quantity"), 1) or 1
    cpy = round(total / yield_qty, 6)
    memo[key] = (cpy, warnings)
    return cpy, warnings


async def _recompute_recipe_food_cost(
    recipe: dict,
    company_id: str,
    memo: Dict[str, Tuple[float, List[dict]]],
    visiting: set,
    depth: int,
    mode: str = "one_level",
) -> Tuple[float, List[dict]]:
    """
    Recompute a recipe's food_cost.

    mode='one_level' → children read stored `cost_per_yield` (fast, mirrors save-time).
    mode='deep'      → children recomputed recursively via `_cost_per_yield_deep`.
    """
    total = 0.0
    warnings: List[dict] = []

    for ing in recipe.get("ingredients", []) or []:
        item_type = ing.get("item_type")
        item_id = ing.get("item_id") or ing.get("ingredient_id")
        if not item_id:
            continue

        if item_type == "recipe":
            # inline sub-recipe (legacy shape: sub-recipe as ingredient row)
            if mode == "deep":
                child_cpy, warn = await _cost_per_yield_deep(
                    item_id, company_id, memo, visiting, depth
                )
                warnings.extend(warn)
            else:
                child = await db.recipes.find_one(
                    {"recipe_id": item_id, "company_id": company_id}, {"_id": 0}
                )
                if not child:
                    warnings.append({"kind": "orphan_sub_recipe", "recipe_id": item_id})
                    continue
                child_cpy = _num(child.get("cost_per_yield"), 0)

            q = _num(ing.get("quantity"), 0)
            parent_unit = ing.get("unit")
            child_yield_unit = None
            if mode == "one_level":
                # need yield unit of child to convert
                _c = await db.recipes.find_one(
                    {"recipe_id": item_id, "company_id": company_id},
                    {"_id": 0, "yield_unit": 1},
                )
                child_yield_unit = (_c or {}).get("yield_unit")
            else:
                _c = await db.recipes.find_one(
                    {"recipe_id": item_id, "company_id": company_id},
                    {"_id": 0, "yield_unit": 1},
                )
                child_yield_unit = (_c or {}).get("yield_unit")

            converted = q
            if parent_unit and child_yield_unit and parent_unit != child_yield_unit:
                try:
                    converted = convert_units(q, parent_unit, child_yield_unit)
                except Exception:
                    converted = q
            total += converted * child_cpy
        else:
            total += await _resolve_ingredient_line(ing, company_id, warnings)

    # dedicated sub_recipes[] array (new shape)
    for sub in recipe.get("sub_recipes", []) or []:
        child_id = sub.get("child_recipe_id") or sub.get("recipe_id")
        if not child_id:
            continue

        if mode == "deep":
            child_cpy, warn = await _cost_per_yield_deep(
                child_id, company_id, memo, visiting, depth
            )
            warnings.extend(warn)
        else:
            child = await db.recipes.find_one(
                {"recipe_id": child_id, "company_id": company_id}, {"_id": 0}
            )
            if not child:
                warnings.append({"kind": "orphan_sub_recipe", "recipe_id": child_id})
                continue
            child_cpy = _num(child.get("cost_per_yield"), 0)

        q_used = _num(sub.get("quantity_used"), 0)
        parent_unit = sub.get("unit")
        _c = await db.recipes.find_one(
            {"recipe_id": child_id, "company_id": company_id},
            {"_id": 0, "yield_unit": 1},
        )
        child_yield_unit = (_c or {}).get("yield_unit")
        converted = q_used
        if parent_unit and child_yield_unit and parent_unit != child_yield_unit:
            try:
                converted = convert_units(q_used, parent_unit, child_yield_unit)
            except Exception:
                converted = q_used
        total += converted * child_cpy

    return round(total, 4), warnings


def _classify(stored: float, recalc_one: float, recalc_deep: float) -> Dict[str, Any]:
    """Compute both drift metrics and classify severity."""
    direct_abs = round(recalc_one - stored, 4)
    cascade_abs = round(recalc_deep - recalc_one, 4)
    direct_pct = round((direct_abs / stored * 100.0), 2) if stored else (0.0 if direct_abs == 0 else 100.0)
    cascade_pct = round((cascade_abs / recalc_one * 100.0), 2) if recalc_one else (0.0 if cascade_abs == 0 else 100.0)
    has_direct = abs(direct_abs) > DRIFT_TOLERANCE_USD
    has_cascade = abs(cascade_abs) > DRIFT_TOLERANCE_USD
    return {
        "direct_drift_abs": direct_abs,
        "direct_drift_pct": direct_pct,
        "cascade_drift_abs": cascade_abs,
        "cascade_drift_pct": cascade_pct,
        "has_direct_drift": has_direct,
        "has_cascade_drift": has_cascade,
    }


async def _run_audit(audit_id: str, triggered_by: str) -> None:
    """Background worker: iterate every company × every recipe."""
    logger.info(f"[cost-audit] {audit_id} start (super-admin={triggered_by})")
    started_at = datetime.now(timezone.utc)

    try:
        companies = await db.companies.find({}, {"_id": 0, "company_id": 1, "name": 1}).to_list(2000)
        rows: List[dict] = []
        memo: Dict[str, Tuple[float, List[dict]]] = {}
        recipes_scanned = 0
        recipes_direct = 0
        recipes_cascade = 0
        drift_sum_abs = 0.0
        orphans_ing = 0
        orphans_sub = 0
        cycles = 0
        max_depth_hits = 0

        for company in companies:
            company_id = company.get("company_id")
            company_name = company.get("name") or company_id
            if not company_id:
                continue

            recipes = await db.recipes.find(
                {"company_id": company_id}, {"_id": 0}
            ).to_list(20000)

            for recipe in recipes:
                recipes_scanned += 1
                stored = _stored_total(recipe)

                try:
                    one_lvl, warn_one = await _recompute_recipe_food_cost(
                        recipe, company_id, memo, set(), 0, mode="one_level"
                    )
                    deep, warn_deep = await _recompute_recipe_food_cost(
                        recipe, company_id, memo, set(), 0, mode="deep"
                    )
                except Exception as e:  # never let one recipe kill the run
                    logger.exception(f"[cost-audit] recipe failed: {recipe.get('recipe_id')}")
                    rows.append({
                        "company_id": company_id,
                        "company_name": company_name,
                        "recipe_id": recipe.get("recipe_id"),
                        "recipe_name": recipe.get("name"),
                        "error": str(e)[:200],
                    })
                    continue

                metrics = _classify(stored, one_lvl, deep)
                if metrics["has_direct_drift"]:
                    recipes_direct += 1
                    drift_sum_abs += abs(metrics["direct_drift_abs"])
                if metrics["has_cascade_drift"]:
                    recipes_cascade += 1

                all_warnings = warn_one + warn_deep
                orphan_ing_list = [w for w in all_warnings if w["kind"] == "orphan_ingredient"]
                orphan_sub_list = [w for w in all_warnings if w["kind"] == "orphan_sub_recipe"]
                cycle_hit = any(w["kind"] == "cycle_detected" for w in all_warnings)
                depth_hit = any(w["kind"] == "max_depth_exceeded" for w in all_warnings)
                orphans_ing += len(orphan_ing_list)
                orphans_sub += len(orphan_sub_list)
                if cycle_hit:
                    cycles += 1
                if depth_hit:
                    max_depth_hits += 1

                rows.append({
                    "company_id": company_id,
                    "company_name": company_name,
                    "recipe_id": recipe.get("recipe_id"),
                    "recipe_name": recipe.get("name") or "?",
                    "stored_total": stored,
                    "recalc_one_level": one_lvl,
                    "recalc_deep": deep,
                    **metrics,
                    "num_ingredients": len(recipe.get("ingredients") or []),
                    "num_sub_recipes": len(recipe.get("sub_recipes") or []),
                    "orphan_ingredients": orphan_ing_list[:20],
                    "orphan_sub_recipes": orphan_sub_list[:20],
                    "cycle_detected": cycle_hit,
                    "max_depth_exceeded": depth_hit,
                    "updated_at": recipe.get("updated_at"),
                    "updated_by": recipe.get("updated_by") or recipe.get("last_edited_by"),
                })

        # Highest impact first: direct drift $ desc, then cascade drift $ desc
        rows.sort(
            key=lambda r: (
                abs(r.get("direct_drift_abs", 0)),
                abs(r.get("cascade_drift_abs", 0)),
            ),
            reverse=True,
        )

        percent_affected = round(
            ((recipes_direct + recipes_cascade) / recipes_scanned * 100.0), 2
        ) if recipes_scanned else 0.0

        completed_at = datetime.now(timezone.utc)
        await db.cost_audit_reports.update_one(
            {"audit_id": audit_id},
            {"$set": {
                "status": "completed",
                "completed_at": completed_at.isoformat(),
                "duration_sec": round((completed_at - started_at).total_seconds(), 2),
                "summary": {
                    "companies_scanned": len([c for c in companies if c.get("company_id")]),
                    "recipes_scanned": recipes_scanned,
                    "recipes_with_direct_drift": recipes_direct,
                    "recipes_with_cascade_drift": recipes_cascade,
                    "drift_sum_abs_usd": round(drift_sum_abs, 2),
                    "orphan_ingredients_count": orphans_ing,
                    "orphan_sub_recipes_count": orphans_sub,
                    "cycles_detected": cycles,
                    "max_depth_hits": max_depth_hits,
                    "percent_affected": percent_affected,
                    "alert_over_20_pct": percent_affected > AFFECTED_ALERT_PCT,
                    "tolerance_usd": DRIFT_TOLERANCE_USD,
                    "max_depth": MAX_DEPTH,
                },
                "rows": rows,
            }},
        )
        logger.info(f"[cost-audit] {audit_id} done: {recipes_scanned} recipes, "
                    f"{recipes_direct} direct, {recipes_cascade} cascade")
    except Exception as e:
        logger.exception(f"[cost-audit] {audit_id} FAILED")
        await db.cost_audit_reports.update_one(
            {"audit_id": audit_id},
            {"$set": {
                "status": "failed",
                "error": str(e)[:500],
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )


# ---------- endpoints ----------
@cost_audit_router.post("/run")
async def start_audit(
    background: BackgroundTasks,
    user: User = Depends(require_super_admin),
):
    """Trigger a new multi-tenant read-only audit. Returns 202 with audit_id."""
    # Prevent parallel runs on top of each other — return the running one if any.
    running = await db.cost_audit_reports.find_one(
        {"status": "running"}, {"_id": 0, "audit_id": 1, "started_at": 1}
    )
    if running:
        return {"audit_id": running["audit_id"], "status": "running",
                "message": "An audit is already running"}

    audit_id = str(uuid.uuid4())
    doc = {
        "audit_id": audit_id,
        "triggered_by": user.user_id,
        "triggered_by_email": user.email,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "scope": "all",
        "summary": None,
        "rows": [],
    }
    await db.cost_audit_reports.insert_one(doc)
    background.add_task(_run_audit, audit_id, user.user_id)
    return {"audit_id": audit_id, "status": "running"}


@cost_audit_router.get("/latest")
async def latest_audit(user: User = Depends(require_super_admin)):
    doc = await db.cost_audit_reports.find_one(
        {}, {"_id": 0, "rows": 0}, sort=[("started_at", -1)]
    )
    if not doc:
        return {"audit_id": None, "status": "none"}
    return doc


@cost_audit_router.get("/{audit_id}")
async def get_audit(
    audit_id: str,
    limit: int = Query(200, le=2000),
    offset: int = 0,
    only_drift: bool = Query(False, description="Return only rows above tolerance"),
    company_id: Optional[str] = None,
    user: User = Depends(require_super_admin),
):
    doc = await db.cost_audit_reports.find_one({"audit_id": audit_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Audit not found")

    rows = doc.get("rows") or []
    if company_id:
        rows = [r for r in rows if r.get("company_id") == company_id]
    if only_drift:
        rows = [r for r in rows
                if r.get("has_direct_drift") or r.get("has_cascade_drift")]

    total = len(rows)
    page = rows[offset: offset + limit]
    doc["rows"] = page
    doc["pagination"] = {"total": total, "offset": offset, "limit": limit}
    return doc


@cost_audit_router.get("/{audit_id}/report.csv")
async def download_audit_csv(
    audit_id: str,
    only_drift: bool = Query(False),
    user: User = Depends(require_super_admin),
):
    doc = await db.cost_audit_reports.find_one({"audit_id": audit_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Audit not found")
    if doc.get("status") != "completed":
        raise HTTPException(status_code=409, detail=f"Audit status: {doc.get('status')}")

    rows = doc.get("rows") or []
    if only_drift:
        rows = [r for r in rows
                if r.get("has_direct_drift") or r.get("has_cascade_drift")]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "company_id", "company_name", "recipe_id", "recipe_name",
        "stored_total", "recalc_one_level", "recalc_deep",
        "direct_drift_abs", "direct_drift_pct",
        "cascade_drift_abs", "cascade_drift_pct",
        "num_ingredients", "num_sub_recipes",
        "orphan_ingredients", "orphan_sub_recipes",
        "cycle_detected", "max_depth_exceeded",
        "updated_at", "updated_by",
    ])
    for r in rows:
        writer.writerow([
            r.get("company_id"), r.get("company_name"),
            r.get("recipe_id"), r.get("recipe_name"),
            r.get("stored_total"), r.get("recalc_one_level"), r.get("recalc_deep"),
            r.get("direct_drift_abs"), r.get("direct_drift_pct"),
            r.get("cascade_drift_abs"), r.get("cascade_drift_pct"),
            r.get("num_ingredients"), r.get("num_sub_recipes"),
            len(r.get("orphan_ingredients") or []),
            len(r.get("orphan_sub_recipes") or []),
            r.get("cycle_detected"), r.get("max_depth_exceeded"),
            r.get("updated_at"), r.get("updated_by"),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cost_audit_{audit_id}.csv"'},
    )


# =========================================================================
# FASE 2 — Shadow Mode admin endpoints
# =========================================================================
@cost_audit_router.get("/shadow/dashboard")
async def shadow_dashboard(user: User = Depends(require_super_admin)):
    """Aggregate view of the shadow mode observations across all tenants."""
    from services.cost_cascade import SHADOW_ENABLED, DRIFT_TOLERANCE_USD

    total = await db.cost_staleness.count_documents({})
    stale = await db.cost_staleness.count_documents({"is_stale": True})
    by_type_cursor = db.cost_staleness.aggregate([
        {"$group": {
            "_id": "$entity_type",
            "total": {"$sum": 1},
            "stale": {"$sum": {"$cond": ["$is_stale", 1, 0]}},
            "drift_sum_abs": {"$sum": {"$abs": {"$ifNull": ["$drift_abs", 0]}}},
        }},
    ])
    by_type = [{"entity_type": d["_id"], **{k: v for k, v in d.items() if k != "_id"}}
               async for d in by_type_cursor]

    recent_runs = await db.cost_cascade_runs.find(
        {}, {"_id": 0}
    ).sort("started_at", -1).to_list(25)

    top_drift = await db.cost_staleness.find(
        {"is_stale": True, "entity_type": "recipe"},
        {"_id": 0}
    ).sort("drift_abs", -1).to_list(20)

    # Enrich top_drift with recipe & company names for the FE table
    enriched: List[dict] = []
    for row in top_drift:
        rid = row.get("entity_id")
        recipe = await db.recipes.find_one(
            {"recipe_id": rid, "company_id": row.get("company_id")},
            {"_id": 0, "name": 1},
        )
        company = await db.companies.find_one(
            {"company_id": row.get("company_id")}, {"_id": 0, "name": 1}
        )
        enriched.append({
            **row,
            "recipe_name": (recipe or {}).get("name") or "?",
            "company_name": (company or {}).get("name") or row.get("company_id"),
        })

    return {
        "shadow_enabled": SHADOW_ENABLED,
        "tolerance_usd": DRIFT_TOLERANCE_USD,
        "totals": {
            "observations": total,
            "stale_entries": stale,
            "by_type": by_type,
        },
        "recent_runs": recent_runs,
        "top_drift": enriched,
    }


@cost_audit_router.get("/shadow/entries")
async def shadow_entries(
    entity_type: Optional[str] = None,
    company_id: Optional[str] = None,
    only_stale: bool = Query(True),
    limit: int = Query(100, le=1000),
    offset: int = 0,
    user: User = Depends(require_super_admin),
):
    q: Dict[str, Any] = {}
    if entity_type:
        q["entity_type"] = entity_type
    if company_id:
        q["company_id"] = company_id
    if only_stale:
        q["is_stale"] = True

    total = await db.cost_staleness.count_documents(q)
    rows = await db.cost_staleness.find(q, {"_id": 0}).sort(
        "last_marked_at", -1
    ).skip(offset).limit(limit).to_list(limit)
    return {"total": total, "offset": offset, "limit": limit, "rows": rows}


class ShadowSimulateBody(BaseModel):
    company_id: str
    root_type: str  # "ingredient" | "recipe"
    root_id: str


@cost_audit_router.post("/shadow/simulate")
async def shadow_simulate(
    body: ShadowSimulateBody,
    user: User = Depends(require_super_admin),
):
    """Manually trigger a shadow walk for testing (super-admin only)."""
    from services.cost_cascade import run_cascade_walk
    if body.root_type not in ("ingredient", "recipe"):
        raise HTTPException(status_code=400, detail="root_type must be ingredient|recipe")
    result = await run_cascade_walk(
        company_id=body.company_id,
        trigger={"kind": "manual_simulate", "user_id": user.user_id},
        root_type=body.root_type,
        root_id=body.root_id,
    )
    return result


@cost_audit_router.post("/shadow/clear")
async def shadow_clear(user: User = Depends(require_super_admin)):
    """Reset the shadow footprint. Drops staleness records AND run history.
    Never touches recipes/ingredients."""
    stale_deleted = (await db.cost_staleness.delete_many({})).deleted_count
    runs_deleted = (await db.cost_cascade_runs.delete_many({})).deleted_count
    return {"cost_staleness_deleted": stale_deleted,
            "cost_cascade_runs_deleted": runs_deleted}


# =========================================================================
# PRIORIDAD 1 · Paso 1.2 — Outliers de precio por categoría (revisión manual)
# =========================================================================
import statistics as _stats

_TO_KG = {
    "kg": 1.0, "g": 0.001, "mg": 0.000001,
    "lb": 0.453592, "oz": 0.0283495,
    "L": 1.0, "l": 1.0, "ml": 0.001,
    "gal": 3.78541, "qt": 0.946353, "fl_oz": 0.02957,
}


def _cost_per_kg(ing: dict) -> Optional[float]:
    base = (ing.get("base_unit") or ing.get("unit") or "").lower().strip()
    factor = _TO_KG.get(base)
    if factor is None or factor <= 0:
        return None
    cost = float(ing.get("cost_per_base_unit") or ing.get("cost_per_unit") or 0)
    if cost <= 0:
        return None
    return round(cost / factor, 4)


@cost_audit_router.get("/prices/outliers")
async def list_price_outliers(
    company_id: Optional[str] = None,
    outlier_factor: float = Query(3.0, ge=1.5, le=100),
    include_reviewed: bool = Query(False),
    user: User = Depends(require_super_admin),
):
    """
    Detect price outliers across ingredients: any ingredient with cost/kg
    > outlier_factor × median of its category OR < median / outlier_factor.
    Read-only. Never mutates ingredients.

    Filters test rows (name contains "Test E2E" / "test_") automatically.
    """
    q: Dict[str, Any] = {}
    if company_id:
        q["company_id"] = company_id
    ingredients = await db.ingredients.find(q, {"_id": 0}).to_list(50000)

    # Filter obvious test rows
    def _is_test(row):
        n = (row.get("name") or "").lower()
        return "test e2e" in n or n.startswith("test_") or "test ingredient" in n

    ingredients = [i for i in ingredients if not _is_test(i)]

    # Read set of "reviewed_at" markers (stored in ingredient_price_reviews collection)
    reviewed_ids = set()
    if not include_reviewed:
        async for r in db.ingredient_price_reviews.find({}, {"_id": 0, "ingredient_id": 1}):
            reviewed_ids.add(r["ingredient_id"])

    # Group by category
    by_cat: Dict[str, List[dict]] = {}
    for ing in ingredients:
        cpk = _cost_per_kg(ing)
        if cpk is None:
            continue
        cat = (ing.get("category") or "Sin categoría").strip() or "Sin categoría"
        ing["_cost_per_kg"] = cpk
        by_cat.setdefault(cat, []).append(ing)

    outliers: List[dict] = []
    category_summary: List[dict] = []
    for cat, items in by_cat.items():
        prices = [i["_cost_per_kg"] for i in items]
        if len(prices) < 2:
            median = prices[0]
        else:
            median = _stats.median(prices)
        category_summary.append({
            "category": cat, "count": len(prices), "median_per_kg": round(median, 2),
            "min": round(min(prices), 2), "max": round(max(prices), 2),
        })
        for ing in items:
            cpk = ing["_cost_per_kg"]
            is_high = cpk > outlier_factor * median
            is_low = cpk < median / outlier_factor
            if is_high or is_low:
                if ing.get("ingredient_id") in reviewed_ids:
                    continue
                outliers.append({
                    "ingredient_id": ing.get("ingredient_id"),
                    "company_id": ing.get("company_id"),
                    "name": ing.get("name"),
                    "category": cat,
                    "base_unit": (ing.get("base_unit") or ing.get("unit") or "").lower(),
                    "cost_per_base_unit": round(float(ing.get("cost_per_base_unit") or
                                                     ing.get("cost_per_unit") or 0), 6),
                    "cost_per_kg": cpk,
                    "category_median_per_kg": round(median, 2),
                    "ratio_vs_median": round(cpk / median, 2) if median else None,
                    "direction": "high" if is_high else "low",
                    "purchase_unit": ing.get("purchase_unit"),
                    "purchase_quantity_per_unit": ing.get("purchase_quantity_per_unit"),
                    "purchase_cost": ing.get("purchase_cost"),
                })

    outliers.sort(key=lambda x: -(x["ratio_vs_median"] or 0))
    return {
        "total_ingredients_scanned": len(ingredients),
        "outliers_count": len(outliers),
        "outlier_factor": outlier_factor,
        "outliers": outliers,
        "category_summary": sorted(category_summary, key=lambda x: -x["count"]),
    }


class OutlierFixBody(BaseModel):
    """One-off manual price correction by a super-admin.
    - `new_purchase_cost`  → new price of one Formato / pack.
    - `new_cost_per_unit`  → new price per base unit (if user prefers this shape).
    Provide either of the two.
    - `note` → reason (audited).
    """
    new_purchase_cost: Optional[float] = None
    new_cost_per_unit: Optional[float] = None
    note: Optional[str] = None


@cost_audit_router.post("/prices/outliers/{ingredient_id}/fix")
async def fix_outlier(
    ingredient_id: str,
    body: OutlierFixBody,
    user: User = Depends(require_super_admin),
):
    """Update ONE ingredient's price. Persists an audit trail entry in
    `ingredient_price_reviews` so the outlier no longer appears in the list.
    Triggers the existing recipe recalc via the standard update path.
    """
    ing = await db.ingredients.find_one({"ingredient_id": ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")

    prev = {
        "cost_per_unit": ing.get("cost_per_unit"),
        "cost_per_base_unit": ing.get("cost_per_base_unit"),
        "purchase_cost": ing.get("purchase_cost"),
    }

    update: Dict[str, Any] = {}
    if body.new_purchase_cost is not None:
        pc = float(body.new_purchase_cost)
        qty = float(ing.get("purchase_quantity_per_unit") or 0)
        update["purchase_cost"] = round(pc, 4)
        # PASE A: purchase_cost is the source of truth. Derive both cpu (per
        # container) and cpbu (per base) from it — never let the caller set
        # cost_per_unit to per-base by accident (that was the original bug).
        update["cost_per_unit"] = round(pc, 4)
        if qty > 0:
            update["cost_per_base_unit"] = round(pc / qty, 6)
            update["purchase_incomplete"] = False
    elif body.new_cost_per_unit is not None:
        # PASE A: legacy shape kept for backwards-compat. Interpret the input
        # as the per-container price (matches the visible label in the UI
        # now that "Cost / [Unit]" is derived from purchase_cost).
        pc = float(body.new_cost_per_unit)
        update["cost_per_unit"] = round(pc, 4)
        update["purchase_cost"] = round(pc, 4)
        qty = float(ing.get("purchase_quantity_per_unit") or 0)
        if qty > 0:
            update["cost_per_base_unit"] = round(pc / qty, 6)
            update["purchase_incomplete"] = False
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide new_purchase_cost or new_cost_per_unit",
        )

    now = datetime.now(timezone.utc).isoformat()
    update["updated_at"] = now
    # Log price change into ingredient's own history
    history = ing.get("price_history") or []
    history.append({
        "price": update.get("cost_per_unit", prev["cost_per_unit"]),
        "previous": prev["cost_per_unit"],
        "date": now,
        "source": "outlier_review",
        "reviewed_by": user.email,
    })
    update["price_history"] = history

    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id},
        {"$set": update},
    )

    # Audit trail (also used to exclude from outlier list on next query)
    await db.ingredient_price_reviews.update_one(
        {"ingredient_id": ingredient_id},
        {"$set": {
            "ingredient_id": ingredient_id,
            "company_id": ing.get("company_id"),
            "action": "fixed",
            "previous_values": prev,
            "new_values": update,
            "note": body.note,
            "reviewed_by": user.email,
            "reviewed_at": now,
        }},
        upsert=True,
    )

    # Trigger downstream recipe recomputation using the same helper the
    # inventory route uses (so recipes/menus/plated_menus stay consistent).
    try:
        from routers.inventory import _recalc_recipes_using_ingredient
        await _recalc_recipes_using_ingredient(ingredient_id, ing.get("company_id"))
    except Exception as e:
        logger.warning(f"recalc after outlier fix failed for {ingredient_id}: {e}")

    return {"ingredient_id": ingredient_id, "previous": prev, "applied": update}


@cost_audit_router.post("/prices/outliers/{ingredient_id}/ignore")
async def ignore_outlier(
    ingredient_id: str,
    body: OutlierFixBody = OutlierFixBody(),
    user: User = Depends(require_super_admin),
):
    """Mark an outlier as reviewed WITHOUT changing the price.
    Useful when the current price is actually correct (rare exotic ingredient,
    special import, etc.). It will stop appearing in the outlier list.
    """
    ing = await db.ingredients.find_one({"ingredient_id": ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.ingredient_price_reviews.update_one(
        {"ingredient_id": ingredient_id},
        {"$set": {
            "ingredient_id": ingredient_id,
            "company_id": ing.get("company_id"),
            "action": "ignored",
            "note": body.note,
            "reviewed_by": user.email,
            "reviewed_at": now,
        }},
        upsert=True,
    )
    return {"ingredient_id": ingredient_id, "status": "ignored"}


@cost_audit_router.post("/prices/outliers/reviews/clear")
async def clear_outlier_reviews(user: User = Depends(require_super_admin)):
    """Reset the outlier review audit trail (all ignored/fixed markers).
    Never touches ingredients. Useful for restarting the review process."""
    n = (await db.ingredient_price_reviews.delete_many({})).deleted_count
    return {"reviews_cleared": n}


@cost_audit_router.get("/prices/history")
async def bulk_fix_history(
    action: Optional[str] = Query("bulk_fixed"),
    company_id: Optional[str] = None,
    user: User = Depends(require_super_admin),
):
    """List of ingredients whose price was changed automatically (or manually).
    Each row includes previous_values so the user can revert individually.
    """
    q: Dict[str, Any] = {}
    if action:
        q["action"] = action
    if company_id:
        q["company_id"] = company_id
    reviews = await db.ingredient_price_reviews.find(q, {"_id": 0}).sort(
        "reviewed_at", -1,
    ).to_list(2000)

    enriched = []
    for r in reviews:
        ing = await db.ingredients.find_one(
            {"ingredient_id": r["ingredient_id"]},
            {"_id": 0, "name": 1, "base_unit": 1, "unit": 1, "category": 1},
        )
        if not ing:
            continue
        prev = r.get("previous_values") or {}
        new = r.get("new_values") or {}
        enriched.append({
            **r,
            "name": ing.get("name"),
            "category": ing.get("category"),
            "base_unit": (ing.get("base_unit") or ing.get("unit") or "").lower(),
            "prev_cost_per_unit": prev.get("cost_per_unit"),
            "new_cost_per_unit": new.get("cost_per_unit"),
            "reduction_factor": round(
                float(prev.get("cost_per_unit") or 0) / float(new.get("cost_per_unit") or 1), 2,
            ) if (new.get("cost_per_unit") or 0) else None,
        })
    return {"total": len(enriched), "rows": enriched}


@cost_audit_router.post("/prices/history/{ingredient_id}/revert")
async def revert_bulk_fix(
    ingredient_id: str,
    user: User = Depends(require_super_admin),
):
    """Undo a previous bulk_fixed / fixed price change. Restores previous_values
    exactly, removes the review marker, and cascades recipe recalc.
    """
    review = await db.ingredient_price_reviews.find_one(
        {"ingredient_id": ingredient_id}, {"_id": 0},
    )
    if not review:
        raise HTTPException(status_code=404, detail="No review record for this ingredient")
    prev = review.get("previous_values") or {}
    if not prev:
        raise HTTPException(status_code=400, detail="No previous values recorded")

    ing = await db.ingredients.find_one({"ingredient_id": ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")

    now = datetime.now(timezone.utc).isoformat()
    # Rebuild only the fields we changed
    revert_set = {
        "cost_per_unit": prev.get("cost_per_unit"),
        "cost_per_base_unit": prev.get("cost_per_base_unit") or prev.get("cost_per_unit"),
        "updated_at": now,
    }
    if prev.get("purchase_cost") is not None:
        revert_set["purchase_cost"] = prev.get("purchase_cost")

    # Log revert into price_history
    history = ing.get("price_history") or []
    history.append({
        "price": revert_set["cost_per_unit"],
        "previous": ing.get("cost_per_unit"),
        "date": now,
        "source": "revert",
        "reverted_by": user.email,
    })
    revert_set["price_history"] = history

    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id}, {"$set": revert_set},
    )
    await db.ingredient_price_reviews.delete_one({"ingredient_id": ingredient_id})

    # Cascade recalc to any recipes using this ingredient
    try:
        from routers.inventory import _recalc_recipes_using_ingredient
        await _recalc_recipes_using_ingredient(ingredient_id, ing.get("company_id"))
    except Exception as e:
        logger.warning(f"recalc after revert failed for {ingredient_id}: {e}")

    return {
        "ingredient_id": ingredient_id,
        "restored": revert_set,
        "review_removed": True,
    }


@cost_audit_router.get("/prices/history/export.csv")
async def export_history_csv(
    action: Optional[str] = "bulk_fixed",
    company_id: Optional[str] = None,
    user: User = Depends(require_super_admin),
):
    """CSV download of the price-change history for offline review."""
    q: Dict[str, Any] = {}
    if action:
        q["action"] = action
    if company_id:
        q["company_id"] = company_id
    reviews = await db.ingredient_price_reviews.find(q, {"_id": 0}).to_list(2000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "ingredient_id", "name", "category", "base_unit",
        "prev_cost_per_unit", "new_cost_per_unit", "prev_purchase_cost",
        "new_purchase_cost", "reduction_factor", "note", "reviewed_at",
    ])
    for r in reviews:
        ing = await db.ingredients.find_one(
            {"ingredient_id": r["ingredient_id"]},
            {"_id": 0, "name": 1, "base_unit": 1, "unit": 1, "category": 1},
        ) or {}
        prev = r.get("previous_values") or {}
        new = r.get("new_values") or {}
        p_cpu = float(prev.get("cost_per_unit") or 0)
        n_cpu = float(new.get("cost_per_unit") or 0)
        w.writerow([
            r.get("ingredient_id"), ing.get("name"), ing.get("category"),
            (ing.get("base_unit") or ing.get("unit") or "").lower(),
            p_cpu, n_cpu, prev.get("purchase_cost"), new.get("purchase_cost"),
            round(p_cpu / n_cpu, 2) if n_cpu else None,
            r.get("note"), r.get("reviewed_at"),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="price_history.csv"'},
    )
