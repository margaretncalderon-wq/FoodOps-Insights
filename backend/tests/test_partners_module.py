# Test Partners Module - CRUD operations and integration endpoints
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"

class TestPartnersModule:
    """Tests for Partners Module CRUD and integration endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session for tests"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth cookie
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return session
    
    @pytest.fixture(scope="class")
    def test_partner_id(self, auth_session):
        """Create a test partner for subsequent tests"""
        payload = {
            "partner_name": "TEST_Partner_Module",
            "legal_name": "TEST Legal Corp",
            "display_name": "Test Partner",
            "partner_type": "vendor",
            "status": "potential",
            "primary_category": "rentals",
            "email": "test@testpartner.com",
            "phone": "+1-555-0123",
            "hq_city": "Santo Domingo",
            "hq_country": "Dominican Republic"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/partners", json=payload)
        
        if response.status_code not in [200, 201]:
            pytest.skip(f"Failed to create test partner: {response.status_code}")
        
        data = response.json()
        yield data.get("partner_id")
        
        # Cleanup: delete the test partner
        auth_session.delete(f"{BASE_URL}/api/partners/{data.get('partner_id')}")
    
    # =================== GET /api/partners/options ===================
    def test_get_partner_options(self, auth_session):
        """Test GET /api/partners/options - should return dropdown options"""
        response = auth_session.get(f"{BASE_URL}/api/partners/options")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify all expected option types are present
        assert "status" in data, "Missing 'status' options"
        assert "preferred_tier" in data, "Missing 'preferred_tier' options"
        assert "partner_type" in data, "Missing 'partner_type' options"
        assert "primary_category" in data, "Missing 'primary_category' options"
        assert "service_area_type" in data, "Missing 'service_area_type' options"
        assert "pricing_level" in data, "Missing 'pricing_level' options"
        assert "capabilities" in data, "Missing 'capabilities' options"
        
        # Verify options have required structure
        assert len(data["status"]) > 0, "Status options should not be empty"
        assert len(data["partner_type"]) > 0, "Partner type options should not be empty"
        
        # Verify option structure
        first_status = data["status"][0]
        assert "value" in first_status, "Option missing 'value'"
        assert "label" in first_status, "Option missing 'label'"
        
        print(f"✓ Partner options loaded: {len(data.keys())} option types")
    
    # =================== GET /api/partners ===================
    def test_get_partners_list(self, auth_session):
        """Test GET /api/partners - should return partners list with pagination"""
        response = auth_session.get(f"{BASE_URL}/api/partners")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify response structure
        assert "partners" in data, "Missing 'partners' array"
        assert "total" in data, "Missing 'total' count"
        assert "skip" in data, "Missing 'skip' pagination"
        assert "limit" in data, "Missing 'limit' pagination"
        
        assert isinstance(data["partners"], list), "Partners should be an array"
        assert isinstance(data["total"], int), "Total should be an integer"
        
        print(f"✓ Partners list: {len(data['partners'])} partners, total: {data['total']}")
    
    def test_get_partners_with_filters(self, auth_session):
        """Test GET /api/partners with query filters"""
        # Test status filter
        response = auth_session.get(f"{BASE_URL}/api/partners?status=approved")
        assert response.status_code == 200, "Status filter failed"
        
        # Test search filter
        response = auth_session.get(f"{BASE_URL}/api/partners?search=test")
        assert response.status_code == 200, "Search filter failed"
        
        # Test pagination
        response = auth_session.get(f"{BASE_URL}/api/partners?skip=0&limit=10")
        assert response.status_code == 200, "Pagination failed"
        
        data = response.json()
        assert data["limit"] == 10, "Limit not applied correctly"
        
        print("✓ Partner filters working correctly")
    
    # =================== POST /api/partners ===================
    def test_create_partner(self, auth_session):
        """Test POST /api/partners - create a new partner"""
        payload = {
            "partner_name": "TEST_New_Partner",
            "legal_name": "TEST New Partner LLC",
            "partner_type": "supplier",
            "status": "potential",
            "primary_category": "florals",
            "email": "newpartner@test.com",
            "phone": "+1-555-9999",
            "hq_city": "Punta Cana",
            "hq_country": "Dominican Republic",
            "is_preferred": False,
            "pricing_level": "mid",
            "capabilities": ["floral_design", "event_design"]
        }
        
        response = auth_session.post(f"{BASE_URL}/api/partners", json=payload)
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify partner was created with correct data
        assert "partner_id" in data, "Missing partner_id"
        assert data["partner_name"] == payload["partner_name"], "Partner name mismatch"
        assert data["partner_type"] == payload["partner_type"], "Partner type mismatch"
        assert data["status"] == payload["status"], "Status mismatch"
        assert data["primary_category"] == payload["primary_category"], "Category mismatch"
        
        created_partner_id = data["partner_id"]
        
        # Verify by fetching the created partner
        get_response = auth_session.get(f"{BASE_URL}/api/partners/{created_partner_id}")
        assert get_response.status_code == 200, "Failed to fetch created partner"
        
        fetched_data = get_response.json()
        assert fetched_data["partner_name"] == payload["partner_name"], "Created partner data not persisted"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/partners/{created_partner_id}")
        
        print(f"✓ Partner created: {created_partner_id}")
    
    def test_create_partner_missing_name(self, auth_session):
        """Test POST /api/partners with missing required field"""
        payload = {
            "partner_type": "vendor",
            "status": "potential"
            # Missing partner_name
        }
        
        response = auth_session.post(f"{BASE_URL}/api/partners", json=payload)
        
        # Should fail validation
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        
        print("✓ Validation working: missing partner_name rejected")
    
    # =================== GET /api/partners/{partner_id} ===================
    def test_get_partner_by_id(self, auth_session, test_partner_id):
        """Test GET /api/partners/{partner_id} - get single partner"""
        response = auth_session.get(f"{BASE_URL}/api/partners/{test_partner_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert data["partner_id"] == test_partner_id, "Partner ID mismatch"
        assert "partner_name" in data, "Missing partner_name"
        assert "status" in data, "Missing status"
        assert "created_at" in data, "Missing created_at"
        assert "updated_at" in data, "Missing updated_at"
        
        print(f"✓ Partner fetched: {data['partner_name']}")
    
    def test_get_partner_not_found(self, auth_session):
        """Test GET /api/partners/{partner_id} with invalid ID"""
        response = auth_session.get(f"{BASE_URL}/api/partners/nonexistent_partner_123")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("✓ 404 returned for non-existent partner")
    
    # =================== PUT /api/partners/{partner_id} ===================
    def test_update_partner(self, auth_session, test_partner_id):
        """Test PUT /api/partners/{partner_id} - update partner"""
        update_payload = {
            "partner_name": "TEST_Updated_Partner_Name",
            "status": "approved",
            "is_preferred": True,
            "preferred_tier": "A"
        }
        
        response = auth_session.put(
            f"{BASE_URL}/api/partners/{test_partner_id}",
            json=update_payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert data["partner_name"] == update_payload["partner_name"], "Name not updated"
        assert data["status"] == update_payload["status"], "Status not updated"
        assert data["is_preferred"] == update_payload["is_preferred"], "is_preferred not updated"
        assert data["preferred_tier"] == update_payload["preferred_tier"], "preferred_tier not updated"
        
        # Verify update persisted by fetching
        get_response = auth_session.get(f"{BASE_URL}/api/partners/{test_partner_id}")
        fetched_data = get_response.json()
        assert fetched_data["partner_name"] == update_payload["partner_name"], "Update not persisted"
        
        print(f"✓ Partner updated: {test_partner_id}")
    
    # =================== DELETE /api/partners/{partner_id} ===================
    def test_delete_partner(self, auth_session):
        """Test DELETE /api/partners/{partner_id} - delete partner"""
        # Create partner to delete
        create_payload = {
            "partner_name": "TEST_Partner_To_Delete",
            "partner_type": "vendor",
            "status": "potential"
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/partners", json=create_payload)
        assert create_response.status_code in [200, 201], "Failed to create partner for deletion"
        
        partner_id = create_response.json()["partner_id"]
        
        # Delete the partner
        delete_response = auth_session.delete(f"{BASE_URL}/api/partners/{partner_id}")
        
        assert delete_response.status_code in [200, 204], f"Expected 200/204, got {delete_response.status_code}"
        
        # Verify deletion
        get_response = auth_session.get(f"{BASE_URL}/api/partners/{partner_id}")
        assert get_response.status_code == 404, "Deleted partner should return 404"
        
        print(f"✓ Partner deleted: {partner_id}")
    
    # =================== GET /api/partners/{partner_id}/financial-summary ===================
    def test_get_financial_summary_no_supplier(self, auth_session, test_partner_id):
        """Test GET /api/partners/{partner_id}/financial-summary without linked supplier"""
        response = auth_session.get(f"{BASE_URL}/api/partners/{test_partner_id}/financial-summary")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # When no supplier linked, should return zeros with no_linked_supplier flag
        assert data.get("no_linked_supplier") == True, "Should indicate no linked supplier"
        assert data["total_spent"] == 0, "Total spent should be 0"
        assert data["total_pending"] == 0, "Total pending should be 0"
        assert data["total_orders"] == 0, "Total orders should be 0"
        
        print("✓ Financial summary returns correct empty state for unlinked partner")
    
    # =================== GET /api/partners/{partner_id}/transactions ===================
    def test_get_partner_transactions(self, auth_session, test_partner_id):
        """Test GET /api/partners/{partner_id}/transactions"""
        response = auth_session.get(f"{BASE_URL}/api/partners/{test_partner_id}/transactions")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert "transactions" in data, "Missing transactions array"
        assert "total" in data, "Missing total count"
        assert "total_amount" in data, "Missing total_amount"
        assert "skip" in data, "Missing skip"
        assert "limit" in data, "Missing limit"
        
        assert isinstance(data["transactions"], list), "Transactions should be array"
        
        print(f"✓ Transactions endpoint: {len(data['transactions'])} records")
    
    # =================== GET /api/partners/{partner_id}/invoices ===================
    def test_get_partner_invoices(self, auth_session, test_partner_id):
        """Test GET /api/partners/{partner_id}/invoices"""
        response = auth_session.get(f"{BASE_URL}/api/partners/{test_partner_id}/invoices")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert "invoices" in data, "Missing invoices array"
        assert "total" in data, "Missing total"
        assert "total_amount" in data, "Missing total_amount"
        assert "pending_amount" in data, "Missing pending_amount"
        
        print(f"✓ Invoices endpoint: {len(data['invoices'])} records")
    
    # =================== GET /api/partners/stats ===================
    def test_get_partner_stats(self, auth_session):
        """Test GET /api/partners/stats - dashboard statistics"""
        response = auth_session.get(f"{BASE_URL}/api/partners/stats")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert "by_status" in data, "Missing by_status"
        assert "by_category" in data, "Missing by_category"
        assert "by_type" in data, "Missing by_type"
        assert "totals" in data, "Missing totals"
        
        totals = data["totals"]
        assert "total" in totals, "Missing totals.total"
        assert "preferred" in totals, "Missing totals.preferred"
        
        print(f"✓ Partner stats: {totals['total']} total partners")
    
    # =================== GET /api/partners/locations ===================
    def test_get_partner_locations(self, auth_session):
        """Test GET /api/partners/locations - location aggregations"""
        response = auth_session.get(f"{BASE_URL}/api/partners/locations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Data is organized by country > states > cities
        assert isinstance(data, dict), "Locations should be a dict"
        
        print(f"✓ Locations endpoint: {len(data.keys())} countries")
    
    # =================== Test with known partner ID ===================
    def test_get_known_partner(self, auth_session):
        """Test GET /api/partners/{partner_id} with provided test partner"""
        known_partner_id = "partner_386242788890"
        
        response = auth_session.get(f"{BASE_URL}/api/partners/{known_partner_id}")
        
        # Partner may or may not exist, handle both cases
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Known partner found: {data.get('partner_name')}")
        elif response.status_code == 404:
            print("✓ Known partner ID not found (may be in different org)")
        else:
            pytest.fail(f"Unexpected status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
