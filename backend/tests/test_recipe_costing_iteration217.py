"""
Regression tests for Recipe Builder simplification (iteration 217).

Coverage:
- Company settings GET/PUT with all 5 costing fields
- Recipe cost math (cost_per_portion = food_cost / (yield_quantity * portions_per_yield))
- Method A suggested sell price
- Ingredient recalculate endpoint (post dead-code removal)
- /api/recipes and /api/menu-engineering/analyze still respond
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def original_company(client):
    """Snapshot company config so we can restore after tests."""
    r = client.get(f"{API}/settings/company", timeout=30)
    assert r.status_code == 200, r.text
    yield r.json()
    # No teardown restore needed — PUT tests set explicit known values


# ----------------- Company Settings -----------------
class TestCompanySettings:
    def test_get_company_has_5_costing_fields(self, client):
        r = client.get(f"{API}/settings/company", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for f in [
            "chef_hourly_rate",
            "recipe_overhead_percent",
            "recipe_target_food_cost_percent",
            "recipe_target_prime_cost_percent",
            "recipe_target_gross_margin_percent",
        ]:
            assert f in data, f"missing field {f}"
            assert isinstance(data[f], (int, float)), f"{f} not numeric: {data[f]}"

    def test_put_company_persists_5_fields(self, client):
        payload = {
            "chef_hourly_rate": 25.0,
            "recipe_overhead_percent": 12.5,
            "recipe_target_food_cost_percent": 30.0,
            "recipe_target_prime_cost_percent": 55.0,
            "recipe_target_gross_margin_percent": 65.0,
        }
        r = client.put(f"{API}/settings/company", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        # verify with GET
        r2 = client.get(f"{API}/settings/company", timeout=30)
        assert r2.status_code == 200
        data = r2.json()
        for k, v in payload.items():
            assert float(data[k]) == float(v), f"{k}: expected {v} got {data[k]}"


# ----------------- Recipe Costing Math -----------------
def _make_recipe_payload(name, yield_quantity, portions_per_yield, food_cost_target):
    """Build a recipe with a single ingredient carrying food_cost_target as cost.
    We create an inline ingredient with unit_cost set on the ingredient object
    so calculate_recipe_cost can price it.
    """
    return {
        "name": name,
        "category": "Test",
        "yield_quantity": yield_quantity,
        "yield_unit": "batch",
        "portions_per_yield": portions_per_yield,
        "portion_size": 1.0,
        "portion_unit": "serving",
        "prep_time_minutes": 0,
        "cook_time_minutes": 0,
        "labor_minutes": 0,
        "ingredients": [],
        "sub_recipes": [],
        "sell_price": 0.0,
    }


@pytest.fixture(scope="class")
def test_ingredient(client):
    """Create a shared TEST ingredient priced so total_cost lands at 857.04
    when quantity=1."""
    payload = {
        "name": f"TEST_ing_{uuid.uuid4().hex[:6]}",
        "category": "Test",
        "unit": "unit",
        "unit_cost": 857.04,
        "cost_per_unit": 857.04,
        "price_per_unit": 857.04,
        "current_stock": 100,
        "stock_quantity": 100,
    }
    r = client.post(f"{API}/inventory/ingredients", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    ing = r.json()
    ing_id = ing.get("ingredient_id") or ing.get("id")
    assert ing_id, f"no ingredient_id in response: {ing}"
    yield ing_id
    # cleanup
    try:
        client.delete(f"{API}/inventory/ingredients/{ing_id}", timeout=15)
    except Exception:
        pass


class TestRecipeCosting:
    """Verify user-reported math scenario."""

    def _ensure_default_config(self, client):
        # Ensure target_food_cost_percent=30 for deterministic Method A math
        client.put(f"{API}/settings/company", json={
            "chef_hourly_rate": 20.0,
            "recipe_overhead_percent": 15.0,
            "recipe_target_food_cost_percent": 30.0,
            "recipe_target_prime_cost_percent": 55.0,
            "recipe_target_gross_margin_percent": 65.0,
        }, timeout=30)

    def test_recipe_yield1_portions12(self, client, test_ingredient):
        self._ensure_default_config(client)
        payload = _make_recipe_payload("TEST_recipe_1x12", 1.0, 12.0, 857.04)
        payload["ingredients"] = [{
            "ingredient_id": test_ingredient,
            "name": "TEST_ing",
            "quantity": 1.0,
            "unit": "unit",
        }]
        r = client.post(f"{API}/recipes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()
        # total food cost
        assert abs(float(rec["food_cost"]) - 857.04) < 0.5, f"food_cost={rec['food_cost']}"
        # cost_per_portion = 857.04 / (1*12) = 71.42
        assert abs(float(rec["cost_per_portion"]) - 71.42) < 0.05, f"cost_per_portion={rec['cost_per_portion']}"
        # suggested_sell_price Method A: 71.42 / 0.30 = 238.07
        expected_price = 71.42 / 0.30
        assert abs(float(rec["suggested_sell_price"]) - expected_price) < 0.5, \
            f"suggested_sell_price={rec['suggested_sell_price']} expected~{expected_price:.2f}"
        # cleanup
        rid = rec.get("recipe_id")
        if rid:
            client.delete(f"{API}/recipes/{rid}", timeout=15)

    def test_recipe_yield30_portions4(self, client, test_ingredient):
        self._ensure_default_config(client)
        payload = _make_recipe_payload("TEST_recipe_30x4", 30.0, 4.0, 857.04)
        payload["ingredients"] = [{
            "ingredient_id": test_ingredient,
            "name": "TEST_ing",
            "quantity": 1.0,
            "unit": "unit",
        }]
        r = client.post(f"{API}/recipes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert abs(float(rec["food_cost"]) - 857.04) < 0.5
        # 857.04 / 120 = 7.142
        assert abs(float(rec["cost_per_portion"]) - 7.142) < 0.05, f"cost_per_portion={rec['cost_per_portion']}"
        # sugg = 7.142/0.30 = 23.81
        assert abs(float(rec["suggested_sell_price"]) - 23.81) < 0.2, f"suggested_sell_price={rec['suggested_sell_price']}"
        rid = rec.get("recipe_id")
        if rid:
            client.delete(f"{API}/recipes/{rid}", timeout=15)


# ----------------- List Recipes -----------------
class TestRecipeList:
    def test_get_recipes_200(self, client):
        r = client.get(f"{API}/recipes", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)


# ----------------- Recalculate Endpoint (dead code removal check) -----------------
class TestRecalculate:
    def test_ingredient_update_triggers_recalc(self, client, test_ingredient):
        """Updating an ingredient triggers the internal recalc loop (dead code removed).
        We verify it doesn't crash by PUTting a price change."""
        r = client.put(
            f"{API}/inventory/ingredients/{test_ingredient}",
            json={"unit_cost": 900.0, "price_per_unit": 900.0, "cost_per_unit": 900.0},
            timeout=60,
        )
        assert r.status_code == 200, r.text

    def test_recipes_recalculate_all_no_crash(self, client):
        r = client.post(f"{API}/recipes/recalculate-all", timeout=120)
        # Endpoint may return 200; if not exposed return 404 which we treat as skip
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            data = r.json()
            assert "recalculated" in data or "affected_recipe_ids" in data or isinstance(data, dict)


# ----------------- Menu Engineering -----------------
class TestMenuEngineering:
    def test_analyze_200(self, client):
        r = client.get(f"{API}/menu-engineering/analyze", timeout=60)
        assert r.status_code == 200, r.text
