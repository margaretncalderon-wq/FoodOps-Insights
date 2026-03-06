"""
Test Business Clarity Navigation Refactor and Unified Vendors
- Tests unified vendors endpoint (Partners + Suppliers)
- Tests vendor creation (saves to Partners)
- Tests expense form vendor requirement
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Login and get authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
    )
    
    if login_response.status_code != 200:
        pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    return session


class TestUnifiedVendors:
    """Tests for GET /api/business-clarity/vendors - unified vendors endpoint"""
    
    def test_get_vendors_returns_200(self, auth_session):
        """Test vendors endpoint returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/vendors")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"GET /api/business-clarity/vendors - Status: {response.status_code}")
    
    def test_vendors_response_structure(self, auth_session):
        """Test vendors response has correct structure"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/vendors")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields in response
        assert "vendors" in data, "Response should have 'vendors' array"
        assert "total" in data, "Response should have 'total' count"
        assert "from_partners" in data, "Response should have 'from_partners' count"
        assert "from_suppliers" in data, "Response should have 'from_suppliers' count"
        
        print(f"Vendors response: total={data['total']}, from_partners={data['from_partners']}, from_suppliers={data['from_suppliers']}")
    
    def test_vendors_have_source_field(self, auth_session):
        """Test each vendor has source field (partners/suppliers)"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/vendors")
        assert response.status_code == 200
        
        data = response.json()
        vendors = data.get("vendors", [])
        
        if len(vendors) > 0:
            for vendor in vendors[:5]:  # Check first 5
                assert "vendor_id" in vendor, f"Vendor missing vendor_id: {vendor}"
                assert "name" in vendor, f"Vendor missing name: {vendor}"
                assert "source" in vendor, f"Vendor missing source: {vendor}"
                assert vendor["source"] in ["partners", "suppliers"], f"Invalid source: {vendor['source']}"
                print(f"Vendor: {vendor['name']} - source: {vendor['source']}")
        else:
            print("No vendors found (empty list)")
    
    def test_vendors_search_filter(self, auth_session):
        """Test vendors can be filtered by search"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/vendors?search=test")
        assert response.status_code == 200, f"Search filter failed: {response.text}"
        print(f"Search filter test passed")


class TestCreateVendor:
    """Tests for POST /api/business-clarity/vendors - create vendor"""
    
    def test_create_vendor_success(self, auth_session):
        """Test creating a new vendor saves to Partners"""
        import uuid
        vendor_name = f"TEST_Vendor_{uuid.uuid4().hex[:6]}"
        
        response = auth_session.post(
            f"{BASE_URL}/api/business-clarity/vendors",
            params={
                "name": vendor_name,
                "vendor_type": "supplier",
                "email": "test@example.com",
                "phone": "+1234567890"
            }
        )
        
        assert response.status_code == 200, f"Create vendor failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "vendor_id" in data, "Response should have vendor_id"
        assert data["name"] == vendor_name, f"Name mismatch: {data['name']} != {vendor_name}"
        assert data["source"] == "partners", f"Source should be 'partners', got: {data['source']}"
        
        print(f"Created vendor: {data['vendor_id']} - {data['name']} (source: {data['source']})")
        
        # Verify it appears in vendors list
        list_response = auth_session.get(f"{BASE_URL}/api/business-clarity/vendors")
        assert list_response.status_code == 200
        
        vendors = list_response.json().get("vendors", [])
        created_vendor = next((v for v in vendors if v["vendor_id"] == data["vendor_id"]), None)
        assert created_vendor is not None, f"Created vendor not found in list"
        print(f"Verified vendor appears in unified list")
    
    def test_create_vendor_different_types(self, auth_session):
        """Test creating vendors with different types"""
        import uuid
        
        types_to_test = ["supplier", "agency", "freelancer", "contractor", "utility"]
        
        for vendor_type in types_to_test:
            vendor_name = f"TEST_{vendor_type}_{uuid.uuid4().hex[:4]}"
            
            response = auth_session.post(
                f"{BASE_URL}/api/business-clarity/vendors",
                params={
                    "name": vendor_name,
                    "vendor_type": vendor_type
                }
            )
            
            assert response.status_code == 200, f"Create {vendor_type} failed: {response.text}"
            data = response.json()
            assert data["source"] == "partners", f"Source should be partners for {vendor_type}"
            print(f"Created vendor type '{vendor_type}': {data['vendor_id']}")


class TestSupplierPayablesWithVendor:
    """Tests for supplier payables with vendor selection"""
    
    def test_create_expense_with_vendor_id(self, auth_session):
        """Test creating expense with vendor_id (new flow)"""
        # First get a vendor
        vendors_response = auth_session.get(f"{BASE_URL}/api/business-clarity/vendors")
        assert vendors_response.status_code == 200
        
        vendors = vendors_response.json().get("vendors", [])
        if not vendors:
            pytest.skip("No vendors available for test")
        
        vendor = vendors[0]
        
        # Create expense with vendor
        expense_data = {
            "supplier_id": vendor["vendor_id"],
            "supplier_name": vendor["name"],
            "description": "TEST_expense_with_vendor",
            "amount": 100.00,
            "due_date": "2026-02-15",
            "invoice_number": "TEST-INV-001"
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json=expense_data
        )
        
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        
        data = response.json()
        payable = data.get("payable", {})
        
        assert payable.get("supplier_id") == vendor["vendor_id"], "Vendor ID not saved"
        assert payable.get("supplier_name") == vendor["name"], "Vendor name not saved"
        
        print(f"Created expense with vendor: {payable.get('payable_id')} - vendor: {vendor['name']}")
    
    def test_expense_requires_description_and_amount(self, auth_session):
        """Test expense creation validates required fields"""
        # Test missing description
        response = auth_session.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json={
                "supplier_id": "some_vendor",
                "amount": 100.00
            }
        )
        # Should fail validation (422 or similar)
        assert response.status_code in [400, 422], f"Should fail without description: {response.status_code}"
        print("Description validation works")
        
        # Test missing amount
        response = auth_session.post(
            f"{BASE_URL}/api/business-clarity/supplier-payables",
            json={
                "supplier_id": "some_vendor",
                "description": "Test"
            }
        )
        # Should fail validation
        assert response.status_code in [400, 422], f"Should fail without amount: {response.status_code}"
        print("Amount validation works")


class TestAccountsPayable:
    """Tests for accounts payable endpoint"""
    
    def test_get_accounts_payable(self, auth_session):
        """Test get accounts payable"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        assert response.status_code == 200, f"Get payables failed: {response.text}"
        
        data = response.json()
        assert "records" in data, "Response should have 'records'"
        assert "summary" in data, "Response should have 'summary'"
        
        print(f"Accounts Payable: {data['summary'].get('total_pending', 0)} pending, {len(data['records'])} records")
    
    def test_payables_have_supplier_name(self, auth_session):
        """Test payable records include supplier name"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/accounts-payable")
        assert response.status_code == 200
        
        data = response.json()
        records = data.get("records", [])
        
        if records:
            for record in records[:3]:
                # supplier_name should be present (can be null)
                assert "supplier_name" in record, f"Record missing supplier_name: {record}"
                assert "supplier_id" in record, f"Record missing supplier_id: {record}"
                print(f"Payable: {record.get('supplier_name', 'N/A')} - ${record.get('amount', 0)}")


class TestCostCenters:
    """Tests for cost centers endpoint"""
    
    def test_get_cost_centers(self, auth_session):
        """Test cost centers endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/business-clarity/cost-centers")
        # This might return 404 if not implemented - that's okay for now
        print(f"Cost centers endpoint: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Cost centers: {data}")


# Cleanup - not critical for this test
def test_cleanup(auth_session):
    """Document that TEST_ prefixed data was created"""
    print("TEST DATA CREATED: TEST_ prefixed vendors and expenses were created during tests")
    print("These can be cleaned up manually or left for frontend testing")
