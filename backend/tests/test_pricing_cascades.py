"""Fase 1a · Verify the two cascades are independent and correct."""
import os, pytest
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def test_cascade_A_manual_override_beats_everything():
    from services.pricing import resolve_price
    recipe = {"sell_price": 500.0, "suggested_sell_price": 200.0,
              "pricing_method_preference": "food_cost",
              "pricing_methods": {"food_cost_method": {"price": 300.0, "target_pct": 30}}}
    r = resolve_price(recipe, None, {})
    assert r["price"] == 500.0
    assert r["source"] == "manual_override"
    assert r["level"] == "recipe"


def test_cascade_A_format_beats_recipe():
    from services.pricing import resolve_price
    recipe = {"sell_price": 500.0}
    fmt = {"sell_price": 120.0, "target_margin_pct": 30}
    r = resolve_price(recipe, fmt, {})
    assert r["price"] == 120.0 and r["source"] == "manual_override" and r["level"] == "format"


def test_cascade_A_recipe_method_when_no_manual():
    from services.pricing import resolve_price
    recipe = {"pricing_method_preference": "markup",
              "pricing_methods": {"gross_margin_markup": {"price": 250.0, "target_pct": 65}}}
    r = resolve_price(recipe, None, {})
    assert r["price"] == 250.0 and r["source"] == "recipe_method" and r["method"] == "markup"


def test_cascade_A_company_fallback():
    from services.pricing import resolve_price
    r = resolve_price({"food_cost": 30.0}, None, {"recipe_target_food_cost_percent": 30})
    assert r["price"] == pytest.approx(100.0, abs=0.01)
    assert r["source"] == "company_method"


def test_cascade_B_min_margin_never_touches_price():
    """A recipe with manual $500 override and Policy Food floor 35%: the
    resolver returns price=$500 (Cascade A) AND below_floor flag from B —
    but never changes the $500."""
    from services.pricing import resolve_price
    from server import resolve_min_margin
    recipe = {"sell_price": 500.0, "cost_per_portion": 400.0, "category": "Food"}
    price = resolve_price(recipe, None, {})
    assert price["price"] == 500.0  # unchanged
    policy = {"by_type": {"Food": 35.0}, "by_category": []}
    floor = resolve_min_margin(policy, "Food", "Food", None)
    actual_margin = (500 - 400) / 500 * 100  # 20%
    assert floor == 35.0
    assert actual_margin < floor  # alert would fire — but price stays $500


def test_menu_cascade_manual_wins():
    from services.pricing import resolve_menu_price
    r = resolve_menu_price({"price_per_guest": 480.0,
                             "suggested_price_per_guest": 490.0,
                             "cost_with_buffer": 300.0})
    assert r["price"] == 480.0 and r["source"] == "manual_override"


def test_menu_cascade_falls_to_suggested_when_manual_zero():
    from services.pricing import resolve_menu_price
    r = resolve_menu_price({"price_per_guest": 0.0,
                             "suggested_price_per_guest": 490.0,
                             "cost_with_buffer": 300.0})
    assert r["price"] == 490.0 and r["source"] == "menu_method"


def test_menu_cascade_final_fallback_is_cost():
    from services.pricing import resolve_menu_price
    r = resolve_menu_price({"cost_with_buffer": 275.0})
    assert r["price"] == 275.0 and r["source"] == "cost_plus_fallback"
