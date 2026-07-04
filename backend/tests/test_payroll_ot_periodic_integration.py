"""Iteration 220 — Bug fix regression: periodic overtime (overtime_period_requests)
must flow into payroll projection, payroll period creation (mark processed +
linked_overtime_period_ids), payroll period deletion (release back to approved)
and /overtime/pending-in-range. Legacy per-day OT flow must still work.
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

# Use April 2026 to avoid collisions with data from previous iterations
WEEK_START = "2026-04-06"  # Monday
WEEK_END = "2026-04-12"    # Sunday
BIWEEK_START = "2026-04-01"
BIWEEK_END = "2026-04-15"


# ---------- fixtures ----------

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
def employee_id(session):
    """Pick an active employee with a non-zero base_salary so OT hourly-rate math is meaningful."""
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    emps = r.json()
    if isinstance(emps, dict):
        emps = emps.get("employees") or emps.get("data") or []
    active_paid = [
        e for e in emps
        if (e.get("status") in (None, "active", "Active")) and float(e.get("base_salary") or 0) > 0
    ]
    assert active_paid, "Need at least one active employee with base_salary > 0"
    return active_paid[0].get("employee_id") or active_paid[0].get("id")


@pytest.fixture(scope="module")
def company_id(session):
    r = session.get(f"{API}/auth/me")
    d = r.json() if r.status_code == 200 else {}
    return d.get("company_id") or d.get("active_org_id") or d.get("user", {}).get("company_id")




@pytest.fixture(scope="module")
def state():
    return {
        "ot_period_id": None,
        "payroll_period_id": None,
        "legacy_ot_id": None,
        "legacy_payroll_period_id": None,
    }


# ---------- helpers ----------

def _fetch_ot_period(session, ot_period_id):
    r = session.get(f"{API}/people-ops/overtime/periods/{ot_period_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _fetch_payroll_period_full(session, period_id):
    r = session.get(f"{API}/people-ops/payroll/periods/{period_id}")
    assert r.status_code == 200, r.text
    return r.json()


# ---------- tests ----------

class TestPeriodicOTFlowsIntoPayroll:
    """End-to-end: create periodic OT → approve → verify shows up in projection,
    pending-in-range, and in payroll period creation with proper linking."""

    def test_1_create_periodic_ot(self, session, employee_id, state):
        payload = {
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": WEEK_START,
            "reason": "TEST_iter220 periodic ot integration",
            "daily_entries": [
                {"date": "2026-04-07", "hours_35": 5},   # Tue
                {"date": "2026-04-08", "hours_night": 2},  # Wed
            ],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_date"] == WEEK_START and d["end_date"] == WEEK_END
        assert d["total_hours"] == 7
        assert d["hours_35"] == 5 and d["hours_night"] == 2
        assert d.get("estimated_amount", 0) > 0, "estimated_amount should be > 0 (employee has salary)"
        state["ot_period_id"] = d["overtime_period_id"]

    def test_2_approve_periodic_ot(self, session, state):
        pid = state["ot_period_id"]
        r = session.post(f"{API}/people-ops/overtime/periods/{pid}/approve")
        assert r.status_code == 200, r.text
        doc = _fetch_ot_period(session, pid)
        assert doc["status"] == "approved"
        # Not yet processed by a payroll
        assert not doc.get("payroll_period_id")

    def test_3_projection_includes_periodic_ot(self, session, state, employee_id):
        # Biweekly projection covers current/next pay period; the periodic OT
        # dated 2026-04-06..12 is approved & unpaid, so it MUST be aggregated.
        r = session.get(f"{API}/people-ops/payroll/projection", params={"period_type": "biweekly"})
        assert r.status_code == 200, r.text
        data = r.json()
        pot = data.get("pending_overtime") or {}
        assert pot.get("count", 0) >= 1, f"pending_overtime.count must include periodic OT: {pot}"
        assert pot.get("total_hours", 0) >= 7, f"total_hours must include 7 periodic hrs: {pot}"
        assert pot.get("total_amount", 0) > 0, f"total_amount must be > 0: {pot}"
        totals = data.get("totals") or {}
        assert totals.get("pending_overtime_amount", 0) > 0
        assert totals.get("estimated_gross", 0) >= totals.get("base_salary_period", 0)

    def test_4_pending_in_range_includes_periodic(self, session, state, employee_id):
        r = session.get(
            f"{API}/people-ops/overtime/pending-in-range",
            params={"start_date": BIWEEK_START, "end_date": BIWEEK_END},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("total_ot_count", 0) >= 1
        assert isinstance(data.get("raw_periods"), list)
        period_ids_in_raw = [p.get("overtime_period_id") for p in data["raw_periods"]]
        assert state["ot_period_id"] in period_ids_in_raw
        # summary_by_employee must expose ot_period_ids for this employee
        emp_summary = next(
            (s for s in data.get("summary_by_employee", []) if s.get("employee_id") == employee_id),
            None,
        )
        assert emp_summary is not None, "employee should appear in summary_by_employee"
        assert "ot_period_ids" in emp_summary and state["ot_period_id"] in emp_summary["ot_period_ids"]
        assert "ot_ids" in emp_summary  # legacy list always present (may be empty)

    def test_5_create_payroll_marks_periodic_ot_processed(self, session, state, employee_id):
        payload = {
            "period_type": "biweekly",
            "start_date": BIWEEK_START,
            "end_date": BIWEEK_END,
            "payment_date": "2026-04-16",
            "period_name": f"TEST_iter220 {uuid.uuid4().hex[:6]}",
            "payment_kind": "regular",
        }
        r = session.post(f"{API}/people-ops/payroll/periods", json=payload)
        assert r.status_code == 200, r.text
        period_doc = r.json()
        state["payroll_period_id"] = period_doc["period_id"]

        # (1) response entries include OT for our employee
        full = _fetch_payroll_period_full(session, period_doc["period_id"])
        entries = full.get("entries") or []
        my_entry = next((e for e in entries if e.get("employee_id") == employee_id), None)
        assert my_entry, f"No entry generated for employee {employee_id}"
        # 5 hrs @35% + 2 hrs night → both should be reflected
        assert my_entry.get("overtime_hours_35", 0) >= 5, my_entry
        assert my_entry.get("overtime_hours_night", 0) >= 2, my_entry
        assert (my_entry.get("overtime_amount_35", 0) + my_entry.get("overtime_amount_night", 0)) > 0

        # (3) linked_overtime_period_ids populated on the entry
        linked_periods = my_entry.get("linked_overtime_period_ids") or []
        assert state["ot_period_id"] in linked_periods, (
            f"linked_overtime_period_ids missing OT period. got={linked_periods}"
        )

        # (2) the overtime_period_request is now processed & tied to the payroll
        doc = _fetch_ot_period(session, state["ot_period_id"])
        assert doc["status"] == "processed", f"expected 'processed' got {doc.get('status')}"
        assert doc.get("payroll_period_id") == state["payroll_period_id"]

    def test_6_projection_excludes_processed_ot(self, session, state):
        """Now that OT has been consumed by a payroll, projection should no
        longer count it in pending_overtime."""
        r = session.get(f"{API}/people-ops/payroll/projection", params={"period_type": "biweekly"})
        assert r.status_code == 200
        pot = r.json().get("pending_overtime") or {}
        # It's fine if other OTs from other tests remain, but our specific 7 hours
        # should no longer be in the pool. Best check: pending-in-range no longer lists it.
        rp = session.get(
            f"{API}/people-ops/overtime/pending-in-range",
            params={"start_date": BIWEEK_START, "end_date": BIWEEK_END},
        ).json()
        raw_ids = [p.get("overtime_period_id") for p in (rp.get("raw_periods") or [])]
        assert state["ot_period_id"] not in raw_ids

    def test_7_delete_payroll_releases_periodic_ot(self, session, state):
        pid = state["payroll_period_id"]
        r = session.delete(f"{API}/people-ops/payroll/periods/{pid}")
        assert r.status_code == 200, r.text
        # OT period should be released
        doc = _fetch_ot_period(session, state["ot_period_id"])
        assert doc["status"] == "approved", f"expected 'approved' after release, got {doc.get('status')}"
        assert doc.get("payroll_period_id") in (None, ""), (
            f"payroll_period_id must be nullified, got {doc.get('payroll_period_id')}"
        )
        state["payroll_period_id"] = None


class TestLegacyOTRegression:
    """Regression: per-day legacy OT must still be picked up, processed and released.
    NOTE: POST /overtime/requests is now 410 (iter222). Seed directly to Mongo.
    """

    def test_1_create_legacy_ot(self, session, employee_id, state, company_id):
        # Seed a legacy OT directly (endpoint is deprecated → 410).
        import uuid, os
        from pymongo import MongoClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        client = MongoClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        ot_id = f"ot_iter220_{uuid.uuid4().hex[:8]}"
        emp = db.employees.find_one({"employee_id": employee_id})
        hourly = float(emp.get("base_salary") or 0) / 192
        db.overtime_requests.insert_one({
            "overtime_id": ot_id,
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": emp.get("full_name"),
            "date": "2026-04-14",
            "hours_35": 3.0, "hours_night": 0, "hours_holiday": 0, "hours_100": 0,
            "hourly_rate_at_creation": hourly,
            "estimated_amount": hourly * 3.0 * 1.35,
            "reason": "TEST_iter220 legacy regression",
            "status": "pending",
            "payroll_period_id": None,
            "created_at": "2026-04-14T00:00:00+00:00",
        })
        state["legacy_ot_id"] = ot_id

    def test_2_approve_legacy_ot(self, session, state):
        oid = state["legacy_ot_id"]
        r = session.post(f"{API}/people-ops/overtime/requests/{oid}/approve")
        assert r.status_code == 200, r.text

    def test_3_pending_in_range_lists_legacy(self, session, state, employee_id):
        r = session.get(
            f"{API}/people-ops/overtime/pending-in-range",
            params={"start_date": BIWEEK_START, "end_date": BIWEEK_END},
        )
        assert r.status_code == 200
        data = r.json()
        raw_ids = [o.get("overtime_id") for o in (data.get("raw") or [])]
        assert state["legacy_ot_id"] in raw_ids
        emp_row = next(
            (s for s in data.get("summary_by_employee", []) if s.get("employee_id") == employee_id),
            None,
        )
        assert emp_row is not None
        assert state["legacy_ot_id"] in (emp_row.get("ot_ids") or [])

    def test_4_create_payroll_consumes_legacy_ot(self, session, state, employee_id):
        # New payroll period covering the OT date
        payload = {
            "period_type": "biweekly",
            "start_date": BIWEEK_START,
            "end_date": BIWEEK_END,
            "payment_date": "2026-04-16",
            "period_name": f"TEST_iter220 legacy {uuid.uuid4().hex[:6]}",
            "payment_kind": "regular",
        }
        r = session.post(f"{API}/people-ops/payroll/periods", json=payload)
        assert r.status_code == 200, r.text
        state["legacy_payroll_period_id"] = r.json()["period_id"]

        full = _fetch_payroll_period_full(session, state["legacy_payroll_period_id"])
        my_entry = next(
            (e for e in full.get("entries", []) if e.get("employee_id") == employee_id), None
        )
        assert my_entry
        assert state["legacy_ot_id"] in (my_entry.get("linked_overtime_ids") or [])
        assert my_entry.get("overtime_hours_35", 0) >= 3

        # Legacy OT should be processed now
        rlist = session.get(f"{API}/people-ops/overtime/requests").json()
        legacy = next((o for o in rlist if o.get("overtime_id") == state["legacy_ot_id"]), None)
        assert legacy is not None
        assert legacy.get("status") == "processed"
        assert legacy.get("payroll_period_id") == state["legacy_payroll_period_id"]

    def test_5_delete_payroll_releases_legacy(self, session, state):
        pid = state["legacy_payroll_period_id"]
        r = session.delete(f"{API}/people-ops/payroll/periods/{pid}")
        assert r.status_code == 200
        rlist = session.get(f"{API}/people-ops/overtime/requests").json()
        legacy = next((o for o in rlist if o.get("overtime_id") == state["legacy_ot_id"]), None)
        assert legacy is not None
        assert legacy.get("status") == "approved"
        assert legacy.get("payroll_period_id") in (None, "")
        state["legacy_payroll_period_id"] = None


# ---------- cleanup ----------

@pytest.fixture(scope="module", autouse=True)
def cleanup(session, state):
    yield
    # Best-effort teardown
    for key in ("payroll_period_id", "legacy_payroll_period_id"):
        pid = state.get(key)
        if pid:
            try:
                session.delete(f"{API}/people-ops/payroll/periods/{pid}")
            except Exception:
                pass
    if state.get("ot_period_id"):
        try:
            session.delete(f"{API}/people-ops/overtime/periods/{state['ot_period_id']}")
        except Exception:
            pass
    if state.get("legacy_ot_id"):
        try:
            session.delete(f"{API}/people-ops/overtime/requests/{state['legacy_ot_id']}")
        except Exception:
            pass
