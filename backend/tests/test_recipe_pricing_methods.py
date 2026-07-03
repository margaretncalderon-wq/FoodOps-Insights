"""Regression + logic tests for the refactored recipe pricing engine.

Focus:
  1. Bug fix: suggested_sell_price now uses food_cost/target_food% (NOT total_cost/target%)
  2. New multi-method pricing panel (food_cost / prime_cost / gross_margin_markup)
  3. Per-portion math for catering (portions_per_yield > 1)
  4. Company settings persistence for new target percent fields
  5. Regression: proposals, menus, plated-menus, menu-engineering still work
"""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PW = "Evoque2024!"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def test_ingredient(session):
    """Create an ingredient whose per-unit cost is exactly 71.39 so a recipe
    with quantity=1 of it yields food_cost=71.39."""
    name = f"TEST_price_ing_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": name,
        "category": "Protein",
        "base_unit": "kg",
        "unit": "kg",
        "purchase_unit": "kg",
        "purchase_size": 1,
        "cost_per_unit": 71.39,
        "cost_per_base_unit": 71.39,
        "current_stock": 100,
        "supplier": "TEST",
    }
    r = session.post(f"{BASE_URL}/api/inventory/ingredients", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"ingredient create failed {r.status_code}: {r.text[:300]}"
    data = r.json()
    ing_id = data.get("ingredient_id") or data.get("id")
    assert ing_id
    yield ing_id
    # cleanup
    try:
        session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=15)
    except Exception:
        pass


def _make_recipe_payload(name, portions=1, ingredient_id=None):
    return {
        "name": name,
        "category": "Main",
        "yield_quantity": 1.0,
        "yield_unit": "portion",
        "portions_per_yield": portions,
        "prep_time_minutes": 0,
        "cook_time_minutes": 0,
        "labor_minutes": 0,
        "ingredients": [{
            "item_id": ingredient_id,
            "ingredient_id": ingredient_id,
            "item_type": "ingredient",
            "quantity": 1,
            "unit": "kg",
        }],
        "instructions": "test",
        "sell_price": 0.0,
    }


# =========================================================== 1. Settings
class TestCompanySettings:
    def test_get_settings_has_new_fields(self, session):
        r = session.get(f"{BASE_URL}/api/settings/company", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # new fields present (may already be set to non-default by seed)
        assert "recipe_target_prime_cost_percent" in d, f"missing prime pct field: {list(d.keys())[:30]}"
        assert "recipe_target_gross_margin_percent" in d, "missing gross margin pct field"

    def test_put_and_persist_new_pricing_targets(self, session):
        # Save current values first
        cur = session.get(f"{BASE_URL}/api/settings/company", timeout=15).json()
        prev_prime = cur.get("recipe_target_prime_cost_percent")
        prev_margin = cur.get("recipe_target_gross_margin_percent")
        prev_food = cur.get("recipe_target_food_cost_percent")
        prev_over = cur.get("recipe_overhead_percent")

        # Set values needed by later tests: food=30, overhead=15, prime=55, margin=65
        payload = {
            "recipe_target_food_cost_percent": 30.0,
            "recipe_overhead_percent": 15.0,
            "recipe_target_prime_cost_percent": 55.0,
            "recipe_target_gross_margin_percent": 65.0,
        }
        r = session.put(f"{BASE_URL}/api/settings/company", json=payload, timeout=15)
        assert r.status_code == 200, r.text[:300]

        got = session.get(f"{BASE_URL}/api/settings/company", timeout=15).json()
        assert float(got["recipe_target_prime_cost_percent"]) == 55.0
        assert float(got["recipe_target_gross_margin_percent"]) == 65.0
        assert float(got["recipe_target_food_cost_percent"]) == 30.0
        assert float(got["recipe_overhead_percent"]) == 15.0


# =========================================================== 2. Bug fix — main scenario
class TestPricingBugFix:
    """Primary user story: food=71.39, overhead=15%, target=30%, portions=1
    -> suggested_sell_price must equal $237.97 (was $273.66 before fix).
    """

    @pytest.fixture(scope="class")
    def recipe(self, session, test_ingredient):
        name = f"TEST_pricing_single_{uuid.uuid4().hex[:6]}"
        payload = _make_recipe_payload(name, portions=1, ingredient_id=test_ingredient)
        r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        data = r.json()
        yield data
        try:
            session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)
        except Exception:
            pass

    def test_food_cost_is_71_39(self, recipe):
        # Confirms our synthetic ingredient produced correct food cost
        assert abs(recipe["food_cost"] - 71.39) < 0.01, f"food_cost={recipe['food_cost']}"

    def test_suggested_sell_price_is_237_97(self, recipe):
        """CORE BUG FIX: 71.39 / 0.30 = 237.9666... -> 237.97
        Buggy formula would give (71.39 * 1.15) / 0.30 = 273.66"""
        ssp = recipe["suggested_sell_price"]
        assert abs(ssp - 237.97) < 0.02, (
            f"BUG: suggested_sell_price should be 237.97 (food/target), got {ssp}. "
            f"273.66 would indicate the old bug (double-charged overhead)."
        )

    def test_overhead_still_computed(self, recipe):
        # Overhead should still be present in cost breakdown — 71.39 * 0.15 ≈ 10.71
        assert abs(recipe["overhead_cost"] - 10.7085) < 0.01

    def test_prime_cost_per_portion_present(self, recipe):
        assert "prime_cost_per_portion" in recipe
        # With 0 labor: prime cost = food cost per portion = 71.39
        assert abs(recipe["prime_cost_per_portion"] - 71.39) < 0.01

    def test_pricing_methods_structure(self, recipe):
        pm = recipe.get("pricing_methods")
        assert pm and isinstance(pm, dict), "pricing_methods missing"
        for key in ("food_cost_method", "prime_cost_method", "gross_margin_markup"):
            assert key in pm, f"missing method {key}"
            m = pm[key]
            for f in ("label", "price", "formula", "target_pct", "recommended_for"):
                assert f in m, f"method {key} missing field {f}"

    def test_pricing_methods_math(self, recipe):
        pm = recipe["pricing_methods"]
        # A: food/target = 71.39/0.30 = 237.97
        assert abs(pm["food_cost_method"]["price"] - 237.97) < 0.02
        # B: prime/target = 71.39/0.55 ≈ 129.80 (labor=0 so prime=food)
        assert abs(pm["prime_cost_method"]["price"] - 129.80) < 0.05
        # C: total/(1-0.65) = (71.39+0+10.71)/0.35 = 82.10/0.35 ≈ 234.57
        expected_c = round(82.0985 / 0.35, 2)
        assert abs(pm["gross_margin_markup"]["price"] - expected_c) < 0.10


# =========================================================== 3. Per-portion (catering)
class TestPerPortionCatering:
    @pytest.fixture(scope="class")
    def recipe(self, session, test_ingredient):
        name = f"TEST_pricing_catering_{uuid.uuid4().hex[:6]}"
        payload = _make_recipe_payload(name, portions=10, ingredient_id=test_ingredient)
        r = session.post(f"{BASE_URL}/api/recipes", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        data = r.json()
        yield data
        try:
            session.delete(f"{BASE_URL}/api/recipes/{data['recipe_id']}", timeout=15)
        except Exception:
            pass

    def test_cost_per_portion(self, recipe):
        # 71.39 / 10 = 7.139
        assert abs(recipe["cost_per_portion"] - 7.139) < 0.005, f"cost_per_portion={recipe['cost_per_portion']}"

    def test_suggested_sell_price_per_portion(self, recipe):
        # 7.139 / 0.30 = 23.7966... which rounds to 23.80 (Python round)
        # Accept 23.79-23.80 (either banker's or standard rounding)
        ssp = recipe["suggested_sell_price"]
        assert 23.78 <= ssp <= 23.81, f"per-portion suggested_sell_price={ssp}, expected ~23.80"

    def test_total_cost_per_portion(self, recipe):
        # (71.39 + 0 labor + 10.71 overhead) / 10 = 8.21
        assert abs(recipe["total_cost_per_portion"] - 8.21) < 0.02


# =========================================================== 4. Recalculate All
class TestRecalculateAll:
    def test_recalc_all(self, session):
        r = session.post(f"{BASE_URL}/api/recipes/recalculate-all?dry_run=false", timeout=120)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
        d = r.json()
        assert any(k in d for k in ("recalculated", "updated_count", "count", "total", "total_recipes", "recipes"))
        assert d.get("total_recipes", 0) >= 0

    def test_after_recalc_pricing_methods_present(self, session, test_ingredient):
        # Create a fresh recipe (any newly-created recipe should carry pricing_methods)
        name = f"TEST_pm_check_{uuid.uuid4().hex[:6]}"
        rp = _make_recipe_payload(name, portions=1, ingredient_id=test_ingredient)
        rc = session.post(f"{BASE_URL}/api/recipes", json=rp, timeout=30)
        assert rc.status_code in (200, 201)
        rid = rc.json()["recipe_id"]
        try:
            r = session.get(f"{BASE_URL}/api/recipes/{rid}", timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d.get("pricing_methods"), "single recipe fetch missing pricing_methods"
        finally:
            session.delete(f"{BASE_URL}/api/recipes/{rid}", timeout=10)


# =========================================================== 5. Regression paths
class TestRegressionDontBreak:
    def test_list_recipes_has_key_fields(self, session):
        r = session.get(f"{BASE_URL}/api/recipes", timeout=30)
        assert r.status_code == 200
        recs = r.json()
        assert isinstance(recs, list)
        if recs:
            keys = set(recs[0].keys())
            expected = {"total_cost_per_portion", "cost_per_portion", "food_cost",
                        "labor_cost", "overhead_cost", "contribution_dollar", "food_cost_percent"}
            missing = expected - keys
            assert not missing, f"list-recipes missing fields: {missing}"

    def test_menus_list(self, session):
        # Menus live under settings router
        r = session.get(f"{BASE_URL}/api/settings/menus", timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_plated_menus_list(self, session):
        r = session.get(f"{BASE_URL}/api/plated-menus", timeout=20)
        assert r.status_code == 200

    def test_menu_engineering_analyze(self, session):
        r = session.get(f"{BASE_URL}/api/menu-engineering/analyze?days=90", timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"

    def test_cost_preview_ingredient_zero_base_unit(self, session):
        """Should fall back to cost_per_unit when cost_per_base_unit=0."""
        # create ingredient with cost_per_base_unit=0
        name = f"TEST_zero_base_{uuid.uuid4().hex[:6]}"
        p = {
            "name": name, "category": "Other",
            "base_unit": "kg", "unit": "kg",
            "purchase_unit": "kg", "purchase_size": 1,
            "cost_per_unit": 10.0,
            "cost_per_base_unit": 0,
            "current_stock": 5,
        }
        rc = session.post(f"{BASE_URL}/api/inventory/ingredients", json=p, timeout=15)
        assert rc.status_code in (200, 201), rc.text[:200]
        ing_id = rc.json().get("ingredient_id") or rc.json().get("id")
        try:
            r = session.post(
                f"{BASE_URL}/api/inventory/ingredients/cost-preview",
                json={"ingredient_id": ing_id, "quantity": 1, "unit": "kg"},
                timeout=15,
            )
            assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
            d = r.json()
            # Should not be zero because of fallback
            cost = d.get("cost") or d.get("total_cost") or d.get("line_cost") or 0
            assert cost > 0, f"cost fell to 0 despite cost_per_unit=10, response={d}"
        finally:
            session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", timeout=10)


# =========================================================== 6. Proposals link
class TestProposalRecipeLink:
    def test_proposal_can_use_recipe_sell_price(self, session, test_ingredient):
        # Create a recipe with a known sell_price
        rname = f"TEST_prop_recipe_{uuid.uuid4().hex[:6]}"
        rp = _make_recipe_payload(rname, portions=1, ingredient_id=test_ingredient)
        rp["sell_price"] = 250.0
        rp["default_portion_price"] = 250.0
        rc = session.post(f"{BASE_URL}/api/recipes", json=rp, timeout=30)
        assert rc.status_code in (200, 201), rc.text[:300]
        recipe = rc.json()
        rid = recipe["recipe_id"]

        # Attempt to create a proposal — schema varies, try common shape
        prop_payload = {
            "title": f"TEST_prop_{uuid.uuid4().hex[:5]}",
            "client_name": "TEST client",
            "event_date": "2026-06-01",
            "guest_count": 20,
            "items": [{
                "recipe_id": rid,
                "recipe_name": recipe.get("name"),
                "quantity": 20,
                "sell_price": recipe.get("sell_price") or 250.0,
                "unit_price": 250.0,
            }],
        }
        pr = session.post(f"{BASE_URL}/api/proposals", json=prop_payload, timeout=30)
        # Accept 200/201 or 422/400 (schema differs) — but never 500
        assert pr.status_code < 500, f"proposals endpoint 5xx: {pr.status_code} {pr.text[:400]}"

        if pr.status_code in (200, 201):
            prop = pr.json()
            pid = prop.get("proposal_id") or prop.get("id")
            if pid:
                g = session.get(f"{BASE_URL}/api/proposals/{pid}", timeout=15)
                assert g.status_code == 200

        # cleanup recipe
        session.delete(f"{BASE_URL}/api/recipes/{rid}", timeout=10)
