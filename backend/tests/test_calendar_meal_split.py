"""
Regression: an event whose proposal has breakfast + lunch sections must
expose BOTH services in /api/orchestration/calendar so the calendar UI
can render them as separate entries on the same day.

User report (Feb 2026): "cuando tiene almuerzo y desayuno, solo sale el
desayuno en el calendario, debería de salir en el calendario desayuno y
almuerzo en eventos divididos."
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
API = f"{BASE_URL.rstrip('/')}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def client_id(auth_session):
    r = auth_session.get(f"{API}/clients?limit=5", timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot list clients: {r.status_code}")
    data = r.json()
    if isinstance(data, dict):
        data = data.get("clients") or data.get("items") or []
    if not data:
        pytest.skip("No clients exist in this org to attach event to")
    return data[0]["client_id"]


@pytest.fixture(scope="module")
def multimeal_event(auth_session, client_id):
    s = auth_session
    # Create event for 2026-04-15 (single day)
    r = s.post(
        f"{API}/events",
        json={
            "name": "TEST_Breakfast_Lunch_Calendar",
            "client_id": client_id,
            "event_date": "2026-04-15",
            "guest_count": 30,
            "stage": "Won",
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    ev = r.json()
    event_id = ev["event_id"]

    # Get/create the proposal for this event (auto-creates on first GET)
    r = s.get(f"{API}/proposals/event/{event_id}", timeout=15)
    assert r.status_code == 200, r.text
    proposal_id = r.json()["proposal_id"]

    # Add 2 order_items: one for breakfast (section_time=08:00),
    # one for lunch (section_time=12:00). Each is a distinct section with
    # a distinct title and time.
    for section_title, section_time, desc in [
        ("Desayuno", "08:00", "Tostadas francesas"),
        ("Almuerzo", "12:00", "Bandeja paisa"),
    ]:
        r = s.post(
            f"{API}/proposals/{proposal_id}/items",
            json={
                "section_title": section_title,
                "section_time": section_time,
                "event_date": "2026-04-15",
                "description": desc,
                "quantity": 30,
                "unit_price": 100.0,
                "item_type": "Food",
            },
            timeout=15,
        )
        assert r.status_code in (200, 201), f"Failed creating {section_title}: {r.text}"

    yield {"event_id": event_id, "proposal_id": proposal_id}

    # Cleanup
    try:
        s.delete(f"{API}/events/{event_id}", timeout=15)
    except Exception:
        pass


def test_calendar_returns_two_services_for_same_day(auth_session, multimeal_event):
    """The orchestration calendar must expose desayuno + almuerzo as two
    separate services on the same date."""
    s = auth_session
    r = s.get(
        f"{API}/orchestration/calendar",
        params={"start_date": "2026-04-01", "end_date": "2026-04-30"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    events = [e for e in data["events"] if e["event_id"] == multimeal_event["event_id"]]
    assert len(events) == 1, f"Test event not in calendar: got {len(events)}"
    ev = events[0]

    services = ev.get("services") or []
    # Filter to the test date
    same_day = [s for s in services if s.get("date") == "2026-04-15"]
    titles = sorted([s.get("title") for s in same_day])
    times = sorted([s.get("time") for s in same_day])

    assert len(same_day) == 2, (
        f"Expected 2 services on 2026-04-15, got {len(same_day)}: {same_day}"
    )
    assert titles == ["Almuerzo", "Desayuno"], f"Unexpected titles: {titles}"
    assert times == ["08:00", "12:00"], f"Unexpected times: {times}"


def test_each_service_has_item_count_and_total(auth_session, multimeal_event):
    s = auth_session
    r = s.get(
        f"{API}/orchestration/calendar",
        params={"start_date": "2026-04-01", "end_date": "2026-04-30"},
        timeout=15,
    )
    data = r.json()
    ev = next(e for e in data["events"] if e["event_id"] == multimeal_event["event_id"])
    for svc in (ev.get("services") or []):
        if svc.get("date") != "2026-04-15":
            continue
        assert svc.get("item_count", 0) >= 1, svc
        assert svc.get("total", 0) > 0, svc
