"""
Tests for People Ops bug-fix round (iteration 202):
- AFP/ARS/ISR overrides on employee (Monthly, auto-halved for biweekly)
- Pending deductions CRUD
- Pending deductions consumption during payroll creation, revert on payroll deletion
- Org chart enriched with employees / employee_count / position_count
"""
import os
import pytest
import requests

def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v)
_load_env()
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is not set"
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
TEST_EMPLOYEE_ID = "emp_91f4dfa58d68"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Login
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- Employee Override fields ---
class TestEmployeeOverrides:
    def test_set_overrides(self, api_client):
        r = api_client.put(
            f"{BASE_URL}/api/people-ops/employees/{TEST_EMPLOYEE_ID}",
            json={"afp_override": 1800, "ars_override": 1900, "isr_override": 1200},
        )
        assert r.status_code == 200, f"PUT employee failed: {r.status_code} {r.text}"
        # GET
        g = api_client.get(f"{BASE_URL}/api/people-ops/employees/{TEST_EMPLOYEE_ID}")
        assert g.status_code == 200
        emp = g.json()
        assert emp.get("afp_override") == 1800
        assert emp.get("ars_override") == 1900
        assert emp.get("isr_override") == 1200


# --- Pending deductions CRUD ---
class TestPendingDeductions:
    deduction_id = None

    def test_create_pending_deduction(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/people-ops/pending-deductions",
            json={"employee_id": TEST_EMPLOYEE_ID, "amount": 750, "reason": "Test deduction", "notes": "Smoke"},
        )
        assert r.status_code in (200, 201), f"Create pending deduction failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("status") == "pending"
        ded_id = data.get("deduction_id") or data.get("id")
        assert ded_id, f"deduction_id missing in response: {data}"
        TestPendingDeductions.deduction_id = ded_id

    def test_list_pending_for_employee(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/people-ops/pending-deductions",
            params={"employee_id": TEST_EMPLOYEE_ID},
        )
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("deductions") or []
        assert any(
            (i.get("deduction_id") == TestPendingDeductions.deduction_id) or (i.get("id") == TestPendingDeductions.deduction_id)
            for i in items
        ), f"Created deduction not found in list: {items}"


# --- Payroll consuming pending deductions + overrides ---
class TestPayrollWithOverrides:
    period_id = None

    def test_create_payroll_period_with_overrides(self, api_client):
        body = {
            "period_type": "biweekly",
            "payment_kind": "regular",
            "start_date": "2026-03-01",
            "end_date": "2026-03-15",
            "payment_date": "2026-03-15",
            "auto_include_overtime": False,
        }
        r = api_client.post(f"{BASE_URL}/api/people-ops/payroll/periods", json=body)
        assert r.status_code in (200, 201), f"Create payroll period failed: {r.status_code} {r.text}"
        data = r.json()
        period_id = data.get("period_id") or data.get("id") or (data.get("period") or {}).get("id")
        assert period_id, f"period_id missing in response: {data}"
        TestPayrollWithOverrides.period_id = period_id

        # Find entry for test employee
        entries = data.get("entries") or data.get("payroll_entries") or []
        if not entries:
            # fallback fetch
            g = api_client.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
            assert g.status_code == 200
            entries = g.json().get("entries", [])

        emp_entry = next((e for e in entries if e.get("employee_id") == TEST_EMPLOYEE_ID), None)
        assert emp_entry is not None, f"Test employee entry not found among {[e.get('employee_id') for e in entries]}"

        # Assertions on override-driven values (Monthly /2 for biweekly)
        assert abs(float(emp_entry.get("afp_employee") or 0) - 900.0) < 0.5, f"afp_employee expected 900, got {emp_entry.get('afp_employee')}"
        assert abs(float(emp_entry.get("ars_employee") or 0) - 950.0) < 0.5, f"ars_employee expected 950, got {emp_entry.get('ars_employee')}"
        assert abs(float(emp_entry.get("isr") or 0) - 600.0) < 0.5, f"isr expected 600, got {emp_entry.get('isr')}"

        # extra_deductions should include the pending deduction
        extra = emp_entry.get("extra_deductions") or []
        match = [x for x in extra if (x.get("source") == "pending_deduction") and abs(float(x.get("amount") or 0) - 750.0) < 0.5]
        assert match, f"Pending deduction not found in extra_deductions: {extra}"

    def test_pending_deduction_marked_applied(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/people-ops/pending-deductions",
            params={"employee_id": TEST_EMPLOYEE_ID},
        )
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("deductions") or []
        ded = next(
            (i for i in items if (i.get("deduction_id") == TestPendingDeductions.deduction_id) or (i.get("id") == TestPendingDeductions.deduction_id)),
            None,
        )
        assert ded is not None, f"Deduction not found: {items}"
        assert ded.get("status") == "applied", f"Expected applied, got {ded.get('status')}"
        assert ded.get("applied_to_period_id") == TestPayrollWithOverrides.period_id, f"applied_to_period_id mismatch: {ded}"

    def test_delete_period_reverts_deduction(self, api_client):
        period_id = TestPayrollWithOverrides.period_id
        assert period_id
        d = api_client.delete(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        assert d.status_code in (200, 204), f"Delete period failed: {d.status_code} {d.text}"

        # Verify reverted to pending
        r = api_client.get(
            f"{BASE_URL}/api/people-ops/pending-deductions",
            params={"employee_id": TEST_EMPLOYEE_ID},
        )
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("deductions") or []
        ded = next(
            (i for i in items if (i.get("deduction_id") == TestPendingDeductions.deduction_id) or (i.get("id") == TestPendingDeductions.deduction_id)),
            None,
        )
        assert ded is not None
        assert ded.get("status") == "pending", f"Expected reverted to pending, got {ded.get('status')}"


# --- Org Chart enrichment ---
class TestOrgChart:
    def test_org_chart_enriched(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/people-ops/org-chart")
        assert r.status_code == 200, f"org-chart failed: {r.status_code} {r.text}"
        data = r.json()
        depts = data.get("departments") or []
        assert isinstance(depts, list) and len(depts) > 0, f"departments missing/empty: {data}"
        for d in depts:
            assert "employees" in d, f"missing employees in dept {d.get('name')}"
            assert isinstance(d.get("employees"), list)
            assert "employee_count" in d, f"missing employee_count in dept {d.get('name')}"
            assert "position_count" in d, f"missing position_count in dept {d.get('name')}"


# --- Cleanup ---
class TestCleanup:
    def test_zzz_cleanup(self, api_client):
        # Delete pending deduction if still in pending status
        ded_id = TestPendingDeductions.deduction_id
        if ded_id:
            api_client.delete(f"{BASE_URL}/api/people-ops/pending-deductions/{ded_id}")
        # Null overrides
        api_client.put(
            f"{BASE_URL}/api/people-ops/employees/{TEST_EMPLOYEE_ID}",
            json={"afp_override": None, "ars_override": None, "isr_override": None},
        )
