"""
Regression test — waste factor / yield formula.

Standard AP/EP costing:
    yield% = 1 - waste%
    EP cost = AP cost / yield%
    effective_qty = qty / (1 - waste/100)
"""
import os, uuid
from datetime import datetime, timezone

import pytest
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

TOL = 0.01


@pytest.mark.asyncio
async def test_waste_15pct_ap_ep_formula():
    """15% waste on 1 kg at $10/kg must yield $11.76 line cost."""
    from config import db  # global motor client — bound to the running loop
    from routers.recipes import calculate_recipe_cost
    from models.recipes import RecipeIngredient

    tenant = f"test_waste_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.ingredients.insert_one({
            "ingredient_id": "ing_chicken", "company_id": tenant,
            "name": "Chicken breast", "cost_per_unit": 10.0,
            "unit": "kg", "base_unit": "kg", "cost_per_base_unit": 10.0,
            "yield_waste_percent": 0, "created_at": now,
        })
        line = RecipeIngredient(
            item_id="ing_chicken", item_type="ingredient",
            quantity=1.0, unit="kg", waste_factor_pct=15,
        )
        total, updated_ings, _ = await calculate_recipe_cost([line], [], tenant)
        assert abs(total - 11.7647) <= TOL, f"expected ~$11.76, got {total}"
        assert abs(updated_ings[0]["total_cost"] - 11.7647) <= TOL
    finally:
        await db.ingredients.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_waste_zero_is_noop():
    from config import db
    from routers.recipes import calculate_recipe_cost
    from models.recipes import RecipeIngredient

    tenant = f"test_waste_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.ingredients.insert_one({
            "ingredient_id": "ing_x", "company_id": tenant,
            "name": "X", "cost_per_unit": 5.0, "unit": "kg", "base_unit": "kg",
            "cost_per_base_unit": 5.0, "yield_waste_percent": 0, "created_at": now,
        })
        line = RecipeIngredient(
            item_id="ing_x", item_type="ingredient",
            quantity=2.0, unit="kg", waste_factor_pct=0,
        )
        total, _, _ = await calculate_recipe_cost([line], [], tenant)
        assert abs(total - 10.0) <= TOL, f"expected $10.00, got {total}"
    finally:
        await db.ingredients.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_waste_extreme_capped():
    """Waste ≥ 100% must be capped (no infinity / division-by-zero)."""
    from config import db
    from routers.recipes import calculate_recipe_cost
    from models.recipes import RecipeIngredient

    tenant = f"test_waste_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.ingredients.insert_one({
            "ingredient_id": "ing_y", "company_id": tenant,
            "name": "Y", "cost_per_unit": 1.0, "unit": "kg", "base_unit": "kg",
            "cost_per_base_unit": 1.0, "created_at": now,
        })
        line = RecipeIngredient(
            item_id="ing_y", item_type="ingredient",
            quantity=1.0, unit="kg", waste_factor_pct=150,
        )
        total, _, _ = await calculate_recipe_cost([line], [], tenant)
        assert total > 0 and total < 1e6, f"got {total}"
    finally:
        await db.ingredients.delete_many({"company_id": tenant})
