"""
Regression test — Feb 2026 bugfix.

Bug: When an ingredient's cost changes, `_recalc_recipes_using_ingredient`
in `routers/inventory.py` updates the recipe's `total_cost` but did NOT
call `_refresh_portion_formats_for_recipe`. Result: the "Formatos de
Porción" table showed stale `cost_per_portion` until the user manually
re-saved the recipe.

Fix: `_recalc_recipes_using_ingredient` now cascades to the portion_formats
refresh right after each recipe.update_one.

This test proves it.
"""
import os, uuid, pytest
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_ingredient_cost_change_cascades_to_portion_formats():
    from config import db
    from routers.inventory import _recalc_recipes_using_ingredient

    tenant = f"test_ing_pf_{uuid.uuid4().hex[:6]}"
    ingredient_id = f"ing_{uuid.uuid4().hex[:8]}"
    recipe_id = f"rec_{uuid.uuid4().hex[:8]}"
    fmt_id = f"pformat_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    # Ingredient: initial $10/g cost_per_unit; base_unit=g
    await db.ingredients.insert_one({
        "ingredient_id": ingredient_id, "company_id": tenant,
        "name": "Test Cascade Ingredient",
        "purchase_cost": 100.0, "purchase_quantity_per_unit": 10.0,
        "purchase_unit": "g", "base_unit": "g",
        "cost_per_unit": 10.0, "cost_per_base_unit": 10.0,
        "waste_percent": 0.0,
        "created_at": now, "updated_at": now,
    })

    # Recipe using 5g of the ingredient → total_cost=$50, 4 portions → $12.5/p
    await db.recipes.insert_one({
        "recipe_id": recipe_id, "company_id": tenant,
        "name": "Test Cascade Recipe",
        "yield_quantity": 4.0, "yield_unit": "portion",
        "portions_obtained": 4.0,
        "ingredients": [{
            "item_id": ingredient_id, "item_type": "ingredient",
            "ingredient_id": ingredient_id, "name": "Test Cascade Ingredient",
            "quantity": 5.0, "unit": "g",
            "cost": 50.0,
        }],
        "sub_recipes": [],
        "food_cost": 50.0, "total_cost": 50.0,
        "created_at": now, "updated_at": now,
    })

    # Portion format snapshot BEFORE change: cost_per_portion = 50/2 = 25.0
    await db.recipe_portion_formats.insert_one({
        "format_id": fmt_id, "recipe_id": recipe_id, "company_id": tenant,
        "format_name": "Bandeja", "portion_unit": "unit",
        "portions_obtained": 2.0, "cost_per_portion": 25.0,
        "target_margin_pct": 30.0, "suggested_price": 35.71,
        "sell_price": 0.0, "margin_pct": 0.0, "is_default": True,
        "created_at": now, "updated_at": now,
    })

    # Simulate a price hike: purchase_cost doubles → cost_per_unit = 20 → recipe cost = 100
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id, "company_id": tenant},
        {"$set": {"purchase_cost": 200.0, "cost_per_unit": 20.0, "cost_per_base_unit": 20.0}},
    )
    # Trigger the cascade (this is what update_ingredient does)
    result = await _recalc_recipes_using_ingredient(ingredient_id, tenant)
    assert recipe_id in result["affected_recipe_ids"], (
        f"Recipe {recipe_id} was not detected as affected. Got: {result}"
    )
    # NEW ASSERTION: cascade summary must include portion_formats_refreshed
    assert "portion_formats_refreshed" in result, (
        f"Cascade result missing portion_formats_refreshed key. Got: {result}"
    )
    assert result["portion_formats_refreshed"] >= 1, (
        f"Expected at least 1 portion format refreshed, got: {result['portion_formats_refreshed']}"
    )

    # ── ASSERTIONS ──
    # 1. Recipe's total_cost is now 100
    r = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": tenant}, {"_id": 0})
    assert abs(float(r["total_cost"]) - 100.0) < 0.01, (
        f"Recipe total_cost did not update to 100. Got: {r['total_cost']}"
    )

    # 2. Portion format's cost_per_portion is now 50 (=100/2), not stale 25
    pf = await db.recipe_portion_formats.find_one(
        {"format_id": fmt_id, "recipe_id": recipe_id}, {"_id": 0},
    )
    assert abs(float(pf["cost_per_portion"]) - 50.0) < 0.01, (
        f"PORTION FORMAT STALE! cost_per_portion should be 50, got {pf['cost_per_portion']}. "
        f"This is exactly the bug reported by the user: portion formats not refreshing."
    )

    # 3. Suggested price recomputed: 50 / (1 - 0.30) = 71.43
    assert abs(float(pf["suggested_price"]) - 71.43) < 0.02, (
        f"Suggested price not refreshed. Expected 71.43, got {pf['suggested_price']}"
    )

    # Cleanup
    await db.ingredients.delete_many({"company_id": tenant})
    await db.recipes.delete_many({"company_id": tenant})
    await db.recipe_portion_formats.delete_many({"company_id": tenant})
