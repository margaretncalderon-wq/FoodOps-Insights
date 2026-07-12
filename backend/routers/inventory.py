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
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Body, Depends, File, Form, Header, HTTPException, Query, UploadFile
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
                except:
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
            safe_out.append(i)
        except Exception as row_err:
            # Skip a row that we still can't sanitize (never fail the entire list)
            import logging
            logging.getLogger(__name__).warning(
                f"[ingredients] skipping malformed row for company {user.company_id}: {row_err} — row keys: {list(i.keys())[:10]}"
            )
            continue
    return safe_out

@inventory_router.post("/ingredients", response_model=Ingredient)
async def create_ingredient(data: IngredientCreate, user: User = Depends(get_current_user)):
    from utils.units import derive_base_unit, normalize_unit, convert as unit_convert
    now = datetime.now(timezone.utc)
    ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"

    payload = data.model_dump()
    # Auto-derive base_unit if not provided
    if not payload.get("base_unit"):
        payload["base_unit"] = derive_base_unit(payload.get("category", ""))
    # Auto-derive cost_per_base_unit from the legacy unit + cost
    if not payload.get("cost_per_base_unit"):
        legacy_unit = normalize_unit(payload.get("unit") or "")
        base_unit = normalize_unit(payload["base_unit"])
        legacy_cost = float(payload.get("cost_per_unit") or 0)
        if legacy_unit and base_unit:
            # cost_per_base = legacy_cost * (qty of base_unit in 1 legacy_unit) -- inverse direction
            ratio = unit_convert(1.0, legacy_unit, base_unit, payload)
            payload["cost_per_base_unit"] = round(legacy_cost / ratio, 6) if ratio else legacy_cost
        else:
            payload["cost_per_base_unit"] = legacy_cost

    ingredient_doc = {
        "ingredient_id": ingredient_id,
        "company_id": user.company_id,
        **payload,
        "average_cost": data.cost_per_unit,
        "price_history": [{"price": data.cost_per_unit, "date": now.isoformat()}],
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
    from utils.units import cost_for_recipe_line, convert, normalize_unit, unit_kind, is_compatible
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
    qty_in_base = convert(quantity, line_unit, base_unit, ingredient) if (quantity and line_unit and base_unit) else None
    compatible = is_compatible(line_unit, base_unit, ingredient) if (line_unit and base_unit) else False

    message = None
    if line_unit and base_unit and not compatible:
        message = f"La unidad '{line_unit}' no es compatible con la base '{base_unit}' de este ingrediente"

    # Apply waste: line override wins, otherwise fall back to ingredient default (yield_waste_percent).
    # If payload explicitly sends waste_factor_pct=0, treat it as "no waste" and skip the ingredient default.
    raw_waste = payload.get("waste_factor_pct")
    if raw_waste is None:
        applied_waste = float(ingredient.get("yield_waste_percent") or 0)
    else:
        applied_waste = float(raw_waste or 0)
    effective_qty = quantity * (1 + applied_waste / 100) if applied_waste > 0 else quantity
    cost = cost_for_recipe_line(effective_qty, line_unit, ingredient) if quantity else 0

    return {
        "cost": round(cost, 4),
        "compatible": compatible,
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
async def update_ingredient(ingredient_id: str, data: dict, user: User = Depends(get_current_user)):
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
    if cost_changed or waste_changed:
        try:
            await _recalc_recipes_using_ingredient(ingredient_id, user.company_id)
        except Exception as e:
            logger.warning(f"Auto-recalc on ingredient {ingredient_id} change failed: {e}")
    
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
        return {"recalculated": 0, "affected_recipe_ids": []}

    affected = []
    for rid in recipes_to_recalc_ids:
        recipe = await db.recipes.find_one({"recipe_id": rid, "company_id": company_id}, {"_id": 0})
        if not recipe:
            continue
        try:
            ingredients = [RecipeIngredient(**i) for i in recipe.get("ingredients", [])]
        except Exception:
            continue
        sub_recipes = recipe.get("sub_recipes", [])
        new_total, updated_ings, updated_subs = await calculate_recipe_cost(
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
                "last_cost_recalc_at": datetime.now(timezone.utc).isoformat(),
                "last_cost_recalc_trigger": f"ingredient:{ingredient_id}",
            }},
        )
        affected.append(rid)
    return {"recalculated": len(affected), "affected_recipe_ids": affected}

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
    """
    items = data.get("items", [])
    event_ids = data.get("event_ids", [])
    
    if not items:
        raise HTTPException(status_code=400, detail="No items to reserve")
    
    now = datetime.now(timezone.utc)
    reservations = []
    event_names = ", ".join([e.get("event_name", e.get("event_id", "")) for e in data.get("events", [])])
    
    for item in items:
        item_id = item.get("inventory_item_id") or item.get("ingredient_id")
        qty_to_reserve = item.get("qty_needed", item.get("quantity", 0))
        
        if not item_id or qty_to_reserve <= 0:
            continue
        
        # Get current inventory item
        inv_item = await db.ingredients.find_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"_id": 0}
        )
        
        if not inv_item:
            continue
        
        current_stock = inv_item.get("stock_quantity", 0)
        current_reserved = inv_item.get("reserved_quantity", 0)
        available = current_stock - current_reserved
        
        # Update reserved quantity (add to existing reserved)
        new_reserved = current_reserved + qty_to_reserve
        
        await db.ingredients.update_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"$set": {
                "reserved_quantity": new_reserved,
                "updated_at": now.isoformat()
            }}
        )
        
        # Create reservation record (not a deduction transaction)
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
            "status": "active",  # active, consumed, released
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
        "message": "Inventory reserved successfully",
        "reservations": reservations,
        "event_ids": event_ids,
        "reserved_at": now.isoformat()
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
    import pandas as pd
    import io
    
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
    import pandas as pd
    import io
    
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
                    except:
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
    import io
    import csv
    
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

