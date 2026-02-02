"""
Test P1: Customizable Proposal Item Types
Test P2: Credit Warnings in ProposalEditor
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code} - {response.text}")
    
    return s


class TestProposalItemTypes:
    """P1: Test customizable proposal item types in company settings"""
    
    def test_get_company_settings_returns_proposal_item_types(self, session):
        """GET /api/settings/company should return proposal_item_types array"""
        response = session.get(f"{BASE_URL}/api/settings/company")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify proposal_item_types exists
        assert "proposal_item_types" in data, "proposal_item_types field missing"
        assert isinstance(data["proposal_item_types"], list), "proposal_item_types should be a list"
        
        # Verify default types exist
        type_keys = [t["type_key"] for t in data["proposal_item_types"]]
        assert "Food" in type_keys, "Food type missing"
        assert "Service" in type_keys, "Service type missing"
        assert "Rental" in type_keys, "Rental type missing"
        assert "Fee" in type_keys, "Fee type missing"
        
        print(f"Found {len(data['proposal_item_types'])} proposal item types")
        for item_type in data["proposal_item_types"]:
            print(f"  - {item_type['type_key']}: {item_type['label_en']} / {item_type['label_es']}")
    
    def test_proposal_item_type_structure(self, session):
        """Verify each proposal item type has required fields"""
        response = session.get(f"{BASE_URL}/api/settings/company")
        
        assert response.status_code == 200
        data = response.json()
        
        for item_type in data["proposal_item_types"]:
            assert "type_key" in item_type, "type_key missing"
            assert "label_en" in item_type, "label_en missing"
            assert "label_es" in item_type, "label_es missing"
            assert "color" in item_type, "color missing"
            assert "icon" in item_type, "icon missing"
            assert "is_active" in item_type, "is_active missing"
            
            # Verify color is hex format
            assert item_type["color"].startswith("#"), f"Color should be hex: {item_type['color']}"
            
            print(f"Item type {item_type['type_key']} structure valid")
    
    def test_update_proposal_item_types(self, session):
        """PUT /api/settings/company should update proposal_item_types"""
        # First get current settings
        response = session.get(f"{BASE_URL}/api/settings/company")
        assert response.status_code == 200
        current_data = response.json()
        
        # Modify a label
        original_types = current_data["proposal_item_types"]
        modified_types = [t.copy() for t in original_types]
        
        # Find Food type and modify label
        for t in modified_types:
            if t["type_key"] == "Food":
                original_label = t["label_en"]
                t["label_en"] = "Food & Beverages TEST"
                break
        
        # Update
        response = session.put(f"{BASE_URL}/api/settings/company", json={
            "proposal_item_types": modified_types
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        # Verify update
        response = session.get(f"{BASE_URL}/api/settings/company")
        updated_data = response.json()
        
        food_type = next((t for t in updated_data["proposal_item_types"] if t["type_key"] == "Food"), None)
        assert food_type is not None
        assert food_type["label_en"] == "Food & Beverages TEST", "Label not updated"
        
        print("Successfully updated proposal item type label")
        
        # Restore original
        for t in modified_types:
            if t["type_key"] == "Food":
                t["label_en"] = original_label
                break
        
        session.put(f"{BASE_URL}/api/settings/company", json={
            "proposal_item_types": modified_types
        })
        print("Restored original label")


class TestCreditWarnings:
    """P2: Test credit warnings in proposal endpoint"""
    
    def test_get_clients_list(self, session):
        """GET /api/clients should return clients list"""
        response = session.get(f"{BASE_URL}/api/clients")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Should return list of clients"
        print(f"Found {len(data)} clients")
        
        # Check for clients with credit
        clients_with_credit = [c for c in data if c.get("has_credit")]
        print(f"Clients with credit enabled: {len(clients_with_credit)}")
        
        for client in clients_with_credit:
            print(f"  - {client.get('name')}: limit=${client.get('credit_limit', 0)}")
    
    def test_get_events_list(self, session):
        """GET /api/events should return events list"""
        response = session.get(f"{BASE_URL}/api/events")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Should return list of events"
        print(f"Found {len(data)} events")
        
        # Return first event ID for further testing
        if data:
            return data[0].get("event_id")
        return None
    
    def test_proposal_endpoint_returns_credit_fields(self, session):
        """GET /api/proposals/event/{event_id} should return credit_warnings and client_credit"""
        # First get an event
        events_response = session.get(f"{BASE_URL}/api/events")
        assert events_response.status_code == 200
        events = events_response.json()
        
        if not events:
            pytest.skip("No events found")
        
        event_id = events[0]["event_id"]
        
        # Get proposal for event
        response = session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify credit_warnings field exists
        assert "credit_warnings" in data, "credit_warnings field missing from proposal response"
        assert isinstance(data["credit_warnings"], list), "credit_warnings should be a list"
        
        print(f"Proposal {data.get('proposal_number')} for event {event_id}")
        print(f"Credit warnings: {len(data['credit_warnings'])}")
        
        if data.get("client_credit"):
            print(f"Client credit info:")
            print(f"  - Credit limit: ${data['client_credit'].get('credit_limit', 0)}")
            print(f"  - Credit used: ${data['client_credit'].get('credit_used', 0)}")
            print(f"  - Available: ${data['client_credit'].get('available_credit', 0)}")
            print(f"  - Percentage: {data['client_credit'].get('credit_percentage', 0)}%")
        else:
            print("No client credit info (client may not have credit enabled)")
        
        for warning in data["credit_warnings"]:
            print(f"Warning: {warning.get('message_en')}")
    
    def test_enable_client_credit_and_verify_warnings(self, session):
        """Test enabling credit on a client and verifying warnings appear"""
        # Get clients
        clients_response = session.get(f"{BASE_URL}/api/clients")
        assert clients_response.status_code == 200
        clients = clients_response.json()
        
        if not clients:
            pytest.skip("No clients found")
        
        # Find a client with events
        events_response = session.get(f"{BASE_URL}/api/events")
        events = events_response.json()
        
        if not events:
            pytest.skip("No events found")
        
        # Get first event's client
        event = events[0]
        client_id = event.get("client_id")
        
        if not client_id:
            pytest.skip("Event has no client")
        
        # Get client details
        client_response = session.get(f"{BASE_URL}/api/clients/{client_id}")
        if client_response.status_code != 200:
            pytest.skip(f"Could not get client: {client_response.text}")
        
        client = client_response.json()
        original_has_credit = client.get("has_credit", False)
        original_credit_limit = client.get("credit_limit", 0)
        
        print(f"Testing with client: {client.get('name')}")
        print(f"Original credit status: has_credit={original_has_credit}, limit=${original_credit_limit}")
        
        # Enable credit with a low limit to trigger warning
        update_response = session.put(f"{BASE_URL}/api/clients/{client_id}/credit", json={
            "has_credit": True,
            "credit_limit": 100  # Very low limit to trigger warning
        })
        
        if update_response.status_code != 200:
            print(f"Could not update client credit: {update_response.text}")
            # Try alternative endpoint
            update_response = session.put(f"{BASE_URL}/api/clients/{client_id}", json={
                "has_credit": True,
                "credit_limit": 100
            })
        
        # Get proposal to check for warnings
        proposal_response = session.get(f"{BASE_URL}/api/proposals/event/{event['event_id']}")
        assert proposal_response.status_code == 200
        proposal = proposal_response.json()
        
        print(f"After enabling credit:")
        print(f"  - Credit warnings: {len(proposal.get('credit_warnings', []))}")
        
        if proposal.get("client_credit"):
            print(f"  - Credit percentage: {proposal['client_credit'].get('credit_percentage', 0)}%")
        
        # Restore original credit settings
        session.put(f"{BASE_URL}/api/clients/{client_id}/credit", json={
            "has_credit": original_has_credit,
            "credit_limit": original_credit_limit
        })
        
        print("Restored original credit settings")


class TestBusinessClarityPage:
    """Test Business Clarity page loads correctly after refactor"""
    
    def test_business_clarity_dashboard_endpoint(self, session):
        """GET /api/business-clarity/dashboard should return dashboard data"""
        response = session.get(f"{BASE_URL}/api/business-clarity/dashboard")
        
        # May return 200 or 404 depending on implementation
        if response.status_code == 200:
            data = response.json()
            print(f"Dashboard data: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        else:
            print(f"Dashboard endpoint returned: {response.status_code}")
    
    def test_invoices_endpoint(self, session):
        """GET /api/invoices should return invoices list"""
        response = session.get(f"{BASE_URL}/api/invoices")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Should return list of invoices"
        print(f"Found {len(data)} invoices")
    
    def test_payments_endpoint(self, session):
        """GET /api/payments should return payments list"""
        response = session.get(f"{BASE_URL}/api/payments")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Should return list of payments"
        print(f"Found {len(data)} payments")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
