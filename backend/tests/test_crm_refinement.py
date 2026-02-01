"""
CRM Refinement Tests - Testing the 6 new CRM sections:
1. Lead Outreach - Proactive contacts initiated by team
2. Inbound Leads - Contacts from forms, email, social
3. Follow-ups - Unified view of leads and clients with follow-up dates
4. Comms Log - Communication history
5. Owner Assignment - Assign owners to leads/clients
6. Clients - Client list with event history and lifetime value
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCRMRefinement:
    """Test suite for CRM Refinement - 6 sections"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.session.cookies.set("access_token", self.token)
    
    # ============== 1. LEAD OUTREACH TESTS ==============
    
    def test_get_outreach_leads(self):
        """Test GET /api/crm/outreach - Get outreach leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/crm/outreach - Found {len(data)} outreach leads")
    
    def test_create_outreach_lead(self):
        """Test POST /api/crm/outreach - Create new outreach lead"""
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Outreach_{unique_id}",
            "email": f"test_outreach_{unique_id}@example.com",
            "phone": "+1234567890",
            "company_name": "Test Company",
            "event_type": "corporate",
            "message": "Test outreach lead"
        }
        response = self.session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["lead_type"] == "outreach", "Lead type should be outreach"
        assert data["outreach_status"] == "New", "Initial status should be New"
        assert "lead_id" in data, "Response should contain lead_id"
        self.created_lead_id = data["lead_id"]
        print(f"✓ POST /api/crm/outreach - Created lead {self.created_lead_id}")
        return data["lead_id"]
    
    def test_update_outreach_status(self):
        """Test PUT /api/crm/outreach/{lead_id}/status - Update outreach status"""
        # First create a lead
        lead_id = self.test_create_outreach_lead()
        
        # Test all valid statuses
        valid_statuses = ["Contacted", "NoResponse", "Engaged", "New"]
        for status in valid_statuses:
            response = self.session.put(
                f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status={status}"
            )
            assert response.status_code == 200, f"Failed to update to {status}: {response.text}"
            print(f"✓ Updated outreach status to {status}")
        
        # Test invalid status
        response = self.session.put(
            f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=InvalidStatus"
        )
        assert response.status_code == 400, "Should reject invalid status"
        print("✓ Invalid status correctly rejected")
    
    # ============== 2. INBOUND LEADS TESTS ==============
    
    def test_get_inbound_leads(self):
        """Test GET /api/crm/inbound - Get inbound leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Verify inbound leads don't have lead_type=outreach
        for lead in data:
            assert lead.get("lead_type") != "outreach", "Inbound should not include outreach leads"
        print(f"✓ GET /api/crm/inbound - Found {len(data)} inbound leads")
    
    # ============== 3. FOLLOW-UPS TESTS ==============
    
    def test_get_follow_ups(self):
        """Test GET /api/crm/follow-ups - Get unified follow-up view"""
        response = self.session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Verify structure
        for item in data:
            assert "entity_type" in item, "Should have entity_type"
            assert "entity_id" in item, "Should have entity_id"
            assert "follow_up_date" in item, "Should have follow_up_date"
            assert item["entity_type"] in ["lead", "client"], "Entity type should be lead or client"
        print(f"✓ GET /api/crm/follow-ups - Found {len(data)} follow-ups")
    
    def test_update_follow_up(self):
        """Test PUT /api/crm/follow-ups/{entity_type}/{entity_id} - Update follow-up"""
        # First create a lead with follow-up
        lead_id = self.test_create_outreach_lead()
        
        # Update follow-up
        response = self.session.put(
            f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}?next_follow_up_date=2026-02-15&follow_up_type=Call"
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✓ PUT /api/crm/follow-ups - Updated follow-up date")
    
    def test_complete_follow_up(self):
        """Test POST /api/crm/follow-ups/{entity_type}/{entity_id}/complete - Complete follow-up"""
        # First create a lead
        lead_id = self.test_create_outreach_lead()
        
        # Set a follow-up first
        self.session.put(
            f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}?next_follow_up_date=2026-02-15&follow_up_type=Call"
        )
        
        # Complete the follow-up
        response = self.session.post(
            f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}/complete"
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✓ POST /api/crm/follow-ups/complete - Completed follow-up")
    
    # ============== 4. COMMS LOG TESTS ==============
    
    def test_create_comm_log(self):
        """Test POST /api/crm/comms - Create communication log"""
        # First create a lead
        lead_id = self.test_create_outreach_lead()
        
        comm_data = {
            "entity_type": "lead",
            "entity_id": lead_id,
            "comm_type": "call",
            "subject": "Initial contact",
            "content": "Called to discuss event requirements",
            "direction": "outbound"
        }
        response = self.session.post(f"{BASE_URL}/api/crm/comms", json=comm_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "log_id" in data, "Response should contain log_id"
        assert data["comm_type"] == "call", "Comm type should match"
        print(f"✓ POST /api/crm/comms - Created comm log {data['log_id']}")
        return lead_id, data["log_id"]
    
    def test_get_comm_logs(self):
        """Test GET /api/crm/comms/{entity_type}/{entity_id} - Get comm logs"""
        # First create a comm log
        lead_id, log_id = self.test_create_comm_log()
        
        response = self.session.get(f"{BASE_URL}/api/crm/comms/lead/{lead_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 1, "Should have at least one log"
        print(f"✓ GET /api/crm/comms - Found {len(data)} comm logs")
    
    def test_comm_types(self):
        """Test all communication types: call, email, meeting, note"""
        lead_id = self.test_create_outreach_lead()
        
        comm_types = ["call", "email", "meeting", "note"]
        for comm_type in comm_types:
            comm_data = {
                "entity_type": "lead",
                "entity_id": lead_id,
                "comm_type": comm_type,
                "content": f"Test {comm_type} communication",
                "direction": "outbound"
            }
            response = self.session.post(f"{BASE_URL}/api/crm/comms", json=comm_data)
            assert response.status_code == 200, f"Failed for {comm_type}: {response.text}"
            print(f"✓ Created {comm_type} comm log")
    
    # ============== 5. OWNER ASSIGNMENT TESTS ==============
    
    def test_assign_owner_to_lead(self):
        """Test PUT /api/crm/assign/{entity_type}/{entity_id} - Assign owner to lead"""
        # First create a lead
        lead_id = self.test_create_outreach_lead()
        
        # Assign owner
        response = self.session.put(
            f"{BASE_URL}/api/crm/assign/lead/{lead_id}?owner_id=user_64943c4d9526"
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✓ PUT /api/crm/assign - Assigned owner to lead")
    
    def test_get_by_owner(self):
        """Test GET /api/crm/by-owner/{owner_id} - Get leads/clients by owner"""
        response = self.session.get(f"{BASE_URL}/api/crm/by-owner/user_64943c4d9526")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "leads" in data, "Response should contain leads"
        assert "clients" in data, "Response should contain clients"
        print(f"✓ GET /api/crm/by-owner - Found {len(data['leads'])} leads, {len(data['clients'])} clients")
    
    # ============== 6. CLIENTS WITH EVENTS TESTS ==============
    
    def test_get_clients_with_events(self):
        """Test GET /api/crm/clients-with-events - Get clients with event history"""
        response = self.session.get(f"{BASE_URL}/api/crm/clients-with-events")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Verify structure
        for client in data:
            assert "client_id" in client, "Should have client_id"
            assert "display_name" in client, "Should have display_name"
            assert "events" in client, "Should have events array"
            assert "events_count" in client, "Should have events_count"
            assert "lifetime_value" in client, "Should have lifetime_value"
        print(f"✓ GET /api/crm/clients-with-events - Found {len(data)} clients")
    
    # ============== CRM STATS TESTS ==============
    
    def test_get_crm_stats(self):
        """Test GET /api/crm/stats - Get CRM statistics"""
        response = self.session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Verify all expected stats
        expected_fields = [
            "total_clients", "active_clients", "total_leads", "new_leads",
            "outreach_leads", "inbound_leads", "follow_ups_due"
        ]
        for field in expected_fields:
            assert field in data, f"Stats should contain {field}"
        print(f"✓ GET /api/crm/stats - Stats: {data}")
    
    # ============== EXISTING FUNCTIONALITY TESTS ==============
    
    def test_existing_leads_endpoint(self):
        """Test existing /api/leads endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/leads - Existing endpoint works, found {len(data)} leads")
    
    def test_existing_clients_endpoint(self):
        """Test existing /api/crm/clients endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/crm/clients - Existing endpoint works, found {len(data)} clients")
    
    def test_existing_events_endpoint(self):
        """Test existing /api/events endpoint still works"""
        response = self.session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/events - Existing endpoint works, found {len(data)} events")


class TestCRMDataIntegrity:
    """Test data integrity and no breaking changes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.session.cookies.set("access_token", self.token)
    
    def test_lead_model_has_new_fields(self):
        """Verify Lead model has new CRM enhancement fields"""
        # Create a lead and verify new fields
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Fields_{unique_id}",
            "email": f"test_fields_{unique_id}@example.com",
            "event_type": "wedding",
            "lead_type": "outreach",
            "outreach_status": "New",
            "next_follow_up_date": "2026-02-20",
            "follow_up_type": "Call"
        }
        response = self.session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify new fields exist
        assert "lead_type" in data, "Should have lead_type field"
        assert "outreach_status" in data, "Should have outreach_status field"
        print("✓ Lead model has new CRM enhancement fields")
    
    def test_client_model_has_new_fields(self):
        """Verify Client model has new CRM enhancement fields via clients-with-events"""
        response = self.session.get(f"{BASE_URL}/api/crm/clients-with-events")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        if len(data) > 0:
            client = data[0]
            # Verify new fields exist
            assert "lifetime_value" in client, "Should have lifetime_value field"
            assert "events" in client, "Should have events array"
            assert "events_count" in client, "Should have events_count field"
            print("✓ Client model has new CRM enhancement fields")
        else:
            print("⚠ No clients to verify fields")
    
    def test_no_data_loss_on_existing_leads(self):
        """Verify existing leads still have all original data"""
        response = self.session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        if len(data) > 0:
            lead = data[0]
            # Verify original fields still exist
            original_fields = ["lead_id", "lead_name", "email", "status", "source", "created_at"]
            for field in original_fields:
                assert field in lead, f"Lead should still have {field}"
            print("✓ Existing leads retain all original data")
        else:
            print("⚠ No leads to verify")


# Cleanup test data
class TestCleanup:
    """Cleanup TEST_ prefixed data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        if login_response.status_code == 200:
            self.token = login_response.json()["access_token"]
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.session.cookies.set("access_token", self.token)
    
    def test_cleanup_test_leads(self):
        """Cleanup TEST_ prefixed leads"""
        response = self.session.get(f"{BASE_URL}/api/leads")
        if response.status_code == 200:
            leads = response.json()
            test_leads = [l for l in leads if l.get("lead_name", "").startswith("TEST_")]
            for lead in test_leads:
                self.session.delete(f"{BASE_URL}/api/leads/{lead['lead_id']}")
            print(f"✓ Cleaned up {len(test_leads)} test leads")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
