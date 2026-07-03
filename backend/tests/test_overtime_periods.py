"""Tests for period-based overtime endpoints (Feb 2026 flow)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def employee_id(session):
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    employees = r.json()
    if isinstance(employees, dict):
        employees = employees.get("employees", employees.get("data", []))
    assert len(employees) > 0, "No employees found"
    # find one that is active if possible
    active = [e for e in employees if e.get("status") in (None, "active", "Active")]
    emp = (active or employees)[0]
    return emp.get("employee_id") or emp.get("id")


@pytest.fixture(scope="module")
def created_period_ids():
    return []


class TestPeriodConfig:
    def test_get_config_default(self, session):
        r = session.get(f"{API}/people-ops/overtime/period-config")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "company_default" in data
        assert "employee_overrides" in data
        assert isinstance(data["employee_overrides"], list)

    def test_put_config_weekly(self, session):
        r = session.put(f"{API}/people-ops/overtime/period-config", json={"period_type": "weekly"})
        assert r.status_code == 200, r.text
        assert r.json().get("period_type") == "weekly"
        # verify persistence
        r2 = session.get(f"{API}/people-ops/overtime/period-config")
        assert r2.json()["company_default"] == "weekly"

    def test_put_config_invalid(self, session):
        r = session.put(f"{API}/people-ops/overtime/period-config", json={"period_type": "invalid"})
        assert r.status_code == 400

    def test_reset_config_to_biweekly(self, session):
        # restore to biweekly after tests
        r = session.put(f"{API}/people-ops/overtime/period-config", json={"period_type": "biweekly"})
        assert r.status_code == 200


class TestEmployeePeriodOverride:
    def test_set_override_monthly(self, session, employee_id):
        r = session.put(f"{API}/people-ops/overtime/employee-period/{employee_id}", json={"period_type": "monthly"})
        assert r.status_code == 200, r.text
        # verify appears in config
        cfg = session.get(f"{API}/people-ops/overtime/period-config").json()
        emp_ids = [e["employee_id"] for e in cfg["employee_overrides"]]
        assert employee_id in emp_ids
        matched = [e for e in cfg["employee_overrides"] if e["employee_id"] == employee_id][0]
        assert matched["overtime_period_type"] == "monthly"

    def test_remove_override(self, session, employee_id):
        r = session.put(f"{API}/people-ops/overtime/employee-period/{employee_id}", json={"period_type": None})
        assert r.status_code == 200
        cfg = session.get(f"{API}/people-ops/overtime/period-config").json()
        emp_ids = [e["employee_id"] for e in cfg["employee_overrides"]]
        assert employee_id not in emp_ids


class TestPeriodBounds:
    def test_weekly_period(self, session, employee_id, created_period_ids):
        payload = {
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": "2026-02-04",  # Wed
            "daily_entries": [{"date": "2026-02-03", "hours_35": 4, "hours_night": 0, "hours_holiday": 0, "hours_100": 0}],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["start_date"] == "2026-02-02"
        assert data["end_date"] == "2026-02-08"
        assert data["total_hours"] == 4
        assert "overtime_period_id" in data
        created_period_ids.append(data["overtime_period_id"])

    def test_biweekly_first_half(self, session, employee_id, created_period_ids):
        payload = {
            "employee_id": employee_id,
            "period_type": "biweekly",
            "ref_date": "2026-02-10",
            "daily_entries": [],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_date"] == "2026-02-01"
        assert d["end_date"] == "2026-02-15"
        created_period_ids.append(d["overtime_period_id"])

    def test_biweekly_second_half(self, session, employee_id, created_period_ids):
        payload = {
            "employee_id": employee_id,
            "period_type": "biweekly",
            "ref_date": "2026-02-20",
            "daily_entries": [],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_date"] == "2026-02-16"
        assert d["end_date"] == "2026-02-28"
        created_period_ids.append(d["overtime_period_id"])

    def test_monthly(self, session, employee_id, created_period_ids):
        payload = {
            "employee_id": employee_id,
            "period_type": "monthly",
            "ref_date": "2026-02-15",
            "daily_entries": [],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_date"] == "2026-02-01"
        assert d["end_date"] == "2026-02-28"
        created_period_ids.append(d["overtime_period_id"])

    def test_daily_entry_outside_bounds(self, session, employee_id):
        payload = {
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": "2026-02-04",
            "daily_entries": [{"date": "2026-02-20", "hours_35": 4}],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 400


class TestPeriodCRUD:
    def test_list_periods_sorted(self, session, created_period_ids):
        r = session.get(f"{API}/people-ops/overtime/periods")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        assert len(docs) >= len(created_period_ids)
        # verify sorted by start_date desc
        dates = [d["start_date"] for d in docs]
        assert dates == sorted(dates, reverse=True)

    def test_get_period_detail(self, session, created_period_ids):
        pid = created_period_ids[0]
        r = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert d["overtime_period_id"] == pid
        assert "daily_entries" in d
        assert "totals" in d

    def test_update_recomputes(self, session, employee_id, created_period_ids):
        pid = created_period_ids[0]  # weekly period 2026-02-02..08
        r = session.put(
            f"{API}/people-ops/overtime/periods/{pid}",
            json={"daily_entries": [
                {"date": "2026-02-03", "hours_35": 2},
                {"date": "2026-02-04", "hours_night": 3},
            ]},
        )
        assert r.status_code == 200, r.text
        got = session.get(f"{API}/people-ops/overtime/periods/{pid}").json()
        assert got["totals"]["total_hours"] == 5
        assert got["totals"]["hours_35"] == 2
        assert got["totals"]["hours_night"] == 3
        assert "estimated_amount" in got

    def test_approve(self, session, created_period_ids):
        pid = created_period_ids[1]  # biweekly first half
        r = session.post(f"{API}/people-ops/overtime/periods/{pid}/approve")
        assert r.status_code == 200, r.text
        got = session.get(f"{API}/people-ops/overtime/periods/{pid}").json()
        assert got["status"] == "approved"
        assert got.get("approved_at")
        assert got.get("approved_by")
        # second approval fails
        r2 = session.post(f"{API}/people-ops/overtime/periods/{pid}/approve")
        assert r2.status_code == 404

    def test_cannot_edit_approved(self, session, created_period_ids):
        pid = created_period_ids[1]
        r = session.put(f"{API}/people-ops/overtime/periods/{pid}", json={"daily_entries": []})
        assert r.status_code == 400

    def test_reject(self, session, created_period_ids):
        pid = created_period_ids[2]  # biweekly second half
        r = session.post(f"{API}/people-ops/overtime/periods/{pid}/reject", json={"reason": "not allowed"})
        assert r.status_code == 200
        got = session.get(f"{API}/people-ops/overtime/periods/{pid}").json()
        assert got["status"] == "rejected"
        assert got.get("rejection_reason") == "not allowed"

    def test_delete_pending(self, session, created_period_ids):
        pid = created_period_ids[3]  # monthly still pending
        r = session.delete(f"{API}/people-ops/overtime/periods/{pid}")
        assert r.status_code == 200
        r2 = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        assert r2.status_code == 404


class TestRegressionLegacy:
    def test_legacy_get(self, session):
        r = session.get(f"{API}/people-ops/overtime/requests")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_legacy_post(self, session, employee_id):
        r = session.post(
            f"{API}/people-ops/overtime/requests",
            json={
                "employee_id": employee_id,
                "date": "2026-02-05",
                "hours_35": 2,
                "reason": "regression test",
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("total_hours") == 2 or d.get("hours_35") == 2 or "overtime_id" in d


@pytest.fixture(scope="module", autouse=True)
def cleanup(session, created_period_ids):
    yield
    # best-effort cleanup of remaining created periods
    for pid in created_period_ids:
        try:
            session.delete(f"{API}/people-ops/overtime/periods/{pid}")
        except Exception:
            pass
