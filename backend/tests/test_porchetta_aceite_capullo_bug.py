"""
Reproduce the exact "Porchetta" bug from the user's production screenshot:
Aceite Capullo Bidón 20 LT with purchase_cost=$3,450 (per 20,000 ml container),
consumed as 1000 ml in a recipe line. Expected line cost: $172.50.

Pre-fix behaviour (client-side): 1000 × 3450 = $3,450,000 for one line.
Post-fix (backend-driven): backend `preview_ingredient_cost` returns $172.50
using cost_for_recipe_line (which respects cost_per_base_unit).

This test hits the SAME backend endpoint that IngredientRow.useEffect
calls in the browser, so it exercises the exact path that now feeds
`preview.cost` into `onChange("total_cost", ...)`.
"""
import os
import uuid
import pytest
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_aceite_capullo_1000ml_returns_172_50_not_millions():
    """1000 ml de Aceite Capullo (contenedor de $3,450 / 20 L) debe costar $172.50."""
    from config import db
    from utils.units import cost_for_recipe_line

    tenant = f"test_porchetta_repro_{uuid.uuid4().hex[:6]}"
    ing_id = f"ing_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    # Same shape as the real Aceite Capullo in company_98d8b4725822
    await db.ingredients.insert_one({
        "ingredient_id": ing_id, "company_id": tenant,
        "name": "Aceite Capullo Bidón 20 LT",
        "unit": "ml", "base_unit": "ml",
        "cost_per_unit": 3450.0,          # PASE A: $/purchase_unit (the whole galón)
        "cost_per_base_unit": 0.1725,     # 3450 / 20000 = $0.1725/ml — source of truth
        "purchase_cost": 3450.0,
        "purchase_quantity_per_unit": 20000.0,
        "purchase_unit": "galón",
        "density_g_per_ml": 0.92,
        "yield_waste_percent": 0.0,
        "purchase_incomplete": False,
        "created_at": now,
    })
    try:
        ing = await db.ingredients.find_one({"ingredient_id": ing_id}, {"_id": 0})

        # Direct utility check — this is what /cost-preview and the recipe
        # GET recompute both funnel through.
        cost_1000ml = cost_for_recipe_line(1000.0, "ml", ing)
        assert cost_1000ml == pytest.approx(172.50, abs=0.01), (
            f"expected $172.50 for 1000 ml, got ${cost_1000ml} — "
            "if this jumps to $3,450,000 or similar, the cost path has "
            "regressed to multiplying qty × $/purchase_unit"
        )

        # Sanity: 500 ml → $86.25  (linear on cost_per_base_unit)
        cost_500ml = cost_for_recipe_line(500.0, "ml", ing)
        assert cost_500ml == pytest.approx(86.25, abs=0.01)

        # Sanity: 1 L (line uses "L", ingredient base is "ml") → conversion path
        cost_1L = cost_for_recipe_line(1.0, "L", ing)
        assert cost_1L == pytest.approx(172.50, abs=0.01), (
            f"expected $172.50 for 1 L via L→ml conversion, got ${cost_1L}"
        )
    finally:
        await db.ingredients.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_cost_preview_endpoint_returns_172_50_for_screenshot_case():
    """End-to-end via the HTTP endpoint that IngredientRow actually calls."""
    from fastapi.testclient import TestClient
    from config import db

    # Minimal client bootstrap — use the same app the FE talks to
    from server import app  # noqa
    tenant = f"test_porchetta_ep_{uuid.uuid4().hex[:6]}"
    ing_id = f"ing_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.ingredients.insert_one({
        "ingredient_id": ing_id, "company_id": tenant,
        "name": "Aceite Capullo Bidón 20 LT",
        "unit": "ml", "base_unit": "ml",
        "cost_per_unit": 3450.0, "cost_per_base_unit": 0.1725,
        "purchase_cost": 3450.0, "purchase_quantity_per_unit": 20000.0,
        "purchase_unit": "galón", "density_g_per_ml": 0.92,
        "yield_waste_percent": 0.0, "purchase_incomplete": False,
        "created_at": now,
    })
    try:
        # We hit the async endpoint function directly (no auth machinery
        # needed for the unit-cost preview when we bypass HTTP).
        from routers.inventory import preview_ingredient_cost

        class _U:
            company_id = tenant
            email = "test@test.com"
            role = "admin"
        payload = {"ingredient_id": ing_id, "quantity": 1000.0, "unit": "ml"}
        out = await preview_ingredient_cost(payload, user=_U())
        assert out["cost"] == pytest.approx(172.50, abs=0.01), (
            f"/cost-preview returned ${out['cost']}; expected $172.50. "
            f"Full response: {out}"
        )
        assert out["compatible"] is True
        assert out["conversion_error"] is None
    finally:
        await db.ingredients.delete_many({"company_id": tenant})
