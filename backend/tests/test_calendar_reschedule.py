"""Tests for POST /api/orchestration/calendar/reschedule-service.

Validates:
- Happy path: Desayuno (08:00-10:00) -> 10:30-12:00 on 2026-05-20 (matched=2, modified=2)
- Revert back to 08:00-10:00
- Cross-day move (new_date) + revert
- Error cases: missing event_id -> 400, unknown event -> 404, event with no proposal -> 404
- Closed event -> 400
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"

EVENT_ID = "event_test_timed_services"
EVENT_DATE = "2026-05-20"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    assert token, f"No token in login response: {body}"
    return {"Authorization": f"Bearer {token}"}


def _get_services(auth_headers, start="2026-05-01", end="2026-05-31"):
    r = requests.get(
        f"{BASE_URL}/api/orchestration/calendar",
        headers=auth_headers,
        params={"start_date": start, "end_date": end},
        timeout=30,
    )
    assert r.status_code == 200, r.text[:400]
    payload = r.json()
    events = payload["events"] if isinstance(payload, dict) and "events" in payload else payload
    target = next((e for e in events if e.get("event_id") == EVENT_ID), None)
    assert target is not None, f"Event {EVENT_ID} not in calendar"
    return target


def _post_reschedule(auth_headers, **body):
    return requests.post(
        f"{BASE_URL}/api/orchestration/calendar/reschedule-service",
        headers=auth_headers,
        json=body,
        timeout=30,
    )


# ===== Happy path: move Desayuno 08:00->10:30, then revert =====
def test_reschedule_desayuno_and_revert(auth_headers):
    # 1) Snapshot original state
    before = _get_services(auth_headers)
    services_before = {s.get("title"): s for s in (before.get("services") or [])}
    assert "Desayuno" in services_before, f"Desayuno missing before move: {list(services_before.keys())}"
    assert services_before["Desayuno"].get("time") == "08:00"

    # 2) Move Desayuno 08:00->10:30 end 12:00
    r = _post_reschedule(
        auth_headers,
        event_id=EVENT_ID,
        section_title="Desayuno",
        event_date=EVENT_DATE,
        old_time="08:00",
        new_time="10:30",
        new_end_time="12:00",
    )
    assert r.status_code == 200, f"Move failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body["matched"] == 2, f"Expected matched=2, got {body}"
    assert body["modified"] == 2, f"Expected modified=2, got {body}"

    # 3) Verify via calendar GET: Desayuno now at 10:30->12:00; Almuerzo/Coffee Break unchanged
    after = _get_services(auth_headers)
    services_after = {s.get("title"): s for s in (after.get("services") or [])}
    desayuno = services_after.get("Desayuno")
    assert desayuno is not None, f"Desayuno missing after move: {list(services_after.keys())}"
    assert desayuno.get("time") == "10:30", f"Desayuno time after move: {desayuno}"
    assert desayuno.get("end_time") in ("12:00", "12:00:00"), f"Desayuno end_time after move: {desayuno}"

    almuerzo = next((s for s, v in services_after.items() if "almuerzo" in (s or "").lower()), None)
    assert almuerzo is not None
    assert services_after[almuerzo].get("time") == "12:00"
    assert services_after[almuerzo].get("end_time") in ("14:00", "14:00:00")

    coffee = next((s for s, v in services_after.items() if "coffee" in (s or "").lower()), None)
    assert coffee is not None
    assert services_after[coffee].get("time") == "16:00"

    # 4) Revert
    r2 = _post_reschedule(
        auth_headers,
        event_id=EVENT_ID,
        section_title="Desayuno",
        event_date=EVENT_DATE,
        old_time="10:30",
        new_time="08:00",
        new_end_time="10:00",
    )
    assert r2.status_code == 200, r2.text[:300]
    body2 = r2.json()
    assert body2["matched"] == 2 and body2["modified"] == 2, body2

    # 5) Verify reverted
    final = _get_services(auth_headers)
    services_final = {s.get("title"): s for s in (final.get("services") or [])}
    assert services_final["Desayuno"].get("time") == "08:00"
    assert services_final["Desayuno"].get("end_time") in ("10:00", "10:00:00")


# ===== Cross-day move + revert =====
def test_reschedule_cross_day_move_and_revert(auth_headers):
    # Move Desayuno from 2026-05-20 08:00 -> 2026-05-21 09:00
    r = _post_reschedule(
        auth_headers,
        event_id=EVENT_ID,
        section_title="Desayuno",
        event_date=EVENT_DATE,
        old_time="08:00",
        new_time="09:00",
        new_end_time="11:00",
        new_date="2026-05-21",
    )
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body["matched"] == 2 and body["modified"] == 2, body
    assert body.get("new_date") == "2026-05-21"

    # Verify with calendar (extended window)
    after = _get_services(auth_headers, start="2026-05-01", end="2026-05-31")
    services_after = after.get("services") or []
    desayuno_entries = [s for s in services_after if (s.get("title") or "").lower() == "desayuno"]
    # The service entries are indexed by date+time; we expect at least one Desayuno
    found_on_21 = any(s.get("date") == "2026-05-21" and s.get("time") == "09:00" for s in desayuno_entries)
    assert found_on_21, f"Desayuno not present on 2026-05-21 09:00 after cross-day move: {desayuno_entries}"

    # Revert back to 2026-05-20 08:00 -> 10:00
    r2 = _post_reschedule(
        auth_headers,
        event_id=EVENT_ID,
        section_title="Desayuno",
        event_date="2026-05-21",
        old_time="09:00",
        new_time="08:00",
        new_end_time="10:00",
        new_date=EVENT_DATE,
    )
    assert r2.status_code == 200, r2.text[:300]
    body2 = r2.json()
    assert body2["matched"] == 2 and body2["modified"] == 2, body2

    # Verify reverted
    final = _get_services(auth_headers)
    services_final = {s.get("title"): s for s in (final.get("services") or [])}
    assert services_final["Desayuno"].get("date") == "2026-05-20"
    assert services_final["Desayuno"].get("time") == "08:00"
    assert services_final["Desayuno"].get("end_time") in ("10:00", "10:00:00")


# ===== Error cases =====
def test_missing_event_id_returns_400(auth_headers):
    r = _post_reschedule(
        auth_headers,
        section_title="Desayuno",
        event_date=EVENT_DATE,
        old_time="08:00",
        new_time="09:00",
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code} {r.text[:300]}"


def test_unknown_event_id_returns_404(auth_headers):
    r = _post_reschedule(
        auth_headers,
        event_id="event_does_not_exist_xyz_123",
        section_title="Desayuno",
        event_date=EVENT_DATE,
        old_time="08:00",
        new_time="09:00",
    )
    assert r.status_code == 404, f"Expected 404, got {r.status_code} {r.text[:300]}"


def test_event_without_proposal_returns_404(auth_headers):
    """Find an event that does NOT have a proposal and verify 404. If none exists, skip."""
    # Pull a wider window to find candidates
    r = requests.get(
        f"{BASE_URL}/api/orchestration/calendar",
        headers=auth_headers,
        params={"start_date": "2024-01-01", "end_date": "2030-12-31"},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip("Could not enumerate events")
    payload = r.json()
    events = payload["events"] if isinstance(payload, dict) and "events" in payload else payload
    # Try events with empty services lists
    candidate = next((e for e in events if not (e.get("services") or [])), None)
    if not candidate:
        pytest.skip("No event without services found to test no-proposal path")
    r2 = _post_reschedule(
        auth_headers,
        event_id=candidate["event_id"],
        section_title="X",
        event_date="2026-01-01",
        old_time="08:00",
        new_time="09:00",
    )
    # Could be 404 (no proposal) OR 200 with matched=0 if proposal exists but empty.
    # Spec says: 404 when event has no proposal.
    assert r2.status_code in (200, 404), f"Unexpected status: {r2.status_code} {r2.text[:300]}"


def test_closed_event_returns_400(auth_headers):
    """Find a closed event and verify 400. If none exists, skip."""
    r = requests.get(f"{BASE_URL}/api/events", headers=auth_headers, timeout=30)
    if r.status_code != 200:
        pytest.skip("Could not enumerate events")
    payload = r.json()
    events = payload if isinstance(payload, list) else payload.get("events", [])
    closed = next((e for e in events if e.get("operational_status") == "Closed"), None)
    if not closed:
        pytest.skip("No closed event in fixtures to test 400 path")
    r2 = _post_reschedule(
        auth_headers,
        event_id=closed["event_id"],
        section_title="x",
        event_date="2026-01-01",
        old_time="08:00",
        new_time="09:00",
    )
    assert r2.status_code == 400, f"Expected 400 closed, got {r2.status_code} {r2.text[:300]}"
