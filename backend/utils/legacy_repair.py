"""Legacy data self-repair — multi-tenant safe, idempotent, version-gated.

Runs at backend startup once per deploy. Iterates all companies and sanitizes
documents in:
  - recipes
  - ingredients
  - suppliers
  - plated_menus

Repairs are the same "defensive defaults" the resilient endpoints already apply
at read-time, but persisted to disk so the data is clean going forward.

How to trigger a fresh repair after a code change:
    Bump REPAIR_VERSION below by 1 and redeploy.

History is written to `db.legacy_repair_history` per company/run:
    { company_id, run_at, version, summary: {recipes: {...}, ingredients: {...}} }
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

_log = logging.getLogger("legacy_repair")

# Bump this on the next deploy that fixes further legacy quirks. On boot,
# if the persisted `legacy_repair_version` is < this, the migration runs
# for every company; on subsequent restarts (same deploy), it short-circuits.
REPAIR_VERSION = 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_bad_dt(value: Any) -> bool:
    """A datetime field is "bad" when it's a non-ISO string we can't parse."""
    if value is None:
        return True
    if isinstance(value, datetime):
        return False
    if isinstance(value, str):
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
            return False
        except Exception:
            return True
    return True


async def _repair_recipes(db, company_id: str) -> Dict[str, Any]:
    """Sanitize recipes: fill required fields that would break Pydantic
    validation (name, category, yield_quantity, yield_unit, created_at).
    """
    scanned = 0
    repaired = 0
    fields_filled: Dict[str, int] = {}

    cursor = db.recipes.find({"company_id": company_id}, {"_id": 1, "recipe_id": 1, "name": 1,
                                                          "category": 1, "yield_quantity": 1,
                                                          "yield_unit": 1, "created_at": 1,
                                                          "updated_at": 1, "ingredients": 1,
                                                          "sub_recipes": 1, "allergens": 1,
                                                          "dietary_tags": 1, "verified_status": 1,
                                                          "recipe_type": 1})
    async for doc in cursor:
        scanned += 1
        patch: Dict[str, Any] = {}

        if not doc.get("name"):
            patch["name"] = "(sin nombre)"
            fields_filled["name"] = fields_filled.get("name", 0) + 1
        if not doc.get("category"):
            patch["category"] = "Otros"
            fields_filled["category"] = fields_filled.get("category", 0) + 1
        if doc.get("yield_quantity") in (None, 0, "", "0"):
            patch["yield_quantity"] = 1.0
            fields_filled["yield_quantity"] = fields_filled.get("yield_quantity", 0) + 1
        if not doc.get("yield_unit"):
            patch["yield_unit"] = "portion"
            fields_filled["yield_unit"] = fields_filled.get("yield_unit", 0) + 1
        if _is_bad_dt(doc.get("created_at")):
            patch["created_at"] = _now_iso()
            fields_filled["created_at"] = fields_filled.get("created_at", 0) + 1
        if _is_bad_dt(doc.get("updated_at")):
            patch["updated_at"] = _now_iso()
            fields_filled["updated_at"] = fields_filled.get("updated_at", 0) + 1
        if doc.get("ingredients") is None:
            patch["ingredients"] = []
            fields_filled["ingredients"] = fields_filled.get("ingredients", 0) + 1
        if doc.get("sub_recipes") is None:
            patch["sub_recipes"] = []
            fields_filled["sub_recipes"] = fields_filled.get("sub_recipes", 0) + 1
        if doc.get("allergens") is None:
            patch["allergens"] = []
            fields_filled["allergens"] = fields_filled.get("allergens", 0) + 1
        if doc.get("dietary_tags") is None:
            patch["dietary_tags"] = []
            fields_filled["dietary_tags"] = fields_filled.get("dietary_tags", 0) + 1
        if not doc.get("verified_status"):
            patch["verified_status"] = "Draft"
            fields_filled["verified_status"] = fields_filled.get("verified_status", 0) + 1
        if not doc.get("recipe_type"):
            patch["recipe_type"] = "Final"
            fields_filled["recipe_type"] = fields_filled.get("recipe_type", 0) + 1

        if patch:
            await db.recipes.update_one({"_id": doc["_id"]}, {"$set": patch})
            repaired += 1

    return {"scanned": scanned, "repaired": repaired, "fields_filled": fields_filled}


async def _repair_ingredients(db, company_id: str) -> Dict[str, Any]:
    scanned = 0
    repaired = 0
    fields_filled: Dict[str, int] = {}

    cursor = db.ingredients.find({"company_id": company_id})
    async for doc in cursor:
        scanned += 1
        patch: Dict[str, Any] = {}

        # Legacy name migration: unit_cost -> cost_per_unit, current_stock -> stock_quantity, min_stock -> min_stock_level
        if "unit_cost" in doc and "cost_per_unit" not in doc:
            patch["cost_per_unit"] = doc.get("unit_cost", 0.0)
            fields_filled["cost_per_unit_from_unit_cost"] = fields_filled.get("cost_per_unit_from_unit_cost", 0) + 1
        if "current_stock" in doc and "stock_quantity" not in doc:
            patch["stock_quantity"] = doc.get("current_stock", 0.0)
            fields_filled["stock_quantity_from_current_stock"] = fields_filled.get("stock_quantity_from_current_stock", 0) + 1
        if "min_stock" in doc and "min_stock_level" not in doc:
            patch["min_stock_level"] = doc.get("min_stock", 0.0)
            fields_filled["min_stock_level_from_min_stock"] = fields_filled.get("min_stock_level_from_min_stock", 0) + 1

        # Fill required fields
        if not doc.get("ingredient_id"):
            # Use existing _id as suffix to guarantee uniqueness
            patch["ingredient_id"] = f"legacy_{str(doc.get('_id', ''))[-12:]}"
            fields_filled["ingredient_id"] = fields_filled.get("ingredient_id", 0) + 1
        if not doc.get("name"):
            patch["name"] = "(sin nombre)"
            fields_filled["name"] = fields_filled.get("name", 0) + 1
        if not doc.get("category"):
            patch["category"] = "Otros"
            fields_filled["category"] = fields_filled.get("category", 0) + 1
        if not doc.get("unit"):
            patch["unit"] = "unit"
            fields_filled["unit"] = fields_filled.get("unit", 0) + 1
        # Numeric fields — only default to 0.0 if the legacy migration didn't
        # already set a real value in this patch (unit_cost/current_stock/min_stock).
        if doc.get("cost_per_unit") is None and "cost_per_unit" not in patch:
            patch["cost_per_unit"] = 0.0
            fields_filled["cost_per_unit_null"] = fields_filled.get("cost_per_unit_null", 0) + 1
        if doc.get("stock_quantity") is None and "stock_quantity" not in patch:
            patch["stock_quantity"] = 0.0
            fields_filled["stock_quantity_null"] = fields_filled.get("stock_quantity_null", 0) + 1
        if doc.get("min_stock_level") is None and "min_stock_level" not in patch:
            patch["min_stock_level"] = 0.0
            fields_filled["min_stock_level_null"] = fields_filled.get("min_stock_level_null", 0) + 1
        if _is_bad_dt(doc.get("created_at")):
            patch["created_at"] = _now_iso()
            fields_filled["created_at"] = fields_filled.get("created_at", 0) + 1
        if not doc.get("inventory_type"):
            patch["inventory_type"] = "food"
            fields_filled["inventory_type"] = fields_filled.get("inventory_type", 0) + 1

        # Defaults for optional but expected arrays/dicts
        if doc.get("allergens") is None:
            patch["allergens"] = []
            fields_filled["allergens"] = fields_filled.get("allergens", 0) + 1
        if doc.get("alternate_supplier_ids") is None:
            patch["alternate_supplier_ids"] = []
            fields_filled["alternate_supplier_ids"] = fields_filled.get("alternate_supplier_ids", 0) + 1
        if doc.get("price_history") is None:
            patch["price_history"] = []
            fields_filled["price_history"] = fields_filled.get("price_history", 0) + 1

        if patch:
            await db.ingredients.update_one({"_id": doc["_id"]}, {"$set": patch})
            repaired += 1

    return {"scanned": scanned, "repaired": repaired, "fields_filled": fields_filled}


async def _repair_suppliers(db, company_id: str) -> Dict[str, Any]:
    scanned = 0
    repaired = 0
    fields_filled: Dict[str, int] = {}

    cursor = db.suppliers.find({"company_id": company_id})
    async for doc in cursor:
        scanned += 1
        patch: Dict[str, Any] = {}

        if not doc.get("supplier_id"):
            patch["supplier_id"] = f"legacy_{str(doc.get('_id', ''))[-12:]}"
            fields_filled["supplier_id"] = fields_filled.get("supplier_id", 0) + 1
        if not doc.get("name"):
            patch["name"] = "(sin nombre)"
            fields_filled["name"] = fields_filled.get("name", 0) + 1
        if _is_bad_dt(doc.get("created_at")):
            patch["created_at"] = _now_iso()
            fields_filled["created_at"] = fields_filled.get("created_at", 0) + 1
        if doc.get("delivery_days") is None:
            patch["delivery_days"] = []
            fields_filled["delivery_days"] = fields_filled.get("delivery_days", 0) + 1
        if doc.get("minimum_order") is None:
            patch["minimum_order"] = 0.0
            fields_filled["minimum_order"] = fields_filled.get("minimum_order", 0) + 1
        if not doc.get("payment_terms"):
            patch["payment_terms"] = "net30"
            fields_filled["payment_terms"] = fields_filled.get("payment_terms", 0) + 1
        if not doc.get("category"):
            patch["category"] = "General"
            fields_filled["category"] = fields_filled.get("category", 0) + 1

        if patch:
            await db.suppliers.update_one({"_id": doc["_id"]}, {"$set": patch})
            repaired += 1

    return {"scanned": scanned, "repaired": repaired, "fields_filled": fields_filled}


async def _repair_plated_menus(db, company_id: str) -> Dict[str, Any]:
    scanned = 0
    repaired = 0
    fields_filled: Dict[str, int] = {}

    cursor = db.plated_menus.find({"company_id": company_id})
    async for doc in cursor:
        scanned += 1
        patch: Dict[str, Any] = {}

        if not doc.get("menu_id"):
            patch["menu_id"] = f"legacy_pmenu_{str(doc.get('_id', ''))[-12:]}"
            fields_filled["menu_id"] = fields_filled.get("menu_id", 0) + 1
        if not doc.get("name"):
            patch["name"] = "(sin nombre)"
            fields_filled["name"] = fields_filled.get("name", 0) + 1
        if _is_bad_dt(doc.get("created_at")):
            patch["created_at"] = _now_iso()
            fields_filled["created_at"] = fields_filled.get("created_at", 0) + 1
        if doc.get("courses") is None:
            patch["courses"] = []
            fields_filled["courses"] = fields_filled.get("courses", 0) + 1

        if patch:
            await db.plated_menus.update_one({"_id": doc["_id"]}, {"$set": patch})
            repaired += 1

    return {"scanned": scanned, "repaired": repaired, "fields_filled": fields_filled}


async def _repair_one_company(db, company_id: str) -> Dict[str, Any]:
    """Run all repair functions for a single company. Never raises — each
    collection's failure is isolated and logged.
    """
    summary: Dict[str, Any] = {}
    for name, fn in [
        ("recipes", _repair_recipes),
        ("ingredients", _repair_ingredients),
        ("suppliers", _repair_suppliers),
        ("plated_menus", _repair_plated_menus),
    ]:
        try:
            summary[name] = await fn(db, company_id)
        except Exception as e:
            _log.exception(f"[legacy-repair] {name} failed for company {company_id}: {e}")
            summary[name] = {"error": f"{type(e).__name__}: {str(e)[:200]}"}
    return summary


async def run_legacy_repair_if_needed(db) -> None:
    """Entry point — call from FastAPI startup. Version-gated: only runs when
    stored `legacy_repair_version` < module-level REPAIR_VERSION.
    """
    try:
        state = await db.repair_state.find_one({"key": "legacy_repair_version"})
        current = int((state or {}).get("version", 0))
        if current >= REPAIR_VERSION:
            _log.info(f"[legacy-repair] Already at v{current} (target v{REPAIR_VERSION}) — skipping.")
            return

        _log.info(f"[legacy-repair] Starting v{REPAIR_VERSION} (from v{current}) …")
        started_at = datetime.now(timezone.utc)

        companies = await db.companies.find({}, {"_id": 0, "company_id": 1}).to_list(None)
        totals = {"companies_processed": 0, "companies_skipped_no_id": 0}
        rollup: Dict[str, Dict[str, int]] = {
            "recipes": {"scanned": 0, "repaired": 0},
            "ingredients": {"scanned": 0, "repaired": 0},
            "suppliers": {"scanned": 0, "repaired": 0},
            "plated_menus": {"scanned": 0, "repaired": 0},
        }

        for c in companies:
            cid = c.get("company_id")
            if not cid:
                totals["companies_skipped_no_id"] += 1
                continue
            per_company = await _repair_one_company(db, cid)
            # Persist per-company audit trail
            await db.legacy_repair_history.insert_one({
                "company_id": cid,
                "run_at": datetime.now(timezone.utc).isoformat(),
                "version": REPAIR_VERSION,
                "summary": per_company,
            })
            # Aggregate for the top-level log line
            for coll_name, coll_result in per_company.items():
                if isinstance(coll_result, dict) and "scanned" in coll_result:
                    rollup[coll_name]["scanned"] += coll_result["scanned"]
                    rollup[coll_name]["repaired"] += coll_result["repaired"]
            totals["companies_processed"] += 1

        # Mark version complete
        await db.repair_state.update_one(
            {"key": "legacy_repair_version"},
            {"$set": {
                "key": "legacy_repair_version",
                "version": REPAIR_VERSION,
                "last_run_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": (datetime.now(timezone.utc) - started_at).total_seconds(),
                "totals": totals,
                "rollup": rollup,
            }},
            upsert=True,
        )
        _log.info(f"[legacy-repair] v{REPAIR_VERSION} DONE. totals={totals} rollup={rollup}")
    except Exception as e:
        _log.exception(f"[legacy-repair] Top-level failure (non-fatal): {e}")
        # Do NOT re-raise — startup must succeed even if repair fails
