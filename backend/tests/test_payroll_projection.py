"""Tests for GET /api/people-ops/payroll/projection (Next Payroll Projection widget).

Covers:
- biweekly + monthly response shape
- biweekly halving for monthly-paid employees
- override halving for biweekly type
- pending_deductions reflected in totals + top_5
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
TARGET_EMP = "emp_91f4dfa58d68"  # Maria (per request)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _proj(client, period):
    r = client.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type={period}")
    assert r.status_code == 200, f"{period} -> {r.status_code} {r.text[:300]}"
    return r.json()


# --- shape ---
def test_biweekly_shape(client):
    body = _proj(client, "biweekly")
    assert body["period_type"] == "biweekly"
    for key in ("active_employees", "totals", "pending_deductions",
                "pending_overtime", "loans", "overrides_in_use", "employee_breakdown"):
        assert key in body, f"missing top-level key: {key}"

    t = body["totals"]
    for key in ("base_salary_period", "pending_overtime_amount", "estimated_gross",
                "afp", "ars", "isr", "legal_deductions", "loan_deductions",
                "pending_deductions", "total_deductions", "estimated_net"):
        assert key in t, f"missing totals.{key}"

    pd = body["pending_deductions"]
    for k in ("count", "total_amount", "by_employee_count", "top_5"):
        assert k in pd
    assert isinstance(pd["top_5"], list)

    ot = body["pending_overtime"]
    for k in ("count", "total_hours", "total_amount"):
        assert k in ot

    ln = body["loans"]
    for k in ("count", "next_installment_total", "outstanding_balance"):
        assert k in ln

    assert isinstance(body["employee_breakdown"], list)
    assert body["active_employees"] >= 0


def test_monthly_shape_and_larger_gross(client):
    bw = _proj(client, "biweekly")
    mo = _proj(client, "monthly")
    assert mo["period_type"] == "monthly"
    # Monthly base salary period should be >= biweekly (for monthly-paid employees, ~2x)
    assert mo["totals"]["base_salary_period"] >= bw["totals"]["base_salary_period"], \
        f"monthly base {mo['totals']['base_salary_period']} should be >= biweekly {bw['totals']['base_salary_period']}"


# --- biweekly halving for monthly-paid employees ---
def test_biweekly_halves_monthly_employees(client):
    body = _proj(client, "biweekly")
    # Find target employee (Maria)
    target = next((r for r in body["employee_breakdown"] if r["employee_id"] == TARGET_EMP), None)
    if not target:
        pytest.skip(f"Target employee {TARGET_EMP} not in breakdown")
    # Get raw employee to know base_salary + frequency
    emp_r = client.get(f"{BASE_URL}/api/people-ops/employees/{TARGET_EMP}")
    assert emp_r.status_code == 200, emp_r.text[:200]
    emp = emp_r.json()
    base = float(emp.get("base_salary") or 0)
    freq = emp.get("payment_frequency", "monthly")
    if freq == "monthly" and base > 0:
        assert abs(target["period_salary"] - base / 2) < 0.5, \
            f"period_salary {target['period_salary']} should be {base/2}"


# --- override halving for biweekly ---
def test_afp_override_halves_for_biweekly(client):
    # set override = 2400
    r = client.put(f"{BASE_URL}/api/people-ops/employees/{TARGET_EMP}",
                   json={"afp_override": 2400})
    assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:200]}"

    try:
        body_bw = _proj(client, "biweekly")
        row = next((x for x in body_bw["employee_breakdown"] if x["employee_id"] == TARGET_EMP), None)
        assert row is not None
        assert abs(row["afp"] - 1200) < 0.5, f"biweekly afp should be 1200, got {row['afp']}"
        assert row["has_override"] is True

        body_mo = _proj(client, "monthly")
        row_m = next((x for x in body_mo["employee_breakdown"] if x["employee_id"] == TARGET_EMP), None)
        assert row_m is not None
        assert abs(row_m["afp"] - 2400) < 0.5, f"monthly afp should be 2400, got {row_m['afp']}"
    finally:
        # Cleanup: clear override (use 0 per known behavior; null is silently ignored)
        client.put(f"{BASE_URL}/api/people-ops/employees/{TARGET_EMP}",
                   json={"afp_override": 0})


# --- pending deductions in projection ---
def test_pending_deductions_in_totals_and_top5(client):
    # Create a pending deduction for the target employee
    create = client.post(f"{BASE_URL}/api/people-ops/pending-deductions",
                        json={"employee_id": TARGET_EMP, "amount": 555,
                              "reason": "TEST_PROJ_DED", "notes": "auto test"})
    assert create.status_code in (200, 201), create.text[:200]
    ded = create.json()
    ded_id = ded.get("deduction_id") or ded.get("id")

    try:
        body = _proj(client, "biweekly")
        assert body["totals"]["pending_deductions"] >= 555
        # top_5 should contain our created deduction (it is the most recent)
        top5 = body["pending_deductions"]["top_5"]
        match = next((d for d in top5 if d.get("deduction_id") == ded_id), None)
        assert match is not None, f"created deduction not in top_5: {top5}"
        assert match.get("employee_name")
        assert match.get("reason") == "TEST_PROJ_DED"
        assert abs(float(match.get("amount", 0)) - 555) < 0.01
    finally:
        if ded_id:
            client.delete(f"{BASE_URL}/api/people-ops/pending-deductions/{ded_id}")
