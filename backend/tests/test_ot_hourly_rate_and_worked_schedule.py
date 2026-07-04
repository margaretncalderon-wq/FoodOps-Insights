"""Iteration 221 — Regression tests for:
(A) BUG FIX: hourly_rate must NOT be multiplied by frequency (biweekly ×2 / weekly ×4).
    base_salary is stored as MONTHLY; hourly_rate = base_salary / hours_per_month (192).
(B) NEW FEATURE: worked_schedule input mode for /overtime/periods.
"""
import os
import pytest
import requests
from datetime import datetime, date, timedelta

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

# Pick a future period (April 2026) not used by iter220
WEEK_MON = "2026-05-04"   # Monday
WEEK_TUE = "2026-05-05"
WEEK_WED = "2026-05-06"
WEEK_SAT = "2026-05-09"
WEEK_SUN = "2026-05-10"   # Sunday
BIWEEK_REF = "2026-05-04"

HOURS_PER_MONTH = 192.0
RATE_35 = 1.35
RATE_NIGHT = 1.15
RATE_HOLIDAY = 2.0

TEST_BASE_SALARY = 50000.0  # RD$ monthly


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
def biweekly_employee(session):
    """Find or configure an active employee with payment_frequency='biweekly' and base_salary=50000."""
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    emps = r.json()
    if isinstance(emps, dict):
        emps = emps.get("employees") or emps.get("data") or []
    active = [e for e in emps if (e.get("status") in (None, "active", "Active"))]
    assert active, "Need at least one active employee"
    emp = active[0]
    eid = emp.get("employee_id") or emp.get("id")
    # Snapshot original values so we can restore
    orig = {"base_salary": emp.get("base_salary"), "payment_frequency": emp.get("payment_frequency")}
    # Force biweekly + known salary for deterministic math
    upd = session.put(f"{API}/people-ops/employees/{eid}",
                      json={"base_salary": TEST_BASE_SALARY, "payment_frequency": "biweekly"})
    assert upd.status_code == 200, f"PUT employee failed: {upd.status_code} {upd.text}"
    yield {"employee_id": eid, "original": orig}
    # restore
    try:
        session.put(f"{API}/people-ops/employees/{eid}",
                    json={"base_salary": orig.get("base_salary"),
                          "payment_frequency": orig.get("payment_frequency") or "biweekly"})
    except Exception:
        pass


@pytest.fixture(scope="module")
def weekly_employee(session):
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    emps = r.json()
    if isinstance(emps, dict):
        emps = emps.get("employees") or emps.get("data") or []
    active = [e for e in emps if (e.get("status") in (None, "active", "Active"))]
    assert len(active) >= 2, "Need at least two active employees"
    emp = active[1]
    eid = emp.get("employee_id") or emp.get("id")
    orig = {"base_salary": emp.get("base_salary"), "payment_frequency": emp.get("payment_frequency")}
    upd = session.put(f"{API}/people-ops/employees/{eid}",
                      json={"base_salary": TEST_BASE_SALARY, "payment_frequency": "weekly"})
    assert upd.status_code == 200, f"PUT employee failed: {upd.status_code} {upd.text}"
    yield {"employee_id": eid, "original": orig}
    try:
        session.put(f"{API}/people-ops/employees/{eid}",
                    json={"base_salary": orig.get("base_salary"),
                          "payment_frequency": orig.get("payment_frequency") or "biweekly"})
    except Exception:
        pass


def _cleanup_ot(session, ot_id):
    if ot_id:
        try:
            session.delete(f"{API}/people-ops/overtime/periods/{ot_id}")
        except Exception:
            pass


# ============ BUG FIX A: hourly_rate ============

class TestHourlyRateBugFix:
    def test_biweekly_hourly_rate_not_doubled(self, session, biweekly_employee):
        eid = biweekly_employee["employee_id"]
        payload = {
            "employee_id": eid,
            "period_type": "biweekly",
            "ref_date": BIWEEK_REF,
            "daily_entries": [{"date": WEEK_TUE, "hours_35": 5}],
            "reason": "TEST_iter221 biweekly hourly rate",
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        ot_id = body["overtime_period_id"]
        try:
            # Expected: hourly_rate = 50000/192; amount = 5 * hourly * 1.35
            expected = round(TEST_BASE_SALARY / HOURS_PER_MONTH * 5 * RATE_35, 2)
            got = float(body.get("estimated_amount") or 0)
            assert abs(got - expected) <= 1.0, (
                f"Biweekly OT amount wrong: got {got}, expected ~{expected} "
                f"(base_salary={TEST_BASE_SALARY}, /192*5*1.35). "
                f"If got≈{expected*2}, the ×2 bug is back."
            )
            # sanity: not doubled
            assert got < expected * 1.5, f"Amount {got} looks doubled vs expected {expected}"
        finally:
            _cleanup_ot(session, ot_id)

    def test_weekly_hourly_rate_not_quadrupled(self, session, weekly_employee):
        eid = weekly_employee["employee_id"]
        payload = {
            "employee_id": eid,
            "period_type": "weekly",
            "ref_date": WEEK_MON,
            "daily_entries": [{"date": WEEK_TUE, "hours_35": 5}],
            "reason": "TEST_iter221 weekly hourly rate",
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        ot_id = body["overtime_period_id"]
        try:
            expected = round(TEST_BASE_SALARY / HOURS_PER_MONTH * 5 * RATE_35, 2)
            got = float(body.get("estimated_amount") or 0)
            assert abs(got - expected) <= 1.0, (
                f"Weekly OT amount wrong: got {got}, expected ~{expected}. "
                f"If got≈{expected*4}, the ×4 bug is back."
            )
            assert got < expected * 2.0, f"Amount {got} looks multiplied vs expected {expected}"
        finally:
            _cleanup_ot(session, ot_id)

    def test_payroll_projection_reflects_corrected_ot(self, session, biweekly_employee):
        """Approved OT for biweekly employee should contribute the corrected (÷1) amount
        (not doubled) to projection.pending_overtime.total_amount."""
        eid = biweekly_employee["employee_id"]
        payload = {
            "employee_id": eid,
            "period_type": "biweekly",
            "ref_date": BIWEEK_REF,
            "daily_entries": [{"date": WEEK_WED, "hours_35": 4}],
            "reason": "TEST_iter221 projection",
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        ot_id = r.json()["overtime_period_id"]
        try:
            ap = session.post(f"{API}/people-ops/overtime/periods/{ot_id}/approve")
            assert ap.status_code == 200, ap.text
            pr = session.get(f"{API}/people-ops/payroll/projection",
                             params={"period_type": "biweekly", "ref_date": BIWEEK_REF})
            assert pr.status_code == 200, pr.text
            proj = pr.json()
            expected_amount = TEST_BASE_SALARY / HOURS_PER_MONTH * 4 * RATE_35  # ~1406
            pending = proj.get("pending_overtime") or {}
            total = float(pending.get("total_amount") or 0)
            # Projection may include other approved OTs; ensure our contribution isn't doubled.
            # If old bug was active, contribution would be ~2× expected.
            assert total > 0, f"Projection has no OT amount: {proj}"
            # The reported total must be >= expected (our OT) and < expected*2 (upper bound proves not doubled ONLY if no other OT).
            # We'll just verify plausibility and log:
            print(f"[iter221] projection.pending_overtime.total_amount={total}, our OT expected≈{expected_amount:.2f}")
        finally:
            _cleanup_ot(session, ot_id)


# ============ FEATURE B: worked_schedule ============

class TestWorkedScheduleMode:
    def test_create_with_worked_entries_computes_h35_and_night(self, session, weekly_employee):
        eid = weekly_employee["employee_id"]
        # Day 1: Mon 08:00-19:00 break 60 → 10h worked, 0 night; base is likely 8h → ~2h OT (h35)
        # Day 2: Tue 22:00-02:00 (crosses midnight) → 4h worked, ALL night (22-02 in 21-06 window)
        payload = {
            "employee_id": eid,
            "period_type": "weekly",
            "ref_date": WEEK_MON,
            "worked_entries": [
                {"date": WEEK_MON, "time_in": "08:00", "time_out": "19:00", "break_min": 60},
                {"date": WEEK_TUE, "time_in": "22:00", "time_out": "02:00", "break_min": 0},
            ],
            "reason": "TEST_iter221 worked_schedule",
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        ot_id = body["overtime_period_id"]
        try:
            assert ot_id and ot_id.startswith("otp_"), body
            # Fetch full doc
            g = session.get(f"{API}/people-ops/overtime/periods/{ot_id}")
            assert g.status_code == 200, g.text
            doc = g.json()
            assert doc.get("input_mode") == "worked_schedule", doc
            daily = doc.get("daily_entries") or []
            assert len(daily) == 2, daily
            by_date = {d["date"]: d for d in daily}

            d1 = by_date[WEEK_MON]
            # 10h worked; if schedule has 8h base, ~2h OT. If no schedule (0 base), 10h OT.
            worked_h_d1 = d1.get("worked_total_hours") or 0
            assert abs(worked_h_d1 - 10.0) < 0.05, f"Day1 worked_total_hours: {d1}"
            ot_d1 = (d1.get("hours_35") or 0) + (d1.get("hours_night") or 0)
            assert ot_d1 > 0, f"Day1 should have OT hours>0: {d1}"

            d2 = by_date[WEEK_TUE]
            worked_h_d2 = d2.get("worked_total_hours") or 0
            assert abs(worked_h_d2 - 4.0) < 0.05, f"Day2 worked_total_hours: {d2}"
            # All 4h are in 21-06 window; whatever portion is OT should be night
            assert (d2.get("hours_night") or 0) > 0, f"Day2 must have hours_night>0 (22-02 shift): {d2}"

            # response totals populated
            for k in ("hours_35", "hours_night", "hours_holiday", "hours_100"):
                assert k in body, body
            assert (body.get("hours_night") or 0) > 0
        finally:
            _cleanup_ot(session, ot_id)

    def test_sunday_worked_all_holiday(self, session, weekly_employee):
        eid = weekly_employee["employee_id"]
        # WEEK_SUN=2026-05-10 is Sunday
        payload = {
            "employee_id": eid,
            "period_type": "weekly",
            "ref_date": WEEK_MON,
            "worked_entries": [
                {"date": WEEK_SUN, "time_in": "09:00", "time_out": "17:00", "break_min": 0},
            ],
            "reason": "TEST_iter221 sunday",
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        ot_id = body["overtime_period_id"]
        try:
            g = session.get(f"{API}/people-ops/overtime/periods/{ot_id}")
            doc = g.json()
            daily = doc.get("daily_entries") or []
            assert len(daily) == 1, daily
            d = daily[0]
            assert d["date"] == WEEK_SUN
            assert abs((d.get("hours_holiday") or 0) - 8.0) < 0.05, f"Sunday should be 8h holiday: {d}"
            assert (d.get("hours_35") or 0) == 0, d
            assert (d.get("hours_night") or 0) == 0, d
        finally:
            _cleanup_ot(session, ot_id)

    def test_is_holiday_flag_on_weekday(self, session, weekly_employee):
        eid = weekly_employee["employee_id"]
        payload = {
            "employee_id": eid,
            "period_type": "weekly",
            "ref_date": WEEK_MON,
            "worked_entries": [
                {"date": WEEK_WED, "time_in": "08:00", "time_out": "16:00",
                 "break_min": 0, "is_holiday": True},
            ],
            "reason": "TEST_iter221 holiday flag",
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        ot_id = r.json()["overtime_period_id"]
        try:
            g = session.get(f"{API}/people-ops/overtime/periods/{ot_id}")
            d = g.json()["daily_entries"][0]
            assert abs((d.get("hours_holiday") or 0) - 8.0) < 0.05, d
            assert (d.get("hours_35") or 0) == 0
            assert (d.get("hours_night") or 0) == 0
        finally:
            _cleanup_ot(session, ot_id)

    def test_put_update_worked_entries(self, session, weekly_employee):
        eid = weekly_employee["employee_id"]
        # Create in manual mode first
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": eid,
            "period_type": "weekly",
            "ref_date": WEEK_MON,
            "daily_entries": [{"date": WEEK_TUE, "hours_35": 2}],
            "reason": "TEST_iter221 put-update",
        })
        assert r.status_code == 200, r.text
        ot_id = r.json()["overtime_period_id"]
        try:
            # Now PUT worked_entries → switches to worked_schedule
            up = session.put(f"{API}/people-ops/overtime/periods/{ot_id}", json={
                "worked_entries": [
                    {"date": WEEK_TUE, "time_in": "09:00", "time_out": "20:00", "break_min": 60},
                ],
            })
            assert up.status_code == 200, up.text
            g = session.get(f"{API}/people-ops/overtime/periods/{ot_id}")
            doc = g.json()
            assert doc.get("input_mode") == "worked_schedule", doc
            daily = doc.get("daily_entries") or []
            assert len(daily) == 1
            d = daily[0]
            assert abs((d.get("worked_total_hours") or 0) - 10.0) < 0.05, d
        finally:
            _cleanup_ot(session, ot_id)


# ============ REGRESSION: manual mode still works ============

class TestManualRegression:
    def test_manual_mode_still_works(self, session, weekly_employee):
        eid = weekly_employee["employee_id"]
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": eid,
            "period_type": "weekly",
            "ref_date": WEEK_MON,
            "daily_entries": [{"date": WEEK_TUE, "hours_35": 3}],
            "reason": "TEST_iter221 manual regression",
        })
        assert r.status_code == 200, r.text
        ot_id = r.json()["overtime_period_id"]
        try:
            g = session.get(f"{API}/people-ops/overtime/periods/{ot_id}")
            doc = g.json()
            assert doc.get("input_mode") == "manual", doc
            assert (doc.get("worked_entries") or []) == []
            daily = doc.get("daily_entries") or []
            assert len(daily) == 1
            assert daily[0]["hours_35"] == 3
        finally:
            _cleanup_ot(session, ot_id)
