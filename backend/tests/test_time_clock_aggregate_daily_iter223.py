"""Iteration 223 — Tests for GET /api/people-ops/time-clock/aggregate-daily.

Covers:
  1. Endpoint contract (200 + shape).
  2. Single closed shift aggregation.
  3. Multiple shifts same day → correct time_in/out + break_min.
  4. Open shifts (clock_out = null) excluded.
  5. Date filter excludes entries outside range.
  6. Access control: unauthenticated → 401/403.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

TIME_CLOCK = f"{BASE_URL}/api/people-ops/time-clock"
PEOPLE_OPS = f"{BASE_URL}/api/people-ops"

# Use a far-past unique date range to avoid collisions
BASE_DATE = "2024-01-15"  # Monday
SINGLE_DATE = "2024-01-15"
MULTI_DATE = "2024-01-16"
OUT_OF_RANGE_DATE = "2024-01-20"

RANGE_START = "2024-01-14"
RANGE_END = "2024-01-17"

_created_entry_ids: list[str] = []


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def employee(session):
    r = session.get(f"{PEOPLE_OPS}/employees")
    assert r.status_code == 200, r.text
    actives = [e for e in r.json() if e.get("status") == "active"]
    assert actives, "Need an active employee"
    return actives[0]


@pytest.fixture(scope="module", autouse=True)
def _cleanup(session):
    yield
    for eid in _created_entry_ids:
        try:
            session.delete(f"{TIME_CLOCK}/entries/{eid}")
        except Exception:
            pass


def _iso(date_str: str, hour: int, minute: int = 0) -> str:
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(
        hour=hour, minute=minute, tzinfo=timezone.utc
    )
    return dt.isoformat()


def _create_entry(session, emp_id, date_str, h_in, h_out, m_in=0, m_out=0):
    payload = {
        "employee_id": emp_id,
        "clock_in": _iso(date_str, h_in, m_in),
        "clock_out": _iso(date_str, h_out, m_out),
        "notes": "iter223 test",
    }
    r = session.post(f"{TIME_CLOCK}/manual-entry", json=payload)
    assert r.status_code == 200, f"manual-entry failed: {r.status_code} {r.text}"
    d = r.json()
    _created_entry_ids.append(d["entry_id"])
    return d


# --- Test 1: endpoint contract ---
def test_aggregate_daily_contract(session, employee):
    emp_id = employee["employee_id"]
    r = session.get(
        f"{TIME_CLOCK}/aggregate-daily",
        params={"employee_id": emp_id, "start_date": RANGE_START, "end_date": RANGE_END},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("employee_id", "start_date", "end_date", "days", "total_days"):
        assert key in data, f"missing key {key}"
    assert data["employee_id"] == emp_id
    assert data["start_date"] == RANGE_START
    assert data["end_date"] == RANGE_END
    assert isinstance(data["days"], list)


# --- Test 2: single closed shift 08:00–17:00 ---
def test_single_closed_shift(session, employee):
    emp_id = employee["employee_id"]
    _create_entry(session, emp_id, SINGLE_DATE, 8, 17)
    r = session.get(
        f"{TIME_CLOCK}/aggregate-daily",
        params={"employee_id": emp_id, "start_date": RANGE_START, "end_date": RANGE_END},
    )
    assert r.status_code == 200
    days = {d["date"]: d for d in r.json()["days"]}
    assert SINGLE_DATE in days, f"expected {SINGLE_DATE} in {list(days.keys())}"
    row = days[SINGLE_DATE]
    assert row["time_in"] == "08:00", row
    assert row["time_out"] == "17:00", row
    assert row["break_min"] == 0, row
    assert row["shift_count"] == 1, row
    assert row["source"] == "time_clock"
    assert row["worked_minutes"] == 9 * 60


# --- Test 3: multiple shifts same day → gap = break ---
def test_multiple_shifts_same_day(session, employee):
    emp_id = employee["employee_id"]
    _create_entry(session, emp_id, MULTI_DATE, 8, 12)
    _create_entry(session, emp_id, MULTI_DATE, 13, 17)
    r = session.get(
        f"{TIME_CLOCK}/aggregate-daily",
        params={"employee_id": emp_id, "start_date": RANGE_START, "end_date": RANGE_END},
    )
    assert r.status_code == 200
    days = {d["date"]: d for d in r.json()["days"]}
    assert MULTI_DATE in days
    row = days[MULTI_DATE]
    assert row["time_in"] == "08:00", row
    assert row["time_out"] == "17:00", row
    # gap between 12:00 and 13:00 = 60
    assert 55 <= row["break_min"] <= 65, row
    assert row["shift_count"] == 2, row
    assert row["worked_minutes"] == 8 * 60


# --- Test 4: open shift excluded ---
def test_open_shift_excluded(session, employee):
    """Create a time_entry directly via clock-in only (no clock-out).
    Aggregate should NOT include that day.
    """
    # Use a separate date to isolate
    open_date = "2024-01-17"
    # There is no direct manual-entry with null clock_out; use raw insert
    # via DB is complex. Instead: use clock-in/clock-out endpoints or skip if
    # already-clocked-in state exists. We approximate: create a shift that
    # ends in-progress by calling clock-in only. If admin has an active shift,
    # this may 400. Handle both.
    r_in = session.post(f"{TIME_CLOCK}/clock-in", json={"employee_id": employee["employee_id"]})
    if r_in.status_code != 200:
        pytest.skip(f"Cannot create open shift for exclusion test: {r_in.text}")
    # The clock-in creates 'today' entry, not open_date; but aggregate query
    # uses today's range too. Instead just verify: no exception, endpoint filters
    # by clock_out != None. We assert response OK and that any 'today' entry
    # produced isn't listed if it has no clock_out.
    today = datetime.now(timezone.utc).date().isoformat()
    r = session.get(
        f"{TIME_CLOCK}/aggregate-daily",
        params={"employee_id": employee["employee_id"],
                "start_date": today, "end_date": today},
    )
    assert r.status_code == 200, r.text
    days = {d["date"]: d for d in r.json()["days"]}
    # Open entry for today should NOT appear
    assert today not in days, f"open shift leaked into aggregate: {days}"
    # Cleanup: clock out
    session.post(f"{TIME_CLOCK}/clock-out", json={"employee_id": employee["employee_id"]})
    # Delete the newly created entry too (find via /entries)
    r_ent = session.get(f"{TIME_CLOCK}/entries",
                        params={"start_date": today, "end_date": today,
                                "employee_id": employee["employee_id"]})
    if r_ent.status_code == 200:
        for e in r_ent.json():
            if e.get("notes") in (None, "") and e.get("source") in ("clock", None):
                # best-effort remove today's just-created entry
                session.delete(f"{TIME_CLOCK}/entries/{e['entry_id']}")


# --- Test 5: date range filter excludes out-of-range entries ---
def test_date_range_filter(session, employee):
    emp_id = employee["employee_id"]
    _create_entry(session, emp_id, OUT_OF_RANGE_DATE, 9, 15)
    r = session.get(
        f"{TIME_CLOCK}/aggregate-daily",
        params={"employee_id": emp_id, "start_date": RANGE_START, "end_date": RANGE_END},
    )
    assert r.status_code == 200
    dates = [d["date"] for d in r.json()["days"]]
    assert OUT_OF_RANGE_DATE not in dates, f"out-of-range date leaked: {dates}"


# --- Test 6: access control (unauthenticated) ---
def test_unauthenticated_denied(employee):
    r = requests.get(
        f"{TIME_CLOCK}/aggregate-daily",
        params={"employee_id": employee["employee_id"],
                "start_date": RANGE_START, "end_date": RANGE_END},
    )
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"
