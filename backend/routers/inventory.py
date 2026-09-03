"""Inventory endpoints — extracted from server.py in the refactor sprint. LOGIC UNCHANGED.

Contains:
- Inventory summary and ingredient CRUD (list, get, create, update, delete, adjust, patch)
- Cost preview + `_recalc_recipes_using_ingredient` helper
- Low stock / valuation / transactions endpoints
- Reservation endpoints (reserve / release-reservation / list reservations)
- AI Repair endpoints (ai-repair + undo)
- Extended fields, price history CRUD
- Bulk upload, update prices from invoice, value summary
- Import/export (validate-import-file, import-from-file, import-template)
"""
import csv
import io
import json
import logging
import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from models.inventory import (
    Ingredient,
    IngredientCreate,
    InventoryItem,
    InventoryItemCreate,
    InventoryItemExtendedUpdate,
    InventoryItemUpdate,
    InventoryPriceHistory,
    InventoryPriceHistoryCreate,
    InventoryTransaction,
    InventoryTransactionCreate,
)
from models.recipes import RecipeIngredient
from routers.recipes import (
    calculate_recipe_cost,
    compute_full_recipe_costing,
)
from utils.legacy_units import convert_units

logger = logging.getLogger(__name__)

inventory_router = APIRouter(prefix="/inventory", tags=["Inventory"])


# ============ BODY (endpoints + helpers) — extracted from server.py ============
# ============== INVENTORY ROUTES - Enhanced ==============

@inventory_router.get("")
async def get_inventory_summary(user: User = Depends(get_current_user)):
    """Get inventory summary - returns all ingredients"""
    ingredients = await db.ingredients.find(
        {"company_id": user.company_id}, 
        {"_id": 0}
    ).sort("name", 1).to_list(1000)
    
    for i in ingredients:
        for field in ["created_at", "updated_at"]:
            if i.get(field) and isinstance(i[field], str):
                try:
                    i[field] = datetime.fromisoformat(i[field])
                except Exception:
                    pass
        
        # Map legacy field names from migration to expected field names
        if "unit_cost" in i and "cost_per_unit" not in i:
            i["cost_per_unit"] = i.get("unit_cost", 0.0)
        if "current_stock" in i and "stock_quantity" not in i:
            i["stock_quantity"] = i.get("current_stock", 0.0)
        if "min_stock" in i and "min_stock_level" not in i:
            i["min_stock_level"] = i.get("min_stock", 0.0)
        
        # Ensure required fields have values
        if "cost_per_unit" not in i:
            i["cost_per_unit"] = 0.0
        if "stock_quantity" not in i:
            i["stock_quantity"] = 0.0
        if "min_stock_level" not in i:
            i["min_stock_level"] = 0.0
        
        # Set defaults for new fields
        for field, default in [("inventory_type", "food"), ("par_level", 0.0), ("yield_waste_percent", 0.0), ("allergens", []), ("storage_location", "dry"), ("reorder_threshold", 0.0), ("alternate_supplier_ids", []), ("pack_size", 1.0), ("pack_unit", "unit"), ("average_cost", i.get("cost_per_unit", 0)), ("price_history", [])]:
            if field not in i:
                i[field] = default
    return ingredients


@inventory_router.get("/ingredients", response_model=List[Ingredient])
async def get_ingredients(inventory_type: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if inventory_type:
        query["inventory_type"] = inventory_type
    
    ingredients = await db.ingredients.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    
    from datetime import datetime as _dt, timezone as _tz
    safe_out = []
    for i in ingredients:
        try:
            for field in ["created_at", "updated_at"]:
                if i.get(field) and isinstance(i[field], str):
                    try:
                        i[field] = datetime.fromisoformat(i[field])
                    except Exception:
                        i[field] = _dt.now(_tz.utc)
            
            # Map legacy field names from migration to expected field names
            if "unit_cost" in i and "cost_per_unit" not in i:
                i["cost_per_unit"] = i.get("unit_cost", 0.0)
            if "current_stock" in i and "stock_quantity" not in i:
                i["stock_quantity"] = i.get("current_stock", 0.0)
            if "min_stock" in i and "min_stock_level" not in i:
                i["min_stock_level"] = i.get("min_stock", 0.0)
            
            # Defensive defaults for required fields — legacy data from tenants
            # like Ciano may have gaps that would otherwise crash the whole
            # response with a Pydantic validation error (500). We fill them in
            # so a single dirty row cannot take down the entire ingredients list.
            if not i.get("ingredient_id"):
                i["ingredient_id"] = f"legacy_{i.get('name', 'unknown')[:20]}"
            if not i.get("company_id"):
                i["company_id"] = user.company_id
            if not i.get("name"):
                i["name"] = "(sin nombre)"
            if not i.get("category"):
                i["category"] = "Otros"
            if not i.get("unit"):
                i["unit"] = "unit"
            if not i.get("created_at"):
                i["created_at"] = _dt.now(_tz.utc)
            
            # Ensure required numeric fields have values
            if "cost_per_unit" not in i or i["cost_per_unit"] is None:
                i["cost_per_unit"] = 0.0
            if "stock_quantity" not in i or i["stock_quantity"] is None:
                i["stock_quantity"] = 0.0
            if "min_stock_level" not in i or i["min_stock_level"] is None:
                i["min_stock_level"] = 0.0
            
            # Set defaults for new fields
            for field, default in [("inventory_type", "food"), ("par_level", 0.0), ("yield_waste_percent", 0.0), ("allergens", []), ("storage_location", "dry"), ("reorder_threshold", 0.0), ("alternate_supplier_ids", []), ("pack_size", 1.0), ("pack_unit", "unit"), ("average_cost", i.get("cost_per_unit", 0)), ("price_history", [])]:
                if field not in i or i[field] is None:
                    i[field] = default

            # === Origen: default to "Propio" so pre-existing rows keep working
            # exactly as before. Only touch rental_* fields when origin=Alquilado.
            i.setdefault("origin", "Propio")
            if i.get("origin") == "Alquilado":
                # Auto-flip rental_return_status to "overdue" if the deadline
                # has passed and it's still pending. Non-destructive: we only
                # override "pending", never "returned".
                deadline = i.get("rental_return_deadline")
                status_now = (i.get("rental_return_status") or "pending").lower()
                if deadline and status_now == "pending":
                    try:
                        # Accept either "YYYY-MM-DD" or ISO datetime
                        dl_str = str(deadline)[:10]
                        dl_dt = datetime.strptime(dl_str, "%Y-%m-%d").date()
                        today = datetime.now(_tz.utc).date()
                        if dl_dt < today:
                            i["rental_return_status"] = "overdue"
                    except Exception:
                        pass
                # Ensure the label is set for the FE even for freshly-marked-as-Alquilado items
                i.setdefault("rental_return_status", "pending")
            # === Operational status (2026-02-11) — default "En Almacén" so legacy
            # rows keep behaving the same. Only "En Almacén" counts as available.
            i.setdefault("status", "En Almacén")
            # Computed field: available for new reservations.
            # If status != "En Almacén", the whole stock is currently unavailable
            # (packed / in transit / at event / returning / damaged / lost).
            reserved = float(i.get("reserved_quantity") or 0)
            stock_q = float(i.get("stock_quantity") or 0)
            if i.get("status") == "En Almacén":
                i["available_quantity"] = max(stock_q - reserved, 0)
            else:
                i["available_quantity"] = 0
            safe_out.append(i)
        except Exception as row_err:
            # Skip a row that we still can't sanitize (never fail the entire list)
            import logging
            logging.getLogger(__name__).warning(
                f"[ingredients] skipping malformed row for company {user.company_id}: {row_err} — row keys: {list(i.keys())[:10]}"
            )
            continue
    return safe_out


# PASE A · Single source of truth helpers ---------------------------------
# Purchase Format & Price (`purchase_cost`, `purchase_quantity_per_unit`,
# `purchase_unit`, `base_unit`) is the ONLY writable pricing input from the
# user. `cost_per_unit` and `cost_per_base_unit` are derived — never accepted
# from the client. Ingredients without complete purchase data are flagged
# with `purchase_incomplete=true` so consumers surface a visible warning
# instead of silently computing from ambiguous legacy fields.
_PASE_A_ENABLED = os.environ.get("PASE_A_ENABLED", "true").strip().lower() not in {"0", "false", "no"}


def _apply_pase_a_derivations(payload: dict) -> None:
    """Mutate `payload` in-place to enforce PASE A semantics.

    - If purchase_cost + purchase_quantity_per_unit > 0:
        cost_per_unit       = purchase_cost                  ($/purchase_unit)
        cost_per_base_unit  = purchase_cost / purchase_qty   ($/base_unit)
        purchase_incomplete = False
        unit                = purchase_unit  (keeps stock rollup coherent)
    - Else: purchase_incomplete = True (do NOT touch legacy cpu/cpbu — the
      user's prior data is preserved but not trusted for new derivations).

    Feature flag `PASE_A_ENABLED` (default true) short-circuits this whole
    block, restoring pre-PASE-A behaviour for emergency rollback without a
    code revert.
    """
    if not _PASE_A_ENABLED:
        return
    pc = float(payload.get("purchase_cost") or 0)
    pq = float(payload.get("purchase_quantity_per_unit") or 0)
    pu = (payload.get("purchase_unit") or "").strip()
    bu = (payload.get("base_unit") or "").strip()
    u = (payload.get("unit") or "").strip()
    complete = pc > 0 and pq > 0 and bool(pu) and bool(bu)
    if complete:
        payload["cost_per_unit"] = round(pc, 4)
        payload["cost_per_base_unit"] = round(pc / pq, 6)
        payload["purchase_incomplete"] = False
        payload["unit"] = pu
    else:
        # Degenerate-but-safe case: unit == base_unit (e.g. unit=g, base=g).
        # No ambiguity — cost_per_unit is already priced per base_unit and
        # Value/recipes will compute correctly. Keep purchase_incomplete=False.
        if u and bu and u == bu and float(payload.get("cost_per_unit") or 0) > 0:
            payload["purchase_incomplete"] = False
        else:
            payload["purchase_incomplete"] = True


@inventory_router.post("/ingredients", response_model=Ingredient)
async def create_ingredient(data: IngredientCreate, user: User = Depends(get_current_user)):
    from utils.units import derive_base_unit, normalize_unit, convert as unit_convert
    now = datetime.now(timezone.utc)
    ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"

    payload = data.model_dump()
    # Auto-derive base_unit if not provided
    if not payload.get("base_unit"):
        payload["base_unit"] = derive_base_unit(payload.get("category", ""))
    # PASE A · Single source of truth = Purchase Format & Price.
    # If purchase_cost + purchase_quantity_per_unit are present, derive
    # cost_per_unit and cost_per_base_unit from them. Otherwise mark the
    # ingredient as `purchase_incomplete` so consumers show the warning
    # instead of computing values from ambiguous inputs.
    _apply_pase_a_derivations(payload)

    ingredient_doc = {
        "ingredient_id": ingredient_id,
        "company_id": user.company_id,
        **payload,
        "average_cost": payload.get("cost_per_unit") or 0,
        "price_history": [{"price": payload.get("cost_per_unit") or 0, "date": now.isoformat()}],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.ingredients.insert_one(ingredient_doc)
    del ingredient_doc["_id"]
    ingredient_doc["created_at"] = now
    ingredient_doc["updated_at"] = now
    return Ingredient(**ingredient_doc)

@inventory_router.post("/ingredients/cost-preview")
async def preview_ingredient_cost(payload: dict, user: User = Depends(get_current_user)):
    """Live cost preview for a recipe line."""
    from utils.units import cost_for_recipe_line, convert, normalize_unit, unit_kind, is_compatible, UnitConversionError
    ingredient_id = payload.get("ingredient_id")
    quantity = float(payload.get("quantity") or 0)
    line_unit = normalize_unit(payload.get("unit") or "")
    waste = float(payload.get("waste_factor_pct") or 0)

    if not ingredient_id:
        raise HTTPException(status_code=400, detail="ingredient_id required")

    ingredient = await db.ingredients.find_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")

    base_unit = normalize_unit(ingredient.get("base_unit") or ingredient.get("unit") or "")

    # Try conversion + cost. Any UnitConversionError → surface explicit error,
    # never fall back to a $0 cost.
    conversion_error = None
    qty_in_base = None
    compatible = False
    if line_unit and base_unit:
        try:
            qty_in_base = convert(quantity, line_unit, base_unit, ingredient) if quantity else None
            compatible = True
        except UnitConversionError as ce:
            conversion_error = {
                "from_unit": ce.from_unit, "to_unit": ce.to_unit,
                "reason": ce.reason, "ingredient_name": ce.ingredient_name,
            }

    message = None
    if conversion_error:
        message = (f"⚠️ Sin conversión disponible entre '{conversion_error['from_unit']}' y "
                   f"'{conversion_error['to_unit']}': {conversion_error['reason']}")

    raw_waste = payload.get("waste_factor_pct")
    if raw_waste is None:
        applied_waste = float(ingredient.get("yield_waste_percent") or 0)
    else:
        applied_waste = float(raw_waste or 0)
    applied_waste = max(0.0, min(applied_waste, 99.99))
    yield_frac = 1.0 - applied_waste / 100.0
    effective_qty = quantity / yield_frac if yield_frac > 0 else quantity

    if conversion_error:
        cost = 0.0
    else:
        try:
            cost = cost_for_recipe_line(effective_qty, line_unit, ingredient) if quantity else 0
        except UnitConversionError as ce:
            conversion_error = {
                "from_unit": ce.from_unit, "to_unit": ce.to_unit,
                "reason": ce.reason, "ingredient_name": ce.ingredient_name,
            }
            message = (f"⚠️ Sin conversión disponible entre '{ce.from_unit}' y "
                       f"'{ce.to_unit}': {ce.reason}")
            cost = 0.0

    return {
        "cost": round(cost, 4),
        "compatible": compatible and conversion_error is None,
        "conversion_error": conversion_error,
        "base_unit": base_unit,
        "quantity_in_base": round(qty_in_base, 4) if qty_in_base is not None else None,
        "ingredient_unit_kind": unit_kind(base_unit),
        "applied_waste_pct": applied_waste,
        "default_waste_pct": float(ingredient.get("yield_waste_percent") or 0),
        "message": message,
    }


@inventory_router.get("/ingredients/{ingredient_id}", response_model=Ingredient)
async def get_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    for field in ["created_at", "updated_at"]:
        if ingredient.get(field) and isinstance(ingredient[field], str):
            ingredient[field] = datetime.fromisoformat(ingredient[field])
    
    # Map legacy field names from migration
    if "unit_cost" in ingredient and "cost_per_unit" not in ingredient:
        ingredient["cost_per_unit"] = ingredient.get("unit_cost", 0.0)
    if "current_stock" in ingredient and "stock_quantity" not in ingredient:
        ingredient["stock_quantity"] = ingredient.get("current_stock", 0.0)
    if "min_stock" in ingredient and "min_stock_level" not in ingredient:
        ingredient["min_stock_level"] = ingredient.get("min_stock", 0.0)
    
    # Ensure required fields have values
    if "cost_per_unit" not in ingredient:
        ingredient["cost_per_unit"] = 0.0
    if "stock_quantity" not in ingredient:
        ingredient["stock_quantity"] = 0.0
    if "min_stock_level" not in ingredient:
        ingredient["min_stock_level"] = 0.0
    if "reserved_quantity" not in ingredient:
        ingredient["reserved_quantity"] = 0.0
    
    # Set defaults for optional fields
    for field, default in [("inventory_type", "food"), ("par_level", 0.0), ("yield_waste_percent", 0.0), ("allergens", []), ("storage_location", "dry"), ("reorder_threshold", 0.0), ("alternate_supplier_ids", []), ("pack_size", 1.0), ("pack_unit", "unit"), ("average_cost", ingredient.get("cost_per_unit", 0)), ("price_history", [])]:
        if field not in ingredient:
            ingredient[field] = default
    
    return Ingredient(**ingredient)

@inventory_router.put("/ingredients/{ingredient_id}", response_model=Ingredient)
async def update_ingredient(ingredient_id: str, data: dict, response: Response, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    
    # Get current ingredient to check price change
    current = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    # TRUE PARTIAL UPDATE: accept a raw dict (not IngredientCreate) so callers can send
    # any subset without triggering Pydantic 422 on missing required fields.
    # Preserves preferred_supplier_id, notes, alternate_supplier_ids, etc.
    # Reject unknown keys silently by whitelisting to the Ingredient/IngredientCreate model fields.
    allowed_fields = set(IngredientCreate.model_fields.keys()) | {
        "cost_per_base_unit", "purchase_unit", "purchase_quantity_per_unit", "purchase_cost",
        "base_unit", "density_g_per_ml", "yield_waste_percent",
        "preferred_supplier_id", "secondary_supplier_id", "alternate_supplier_ids",
        "notes", "allergens", "storage_location", "pack_size", "pack_unit",
        "barcode", "description", "image_url", "reorder_threshold", "replacement_cost",
        "non_yieldable", "is_discrete_unit", "needs_review",
        "ai_repaired_at", "ai_repair_reasoning", "ai_reverted_at",
    }
    update_data = {k: v for k, v in (data or {}).items() if k in allowed_fields}
    update_data["updated_at"] = now.isoformat()

    # PASE A · Merge current + update, then derive cost_per_unit and
    # cost_per_base_unit strictly from purchase_cost/purchase_quantity_per_unit.
    # Client-supplied cost_per_unit is ignored (defence: a stale FE cannot
    # write into the source of truth). Sets `purchase_incomplete` accordingly.
    _merged_for_derive = {**current, **update_data}
    _apply_pase_a_derivations(_merged_for_derive)
    if _PASE_A_ENABLED:
        # Propagate the derived fields back into update_data so the $set
        # persists them.
        for _f in ("cost_per_unit", "cost_per_base_unit", "purchase_incomplete", "unit"):
            if _f in _merged_for_derive:
                update_data[_f] = _merged_for_derive[_f]

    # Detect changes that affect recipe cost — price OR waste — to trigger downstream recalc
    new_cpu = update_data.get("cost_per_unit", current.get("cost_per_unit", 0))
    new_cpbu = update_data.get("cost_per_base_unit", current.get("cost_per_base_unit", 0))
    new_pcost = update_data.get("purchase_cost", current.get("purchase_cost", 0))
    cost_changed = (
        current.get("cost_per_unit", 0) != new_cpu
        or current.get("cost_per_base_unit", 0) != new_cpbu
        or current.get("purchase_cost", 0) != new_pcost
    )
    new_waste = update_data.get("yield_waste_percent", current.get("yield_waste_percent"))
    waste_changed = float(current.get("yield_waste_percent") or 0) != float(new_waste or 0)

    # Also detect changes to unit-conversion metadata. When a user sets a
    # missing density_g_per_ml or weight_per_unit_g on an ingredient, that can
    # RESOLVE previously-unresolvable conversions in recipes — so downstream
    # recipes need to be re-costed (which also refreshes their
    # has_conversion_errors flag). Same for base_unit changes.
    new_density = update_data.get("density_g_per_ml", current.get("density_g_per_ml"))
    density_changed = float(current.get("density_g_per_ml") or 0) != float(new_density or 0)
    new_wpu = update_data.get("weight_per_unit_g", current.get("weight_per_unit_g"))
    wpu_changed = float(current.get("weight_per_unit_g") or 0) != float(new_wpu or 0)
    new_base = update_data.get("base_unit", current.get("base_unit"))
    base_unit_changed = (current.get("base_unit") or "") != (new_base or "")
    # PASE A: purchase_quantity_per_unit changes also affect derived cost_per_base_unit
    new_pqty = update_data.get("purchase_quantity_per_unit", current.get("purchase_quantity_per_unit"))
    pqty_changed = float(current.get("purchase_quantity_per_unit") or 0) != float(new_pqty or 0)
    conversion_meta_changed = density_changed or wpu_changed or base_unit_changed or pqty_changed
    
    # Log price change
    if cost_changed and "cost_per_unit" in update_data:
        price_history = current.get("price_history", [])
        price_history.append({"price": update_data["cost_per_unit"], "date": now.isoformat(), "previous": current.get("cost_per_unit")})
        update_data["price_history"] = price_history

    # Auto-sync cost_per_base_unit when cost_per_unit changes but cost_per_base_unit
    # was not explicitly provided (or is stale/zero). This prevents recipes from
    # reading a legacy cost_per_base_unit=0 while cost_per_unit is set correctly.
    if cost_changed and "cost_per_base_unit" not in update_data:
        try:
            from utils.units import normalize_unit as _norm_unit, convert as _unit_convert
            merged = {**current, **update_data}
            base_unit = _norm_unit(merged.get("base_unit") or merged.get("unit") or "")
            legacy_unit = _norm_unit(merged.get("unit") or "")
            legacy_cost = float(merged.get("cost_per_unit") or 0)
            derived = legacy_cost
            if legacy_unit and base_unit and legacy_unit != base_unit:
                conv = _unit_convert(1.0, base_unit, legacy_unit, merged)
                if conv is not None:
                    derived = legacy_cost * conv
            update_data["cost_per_base_unit"] = round(derived, 6)
        except Exception as _e:
            logger.warning(f"cost_per_base_unit auto-sync failed for {ingredient_id}: {_e}")

    await db.ingredients.update_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"$set": update_data})
    
    # Auto-recalc downstream recipes that use this ingredient.
    # SAFETY: this only touches the recipes collection (snapshot per recipe of total_cost/cost_per_portion).
    # Proposals/OrderItems already in DB are NOT touched — they store internal_cost as a static snapshot
    # at the moment the line was added to the quote. Confirmed/accepted prices remain intact.
    if cost_changed or waste_changed or conversion_meta_changed:
        try:
            cascade_result = await _recalc_recipes_using_ingredient(ingredient_id, user.company_id)
            # Expose cascade summary via response headers so the frontend can toast
            # "3 recetas y 5 formatos actualizados" without touching the response body
            # (which is strictly the Ingredient pydantic model).
            response.headers["X-Cascade-Recipes"] = str(int(cascade_result.get("recalculated", 0)))
            response.headers["X-Cascade-Formats"] = str(int(cascade_result.get("portion_formats_refreshed", 0)))
            response.headers["Access-Control-Expose-Headers"] = "X-Cascade-Recipes, X-Cascade-Formats"
        except Exception as e:
            logger.warning(f"Auto-recalc on ingredient {ingredient_id} change failed: {e}")

        # Fase 2 SHADOW MODE — fire-and-forget cascade walk that observes what
        # the *correct* cost should be and records drift in `cost_staleness`.
        # Never mutates ingredients/recipes; safe on failure.
        try:
            from services.cost_cascade import enqueue_cascade
            enqueue_cascade(
                company_id=user.company_id,
                root_type="ingredient",
                root_id=ingredient_id,
                trigger={
                    "kind": "ingredient_update",
                    "item_id": ingredient_id,
                    "from_cost_per_unit": float(current.get("cost_per_unit") or 0),
                    "to_cost_per_unit": float(new_cpu or 0),
                    "user_id": getattr(user, "user_id", None),
                },
            )
        except Exception as e:
            logger.debug(f"shadow cascade enqueue skipped: {e}")

    return await get_ingredient(ingredient_id, user)


async def _recalc_recipes_using_ingredient(ingredient_id: str, company_id: str) -> dict:
    """Recalculate cost for every recipe that references this ingredient (direct or via sub-recipes).
    Returns {recalculated, affected_recipe_ids}. Does NOT touch proposals/order_items."""
    # Find direct uses
    recipes_to_recalc_ids: set = set()
    direct = await db.recipes.find(
        {
            "company_id": company_id,
            "$or": [
                {"ingredients.item_id": ingredient_id},
                {"ingredients.ingredient_id": ingredient_id},
            ],
        },
        {"_id": 0, "recipe_id": 1},
    ).to_list(2000)
    for r in direct:
        recipes_to_recalc_ids.add(r["recipe_id"])
    # Transitively expand via sub-recipes (one extra hop is enough for most kitchens)
    if recipes_to_recalc_ids:
        parents = await db.recipes.find(
            {
                "company_id": company_id,
                "sub_recipes.child_recipe_id": {"$in": list(recipes_to_recalc_ids)},
            },
            {"_id": 0, "recipe_id": 1},
        ).to_list(2000)
        for r in parents:
            recipes_to_recalc_ids.add(r["recipe_id"])

    if not recipes_to_recalc_ids:
        return {"recalculated": 0, "affected_recipe_ids": [], "portion_formats_refreshed": 0}

    affected = []
    total_formats_refreshed = 0
    for rid in recipes_to_recalc_ids:
        recipe = await db.recipes.find_one({"recipe_id": rid, "company_id": company_id}, {"_id": 0})
        if not recipe:
            continue
        try:
            ingredients = [RecipeIngredient(**i) for i in recipe.get("ingredients", [])]
        except Exception:
            continue
        sub_recipes = recipe.get("sub_recipes", [])
        new_total, updated_ings, updated_subs, conv_errs = await calculate_recipe_cost(
            ingredients, sub_recipes, company_id,
        )
        # Compute full costing (labor + overhead + suggested price + contribution) — Sprint P0
        # Note: full_costing internally recalculates cost_per_yield / cost_per_portion / food_cost_percent,
        # so no separate local calculation is needed here.
        full_costing = await compute_full_recipe_costing(recipe, new_total, company_id)
        await db.recipes.update_one(
            {"recipe_id": rid, "company_id": company_id},
            {"$set": {
                "ingredients": updated_ings,
                "sub_recipes": updated_subs,
                "total_cost": new_total,
                **full_costing,
                "conversion_errors": conv_errs,
                "conversion_errors_count": len(conv_errs),
                "has_conversion_errors": len(conv_errs) > 0,
                "last_cost_recalc_at": datetime.now(timezone.utc).isoformat(),
                "last_cost_recalc_trigger": f"ingredient:{ingredient_id}",
            }},
        )
        affected.append(rid)
        # BUGFIX Feb 2026 — cascade must also refresh portion_formats snapshots
        # so the "Formatos de Porción" table doesn't show stale cost_per_portion
        # after ingredient prices change.
        try:
            from routers.recipes import _refresh_portion_formats_for_recipe
            refreshed_count = await _refresh_portion_formats_for_recipe(rid, company_id)
            if isinstance(refreshed_count, int):
                total_formats_refreshed += refreshed_count
            else:
                # Fallback: count via direct query if helper doesn't return an int.
                total_formats_refreshed += await db.recipe_portion_formats.count_documents(
                    {"recipe_id": rid, "company_id": company_id}
                )
        except Exception as _pf_err:
            import logging as _l
            _l.getLogger(__name__).warning(
                f"cascade refresh portion_formats failed for {rid}: {_pf_err}"
            )
    return {
        "recalculated": len(affected),
        "affected_recipe_ids": affected,
        "portion_formats_refreshed": total_formats_refreshed,
    }

@inventory_router.delete("/ingredients/{ingredient_id}")
async def delete_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    result = await db.ingredients.delete_one({"ingredient_id": ingredient_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return {"message": "Ingredient deleted"}

@inventory_router.post("/ingredients/{ingredient_id}/adjust")
async def adjust_stock(ingredient_id: str, data: dict, user: User = Depends(get_current_user)):
    """Adjust stock quantity (waste, breakage, count correction)"""
    from services.accounting_engine import AccountingEngine
    
    now = datetime.now(timezone.utc)
    adjustment = data.get("adjustment", 0)
    adjustment_qty = data.get("adjustment_qty")  # Absolute quantity
    reason = data.get("reason", "manual")
    adjustment_type = data.get("adjustment_type", "manual")
    
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    # Support both adjustment (delta) and adjustment_qty (absolute)
    if adjustment_qty is not None:
        new_quantity = adjustment_qty
    else:
        new_quantity = ingredient.get("stock_quantity", 0) + adjustment
    
    quantity_diff = new_quantity - ingredient.get("stock_quantity", 0)
    
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id},
        {"$set": {"stock_quantity": new_quantity, "updated_at": now.isoformat()}}
    )
    
    adjustment_id = f"adj_{uuid.uuid4().hex[:8]}"
    
    # Log adjustment
    await db.inventory_adjustments.insert_one({
        "adjustment_id": adjustment_id,
        "company_id": user.company_id,
        "ingredient_id": ingredient_id,
        "adjustment": quantity_diff,
        "adjustment_type": adjustment_type,
        "reason": reason,
        "previous_quantity": ingredient.get("stock_quantity", 0),
        "new_quantity": new_quantity,
        "user_id": user.user_id,
        "created_at": now.isoformat()
    })
    
    # Record in accounting engine if there's a cost impact
    unit_cost = ingredient.get("cost_per_unit", 0) or ingredient.get("unit_cost", 0)
    if quantity_diff != 0 and unit_cost > 0:
        try:
            accounting_engine = AccountingEngine(db, user.company_id, user.user_id)
            await accounting_engine.record_inventory_adjustment({
                "adjustment_id": adjustment_id,
                "item_id": ingredient_id,
                "item_name": ingredient.get("name"),
                "quantity_before": ingredient.get("stock_quantity", 0),
                "quantity_after": new_quantity,
                "quantity_difference": quantity_diff,
                "unit_cost": unit_cost,
                "reason": reason,
                "date": now.isoformat()[:10]
            })
        except Exception as e:
            import logging
            logging.error(f"Failed to record inventory adjustment in accounting: {e}")
    
    return {"new_quantity": new_quantity, "success": True}

@inventory_router.patch("/ingredients/{ingredient_id}")
async def patch_ingredient(ingredient_id: str, data: dict, user: User = Depends(get_current_user)):
    """Partial update of ingredient (for unit_cost, stock_quantity, etc.)"""
    now = datetime.now(timezone.utc)
    
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    # Allowed fields for partial update
    allowed_fields = ["unit_cost", "cost_per_unit", "stock_quantity", "min_stock_level", "par_level", "notes"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields and v is not None}
    
    # Handle unit_cost/cost_per_unit aliasing
    if "unit_cost" in update_data:
        update_data["cost_per_unit"] = update_data.pop("unit_cost")
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    # Log price change
    if "cost_per_unit" in update_data and ingredient.get("cost_per_unit", 0) != update_data["cost_per_unit"]:
        price_history = ingredient.get("price_history", [])
        price_history.append({
            "price": update_data["cost_per_unit"],
            "date": now.isoformat(),
            "previous": ingredient.get("cost_per_unit", 0),
            "source": "period_close_fix"
        })
        update_data["price_history"] = price_history
    
    update_data["updated_at"] = now.isoformat()
    
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    
    updated = await db.ingredients.find_one({"ingredient_id": ingredient_id}, {"_id": 0})
    return updated

@inventory_router.get("/low-stock")
async def get_low_stock(user: User = Depends(get_current_user)):
    """Get ingredients below reorder threshold or par level"""
    ingredients = await db.ingredients.find({
        "company_id": user.company_id,
        "$or": [
            {"$expr": {"$lte": ["$stock_quantity", "$min_stock_level"]}},
            {"$expr": {"$lte": ["$stock_quantity", "$par_level"]}}
        ]
    }, {"_id": 0}).to_list(100)
    return ingredients

@inventory_router.get("/valuation")
async def get_inventory_valuation(user: User = Depends(get_current_user)):
    """Get total inventory valuation"""
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {
            "_id": "$inventory_type",
            "total_value": {"$sum": {"$multiply": ["$stock_quantity", "$cost_per_unit"]}},
            "item_count": {"$sum": 1}
        }}
    ]
    result = await db.ingredients.aggregate(pipeline).to_list(10)
    return {r["_id"]: {"value": r["total_value"], "count": r["item_count"]} for r in result if r["_id"]}

# ============== INVENTORY TRANSACTIONS ==============

@inventory_router.get("/transactions")
async def get_inventory_transactions(
    item_id: Optional[str] = None,
    event_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get inventory transactions with optional filters"""
    query = {"company_id": user.company_id}
    if item_id:
        query["inventory_item_id"] = item_id
    if event_id:
        query["event_id"] = event_id
    if transaction_type:
        query["transaction_type"] = transaction_type
    
    transactions = await db.inventory_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for t in transactions:
        if t.get("created_at") and isinstance(t["created_at"], str):
            t["created_at"] = datetime.fromisoformat(t["created_at"])
    return transactions

@inventory_router.post("/check-reservation-conflicts")
async def check_reservation_conflicts(data: dict, user: User = Depends(get_current_user)):
    """Pre-validate a reservation attempt BEFORE saving.

    Returns per-item conflicts based on **date-overlap** with existing active
    reservations. Two events reserving the same item on the same day/date-range
    surface here as a conflict — even if global stock looks fine — so ops can
    resolve BEFORE hitting `/inventory/reserve`.

    Body:
      {
        "event_id": str,             # target event (source of truth for dates)
        "items": [{inventory_item_id, quantity}]
      }
    """
    event_id = data.get("event_id")
    items = data.get("items", [])
    if not event_id or not items:
        raise HTTPException(status_code=400, detail="event_id and items are required")

    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    def _to_date(v):
        if not v:
            return None
        if isinstance(v, datetime):
            return v.date()
        try:
            return datetime.fromisoformat(str(v)).date()
        except Exception:
            try:
                return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
            except Exception:
                return None

    target_start = _to_date(event.get("event_date"))
    target_end = _to_date(event.get("end_date")) or target_start
    if not target_start:
        # No date on the event → we can't check overlap; fall back to global stock only.
        target_start = target_end = None

    def _overlaps(other_start, other_end) -> bool:
        if target_start is None:
            return False  # cannot compare, treat as non-overlapping
        s = other_start
        e = other_end or s
        if not s:
            return False
        return not (e < target_start or s > target_end)

    item_ids = [i.get("inventory_item_id") for i in items if i.get("inventory_item_id")]
    ing_docs = await db.ingredients.find(
        {"ingredient_id": {"$in": item_ids}, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(len(item_ids))
    ing_map = {d["ingredient_id"]: d for d in ing_docs}

    # Load all active reservations for these items in one shot
    all_res = await db.inventory_reservations.find(
        {
            "company_id": user.company_id,
            "status": "active",
            "inventory_item_id": {"$in": item_ids},
        },
        {"_id": 0}
    ).to_list(2000)

    # Group reservations by (item_id, event_id) — pull each event's dates
    other_event_ids = {ev for r in all_res for ev in (r.get("event_ids") or []) if ev and ev != event_id}
    events_map = {}
    if other_event_ids:
        evs = await db.events.find(
            {"event_id": {"$in": list(other_event_ids)}, "company_id": user.company_id},
            {"_id": 0, "event_id": 1, "event_name": 1, "name": 1, "event_date": 1, "end_date": 1}
        ).to_list(len(other_event_ids))
        events_map = {e["event_id"]: e for e in evs}

    conflicts = []
    for req in items:
        iid = req.get("inventory_item_id")
        qty = float(req.get("quantity") or 0)
        if not iid or qty <= 0:
            continue
        ing = ing_map.get(iid, {})
        stock = float(ing.get("stock_quantity") or 0)

        # Overlapping reservations (from other events)
        overlaps = []
        overlap_reserved = 0.0
        for r in all_res:
            if r["inventory_item_id"] != iid:
                continue
            r_events = r.get("event_ids") or []
            # a reservation may span multiple events — take the widest overlap
            for other_id in r_events:
                if other_id == event_id:
                    continue
                ev = events_map.get(other_id)
                if not ev:
                    continue
                o_start = _to_date(ev.get("event_date"))
                o_end = _to_date(ev.get("end_date")) or o_start
                if _overlaps(o_start, o_end):
                    overlaps.append({
                        "event_id": other_id,
                        "event_name": ev.get("event_name") or ev.get("name") or "",
                        "event_date": ev.get("event_date"),
                        "end_date": ev.get("end_date"),
                        "quantity_reserved": r["quantity_reserved"],
                    })
                    overlap_reserved += float(r["quantity_reserved"])
                    break  # only count each reservation once

        available_on_dates = max(stock - overlap_reserved, 0)
        if qty > available_on_dates:
            conflicts.append({
                "inventory_item_id": iid,
                "name": ing.get("name", ""),
                "requested": qty,
                "stock": stock,
                "overlap_reserved": overlap_reserved,
                "available_on_dates": available_on_dates,
                "overlapping_events": overlaps,
                "unit": ing.get("unit", "unit"),
            })

    return {
        "event_id": event_id,
        "target_start": target_start.isoformat() if target_start else None,
        "target_end": target_end.isoformat() if target_end else None,
        "has_conflicts": len(conflicts) > 0,
        "conflicts": conflicts,
    }


@inventory_router.post("/reserve")
async def reserve_inventory(data: dict, user: User = Depends(get_current_user)):
    """
    Reserve inventory for Stock Requisition (SR).
    This DOES NOT deduct inventory - it only marks quantities as reserved.

    Inventory Math:
    - On Hand (current_stock): Unchanged
    - Reserved (reserved_quantity): Increases
    - Available: On Hand - Reserved (recalculated)

    Only Production can deduct from On Hand.

    **Sprint E hardening — date-scope conflict enforcement**:
    When `event_ids` are provided, we ALSO run a per-event date-overlap check
    against existing active reservations. If the requested qty + the overlap
    would push availability negative on those dates, the item is REJECTED
    (not just warned). Callers wanting the old behavior can pass
    `allow_overbook=true` to force through — used for legacy migrations.
    """
    items = data.get("items", [])
    event_ids = data.get("event_ids", [])
    events_payload = data.get("events", []) or []
    allow_overbook = bool(data.get("allow_overbook", False))

    if not items:
        raise HTTPException(status_code=400, detail="No items to reserve")

    now = datetime.now(timezone.utc)
    reservations = []
    failures = []
    event_names = ", ".join([e.get("event_name", e.get("event_id", "")) for e in events_payload])

    # -------- Load target events for date-scope check --------
    def _to_date(v):
        if not v:
            return None
        if isinstance(v, datetime):
            return v.date()
        try:
            return datetime.fromisoformat(str(v)).date()
        except Exception:
            try:
                return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
            except Exception:
                return None

    target_events = []
    if event_ids and not allow_overbook:
        evs = await db.events.find(
            {"event_id": {"$in": event_ids}, "company_id": user.company_id},
            {"_id": 0, "event_id": 1, "event_name": 1, "name": 1, "event_date": 1, "end_date": 1}
        ).to_list(len(event_ids))
        for e in evs:
            s = _to_date(e.get("event_date"))
            en = _to_date(e.get("end_date")) or s
            if s:
                target_events.append({"event_id": e["event_id"], "start": s, "end": en, "name": e.get("event_name") or e.get("name")})

    for item in items:
        item_id = item.get("inventory_item_id") or item.get("ingredient_id")
        qty_to_reserve = item.get("qty_needed", item.get("quantity", 0))

        if not item_id or qty_to_reserve <= 0:
            continue

        inv_item = await db.ingredients.find_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if not inv_item:
            continue

        current_stock = inv_item.get("stock_quantity", 0)
        current_reserved = inv_item.get("reserved_quantity", 0)
        current_status = inv_item.get("status", "En Almacén")
        available = (current_stock - current_reserved) if current_status == "En Almacén" else 0

        # ---- (1) Global stock guard ----
        if qty_to_reserve > available:
            failures.append({
                "inventory_item_id": item_id,
                "item_name": item.get("name", inv_item.get("name", "")),
                "requested": qty_to_reserve,
                "available": available,
                "reason": f"Only {available} available (status: {current_status})",
                "kind": "stock",
            })
            continue

        # ---- (2) Date-scope conflict guard (Sprint E) ----
        overlapping_reserved_qty = 0
        overlapping_events = []
        if target_events and not allow_overbook:
            other_res = await db.inventory_reservations.find(
                {
                    "company_id": user.company_id,
                    "inventory_item_id": item_id,
                    "status": "active",
                },
                {"_id": 0}
            ).to_list(500)
            # Pull events referenced by those reservations
            ref_event_ids = list({eid for r in other_res for eid in (r.get("event_ids") or []) if eid and eid not in event_ids})
            ref_events_map = {}
            if ref_event_ids:
                revs = await db.events.find(
                    {"event_id": {"$in": ref_event_ids}, "company_id": user.company_id},
                    {"_id": 0, "event_id": 1, "event_name": 1, "name": 1, "event_date": 1, "end_date": 1}
                ).to_list(len(ref_event_ids))
                ref_events_map = {rv["event_id"]: rv for rv in revs}

            for r in other_res:
                for oid in (r.get("event_ids") or []):
                    if oid in event_ids:
                        continue
                    ev = ref_events_map.get(oid)
                    if not ev:
                        continue
                    o_start = _to_date(ev.get("event_date"))
                    o_end = _to_date(ev.get("end_date")) or o_start
                    if not o_start:
                        continue
                    # Overlaps if ANY target event's [start,end] intersects with this reservation
                    if any(not (o_end < te["start"] or o_start > te["end"]) for te in target_events):
                        overlapping_reserved_qty += float(r.get("quantity_reserved", 0))
                        overlapping_events.append({
                            "event_id": oid,
                            "event_name": ev.get("event_name") or ev.get("name") or "",
                            "quantity_reserved": r.get("quantity_reserved", 0),
                        })
                        break

            available_on_dates = max(current_stock - overlapping_reserved_qty, 0)
            if qty_to_reserve > available_on_dates:
                failures.append({
                    "inventory_item_id": item_id,
                    "item_name": item.get("name", inv_item.get("name", "")),
                    "requested": qty_to_reserve,
                    "available": available,
                    "available_on_dates": available_on_dates,
                    "overlap_reserved": overlapping_reserved_qty,
                    "overlapping_events": overlapping_events,
                    "reason": (
                        f"Conflict on event dates — {overlapping_reserved_qty} already reserved by "
                        f"{len(overlapping_events)} overlapping event(s). "
                        f"Only {available_on_dates} free on those dates."
                    ),
                    "kind": "date_conflict",
                })
                continue

        # ---- (3) Commit reservation ----
        new_reserved = current_reserved + qty_to_reserve
        await db.ingredients.update_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"$set": {"reserved_quantity": new_reserved, "updated_at": now.isoformat()}}
        )
        reservation_id = f"res_{uuid.uuid4().hex[:12]}"
        reservation_doc = {
            "reservation_id": reservation_id,
            "company_id": user.company_id,
            "inventory_item_id": item_id,
            "item_name": item.get("name", inv_item.get("name", "")),
            "event_ids": event_ids,
            "event_names": event_names,
            "quantity_reserved": qty_to_reserve,
            "previous_reserved": current_reserved,
            "new_reserved": new_reserved,
            "on_hand": current_stock,
            "available_after": current_stock - new_reserved,
            "status": "active",
            "created_at": now.isoformat(),
            "created_by": user.user_id
        }
        await db.inventory_reservations.insert_one(reservation_doc)
        reservations.append({
            "item_id": item_id,
            "item_name": item.get("name", inv_item.get("name", "")),
            "quantity_reserved": qty_to_reserve,
            "on_hand": current_stock,
            "total_reserved": new_reserved,
            "available": current_stock - new_reserved
        })

    return {
        "message": "Inventory reserved successfully" if not failures else "Inventory partially reserved — some items were rejected",
        "reservations": reservations,
        "failures": failures,
        "event_ids": event_ids,
        "reserved_at": now.isoformat()
    }

@inventory_router.get("/qr/{ingredient_id}")
async def get_ingredient_qr(ingredient_id: str, user: User = Depends(get_current_user)):
    """Sprint J — Return a PNG QR code encoding the inventory item URL.

    The QR encodes: `{deep_link_base}/inventory/{ingredient_id}` so scanning
    with the phone camera opens the item directly. Paste this on the box for
    fast conteo físico.
    """
    ing = await db.ingredients.find_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "ingredient_id": 1}
    )
    if not ing:
        raise HTTPException(status_code=404, detail="Item not found")

    import qrcode
    from fastapi.responses import Response

    base = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://app"
    url = f"{base}/inventory-scan/{ingredient_id}"
    img = qrcode.make(url)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{ingredient_id}.png"'},
    )


@inventory_router.get("/qr-sheet")
async def get_qr_sheet(
    ids: Optional[str] = None,
    inventory_type: Optional[str] = "equipment",
    user: User = Depends(get_current_user),
):
    """Sprint J — Render a printable HTML page with QR codes for a batch of
    inventory items. Users open, print, and stick on their boxes.

    Query params:
      ids: comma-separated ingredient_ids (optional)
      inventory_type: filter when `ids` is missing (default: equipment)
    """
    from fastapi.responses import HTMLResponse
    import qrcode
    import base64

    query: Dict[str, Any] = {"company_id": user.company_id}
    if ids:
        id_list = [x.strip() for x in ids.split(",") if x.strip()]
        query["ingredient_id"] = {"$in": id_list}
    else:
        query["inventory_type"] = inventory_type

    items = await db.ingredients.find(
        query, {"_id": 0, "ingredient_id": 1, "name": 1, "category": 1, "unit": 1}
    ).sort("name", 1).to_list(200)

    base = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://app"

    def _qr_data_uri(url: str) -> str:
        img = qrcode.make(url)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    cards_html = []
    for it in items:
        target = f"{base}/inventory-scan/{it['ingredient_id']}"
        cards_html.append(f"""
        <div class="card">
          <img src="{_qr_data_uri(target)}" alt="QR" />
          <div class="name">{it.get('name', '')}</div>
          <div class="meta">{it.get('category') or ''} · {it.get('unit') or ''}</div>
          <div class="id">{it['ingredient_id']}</div>
        </div>
        """)

    html = f"""<!doctype html>
    <html><head>
      <meta charset="utf-8"/>
      <title>QR Sheet — {len(items)} items</title>
      <style>
        @page {{ size: letter; margin: 0.5in; }}
        body {{ font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; }}
        .header {{ display: flex; justify-content: space-between; margin-bottom: 16px; }}
        .header h1 {{ font-size: 18px; margin: 0; }}
        .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }}
        .card {{ border: 1px dashed #999; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }}
        .card img {{ width: 140px; height: 140px; }}
        .card .name {{ font-weight: 600; font-size: 12px; margin-top: 6px; }}
        .card .meta {{ font-size: 10px; color: #666; }}
        .card .id {{ font-family: monospace; font-size: 9px; color: #999; margin-top: 4px; }}
        .print-btn {{ padding: 6px 12px; }}
        @media print {{ .print-btn {{ display: none; }} }}
      </style>
    </head><body>
      <div class="header">
        <h1>QR Codes — {len(items)} items</h1>
        <button class="print-btn" onclick="window.print()">Print</button>
      </div>
      <div class="grid">
        {"".join(cards_html)}
      </div>
    </body></html>"""
    return HTMLResponse(content=html)


@inventory_router.post("/scan/{ingredient_id}/count")
async def register_qr_scan_count(
    ingredient_id: str,
    data: dict,
    user: User = Depends(get_current_user),
):
    """Sprint J — Record a physical count via QR scan.

    Body: { counted_qty: number, note?: str }
    Writes an entry to `inventory_scan_log` and adjusts the ingredient's stock
    to the counted quantity (like a spot-check adjustment). Non-blocking to
    the monthly asset count.
    """
    ing = await db.ingredients.find_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not ing:
        raise HTTPException(status_code=404, detail="Item not found")

    counted_qty = data.get("counted_qty")
    if counted_qty is None:
        raise HTTPException(status_code=400, detail="counted_qty required")
    counted_qty = float(counted_qty)

    now = datetime.now(timezone.utc)
    previous_stock = float(ing.get("stock_quantity") or 0)
    diff = counted_qty - previous_stock

    await db.inventory_scan_log.insert_one({
        "scan_id": f"scn_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "inventory_item_id": ingredient_id,
        "item_name": ing.get("name"),
        "counted_qty": counted_qty,
        "previous_stock": previous_stock,
        "diff": diff,
        "note": data.get("note") or "",
        "scanned_by": user.user_id,
        "scanned_at": now.isoformat(),
    })
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"$set": {"stock_quantity": counted_qty, "updated_at": now.isoformat()}}
    )
    return {
        "ok": True,
        "previous_stock": previous_stock,
        "counted_qty": counted_qty,
        "diff": diff,
    }


@inventory_router.get("/nav-badges")
async def get_nav_badges(user: User = Depends(get_current_user)):
    """Lightweight aggregation for the Resource Management nav.

    Returns per-group counts so the FE can show passive signals (red/amber
    dots) on each dropdown trigger without fetching each section individually.
    """
    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    horizon_str = (today + timedelta(days=14)).isoformat()

    # Overdue conduces
    overdue_notes = await db.delivery_notes.count_documents({
        "company_id": user.company_id,
        "status": {"$in": ["pending", "partial"]},
        "expected_return_date": {"$lt": today_str, "$ne": None},
    })

    # Over-reserved items
    over_reserved = 0
    async for it in db.ingredients.find(
        {"company_id": user.company_id, "inventory_type": {"$in": ["equipment", "event_supply", "disposable"]}},
        {"_id": 0, "stock_quantity": 1, "reserved_quantity": 1}
    ):
        if float(it.get("reserved_quantity") or 0) > float(it.get("stock_quantity") or 0):
            over_reserved += 1

    # Upcoming events in next 14d
    upcoming_events = await db.events.count_documents({
        "company_id": user.company_id,
        "event_date": {"$gte": today_str, "$lte": horizon_str},
    })

    # Stock pressure — reuse the existing helper's math on a bounded query
    pressure_count = 0
    if upcoming_events > 0:
        # Approximate: use over_reserved as a proxy signal for pressure.
        # (Full calc lives in /upcoming-commitments; nav doesn't need exactness.)
        pressure_count = over_reserved

    # Damaged / missing items not yet billed
    damages_open = await db.damaged_items_log.count_documents({
        "company_id": user.company_id,
        "billed_invoice_id": {"$exists": False},
        "condition": {"$in": ["dañado", "faltante"]},
    })

    # High-priority AI recommendations without a goal yet
    rec_snapshot = await db.smart_recommendations.find_one(
        {"company_id": user.company_id}, {"_id": 0, "recommendations": 1}
    )
    high_recos = 0
    if rec_snapshot:
        for r in rec_snapshot.get("recommendations") or []:
            if r.get("priority") == "high" and not r.get("created_goal_id"):
                high_recos += 1

    return {
        "logistics": {
            "overdue_conduces": overdue_notes,
            "over_reserved": over_reserved,
            "total": overdue_notes + over_reserved,
            "tone": "red" if (overdue_notes + over_reserved) > 0 else None,
        },
        "planning": {
            "upcoming_events": upcoming_events,
            "stock_pressure": pressure_count,
            "total": pressure_count,
            "tone": "red" if pressure_count > 0 else None,
        },
        "insights": {
            "high_recos": high_recos,
            "total": high_recos,
            "tone": "amber" if high_recos > 0 else None,
        },
        "assets": {
            "damages_open": damages_open,
            "total": damages_open,
            "tone": "amber" if damages_open > 0 else None,
        },
    }


@inventory_router.post("/recommendations")
async def get_smart_recommendations(user: User = Depends(get_current_user)):
    """Sprint K — Weekly smart recommendations powered by Emergent LLM.

    Pulls the last 90 days of utilization + next 14 days of commitments +
    over-reserved + rentals due, and asks Claude Sonnet to produce **3-6
    actionable recommendations** with priority and estimated $ impact.

    Returns:
      {
        "generated_at": iso,
        "recommendations": [
          {"title": str, "reason": str, "priority": "high|medium|low",
           "estimated_impact_usd": float, "action_hint": str,
           "related_item_ids": [str, ...]}
        ]
      }
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as _json
    import uuid as _uuid

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    # ---- Gather context from existing endpoints (internal calls) ----
    utilization = await get_utilization_report(days=90, user=user)
    upcoming = await get_upcoming_commitments(days=14, user=user)
    over_reserved = await get_over_reserved_items(user=user)
    pending_rentals = await db.ingredients.find(
        {
            "company_id": user.company_id,
            "origin": "Alquilado",
            "rental_return_status": {"$in": ["pending", "overdue"]},
        },
        {"_id": 0, "name": 1, "rental_cost_per_unit_day": 1, "rental_return_deadline": 1, "stock_quantity": 1}
    ).to_list(50)
    recent_damages = await db.damaged_items_log.find(
        {"company_id": user.company_id},
        {"_id": 0, "item_name": 1, "condition": 1, "total_cost": 1, "reported_at": 1}
    ).sort("reported_at", -1).to_list(20)

    context = {
        "utilization_top_used": utilization.get("top_used", [])[:10],
        "utilization_never_moved": [
            {"name": i["name"], "stock": i["stock"], "cost": i.get("cost_per_unit")}
            for i in utilization.get("never_moved", [])[:10]
        ],
        "always_rented": utilization.get("always_rented", [])[:10],
        "upcoming_events_count": len(upcoming.get("events", [])),
        "stock_pressure": upcoming.get("stock_pressure", [])[:10],
        "over_reserved": over_reserved.get("items", [])[:10],
        "damages_last_20": recent_damages,
        "pending_rentals": pending_rentals[:10],
    }

    system_prompt = (
        "You are an operations advisor for an events / catering company. "
        "You will receive a JSON snapshot of their inventory state and recent activity. "
        "Return 3 to 6 concrete, high-signal recommendations. "
        "Focus on: buy-vs-rent trade-offs, items to sell/retire, capacity risks in the next 14 days, "
        "damages patterns, and cash-flow-relevant actions. "
        "Respond ONLY with a JSON array (no prose, no code fences). "
        "Each recommendation is an object with keys: "
        '"title" (string, ≤80 chars), '
        '"reason" (string, 1-3 sentences explaining the data), '
        '"priority" (one of "high", "medium", "low"), '
        '"estimated_impact_usd" (number, best-effort; use 0 if unknown), '
        '"action_hint" (short imperative, ≤80 chars), '
        '"related_item_ids" (array of inventory_item_id strings referenced, may be empty). '
        "Respond in the same language as the item names in the context. "
        "Do not invent items that are not in the data."
    )

    prompt = (
        "Snapshot of my resource-management state:\n\n"
        + _json.dumps(context, ensure_ascii=False, default=str)
        + "\n\nReturn the JSON array now."
    )

    session_id = f"reco_{_uuid.uuid4().hex[:10]}"
    try:
        llm = LlmChat(api_key=api_key, session_id=session_id, system_message=system_prompt)
        llm = llm.with_model("anthropic", "claude-sonnet-4-6")
        response = await llm.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    # Robust parse: strip possible code fences, find first `[` and matching `]`
    raw = (response or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        # Chop language hint like "json\n..."
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    start = raw.find("[")
    end = raw.rfind("]")
    parsed: list = []
    if start != -1 and end != -1 and end > start:
        try:
            parsed = _json.loads(raw[start:end + 1])
        except Exception:
            parsed = []

    # Sanitize + cap
    def _norm_priority(p):
        p = (p or "").lower()
        return p if p in ("high", "medium", "low") else "medium"

    clean = []
    for r in (parsed or [])[:8]:
        if not isinstance(r, dict):
            continue
        clean.append({
            "title": str(r.get("title", ""))[:200],
            "reason": str(r.get("reason", ""))[:1200],
            "priority": _norm_priority(r.get("priority")),
            "estimated_impact_usd": float(r.get("estimated_impact_usd") or 0),
            "action_hint": str(r.get("action_hint", ""))[:200],
            "related_item_ids": [
                str(x) for x in (r.get("related_item_ids") or []) if x
            ][:10],
        })

    now = datetime.now(timezone.utc)
    doc = {
        "company_id": user.company_id,
        "generated_at": now.isoformat(),
        "generated_by": user.user_id,
        "recommendations": clean,
        "context_snapshot_size": len(_json.dumps(context)),
    }
    # Store last snapshot per company for caching / audit
    await db.smart_recommendations.update_one(
        {"company_id": user.company_id},
        {"$set": doc},
        upsert=True,
    )
    return {"generated_at": doc["generated_at"], "recommendations": clean}


@inventory_router.get("/recommendations")
async def get_cached_recommendations(user: User = Depends(get_current_user)):
    """Return the last cached recommendations without hitting the LLM."""
    doc = await db.smart_recommendations.find_one(
        {"company_id": user.company_id}, {"_id": 0}
    )
    if not doc:
        return {"generated_at": None, "recommendations": []}
    return {"generated_at": doc.get("generated_at"), "recommendations": doc.get("recommendations", [])}


@inventory_router.post("/recommendations/{index}/create-goal")
async def create_goal_from_recommendation(
    index: int,
    data: Optional[dict] = None,
    user: User = Depends(get_current_user),
):
    """Sprint L — Convert a cached recommendation into an Execution Hub goal.

    The goal is created with `context_type=ORGANIZATIONAL` and impact_areas
    inferred from the recommendation's estimated_impact_usd (cost) and priority
    (risk if `high`). Idempotent: refuses if the recommendation was already
    converted (tracked by `created_goal_id` on the cached snapshot).
    """
    from routers.execution_hub import create_execution_goal
    from models.execution_hub import ExecutionGoalCreate, ExecutionContext, ImpactArea
    from fastapi import BackgroundTasks

    doc = await db.smart_recommendations.find_one(
        {"company_id": user.company_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No cached recommendations")
    recs = doc.get("recommendations", [])
    if not (0 <= index < len(recs)):
        raise HTTPException(status_code=404, detail=f"Recommendation index {index} out of range")
    rec = recs[index]
    if rec.get("created_goal_id"):
        raise HTTPException(
            status_code=400,
            detail=f"Ya convertida en meta {rec['created_goal_id']}"
        )

    # Compose the goal
    payload = data or {}
    target_date = payload.get("target_date")  # ISO date str
    if not target_date:
        # Default to 7 days out for high, 14 for medium, 30 for low
        offset = {"high": 7, "medium": 14, "low": 30}.get(rec.get("priority") or "medium", 14)
        target_date = (datetime.now(timezone.utc) + timedelta(days=offset)).date().isoformat()

    impact_areas = [ImpactArea.COST] if (rec.get("estimated_impact_usd") or 0) > 0 else []
    if rec.get("priority") == "high":
        impact_areas.append(ImpactArea.RISK)
    if not impact_areas:
        impact_areas = [ImpactArea.QUALITY]

    goal_input = ExecutionGoalCreate(
        title=rec.get("title", "Recomendación IA")[:200],
        objective=(rec.get("reason", "") + ("\n\nAcción sugerida: " + rec["action_hint"] if rec.get("action_hint") else ""))[:2000],
        context_type=ExecutionContext.ORGANIZATIONAL,
        context_id=None,
        impact_areas=impact_areas,
        visibility="org",
        target_date=datetime.fromisoformat(target_date) if isinstance(target_date, str) else target_date,
    )

    try:
        goal = await create_execution_goal(
            data=goal_input,
            background_tasks=BackgroundTasks(),
            user=user,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Goal creation failed: {e}")

    # Stamp the cached rec so we don't duplicate
    recs[index]["created_goal_id"] = goal.get("goal_id")
    recs[index]["created_goal_at"] = datetime.now(timezone.utc).isoformat()
    await db.smart_recommendations.update_one(
        {"company_id": user.company_id},
        {"$set": {"recommendations": recs}},
    )
    return {
        "goal_id": goal.get("goal_id"),
        "title": goal.get("title"),
        "target_date": goal.get("target_date"),
        "impact_areas": goal.get("impact_areas"),
    }


@inventory_router.get("/utilization-report")
async def get_utilization_report(
    days: int = 90,
    user: User = Depends(get_current_user),
):
    """Sprint I — Which assets are actually pulling their weight.

    Aggregates over the last N days:
      - `top_used`         : equipment items with the highest total qty across delivery notes
      - `never_moved`      : items with 0 delivery notes in the window (owned only)
      - `always_rented`    : items with `origin=Alquilado` that have been out >= 3 times
                            (candidate for purchase)
    """
    since = datetime.now(timezone.utc) - timedelta(days=int(days))
    since_iso = since.isoformat()

    # Pull equipment items
    items = await db.ingredients.find(
        {
            "company_id": user.company_id,
            "inventory_type": {"$in": ["equipment", "event_supply"]},
        },
        {"_id": 0}
    ).to_list(3000)
    items_by_id = {i["ingredient_id"]: i for i in items}

    # Pull delivery notes in the window
    notes = await db.delivery_notes.find(
        {"company_id": user.company_id, "created_at": {"$gte": since_iso}},
        {"_id": 0, "items": 1, "note_id": 1, "created_at": 1}
    ).to_list(2000)

    usage: Dict[str, dict] = {}
    for n in notes:
        for it in (n.get("items") or []):
            iid = it.get("inventory_item_id")
            if not iid:
                continue
            entry = usage.setdefault(iid, {"times_used": 0, "total_qty": 0.0, "last_used_at": None})
            entry["times_used"] += 1
            entry["total_qty"] += float(it.get("qty_out") or 0)
            ca = n.get("created_at")
            if ca and (not entry["last_used_at"] or ca > entry["last_used_at"]):
                entry["last_used_at"] = ca

    top_used = []
    never_moved = []
    always_rented = []
    for iid, ing in items_by_id.items():
        u = usage.get(iid, {"times_used": 0, "total_qty": 0.0, "last_used_at": None})
        row = {
            "inventory_item_id": iid,
            "name": ing.get("name"),
            "origin": ing.get("origin", "Propio"),
            "stock": ing.get("stock_quantity", 0),
            "cost_per_unit": ing.get("cost_per_unit", 0),
            "rental_cost_per_unit_day": ing.get("rental_cost_per_unit_day", 0),
            "times_used": u["times_used"],
            "total_qty": u["total_qty"],
            "last_used_at": u["last_used_at"],
        }
        if u["times_used"] > 0:
            top_used.append(row)
        else:
            # No usage at all
            never_moved.append(row)
        if row["origin"] == "Alquilado" and u["times_used"] >= 3:
            always_rented.append(row)

    top_used.sort(key=lambda r: -r["total_qty"])
    always_rented.sort(key=lambda r: -r["times_used"])
    return {
        "window_days": days,
        "since": since_iso[:10],
        "top_used": top_used[:20],
        "never_moved": never_moved[:50],
        "always_rented": always_rented[:20],
        "total_items_analyzed": len(items),
    }


@inventory_router.get("/upcoming-commitments")
async def get_upcoming_commitments(
    days: int = 14,
    user: User = Depends(get_current_user),
):
    """Sprint H — Timeline view: which events in the next N days are pulling
    inventory, and where stock is at risk.

    Returns:
      - `events`: list of upcoming events with their reserved items and totals
      - `stock_pressure`: items where current stock < sum of upcoming demand
    """
    from math import ceil as _ceil  # local alias
    _ = _ceil  # silence unused if we don't use

    today = datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=int(days))
    today_str = today.isoformat()
    horizon_str = horizon.isoformat()

    events = await db.events.find(
        {
            "company_id": user.company_id,
            "event_date": {"$gte": today_str, "$lte": horizon_str},
        },
        {"_id": 0}
    ).sort("event_date", 1).to_list(500)

    if not events:
        return {"horizon_days": days, "events": [], "stock_pressure": []}

    event_ids = [e["event_id"] for e in events]
    reservations = await db.inventory_reservations.find(
        {
            "company_id": user.company_id,
            "status": "active",
            "event_ids": {"$in": event_ids},
        },
        {"_id": 0}
    ).to_list(2000)

    # Group reservations per event and per inventory item
    per_event: Dict[str, list] = {eid: [] for eid in event_ids}
    per_item_total: Dict[str, float] = {}
    for r in reservations:
        for eid in (r.get("event_ids") or []):
            if eid in per_event:
                per_event[eid].append(r)
        iid = r.get("inventory_item_id")
        if iid:
            per_item_total[iid] = per_item_total.get(iid, 0) + float(r.get("quantity_reserved") or 0)

    # Load ingredients for stock pressure
    ing_docs = {}
    if per_item_total:
        docs = await db.ingredients.find(
            {"ingredient_id": {"$in": list(per_item_total.keys())}, "company_id": user.company_id},
            {"_id": 0}
        ).to_list(len(per_item_total))
        ing_docs = {d["ingredient_id"]: d for d in docs}

    # Build event payloads
    out_events = []
    for e in events:
        eid = e["event_id"]
        res_for_event = per_event.get(eid, [])
        items_lite = [{
            "inventory_item_id": r["inventory_item_id"],
            "name": r.get("item_name"),
            "qty": r.get("quantity_reserved"),
        } for r in res_for_event]
        out_events.append({
            "event_id": eid,
            "event_name": e.get("event_name") or e.get("name"),
            "event_date": e.get("event_date"),
            "end_date": e.get("end_date"),
            "guest_count": e.get("guest_count") or e.get("expected_guests") or 0,
            "status": e.get("status"),
            "reserved_items_count": len(items_lite),
            "reserved_items": items_lite[:20],
        })

    # Stock pressure: items whose total upcoming demand > current stock
    pressure = []
    for iid, demand in per_item_total.items():
        ing = ing_docs.get(iid)
        if not ing:
            continue
        stock = float(ing.get("stock_quantity") or 0)
        if demand > stock:
            pressure.append({
                "inventory_item_id": iid,
                "name": ing.get("name"),
                "unit": ing.get("unit"),
                "stock": stock,
                "upcoming_demand": demand,
                "shortfall": demand - stock,
                "origin": ing.get("origin", "Propio"),
            })
    pressure.sort(key=lambda p: -p["shortfall"])

    return {
        "horizon_days": days,
        "from": today.isoformat(),
        "to": horizon.isoformat(),
        "events": out_events,
        "stock_pressure": pressure,
    }


@inventory_router.get("/over-reserved")
async def get_over_reserved_items(user: User = Depends(get_current_user)):
    """List items that are currently over-reserved.

    Two flavors of "over-reserved":
      - **global**: `reserved_quantity > stock_quantity` (would surface as
        negative Available in the FE table — this is the "-1 unit" the user saw).
      - **date_conflict**: at least two active reservations on overlapping
        event dates whose combined qty > stock. Global availability may look
        fine, but they collide on the calendar.

    Feeds the "Sobre-reservado" chip on `PendingReturnsPanel`.
    """
    items = await db.ingredients.find(
        {"company_id": user.company_id, "inventory_type": {"$in": ["equipment", "event_supply", "disposable"]}},
        {"_id": 0}
    ).to_list(2000)

    global_offenders = []
    for it in items:
        stock = float(it.get("stock_quantity") or 0)
        reserved = float(it.get("reserved_quantity") or 0)
        if reserved > stock and stock >= 0:
            global_offenders.append({
                "inventory_item_id": it.get("ingredient_id"),
                "name": it.get("name"),
                "stock": stock,
                "reserved": reserved,
                "shortfall": reserved - stock,
                "unit": it.get("unit", "unit"),
            })

    # Enrich with which events are pulling them
    if global_offenders:
        ids = [o["inventory_item_id"] for o in global_offenders]
        res_docs = await db.inventory_reservations.find(
            {"company_id": user.company_id, "status": "active", "inventory_item_id": {"$in": ids}},
            {"_id": 0}
        ).to_list(2000)
        by_item: Dict[str, list] = {}
        event_ids_set: set = set()
        for r in res_docs:
            by_item.setdefault(r["inventory_item_id"], []).append(r)
            for eid in (r.get("event_ids") or []):
                event_ids_set.add(eid)
        events_map = {}
        if event_ids_set:
            evs = await db.events.find(
                {"event_id": {"$in": list(event_ids_set)}, "company_id": user.company_id},
                {"_id": 0, "event_id": 1, "event_name": 1, "name": 1, "event_date": 1}
            ).to_list(len(event_ids_set))
            events_map = {e["event_id"]: e for e in evs}
        for o in global_offenders:
            evs_touching = []
            for r in by_item.get(o["inventory_item_id"], []):
                for eid in (r.get("event_ids") or []):
                    ev = events_map.get(eid)
                    if ev:
                        evs_touching.append({
                            "event_id": eid,
                            "event_name": ev.get("event_name") or ev.get("name") or "",
                            "event_date": ev.get("event_date"),
                            "quantity_reserved": r.get("quantity_reserved", 0),
                        })
            o["reservations"] = evs_touching

    return {
        "count": len(global_offenders),
        "total_shortfall": sum(o["shortfall"] for o in global_offenders),
        "items": global_offenders,
    }


@inventory_router.post("/release-reservation")
async def release_inventory_reservation(data: dict, user: User = Depends(get_current_user)):
    """
    Release reserved inventory (cancel reservation).
    Use when an event is cancelled or SR is voided.
    """
    reservation_ids = data.get("reservation_ids", [])
    item_ids = data.get("item_ids", [])
    event_ids = data.get("event_ids", [])
    
    now = datetime.now(timezone.utc)
    released = []
    
    # Find reservations to release
    query = {"company_id": user.company_id, "status": "active"}
    if reservation_ids:
        query["reservation_id"] = {"$in": reservation_ids}
    elif event_ids:
        query["event_ids"] = {"$in": event_ids}
    elif item_ids:
        query["inventory_item_id"] = {"$in": item_ids}
    else:
        raise HTTPException(status_code=400, detail="No reservations specified")
    
    reservations = await db.inventory_reservations.find(query, {"_id": 0}).to_list(500)
    
    for res in reservations:
        item_id = res.get("inventory_item_id")
        qty_to_release = res.get("quantity_reserved", 0)
        
        # Update inventory reserved quantity
        await db.ingredients.update_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"$inc": {"reserved_quantity": -qty_to_release}}
        )
        
        # Mark reservation as released
        await db.inventory_reservations.update_one(
            {"reservation_id": res["reservation_id"]},
            {"$set": {"status": "released", "released_at": now.isoformat()}}
        )
        
        released.append(res["reservation_id"])
    
    return {"message": f"Released {len(released)} reservations", "released_ids": released}

@inventory_router.get("/reservations")
async def get_inventory_reservations(
    event_id: Optional[str] = None,
    item_id: Optional[str] = None,
    status: Optional[str] = "active",
    user: User = Depends(get_current_user)
):
    """Get inventory reservations"""
    query = {"company_id": user.company_id}
    if event_id:
        query["event_ids"] = event_id
    if item_id:
        query["inventory_item_id"] = item_id
    if status:
        query["status"] = status
    
    reservations = await db.inventory_reservations.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return reservations

@inventory_router.post("/transactions")
async def create_inventory_transaction(data: InventoryTransactionCreate, user: User = Depends(get_current_user)):
    """Create an inventory transaction and update stock"""
    now = datetime.now(timezone.utc)
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
    
    # Get the inventory item
    item = await db.ingredients.find_one(
        {"ingredient_id": data.inventory_item_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Calculate stock change based on transaction type
    current_stock = item.get("stock_quantity", 0)
    if data.transaction_type == "Purchase":
        new_stock = current_stock + data.quantity
    elif data.transaction_type in ["Usage", "Waste"]:
        new_stock = max(0, current_stock - data.quantity)
    elif data.transaction_type == "Adjustment":
        new_stock = data.quantity  # Adjustment sets absolute value
    else:
        new_stock = current_stock
    
    # Update inventory stock
    await db.ingredients.update_one(
        {"ingredient_id": data.inventory_item_id, "company_id": user.company_id},
        {"$set": {"stock_quantity": new_stock, "updated_at": now.isoformat()}}
    )
    
    # Create transaction record
    transaction_doc = {
        "transaction_id": transaction_id,
        "company_id": user.company_id,
        "inventory_item_id": data.inventory_item_id,
        "event_id": data.event_id,
        "transaction_type": data.transaction_type,
        "quantity": data.quantity,
        "unit_cost": data.unit_cost or item.get("cost_per_unit", 0),
        "previous_stock": current_stock,
        "new_stock": new_stock,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    await db.inventory_transactions.insert_one(transaction_doc)
    del transaction_doc["_id"]
    transaction_doc["created_at"] = now
    
    return transaction_doc


@inventory_router.post("/ingredients/ai-repair")
async def ai_repair_ingredients(data: dict, user: User = Depends(get_current_user)):
    """AI-assisted repair for ingredient structural fields.
    
    Analyzes each target ingredient and proposes correct:
      - base_unit (g, ml, unit)
      - purchase_unit (kg, lb, saco, botella, galón, unit, etc.)
      - purchase_quantity_per_unit (base-units per purchase-unit)
      - yield_waste_percent (typical trim/loss for that ingredient)
      - density_g_per_ml (if liquid AND cross-family conversions needed)
    
    Does NOT modify prices or supplier info.
    
    Body: {
      ingredient_ids?: [str],   # Explicit list. If missing, picks needs_review or misconfigured.
      dry_run?: bool = true,    # If true, returns proposals only
      limit?: int = 25          # Cap batch size
    }
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as _json
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    dry_run = data.get("dry_run", True)
    limit = min(int(data.get("limit") or 25), 100)  # hard cap
    ingredient_ids = data.get("ingredient_ids") or []
    
    # Fetch candidates
    query = {"company_id": user.company_id}
    if ingredient_ids:
        query["ingredient_id"] = {"$in": ingredient_ids}
    else:
        # Auto-pick: missing purchase_unit OR purchase_qty_per_unit=1 (default suspicious) OR needs_review
        query["$or"] = [
            {"purchase_unit": {"$in": [None, ""]}},
            {"purchase_quantity_per_unit": {"$in": [None, 0, 1]}},
            {"needs_review": True},
        ]
    
    candidates = await db.ingredients.find(query, {"_id": 0}).limit(limit).to_list(limit)
    if not candidates:
        return {"total": 0, "proposals": [], "applied": 0, "dry_run": dry_run}
    
    # Batch prompt: send all ingredient names at once for efficiency
    batch_data = [
        {
            "ingredient_id": c["ingredient_id"],
            "name": c.get("name") or "",
            "brand": c.get("brand") or "",
            "category": c.get("category") or "",
            "current_base_unit": c.get("base_unit") or c.get("unit") or "",
            "current_purchase_unit": c.get("purchase_unit") or "",
            "current_purchase_qty": c.get("purchase_quantity_per_unit"),
        }
        for c in candidates
    ]
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"ingr_repair_{uuid.uuid4().hex[:8]}",
        system_message=(
            "You are a professional chef and culinary inventory expert. "
            "Given a list of raw kitchen ingredients, suggest the CORRECT base_unit, "
            "purchase_unit, purchase_quantity_per_unit (how many base-units per purchase-unit), "
            "and yield_waste_percent (typical trim/loss %). "
            "Rules: "
            "1) Solid foods → base_unit 'g'. Liquids → 'ml'. Count items (eggs, fruits, sold per piece) → 'unit'. "
            "2) purchase_unit is how it's SOLD: kg, lb, saco (25 lb/50 lb), botella, galón, litro, funda, caja, unidad, etc. "
            "3) purchase_quantity_per_unit = base units contained in ONE purchase unit. "
            "   Examples: 1 kg = 1000 g. 1 lb = 453.592 g. 1 saco 25 lb = 11340 g. 1 L = 1000 ml. 1 gal = 3785 ml. 1 doz = 12 unit. "
            "4) yield_waste_percent: onions/carrots ~15%, tomatoes ~5%, whole chicken ~30%, whole fish ~40%, boneless meat 0-5%, dry goods 0%. "
            "5) density_g_per_ml only if liquid AND needs cross-family conversion (oil ~0.92, water 1.0, honey 1.42). "
            "Respond ONLY with valid JSON as an array."
        )
    ).with_model("openai", "gpt-5.2")
    
    prompt = (
        "Analyze each ingredient and return an array of proposals in this JSON format:\n"
        '[{"ingredient_id": "...", "base_unit": "g|ml|unit", "purchase_unit": "...", '
        '"purchase_quantity_per_unit": number, "yield_waste_percent": number, '
        '"density_g_per_ml": number|null, "reasoning": "short explanation"}, ...]\n\n'
        f"Ingredients:\n{_json.dumps(batch_data, ensure_ascii=False)}"
    )
    
    try:
        response = await chat.send_message(UserMessage(text=prompt))
        txt = response.strip()
        if txt.startswith("```json"):
            txt = txt[7:]
        if txt.startswith("```"):
            txt = txt[3:]
        if txt.endswith("```"):
            txt = txt[:-3]
        proposals = _json.loads(txt.strip())
        if not isinstance(proposals, list):
            proposals = proposals.get("ingredients", []) if isinstance(proposals, dict) else []
    except Exception as e:
        logger.error(f"AI repair parse error: {e}")
        raise HTTPException(status_code=500, detail=f"AI parse failed: {str(e)[:150]}")
    
    # Merge current ingredient info into each proposal for the UI
    by_id = {c["ingredient_id"]: c for c in candidates}
    enriched = []
    for p in proposals:
        iid = p.get("ingredient_id")
        current = by_id.get(iid, {})
        if not iid or not current:
            continue
        enriched.append({
            **p,
            "current_name": current.get("name"),
            "current_base_unit": current.get("base_unit") or current.get("unit"),
            "current_purchase_unit": current.get("purchase_unit"),
            "current_purchase_qty": current.get("purchase_quantity_per_unit"),
            "current_yield_waste_percent": current.get("yield_waste_percent"),
            # Rebase cost_per_base_unit if base_unit changes, keeping purchase_cost intact.
            "new_cost_per_base_unit_estimate": (
                round(float(current.get("purchase_cost") or 0) / max(1, float(p.get("purchase_quantity_per_unit") or 1)), 4)
                if p.get("purchase_quantity_per_unit") else None
            ),
        })
    
    applied_count = 0
    now = datetime.now(timezone.utc)
    if not dry_run:
        for p in enriched:
            iid = p["ingredient_id"]
            current = by_id.get(iid, {})
            new_base = p.get("base_unit") or current.get("base_unit")
            new_purch = p.get("purchase_unit") or current.get("purchase_unit")
            new_qty = float(p.get("purchase_quantity_per_unit") or current.get("purchase_quantity_per_unit") or 1)
            new_waste = p.get("yield_waste_percent")
            new_density = p.get("density_g_per_ml")
            new_cpb = (
                round(float(current.get("purchase_cost") or 0) / new_qty, 4)
                if current.get("purchase_cost") and new_qty > 0
                else current.get("cost_per_base_unit") or current.get("cost_per_unit")
            )
            update = {
                "base_unit": new_base,
                "unit": new_base,  # keep in sync
                "purchase_unit": new_purch,
                "purchase_quantity_per_unit": new_qty,
                "cost_per_base_unit": new_cpb,
                "cost_per_unit": new_cpb,
                "updated_at": now.isoformat(),
                "needs_review": False,
                "ai_repaired_at": now.isoformat(),
                "ai_repair_reasoning": p.get("reasoning"),
            }
            if new_waste is not None:
                update["yield_waste_percent"] = float(new_waste)
            if new_density is not None:
                update["density_g_per_ml"] = float(new_density)
            
            await db.ingredients.update_one(
                {"ingredient_id": iid, "company_id": user.company_id},
                {"$set": update}
            )
            # Audit
            await db.ai_repair_history.insert_one({
                "history_id": f"repair_{uuid.uuid4().hex[:10]}",
                "company_id": user.company_id,
                "ingredient_id": iid,
                "ingredient_name": current.get("name"),
                "before": {
                    "base_unit": current.get("base_unit"),
                    "purchase_unit": current.get("purchase_unit"),
                    "purchase_quantity_per_unit": current.get("purchase_quantity_per_unit"),
                    "yield_waste_percent": current.get("yield_waste_percent"),
                    "cost_per_base_unit": current.get("cost_per_base_unit"),
                },
                "after": {k: v for k, v in update.items() if k not in ("updated_at", "ai_repaired_at")},
                "reasoning": p.get("reasoning"),
                "user_id": user.user_id,
                "created_at": now.isoformat(),
            })
            applied_count += 1
    
    return {
        "total": len(candidates),
        "proposals": enriched,
        "applied": applied_count,
        "dry_run": dry_run,
    }


@inventory_router.post("/ingredients/ai-repair/undo/{history_id}")
async def undo_ai_repair(history_id: str, user: User = Depends(get_current_user)):
    """Roll back a single AI-repair change using its history entry."""
    record = await db.ai_repair_history.find_one(
        {"history_id": history_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Repair record not found")
    before = record.get("before", {})
    await db.ingredients.update_one(
        {"ingredient_id": record["ingredient_id"], "company_id": user.company_id},
        {"$set": {**before, "ai_reverted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "restored": before}
# ============== INVENTORY EXTENDED FIELDS ROUTES ==============

@inventory_router.put("/ingredients/{item_id}/extended")
async def update_inventory_extended(item_id: str, data: InventoryItemExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended inventory item fields (2nd supplier, purchase details)"""
    update_data = {}
    if data.secondary_supplier_id is not None:
        update_data["secondary_supplier_id"] = data.secondary_supplier_id
    if data.purchase_unit is not None:
        update_data["purchase_unit"] = data.purchase_unit
    if data.purchase_pack_size is not None:
        update_data["purchase_pack_size"] = data.purchase_pack_size
    if data.min_order_qty is not None:
        update_data["min_order_qty"] = data.min_order_qty
    if data.lead_time_days is not None:
        update_data["lead_time_days"] = data.lead_time_days
    
    if not update_data:
        return {"message": "No updates provided"}
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.ingredients.update_one(
        {"ingredient_id": item_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return {"message": "Updated"}

# ============== INVENTORY PRICE HISTORY ROUTES ==============

@inventory_router.get("/ingredients/{item_id}/price-history")
async def get_inventory_price_history(item_id: str, user: User = Depends(get_current_user)):
    """Get price history for an inventory item"""
    history = await db.inventory_price_history.find(
        {"inventory_item_id": item_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("effective_date", -1).to_list(100)
    return history

@inventory_router.post("/ingredients/{item_id}/price-history")
async def add_inventory_price_history(item_id: str, data: InventoryPriceHistoryCreate, user: User = Depends(get_current_user)):
    """Add a price history entry for an inventory item"""
    # Get supplier name if provided
    supplier_name = None
    if data.supplier_id:
        supplier = await db.suppliers.find_one(
            {"supplier_id": data.supplier_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        supplier_name = supplier.get("name") if supplier else None
    
    now = datetime.now(timezone.utc)
    history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
    
    history_entry = {
        "history_id": history_id,
        "inventory_item_id": item_id,
        "company_id": user.company_id,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier_name,
        "effective_date": now.isoformat(),
        "unit_cost": data.unit_cost,
        "purchase_unit": data.purchase_unit,
        "source": data.source,
        "notes": data.notes
    }
    await db.inventory_price_history.insert_one(history_entry)
    del history_entry["_id"]
    
    # Update item's current cost
    await db.ingredients.update_one(
        {"ingredient_id": item_id, "company_id": user.company_id},
        {"$set": {"cost_per_unit": data.unit_cost, "updated_at": now.isoformat()}}
    )
    
    return history_entry

# ============== BULK UPLOAD BY SUPPLIER ==============

class BulkProductUpload(BaseModel):
    supplier_id: str
    products: List[dict]  # [{name, category, inventory_type, unit, cost_per_unit, stock_quantity}]

@inventory_router.post("/bulk-upload-by-supplier")
async def bulk_upload_products_by_supplier(data: BulkProductUpload, user: User = Depends(get_current_user)):
    """
    Upload multiple products for a specific supplier.
    Creates new items or updates existing ones (matched by name + supplier).
    Also records price history for each item.
    """
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    now = datetime.now(timezone.utc)
    created = 0
    updated = 0
    price_changes = 0
    
    for product in data.products:
        name = product.get("name", "").strip()
        if not name:
            continue
        
        # Check if item exists with this name and supplier
        existing = await db.ingredients.find_one(
            {
                "company_id": user.company_id,
                "name": {"$regex": f"^{name}$", "$options": "i"},
                "preferred_supplier_id": data.supplier_id
            },
            {"_id": 0}
        )
        
        new_cost = float(product.get("cost_per_unit", 0) or 0)
        
        if existing:
            # Update existing item
            old_cost = existing.get("cost_per_unit", 0)
            
            update_data = {
                "category": product.get("category") or existing.get("category"),
                "inventory_type": product.get("inventory_type") or existing.get("inventory_type"),
                "unit": product.get("unit") or existing.get("unit"),
                "cost_per_unit": new_cost,
                "updated_at": now.isoformat()
            }
            
            # Add stock if provided
            if product.get("stock_quantity"):
                update_data["stock_quantity"] = existing.get("stock_quantity", 0) + float(product.get("stock_quantity", 0))
            
            await db.ingredients.update_one(
                {"ingredient_id": existing["ingredient_id"]},
                {"$set": update_data}
            )
            
            # Record price change if different
            if new_cost > 0 and abs(new_cost - old_cost) > 0.001:
                history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
                await db.inventory_price_history.insert_one({
                    "history_id": history_id,
                    "inventory_item_id": existing["ingredient_id"],
                    "company_id": user.company_id,
                    "supplier_id": data.supplier_id,
                    "supplier_name": supplier.get("name"),
                    "old_price": old_cost,
                    "new_price": new_cost,
                    "effective_date": now.isoformat(),
                    "source": "bulk_upload",
                    "notes": f"Updated from supplier upload"
                })
                price_changes += 1
            
            updated += 1
        else:
            # Create new item
            ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"
            new_item = {
                "ingredient_id": ingredient_id,
                "company_id": user.company_id,
                "name": name,
                "category": product.get("category", "other"),
                "inventory_type": product.get("inventory_type", "food"),
                "unit": product.get("unit", "unit"),
                "cost_per_unit": new_cost,
                "stock_quantity": float(product.get("stock_quantity", 0) or 0),
                "reserved_quantity": 0,
                "par_level": float(product.get("par_level", 0) or 0),
                "min_stock_level": float(product.get("par_level", 0) or 0),
                "pack_size": float(product.get("pack_size", 1) or 1),
                "preferred_supplier_id": data.supplier_id,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            await db.ingredients.insert_one(new_item)
            
            # Record initial price
            if new_cost > 0:
                history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
                await db.inventory_price_history.insert_one({
                    "history_id": history_id,
                    "inventory_item_id": ingredient_id,
                    "company_id": user.company_id,
                    "supplier_id": data.supplier_id,
                    "supplier_name": supplier.get("name"),
                    "old_price": 0,
                    "new_price": new_cost,
                    "effective_date": now.isoformat(),
                    "source": "bulk_upload",
                    "notes": f"Initial price from supplier upload"
                })
            
            created += 1
    
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "price_changes": price_changes,
        "supplier_name": supplier.get("name")
    }

# Endpoint to update price from invoice
class InvoicePriceUpdate(BaseModel):
    supplier_id: str
    items: List[dict]  # [{inventory_item_id or name, new_price, quantity_received}]
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None

@inventory_router.post("/update-prices-from-invoice")
async def update_prices_from_invoice(data: InvoicePriceUpdate, user: User = Depends(get_current_user)):
    """
    Update inventory prices based on a received invoice.
    Records price history for audit trail.
    """
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    now = datetime.now(timezone.utc)
    updated = 0
    price_changes = []
    
    for item in data.items:
        item_id = item.get("inventory_item_id")
        item_name = item.get("name")
        new_price = float(item.get("new_price", 0) or 0)
        
        if not new_price:
            continue
        
        # Find item by ID or name
        query = {"company_id": user.company_id}
        if item_id:
            query["ingredient_id"] = item_id
        elif item_name:
            query["name"] = {"$regex": f"^{item_name}$", "$options": "i"}
        else:
            continue
        
        existing = await db.ingredients.find_one(query, {"_id": 0})
        if not existing:
            continue
        
        old_price = existing.get("cost_per_unit", 0)
        
        # Update price
        await db.ingredients.update_one(
            {"ingredient_id": existing["ingredient_id"]},
            {"$set": {
                "cost_per_unit": new_price,
                "updated_at": now.isoformat()
            }}
        )
        
        # Record price history
        history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
        history_entry = {
            "history_id": history_id,
            "inventory_item_id": existing["ingredient_id"],
            "company_id": user.company_id,
            "supplier_id": data.supplier_id,
            "supplier_name": supplier.get("name"),
            "old_price": old_price,
            "new_price": new_price,
            "effective_date": now.isoformat(),
            "source": "invoice",
            "invoice_number": data.invoice_number,
            "invoice_date": data.invoice_date,
            "notes": f"Price updated from invoice {data.invoice_number or ''}"
        }
        await db.inventory_price_history.insert_one(history_entry)
        
        change_pct = ((new_price - old_price) / old_price * 100) if old_price > 0 else 0
        price_changes.append({
            "item_name": existing["name"],
            "old_price": old_price,
            "new_price": new_price,
            "change_percent": round(change_pct, 1)
        })
        
        updated += 1
    
    return {
        "success": True,
        "updated": updated,
        "price_changes": price_changes,
        "supplier_name": supplier.get("name"),
        "invoice_number": data.invoice_number
    }

# ============== INVENTORY VALUE BY TYPE ==============

@inventory_router.get("/value-summary")
async def get_inventory_value_summary(user: User = Depends(get_current_user)):
    """Get inventory value breakdown by type"""
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {
            "_id": "$inventory_type",
            "total_value": {"$sum": {"$multiply": ["$stock_quantity", "$cost_per_unit"]}},
            "item_count": {"$sum": 1}
        }},
        {"$sort": {"total_value": -1}}
    ]
    results = await db.ingredients.aggregate(pipeline).to_list(20)
    
    summary = {
        "by_type": {r["_id"]: {"value": round(r["total_value"], 2), "count": r["item_count"]} for r in results},
        "total_value": round(sum(r["total_value"] for r in results), 2)
    }
    return summary

# ============== BULK IMPORT FROM FILE ==============

@inventory_router.post("/validate-import-file")
async def validate_import_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """
    Validate an import file and return preview with validation status per row.
    Does NOT import - just validates and returns preview data.
    """
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")
    
    try:
        contents = await file.read()
        
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        # Clean column names
        df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_')
        
        # Column mapping
        column_mapping = {
            'nombre': 'name', 'producto': 'name', 'product': 'name', 'item': 'name',
            'marca': 'brand',
            'categoria': 'category', 'categoría': 'category',
            'unidad': 'unit',
            'precio': 'cost_per_unit', 'costo': 'cost_per_unit', 'cost': 'cost_per_unit',
            'price': 'cost_per_unit', 'costo_unitario': 'cost_per_unit',
            'cantidad': 'stock_quantity', 'stock': 'stock_quantity', 'quantity': 'stock_quantity',
            'existencia': 'stock_quantity',
            'minimo': 'par_level', 'min_stock': 'par_level', 'par': 'par_level',
            'codigo': 'sku', 'code': 'sku',
            'notas': 'notes',
            'tipo': 'inventory_type', 'type': 'inventory_type'
        }
        df.rename(columns=column_mapping, inplace=True)
        
        if 'name' not in df.columns:
            return {
                "valid": False,
                "error": "File must have a 'name' or 'nombre' column",
                "columns_found": list(df.columns),
                "rows": []
            }
        
        # Get valid categories
        valid_categories = await db.organization_settings.find_one(
            {"company_id": user.company_id}, {"inventory_categories": 1}
        )
        valid_category_keys = []
        if valid_categories and valid_categories.get("inventory_categories"):
            valid_category_keys = [c.get("key") for c in valid_categories["inventory_categories"]]
        if not valid_category_keys:
            valid_category_keys = ["proteins", "dairy", "produce", "dry_goods", "beverages", 
                                   "spices", "frozen", "canned", "packaging", "cleaning", "other"]
        
        # Category mapping for Spanish
        category_map = {
            'proteinas': 'proteins', 'proteínas': 'proteins', 'carnes': 'proteins',
            'lácteos': 'dairy', 'lacteos': 'dairy',
            'frutas': 'produce', 'verduras': 'produce', 'vegetales': 'produce',
            'secos': 'dry_goods', 'granos': 'dry_goods',
            'bebidas': 'beverages', 'especias': 'spices', 'condimentos': 'spices',
            'congelados': 'frozen', 'enlatados': 'canned',
            'empaque': 'packaging', 'empaques': 'packaging',
            'limpieza': 'cleaning', 'otros': 'other'
        }
        
        # Valid units
        valid_units = ['kg', 'g', 'lb', 'oz', 'l', 'ml', 'unit', 'pcs', 'ea', 'box', 'case', 'bag']
        unit_map = {
            'kilogramo': 'kg', 'kilogramos': 'kg', 'kilos': 'kg',
            'gramo': 'g', 'gramos': 'g', 'libra': 'lb', 'libras': 'lb',
            'onza': 'oz', 'onzas': 'oz', 'litro': 'l', 'litros': 'l',
            'mililitro': 'ml', 'mililitros': 'ml',
            'unidad': 'unit', 'unidades': 'unit', 'pza': 'unit', 'pieza': 'unit'
        }
        
        # Get existing items for duplicate check
        existing_items = await db.ingredients.find(
            {"company_id": user.company_id},
            {"name": 1, "_id": 0}
        ).to_list(10000)
        existing_names = {item["name"].lower() for item in existing_items}
        
        # Validate each row
        rows = []
        total_valid = 0
        total_warnings = 0
        total_errors = 0
        
        for idx, row in df.iterrows():
            row_data = {
                "row_number": idx + 2,  # +2 because header is row 1 and pandas is 0-indexed
                "status": "valid",
                "errors": [],
                "warnings": [],
                "data": {}
            }
            
            # Check name
            name = str(row.get('name', '')).strip() if pd.notna(row.get('name')) else ''
            row_data["data"]["name"] = name
            
            if not name:
                row_data["status"] = "error"
                row_data["errors"].append("Name is required")
            elif name.lower() in existing_names:
                row_data["warnings"].append("Product already exists (will be skipped unless 'update existing' is checked)")
            
            # Check brand
            brand = str(row.get('brand', '')).strip() if pd.notna(row.get('brand')) else ''
            row_data["data"]["brand"] = brand
            
            # Check category
            category = str(row.get('category', '')).strip().lower() if pd.notna(row.get('category')) else ''
            mapped_category = category_map.get(category, category)
            if mapped_category and mapped_category not in valid_category_keys:
                row_data["warnings"].append(f"Unknown category '{category}', will use 'other'")
                mapped_category = 'other'
            row_data["data"]["category"] = mapped_category or 'other'
            
            # Check unit
            unit = str(row.get('unit', '')).strip().lower() if pd.notna(row.get('unit')) else 'unit'
            mapped_unit = unit_map.get(unit, unit)
            if mapped_unit not in valid_units:
                row_data["warnings"].append(f"Unknown unit '{unit}', will use as-is")
            row_data["data"]["unit"] = mapped_unit
            
            # Check cost
            try:
                cost = float(row.get('cost_per_unit', 0)) if pd.notna(row.get('cost_per_unit')) else 0
                if cost < 0:
                    row_data["errors"].append("Cost cannot be negative")
                    row_data["status"] = "error"
                row_data["data"]["cost_per_unit"] = cost
            except (ValueError, TypeError):
                row_data["warnings"].append("Invalid cost value, will use 0")
                row_data["data"]["cost_per_unit"] = 0
            
            # Check stock
            try:
                stock = float(row.get('stock_quantity', 0)) if pd.notna(row.get('stock_quantity')) else 0
                if stock < 0:
                    row_data["errors"].append("Stock cannot be negative")
                    row_data["status"] = "error"
                row_data["data"]["stock_quantity"] = stock
            except (ValueError, TypeError):
                row_data["warnings"].append("Invalid stock value, will use 0")
                row_data["data"]["stock_quantity"] = 0
            
            # Check par_level
            try:
                par = float(row.get('par_level', 0)) if pd.notna(row.get('par_level')) else 0
                row_data["data"]["par_level"] = par
            except (ValueError, TypeError):
                row_data["data"]["par_level"] = 0
            
            # SKU and notes
            row_data["data"]["sku"] = str(row.get('sku', '')).strip() if pd.notna(row.get('sku')) else ''
            row_data["data"]["notes"] = str(row.get('notes', '')).strip() if pd.notna(row.get('notes')) else ''
            
            # Inventory type
            inv_type = str(row.get('inventory_type', '')).strip().lower() if pd.notna(row.get('inventory_type')) else 'food'
            if inv_type not in ['food', 'packaging']:
                inv_type = 'food'
            row_data["data"]["inventory_type"] = inv_type
            
            # Set final status
            if row_data["errors"]:
                row_data["status"] = "error"
                total_errors += 1
            elif row_data["warnings"]:
                row_data["status"] = "warning"
                total_warnings += 1
            else:
                total_valid += 1
            
            rows.append(row_data)
        
        return {
            "valid": total_errors == 0,
            "total_rows": len(rows),
            "valid_rows": total_valid,
            "warning_rows": total_warnings,
            "error_rows": total_errors,
            "columns_found": list(df.columns),
            "rows": rows
        }
        
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The file is empty")
    except Exception as e:
        logger.error(f"Error validating import file: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@inventory_router.post("/import-from-file")
async def import_inventory_from_file(
    file: UploadFile = File(...),
    update_existing: bool = False,
    user: User = Depends(get_current_user)
):
    """
    Import inventory items from CSV or Excel file.
    
    Expected columns (flexible matching):
    - name (required): Product name
    - brand: Product brand
    - category: Category key (proteins, dairy, produce, dry_goods, etc.)
    - unit: Unit of measure (kg, g, lb, oz, unit, etc.)
    - cost_per_unit: Cost per unit
    - stock_quantity: Initial stock quantity
    - par_level: Minimum stock level
    - sku: Product SKU code
    - notes: Additional notes
    - inventory_type: food or packaging (defaults to food)
    """
    # Validate file type
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")
    
    try:
        contents = await file.read()
        
        # Parse file based on type
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        # Clean column names: lowercase, strip, replace spaces with underscores
        df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_')
        
        # Column mapping for flexibility
        column_mapping = {
            'nombre': 'name',
            'producto': 'name',
            'product': 'name',
            'item': 'name',
            'marca': 'brand',
            'categoria': 'category',
            'categoría': 'category',
            'unidad': 'unit',
            'precio': 'cost_per_unit',
            'costo': 'cost_per_unit',
            'cost': 'cost_per_unit',
            'price': 'cost_per_unit',
            'costo_unitario': 'cost_per_unit',
            'cantidad': 'stock_quantity',
            'stock': 'stock_quantity',
            'quantity': 'stock_quantity',
            'existencia': 'stock_quantity',
            'minimo': 'par_level',
            'min_stock': 'par_level',
            'par': 'par_level',
            'codigo': 'sku',
            'code': 'sku',
            'notas': 'notes',
            'tipo': 'inventory_type',
            'type': 'inventory_type'
        }
        
        df.rename(columns=column_mapping, inplace=True)
        
        # Validate required column
        if 'name' not in df.columns:
            raise HTTPException(status_code=400, detail="File must have a 'name' or 'nombre' column")
        
        # Get valid categories from settings
        valid_categories = await db.organization_settings.find_one(
            {"company_id": user.company_id},
            {"inventory_categories": 1}
        )
        valid_category_keys = []
        if valid_categories and valid_categories.get("inventory_categories"):
            valid_category_keys = [c.get("key") for c in valid_categories["inventory_categories"]]
        
        # Default categories if not set
        if not valid_category_keys:
            valid_category_keys = ["proteins", "dairy", "produce", "dry_goods", "beverages", 
                                   "spices", "frozen", "canned", "packaging", "cleaning", "other"]
        
        now = datetime.now(timezone.utc)
        created = 0
        updated = 0
        skipped = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                name = str(row.get('name', '')).strip()
                if not name or pd.isna(row.get('name')):
                    skipped += 1
                    continue
                
                # Check if item already exists
                existing = await db.ingredients.find_one(
                    {
                        "company_id": user.company_id,
                        "name": {"$regex": f"^{name}$", "$options": "i"}
                    },
                    {"_id": 0}
                )
                
                # Parse values with defaults
                def safe_float(val, default=0.0):
                    if pd.isna(val):
                        return default
                    try:
                        return float(val)
                    except Exception:
                        return default
                
                def safe_str(val, default=""):
                    if pd.isna(val):
                        return default
                    return str(val).strip()
                
                # Normalize category
                category = safe_str(row.get('category'), 'other').lower().strip()
                # Map common Spanish categories
                category_map = {
                    'proteinas': 'proteins', 'proteínas': 'proteins', 'carnes': 'proteins',
                    'lácteos': 'dairy', 'lacteos': 'dairy',
                    'frutas': 'produce', 'verduras': 'produce', 'vegetales': 'produce',
                    'secos': 'dry_goods', 'granos': 'dry_goods',
                    'bebidas': 'beverages',
                    'especias': 'spices', 'condimentos': 'spices',
                    'congelados': 'frozen',
                    'enlatados': 'canned',
                    'empaque': 'packaging', 'empaques': 'packaging',
                    'limpieza': 'cleaning',
                    'otros': 'other'
                }
                category = category_map.get(category, category)
                if category not in valid_category_keys:
                    category = 'other'
                
                # Normalize unit
                unit = safe_str(row.get('unit'), 'unit').lower().strip()
                unit_map = {
                    'kilogramo': 'kg', 'kilogramos': 'kg', 'kilos': 'kg',
                    'gramo': 'g', 'gramos': 'g',
                    'libra': 'lb', 'libras': 'lb',
                    'onza': 'oz', 'onzas': 'oz',
                    'litro': 'L', 'litros': 'L',
                    'mililitro': 'ml', 'mililitros': 'ml',
                    'unidad': 'unit', 'unidades': 'unit', 'pza': 'unit', 'pieza': 'unit'
                }
                unit = unit_map.get(unit, unit)
                
                # Normalize inventory type
                inv_type = safe_str(row.get('inventory_type'), 'food').lower().strip()
                if inv_type not in ['food', 'packaging']:
                    inv_type = 'food'
                
                item_data = {
                    "name": name,
                    "brand": safe_str(row.get('brand')),
                    "category": category,
                    "inventory_type": inv_type,
                    "unit": unit,
                    "cost_per_unit": safe_float(row.get('cost_per_unit')),
                    "stock_quantity": safe_float(row.get('stock_quantity')),
                    "par_level": safe_float(row.get('par_level')),
                    "sku": safe_str(row.get('sku')),
                    "notes": safe_str(row.get('notes')),
                    "updated_at": now.isoformat()
                }
                
                if existing:
                    if update_existing:
                        # Update existing item
                        await db.ingredients.update_one(
                            {"ingredient_id": existing["ingredient_id"]},
                            {"$set": item_data}
                        )
                        updated += 1
                    else:
                        skipped += 1
                else:
                    # Create new item
                    ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"
                    item_data["ingredient_id"] = ingredient_id
                    item_data["company_id"] = user.company_id
                    item_data["created_at"] = now.isoformat()
                    item_data["reserved_quantity"] = 0
                    item_data["pack_size"] = 1.0
                    item_data["min_stock_level"] = item_data["par_level"]
                    item_data["average_cost"] = item_data["cost_per_unit"]
                    item_data["price_history"] = [{"price": item_data["cost_per_unit"], "date": now.isoformat()}]
                    
                    await db.ingredients.insert_one(item_data)
                    created += 1
                    
            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")
                continue
        
        return {
            "success": True,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total_rows": len(df),
            "errors": errors[:10] if errors else []  # Return first 10 errors only
        }
        
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The file is empty")
    except Exception as e:
        logger.error(f"Error importing inventory: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@inventory_router.get("/import-template")
async def get_import_template(user: User = Depends(get_current_user)):
    """Get a sample CSV template for inventory import"""
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    writer.writerow(['name', 'brand', 'category', 'unit', 'cost_per_unit', 'stock_quantity', 'par_level', 'sku', 'notes', 'inventory_type'])
    
    # Sample data rows
    writer.writerow(['Chicken Breast', 'Tyson', 'proteins', 'kg', '8.50', '50', '20', 'CHK001', 'Fresh boneless', 'food'])
    writer.writerow(['Olive Oil Extra Virgin', 'Bertolli', 'dry_goods', 'L', '12.00', '10', '5', 'OIL001', 'Premium quality', 'food'])
    writer.writerow(['Tomatoes Roma', 'Local Farm', 'produce', 'kg', '2.50', '30', '15', '', 'Fresh daily', 'food'])
    writer.writerow(['To-Go Containers', 'EcoWare', 'packaging', 'unit', '0.25', '500', '200', 'PKG001', '16oz with lid', 'packaging'])
    
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_import_template.csv"}
    )



# ============ PASE A · Data-safety endpoints ============

@inventory_router.post("/ingredients/{ingredient_id}/normalize-cost")
async def normalize_ingredient_cost(
    ingredient_id: str,
    body: dict = Body(default={}),
    user: User = Depends(get_current_user),
):
    """PASE A · One-off migrator for legacy rows where `cost_per_unit` was
    written with the old per-base-unit semantic (bug reproduced in this
    session: Aceite Capullo, Aceite de Oliva Extra Virgen, Aceite 150ML).

    Requires `confirm: true` in the body. Writes a snapshot into
    `ingredient_price_reviews` for audit + revertibility. Does NOT touch
    proposals/order_items. Triggers the standard recipe recalc cascade.
    """
    if not body.get("confirm"):
        raise HTTPException(status_code=400, detail="Missing confirm:true")
    ing = await db.ingredients.find_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"_id": 0},
    )
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    pc = float(ing.get("purchase_cost") or 0)
    pq = float(ing.get("purchase_quantity_per_unit") or 0)
    if pc <= 0 or pq <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ingredient lacks purchase_cost or purchase_quantity_per_unit; complete these first.",
        )
    now = datetime.now(timezone.utc).isoformat()
    prev = {
        "cost_per_unit": ing.get("cost_per_unit"),
        "cost_per_base_unit": ing.get("cost_per_base_unit"),
        "purchase_cost": ing.get("purchase_cost"),
    }
    new = {
        "cost_per_unit": round(pc, 4),
        "cost_per_base_unit": round(pc / pq, 6),
        "purchase_incomplete": False,
        "updated_at": now,
    }
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"$set": new},
    )
    await db.ingredient_price_reviews.insert_one({
        "ingredient_id": ingredient_id,
        "company_id": user.company_id,
        "action": "paseA_normalize",
        "previous_values": prev,
        "new_values": new,
        "reviewed_at": now,
        "reviewed_by": user.email,
        "note": body.get("note") or "PASE A one-off normalization",
    })
    try:
        await _recalc_recipes_using_ingredient(ingredient_id, user.company_id)
    except Exception as e:
        logger.warning(f"recalc after normalize-cost failed for {ingredient_id}: {e}")
    return {"ingredient_id": ingredient_id, "previous": prev, "new": new}


@inventory_router.post("/ingredients/rollback-paseA")
async def rollback_paseA(body: dict = Body(default={}), user: User = Depends(get_current_user)):
    """Restore ingredients from a `ingredients_backup_paseA_*` collection.

    Selective by default: skips docs whose `updated_at` moved after the
    backup was taken (assumes real user edits). Set `force=true` in the
    body to restore everything unconditionally.
    """
    coll = body.get("collection")
    if not coll or not coll.startswith("ingredients_backup_paseA_"):
        raise HTTPException(status_code=400, detail="Missing/invalid collection name")
    force = bool(body.get("force"))
    backup_docs = await db[coll].find({}, {"_id": 0}).to_list(30000)
    if not backup_docs:
        raise HTTPException(status_code=404, detail=f"Backup collection {coll} is empty")
    restored = 0
    skipped = 0
    for bdoc in backup_docs:
        ing_id = bdoc.get("ingredient_id")
        if not ing_id:
            continue
        current = await db.ingredients.find_one(
            {"ingredient_id": ing_id}, {"_id": 0, "updated_at": 1},
        )
        if not force and current:
            # If updated after backup, skip.
            snapshot_ts = str(bdoc.get("updated_at") or "")
            live_ts = str(current.get("updated_at") or "")
            if live_ts and snapshot_ts and live_ts > snapshot_ts:
                skipped += 1
                continue
        await db.ingredients.update_one(
            {"ingredient_id": ing_id}, {"$set": bdoc}, upsert=True,
        )
        restored += 1
    return {"collection": coll, "restored": restored, "skipped_because_edited": skipped}

