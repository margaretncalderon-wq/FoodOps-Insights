"""
Regression test — Recipe cost cascade.

Guarantees that:
1. `total_cost` on every recipe equals the sum of its ingredient lines +
   sub-recipe lines (tolerance $0.01).
2. Editing a sub-recipe forces every parent recipe (recursively) to also be
   recomputed, so no recipe can silently drift again.

Runs against the LIVE MongoDB configured in backend/.env — safe: all writes
are cleaned up in `finally`.

Invoke:
    cd /app/backend && python -m pytest tests/test_recipe_cost_cascade_regression.py -v
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

TOLERANCE = 0.01
TENANT = f"test_cascade_{uuid.uuid4().hex[:8]}"


async def _seed(db):
    """Two ingredients + one sub-recipe + one parent recipe."""
    now = datetime.now(timezone.utc).isoformat()
    ing_a = {
        "ingredient_id": "ing_test_A", "company_id": TENANT,
        "name": "Test A", "cost_per_unit": 2.0, "unit": "kg", "base_unit": "kg",
        "cost_per_base_unit": 2.0, "created_at": now,
    }
    ing_b = {
        "ingredient_id": "ing_test_B", "company_id": TENANT,
        "name": "Test B", "cost_per_unit": 5.0, "unit": "kg", "base_unit": "kg",
        "cost_per_base_unit": 5.0, "created_at": now,
    }
    await db.ingredients.insert_many([ing_a, ing_b])

    child = {
        "recipe_id": "recipe_test_child", "company_id": TENANT,
        "name": "Child Sub-recipe", "yield_quantity": 1.0, "yield_unit": "kg",
        "portions_per_yield": 1,
        "ingredients": [{
            "item_id": "ing_test_A", "item_type": "ingredient",
            "quantity": 3.0, "unit": "kg",
            "cost": 6.0, "total_cost": 6.0, "cost_per_unit": 2.0,
        }],
        "sub_recipes": [],
        "food_cost": 6.0, "total_cost": 6.0, "cost_per_yield": 6.0,
        "created_at": now, "updated_at": now,
    }
    parent = {
        "recipe_id": "recipe_test_parent", "company_id": TENANT,
        "name": "Parent Recipe", "yield_quantity": 1.0, "yield_unit": "kg",
        "portions_per_yield": 1,
        "ingredients": [{
            "item_id": "ing_test_B", "item_type": "ingredient",
            "quantity": 2.0, "unit": "kg",
            "cost": 10.0, "total_cost": 10.0, "cost_per_unit": 5.0,
        }],
        "sub_recipes": [{
            "child_recipe_id": "recipe_test_child",
            "quantity_used": 1.0, "unit": "kg",
            "cost_per_unit": 6.0, "total_cost": 6.0,
        }],
        "food_cost": 16.0, "total_cost": 16.0, "cost_per_yield": 16.0,
        "created_at": now, "updated_at": now,
    }
    await db.recipes.insert_many([child, parent])


async def _cleanup(db):
    await db.recipes.delete_many({"company_id": TENANT})
    await db.ingredients.delete_many({"company_id": TENANT})


@pytest.mark.asyncio
async def test_recipe_total_matches_line_sum():
    """total_cost == sum(ingredient lines) + sum(sub-recipe lines) ±$0.01
    across ALL recipes in the DB."""
    from config import db
    async for recipe in db.recipes.find({}, {"_id": 0}):
        line_total = 0.0
        for ing in recipe.get("ingredients") or []:
            line_total += float(ing.get("total_cost") or ing.get("cost") or 0)
        for sub in recipe.get("sub_recipes") or []:
            line_total += float(sub.get("total_cost") or 0)

        stored = float(recipe.get("food_cost") or recipe.get("total_cost") or 0)
        delta = abs(stored - line_total)
        assert delta <= TOLERANCE, (
            f"[DRIFT] {recipe.get('company_id')}/{recipe.get('recipe_id')} "
            f"{recipe.get('name')}: stored={stored} lines={line_total} "
            f"delta={delta}"
        )


@pytest.mark.asyncio
async def test_editing_child_recomputes_parent():
    """The core cascade guarantee: after editing a child recipe, the parent
    recipe's total_cost reflects the child's new cost_per_yield."""
    from config import db
    from routers.recipes import _recalc_parents_of_recipe, calculate_recipe_cost
    from models.recipes import RecipeIngredient

    await _cleanup(db)
    try:
        await _seed(db)

        # Verify baseline
        parent = await db.recipes.find_one(
            {"recipe_id": "recipe_test_parent", "company_id": TENANT}, {"_id": 0}
        )
        assert abs(parent["total_cost"] - 16.0) <= TOLERANCE

        # Mutate child cost: ingredient B increases quantity → recompute child
        child = await db.recipes.find_one(
            {"recipe_id": "recipe_test_child", "company_id": TENANT}, {"_id": 0}
        )
        child["ingredients"][0]["quantity"] = 5.0  # was 3 → now 5 units → cost 10
        ings = [RecipeIngredient(**i) for i in child["ingredients"]]
        new_total, updated_ings, _ = await calculate_recipe_cost(
            ings, [], TENANT,
        )
        assert abs(new_total - 10.0) <= TOLERANCE
        await db.recipes.update_one(
            {"recipe_id": "recipe_test_child", "company_id": TENANT},
            {"$set": {
                "ingredients": updated_ings,
                "food_cost": new_total, "total_cost": new_total,
                "cost_per_yield": new_total,  # yield_quantity = 1
            }},
        )

        # Now cascade to parent
        result = await _recalc_parents_of_recipe("recipe_test_child", TENANT)
        assert "recipe_test_parent" in result["affected_recipe_ids"]

        parent = await db.recipes.find_one(
            {"recipe_id": "recipe_test_parent", "company_id": TENANT}, {"_id": 0}
        )
        # New parent cost = ingredient B (10) + child (now 10 * 1) = 20
        assert abs(parent["total_cost"] - 20.0) <= TOLERANCE, (
            f"parent did not cascade: got {parent['total_cost']}, expected 20.0"
        )
    finally:
        await _cleanup(db)
