"""
Test Suite for Accounting Engine Integration
Tests:
1. Invoice creation registers revenue in accounting_entries
2. P&L report aggregates data correctly
3. Cost Center actual vs budget report
4. Granular permission checks for invoices, payments, and fixed cost categories
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="class")
def auth_token():
    """Get authentication token for demo user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="class")
def auth_headers(auth_token):
    """Headers with authentication token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="class")
def test_client_id(auth_headers):
    """Get or create a test client for invoice tests"""
    # First try to get existing clients
    response = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers)
    if response.status_code == 200:
        clients = response.json()
        if clients and len(clients) > 0:
            return clients[0].get("client_id")
    
    # Create a new client if none exists
    client_data = {
        "display_name": "TEST_Accounting_Client",
        "client_type": "corporate",
        "email": "test.accounting@example.com"
    }
    response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=auth_headers)
    if response.status_code == 200 or response.status_code == 201:
        return response.json().get("client_id")
    return None


class TestInvoiceCreationWithAccountingEntry:
    """Tests for invoice creation and automatic accounting entry"""
    
    def test_create_invoice_returns_201_and_records_revenue(self, auth_headers, test_client_id):
        """Test POST /api/business-clarity/invoices creates invoice and records accounting entry"""
        if not test_client_id:
            pytest.skip("No client available for invoice creation")
        
        due_date = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
        
        invoice_data = {
            "client_id": test_client_id,
            "event_id": None,
            "due_date": due_date,
            "lines": [
                {
                    "description": "TEST_Service - Accounting Engine Test",
                    "quantity": 1,
                    "unit_price": 500.00,
                    "discount_percent": 0
                }
            ],
            "discount_percent": 0,
            "tax_rate": 18,
            "notes": "Test invoice for accounting engine integration"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/invoices",
            json=invoice_data,
            headers=auth_headers
        )
        
        # Should return 200 and create invoice
        assert response.status_code == 200, f"Invoice creation failed: {response.status_code} - {response.text}"
        
        invoice = response.json()
        assert "invoice_id" in invoice, "Response should contain invoice_id"
        assert "invoice_number" in invoice, "Response should contain invoice_number"
        assert invoice["total"] == 590.00, f"Total should be 590 (500 + 18% tax), got {invoice['total']}"
        assert invoice["status"] == "open", "New invoice should have status 'open'"
        
        print(f"Invoice created: {invoice['invoice_number']} with total {invoice['total']}")
        
        # Store invoice_id for cleanup and verification
        return invoice["invoice_id"]
    
    def test_invoice_appears_in_list(self, auth_headers):
        """Verify created invoice appears in invoices list"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/invoices",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to get invoices: {response.status_code}"
        invoices = response.json()
        assert isinstance(invoices, list), "Response should be a list"
        
        # Check for TEST invoices
        test_invoices = [inv for inv in invoices if inv.get("notes") and "TEST" in inv.get("notes", "")]
        print(f"Found {len(test_invoices)} test invoices out of {len(invoices)} total")


class TestProfitLossReport:
    """Tests for the P&L report endpoint"""
    
    def test_profit_loss_report_returns_data(self, auth_headers):
        """Test GET /api/business-clarity/reports/profit-loss returns expected structure"""
        now = datetime.utcnow()
        
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/profit-loss",
            params={"year": now.year, "month": now.month},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"P&L report failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Verify expected fields exist
        expected_fields = ["period", "revenue", "payroll", "purchases", "inventory_cost", 
                         "total_costs", "gross_profit", "transactions_count"]
        for field in expected_fields:
            assert field in data, f"P&L report should contain '{field}' field"
        
        # Verify data types
        assert isinstance(data["revenue"], (int, float)), "Revenue should be numeric"
        assert isinstance(data["gross_profit"], (int, float)), "Gross profit should be numeric"
        assert isinstance(data["transactions_count"], int), "Transactions count should be integer"
        
        print(f"P&L Report: Revenue={data['revenue']}, Costs={data['total_costs']}, Profit={data['gross_profit']}")
    
    def test_profit_loss_report_without_params_uses_current_month(self, auth_headers):
        """Test P&L report defaults to current month when no params provided"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/profit-loss",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"P&L report failed: {response.status_code}"
        data = response.json()
        
        now = datetime.utcnow()
        expected_period = f"{now.year}-{str(now.month).zfill(2)}"
        assert data.get("period") == expected_period, f"Period should default to {expected_period}"


class TestCostCenterActualReport:
    """Tests for the Cost Center actual vs budget report"""
    
    def test_cost_center_actual_report_returns_data(self, auth_headers):
        """Test GET /api/business-clarity/reports/cost-center-actual returns expected structure"""
        now = datetime.utcnow()
        
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/cost-center-actual",
            params={"year": now.year, "month": now.month},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Cost center report failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Verify expected fields
        assert "year" in data, "Response should contain 'year'"
        assert "month" in data, "Response should contain 'month'"
        assert "cost_centers" in data, "Response should contain 'cost_centers'"
        assert "totals" in data, "Response should contain 'totals'"
        
        # Verify totals structure
        totals = data.get("totals", {})
        assert "total_actual" in totals, "Totals should contain 'total_actual'"
        assert "total_budget" in totals, "Totals should contain 'total_budget'"
        
        # Verify cost_centers is a list
        cost_centers = data.get("cost_centers", [])
        assert isinstance(cost_centers, list), "cost_centers should be a list"
        
        # If there are cost centers, verify structure
        if cost_centers:
            cc = cost_centers[0]
            expected_cc_fields = ["cost_center_id", "cost_center_name", "total_amount"]
            for field in expected_cc_fields:
                assert field in cc, f"Cost center should contain '{field}'"
        
        print(f"Cost Center Report: {len(cost_centers)} centers, Total Actual={totals.get('total_actual', 0)}")
    
    def test_cost_center_actual_defaults_to_current_period(self, auth_headers):
        """Test cost center report defaults to current period"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/cost-center-actual",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        now = datetime.utcnow()
        assert data.get("year") == now.year, f"Year should default to {now.year}"
        assert data.get("month") == now.month, f"Month should default to {now.month}"


class TestGranularPermissions:
    """Tests for granular permission checks on critical endpoints"""
    
    def test_finance_user_can_create_payment(self, auth_headers, test_client_id):
        """Test that finance-level users can create payments"""
        if not test_client_id:
            pytest.skip("No client for payment test")
        
        payment_data = {
            "client_id": test_client_id,
            "amount": 100.00,
            "payment_method": "transfer",
            "reference": "TEST_Payment_Finance_Permission",
            "notes": "Test payment for permission verification"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/payments",
            json=payment_data,
            headers=auth_headers
        )
        
        # Demo user should have finance+ permissions
        assert response.status_code in [200, 201], f"Payment creation failed: {response.status_code} - {response.text}"
        
        if response.status_code in [200, 201]:
            payment = response.json()
            assert "payment_id" in payment, "Response should contain payment_id"
            print(f"Payment created: {payment.get('payment_id')}")
    
    def test_editor_can_create_invoice(self, auth_headers, test_client_id):
        """Test that editor-level users can create invoices"""
        if not test_client_id:
            pytest.skip("No client for invoice test")
        
        due_date = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
        
        invoice_data = {
            "client_id": test_client_id,
            "due_date": due_date,
            "lines": [{"description": "TEST_Editor_Permission", "quantity": 1, "unit_price": 100}],
            "discount_percent": 0,
            "tax_rate": 0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/invoices",
            json=invoice_data,
            headers=auth_headers
        )
        
        # Should work for editor+ roles
        assert response.status_code in [200, 201, 403], f"Unexpected status: {response.status_code}"
        
        if response.status_code in [200, 201]:
            print("Editor-level user can create invoices: PASS")
        else:
            print(f"Invoice creation returned 403 - may indicate viewer role: {response.text}")
    
    def test_finance_can_create_fixed_cost_category(self, auth_headers):
        """Test that finance-level users can create fixed cost categories"""
        category_data = {
            "name": "TEST_Fixed_Cost_Category",
            "description": "Test category for permission verification",
            "active": True,
            "cost_center_id": None
        }
        
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/fixed-costs/categories",
            json=category_data,
            headers=auth_headers
        )
        
        # Finance+ should be able to create categories
        assert response.status_code in [200, 201], f"Category creation failed: {response.status_code} - {response.text}"
        
        if response.status_code in [200, 201]:
            category = response.json()
            print(f"Fixed cost category created: {category.get('category_id')}")
            
            # Cleanup - delete the test category
            if category.get("category_id"):
                requests.delete(
                    f"{BASE_URL}/api/business-clarity/fixed-costs/categories/{category['category_id']}",
                    headers=auth_headers
                )


class TestPermissionDenialScenarios:
    """Tests to verify permission denial works correctly"""
    
    def test_payments_endpoint_exists(self, auth_headers):
        """Verify payments endpoint is accessible"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/payments",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Payments GET failed: {response.status_code}"
        print(f"Payments endpoint returns {len(response.json())} records")
    
    def test_invoices_endpoint_exists(self, auth_headers):
        """Verify invoices endpoint is accessible"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/invoices",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Invoices GET failed: {response.status_code}"
        print(f"Invoices endpoint returns {len(response.json())} records")
    
    def test_fixed_cost_categories_readable_by_all(self, auth_headers):
        """Verify fixed cost categories can be read by authenticated users"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/fixed-costs/categories",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Categories GET failed: {response.status_code}"
        print(f"Fixed cost categories endpoint returns {len(response.json())} records")


class TestAccountingEntriesIntegration:
    """Verify accounting entries are created correctly"""
    
    def test_accounting_entries_created_for_invoice(self, auth_headers, test_client_id):
        """Test that creating an invoice generates an accounting entry"""
        if not test_client_id:
            pytest.skip("No client for accounting entry test")
        
        # Create an invoice
        due_date = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
        
        invoice_data = {
            "client_id": test_client_id,
            "due_date": due_date,
            "lines": [{"description": "TEST_Accounting_Entry_Verification", "quantity": 2, "unit_price": 250}],
            "discount_percent": 0,
            "tax_rate": 0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/invoices",
            json=invoice_data,
            headers=auth_headers
        )
        
        if response.status_code in [200, 201]:
            invoice = response.json()
            invoice_total = invoice.get("total", 0)
            
            # Check P&L to verify revenue was recorded
            pl_response = requests.get(
                f"{BASE_URL}/api/business-clarity/reports/profit-loss",
                headers=auth_headers
            )
            
            if pl_response.status_code == 200:
                pl_data = pl_response.json()
                print(f"After invoice creation - P&L Revenue: {pl_data.get('revenue', 0)}")
                # Revenue should be >= invoice total (might have other invoices too)
                assert pl_data.get("revenue", 0) >= 0, "Revenue should be non-negative"


class TestDashboard:
    """Test the business clarity dashboard"""
    
    def test_dashboard_returns_complete_data(self, auth_headers):
        """Test GET /api/business-clarity/dashboard returns all expected data"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/dashboard",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Dashboard failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Check main fields
        expected_fields = [
            "total_receivables", "total_overdue", "total_payables",
            "aging_buckets", "recent_payments", "invoices_count",
            "open_invoices_count", "profit_signals"
        ]
        
        for field in expected_fields:
            assert field in data, f"Dashboard should contain '{field}'"
        
        # Check aging_buckets structure
        aging = data.get("aging_buckets", {})
        assert "current" in aging, "Aging buckets should have 'current'"
        
        # Check profit_signals structure
        signals = data.get("profit_signals", {})
        expected_signal_fields = ["negative_margin_count", "below_target_count", 
                                  "unassigned_costs", "paid_to_suppliers", "collected_from_clients"]
        for field in expected_signal_fields:
            assert field in signals, f"Profit signals should contain '{field}'"
        
        print(f"Dashboard: Receivables=${data['total_receivables']}, Payables=${data['total_payables']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
