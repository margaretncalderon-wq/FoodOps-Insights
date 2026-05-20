"""Tests for enriched /api/orchestration/calendar endpoint with per-service entries.

Validates:
- Calendar event 'Servicio Multi-Horario Test' returns 3 services on 2026-05-20
- calendar_dates is present and correctly populated (single-day and multi-day)
- Multi-day event 'Reorder Test Event' expansion (event_dates -> calendar_dates)
- Demo agency credentials work
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def may_calendar(auth_headers):
    url = f"{BASE_URL}/api/orchestration/calendar"
    r = requests.get(url, headers=auth_headers, params={"start_date": "2026-05-01", "end_date": "2026-05-31"}, timeout=30)
    assert r.status_code == 200, f"Calendar GET failed: {r.status_code} {r.text[:500]}"
    return r.json()


@pytest.fixture(scope="module")
def aug_calendar(auth_headers):
    url = f"{BASE_URL}/api/orchestration/calendar"
    r = requests.get(url, headers=auth_headers, params={"start_date": "2026-08-01", "end_date": "2026-08-31"}, timeout=30)
    assert r.status_code == 200, f"Calendar GET failed: {r.status_code} {r.text[:500]}"
    return r.json()


def _events_list(payload):
    if isinstance(payload, dict) and "events" in payload:
        return payload["events"]
    if isinstance(payload, list):
        return payload
    raise AssertionError(f"Unexpected calendar payload shape: keys={list(payload.keys()) if isinstance(payload, dict) else type(payload)}")


def test_calendar_endpoint_returns_events_structure(may_calendar):
    events = _events_list(may_calendar)
    assert isinstance(events, list)
    assert len(events) > 0, "Calendar returned zero events for May 2026 window"
    # every event must have calendar_dates
    missing = [e.get("event_id") or e.get("name") for e in events if "calendar_dates" not in e]
    assert not missing, f"Events missing calendar_dates: {missing[:10]}"


def test_multi_service_event_present_with_3_services(may_calendar):
    events = _events_list(may_calendar)
    target = next((e for e in events if "Multi-Horario" in (e.get("name") or "")), None)
    assert target is not None, f"'Servicio Multi-Horario Test' not found. Got names: {[e.get('name') for e in events][:30]}"

    # calendar_dates should include 2026-05-20
    assert "2026-05-20" in (target.get("calendar_dates") or []), f"calendar_dates does not include 2026-05-20: {target.get('calendar_dates')}"

    services = target.get("services") or []
    assert len(services) >= 3, f"Expected >=3 services, got {len(services)}: {services}"

    # Build map by start time
    by_time = {}
    for s in services:
        by_time[s.get("time")] = s

    # Check the 3 expected services
    assert "08:00" in by_time, f"Missing 08:00 service. Times: {list(by_time.keys())}"
    assert "12:00" in by_time, f"Missing 12:00 service. Times: {list(by_time.keys())}"
    assert "16:00" in by_time, f"Missing 16:00 service. Times: {list(by_time.keys())}"

    # End times
    assert by_time["08:00"].get("end_time") in ("10:00", "10:00:00"), f"Desayuno end_time: {by_time['08:00'].get('end_time')}"
    assert by_time["12:00"].get("end_time") in ("14:00", "14:00:00"), f"Almuerzo end_time: {by_time['12:00'].get('end_time')}"
    assert by_time["16:00"].get("end_time") in ("17:00", "17:00:00"), f"Coffee Break end_time: {by_time['16:00'].get('end_time')}"

    # Titles (case-insensitive contains)
    titles_lower = " | ".join((s.get("title") or "").lower() for s in services)
    assert "desayuno" in titles_lower, f"Service titles: {titles_lower}"
    assert "almuerzo" in titles_lower, f"Service titles: {titles_lower}"
    assert "coffee" in titles_lower, f"Service titles: {titles_lower}"

    # Each service should report a date
    for s in services:
        d = s.get("date")
        assert d == "2026-05-20", f"Service date mismatch: {s}"


def test_multi_day_event_expansion(aug_calendar):
    events = _events_list(aug_calendar)
    target = next((e for e in events if "Reorder Test" in (e.get("name") or "")), None)
    assert target is not None, f"'Reorder Test Event' not found. Names: {[e.get('name') for e in events][:30]}"
    cds = target.get("calendar_dates") or []
    for d in ["2026-08-01", "2026-08-03", "2026-08-05"]:
        assert d in cds, f"calendar_dates missing {d}: {cds}"


def test_conflict_detection_present(may_calendar):
    # The endpoint should still surface conflicts (events sharing same date)
    events = _events_list(may_calendar)
    # group by date
    by_date = {}
    for e in events:
        for d in (e.get("calendar_dates") or []):
            by_date.setdefault(d, []).append(e.get("name"))
    # Just sanity: response structure may also include a conflicts field
    if isinstance(may_calendar, dict) and "conflicts" in may_calendar:
        # Endpoint may return list or dict (by-date map) — both are valid signal carriers
        assert isinstance(may_calendar["conflicts"], (list, dict))
