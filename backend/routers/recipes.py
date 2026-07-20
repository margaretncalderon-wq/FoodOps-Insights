"""Recipe endpoints — extracted from server.py in the refactor sprint. LOGIC UNCHANGED.

Contains:
- Recipe CRUD (get, create, update, delete, duplicate)
- Cost calculation helpers (calculate_recipe_cost, compute_full_recipe_costing,
  check_circular_dependency, is_discrete_unit_for_ingredient, _scale_ingredient_line)
- Scaling (scale-preview, save-scaled-menu)
- AI endpoints (ai-analyze, suggest-ingredients-bulk, suggest-ingredients,
  ai-repair-ingredients, undo-ai-repair)
- Cost history + Recalculate-all
- Portion formats + Packaging formats + Extended update + Image upload/delete
"""
import base64
import io
import json
import logging
import math
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from config import db
from config import UPLOADS_DIR
from dependencies import get_current_user
from models.auth import User
from models.recipes import (
    Recipe,
    RecipeCreate,
    RecipeExtendedUpdate,
    RecipeIngredient,
    RecipePackagingFormat,
    RecipePackagingFormatCreate,
    RecipePortionFormat,
    RecipePortionFormatCreate,
    RecipeScalePreview,
    SaveScaledMenuRequest,
)
from utils.legacy_units import convert_units

logger = logging.getLogger(__name__)

recipes_router = APIRouter(prefix="/recipes", tags=["Recipes"])


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Coerce any value to a JSON-safe finite float.

    Legacy tenants have prep_time/cook_time/yield_quantity stored as the string
    'nan' (from a pandas-based migration), whitespace, or None. `float('nan')`
    succeeds but produces NaN which then propagates through the costing pipeline
    and gets persisted, breaking `GET /recipes` afterward (FastAPI refuses to
    serialize NaN/Inf → 500 for the whole tenant).

    This helper returns `default` for None, empty/whitespace strings, the
    literal strings 'nan'/'inf' (any case), and any NaN/Inf float. Everything
    else is best-effort coerced via `float()`.
    """
    if value is None:
        return default
    if isinstance(value, str):
        s = value.strip().lower()
        if s == "" or s == "nan" or s == "inf" or s == "-inf" or s == "none" or s == "null":
            return default
        try:
            f = float(s)
        except (TypeError, ValueError):
            return default
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(f) or math.isinf(f):
        return default
    return f


def _sanitize_json_floats(obj: Any) -> Any:
    """Recursively replace NaN/Inf floats with 0 so the payload is JSON-safe.

    Used as a defense-in-depth guard around `get_recipes` and the costing
    output — one poisoned row must not nuke the whole tenant response.
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_json_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_json_floats(v) for v in obj]
    return obj


# ============ BODY (endpoints + helpers) — extracted from server.py ============
@recipes_router.get("")
async def get_recipes(recipe_type: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if recipe_type:
        query["recipe_type"] = recipe_type
    
    recipes = await db.recipes.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    
    safe_out = []
    for r in recipes:
        try:
            for field in ["created_at", "updated_at"]:
                if r.get(field) and isinstance(r[field], str):
                    try:
                        r[field] = datetime.fromisoformat(r[field])
                    except Exception:
                        # Legacy tenants may have malformed datetime strings; keep as-is
                        pass
            for field, default in [("recipe_type", "final_dish"), ("yield_quantity", 1.0), ("yield_unit", "portion"), ("portion_size", 1.0), ("portion_unit", "serving"), ("labor_minutes", 0), ("cost_per_yield", r.get("cost_per_serving", 0)), ("cost_per_portion", r.get("cost_per_serving", 0)), ("sell_price", 0.0), ("food_cost_percent", 0.0)]:
                if field not in r:
                    r[field] = default
            # Ensure extended fields have defaults for old recipes
            r.setdefault("allergens", [])
            r.setdefault("work_category", None)
            r.setdefault("recipe_code", None)
            r.setdefault("verified_status", "Draft")
            # Cost completeness flags — legacy recipes default to no errors
            # until they're re-saved (which repopulates them).
            r.setdefault("conversion_errors", [])
            r.setdefault("conversion_errors_count", 0)
            r.setdefault("has_conversion_errors", False)
            # Map old field names to new ones for backwards compatibility
            r.setdefault("prep_time", r.get("prep_time_minutes", 0))
            r.setdefault("cook_time", r.get("cook_time_minutes", 0))
            r.setdefault("difficulty", "medium")
            # Convert instructions array to string if needed
            if isinstance(r.get("instructions"), list):
                r["instructions"] = "\n".join(r["instructions"]) if r["instructions"] else ""
            safe_out.append(r)
        except Exception as row_err:
            import logging
            logging.getLogger(__name__).warning(
                f"[recipes] skipping malformed row for company {user.company_id}: {row_err}"
            )
            continue
    # Defense-in-depth: any legacy row with NaN/Inf floats (from a poisoned
    # recalculate-all before the safe_float fix) would otherwise 500 the whole
    # tenant. Sanitize once at the boundary.
    return _sanitize_json_floats(safe_out)

async def calculate_recipe_cost(ingredients: List[RecipeIngredient], sub_recipes: List[Dict] = None, company_id: str = "") -> tuple:
    """Calculate total cost for a recipe's ingredients and sub-recipes, with proper unit conversion.

    Accepts both NEW format (item_id + item_type='ingredient') and LEGACY format
    (ingredient_id directly, no item_type). Uses utils.units to do real unit→base conversion.

    Also collects `missing_refs` — a list of item_ids that couldn't be resolved
    against the tenant's ingredient/recipe collections. Callers can use this to
    surface actionable diagnostics ("Ingredient X was deleted; re-link or remove").

    Additionally collects `conversion_errors` — a list of unresolved unit
    conversions for direct lines AND bubbled up from child sub-recipes. Callers
    should store `has_conversion_errors`/`conversion_errors_count` at the recipe
    level so menus/plated menus can propagate the "Costo incompleto" warning
    without re-walking every line.
    """
    from utils.units import cost_for_recipe_line, normalize_unit, UnitConversionError
    total_cost = 0.0
    updated_ingredients = []
    updated_sub_recipes = []
    missing_refs = []  # (item_id, kind, name_from_line)
    conversion_errors = []  # aggregate of unresolved conversions (direct + bubbled)

    for ing in ingredients:
        ing_dict = ing.model_dump() if hasattr(ing, 'model_dump') else dict(ing)

        # Resolve ingredient/recipe reference: new vs legacy formats
        item_type = ing_dict.get("item_type")
        item_id = ing_dict.get("item_id") or ing_dict.get("ingredient_id")
        is_recipe_ref = item_type == "recipe"

        if not item_id:
            updated_ingredients.append(ing_dict)
            continue

        if not is_recipe_ref:
            # Try ingredient first
            ingredient = await db.ingredients.find_one(
                {"ingredient_id": item_id, "company_id": company_id},
                {"_id": 0}
            )
            if ingredient:
                quantity = float(ing_dict.get("quantity", 0) or 0)
                line_unit = ing_dict.get("unit") or ingredient.get("base_unit") or ingredient.get("unit") or "g"
                # Waste: explicit line override wins; otherwise fall back to ingredient default.
                # If chef sets the line to 0 explicitly, we keep 0 (no waste for this line).
                raw_line_waste = ing_dict.get("waste_factor_pct")
                if raw_line_waste is None or raw_line_waste == "":
                    applied_waste = float(ingredient.get("yield_waste_percent") or 0)
                else:
                    applied_waste = float(raw_line_waste or 0)
                # Standard AP/EP method: yield% = (1 - waste%),
                #                        EP cost = AP cost / yield%
                # → effective_qty = qty / (1 - waste/100). Guarded against
                # division-by-zero and non-sensical values (waste ≥ 100%).
                applied_waste = max(0.0, min(applied_waste, 99.99))
                yield_frac = 1.0 - applied_waste / 100.0
                effective_qty = quantity / yield_frac if yield_frac > 0 else quantity
                # Fail-explicit conversion: if the recipe unit cannot be
                # converted to the ingredient's base_unit, mark the line as
                # `conversion_error` instead of returning $0 silently. The UI
                # surfaces this to the user with the exact reason.
                try:
                    line_cost = cost_for_recipe_line(effective_qty, line_unit, ingredient)
                    conv_err = None
                except UnitConversionError as ce:
                    line_cost = 0.0
                    conv_err = {
                        "from_unit": ce.from_unit, "to_unit": ce.to_unit,
                        "reason": ce.reason, "ingredient_name": ce.ingredient_name,
                    }
                    conversion_errors.append({
                        "source": "ingredient",
                        "item_id": item_id,
                        "name": ingredient.get("name") or ing_dict.get("name") or "?",
                        "from_unit": ce.from_unit,
                        "to_unit": ce.to_unit,
                        "reason": ce.reason,
                    })

                updated_ingredients.append({
                    **ing_dict,
                    "item_type": item_type or "ingredient",
                    "item_id": item_id,
                    "ingredient_id": item_id,  # keep legacy field for backwards compat
                    "unit": normalize_unit(line_unit),
                    "cost_per_unit": round(line_cost / quantity, 6) if quantity > 0 else 0,
                    "cost": round(line_cost, 4),         # legacy field name
                    "total_cost": round(line_cost, 4),
                    "net_quantity": round(effective_qty, 4),
                    "applied_waste_pct": round(applied_waste, 2),
                    "conversion_error": conv_err,
                })
                total_cost += line_cost
                continue
            else:
                # Ingredient reference is dead (deleted or belongs to another
                # tenant). Mark the line so the FE can surface it as a fixable
                # issue instead of just showing $0 silently.
                missing_refs.append({"item_id": item_id, "kind": "ingredient",
                                     "name": ing_dict.get("name") or "?"})
                updated_ingredients.append({
                    **ing_dict, "item_id": item_id, "ingredient_id": item_id,
                    "cost": 0, "total_cost": 0, "_missing_ref": True,
                })
                continue

        # Sub-recipe reference (legacy item_type=recipe inline)
        sub_recipe = await db.recipes.find_one(
            {"recipe_id": item_id, "company_id": company_id},
            {"_id": 0}
        )
        if sub_recipe:
            cost_per_yield = sub_recipe.get("cost_per_yield", 0) or 0
            quantity = float(ing_dict.get("quantity", 0) or 0)
            # Convert parent line-unit to sub-recipe yield_unit when they differ
            parent_unit = ing_dict.get("unit")
            child_yield_unit = sub_recipe.get("yield_unit")
            converted_qty = quantity
            if parent_unit and child_yield_unit and parent_unit != child_yield_unit:
                try:
                    converted_qty = convert_units(quantity, parent_unit, child_yield_unit)
                except Exception:
                    converted_qty = quantity  # fallback to raw
            line_cost = converted_qty * cost_per_yield
            # Bubble up conversion errors from the child sub-recipe so parents
            # can surface "Costo incompleto" without re-walking every leaf.
            if sub_recipe.get("has_conversion_errors"):
                conversion_errors.append({
                    "source": "sub_recipe",
                    "item_id": item_id,
                    "name": sub_recipe.get("name") or ing_dict.get("name") or "?",
                    "child_errors_count": int(sub_recipe.get("conversion_errors_count") or 1),
                    "reason": "sub-recipe has unresolved conversions",
                })
            updated_ingredients.append({
                **ing_dict,
                "item_type": "recipe",
                "item_id": item_id,
                "cost_per_unit": cost_per_yield,
                "cost": round(line_cost, 4),
                "total_cost": round(line_cost, 4),
            })
            total_cost += line_cost
        else:
            updated_ingredients.append(ing_dict)

    # Sub-recipes block (new structure)
    if sub_recipes:
        for sub in sub_recipes:
            sub_dict = sub if isinstance(sub, dict) else sub.model_dump()
            child_recipe_id = sub_dict.get("child_recipe_id")

            child_recipe = await db.recipes.find_one(
                {"recipe_id": child_recipe_id, "company_id": company_id},
                {"_id": 0}
            )
            if child_recipe:
                cost_per_yield = child_recipe.get("cost_per_yield", 0) or 0
                # Convert sub-recipe consumption unit → child yield_unit
                q_used = float(sub_dict.get("quantity_used", 0) or 0)
                parent_unit = sub_dict.get("unit")
                child_yield_unit = child_recipe.get("yield_unit")
                converted_used = q_used
                if parent_unit and child_yield_unit and parent_unit != child_yield_unit:
                    try:
                        converted_used = convert_units(q_used, parent_unit, child_yield_unit)
                    except Exception:
                        converted_used = q_used
                line_cost = converted_used * cost_per_yield
                # Bubble up conversion errors from the child sub-recipe.
                if child_recipe.get("has_conversion_errors"):
                    conversion_errors.append({
                        "source": "sub_recipe",
                        "item_id": child_recipe_id,
                        "name": child_recipe.get("name") or sub_dict.get("child_recipe_name") or "?",
                        "child_errors_count": int(child_recipe.get("conversion_errors_count") or 1),
                        "reason": "sub-recipe has unresolved conversions",
                    })
                updated_sub_recipes.append({
                    **sub_dict,
                    "cost_per_unit": cost_per_yield,
                    "total_cost": round(line_cost, 4)
                })
                total_cost += line_cost
            else:
                updated_sub_recipes.append(sub_dict)

    return round(total_cost, 4), updated_ingredients, updated_sub_recipes, conversion_errors


async def compute_full_recipe_costing(
    recipe_data: dict,
    food_cost: float,
    company_id: str,
) -> dict:
    """Compute the full recipe costing (food + labor + overhead) plus selling price analytics.
    
    Returns dict with:
      food_cost, labor_cost, overhead_cost, total_cost_full,
      cost_per_yield, cost_per_portion (food only), total_cost_per_portion (food+labor+overhead),
      food_cost_percent, total_cost_percent, contribution_dollar, contribution_percent,
      suggested_sell_price, price_gap_pct
    """
    # Fetch config from company
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    chef_hourly = _safe_float((company or {}).get("chef_hourly_rate"), 20.0)
    overhead_pct = _safe_float((company or {}).get("recipe_overhead_percent"), 15.0)
    target_food_pct = _safe_float((company or {}).get("recipe_target_food_cost_percent"), 30.0)

    prep_min = _safe_float(recipe_data.get("prep_time_minutes") or recipe_data.get("prep_time"), 0)
    cook_min = _safe_float(recipe_data.get("cook_time_minutes") or recipe_data.get("cook_time"), 0)
    labor_min = _safe_float(recipe_data.get("labor_minutes"), 0)
    total_labor_min = prep_min + cook_min + labor_min
    labor_cost = round((total_labor_min / 60.0) * chef_hourly, 4)

    # Guard against a poisoned food_cost value coming in from the caller.
    food_cost = _safe_float(food_cost, 0.0)
    overhead_cost = round(food_cost * (overhead_pct / 100.0), 4)
    total_cost_full = round(food_cost + labor_cost + overhead_cost, 4)

    yield_qty = _safe_float(recipe_data.get("yield_quantity"), 1) or 1
    portions = _safe_float(recipe_data.get("portions_per_yield"), 1) or 1

    cost_per_yield = round(food_cost / yield_qty, 4)
    cost_per_portion_food = round(food_cost / (yield_qty * portions if yield_qty * portions else 1), 4)
    total_cost_per_portion = round(total_cost_full / (yield_qty * portions if yield_qty * portions else 1), 4)

    sell_price = _safe_float(recipe_data.get("sell_price") or recipe_data.get("default_portion_price"), 0)
    food_cost_percent = round((cost_per_portion_food / sell_price * 100), 2) if sell_price > 0 else 0
    total_cost_percent = round((total_cost_per_portion / sell_price * 100), 2) if sell_price > 0 else 0
    contribution_dollar = round(sell_price - total_cost_per_portion, 4) if sell_price > 0 else 0
    contribution_percent = round((contribution_dollar / sell_price * 100), 2) if sell_price > 0 else 0

    # =========================================================
    # SUGGESTED SELL PRICE — Three industry-standard methods
    # =========================================================
    # (Fixes prior bug: previously divided total_cost by target_food_pct,
    #  which effectively double-charged overhead. Correct formula uses
    #  ONLY food_cost in the numerator for the food-cost method.)
    #
    # A) Food Cost Method (classic restaurant): food ÷ target_food_pct
    # B) Prime Cost Method (fine dining):        (food+labor) ÷ target_prime_pct
    # C) Gross Margin Markup (catering/events):  total_cost ÷ (1 - target_margin)
    #
    # `suggested_sell_price` (main field, preserved for backwards compat) = Method A
    # `pricing_methods` sub-object exposes B and C for the UI.

    labor_per_portion = round(labor_cost / (yield_qty * portions if yield_qty * portions else 1), 4)
    prime_cost_per_portion = round(cost_per_portion_food + labor_per_portion, 4)

    target_prime_pct = _safe_float((company or {}).get("recipe_target_prime_cost_percent"), 55.0)
    target_margin_pct = _safe_float((company or {}).get("recipe_target_gross_margin_percent"), 65.0)

    # A) Food Cost Method — the industry default (Gastrokaisen, CaterTrax, Toast POS)
    suggested_sell_price = round(cost_per_portion_food / (target_food_pct / 100.0), 2) if target_food_pct > 0 else 0
    # B) Prime Cost Method
    suggested_price_prime = round(prime_cost_per_portion / (target_prime_pct / 100.0), 2) if target_prime_pct > 0 else 0
    # C) Gross Margin Markup — precio que deja un margen bruto X% después de food+labor+overhead
    denom_c = max(0.01, 1.0 - (target_margin_pct / 100.0))
    suggested_price_markup = round(total_cost_per_portion / denom_c, 2)

    price_gap_pct = round(((sell_price - suggested_sell_price) / suggested_sell_price * 100), 2) if suggested_sell_price > 0 else 0
    
    result = {
        "food_cost": round(food_cost, 4),
        "labor_cost": labor_cost,
        "overhead_cost": overhead_cost,
        "total_cost_full": total_cost_full,
        "cost_per_yield": cost_per_yield,
        "cost_per_portion": cost_per_portion_food,       # legacy field: food-only per portion
        "total_cost_per_portion": total_cost_per_portion,
        "prime_cost_per_portion": prime_cost_per_portion,
        "food_cost_percent": food_cost_percent,
        "total_cost_percent": total_cost_percent,
        "contribution_dollar": contribution_dollar,
        "contribution_percent": contribution_percent,
        "suggested_sell_price": suggested_sell_price,   # Method A (default shown in UI)
        "price_gap_pct": price_gap_pct,
        # Multi-method pricing panel for advanced UI
        "pricing_methods": {
            "food_cost_method": {
                "label": "Food Cost Method",
                "target_pct": target_food_pct,
                "price": suggested_sell_price,
                "formula": "food_cost ÷ target_food_cost%",
                "recommended_for": "restaurant, cafeteria",
            },
            "prime_cost_method": {
                "label": "Prime Cost Method",
                "target_pct": target_prime_pct,
                "price": suggested_price_prime,
                "formula": "(food + labor) ÷ target_prime_cost%",
                "recommended_for": "fine dining, steakhouse",
            },
            "gross_margin_markup": {
                "label": "Gross Margin Markup",
                "target_pct": target_margin_pct,
                "price": suggested_price_markup,
                "formula": "total_cost ÷ (1 - target_margin%)",
                "recommended_for": "catering, events, buffet",
            },
        },
        # Snapshot config so history is auditable
        "costing_config_snapshot": {
            "chef_hourly_rate": chef_hourly,
            "overhead_percent": overhead_pct,
            "target_food_cost_percent": target_food_pct,
            "target_prime_cost_percent": target_prime_pct,
            "target_gross_margin_percent": target_margin_pct,
            "computed_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    # Defense-in-depth: ensure no NaN/Inf leaks into Mongo or JSON response.
    return _sanitize_json_floats(result)

async def check_circular_dependency(parent_id: str, child_id: str, company_id: str, visited: set = None) -> bool:
    """Check if adding child_id as sub-recipe of parent_id would create a circular dependency"""
    if visited is None:
        visited = set()
    
    if child_id in visited:
        return True  # Circular dependency detected
    
    if parent_id == child_id:
        return True  # Direct self-reference
    
    visited.add(parent_id)
    
    # Get child recipe
    child_recipe = await db.recipes.find_one(
        {"recipe_id": child_id, "company_id": company_id},
        {"_id": 0, "sub_recipes": 1}
    )
    
    if not child_recipe:
        return False
    
    # Check if parent is in child's sub-recipes
    for sub in child_recipe.get("sub_recipes", []):
        if sub.get("child_recipe_id") == parent_id:
            return True
        # Recursive check
        if await check_circular_dependency(parent_id, sub.get("child_recipe_id"), company_id, visited):
            return True
    
    return False


async def _recalc_parents_of_recipe(
    recipe_id: str,
    company_id: str,
    _seen: Optional[set] = None,
) -> Dict[str, Any]:
    """Recompute every recipe that uses `recipe_id` as a sub-recipe, recursively
    up the graph. Fixes the "cascade drift" bug: when you edit a sub-recipe,
    its parent recipes are recomputed too so `total_cost` stays consistent
    with the sum of its lines.

    Guards:
    - `_seen` prevents re-computing the same recipe twice in one call and
      breaks cycles (which are also blocked at write-time by
      `check_circular_dependency`).
    - Never touches proposals/order_items — those keep their `internal_cost`
      snapshot per the existing contract.
    """
    if _seen is None:
        _seen = set()
    if recipe_id in _seen:
        return {"recalculated": 0, "affected_recipe_ids": []}
    _seen.add(recipe_id)

    # Find direct parents (both storage shapes: dedicated sub_recipes[] and
    # legacy ingredients[] with item_type=recipe).
    parents = await db.recipes.find(
        {
            "company_id": company_id,
            "$or": [
                {"sub_recipes.child_recipe_id": recipe_id},
                {"ingredients.item_id": recipe_id, "ingredients.item_type": "recipe"},
            ],
        },
        {"_id": 0},
    ).to_list(2000)

    affected: List[str] = []
    for parent in parents:
        pid = parent.get("recipe_id")
        if not pid or pid in _seen:
            continue
        try:
            ings = [RecipeIngredient(**i) for i in parent.get("ingredients", [])]
        except Exception:
            continue
        subs = parent.get("sub_recipes", [])
        new_total, updated_ings, updated_subs, conv_errs = await calculate_recipe_cost(
            ings, subs, company_id,
        )
        full_costing = await compute_full_recipe_costing(parent, new_total, company_id)
        await db.recipes.update_one(
            {"recipe_id": pid, "company_id": company_id},
            {"$set": {
                "ingredients": updated_ings,
                "sub_recipes": updated_subs,
                "total_cost": new_total,
                **full_costing,
                "conversion_errors": conv_errs,
                "conversion_errors_count": len(conv_errs),
                "has_conversion_errors": len(conv_errs) > 0,
                "last_cost_recalc_at": datetime.now(timezone.utc).isoformat(),
                "last_cost_recalc_trigger": f"child_recipe:{recipe_id}",
            }},
        )
        affected.append(pid)
        # Recurse to grandparents.
        upstream = await _recalc_parents_of_recipe(pid, company_id, _seen)
        affected.extend(upstream.get("affected_recipe_ids", []))

    return {"recalculated": len(affected), "affected_recipe_ids": affected}


@recipes_router.post("", response_model=Recipe)
async def create_recipe(data: RecipeCreate, user: User = Depends(get_current_user)):
    import logging
    _log = logging.getLogger(__name__)
    now = datetime.now(timezone.utc)
    recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"

    try:
        # Check for circular dependencies in sub-recipes
        for sub in data.sub_recipes:
            sub_d = sub if isinstance(sub, dict) else sub.model_dump()
            child_id = sub_d.get("child_recipe_id")
            child_name = sub_d.get("child_recipe_name") or child_id
            if child_id and await check_circular_dependency(recipe_id, child_id, user.company_id):
                raise HTTPException(status_code=400, detail=f"Circular dependency detected with recipe {child_name}")

        # Calculate costs including sub-recipes
        sub_recipes_data = [
            (s if isinstance(s, dict) else s.model_dump()) for s in (data.sub_recipes or [])
        ]
        try:
            food_cost, updated_ingredients, updated_sub_recipes, conv_errs = await calculate_recipe_cost(
                data.ingredients, sub_recipes_data, user.company_id
            )
        except Exception as calc_err:
            _log.exception(f"[create_recipe] calculate_recipe_cost failed: {calc_err}")
            food_cost = 0.0
            updated_ingredients = [
                (i if isinstance(i, dict) else i.model_dump()) for i in (data.ingredients or [])
            ]
            updated_sub_recipes = sub_recipes_data
            conv_errs = []

        # Full costing (labor + overhead + suggested price + contribution)
        try:
            costing = await compute_full_recipe_costing(data.model_dump(), food_cost, user.company_id)
        except Exception as cost_err:
            _log.exception(f"[create_recipe] compute_full_recipe_costing failed: {cost_err}")
            costing = {"food_cost": food_cost, "total_cost_full": food_cost}

        recipe_doc = {
            "recipe_id": recipe_id,
            "company_id": user.company_id,
            **data.model_dump(),
            "ingredients": updated_ingredients,
            "sub_recipes": updated_sub_recipes,
            "total_cost": food_cost,  # legacy: food cost only
            **costing,  # spreads food_cost, labor_cost, overhead_cost, total_cost_full, cost_per_portion, etc.
            "conversion_errors": conv_errs,
            "conversion_errors_count": len(conv_errs),
            "has_conversion_errors": len(conv_errs) > 0,
            # Extended fields with defaults
            "allergens": [],
            "work_category": None,
            "recipe_code": None,
            "verified_status": "Draft",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.recipes.insert_one(recipe_doc)
        recipe_doc.pop("_id", None)
        recipe_doc["created_at"] = now
        recipe_doc["updated_at"] = now
        try:
            return Recipe(**recipe_doc)
        except Exception as ve:
            _log.warning(f"[create_recipe] Recipe(**doc) validation failed for {recipe_id} — returning raw dict. err={ve}")
            return recipe_doc
    except HTTPException:
        raise
    except Exception as e:
        _log.exception(f"[create_recipe] UNHANDLED error for company {user.company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear receta: {type(e).__name__}: {str(e)[:200]}")

@recipes_router.get("/{recipe_id}")
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    for field in ["created_at", "updated_at"]:
        if recipe.get(field) and isinstance(recipe[field], str):
            try:
                recipe[field] = datetime.fromisoformat(recipe[field])
            except Exception:
                pass
    # Defensive defaults so legacy Ciano-style rows never crash Pydantic
    # validation on the way OUT (single dirty row was returning 500 for the
    # whole "Guardar Receta" round-trip).
    recipe.setdefault("allergens", [])
    recipe.setdefault("work_category", None)
    recipe.setdefault("recipe_code", None)
    recipe.setdefault("verified_status", "Draft")
    recipe.setdefault("name", "(sin nombre)")
    recipe.setdefault("category", "Otros")
    recipe.setdefault("yield_quantity", 1.0)
    recipe.setdefault("yield_unit", "portion")
    recipe.setdefault("ingredients", [])
    recipe.setdefault("sub_recipes", [])
    # Cost-completeness flags (populated on save; legacy recipes default to no errors).
    recipe.setdefault("conversion_errors", [])
    recipe.setdefault("conversion_errors_count", 0)
    recipe.setdefault("has_conversion_errors", False)
    try:
        return Recipe(**recipe).model_dump()
    except Exception as ve:
        # Never fail the whole request because of one strict validation
        # complaint. Return the raw dict — the FE already tolerates extra
        # fields and missing calculated ones.
        import logging
        logging.getLogger(__name__).warning(
            f"[get_recipe] Recipe(**recipe) validation failed for {recipe_id} — returning raw dict. err={ve}"
        )
        return recipe

@recipes_router.get("/{recipe_id}/cost-breakdown")
async def get_recipe_cost_breakdown(recipe_id: str, user: User = Depends(get_current_user)):
    """Derived breakdown of a recipe's food cost.

    Returns: `{ ingredients_total, sub_recipes_total, food_cost_total,
                consistency: {ok, delta_vs_stored} }`

    Consumed by the UI to show "Ingredientes: $X + Sub-recetas: $Y = $Total"
    below the "Costo Total Receta" label. Any silent drift becomes visible
    immediately.
    """
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0},
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ingredients_total = 0.0
    for ing in recipe.get("ingredients") or []:
        if (ing.get("item_type") == "recipe"):
            continue  # sub-recipe rows counted below
        ingredients_total += float(ing.get("total_cost") or ing.get("cost") or 0)

    sub_recipes_total = 0.0
    # inline sub-recipes in ingredients[] (legacy shape)
    for ing in recipe.get("ingredients") or []:
        if ing.get("item_type") == "recipe":
            sub_recipes_total += float(ing.get("total_cost") or ing.get("cost") or 0)
    # dedicated sub_recipes[]
    for sub in recipe.get("sub_recipes") or []:
        sub_recipes_total += float(sub.get("total_cost") or 0)

    derived_total = round(ingredients_total + sub_recipes_total, 4)
    stored_total = float(recipe.get("food_cost") or recipe.get("total_cost") or 0)
    delta = round(stored_total - derived_total, 4)

    # Enumerate direct + bubbled conversion errors. Consumed by menus/plated
    # menus and by the "Costo incompleto" banner in the recipe UI.
    direct_conv_errors = []
    for ing in recipe.get("ingredients") or []:
        ce = ing.get("conversion_error")
        if ce:
            direct_conv_errors.append({
                "source": "ingredient",
                "item_id": ing.get("item_id") or ing.get("ingredient_id"),
                "name": ing.get("item_name") or ing.get("name") or ce.get("ingredient_name") or "?",
                "from_unit": ce.get("from_unit"),
                "to_unit": ce.get("to_unit"),
                "reason": ce.get("reason"),
            })
    stored_conv_errors = recipe.get("conversion_errors") or []

    return {
        "recipe_id": recipe_id,
        "ingredients_total": round(ingredients_total, 4),
        "sub_recipes_total": round(sub_recipes_total, 4),
        "food_cost_total": derived_total,
        "stored_food_cost": round(stored_total, 4),
        "consistency": {
            "ok": abs(delta) <= 0.01,
            "delta_vs_stored": delta,
        },
        "conversion_errors": stored_conv_errors or direct_conv_errors,
        "conversion_errors_count": (
            recipe.get("conversion_errors_count")
            if recipe.get("conversion_errors_count") is not None
            else len(direct_conv_errors)
        ),
        "has_conversion_errors": bool(
            recipe.get("has_conversion_errors")
            or (stored_conv_errors and len(stored_conv_errors) > 0)
            or direct_conv_errors
        ),
    }


@recipes_router.put("/{recipe_id}")
async def update_recipe(recipe_id: str, data: RecipeCreate, user: User = Depends(get_current_user)):
    import logging
    _log = logging.getLogger(__name__)
    now = datetime.now(timezone.utc)

    try:
        # Check for circular dependencies in sub-recipes
        for sub in data.sub_recipes:
            sub_d = sub if isinstance(sub, dict) else sub.model_dump()
            child_id = sub_d.get("child_recipe_id")
            child_name = sub_d.get("child_recipe_name") or child_id
            if child_id and await check_circular_dependency(recipe_id, child_id, user.company_id):
                raise HTTPException(status_code=400, detail=f"Circular dependency detected with recipe {child_name}")

        # Recalculate costs including sub-recipes
        sub_recipes_data = [
            (s if isinstance(s, dict) else s.model_dump()) for s in (data.sub_recipes or [])
        ]
        try:
            food_cost, updated_ingredients, updated_sub_recipes, conv_errs = await calculate_recipe_cost(
                data.ingredients, sub_recipes_data, user.company_id
            )
        except Exception as calc_err:
            _log.exception(f"[update_recipe] calculate_recipe_cost failed for {recipe_id}: {calc_err}")
            # Fallback: keep whatever the FE sent, don't crash the save
            food_cost = 0.0
            updated_ingredients = [
                (i if isinstance(i, dict) else i.model_dump()) for i in (data.ingredients or [])
            ]
            updated_sub_recipes = sub_recipes_data
            conv_errs = []

        # Full costing (labor + overhead + suggested price + contribution)
        try:
            costing = await compute_full_recipe_costing(data.model_dump(), food_cost, user.company_id)
        except Exception as cost_err:
            _log.exception(f"[update_recipe] compute_full_recipe_costing failed for {recipe_id}: {cost_err}")
            costing = {"food_cost": food_cost, "total_cost_full": food_cost}

        update_data = {
            **data.model_dump(),
            "ingredients": updated_ingredients,
            "sub_recipes": updated_sub_recipes,
            "total_cost": food_cost,  # legacy
            **costing,
            "conversion_errors": conv_errs,
            "conversion_errors_count": len(conv_errs),
            "has_conversion_errors": len(conv_errs) > 0,
            "updated_at": now.isoformat()
        }

        # Auto-clear the "needs_review" flag once the recipe has actual content (≥1 ingredient or sub-recipe).
        if (len(updated_ingredients) > 0) or (len(updated_sub_recipes) > 0):
            update_data["needs_review"] = False

        result = await db.recipes.update_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recipe not found")

        # CASCADE FIX — recompute all parent recipes that use this recipe as a
        # sub-recipe (recursively). This closes the drift documented in the
        # bug report: editing a sub-recipe no longer leaves parents stale.
        # Proposals are NOT touched (they keep their `internal_cost` snapshot).
        try:
            await _recalc_parents_of_recipe(recipe_id, user.company_id)
        except Exception as parent_err:
            _log.warning(f"cascade recalc parents failed for {recipe_id}: {parent_err}")

        # Fase 2 SHADOW MODE — enqueue non-blocking cascade walk.
        # Zero mutations to recipes/menus outside `cost_staleness` collection.
        try:
            from services.cost_cascade import enqueue_cascade
            enqueue_cascade(
                company_id=user.company_id,
                root_type="recipe",
                root_id=recipe_id,
                trigger={
                    "kind": "recipe_update",
                    "recipe_id": recipe_id,
                    "new_food_cost": float(update_data.get("food_cost") or 0),
                    "user_id": getattr(user, "user_id", None),
                },
            )
        except Exception as e:
            _log.debug(f"shadow cascade enqueue skipped: {e}")

        return await get_recipe(recipe_id, user)
    except HTTPException:
        raise
    except Exception as e:
        _log.exception(f"[update_recipe] UNHANDLED error for recipe {recipe_id} / company {user.company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al guardar receta: {type(e).__name__}: {str(e)[:200]}")

@recipes_router.delete("/{recipe_id}")
async def delete_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    result = await db.recipes.delete_one({"recipe_id": recipe_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"message": "Recipe deleted"}

@recipes_router.post("/{recipe_id}/duplicate", response_model=Recipe)
async def duplicate_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    """Duplicate an existing recipe"""
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    now = datetime.now(timezone.utc)
    new_recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
    
    # Create new recipe with copied data
    new_recipe = {
        **recipe,
        "recipe_id": new_recipe_id,
        "name": f"{recipe['name']} (Copy)",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.recipes.insert_one(new_recipe)
    new_recipe.pop("_id", None)
    return new_recipe


# ============== RECIPE SCALING ==============
# Units that imply a discrete countable item (eggs, garlic cloves, lemons, etc.)
DISCRETE_UNIT_HINTS = {"unit", "units", "unidad", "unidades", "pieza", "piezas",
                       "ea", "each", "un", "u", "pza", "pzs", "pc", "pcs"}


def is_discrete_unit_for_ingredient(ingredient: dict) -> bool:
    """Decide whether an ingredient should round-up when scaled.
    Per-ingredient override wins; otherwise infer from unit name.
    """
    explicit = ingredient.get("is_discrete_unit")
    if explicit is True:
        return True
    if explicit is False:
        return False
    unit = str(ingredient.get("unit") or "").strip().lower()
    return unit in DISCRETE_UNIT_HINTS


def _scale_ingredient_line(ing: dict, factor: float) -> dict:
    qty = float(ing.get("quantity") or 0)
    scaled_raw = qty * factor
    discrete = is_discrete_unit_for_ingredient(ing)
    scaled_final = math.ceil(scaled_raw) if discrete and scaled_raw > 0 else round(scaled_raw, 3)
    unit_cost = float(ing.get("cost_per_unit") or ing.get("unit_cost") or 0)
    line_cost = scaled_final * unit_cost
    return {
        "ingredient_id": ing.get("ingredient_id"),
        "name": ing.get("name"),
        "unit": ing.get("unit"),
        "is_discrete_unit": discrete,
        "quantity_original": qty,
        "quantity_scaled_raw": round(scaled_raw, 4),
        "quantity_scaled": scaled_final,
        "cost_per_unit": unit_cost,
        "line_cost": round(line_cost, 4),
        "prep_method": ing.get("prep_method"),
        "yield_waste_percent": ing.get("yield_waste_percent") or 0,
    }




@recipes_router.post("/{recipe_id}/scale")
async def scale_recipe_preview(recipe_id: str, data: RecipeScalePreview, user: User = Depends(get_current_user)):
    """Return a scaled preview of a recipe without persisting anything.

    Linear scale for ingredients (and recursive for sub-recipes). Discrete-unit
    ingredients (eggs, lemons, etc.) round up. Per-ingredient override available
    via Ingredient.is_discrete_unit.
    """
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0},
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if data.target_portions <= 0:
        raise HTTPException(status_code=400, detail="target_portions must be > 0")

    portions_per_yield = float(recipe.get("portions_per_yield") or recipe.get("yield_quantity") or 1) or 1
    factor = data.target_portions / portions_per_yield

    # Enrich each ingredient line with current ingredient master data so cost reflects truth.
    ingredient_ids = [i.get("ingredient_id") for i in recipe.get("ingredients", []) if i.get("ingredient_id")]
    ing_master = {}
    if ingredient_ids:
        cursor = db.ingredients.find(
            {"ingredient_id": {"$in": ingredient_ids}, "company_id": user.company_id},
            # PASE A: pull cost_per_base_unit + density/wpu so cost_for_recipe_line
            # can convert line_unit → base_unit correctly (no more silent 150×
            # inflation when recipe uses ml and ingredient is priced per botella).
            {"_id": 0, "ingredient_id": 1, "name": 1, "unit": 1, "cost_per_unit": 1,
             "cost_per_base_unit": 1, "base_unit": 1, "density_g_per_ml": 1,
             "weight_per_unit_g": 1, "is_discrete_unit": 1, "yield_waste_percent": 1,
             "purchase_incomplete": 1},
        )
        async for doc in cursor:
            ing_master[doc["ingredient_id"]] = doc

    from utils.units import cost_for_recipe_line as _cfl_scale, UnitConversionError as _UCE_scale

    scaled_ingredients = []
    for ing in recipe.get("ingredients", []):
        merged = {**ing}
        master = ing_master.get(ing.get("ingredient_id"))
        if master:
            # Master is source of truth for cost and discrete flag
            merged["unit"] = merged.get("unit") or master.get("unit")
            if "is_discrete_unit" not in merged or merged.get("is_discrete_unit") is None:
                merged["is_discrete_unit"] = master.get("is_discrete_unit")
            if not merged.get("name"):
                merged["name"] = master.get("name")
            # PASE A: derive line cost via cost_for_recipe_line — it respects
            # base_unit vs line_unit and returns a proper $ total. Then the
            # per-unit price shown in the UI is total / qty_scaled.
            qty_base = float(merged.get("quantity") or 0)
            factor_scaled = qty_base * factor
            try:
                line_total = _cfl_scale(factor_scaled, merged.get("unit") or "unit", master)
                merged["cost_per_unit"] = round(line_total / factor_scaled, 6) if factor_scaled > 0 else 0
            except _UCE_scale:
                # Unresolved unit conversion → surface as zero cost so the UI
                # can flag it (existing "Costo incompleto" pipeline). Do not
                # fall back to inflated cost_per_unit which is per-pack.
                merged["cost_per_unit"] = 0
        scaled_ingredients.append(_scale_ingredient_line(merged, factor))

    # Sub-recipes scale recursively (one level — UI rarely needs deeper)
    scaled_sub_recipes = []
    for sub in recipe.get("sub_recipes", []):
        sub_qty = float(sub.get("quantity") or 0) * factor
        scaled_sub_recipes.append({
            "child_recipe_id": sub.get("child_recipe_id"),
            "name": sub.get("name"),
            "unit": sub.get("unit"),
            "quantity_original": float(sub.get("quantity") or 0),
            "quantity_scaled": round(sub_qty, 3),
        })

    total_cost_scaled = sum((x["line_cost"] for x in scaled_ingredients), 0.0)
    cost_per_portion_scaled = (total_cost_scaled / data.target_portions) if data.target_portions > 0 else 0

    return {
        "recipe_id": recipe_id,
        "recipe_name": recipe.get("name"),
        "portions_per_yield": portions_per_yield,
        "target_portions": data.target_portions,
        "scale_factor": round(factor, 4),
        "ingredients": scaled_ingredients,
        "sub_recipes": scaled_sub_recipes,
        "total_cost_scaled": round(total_cost_scaled, 4),
        "cost_per_portion_scaled": round(cost_per_portion_scaled, 4),
        "original_cost_per_portion": float(recipe.get("cost_per_portion") or 0),
    }




@recipes_router.post("/save-scaled-menu")
async def save_scaled_menu(data: SaveScaledMenuRequest, user: User = Depends(get_current_user)):
    """Persist a Menu (shape compatible with the standard catalog Menu used by PackagePicker)
    that snapshots scaled recipe(s). The base recipes are NOT modified.

    Writes to db.menus (same collection PackagePicker reads) with menu_type='Scaled' so it
    surfaces in Settings → Catálogos → Menús and the Proposal Editor menu dropdown automatically.
    """
    if not data.recipes:
        raise HTTPException(status_code=400, detail="At least one recipe is required")

    now = datetime.now(timezone.utc)
    menu_id = f"menu_{uuid.uuid4().hex[:12]}"

    # Build items in the MenuItemEntry shape so enrich_menu_items() works as-is
    items = []
    total_cost = 0.0
    total_price = 0.0
    snapshots = []  # extra metadata for the scaled UX (not used by PackagePicker)
    for entry in data.recipes:
        recipe_id = entry.get("recipe_id")
        target_portions = float(entry.get("target_portions") or 0)
        if not recipe_id or target_portions <= 0:
            continue
        preview = await scale_recipe_preview(
            recipe_id,
            RecipeScalePreview(target_portions=target_portions, event_id=data.event_id),
            user,
        )
        item_cost = preview["total_cost_scaled"]
        unit_price = float(entry.get("unit_price") or 0)
        line_price = unit_price if unit_price > 0 else item_cost
        # Standard MenuItemEntry-compatible fields (so PackagePicker can render it)
        items.append({
            "item_id": f"mi_{uuid.uuid4().hex[:10]}",
            "recipe_id": recipe_id,
            "picklist_item_id": None,
            "custom_name": preview["recipe_name"],
            "custom_description": (
                f"Escalado para {int(target_portions)} porciones (factor ×{preview['scale_factor']})"
            ),
            "quantity": target_portions,
            "unit_price_override": line_price / target_portions if target_portions > 0 else line_price,
            "internal_cost_override": preview["cost_per_portion_scaled"],
            "sort_order": len(items),
        })
        snapshots.append({
            "recipe_id": recipe_id,
            "target_portions": target_portions,
            "scale_factor": preview["scale_factor"],
            "ingredients_snapshot": preview["ingredients"],
            "sub_recipes_snapshot": preview["sub_recipes"],
        })
        total_cost += item_cost
        total_price += line_price

    if not items:
        raise HTTPException(status_code=400, detail="No valid recipes to save")

    menu_doc = {
        "menu_id": menu_id,
        "company_id": user.company_id,
        "name": data.name,
        "name_es": data.name,
        "description": data.description,
        "description_es": data.description,
        "menu_type": "Scaled",  # distinguishes from regular catalog menus & PackagePicker shows a tag
        "category_id": None,
        "items": items,
        "variants": [],
        "default_price": round(total_price, 4),
        "is_fixed_price": False,
        "is_active": True,
        # Scaled-specific extras (extra='allow' on Menu model — fine since we never strict-parse this back)
        "source": "recipe_scaling",
        "source_event_id": data.event_id,
        "scaled_snapshots": snapshots,
        "total_cost": round(total_cost, 4),
        "total_price": round(total_price, 4),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id,
    }
    await db.menus.insert_one(menu_doc)
    menu_doc.pop("_id", None)
    return menu_doc


@recipes_router.get("/{recipe_id}/cost-history")
async def get_recipe_cost_history(recipe_id: str, user: User = Depends(get_current_user)):
    """Get cost history for a recipe's ingredients"""
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    cost_history = []
    for ing in recipe.get("ingredients", []):
        if ing.get("item_type") == "ingredient":
            ing_item_id = ing.get("item_id") or ing.get("ingredient_id")
            ingredient = await db.ingredients.find_one(
                {"ingredient_id": ing_item_id, "company_id": user.company_id},
                {"_id": 0, "name": 1, "price_history": 1, "cost_per_unit": 1}
            )
            if ingredient:
                cost_history.append({
                    "item_id": ing_item_id,
                    "item_name": ingredient.get("name"),
                    "current_cost": ingredient.get("cost_per_unit", 0),
                    "price_history": ingredient.get("price_history", [])
                })
    
    return {
        "recipe_id": recipe_id,
        "recipe_name": recipe.get("name"),
        "ingredient_cost_history": cost_history
    }


@recipes_router.post("/ai-analyze")
async def ai_analyze_recipe(data: dict, user: User = Depends(get_current_user)):
    """Use AI to analyze recipe and suggest quantities"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    recipe_name = data.get("name", "")
    servings = data.get("servings", 1)
    ingredients = data.get("ingredients", [])
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    chat = LlmChat(api_key=api_key, session_id=f"recipe_{uuid.uuid4().hex[:8]}", system_message="You are a professional chef and recipe cost analyst. Provide accurate ingredient quantities and cooking guidance. Always respond in JSON format.").with_model("openai", "gpt-5.2")
    
    prompt = f"""Analyze this recipe and suggest accurate ingredient quantities:
Recipe: {recipe_name}
Servings: {servings}
Current ingredients: {ingredients}

Provide suggestions in this JSON format:
{{"ingredients": [{{"name": "ingredient name", "quantity": number, "unit": "unit", "notes": "any tips"}}], "cooking_tips": ["tip1", "tip2"], "estimated_prep_time_minutes": number, "estimated_cook_time_minutes": number}}"""
    
    try:
        response = await chat.send_message(UserMessage(text=prompt))
        import json
        response_text = response.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        raise HTTPException(status_code=500, detail="AI analysis failed")

@recipes_router.post("/suggest-ingredients-bulk")
async def suggest_ingredients_bulk(data: dict, user: User = Depends(get_current_user)):
    """For every recipe with needs_review=true (or for an explicit list of recipe_ids),
    ask Claude for an ingredient list and persist it. Keeps needs_review=true so
    the human still has to open + save each recipe to confirm.
    body: { recipe_ids?: [str], limit?: int (default 25), language?: 'es'|'en' }
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as _json
    import asyncio as _asyncio

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    explicit_ids = data.get("recipe_ids") or []
    limit = int(data.get("limit") or 25)
    language = (data.get("language") or "es").lower()

    query = {"company_id": user.company_id, "needs_review": True}
    if explicit_ids:
        query = {"company_id": user.company_id, "recipe_id": {"$in": explicit_ids}}
    recipes = await db.recipes.find(query, {"_id": 0, "recipe_id": 1, "name": 1, "portions_per_yield": 1, "ingredients": 1}).to_list(limit)

    sem = _asyncio.Semaphore(3)  # cap concurrency

    async def process_one(rec):
        async with sem:
            try:
                if (rec.get("ingredients") or []) and len(rec["ingredients"]) > 0:
                    return {"recipe_id": rec["recipe_id"], "name": rec.get("name"), "status": "skipped_has_ingredients"}
                sys_msg = (
                    "Eres un chef profesional para un ERP de catering. Devuelves SIEMPRE JSON puro."
                    if language == "es" else
                    "You are a professional chef for a catering ERP. Always respond in pure JSON."
                )
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"recipe_bulk_{rec['recipe_id']}",
                    system_message=sys_msg,
                ).with_model("anthropic", "claude-sonnet-4-5-20250929")
                servings = int(rec.get("portions_per_yield") or 1)
                if language == "es":
                    prompt = f"""Receta: {rec['name']}
Porciones: {servings}
JSON exacto:
{{"ingredients":[{{"name":"...","quantity":num,"unit":"kg|g|L|ml|unidad","cost":num}}],"prep_time_minutes":num,"cook_time_minutes":num,"allergens":[],"dietary_tags":[]}}
5-12 ingredientes principales. Costos USD realistas."""
                else:
                    prompt = f"""Recipe: {rec['name']}
Servings: {servings}
Exact JSON:
{{"ingredients":[{{"name":"...","quantity":num,"unit":"kg|g|L|ml|unit","cost":num}}],"prep_time_minutes":num,"cook_time_minutes":num,"allergens":[],"dietary_tags":[]}}
5-12 main ingredients. Realistic USD costs."""
                response = await chat.send_message(UserMessage(text=prompt))
                text = response.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.startswith("```"):
                    text = text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                parsed = _json.loads(text.strip())
                ai_ings = parsed.get("ingredients") or []
                if not ai_ings:
                    return {"recipe_id": rec["recipe_id"], "name": rec.get("name"), "status": "no_suggestions"}
                # Build ingredient docs (no inventory link — temp)
                now = datetime.now(timezone.utc).isoformat()
                ingredients_doc = []
                total_cost = 0.0
                for idx, ing in enumerate(ai_ings):
                    qty = float(ing.get("quantity") or 0)
                    cost = float(ing.get("cost") or 0)
                    total_cost += cost
                    ingredients_doc.append({
                        "item_id": f"temp_ai_{uuid.uuid4().hex[:8]}",
                        "name": ing.get("name") or "",
                        "quantity": qty,
                        "unit": ing.get("unit") or "unidad",
                        "waste_factor": 0,
                        "cost_per_unit": (cost / qty) if qty > 0 else 0,
                        "cost": cost,
                        "notes": ing.get("notes") or "",
                        "ai_suggested": True,
                    })
                cost_per_portion = (total_cost / servings) if servings > 0 else total_cost
                update = {
                    "ingredients": ingredients_doc,
                    "total_cost": round(total_cost, 4),
                    "cost_per_portion": round(cost_per_portion, 4),
                    "prep_time_minutes": parsed.get("prep_time_minutes") or 0,
                    "cook_time_minutes": parsed.get("cook_time_minutes") or 0,
                    "allergens": parsed.get("allergens") or [],
                    "dietary_tags": parsed.get("dietary_tags") or [],
                    # KEEP needs_review=True — human must confirm
                    "ai_bulk_filled_at": now,
                    "updated_at": now,
                }
                await db.recipes.update_one(
                    {"recipe_id": rec["recipe_id"], "company_id": user.company_id},
                    {"$set": update},
                )
                return {"recipe_id": rec["recipe_id"], "name": rec.get("name"), "status": "filled", "ingredient_count": len(ingredients_doc)}
            except Exception as exc:
                logger.error(f"AI bulk suggestion failed for {rec.get('name')}: {exc}")
                return {"recipe_id": rec.get("recipe_id"), "name": rec.get("name"), "status": "error", "error": str(exc)[:200]}

    results = await _asyncio.gather(*(process_one(r) for r in recipes))
    summary = {
        "processed": len(results),
        "filled": sum(1 for r in results if r.get("status") == "filled"),
        "skipped": sum(1 for r in results if r.get("status") in ("skipped_has_ingredients", "no_suggestions")),
        "errors": sum(1 for r in results if r.get("status") == "error"),
        "results": results,
    }
    return summary

@recipes_router.post("/suggest-ingredients")
async def suggest_recipe_ingredients(data: dict, user: User = Depends(get_current_user)):
    """Given just a recipe name (and optional servings), use Claude to propose
    a structured list of ingredients with quantity, unit, and approximate cost.
    Designed for completing auto-created recipe stubs from bulk picklist add."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    recipe_name = (data.get("name") or "").strip()
    servings = int(data.get("servings") or 1)
    language = (data.get("language") or "es").lower()
    if not recipe_name:
        raise HTTPException(status_code=400, detail="Recipe name is required")

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    sys_msg = (
        "Eres un chef profesional y analista de costos para un ERP de catering. "
        "Cuando te den el nombre de una receta, devuelves una lista estructurada de "
        "ingredientes con cantidad, unidad y costo aproximado en USD. Sé realista y conciso. "
        "Responde SIEMPRE en JSON puro, sin explicaciones."
        if language == "es"
        else "You are a professional chef and cost analyst for a catering ERP. "
        "Given a recipe name, return a structured list of ingredients with quantity, unit, and approximate USD cost. "
        "Be realistic and concise. Always respond in pure JSON, no commentary."
    )

    chat = LlmChat(
        api_key=api_key,
        session_id=f"recipe_suggest_{uuid.uuid4().hex[:8]}",
        system_message=sys_msg,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    prompt_es = f"""Receta: {recipe_name}
Porciones: {servings}

Devuelve EXACTAMENTE este JSON:
{{
  "ingredients": [
    {{"name": "nombre del ingrediente (en español)", "quantity": número, "unit": "kg|g|L|ml|unidad|taza|cda", "cost": número, "notes": "opcional"}}
  ],
  "prep_time_minutes": número,
  "cook_time_minutes": número,
  "allergens": ["lácteos", "gluten", "frutos secos", ...],
  "dietary_tags": ["vegetariano", "sin gluten", ...]
}}
Entrega 5-12 ingredientes principales. Costos en USD realistas para una cocina comercial."""

    prompt_en = f"""Recipe: {recipe_name}
Servings: {servings}

Return EXACTLY this JSON:
{{
  "ingredients": [
    {{"name": "ingredient name", "quantity": number, "unit": "kg|g|L|ml|unit|cup|tbsp", "cost": number, "notes": "optional"}}
  ],
  "prep_time_minutes": number,
  "cook_time_minutes": number,
  "allergens": ["dairy", "gluten", "nuts", ...],
  "dietary_tags": ["vegetarian", "gluten-free", ...]
}}
Provide 5-12 main ingredients. Realistic USD costs for a commercial kitchen."""

    prompt = prompt_es if language == "es" else prompt_en

    try:
        response = await chat.send_message(UserMessage(text=prompt))
        import json as _json
        text = response.strip()
        # Strip possible code fences
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        parsed = _json.loads(text)
        # Sanity defaults
        parsed.setdefault("ingredients", [])
        parsed.setdefault("allergens", [])
        parsed.setdefault("dietary_tags", [])
        # Compute total estimated cost
        total = 0.0
        for ing in parsed["ingredients"]:
            try:
                total += float(ing.get("cost") or 0)
            except Exception:
                pass
        parsed["estimated_total_cost"] = round(total, 2)
        parsed["estimated_cost_per_portion"] = round(total / servings, 2) if servings > 0 else total
        return parsed
    except Exception as e:
        logger.error(f"AI suggest-ingredients error: {e}")
        raise HTTPException(status_code=500, detail=f"AI suggestion failed: {str(e)[:200]}")

@recipes_router.post("/recalculate-all")
async def recalculate_all_recipes(
    dry_run: bool = True,
    user: User = Depends(get_current_user),
):
    """Recalculate costs for ALL recipes with the latest ingredient prices + waste defaults.
    
    Modes:
      - dry_run=true (default): returns a report comparing old vs new without persisting.
      - dry_run=false: persists the recalculated values.
    """
    recipes = await db.recipes.find({"company_id": user.company_id}, {"_id": 0}).to_list(2000)

    changes = []
    unchanged_count = 0
    total_diff = 0.0  # for avg
    diff_buckets = {"increase": 0, "decrease": 0, "same": 0}

    for recipe in recipes:
        old_total = float(recipe.get("total_cost") or 0)
        old_per_portion = float(recipe.get("cost_per_portion") or 0)

        try:
            ingredients = [RecipeIngredient(**i) for i in recipe.get("ingredients", [])]
        except Exception:
            # be permissive — skip the legacy line we cannot parse but still attempt
            continue
        sub_recipes = recipe.get("sub_recipes", [])
        new_total, updated_ingredients, updated_sub_recipes, conv_errs = await calculate_recipe_cost(
            ingredients, sub_recipes, user.company_id,
        )

        yield_qty = float(recipe.get("yield_quantity") or 1) or 1
        portion_size = float(recipe.get("portion_size") or 1) or 1
        sell_price = float(recipe.get("sell_price") or 0)

        new_per_yield = new_total / yield_qty if yield_qty > 0 else 0
        new_per_portion = new_per_yield / portion_size if portion_size > 0 else new_per_yield
        new_food_cost_pct = (new_per_portion / sell_price * 100) if sell_price > 0 else 0

        # Compute full costing (labor + overhead + suggested price + contribution)
        full_costing = await compute_full_recipe_costing(recipe, new_total, user.company_id)

        diff = new_total - old_total
        diff_pct = (diff / old_total * 100) if old_total > 0 else (100 if new_total > 0 else 0)

        # Persist full costing even if food_cost didn't change — labor/overhead/target-food-%
        # config may have changed and we want every recipe up-to-date.
        if not dry_run:
            await db.recipes.update_one(
                {"recipe_id": recipe["recipe_id"], "company_id": user.company_id},
                {"$set": {
                    "ingredients": updated_ingredients,
                    "sub_recipes": updated_sub_recipes,
                    "total_cost": new_total,
                    **full_costing,
                    "conversion_errors": conv_errs,
                    "conversion_errors_count": len(conv_errs),
                    "has_conversion_errors": len(conv_errs) > 0,
                    "last_cost_recalc_at": datetime.now(timezone.utc).isoformat(),
                }}
            )

        if abs(diff) < 0.005:  # < half a cent
            unchanged_count += 1
            diff_buckets["same"] += 1
            continue

        diff_buckets["increase" if diff > 0 else "decrease"] += 1
        if old_total > 0:
            total_diff += diff_pct

        changes.append({
            "recipe_id": recipe["recipe_id"],
            "name": recipe.get("name"),
            "old_total_cost": round(old_total, 4),
            "new_total_cost": round(new_total, 4),
            "old_cost_per_portion": round(old_per_portion, 4),
            "new_cost_per_portion": round(new_per_portion, 4),
            "diff_amount": round(diff, 4),
            "diff_pct": round(diff_pct, 2),
            "sell_price": sell_price,
            "new_food_cost_pct": round(new_food_cost_pct, 2),
            # Sprint P0 fields
            "labor_cost": full_costing["labor_cost"],
            "overhead_cost": full_costing["overhead_cost"],
            "total_cost_full": full_costing["total_cost_full"],
            "total_cost_percent": full_costing["total_cost_percent"],
            "contribution_dollar": full_costing["contribution_dollar"],
            "contribution_percent": full_costing["contribution_percent"],
            "suggested_sell_price": full_costing["suggested_sell_price"],
        })

    # Sort by absolute diff_pct desc
    changes.sort(key=lambda c: abs(c["diff_pct"]), reverse=True)

    avg_diff_pct = (total_diff / len(changes)) if changes else 0

    # After applying (not dry-run), alert admins about big cost jumps (>10% increase)
    if not dry_run and changes:
        big_jumps = [c for c in changes if c.get("diff_pct", 0) >= 10.0][:5]
        if big_jumps:
            try:
                from routers.notifications import notify_org_admins
                lines = [f"• {c['name']}: +{c['diff_pct']:.1f}% (${c['old_total_cost']:.2f} → ${c['new_total_cost']:.2f})" for c in big_jumps]
                await notify_org_admins(
                    org_id=user.company_id,
                    notification_type="recipe_cost_spike",
                    title=f"⚠️ {len(big_jumps)} receta{'s' if len(big_jumps) != 1 else ''} con aumento de costo >10%",
                    message="Se aplicó el recálculo de costos. Revisa estas recetas y considera ajustar precios de venta:\n" + "\n".join(lines),
                    link="/food-ops/recipes",
                    metadata={
                        "recipe_ids": [c.get("recipe_id") for c in big_jumps if c.get("recipe_id")],
                        "trigger": "recalculate_all_recipes",
                        "total_changed": len(changes),
                        "increase_count": diff_buckets["increase"],
                    },
                    priority="high",
                )
            except Exception as _e:
                logger.warning(f"Recipe cost spike notification failed (non-fatal): {_e}")

    return {
        "dry_run": dry_run,
        "total_recipes": len(recipes),
        "changed_count": len(changes),
        "unchanged_count": unchanged_count,
        "increase_count": diff_buckets["increase"],
        "decrease_count": diff_buckets["decrease"],
        "avg_diff_pct": round(avg_diff_pct, 2),
        "changes": changes[:200],  # cap UI payload
        "applied": not dry_run,
    }


@recipes_router.post("/repair-nan")
async def repair_nan_recipes(user: User = Depends(get_current_user)):
    """Repair rows already poisoned with NaN / stringified 'nan' costs.

    Root cause: a previous `recalculate-all` pass persisted `float('nan')` for
    recipes whose prep_time / cook_time was stored as the string 'nan'. Any
    subsequent `GET /api/recipes` for that tenant then 500s because FastAPI's
    JSON encoder refuses to serialize NaN.

    This endpoint scans the tenant's recipes and coerces:
      - prep_time / prep_time_minutes / cook_time / cook_time_minutes /
        labor_minutes / yield_quantity / portions_per_yield → 0 (or 1 for
        yield_quantity / portions_per_yield when 0 would break math)
      - labor_cost / overhead_cost / total_cost_full / cost_per_yield /
        cost_per_portion / total_cost_per_portion / food_cost_percent /
        total_cost_percent / contribution_dollar / contribution_percent /
        suggested_sell_price / price_gap_pct / total_cost → 0

    Idempotent. Returns a report of the recipes that were repaired.
    """
    scanned = 0
    repaired = []

    numeric_zero_fields = [
        "labor_cost", "overhead_cost", "total_cost_full", "cost_per_yield",
        "cost_per_portion", "total_cost_per_portion", "prime_cost_per_portion",
        "food_cost_percent", "total_cost_percent", "contribution_dollar",
        "contribution_percent", "suggested_sell_price", "price_gap_pct",
        "total_cost", "food_cost", "prep_time", "prep_time_minutes",
        "cook_time", "cook_time_minutes", "labor_minutes", "sell_price",
    ]
    numeric_one_fields = ["yield_quantity", "portions_per_yield"]

    async for r in db.recipes.find(
        {"company_id": user.company_id}, {"_id": 0}
    ):
        scanned += 1
        updates: Dict[str, Any] = {}
        for f in numeric_zero_fields:
            if f in r:
                clean = _safe_float(r.get(f), 0)
                if r.get(f) != clean and not (isinstance(r.get(f), (int, float)) and clean == float(r.get(f) or 0)):
                    updates[f] = clean
        for f in numeric_one_fields:
            if f in r:
                clean = _safe_float(r.get(f), 1) or 1
                if r.get(f) != clean and not (isinstance(r.get(f), (int, float)) and clean == float(r.get(f) or 0)):
                    updates[f] = clean
        if updates:
            await db.recipes.update_one(
                {"recipe_id": r["recipe_id"], "company_id": user.company_id},
                {"$set": updates},
            )
            repaired.append({
                "recipe_id": r["recipe_id"],
                "name": r.get("name"),
                "fixed_fields": list(updates.keys()),
            })
    return {
        "scanned": scanned,
        "repaired_count": len(repaired),
        "repaired": repaired[:100],
    }
@recipes_router.get("/{recipe_id}/portion-formats")
async def get_recipe_portion_formats(recipe_id: str, user: User = Depends(get_current_user)):
    """Get all portion formats for a recipe"""
    formats = await db.recipe_portion_formats.find(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(50)
    return formats

@recipes_router.post("/{recipe_id}/portion-formats")
async def create_recipe_portion_format(recipe_id: str, data: RecipePortionFormatCreate, user: User = Depends(get_current_user)):
    """Create a new portion format for a recipe"""
    # Get recipe to calculate cost
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    now = datetime.now(timezone.utc)
    format_id = f"pformat_{uuid.uuid4().hex[:12]}"
    
    # Calculate cost per portion using total_cost divided by portions_obtained
    total_cost = recipe.get("total_cost", 0)
    cost_per_portion = total_cost / data.portions_obtained if data.portions_obtained > 0 else 0
    
    # Calculate suggested price if target margin provided
    suggested_price = 0.0
    margin_pct = 0.0
    if data.target_margin_pct and data.target_margin_pct > 0 and data.target_margin_pct < 100:
        suggested_price = cost_per_portion / (1 - data.target_margin_pct / 100)
    
    # Calculate actual margin if sell price provided
    if data.sell_price > 0:
        margin_pct = ((data.sell_price - cost_per_portion) / data.sell_price * 100) if data.sell_price > 0 else 0
    
    # If this is default, unset other defaults
    if data.is_default:
        await db.recipe_portion_formats.update_many(
            {"recipe_id": recipe_id, "company_id": user.company_id},
            {"$set": {"is_default": False}}
        )
    
    portion_format = {
        "format_id": format_id,
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        "format_name": data.format_name,
        "portions_obtained": data.portions_obtained,
        "portion_unit": data.portion_unit,
        "sell_price": data.sell_price,
        "sell_price_tax_included": data.sell_price_tax_included,
        "target_margin_pct": data.target_margin_pct,
        "suggested_price": round(suggested_price, 2),
        "cost_per_portion": round(cost_per_portion, 2),
        "margin_pct": round(margin_pct, 2),
        "is_default": data.is_default,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.recipe_portion_formats.insert_one(portion_format)
    del portion_format["_id"]
    return portion_format

@recipes_router.put("/{recipe_id}/portion-formats/{format_id}")
async def update_recipe_portion_format(recipe_id: str, format_id: str, data: RecipePortionFormatCreate, user: User = Depends(get_current_user)):
    """Update a portion format"""
    # Get recipe to recalculate cost
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    now = datetime.now(timezone.utc)
    recipe_cost_per_yield = recipe.get("cost_per_yield", 0)
    cost_per_portion = recipe_cost_per_yield / data.portions_obtained if data.portions_obtained > 0 else 0
    
    suggested_price = 0.0
    margin_pct = 0.0
    if data.target_margin_pct and data.target_margin_pct > 0 and data.target_margin_pct < 100:
        suggested_price = cost_per_portion / (1 - data.target_margin_pct / 100)
    if data.sell_price > 0:
        margin_pct = ((data.sell_price - cost_per_portion) / data.sell_price * 100) if data.sell_price > 0 else 0
    
    if data.is_default:
        await db.recipe_portion_formats.update_many(
            {"recipe_id": recipe_id, "company_id": user.company_id, "format_id": {"$ne": format_id}},
            {"$set": {"is_default": False}}
        )
    
    result = await db.recipe_portion_formats.update_one(
        {"format_id": format_id, "recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": {
            "format_name": data.format_name,
            "portions_obtained": data.portions_obtained,
            "portion_unit": data.portion_unit,
            "sell_price": data.sell_price,
            "sell_price_tax_included": data.sell_price_tax_included,
            "target_margin_pct": data.target_margin_pct,
            "suggested_price": round(suggested_price, 2),
            "cost_per_portion": round(cost_per_portion, 2),
            "margin_pct": round(margin_pct, 2),
            "is_default": data.is_default,
            "notes": data.notes,
            "updated_at": now.isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Portion format not found")
    return {"message": "Updated"}

@recipes_router.delete("/{recipe_id}/portion-formats/{format_id}")
async def delete_recipe_portion_format(recipe_id: str, format_id: str, user: User = Depends(get_current_user)):
    """Delete a portion format"""
    result = await db.recipe_portion_formats.delete_one(
        {"format_id": format_id, "recipe_id": recipe_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Portion format not found")
    return {"message": "Deleted"}


class GeneratePicklistFromFormatsRequest(BaseModel):
    format_ids: List[str]
    category_id: str
    name_prefix: Optional[str] = None  # Defaults to recipe name
    item_type: str = "Food"
    skip_if_exists: bool = True  # Skip if an item with the same recipe_portion_format_id already exists


@recipes_router.post("/{recipe_id}/generate-picklist-items")
async def generate_picklist_items_from_formats(
    recipe_id: str,
    data: GeneratePicklistFromFormatsRequest,
    user: User = Depends(get_current_user),
):
    """Create one picklist (catalog) item per selected portion format.
    Each item is linked to the recipe + specific format so it inherits cost & price."""
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    formats = await db.recipe_portion_formats.find(
        {"recipe_id": recipe_id, "company_id": user.company_id, "format_id": {"$in": data.format_ids}},
        {"_id": 0},
    ).to_list(50)
    if not formats:
        raise HTTPException(status_code=400, detail="No matching formats found")

    # Map for ordering same as request
    format_by_id = {f["format_id"]: f for f in formats}
    now = datetime.now(timezone.utc)
    base_name = (data.name_prefix or recipe.get("name") or "Item").strip()

    # Existing items linked to these formats (for skip)
    existing = set()
    if data.skip_if_exists:
        exist_docs = await db.picklist_items.find(
            {
                "company_id": user.company_id,
                "recipe_id": recipe_id,
                "recipe_portion_format_id": {"$in": data.format_ids},
            },
            {"_id": 0, "recipe_portion_format_id": 1},
        ).to_list(100)
        existing = {d["recipe_portion_format_id"] for d in exist_docs}

    created = []
    skipped = []
    for fmt_id in data.format_ids:
        fmt = format_by_id.get(fmt_id)
        if not fmt:
            continue
        if fmt_id in existing:
            skipped.append({"format_id": fmt_id, "format_name": fmt.get("format_name"), "reason": "exists"})
            continue
        item_id = f"pli_{uuid.uuid4().hex[:12]}"
        sell_price = fmt.get("sell_price") or fmt.get("suggested_price") or 0
        doc = {
            "item_id": item_id,
            "company_id": user.company_id,
            "name": f"{base_name} - {fmt.get('format_name')}",
            "description": None,
            "category_id": data.category_id,
            "item_type": data.item_type,
            "default_price": float(sell_price),
            "internal_cost": None,
            "recipe_id": recipe_id,
            "recipe_portion_format_id": fmt_id,
            "inventory_item_id": None,
            "unit": fmt.get("portion_unit") or "unit",
            "is_active": True,
            "min_margin_pct": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.picklist_items.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc)

    return {"created": len(created), "skipped": len(skipped), "items": created, "skipped_details": skipped}


# ============== RECIPE PACKAGING FORMATS ROUTES ==============

@recipes_router.get("/{recipe_id}/packaging-formats")
async def get_recipe_packaging_formats(recipe_id: str, user: User = Depends(get_current_user)):
    """Get all packaging formats for a recipe"""
    formats = await db.recipe_packaging_formats.find(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(50)
    return formats

@recipes_router.post("/{recipe_id}/packaging-formats")
async def create_recipe_packaging_format(recipe_id: str, data: RecipePackagingFormatCreate, user: User = Depends(get_current_user)):
    """Create a new packaging format for a recipe"""
    # Get packaging item details including cost
    packaging_item = await db.ingredients.find_one(
        {"ingredient_id": data.packaging_inventory_item_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "cost_per_unit": 1, "unit": 1}
    )
    
    cost_per_unit = packaging_item.get("cost_per_unit", 0) if packaging_item else 0
    cost_per_portion = cost_per_unit * data.qty_per_portion
    
    format_id = f"pkgformat_{uuid.uuid4().hex[:12]}"
    packaging_format = {
        "format_id": format_id,
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        "packaging_inventory_item_id": data.packaging_inventory_item_id,
        "packaging_item_name": packaging_item.get("name") if packaging_item else None,
        "unit": packaging_item.get("unit") if packaging_item else None,
        "cost_per_unit": cost_per_unit,
        "cost_per_portion": round(cost_per_portion, 4),
        "qty_per_portion": data.qty_per_portion,
        "notes": data.notes
    }
    await db.recipe_packaging_formats.insert_one(packaging_format)
    del packaging_format["_id"]
    return packaging_format

@recipes_router.delete("/{recipe_id}/packaging-formats/{format_id}")
async def delete_recipe_packaging_format(recipe_id: str, format_id: str, user: User = Depends(get_current_user)):
    """Delete a packaging format"""
    result = await db.recipe_packaging_formats.delete_one(
        {"format_id": format_id, "recipe_id": recipe_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Packaging format not found")
    return {"message": "Deleted"}

# ============== RECIPE EXTENDED FIELDS ROUTES ==============

@recipes_router.put("/{recipe_id}/extended")
async def update_recipe_extended(recipe_id: str, data: RecipeExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended recipe fields (allergens, work_category, etc.)"""
    update_data = {}
    if data.allergens is not None:
        update_data["allergens"] = data.allergens
    if data.work_category is not None:
        update_data["work_category"] = data.work_category
    if data.recipe_code is not None:
        update_data["recipe_code"] = data.recipe_code
    if data.verified_status is not None:
        update_data["verified_status"] = data.verified_status
    
    if not update_data:
        return {"message": "No updates provided"}
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"message": "Updated"}

@recipes_router.post("/{recipe_id}/image")
async def upload_recipe_image(recipe_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload an image for a recipe"""
    # Verify recipe exists
    recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, GIF")
    
    # Create unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"recipe_{recipe_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    
    # Save file
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update recipe with image URL
    image_url = f"/api/uploads/{filename}"
    await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": {"image_url": image_url, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"image_url": image_url, "filename": filename}

@recipes_router.delete("/{recipe_id}/image")
async def delete_recipe_image(recipe_id: str, user: User = Depends(get_current_user)):
    """Delete recipe image"""
    recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    # Delete file if exists
    if recipe.get("image_url"):
        filename = recipe["image_url"].split("/")[-1]
        filepath = UPLOADS_DIR / filename
        if filepath.exists():
            filepath.unlink()
    
    # Update recipe
    await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": {"image_url": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Image deleted"}
