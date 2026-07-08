"""Bug-fix regression suite for the P1/P2 refactor's `_generate_proposal_number`
wrapper regression.

Root cause: after P1 moved `generate_proposal_number` from server.py into
routers/proposals.py, both routers/proposals.py and routers/events.py still had
`from server import generate_proposal_number` inside their `_generate_proposal_number`
wrappers → ImportError at runtime → HTTP 500 on:
  - GET /api/proposals/event/{event_id} when event has NO existing proposal
    (auto-create path)
  - POST /api/events/{event_id}/duplicate (also calls the wrapper)

Additionally validates BUG-2: /api/suppliers works (frontend InventoryPage
was calling the non-existent /api/inventory/suppliers).
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
TAG = f"BUGFIX_{uuid.uuid4().hex[:6]}"

PROP_NUM_RE = re.compile(r"^PROP-\d{4}-\d{4,}$")


@pytest.fixture(scope="module")
def client():
    r = requests.post(
        f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def any_client_id(client):
    r = client.get(f"{API}/clients", timeout=30)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    lst = data if isinstance(data, list) else data.get("clients", [])
    assert lst, "no clients available in tenant"
    return lst[0].get("client_id") or lst[0].get("id")


@pytest.fixture(scope="module")
def fresh_event(client, any_client_id):
    """Create a brand-new event with no attached proposal — this is the code
    path that broke in production."""
    payload = {
        "client_id": any_client_id,
        "name": f"{TAG}_event",
        "event_type": "other",
        "guest_count": 10,
        "budget": 0,
        "stage": "Inquiry Received",
    }
    r = client.post(f"{API}/events", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create event failed: {r.status_code} {r.text[:300]}"
    ev = r.json()
    eid = ev.get("event_id") or ev.get("id")
    assert eid, f"no event_id in response: {ev}"
    yield eid
    # cleanup
    try:
        client.delete(f"{API}/events/{eid}", timeout=30)
    except Exception:
        pass


# ============ BUG-1: proposal auto-create path ============

class TestBug1ProposalAutoCreate:
    def test_get_event_proposal_auto_creates_when_none_exists(self, client, fresh_event):
        """GET /api/proposals/event/{event_id} on a new event with NO proposal
        must auto-create one and return 200 with a well-formed PROP-YYYY-NNNN
        number. Regression for the `_generate_proposal_number` ImportError."""
        r = client.get(f"{API}/proposals/event/{fresh_event}", timeout=30)
        assert r.status_code == 200, (
            f"expected 200 but got {r.status_code}: {r.text[:400]}"
        )
        data = r.json()
        # Response may be flat proposal or {proposal: {...}}
        prop = data.get("proposal") if isinstance(data, dict) and "proposal" in data else data
        assert prop.get("proposal_id"), f"no proposal_id in response: {prop}"
        assert prop.get("event_id") == fresh_event
        number = prop.get("proposal_number")
        assert number and PROP_NUM_RE.match(number), (
            f"proposal_number malformed: {number!r}"
        )

    def test_get_event_proposal_second_call_returns_same(self, client, fresh_event):
        """Second call should return the SAME proposal (not create a new one)."""
        r1 = client.get(f"{API}/proposals/event/{fresh_event}", timeout=30)
        r2 = client.get(f"{API}/proposals/event/{fresh_event}", timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        p1 = r1.json()
        p2 = r2.json()
        prop1 = p1.get("proposal") if "proposal" in p1 else p1
        prop2 = p2.get("proposal") if "proposal" in p2 else p2
        assert prop1["proposal_id"] == prop2["proposal_id"]
        assert prop1["proposal_number"] == prop2["proposal_number"]


# ============ BUG-1b: duplicate event path uses same wrapper ============

class TestBug1DuplicateEvent:
    def test_duplicate_event_generates_new_proposal_number(self, client, fresh_event):
        """POST /api/events/{event_id}/duplicate must also succeed —
        events.py has its own `_generate_proposal_number` wrapper that was
        stale in the same way."""
        # Ensure source event has a proposal so duplicate has something to clone
        client.get(f"{API}/proposals/event/{fresh_event}", timeout=30)

        r = client.post(f"{API}/events/{fresh_event}/duplicate", timeout=30)
        assert r.status_code in (200, 201), (
            f"duplicate failed: {r.status_code} {r.text[:400]}"
        )
        ev = r.json()
        new_eid = ev.get("event_id") or ev.get("id")
        assert new_eid and new_eid != fresh_event

        # Confirm proposal exists on the duplicate with a valid number
        pr = client.get(f"{API}/proposals/event/{new_eid}", timeout=30)
        assert pr.status_code == 200, pr.text[:300]
        prop = pr.json()
        prop = prop.get("proposal") if "proposal" in prop else prop
        assert PROP_NUM_RE.match(prop.get("proposal_number", "")), (
            f"duplicate proposal_number malformed: {prop.get('proposal_number')!r}"
        )

        # cleanup
        try:
            client.delete(f"{API}/events/{new_eid}", timeout=30)
        except Exception:
            pass


# ============ BUG-2: suppliers endpoint ============

class TestBug2Suppliers:
    def test_get_suppliers_returns_200(self, client):
        """GET /api/suppliers must return 200 (frontend InventoryPage's
        Promise.all was blowing up on 404 from stale /inventory/suppliers)."""
        r = client.get(f"{API}/suppliers", timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_stale_inventory_suppliers_is_404(self, client):
        """The old bogus path /api/inventory/suppliers should stay 404 to
        prove the frontend fix (redirect to /api/suppliers) was necessary."""
        r = client.get(f"{API}/inventory/suppliers", timeout=30)
        assert r.status_code in (404, 405), f"unexpected: {r.status_code}"

    def test_post_supplier_create(self, client):
        """POST /api/suppliers should create a supplier."""
        payload = {
            "name": f"{TAG}_supplier",
            "contact_name": "Test",
            "email": "t@t.com",
            "phone": "555",
        }
        r = client.post(f"{API}/suppliers", json=payload, timeout=30)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
        body = r.json()
        sid = body.get("supplier_id") or body.get("id")
        assert sid
        # cleanup
        try:
            client.delete(f"{API}/suppliers/{sid}", timeout=30)
        except Exception:
            pass


# ============ Regression: inventory + recipes still load ============

class TestBug2InventoryRecipesLoad:
    def test_inventory_list(self, client):
        r = client.get(f"{API}/inventory", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_recipes_list(self, client):
        r = client.get(f"{API}/recipes", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_low_stock(self, client):
        r = client.get(f"{API}/inventory/low-stock", timeout=30)
        assert r.status_code == 200

    def test_inventory_categories(self, client):
        r = client.get(f"{API}/settings/inventory-categories", timeout=30)
        assert r.status_code == 200

    def test_allergens(self, client):
        r = client.get(f"{API}/allergens", timeout=30)
        assert r.status_code == 200

    def test_plated_menus(self, client):
        r = client.get(f"{API}/plated-menus", timeout=30)
        assert r.status_code == 200

    def test_events_confirmed(self, client):
        r = client.get(f"{API}/events/confirmed", timeout=30)
        assert r.status_code == 200

    def test_purchase_lists(self, client):
        r = client.get(f"{API}/purchase-lists", timeout=30)
        assert r.status_code == 200

    def test_inventory_transactions(self, client):
        r = client.get(f"{API}/inventory/transactions", timeout=30)
        assert r.status_code == 200


# ============ Cost-health slice (uses same import chain) ============

class TestCostHealthSlice:
    def test_cost_health_overview_ok(self, client):
        r = client.get(f"{API}/proposals/cost-health/overview", timeout=30)
        assert r.status_code == 200, r.text[:200]
