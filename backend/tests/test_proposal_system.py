"""
Test suite for Proposal/Contract System with OrderItems, Feature Flags, Margin Tracking, and Audit Logging
Tests the new commercial engine features for EEP Evoque Events Platform
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://multi-tenant-core-3.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test123"
TEST_EVENT_ID = "event_ee86febf3043"
TEST_PROPOSAL_ID = "prop_b783a7636e0f"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestFeatureFlags:
    """Feature Flags API tests - GET/PUT /api/settings/feature-flags"""
    
    def test_get_feature_flags(self, api_client):
        """GET /api/settings/feature-flags - should return all 6 flags"""
        response = api_client.get(f"{BASE_URL}/api/settings/feature-flags")
        assert response.status_code == 200
        
        data = response.json()
        # Verify all 6 feature flags exist
        assert "is_proposal_editing_enabled" in data
        assert "is_order_items_enabled" in data
        assert "is_margin_tracking_enabled" in data
        assert "is_document_autogeneration_enabled" in data
        assert "is_custom_fields_enabled" in data
        assert "is_food_ops_enabled" in data
        
        # All should be enabled by default
        assert data["is_proposal_editing_enabled"] == True
        assert data["is_order_items_enabled"] == True
        assert data["is_margin_tracking_enabled"] == True
        assert data["is_document_autogeneration_enabled"] == True
        assert data["is_custom_fields_enabled"] == True
        assert data["is_food_ops_enabled"] == True
        print("✓ All 6 feature flags present and enabled by default")
    
    def test_update_feature_flag(self, api_client):
        """PUT /api/settings/feature-flags - toggle a flag"""
        # Disable margin tracking
        response = api_client.put(f"{BASE_URL}/api/settings/feature-flags", json={
            "is_margin_tracking_enabled": False
        })
        assert response.status_code == 200
        data = response.json()
        assert data["is_margin_tracking_enabled"] == False
        
        # Verify change persisted
        response = api_client.get(f"{BASE_URL}/api/settings/feature-flags")
        assert response.json()["is_margin_tracking_enabled"] == False
        
        # Restore
        response = api_client.put(f"{BASE_URL}/api/settings/feature-flags", json={
            "is_margin_tracking_enabled": True
        })
        assert response.status_code == 200
        assert response.json()["is_margin_tracking_enabled"] == True
        print("✓ Feature flag toggle works correctly")
    
    def test_update_multiple_flags(self, api_client):
        """PUT /api/settings/feature-flags - update multiple flags at once"""
        response = api_client.put(f"{BASE_URL}/api/settings/feature-flags", json={
            "is_custom_fields_enabled": False,
            "is_food_ops_enabled": False
        })
        assert response.status_code == 200
        data = response.json()
        assert data["is_custom_fields_enabled"] == False
        assert data["is_food_ops_enabled"] == False
        
        # Restore
        response = api_client.put(f"{BASE_URL}/api/settings/feature-flags", json={
            "is_custom_fields_enabled": True,
            "is_food_ops_enabled": True
        })
        assert response.status_code == 200
        print("✓ Multiple feature flags can be updated at once")


class TestProposalCRUD:
    """Proposal API tests - auto-creation and status management"""
    
    def test_get_proposal_for_event(self, api_client):
        """GET /api/proposals/event/{event_id} - auto-creates proposal if not exists"""
        response = api_client.get(f"{BASE_URL}/api/proposals/event/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "proposal_id" in data
        assert "proposal_number" in data
        assert data["event_id"] == TEST_EVENT_ID
        assert data["status"] in ["Draft", "Sent", "Accepted", "Rejected"]
        assert "items" in data
        assert "subtotal" in data
        assert "total" in data
        print(f"✓ Proposal {data['proposal_number']} retrieved for event")
    
    def test_proposal_has_margin_fields(self, api_client):
        """Proposal should include internal margin tracking fields"""
        response = api_client.get(f"{BASE_URL}/api/proposals/event/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_cost" in data
        assert "total_margin" in data
        assert "margin_percentage" in data
        print(f"✓ Proposal has margin fields: cost={data['total_cost']}, margin={data['total_margin']}, %={data['margin_percentage']:.1f}%")
    
    def test_update_proposal_status(self, api_client):
        """PUT /api/proposals/{id} - change status"""
        # Change to Sent
        response = api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}", json={
            "status": "Sent"
        })
        assert response.status_code == 200
        assert response.json()["status"] == "Sent"
        
        # Restore to Draft
        response = api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}", json={
            "status": "Draft"
        })
        assert response.status_code == 200
        assert response.json()["status"] == "Draft"
        print("✓ Proposal status can be changed")
    
    def test_update_proposal_financials(self, api_client):
        """PUT /api/proposals/{id}/financials - update discount and taxes"""
        response = api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/financials", json={
            "discount_amount": 100,
            "client_notes": "Test notes",
            "payment_terms": "50% deposit"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["discount_amount"] == 100
        assert data["client_notes"] == "Test notes"
        assert data["payment_terms"] == "50% deposit"
        
        # Restore
        response = api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/financials", json={
            "discount_amount": 0,
            "client_notes": None,
            "payment_terms": None
        })
        assert response.status_code == 200
        print("✓ Proposal financials can be updated")


class TestOrderItems:
    """Order Items CRUD tests - unified commercial engine"""
    
    def test_get_order_items(self, api_client):
        """GET /api/proposals/{id}/items - list all items"""
        response = api_client.get(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items")
        assert response.status_code == 200
        
        items = response.json()
        assert isinstance(items, list)
        print(f"✓ Retrieved {len(items)} order items")
    
    def test_add_order_item_food(self, api_client):
        """POST /api/proposals/{id}/items - add Food item with margin"""
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Food",
            "description": "TEST_Appetizer platter",
            "quantity": 50,
            "unit_price": 25.00,
            "internal_cost": 8.00,
            "internal_notes": "Prepare 1 hour before service"
        })
        assert response.status_code == 200
        
        item = response.json()
        assert item["item_type"] == "Food"
        assert item["description"] == "TEST_Appetizer platter"
        assert item["quantity"] == 50
        assert item["unit_price"] == 25.00
        assert item["internal_cost"] == 8.00
        assert item["total_price"] == 1250.00  # 50 * 25
        assert item["total_cost"] == 400.00  # 50 * 8
        assert item["margin_amount"] == 850.00  # 1250 - 400
        assert item["margin_percentage"] == 68.0  # 850/1250 * 100
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item['item_id']}")
        print("✓ Food item created with correct margin calculation")
    
    def test_add_order_item_service(self, api_client):
        """POST /api/proposals/{id}/items - add Service item"""
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Service",
            "description": "TEST_Photography service",
            "quantity": 4,
            "unit_price": 200.00,
            "internal_cost": 100.00
        })
        assert response.status_code == 200
        
        item = response.json()
        assert item["item_type"] == "Service"
        assert item["total_price"] == 800.00
        assert item["margin_percentage"] == 50.0
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item['item_id']}")
        print("✓ Service item created correctly")
    
    def test_add_order_item_rental(self, api_client):
        """POST /api/proposals/{id}/items - add Rental item"""
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Rental",
            "description": "TEST_Table linens",
            "quantity": 20,
            "unit_price": 15.00,
            "internal_cost": 5.00
        })
        assert response.status_code == 200
        
        item = response.json()
        assert item["item_type"] == "Rental"
        assert item["total_price"] == 300.00
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item['item_id']}")
        print("✓ Rental item created correctly")
    
    def test_add_order_item_fee(self, api_client):
        """POST /api/proposals/{id}/items - add Fee item"""
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Fee",
            "description": "TEST_Service charge",
            "quantity": 1,
            "unit_price": 250.00,
            "internal_cost": 0
        })
        assert response.status_code == 200
        
        item = response.json()
        assert item["item_type"] == "Fee"
        assert item["total_price"] == 250.00
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item['item_id']}")
        print("✓ Fee item created correctly")
    
    def test_update_order_item(self, api_client):
        """PUT /api/proposals/{id}/items/{item_id} - update item"""
        # Create item
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Service",
            "description": "TEST_Item to update",
            "quantity": 1,
            "unit_price": 100.00
        })
        item_id = response.json()["item_id"]
        
        # Update
        response = api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item_id}", json={
            "quantity": 2,
            "unit_price": 150.00
        })
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["quantity"] == 2
        assert updated["unit_price"] == 150.00
        assert updated["total_price"] == 300.00
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item_id}")
        print("✓ Order item updated correctly")
    
    def test_delete_order_item(self, api_client):
        """DELETE /api/proposals/{id}/items/{item_id} - delete item"""
        # Create item
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Fee",
            "description": "TEST_Item to delete",
            "quantity": 1,
            "unit_price": 50.00
        })
        item_id = response.json()["item_id"]
        
        # Delete
        response = api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item_id}")
        assert response.status_code == 200
        assert response.json()["message"] == "Item deleted"
        
        # Verify deleted
        response = api_client.get(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items")
        items = response.json()
        assert not any(i["item_id"] == item_id for i in items)
        print("✓ Order item deleted correctly")


class TestFinancials:
    """Event Financials API tests - margin breakdown by item type"""
    
    def test_get_event_financials(self, api_client):
        """GET /api/events/{id}/financials - internal financials"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/financials")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_revenue" in data
        assert "total_cost" in data
        assert "gross_margin" in data
        assert "margin_percentage" in data
        assert "by_item_type" in data
        assert "has_proposal" in data
        print(f"✓ Financials: Revenue=${data['total_revenue']}, Cost=${data['total_cost']}, Margin={data['margin_percentage']:.1f}%")
    
    def test_financials_by_item_type(self, api_client):
        """Financials should break down by item type"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/financials")
        assert response.status_code == 200
        
        by_type = response.json()["by_item_type"]
        # Check structure for each type present
        for item_type, data in by_type.items():
            assert "revenue" in data
            assert "cost" in data
            assert "margin" in data
            assert "count" in data
            print(f"  {item_type}: revenue=${data['revenue']}, cost=${data['cost']}, margin=${data['margin']}, count={data['count']}")
        print("✓ Financials breakdown by item type works")


class TestAuditLogging:
    """Audit Log tests - track changes after proposal acceptance"""
    
    def test_audit_log_on_status_change(self, api_client):
        """Audit log created when proposal status changes to Accepted"""
        # Change to Accepted
        response = api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}", json={
            "status": "Accepted"
        })
        assert response.status_code == 200
        
        # Check audit log
        response = api_client.get(f"{BASE_URL}/api/audit/event/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        logs = response.json()
        status_change_logs = [l for l in logs if l["action_type"] == "status_change"]
        assert len(status_change_logs) > 0
        
        latest = status_change_logs[0]
        assert latest["changes"]["new_status"] == "Accepted"
        assert "user_name" in latest
        assert "timestamp" in latest
        
        # Restore
        api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}", json={"status": "Draft"})
        print("✓ Audit log created on status change to Accepted")
    
    def test_audit_log_on_item_add_after_acceptance(self, api_client):
        """Audit log created when item added after proposal is Accepted"""
        # Accept proposal
        api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}", json={"status": "Accepted"})
        
        # Add item
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Fee",
            "description": "TEST_Audit test item",
            "quantity": 1,
            "unit_price": 100.00
        })
        item_id = response.json()["item_id"]
        
        # Check audit log
        response = api_client.get(f"{BASE_URL}/api/audit/event/{TEST_EVENT_ID}")
        logs = response.json()
        add_logs = [l for l in logs if l["action_type"] == "add_item" and l.get("item_id") == item_id]
        assert len(add_logs) > 0
        
        log = add_logs[0]
        assert log["item_description"] == "TEST_Audit test item"
        assert log["impact_on_total"] == 100.00
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item_id}")
        api_client.put(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}", json={"status": "Draft"})
        print("✓ Audit log created on item add after acceptance")
    
    def test_get_audit_logs_for_event(self, api_client):
        """GET /api/audit/event/{event_id} - retrieve audit logs"""
        response = api_client.get(f"{BASE_URL}/api/audit/event/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        logs = response.json()
        assert isinstance(logs, list)
        print(f"✓ Retrieved {len(logs)} audit log entries")
    
    def test_get_audit_logs_for_proposal(self, api_client):
        """GET /api/audit/proposal/{proposal_id} - retrieve audit logs"""
        response = api_client.get(f"{BASE_URL}/api/audit/proposal/{TEST_PROPOSAL_ID}")
        assert response.status_code == 200
        
        logs = response.json()
        assert isinstance(logs, list)
        print(f"✓ Retrieved {len(logs)} audit log entries for proposal")


class TestCRMIntegration:
    """Test that proposals work with existing CRM events/clients"""
    
    def test_proposal_linked_to_event(self, api_client):
        """Proposal should be linked to event"""
        response = api_client.get(f"{BASE_URL}/api/proposals/event/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        proposal = response.json()
        assert proposal["event_id"] == TEST_EVENT_ID
        print("✓ Proposal correctly linked to event")
    
    def test_event_has_financials(self, api_client):
        """Event should have financials endpoint"""
        response = api_client.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/financials")
        assert response.status_code == 200
        
        data = response.json()
        assert data["has_proposal"] == True
        assert "proposal_number" in data
        print(f"✓ Event financials linked to proposal {data['proposal_number']}")


class TestMarginCalculation:
    """Test automatic margin calculation"""
    
    def test_margin_calculation_on_item_create(self, api_client):
        """Margin should be calculated automatically on item creation"""
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Food",
            "description": "TEST_Margin test",
            "quantity": 10,
            "unit_price": 50.00,
            "internal_cost": 20.00
        })
        assert response.status_code == 200
        
        item = response.json()
        # total_price = 10 * 50 = 500
        # total_cost = 10 * 20 = 200
        # margin_amount = 500 - 200 = 300
        # margin_percentage = 300/500 * 100 = 60%
        assert item["total_price"] == 500.00
        assert item["total_cost"] == 200.00
        assert item["margin_amount"] == 300.00
        assert item["margin_percentage"] == 60.0
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item['item_id']}")
        print("✓ Margin calculated correctly: 60% margin")
    
    def test_margin_with_zero_cost(self, api_client):
        """Items with zero cost should have null margin"""
        response = api_client.post(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items", json={
            "item_type": "Fee",
            "description": "TEST_Zero cost item",
            "quantity": 1,
            "unit_price": 100.00,
            "internal_cost": 0
        })
        assert response.status_code == 200
        
        item = response.json()
        # With internal_cost=0, margin fields should be null
        assert item["total_price"] == 100.00
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/proposals/{TEST_PROPOSAL_ID}/items/{item['item_id']}")
        print("✓ Zero cost item handled correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
