"""
E2E regression — Cost-incompleto warning propagation.

Covers Parte B "Confirmación adicional":
  1. Custom `density_g_per_ml` on the ingredient overrides the hardcoded
     DEFAULT_DENSITIES whitelist (both directions).
  2. When a recipe line has an unresolvable conversion, the recipe document
     gets `has_conversion_errors=True` and `conversion_errors_count>0`.
  3. When the same recipe is later saved with the missing density populated,
     the flag flips back to False (no false-positive stickiness).
  4. When the recipe is nested as a sub-recipe, the parent recipe also gets
     `has_conversion_errors=True` (bubble-up via `calculate_recipe_cost`).
"""
import os, uuid
from datetime import datetime, timezone

import pytest
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


# --------------------- 1. density override ---------------------

@pytest.mark.asyncio
async def test_custom_density_beats_whitelist_both_ways():
    """`aceite` is in DEFAULT_DENSITIES at 0.92 g/ml. A custom 1.5 g/ml on the
    ingredient must win — both weight→volume and volume→weight.
    """
    from utils.units import convert, DEFAULT_DENSITIES
    assert abs(DEFAULT_DENSITIES["aceite"] - 0.92) < 1e-6  # sanity: whitelist active

    ing_whitelist_only = {"name": "aceite oliva", "base_unit": "kg"}
    ing_override = {"name": "aceite oliva", "base_unit": "kg",
                    "density_g_per_ml": 1.5}

    # weight → volume: 1 kg oil @ whitelist (0.92) ≈ 1086.96 ml
    ml_whitelist = convert(1.0, "kg", "ml", ing_whitelist_only)
    ml_override = convert(1.0, "kg", "ml", ing_override)
    assert abs(ml_whitelist - (1000 / 0.92)) < 0.01
    assert abs(ml_override - (1000 / 1.5)) < 0.01
    assert ml_whitelist != pytest.approx(ml_override)

    # volume → weight: 1 L oil @ whitelist = 0.92 kg; @ override = 1.5 kg
    kg_whitelist = convert(1.0, "L", "kg", ing_whitelist_only)
    kg_override = convert(1.0, "L", "kg", ing_override)
    assert abs(kg_whitelist - 0.92) < 1e-3
    assert abs(kg_override - 1.5) < 1e-3


# --------------------- 2 & 3. recipe-level flag ---------------------

@pytest.mark.asyncio
async def test_recipe_flag_reflects_missing_and_resolved_conversion():
    from config import db
    from routers.recipes import calculate_recipe_cost
    from models.recipes import RecipeIngredient

    tenant = f"test_cepy_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    # Unknown non-whitelist name → density will be missing.
    ing_id = f"ing_{uuid.uuid4().hex[:8]}"
    await db.ingredients.insert_one({
        "ingredient_id": ing_id, "company_id": tenant,
        "name": "MysteryPasteXYZ",
        "cost_per_unit": 10.0, "unit": "kg", "base_unit": "kg",
        "cost_per_base_unit": 10.0, "created_at": now,
    })
    try:
        # Recipe line asks for 500 ml — no bridge → conversion error.
        line = RecipeIngredient(
            item_id=ing_id, item_type="ingredient",
            quantity=0.5, unit="L",
        )
        _, updated_ings, _, conv_errs = await calculate_recipe_cost(
            [line], [], tenant,
        )
        assert len(conv_errs) == 1
        assert conv_errs[0]["source"] == "ingredient"
        assert conv_errs[0]["item_id"] == ing_id
        assert "density" in conv_errs[0]["reason"].lower()
        assert updated_ings[0]["conversion_error"] is not None

        # Fix: set density on the ingredient.
        await db.ingredients.update_one(
            {"ingredient_id": ing_id, "company_id": tenant},
            {"$set": {"density_g_per_ml": 1.20}},
        )
        _, _, _, conv_errs2 = await calculate_recipe_cost(
            [line], [], tenant,
        )
        assert conv_errs2 == [], f"expected no errors after fix, got {conv_errs2}"
    finally:
        await db.ingredients.delete_many({"company_id": tenant})


# --------------------- 4. bubble-up to parent ---------------------

@pytest.mark.asyncio
async def test_parent_recipe_bubbles_up_child_conversion_error():
    from config import db
    from routers.recipes import calculate_recipe_cost

    tenant = f"test_cepy_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    child_id = f"recipe_{uuid.uuid4().hex[:8]}"
    await db.recipes.insert_one({
        "recipe_id": child_id, "company_id": tenant,
        "name": "Child Broken", "category": "Otros",
        "yield_quantity": 1.0, "yield_unit": "portion",
        "cost_per_yield": 12.34,
        "has_conversion_errors": True,   # simulates a broken child
        "conversion_errors_count": 2,
        "created_at": now, "updated_at": now,
    })
    try:
        sub = {"child_recipe_id": child_id, "child_recipe_name": "Child Broken",
               "quantity_used": 1.0, "unit": "portion"}
        _, _, _, conv_errs = await calculate_recipe_cost([], [sub], tenant)
        assert len(conv_errs) == 1
        e = conv_errs[0]
        assert e["source"] == "sub_recipe"
        assert e["item_id"] == child_id
        assert e["child_errors_count"] == 2
    finally:
        await db.recipes.delete_many({"company_id": tenant})
