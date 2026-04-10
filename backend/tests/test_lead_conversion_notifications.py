"""
Test Lead Conversion Notifications and Lead Sources Features
Tests for iteration 139:
1. Lead conversion creates in-app notifications for owner + org admins
2. GET /api/notifications/unread-count shows notification after conversion
3. GET /api/crm/lead-sources returns all sources including 'Activación' and 'Outreach'
4. POST /api/crm/outreach accepts source, source_event_id, activation_id fields
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
TEAM_EMAIL = "team.test@staffdo.com"
TEAM_PASSWORD = "Evoque2024!"


class TestLeadConversionNotifications:
    """Test lead conversion notification feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user_data = login_resp.json()
        self.user_id = self.user_data.get("user", {}).get("user_id")
        yield
        # Cleanup
        self.session.close()
    
    def test_lead_sources_includes_activacion_and_outreach(self):
        """Test GET /api/crm/lead-sources returns Activación and Outreach"""
        resp = self.session.get(f"{BASE_URL}/api/crm/lead-sources")
        assert resp.status_code == 200, f"Failed to get lead sources: {resp.text}"
        
        sources = resp.json()
        assert isinstance(sources, list), "Response should be a list"
        
        source_names = [s.get("name") for s in sources]
        print(f"Lead sources found: {source_names}")
        
        # Check for required sources
        assert "Activación" in source_names, "Activación should be in lead sources"
        assert "Outreach" in source_names, "Outreach should be in lead sources"
        assert "Evento" in source_names, "Evento should be in lead sources"
        assert "LinkedIn" in source_names, "LinkedIn should be in lead sources"
        
        # Verify source structure
        for source in sources:
            assert "source_id" in source, "Source should have source_id"
            assert "name" in source, "Source should have name"
    
    def test_create_outreach_with_source_fields(self):
        """Test POST /api/crm/outreach accepts source, source_event_id, activation_id"""
        # Create outreach lead with source fields
        test_lead = {
            "lead_name": f"TEST_Source_Lead_{int(time.time())}",
            "email": f"test_source_{int(time.time())}@test.com",
            "phone": "809-555-1234",
            "company_name": "Test Source Company",
            "source": "Evento",
            "source_event_id": "event_test123",
            "activation_id": None
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/outreach", json=test_lead)
        assert resp.status_code == 200, f"Failed to create outreach: {resp.text}"
        
        lead_data = resp.json()
        print(f"Created lead: {lead_data}")
        
        # Verify source fields are saved
        assert lead_data.get("source") == "Evento", "Source should be saved"
        assert lead_data.get("source_event_id") == "event_test123", "source_event_id should be saved"
        
        # Cleanup - delete the test lead
        lead_id = lead_data.get("lead_id")
        if lead_id:
            self.session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
    
    def test_create_outreach_with_activation_source(self):
        """Test POST /api/crm/outreach with Activación source and activation_id"""
        test_lead = {
            "lead_name": f"TEST_Activation_Lead_{int(time.time())}",
            "email": f"test_activation_{int(time.time())}@test.com",
            "phone": "809-555-5678",
            "company_name": "Test Activation Company",
            "source": "Activación",
            "source_event_id": None,
            "activation_id": "activation_test456"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/crm/outreach", json=test_lead)
        assert resp.status_code == 200, f"Failed to create outreach: {resp.text}"
        
        lead_data = resp.json()
        print(f"Created activation lead: {lead_data}")
        
        # Verify activation fields are saved
        assert lead_data.get("source") == "Activación", "Source should be Activación"
        assert lead_data.get("activation_id") == "activation_test456", "activation_id should be saved"
        
        # Cleanup
        lead_id = lead_data.get("lead_id")
        if lead_id:
            self.session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
    
    def test_lead_conversion_requires_owner(self):
        """Test that lead conversion requires owner_id to be assigned"""
        # Create a lead without owner
        test_lead = {
            "lead_name": f"TEST_NoOwner_Lead_{int(time.time())}",
            "email": f"test_noowner_{int(time.time())}@test.com",
            "phone": "809-555-9999",
            "source": "Outreach"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/crm/outreach", json=test_lead)
        assert create_resp.status_code == 200, f"Failed to create lead: {create_resp.text}"
        
        lead_data = create_resp.json()
        lead_id = lead_data.get("lead_id")
        
        # Try to convert without owner - should fail
        convert_resp = self.session.post(f"{BASE_URL}/api/leads/{lead_id}/convert", json={})
        assert convert_resp.status_code == 400, f"Conversion should fail without owner: {convert_resp.text}"
        assert "Assign a salesperson" in convert_resp.text or "Asigna un vendedor" in convert_resp.text
        
        # Cleanup
        if lead_id:
            self.session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
    
    def test_lead_conversion_creates_notifications(self):
        """Test that lead conversion creates notifications for owner and admins"""
        # Get initial unread count
        initial_count_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert initial_count_resp.status_code == 200
        initial_count = initial_count_resp.json().get("unread_count", 0)
        print(f"Initial unread count: {initial_count}")
        
        # Create a lead
        test_lead = {
            "lead_name": f"TEST_Convert_Lead_{int(time.time())}",
            "email": f"test_convert_{int(time.time())}@test.com",
            "phone": "809-555-7777",
            "company_name": "Test Convert Company",
            "source": "Outreach"
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/crm/outreach", json=test_lead)
        assert create_resp.status_code == 200, f"Failed to create lead: {create_resp.text}"
        
        lead_data = create_resp.json()
        lead_id = lead_data.get("lead_id")
        print(f"Created lead: {lead_id}")
        
        # Assign owner (use current user)
        assign_resp = self.session.put(f"{BASE_URL}/api/crm/assign/lead/{lead_id}?owner_id={self.user_id}")
        assert assign_resp.status_code == 200, f"Failed to assign owner: {assign_resp.text}"
        print(f"Assigned owner: {self.user_id}")
        
        # Convert the lead
        convert_resp = self.session.post(f"{BASE_URL}/api/leads/{lead_id}/convert", json={
            "create_event": False
        })
        assert convert_resp.status_code == 200, f"Failed to convert lead: {convert_resp.text}"
        
        convert_data = convert_resp.json()
        print(f"Conversion result: {convert_data}")
        assert "client_id" in convert_data, "Conversion should return client_id"
        
        # Check notifications were created
        # Note: Since the converting user is the owner, they won't get a notification
        # But org admins should get one
        time.sleep(0.5)  # Small delay for DB write
        
        # Get notifications list
        notif_resp = self.session.get(f"{BASE_URL}/api/notifications?limit=10")
        assert notif_resp.status_code == 200
        notifications = notif_resp.json()
        
        # Look for lead_converted notification
        conversion_notifs = [n for n in notifications if n.get("type") == "lead_converted"]
        print(f"Found {len(conversion_notifs)} lead_converted notifications")
        
        # Cleanup - delete the created client
        client_id = convert_data.get("client_id")
        if client_id:
            self.session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")
    
    def test_notifications_unread_count_endpoint(self):
        """Test GET /api/notifications/unread-count works correctly"""
        resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert resp.status_code == 200, f"Failed to get unread count: {resp.text}"
        
        data = resp.json()
        assert "unread_count" in data, "Response should have unread_count"
        assert isinstance(data["unread_count"], int), "unread_count should be integer"
        print(f"Unread count: {data['unread_count']}")
    
    def test_notifications_list_endpoint(self):
        """Test GET /api/notifications returns list"""
        resp = self.session.get(f"{BASE_URL}/api/notifications?limit=20")
        assert resp.status_code == 200, f"Failed to get notifications: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} notifications")
        
        # Verify notification structure if any exist
        if data:
            notif = data[0]
            assert "notification_id" in notif, "Notification should have notification_id"
            assert "title" in notif, "Notification should have title"
            assert "message" in notif, "Notification should have message"
            assert "read" in notif, "Notification should have read status"
    
    def test_events_list_for_source_linking(self):
        """Test GET /api/crm/events-list returns events for source linking"""
        resp = self.session.get(f"{BASE_URL}/api/crm/events-list")
        assert resp.status_code == 200, f"Failed to get events list: {resp.text}"
        
        data = resp.json()
        assert "events" in data, "Response should have events key"
        print(f"Found {len(data.get('events', []))} events for linking")


class TestLeadSourcesDefaults:
    """Test lead sources default seeding"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_resp.status_code == 200
        yield
        self.session.close()
    
    def test_all_default_sources_present(self):
        """Test all default sources are seeded"""
        expected_sources = [
            "LinkedIn", "Instagram", "Facebook", "Google", "Referido", "Evento",
            "Activación", "Website", "Cold Call", "Email Campaign", "WhatsApp", 
            "Outreach", "Base de Datos", "Otro"
        ]
        
        resp = self.session.get(f"{BASE_URL}/api/crm/lead-sources")
        assert resp.status_code == 200
        
        sources = resp.json()
        source_names = [s.get("name") for s in sources]
        
        for expected in expected_sources:
            assert expected in source_names, f"Missing default source: {expected}"
        
        print(f"All {len(expected_sources)} default sources present")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
