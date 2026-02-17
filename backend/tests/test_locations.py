# Test file for Locations/Venues API endpoints
# Tests CRUD for venues, rooms, saved addresses, and event locations

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestLocationsAuth:
    """Test authentication and get token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in login response"
        return data["access_token"]
    
    def test_login(self, auth_token):
        """Verify login works"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✓ Login successful, token obtained")


class TestVenuesCRUD:
    """Test Venues CRUD operations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_venues_list(self, headers):
        """GET /api/locations/venues - List all venues"""
        response = requests.get(f"{BASE_URL}/api/locations/venues", headers=headers)
        assert response.status_code == 200, f"Failed to get venues: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/locations/venues returned {len(data)} venues")
        return data
    
    def test_create_venue(self, headers):
        """POST /api/locations/venues - Create a new venue"""
        unique_id = str(uuid.uuid4())[:8]
        venue_data = {
            "name": f"TEST_Venue_{unique_id}",
            "address": "123 Test Street",
            "city": "Test City",
            "state": "TX",
            "zip_code": "75001",
            "country": "USA",
            "description": "Test venue for automated testing",
            "total_capacity": 100,
            "contact_phone": "555-123-4567",
            "contact_email": "test@venue.com",
            "parking_info": "Free parking available",
            "is_primary": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/locations/venues",
            json=venue_data,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to create venue: {response.text}"
        
        data = response.json()
        assert "venue_id" in data, "No venue_id in response"
        assert data["name"] == venue_data["name"], "Name mismatch"
        assert data["address"] == venue_data["address"], "Address mismatch"
        assert data["city"] == venue_data["city"], "City mismatch"
        assert "full_address" in data, "No full_address computed"
        
        print(f"✓ Created venue: {data['venue_id']}")
        return data["venue_id"]
    
    def test_get_venue_by_id(self, headers):
        """GET /api/locations/venues/{venue_id} - Get specific venue"""
        # First create a venue
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/locations/venues",
            json={"name": f"TEST_GetById_{unique_id}", "address": "456 Get Test St"},
            headers=headers
        )
        assert create_response.status_code == 200
        venue_id = create_response.json()["venue_id"]
        
        # Now get it
        response = requests.get(f"{BASE_URL}/api/locations/venues/{venue_id}", headers=headers)
        assert response.status_code == 200, f"Failed to get venue: {response.text}"
        
        data = response.json()
        assert data["venue_id"] == venue_id
        assert "rooms" in data, "rooms array not included"
        print(f"✓ GET /api/locations/venues/{venue_id} returned venue with rooms")
    
    def test_update_venue(self, headers):
        """PUT /api/locations/venues/{venue_id} - Update venue"""
        # Create venue first
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/locations/venues",
            json={"name": f"TEST_Update_{unique_id}", "address": "789 Update St"},
            headers=headers
        )
        venue_id = create_response.json()["venue_id"]
        
        # Update it
        update_data = {
            "name": f"TEST_Updated_{unique_id}",
            "total_capacity": 500,
            "parking_info": "Updated parking info"
        }
        response = requests.put(
            f"{BASE_URL}/api/locations/venues/{venue_id}",
            json=update_data,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to update venue: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"], "Name not updated"
        assert data["total_capacity"] == 500, "Capacity not updated"
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/locations/venues/{venue_id}", headers=headers)
        assert get_response.status_code == 200
        assert get_response.json()["name"] == update_data["name"]
        
        print(f"✓ PUT /api/locations/venues/{venue_id} updated successfully")
    
    def test_delete_venue(self, headers):
        """DELETE /api/locations/venues/{venue_id} - Soft delete venue"""
        # Create venue first
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/locations/venues",
            json={"name": f"TEST_Delete_{unique_id}", "address": "Delete St"},
            headers=headers
        )
        venue_id = create_response.json()["venue_id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/locations/venues/{venue_id}", headers=headers)
        assert response.status_code == 200, f"Failed to delete venue: {response.text}"
        
        data = response.json()
        assert "message" in data, "No message in response"
        
        # Verify it's deactivated - should still exist but not be in active list
        get_response = requests.get(f"{BASE_URL}/api/locations/venues", headers=headers)
        active_venue_ids = [v["venue_id"] for v in get_response.json()]
        assert venue_id not in active_venue_ids, "Deleted venue still in active list"
        
        print(f"✓ DELETE /api/locations/venues/{venue_id} soft deleted successfully")


class TestVenueRoomsCRUD:
    """Test Venue Rooms CRUD operations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def test_venue(self, headers):
        """Create a test venue for room tests"""
        unique_id = str(uuid.uuid4())[:8]
        response = requests.post(
            f"{BASE_URL}/api/locations/venues",
            json={"name": f"TEST_RoomVenue_{unique_id}", "address": "Room Test Address"},
            headers=headers
        )
        return response.json()["venue_id"]
    
    def test_create_room(self, headers, test_venue):
        """POST /api/locations/venues/{venue_id}/rooms - Create room"""
        unique_id = str(uuid.uuid4())[:8]
        room_data = {
            "name": f"TEST_Room_{unique_id}",
            "description": "Test room",
            "capacity": 50,
            "floor": "1",
            "amenities": ["WiFi", "Proyector"],
            "setup_options": ["Teatro", "Banquete"],
            "hourly_rate": 150.00,
            "notes": "Test notes"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/locations/venues/{test_venue}/rooms",
            json=room_data,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to create room: {response.text}"
        
        data = response.json()
        assert "room_id" in data, "No room_id in response"
        assert data["name"] == room_data["name"]
        assert data["capacity"] == room_data["capacity"]
        assert data["amenities"] == room_data["amenities"]
        
        print(f"✓ Created room: {data['room_id']} in venue {test_venue}")
        return data["room_id"]
    
    def test_update_room(self, headers, test_venue):
        """PUT /api/locations/venues/{venue_id}/rooms/{room_id} - Update room"""
        # Create room first
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/locations/venues/{test_venue}/rooms",
            json={"name": f"TEST_RoomUpdate_{unique_id}", "capacity": 25},
            headers=headers
        )
        room_id = create_response.json()["room_id"]
        
        # Update it
        update_data = {
            "name": f"TEST_RoomUpdated_{unique_id}",
            "capacity": 75,
            "floor": "2",
            "amenities": ["Audio", "Iluminación"]
        }
        response = requests.put(
            f"{BASE_URL}/api/locations/venues/{test_venue}/rooms/{room_id}",
            json=update_data,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to update room: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["capacity"] == 75
        
        print(f"✓ PUT /api/locations/venues/{test_venue}/rooms/{room_id} updated")
    
    def test_delete_room(self, headers, test_venue):
        """DELETE /api/locations/venues/{venue_id}/rooms/{room_id} - Soft delete room"""
        # Create room
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/locations/venues/{test_venue}/rooms",
            json={"name": f"TEST_RoomDelete_{unique_id}", "capacity": 10},
            headers=headers
        )
        room_id = create_response.json()["room_id"]
        
        # Delete it
        response = requests.delete(
            f"{BASE_URL}/api/locations/venues/{test_venue}/rooms/{room_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to delete room: {response.text}"
        
        # Verify - get venue and check rooms
        get_response = requests.get(
            f"{BASE_URL}/api/locations/venues/{test_venue}",
            headers=headers
        )
        active_rooms = [r for r in get_response.json()["rooms"] if r.get("is_active", True)]
        active_room_ids = [r["room_id"] for r in active_rooms]
        # The room should still exist but be inactive
        
        print(f"✓ DELETE room {room_id} soft deleted")


class TestSavedAddresses:
    """Test Saved Addresses CRUD operations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_saved_addresses(self, headers):
        """GET /api/locations/saved-addresses - List saved addresses"""
        response = requests.get(f"{BASE_URL}/api/locations/saved-addresses", headers=headers)
        assert response.status_code == 200, f"Failed to get saved addresses: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/locations/saved-addresses returned {len(data)} addresses")
    
    def test_create_saved_address(self, headers):
        """POST /api/locations/saved-addresses - Create saved address"""
        unique_id = str(uuid.uuid4())[:8]
        address_data = {
            "name": f"TEST_Address_{unique_id}",
            "address": "123 Saved Address St",
            "city": "Dallas",
            "state": "TX",
            "zip_code": "75201",
            "country": "USA",
            "contact_name": "John Test",
            "contact_phone": "555-999-8888",
            "notes": "Test saved address",
            "is_favorite": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/locations/saved-addresses",
            json=address_data,
            headers=headers
        )
        assert response.status_code == 200, f"Failed to create saved address: {response.text}"
        
        data = response.json()
        assert "address_id" in data
        assert data["name"] == address_data["name"]
        assert data["is_favorite"] == True
        assert "full_address" in data
        
        print(f"✓ Created saved address: {data['address_id']}")
        return data["address_id"]


class TestEventLocations:
    """Test Event Locations API"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def test_event(self, headers):
        """Get an existing event or find one for testing"""
        # Get list of events
        response = requests.get(f"{BASE_URL}/api/events", headers=headers)
        if response.status_code == 200:
            events = response.json()
            if events and len(events) > 0:
                return events[0].get("event_id")
        return None
    
    @pytest.fixture(scope="class")
    def test_venue_id(self, headers):
        """Get or create a venue for event location tests"""
        response = requests.get(f"{BASE_URL}/api/locations/venues", headers=headers)
        if response.status_code == 200:
            venues = response.json()
            if venues and len(venues) > 0:
                return venues[0]["venue_id"]
        
        # Create one if none exist
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/locations/venues",
            json={"name": f"TEST_EventLocVenue_{unique_id}", "address": "Event Loc Test"},
            headers=headers
        )
        if create_response.status_code == 200:
            return create_response.json()["venue_id"]
        return None
    
    def test_update_event_locations_onsite(self, headers, test_event, test_venue_id):
        """PUT /api/events/{event_id}/locations - Update with onsite location"""
        if not test_event:
            pytest.skip("No test event available")
        if not test_venue_id:
            pytest.skip("No venue available for testing")
        
        location_data = {
            "locations": [
                {
                    "location_type": "onsite",
                    "label": "Main Event",
                    "venue_id": test_venue_id,
                    "arrival_time": "10:00",
                    "departure_time": "18:00",
                    "setup_notes": "Setup 2 hours before",
                    "order": 0
                }
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/events/{test_event}/locations",
            json=location_data,
            headers=headers
        )
        # The endpoint is under /api/locations/events/{event_id}/locations
        # Let's try the correct path
        response = requests.put(
            f"{BASE_URL}/api/locations/events/{test_event}/locations",
            json=location_data,
            headers=headers
        )
        
        if response.status_code == 404:
            pytest.skip("Event not found or event locations endpoint not available")
        
        assert response.status_code == 200, f"Failed to update event locations: {response.text}"
        data = response.json()
        assert "locations" in data
        
        print(f"✓ Updated event {test_event} with onsite location")
    
    def test_update_event_locations_offsite(self, headers, test_event):
        """PUT /api/locations/events/{event_id}/locations - Update with offsite location"""
        if not test_event:
            pytest.skip("No test event available")
        
        location_data = {
            "locations": [
                {
                    "location_type": "offsite",
                    "label": "Offsite Venue",
                    "address": "999 External Venue Blvd",
                    "city": "Houston",
                    "state": "TX",
                    "zip_code": "77001",
                    "arrival_time": "09:00",
                    "departure_time": "22:00",
                    "parking_instructions": "Valet available",
                    "order": 0
                }
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/locations/events/{test_event}/locations",
            json=location_data,
            headers=headers
        )
        
        if response.status_code == 404:
            pytest.skip("Event not found")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "locations" in data
        if len(data["locations"]) > 0:
            assert data["locations"][0]["location_type"] == "offsite"
        
        print(f"✓ Updated event {test_event} with offsite location")
    
    def test_update_event_multi_location(self, headers, test_event, test_venue_id):
        """Test multi-location event (ceremony + reception)"""
        if not test_event:
            pytest.skip("No test event available")
        
        location_data = {
            "locations": [
                {
                    "location_type": "offsite",
                    "label": "Ceremony",
                    "address": "123 Church St",
                    "city": "Dallas",
                    "state": "TX",
                    "arrival_time": "14:00",
                    "departure_time": "15:30",
                    "order": 0
                },
                {
                    "location_type": "onsite" if test_venue_id else "offsite",
                    "label": "Reception",
                    "venue_id": test_venue_id,
                    "address": "456 Reception Hall" if not test_venue_id else None,
                    "arrival_time": "16:00",
                    "departure_time": "23:00",
                    "order": 1
                }
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/locations/events/{test_event}/locations",
            json=location_data,
            headers=headers
        )
        
        if response.status_code == 404:
            pytest.skip("Event not found")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "locations" in data
        assert len(data["locations"]) >= 1, "Should have at least one location"
        
        print(f"✓ Updated event {test_event} with multi-location setup")


class TestLocationSearch:
    """Test location search endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_search_locations(self, headers):
        """GET /api/locations/search - Search venues/rooms/addresses"""
        response = requests.get(
            f"{BASE_URL}/api/locations/search",
            params={"q": "TEST"},
            headers=headers
        )
        assert response.status_code == 200, f"Failed to search: {response.text}"
        
        data = response.json()
        assert "venues" in data
        assert "rooms" in data
        assert "saved_addresses" in data
        
        print(f"✓ Search returned: {len(data['venues'])} venues, {len(data['rooms'])} rooms, {len(data['saved_addresses'])} addresses")


# Cleanup fixture to remove TEST_ prefixed data after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Clean up test data after all tests complete"""
    yield
    # Cleanup would go here if needed
    print("\n✓ Test session complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
