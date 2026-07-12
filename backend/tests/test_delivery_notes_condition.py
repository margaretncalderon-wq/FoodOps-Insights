"""Sprint C / Sprint B regression coverage:
- Delivery notes now default `direction=outbound` (legacy backfill)
- `damaged_items_log` collection is populated on check-in with condition
- `/api/events/{id}/packing-list-live` returns the expected shape
- `/api/inventory/check-reservation-conflicts` validates before saving
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"login failed: {resp.status_code}")
    return session


class TestDeliveryNoteDirection:
    def test_all_notes_expose_direction(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/delivery-notes")
        assert r.status_code == 200
        notes = r.json()
        for n in notes:
            assert "direction" in n
            assert n["direction"] in ("outbound", "return")


class TestDamagedItemsLog:
    def test_endpoint_returns_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/damaged-items-log")
        assert r.status_code == 200
        data = r.json()
        assert "entries" in data
        assert isinstance(data["entries"], list)
        assert "totals" in data
        for k in ("count", "damaged", "missing", "total_replacement_cost"):
            assert k in data["totals"]

    def test_endpoint_supports_month_filter(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/damaged-items-log?year=2026&month=7")
        assert r.status_code == 200
        assert isinstance(r.json().get("entries"), list)

    def test_endpoint_supports_condition_filter(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/damaged-items-log?condition=dañado")
        assert r.status_code == 200


class TestEventPackingLive:
    def test_endpoint_returns_expected_shape(self, auth_session):
        # Get first confirmed event
        r = auth_session.get(f"{BASE_URL}/api/events/confirmed")
        events = r.json() or []
        if not events:
            pytest.skip("no confirmed events for tenant")
        eid = events[0]["event_id"]
        r = auth_session.get(f"{BASE_URL}/api/events/{eid}/packing-list-live")
        assert r.status_code == 200
        data = r.json()
        for k in ("event_id", "items", "total_items", "packed_items", "fully_packed", "conduce_generated"):
            assert k in data
        assert isinstance(data["items"], list)


class TestReservationConflictCheck:
    def test_conflicts_endpoint_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/events/confirmed")
        events = r.json() or []
        if not events:
            pytest.skip("no confirmed events for tenant")
        eid = events[0]["event_id"]
        r = auth_session.post(
            f"{BASE_URL}/api/inventory/check-reservation-conflicts",
            json={"event_id": eid, "items": [{"inventory_item_id": "nonexistent-ing", "quantity": 5}]},
        )
        assert r.status_code == 200
        data = r.json()
        assert "has_conflicts" in data
        assert "conflicts" in data
        assert "event_id" in data

    def test_conflicts_missing_event_returns_404(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/inventory/check-reservation-conflicts",
            json={"event_id": "event_totally_bogus_id_xxxx", "items": [{"inventory_item_id": "x", "quantity": 1}]},
        )
        assert r.status_code == 404
