"""Iteration 224 — Backend tests for Weekly Timesheet days_off_dates integration.

Verifies POST/PUT /api/people-ops/overtime/periods now accept days_off_dates:
  (1) Upserts employee_days_off rows with source='timesheet' BEFORE computing shortfall.
  (2) On PUT: diff-based cleanup removes previously-added source='timesheet' entries
      that are no longer in the payload — but leaves manually-added (source != 'timesheet')
      day-off entries untouched.

Test dates: biweekly period 2026-06-16..2026-06-30 (ref_date 2026-06-27).
Employee schedule: 8h Mon-Sun (so weekend days count for shortfall).
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

PERIOD_START = "2026-06-16"
PERIOD_END = "2026-06-30"
REF_DATE = "2026-06-27"
DAY_OFF_1 = "2026-06-27"  # Sat
DAY_OFF_2 = "2026-06-28"  # Sun
MANUAL_DAY_OFF = "2026-06-20"  # Sat — pre-existing manual day-off (source != 'timesheet')


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
    """Pick an active employee, force base_salary=50000, biweekly, and give them
    an 8h Mon-Sun schedule covering our test period. Snapshot & restore on teardown."""
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    emps = r.json()
    if isinstance(emps, dict):
        emps = emps.get("employees") or emps.get("data") or []
    active = [e for e in emps if (e.get("status") in (None, "active", "Active"))]
    assert active, "Need at least one active employee"
    emp = next((e for e in active if float(e.get("base_salary") or 0) > 0), active[0])
    emp_id = emp.get("employee_id") or emp.get("id")
    company_id = emp.get("company_id")

    original = mongo.employees.find_one(
        {"employee_id": emp_id},
        {"_id": 0, "base_salary": 1, "payment_frequency": 1, "overtime_period_type": 1},
    ) or {}
    mongo.employees.update_one(
        {"employee_id": emp_id},
        {"$set": {"base_salary": 50000, "payment_frequency": "biweekly",
                  "overtime_period_type": "biweekly"}},
    )

    # Create 8h/day Mon-Sun schedule effective 2026-06-01
    pattern = {d: {"work_hours": 8, "start": "09:00", "end": "17:00", "break_min": 0}
               for d in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]}
    sched_resp = session.post(
        f"{API}/people-ops/schedules/employee/{emp_id}",
        json={"effective_from": "2026-06-01", "weekly_pattern": pattern,
              "weekly_hours_threshold": 44, "notes": "TEST_iter224"},
    )
    assert sched_resp.status_code == 200, f"schedule create failed: {sched_resp.status_code} {sched_resp.text}"
    schedule_id = sched_resp.json().get("schedule_id")

    yield {"employee_id": emp_id, "company_id": company_id, "employee_name": emp.get("full_name")}

    # Cleanup: remove test schedule & test day-offs & any leftover overtime_period
    if schedule_id:
        mongo.employee_schedules.delete_one({"schedule_id": schedule_id})
    # Restore previously-active schedule if any (best-effort: reactivate most recent superseded created before our test)
    mongo.employee_schedules.update_many(
        {"employee_id": emp_id, "status": "superseded", "notes": {"$ne": "TEST_iter224"}},
        {"$set": {"effective_to": None, "status": "active"}},
    )
    mongo.employee_days_off.delete_many(
        {"employee_id": emp_id, "date": {"$in": [DAY_OFF_1, DAY_OFF_2, MANUAL_DAY_OFF]}}
    )
    mongo.overtime_period_requests.delete_many(
        {"employee_id": emp_id, "start_date": PERIOD_START, "end_date": PERIOD_END}
    )
    mongo.employees.update_one(
        {"employee_id": emp_id},
        {"$set": {
            "base_salary": original.get("base_salary", 0),
            "payment_frequency": original.get("payment_frequency", "monthly"),
            "overtime_period_type": original.get("overtime_period_type"),
        }},
    )


@pytest.fixture(scope="module")
def state():
    return {"period_id": None}


@pytest.fixture(autouse=True)
def _clean_period(mongo, employee):
    """Ensure clean days_off + no leftover period before each test."""
    mongo.employee_days_off.delete_many(
        {"employee_id": employee["employee_id"],
         "date": {"$in": [DAY_OFF_1, DAY_OFF_2, MANUAL_DAY_OFF]}}
    )
    mongo.overtime_period_requests.delete_many(
        {"employee_id": employee["employee_id"],
         "start_date": PERIOD_START, "end_date": PERIOD_END}
    )
    yield


def _worked_entries():
    """Non-day-off working days in period with modest OT (2h @ hours_35 on each)."""
    # Cover a few working days in the period, avoiding DAY_OFF_1/2 & MANUAL_DAY_OFF
    days = ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19",
            "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26",
            "2026-06-29", "2026-06-30"]
    return [{"date": d, "time_in": "09:00", "time_out": "19:00", "break_min": 0} for d in days]


# ---------------- tests ----------------

class TestTimesheetDaysOff:

    def test_A_post_upserts_days_off_and_applies_shortfall(self, session, mongo, employee, state):
        payload = {
            "employee_id": employee["employee_id"],
            "period_type": "biweekly",
            "ref_date": REF_DATE,
            "reason": "TEST_iter224 A",
            "worked_entries": _worked_entries(),
            "days_off_dates": [DAY_OFF_1, DAY_OFF_2],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, f"POST failed: {r.status_code} {r.text}"
        body = r.json()
        state["period_id"] = body["overtime_period_id"]

        # (a) shortfall = 8h * 2 days = 16h
        assert body.get("shortfall_hours") == 16.0, f"shortfall_hours={body.get('shortfall_hours')} (expected 16.0)"

        # (b) estimated_amount_effective < estimated_amount
        est = float(body.get("estimated_amount") or 0)
        est_eff = float(body.get("estimated_amount_effective") or 0)
        assert est > 0, f"estimated_amount should be > 0 (got {est})"
        assert est_eff < est, f"effective ({est_eff}) should be less than raw ({est})"

        # (c) employee_days_off has 2 rows with source='timesheet'
        rows = list(mongo.employee_days_off.find(
            {"employee_id": employee["employee_id"], "date": {"$in": [DAY_OFF_1, DAY_OFF_2]}},
            {"_id": 0, "date": 1, "source": 1},
        ))
        assert len(rows) == 2, f"expected 2 rows, got {len(rows)}: {rows}"
        for row in rows:
            assert row.get("source") == "timesheet", f"row missing source='timesheet': {row}"

    def test_B_put_removes_one_day_off_keeps_other(self, session, mongo, employee, state):
        # Seed: POST with both days-off
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": employee["employee_id"],
            "period_type": "biweekly",
            "ref_date": REF_DATE,
            "worked_entries": _worked_entries(),
            "days_off_dates": [DAY_OFF_1, DAY_OFF_2],
        })
        assert r.status_code == 200, r.text
        pid = r.json()["overtime_period_id"]

        # PUT with only DAY_OFF_1
        r2 = session.put(f"{API}/people-ops/overtime/periods/{pid}", json={
            "worked_entries": _worked_entries(),
            "days_off_dates": [DAY_OFF_1],
        })
        assert r2.status_code == 200, f"PUT failed: {r2.status_code} {r2.text}"

        # (a) DAY_OFF_1 still present as source='timesheet', DAY_OFF_2 gone
        rows = list(mongo.employee_days_off.find(
            {"employee_id": employee["employee_id"], "date": {"$in": [DAY_OFF_1, DAY_OFF_2]}},
            {"_id": 0, "date": 1, "source": 1},
        ))
        dates = {r["date"]: r for r in rows}
        assert DAY_OFF_1 in dates, f"DAY_OFF_1 should remain, got {dates}"
        assert dates[DAY_OFF_1].get("source") == "timesheet"
        assert DAY_OFF_2 not in dates, f"DAY_OFF_2 should be removed, got {dates}"

        # (b) shortfall now = 8h
        got = session.get(f"{API}/people-ops/overtime/periods").json()
        periods = got if isinstance(got, list) else (got.get("periods") or got.get("data") or [])
        our = next((p for p in periods if p.get("overtime_period_id") == pid), None)
        assert our is not None, "period not found in GET"
        assert our.get("shortfall_hours") == 8.0, f"shortfall_hours={our.get('shortfall_hours')} (expected 8.0)"

    def test_C_put_empty_days_off_removes_all_timesheet_marks(self, session, mongo, employee):
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": employee["employee_id"],
            "period_type": "biweekly",
            "ref_date": REF_DATE,
            "worked_entries": _worked_entries(),
            "days_off_dates": [DAY_OFF_1, DAY_OFF_2],
        })
        assert r.status_code == 200
        pid = r.json()["overtime_period_id"]

        r2 = session.put(f"{API}/people-ops/overtime/periods/{pid}", json={
            "worked_entries": _worked_entries(),
            "days_off_dates": [],
        })
        assert r2.status_code == 200, r2.text

        rows = list(mongo.employee_days_off.find(
            {"employee_id": employee["employee_id"],
             "date": {"$in": [DAY_OFF_1, DAY_OFF_2]},
             "source": "timesheet"},
        ))
        assert rows == [], f"expected no timesheet day-offs, got {rows}"

    def test_D_regression_manual_day_off_not_deleted(self, session, mongo, employee):
        # Pre-seed a manually-added day-off (via API — no source field / source != 'timesheet')
        r0 = session.post(
            f"{API}/people-ops/days-off/employee/{employee['employee_id']}",
            json={"date": MANUAL_DAY_OFF, "reason": "TEST_iter224 manual", "category": "personal"},
        )
        assert r0.status_code == 200, f"manual day-off seed failed: {r0.status_code} {r0.text}"
        seeded = mongo.employee_days_off.find_one(
            {"employee_id": employee["employee_id"], "date": MANUAL_DAY_OFF}
        )
        assert seeded is not None
        # Confirm no source='timesheet'
        assert seeded.get("source") != "timesheet", f"manual seed unexpectedly source='timesheet': {seeded}"

        # POST timesheet WITHOUT MANUAL_DAY_OFF in days_off_dates
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": employee["employee_id"],
            "period_type": "biweekly",
            "ref_date": REF_DATE,
            "worked_entries": _worked_entries(),
            "days_off_dates": [DAY_OFF_1],
        })
        assert r.status_code == 200, r.text
        pid = r.json()["overtime_period_id"]

        # PUT — same, no MANUAL_DAY_OFF in payload
        r2 = session.put(f"{API}/people-ops/overtime/periods/{pid}", json={
            "worked_entries": _worked_entries(),
            "days_off_dates": [DAY_OFF_1],
        })
        assert r2.status_code == 200, r2.text

        # Manual day-off must SURVIVE
        still = mongo.employee_days_off.find_one(
            {"employee_id": employee["employee_id"], "date": MANUAL_DAY_OFF}
        )
        assert still is not None, "Manual day-off was DELETED by timesheet diff-cleanup (REGRESSION!)"
        assert still.get("source") != "timesheet", f"Manual day-off got its source changed: {still}"

        # And the shortfall still reflects the manual day-off (MANUAL_DAY_OFF=2026-06-20 Sat, 8h)
        # + DAY_OFF_1 (8h) = 16h total shortfall
        got = session.get(f"{API}/people-ops/overtime/periods").json()
        periods = got if isinstance(got, list) else (got.get("periods") or got.get("data") or [])
        our = next((p for p in periods if p.get("overtime_period_id") == pid), None)
        assert our is not None
        assert our.get("shortfall_hours") == 16.0, (
            f"shortfall_hours={our.get('shortfall_hours')} (expected 16.0 = manual 8h + timesheet 8h)"
        )
