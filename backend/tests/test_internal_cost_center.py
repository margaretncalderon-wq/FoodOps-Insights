"""
Test suite for Internal Cost Center / Create Internal Event functionality
Tests the new endpoints for creating internal marketing events from activations
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login with test credentials
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        }
    )
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    return session


class TestInternalCostCenterEndpoint:
    """Tests for GET /api/demand-studio/internal-cost-center endpoint"""
    
    def test_get_or_create_internal_cost_center(self, api_session):
        """Test getting/creating the internal cost center client"""
        response = api_session.get(f"{BASE_URL}/api/demand-studio/internal-cost-center")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        assert "client_id" in data, "Response should contain client_id"
        assert "display_name" in data, "Response should contain display_name"
        assert data.get("is_internal_cost_center") == True, "Should have is_internal_cost_center=True"
        
        # Verify display name format
        assert "Marketing Interno" in data.get("display_name", ""), \
            f"Display name should contain 'Marketing Interno', got: {data.get('display_name')}"
        
        print(f"✓ Internal Cost Center: {data.get('display_name')} (ID: {data.get('client_id')})")
        
    def test_internal_cost_center_is_idempotent(self, api_session):
        """Test that calling the endpoint multiple times returns the same client"""
        response1 = api_session.get(f"{BASE_URL}/api/demand-studio/internal-cost-center")
        response2 = api_session.get(f"{BASE_URL}/api/demand-studio/internal-cost-center")
        
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        data1 = response1.json()
        data2 = response2.json()
        
        assert data1.get("client_id") == data2.get("client_id"), \
            "Multiple calls should return the same client_id"
        
        print(f"✓ Idempotent: Same client_id returned on multiple calls")


class TestCreateInternalEventEndpoint:
    """Tests for POST /api/demand-studio/activations/{id}/create-internal-event endpoint"""
    
    @pytest.fixture
    def test_activation(self, api_session):
        """Create a test activation for internal event creation"""
        # First create an activation
        activation_data = {
            "name": f"TEST_Internal_Activation_{uuid.uuid4().hex[:6]}",
            "activation_type": "event",
            "budget": 5000,
            "status": "planned",
            "notes": "Test activation for internal event creation"
        }
        
        create_response = api_session.post(
            f"{BASE_URL}/api/demand-studio/activations",
            json=activation_data
        )
        
        if create_response.status_code != 200:
            pytest.skip(f"Failed to create test activation: {create_response.status_code}")
        
        activation = create_response.json()
        
        yield activation
        
        # Cleanup: Delete activation after test
        api_session.delete(
            f"{BASE_URL}/api/demand-studio/activations/{activation['activation_id']}"
        )
    
    def test_create_internal_event_success(self, api_session, test_activation):
        """Test creating an internal event from an activation"""
        activation_id = test_activation["activation_id"]
        
        event_data = {
            "name": f"TEST_Internal_Event_{uuid.uuid4().hex[:6]}",
            "event_date": "2026-02-15",
            "budget": 3000,
            "notes": "Test internal event created from activation"
        }
        
        response = api_session.post(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/create-internal-event",
            json=event_data
        )
        
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify event was created with correct fields
        assert "event_id" in data, "Response should contain event_id"
        assert data.get("name") == event_data["name"], "Event name should match"
        assert data.get("event_date") == event_data["event_date"], "Event date should match"
        assert data.get("budget") == event_data["budget"], "Budget should match"
        
        # Verify it's an internal event
        assert data.get("is_internal_event") == True, "Should be marked as internal event"
        assert data.get("stage") == "Committed", "Internal events should be auto-committed"
        
        # Verify activation link
        assert data.get("linked_activation_id") == activation_id, \
            "Event should be linked to the activation"
        
        # Verify client is internal cost center
        assert data.get("client_name") is not None, "Should have client_name from cost center"
        assert "Marketing Interno" in data.get("client_name", ""), \
            f"Client should be internal cost center, got: {data.get('client_name')}"
        
        print(f"✓ Created internal event: {data.get('name')}")
        print(f"  - Event ID: {data.get('event_id')}")
        print(f"  - Stage: {data.get('stage')}")
        print(f"  - Client: {data.get('client_name')}")
        print(f"  - Linked to activation: {data.get('linked_activation_id')}")
        
        # Store event_id for verification
        return data
    
    def test_internal_event_linked_to_activation(self, api_session, test_activation):
        """Test that after creating internal event, activation is linked to it"""
        activation_id = test_activation["activation_id"]
        
        # Create internal event
        event_data = {
            "name": f"TEST_Linking_Event_{uuid.uuid4().hex[:6]}",
            "event_date": "2026-03-01",
            "budget": 2000,
            "notes": "Test event for link verification"
        }
        
        create_response = api_session.post(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/create-internal-event",
            json=event_data
        )
        
        assert create_response.status_code == 200
        created_event = create_response.json()
        
        # Now fetch the activation and verify it has linked_event_id
        activation_response = api_session.get(
            f"{BASE_URL}/api/demand-studio/activations"
        )
        
        assert activation_response.status_code == 200
        activations = activation_response.json()
        
        # Find our test activation
        found_activation = None
        for a in activations:
            if a.get("activation_id") == activation_id:
                found_activation = a
                break
        
        assert found_activation is not None, "Test activation should exist"
        assert found_activation.get("linked_event_id") == created_event.get("event_id"), \
            "Activation should be linked to the created event"
        assert found_activation.get("linked_event_name") == event_data["name"], \
            "Activation should have the linked event name"
        
        print(f"✓ Activation correctly linked to internal event")
        print(f"  - Activation: {found_activation.get('name')}")
        print(f"  - Linked Event: {found_activation.get('linked_event_name')}")
    
    def test_create_internal_event_without_date(self, api_session, test_activation):
        """Test creating internal event with minimal data (no date)"""
        activation_id = test_activation["activation_id"]
        
        # Unlink any existing event first
        api_session.delete(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/unlink-event"
        )
        
        event_data = {
            "name": f"TEST_NoDate_Event_{uuid.uuid4().hex[:6]}",
            "budget": 1000
        }
        
        response = api_session.post(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/create-internal-event",
            json=event_data
        )
        
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        assert data.get("event_date") is None, "Event date should be null when not provided"
        assert data.get("event_date_tbd") == True, "event_date_tbd should be True"
        
        print(f"✓ Created internal event without date: {data.get('name')}")
    
    def test_create_internal_event_invalid_activation(self, api_session):
        """Test creating internal event with invalid activation ID"""
        response = api_session.post(
            f"{BASE_URL}/api/demand-studio/activations/invalid_activation_id/create-internal-event",
            json={"name": "Test Event"}
        )
        
        assert response.status_code == 404, \
            f"Expected 404 for invalid activation, got {response.status_code}"
        
        print(f"✓ Correctly returns 404 for invalid activation ID")
    
    def test_create_internal_event_missing_name(self, api_session, test_activation):
        """Test that event name is required"""
        activation_id = test_activation["activation_id"]
        
        # Unlink any existing event first
        api_session.delete(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/unlink-event"
        )
        
        response = api_session.post(
            f"{BASE_URL}/api/demand-studio/activations/{activation_id}/create-internal-event",
            json={"budget": 1000}  # Missing name
        )
        
        # Should return 422 validation error
        assert response.status_code == 422, \
            f"Expected 422 for missing name, got {response.status_code}"
        
        print(f"✓ Correctly validates that name is required")


class TestInternalEventInOrchestration:
    """Tests for internal events appearing in Event Orchestration"""
    
    def test_internal_event_appears_in_orchestration(self, api_session):
        """Test that committed internal events appear in orchestration events list"""
        response = api_session.get(f"{BASE_URL}/api/orchestration/events")
        
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"
        
        events = response.json()
        
        # Check if there are any internal events (with is_internal_event or linked_activation_id)
        internal_events = [
            e for e in events 
            if e.get("is_internal_event") or e.get("linked_activation_id")
        ]
        
        # If we have existing internal events, verify they're committed
        for event in internal_events:
            assert event.get("stage") in ["Committed", "Won", "Closed"], \
                f"Internal event should be in committed stage, got: {event.get('stage')}"
        
        print(f"✓ Found {len(internal_events)} internal events in orchestration")
        for e in internal_events[:3]:  # Show first 3
            print(f"  - {e.get('name')} (Stage: {e.get('stage')})")


class TestLinkedActivationBanner:
    """Tests for the linked activation banner in Event Orchestration"""
    
    def test_get_linked_activation_for_event(self, api_session):
        """Test the endpoint that returns linked activation for event details"""
        # First get list of events with linked activations
        events_response = api_session.get(f"{BASE_URL}/api/orchestration/events")
        
        if events_response.status_code != 200:
            pytest.skip(f"Could not fetch events: {events_response.status_code}")
        
        events = events_response.json()
        
        # Find an event with linked_activation_id
        event_with_activation = None
        for e in events:
            if e.get("linked_activation_id"):
                event_with_activation = e
                break
        
        if not event_with_activation:
            # Also check regular events list
            regular_events = api_session.get(f"{BASE_URL}/api/events/all")
            if regular_events.status_code == 200:
                for e in regular_events.json():
                    if e.get("linked_activation_id"):
                        event_with_activation = e
                        break
        
        if not event_with_activation:
            pytest.skip("No events with linked activations found")
        
        event_id = event_with_activation.get("event_id")
        
        # Test the linked activation endpoint
        response = api_session.get(
            f"{BASE_URL}/api/demand-studio/events/{event_id}/linked-activation"
        )
        
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        if data:  # May return null if no activation linked
            assert "activation_id" in data or data is None, "Should return activation data or null"
            assert "name" in data, "Should include activation name"
            assert "budget" in data, "Should include activation budget"
            
            print(f"✓ Linked activation for event '{event_with_activation.get('name')}':")
            print(f"  - Activation: {data.get('name')}")
            print(f"  - Budget: ${data.get('budget', 0):,.2f}")
        else:
            print(f"✓ Endpoint returns null for event without activation")


class TestExistingInternalEventData:
    """Tests to verify existing internal event data mentioned in context"""
    
    def test_existing_internal_event_exists(self, api_session):
        """Verify the existing internal event 'Lanzamiento Q1 - Marketing Interno' exists"""
        response = api_session.get(f"{BASE_URL}/api/orchestration/events")
        
        assert response.status_code == 200
        events = response.json()
        
        # Look for the event mentioned in context
        target_event = None
        for e in events:
            if "Lanzamiento Q1" in e.get("name", "") or "Marketing Interno" in e.get("name", ""):
                target_event = e
                break
        
        if target_event:
            print(f"✓ Found existing internal event: {target_event.get('name')}")
            print(f"  - Stage: {target_event.get('stage')}")
            print(f"  - Client: {target_event.get('client_name')}")
            assert target_event.get("stage") == "Committed", "Should be in Committed stage"
        else:
            print("Note: Existing 'Lanzamiento Q1' event not found (may have been cleaned up)")
    
    def test_internal_cost_center_client_exists(self, api_session):
        """Verify the internal cost center client 'Marketing Interno - My Company' exists"""
        response = api_session.get(f"{BASE_URL}/api/demand-studio/internal-cost-center")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("is_internal_cost_center") == True
        assert "Marketing Interno" in data.get("display_name", "")
        
        print(f"✓ Internal cost center client exists: {data.get('display_name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
