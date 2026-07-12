"""
E2E regression for Kora OS ERP sprints A/B/C/D:
  - Packing list live → toggle pack → generate outbound conduce (idempotency)
  - Check-in with 'dañado' + 'faltante' items → damaged_items_log populated
  - Reservation conflict check endpoint shape
  - Inventory items expose cost_per_unit
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "demo.agency@kora.com"
PWD = "Evoque2024!"


@pytest.fixture(scope="module")
def s():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PWD})
    if r.status_code != 200:
        pytest.skip(f"login failed: {r.status_code} {r.text[:200]}")
    return sess


@pytest.fixture(scope="module")
def confirmed_event_id(s):
    r = s.get(f"{BASE_URL}/api/events/confirmed")
    assert r.status_code == 200
    events = r.json() or []
    if not events:
        pytest.skip("no confirmed events")
    # Prefer 'Lanzamiento Q1' if present
    for ev in events:
        if "Lanzamiento" in (ev.get("event_name") or ev.get("name") or ""):
            return ev["event_id"]
    return events[0]["event_id"]


class TestPackingLiveFlow:
    def test_packing_list_live_shape(self, s, confirmed_event_id):
        r = s.get(f"{BASE_URL}/api/events/{confirmed_event_id}/packing-list-live")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total_items", "packed_items", "fully_packed", "conduce_generated"):
            assert k in d
        # Each item should have an id + name + packed flag
        for it in d["items"]:
            assert "inventory_item_id" in it or "item_id" in it or "id" in it
            assert "packed" in it

    def test_pack_toggle_persists(self, s, confirmed_event_id):
        r = s.get(f"{BASE_URL}/api/events/{confirmed_event_id}/packing-list-live")
        items = r.json()["items"]
        if not items:
            pytest.skip("event has no reserved items")
        first = items[0]
        iid = first.get("inventory_item_id") or first.get("item_id") or first.get("id")
        # Toggle pack -> True
        r2 = s.post(
            f"{BASE_URL}/api/events/{confirmed_event_id}/pack-item",
            json={"inventory_item_id": iid, "packed": True},
        )
        assert r2.status_code in (200, 201), r2.text
        # Re-fetch and confirm packed count incremented (>=1)
        r3 = s.get(f"{BASE_URL}/api/events/{confirmed_event_id}/packing-list-live")
        assert r3.status_code == 200
        assert r3.json()["packed_items"] >= 1

    def test_generate_outbound_conduce_and_idempotency(self, s, confirmed_event_id):
        # Ensure at least one packed item
        live = s.get(f"{BASE_URL}/api/events/{confirmed_event_id}/packing-list-live").json()
        if live.get("conduce_generated"):
            # already generated - hitting endpoint again must refuse
            r = s.post(f"{BASE_URL}/api/events/{confirmed_event_id}/generate-outbound-conduce")
            assert r.status_code in (400, 409), r.text
            return
        if live["packed_items"] < 1:
            # pack the first item to have something to ship
            items = live["items"]
            if not items:
                pytest.skip("no items to pack")
            iid = items[0].get("inventory_item_id") or items[0].get("item_id") or items[0].get("id")
            s.post(f"{BASE_URL}/api/events/{confirmed_event_id}/pack-item",
                   json={"inventory_item_id": iid, "packed": True})
        r = s.post(f"{BASE_URL}/api/events/{confirmed_event_id}/generate-outbound-conduce")
        assert r.status_code in (200, 201), r.text
        note = r.json()
        # Should be an outbound delivery note
        note_id = note.get("id") or note.get("note_id") or note.get("_id")
        assert note_id, f"no note id returned: {note}"
        assert (note.get("direction") or "outbound") == "outbound"
        # Idempotency: second call refuses
        r2 = s.post(f"{BASE_URL}/api/events/{confirmed_event_id}/generate-outbound-conduce")
        assert r2.status_code in (400, 409), f"idempotency broken: {r2.status_code} {r2.text[:200]}"


class TestReservationConflicts:
    def test_shape(self, s, confirmed_event_id):
        r = s.post(
            f"{BASE_URL}/api/inventory/check-reservation-conflicts",
            json={"event_id": confirmed_event_id, "items": [{"inventory_item_id": "bogus", "quantity": 999999}]},
        )
        assert r.status_code == 200
        d = r.json()
        assert "has_conflicts" in d and "conflicts" in d and "event_id" in d

    def test_missing_event_404(self, s):
        r = s.post(
            f"{BASE_URL}/api/inventory/check-reservation-conflicts",
            json={"event_id": f"missing-{uuid.uuid4().hex}", "items": [{"inventory_item_id": "x", "quantity": 1}]},
        )
        assert r.status_code == 404


class TestCheckInDamagedFlow:
    def test_damaged_log_endpoint_shape(self, s):
        r = s.get(f"{BASE_URL}/api/damaged-items-log")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["entries"], list)
        for k in ("count", "damaged", "missing", "total_replacement_cost"):
            assert k in d["totals"]
            assert isinstance(d["totals"][k], (int, float))

    def test_checkin_with_damaged_item_creates_log_entry(self, s):
        # Find a pending outbound delivery note
        r = s.get(f"{BASE_URL}/api/delivery-notes")
        assert r.status_code == 200
        notes = r.json()
        outbound_pending = [
            n for n in notes
            if (n.get("direction") == "outbound")
            and n.get("status") in ("partial", "pending", "sent", "in_transit")
            and n.get("items")
        ]
        if not outbound_pending:
            pytest.skip("no outbound pending notes to check-in")
        note = outbound_pending[0]
        note_id = note.get("id") or note.get("note_id")
        items = note["items"] or []
        if not items:
            pytest.skip("note has no items")

        # Snapshot log
        before = s.get(f"{BASE_URL}/api/damaged-items-log").json()["totals"]["count"]

        # Build check-in payload: mark first item as dañado
        checkin_items = []
        for i, it in enumerate(items):
            iid = it.get("inventory_item_id") or it.get("item_id") or it.get("id")
            if i == 0:
                checkin_items.append({
                    "inventory_item_id": iid,
                    "condition": "dañado",
                    "condition_note": "Test damage from E2E",
                    "photo_url": None,
                })
            else:
                checkin_items.append({
                    "inventory_item_id": iid,
                    "condition": "bueno",
                })

        r2 = s.put(f"{BASE_URL}/api/delivery-notes/{note_id}/check-in",
                   json={"items": checkin_items})
        # Accept 200/201 or informative failure
        assert r2.status_code in (200, 201), f"check-in failed: {r2.status_code} {r2.text[:300]}"

        # Log should have grown by at least 1
        after = s.get(f"{BASE_URL}/api/damaged-items-log").json()
        assert after["totals"]["count"] >= before + 1, (
            f"damaged log did not grow: before={before} after={after['totals']['count']}"
        )
        # Entry should be enriched with event_name
        if after["entries"]:
            e0 = after["entries"][0]
            assert "event_name" in e0 or "event_id" in e0
            assert "condition" in e0
            assert "total_cost" in e0 or "replacement_cost" in e0


class TestInventoryCostVisibility:
    def test_inventory_items_expose_cost_per_unit(self, s):
        r = s.get(f"{BASE_URL}/api/inventory")
        # Endpoint might be /api/ingredients — try both
        if r.status_code != 200:
            r = s.get(f"{BASE_URL}/api/ingredients")
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict) and "items" in items:
            items = items["items"]
        assert isinstance(items, list)
        if not items:
            pytest.skip("no inventory items")
        sample = items[0]
        # cost_per_unit field visible
        assert "cost_per_unit" in sample or "unit_cost" in sample or "cost" in sample
