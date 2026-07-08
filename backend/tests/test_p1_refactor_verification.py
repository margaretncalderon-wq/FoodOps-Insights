"""
P1 Refactor Verification - Tests endpoints extracted from monolithic server.py
into new router modules. Purely structural refactor - business logic unchanged.

Focus: (a) all extracted routers respond correctly (b) full CRUD cycles
(c) endpoints using re-imported helpers (calculate_recipe_cost, _resolve_buffet_factor)
(d) known bug fix: POST /recipes/{id}/duplicate no longer leaks ObjectId `_id`.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"

TAG = f"P1TEST_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def existing_client_id(client):
    """Get an existing CRM client to attach events to."""
    r = client.get(f"{API}/clients")
    if r.status_code != 200:
        pytest.skip(f"cannot list clients: {r.status_code}")
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    if not items:
        pytest.skip("no existing clients to link events")
    return items[0].get("client_id") or items[0].get("id")


# ---------- Smoke: All extracted router GET endpoints respond ----------
class TestSmokeGetEndpoints:
    """Verify all extracted routers respond (200) without import errors."""

    @pytest.mark.parametrize("path", [
        "/buffet-factors",
        "/plated-menus",
        "/recipes",
        "/suppliers",
        "/inventory",
        "/inventory/ingredients",
        "/inventory/low-stock",
        "/inventory/valuation",
        "/inventory/transactions",
        "/inventory/reservations",
        "/inventory/value-summary",
        "/events",
        "/events/pipeline",
        "/events/confirmed",
        "/events/lost-reasons-analytics",
        "/purchase-orders",
        "/purchase-lists",
        "/proposals/cost-health/overview",
        "/proposals/section-templates",
        "/menu-engineering/analyze",
        "/people-ops/employees",
        "/expenses",
    ])
    def test_get_endpoint_ok(self, client, path):
        r = client.get(f"{API}{path}", timeout=60)
        assert r.status_code in (200, 204), f"{path} -> {r.status_code}: {r.text[:250]}"


# ---------- No ObjectId leak in list responses ----------
class TestNoObjectIdLeaks:
    @pytest.mark.parametrize("path", [
        "/recipes", "/suppliers", "/inventory/ingredients", "/plated-menus",
        "/events", "/purchase-orders", "/buffet-factors",
    ])
    def test_no_mongo_id_leak(self, client, path):
        r = client.get(f"{API}{path}")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or []
        for it in items[:5]:
            assert "_id" not in it, f"{path} leaks _id: {list(it.keys())[:10]}"


# ---------- Buffet Factors CRUD (uses _resolve_buffet_factor helper) ----------
class TestBuffetFactors:
    created_id = None

    def test_create(self, client):
        payload = {
            "scope_type": "default",
            "scope_id": None,
            "factor": 1.25,
            "applies_to_menu_types": ["buffet"],
            "notes": f"{TAG}",
        }
        r = client.post(f"{API}/buffet-factors", json=payload)
        assert r.status_code in (200, 201), r.text[:300]
        body = r.json()
        assert "_id" not in body
        TestBuffetFactors.created_id = body.get("factor_id")
        assert TestBuffetFactors.created_id, body

    def test_list_contains(self, client):
        r = client.get(f"{API}/buffet-factors")
        assert r.status_code == 200
        ids = [x.get("factor_id") for x in r.json()]
        assert TestBuffetFactors.created_id in ids

    def test_update(self, client):
        if not TestBuffetFactors.created_id:
            pytest.skip()
        payload = {
            "scope_type": "default", "scope_id": None,
            "factor": 1.5, "applies_to_menu_types": ["buffet"],
            "notes": f"{TAG}_upd",
        }
        r = client.put(f"{API}/buffet-factors/{TestBuffetFactors.created_id}", json=payload)
        assert r.status_code in (200, 204), r.text[:200]

    def test_delete(self, client):
        if not TestBuffetFactors.created_id:
            pytest.skip()
        r = client.delete(f"{API}/buffet-factors/{TestBuffetFactors.created_id}")
        assert r.status_code in (200, 204), r.text[:200]


# ---------- Suppliers CRUD ----------
class TestSuppliers:
    created_id = None

    def test_create(self, client):
        r = client.post(f"{API}/suppliers", json={
            "name": f"{TAG}_sup", "contact_name": "T", "phone": "555",
            "category": "General",
        })
        assert r.status_code in (200, 201), r.text[:300]
        body = r.json()
        assert "_id" not in body
        TestSuppliers.created_id = body.get("supplier_id") or body.get("id")
        assert TestSuppliers.created_id, body

    def test_update(self, client):
        r = client.put(f"{API}/suppliers/{TestSuppliers.created_id}", json={
            "name": f"{TAG}_sup_upd", "category": "General",
        })
        assert r.status_code in (200, 204), r.text[:300]

    def test_extended(self, client):
        r = client.put(f"{API}/suppliers/{TestSuppliers.created_id}/extended",
                       json={"payment_terms": "NET30"})
        assert r.status_code in (200, 204), r.text[:200]

    def test_delete(self, client):
        r = client.delete(f"{API}/suppliers/{TestSuppliers.created_id}")
        assert r.status_code in (200, 204)


# ---------- Recipes: CRUD + duplicate (ObjectId bug fix) + helpers ----------
class TestRecipes:
    created_id = None
    duplicated_id = None

    def test_create(self, client):
        payload = {
            "name": f"{TAG}_recipe",
            "category": "Main",
            "yield_quantity": 10,
            "yield_unit": "portion",
            "ingredients": [],
        }
        r = client.post(f"{API}/recipes", json=payload)
        assert r.status_code in (200, 201), r.text[:400]
        body = r.json()
        assert "_id" not in body, f"ObjectId leaked in create: {list(body.keys())}"
        TestRecipes.created_id = body.get("recipe_id") or body.get("id")
        assert TestRecipes.created_id, body

    def test_duplicate_no_objectid_leak(self, client):
        """REGRESSION: POST /recipes/{id}/duplicate previously leaked ObjectId."""
        if not TestRecipes.created_id:
            pytest.skip()
        r = client.post(f"{API}/recipes/{TestRecipes.created_id}/duplicate")
        assert r.status_code in (200, 201), f"Duplicate failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert "_id" not in body, f"BUG NOT FIXED: ObjectId leaked in duplicate: {list(body.keys())}"
        TestRecipes.duplicated_id = body.get("recipe_id") or body.get("id")
        assert TestRecipes.duplicated_id
        assert TestRecipes.duplicated_id != TestRecipes.created_id

    def test_scale(self, client):
        if not TestRecipes.created_id:
            pytest.skip()
        r = client.post(f"{API}/recipes/{TestRecipes.created_id}/scale",
                        json={"target_portions": 20})
        assert r.status_code in (200, 201), r.text[:300]

    def test_cost_history(self, client):
        if not TestRecipes.created_id:
            pytest.skip()
        r = client.get(f"{API}/recipes/{TestRecipes.created_id}/cost-history")
        assert r.status_code == 200, r.text[:200]

    def test_portion_formats(self, client):
        if not TestRecipes.created_id:
            pytest.skip()
        r = client.get(f"{API}/recipes/{TestRecipes.created_id}/portion-formats")
        assert r.status_code == 200, r.text[:200]

    def test_update(self, client):
        r = client.put(f"{API}/recipes/{TestRecipes.created_id}", json={
            "name": f"{TAG}_recipe_upd",
            "category": "Main",
            "yield_quantity": 12,
            "yield_unit": "portion",
            "ingredients": [],
        })
        assert r.status_code in (200, 204), r.text[:300]

    def test_delete_both(self, client):
        for rid in [TestRecipes.created_id, TestRecipes.duplicated_id]:
            if rid:
                r = client.delete(f"{API}/recipes/{rid}")
                assert r.status_code in (200, 204, 404), r.text[:200]


# ---------- Plated Menus CRUD + helper endpoints (_resolve_buffet_factor) ----------
class TestPlatedMenus:
    created_id = None

    def test_create(self, client):
        payload = {"name": f"{TAG}_pm", "menu_type": "plated", "courses": []}
        r = client.post(f"{API}/plated-menus", json=payload)
        assert r.status_code in (200, 201), r.text[:400]
        body = r.json()
        assert "_id" not in body
        TestPlatedMenus.created_id = body.get("menu_id") or body.get("id")
        assert TestPlatedMenus.created_id, body

    def test_staleness(self, client):
        if not TestPlatedMenus.created_id:
            pytest.skip()
        r = client.get(f"{API}/plated-menus/{TestPlatedMenus.created_id}/staleness")
        assert r.status_code == 200, r.text[:300]

    def test_projected_cost(self, client):
        """Uses _resolve_buffet_factor helper - critical integration point."""
        if not TestPlatedMenus.created_id:
            pytest.skip()
        r = client.get(f"{API}/plated-menus/{TestPlatedMenus.created_id}/projected-cost")
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        assert "_id" not in body

    def test_update(self, client):
        if not TestPlatedMenus.created_id:
            pytest.skip()
        r = client.put(f"{API}/plated-menus/{TestPlatedMenus.created_id}",
                       json={"name": f"{TAG}_pm_upd", "menu_type": "plated", "courses": []})
        assert r.status_code in (200, 204), r.text[:300]

    def test_delete(self, client):
        if not TestPlatedMenus.created_id:
            pytest.skip()
        r = client.delete(f"{API}/plated-menus/{TestPlatedMenus.created_id}")
        assert r.status_code in (200, 204)


# ---------- Inventory / Ingredients CRUD ----------
class TestInventory:
    created_id = None

    def test_create_ingredient(self, client):
        payload = {
            "name": f"{TAG}_ing",
            "category": "produce",
            "unit": "kg",
            "cost_per_unit": 5.0,
            "stock_quantity": 100,
        }
        r = client.post(f"{API}/inventory/ingredients", json=payload)
        assert r.status_code in (200, 201), r.text[:400]
        body = r.json()
        assert "_id" not in body
        TestInventory.created_id = body.get("ingredient_id") or body.get("id")
        assert TestInventory.created_id, body

    def test_adjust(self, client):
        if not TestInventory.created_id:
            pytest.skip()
        r = client.post(f"{API}/inventory/ingredients/{TestInventory.created_id}/adjust",
                        json={"quantity_change": 10.0, "reason": "test",
                              "adjustment_type": "increase"})
        assert r.status_code in (200, 201, 204), r.text[:300]

    def test_extended(self, client):
        if not TestInventory.created_id:
            pytest.skip()
        r = client.put(f"{API}/inventory/ingredients/{TestInventory.created_id}/extended",
                       json={"lead_time_days": 3})
        assert r.status_code in (200, 204), r.text[:300]

    def test_update(self, client):
        if not TestInventory.created_id:
            pytest.skip()
        r = client.put(f"{API}/inventory/ingredients/{TestInventory.created_id}",
                       json={"cost_per_unit": 6.0})
        assert r.status_code in (200, 204), r.text[:300]

    def test_import_template(self, client):
        r = client.get(f"{API}/inventory/import-template")
        assert r.status_code == 200

    def test_delete(self, client):
        if not TestInventory.created_id:
            pytest.skip()
        r = client.delete(f"{API}/inventory/ingredients/{TestInventory.created_id}")
        assert r.status_code in (200, 204)


# ---------- Events CRUD + related endpoints ----------
class TestEvents:
    created_id = None

    def test_create(self, client, existing_client_id):
        payload = {
            "client_id": existing_client_id,
            "name": f"{TAG}_event",
            "event_type": "wedding",
            "event_date": "2026-12-01T18:00:00",
            "guest_count": 50,
            "status": "planning",
        }
        r = client.post(f"{API}/events", json=payload)
        assert r.status_code in (200, 201), r.text[:400]
        body = r.json()
        assert "_id" not in body
        TestEvents.created_id = body.get("event_id") or body.get("id")
        assert TestEvents.created_id, body

    def test_stock_check(self, client):
        if not TestEvents.created_id:
            pytest.skip()
        r = client.get(f"{API}/events/{TestEvents.created_id}/stock-check")
        assert r.status_code == 200, r.text[:200]

    def test_financials(self, client):
        if not TestEvents.created_id:
            pytest.skip()
        r = client.get(f"{API}/events/{TestEvents.created_id}/financials")
        assert r.status_code == 200, r.text[:200]

    def test_packing_list(self, client):
        if not TestEvents.created_id:
            pytest.skip()
        r = client.get(f"{API}/events/{TestEvents.created_id}/packing-list")
        assert r.status_code == 200

    def test_packing_list_supplies(self, client):
        if not TestEvents.created_id:
            pytest.skip()
        r = client.get(f"{API}/events/{TestEvents.created_id}/packing-list-supplies")
        assert r.status_code == 200

    def test_duplicate(self, client):
        if not TestEvents.created_id:
            pytest.skip()
        r = client.post(f"{API}/events/{TestEvents.created_id}/duplicate")
        assert r.status_code in (200, 201), r.text[:400]
        body = r.json()
        assert "_id" not in body
        new_id = body.get("event_id") or body.get("id")
        if new_id:
            client.delete(f"{API}/events/{new_id}")

    def test_delete(self, client):
        if not TestEvents.created_id:
            pytest.skip()
        r = client.delete(f"{API}/events/{TestEvents.created_id}")
        assert r.status_code in (200, 204)


# ---------- Kitchen BEO (uses _resolve_buffet_factor) ----------
class TestKitchenBEO:
    def test_batch(self, client):
        r = client.get(f"{API}/kitchen-beo/batch",
                       params={"start_date": "2026-01-01", "end_date": "2026-12-31"})
        assert r.status_code == 200, r.text[:300]

    def test_event_endpoint_resolves(self, client):
        r = client.get(f"{API}/kitchen-beo/event/nonexistent_event_id_xyz")
        assert r.status_code in (200, 404), r.text[:300]


# ---------- Proposals ----------
class TestProposals:
    def test_cost_health_overview(self, client):
        r = client.get(f"{API}/proposals/cost-health/overview")
        assert r.status_code == 200

    def test_section_templates(self, client):
        r = client.get(f"{API}/proposals/section-templates")
        assert r.status_code == 200


# ---------- Purchase Orders ----------
class TestPurchaseOrders:
    def test_list(self, client):
        r = client.get(f"{API}/purchase-orders")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or []
        if items:
            assert "_id" not in items[0]
