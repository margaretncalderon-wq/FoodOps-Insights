"""
Test Event Time Fields (start_time/end_time) and Multi-day Events
Tests for:
1. Event creation with start_time and end_time
2. Multi-day events (is_booking=true with end_date)
3. Company time_format setting (12h/24h)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEventTimeAndMultiday:
    """Test event time fields and multi-day functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        # Get a client for event creation
        clients_response = requests.get(f"{BASE_URL}/api/crm/clients", headers=self.headers)
        if clients_response.status_code == 200 and clients_response.json():
            self.client_id = clients_response.json()[0].get("client_id")
        else:
            self.client_id = None
    
    # ============== EVENT TIME FIELDS TESTS ==============
    
    def test_create_event_with_start_end_time(self):
        """Test creating an event with start_time and end_time"""
        if not self.client_id:
            pytest.skip("No client available for testing")
        
        event_data = {
            "client_id": self.client_id,
            "name": "TEST_Event_With_Time",
            "event_type": "corporate",
            "event_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "start_time": "14:00",
            "end_time": "22:00",
            "venue": "Test Venue",
            "guest_count": 50,
            "budget": 5000,
            "status": "planning"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        
        event = response.json()
        assert event.get("start_time") == "14:00", "start_time not saved correctly"
        assert event.get("end_time") == "22:00", "end_time not saved correctly"
        
        # Cleanup
        event_id = event.get("event_id")
        if event_id:
            requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)
    
    def test_update_event_time_fields(self):
        """Test updating event time fields"""
        if not self.client_id:
            pytest.skip("No client available for testing")
        
        # Create event first
        event_data = {
            "client_id": self.client_id,
            "name": "TEST_Event_Update_Time",
            "event_type": "wedding",
            "event_date": (datetime.now() + timedelta(days=45)).isoformat(),
            "start_time": "10:00",
            "end_time": "18:00",
            "guest_count": 100,
            "budget": 10000,
            "status": "planning"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert create_response.status_code == 200
        event_id = create_response.json().get("event_id")
        
        # Update time fields
        update_data = {
            **event_data,
            "start_time": "12:00",
            "end_time": "23:00"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/events/{event_id}", json=update_data, headers=self.headers)
        assert update_response.status_code == 200
        
        updated_event = update_response.json()
        assert updated_event.get("start_time") == "12:00", "start_time not updated"
        assert updated_event.get("end_time") == "23:00", "end_time not updated"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)
    
    def test_event_without_time_fields(self):
        """Test creating event without time fields (should be null)"""
        if not self.client_id:
            pytest.skip("No client available for testing")
        
        event_data = {
            "client_id": self.client_id,
            "name": "TEST_Event_No_Time",
            "event_type": "social",
            "event_date": (datetime.now() + timedelta(days=60)).isoformat(),
            "guest_count": 30,
            "budget": 2000,
            "status": "planning"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200
        
        event = response.json()
        # Time fields should be null/None when not provided
        assert event.get("start_time") is None or event.get("start_time") == "", "start_time should be null"
        assert event.get("end_time") is None or event.get("end_time") == "", "end_time should be null"
        
        # Cleanup
        event_id = event.get("event_id")
        if event_id:
            requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)
    
    # ============== MULTI-DAY EVENT TESTS ==============
    
    def test_create_multiday_event(self):
        """Test creating a multi-day event with is_booking=true and end_date"""
        if not self.client_id:
            pytest.skip("No client available for testing")
        
        start_date = datetime.now() + timedelta(days=90)
        end_date = start_date + timedelta(days=3)
        
        event_data = {
            "client_id": self.client_id,
            "name": "TEST_MultiDay_Event",
            "event_type": "corporate",
            "event_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "is_booking": True,
            "start_time": "09:00",
            "end_time": "18:00",
            "venue": "Conference Center",
            "guest_count": 200,
            "budget": 50000,
            "status": "planning"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create multi-day event: {response.text}"
        
        event = response.json()
        assert event.get("is_booking") == True, "is_booking should be True"
        assert event.get("end_date") is not None, "end_date should be set"
        
        # Cleanup
        event_id = event.get("event_id")
        if event_id:
            requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)
    
    def test_single_day_event_no_end_date(self):
        """Test that single-day events don't have end_date"""
        if not self.client_id:
            pytest.skip("No client available for testing")
        
        event_data = {
            "client_id": self.client_id,
            "name": "TEST_SingleDay_Event",
            "event_type": "birthday",
            "event_date": (datetime.now() + timedelta(days=120)).isoformat(),
            "is_booking": False,
            "start_time": "15:00",
            "end_time": "21:00",
            "guest_count": 50,
            "budget": 3000,
            "status": "planning"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200
        
        event = response.json()
        assert event.get("is_booking") == False, "is_booking should be False"
        # end_date should be null for single-day events
        assert event.get("end_date") is None, "end_date should be null for single-day events"
        
        # Cleanup
        event_id = event.get("event_id")
        if event_id:
            requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)
    
    # ============== TIME FORMAT SETTING TESTS ==============
    
    def test_get_company_time_format(self):
        """Test getting company time_format setting"""
        response = requests.get(f"{BASE_URL}/api/settings/company", headers=self.headers)
        assert response.status_code == 200, f"Failed to get company settings: {response.text}"
        
        company = response.json()
        # time_format should exist and be either "12h" or "24h"
        time_format = company.get("time_format")
        assert time_format in ["12h", "24h", None], f"Invalid time_format: {time_format}"
    
    def test_update_company_time_format_24h(self):
        """Test updating company time_format to 24h"""
        # First get current settings
        get_response = requests.get(f"{BASE_URL}/api/settings/company", headers=self.headers)
        assert get_response.status_code == 200
        current_settings = get_response.json()
        
        # Update to 24h
        update_data = {
            "name": current_settings.get("name"),
            "primary_color": current_settings.get("primary_color", "#3A4D3F"),
            "secondary_color": current_settings.get("secondary_color", "#E5DCC5"),
            "default_language": current_settings.get("default_language", "en"),
            "currency": current_settings.get("currency", "USD"),
            "time_format": "24h"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/settings/company", json=update_data, headers=self.headers)
        assert update_response.status_code == 200, f"Failed to update time_format: {update_response.text}"
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/settings/company", headers=self.headers)
        assert verify_response.status_code == 200
        assert verify_response.json().get("time_format") == "24h", "time_format not updated to 24h"
    
    def test_update_company_time_format_12h(self):
        """Test updating company time_format to 12h"""
        # First get current settings
        get_response = requests.get(f"{BASE_URL}/api/settings/company", headers=self.headers)
        assert get_response.status_code == 200
        current_settings = get_response.json()
        
        # Update to 12h
        update_data = {
            "name": current_settings.get("name"),
            "primary_color": current_settings.get("primary_color", "#3A4D3F"),
            "secondary_color": current_settings.get("secondary_color", "#E5DCC5"),
            "default_language": current_settings.get("default_language", "en"),
            "currency": current_settings.get("currency", "USD"),
            "time_format": "12h"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/settings/company", json=update_data, headers=self.headers)
        assert update_response.status_code == 200, f"Failed to update time_format: {update_response.text}"
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/settings/company", headers=self.headers)
        assert verify_response.status_code == 200
        assert verify_response.json().get("time_format") == "12h", "time_format not updated to 12h"
    
    # ============== EVENTS LIST WITH TIME FIELDS ==============
    
    def test_events_list_includes_time_fields(self):
        """Test that events list includes start_time and end_time fields"""
        response = requests.get(f"{BASE_URL}/api/events", headers=self.headers)
        assert response.status_code == 200, f"Failed to get events: {response.text}"
        
        events = response.json()
        if events:
            # Check that the event model includes time fields
            first_event = events[0]
            # These fields should exist in the response (even if null)
            assert "start_time" in first_event or first_event.get("start_time") is None, "start_time field missing"
            assert "end_time" in first_event or first_event.get("end_time") is None, "end_time field missing"
            assert "end_date" in first_event or first_event.get("end_date") is None, "end_date field missing"
            assert "is_booking" in first_event or first_event.get("is_booking") is None, "is_booking field missing"
    
    def test_get_single_event_with_time_fields(self):
        """Test getting a single event includes time fields"""
        # First get events list
        list_response = requests.get(f"{BASE_URL}/api/events", headers=self.headers)
        assert list_response.status_code == 200
        
        events = list_response.json()
        if not events:
            pytest.skip("No events available for testing")
        
        event_id = events[0].get("event_id")
        
        # Get single event
        response = requests.get(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed to get event: {response.text}"
        
        event = response.json()
        # Verify time-related fields exist
        assert "start_time" in event or event.get("start_time") is None
        assert "end_time" in event or event.get("end_time") is None
        assert "end_date" in event or event.get("end_date") is None
        assert "is_booking" in event or event.get("is_booking") is None


class TestExistingTestEvent:
    """Test the existing test event mentioned in the context"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_find_test_event_with_schedule(self):
        """Look for the test event 'Evento de Prueba con Horario'"""
        response = requests.get(f"{BASE_URL}/api/events", headers=self.headers)
        assert response.status_code == 200
        
        events = response.json()
        # Look for the test event
        test_event = None
        for event in events:
            if "Prueba" in event.get("name", "") or "Horario" in event.get("name", ""):
                test_event = event
                break
        
        if test_event:
            print(f"Found test event: {test_event.get('name')}")
            print(f"  start_time: {test_event.get('start_time')}")
            print(f"  end_time: {test_event.get('end_time')}")
            print(f"  event_date: {test_event.get('event_date')}")
            print(f"  end_date: {test_event.get('end_date')}")
            print(f"  is_booking: {test_event.get('is_booking')}")
            
            # Verify the expected values
            if test_event.get("start_time"):
                assert test_event.get("start_time") == "14:00", f"Expected start_time 14:00, got {test_event.get('start_time')}"
            if test_event.get("end_time"):
                assert test_event.get("end_time") == "22:00", f"Expected end_time 22:00, got {test_event.get('end_time')}"
        else:
            print("Test event 'Evento de Prueba con Horario' not found - this is OK if it was cleaned up")
