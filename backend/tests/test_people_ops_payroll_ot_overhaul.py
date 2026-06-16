"""
Backend tests for People Ops payroll & overtime overhaul.

Coverage:
1. PUT /people-ops/employees/{id} - hire_date persistence
2. POST /people-ops/payroll/periods - auto-generated period_name when missing
3. POST /people-ops/payroll/periods - payment_kind='overtime_only' filtering
4. GET  /people-ops/payroll/config - 4 OT multipliers + country defaults
5. POST /people-ops/payroll/config - persist new fields
6. POST /people-ops/overtime/requests - estimated_amount with 4 categories
7. GET  /people-ops/overtime/pending-in-range - aggregation
8. PUT  /people-ops/payroll/entries/{id} - extra_deductions normalization
9. PUT  /people-ops/payroll/entries/{id} - OT separate categories
10. POST /people-ops/payroll/periods auto_include_overtime true/false behavior
"""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def employee_id(headers):
    """Get or create a test employee with a base_salary so OT amounts are calculable."""
    # Try to find an active employee
    r = requests.get(f"{API}/people-ops/employees", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    employees = r.json() if isinstance(r.json(), list) else r.json().get("employees", [])
    active = [e for e in employees if e.get("status") == "active" and (e.get("base_salary") or 0) > 0]
    if active:
        return active[0]["employee_id"]
    # Create one
    payload = {
        "first_name": "TEST_OT",
        "last_name": f"Emp_{uuid.uuid4().hex[:6]}",
        "email": f"test_ot_{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+18095550000",
        "national_id": f"00100{uuid.uuid4().hex[:5]}",
        "hire_date": "2024-01-15",
        "position": "Tester",
        "department": "QA",
        "contract_type": "indefinite",
        "base_salary": 60000.0,
        "payment_frequency": "biweekly",
    }
    r = requests.post(f"{API}/people-ops/employees", json=payload, headers=headers, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()["employee_id"]


# ----------------- 1. EMPLOYEE hire_date -----------------
def test_employee_update_hire_date_persists(headers, employee_id):
    new_date = "2023-06-15"
    r = requests.put(
        f"{API}/people-ops/employees/{employee_id}",
        json={"hire_date": new_date},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    g = requests.get(f"{API}/people-ops/employees/{employee_id}", headers=headers, timeout=30)
    assert g.status_code == 200, g.text
    assert g.json().get("hire_date") == new_date, f"hire_date not persisted: {g.json().get('hire_date')}"


# ----------------- 4. GET payroll/config defaults -----------------
def test_get_payroll_config_returns_4_ot_multipliers(headers):
    r = requests.get(f"{API}/people-ops/payroll/config", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    cfg = r.json()
    for k in ("overtime_rate_35", "overtime_rate_night", "overtime_rate_holiday", "overtime_rate_100"):
        assert k in cfg, f"Missing {k} in config"
        assert isinstance(cfg[k], (int, float)) and cfg[k] > 0
    assert "country_code" in cfg
    # hours_per_month key (overtime_hours_per_month per spec)
    assert "overtime_hours_per_month" in cfg
    assert cfg["overtime_hours_per_month"] > 0


# ----------------- 5. POST payroll/config persists -----------------
def test_post_payroll_config_persists_new_fields(headers):
    # Read existing to be a good citizen
    cur = requests.get(f"{API}/people-ops/payroll/config", headers=headers, timeout=30).json()
    payload = {
        "payment_frequency": cur.get("payment_frequency", "biweekly"),
        "payment_day_1": cur.get("payment_day_1", 15),
        "payment_day_2": cur.get("payment_day_2", 30),
        "afp_employee_rate": cur.get("afp_employee_rate", 2.87),
        "afp_employer_rate": cur.get("afp_employer_rate", 7.10),
        "ars_employee_rate": cur.get("ars_employee_rate", 3.04),
        "ars_employer_rate": cur.get("ars_employer_rate", 7.09),
        "srl_rate": cur.get("srl_rate", 1.20),
        "infotep_rate": cur.get("infotep_rate", 1.0),
        "isr_enabled": cur.get("isr_enabled", True),
        "overtime_rate_35": 1.35,
        "overtime_rate_night": 1.15,
        "overtime_rate_holiday": 2.0,
        "overtime_rate_100": 2.0,
        "overtime_hours_per_month": 190.0,
        "country_code": "DO",  # Keep DO to avoid disturbing other tests
        "include_regalia": cur.get("include_regalia", True),
        "regalia_months": cur.get("regalia_months", 12),
    }
    r = requests.post(f"{API}/people-ops/payroll/config", json=payload, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    g = requests.get(f"{API}/people-ops/payroll/config", headers=headers, timeout=30).json()
    assert g.get("country_code") == "DO"
    assert g.get("overtime_rate_night") == 1.15
    assert g.get("overtime_rate_holiday") == 2.0
    assert g.get("overtime_hours_per_month") == 190.0


# ----------------- 6. POST overtime/requests with 4 categories -----------------
@pytest.fixture(scope="module")
def approved_ot_id(headers, employee_id):
    """Create an OT request with mixed hours then approve it (returns overtime_id)."""
    ot_date = (date.today() + timedelta(days=1)).isoformat()  # future date
    payload = {
        "employee_id": employee_id,
        "date": ot_date,
        "hours_35": 2.0,
        "hours_night": 1.0,
        "hours_holiday": 1.0,
        "hours_100": 1.0,
        "reason": "TEST_OT mixed categories",
    }
    r = requests.post(f"{API}/people-ops/overtime/requests", json=payload, headers=headers, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert "overtime_id" in body
    assert body.get("estimated_amount", 0) > 0, f"estimated_amount should be >0 for mixed hours: {body}"
    oid = body["overtime_id"]
    # approve
    ap = requests.post(f"{API}/people-ops/overtime/requests/{oid}/approve", headers=headers, timeout=30)
    assert ap.status_code == 200, ap.text
    return oid, ot_date


def test_overtime_request_estimated_amount(approved_ot_id):
    oid, _ = approved_ot_id
    assert oid


# ----------------- 7. GET pending-in-range -----------------
def test_get_pending_overtime_in_range(headers, approved_ot_id, employee_id):
    _, ot_date = approved_ot_id
    r = requests.get(
        f"{API}/people-ops/overtime/pending-in-range",
        params={"start_date": ot_date, "end_date": ot_date},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "summary_by_employee" in data
    assert "total_estimated_amount" in data
    assert data["total_ot_count"] >= 1
    # find our employee in summary
    emp_summary = next((s for s in data["summary_by_employee"] if s["employee_id"] == employee_id), None)
    assert emp_summary is not None, f"Employee {employee_id} not in summary: {data}"
    assert emp_summary["hours_35"] >= 2.0
    assert emp_summary["hours_night"] >= 1.0
    assert emp_summary["hours_holiday"] >= 1.0
    assert emp_summary["hours_100"] >= 1.0


# ----------------- 2. POST payroll/periods auto period_name -----------------
def _period_payload(start, end, pay, period_name=None, payment_kind="regular", auto_include_overtime=True):
    p = {
        "start_date": start,
        "end_date": end,
        "payment_date": pay,
        "period_type": "biweekly",
        "payment_kind": payment_kind,
        "auto_include_overtime": auto_include_overtime,
    }
    if period_name is not None:
        p["period_name"] = period_name
    return p


def test_create_payroll_period_auto_name(headers):
    # Use a date range NOT containing approved OT
    payload = _period_payload("2026-04-01", "2026-04-15", "2026-04-15")
    r = requests.post(f"{API}/people-ops/payroll/periods", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("period_name"), f"period_name missing: {body}"
    assert "April" in body["period_name"] or "april" in body["period_name"].lower()
    assert "Quincena" in body["period_name"]
    assert body.get("payment_kind") == "regular"
    # cleanup
    _delete_period(headers, body["period_id"])


def _delete_period(headers, period_id):
    try:
        requests.delete(f"{API}/people-ops/payroll/periods/{period_id}", headers=headers, timeout=20)
    except Exception:
        pass


# ----------------- 3. payment_kind='overtime_only' filtering -----------------
def test_overtime_only_period_filters_employees(headers, approved_ot_id, employee_id):
    _, ot_date = approved_ot_id
    # narrow range to capture only the approved OT
    payload = _period_payload(ot_date, ot_date, ot_date, payment_kind="overtime_only")
    r = requests.post(f"{API}/people-ops/payroll/periods", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    period = r.json()
    pid = period["period_id"]
    # name should reflect OT
    assert period["payment_kind"] == "overtime_only"
    # get period entries
    g = requests.get(f"{API}/people-ops/payroll/periods/{pid}", headers=headers, timeout=30).json()
    entries = g.get("entries", [])
    assert len(entries) >= 1, "Expected at least 1 entry for OT-only period"
    # ensure no entry includes someone without OT in range
    emp_ids = {e["employee_id"] for e in entries}
    assert employee_id in emp_ids
    # AFP/ARS/ISR must be zero
    for e in entries:
        assert e.get("afp_employee", 0) == 0
        assert e.get("ars_employee", 0) == 0
        assert e.get("isr", 0) == 0
        assert e.get("base_salary", 0) == 0
    _delete_period(headers, pid)


# ----------------- 10. auto_include_overtime=false leaves OT untouched -----------------
def test_period_without_auto_include_does_not_consume_ot(headers, employee_id):
    """Create approved OT, then create regular period with auto_include_overtime=False -> OT must stay 'approved'."""
    ot_date = (date.today() + timedelta(days=3)).isoformat()
    pload = {
        "employee_id": employee_id,
        "date": ot_date,
        "hours_35": 1.0,
        "reason": "TEST no_auto_include",
    }
    r = requests.post(f"{API}/people-ops/overtime/requests", json=pload, headers=headers, timeout=30)
    assert r.status_code in (200, 201), r.text
    oid = r.json()["overtime_id"]
    ap = requests.post(f"{API}/people-ops/overtime/requests/{oid}/approve", headers=headers, timeout=30)
    assert ap.status_code == 200, ap.text

    payload = _period_payload(ot_date, ot_date, ot_date, auto_include_overtime=False)
    r = requests.post(f"{API}/people-ops/payroll/periods", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    pid = r.json()["period_id"]

    # Check pending-in-range still shows the OT (status approved, no period link)
    pr = requests.get(
        f"{API}/people-ops/overtime/pending-in-range",
        params={"start_date": ot_date, "end_date": ot_date},
        headers=headers,
        timeout=30,
    ).json()
    found = next((s for s in pr["summary_by_employee"] if s["employee_id"] == employee_id), None)
    assert found is not None, "OT should remain pending/approved without payroll link"
    _delete_period(headers, pid)


# ----------------- 8 & 9. PUT payroll/entries -----------------
def test_update_payroll_entry_extra_deductions_and_ot(headers):
    # Create a regular period (no OT) and edit an entry
    payload = _period_payload("2026-05-01", "2026-05-15", "2026-05-15", auto_include_overtime=False)
    r = requests.post(f"{API}/people-ops/payroll/periods", json=payload, headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    pid = r.json()["period_id"]
    g = requests.get(f"{API}/people-ops/payroll/periods/{pid}", headers=headers, timeout=30).json()
    entries = g.get("entries", [])
    if not entries:
        _delete_period(headers, pid)
        pytest.skip("No active employees to test entry update")
    entry = entries[0]
    eid = entry["entry_id"]
    original_net = entry["net_salary"]

    update = {
        "overtime_hours_35": 2.0,
        "overtime_hours_night": 1.0,
        "overtime_hours_holiday": 0.5,
        "overtime_hours_100": 0.5,
        "extra_deductions": [
            {"amount": 500.0, "reason": "Adelanto"},
            {"amount": 200.0, "reason": "Daño"},
            {"amount": 0, "reason": "Should be discarded"},      # amount <=0 discarded
            {"amount": -50, "reason": "Negative discarded"},
        ],
    }
    pu = requests.put(f"{API}/people-ops/payroll/entries/{eid}", json=update, headers=headers, timeout=30)
    assert pu.status_code == 200, pu.text
    # reload
    g2 = requests.get(f"{API}/people-ops/payroll/periods/{pid}", headers=headers, timeout=30).json()
    updated = next(e for e in g2["entries"] if e["entry_id"] == eid)
    assert updated["overtime_hours_35"] == 2.0
    assert updated["overtime_hours_night"] == 1.0
    assert updated["overtime_amount_35"] > 0
    assert updated["overtime_amount_night"] > 0
    ed = updated.get("extra_deductions", [])
    assert len(ed) == 2, f"Expected 2 valid extra_deductions, got {ed}"
    assert all(d["amount"] > 0 for d in ed)
    assert all("id" in d and "reason" in d for d in ed)
    # 500 + 200 = 700 added to deductions
    extra_total = sum(d["amount"] for d in ed)
    assert abs(extra_total - 700.0) < 0.01
    # net should differ from original (with OT minus extra_deductions)
    assert updated["net_salary"] != original_net
    _delete_period(headers, pid)
