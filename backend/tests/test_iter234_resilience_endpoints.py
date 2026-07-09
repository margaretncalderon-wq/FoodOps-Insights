"""
Iteration 234 — Real-world endpoint smoke test + proposal auto-create regression.

Verifies the endpoints that FoodOpsPage / InventoryPage / recipes / menu-engineering
consume all return 200 for the demo tenant, and that the proposal auto-create
flow (previously broken by ImportError) still works end-to-end.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- REAL-WORLD-1: FoodOps / Inventory / Recipes / Menu-engineering endpoints ---
FOODOPS_ENDPOINTS = [
    "/api/inventory/ingredients",
    "/api/suppliers",
    "/api/inventory/transactions",
    "/api/settings/inventory-categories",
    "/api/allergens",
    "/api/recipes",
    "/api/plated-menus",
    "/api/buffet-factors",
    "/api/inventory/low-stock",
]


@pytest.mark.parametrize("path", FOODOPS_ENDPOINTS)
def test_endpoint_returns_200(session, path):
    r = session.get(f"{BASE_URL}{path}", timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    # must be JSON (list or dict)
    data = r.json()
    assert isinstance(data, (list, dict)), f"{path} returned non-JSON container"


def test_menu_engineering_analyze(session):
    # POST endpoint - just verify it doesn't 5xx
    r = session.post(f"{BASE_URL}/api/menu-engineering/analyze", json={}, timeout=30)
    assert r.status_code < 500, f"menu-engineering/analyze crashed: {r.status_code} {r.text[:300]}"


# --- REAL-WORLD-2: Proposal auto-create regression ---
def test_proposal_auto_create_on_event(session):
    """Create fresh event, then GET /api/proposals/event/{id} — auto-create must produce PROP-YYYY-NNNN."""
    import datetime, uuid
    # Grab any existing client to satisfy required client_id
    clients_r = session.get(f"{BASE_URL}/api/clients", timeout=30)
    if clients_r.status_code != 200 or not clients_r.json():
        pytest.skip("No clients available to seed event")
    client_id = clients_r.json()[0].get("client_id") or clients_r.json()[0].get("id")
    event_payload = {
        "name": f"TEST_iter234_{uuid.uuid4().hex[:8]}",
        "event_date": (datetime.datetime.utcnow() + datetime.timedelta(days=30)).isoformat(),
        "guest_count": 50,
        "status": "prospect",
        "client_id": client_id,
    }
    created = session.post(f"{BASE_URL}/api/events", json=event_payload, timeout=30)
    if created.status_code == 404:
        pytest.skip("/api/events not exposed on this tenant — skipping regression")
    if created.status_code == 403 and "límite" in created.text.lower():
        pytest.skip(f"Tenant hit plan limit — skipping regression: {created.text[:200]}")
    assert created.status_code in (200, 201), f"create event failed: {created.status_code} {created.text[:300]}"
    event = created.json()
    event_id = event.get("id") or event.get("_id") or event.get("event_id")
    assert event_id, f"no id in event response: {event}"

    # Auto-create proposal
    r = session.get(f"{BASE_URL}/api/proposals/event/{event_id}", timeout=30)
    assert r.status_code == 200, f"proposals/event/{event_id} -> {r.status_code} {r.text[:400]}"
    prop = r.json()
    # Accept dict or list-with-one
    if isinstance(prop, list):
        assert len(prop) >= 1, "expected at least 1 proposal auto-created"
        prop = prop[0]
    number = prop.get("proposal_number") or prop.get("number")
    assert number, f"no proposal_number in response: {prop}"
    import re
    assert re.match(r"^PROP-\d{4}-\d+$", number), f"proposal number not PROP-YYYY-NNNN format: {number}"

    # cleanup
    try:
        session.delete(f"{BASE_URL}/api/events/{event_id}", timeout=15)
    except Exception:
        pass
