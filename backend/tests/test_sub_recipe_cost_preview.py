"""
Test the sub-recipe cost preview endpoint: changing `quantity_used` (or
`unit`) recomputes cost live via backend, and the sub-recipe MASTER stays
untouched.

Reproduces the exact user complaint: "cuando aumento las sub recetas los
precios no suben ni cambian" — after the fix, they DO update.
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
async def test_sub_recipe_cost_preview_updates_with_quantity():
    """Sazon Natural has cost_per_yield=$6.42/oz (fake data mirroring
    screenshot). At 6 oz → $38.52. At 8 oz → $51.36. Master unchanged."""
    from config import db
    from routers.recipes import preview_sub_recipe_cost

    tenant = f"test_subrecipe_prev_{uuid.uuid4().hex[:6]}"
    child_id = f"rec_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    master_snapshot = {
        "recipe_id": child_id, "company_id": tenant,
        "name": "Sazon Natural",
        "category": "Base", "yield_quantity": 10.0, "yield_unit": "oz",
        "cost_per_yield": 6.42, "total_cost": 64.20,
        "created_at": now, "updated_at": now,
    }
    await db.recipes.insert_one(master_snapshot)
    try:
        # 6 oz  →  6 × 6.42 = 38.52
        out6 = await preview_sub_recipe_cost(
            {"child_recipe_id": child_id, "quantity": 6.0, "unit": "oz"},
            user=_U(tenant),
        )
        assert out6["cost"] == pytest.approx(38.52, abs=0.01), (
            f"expected $38.52 at 6 oz, got ${out6['cost']}"
        )

        # 8 oz  →  8 × 6.42 = 51.36  (the exact "aumento" the user did)
        out8 = await preview_sub_recipe_cost(
            {"child_recipe_id": child_id, "quantity": 8.0, "unit": "oz"},
            user=_U(tenant),
        )
        assert out8["cost"] == pytest.approx(51.36, abs=0.01), (
            f"expected $51.36 at 8 oz, got ${out8['cost']}"
        )
        assert out8["cost"] > out6["cost"], "cost must GROW when quantity grows"

        # Master untouched — no side effects on the sub-recipe doc
        after = await db.recipes.find_one({"recipe_id": child_id}, {"_id": 0})
        assert after["cost_per_yield"] == master_snapshot["cost_per_yield"]
        assert after["total_cost"] == master_snapshot["total_cost"]
        assert after["yield_quantity"] == master_snapshot["yield_quantity"]
        assert after["updated_at"] == master_snapshot["updated_at"]
    finally:
        await db.recipes.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_sub_recipe_cost_preview_unit_conversion_portion_to_portion():
    """Moro (Copy) sub-recipe: yield is `portion`, line consumes `portion`.
    6 portion × $35.90 = $215.40 (matches user's screenshot)."""
    from config import db
    from routers.recipes import preview_sub_recipe_cost

    tenant = f"test_subrecipe_conv_{uuid.uuid4().hex[:6]}"
    child_id = f"rec_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.recipes.insert_one({
        "recipe_id": child_id, "company_id": tenant,
        "name": "Moro de Habichuelas negras (Copy)",
        "category": "Base", "yield_quantity": 12.0, "yield_unit": "portion",
        "cost_per_yield": 35.90,
        "created_at": now, "updated_at": now,
    })
    try:
        out = await preview_sub_recipe_cost(
            {"child_recipe_id": child_id, "quantity": 6.0, "unit": "portion"},
            user=_U(tenant),
        )
        assert out["cost"] == pytest.approx(215.40, abs=0.01)
        assert out["compatible"] is True
        assert out["conversion_error"] is None
    finally:
        await db.recipes.delete_many({"company_id": tenant})
