"""Fase 1a · Pricing cascade — canonical resolver.

Two INDEPENDENT cascades that never cross:
- Cascade A (PRICE): manual_override > format > recipe_method > company_method
- Cascade B (MIN MARGIN alert): item_specific > by_category > by_type

Cascade B only fires an alert if the price from Cascade A falls below the
floor. It NEVER modifies the price. Callers get both in one call so the UI
can render "$X (source=recipe_method, below_floor=false)" transparently.
"""
from typing import Optional, Dict, Any


def resolve_price(recipe: Optional[dict], format_row: Optional[dict],
                  company_settings: Optional[dict]) -> Dict[str, Any]:
    """Return the ONE authoritative price + provenance for a recipe/format.

    Order of precedence (highest wins):
      1) format_row.sell_price > 0                → source = "manual_override"
      2) format_row.suggested_price > 0           → source = "format"
      3) recipe.sell_price > 0                    → source = "manual_override"
      4) recipe.suggested_sell_price > 0          → source = "recipe_method"
      5) company suggested via recipe.pricing_methods[preference] > 0
                                                  → source = "company_method"
      6) cost_per_portion (bare cost, no margin)  → source = "cost_plus_fallback"
    """
    recipe = recipe or {}
    fmt = format_row or {}
    settings = company_settings or {}

    # Format-level takes precedence over recipe-level.
    if fmt:
        sp = float(fmt.get("sell_price") or 0)
        if sp > 0:
            return {"price": round(sp, 2), "source": "manual_override",
                    "level": "format", "method": None,
                    "target_pct": float(fmt.get("target_margin_pct") or 0)}
        sg = float(fmt.get("suggested_price") or 0)
        if sg > 0:
            return {"price": round(sg, 2), "source": "format",
                    "level": "format", "method": "target_margin_pct",
                    "target_pct": float(fmt.get("target_margin_pct") or 0)}

    # Recipe-level manual override
    rsp = float(recipe.get("sell_price") or 0)
    if rsp > 0:
        return {"price": round(rsp, 2), "source": "manual_override",
                "level": "recipe", "method": None, "target_pct": None}

    # Recipe suggested from the method it selected
    pref = recipe.get("pricing_method_preference") or "food_cost"
    methods = recipe.get("pricing_methods") or {}
    key = {"food_cost": "food_cost_method", "prime_cost": "prime_cost_method",
           "markup": "gross_margin_markup"}.get(pref)
    if key and methods.get(key, {}).get("price", 0) > 0:
        m = methods[key]
        return {"price": round(float(m["price"]), 2), "source": "recipe_method",
                "level": "recipe", "method": pref,
                "target_pct": float(m.get("target_pct") or 0)}

    # Fall back to legacy `suggested_sell_price` if pricing_methods is missing.
    ss = float(recipe.get("suggested_sell_price") or 0)
    if ss > 0:
        return {"price": round(ss, 2), "source": "recipe_method",
                "level": "recipe", "method": "food_cost",
                "target_pct": float(settings.get("recipe_target_food_cost_percent") or 30)}

    # Company default recompute (rare — recipe has cost but no method output)
    food_cost = float(recipe.get("food_cost") or recipe.get("cost_per_portion") or 0)
    target = float(settings.get("recipe_target_food_cost_percent") or 30)
    if food_cost > 0 and 0 < target < 100:
        return {"price": round(food_cost / (target / 100), 2),
                "source": "company_method", "level": "company",
                "method": "food_cost", "target_pct": target}

    # Bare cost fallback: nothing else to lean on.
    return {"price": round(food_cost, 2), "source": "cost_plus_fallback",
            "level": "cost", "method": None, "target_pct": None}


def resolve_menu_price(menu: dict) -> Dict[str, Any]:
    """Menu-level cascade for cotizaciones.

    Order of precedence:
      1) price_per_guest > 0        → source = "manual_override"
      2) suggested_price_per_guest  → source = "menu_method"
      3) cost_with_buffer           → source = "cost_plus_fallback"
    """
    m = menu or {}
    manual = float(m.get("price_per_guest") or 0)
    if manual > 0:
        return {"price": round(manual, 2), "source": "manual_override",
                "target_pct": float(m.get("target_margin_pct") or 0)}
    sug = float(m.get("suggested_price_per_guest") or 0)
    if sug > 0:
        return {"price": round(sug, 2), "source": "menu_method",
                "target_pct": float(m.get("target_margin_pct") or 0)}
    fallback = float(m.get("cost_with_buffer") or m.get("cost_per_guest") or 0)
    return {"price": round(fallback, 2), "source": "cost_plus_fallback",
            "target_pct": 0.0}
