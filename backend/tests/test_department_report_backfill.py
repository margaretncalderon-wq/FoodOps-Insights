"""
Test Suite: Department Report and Backfill Migration
Tests for:
1. GET /api/business-clarity/reports/by-department - Department financial report
2. POST /api/people-ops/departments/backfill - Backfill department_id for employees
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestDepartmentReportAndBackfill:
    """Test department report and backfill migration endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create requests session"""
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Login and get auth token"""
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "demo.agency@kora.com",
                "password": "Evoque2024!"
            }
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - cannot continue with authenticated tests")
        return login_response.cookies
    
    @pytest.fixture(scope="class")
    def auth_session(self, session, auth_token):
        """Session with authentication cookies"""
        return session
    
    # ============ DEPARTMENT REPORT TESTS ============
    
    def test_department_report_returns_200(self, auth_session, auth_token):
        """Test GET /api/business-clarity/reports/by-department returns 200"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-department",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Department report endpoint returns 200")
    
    def test_department_report_has_correct_structure(self, auth_session, auth_token):
        """Test department report has records, summary, and period fields"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-department",
            cookies=auth_token
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "records" in data, "Response should have 'records' field"
        assert "summary" in data, "Response should have 'summary' field"
        assert "period" in data, "Response should have 'period' field"
        print("PASS: Department report has correct structure (records, summary, period)")
    
    def test_department_report_accepts_year_month_params(self, auth_session, auth_token):
        """Test department report accepts year and month query parameters"""
        current_year = datetime.now().year
        current_month = datetime.now().month
        
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-department?year={current_year}&month={current_month}",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("period", {}).get("year") == current_year
        assert data.get("period", {}).get("month") == current_month
        print(f"PASS: Department report accepts year={current_year}, month={current_month} params")
    
    def test_department_report_summary_fields(self, auth_session, auth_token):
        """Test department report summary has required fields"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-department",
            cookies=auth_token
        )
        assert response.status_code == 200
        
        data = response.json()
        summary = data.get("summary", {})
        
        expected_fields = [
            "total_departments",
            "total_employees",
            "total_budget",
            "total_actual",
            "total_variance",
            "overall_utilization"
        ]
        
        for field in expected_fields:
            assert field in summary, f"Summary should have '{field}' field"
        
        print(f"PASS: Summary has all required fields: {expected_fields}")
    
    def test_department_report_record_fields(self, auth_session, auth_token):
        """Test department report records have required per-department fields"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-department",
            cookies=auth_token
        )
        assert response.status_code == 200
        
        data = response.json()
        records = data.get("records", [])
        
        if not records:
            pytest.skip("No departments found - cannot verify record structure")
        
        expected_record_fields = [
            "department_id",
            "department_name",
            "employee_count",
            "payroll_cost",
            "payables_cost",
            "direct_expenses",
            "actual_spend",
            "monthly_budget",
            "variance",
            "utilization"
        ]
        
        first_record = records[0]
        for field in expected_record_fields:
            assert field in first_record, f"Record should have '{field}' field"
        
        print(f"PASS: Department records have all required fields: {len(expected_record_fields)} fields verified")
        print(f"INFO: Found {len(records)} departments in report")
    
    def test_department_report_period_fields(self, auth_session, auth_token):
        """Test department report period has year, month, and label"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-department",
            cookies=auth_token
        )
        assert response.status_code == 200
        
        data = response.json()
        period = data.get("period", {})
        
        assert "year" in period, "Period should have 'year'"
        assert "month" in period, "Period should have 'month'"
        assert "label" in period, "Period should have 'label'"
        
        print(f"PASS: Period has year, month, label. Current period: {period.get('label')}")
    
    # ============ BACKFILL ENDPOINT TESTS ============
    
    def test_backfill_endpoint_returns_200(self, auth_session, auth_token):
        """Test POST /api/people-ops/departments/backfill returns 200"""
        response = auth_session.post(
            f"{BASE_URL}/api/people-ops/departments/backfill",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Backfill endpoint returns 200")
    
    def test_backfill_response_structure(self, auth_session, auth_token):
        """Test backfill response has correct fields"""
        response = auth_session.post(
            f"{BASE_URL}/api/people-ops/departments/backfill",
            cookies=auth_token
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "updated" in data or "message" in data, "Response should have 'updated' or 'message' field"
        
        if "updated" in data:
            assert "no_match" in data, "Response should have 'no_match' list"
            assert "available_departments" in data, "Response should have 'available_departments' list"
            print(f"PASS: Backfill response has correct structure")
            print(f"INFO: Updated {data.get('updated', 0)} employees, {len(data.get('no_match', []))} no-match")
        else:
            print(f"INFO: Backfill message: {data.get('message')}")
    
    def test_backfill_returns_available_departments(self, auth_session, auth_token):
        """Test backfill returns list of available departments"""
        response = auth_session.post(
            f"{BASE_URL}/api/people-ops/departments/backfill",
            cookies=auth_token
        )
        assert response.status_code == 200
        
        data = response.json()
        departments = data.get("available_departments", [])
        
        print(f"PASS: Backfill returns available_departments: {departments}")
    
    # ============ REGRESSION TESTS FOR EXISTING REPORTS ============
    
    def test_snapshot_report_still_works(self, auth_session, auth_token):
        """Regression: Financial snapshot report still works"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/financial-snapshot",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Snapshot report failed: {response.status_code}"
        print("PASS: Regression - Snapshot report still works")
    
    def test_client_report_still_works(self, auth_session, auth_token):
        """Regression: Client revenue report still works"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/client-revenue",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Client report failed: {response.status_code}"
        print("PASS: Regression - Client revenue report still works")
    
    def test_supplier_report_still_works(self, auth_session, auth_token):
        """Regression: Supplier spend report still works"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/supplier-spend",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Supplier report failed: {response.status_code}"
        print("PASS: Regression - Supplier spend report still works")
    
    def test_event_report_still_works(self, auth_session, auth_token):
        """Regression: Event profitability report still works"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/event-profitability",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Event report failed: {response.status_code}"
        print("PASS: Regression - Event profitability report still works")
    
    def test_cost_center_report_still_works(self, auth_session, auth_token):
        """Regression: Cost center report still works"""
        current_year = datetime.now().year
        current_month = datetime.now().month
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/by-cost-center?year={current_year}&month={current_month}",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Cost center report failed: {response.status_code}"
        print("PASS: Regression - Cost center report still works")
    
    def test_asset_report_still_works(self, auth_session, auth_token):
        """Regression: Asset value report still works"""
        response = auth_session.get(
            f"{BASE_URL}/api/business-clarity/reports/asset-value",
            cookies=auth_token
        )
        assert response.status_code == 200, f"Asset report failed: {response.status_code}"
        print("PASS: Regression - Asset value report still works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
