"""
Test Activation-Event Bidirectional Linking Feature
Tests the new endpoints for linking Marketing Activations with Events:
- GET /api/demand-studio/activations/{id}/linkable-events
- GET /api/demand-studio/activations/{id}/linked-event-details
- GET /api/demand-studio/events/{eventId}/linked-activation
- POST /api/demand-studio/activations/{id}/link-event/{eventId}
- DELETE /api/demand-studio/activations/{id}/unlink-event
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestActivationEventLinking:
    """Tests for Activation-Event bidirectional linking feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        yield
        
    def test_01_get_activations_list(self):
        """Verify activations endpoint works"""
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        print(f"Get activations response: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} activations")
        
        # Store first activation for later tests if available
        if data:
            self.activation_id = data[0].get("activation_id")
            print(f"First activation ID: {self.activation_id}")
    
    def test_02_get_linkable_events(self):
        """Test GET /api/demand-studio/activations/{id}/linkable-events endpoint"""
        # First get an activation
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        if not activations:
            pytest.skip("No activations available to test linkable-events")
        
        activation_id = activations[0]["activation_id"]
        
        # Get linkable events
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/linkable-events",
            cookies=self.session.cookies
        )
        print(f"Get linkable events response: {response.status_code}")
        assert response.status_code == 200
        
        events = response.json()
        assert isinstance(events, list)
        print(f"Found {len(events)} linkable events")
        
        # Verify event structure has required fields
        if events:
            event = events[0]
            assert "event_id" in event
            assert "name" in event
            assert "is_confirmed" in event, "Event should have is_confirmed field"
            assert "is_currently_linked" in event, "Event should have is_currently_linked field"
            
            # Check is_confirmed and stage relationship
            confirmed_stages = ["Committed", "Won", "Closed"]
            if event.get("stage") in confirmed_stages:
                assert event["is_confirmed"] == True
            print(f"Sample event: name={event.get('name')}, is_confirmed={event.get('is_confirmed')}, stage={event.get('stage')}")
    
    def test_03_linkable_events_404_for_invalid_activation(self):
        """Test linkable-events returns 404 for non-existent activation"""
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations/invalid_activation_id/linkable-events",
            cookies=self.session.cookies
        )
        print(f"Invalid activation linkable-events response: {response.status_code}")
        assert response.status_code == 404
    
    def test_04_get_linked_event_details(self):
        """Test GET /api/demand-studio/activations/{id}/linked-event-details endpoint"""
        # First get activations and find one with a linked event
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        # Find activation with linked event
        linked_activation = next((a for a in activations if a.get("linked_event_id")), None)
        
        if not linked_activation:
            pytest.skip("No activation with linked event to test linked-event-details")
        
        activation_id = linked_activation["activation_id"]
        
        # Get linked event details
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/linked-event-details",
            cookies=self.session.cookies
        )
        print(f"Get linked event details response: {response.status_code}")
        assert response.status_code == 200
        
        event = response.json()
        assert "event_id" in event
        assert "name" in event
        assert "is_confirmed" in event
        print(f"Linked event: name={event.get('name')}, is_confirmed={event.get('is_confirmed')}, stage={event.get('stage')}")
    
    def test_05_linked_event_details_404_for_unlinked_activation(self):
        """Test linked-event-details returns 404 when no event is linked"""
        # First get activations and find one WITHOUT a linked event
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        # Find activation without linked event
        unlinked_activation = next((a for a in activations if not a.get("linked_event_id")), None)
        
        if not unlinked_activation:
            pytest.skip("No unlinked activation to test 404 response")
        
        activation_id = unlinked_activation["activation_id"]
        
        # Get linked event details should return 404
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/linked-event-details",
            cookies=self.session.cookies
        )
        print(f"Unlinked activation linked-event-details response: {response.status_code}")
        assert response.status_code == 404
    
    def test_06_get_linked_activation_for_event(self):
        """Test GET /api/demand-studio/events/{eventId}/linked-activation endpoint"""
        # First get events that might have an activation linked
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        # Find activation with linked event
        linked_activation = next((a for a in activations if a.get("linked_event_id")), None)
        
        if not linked_activation:
            pytest.skip("No linked event to test linked-activation endpoint")
        
        event_id = linked_activation["linked_event_id"]
        
        # Get linked activation for event
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/events/{event_id}/linked-activation",
            cookies=self.session.cookies
        )
        print(f"Get linked activation for event response: {response.status_code}")
        assert response.status_code == 200
        
        activation = response.json()
        if activation:  # Can be null if no activation linked
            assert "activation_id" in activation
            assert "name" in activation
            print(f"Linked activation: name={activation.get('name')}, budget={activation.get('budget')}")
    
    def test_07_linked_activation_returns_null_for_unlinked_event(self):
        """Test linked-activation returns null for event without linked activation"""
        # Get events from orchestration
        events_response = self.session.get(
            f"{BASE_URL}/api/orchestration/events",
            cookies=self.session.cookies
        )
        
        if events_response.status_code != 200:
            pytest.skip("Cannot access events endpoint")
        
        events = events_response.json()
        
        # Find event without linked activation
        unlinked_event = next((e for e in events if not e.get("linked_activation_id")), None)
        
        if not unlinked_event:
            pytest.skip("No unlinked event to test null response")
        
        event_id = unlinked_event["event_id"]
        
        # Get linked activation should return null
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/events/{event_id}/linked-activation",
            cookies=self.session.cookies
        )
        print(f"Unlinked event linked-activation response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Response for unlinked event: {data}")
        # Can be null or empty response
        assert data is None or data == {}
    
    def test_08_link_activation_to_event(self):
        """Test POST /api/demand-studio/activations/{id}/link-event/{eventId}"""
        # Get an unlinked activation
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        unlinked_activation = next((a for a in activations if not a.get("linked_event_id")), None)
        
        if not unlinked_activation:
            pytest.skip("No unlinked activation to test linking")
        
        activation_id = unlinked_activation["activation_id"]
        
        # Get linkable events for this activation
        events_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/linkable-events",
            cookies=self.session.cookies
        )
        assert events_response.status_code == 200
        events = events_response.json()
        
        # Find an unlinked event
        available_event = next((e for e in events if not e.get("is_currently_linked")), None)
        
        if not available_event:
            pytest.skip("No available event to link")
        
        event_id = available_event["event_id"]
        
        # Link activation to event
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/link-event/{event_id}",
            cookies=self.session.cookies
        )
        print(f"Link activation to event response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("activation_id") == activation_id
        assert data.get("event_id") == event_id
        print(f"Successfully linked: {data.get('message')}")
        
        # Store for cleanup
        self._linked_activation_id = activation_id
        self._linked_event_id = event_id
    
    def test_09_unlink_activation_from_event(self):
        """Test DELETE /api/demand-studio/activations/{id}/unlink-event"""
        # Get an activation with linked event
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        linked_activation = next((a for a in activations if a.get("linked_event_id")), None)
        
        if not linked_activation:
            pytest.skip("No linked activation to test unlinking")
        
        activation_id = linked_activation["activation_id"]
        
        # Unlink
        response = self.session.delete(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/unlink-event",
            cookies=self.session.cookies
        )
        print(f"Unlink activation response: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        print(f"Unlink result: {data.get('message')}")
        
        # Verify unlinked
        verification_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        activations_after = verification_response.json()
        updated_activation = next((a for a in activations_after if a["activation_id"] == activation_id), None)
        
        if updated_activation:
            assert updated_activation.get("linked_event_id") is None
            print("Verified: activation is now unlinked")
    
    def test_10_linkable_events_shows_confirmation_status(self):
        """Verify linkable events include is_confirmed and stage fields"""
        activations_response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert activations_response.status_code == 200
        activations = activations_response.json()
        
        if not activations:
            pytest.skip("No activations to test")
        
        activation_id = activations[0]["activation_id"]
        
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/linkable-events",
            cookies=self.session.cookies
        )
        assert response.status_code == 200
        events = response.json()
        
        if not events:
            pytest.skip("No events available")
        
        # Check all events have required status fields
        confirmed_stages = ["Committed", "Won", "Closed"]
        for event in events:
            assert "is_confirmed" in event, f"Event {event.get('event_id')} missing is_confirmed"
            assert "stage" in event, f"Event {event.get('event_id')} missing stage"
            
            # Verify is_confirmed matches stage
            expected_confirmed = event.get("stage") in confirmed_stages
            assert event["is_confirmed"] == expected_confirmed, \
                f"Event {event.get('event_id')}: is_confirmed={event['is_confirmed']} but stage={event.get('stage')}"
        
        print(f"All {len(events)} events have correct confirmation status fields")
        
        # Count confirmed vs in progress
        confirmed_count = sum(1 for e in events if e.get("is_confirmed"))
        in_progress_count = len(events) - confirmed_count
        print(f"Events: {confirmed_count} confirmed, {in_progress_count} in progress")


class TestActivationsWithLinkedEvents:
    """Test that activations list includes linked event info"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200
        yield
    
    def test_activations_include_linked_event_info(self):
        """Verify activations endpoint enriches linked event data"""
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/activations",
            cookies=self.session.cookies
        )
        assert response.status_code == 200
        activations = response.json()
        
        # Find activation with linked event
        linked_activation = next((a for a in activations if a.get("linked_event_id")), None)
        
        if not linked_activation:
            print("No activation with linked event found")
            return
        
        # Verify linked_event enrichment
        assert "linked_event" in linked_activation or "linked_event_name" in linked_activation, \
            "Activation with linked_event_id should have linked_event info"
        
        if "linked_event" in linked_activation:
            linked_event = linked_activation["linked_event"]
            assert "name" in linked_event
            print(f"Linked event info: name={linked_event.get('name')}, client_name={linked_event.get('client_name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
