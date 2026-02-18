"""
Test Activity Logging System
Tests for:
- Activity logs API endpoints
- Logging on CRM operations (clients)
- Logging on Events operations
- Logging on Locations operations (venues, rooms)
- Filter functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestActivityLogging:
    """Test Activity Logging System"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup - no explicit cleanup needed, test data is prefixed
    
    # ============== Activity Logs API Tests ==============
    
    def test_get_activity_logs(self):
        """Test GET /api/activity-logs/ returns logs"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs/")
        assert response.status_code == 200, f"Failed to get activity logs: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/activity-logs/ returned {len(data)} logs")
    
    def test_get_activity_logs_with_module_filter(self):
        """Test GET /api/activity-logs/?module=crm filters by module"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=crm")
        assert response.status_code == 200, f"Failed to filter logs by module: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # If there are logs, they should all be crm module
        for log in data:
            assert log.get("module") == "crm", f"Log module should be 'crm', got {log.get('module')}"
        print(f"✓ GET /api/activity-logs/?module=crm returned {len(data)} CRM logs")
    
    def test_get_activity_logs_with_action_filter(self):
        """Test GET /api/activity-logs/?action=create filters by action"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs/?action=create")
        assert response.status_code == 200, f"Failed to filter logs by action: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # If there are logs, they should all be create action
        for log in data:
            assert log.get("action") == "create", f"Log action should be 'create', got {log.get('action')}"
        print(f"✓ GET /api/activity-logs/?action=create returned {len(data)} create logs")
    
    def test_get_available_modules(self):
        """Test GET /api/activity-logs/modules returns module list"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs/modules")
        assert response.status_code == 200, f"Failed to get modules: {response.text}"
        data = response.json()
        assert "modules" in data, "Response should contain 'modules' key"
        modules = data["modules"]
        assert isinstance(modules, list), "Modules should be a list"
        assert len(modules) > 0, "Should have at least one module"
        # Check module structure
        for module in modules:
            assert "id" in module, "Module should have 'id'"
            assert "name" in module, "Module should have 'name'"
        print(f"✓ GET /api/activity-logs/modules returned {len(modules)} modules")
    
    def test_get_available_actions(self):
        """Test GET /api/activity-logs/actions returns action list"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs/actions")
        assert response.status_code == 200, f"Failed to get actions: {response.text}"
        data = response.json()
        assert "actions" in data, "Response should contain 'actions' key"
        actions = data["actions"]
        assert isinstance(actions, list), "Actions should be a list"
        assert len(actions) > 0, "Should have at least one action"
        # Check create, update, delete actions exist
        action_ids = [a["id"] for a in actions]
        assert "create" in action_ids, "Should have 'create' action"
        assert "update" in action_ids, "Should have 'update' action"
        assert "delete" in action_ids, "Should have 'delete' action"
        print(f"✓ GET /api/activity-logs/actions returned {len(actions)} actions")
    
    # ============== CRM Client Logging Tests ==============
    
    def test_create_client_creates_log(self):
        """Test creating a client creates an activity log"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "display_name": f"TEST_ActivityLog_Client_{unique_id}",
            "client_type": "Company",
            "email": f"test_activity_{unique_id}@test.com",
            "status": "Active"
        }
        
        # Create client
        create_response = self.session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert create_response.status_code == 200, f"Failed to create client: {create_response.text}"
        client = create_response.json()
        client_id = client.get("client_id")
        print(f"✓ Created client: {client_id}")
        
        # Check activity log was created
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=crm&action=create&limit=10")
        assert logs_response.status_code == 200, f"Failed to get activity logs: {logs_response.text}"
        logs = logs_response.json()
        
        # Find log for our created client
        found_log = None
        for log in logs:
            if log.get("entity_id") == client_id and log.get("entity_type") == "client":
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for created client {client_id}"
        assert found_log.get("module") == "crm", "Log module should be 'crm'"
        assert found_log.get("action") == "create", "Log action should be 'create'"
        assert found_log.get("entity_type") == "client", "Log entity_type should be 'client'"
        print(f"✓ Activity log created for client creation: {found_log.get('log_id')}")
        
        # Cleanup - delete client
        self.session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")
        print(f"✓ Cleaned up test client")
    
    def test_update_client_creates_log(self):
        """Test updating a client creates an activity log"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "display_name": f"TEST_UpdateLog_Client_{unique_id}",
            "client_type": "Individual",
            "email": f"test_update_{unique_id}@test.com",
            "status": "Active"
        }
        
        # Create client first
        create_response = self.session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert create_response.status_code == 200, f"Failed to create client: {create_response.text}"
        client = create_response.json()
        client_id = client.get("client_id")
        
        # Update client
        update_data = {
            "display_name": f"TEST_UpdatedLog_Client_{unique_id}",
            "client_type": "Individual",
            "email": f"test_update_{unique_id}@test.com",
            "status": "Active"
        }
        update_response = self.session.put(f"{BASE_URL}/api/crm/clients/{client_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update client: {update_response.text}"
        print(f"✓ Updated client: {client_id}")
        
        # Check activity log was created for update
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=crm&action=update&limit=10")
        assert logs_response.status_code == 200, f"Failed to get activity logs: {logs_response.text}"
        logs = logs_response.json()
        
        # Find log for our updated client
        found_log = None
        for log in logs:
            if log.get("entity_id") == client_id and log.get("entity_type") == "client":
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for updated client {client_id}"
        assert found_log.get("action") == "update", "Log action should be 'update'"
        print(f"✓ Activity log created for client update: {found_log.get('log_id')}")
        
        # Cleanup - delete client
        self.session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")
    
    def test_delete_client_creates_log(self):
        """Test deleting a client creates an activity log"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "display_name": f"TEST_DeleteLog_Client_{unique_id}",
            "client_type": "Company",
            "email": f"test_delete_{unique_id}@test.com",
            "status": "Active"
        }
        
        # Create client first
        create_response = self.session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert create_response.status_code == 200
        client = create_response.json()
        client_id = client.get("client_id")
        
        # Delete client
        delete_response = self.session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")
        assert delete_response.status_code == 200, f"Failed to delete client: {delete_response.text}"
        print(f"✓ Deleted client: {client_id}")
        
        # Check activity log was created for delete
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=crm&action=delete&limit=10")
        assert logs_response.status_code == 200
        logs = logs_response.json()
        
        # Find log for our deleted client
        found_log = None
        for log in logs:
            if log.get("entity_id") == client_id and log.get("entity_type") == "client":
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for deleted client {client_id}"
        assert found_log.get("action") == "delete", "Log action should be 'delete'"
        print(f"✓ Activity log created for client deletion: {found_log.get('log_id')}")
    
    # ============== Events Logging Tests ==============
    
    def test_events_activity_logs_exist(self):
        """Test that activity logs exist for events module"""
        # Check activity logs for events module
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=events&limit=10")
        assert logs_response.status_code == 200, f"Failed to get activity logs: {logs_response.text}"
        logs = logs_response.json()
        
        # There should be at least some event logs
        print(f"✓ Found {len(logs)} event activity logs")
        
        # Verify log structure if any exist
        if logs:
            log = logs[0]
            assert log.get("module") == "events", "Log module should be 'events'"
            assert "entity_id" in log, "Log should have entity_id"
            assert "action" in log, "Log should have action"
            print(f"✓ Event log structure verified: {log.get('action')} on {log.get('entity_type')}")
    
    def test_update_existing_event_creates_log(self):
        """Test updating an existing event creates an activity log"""
        # Get existing events
        events_response = self.session.get(f"{BASE_URL}/api/events")
        assert events_response.status_code == 200, f"Failed to get events: {events_response.text}"
        events = events_response.json()
        
        if not events:
            pytest.skip("No existing events to update")
        
        # Use first event that's not a test event for cleanup
        event = events[0]
        event_id = event.get("event_id")
        original_guest_count = event.get("guest_count", 50)
        print(f"✓ Using existing event: {event_id}")
        
        # Update event with all required fields + the change
        update_data = {
            "client_id": event.get("client_id"),
            "name": event.get("name"),
            "event_type": event.get("event_type", "corporate"),
            "guest_count": original_guest_count + 1
        }
        update_response = self.session.put(f"{BASE_URL}/api/events/{event_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update event: {update_response.text}"
        print(f"✓ Updated event guest_count")
        
        # Check activity log was created for update
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=events&limit=10")
        assert logs_response.status_code == 200
        logs = logs_response.json()
        
        # Find a recent log for our updated event
        found_log = None
        for log in logs:
            if log.get("entity_id") == event_id and log.get("action") in ["update", "status_change"]:
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for updated event {event_id}"
        print(f"✓ Activity log created for event update: {found_log.get('log_id')}")
        
        # Revert the change
        revert_data = {
            "client_id": event.get("client_id"),
            "name": event.get("name"),
            "event_type": event.get("event_type", "corporate"),
            "guest_count": original_guest_count
        }
        self.session.put(f"{BASE_URL}/api/events/{event_id}", json=revert_data)
    
    # ============== Locations Logging Tests ==============
    
    def test_create_venue_creates_log(self):
        """Test creating a venue creates an activity log"""
        unique_id = uuid.uuid4().hex[:8]
        venue_data = {
            "name": f"TEST_ActivityLog_Venue_{unique_id}",
            "address": "123 Test Ave",
            "city": "Test City",
            "state": "TX",
            "zip_code": "12345",
            "total_capacity": 200,
            "is_active": True
        }
        
        # Create venue
        create_response = self.session.post(f"{BASE_URL}/api/locations/venues", json=venue_data)
        assert create_response.status_code == 200, f"Failed to create venue: {create_response.text}"
        venue = create_response.json()
        venue_id = venue.get("venue_id")
        print(f"✓ Created venue: {venue_id}")
        
        # Check activity log was created
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=locations&action=create&limit=10")
        assert logs_response.status_code == 200
        logs = logs_response.json()
        
        # Find log for our created venue
        found_log = None
        for log in logs:
            if log.get("entity_id") == venue_id and log.get("entity_type") == "venue":
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for created venue {venue_id}"
        assert found_log.get("module") == "locations", "Log module should be 'locations'"
        print(f"✓ Activity log created for venue creation: {found_log.get('log_id')}")
        
        # Cleanup - delete venue
        self.session.delete(f"{BASE_URL}/api/locations/venues/{venue_id}")
    
    def test_update_venue_creates_log(self):
        """Test updating a venue creates an activity log"""
        unique_id = uuid.uuid4().hex[:8]
        venue_data = {
            "name": f"TEST_UpdateLog_Venue_{unique_id}",
            "address": "123 Test Ave",
            "city": "Test City",
            "state": "TX",
            "zip_code": "12345",
            "total_capacity": 200,
            "is_active": True
        }
        
        # Create venue first
        create_response = self.session.post(f"{BASE_URL}/api/locations/venues", json=venue_data)
        assert create_response.status_code == 200
        venue = create_response.json()
        venue_id = venue.get("venue_id")
        
        # Update venue
        update_data = {
            "name": f"TEST_UpdatedLog_Venue_{unique_id}",
            "total_capacity": 300
        }
        update_response = self.session.put(f"{BASE_URL}/api/locations/venues/{venue_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update venue: {update_response.text}"
        print(f"✓ Updated venue: {venue_id}")
        
        # Check activity log was created for update
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=locations&action=update&limit=10")
        assert logs_response.status_code == 200
        logs = logs_response.json()
        
        # Find log for our updated venue
        found_log = None
        for log in logs:
            if log.get("entity_id") == venue_id and log.get("entity_type") == "venue":
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for updated venue {venue_id}"
        print(f"✓ Activity log created for venue update: {found_log.get('log_id')}")
        
        # Cleanup - delete venue
        self.session.delete(f"{BASE_URL}/api/locations/venues/{venue_id}")
    
    def test_delete_room_creates_log(self):
        """Test deleting a room creates an activity log"""
        unique_id = uuid.uuid4().hex[:8]
        
        # First create a venue
        venue_data = {
            "name": f"TEST_RoomVenue_{unique_id}",
            "address": "456 Room Test St",
            "city": "Test City",
            "state": "TX",
            "zip_code": "12345",
            "total_capacity": 500,
            "is_active": True
        }
        venue_response = self.session.post(f"{BASE_URL}/api/locations/venues", json=venue_data)
        assert venue_response.status_code == 200
        venue = venue_response.json()
        venue_id = venue.get("venue_id")
        
        # Create a room
        room_data = {
            "name": f"TEST_DeleteLog_Room_{unique_id}",
            "capacity": 50,
            "floor": "1",
            "is_active": True
        }
        room_response = self.session.post(f"{BASE_URL}/api/locations/venues/{venue_id}/rooms", json=room_data)
        assert room_response.status_code == 200, f"Failed to create room: {room_response.text}"
        room = room_response.json()
        room_id = room.get("room_id")
        print(f"✓ Created room: {room_id}")
        
        # Delete room
        delete_response = self.session.delete(f"{BASE_URL}/api/locations/venues/{venue_id}/rooms/{room_id}")
        assert delete_response.status_code == 200, f"Failed to delete room: {delete_response.text}"
        print(f"✓ Deleted room: {room_id}")
        
        # Check activity log was created for delete
        logs_response = self.session.get(f"{BASE_URL}/api/activity-logs/?module=locations&action=delete&limit=10")
        assert logs_response.status_code == 200
        logs = logs_response.json()
        
        # Find log for our deleted room
        found_log = None
        for log in logs:
            if log.get("entity_id") == room_id and log.get("entity_type") == "room":
                found_log = log
                break
        
        assert found_log is not None, f"Activity log not found for deleted room {room_id}"
        print(f"✓ Activity log created for room deletion: {found_log.get('log_id')}")
        
        # Cleanup - delete venue
        self.session.delete(f"{BASE_URL}/api/locations/venues/{venue_id}")
    
    # ============== Entity History Tests ==============
    
    def test_get_entity_history(self):
        """Test GET /api/activity-logs/entity/{entity_type}/{entity_id}"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create a client
        client_data = {
            "display_name": f"TEST_EntityHistory_Client_{unique_id}",
            "client_type": "Company",
            "email": f"test_history_{unique_id}@test.com",
            "status": "Active"
        }
        create_response = self.session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert create_response.status_code == 200
        client = create_response.json()
        client_id = client.get("client_id")
        
        # Update it once
        update_data = {
            "display_name": f"TEST_EntityHistory_Updated_{unique_id}",
            "client_type": "Company",
            "email": f"test_history_{unique_id}@test.com",
            "status": "Active"
        }
        self.session.put(f"{BASE_URL}/api/crm/clients/{client_id}", json=update_data)
        
        # Get entity history
        history_response = self.session.get(f"{BASE_URL}/api/activity-logs/entity/client/{client_id}")
        assert history_response.status_code == 200, f"Failed to get entity history: {history_response.text}"
        history = history_response.json()
        
        assert isinstance(history, list), "Response should be a list"
        # Should have at least 2 logs (create + update)
        assert len(history) >= 2, f"Should have at least 2 history entries, got {len(history)}"
        
        # All logs should be for the same entity
        for log in history:
            assert log.get("entity_id") == client_id, "All logs should be for the same entity"
            assert log.get("entity_type") == "client", "All logs should be for client entity type"
        
        print(f"✓ GET /api/activity-logs/entity/client/{client_id} returned {len(history)} history entries")
        
        # Cleanup - delete client (this will also create a delete log)
        self.session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
