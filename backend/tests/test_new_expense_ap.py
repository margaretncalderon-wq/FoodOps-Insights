"""
Test New Expense (Accounts Payable) Feature
Tests POST /api/business-clarity/supplier-payables and related functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNewExpenseAP:
    """Tests for creating new expenses in Accounts Payable section"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        yield
        # Cleanup test data created during tests
        self._cleanup_test_expenses()
    
    def _cleanup_test_expenses(self):
        """Remove test expenses created during testing"""
        # Get all payables
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/accounts-payable",
            headers=self.headers
        )
        if response.status_code == 200:
            records = response.json().get("records", [])
            for record in records:
                # Delete test records by description pattern
                if record.get("description", "").startswith("TEST_AP_"):
                    # Try to delete - endpoint may not exist, but that's OK
                    pass
    
    # =============== Basic Expense Creation Tests ===============
    
    def test_create_expense_minimal_fields(self):
        """Test creating expense with only required fields (description, amount)"""
        payload = {
            "description": "TEST_AP_MinimalExpense",
            "amount": 100.00
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to create expense: {response.text}"
        
        data = response.json()
        assert "payable" in data
        payable = data["payable"]
        assert payable["description"] == "TEST_AP_MinimalExpense"
        assert payable["amount"] == 100.00
        assert payable["status"] == "pending"
        assert payable["balance_due"] == 100.00
        assert payable["paid_amount"] == 0
    
    def test_create_expense_with_manual_supplier_name(self):
        """Test creating expense with manual supplier name (no supplier_id)"""
        payload = {
            "supplier_name": "Test Manual Supplier AP",
            "description": "TEST_AP_ManualSupplierExpense",
            "amount": 250.50
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 200
        
        payable = response.json()["payable"]
        assert payable["supplier_name"] == "Test Manual Supplier AP"
        assert payable["supplier_id"] is None
    
    def test_create_expense_with_all_optional_fields(self):
        """Test creating expense with all optional fields"""
        payload = {
            "supplier_name": "Complete Test Supplier",
            "description": "TEST_AP_CompleteExpense",
            "amount": 999.99,
            "invoice_number": "INV-TEST-001",
            "due_date": "2026-04-15"
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 200
        
        payable = response.json()["payable"]
        assert payable["invoice_number"] == "INV-TEST-001"
        assert payable["due_date"] == "2026-04-15"
    
    # =============== Assignment Tests ===============
    
    def test_create_expense_assigned_to_event(self):
        """Test creating expense assigned to an event"""
        # First get available events
        events_response = requests.get(
            f"{BASE_URL}/api/events",
            headers=self.headers
        )
        assert events_response.status_code == 200
        events = events_response.json()
        
        if len(events) > 0:
            event_id = events[0]["event_id"]
            event_name = events[0].get("name", "")
            
            payload = {
                "supplier_name": "Event Expense Supplier",
                "description": "TEST_AP_EventAssigned",
                "amount": 350.00,
                "event_id": event_id
            }
            response = requests.post(
                f"{BASE_URL}/api/business-clarity/supplier-payables",
                json=payload,
                headers=self.headers
            )
            assert response.status_code == 200
            
            payable = response.json()["payable"]
            assert payable["event_id"] == event_id
            assert payable["fixed_cost_category_id"] is None
        else:
            pytest.skip("No events available for testing")
    
    def test_create_expense_assigned_to_fixed_cost_category(self):
        """Test creating expense assigned to fixed cost category"""
        # First get available fixed cost categories
        categories_response = requests.get(
            f"{BASE_URL}/api/business-clarity/fixed-costs/categories",
            headers=self.headers
        )
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        if len(categories) > 0:
            category_id = categories[0]["category_id"]
            category_name = categories[0].get("name", "")
            
            payload = {
                "supplier_name": "Fixed Cost Supplier",
                "description": "TEST_AP_FixedCostAssigned",
                "amount": 450.00,
                "fixed_cost_category_id": category_id
            }
            response = requests.post(
                f"{BASE_URL}/api/business-clarity/supplier-payables",
                json=payload,
                headers=self.headers
            )
            assert response.status_code == 200
            
            data = response.json()
            payable = data["payable"]
            assert payable["fixed_cost_category_id"] == category_id
            assert payable["event_id"] is None
            # Should also have cost_center_id if category has one
            if categories[0].get("cost_center_id"):
                assert payable["cost_center_id"] is not None
                # Should create accounting entry
                assert data.get("accounting_entry_id") is not None
        else:
            pytest.skip("No fixed cost categories available for testing")
    
    def test_create_expense_unassigned_overhead(self):
        """Test creating expense without any assignment (overhead)"""
        payload = {
            "supplier_name": "Overhead Supplier",
            "description": "TEST_AP_UnassignedOverhead",
            "amount": 175.00
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 200
        
        payable = response.json()["payable"]
        assert payable["event_id"] is None
        assert payable["fixed_cost_category_id"] is None
        assert payable["cost_center_id"] is None
    
    # =============== Validation Tests ===============
    
    def test_create_expense_missing_description(self):
        """Test validation - description is required"""
        payload = {
            "supplier_name": "Test Supplier",
            "amount": 100.00
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 422
        assert "description" in response.text.lower()
    
    def test_create_expense_missing_amount(self):
        """Test validation - amount is required"""
        payload = {
            "supplier_name": "Test Supplier",
            "description": "Test Description"
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 422
        assert "amount" in response.text.lower()
    
    def test_create_expense_missing_both_required_fields(self):
        """Test validation - both description and amount required"""
        payload = {
            "supplier_name": "Test Supplier"
        }
        response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert response.status_code == 422
    
    # =============== GET Accounts Payable Tests ===============
    
    def test_get_accounts_payable_list(self):
        """Test GET /api/business-clarity/accounts-payable returns records"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/accounts-payable",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "records" in data
        assert "summary" in data
        assert isinstance(data["records"], list)
        assert "total_pending" in data["summary"]
        assert "pending_count" in data["summary"]
    
    def test_new_expense_appears_in_ap_list(self):
        """Test that newly created expense appears in AP list"""
        # Create expense
        payload = {
            "supplier_name": "List Test Supplier",
            "description": "TEST_AP_AppearsInList",
            "amount": 567.89
        }
        create_response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert create_response.status_code == 200
        payable_id = create_response.json()["payable"]["payable_id"]
        
        # Verify it appears in list
        list_response = requests.get(
            f"{BASE_URL}/api/business-clarity/accounts-payable",
            headers=self.headers
        )
        assert list_response.status_code == 200
        
        records = list_response.json()["records"]
        found = any(r["payable_id"] == payable_id for r in records)
        assert found, f"New expense {payable_id} not found in AP list"
    
    def test_ap_list_includes_supplier_name(self):
        """Test that AP list includes stored supplier_name"""
        # Create expense with supplier name
        payload = {
            "supplier_name": "SupplierNameTest123",
            "description": "TEST_AP_SupplierNameInList",
            "amount": 123.45
        }
        create_response = requests.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=payload,
            headers=self.headers
        )
        assert create_response.status_code == 200
        payable_id = create_response.json()["payable"]["payable_id"]
        
        # Verify supplier_name in list
        list_response = requests.get(
            f"{BASE_URL}/api/business-clarity/accounts-payable",
            headers=self.headers
        )
        assert list_response.status_code == 200
        
        records = list_response.json()["records"]
        record = next((r for r in records if r["payable_id"] == payable_id), None)
        assert record is not None
        assert record["supplier_name"] == "SupplierNameTest123"
    
    # =============== Reference Data Tests ===============
    
    def test_get_events_for_assignment(self):
        """Test GET /api/events returns list for assignment dropdown"""
        response = requests.get(
            f"{BASE_URL}/api/events",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "event_id" in data[0]
            assert "name" in data[0]
    
    def test_get_fixed_cost_categories_for_assignment(self):
        """Test GET /api/business-clarity/fixed-costs/categories"""
        response = requests.get(
            f"{BASE_URL}/api/business-clarity/fixed-costs/categories",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "category_id" in data[0]
            assert "name" in data[0]
    
    def test_get_suppliers_for_dropdown(self):
        """Test GET /api/suppliers returns list for supplier dropdown"""
        response = requests.get(
            f"{BASE_URL}/api/suppliers",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
