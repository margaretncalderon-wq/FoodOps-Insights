"""Iteration 222 — Regression tests for OT-flow simplification.

Verifies:
  A) POST /api/people-ops/overtime/requests → 410 Gone (deprecated).
  B) PUT  /api/people-ops/overtime/requests/{id} → 410 Gone (deprecated).
  C) GET  /api/people-ops/overtime/requests still works (legacy read).
  D) DELETE /api/people-ops/overtime/requests/{id} still works.
  E) POST /api/people-ops/overtime/requests/{id}/approve still works
     (existing pending legacy OTs approve/reject).
  F) POST /api/people-ops/overtime/periods with worked_entries auto-classifies
     and computes estimated_amount using MONTHLY base_salary (bug from iter221
     confirmed fixed: value is base/192*hrs*rate, NOT doubled for biweekly).
  G) /api/people-ops/payroll/projection still includes pending periodic OT.
  H) POST /api/people-ops/payroll/periods links approved periodic OTs AND
     consumes legacy pending overtime_requests (backwards compat).
  I) DELETE /api/people-ops/payroll/periods/{id} releases BOTH collections
     back to status='approved'.

Legacy OTs cannot be created via the API anymore (410); we seed them
directly into MongoDB for D/E/H/I coverage.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"

# May 2026 dates — avoid collision with iter218-221 (April 2026)
WEEK_START = "2026-05-04"  # Monday
WEEK_END = "2026-05-10"    # Sunday
BIWEEK_START = "2026-05-01"
BIWEEK_END = "2026-05-15"


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def employee(session, mongo):
    """Pick first active employee with base_salary>0; ensure it's set to a
    known value (50000) and biweekly frequency for deterministic math.
    Restores original values on teardown."""
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    emps = r.json()
    if isinstance(emps, dict):
        emps = emps.get("employees") or emps.get("data") or []
    active = [e for e in emps if (e.get("status") in (None, "active", "Active"))]
    assert active, "Need at least one active employee"
    # Prefer one already with base_salary>0
    emp = next((e for e in active if float(e.get("base_salary") or 0) > 0), active[0])
    emp_id = emp.get("employee_id") or emp.get("id")
    company_id = emp.get("company_id")
    # snapshot original
    original = mongo.employees.find_one({"employee_id": emp_id}, {"_id": 0, "base_salary": 1, "payment_frequency": 1})
    mongo.employees.update_one(
        {"employee_id": emp_id},
        {"$set": {"base_salary": 50000, "payment_frequency": "biweekly"}}
    )
    yield {"employee_id": emp_id, "company_id": company_id, "employee_name": emp.get("full_name")}
    # restore
    mongo.employees.update_one(
        {"employee_id": emp_id},
        {"$set": {
            "base_salary": (original or {}).get("base_salary", 0),
            "payment_frequency": (original or {}).get("payment_frequency", "monthly"),
        }}
    )


@pytest.fixture(scope="module")
def state():
    return {
        "seeded_pending_ot_id": None,   # for approve test
        "seeded_pending_ot_id_2": None, # for delete test
        "seeded_approved_ot_id": None,  # for payroll consumption test
        "ot_period_id": None,
        "payroll_period_id": None,
    }


def _seed_legacy_ot(mongo, employee, date_str, status="pending", hours_35=3):
    ot_id = f"ot_TEST_iter222_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    mongo.overtime_requests.insert_one({
        "overtime_id": ot_id,
        "company_id": employee["company_id"],
        "employee_id": employee["employee_id"],
        "employee_name": employee["employee_name"],
        "date": date_str,
        "hours_35": hours_35,
        "hours_night": 0,
        "hours_holiday": 0,
        "hours_100": 0,
        "total_hours": hours_35,
        # 50000/192*3*1.35 = 1054.6875
        "estimated_amount": round(50000 / 192 * hours_35 * 1.35, 2),
        "status": status,
        "reason": "TEST_iter222 seeded",
        "created_at": now,
        "updated_at": now,
    })
    return ot_id


# ---------------- tests ----------------

class TestDeprecation:
    """A + B: legacy write endpoints return 410 Gone."""

    def test_post_overtime_requests_returns_410(self, session, employee):
        payload = {
            "employee_id": employee["employee_id"],
            "date": "2026-05-05",
            "hours_35": 2,
            "reason": "TEST_iter222 should be rejected",
        }
        r = session.post(f"{API}/people-ops/overtime/requests", json=payload)
        assert r.status_code == 410, f"expected 410, got {r.status_code}: {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "deprecat" in detail or "timesheet" in detail or "periods" in detail, (
            f"deprecation message missing: {body}"
        )

    def test_put_overtime_requests_returns_410(self, session, mongo, employee, state):
        # Seed a legacy OT so we have a real id — but even a fake id should still 410
        seeded_id = _seed_legacy_ot(mongo, employee, "2026-05-06", status="pending")
        state["seeded_pending_ot_id"] = seeded_id
        r = session.put(
            f"{API}/people-ops/overtime/requests/{seeded_id}",
            json={"hours_35": 5, "reason": "TEST_iter222 update attempt"},
        )
        assert r.status_code == 410, f"expected 410, got {r.status_code}: {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "deprecat" in detail or "timesheet" in detail or "periods" in detail

        # And also verify with a random id — endpoint should still return 410 (not 404)
        r2 = session.put(
            f"{API}/people-ops/overtime/requests/does-not-exist-xyz",
            json={"hours_35": 1},
        )
        assert r2.status_code == 410


class TestLegacyReadDeleteApprove:
    """C, D, E: GET / DELETE / approve on legacy still work."""

    def test_get_legacy_list(self, session, employee, state):
        r = session.get(f"{API}/people-ops/overtime/requests")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # our seeded pending OT must appear
        ids = [o.get("overtime_id") for o in data]
        assert state["seeded_pending_ot_id"] in ids, "seeded OT should be readable via legacy GET"

    def test_approve_legacy_still_works(self, session, mongo, employee, state):
        # Seed a fresh pending OT and approve it
        oid = _seed_legacy_ot(mongo, employee, "2026-05-07", status="pending")
        state["seeded_approved_ot_id"] = oid
        r = session.post(f"{API}/people-ops/overtime/requests/{oid}/approve")
        assert r.status_code == 200, r.text
        # Verify DB reflects approval
        doc = mongo.overtime_requests.find_one({"overtime_id": oid}, {"_id": 0, "status": 1})
        assert doc and doc.get("status") == "approved"

    def test_delete_legacy_still_works(self, session, mongo, employee, state):
        oid = _seed_legacy_ot(mongo, employee, "2026-05-08", status="pending")
        state["seeded_pending_ot_id_2"] = oid
        r = session.delete(f"{API}/people-ops/overtime/requests/{oid}")
        assert r.status_code == 200, r.text
        doc = mongo.overtime_requests.find_one({"overtime_id": oid})
        assert doc is None, "OT should be deleted from Mongo"
        state["seeded_pending_ot_id_2"] = None  # cleaned


class TestPeriodicOTWorkedEntries:
    """F: POST /overtime/periods with worked_entries creates period, classifies
    hours, and estimated_amount is base/192*hrs*rate (biweekly bug fix)."""

    def test_create_period_with_worked_entries(self, session, employee, state):
        # Use a Sunday shift → all worked hours become hours_holiday (2.0x),
        # which is deterministic regardless of the employee's base schedule.
        # 2026-05-10 is a Sunday. Shift 08:00-16:00, no break → 8h holiday.
        payload = {
            "employee_id": employee["employee_id"],
            "period_type": "weekly",
            "ref_date": WEEK_START,
            "reason": "TEST_iter222 worked_entries",
            "worked_entries": [
                {"date": "2026-05-10", "time_in": "08:00", "time_out": "16:00", "break_min": 0},
            ],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        state["ot_period_id"] = d["overtime_period_id"]

        # Fetch the full doc to inspect daily_entries auto-classification
        gr = session.get(f"{API}/people-ops/overtime/periods/{state['ot_period_id']}")
        assert gr.status_code == 200, gr.text
        full = gr.json()
        daily = full.get("daily_entries") or []
        assert daily, f"daily_entries must be auto-computed, got: {full}"
        sun = next((x for x in daily if x.get("date") == "2026-05-10"), None)
        assert sun is not None, f"Sunday entry missing: {daily}"
        # Sunday → 8h all classified as hours_holiday
        assert round(float(sun.get("hours_holiday") or 0), 2) == 8.0, sun
        assert float(sun.get("hours_35") or 0) == 0, sun
        assert float(sun.get("hours_night") or 0) == 0, sun

        # Totals
        assert round(float(d.get("hours_holiday") or 0), 2) == 8.0
        assert float(d.get("hours_35") or 0) == 0
        assert float(d.get("hours_night") or 0) == 0

        # estimated_amount = 50000 / 192 * 8 * 2.0 = 4166.67 (biweekly bug: was 8333.33)
        expected = 50000 / 192 * 8 * 2.0
        actual = float(d.get("estimated_amount") or 0)
        assert abs(actual - expected) < 1.0, (
            f"biweekly hourly-rate bug regression: expected ~{expected:.2f}, got {actual:.2f}"
        )
        # And explicitly NOT the pre-fix doubled value
        assert actual < expected * 1.5, (
            f"biweekly bug leaked back: {actual:.2f} looks doubled vs {expected:.2f}"
        )

    def test_projection_includes_pending_periodic_ot(self, session, state):
        # Not yet approved — projection should not aggregate. Approve first.
        pid = state["ot_period_id"]
        r = session.post(f"{API}/people-ops/overtime/periods/{pid}/approve")
        assert r.status_code == 200, r.text

        r2 = session.get(f"{API}/people-ops/payroll/projection", params={"period_type": "biweekly"})
        assert r2.status_code == 200
        pot = r2.json().get("pending_overtime") or {}
        assert pot.get("count", 0) >= 1
        assert pot.get("total_hours", 0) >= 8


class TestPayrollConsumptionAndRelease:
    """G + H + I: payroll period creation consumes BOTH periodic and legacy;
    deletion releases BOTH back to approved."""

    def test_create_payroll_links_both(self, session, mongo, employee, state):
        payload = {
            "period_type": "biweekly",
            "start_date": BIWEEK_START,
            "end_date": BIWEEK_END,
            "payment_date": "2026-05-16",
            "period_name": f"TEST_iter222 {uuid.uuid4().hex[:6]}",
            "payment_kind": "regular",
        }
        r = session.post(f"{API}/people-ops/payroll/periods", json=payload)
        assert r.status_code == 200, r.text
        full = r.json()
        state["payroll_period_id"] = full["period_id"]

        # Fetch full period detail
        pr = session.get(f"{API}/people-ops/payroll/periods/{full['period_id']}")
        assert pr.status_code == 200
        detail = pr.json()
        my_entry = next(
            (e for e in (detail.get("entries") or []) if e.get("employee_id") == employee["employee_id"]),
            None,
        )
        assert my_entry, f"No payroll entry for our employee: {detail}"

        # Periodic OT linked
        linked_periods = my_entry.get("linked_overtime_period_ids") or []
        assert state["ot_period_id"] in linked_periods, (
            f"periodic OT should be linked. got={linked_periods}"
        )
        # Legacy OT linked (backwards compat — the one we approved earlier)
        linked_legacy = my_entry.get("linked_overtime_ids") or []
        assert state["seeded_approved_ot_id"] in linked_legacy, (
            f"legacy approved OT should also be consumed. got={linked_legacy}"
        )

        # DB check: both OTs are now processed
        ot_period = mongo.overtime_period_requests.find_one(
            {"overtime_period_id": state["ot_period_id"]}, {"_id": 0}
        )
        assert ot_period and ot_period.get("status") == "processed"
        assert ot_period.get("payroll_period_id") == state["payroll_period_id"]

        legacy = mongo.overtime_requests.find_one(
            {"overtime_id": state["seeded_approved_ot_id"]}, {"_id": 0}
        )
        assert legacy and legacy.get("status") == "processed"
        assert legacy.get("payroll_period_id") == state["payroll_period_id"]

    def test_delete_payroll_releases_both(self, session, mongo, state):
        pid = state["payroll_period_id"]
        r = session.delete(f"{API}/people-ops/payroll/periods/{pid}")
        assert r.status_code == 200, r.text

        ot_period = mongo.overtime_period_requests.find_one(
            {"overtime_period_id": state["ot_period_id"]}, {"_id": 0}
        )
        assert ot_period and ot_period.get("status") == "approved"
        assert ot_period.get("payroll_period_id") in (None, ""), ot_period.get("payroll_period_id")

        legacy = mongo.overtime_requests.find_one(
            {"overtime_id": state["seeded_approved_ot_id"]}, {"_id": 0}
        )
        assert legacy and legacy.get("status") == "approved"
        assert legacy.get("payroll_period_id") in (None, "")
        state["payroll_period_id"] = None


# ---------------- cleanup ----------------

@pytest.fixture(scope="module", autouse=True)
def _cleanup(session, mongo, state):
    yield
    # Try to delete payroll period if still around
    pid = state.get("payroll_period_id")
    if pid:
        try:
            session.delete(f"{API}/people-ops/payroll/periods/{pid}")
        except Exception:
            pass
    # Delete OT period
    if state.get("ot_period_id"):
        try:
            session.delete(f"{API}/people-ops/overtime/periods/{state['ot_period_id']}")
        except Exception:
            pass
    # Wipe seeded legacy OTs by pattern
    mongo.overtime_requests.delete_many({"overtime_id": {"$regex": "^ot_TEST_iter222_"}})
