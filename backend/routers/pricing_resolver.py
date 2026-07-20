"""Fase 1a · Pricing resolver endpoint.

Exposes the canonical `resolve_price` cascade + `resolve_min_margin`
in ONE call so the FE can render a price and its floor together with
their provenance ("manual_override" / "recipe_method" / etc).
"""
from fastapi import APIRouter, Depends, HTTPException
from config import db
from server import User, get_current_user, get_margin_policy_doc, resolve_min_margin
from services.pricing import resolve_price, resolve_menu_price

pricing_router = APIRouter(prefix="/api/pricing", tags=["Pricing"])


@pricing_router.post("/resolve")
async def resolve(payload: dict, user: User = Depends(get_current_user)):
    """Body: {recipe_id, format_id?}  OR  {menu_id}

    Returns:
      {price, source, level, method, target_pct,
       min_margin: {value, source}, below_floor: bool}
    """
    company_id = user.company_id

    if payload.get("menu_id"):
        menu = await db.plated_menus.find_one(
            {"menu_id": payload["menu_id"], "company_id": company_id}, {"_id": 0},
        )
        if not menu:
            raise HTTPException(404, "Menu not found")
        p = resolve_menu_price(menu)
        return {**p, "min_margin": None, "below_floor": False}

    recipe_id = payload.get("recipe_id")
    if not recipe_id:
        raise HTTPException(400, "recipe_id or menu_id required")

    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": company_id}, {"_id": 0},
    )
    if not recipe:
        raise HTTPException(404, "Recipe not found")

    fmt = None
    if payload.get("format_id"):
        fmt = await db.recipe_portion_formats.find_one(
            {"format_id": payload["format_id"], "recipe_id": recipe_id,
             "company_id": company_id}, {"_id": 0},
        )
    settings = (await db.company_settings.find_one(
        {"company_id": company_id, "setting_type": "recipe_costing"}, {"_id": 0},
    )) or {}

    price_info = resolve_price(recipe, fmt, settings)

    # Cascade B — independent, only for alerts. Never mutates price.
    policy = await get_margin_policy_doc(company_id)
    item_specific = fmt.get("target_margin_pct") if fmt else recipe.get("min_margin_pct")
    min_margin = resolve_min_margin(policy, "Food",
                                     recipe.get("category"), item_specific)

    cost = float(recipe.get("cost_per_portion") or recipe.get("food_cost") or 0)
    price = price_info["price"]
    actual_margin = ((price - cost) / price * 100) if price > 0 else 0
    below_floor = min_margin is not None and actual_margin < min_margin

    return {**price_info,
            "cost_per_portion": round(cost, 2),
            "actual_margin_pct": round(actual_margin, 2),
            "min_margin": {"value": min_margin, "source": "policy"} if min_margin else None,
            "below_floor": below_floor}
