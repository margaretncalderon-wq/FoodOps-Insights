"""
Iteration 204 — Bug fixes regression tests:
 - base_salary_basis decoupling from payment_frequency
 - afp_override/ars_override applied per period_type with biweekly halving
 - Org Chart positions endpoint sanity (for 'Sin departamento' orphan bucket)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
EMP_ID = "emp_91f4dfa58d68"  # María González per iteration_203


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Bug #1: base_salary_basis persistence ----------------
def test_employee_update_persists_basis_and_overrides(H):
    body = {
        "base_salary": 44000,
        "payment_frequency": "biweekly",
        "base_salary_basis": "monthly",
        "afp_override": 2000,
        "ars_override": 1800,
    }
    r = requests.put(f"{BASE_URL}/api/people-ops/employees/{EMP_ID}", json=body, headers=H)
    assert r.status_code == 200, r.text

    g = requests.get(f"{BASE_URL}/api/people-ops/employees/{EMP_ID}", headers=H)
    assert g.status_code == 200
    emp = g.json()
    assert emp["base_salary"] == 44000
    assert emp["payment_frequency"] == "biweekly"
    assert emp["base_salary_basis"] == "monthly"
    assert emp["afp_override"] == 2000
    assert emp["ars_override"] == 1800


# ---------------- Bug #4: biweekly period halves monthly basis ----------------
def _create_period(H, period_type, payment_kind="regular"):
    payload = {
        "period_type": period_type,
        "payment_kind": payment_kind,
        "start_date": "2026-01-01",
        "end_date": "2026-01-15" if period_type == "biweekly" else "2026-01-31",
        "payment_date": "2026-01-16" if period_type == "biweekly" else "2026-02-01",
    }
    r = requests.post(f"{BASE_URL}/api/people-ops/payroll/periods", json=payload, headers=H)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _find_entry(period_dict, emp_id):
    entries = period_dict.get("entries") or period_dict.get("employee_entries") or []
    for e in entries:
        if e.get("employee_id") == emp_id:
            return e
    return None


def _delete_period(H, period_id):
    requests.delete(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}", headers=H)


def test_biweekly_period_halves_monthly_basis_with_overrides(H):
    p = _create_period(H, "biweekly")
    pid = p.get("period_id") or p.get("id")
    try:
        g = requests.get(f"{BASE_URL}/api/people-ops/payroll/periods/{pid}", headers=H)
        assert g.status_code == 200
        period = g.json()
        entry = _find_entry(period, EMP_ID)
        assert entry is not None, f"Employee {EMP_ID} not in period entries"
        # base_salary on the entry could be named period_salary or base_salary
        period_salary = entry.get("period_salary", entry.get("base_salary"))
        assert abs(period_salary - 22000) < 0.5, f"Expected 22000, got {period_salary}"
        assert abs(entry["afp_employee"] - 1000) < 0.5, f"Expected AFP 1000, got {entry['afp_employee']}"
        assert abs(entry["ars_employee"] - 900) < 0.5, f"Expected ARS 900, got {entry['ars_employee']}"
    finally:
        _delete_period(H, pid)


def test_monthly_period_full_amounts(H):
    p = _create_period(H, "monthly")
    pid = p.get("period_id") or p.get("id")
    try:
        g = requests.get(f"{BASE_URL}/api/people-ops/payroll/periods/{pid}", headers=H)
        assert g.status_code == 200
        period = g.json()
        entry = _find_entry(period, EMP_ID)
        assert entry is not None
        period_salary = entry.get("period_salary", entry.get("base_salary"))
        assert abs(period_salary - 44000) < 0.5, f"Expected 44000, got {period_salary}"
        assert abs(entry["afp_employee"] - 2000) < 0.5
        assert abs(entry["ars_employee"] - 1800) < 0.5
    finally:
        _delete_period(H, pid)


def test_biweekly_basis_not_halved(H):
    """When basis='biweekly' the user explicitly says base_salary is already a biweekly amount."""
    # Find ANY other active employee
    el = requests.get(f"{BASE_URL}/api/people-ops/employees", headers=H).json()
    others = [e for e in el if e.get("employee_id") != EMP_ID and e.get("status") in (None, "active")]
    if not others:
        pytest.skip("No other employee available")
    other_id = others[0]["employee_id"]

    # Save originals
    orig = requests.get(f"{BASE_URL}/api/people-ops/employees/{other_id}", headers=H).json()
    snap = {k: orig.get(k) for k in ("base_salary", "payment_frequency", "base_salary_basis")}

    try:
        r = requests.put(
            f"{BASE_URL}/api/people-ops/employees/{other_id}",
            json={"base_salary": 22000, "payment_frequency": "biweekly", "base_salary_basis": "biweekly"},
            headers=H,
        )
        assert r.status_code == 200

        p = _create_period(H, "biweekly")
        pid = p.get("period_id") or p.get("id")
        try:
            g = requests.get(f"{BASE_URL}/api/people-ops/payroll/periods/{pid}", headers=H).json()
            entry = _find_entry(g, other_id)
            assert entry is not None
            period_salary = entry.get("period_salary", entry.get("base_salary"))
            assert abs(period_salary - 22000) < 0.5, f"Biweekly basis biweekly period should be 22000, got {period_salary}"
        finally:
            _delete_period(H, pid)
    finally:
        requests.put(f"{BASE_URL}/api/people-ops/employees/{other_id}", json=snap, headers=H)


# ---------------- Bug #4: projection uses new basis logic ----------------
def test_projection_biweekly_halves_for_monthly_basis(H):
    r = requests.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type=biweekly", headers=H)
    assert r.status_code == 200, r.text
    data = r.json()
    breakdown = data.get("employee_breakdown") or data.get("employees") or []
    me = next((e for e in breakdown if e.get("employee_id") == EMP_ID), None)
    assert me is not None, f"Employee {EMP_ID} not in projection breakdown"
    period_salary = me.get("period_salary", me.get("base_salary"))
    assert abs(period_salary - 22000) < 0.5, f"Expected projection period_salary=22000, got {period_salary}"


# ---------------- Org chart regression ----------------
def test_org_chart_endpoint(H):
    r = requests.get(f"{BASE_URL}/api/people-ops/org-chart", headers=H)
    assert r.status_code == 200
    body = r.json()
    # Basic shape check
    assert isinstance(body, (dict, list))


# ---------------- Cleanup: restore María ----------------
def test_zz_restore_employee(H):
    body = {
        "base_salary": 75000,
        "payment_frequency": "monthly",
        "base_salary_basis": "monthly",
        "afp_override": 0,
        "ars_override": 0,
    }
    r = requests.put(f"{BASE_URL}/api/people-ops/employees/{EMP_ID}", json=body, headers=H)
    assert r.status_code == 200
    g = requests.get(f"{BASE_URL}/api/people-ops/employees/{EMP_ID}", headers=H).json()
    assert g["base_salary"] == 75000
    assert g["payment_frequency"] == "monthly"
    assert g["base_salary_basis"] == "monthly"
