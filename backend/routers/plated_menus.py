"""
Plated Menus — Culinary Intelligence.

Includes: CRUD, cost recalculation (snapshot vs live), staleness detection,
projected cost (buffet consumption factors), and conversion to catalog menus.

Extracted from server.py in the refactor sprint. LOGIC UNCHANGED.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from models.plated_menus import PlatedMenuCreate
from routers.buffet_factors import _resolve_buffet_factor


plated_menus_router = APIRouter(prefix="/plated-menus", tags=["Plated Menus"])


async def calculate_menu_cost(courses: List[Dict], company_id: str) -> float:
    """Calculate total cost per guest for a plated menu"""
    total_cost = 0.0

    for course in courses:
        for item in course.get("items", []):
            recipe_id = item.get("recipe_id")
            portions_per_guest = item.get("portions_per_guest", 1)

            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": company_id},
                {"_id": 0, "cost_per_portion": 1}
            )
            if recipe:
                total_cost += recipe.get("cost_per_portion", 0) * portions_per_guest

    return round(total_cost, 4)


@plated_menus_router.get("")
async def get_plated_menus(menu_type: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all plated menus"""
    query = {"company_id": user.company_id}
    if menu_type:
        query["menu_type"] = menu_type

    menus = await db.plated_menus.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for m in menus:
        for field in ["created_at", "updated_at"]:
            if m.get(field) and isinstance(m[field], str):
                m[field] = datetime.fromisoformat(m[field])
    return menus


@plated_menus_router.get("/{menu_id}")
async def get_plated_menu(menu_id: str, user: User = Depends(get_current_user)):
    """Get a single plated menu with recipe details"""
    menu = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Enrich course items with recipe details
    for course in menu.get("courses", []):
        for item in course.get("items", []):
            recipe = await db.recipes.find_one(
                {"recipe_id": item.get("recipe_id"), "company_id": user.company_id},
                {"_id": 0, "name": 1, "cost_per_portion": 1, "recipe_type": 1, "yield_unit": 1}
            )
            if recipe:
                item["recipe_details"] = recipe

    for field in ["created_at", "updated_at"]:
        if menu.get(field) and isinstance(menu[field], str):
            menu[field] = datetime.fromisoformat(menu[field])

    return menu


@plated_menus_router.post("")
async def create_plated_menu(data: PlatedMenuCreate, user: User = Depends(get_current_user)):
    """Create a new plated menu"""
    now = datetime.now(timezone.utc)
    menu_id = f"pmenu_{uuid.uuid4().hex[:12]}"

    # Ensure course_ids are set
    courses_with_ids = []
    for i, course in enumerate(data.courses):
        course_dict = course.model_dump() if hasattr(course, 'model_dump') else dict(course)
        if not course_dict.get("course_id"):
            course_dict["course_id"] = f"course_{uuid.uuid4().hex[:8]}"
        course_dict["course_order"] = i
        courses_with_ids.append(course_dict)

    # Calculate cost per guest
    cost_per_guest = await calculate_menu_cost(courses_with_ids, user.company_id)
    buffer_pct = data.buffer_percentage or 0
    cost_with_buffer = cost_per_guest * (1 + buffer_pct / 100)

    menu_doc = {
        "menu_id": menu_id,
        "company_id": user.company_id,
        "name": data.name,
        "description": data.description,
        "menu_type": data.menu_type,
        "pricing_model": data.pricing_model,
        "serving_style": data.serving_style,
        "courses": courses_with_ids,
        "buffer_percentage": buffer_pct,
        "cost_per_guest": cost_per_guest,
        "cost_with_buffer": round(cost_with_buffer, 4),
        "base_price_per_guest": float(data.base_price_per_guest or 0),
        "notes": data.notes,
        "status": "active",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }

    await db.plated_menus.insert_one(menu_doc)
    del menu_doc["_id"]
    menu_doc["created_at"] = now
    menu_doc["updated_at"] = now
    return menu_doc


@plated_menus_router.put("/{menu_id}")
async def update_plated_menu(menu_id: str, data: PlatedMenuCreate, user: User = Depends(get_current_user)):
    """Update a plated menu"""
    now = datetime.now(timezone.utc)

    # Ensure course_ids are set
    courses_with_ids = []
    for i, course in enumerate(data.courses):
        course_dict = course.model_dump() if hasattr(course, 'model_dump') else dict(course)
        if not course_dict.get("course_id"):
            course_dict["course_id"] = f"course_{uuid.uuid4().hex[:8]}"
        course_dict["course_order"] = i
        courses_with_ids.append(course_dict)

    # Recalculate cost per guest
    cost_per_guest = await calculate_menu_cost(courses_with_ids, user.company_id)
    buffer_pct = data.buffer_percentage or 0
    cost_with_buffer = cost_per_guest * (1 + buffer_pct / 100)

    update_data = {
        "name": data.name,
        "description": data.description,
        "menu_type": data.menu_type,
        "pricing_model": data.pricing_model,
        "serving_style": data.serving_style,
        "courses": courses_with_ids,
        "buffer_percentage": buffer_pct,
        "cost_per_guest": cost_per_guest,
        "cost_with_buffer": round(cost_with_buffer, 4),
        "base_price_per_guest": float(data.base_price_per_guest or 0),
        "notes": data.notes,
        "updated_at": now.isoformat()
    }

    result = await db.plated_menus.update_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")

    return await get_plated_menu(menu_id, user)


@plated_menus_router.delete("/{menu_id}")
async def delete_plated_menu(menu_id: str, user: User = Depends(get_current_user)):
    """Delete a plated menu"""
    result = await db.plated_menus.delete_one(
        {"menu_id": menu_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    return {"message": "Menu deleted"}


@plated_menus_router.post("/recalculate-all")
async def recalculate_all_menus(user: User = Depends(get_current_user)):
    """Recalculate costs for all menus (call when recipe costs change)"""
    menus = await db.plated_menus.find({"company_id": user.company_id}, {"_id": 0}).to_list(500)
    updated_count = 0

    for menu in menus:
        cost_per_guest = await calculate_menu_cost(menu.get("courses", []), user.company_id)
        buffer_pct = menu.get("buffer_percentage", 0)
        cost_with_buffer = cost_per_guest * (1 + buffer_pct / 100)

        await db.plated_menus.update_one(
            {"menu_id": menu["menu_id"]},
            {"$set": {
                "cost_per_guest": cost_per_guest,
                "cost_with_buffer": round(cost_with_buffer, 4)
            }}
        )
        updated_count += 1

    return {"updated_menus": updated_count}


@plated_menus_router.get("/{menu_id}/staleness")
async def get_plated_menu_staleness(menu_id: str, user: User = Depends(get_current_user)):
    """Return staleness info for a Plated Menu by comparing its persisted snapshot cost
    (cost_per_guest) against a live recalculation based on the *current* recipe costs.

    This endpoint is READ-ONLY — no DB writes. Used by the UI to show a "stale cost" badge.

    Response shape:
      {
        menu_id, name,
        snapshot_cost_per_guest, live_cost_per_guest,
        drift_amount, drift_percent,
        is_stale, severity,            # ok | warn | critical
        last_updated,
        affected_recipes: [{recipe_id, name, snapshot_cost, live_cost, drift_percent}]
      }
    """
    menu = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    snapshot = float(menu.get("cost_per_guest") or 0)
    live = float(await calculate_menu_cost(menu.get("courses", []), user.company_id))

    drift_amount = round(live - snapshot, 4)
    drift_percent = 0.0
    if snapshot > 0:
        drift_percent = round((drift_amount / snapshot) * 100, 2)
    elif live > 0:
        drift_percent = 100.0

    abs_pct = abs(drift_percent)
    if abs_pct < 2:
        severity = "ok"
    elif abs_pct < 10:
        severity = "warn"
    else:
        severity = "critical"
    is_stale = severity != "ok"

    # Build per-recipe drift list (only for recipes whose cost moved)
    affected = []
    seen_recipe_ids = set()
    for course in menu.get("courses", []):
        for item in course.get("items", []):
            rid = item.get("recipe_id")
            if not rid or rid in seen_recipe_ids:
                continue
            seen_recipe_ids.add(rid)
            recipe = await db.recipes.find_one(
                {"recipe_id": rid, "company_id": user.company_id},
                {"_id": 0, "name": 1, "cost_per_portion": 1}
            )
            if not recipe:
                continue
            live_cpp = float(recipe.get("cost_per_portion") or 0)
            snapshot_cpp = float(item.get("snapshot_cost_per_portion") or live_cpp)
            r_drift_pct = 0.0
            if snapshot_cpp > 0:
                r_drift_pct = round(((live_cpp - snapshot_cpp) / snapshot_cpp) * 100, 2)
            elif live_cpp > 0:
                r_drift_pct = 100.0
            if abs(r_drift_pct) >= 1:
                affected.append({
                    "recipe_id": rid,
                    "name": recipe.get("name"),
                    "snapshot_cost": round(snapshot_cpp, 4),
                    "live_cost": round(live_cpp, 4),
                    "drift_percent": r_drift_pct,
                })

    return {
        "menu_id": menu_id,
        "name": menu.get("name"),
        "snapshot_cost_per_guest": round(snapshot, 4),
        "live_cost_per_guest": round(live, 4),
        "drift_amount": drift_amount,
        "drift_percent": drift_percent,
        "is_stale": is_stale,
        "severity": severity,
        "last_updated": menu.get("updated_at"),
        "affected_recipes": affected,
    }


@plated_menus_router.post("/{menu_id}/refresh-costs")
async def refresh_plated_menu_costs(menu_id: str, user: User = Depends(get_current_user)):
    """Recompute and persist cost_per_guest / cost_with_buffer using current recipe costs.
    Returns the updated snapshot/live values."""
    menu = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    live = float(await calculate_menu_cost(menu.get("courses", []), user.company_id))
    buffer_pct = float(menu.get("buffer_percentage") or 0)
    cost_with_buffer = round(live * (1 + buffer_pct / 100), 4)
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.plated_menus.update_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"$set": {
            "cost_per_guest": live,
            "cost_with_buffer": cost_with_buffer,
            "updated_at": now_iso,
        }}
    )

    return {
        "menu_id": menu_id,
        "cost_per_guest": live,
        "cost_with_buffer": cost_with_buffer,
        "updated_at": now_iso,
    }


@plated_menus_router.get("/{menu_id}/projected-cost")
async def get_plated_menu_projected_cost(menu_id: str, user: User = Depends(get_current_user)):
    """Feature 1 — Dual cost view for buffet/cocktail plated menus.

    Returns:
      {
        menu_id, menu_type,
        theoretical_cost_per_guest,   # all recipes treated as 1 portion/guest
        projected_cost_per_guest,     # consumption factors applied
        savings_or_overrun,           # projected - theoretical
        factors_applied: [{recipe_id, recipe_name, factor, source}]
      }
    For non-buffet menus, projected == theoretical (factor=1.0).
    """
    menu = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"_id": 0},
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    menu_type = menu.get("menu_type", "plated")
    theoretical = 0.0
    projected = 0.0
    factors_applied = []

    for course in menu.get("courses", []):
        for item in course.get("items", []):
            rid = item.get("recipe_id")
            if not rid:
                continue
            recipe = await db.recipes.find_one(
                {"recipe_id": rid, "company_id": user.company_id},
                {"_id": 0, "name": 1, "category": 1, "cost_per_portion": 1, "recipe_id": 1},
            )
            if not recipe:
                continue
            cpp = float(recipe.get("cost_per_portion") or 0)
            portions = float(item.get("portions_per_guest") or 1)
            theoretical += cpp * portions

            factor = await _resolve_buffet_factor(recipe, user.company_id, menu_type)
            projected += cpp * portions * factor

            factors_applied.append({
                "recipe_id": rid,
                "recipe_name": recipe.get("name"),
                "category": recipe.get("category"),
                "factor": round(factor, 3),
                "cost_per_portion": round(cpp, 4),
                "applied_cost": round(cpp * portions * factor, 4),
            })

    diff = round(projected - theoretical, 4)
    return {
        "menu_id": menu_id,
        "menu_type": menu_type,
        "theoretical_cost_per_guest": round(theoretical, 4),
        "projected_cost_per_guest": round(projected, 4),
        "savings_or_overrun": diff,
        "savings_percent": round((diff / theoretical * 100) if theoretical > 0 else 0, 2),
        "factors_applied": factors_applied,
    }


@plated_menus_router.post("/{menu_id}/convert-to-catalog")
async def convert_plated_to_catalog(menu_id: str, user: User = Depends(get_current_user)):
    """Feature 5 — Convert a Plated Menu (db.plated_menus) into a Catalog Menu (db.menus)
    so it becomes available in `Settings → Catálogos → Menús` and the Proposal Editor
    PackagePicker. The source plated menu is NOT modified or deleted.

    Each recipe item in the plated menu's courses becomes a MenuItemEntry whose
    `quantity` reflects portions_per_guest * consumption_factor (buffet factor applied
    for buffet/cocktail menus). Cost & price overrides snapshot the recipe's current
    cost_per_portion and default selling price.

    Returns the freshly-created Menu document.
    """
    plated = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not plated:
        raise HTTPException(status_code=404, detail="Plated menu not found")

    menu_type_src = plated.get("menu_type", "plated")
    items = []
    sort_order = 0
    total_cost_per_guest = 0.0
    total_price_per_guest = 0.0

    for course in plated.get("courses", []):
        for it in course.get("items", []):
            rid = it.get("recipe_id")
            if not rid:
                continue
            recipe = await db.recipes.find_one(
                {"recipe_id": rid, "company_id": user.company_id},
                {"_id": 0, "name": 1, "category": 1, "cost_per_portion": 1,
                 "default_portion_price": 1, "sell_price": 1, "recipe_id": 1},
            )
            if not recipe:
                continue
            portions_per_guest = float(it.get("portions_per_guest") or 1)
            factor = await _resolve_buffet_factor(recipe, user.company_id, menu_type_src)
            effective_portions = portions_per_guest * factor
            cost_per_portion = float(recipe.get("cost_per_portion") or 0)
            sell_price = float(recipe.get("default_portion_price") or recipe.get("sell_price") or 0)
            line_cost = cost_per_portion * effective_portions
            line_price = sell_price * effective_portions
            total_cost_per_guest += line_cost
            total_price_per_guest += line_price

            items.append({
                "item_id": f"mi_{uuid.uuid4().hex[:10]}",
                "recipe_id": rid,
                "picklist_item_id": None,
                "custom_name": it.get("course_name") and f"{course.get('course_name', '')}: {recipe.get('name')}" or recipe.get("name"),
                "custom_description": None,
                "quantity": round(effective_portions, 4),
                "unit_price_override": sell_price if sell_price > 0 else None,
                "internal_cost_override": cost_per_portion if cost_per_portion > 0 else None,
                "sort_order": sort_order,
            })
            sort_order += 1

    if not items:
        raise HTTPException(status_code=400, detail="Plated menu has no recipe items to convert")

    now = datetime.now(timezone.utc)
    new_menu_id = f"menu_{uuid.uuid4().hex[:12]}"
    menu_doc = {
        "menu_id": new_menu_id,
        "company_id": user.company_id,
        "name": f"{plated.get('name')} (Catalog)",
        "name_es": f"{plated.get('name')} (Catálogo)",
        "description": plated.get("description"),
        "description_es": plated.get("description"),
        "menu_type": "Menu",  # standard catalog type so PackagePicker treats it normally
        "category_id": None,
        "items": items,
        "variants": [],
        "default_price": None,
        "is_fixed_price": False,
        "is_active": True,
        "source": "plated_menu_conversion",
        "source_plated_menu_id": menu_id,
        "source_menu_type": menu_type_src,
        "snapshot_cost_per_guest": round(total_cost_per_guest, 4),
        "snapshot_price_per_guest": round(total_price_per_guest, 4),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id,
    }
    await db.menus.insert_one(menu_doc)
    menu_doc.pop("_id", None)
    return menu_doc
