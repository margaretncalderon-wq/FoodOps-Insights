"""Tests for People Ops employee schedules & days-off (iteration 219).

Endpoints:
- POST/GET/PUT/DELETE /api/people-ops/schedules/employee/{employee_id}
- GET /api/people-ops/schedules/employee/{employee_id}/current
- GET /api/people-ops/schedules/employee/{employee_id}/expected-hours
- POST/GET/DELETE /api/people-ops/days-off/employee/{employee_id}
- GET /api/people-ops/schedules/team-calendar
- Regressions: overtime periods, overtime requests, time-off requests
"""
import os
import pytest
import requests
from datetime import date

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.strip().startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = _load_base_url()
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def employee_id(headers):
    r = requests.get(
        f"{BASE_URL}/api/people-ops/employees?status=active",
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, f"employees list: {r.status_code} {r.text}"
    body = r.json()
    items = body if isinstance(body, list) else (body.get("employees") or body.get("items") or [])
    assert items, "No active employees found"
    return items[0]["employee_id"]


def _make_pattern(weekday_hours=8.0, sat=0.0, sun=0.0):
    return {
        "monday": {"work_hours": weekday_hours, "start": "08:00", "end": "17:00", "break_min": 60},
        "tuesday": {"work_hours": weekday_hours, "start": "08:00", "end": "17:00", "break_min": 60},
        "wednesday": {"work_hours": weekday_hours, "start": "08:00", "end": "17:00", "break_min": 60},
        "thursday": {"work_hours": weekday_hours, "start": "08:00", "end": "17:00", "break_min": 60},
        "friday": {"work_hours": weekday_hours, "start": "08:00", "end": "17:00", "break_min": 60},
        "saturday": {"work_hours": sat, "start": None, "end": None, "break_min": 0},
        "sunday": {"work_hours": sun, "start": None, "end": None, "break_min": 0},
    }


# ==================== SCHEDULE CRUD ====================

@pytest.fixture(scope="module")
def created_schedule_ids():
    return []


class TestScheduleCRUD:
    def test_cleanup_previous(self, headers, employee_id):
        # Best-effort cleanup of prior test schedules
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        for s in r.json():
            requests.delete(
                f"{BASE_URL}/api/people-ops/schedules/{s['schedule_id']}",
                headers=headers, timeout=30,
            )

    def test_create_schedule_v1(self, headers, employee_id, created_schedule_ids):
        payload = {
            "effective_from": "2026-01-01",
            "weekly_pattern": _make_pattern(8.0),
            "weekly_hours_threshold": 44,
            "notes": "TEST_v1",
        }
        r = requests.post(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["schedule_id"].startswith("sch_")
        assert doc["status"] == "active"
        assert doc["effective_from"] == "2026-01-01"
        assert doc["weekly_hours_total"] == 40.0  # 5 * 8
        assert doc["weekly_hours_threshold"] == 44
        assert set(doc["weekly_pattern"].keys()) == {
            "monday","tuesday","wednesday","thursday","friday","saturday","sunday"
        }
        created_schedule_ids.append(doc["schedule_id"])

    def test_list_schedules(self, headers, employee_id, created_schedule_ids):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        docs = r.json()
        ids = [d["schedule_id"] for d in docs]
        assert created_schedule_ids[0] in ids

    def test_get_current_schedule(self, headers, employee_id, created_schedule_ids):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}/current",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        cur = r.json()
        # effective_from=2026-01-01 and today >= that (Jan 2026)
        if cur is not None:
            assert cur["schedule_id"] == created_schedule_ids[0]
            assert cur["status"] == "active"

    def test_create_v2_supersedes_v1(self, headers, employee_id, created_schedule_ids):
        payload = {
            "effective_from": "2026-03-01",
            "weekly_pattern": _make_pattern(9.0, sat=4.0),
            "weekly_hours_threshold": 44,
        }
        r = requests.post(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        v2 = r.json()
        created_schedule_ids.append(v2["schedule_id"])
        assert v2["weekly_hours_total"] == 49.0  # 5*9 + 4

        # v1 should now be superseded with effective_to = 2026-02-28
        r2 = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, timeout=30,
        )
        docs = {d["schedule_id"]: d for d in r2.json()}
        v1 = docs[created_schedule_ids[0]]
        assert v1["status"] == "superseded", f"v1 status={v1['status']}"
        assert v1["effective_to"] == "2026-02-28", f"v1 effective_to={v1['effective_to']}"

    def test_put_active_schedule(self, headers, employee_id, created_schedule_ids):
        v2_id = created_schedule_ids[1]
        r = requests.put(
            f"{BASE_URL}/api/people-ops/schedules/{v2_id}",
            headers=headers,
            json={"notes": "TEST_updated", "weekly_pattern": _make_pattern(10.0)},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        # Verify persisted
        r2 = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, timeout=30,
        )
        docs = {d["schedule_id"]: d for d in r2.json()}
        assert docs[v2_id]["notes"] == "TEST_updated"
        assert docs[v2_id]["weekly_hours_total"] == 50.0

    def test_put_superseded_returns_400(self, headers, created_schedule_ids):
        v1_id = created_schedule_ids[0]  # was superseded
        r = requests.put(
            f"{BASE_URL}/api/people-ops/schedules/{v1_id}",
            headers=headers, json={"notes": "should-fail"}, timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_delete_nonexistent_404(self, headers):
        r = requests.delete(
            f"{BASE_URL}/api/people-ops/schedules/sch_nonexistent_xyz",
            headers=headers, timeout=30,
        )
        assert r.status_code == 404


# ==================== EXPECTED HOURS ====================

class TestExpectedHours:
    def test_expected_hours_full_week(self, headers, employee_id):
        # v2 (active from 2026-03-01, 10h weekday from update) — pick a March week
        # Range 2026-03-02 Mon .. 2026-03-08 Sun
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}/expected-hours"
            f"?start_date=2026-03-02&end_date=2026-03-08",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["daily"]) == 7
        # Weekdays: 10h * 5 = 50; Sat pattern=0 (updated pattern used defaults); Sun=0
        assert body["daily"]["2026-03-08"] == 0.0  # Sunday
        # Sum matches
        assert round(sum(body["daily"].values()), 2) == body["total_hours"]

    def test_expected_hours_no_schedule_returns_zero(self, headers, employee_id):
        # Before 2026-01-01 there's no active schedule (v1 effective_from=2026-01-01)
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}/expected-hours"
            f"?start_date=2025-12-01&end_date=2025-12-07",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total_hours"] == 0.0


# ==================== DAYS OFF ====================

@pytest.fixture(scope="module")
def created_day_off_ids():
    return []


class TestDaysOff:
    def test_create_day_off(self, headers, employee_id, created_day_off_ids):
        # cleanup any existing on same date first
        r0 = requests.get(
            f"{BASE_URL}/api/people-ops/days-off/employee/{employee_id}"
            f"?start_date=2026-03-01&end_date=2026-03-31",
            headers=headers, timeout=30,
        )
        for d in r0.json():
            requests.delete(
                f"{BASE_URL}/api/people-ops/days-off/{d['day_off_id']}",
                headers=headers, timeout=30,
            )
        r = requests.post(
            f"{BASE_URL}/api/people-ops/days-off/employee/{employee_id}",
            headers=headers,
            json={"date": "2026-03-04", "category": "personal", "reason": "TEST_personal"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["date"] == "2026-03-04"
        assert doc["day_off_id"].startswith("dof_")
        created_day_off_ids.append(doc["day_off_id"])

    def test_duplicate_day_off_400(self, headers, employee_id):
        r = requests.post(
            f"{BASE_URL}/api/people-ops/days-off/employee/{employee_id}",
            headers=headers,
            json={"date": "2026-03-04", "category": "personal"},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_list_days_off_in_range(self, headers, employee_id, created_day_off_ids):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/days-off/employee/{employee_id}"
            f"?start_date=2026-03-01&end_date=2026-03-31",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        ids = [d["day_off_id"] for d in r.json()]
        assert created_day_off_ids[0] in ids

    def test_expected_hours_subtracts_day_off(self, headers, employee_id):
        # 2026-03-04 is Wednesday. v2 pattern (updated) has 10h weekday, but day-off means 0
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}/expected-hours"
            f"?start_date=2026-03-04&end_date=2026-03-04",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["daily"]["2026-03-04"] == 0.0
        assert body["days_off_count"] == 1

    def test_delete_day_off_nonexistent(self, headers):
        r = requests.delete(
            f"{BASE_URL}/api/people-ops/days-off/dof_nonexistent_xyz",
            headers=headers, timeout=30,
        )
        assert r.status_code == 404

    def test_delete_day_off_success(self, headers, created_day_off_ids):
        r = requests.delete(
            f"{BASE_URL}/api/people-ops/days-off/{created_day_off_ids[0]}",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200


# ==================== TEAM CALENDAR ====================

class TestTeamCalendar:
    def test_team_calendar_shape(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/team-calendar"
            f"?start_date=2026-03-01&end_date=2026-03-31",
            headers=headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["start_date"] == "2026-03-01"
        assert body["end_date"] == "2026-03-31"
        assert isinstance(body["events"], list)
        assert isinstance(body["employees"], list)
        # Should contain at least one schedule event for our test employee
        types = {e["type"] for e in body["events"]}
        # types is a subset of allowed
        allowed = {"schedule", "day_off", "time_off", "overtime"}
        assert types.issubset(allowed), f"unexpected event types: {types - allowed}"


# ==================== FINAL CLEANUP ====================

class TestZCleanup:
    def test_cleanup_schedules(self, headers, employee_id):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/schedules/employee/{employee_id}",
            headers=headers, timeout=30,
        )
        for s in r.json():
            requests.delete(
                f"{BASE_URL}/api/people-ops/schedules/{s['schedule_id']}",
                headers=headers, timeout=30,
            )


# ==================== REGRESSIONS ====================

class TestRegressions:
    def test_overtime_periods(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/overtime/periods",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200, r.text

    def test_overtime_requests_legacy(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/overtime/requests",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200, r.text

    def test_time_off_requests(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/time-off/requests",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200, r.text
