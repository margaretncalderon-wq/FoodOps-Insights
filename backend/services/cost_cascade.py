"""
Cost Cascade — Phase 2 SHADOW MODE.

Reactive dependency-graph walker that runs in the background whenever an
ingredient or recipe is edited. It computes what the "true" cost SHOULD be
using a full-depth recursion (same logic as Fase 1 audit) and records the
delta in a NEW collection `cost_staleness`. It NEVER writes to
`recipes` / `ingredients` / `menus` / `plated_menus` / `proposals`.

Safety invariants:
- Zero writes to any pre-existing collection.
- Zero blocking behaviour: hooks fire-and-forget via `asyncio.create_task`.
- One kill-switch: env var `COST_SHADOW_MODE_ENABLED` (default: "true").
- One reset: `db.cost_staleness.drop()` removes 100% of the footprint.

Dependency graph (edges):
    ingredient   → recipe          (via `recipes.ingredients[].item_id`)
    recipe       → recipe (parent) (via `recipes.sub_recipes[].child_recipe_id`
                                    AND legacy `recipes.ingredients[].item_type=recipe`)
    recipe       → plated_menu     (via `plated_menus.courses[].items[].recipe_id`)
    recipe       → menu            (via `menus.items[].recipe_id`)
    plated_menu  → proposal        (via `proposals.plated_menu_id`)
    menu         → proposal        (via `proposals.menu_ids[]`)

The public API:
    enqueue_cascade(company_id, trigger)    - non-blocking hook for FE endpoints
    run_cascade_walk(company_id, trigger)   - the actual worker (also callable
                                              directly from admin endpoints)
    build_dependency_map(company_id)        - useful for the shadow dashboard
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from config import db

logger = logging.getLogger(__name__)

# ---- kill switch ----
SHADOW_ENABLED = os.getenv("COST_SHADOW_MODE_ENABLED", "true").lower() in ("1", "true", "yes")
DRIFT_TOLERANCE_USD = 0.01
MAX_HOPS = 12  # ingredient(0)→recipe(1)→parent(2)→...→proposal(6): 12 is a safe cap


# ---- shared: deep recompute (imported lazily to avoid circular imports) ----
async def _deep_recompute_recipe_cost(recipe: dict, company_id: str) -> Tuple[float, List[dict]]:
    """Reuse the audited deep-recompute function from Fase 1."""
    from routers.cost_audit import _recompute_recipe_food_cost
    memo: Dict[str, Tuple[float, List[dict]]] = {}
    return await _recompute_recipe_food_cost(recipe, company_id, memo, set(), 0, mode="deep")


# =========================================================================
# Dependency graph builder
# =========================================================================
async def build_dependency_map(company_id: str) -> Dict[str, Any]:
    """
    Materialise a per-tenant adjacency map of the graph. Used both by the
    reactive walker and by the shadow dashboard.
    """
    ing_to_recipes: Dict[str, Set[str]] = {}
    recipe_to_parents: Dict[str, Set[str]] = {}
    recipe_to_plated: Dict[str, Set[str]] = {}
    recipe_to_menus: Dict[str, Set[str]] = {}
    plated_to_props: Dict[str, Set[str]] = {}
    menu_to_props: Dict[str, Set[str]] = {}

    async for r in db.recipes.find(
        {"company_id": company_id},
        {"_id": 0, "recipe_id": 1, "ingredients": 1, "sub_recipes": 1},
    ):
        rid = r.get("recipe_id")
        if not rid:
            continue
        # ingredient rows (both formats)
        for ing in r.get("ingredients") or []:
            item_type = ing.get("item_type")
            item_id = ing.get("item_id") or ing.get("ingredient_id")
            if not item_id:
                continue
            if item_type == "recipe":
                recipe_to_parents.setdefault(item_id, set()).add(rid)
            else:
                ing_to_recipes.setdefault(item_id, set()).add(rid)
        # sub_recipes[] rows
        for sub in r.get("sub_recipes") or []:
            child_id = sub.get("child_recipe_id") or sub.get("recipe_id")
            if child_id:
                recipe_to_parents.setdefault(child_id, set()).add(rid)

    async for pm in db.plated_menus.find(
        {"company_id": company_id},
        {"_id": 0, "menu_id": 1, "plated_menu_id": 1, "courses": 1, "sections": 1},
    ):
        pmid = pm.get("plated_menu_id") or pm.get("menu_id")
        if not pmid:
            continue
        # courses/sections shape varies; walk any nested items that carry a recipe_id
        for group in (pm.get("courses") or pm.get("sections") or []):
            for item in (group.get("items") or []):
                rid = item.get("recipe_id") or item.get("item_id")
                if rid:
                    recipe_to_plated.setdefault(rid, set()).add(pmid)

    async for m in db.menus.find(
        {"company_id": company_id},
        {"_id": 0, "menu_id": 1, "items": 1, "recipes": 1},
    ):
        mid = m.get("menu_id")
        if not mid:
            continue
        for item in (m.get("items") or m.get("recipes") or []):
            rid = item.get("recipe_id") or item.get("id")
            if rid:
                recipe_to_menus.setdefault(rid, set()).add(mid)

    async for p in db.proposals.find(
        {"company_id": company_id},
        {"_id": 0, "proposal_id": 1, "plated_menu_id": 1, "menu_ids": 1, "menu_id": 1},
    ):
        pid = p.get("proposal_id")
        if not pid:
            continue
        for pmid in ([p.get("plated_menu_id")] if p.get("plated_menu_id") else []):
            plated_to_props.setdefault(pmid, set()).add(pid)
        for mid in (p.get("menu_ids") or ([p.get("menu_id")] if p.get("menu_id") else [])):
            menu_to_props.setdefault(mid, set()).add(pid)

    return {
        "ingredient_to_recipes": ing_to_recipes,
        "recipe_to_parents": recipe_to_parents,
        "recipe_to_plated": recipe_to_plated,
        "recipe_to_menus": recipe_to_menus,
        "plated_to_proposals": plated_to_props,
        "menu_to_proposals": menu_to_props,
        "totals": {
            "ingredients_with_edges": len(ing_to_recipes),
            "recipes_with_parents": len(recipe_to_parents),
            "recipes_in_plated": len(recipe_to_plated),
            "recipes_in_menus": len(recipe_to_menus),
        },
    }


# =========================================================================
# Impact walk (BFS)
# =========================================================================
async def _walk_impact(
    graph: Dict[str, Any],
    root_type: str,
    root_id: str,
) -> Dict[str, Set[str]]:
    """BFS through the graph starting from an ingredient or recipe. Returns
    a dict of affected entity_ids grouped by type."""
    affected: Dict[str, Set[str]] = {"recipe": set(), "plated_menu": set(),
                                     "menu": set(), "proposal": set()}
    queue: List[Tuple[str, str, int]] = [(root_type, root_id, 0)]
    seen: Set[Tuple[str, str]] = set()

    while queue:
        etype, eid, hop = queue.pop(0)
        if (etype, eid) in seen or hop > MAX_HOPS:
            continue
        seen.add((etype, eid))

        if etype == "ingredient":
            for rid in graph["ingredient_to_recipes"].get(eid, set()):
                affected["recipe"].add(rid)
                queue.append(("recipe", rid, hop + 1))
        elif etype == "recipe":
            # propagate up to parent recipes (transitive)
            for pid in graph["recipe_to_parents"].get(eid, set()):
                affected["recipe"].add(pid)
                queue.append(("recipe", pid, hop + 1))
            # forward: plated menus & catalog menus
            for pmid in graph["recipe_to_plated"].get(eid, set()):
                affected["plated_menu"].add(pmid)
                queue.append(("plated_menu", pmid, hop + 1))
            for mid in graph["recipe_to_menus"].get(eid, set()):
                affected["menu"].add(mid)
                queue.append(("menu", mid, hop + 1))
        elif etype == "plated_menu":
            for pid in graph["plated_to_proposals"].get(eid, set()):
                affected["proposal"].add(pid)
        elif etype == "menu":
            for pid in graph["menu_to_proposals"].get(eid, set()):
                affected["proposal"].add(pid)

    return affected


# =========================================================================
# Shadow persistence
# =========================================================================
async def _record_staleness(
    company_id: str,
    entity_type: str,
    entity_id: str,
    stored_value: float,
    recomputed_value: float,
    trigger: Dict[str, Any],
    run_id: str,
) -> None:
    """Upsert a staleness record. Writes ONLY to `cost_staleness` collection."""
    drift_abs = round(recomputed_value - stored_value, 4)
    drift_pct = round((drift_abs / stored_value * 100.0), 2) if stored_value else (
        0.0 if drift_abs == 0 else 100.0)
    is_stale = abs(drift_abs) > DRIFT_TOLERANCE_USD

    await db.cost_staleness.update_one(
        {"company_id": company_id, "entity_type": entity_type, "entity_id": entity_id},
        {"$set": {
            "company_id": company_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "is_stale": is_stale,
            "stored_value": round(stored_value, 4),
            "shadow_recomputed_value": round(recomputed_value, 4),
            "drift_abs": drift_abs,
            "drift_pct": drift_pct,
            "last_marked_at": datetime.now(timezone.utc).isoformat(),
            "last_run_id": run_id,
            "last_trigger": trigger,
        },
         "$inc": {"observation_count": 1}},
        upsert=True,
    )


async def _record_run(run_id: str, doc: Dict[str, Any]) -> None:
    """Persist a per-run summary so the FE can display recent activity."""
    await db.cost_cascade_runs.insert_one(doc | {"run_id": run_id})


# =========================================================================
# Public worker
# =========================================================================
async def run_cascade_walk(
    company_id: str,
    trigger: Dict[str, Any],
    root_type: str,
    root_id: str,
) -> Dict[str, Any]:
    """
    Reactive shadow walker. Called by hooks (via enqueue_cascade) or manually
    via admin endpoint.

    Returns a summary dict describing what was observed.
    """
    if not SHADOW_ENABLED:
        return {"skipped": True, "reason": "shadow disabled"}
    if not company_id or not root_id:
        return {"skipped": True, "reason": "invalid input"}

    run_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc)
    logger.info(f"[shadow] {run_id} start company={company_id} "
                f"root={root_type}:{root_id} trigger={trigger.get('kind')}")

    try:
        graph = await build_dependency_map(company_id)
        affected = await _walk_impact(graph, root_type, root_id)

        # Shadow-recompute every affected recipe (fully recursive).
        drift_count = 0
        for rid in affected["recipe"]:
            recipe = await db.recipes.find_one(
                {"recipe_id": rid, "company_id": company_id}, {"_id": 0}
            )
            if not recipe:
                continue
            stored = _stored_recipe_value(recipe)
            new_val, _warn = await _deep_recompute_recipe_cost(recipe, company_id)
            await _record_staleness(company_id, "recipe", rid, stored, new_val,
                                    trigger, run_id)
            if abs(new_val - stored) > DRIFT_TOLERANCE_USD:
                drift_count += 1

        # For plated_menus / menus / proposals we don't recompute (that's
        # Fase 3 territory) — we just mark them as "downstream_stale" so the
        # dashboard shows the fanout. No number is invented.
        for pmid in affected["plated_menu"]:
            await db.cost_staleness.update_one(
                {"company_id": company_id, "entity_type": "plated_menu", "entity_id": pmid},
                {"$set": {
                    "company_id": company_id, "entity_type": "plated_menu",
                    "entity_id": pmid, "is_stale": True, "reason": "downstream_of_recipe",
                    "last_marked_at": datetime.now(timezone.utc).isoformat(),
                    "last_run_id": run_id, "last_trigger": trigger,
                },
                 "$inc": {"observation_count": 1}},
                upsert=True,
            )
        for mid in affected["menu"]:
            await db.cost_staleness.update_one(
                {"company_id": company_id, "entity_type": "menu", "entity_id": mid},
                {"$set": {
                    "company_id": company_id, "entity_type": "menu",
                    "entity_id": mid, "is_stale": True, "reason": "downstream_of_recipe",
                    "last_marked_at": datetime.now(timezone.utc).isoformat(),
                    "last_run_id": run_id, "last_trigger": trigger,
                },
                 "$inc": {"observation_count": 1}},
                upsert=True,
            )
        for pid in affected["proposal"]:
            await db.cost_staleness.update_one(
                {"company_id": company_id, "entity_type": "proposal", "entity_id": pid},
                {"$set": {
                    "company_id": company_id, "entity_type": "proposal",
                    "entity_id": pid, "is_stale": True, "reason": "downstream_of_menu",
                    "last_marked_at": datetime.now(timezone.utc).isoformat(),
                    "last_run_id": run_id, "last_trigger": trigger,
                },
                 "$inc": {"observation_count": 1}},
                upsert=True,
            )

        finished = datetime.now(timezone.utc)
        summary = {
            "run_id": run_id,
            "company_id": company_id,
            "root_type": root_type,
            "root_id": root_id,
            "trigger": trigger,
            "started_at": started.isoformat(),
            "finished_at": finished.isoformat(),
            "duration_ms": round((finished - started).total_seconds() * 1000),
            "affected_counts": {k: len(v) for k, v in affected.items()},
            "recipes_with_drift": drift_count,
            "status": "completed",
        }
        await _record_run(run_id, summary)
        logger.info(f"[shadow] {run_id} done — recipes={summary['affected_counts']['recipe']} "
                    f"drift={drift_count}")
        return summary

    except Exception as e:
        logger.exception(f"[shadow] {run_id} FAILED")
        await _record_run(run_id, {
            "company_id": company_id, "root_type": root_type, "root_id": root_id,
            "trigger": trigger, "started_at": started.isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed", "error": str(e)[:500],
        })
        return {"run_id": run_id, "status": "failed", "error": str(e)[:200]}


def _stored_recipe_value(recipe: dict) -> float:
    for k in ("food_cost", "total_cost"):
        v = recipe.get(k)
        if v is not None:
            try:
                return round(float(v), 4)
            except (TypeError, ValueError):
                pass
    return 0.0


# =========================================================================
# Hook — fire-and-forget entry point for update endpoints
# =========================================================================
def enqueue_cascade(
    company_id: str,
    root_type: str,
    root_id: str,
    trigger: Dict[str, Any],
) -> None:
    """Schedule a shadow walk without blocking the request handler.

    Safe to call from any request handler. Failures are logged, never raised.
    """
    if not SHADOW_ENABLED or not company_id or not root_id:
        return
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(run_cascade_walk(company_id, trigger, root_type, root_id))
    except RuntimeError:
        # No running loop (e.g. during shutdown) — skip silently.
        logger.debug("[shadow] enqueue skipped: no event loop")
    except Exception as e:
        logger.warning(f"[shadow] enqueue failed: {e}")
