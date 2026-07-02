"""
Sprint P0 audit tests — verifies 3 bug fixes in Culinary Intelligence.
Iteration 214: after main-agent fixes to sub_recipes iterator, ingredient PUT partial,
and menu-engineering projection.

Bug 1: compute_full_recipe_costing() falls back to legacy prep_time/cook_time
Bug 2: _recalc_recipes_using_ingredient() persists new P0 fields on ingredient price change
Bug 3: calculate_recipe_cost() converts sub-recipe units (ml → L etc.)

Fix A: create_recipe/update_recipe iterate sub_recipes as dict
Fix B: menu-engineering projection includes total_cost_per_portion
Fix C: PUT /inventory/ingredients accepts partial dict payload
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
        "chef_hourly_rate": float(snap.get("chef_hourly_rate") or data.get("labor_cost", 25.0)),
        "overhead_percent": float(snap.get("overhead_percent") or 15.0),
        "target_food_cost_percent": float(snap.get("target_food_cost_percent") or 30.0),
    }
    session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)
    return cfg


# -------------------- Bug 1 (regression) --------------------

class TestBug1LegacyPrepCookFallback:
    def test_create_recipe_with_legacy_prep_cook_populates_labor(self, session, company_config):
        payload = {
            "name": "TEST_P0_LegacyTime_Recipe",
            "category": "Test",
            "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
            "prep_time": 15, "cook_time": 20,
            "ingredients": [], "sub_recipes": [], "sell_price": 30.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        expected = round((35 / 60.0) * company_config["chef_hourly_rate"], 4)
        assert abs(data.get("labor_cost", 0) - expected) < 0.05, \
            f"labor_cost should be ~{expected} got {data.get('labor_cost')}"
        session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)


# -------------------- Bug 3 fixture + tests --------------------

@pytest.fixture(scope="module")
def sub_recipe_L(session):
    ing_payload = {
        "name": "TEST_P0_Sauce_Ingredient",
        "category": "Test", "unit": "L", "base_unit": "L", "purchase_unit": "L",
        "purchase_quantity_per_unit": 1.0, "purchase_cost": 10.0,
        "cost_per_unit": 10.0, "cost_per_base_unit": 10.0, "yield_waste_percent": 0,
    }
    r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    ing_id = r.json()["ingredient_id"]

    sub_payload = {
        "name": "TEST_P0_Sub_Sauce_L", "category": "Test",
        "yield_quantity": 1.0, "yield_unit": "L", "portions_per_yield": 1.0,
        "ingredients": [{
            "item_id": ing_id, "item_type": "ingredient", "name": "Sauce base",
            "quantity": 1.0, "unit": "L", "cost": 10.0,
        }],
        "sub_recipes": [], "recipe_type": "Base",
    }
    r = session.post(f"{BASE_URL}/api/recipes", json=sub_payload, timeout=30)
    assert r.status_code == 200, r.text
    sub = r.json()
    yield {"ingredient_id": ing_id, "recipe": sub}
    session.delete(f"{BASE_URL}/api/recipes/{sub['recipe_id']}", timeout=15)
    session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)


class TestFixASubRecipesBlock:
    """Fix #A: create_recipe/update_recipe no longer 500 on sub_recipes block.
    Also verifies Bug 3 unit conversion on the new-block path."""

    def test_create_recipe_with_sub_recipes_block_no_500(self, session, sub_recipe_L):
        sub = sub_recipe_L["recipe"]
        parent_payload = {
            "name": "TEST_P0_Parent_ConsumesML",
            "category": "Test",
            "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
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
        assert r.status_code == 200, f"Fix #A regression: {r.status_code} {r.text}"
        parent = r.json()

        # Bug 3 unit conversion on NEW block: 500ml of 1L @ $10 → ~$5
        food_cost = parent.get("food_cost") or parent.get("total_cost") or 0
        assert 4.5 <= food_cost <= 5.5, \
            f"NEW sub_recipes block unit conversion: expected ~$5.00 for 500ml of $10/L sub-recipe, got ${food_cost}"

        session.delete(f"{BASE_URL}/api/recipes/{parent['recipe_id']}", timeout=15)

    def test_update_recipe_with_sub_recipes_block_no_500(self, session, sub_recipe_L):
        sub = sub_recipe_L["recipe"]
        # Create with empty block
        payload = {
            "name": "TEST_P0_Parent_Update", "category": "Test",
            "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
            "ingredients": [], "sub_recipes": [], "sell_price": 20.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json()["recipe_id"]

        # Update: add sub_recipes with 500ml
        payload["sub_recipes"] = [{
            "child_recipe_id": sub["recipe_id"],
            "child_recipe_name": sub["name"],
            "quantity_used": 500.0,
            "unit": "ml",
        }]
        r = session.put(f"{BASE_URL}/api/recipes/{rid}", json=payload, timeout=30)
        assert r.status_code == 200, f"Fix #A update regression: {r.status_code} {r.text}"
        updated = r.json()
        food_cost = updated.get("food_cost") or updated.get("total_cost") or 0
        assert 4.5 <= food_cost <= 5.5, f"Update path conversion: expected ~$5, got ${food_cost}"

        session.delete(f"{BASE_URL}/api/recipes/{rid}", timeout=15)


class TestBug3LegacyInlinePath:
    """Regression: Bug 3 legacy inline path (item_type='recipe') still works."""

    def test_parent_consumes_ml_via_legacy_inline_subrecipe(self, session, sub_recipe_L):
        sub = sub_recipe_L["recipe"]
        parent_payload = {
            "name": "TEST_P0_Parent_LegacyInline", "category": "Test",
            "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
            "ingredients": [{
                "item_id": sub["recipe_id"], "item_type": "recipe",
                "name": sub["name"], "quantity": 500.0, "unit": "ml",
            }],
            "sub_recipes": [], "sell_price": 20.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=parent_payload, timeout=30)
        assert r.status_code == 200, r.text
        parent = r.json()
        food_cost = parent.get("food_cost") or parent.get("total_cost") or 0
        assert 4.5 <= food_cost <= 5.5, \
            f"Legacy inline sub-recipe conversion: expected ~$5.00, got ${food_cost}"
        session.delete(f"{BASE_URL}/api/recipes/{parent['recipe_id']}", timeout=15)


# -------------------- Fix #C: PUT ingredient partial update --------------------

class TestFixCIngredientPartialUpdate:
    def test_put_ingredient_with_only_purchase_cost(self, session):
        # Create full ingredient
        ing_payload = {
            "name": "TEST_P0_PartialUpdate_Ing", "category": "Test",
            "unit": "kg", "base_unit": "kg", "purchase_unit": "kg",
            "purchase_quantity_per_unit": 1.0, "purchase_cost": 10.0,
            "cost_per_unit": 10.0, "cost_per_base_unit": 0.01,
            "yield_waste_percent": 0,
            "preferred_supplier_id": "supplier_test_123",
            "notes": "Original notes",
        }
        r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        ing_id = r.json()["ingredient_id"]

        try:
            # PUT with ONLY purchase_cost — no name/category/unit
            upd = session.put(
                f"{BASE_URL}/api/inventory/ingredients/{ing_id}",
                json={"purchase_cost": 20.0},
                timeout=30,
            )
            assert upd.status_code == 200, \
                f"Fix #C: PUT partial with only purchase_cost should be 200, got {upd.status_code} {upd.text}"

            # GET and verify name/category/unit/preferred_supplier_id/notes preserved
            g = session.get(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)
            assert g.status_code == 200
            body = g.json()
            assert body["name"] == "TEST_P0_PartialUpdate_Ing", f"name mutated: {body.get('name')}"
            assert body["category"] == "Test", f"category mutated: {body.get('category')}"
            assert body["unit"] == "kg", f"unit mutated: {body.get('unit')}"
            assert body.get("preferred_supplier_id") == "supplier_test_123", \
                f"preferred_supplier_id mutated: {body.get('preferred_supplier_id')}"
            assert body.get("notes") == "Original notes", f"notes mutated: {body.get('notes')}"
            assert abs(float(body.get("purchase_cost") or 0) - 20.0) < 0.001, \
                f"purchase_cost not updated: {body.get('purchase_cost')}"
        finally:
            session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)


# -------------------- Bug 2 regression --------------------

class TestBug2RecalcPersistsNewFields:
    def test_ingredient_price_change_propagates_all_p0_fields(self, session, company_config):
        ing_payload = {
            "name": "TEST_P0_ChangePrice_Ing", "category": "Test",
            "unit": "kg", "base_unit": "kg", "purchase_unit": "kg",
            "purchase_quantity_per_unit": 1.0, "purchase_cost": 10.0,
            "cost_per_unit": 10.0, "cost_per_base_unit": 0.01,
            "yield_waste_percent": 0,
        }
        r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        ing_id = r.json()["ingredient_id"]

        recipe_payload = {
            "name": "TEST_P0_ChangePrice_Recipe", "category": "Test",
            "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
            "prep_time_minutes": 30, "cook_time_minutes": 0,
            "ingredients": [{
                "item_id": ing_id, "item_type": "ingredient",
                "name": "Test ing", "quantity": 100.0, "unit": "g", "cost": 1.0,
            }],
            "sub_recipes": [], "sell_price": 20.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=recipe_payload, timeout=30)
        assert r.status_code == 200, r.text
        recipe_id = r.json()["recipe_id"]

        try:
            # Fix #C enables true partial update — send just purchase_cost
            upd = session.put(
                f"{BASE_URL}/api/inventory/ingredients/{ing_id}",
                json={"purchase_cost": 20.0, "cost_per_unit": 20.0, "cost_per_base_unit": 0.02},
                timeout=30,
            )
            assert upd.status_code == 200, upd.text

            g = session.get(f"{BASE_URL}/api/recipes/{recipe_id}", timeout=15)
            assert g.status_code == 200
            rec = g.json()

            required = ["labor_cost", "overhead_cost", "total_cost_full",
                        "total_cost_per_portion", "contribution_dollar",
                        "contribution_percent", "suggested_sell_price",
                        "food_cost", "food_cost_percent"]
            missing = [f for f in required if f not in rec or rec.get(f) is None]
            assert not missing, f"Missing Sprint P0 fields after recalc: {missing}"

            expected_labor = round((30 / 60.0) * company_config["chef_hourly_rate"], 2)
            assert rec["labor_cost"] > 0
            assert abs(rec["labor_cost"] - expected_labor) < 0.5, \
                f"labor_cost expected ~{expected_labor}, got {rec['labor_cost']}"

            expected_overhead = round(rec["food_cost"] * company_config["overhead_percent"] / 100.0, 2)
            assert abs(rec["overhead_cost"] - expected_overhead) < 0.1

            expected_suggested = round(rec["total_cost_per_portion"] / (company_config["target_food_cost_percent"] / 100.0), 2)
            assert abs(rec["suggested_sell_price"] - expected_suggested) < 0.1

        finally:
            session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", timeout=15)
            session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)


# -------------------- Fix #B: Menu Engineering uses total_cost_per_portion --------------------

class TestFixBMenuEngineeringUsesTotalCost:
    """Seeds a recipe with labor+overhead so total_cost_per_portion > cost_per_portion,
    then asserts that /menu-engineering/analyze returns row.cost_per_portion = total_cost_per_portion."""

    def test_analyze_uses_total_cost_per_portion(self, session, company_config):
        # Create ingredient
        ing_payload = {
            "name": "TEST_P0_ME_Ing", "category": "Test",
            "unit": "kg", "base_unit": "kg", "purchase_unit": "kg",
            "purchase_quantity_per_unit": 1.0, "purchase_cost": 10.0,
            "cost_per_unit": 10.0, "cost_per_base_unit": 0.01,
            "yield_waste_percent": 0,
        }
        r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        ing_id = r.json()["ingredient_id"]

        # Recipe with prep_time so labor_cost > 0
        recipe_payload = {
            "name": "TEST_P0_ME_Recipe", "category": "Test",
            "yield_quantity": 1.0, "yield_unit": "portion", "portions_per_yield": 1.0,
            "prep_time_minutes": 60, "cook_time_minutes": 0,
            "ingredients": [{
                "item_id": ing_id, "item_type": "ingredient",
                "name": "ME ing", "quantity": 100.0, "unit": "g", "cost": 1.0,
            }],
            "sub_recipes": [], "sell_price": 30.0, "default_portion_price": 30.0,
        }
        r = session.post(f"{BASE_URL}/api/recipes", json=recipe_payload, timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()
        recipe_id = rec["recipe_id"]

        try:
            total_cpp = float(rec.get("total_cost_per_portion") or 0)
            food_cpp = float(rec.get("cost_per_portion") or 0)
            assert total_cpp > food_cpp, \
                f"Test seed invalid: total_cost_per_portion ({total_cpp}) should exceed food-only cost_per_portion ({food_cpp})"

            # Call /menu-engineering/analyze
            r = session.get(f"{BASE_URL}/api/menu-engineering/analyze?days=90", timeout=30)
            assert r.status_code == 200, r.text
            data = r.json()

            # Find our recipe row
            row = next((x for x in data.get("recipes", []) if x.get("recipe_id") == recipe_id), None)
            assert row is not None, f"Test recipe not in menu-engineering rows"

            row_cost = float(row.get("cost_per_portion") or 0)
            # Fix #B: menu-engineering must use total_cost_per_portion, not food-only
            assert abs(row_cost - total_cpp) < 0.05, \
                f"Fix #B FAILED: menu-engineering row.cost_per_portion={row_cost} but expected total_cost_per_portion={total_cpp} (food-only cost_per_portion={food_cpp})"

        finally:
            session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", timeout=15)
            session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)


# -------------------- Regression --------------------

class TestRegressionRecalculateAll:
    def test_recalculate_all_dry_run(self, session):
        r = session.post(f"{BASE_URL}/api/recipes/recalculate-all", json={"dry_run": True}, timeout=60)
        assert r.status_code == 200, r.text

    def test_recalculate_all_apply(self, session):
        r = session.post(f"{BASE_URL}/api/recipes/recalculate-all", json={"dry_run": False}, timeout=90)
        assert r.status_code == 200, r.text


class TestMenuEngineeringStructure:
    def test_analyze_returns_valid_structure(self, session):
        r = session.get(f"{BASE_URL}/api/menu-engineering/analyze?days=90", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "quadrants_summary" in data
        assert set(data["quadrants_summary"].keys()) == {"star", "plowhorse", "puzzle", "dog"}
        assert "recipes" in data
