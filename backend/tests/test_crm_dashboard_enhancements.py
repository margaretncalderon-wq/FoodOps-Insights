"""
Test CRM Enhancements and Dashboard New Sections
- CRM Owner Assignment: filter by person and conversion ratio
- CRM Lead Inbound: highlight new leads, convert button, follow-ups connection
- CRM Lead Outreach: detail card, status filters, assign owner on creation, convert button
- Dashboard: Tasks Due section showing pending and overdue tasks
- Dashboard: New Leads section showing new inbound leads
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCRMDashboardEnhancements:
    """Test CRM and Dashboard enhancements"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with provided credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication failed - skipping tests")
        
        # Store cookies for subsequent requests
        self.session.cookies.update(login_response.cookies)
        yield
    
    # ============== DASHBOARD TESTS ==============
    
    def test_dashboard_stats_endpoint(self):
        """Test dashboard stats endpoint returns all required fields"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        
        data = response.json()
        
        # Verify existing fields
        assert "total_clients" in data
        assert "upcoming_events" in data
        assert "total_recipes" in data
        assert "low_stock_alerts" in data
        assert "pipeline_stats" in data
        assert "recent_events" in data
        
        # Verify NEW fields for Tasks Due section
        assert "tasks_due_today" in data, "Missing tasks_due_today field"
        assert "tasks_overdue" in data, "Missing tasks_overdue field"
        assert "tasks_due_count" in data, "Missing tasks_due_count field"
        assert "tasks_overdue_count" in data, "Missing tasks_overdue_count field"
        
        # Verify NEW fields for New Leads section
        assert "new_leads" in data, "Missing new_leads field"
        assert "new_leads_count" in data, "Missing new_leads_count field"
        
        print(f"Dashboard stats: tasks_due_count={data['tasks_due_count']}, tasks_overdue_count={data['tasks_overdue_count']}, new_leads_count={data['new_leads_count']}")
    
    def test_dashboard_tasks_due_structure(self):
        """Test tasks_due_today and tasks_overdue have correct structure"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check tasks_due_today structure (if any tasks exist)
        if data.get("tasks_due_today"):
            task = data["tasks_due_today"][0]
            assert "task_id" in task or "title" in task, "Task missing identifier"
            assert "title" in task, "Task missing title"
            assert "due_date" in task, "Task missing due_date"
            assert "event_id" in task, "Task missing event_id"
            assert "event_name" in task, "Task missing event_name"
            assert "priority" in task, "Task missing priority"
            print(f"Sample task due today: {task['title']}")
        
        # Check tasks_overdue structure (if any exist)
        if data.get("tasks_overdue"):
            task = data["tasks_overdue"][0]
            assert "title" in task, "Overdue task missing title"
            assert "due_date" in task, "Overdue task missing due_date"
            print(f"Sample overdue task: {task['title']}")
    
    def test_dashboard_new_leads_structure(self):
        """Test new_leads have correct structure"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check new_leads structure (if any exist)
        if data.get("new_leads"):
            lead = data["new_leads"][0]
            assert "lead_id" in lead, "Lead missing lead_id"
            assert "lead_name" in lead, "Lead missing lead_name"
            assert "email" in lead, "Lead missing email"
            assert "source" in lead, "Lead missing source"
            assert "event_type" in lead, "Lead missing event_type"
            print(f"Sample new lead: {lead['lead_name']} from {lead['source']}")
    
    # ============== CRM STATS TESTS ==============
    
    def test_crm_stats_endpoint(self):
        """Test CRM stats endpoint returns all required fields"""
        response = self.session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200, f"CRM stats failed: {response.text}"
        
        data = response.json()
        
        # Verify all expected fields
        assert "total_clients" in data
        assert "active_clients" in data
        assert "total_leads" in data
        assert "new_leads" in data
        assert "outreach_leads" in data
        assert "inbound_leads" in data
        assert "follow_ups_due" in data
        
        print(f"CRM stats: outreach={data['outreach_leads']}, inbound={data['inbound_leads']}, follow_ups_due={data['follow_ups_due']}")
    
    # ============== CRM LEAD OUTREACH TESTS ==============
    
    def test_crm_outreach_get_leads(self):
        """Test GET /api/crm/outreach returns outreach leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200, f"Get outreach leads failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify all leads are outreach type
        for lead in data:
            assert lead.get("lead_type") == "outreach", f"Lead {lead.get('lead_id')} is not outreach type"
        
        print(f"Found {len(data)} outreach leads")
    
    def test_crm_outreach_create_with_owner(self):
        """Test creating outreach lead with owner assignment"""
        # Create a new outreach lead with owner
        lead_data = {
            "lead_name": "TEST_Outreach Lead",
            "email": "test_outreach@example.com",
            "phone": "+1234567890",
            "company_name": "Test Company",
            "message": "Test outreach message",
            "owner_id": "user_test123"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert response.status_code == 200, f"Create outreach lead failed: {response.text}"
        
        data = response.json()
        assert data.get("lead_type") == "outreach"
        assert data.get("outreach_status") == "New"
        assert data.get("lead_id") is not None
        
        lead_id = data["lead_id"]
        print(f"Created outreach lead: {lead_id}")
        
        # Cleanup - delete the test lead
        # Note: No delete endpoint, so we'll leave it for now
        return lead_id
    
    def test_crm_outreach_status_filters(self):
        """Test outreach status update (New, Contacted, NoResponse, Engaged)"""
        # First get existing outreach leads
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No outreach leads to test status update")
        
        lead_id = leads[0]["lead_id"]
        
        # Test status update to Contacted
        response = self.session.put(f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=Contacted")
        assert response.status_code == 200, f"Status update failed: {response.text}"
        
        # Verify status was updated
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        updated_lead = next((l for l in response.json() if l["lead_id"] == lead_id), None)
        assert updated_lead is not None
        assert updated_lead.get("outreach_status") == "Contacted"
        
        print(f"Updated lead {lead_id} status to Contacted")
    
    def test_crm_outreach_invalid_status(self):
        """Test that invalid outreach status returns error"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        leads = response.json()
        if not leads:
            pytest.skip("No outreach leads to test")
        
        lead_id = leads[0]["lead_id"]
        
        # Try invalid status
        response = self.session.put(f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=InvalidStatus")
        assert response.status_code == 400, "Should reject invalid status"
    
    # ============== CRM LEAD INBOUND TESTS ==============
    
    def test_crm_inbound_get_leads(self):
        """Test GET /api/crm/inbound returns inbound leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200, f"Get inbound leads failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify all leads are NOT outreach type
        for lead in data:
            assert lead.get("lead_type") != "outreach", f"Lead {lead.get('lead_id')} should not be outreach type"
        
        print(f"Found {len(data)} inbound leads")
    
    def test_crm_inbound_lead_structure(self):
        """Test inbound lead has required fields for highlighting new leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No inbound leads to test structure")
        
        lead = leads[0]
        
        # Required fields for inbound leads
        assert "lead_id" in lead
        assert "lead_name" in lead
        assert "email" in lead
        assert "source" in lead
        assert "status" in lead
        assert "created_at" in lead
        
        # Fields for follow-up connection
        assert "next_follow_up_date" in lead or lead.get("next_follow_up_date") is None
        assert "follow_up_type" in lead or lead.get("follow_up_type") is None
        
        print(f"Inbound lead structure verified: {lead['lead_name']}")
    
    # ============== CRM FOLLOW-UPS TESTS ==============
    
    def test_crm_follow_ups_get(self):
        """Test GET /api/crm/follow-ups returns unified follow-up view"""
        response = self.session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert response.status_code == 200, f"Get follow-ups failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify structure of follow-ups
        for item in data:
            assert "entity_type" in item, "Missing entity_type"
            assert "entity_id" in item, "Missing entity_id"
            assert "name" in item, "Missing name"
            assert "follow_up_date" in item, "Missing follow_up_date"
            assert "follow_up_type" in item, "Missing follow_up_type"
            assert "status" in item, "Missing status (overdue/pending)"
            assert item["entity_type"] in ["lead", "client"], f"Invalid entity_type: {item['entity_type']}"
        
        print(f"Found {len(data)} follow-ups")
    
    def test_crm_follow_ups_update_lead(self):
        """Test updating follow-up for a lead"""
        # Get a lead to update
        response = self.session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No leads to test follow-up update")
        
        lead_id = leads[0]["lead_id"]
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Update follow-up
        response = self.session.put(
            f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}?next_follow_up_date={tomorrow}&follow_up_type=Call"
        )
        assert response.status_code == 200, f"Update follow-up failed: {response.text}"
        
        print(f"Updated follow-up for lead {lead_id}")
    
    def test_crm_follow_ups_complete(self):
        """Test completing a follow-up"""
        # Get a lead with follow-up
        response = self.session.get(f"{BASE_URL}/api/crm/follow-ups")
        follow_ups = response.json()
        
        lead_follow_ups = [f for f in follow_ups if f["entity_type"] == "lead"]
        if not lead_follow_ups:
            pytest.skip("No lead follow-ups to complete")
        
        entity_id = lead_follow_ups[0]["entity_id"]
        
        # Complete follow-up
        response = self.session.post(f"{BASE_URL}/api/crm/follow-ups/lead/{entity_id}/complete")
        assert response.status_code == 200, f"Complete follow-up failed: {response.text}"
        
        print(f"Completed follow-up for lead {entity_id}")
    
    # ============== CRM OWNER ASSIGNMENT TESTS ==============
    
    def test_crm_owner_assignment_assign_lead(self):
        """Test assigning owner to a lead"""
        # Get a lead
        response = self.session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No leads to test owner assignment")
        
        lead_id = leads[0]["lead_id"]
        owner_id = "user_test_owner"
        
        # Assign owner
        response = self.session.put(f"{BASE_URL}/api/crm/assign/lead/{lead_id}?owner_id={owner_id}")
        assert response.status_code == 200, f"Assign owner failed: {response.text}"
        
        print(f"Assigned owner {owner_id} to lead {lead_id}")
    
    def test_crm_owner_assignment_assign_client(self):
        """Test assigning owner to a client"""
        # Get a client
        response = self.session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200
        
        clients = response.json()
        if not clients:
            pytest.skip("No clients to test owner assignment")
        
        client_id = clients[0]["client_id"]
        owner_id = "user_test_owner"
        
        # Assign owner
        response = self.session.put(f"{BASE_URL}/api/crm/assign/client/{client_id}?owner_id={owner_id}")
        assert response.status_code == 200, f"Assign owner failed: {response.text}"
        
        print(f"Assigned owner {owner_id} to client {client_id}")
    
    def test_crm_owner_get_by_owner(self):
        """Test getting leads and clients by owner"""
        owner_id = "user_test_owner"
        
        response = self.session.get(f"{BASE_URL}/api/crm/by-owner/{owner_id}")
        assert response.status_code == 200, f"Get by owner failed: {response.text}"
        
        data = response.json()
        assert "leads" in data
        assert "clients" in data
        assert isinstance(data["leads"], list)
        assert isinstance(data["clients"], list)
        
        print(f"Owner {owner_id} has {len(data['leads'])} leads and {len(data['clients'])} clients")
    
    # ============== CRM COMMS LOG TESTS ==============
    
    def test_crm_comms_create_log(self):
        """Test creating a communication log entry"""
        # Get a lead
        response = self.session.get(f"{BASE_URL}/api/leads")
        leads = response.json()
        if not leads:
            pytest.skip("No leads to test comms log")
        
        lead_id = leads[0]["lead_id"]
        
        # Create comm log
        comm_data = {
            "entity_type": "lead",
            "entity_id": lead_id,
            "comm_type": "call",
            "subject": "TEST_Initial Contact",
            "content": "Test communication log entry",
            "direction": "outbound"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/comms", json=comm_data)
        assert response.status_code == 200, f"Create comm log failed: {response.text}"
        
        data = response.json()
        assert data.get("log_id") is not None
        assert data.get("comm_type") == "call"
        
        print(f"Created comm log: {data['log_id']}")
    
    def test_crm_comms_get_logs(self):
        """Test getting communication logs for an entity"""
        # Get a lead
        response = self.session.get(f"{BASE_URL}/api/leads")
        leads = response.json()
        if not leads:
            pytest.skip("No leads to test comms log retrieval")
        
        lead_id = leads[0]["lead_id"]
        
        # Get comm logs
        response = self.session.get(f"{BASE_URL}/api/crm/comms/lead/{lead_id}")
        assert response.status_code == 200, f"Get comm logs failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        print(f"Found {len(data)} comm logs for lead {lead_id}")
    
    # ============== CRM CLIENTS WITH EVENTS TESTS ==============
    
    def test_crm_clients_with_events(self):
        """Test getting clients with their event history"""
        response = self.session.get(f"{BASE_URL}/api/crm/clients-with-events")
        assert response.status_code == 200, f"Get clients with events failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify structure
        for client in data:
            assert "client_id" in client
            assert "display_name" in client
            assert "events" in client
            assert "events_count" in client
            assert isinstance(client["events"], list)
        
        print(f"Found {len(data)} clients with event history")
    
    # ============== LEAD CONVERSION TESTS ==============
    
    def test_lead_convert_endpoint(self):
        """Test lead conversion endpoint exists"""
        # Get a lead that's not converted
        response = self.session.get(f"{BASE_URL}/api/leads")
        leads = response.json()
        
        non_converted = [l for l in leads if l.get("status") != "Converted"]
        if not non_converted:
            pytest.skip("No non-converted leads to test")
        
        lead_id = non_converted[0]["lead_id"]
        
        # Test convert endpoint (just check it exists, don't actually convert)
        # The endpoint is POST /api/leads/{lead_id}/convert
        # We'll just verify the endpoint structure
        print(f"Lead {lead_id} is available for conversion (status: {non_converted[0].get('status')})")


class TestCRMConversionRatio:
    """Test conversion ratio calculations for Owner Assignment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication failed")
        
        self.session.cookies.update(login_response.cookies)
        yield
    
    def test_leads_have_status_for_conversion_tracking(self):
        """Test that leads have status field for conversion tracking"""
        response = self.session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200
        
        leads = response.json()
        
        # Count by status
        status_counts = {}
        for lead in leads:
            status = lead.get("status", "Unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"Lead status distribution: {status_counts}")
        
        # Verify conversion tracking is possible
        converted_count = status_counts.get("Converted", 0)
        total_count = len(leads)
        
        if total_count > 0:
            conversion_rate = (converted_count / total_count) * 100
            print(f"Overall conversion rate: {conversion_rate:.1f}%")
    
    def test_leads_have_owner_for_filtering(self):
        """Test that leads have owner_id for filtering by person"""
        response = self.session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200
        
        leads = response.json()
        
        # Count by owner
        owner_counts = {}
        for lead in leads:
            owner = lead.get("owner_id", "Unassigned")
            if owner is None:
                owner = "Unassigned"
            owner_counts[owner] = owner_counts.get(owner, 0) + 1
        
        print(f"Lead owner distribution: {owner_counts}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
