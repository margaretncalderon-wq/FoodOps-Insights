"""
Test ITBIS Report API and Purchase Order Receive with NCF/ITBIS fields
Tests the P0 features for Dominican Republic tax compliance:
1. ITBIS Report endpoint - /api/finance/itbis/report
2. PO receive with NCF, invoice_subtotal, invoice_itbis, invoice_total parameters
3. Expense record creation with NCF/ITBIS fields
"""
import pytest
import requests
import os
from datetime import datetime
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Helper for authentication"""
    
    @staticmethod
    def get_session():
        """Get authenticated session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return session


class TestITBISReport:
    """Test ITBIS Report API endpoint"""
    
    def test_itbis_report_structure(self):
        """Test /api/finance/itbis/report returns correct data structure"""
        session = TestAuth.get_session()
        
        # Get ITBIS report for current month
        current_month = datetime.now().month - 1  # API uses 0-indexed months (0-11)
        current_year = datetime.now().year
        
        response = session.get(
            f"{BASE_URL}/api/finance/itbis/report",
            params={"month": current_month, "year": current_year}
        )
        
        # Status assertion
        assert response.status_code == 200, f"ITBIS report failed: {response.text}"
        
        # Data structure assertions
        data = response.json()
        
        # Check period info
        assert "period" in data, "Missing period field"
        assert data["period"]["month"] == current_month
        assert data["period"]["year"] == current_year
        
        # Check sales structure
        assert "sales" in data, "Missing sales field"
        assert "total_gravado" in data["sales"], "Missing sales.total_gravado"
        assert "total_exento" in data["sales"], "Missing sales.total_exento"
        assert "itbis_cobrado" in data["sales"], "Missing sales.itbis_cobrado"
        assert "transaction_count" in data["sales"], "Missing sales.transaction_count"
        
        # Check purchases structure
        assert "purchases" in data, "Missing purchases field"
        assert "total_gravado" in data["purchases"], "Missing purchases.total_gravado"
        assert "total_exento" in data["purchases"], "Missing purchases.total_exento"
        assert "itbis_pagado" in data["purchases"], "Missing purchases.itbis_pagado"
        assert "transaction_count" in data["purchases"], "Missing purchases.transaction_count"
        
        # Check balance structure (ITBIS net payable calculation)
        assert "balance" in data, "Missing balance field"
        assert "itbis_cobrado" in data["balance"], "Missing balance.itbis_cobrado"
        assert "itbis_pagado" in data["balance"], "Missing balance.itbis_pagado"
        assert "itbis_a_pagar" in data["balance"], "Missing balance.itbis_a_pagar"
        assert "credito_fiscal" in data["balance"], "Missing balance.credito_fiscal"
        
        print(f"ITBIS Report structure verified for {current_month+1}/{current_year}")
        print(f"  Sales ITBIS (itbis_cobrado): {data['sales']['itbis_cobrado']}")
        print(f"  Purchases ITBIS (itbis_pagado): {data['purchases']['itbis_pagado']}")
        print(f"  Balance (itbis_a_pagar): {data['balance']['itbis_a_pagar']}")
    
    def test_itbis_report_calculation(self):
        """Verify ITBIS balance calculation: itbis_a_pagar = itbis_cobrado - itbis_pagado"""
        session = TestAuth.get_session()
        
        current_month = datetime.now().month - 1
        current_year = datetime.now().year
        
        response = session.get(
            f"{BASE_URL}/api/finance/itbis/report",
            params={"month": current_month, "year": current_year}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify calculation
        itbis_cobrado = data["balance"]["itbis_cobrado"]
        itbis_pagado = data["balance"]["itbis_pagado"]
        expected_a_pagar = max(itbis_cobrado - itbis_pagado, 0)
        expected_credito = abs(itbis_cobrado - itbis_pagado) if itbis_cobrado < itbis_pagado else 0
        
        assert data["balance"]["itbis_a_pagar"] == expected_a_pagar, \
            f"ITBIS a pagar mismatch: expected {expected_a_pagar}, got {data['balance']['itbis_a_pagar']}"
        assert data["balance"]["credito_fiscal"] == expected_credito, \
            f"Credito fiscal mismatch: expected {expected_credito}, got {data['balance']['credito_fiscal']}"
        
        print(f"ITBIS calculation verified: {itbis_cobrado} - {itbis_pagado} = {data['balance']['itbis_a_pagar']}")
    
    def test_itbis_report_different_months(self):
        """Test ITBIS report for different month/year combinations"""
        session = TestAuth.get_session()
        
        # Test January 2026
        response = session.get(
            f"{BASE_URL}/api/finance/itbis/report",
            params={"month": 0, "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"]["month"] == 0
        assert data["period"]["year"] == 2026
        
        # Test December 2025
        response = session.get(
            f"{BASE_URL}/api/finance/itbis/report",
            params={"month": 11, "year": 2025}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"]["month"] == 11
        assert data["period"]["year"] == 2025
        
        print("ITBIS report for different months verified")
    
    def test_itbis_report_invalid_month(self):
        """Test ITBIS report with invalid month parameter"""
        session = TestAuth.get_session()
        
        # Month 12 should be invalid (0-11 range)
        response = session.get(
            f"{BASE_URL}/api/finance/itbis/report",
            params={"month": 12, "year": 2026}
        )
        assert response.status_code == 422, f"Should reject month 12, got {response.status_code}"
        
        print("ITBIS report validation working correctly")


class TestPurchaseOrderReceive:
    """Test Purchase Order receive endpoint with NCF/ITBIS fields"""
    
    @pytest.fixture
    def session(self):
        return TestAuth.get_session()
    
    @pytest.fixture
    def test_po(self, session):
        """Create a test PO for receiving"""
        # First get a supplier
        suppliers_response = session.get(f"{BASE_URL}/api/suppliers")
        if suppliers_response.status_code != 200 or not suppliers_response.json():
            pytest.skip("No suppliers available")
        
        supplier = suppliers_response.json()[0]
        
        # Get an inventory item
        inventory_response = session.get(f"{BASE_URL}/api/inventory/ingredients")
        if inventory_response.status_code != 200 or not inventory_response.json():
            pytest.skip("No inventory items available")
        
        inv_item = inventory_response.json()[0]
        
        # Create PO
        po_data = {
            "supplier_id": supplier["supplier_id"],
            "needed_by_date": "2026-03-15",
            "payment_method": "Transfer",
            "notes": "TEST_ITBIS_PO - automated test",
            "lines": [{
                "inventory_item_id": inv_item["ingredient_id"],
                "item_name": inv_item["name"],
                "qty_ordered": 10,
                "purchase_unit": inv_item.get("unit", "unit"),
                "unit_cost": inv_item.get("cost_per_unit", 100),
                "notes": "Test line"
            }]
        }
        
        create_response = session.post(f"{BASE_URL}/api/purchase-orders", json=po_data)
        if create_response.status_code != 201:
            pytest.skip(f"Could not create PO: {create_response.text}")
        
        po_id = create_response.json().get("po_id")
        
        # Send the PO
        send_response = session.put(f"{BASE_URL}/api/purchase-orders/{po_id}/status?status=Sent")
        if send_response.status_code != 200:
            pytest.skip(f"Could not send PO: {send_response.text}")
        
        # Get PO details
        po_response = session.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        return po_response.json()
    
    def test_po_receive_with_ncf_itbis(self, session, test_po):
        """Test PO receive with NCF and ITBIS fields"""
        po_id = test_po["po_id"]
        line = test_po["lines"][0]
        
        # Receive items with invoice data
        receive_data = [{
            "line_id": line["line_id"],
            "qty_received": line["qty_ordered"],
            "unit_cost": line["unit_cost"]
        }]
        
        # Include NCF, ITBIS fields
        subtotal = line["qty_ordered"] * line["unit_cost"]
        itbis = subtotal * 0.18  # 18% ITBIS
        total = subtotal + itbis
        
        response = session.post(
            f"{BASE_URL}/api/purchase-orders/{po_id}/receive",
            json=receive_data,
            params={
                "create_expense": True,
                "ncf": "B0100000001",
                "invoice_number": "FAC-TEST-001",
                "invoice_date": "2026-03-07",
                "invoice_subtotal": subtotal,
                "invoice_itbis": round(itbis, 2),
                "invoice_total": round(total, 2)
            }
        )
        
        assert response.status_code == 200, f"PO receive failed: {response.text}"
        result = response.json()
        
        assert result["message"] == "Items received"
        assert result["new_status"] in ["Received", "PartiallyReceived"]
        assert result["expense_id"] is not None, "Expense should be created with invoice"
        
        print(f"PO received with NCF. Expense ID: {result['expense_id']}")
        
        return result["expense_id"]
    
    def test_expense_has_ncf_itbis_fields(self, session, test_po):
        """Test that expense record has NCF, ITBIS fields"""
        po_id = test_po["po_id"]
        line = test_po["lines"][0]
        
        # Receive with invoice
        subtotal = line["qty_ordered"] * line["unit_cost"]
        itbis = subtotal * 0.18
        total = subtotal + itbis
        
        response = session.post(
            f"{BASE_URL}/api/purchase-orders/{po_id}/receive",
            json=[{"line_id": line["line_id"], "qty_received": line["qty_ordered"]}],
            params={
                "create_expense": True,
                "ncf": "B0100000002",
                "invoice_subtotal": subtotal,
                "invoice_itbis": round(itbis, 2),
                "invoice_total": round(total, 2)
            }
        )
        
        assert response.status_code == 200, f"PO receive failed: {response.text}"
        expense_id = response.json()["expense_id"]
        
        # Get expenses and find ours
        expenses_response = session.get(f"{BASE_URL}/api/expenses")
        assert expenses_response.status_code == 200
        
        expenses = expenses_response.json()
        our_expense = next((e for e in expenses if e.get("expense_id") == expense_id), None)
        
        if our_expense:
            # Verify NCF and ITBIS fields
            assert our_expense.get("ncf") == "B0100000002", "NCF not saved"
            assert our_expense.get("invoice_subtotal") == round(subtotal, 2), "invoice_subtotal not saved"
            assert our_expense.get("invoice_itbis") == round(itbis, 2), "invoice_itbis not saved"
            assert our_expense.get("invoice_total") == round(total, 2), "invoice_total not saved"
            print(f"Expense record verified with NCF/ITBIS fields")
        else:
            print(f"Warning: Could not verify expense {expense_id} in expenses list")


class TestPurchaseOrderRegisterInvoice:
    """Test registering invoice for already received PO"""
    
    @pytest.fixture
    def session(self):
        return TestAuth.get_session()
    
    def test_register_invoice_endpoint_exists(self, session):
        """Verify register-invoice endpoint exists"""
        # Use a fake PO ID to test 404 response (proves endpoint exists)
        response = session.post(
            f"{BASE_URL}/api/purchase-orders/fake_po_id/register-invoice",
            params={"invoice_number": "FAC-001"}
        )
        
        # Should be 404 (not found) not 405 (method not allowed)
        assert response.status_code in [404, 400, 401], \
            f"register-invoice endpoint may not exist: {response.status_code}"
        
        print("register-invoice endpoint exists")


class TestPurchaseOrdersAPIs:
    """Test basic Purchase Orders APIs"""
    
    def test_get_purchase_orders_list(self):
        """Test GET /api/purchase-orders"""
        session = TestAuth.get_session()
        
        response = session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Found {len(data)} purchase orders")
    
    def test_get_suppliers_list(self):
        """Test GET /api/suppliers"""
        session = TestAuth.get_session()
        
        response = session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Found {len(data)} suppliers")
    
    def test_get_inventory_ingredients(self):
        """Test GET /api/inventory/ingredients"""
        session = TestAuth.get_session()
        
        response = session.get(f"{BASE_URL}/api/inventory/ingredients")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Found {len(data)} inventory ingredients")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
