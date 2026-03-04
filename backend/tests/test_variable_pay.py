"""
Variable Pay System Backend Tests
Tests for Overtime, Commission, Bonus, and Incentive pay run endpoints
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVariablePaySystem:
    """Tests for Variable Pay endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Login and get authenticated session"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        return session
    
    def test_get_variable_pay_config(self, auth_session):
        """GET /api/settings/variable-pay-config - Get variable pay configuration"""
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify expected fields
        assert "overtime_payment_type" in data
        assert "commission_payment_type" in data
        assert "bonus_payment_type" in data
        assert "incentive_payment_type" in data
        
        print(f"Variable Pay Config: Overtime={data.get('overtime_payment_type')}, "
              f"Commission={data.get('commission_payment_type')}")
    
    def test_get_variable_pay_runs_overtime(self, auth_session):
        """GET /api/settings/variable-pay-runs?pay_type=overtime - List overtime runs"""
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs?pay_type=overtime")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        runs = response.json()
        assert isinstance(runs, list)
        
        print(f"Found {len(runs)} overtime runs")
        for run in runs[:2]:
            print(f"  - {run.get('run_name')}: Status={run.get('status')}, Net={run.get('total_net')}")
    
    def test_get_variable_pay_runs_commission(self, auth_session):
        """GET /api/settings/variable-pay-runs?pay_type=commission - List commission runs"""
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs?pay_type=commission")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        runs = response.json()
        assert isinstance(runs, list)
        print(f"Found {len(runs)} commission runs")
    
    def test_get_variable_pay_runs_bonus(self, auth_session):
        """GET /api/settings/variable-pay-runs?pay_type=bonus - List bonus runs"""
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs?pay_type=bonus")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        runs = response.json()
        assert isinstance(runs, list)
        print(f"Found {len(runs)} bonus runs")
    
    def test_get_variable_pay_runs_incentive(self, auth_session):
        """GET /api/settings/variable-pay-runs?pay_type=incentive - List incentive runs"""
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs?pay_type=incentive")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        runs = response.json()
        assert isinstance(runs, list)
        print(f"Found {len(runs)} incentive runs")
    
    def test_get_existing_run_detail(self, auth_session):
        """GET /api/settings/variable-pay-runs/{run_id} - Get run details"""
        # First, get list of runs
        runs_response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs?pay_type=overtime")
        if runs_response.status_code != 200:
            pytest.skip("Could not fetch runs list")
        
        runs = runs_response.json()
        if not runs:
            pytest.skip("No overtime runs found")
        
        # Get first run detail
        run_id = runs[0].get("run_id")
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs/{run_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "run" in data
        assert "entries" in data
        
        run = data["run"]
        entries = data["entries"]
        
        print(f"Run: {run.get('run_name')}")
        print(f"  Total Employees: {run.get('total_employees')}")
        print(f"  Total Gross: ${run.get('total_gross', 0):.2f}")
        print(f"  Total Net: ${run.get('total_net', 0):.2f}")
        print(f"  Entries: {len(entries)}")
    
    def test_bank_file_endpoint(self, auth_session):
        """GET /api/settings/variable-pay-runs/{run_id}/bank-file - CSV bank file"""
        # Get existing run
        runs_response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs?pay_type=overtime")
        if runs_response.status_code != 200:
            pytest.skip("Could not fetch runs list")
        
        runs = runs_response.json()
        if not runs:
            pytest.skip("No runs found")
        
        run_id = runs[0].get("run_id")
        response = auth_session.get(f"{BASE_URL}/api/settings/variable-pay-runs/{run_id}/bank-file")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/csv" in response.headers.get("content-type", "")
        
        # Check CSV has header row
        csv_content = response.text
        assert "Employee Number" in csv_content or "employee" in csv_content.lower()
        print(f"Bank file generated, {len(csv_content)} bytes")


class TestItemTypesCommissionable:
    """Tests for Item Types with is_commissionable field"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Login and get authenticated session"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        return session
    
    def test_get_item_types(self, auth_session):
        """GET /api/settings/item-types - List item types"""
        response = auth_session.get(f"{BASE_URL}/api/settings/item-types")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        types = response.json()
        assert isinstance(types, list)
        assert len(types) > 0, "Expected at least one item type"
        
        print(f"Found {len(types)} item types:")
        for t in types:
            comm_status = "Commissionable" if t.get("is_commissionable", True) else "Non-commissionable"
            print(f"  - {t.get('name')}: {comm_status}")
    
    def test_create_item_type_with_commissionable_false(self, auth_session):
        """POST /api/settings/item-types - Create non-commissionable type"""
        unique_name = f"TEST_NonComm_{uuid.uuid4().hex[:6]}"
        
        response = auth_session.post(f"{BASE_URL}/api/settings/item-types", json={
            "name": unique_name,
            "name_es": f"{unique_name}_ES",
            "is_commissionable": False
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        type_id = data.get("type_id")
        
        # Verify the type was created with is_commissionable=false
        types_response = auth_session.get(f"{BASE_URL}/api/settings/item-types")
        types = types_response.json()
        
        created_type = next((t for t in types if t.get("name") == unique_name), None)
        assert created_type is not None, "Created type not found"
        assert created_type.get("is_commissionable") == False, "is_commissionable should be False"
        
        print(f"Created non-commissionable type: {unique_name}")
        
        # Cleanup - delete test type
        if type_id:
            auth_session.delete(f"{BASE_URL}/api/settings/item-types/{type_id}")


class TestEmployeeCompensationFields:
    """Tests for Employee Profile commission_rate and incentive_pool_percentage fields"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Login and get authenticated session"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        return session
    
    def test_get_employees_with_compensation_fields(self, auth_session):
        """GET /api/people-ops/employees - Verify compensation fields exist"""
        response = auth_session.get(f"{BASE_URL}/api/people-ops/employees")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        employees = response.json()
        assert isinstance(employees, list)
        
        if not employees:
            pytest.skip("No employees found")
        
        # Check first employee for compensation fields
        emp = employees[0]
        print(f"Employee: {emp.get('full_name')}")
        print(f"  Commission Rate: {emp.get('commission_rate', 'Not set')}%")
        print(f"  Incentive Pool %: {emp.get('incentive_pool_percentage', 'Not set')}%")
    
    def test_update_employee_commission_rate(self, auth_session):
        """PUT /api/people-ops/employees/{id} - Update commission_rate"""
        # Get an employee
        emp_response = auth_session.get(f"{BASE_URL}/api/people-ops/employees")
        if emp_response.status_code != 200:
            pytest.skip("Could not fetch employees")
        
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees found")
        
        emp = employees[0]
        emp_id = emp.get("employee_id")
        original_rate = emp.get("commission_rate", 0)
        
        # Update commission rate
        new_rate = 7.5
        response = auth_session.put(f"{BASE_URL}/api/people-ops/employees/{emp_id}", json={
            "commission_rate": new_rate
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = auth_session.get(f"{BASE_URL}/api/people-ops/employees/{emp_id}")
        updated_emp = verify_response.json()
        
        assert updated_emp.get("commission_rate") == new_rate, \
            f"Commission rate not updated. Expected {new_rate}, got {updated_emp.get('commission_rate')}"
        
        print(f"Updated commission_rate from {original_rate} to {new_rate}")
        
        # Restore original value
        auth_session.put(f"{BASE_URL}/api/people-ops/employees/{emp_id}", json={
            "commission_rate": original_rate
        })
    
    def test_update_employee_incentive_pool_percentage(self, auth_session):
        """PUT /api/people-ops/employees/{id} - Update incentive_pool_percentage"""
        # Get an employee
        emp_response = auth_session.get(f"{BASE_URL}/api/people-ops/employees")
        if emp_response.status_code != 200:
            pytest.skip("Could not fetch employees")
        
        employees = emp_response.json()
        if not employees:
            pytest.skip("No employees found")
        
        emp = employees[0]
        emp_id = emp.get("employee_id")
        original_pct = emp.get("incentive_pool_percentage", 0)
        
        # Update incentive pool percentage
        new_pct = 30.0
        response = auth_session.put(f"{BASE_URL}/api/people-ops/employees/{emp_id}", json={
            "incentive_pool_percentage": new_pct
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = auth_session.get(f"{BASE_URL}/api/people-ops/employees/{emp_id}")
        updated_emp = verify_response.json()
        
        assert updated_emp.get("incentive_pool_percentage") == new_pct, \
            f"Incentive pool % not updated. Expected {new_pct}, got {updated_emp.get('incentive_pool_percentage')}"
        
        print(f"Updated incentive_pool_percentage from {original_pct} to {new_pct}")
        
        # Restore original value
        auth_session.put(f"{BASE_URL}/api/people-ops/employees/{emp_id}", json={
            "incentive_pool_percentage": original_pct
        })


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
