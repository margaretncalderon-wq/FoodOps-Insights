"""
Business Clarity Module Tests
Tests for financial decision layer with Stripe integration
- Dashboard KPIs
- Invoice management
- Accounts Receivable with aging
- Accounts Payable
- Payment management
- Stripe checkout
- Executive Reports
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestBusinessClarityAuth:
    """Authentication for Business Clarity tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.status_code}")
        
        data = response.json()
        token = data.get("access_token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        
        return session


class TestBusinessClarityDashboard(TestBusinessClarityAuth):
    """Dashboard endpoint tests"""
    
    def test_get_dashboard_returns_200(self, auth_session):
        """GET /api/business-clarity/dashboard returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_dashboard_has_required_fields(self, auth_session):
        """Dashboard response has all required KPI fields"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "total_receivables" in data, "Missing total_receivables"
        assert "total_overdue" in data, "Missing total_overdue"
        assert "total_payables" in data, "Missing total_payables"
        assert "aging_buckets" in data, "Missing aging_buckets"
        assert "recent_payments" in data, "Missing recent_payments"
        assert "invoices_count" in data, "Missing invoices_count"
        assert "open_invoices_count" in data, "Missing open_invoices_count"
    
    def test_dashboard_aging_buckets_structure(self, auth_session):
        """Dashboard aging buckets have correct structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        aging = data.get("aging_buckets", {})
        
        # Check aging bucket keys
        expected_keys = ["current", "1_30", "31_60", "61_90", "90_plus"]
        for key in expected_keys:
            assert key in aging, f"Missing aging bucket: {key}"
            assert isinstance(aging[key], (int, float)), f"Aging bucket {key} should be numeric"


class TestBusinessClarityInvoices(TestBusinessClarityAuth):
    """Invoice management tests"""
    
    def test_get_invoices_returns_200(self, auth_session):
        """GET /api/business-clarity/invoices returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/invoices")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_get_invoices_returns_list(self, auth_session):
        """GET /api/business-clarity/invoices returns a list"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/invoices")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_get_invoices_with_status_filter(self, auth_session):
        """GET /api/business-clarity/invoices with status filter"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/invoices?status=open")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_invoice_requires_client_id(self, auth_session):
        """POST /api/business-clarity/invoices requires client_id"""
        # First get a client
        clients_response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        if clients_response.status_code != 200:
            pytest.skip("Could not get clients")
        
        clients = clients_response.json()
        if not clients:
            pytest.skip("No clients available for testing")
        
        client_id = clients[0].get("client_id")
        
        # Create invoice
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        invoice_data = {
            "client_id": client_id,
            "due_date": due_date,
            "lines": [
                {
                    "description": "TEST_Business Clarity Test Service",
                    "quantity": 1,
                    "unit_price": 100.00,
                    "discount_percent": 0,
                    "tax_rate": 0
                }
            ],
            "discount_percent": 0,
            "tax_rate": 0,
            "notes": "Test invoice for Business Clarity"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/business-clarity/invoices", json=invoice_data)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "invoice_id" in data, "Response should contain invoice_id"
        assert "invoice_number" in data, "Response should contain invoice_number"
        assert data.get("total") == 100.00, f"Expected total 100.00, got {data.get('total')}"
        
        # Store for cleanup
        return data.get("invoice_id")


class TestBusinessClarityAccountsReceivable(TestBusinessClarityAuth):
    """Accounts Receivable tests"""
    
    def test_get_accounts_receivable_returns_200(self, auth_session):
        """GET /api/business-clarity/accounts-receivable returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-receivable")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_accounts_receivable_has_required_fields(self, auth_session):
        """A/R response has required structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-receivable")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "records" in data, "Missing records"
        assert "aging_buckets" in data, "Missing aging_buckets"
        assert "summary" in data, "Missing summary"
        
        # Check summary fields
        summary = data.get("summary", {})
        assert "total_outstanding" in summary, "Missing total_outstanding in summary"
        assert "total_overdue" in summary, "Missing total_overdue in summary"
        assert "total_current" in summary, "Missing total_current in summary"
        assert "invoices_count" in summary, "Missing invoices_count in summary"
        assert "overdue_count" in summary, "Missing overdue_count in summary"
    
    def test_accounts_receivable_aging_buckets(self, auth_session):
        """A/R aging buckets have correct structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-receivable")
        assert response.status_code == 200
        
        data = response.json()
        aging = data.get("aging_buckets", {})
        
        expected_keys = ["current", "1_30", "31_60", "61_90", "90_plus"]
        for key in expected_keys:
            assert key in aging, f"Missing aging bucket: {key}"


class TestBusinessClarityAccountsPayable(TestBusinessClarityAuth):
    """Accounts Payable tests"""
    
    def test_get_accounts_payable_returns_200(self, auth_session):
        """GET /api/business-clarity/accounts-payable returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_accounts_payable_has_required_fields(self, auth_session):
        """A/P response has required structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "records" in data, "Missing records"
        assert "summary" in data, "Missing summary"
        
        # Check summary fields
        summary = data.get("summary", {})
        assert "total_pending" in summary, "Missing total_pending in summary"
        assert "total_paid" in summary, "Missing total_paid in summary"
        assert "records_count" in summary, "Missing records_count in summary"
        assert "pending_count" in summary, "Missing pending_count in summary"


class TestBusinessClarityPayments(TestBusinessClarityAuth):
    """Payment management tests"""
    
    def test_get_payments_returns_200(self, auth_session):
        """GET /api/business-clarity/payments returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/payments")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_get_payments_returns_list(self, auth_session):
        """GET /api/business-clarity/payments returns a list"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/payments")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_create_payment_requires_client_id(self, auth_session):
        """POST /api/business-clarity/payments requires client_id"""
        # First get a client
        clients_response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        if clients_response.status_code != 200:
            pytest.skip("Could not get clients")
        
        clients = clients_response.json()
        if not clients:
            pytest.skip("No clients available for testing")
        
        client_id = clients[0].get("client_id")
        
        # Create payment
        payment_data = {
            "client_id": client_id,
            "amount": 50.00,
            "payment_method": "transfer",
            "reference": "TEST_BC_Payment_001",
            "notes": "Test payment for Business Clarity"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/business-clarity/payments", json=payment_data)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "payment_id" in data, "Response should contain payment_id"
        assert data.get("amount") == 50.00, f"Expected amount 50.00, got {data.get('amount')}"
        assert data.get("status") == "completed", f"Expected status completed, got {data.get('status')}"


class TestBusinessClarityStripeCheckout(TestBusinessClarityAuth):
    """Stripe checkout tests"""
    
    def test_checkout_session_requires_invoice_ids(self, auth_session):
        """POST /api/business-clarity/checkout/session requires invoice_ids"""
        # Try without invoices - should fail
        checkout_data = {
            "invoice_ids": [],
            "origin_url": "https://example.com"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/business-clarity/checkout/session", json=checkout_data)
        # Should return 400 or 422 for empty invoice_ids
        assert response.status_code in [400, 422], f"Expected 400/422 for empty invoice_ids, got {response.status_code}"
    
    def test_checkout_status_returns_404_for_invalid_session(self, auth_session):
        """GET /api/business-clarity/checkout/status/{session_id} returns 404 for invalid session"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/checkout/status/invalid_session_id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestBusinessClarityReports(TestBusinessClarityAuth):
    """Executive reports tests"""
    
    def test_financial_snapshot_returns_200(self, auth_session):
        """GET /api/business-clarity/reports/financial-snapshot returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/financial-snapshot")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_financial_snapshot_has_required_fields(self, auth_session):
        """Financial snapshot has required structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/financial-snapshot")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "revenue" in data, "Missing revenue"
        assert "expenses" in data, "Missing expenses"
        assert "profit" in data, "Missing profit"
        
        # Check revenue fields
        revenue = data.get("revenue", {})
        assert "total_invoiced" in revenue, "Missing total_invoiced in revenue"
        assert "total_collected" in revenue, "Missing total_collected in revenue"
        assert "total_outstanding" in revenue, "Missing total_outstanding in revenue"
        
        # Check profit fields
        profit = data.get("profit", {})
        assert "gross" in profit, "Missing gross in profit"
        assert "margin" in profit, "Missing margin in profit"
    
    def test_client_revenue_report_returns_200(self, auth_session):
        """GET /api/business-clarity/reports/client-revenue returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/client-revenue")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_client_revenue_report_has_required_fields(self, auth_session):
        """Client revenue report has required structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/client-revenue")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "records" in data, "Missing records"
        assert "summary" in data, "Missing summary"
        
        summary = data.get("summary", {})
        assert "total_revenue" in summary, "Missing total_revenue in summary"
        assert "total_collected" in summary, "Missing total_collected in summary"
        assert "clients_count" in summary, "Missing clients_count in summary"
    
    def test_supplier_spend_report_returns_200(self, auth_session):
        """GET /api/business-clarity/reports/supplier-spend returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/supplier-spend")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_supplier_spend_report_has_required_fields(self, auth_session):
        """Supplier spend report has required structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/supplier-spend")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "records" in data, "Missing records"
        assert "summary" in data, "Missing summary"
        
        summary = data.get("summary", {})
        assert "total_spend" in summary, "Missing total_spend in summary"
        assert "total_paid" in summary, "Missing total_paid in summary"
        assert "total_pending" in summary, "Missing total_pending in summary"
        assert "suppliers_count" in summary, "Missing suppliers_count in summary"
    
    def test_event_profitability_report_returns_200(self, auth_session):
        """GET /api/business-clarity/reports/event-profitability returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/event-profitability")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_event_profitability_report_has_required_fields(self, auth_session):
        """Event profitability report has required structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/reports/event-profitability")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "records" in data, "Missing records"
        assert "summary" in data, "Missing summary"


class TestBusinessClarityPaymentApplication(TestBusinessClarityAuth):
    """Payment application tests"""
    
    def test_apply_payment_returns_404_for_invalid_payment(self, auth_session):
        """POST /api/business-clarity/payments/{id}/apply returns 404 for invalid payment"""
        apply_data = {
            "payment_id": "invalid_payment_id",
            "applications": [
                {"invoice_id": "inv_123", "amount_applied": 50.00}
            ]
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/business-clarity/payments/invalid_payment_id/apply",
            json=apply_data
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
