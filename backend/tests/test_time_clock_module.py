"""Time Clock module tests.

Covers:
- POST clock-in / clock-out (self)
- GET current
- POST manual-entry (admin)
- GET entries (admin sees all)
- PUT/DELETE entries
- GET weekly-summary (OT + legal cap breach detection)
- Regression: weekly_hours_regular field on Employee
"""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

TIME_CLOCK = f"{BASE_URL}/api/people-ops/time-clock"
PEOPLE_OPS = f"{BASE_URL}/api/people-ops"


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
def test_employee(session):
    """Get or create a test employee."""
    r = session.get(f"{PEOPLE_OPS}/employees")
    assert r.status_code == 200, r.text
    employees = r.json()
    # Find active employee
    actives = [e for e in employees if e.get("status") == "active"]
    assert actives, "Need at least one active employee"
    return actives[0]


# Track created entries for cleanup
_created_entries = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(session):
    yield
    for eid in _created_entries:
        try:
            session.delete(f"{TIME_CLOCK}/entries/{eid}")
        except Exception:
            pass


# ============ Regression: weekly_hours_regular field ============

class TestEmployeeWeeklyHoursRegular:
    def test_employee_has_weekly_hours_regular_default(self, session, test_employee):
        # The field should be present (default 44.0) — may not be in already-existing records, but it's allowed.
        # We update an employee and verify field persists.
        emp_id = test_employee["employee_id"]
        r = session.put(f"{PEOPLE_OPS}/employees/{emp_id}", json={"weekly_hours_regular": 40.0})
        assert r.status_code in (200, 204), f"PUT failed: {r.status_code} {r.text}"

        r2 = session.get(f"{PEOPLE_OPS}/employees")
        assert r2.status_code == 200
        emp = next((e for e in r2.json() if e["employee_id"] == emp_id), None)
        assert emp is not None
        assert emp.get("weekly_hours_regular") == 40.0

        # Restore default
        session.put(f"{PEOPLE_OPS}/employees/{emp_id}", json={"weekly_hours_regular": 44.0})

    def test_employees_list_does_not_break(self, session):
        r = session.get(f"{PEOPLE_OPS}/employees")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============ Clock in / out (self) ============

class TestSelfClockInOut:
    def test_get_current_initial(self, session):
        r = session.get(f"{TIME_CLOCK}/current")
        # If admin is not linked to an employee record, endpoint returns 404
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            data = r.json()
            assert "employee_id" in data
            assert "active_shift" in data

    def test_clock_in_creates_entry(self, session):
        # Ensure no active shift first
        cur = session.get(f"{TIME_CLOCK}/current")
        if cur.status_code == 404:
            pytest.skip("Admin user not linked to employee record - self clock-in not possible")
        if cur.json().get("active_shift"):
            session.post(f"{TIME_CLOCK}/clock-out", json={})

        r = session.post(f"{TIME_CLOCK}/clock-in", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clock_out"] is None
        assert data["clock_in"]
        assert data["entry_id"]
        _created_entries.append(data["entry_id"])

    def test_clock_in_again_returns_400(self, session):
        cur = session.get(f"{TIME_CLOCK}/current")
        if cur.status_code == 404 or not cur.json().get("active_shift"):
            pytest.skip("Need active shift")
        r = session.post(f"{TIME_CLOCK}/clock-in", json={})
        assert r.status_code == 400, r.text

    def test_clock_out_closes_entry(self, session):
        cur = session.get(f"{TIME_CLOCK}/current")
        if cur.status_code == 404 or not cur.json().get("active_shift"):
            pytest.skip("No active shift")
        r = session.post(f"{TIME_CLOCK}/clock-out", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clock_out"]
        assert "total_minutes" in data
        assert data["total_minutes"] >= 0


# ============ Manual entry (admin) ============

class TestManualEntry:
    def test_manual_entry_creates_closed_shift(self, session, test_employee):
        emp_id = test_employee["employee_id"]
        now = datetime.now(timezone.utc)
        ci = (now - timedelta(hours=8)).isoformat()
        co = (now - timedelta(hours=1)).isoformat()
        r = session.post(f"{TIME_CLOCK}/manual-entry", json={
            "employee_id": emp_id,
            "clock_in": ci,
            "clock_out": co,
            "notes": "TEST_manual_entry"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_minutes"] == 7 * 60  # 7 hours
        assert data["source"] == "manual"
        _created_entries.append(data["entry_id"])

    def test_manual_entry_clock_out_before_in_returns_400(self, session, test_employee):
        emp_id = test_employee["employee_id"]
        now = datetime.now(timezone.utc)
        r = session.post(f"{TIME_CLOCK}/manual-entry", json={
            "employee_id": emp_id,
            "clock_in": now.isoformat(),
            "clock_out": (now - timedelta(hours=1)).isoformat(),
        })
        assert r.status_code == 400, r.text


# ============ List / update / delete ============

class TestEntriesCRUD:
    def test_list_entries_admin(self, session):
        r = session.get(f"{TIME_CLOCK}/entries")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_entry_recalculates_minutes(self, session, test_employee):
        emp_id = test_employee["employee_id"]
        now = datetime.now(timezone.utc)
        ci = (now - timedelta(hours=5)).isoformat()
        co = (now - timedelta(hours=2)).isoformat()
        r = session.post(f"{TIME_CLOCK}/manual-entry", json={
            "employee_id": emp_id, "clock_in": ci, "clock_out": co
        })
        assert r.status_code == 200
        eid = r.json()["entry_id"]
        _created_entries.append(eid)

        # Update clock_out to extend by 1 hour
        new_co = (now - timedelta(hours=1)).isoformat()
        r2 = session.put(f"{TIME_CLOCK}/entries/{eid}", json={"clock_out": new_co})
        assert r2.status_code == 200, r2.text

        # Verify
        entries = session.get(f"{TIME_CLOCK}/entries").json()
        updated = next(e for e in entries if e["entry_id"] == eid)
        assert updated["total_minutes"] == 4 * 60

    def test_delete_entry(self, session, test_employee):
        emp_id = test_employee["employee_id"]
        now = datetime.now(timezone.utc)
        r = session.post(f"{TIME_CLOCK}/manual-entry", json={
            "employee_id": emp_id,
            "clock_in": (now - timedelta(hours=3)).isoformat(),
            "clock_out": (now - timedelta(hours=2)).isoformat(),
        })
        assert r.status_code == 200
        eid = r.json()["entry_id"]

        d = session.delete(f"{TIME_CLOCK}/entries/{eid}")
        assert d.status_code == 200

        # Confirm gone
        entries = session.get(f"{TIME_CLOCK}/entries").json()
        assert not any(e["entry_id"] == eid for e in entries)


# ============ Weekly summary ============

class TestWeeklySummary:
    def test_weekly_summary_basic(self, session):
        r = session.get(f"{TIME_CLOCK}/weekly-summary")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "week_start" in data
        assert "week_end" in data
        assert "rows" in data
        assert "totals" in data
        assert "employees_breaching_legal_cap" in data["totals"]
        assert "employees_with_ot" in data["totals"]

    def test_weekly_summary_detects_legal_cap_breach(self, session, test_employee):
        """Create entries summing >68h for an employee this week and verify legal_cap_breach=True."""
        emp_id = test_employee["employee_id"]
        # Get monday of current week
        today = datetime.now(timezone.utc).date()
        monday = today - timedelta(days=today.weekday())

        # Add 7 entries of 10h each = 70h (>68h legal cap)
        created_here = []
        for i in range(7):
            day = datetime.combine(monday + timedelta(days=i), datetime.min.time(), tzinfo=timezone.utc)
            ci = day.replace(hour=8).isoformat()
            co = day.replace(hour=18).isoformat()
            r = session.post(f"{TIME_CLOCK}/manual-entry", json={
                "employee_id": emp_id,
                "clock_in": ci,
                "clock_out": co,
                "notes": "TEST_legal_cap"
            })
            assert r.status_code == 200, r.text
            eid = r.json()["entry_id"]
            created_here.append(eid)
            _created_entries.append(eid)

        # Fetch summary for this week
        r = session.get(f"{TIME_CLOCK}/weekly-summary", params={"week_start": monday.isoformat()})
        assert r.status_code == 200
        data = r.json()
        emp_row = next((row for row in data["rows"] if row["employee_id"] == emp_id), None)
        assert emp_row is not None, f"Employee {emp_id} missing in summary"
        assert emp_row["total_hours"] >= 70.0, f"Expected ≥70h, got {emp_row['total_hours']}"
        assert emp_row["legal_cap_breach"] is True
        assert emp_row["ot_breach"] is True
        assert data["totals"]["employees_breaching_legal_cap"] >= 1

        # Cleanup these specific entries
        for eid in created_here:
            session.delete(f"{TIME_CLOCK}/entries/{eid}")
            if eid in _created_entries:
                _created_entries.remove(eid)
