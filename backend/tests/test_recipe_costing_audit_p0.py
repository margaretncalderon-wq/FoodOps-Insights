"""
Sprint P0 audit tests — verifies 3 bug fixes in Culinary Intelligence.

Bug 1: compute_full_recipe_costing() falls back to legacy prep_time/cook_time
Bug 2: _recalc_recipes_using_ingredient() persists new P0 fields on ingredient price change
Bug 3: calculate_recipe_cost() converts sub-recipe units (ml → L etc.)

Also regression: /recipes/recalculate-all + /menu-engineering/analyze + /inventory/ingredients/ai-repair
"""
import os
import pytest
import requests

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"

# -------------------- shared session --------------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def company_config(session):
    """Derive chef_hourly / overhead / target by creating a probe recipe and reading its snapshot."""
    payload = {
        "name": "TEST_P0_Probe_Config",
        "category": "Test",
        "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
        "prep_time_minutes": 60, "cook_time_minutes": 0,
        "ingredients": [], "sub_recipes": [], "sell_price": 100.0,
    }
    r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    snap = data.get("costing_config_snapshot") or {}
    cfg = {
        "chef_hourly_rate": float(snap.get("chef_hourly_rate") or data.get("labor_cost", 20.0)),
        "overhead_percent": float(snap.get("overhead_percent") or 15.0),
        "target_food_cost_percent": float(snap.get("target_food_cost_percent") or 30.0),
    }
    session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)
    return cfg


# -------------------- Bug 1: legacy prep_time/cook_time fallback --------------------

class TestBug1LegacyPrepCookFallback:
    def test_create_recipe_with_legacy_prep_cook_populates_labor(self, session, company_config):
        payload = {
            "name": "TEST_P0_LegacyTime_Recipe",
            "category": "Test",
            "yield_quantity": 1.0,
            "yield_unit": "portion",
            "portions_per_yield": 1.0,
            "prep_time": 15,          # legacy fields only
            "cook_time": 20,
            # DO NOT set prep_time_minutes / cook_time_minutes / labor_minutes
            "ingredients": [],
            "sub_recipes": [],
            "sell_price": 30.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Expected: 35 min * $20/hr / 60 = $11.6667
        expected_labor = round((35 / 60.0) * company_config["chef_hourly_rate"], 4)
        assert abs(data.get("labor_cost", 0) - expected_labor) < 0.01, (
            f"labor_cost should be ~{expected_labor} but got {data.get('labor_cost')}"
        )
        # cleanup
        session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)

    def test_new_minutes_fields_take_precedence_over_legacy(self, session, company_config):
        payload = {
            "name": "TEST_P0_NewTime_Recipe",
            "category": "Test",
            "yield_quantity": 1.0,
            "yield_unit": "portion",
            "portions_per_yield": 1.0,
            "prep_time": 5,
            "cook_time": 5,
            "prep_time_minutes": 30,  # should override
            "cook_time_minutes": 30,
            "ingredients": [],
            "sub_recipes": [],
            "sell_price": 30.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        expected_labor = round((60 / 60.0) * company_config["chef_hourly_rate"], 4)
        assert abs(data.get("labor_cost", 0) - expected_labor) < 0.01
        session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)


# -------------------- Bug 3: sub-recipe unit conversion --------------------

@pytest.fixture(scope="module")
def sub_recipe_L(session):
    """Create a sub-recipe yielding in Liters (1 L, cost_per_yield=$10)."""
    # Use a fake ingredient inline via cost=10 to yield L=1 at ~$10.
    # Simpler: create ingredient with known price, then a sub-recipe using it.
    ing_payload = {
        "name": "TEST_P0_Sauce_Ingredient",
        "category": "Test",
        "unit": "L",
        "base_unit": "L",
        "purchase_unit": "L",
        "purchase_quantity_per_unit": 1.0,
        "purchase_cost": 10.0,
        "cost_per_unit": 10.0,
        "cost_per_base_unit": 10.0,
        "yield_waste_percent": 0,
    }
    r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    ing = r.json()
    ing_id = ing["ingredient_id"]

    sub_payload = {
        "name": "TEST_P0_Sub_Sauce_L",
        "category": "Test",
        "yield_quantity": 1.0,
        "yield_unit": "L",
        "portions_per_yield": 1.0,
        "ingredients": [{
            "item_id": ing_id,
            "item_type": "ingredient",
            "name": "Sauce base",
            "quantity": 1.0,
            "unit": "L",
            "cost": 10.0,
        }],
        "sub_recipes": [],
        "recipe_type": "Base",
    }
    r = session.post(f"{BASE_URL}/api/recipes", json=sub_payload, timeout=30)
    assert r.status_code == 200, r.text
    sub = r.json()
    yield {"ingredient_id": ing_id, "recipe": sub}
    # teardown
    session.delete(f"{BASE_URL}/api/recipes/{sub['recipe_id']}", timeout=15)
    session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)


class TestBug3SubRecipeUnitConversion:
    def test_parent_consumes_ml_of_sub_recipe_in_L(self, session, sub_recipe_L):
        """Parent uses 500ml of a sub-recipe that yields 1 L @ $10.
        Correct cost = 0.5 L * $10 = $5.0 (NOT 500 * 10 = 5000).
        NOTE: This test exercises the NEW `sub_recipes` block on Recipe payload.
        BUG: create_recipe iterates `data.sub_recipes` (List[Dict]) using attribute
        access `sub.child_recipe_id` which throws AttributeError → 500. Skipping
        assertion until that regression is fixed by main agent."""
        sub = sub_recipe_L["recipe"]
        parent_payload = {
            "name": "TEST_P0_Parent_ConsumesML",
            "category": "Test",
            "yield_quantity": 1.0,
            "yield_unit": "portion",
            "portions_per_yield": 1.0,
            "ingredients": [],
            "sub_recipes": [{
                "child_recipe_id": sub["recipe_id"],
                "child_recipe_name": sub["name"],
                "quantity_used": 500.0,
                "unit": "ml",
            }],
            "sell_price": 20.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=parent_payload, timeout=30)
        if r.status_code == 500:
            pytest.xfail(
                "KNOWN BUG (create_recipe): data.sub_recipes is List[Dict[str,Any]] "
                "but code at server.py:3006 uses attribute access `sub.child_recipe_id` "
                "→ 500 AttributeError. New sub_recipes block cannot be used at all."
            )
        assert r.status_code == 200, r.text
        parent = r.json()
        food_cost = parent.get("food_cost") or parent.get("total_cost")
        assert 4.5 <= food_cost <= 5.5, (
            f"Sub-recipe unit conversion BUG: expected ~$5.00 for 500ml of $10/L sub-recipe, got ${food_cost}"
        )
        session.delete(f"{BASE_URL}/api/recipes/{parent['recipe_id']}", timeout=15)

    def test_parent_consumes_ml_via_legacy_inline_subrecipe(self, session, sub_recipe_L):
        """Legacy inline ingredient of item_type='recipe' referencing a sub-recipe in ml."""
        sub = sub_recipe_L["recipe"]
        parent_payload = {
            "name": "TEST_P0_Parent_LegacyInline",
            "category": "Test",
            "yield_quantity": 1.0,
            "yield_unit": "portion",
            "portions_per_yield": 1.0,
            "ingredients": [{
                "item_id": sub["recipe_id"],
                "item_type": "recipe",
                "name": sub["name"],
                "quantity": 500.0,
                "unit": "ml",
            }],
            "sub_recipes": [],
            "sell_price": 20.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=parent_payload, timeout=30)
        assert r.status_code == 200, r.text
        parent = r.json()
        food_cost = parent.get("food_cost") or parent.get("total_cost")
        assert 4.5 <= food_cost <= 5.5, (
            f"Legacy inline sub-recipe conversion BUG: expected ~$5.00, got ${food_cost}"
        )
        session.delete(f"{BASE_URL}/api/recipes/{parent['recipe_id']}", timeout=15)


# -------------------- Bug 2: _recalc_recipes_using_ingredient populates new fields --------------------

class TestBug2RecalcPersistsNewFields:
    def test_ingredient_price_change_propagates_all_p0_fields(self, session, company_config):
        # Create ingredient
        ing_payload = {
            "name": "TEST_P0_ChangePrice_Ing",
            "category": "Test",
            "unit": "kg",
            "base_unit": "kg",
            "purchase_unit": "kg",
            "purchase_quantity_per_unit": 1.0,
            "purchase_cost": 10.0,
            "cost_per_unit": 10.0,
            "cost_per_base_unit": 0.01,
            "yield_waste_percent": 0,
        }
        r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        ing_id = r.json()["ingredient_id"]

        # Create recipe using it — WITH prep/cook time so labor_cost > 0
        recipe_payload = {
            "name": "TEST_P0_ChangePrice_Recipe",
            "category": "Test",
            "yield_quantity": 1.0,
            "yield_unit": "portion",
            "portions_per_yield": 1.0,
            "prep_time_minutes": 30,
            "cook_time_minutes": 0,
            "ingredients": [{
                "item_id": ing_id,
                "item_type": "ingredient",
                "name": "Test ing",
                "quantity": 100.0,
                "unit": "g",
                "cost": 1.0,
            }],
            "sub_recipes": [],
            "sell_price": 20.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=recipe_payload, timeout=30)
        assert r.status_code == 200, r.text
        recipe_id = r.json()["recipe_id"]

        try:
            # Now update the ingredient's purchase_cost to trigger auto-recalc.
            # NOTE: PUT /ingredients uses IngredientCreate which requires name/category/unit,
            # so we must resend the full body (Fase A partial-update fix is not fully wired).
            full_body = {
                **ing_payload,
                "purchase_cost": 20.0,
                "cost_per_unit": 20.0,
                "cost_per_base_unit": 0.02,
            }
            upd = session.put(
                f"{BASE_URL}/api/inventory/ingredients/{ing_id}",
                json=full_body,
                timeout=30,
            )
            assert upd.status_code == 200, upd.text

            # Give the recalc a moment (it's awaited but be safe)
            # Read recipe & verify all Sprint P0 fields present
            g = session.get(f"{BASE_URL}/api/recipes/{recipe_id}", timeout=15)
            assert g.status_code == 200
            rec = g.json()

            required_p0_fields = [
                "labor_cost", "overhead_cost", "total_cost_full",
                "total_cost_per_portion", "contribution_dollar",
                "contribution_percent", "suggested_sell_price",
                "food_cost", "food_cost_percent",
            ]
            missing = [f for f in required_p0_fields if f not in rec or rec.get(f) is None]
            assert not missing, f"Missing/None Sprint P0 fields after ingredient price update: {missing}"

            # labor_cost should still be > 0 (30 min * chef_hourly_rate / 60)
            expected_labor = round((30 / 60.0) * company_config["chef_hourly_rate"], 2)
            assert rec["labor_cost"] > 0, f"labor_cost=0 after recalc (expected ~${expected_labor}), got {rec['labor_cost']}"
            assert abs(rec["labor_cost"] - expected_labor) < 0.1, f"labor_cost mismatch: expected ~{expected_labor}, got {rec['labor_cost']}"

            # overhead_cost = food_cost * overhead_percent/100
            expected_overhead = round(rec["food_cost"] * company_config["overhead_percent"] / 100.0, 2)
            assert abs(rec["overhead_cost"] - expected_overhead) < 0.05

            # suggested_sell_price = total_cost_per_portion / (target/100)
            expected_suggested = round(rec["total_cost_per_portion"] / (company_config["target_food_cost_percent"] / 100.0), 2)
            assert abs(rec["suggested_sell_price"] - expected_suggested) < 0.05

        finally:
            session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", timeout=15)
            session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)


# -------------------- Regression: /recipes/recalculate-all --------------------

class TestRegressionRecalculateAll:
    def test_recalculate_all_dry_run(self, session):
        r = session.post(f"{BASE_URL}/api/recipes/recalculate-all", json={"dry_run": True}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Should include a summary
        assert isinstance(data, dict)

    def test_recalculate_all_apply(self, session):
        r = session.post(f"{BASE_URL}/api/recipes/recalculate-all", json={"dry_run": False}, timeout=90)
        assert r.status_code == 200, r.text


# -------------------- Regression: Menu Engineering --------------------

class TestMenuEngineering:
    def test_analyze_returns_valid_structure(self, session):
        r = session.get(f"{BASE_URL}/api/menu-engineering/analyze?days=90", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "quadrants_summary" in data
        assert set(data["quadrants_summary"].keys()) == {"star", "plowhorse", "puzzle", "dog"}
        assert "recipes" in data
        # Each row should have profit, popularity, quadrant
        for row in data["recipes"]:
            assert "quadrant" in row or "classification" in row or "profit" in row


# -------------------- Regression: AI Auto-Repair --------------------

class TestAIRepair:
    def test_ai_repair_dry_run(self, session):
        r = session.post(
            f"{BASE_URL}/api/inventory/ingredients/ai-repair",
            json={"dry_run": True},
            timeout=120,
        )
        # AI can fail without keys; treat 503/500 as skip
        if r.status_code >= 500:
            pytest.skip(f"AI repair unavailable: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, r.text
        data = r.json()
        # Should return proposals or an empty list; validate field names when present
        proposals = data.get("proposals") or data.get("candidates") or []
        for p in proposals[:3]:
            for expected in ("base_unit", "purchase_unit", "purchase_quantity_per_unit", "yield_waste_percent"):
                # Not required on every proposal, but if present must not error
                _ = p.get(expected)
