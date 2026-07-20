"""E2E HTTP-level tests for conversion-error propagation via public API.

Covers:
 - POST /api/recipes with an ingredient that has no density + line unit of
   different dimension → has_conversion_errors=true persisted.
 - PUT /api/inventory/ingredients/{id} adding density → cascade flips the
   recipe flag back to false.
 - Sub-recipe bubble-up via POST /api/recipes referencing a child that has
   has_conversion_errors=true.
 - GET /api/recipes/{id}/cost-breakdown exposes the conversion_errors fields.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def suffix():
    return uuid.uuid4().hex[:6]


# Track created ids across tests for cleanup
_created = {"ingredients": [], "recipes": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(h):
    yield
    for rid in _created["recipes"]:
        try:
            requests.delete(f"{BASE_URL}/api/recipes/{rid}", headers=h, timeout=15)
        except Exception:
            pass
    for iid in _created["ingredients"]:
        try:
            requests.delete(f"{BASE_URL}/api/inventory/ingredients/{iid}", headers=h, timeout=15)
        except Exception:
            pass


def test_recipe_with_missing_density_gets_has_conversion_errors(h, suffix):
    # 1. Create ingredient with base_unit kg, no density, not in whitelist
    ing_payload = {
        "name": f"TEST_MysteryPasteAAA_{suffix}",
        "category": "Otros",
        "unit": "kg",
        "base_unit": "kg",
        "cost_per_unit": 10.0,
        "current_stock": 0,
    }
    r = requests.post(f"{BASE_URL}/api/inventory/ingredients", headers=h, json=ing_payload, timeout=30)
    assert r.status_code in (200, 201), f"ingredient create: {r.status_code} {r.text}"
    ing = r.json()
    ing_id = ing.get("ingredient_id") or ing.get("id")
    assert ing_id
    _created["ingredients"].append(ing_id)

    # 2. Create recipe using ingredient with unit=L (volume vs weight)
    recipe_payload = {
        "name": f"TEST_BrokenRecipe_{suffix}",
        "category": "Otros",
        "yield_quantity": 1.0,
        "yield_unit": "portion",
        "portions": 1,
        "ingredients": [
            {
                "item_id": ing_id,
                "item_type": "ingredient",
                "quantity": 0.5,
                "unit": "L",
            }
        ],
        "sub_recipes": [],
    }
    r = requests.post(f"{BASE_URL}/api/recipes", headers=h, json=recipe_payload, timeout=30)
    assert r.status_code in (200, 201), f"recipe create: {r.status_code} {r.text}"
    recipe = r.json()
    rid = recipe.get("recipe_id") or recipe.get("id")
    assert rid
    _created["recipes"].append(rid)

    # Persisted flags should be present
    assert recipe.get("has_conversion_errors") is True, f"has_conversion_errors expected True, got {recipe.get('has_conversion_errors')} full={recipe}"
    assert recipe.get("conversion_errors_count", 0) >= 1
    errs = recipe.get("conversion_errors") or []
    assert len(errs) >= 1
    assert any("density" in (e.get("reason", "").lower()) for e in errs), f"reason should mention density: {errs}"

    # GET the recipe — flag should persist
    r = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=h, timeout=30)
    assert r.status_code == 200
    got = r.json()
    assert got.get("has_conversion_errors") is True

    # cost-breakdown endpoint exposes fields
    r = requests.get(f"{BASE_URL}/api/recipes/{rid}/cost-breakdown", headers=h, timeout=30)
    assert r.status_code == 200, f"cost-breakdown: {r.status_code} {r.text}"
    cb = r.json()
    assert "conversion_errors" in cb
    assert "conversion_errors_count" in cb
    assert "has_conversion_errors" in cb
    assert cb["has_conversion_errors"] is True
    assert cb["conversion_errors_count"] >= 1

    # 3. Fix by PUT density on ingredient
    upd = {**ing_payload, "density_g_per_ml": 1.2}
    r = requests.put(f"{BASE_URL}/api/inventory/ingredients/{ing_id}", headers=h, json=upd, timeout=60)
    assert r.status_code in (200, 201), f"ingredient update: {r.status_code} {r.text}"

    # After cascade, the recipe flag must flip back to false
    r = requests.get(f"{BASE_URL}/api/recipes/{rid}", headers=h, timeout=30)
    assert r.status_code == 200
    got2 = r.json()
    assert got2.get("has_conversion_errors") is False, f"expected flag False after density set. recipe={got2}"
    assert (got2.get("conversion_errors_count") or 0) == 0


def test_sub_recipe_bubbles_up_via_api(h, suffix):
    # Reuse same tenant — create a broken child recipe via API using another
    # missing-density ingredient
    ing_payload = {
        "name": f"TEST_MysteryPasteBBB_{suffix}",
        "category": "Otros",
        "unit": "kg",
        "base_unit": "kg",
        "cost_per_unit": 10.0,
        "current_stock": 0,
    }
    r = requests.post(f"{BASE_URL}/api/inventory/ingredients", headers=h, json=ing_payload, timeout=30)
    assert r.status_code in (200, 201)
    ing_id = r.json().get("ingredient_id") or r.json().get("id")
    _created["ingredients"].append(ing_id)

    child_payload = {
        "name": f"TEST_BrokenChild_{suffix}",
        "category": "Otros",
        "yield_quantity": 1.0,
        "yield_unit": "portion",
        "portions": 1,
        "ingredients": [{"item_id": ing_id, "item_type": "ingredient", "quantity": 0.5, "unit": "L"}],
        "sub_recipes": [],
    }
    r = requests.post(f"{BASE_URL}/api/recipes", headers=h, json=child_payload, timeout=30)
    assert r.status_code in (200, 201)
    child = r.json()
    child_id = child.get("recipe_id") or child.get("id")
    _created["recipes"].append(child_id)
    assert child.get("has_conversion_errors") is True

    parent_payload = {
        "name": f"TEST_Parent_{suffix}",
        "category": "Otros",
        "yield_quantity": 1.0,
        "yield_unit": "portion",
        "portions": 1,
        "ingredients": [],
        "sub_recipes": [
            {
                "child_recipe_id": child_id,
                "child_recipe_name": child.get("name"),
                "quantity_used": 1.0,
                "unit": "portion",
            }
        ],
    }
    r = requests.post(f"{BASE_URL}/api/recipes", headers=h, json=parent_payload, timeout=30)
    assert r.status_code in (200, 201), f"parent create: {r.status_code} {r.text}"
    parent = r.json()
    parent_id = parent.get("recipe_id") or parent.get("id")
    _created["recipes"].append(parent_id)

    assert parent.get("has_conversion_errors") is True
    errs = parent.get("conversion_errors") or []
    assert any(e.get("source") == "sub_recipe" for e in errs), f"expected sub_recipe source: {errs}"
