"""
Test: Cost Centers End-to-End Integration Testing
Features tested:
1. PayrollEntry with cost_center_id inheritance from employee
2. Accounting Engine - accounting_entries collection
3. POST /api/business-clarity/supplier-payables with accounting entry
4. GET /api/business-clarity/accounting/unassigned
5. POST /api/business-clarity/accounting/assign-cost-center
6. Report by Cost Center
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCostCenterIntegration:
    """Test Cost Center end-to-end functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session"""
        self.session = requests.Session()
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json().get("user", {})
        yield
        self.session.close()
    
    # ========== Cost Centers Tests ==========
    def test_get_cost_centers(self):
        """Test GET /api/people-ops/cost-centers"""
        response = self.session.get(f"{BASE_URL}/api/people-ops/cost-centers")
        assert response.status_code == 200, f"Failed: {response.text}"
        cost_centers = response.json()
        assert isinstance(cost_centers, list)
        print(f"SUCCESS: Found {len(cost_centers)} cost centers")
        # Store cost center ids for later tests
        if cost_centers:
            self.cc_id = cost_centers[0].get("cost_center_id")
            self.cc_name = cost_centers[0].get("name")
            print(f"First CC: {self.cc_name} ({self.cc_id})")
    
    # ========== Accounting Entries Tests ==========
    def test_get_accounting_entries(self):
        """Test GET /api/business-clarity/accounting/entries"""
        response = self.session.get(f"{BASE_URL}/api/business-clarity/accounting/entries")
        assert response.status_code == 200, f"Failed: {response.text}"
        entries = response.json()
        assert isinstance(entries, list)
        print(f"SUCCESS: Found {len(entries)} accounting entries")
        
        # Check if entries have required fields
        if entries:
            entry = entries[0]
            assert "entry_id" in entry, "Missing entry_id"
            assert "transaction_type" in entry, "Missing transaction_type"
            assert "amount" in entry, "Missing amount"
            print(f"Sample entry: {entry.get('entry_id')} - {entry.get('transaction_type')} - ${entry.get('amount')}")
    
    def test_get_unassigned_entries(self):
        """Test GET /api/business-clarity/accounting/unassigned"""
        response = self.session.get(f"{BASE_URL}/api/business-clarity/accounting/unassigned")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "count" in data, "Response missing 'count'"
        assert "entries" in data, "Response missing 'entries'"
        assert isinstance(data["entries"], list)
        
        print(f"SUCCESS: {data['count']} unassigned entries")
        if data["entries"]:
            entry = data["entries"][0]
            print(f"Sample unassigned: {entry.get('entry_id')} - {entry.get('description')}")
            # Store for assignment test
            self.unassigned_entry_id = entry.get("entry_id")
    
    def test_assign_cost_center_to_entry(self):
        """Test POST /api/business-clarity/accounting/assign-cost-center"""
        # First get cost centers
        cc_response = self.session.get(f"{BASE_URL}/api/people-ops/cost-centers")
        assert cc_response.status_code == 200
        cost_centers = cc_response.json()
        
        if not cost_centers:
            pytest.skip("No cost centers available")
        
        # Get unassigned entries
        unassigned_response = self.session.get(f"{BASE_URL}/api/business-clarity/accounting/unassigned")
        assert unassigned_response.status_code == 200
        unassigned = unassigned_response.json()
        
        if not unassigned.get("entries"):
            print("SKIP: No unassigned entries to test assignment")
            return
        
        entry_id = unassigned["entries"][0]["entry_id"]
        cc_id = cost_centers[0]["cost_center_id"]
        
        # Assign cost center
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/accounting/assign-cost-center",
            json={"entry_id": entry_id, "cost_center_id": cc_id}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        result = response.json()
        
        assert result.get("success") == True, "Assignment should return success=true"
        print(f"SUCCESS: Assigned cost center {cc_id} to entry {entry_id}")
    
    # ========== Supplier Payables Tests ==========
    def test_create_supplier_payable_with_cost_center(self):
        """Test POST /api/business-clarity/supplier-payables creates accounting entry"""
        # Get a fixed cost category linked to a cost center
        categories_response = self.session.get(f"{BASE_URL}/api/business-clarity/fixed-costs/categories")
        
        if categories_response.status_code != 200:
            pytest.skip("Fixed cost categories endpoint not available")
        
        categories = categories_response.json()
        category_with_cc = None
        for cat in categories:
            if cat.get("cost_center_id"):
                category_with_cc = cat
                break
        
        # Create payable
        payable_data = {
            "supplier_name": "TEST_Proveedor_Centro_Costo",
            "description": "TEST_Compra prueba centro de costo",
            "amount": 1500.00,
            "due_date": "2026-02-28"
        }
        
        # If we have a category with cost center, use it
        if category_with_cc:
            payable_data["fixed_cost_category_id"] = category_with_cc["category_id"]
        
        response = self.session.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payable_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        result = response.json()
        
        assert "payable" in result, "Response should contain 'payable'"
        payable = result["payable"]
        assert payable.get("payable_id"), "Payable should have ID"
        assert payable.get("amount") == 1500.00, "Amount should match"
        
        # If category with CC was used, verify accounting entry was created
        if category_with_cc:
            assert "accounting_entry_id" in result, "Should return accounting_entry_id when CC linked"
            if result.get("accounting_entry_id"):
                print(f"SUCCESS: Accounting entry created: {result['accounting_entry_id']}")
        
        print(f"SUCCESS: Created payable {payable['payable_id']} - ${payable['amount']}")
    
    # ========== Report by Cost Center Tests ==========
    def test_report_by_cost_center(self):
        """Test GET /api/business-clarity/reports/by-cost-center"""
        response = self.session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-cost-center",
            params={"year": 2026, "month": 1}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check response structure
        assert "records" in data, "Response should have 'records'"
        assert "summary" in data, "Response should have 'summary'"
        assert "period" in data, "Response should have 'period'"
        
        # Validate summary fields
        summary = data["summary"]
        if summary:
            print(f"Budget: ${summary.get('total_budget', 0)}")
            print(f"Actual: ${summary.get('total_actual', 0)}")
            print(f"Variance: ${summary.get('total_variance', 0)}")
        
        # Check records
        records = data["records"]
        print(f"SUCCESS: Report has {len(records)} cost center records")
        
        if records:
            record = records[0]
            assert "cost_center_id" in record, "Record should have cost_center_id"
            assert "cost_center_name" in record, "Record should have cost_center_name"
            print(f"Sample record: {record.get('cost_center_name')} - Actual: ${record.get('actual', 0)}")
    
    # ========== PayrollEntry with Cost Center Tests ==========
    def test_payroll_entries_have_cost_center(self):
        """Test that payroll entries include cost_center_id from employee"""
        # Get payroll periods
        periods_response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods")
        assert periods_response.status_code == 200, f"Failed: {periods_response.text}"
        periods = periods_response.json()
        
        if not periods:
            print("SKIP: No payroll periods available")
            return
        
        # Get entries for first period
        period_id = periods[0]["period_id"]
        response = self.session.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        entries = data.get("entries", [])
        if not entries:
            print("SKIP: No payroll entries in period")
            return
        
        # Check if entries have cost_center_id field
        entry = entries[0]
        print(f"Payroll entry fields: {list(entry.keys())}")
        
        # Verify cost_center_id and cost_center_name fields exist
        assert "cost_center_id" in entry, "PayrollEntry should have cost_center_id field"
        assert "cost_center_name" in entry, "PayrollEntry should have cost_center_name field"
        
        entries_with_cc = [e for e in entries if e.get("cost_center_id")]
        print(f"SUCCESS: {len(entries_with_cc)}/{len(entries)} payroll entries have cost_center_id")
        
        if entries_with_cc:
            sample = entries_with_cc[0]
            print(f"Sample: {sample.get('employee_name')} -> CC: {sample.get('cost_center_name')}")
    
    # ========== Accounting Summary Tests ==========
    def test_accounting_summary_by_cost_center(self):
        """Test GET /api/business-clarity/accounting/summary"""
        response = self.session.get(
            f"{BASE_URL}/api/business-clarity/accounting/summary",
            params={"year": 2026, "month": 1}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be list of summaries"
        print(f"SUCCESS: Got {len(data)} cost center summaries from accounting entries")
        
        if data:
            summary = data[0]
            print(f"Sample: CC={summary.get('cost_center_name')} Total=${summary.get('total_amount', 0)}")
    
    # ========== Cleanup ==========
    def test_cleanup_test_data(self):
        """Cleanup TEST_ prefixed data"""
        # Get payables and delete test ones
        payables_response = self.session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        if payables_response.status_code == 200:
            payables = payables_response.json().get("records", [])
            test_payables = [p for p in payables if "TEST_" in (p.get("description") or "") or "TEST_" in (p.get("supplier_name") or "")]
            print(f"Found {len(test_payables)} TEST_ payables (manual cleanup may be needed)")


class TestEmployeeCostCenterAssignment:
    """Test that employees have cost center that flows to payroll"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200
        yield
        self.session.close()
    
    def test_employees_have_cost_center_field(self):
        """Verify employees have cost_center_id field"""
        response = self.session.get(f"{BASE_URL}/api/people-ops/employees")
        assert response.status_code == 200, f"Failed: {response.text}"
        employees = response.json()
        
        if not employees:
            pytest.skip("No employees found")
        
        # Check employee fields
        employee = employees[0]
        assert "cost_center_id" in employee, "Employee should have cost_center_id field"
        assert "cost_center_name" in employee, "Employee should have cost_center_name field"
        
        with_cc = [e for e in employees if e.get("cost_center_id")]
        print(f"SUCCESS: {len(with_cc)}/{len(employees)} employees have cost center assigned")
        
        if with_cc:
            sample = with_cc[0]
            print(f"Sample: {sample.get('full_name')} -> {sample.get('cost_center_name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
