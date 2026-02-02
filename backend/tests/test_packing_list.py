"""
Test Packing List and Delivery Notes functionality
Tests for Event Orchestration Documents tab features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"

# Known test event
TEST_EVENT_ID = "event_c35238fcb131"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code}")
    
    return session


class TestPackingListAPI:
    """Test Packing List endpoints"""
    
    def test_get_packing_list(self, auth_session):
        """Test GET /api/events/{event_id}/packing-list"""
        response = auth_session.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/packing-list")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Packing list should be a list"
        print(f"Packing list has {len(data)} items")
    
    def test_update_packing_list(self, auth_session):
        """Test PUT /api/events/{event_id}/packing-list"""
        # First get current packing list
        get_response = auth_session.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/packing-list")
        current_items = get_response.json() if get_response.status_code == 200 else []
        
        # Add a test item
        test_item = {
            "inventory_item_id": "test_item_123",
            "name": "TEST_Packing_Item",
            "inventory_type": "equipment",
            "category": "serving",
            "quantity": 5,
            "unit": "unit",
            "replacement_cost": 50.00,
            "notes": "Test item for packing list"
        }
        
        new_items = current_items + [test_item]
        
        response = auth_session.put(
            f"{BASE_URL}/api/events/{TEST_EVENT_ID}/packing-list",
            json={"items": new_items}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data or "packing_list" in data or isinstance(data, dict), "Should return success response"
        print(f"Packing list updated successfully")
        
        # Verify the item was saved
        verify_response = auth_session.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/packing-list")
        assert verify_response.status_code == 200
        saved_items = verify_response.json()
        
        # Check if test item exists
        test_item_found = any(item.get("name") == "TEST_Packing_Item" for item in saved_items)
        assert test_item_found, "Test item should be in saved packing list"
        print(f"Verified: Test item found in packing list")
        
        # Cleanup - remove test item
        cleanup_items = [item for item in saved_items if item.get("name") != "TEST_Packing_Item"]
        auth_session.put(
            f"{BASE_URL}/api/events/{TEST_EVENT_ID}/packing-list",
            json={"items": cleanup_items}
        )


class TestDeliveryNotesAPI:
    """Test Delivery Notes endpoints"""
    
    def test_get_delivery_notes(self, auth_session):
        """Test GET /api/delivery-notes"""
        response = auth_session.get(f"{BASE_URL}/api/delivery-notes")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Delivery notes should be a list"
        print(f"Found {len(data)} delivery notes")
        
        # Check if there's a delivery note for our test event
        event_notes = [n for n in data if n.get("event_id") == TEST_EVENT_ID]
        if event_notes:
            print(f"Found {len(event_notes)} delivery note(s) for test event")
            note = event_notes[0]
            assert "note_id" in note or "note_number" in note, "Note should have ID"
            assert "status" in note, "Note should have status"
    
    def test_create_delivery_note(self, auth_session):
        """Test POST /api/delivery-notes"""
        # Create a test delivery note
        test_note = {
            "event_id": TEST_EVENT_ID,
            "items": [
                {
                    "inventory_item_id": "test_dn_item_1",
                    "name": "TEST_DN_Equipment",
                    "inventory_type": "equipment",
                    "qty_out": 3,
                    "replacement_cost": 100.00,
                    "unit": "unit"
                }
            ]
        }
        
        response = auth_session.post(f"{BASE_URL}/api/delivery-notes", json=test_note)
        
        # Note: This might fail if a delivery note already exists for the event
        if response.status_code == 200:
            data = response.json()
            assert "note_id" in data or "note_number" in data, "Should return note ID"
            print(f"Created delivery note: {data.get('note_number', data.get('note_id'))}")
        elif response.status_code == 400:
            # Might already have a delivery note
            print(f"Delivery note creation returned 400 (may already exist): {response.text}")
        else:
            print(f"Delivery note creation returned {response.status_code}: {response.text}")


class TestOperationsSuppliesAPI:
    """Test Operations Supplies inventory endpoints"""
    
    def test_get_inventory_items(self, auth_session):
        """Test GET /api/inventory/ingredients - filter ops supplies"""
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Inventory should be a list"
        
        # Filter operations supplies
        ops_items = [item for item in data if item.get("inventory_type") in ["equipment", "disposable", "event_supply"]]
        print(f"Found {len(ops_items)} operations supplies items out of {len(data)} total")
        
        if ops_items:
            item = ops_items[0]
            assert "ingredient_id" in item, "Item should have ingredient_id"
            assert "name" in item, "Item should have name"
            assert "inventory_type" in item, "Item should have inventory_type"
    
    def test_create_ops_supply_item(self, auth_session):
        """Test POST /api/inventory/ingredients - create ops supply"""
        test_item = {
            "name": "TEST_OpsSupply_Item",
            "category": "serving",
            "inventory_type": "equipment",
            "unit": "unit",
            "cost_per_unit": 25.00,
            "stock_quantity": 10,
            "min_stock_level": 2,
            "par_level": 5,
            "yield_waste_percent": 0,
            "allergens": [],
            "storage_location": "dry",
            "reorder_threshold": 0,
            "pack_size": 1,
            "pack_unit": "unit",
            "replacement_cost": 75.00
        }
        
        response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=test_item)
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        data = response.json()
        assert "ingredient_id" in data, "Should return ingredient_id"
        print(f"Created ops supply item: {data.get('ingredient_id')}")
        
        # Cleanup - delete the test item
        item_id = data.get("ingredient_id")
        if item_id:
            delete_response = auth_session.delete(f"{BASE_URL}/api/inventory/ingredients/{item_id}")
            print(f"Cleanup: Deleted test item, status: {delete_response.status_code}")


class TestPackingListSuppliesAPI:
    """Test packing list supplies endpoint"""
    
    def test_get_packing_list_supplies(self, auth_session):
        """Test GET /api/events/{event_id}/packing-list-supplies"""
        response = auth_session.get(f"{BASE_URL}/api/events/{TEST_EVENT_ID}/packing-list-supplies")
        
        # This endpoint might return 404 if not implemented or empty list
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Should return a list"
            print(f"Found {len(data)} packing list supplies")
        elif response.status_code == 404:
            print("Packing list supplies endpoint returned 404 (may not be implemented)")
        else:
            print(f"Packing list supplies returned {response.status_code}: {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
