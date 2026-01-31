"""
Test pending_balance field in Events API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEventsPendingBalance:
    """Test pending_balance field in events API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        print(f"Login successful")
    
    def test_events_list_returns_pending_balance(self):
        """Test GET /api/events returns pending_balance field"""
        response = self.session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Failed to get events: {response.text}"
        
        events = response.json()
        assert isinstance(events, list), "Events should be a list"
        
        if len(events) > 0:
            first_event = events[0]
            assert "pending_balance" in first_event, f"pending_balance field missing in event: {first_event.keys()}"
            print(f"PASS: pending_balance field found in events list")
            print(f"Sample event: {first_event.get('name')} - pending_balance: {first_event.get('pending_balance')}")
        else:
            print("WARNING: No events found to test")
    
    def test_events_pipeline_returns_pending_balance(self):
        """Test GET /api/events/pipeline returns pending_balance field"""
        response = self.session.get(f"{BASE_URL}/api/events/pipeline")
        assert response.status_code == 200, f"Failed to get pipeline: {response.text}"
        
        pipeline = response.json()
        assert isinstance(pipeline, dict), "Pipeline should be a dict"
        
        # Check each stage
        found_event = False
        for stage, events in pipeline.items():
            if len(events) > 0:
                first_event = events[0]
                assert "pending_balance" in first_event, f"pending_balance field missing in pipeline event: {first_event.keys()}"
                print(f"PASS: pending_balance field found in pipeline stage '{stage}'")
                print(f"Sample event: {first_event.get('name')} - pending_balance: {first_event.get('pending_balance')}")
                found_event = True
                break
        
        if not found_event:
            print("WARNING: No events found in pipeline to test")
    
    def test_pending_balance_is_numeric(self):
        """Test that pending_balance is a numeric value"""
        response = self.session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200
        
        events = response.json()
        for event in events:
            pending_balance = event.get("pending_balance")
            assert pending_balance is not None, "pending_balance should not be None"
            assert isinstance(pending_balance, (int, float)), f"pending_balance should be numeric, got {type(pending_balance)}"
        
        print(f"PASS: All {len(events)} events have numeric pending_balance")

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
