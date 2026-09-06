"""Tests for Kitchen Sheets logistics (internal_delivery_time, departure_time)
and extras_by_type grouping (Alquileres, Desechables, Cristalería, etc.).
Iteration 258.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def event_id(client):
    """Find any event with engagement_type='event' to test on."""
    r = client.get(f"{API}/events", timeout=30)
    assert r.status_code == 200, r.text[:200]
    events = r.json()
    # Prefer one that already has a proposal
    ev = None
    for e in events:
        if (e.get("engagement_type") or "event") == "event":
            ev = e
            break
    assert ev, "No event-type events found for the account"
    return ev["event_id"]


# ---------- Backend: PUT /api/events persists new fields ----------

def test_put_event_persists_logistics_times(client, event_id):
    payload = {"internal_delivery_time": "10:30", "departure_time": "08:15"}
    r = client.put(f"{API}/events/{event_id}", json=payload, timeout=30)
    assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    # Response body — Event model should include the fields
    assert body.get("internal_delivery_time") == "10:30", f"internal_delivery_time not in PUT response: {body}"
    assert body.get("departure_time") == "08:15", f"departure_time not in PUT response: {body}"

    # GET verifies persistence
    g = client.get(f"{API}/events/{event_id}", timeout=30)
    assert g.status_code == 200
    got = g.json()
    assert got.get("internal_delivery_time") == "10:30"
    assert got.get("departure_time") == "08:15"


def test_put_event_can_clear_logistics_times(client, event_id):
    # Set values first
    client.put(f"{API}/events/{event_id}", json={"internal_delivery_time": "09:00", "departure_time": "07:00"}, timeout=30)
    # Now clear
    r = client.put(f"{API}/events/{event_id}", json={"internal_delivery_time": None, "departure_time": None}, timeout=30)
    assert r.status_code == 200
    # Restore for downstream tests
    client.put(f"{API}/events/{event_id}", json={"internal_delivery_time": "10:30", "departure_time": "08:15"}, timeout=30)


# ---------- Backend: GET /api/kitchen-beo/event/{id} returns new fields ----------

def test_kitchen_beo_event_returns_logistics_and_extras_by_type(client, event_id):
    r = client.get(f"{API}/kitchen-beo/event/{event_id}", timeout=60)
    assert r.status_code == 200, f"BEO GET failed: {r.status_code} {r.text[:300]}"
    beo = r.json()
    # Root-level fields present (may be null if event has none set, but keys must exist)
    assert "internal_delivery_time" in beo, "internal_delivery_time missing from BEO payload"
    assert "departure_time" in beo, "departure_time missing from BEO payload"
    assert beo["internal_delivery_time"] == "10:30"
    assert beo["departure_time"] == "08:15"

    # Every tanda must have extras_by_type array
    days = beo.get("days") or []
    for d in days:
        for tanda in d.get("tandas", []):
            assert "extras_by_type" in tanda, f"extras_by_type missing in tanda {tanda.get('tanda_key')}"
            assert isinstance(tanda["extras_by_type"], list)
            for group in tanda["extras_by_type"]:
                for k in ("type_key", "label_es", "label_en", "count", "items"):
                    assert k in group, f"key {k} missing in extras_by_type group: {group}"
                assert group["count"] == len(group["items"]) 


def test_kitchen_beo_extras_not_filtered(client, event_id):
    """Items without a recipe (Alquileres, Desechables, Cristalería) must
    appear in extras/extras_by_type — not silently dropped."""
    r = client.get(f"{API}/kitchen-beo/event/{event_id}", timeout=60)
    assert r.status_code == 200
    beo = r.json()
    total_extras = 0
    total_grouped = 0
    for d in beo.get("days", []):
        for tanda in d.get("tandas", []):
            total_extras += len(tanda.get("extras", []))
            total_grouped += sum(g["count"] for g in tanda.get("extras_by_type", []))
    # If there are any extras, extras_by_type must mirror them (counts match)
    assert total_extras == total_grouped, (
        f"extras ({total_extras}) and extras_by_type ({total_grouped}) counts diverge"
    )


# ---------- Backend: batch endpoint carries fields ----------

def test_kitchen_beo_batch_carries_new_fields(client, event_id):
    # First get the event dates
    ev = client.get(f"{API}/events/{event_id}", timeout=30).json()
    edate = (ev.get("event_date") or "")[:10] or "2020-01-01"
    r = client.get(f"{API}/kitchen-beo/batch", params={"start_date": edate, "end_date": edate,
                                                       "include_stages": "Won,Committed,Confirmed,Inquiry Received,Context Captured,Scope Drafted,Definition In Review"},
                   timeout=60)
    assert r.status_code == 200, r.text[:300]
    payload = r.json()
    sheets = payload.get("sheets", [])
    # If sheets is empty, batch just doesn't include our event on this date — skip
    if not sheets:
        pytest.skip("No sheets in batch for this event's date window")
    for s in sheets:
        assert "internal_delivery_time" in s
        assert "departure_time" in s
        for d in s.get("days", []):
            for tanda in d.get("tandas", []):
                assert "extras_by_type" in tanda
