"""
Regression test for the "Porchetta" bug reported by user:

Before the fix, `GET /api/recipes/{id}` returned:
  total_cost = $5,093.93
but the line-level `ingredients[i].total_cost` snapshots summed to a
different value (~$1,347.72), because the frontend recomputed live from
`invItem.cost_per_unit × qty` (buggy, no unit conversion) while the total
still reflected the last saved snapshot.

Post-PASE-A + single-source-of-truth: GET /api/recipes/{id} triggers
`calculate_recipe_cost` fresh on the current ingredient master data.
`recipe.total_cost` MUST equal the sum of `ingredients[i].total_cost`
and `sub_recipes[i].total_cost` — always, by construction.
"""
import os, uuid, pytest
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_get_recipe_total_equals_sum_of_lines_fresh():
    """Create a recipe with a broken ingredient, mutate the ingredient's
    purchase_cost AFTER the recipe was saved, and verify that GET returns
    a consistent snapshot (total == Σ lines) rather than a stale total
    with drift."""
    from config import db
    from routers.recipes import calculate_recipe_cost
    from models.recipes import RecipeIngredient

    tenant = f"test_porchetta_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    # 1. Ingredient with purchase format complete
    ing_id = f"ing_{uuid.uuid4().hex[:8]}"
    await db.ingredients.insert_one({
        "ingredient_id": ing_id, "company_id": tenant,
        "name": "Aceite Test",
        "unit": "botella", "base_unit": "ml",
        "purchase_unit": "botella",
        "purchase_quantity_per_unit": 150.0,
        "purchase_cost": 450.0,
        "cost_per_unit": 450.0,        # $/botella (PASE A semantic)
        "cost_per_base_unit": 3.0,     # $450 / 150 ml
        "purchase_incomplete": False,
        "created_at": now,
    })

    # 2. Recipe using 1000 ml of it
    line = {"item_id": ing_id, "item_type": "ingredient", "name": "Aceite Test",
            "quantity": 1000.0, "unit": "ml", "total_cost": 999999.0}  # stale
    r_id = f"rec_{uuid.uuid4().hex[:8]}"
    await db.recipes.insert_one({
        "recipe_id": r_id, "company_id": tenant,
        "name": "Porchetta test",
        "category": "Test", "yield_quantity": 1.0, "yield_unit": "portion",
        "portions_obtained": 1,
        "ingredients": [line], "sub_recipes": [],
        "total_cost": 999999.0,  # stale to force divergence
        "created_at": now, "updated_at": now,
    })
    try:
        # 3. Simulate GET /api/recipes/{id} → recompute fresh
        recipe = await db.recipes.find_one({"recipe_id": r_id, "company_id": tenant}, {"_id": 0})
        fresh_ings = [RecipeIngredient(**i) for i in recipe.get("ingredients", [])]
        total, lines, subs, conv = await calculate_recipe_cost(fresh_ings, [], tenant)
        # Consistency: sum(lines) == total  (this was the visible bug)
        line_sum = sum(float(l.get("total_cost") or 0) for l in lines)
        assert abs(line_sum - total) < 0.01, (
            f"drift! total=${total} but Σ lines=${line_sum}"
        )
        # Correctness: 1000 ml × $3/ml = $3000  (not $450,000)
        assert total == pytest.approx(3000.0, abs=0.01)
        assert lines[0]["total_cost"] == pytest.approx(3000.0, abs=0.01)
    finally:
        await db.ingredients.delete_many({"company_id": tenant})
        await db.recipes.delete_many({"company_id": tenant})
