"""
Regression test — Unit conversion: fail-explicit, never silent $0.
"""
import os, uuid
from datetime import datetime, timezone

import pytest
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_missing_density_raises_explicit_error():
    """Attempting weight↔volume without density_g_per_ml (and no whitelist
    match) must raise UnitConversionError, NOT silently return None."""
    from utils.units import convert, UnitConversionError

    ing = {"name": "MysteryStuffXYZ", "base_unit": "kg"}  # not in whitelist
    with pytest.raises(UnitConversionError) as exc:
        convert(1.0, "L", "kg", ing)
    assert "density" in exc.value.reason.lower()


@pytest.mark.asyncio
async def test_density_explicit_wins_over_whitelist():
    """When ingredient.density_g_per_ml is set, use it, not the whitelist."""
    from utils.units import convert
    ing = {"name": "aceite generic", "base_unit": "kg", "density_g_per_ml": 1.5}
    grams_from_liter = convert(1.0, "L", "kg", ing)  # 1 L * 1.5 g/ml = 1500g = 1.5 kg
    assert abs(grams_from_liter - 1.5) < 0.001


@pytest.mark.asyncio
async def test_count_to_weight_requires_weight_per_unit_g():
    """Converting '3 unidad' to grams without weight_per_unit_g must fail explicit."""
    from utils.units import convert, UnitConversionError

    ing = {"name": "Egg", "base_unit": "unidad"}
    with pytest.raises(UnitConversionError) as exc:
        convert(3.0, "unidad", "g", ing)
    assert "weight_per_unit_g" in exc.value.reason


@pytest.mark.asyncio
async def test_count_to_weight_with_weight_per_unit_works():
    from utils.units import convert
    ing = {"name": "Egg", "base_unit": "unidad", "weight_per_unit_g": 60}
    grams = convert(3.0, "unidad", "g", ing)
    assert abs(grams - 180.0) < 0.001


@pytest.mark.asyncio
async def test_cost_preview_returns_conversion_error_not_zero():
    """The preview endpoint must return conversion_error and cost=0, along
    with an explicit message — never a silent normal cost of 0."""
    from config import db
    from routers.inventory import preview_ingredient_cost
    from models.auth import User

    tenant = f"test_conv_{uuid.uuid4().hex[:8]}"
    ing = {
        "ingredient_id": "ing_egg_test", "company_id": tenant, "name": "Egg",
        "base_unit": "unidad", "unit": "unidad",
        "cost_per_unit": 8.0, "cost_per_base_unit": 8.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ingredients.insert_one(ing)
    try:
        payload = {"ingredient_id": "ing_egg_test", "quantity": 150, "unit": "g"}
        # Fake a super-admin User just enough for the endpoint
        user = User(user_id="u1", email="x@x.com", name="X",
                    company_id=tenant, role="admin", is_super_admin=True,
                    created_at=datetime.now(timezone.utc))
        result = await preview_ingredient_cost(payload, user)
        assert result["compatible"] is False
        assert result["conversion_error"] is not None
        assert "weight_per_unit_g" in result["conversion_error"]["reason"]
        assert result["cost"] == 0
        assert "Sin conversión" in result["message"] or "conversion" in result["message"].lower()
    finally:
        await db.ingredients.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_existing_recipes_unchanged_by_convert_refactor():
    """The 27 real recipes must keep the same total_cost invariant post-fix."""
    from config import db
    TOL = 0.01
    checked = 0
    async for r in db.recipes.find({}, {"_id": 0}):
        line_total = 0.0
        any_error = False
        for ing in r.get("ingredients") or []:
            line_total += float(ing.get("total_cost") or ing.get("cost") or 0)
            if ing.get("conversion_error"):
                any_error = True
        for sub in r.get("sub_recipes") or []:
            line_total += float(sub.get("total_cost") or 0)
        stored = float(r.get("food_cost") or r.get("total_cost") or 0)
        # Allow drift only if there IS a documented conversion_error on some line
        assert (abs(stored - line_total) <= TOL or any_error), (
            f"[UNEXPECTED DRIFT] {r.get('recipe_id')}: stored={stored} lines={line_total}"
        )
        checked += 1
    assert checked > 0
