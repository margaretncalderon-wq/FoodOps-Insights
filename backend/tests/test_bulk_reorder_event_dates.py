"""Tests for:
1. POST /api/proposals/{proposal_id}/items/bulk-reorder
2. PUT /api/events/{event_id} with event_dates list
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for backend env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def test_proposal(auth_client):
    """Return a proposal with at least 2 items in 2 sections. Use seeded prop_e45ef7945072 if it exists."""
    pid = "prop_e45ef7945072"
    r = auth_client.get(f"{BASE_URL}/api/proposals/{pid}/items")
    if r.status_code == 200 and len(r.json()) >= 2:
        return pid, r.json()
    # Otherwise pick any proposal with items
    r = auth_client.get(f"{BASE_URL}/api/proposals")
    assert r.status_code == 200, f"List proposals failed: {r.text}"
    for p in r.json():
        pid2 = p.get("proposal_id")
        if not pid2:
            continue
        ri = auth_client.get(f"{BASE_URL}/api/proposals/{pid2}/items")
        if ri.status_code == 200 and len(ri.json()) >= 2:
            return pid2, ri.json()
    pytest.skip("No proposal with >=2 items found")


# ============== Bulk Reorder Tests ==============

class TestBulkReorder:
    def test_bulk_reorder_updates_order(self, auth_client, test_proposal):
        pid, items = test_proposal
        # Build reverse order payload preserving section_title
        payload_items = []
        for i, it in enumerate(reversed(items)):
            payload_items.append({
                "item_id": it["item_id"],
                "sort_order": i,
                "section_title": it.get("section_title"),
            })
        r = auth_client.post(
            f"{BASE_URL}/api/proposals/{pid}/items/bulk-reorder",
            json={"items": payload_items},
        )
        assert r.status_code == 200, f"Bulk reorder failed: {r.status_code} {r.text}"
        body = r.json()
        assert "updated" in body and "total" in body
        assert body["total"] == len(payload_items)
        assert body["updated"] <= body["total"]

        # Verify via GET that sort_order has been applied
        r2 = auth_client.get(f"{BASE_URL}/api/proposals/{pid}/items")
        assert r2.status_code == 200
        fresh = {it["item_id"]: it for it in r2.json()}
        for entry in payload_items:
            assert fresh[entry["item_id"]]["sort_order"] == entry["sort_order"], \
                f"Item {entry['item_id']} did not receive sort_order {entry['sort_order']}"

    def test_bulk_reorder_section_title_update(self, auth_client, test_proposal):
        pid, items = test_proposal
        target = items[0]
        original_section = target.get("section_title")
        new_section = "TEST_SectionRename"
        r = auth_client.post(
            f"{BASE_URL}/api/proposals/{pid}/items/bulk-reorder",
            json={"items": [{
                "item_id": target["item_id"],
                "sort_order": target.get("sort_order", 0),
                "section_title": new_section,
            }]},
        )
        assert r.status_code == 200
        # verify
        r2 = auth_client.get(f"{BASE_URL}/api/proposals/{pid}/items")
        assert r2.status_code == 200
        found = next(it for it in r2.json() if it["item_id"] == target["item_id"])
        assert found.get("section_title") == new_section
        # restore
        auth_client.post(
            f"{BASE_URL}/api/proposals/{pid}/items/bulk-reorder",
            json={"items": [{
                "item_id": target["item_id"],
                "sort_order": target.get("sort_order", 0),
                "section_title": original_section,
            }]},
        )

    def test_bulk_reorder_invalid_proposal_404(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/proposals/nonexistent_prop_xyz123/items/bulk-reorder",
            json={"items": [{"item_id": "x", "sort_order": 0}]},
        )
        assert r.status_code == 404


# ============== Event Dates Tests ==============

class TestEventDates:
    def test_event_dates_persist_sorted_dedup(self, auth_client):
        # Need an event - find one
        r = auth_client.get(f"{BASE_URL}/api/events")
        assert r.status_code == 200
        events = r.json()
        assert events, "No events found"
        event_id = events[0]["event_id"]

        # save original event_dates
        original = events[0].get("event_dates")

        # Send unsorted with duplicates
        payload = {"event_dates": ["2026-07-15", "2026-05-10", "2026-07-15", "2026-06-01"]}
        r = auth_client.put(f"{BASE_URL}/api/events/{event_id}", json=payload)
        assert r.status_code == 200, f"Update event failed: {r.status_code} {r.text}"

        # Get the event and verify event_dates
        r2 = auth_client.get(f"{BASE_URL}/api/events/{event_id}")
        assert r2.status_code == 200
        ed = r2.json().get("event_dates")
        assert ed == ["2026-05-10", "2026-06-01", "2026-07-15"], \
            f"event_dates not sorted/dedup'd correctly: {ed}"

        # restore original
        if original is not None:
            auth_client.put(f"{BASE_URL}/api/events/{event_id}", json={"event_dates": original})

    def test_event_dates_empty_strings_filtered(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/events")
        events = r.json()
        event_id = events[0]["event_id"]
        original = events[0].get("event_dates")

        payload = {"event_dates": ["", "2026-08-20", ""]}
        r = auth_client.put(f"{BASE_URL}/api/events/{event_id}", json=payload)
        assert r.status_code == 200
        r2 = auth_client.get(f"{BASE_URL}/api/events/{event_id}")
        ed = r2.json().get("event_dates")
        assert ed == ["2026-08-20"], f"empty dates not filtered: {ed}"

        if original is not None:
            auth_client.put(f"{BASE_URL}/api/events/{event_id}", json={"event_dates": original})
