"""
Verify PASE A cascade: when a recipe's cost changes (via ingredient
edit or sub-recipe cascade), every `portion_format` attached to that
recipe gets its `cost_per_portion`, `suggested_price`, and `margin_pct`
refreshed. Also verify the format-editing PUT flow works.
"""
import os, uuid, pytest
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


class _U:
    def __init__(self, cid):
        self.company_id = cid
        self.email = "t@t.com"
        self.role = "admin"


@pytest.mark.asyncio
async def test_portion_formats_refresh_on_recipe_cost_change():
    """A recipe with 2 portion formats. When the recipe's total_cost changes
    from $120 → $180, both formats must reflect the new cost_per_portion and
    updated suggested_price."""
    from config import db
    from routers.recipes import _refresh_portion_formats_for_recipe

    tenant = f"test_pf_cascade_{uuid.uuid4().hex[:6]}"
    recipe_id = f"rec_{uuid.uuid4().hex[:8]}"
    fmt_a = f"pformat_{uuid.uuid4().hex[:8]}"
    fmt_b = f"pformat_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    # Recipe starts at $120 food_cost, 4 portions total → $30/portion baseline
    await db.recipes.insert_one({
        "recipe_id": recipe_id, "company_id": tenant,
        "name": "Test Cascade Recipe",
        "yield_quantity": 4.0, "yield_unit": "portion",
        "food_cost": 120.0, "total_cost": 120.0,
        "created_at": now, "updated_at": now,
    })
    # Format A: 2 portions (large), 30% margin → cost=$60, sell=$60/0.70=$85.71
    await db.recipe_portion_formats.insert_one({
        "format_id": fmt_a, "recipe_id": recipe_id, "company_id": tenant,
        "format_name": "Large 12oz", "portion_unit": "oz",
        "portions_obtained": 2.0, "cost_per_portion": 60.0,
        "target_margin_pct": 30.0, "suggested_price": 85.71,
        "sell_price": 0.0, "margin_pct": 0.0, "is_default": False,
        "created_at": now, "updated_at": now,
    })
    # Format B: 8 portions (mini), 40% margin → cost=$15, sell=$15/0.60=$25.00
    await db.recipe_portion_formats.insert_one({
        "format_id": fmt_b, "recipe_id": recipe_id, "company_id": tenant,
        "format_name": "Mini 4oz", "portion_unit": "oz",
        "portions_obtained": 8.0, "cost_per_portion": 15.0,
        "target_margin_pct": 40.0, "suggested_price": 25.0,
        "sell_price": 0.0, "margin_pct": 0.0, "is_default": False,
        "created_at": now, "updated_at": now,
    })
    try:
        # Simulate recipe cost bumping to $180 (e.g. ingredient price went up)
        await db.recipes.update_one(
            {"recipe_id": recipe_id},
            {"$set": {"food_cost": 180.0, "total_cost": 180.0}},
        )
        touched = await _refresh_portion_formats_for_recipe(recipe_id, tenant)
        assert touched == 2, f"expected 2 formats refreshed, got {touched}"

        # Format A new: cost = 180/2 = $90, suggested = 90/0.70 = $128.57
        a = await db.recipe_portion_formats.find_one({"format_id": fmt_a}, {"_id": 0})
        assert a["cost_per_portion"] == pytest.approx(90.0, abs=0.01)
        assert a["suggested_price"] == pytest.approx(128.57, abs=0.02)
        # Format B new: cost = 180/8 = $22.50, suggested = 22.50/0.60 = $37.50
        b = await db.recipe_portion_formats.find_one({"format_id": fmt_b}, {"_id": 0})
        assert b["cost_per_portion"] == pytest.approx(22.50, abs=0.01)
        assert b["suggested_price"] == pytest.approx(37.50, abs=0.02)
    finally:
        await db.recipes.delete_many({"company_id": tenant})
        await db.recipe_portion_formats.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_portion_format_edit_via_put_endpoint():
    """Verify the PUT flow the new pencil button uses."""
    from config import db
    from routers.recipes import update_recipe_portion_format
    from models.recipes import RecipePortionFormatCreate

    tenant = f"test_pf_edit_{uuid.uuid4().hex[:6]}"
    recipe_id = f"rec_{uuid.uuid4().hex[:8]}"
    fmt_id = f"pformat_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.recipes.insert_one({
        "recipe_id": recipe_id, "company_id": tenant,
        "name": "Edit Test", "yield_quantity": 6.0, "yield_unit": "portion",
        "cost_per_yield": 40.0, "food_cost": 240.0, "total_cost": 240.0,
        "created_at": now, "updated_at": now,
    })
    await db.recipe_portion_formats.insert_one({
        "format_id": fmt_id, "recipe_id": recipe_id, "company_id": tenant,
        "format_name": "Original", "portion_unit": "serving",
        "portions_obtained": 4.0, "cost_per_portion": 60.0,
        "target_margin_pct": 30.0, "suggested_price": 85.71,
        "sell_price": 0.0, "margin_pct": 0.0, "is_default": False,
        "created_at": now, "updated_at": now,
    })
    try:
        # Simulate the frontend PUT payload from clicking the pencil button
        # and changing name + margin
        payload = RecipePortionFormatCreate(
            format_name="Edited Name",
            portions_obtained=4.0,
            portion_unit="serving",
            sell_price=100.0,
            target_margin_pct=45.0,  # was 30, now 45
            is_default=True,
            notes="edited",
        )
        result = await update_recipe_portion_format(
            recipe_id, fmt_id, payload, user=_U(tenant),
        )
        assert result == {"message": "Updated"}

        after = await db.recipe_portion_formats.find_one({"format_id": fmt_id}, {"_id": 0})
        assert after["format_name"] == "Edited Name"
        assert after["target_margin_pct"] == 45.0
        assert after["is_default"] is True
        # cost_per_portion still recalculated from recipe.cost_per_yield / portions_obtained
        # (see backend line 1724): 40 / 4 = 10
        assert after["cost_per_portion"] == pytest.approx(10.0, abs=0.01)
        # suggested_price = 10 / (1 - 0.45) = $18.18
        assert after["suggested_price"] == pytest.approx(18.18, abs=0.02)
        # margin from sell_price: (100-10)/100 = 90%
        assert after["margin_pct"] == pytest.approx(90.0, abs=0.01)
    finally:
        await db.recipes.delete_many({"company_id": tenant})
        await db.recipe_portion_formats.delete_many({"company_id": tenant})
