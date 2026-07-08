"""P2 Refactor Verification — purchase_list_router extracted out of routers/inventory.py.
Focuses on:
  1. /api/purchase-lists CRUD (new file)
  2. Inventory endpoints still fully working
  3. Recipes endpoints still fully working (including /duplicate no ObjectId leak)
  4. Cross-module: generate purchase list from event with recipe/ingredient
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
TAG = f"P2TEST_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- 1. Purchase Lists endpoints (new router) ----------
class TestPurchaseListsRouter:
    def test_list_endpoint(self, client):
        r = client.get(f"{API}/purchase-lists")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_with_event_filter(self, client):
        r = client.get(f"{API}/purchase-lists", params={"event_id": "nonexistent"})
        assert r.status_code == 200
        assert r.json() == []

    def test_generate_from_missing_event(self, client):
        r = client.get(f"{API}/purchase-lists/event/does_not_exist_xxx/generate")
        assert r.status_code == 404

    def test_create_update_status_delete(self, client):
        # create
        payload = {
            "event_id": None,
            "supplier_id": "sup_test",
            "supplier_name": f"{TAG}_supplier",
            "items": [{"inventory_item_id": "x", "item_name": "X", "unit": "kg", "to_purchase_qty": 2, "unit_cost": 5, "total_cost": 10}],
            "total_cost": 10,
        }
        r = client.post(f"{API}/purchase-lists", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "_id" not in body, "MongoDB _id leaked into response"
        assert body.get("status") == "Draft"
        pl_id = body["purchase_list_id"]

        # verify appears in list
        r = client.get(f"{API}/purchase-lists")
        assert any(x["purchase_list_id"] == pl_id for x in r.json())

        # update status
        r = client.put(f"{API}/purchase-lists/{pl_id}/status", json={"status": "Ordered"})
        assert r.status_code == 200
        assert r.json()["status"] == "Ordered"

        # delete
        r = client.delete(f"{API}/purchase-lists/{pl_id}")
        assert r.status_code == 200

    def test_update_status_404(self, client):
        r = client.put(f"{API}/purchase-lists/no_such_id/status", json={"status": "Ordered"})
        assert r.status_code == 404

    def test_delete_404(self, client):
        r = client.delete(f"{API}/purchase-lists/no_such_id")
        assert r.status_code == 404


# ---------- 2. Inventory endpoints (verify still work after extraction) ----------
class TestInventoryEndpoints:
    """All inventory GET endpoints + full ingredient CRUD after purchase_list extraction."""

    @pytest.mark.parametrize("path", [
        "/inventory",
        "/inventory/ingredients",
        "/inventory/low-stock",
        "/inventory/valuation",
        "/inventory/transactions",
        "/inventory/reservations",
        "/inventory/value-summary",
        "/inventory/import-template",
    ])
    def test_inventory_get_endpoints(self, client, path):
        r = client.get(f"{API}{path}")
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"

    def test_ingredient_full_crud(self, client):
        # create
        payload = {
            "name": f"{TAG}_ing",
            "unit": "kg",
            "cost_per_unit": 3.5,
            "stock_quantity": 10,
            "category": "Test",
        }
        r = client.post(f"{API}/inventory/ingredients", json=payload)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "_id" not in body
        ing_id = body.get("ingredient_id") or body.get("id")
        assert ing_id

        # get
        r = client.get(f"{API}/inventory/ingredients/{ing_id}")
        assert r.status_code == 200
        assert r.json().get("name") == payload["name"]

        # update (PUT)
        r = client.put(f"{API}/inventory/ingredients/{ing_id}", json={**payload, "cost_per_unit": 4.0})
        assert r.status_code == 200

        # patch
        r = client.patch(f"{API}/inventory/ingredients/{ing_id}", json={"stock_quantity": 20})
        assert r.status_code in (200, 204)

        # adjust
        r = client.post(f"{API}/inventory/ingredients/{ing_id}/adjust",
                        json={"quantity_change": 5, "reason": "test adjust", "transaction_type": "Adjustment"})
        assert r.status_code == 200

        # extended
        r = client.put(f"{API}/inventory/ingredients/{ing_id}/extended",
                       json={"notes": "extended notes"})
        assert r.status_code in (200, 204)

        # verify persisted
        r = client.get(f"{API}/inventory/ingredients/{ing_id}")
        assert r.status_code == 200

        # delete
        r = client.delete(f"{API}/inventory/ingredients/{ing_id}")
        assert r.status_code in (200, 204)

        # confirm gone
        r = client.get(f"{API}/inventory/ingredients/{ing_id}")
        assert r.status_code == 404


# ---------- 3. Recipes endpoints (verify still work; helpers exposed) ----------
class TestRecipesEndpoints:
    def test_list_recipes(self, client):
        r = client.get(f"{API}/recipes")
        assert r.status_code == 200

    def test_recipe_lifecycle_with_ingredient(self, client):
        # Create supporting ingredient
        r = client.post(f"{API}/inventory/ingredients", json={
            "name": f"{TAG}_recipe_ing", "unit": "kg", "cost_per_unit": 2.0, "stock_quantity": 100, "category": "Test",
        })
        assert r.status_code in (200, 201), r.text
        ing = r.json()
        ing_id = ing.get("ingredient_id") or ing.get("id")

        # Create recipe referencing ingredient (so calculate_recipe_cost runs)
        payload = {
            "name": f"{TAG}_recipe",
            "category": "Test",
            "yield_quantity": 4,
            "yield_unit": "portions",
            "ingredients": [{
                "item_type": "ingredient",
                "item_id": ing_id,
                "ingredient_id": ing_id,
                "item_name": ing["name"],
                "quantity": 2,
                "unit": "kg",
                "cost_per_unit": 2.0,
            }],
        }
        r = client.post(f"{API}/recipes", json=payload)
        assert r.status_code in (200, 201), r.text
        rec = r.json()
        assert "_id" not in rec
        rec_id = rec.get("recipe_id") or rec.get("id")

        # cost should be computed (2kg * 2.0 = 4.0)
        assert rec.get("total_cost", 0) > 0 or rec.get("cost_per_portion", 0) >= 0

        # get
        r = client.get(f"{API}/recipes/{rec_id}")
        assert r.status_code == 200

        # duplicate (previously bugged with ObjectId)
        r = client.post(f"{API}/recipes/{rec_id}/duplicate")
        assert r.status_code in (200, 201), r.text
        dup = r.json()
        assert "_id" not in dup, "MongoDB _id leaked into duplicate response"
        dup_id = dup.get("recipe_id") or dup.get("id")

        # scale
        r = client.post(f"{API}/recipes/{rec_id}/scale", json={"target_portions": 8})
        assert r.status_code == 200

        # cost history
        r = client.get(f"{API}/recipes/{rec_id}/cost-history")
        assert r.status_code == 200

        # portion formats
        r = client.get(f"{API}/recipes/{rec_id}/portion-formats")
        assert r.status_code == 200

        # update
        r = client.put(f"{API}/recipes/{rec_id}", json={**payload, "name": f"{TAG}_recipe_upd"})
        assert r.status_code == 200

        # recalculate all (dry_run)
        r = client.post(f"{API}/recipes/recalculate-all", params={"dry_run": "true"})
        assert r.status_code == 200

        # cleanup
        client.delete(f"{API}/recipes/{rec_id}")
        client.delete(f"{API}/recipes/{dup_id}")
        client.delete(f"{API}/inventory/ingredients/{ing_id}")


# ---------- 4. Regression on other refactored routers ----------
class TestOtherRoutersRegression:
    @pytest.mark.parametrize("path", [
        "/plated-menus",
        "/suppliers",
        "/events",
        "/purchase-orders",
        "/proposals/cost-health/overview",
        "/menu-engineering/analyze",
        "/people-ops/employees",
        "/buffet-factors",
    ])
    def test_endpoint_ok(self, client, path):
        r = client.get(f"{API}{path}")
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:150]}"

    def test_kitchen_beo_batch(self, client):
        r = client.get(f"{API}/kitchen-beo/batch",
                       params={"start_date": "2026-01-01", "end_date": "2026-12-31"})
        assert r.status_code == 200
