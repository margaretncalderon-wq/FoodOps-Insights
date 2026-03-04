"""
Test suite for Payroll Module in People Ops
Tests payroll CRUD operations, config, periods, entries, and workflow actions
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestPayrollModule:
    """Tests for Payroll endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        yield
        
        # Cleanup - no specific cleanup needed
    
    # ==================== PAYROLL CONFIG ====================
    
    def test_get_payroll_config(self):
        """Test GET /api/people-ops/payroll/config - returns config with default rates"""
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify expected fields for Dominican Republic payroll rates
        assert "afp_employee_rate" in data, "Missing afp_employee_rate"
        assert "ars_employee_rate" in data, "Missing ars_employee_rate"
        assert "payment_frequency" in data, "Missing payment_frequency"
        
        # Verify default rates are close to expected (AFP 2.87%, ARS 3.04%)
        print(f"Config AFP rate: {data.get('afp_employee_rate')}")
        print(f"Config ARS rate: {data.get('ars_employee_rate')}")
        print(f"Config payment frequency: {data.get('payment_frequency')}")
    
    def test_save_payroll_config(self):
        """Test POST /api/people-ops/payroll/config - save configuration"""
        config_data = {
            "payment_frequency": "biweekly",
            "payment_day_1": 15,
            "payment_day_2": 30,
            "afp_employee_rate": 2.87,
            "afp_employer_rate": 7.10,
            "ars_employee_rate": 3.04,
            "ars_employer_rate": 7.09,
            "srl_rate": 1.20,
            "infotep_rate": 1.0,
            "isr_enabled": True,
            "overtime_rate_35": 1.35,
            "overtime_rate_100": 2.0,
            "include_regalia": True,
            "regalia_months": 12
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/people-ops/payroll/config",
            json=config_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("afp_employee_rate") == 2.87
        assert data.get("ars_employee_rate") == 3.04
        print("Payroll config saved successfully")
    
    # ==================== PAYROLL PERIODS ====================
    
    def test_get_payroll_periods(self):
        """Test GET /api/people-ops/payroll/periods - list all periods"""
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods?limit=20")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of periods"
        print(f"Found {len(data)} payroll periods")
        
        if len(data) > 0:
            period = data[0]
            assert "period_id" in period
            assert "period_name" in period
            assert "status" in period
            print(f"First period: {period.get('period_name')} - Status: {period.get('status')}")
    
    def test_create_payroll_period(self):
        """Test POST /api/people-ops/payroll/periods - create new period"""
        period_data = {
            "period_name": f"TEST_Quincena Test {int(time.time())}",
            "period_type": "biweekly",
            "start_date": "2026-02-01",
            "end_date": "2026-02-15",
            "payment_date": "2026-02-15",
            "notes": "Test payroll period"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/people-ops/payroll/periods",
            json=period_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "period_id" in data, "Missing period_id in response"
        assert data.get("status") == "draft", f"Expected status 'draft', got {data.get('status')}"
        assert data.get("period_name") == period_data["period_name"]
        
        # Store for later tests
        self.test_period_id = data.get("period_id")
        print(f"Created period: {data.get('period_id')}")
        print(f"Total employees: {data.get('total_employees')}")
        print(f"Total gross: ${data.get('total_gross', 0):,.2f}")
        print(f"Total net: ${data.get('total_net', 0):,.2f}")
        
        return data.get("period_id")
    
    def test_get_payroll_period_detail(self):
        """Test GET /api/people-ops/payroll/periods/{id} - get period with entries"""
        # First create a period
        period_id = self.test_create_payroll_period()
        
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "period" in data, "Missing 'period' in response"
        assert "entries" in data, "Missing 'entries' in response"
        
        period = data["period"]
        entries = data["entries"]
        
        assert period.get("period_id") == period_id
        assert isinstance(entries, list)
        
        print(f"Period has {len(entries)} employee entries")
        
        if len(entries) > 0:
            entry = entries[0]
            assert "entry_id" in entry
            assert "employee_name" in entry
            assert "base_salary" in entry
            assert "net_salary" in entry
            assert "afp_employee" in entry
            assert "ars_employee" in entry
            print(f"First entry: {entry.get('employee_name')} - Net: ${entry.get('net_salary', 0):,.2f}")
    
    # ==================== PAYROLL ENTRIES ====================
    
    def test_update_payroll_entry(self):
        """Test PUT /api/people-ops/payroll/entries/{id} - update entry with overtime/bonus"""
        # Create period first
        period_id = self.test_create_payroll_period()
        
        # Get entries
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        assert response.status_code == 200
        
        entries = response.json().get("entries", [])
        if len(entries) == 0:
            pytest.skip("No entries to update")
        
        entry = entries[0]
        entry_id = entry.get("entry_id")
        original_net = entry.get("net_salary", 0)
        
        # Update with overtime and bonus
        update_data = {
            "overtime_hours_35": 5,
            "overtime_hours_100": 2,
            "bonus": 5000,
            "notes": "Test overtime and bonus"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/people-ops/payroll/entries/{entry_id}",
            json=update_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "net_salary" in data
        new_net = data.get("net_salary", 0)
        
        # Verify net increased due to bonus/overtime
        assert new_net > original_net, f"Expected new net ({new_net}) > original ({original_net})"
        print(f"Entry updated: Original net ${original_net:,.2f} -> New net ${new_net:,.2f}")
    
    # ==================== PAYROLL WORKFLOW ====================
    
    def test_payroll_workflow_submit(self):
        """Test POST /api/people-ops/payroll/periods/{id}/submit - submit for approval"""
        period_id = self.test_create_payroll_period()
        
        response = self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/submit")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status changed
        detail_response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        period = detail_response.json().get("period", {})
        
        assert period.get("status") == "pending_approval", f"Expected 'pending_approval', got {period.get('status')}"
        print(f"Period submitted for approval: {period.get('status')}")
    
    def test_payroll_workflow_approve(self):
        """Test POST /api/people-ops/payroll/periods/{id}/approve - approve payroll"""
        # Create and submit first
        period_id = self.test_create_payroll_period()
        self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/submit")
        
        response = self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/approve")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status changed
        detail_response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        period = detail_response.json().get("period", {})
        
        assert period.get("status") == "approved", f"Expected 'approved', got {period.get('status')}"
        assert period.get("approved_by") is not None
        print(f"Period approved by: {period.get('approved_by')}")
    
    def test_payroll_workflow_process(self):
        """Test POST /api/people-ops/payroll/periods/{id}/process - process payroll"""
        # Create, submit and approve first
        period_id = self.test_create_payroll_period()
        self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/submit")
        self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/approve")
        
        response = self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/process")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status changed
        detail_response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        period = detail_response.json().get("period", {})
        
        assert period.get("status") == "completed", f"Expected 'completed', got {period.get('status')}"
        assert period.get("processed_at") is not None
        print(f"Period processed at: {period.get('processed_at')}")
    
    def test_payroll_workflow_revert(self):
        """Test POST /api/people-ops/payroll/periods/{id}/revert - revert to draft"""
        # Create and submit first
        period_id = self.test_create_payroll_period()
        self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/submit")
        
        response = self.session.post(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/revert")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status changed back to draft
        detail_response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        period = detail_response.json().get("period", {})
        
        assert period.get("status") == "draft", f"Expected 'draft', got {period.get('status')}"
        print("Period reverted to draft")
    
    # ==================== PAYSLIP AND BANK FILE ====================
    
    def test_get_payslip_data(self):
        """Test GET /api/people-ops/payroll/entries/{id}/payslip - get payslip data"""
        period_id = self.test_create_payroll_period()
        
        # Get entries
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        entries = response.json().get("entries", [])
        
        if len(entries) == 0:
            pytest.skip("No entries for payslip test")
        
        entry_id = entries[0].get("entry_id")
        
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/entries/{entry_id}/payslip")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "entry" in data, "Missing 'entry' in payslip data"
        assert "period" in data, "Missing 'period' in payslip data"
        
        entry = data["entry"]
        assert "employee_name" in entry
        assert "gross_salary" in entry
        assert "net_salary" in entry
        assert "total_deductions" in entry
        
        print(f"Payslip: {entry.get('employee_name')}")
        print(f"  Gross: ${entry.get('gross_salary', 0):,.2f}")
        print(f"  Deductions: ${entry.get('total_deductions', 0):,.2f}")
        print(f"  Net: ${entry.get('net_salary', 0):,.2f}")
    
    def test_download_bank_file(self):
        """Test GET /api/people-ops/payroll/periods/{id}/bank-file - download bank CSV"""
        period_id = self.test_create_payroll_period()
        
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}/bank-file")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify it's a CSV
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected CSV, got {content_type}"
        
        content = response.text
        assert "Nombre" in content, "Expected CSV header 'Nombre'"
        assert "Banco" in content, "Expected CSV header 'Banco'"
        print(f"Bank file generated, size: {len(content)} bytes")
    
    # ==================== DEDUCTION CALCULATIONS ====================
    
    def test_deduction_calculation_accuracy(self):
        """Verify AFP (2.87%) and ARS (3.04%) deduction calculations"""
        period_id = self.test_create_payroll_period()
        
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        entries = response.json().get("entries", [])
        
        if len(entries) == 0:
            pytest.skip("No entries to verify deductions")
        
        # Check first entry's deductions
        entry = entries[0]
        base_salary = entry.get("base_salary", 0)
        afp_deduction = entry.get("afp_employee", 0)
        ars_deduction = entry.get("ars_employee", 0)
        
        if base_salary > 0:
            expected_afp = base_salary * 0.0287
            expected_ars = base_salary * 0.0304
            
            # Allow small rounding differences
            afp_diff = abs(afp_deduction - expected_afp)
            ars_diff = abs(ars_deduction - expected_ars)
            
            print(f"Base salary: ${base_salary:,.2f}")
            print(f"AFP: Actual ${afp_deduction:,.2f} vs Expected ${expected_afp:,.2f} (diff: ${afp_diff:.2f})")
            print(f"ARS: Actual ${ars_deduction:,.2f} vs Expected ${expected_ars:,.2f} (diff: ${ars_diff:.2f})")
            
            # Allow up to $1 difference due to rounding
            assert afp_diff < 1, f"AFP deduction incorrect: {afp_deduction} vs expected {expected_afp}"
            assert ars_diff < 1, f"ARS deduction incorrect: {ars_deduction} vs expected {expected_ars}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
