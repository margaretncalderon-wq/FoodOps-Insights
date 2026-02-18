"""
Test Super Admin Export and Alerts Endpoints
Tests CSV/Excel export functionality and platform alerts system.
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestSuperAdminExportAlerts:
    """Test export and alerts endpoints for super admin dashboard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.auth_token = None
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.auth_token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    # ============ CSV Export Tests ============
    
    def test_csv_export_returns_200(self):
        """Test CSV export endpoint returns 200 status"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: CSV export endpoint returns 200")
    
    def test_csv_export_content_type(self):
        """Test CSV export returns correct content type"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200
        content_type = response.headers.get('content-type', '')
        assert 'text/csv' in content_type or 'text/plain' in content_type, f"Expected CSV content type, got: {content_type}"
        print(f"PASS: CSV content type is correct: {content_type}")
    
    def test_csv_export_has_content_disposition(self):
        """Test CSV export has Content-Disposition header for download"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200
        content_disposition = response.headers.get('content-disposition', '')
        assert 'attachment' in content_disposition, f"Expected attachment in content-disposition, got: {content_disposition}"
        assert 'kora_metrics_' in content_disposition, f"Expected kora_metrics_ in filename, got: {content_disposition}"
        assert '.csv' in content_disposition, f"Expected .csv extension, got: {content_disposition}"
        print(f"PASS: CSV content disposition is correct: {content_disposition}")
    
    def test_csv_export_contains_kpi_section(self):
        """Test CSV contains KEY PERFORMANCE INDICATORS section"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200
        content = response.text
        assert "KEY PERFORMANCE INDICATORS" in content, "CSV should contain KPI section"
        assert "MRR" in content, "CSV should contain MRR"
        assert "Conversion Rate" in content, "CSV should contain Conversion Rate"
        print("PASS: CSV contains KPI section with MRR and Conversion Rate")
    
    def test_csv_export_contains_industry_section(self):
        """Test CSV contains industry breakdown section"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200
        content = response.text
        assert "ORGANIZATIONS BY INDUSTRY" in content, "CSV should contain industry section"
        print("PASS: CSV contains organizations by industry section")
    
    def test_csv_export_contains_module_section(self):
        """Test CSV contains revenue by module section"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200
        content = response.text
        assert "REVENUE BY MODULE" in content, "CSV should contain module revenue section"
        print("PASS: CSV contains revenue by module section")
    
    def test_csv_export_contains_transactions_section(self):
        """Test CSV contains recent transactions section"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code == 200
        content = response.text
        assert "RECENT TRANSACTIONS" in content, "CSV should contain transactions section"
        print("PASS: CSV contains recent transactions section")
    
    # ============ Excel Export Tests ============
    
    def test_excel_export_returns_200(self):
        """Test Excel export endpoint returns 200 status"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Excel export endpoint returns 200")
    
    def test_excel_export_content_type(self):
        """Test Excel export returns correct content type"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/excel")
        assert response.status_code == 200
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'application/vnd.openxmlformats' in content_type, f"Expected Excel content type, got: {content_type}"
        print(f"PASS: Excel content type is correct: {content_type}")
    
    def test_excel_export_has_content_disposition(self):
        """Test Excel export has Content-Disposition header for download"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/excel")
        assert response.status_code == 200
        content_disposition = response.headers.get('content-disposition', '')
        assert 'attachment' in content_disposition, f"Expected attachment in content-disposition, got: {content_disposition}"
        assert 'kora_metrics_' in content_disposition, f"Expected kora_metrics_ in filename, got: {content_disposition}"
        assert '.xlsx' in content_disposition, f"Expected .xlsx extension, got: {content_disposition}"
        print(f"PASS: Excel content disposition is correct: {content_disposition}")
    
    def test_excel_export_is_valid_xlsx(self):
        """Test Excel export produces valid XLSX file (check magic bytes)"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/export/excel")
        assert response.status_code == 200
        # XLSX files start with PK (ZIP format)
        assert len(response.content) > 100, "Excel file should have substantial content"
        assert response.content[:2] == b'PK', "XLSX file should be a valid ZIP/XLSX format"
        print(f"PASS: Excel export is valid XLSX format ({len(response.content)} bytes)")
    
    # ============ Alerts Endpoint Tests ============
    
    def test_alerts_endpoint_returns_200(self):
        """Test alerts endpoint returns 200 status"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Alerts endpoint returns 200")
    
    def test_alerts_response_structure(self):
        """Test alerts response has expected structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "alerts" in data, "Response should have 'alerts' field"
        assert "total_alerts" in data, "Response should have 'total_alerts' field"
        assert "critical_count" in data, "Response should have 'critical_count' field"
        assert "warning_count" in data, "Response should have 'warning_count' field"
        assert "info_count" in data, "Response should have 'info_count' field"
        assert "checked_at" in data, "Response should have 'checked_at' field"
        
        print(f"PASS: Alerts response structure is valid")
        print(f"  - Total alerts: {data['total_alerts']}")
        print(f"  - Critical: {data['critical_count']}, Warning: {data['warning_count']}, Info: {data['info_count']}")
    
    def test_alerts_is_list(self):
        """Test alerts field is a list"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data['alerts'], list), "alerts should be a list"
        print(f"PASS: alerts is a list with {len(data['alerts'])} items")
    
    def test_alert_item_structure(self):
        """Test individual alert items have correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200
        data = response.json()
        
        if len(data['alerts']) > 0:
            alert = data['alerts'][0]
            assert "type" in alert, "Alert should have 'type' field"
            assert "category" in alert, "Alert should have 'category' field"
            assert "title" in alert, "Alert should have 'title' field"
            assert "message" in alert, "Alert should have 'message' field"
            assert "action" in alert, "Alert should have 'action' field"
            
            # Check type is valid
            assert alert['type'] in ['critical', 'warning', 'info'], f"Alert type should be critical/warning/info, got: {alert['type']}"
            
            print(f"PASS: Alert structure is valid")
            print(f"  - Type: {alert['type']}, Category: {alert['category']}")
            print(f"  - Title: {alert['title'][:50]}...")
        else:
            print("PASS: No alerts present (system healthy)")
    
    def test_alerts_count_consistency(self):
        """Test alert counts are consistent with alerts list"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200
        data = response.json()
        
        alerts = data['alerts']
        total = data['total_alerts']
        critical = data['critical_count']
        warning = data['warning_count']
        info = data['info_count']
        
        assert total == len(alerts), f"total_alerts ({total}) should match alerts length ({len(alerts)})"
        
        actual_critical = len([a for a in alerts if a['type'] == 'critical'])
        actual_warning = len([a for a in alerts if a['type'] == 'warning'])
        actual_info = len([a for a in alerts if a['type'] == 'info'])
        
        assert critical == actual_critical, f"critical_count mismatch: {critical} vs {actual_critical}"
        assert warning == actual_warning, f"warning_count mismatch: {warning} vs {actual_warning}"
        assert info == actual_info, f"info_count mismatch: {info} vs {actual_info}"
        
        print(f"PASS: Alert counts are consistent - Total: {total}, Critical: {critical}, Warning: {warning}, Info: {info}")
    
    def test_alerts_sorted_by_priority(self):
        """Test alerts are sorted by priority (critical > warning > info)"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200
        data = response.json()
        
        alerts = data['alerts']
        if len(alerts) > 1:
            type_priority = {"critical": 0, "warning": 1, "info": 2}
            priorities = [type_priority.get(a['type'], 3) for a in alerts]
            
            # Check if sorted (each element <= next)
            is_sorted = all(priorities[i] <= priorities[i+1] for i in range(len(priorities)-1))
            assert is_sorted, f"Alerts should be sorted by priority. Got priorities: {priorities}"
            print("PASS: Alerts are sorted by priority (critical first)")
        else:
            print("PASS: Only 0-1 alerts, sort check skipped")
    
    # ============ Alert Category Tests ============
    
    def test_alerts_contain_expected_categories(self):
        """Test alerts include expected categories when triggered"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code == 200
        data = response.json()
        
        categories_present = set(a['category'] for a in data['alerts'])
        valid_categories = {'conversion', 'revenue', 'payments', 'data_quality', 'modules', 'growth', 'churn'}
        
        for cat in categories_present:
            assert cat in valid_categories, f"Unknown alert category: {cat}"
        
        print(f"PASS: Alert categories are valid: {categories_present}")
    
    def test_pending_payments_alert_detection(self):
        """Test that pending payments alert is detected when applicable"""
        # First check dashboard metrics
        metrics_response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert metrics_response.status_code == 200
        metrics = metrics_response.json()
        
        pending = metrics['conversion']['pending_transactions']
        
        alerts_response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert alerts_response.status_code == 200
        alerts_data = alerts_response.json()
        
        payments_alerts = [a for a in alerts_data['alerts'] if a['category'] == 'payments']
        
        if pending > 5:
            assert len(payments_alerts) > 0, f"Should have payments alert when {pending} pending transactions exist"
            print(f"PASS: Pending payments alert detected for {pending} pending transactions")
        else:
            print(f"PASS: No pending payments alert needed ({pending} pending < 5 threshold)")
    
    # ============ Unauthorized Access Tests ============
    
    def test_csv_export_unauthorized(self):
        """Test CSV export requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/super-admin/metrics/export/csv")
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: CSV export properly rejects unauthorized access")
    
    def test_excel_export_unauthorized(self):
        """Test Excel export requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/super-admin/metrics/export/excel")
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: Excel export properly rejects unauthorized access")
    
    def test_alerts_unauthorized(self):
        """Test alerts endpoint requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/super-admin/metrics/alerts")
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: Alerts endpoint properly rejects unauthorized access")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
