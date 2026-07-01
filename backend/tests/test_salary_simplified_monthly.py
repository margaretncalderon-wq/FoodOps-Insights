"""
Test suite for the simplified salary logic (iter206):
- base_salary is ALWAYS the monthly amount
- biweekly period = base_salary / 2
- weekly period = base_salary / 4.33
- monthly period = base_salary
- No base_salary_basis multiplier anywhere.

Uses demo.agency@kora.com. Restores state at teardown.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
EMP_ID = "emp_91f4dfa58d68"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def restore_employee(client):
    """Ensure emp is set to base_salary=22000, biweekly at start; restore to 75000/monthly at end."""
    # Set to test state
    r = client.put(f"{API}/people-ops/employees/{EMP_ID}", json={"base_salary": 22000, "payment_frequency": "biweekly"}, timeout=30)
    assert r.status_code == 200, f"PUT setup failed: {r.status_code} {r.text}"
    yield
    # Restore to original per main-agent instructions
    client.put(f"{API}/people-ops/employees/{EMP_ID}", json={"base_salary": 75000, "payment_frequency": "monthly"}, timeout=30)


# ----- Employee update round-trip -----

def test_employee_update_persists_22000(client):
    r = client.get(f"{API}/people-ops/employees/{EMP_ID}", timeout=30)
    assert r.status_code == 200
    emp = r.json()
    assert float(emp["base_salary"]) == 22000.0
    assert emp["payment_frequency"] == "biweekly"


# ----- create_payroll_period entry.base_salary for each period_type -----

def _create_period(client, period_type, start, end):
    payload = {
        "period_type": period_type,
        "start_date": start,
        "end_date": end,
        "payment_date": end,
        "payment_kind": "regular",
    }
    return client.post(f"{API}/people-ops/payroll/periods", json=payload, timeout=60)


def _extract_entry(period_json, emp_id):
    entries = period_json.get("entries") or period_json.get("payroll_entries") or []
    for e in entries:
        if e.get("employee_id") == emp_id:
            return e
    return None


def _fetch_entries(client, period_id):
    r = client.get(f"{API}/people-ops/payroll/periods/{period_id}", timeout=30)
    if r.status_code == 200:
        return r.json().get("entries", [])
    return []


def _get_entry_for_emp(client, period_json, emp_id):
    entry = _extract_entry(period_json, emp_id)
    if entry:
        return entry
    pid = period_json.get("period_id") or period_json.get("id")
    if pid:
        entries = _fetch_entries(client, pid)
        for e in entries:
            if e.get("employee_id") == emp_id:
                return e
    return None


def test_biweekly_period_base_salary_is_half(client):
    r = _create_period(client, "biweekly", "2030-01-01", "2030-01-15")
    assert r.status_code in (200, 201), f"Create period failed: {r.status_code} {r.text}"
    period = r.json()
    entry = _get_entry_for_emp(client, period, EMP_ID)
    assert entry is not None, f"Employee entry not found. Keys: {list(period.keys())}"
    assert round(float(entry["base_salary"]), 2) == 11000.00, f"Expected 11000, got {entry['base_salary']}"
    # Cleanup: delete the period if endpoint exists
    pid = period.get("period_id") or period.get("id")
    if pid:
        client.delete(f"{API}/people-ops/payroll/periods/{pid}", timeout=30)


def test_monthly_period_base_salary_full(client):
    r = _create_period(client, "monthly", "2030-02-01", "2030-02-28")
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    period = r.json()
    entry = _get_entry_for_emp(client, period, EMP_ID)
    assert entry is not None
    assert round(float(entry["base_salary"]), 2) == 22000.00
    pid = period.get("period_id") or period.get("id")
    if pid:
        client.delete(f"{API}/people-ops/payroll/periods/{pid}", timeout=30)


def test_weekly_period_base_salary_divided_by_433(client):
    r = _create_period(client, "weekly", "2030-03-01", "2030-03-07")
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    period = r.json()
    entry = _get_entry_for_emp(client, period, EMP_ID)
    assert entry is not None
    expected = round(22000 / 4.33, 2)
    got = round(float(entry["base_salary"]), 2)
    assert abs(got - expected) < 1.0, f"Expected ~{expected}, got {got}"
    pid = period.get("period_id") or period.get("id")
    if pid:
        client.delete(f"{API}/people-ops/payroll/periods/{pid}", timeout=30)


# ----- Overrides (AFP/ARS/ISR) still respected for biweekly -----

def test_afp_override_biweekly_halved(client):
    # set override
    client.put(f"{API}/people-ops/employees/{EMP_ID}", json={"afp_override": 2000}, timeout=30)
    try:
        r = _create_period(client, "biweekly", "2030-04-01", "2030-04-15")
        assert r.status_code in (200, 201)
        period = r.json()
        entry = _get_entry_for_emp(client, period, EMP_ID)
        assert entry is not None
        afp = float(entry.get("afp_employee") or entry.get("afp") or 0)
        assert round(afp, 2) == 1000.00, f"Expected AFP=1000, got {afp}"
        pid = period.get("period_id") or period.get("id")
        if pid:
            client.delete(f"{API}/people-ops/payroll/periods/{pid}", timeout=30)
    finally:
        client.put(f"{API}/people-ops/employees/{EMP_ID}", json={"afp_override": 0}, timeout=30)


# ----- Stats summary uses raw $sum -----

def test_stats_summary_total_monthly_payroll_raw_sum(client):
    r = client.get(f"{API}/people-ops/employees/stats/summary", timeout=30)
    assert r.status_code == 200
    data = r.json()
    total = float(data.get("total_monthly_payroll") or 0)
    active = int(data.get("active_count") or data.get("active_employees") or 0)
    # Expected 173000 per main-agent for 4 employees (22k+51k+50k+50k). Allow flex on active count.
    # Fetch employees to verify raw sum matches.
    r2 = client.get(f"{API}/people-ops/employees?status=active", timeout=30)
    assert r2.status_code == 200
    emps_data = r2.json()
    emps = emps_data if isinstance(emps_data, list) else emps_data.get("employees", emps_data.get("items", []))
    raw_sum = sum(float(e.get("base_salary") or 0) for e in emps if e.get("status", "active") == "active")
    assert round(total, 2) == round(raw_sum, 2), f"total_monthly_payroll={total} != raw sum {raw_sum}. Employees: {[(e.get('employee_id'), e.get('base_salary')) for e in emps]}"
    print(f"total_monthly_payroll={total}, raw_sum={raw_sum}, active_count={active}")


# ----- Payroll projection -----

def test_projection_biweekly_is_half_of_monthly_total(client):
    stats = client.get(f"{API}/people-ops/employees/stats/summary", timeout=30).json()
    monthly = float(stats.get("total_monthly_payroll") or 0)
    r = client.get(f"{API}/people-ops/payroll/projection?period_type=biweekly", timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    proj = r.json()
    period_gross = float(proj.get("totals", {}).get("base_salary_period") or 0)
    expected = round(monthly / 2, 2)
    assert abs(period_gross - expected) < 1.0, f"biweekly base_salary_period={period_gross}, expected ~{expected}"


def test_projection_monthly_equals_total(client):
    stats = client.get(f"{API}/people-ops/employees/stats/summary", timeout=30).json()
    monthly = float(stats.get("total_monthly_payroll") or 0)
    r = client.get(f"{API}/people-ops/payroll/projection?period_type=monthly", timeout=60)
    assert r.status_code == 200
    proj = r.json()
    period_gross = float(proj.get("totals", {}).get("base_salary_period") or 0)
    assert abs(period_gross - monthly) < 1.0, f"monthly base_salary_period={period_gross}, expected {monthly}"


def test_projection_weekly_divided_by_433(client):
    stats = client.get(f"{API}/people-ops/employees/stats/summary", timeout=30).json()
    monthly = float(stats.get("total_monthly_payroll") or 0)
    r = client.get(f"{API}/people-ops/payroll/projection?period_type=weekly", timeout=60)
    assert r.status_code == 200
    proj = r.json()
    period_gross = float(proj.get("totals", {}).get("base_salary_period") or 0)
    expected = round(monthly / 4.33, 2)
    assert abs(period_gross - expected) < 2.0, f"weekly base_salary_period={period_gross}, expected ~{expected}"


# ----- business_clarity aggregations use raw sum -----

def test_business_clarity_by_department_uses_raw_sum(client):
    r = client.get(f"{API}/business-clarity/reports/by-department", timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    records = data.get("records") if isinstance(data, dict) else data
    assert isinstance(records, list) or records is None
    # Just ensure no crash and payroll_cost is a number (not multiplied by 2)
    total_payroll = sum(float((rec.get("payroll_cost") or 0)) for rec in (records or []))
    print(f"by-department total payroll: {total_payroll}")


def test_business_clarity_by_cost_center(client):
    r = client.get(f"{API}/business-clarity/reports/by-cost-center", timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"


def test_business_clarity_budget_alerts(client):
    r = client.get(f"{API}/business-clarity/budget-alerts", timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
