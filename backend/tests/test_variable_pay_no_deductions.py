"""
Regression: Variable pay (incentivos, bonos, comisiones, horas extras) must
NOT apply AFP/ARS/ISR deductions. These TSS contributions are calculated on
the base monthly salary in regular payroll, not on variable pay.

User report (Feb 2026): "porque los incentivos tienen deducciones?"
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
API = f"{BASE_URL.rstrip('/')}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def employee_with_pool(auth_session):
    """Find an employee with incentive_pool_percentage > 0, or skip."""
    r = auth_session.get(f"{API}/people-ops/employees?limit=100", timeout=15)
    if r.status_code != 200:
        pytest.skip("Cannot list employees")
    data = r.json()
    employees = data if isinstance(data, list) else data.get("employees", [])
    for e in employees:
        if (e.get("incentive_pool_percentage") or 0) > 0:
            return e
    pytest.skip("No employee with incentive_pool_percentage configured")


def test_incentive_run_zero_deductions(auth_session, employee_with_pool):
    """Create an incentive run with a pool amount — every entry must have
    afp_employee = ars_employee = isr = total_deductions = 0."""
    s = auth_session
    r = s.post(
        f"{API}/settings/variable-pay-runs",
        json={
            "run_name": "TEST_Incentivo_Sin_Deducciones",
            "pay_type": "incentive",
            "pool_amount": 10000,
            "payment_date": "2026-05-31",
            "period_start": "2026-05-01",
            "period_end": "2026-05-31",
        },
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    run_doc = r.json().get("run") or r.json()
    run_id = run_doc.get("run_id") or run_doc.get("id")
    assert run_id, f"No run_id in response: {r.json()}"

    # Fetch entries
    r = s.get(f"{API}/settings/variable-pay-runs/{run_id}", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    entries = payload.get("entries") or []

    assert len(entries) >= 1, f"Expected at least 1 incentive entry, got {entries}"
    for e in entries:
        assert e.get("afp_employee", 0) == 0, f"AFP must be 0 on incentive, got {e.get('afp_employee')}"
        assert e.get("ars_employee", 0) == 0, f"ARS must be 0 on incentive, got {e.get('ars_employee')}"
        assert e.get("isr", 0) == 0, f"ISR must be 0 on incentive, got {e.get('isr')}"
        assert e.get("total_deductions", 0) == 0, f"Total deductions must be 0, got {e.get('total_deductions')}"
        # Net must equal gross when there are no deductions
        assert round(e.get("net_amount", 0), 2) == round(e.get("gross_amount", 0), 2), (
            f"net ({e.get('net_amount')}) must equal gross ({e.get('gross_amount')}) when no deductions"
        )

    # Cleanup
    try:
        s.delete(f"{API}/settings/variable-pay-runs/{run_id}", timeout=15)
    except Exception:
        pass


def test_variable_pay_entry_update_keeps_zero_deductions(auth_session, employee_with_pool):
    """Editing a variable pay entry must also keep deductions at 0."""
    s = auth_session
    r = s.post(
        f"{API}/settings/variable-pay-runs",
        json={
            "run_name": "TEST_Edit_VP_Entry",
            "pay_type": "incentive",
            "pool_amount": 5000,
            "payment_date": "2026-05-31",
            "period_start": "2026-05-01",
            "period_end": "2026-05-31",
        },
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    run_doc = r.json().get("run") or r.json()
    run_id = run_doc.get("run_id") or run_doc.get("id")
    assert run_id

    r = s.get(f"{API}/settings/variable-pay-runs/{run_id}", timeout=15)
    assert r.status_code == 200
    body = r.json()
    entries = body.get("entries") or []
    if not entries:
        pytest.skip("No entries to edit in this run")
    entry_id = entries[0].get("entry_id") or entries[0].get("id")

    # Bump incentive amount manually
    r = s.put(
        f"{API}/settings/variable-pay-entries/{entry_id}",
        json={"incentive_amount": 7000},
        timeout=15,
    )
    if r.status_code == 404:
        pytest.skip("Per-entry edit endpoint not available")
    assert r.status_code == 200, r.text

    # Re-fetch and assert deductions still zero
    r = s.get(f"{API}/settings/variable-pay-runs/{run_id}", timeout=15)
    refreshed = next(e for e in r.json().get("entries", []) if (e.get("entry_id") or e.get("id")) == entry_id)
    assert refreshed.get("total_deductions", 0) == 0
    assert round(refreshed.get("net_amount", 0), 2) == round(refreshed.get("gross_amount", 0), 2)

    try:
        s.delete(f"{API}/settings/variable-pay-runs/{run_id}", timeout=15)
    except Exception:
        pass
