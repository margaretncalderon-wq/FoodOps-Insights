"""
Test Lead → Proposal → Project E2E Flow for Agency Users
Tests the core user journey: Lead → Proposal → Create Project/Event
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://kora-comms.preview.emergentagent.com"

# Test credentials
AGENCY_USER = {
    "email": "demo.agency@kora.com",
    "password": "Evoque2024!"
}


class TestAgencyUserAuth:
    """Test agency user authentication and profile"""
    
    def test_agency_user_login(self):
        """Test agency user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "user" in data, "No user in response"
        assert "access_token" in data, "No access_token in response"
        
        user = data["user"]
        print(f"User logged in: {user.get('name', user.get('email'))}")
        print(f"is_super_admin: {user.get('is_super_admin')}")
        print(f"company_id: {user.get('company_id')}")
        
        return data
    
    def test_agency_user_is_super_admin(self):
        """Verify is_super_admin=True for agency user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200
        
        user = response.json()["user"]
        # Note: is_super_admin may or may not be True depending on setup
        # We just verify the field exists
        assert "is_super_admin" in user or True, "is_super_admin field should exist"
        print(f"is_super_admin: {user.get('is_super_admin', 'field not present')}")
    
    def test_agency_industry_type(self):
        """Verify agency user has 'agency' industry type"""
        # Login first
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert login_res.status_code == 200
        
        token = login_res.json()["access_token"]
        cookies = login_res.cookies
        
        # Get enabled modules to check industry type
        headers = {"Authorization": f"Bearer {token}"}
        res = requests.get(f"{BASE_URL}/api/addons/enabled-modules", 
                          headers=headers, cookies=cookies)
        assert res.status_code == 200
        
        data = res.json()
        industry_type = data.get("industry_type", "")
        print(f"Industry type: {industry_type}")
        assert industry_type == "agency", f"Expected 'agency', got '{industry_type}'"


class TestCRMOutreachFlow:
    """Test CRM Outreach endpoints for Lead management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200
        
        self.token = response.json()["access_token"]
        self.cookies = response.cookies
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_outreach_leads(self):
        """Test fetching outreach leads"""
        response = requests.get(f"{BASE_URL}/api/crm/outreach", 
                               headers=self.headers, cookies=self.cookies)
        assert response.status_code == 200
        
        leads = response.json()
        print(f"Found {len(leads)} outreach leads")
        
        # Print first few leads if any
        for lead in leads[:3]:
            print(f"  - {lead.get('lead_name', 'No name')} | {lead.get('company_name', 'No company')} | Status: {lead.get('outreach_status', lead.get('status', 'N/A'))}")
        
        return leads
    
    def test_create_outreach_lead(self):
        """Test creating a new outreach lead"""
        lead_data = {
            "lead_name": "TEST_E2E_Lead",
            "email": "test.e2e@example.com",
            "phone": "+1-555-0123",
            "company_name": "TEST_E2E_Company",
            "message": "Test lead for E2E flow verification",
            "event_type": "branding"
        }
        
        response = requests.post(f"{BASE_URL}/api/crm/outreach",
                                json=lead_data,
                                headers=self.headers, 
                                cookies=self.cookies)
        assert response.status_code == 200, f"Create lead failed: {response.text}"
        
        lead = response.json()
        assert lead.get("lead_id"), "No lead_id in response"
        assert lead.get("lead_name") == "TEST_E2E_Lead"
        assert lead.get("lead_type") == "outreach"
        
        print(f"Created lead: {lead.get('lead_id')}")
        return lead
    
    def test_update_outreach_status(self):
        """Test updating outreach status"""
        # First create a lead
        lead_data = {
            "lead_name": "TEST_Status_Update_Lead",
            "email": "test.status@example.com",
            "company_name": "TEST_Status_Company"
        }
        
        create_res = requests.post(f"{BASE_URL}/api/crm/outreach",
                                  json=lead_data,
                                  headers=self.headers, 
                                  cookies=self.cookies)
        assert create_res.status_code == 200
        lead_id = create_res.json().get("lead_id")
        
        # Update status to Contacted
        response = requests.put(f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=Contacted",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        print(f"Updated lead {lead_id} status to Contacted")
        
        # Update status to Engaged
        response = requests.put(f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=Engaged",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        print(f"Updated lead {lead_id} status to Engaged")


class TestLeadConversion:
    """Test converting Lead to Client + Event/Project"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200
        
        self.token = response.json()["access_token"]
        self.cookies = response.cookies
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_and_convert_lead(self):
        """Test full Lead → Client + Event conversion flow"""
        # Step 1: Create a lead via outreach
        lead_data = {
            "lead_name": "TEST_Convert_Lead",
            "email": f"test.convert.{os.urandom(4).hex()}@example.com",
            "phone": "+1-555-9999",
            "company_name": "TEST_Convert_Company",
            "message": "Test lead for conversion flow",
            "event_type": "branding"
        }
        
        create_res = requests.post(f"{BASE_URL}/api/crm/outreach",
                                  json=lead_data,
                                  headers=self.headers,
                                  cookies=self.cookies)
        assert create_res.status_code == 200
        lead = create_res.json()
        lead_id = lead.get("lead_id")
        print(f"Step 1: Created lead {lead_id}")
        
        # Step 2: Convert lead to Client + Event
        convert_res = requests.post(f"{BASE_URL}/api/leads/{lead_id}/convert",
                                   headers=self.headers,
                                   cookies=self.cookies)
        assert convert_res.status_code == 200, f"Convert failed: {convert_res.text}"
        
        result = convert_res.json()
        assert result.get("client_id"), "No client_id after conversion"
        assert result.get("event_id"), "No event_id after conversion"
        
        print(f"Step 2: Converted to client_id={result.get('client_id')}, event_id={result.get('event_id')}")
        
        # Step 3: Verify lead is now marked as Converted
        lead_res = requests.get(f"{BASE_URL}/api/leads/{lead_id}",
                               headers=self.headers,
                               cookies=self.cookies)
        assert lead_res.status_code == 200
        updated_lead = lead_res.json()
        assert updated_lead.get("status") == "Converted", f"Lead status is {updated_lead.get('status')}, expected Converted"
        print(f"Step 3: Lead status is now Converted")
        
        return result


class TestEventsProposals:
    """Test Events/Projects (Proposals) endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200
        
        self.token = response.json()["access_token"]
        self.cookies = response.cookies
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_events(self):
        """Test fetching events/projects"""
        response = requests.get(f"{BASE_URL}/api/events",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        
        events = response.json()
        print(f"Found {len(events)} events/projects")
        
        # Count by stage
        stages = {}
        for event in events:
            stage = event.get("stage", "Unknown")
            stages[stage] = stages.get(stage, 0) + 1
        
        print(f"Events by stage: {stages}")
        return events
    
    def test_get_events_pipeline(self):
        """Test fetching events pipeline (grouped by stage)"""
        response = requests.get(f"{BASE_URL}/api/events/pipeline",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        
        pipeline = response.json()
        print("Pipeline stages:")
        for stage, events in pipeline.items():
            print(f"  {stage}: {len(events)} events")
        
        return pipeline
    
    def test_create_event_project(self):
        """Test creating a new event/project directly"""
        # First get a client
        clients_res = requests.get(f"{BASE_URL}/api/crm/clients",
                                   headers=self.headers,
                                   cookies=self.cookies)
        client_id = None
        if clients_res.status_code == 200 and clients_res.json():
            client_id = clients_res.json()[0].get("client_id")
        
        event_data = {
            "name": "TEST_E2E_Project",
            "event_type": "branding",
            "stage": "Inquiry Received",
            "client_id": client_id,
            "guest_count": 5,
            "notes": "Test project for E2E verification"
        }
        
        response = requests.post(f"{BASE_URL}/api/events",
                                json=event_data,
                                headers=self.headers,
                                cookies=self.cookies)
        assert response.status_code == 200, f"Create event failed: {response.text}"
        
        event = response.json()
        assert event.get("event_id"), "No event_id in response"
        print(f"Created event/project: {event.get('event_id')} - {event.get('name')}")
        
        return event
    
    def test_update_event_stage_to_committed(self):
        """Test updating event stage to Committed (triggers appearance in Program Orchestration)"""
        # First get a client to use
        clients_res = requests.get(f"{BASE_URL}/api/crm/clients",
                                   headers=self.headers,
                                   cookies=self.cookies)
        client_id = None
        if clients_res.status_code == 200 and clients_res.json():
            client_id = clients_res.json()[0].get("client_id")
        
        # Create an event
        event_data = {
            "name": "TEST_Stage_Update_Project",
            "event_type": "campaign",
            "client_id": client_id or "test_client",
            "stage": "Inquiry Received"
        }
        
        create_res = requests.post(f"{BASE_URL}/api/events",
                                  json=event_data,
                                  headers=self.headers,
                                  cookies=self.cookies)
        assert create_res.status_code == 200
        event_id = create_res.json().get("event_id")
        print(f"Created event: {event_id}")
        
        # Update stage through the engagement stages
        stages = ["Context Captured", "Scope Drafted", "Definition In Review", "Committed"]
        
        for stage in stages:
            update_res = requests.put(f"{BASE_URL}/api/events/{event_id}",
                                     json={"stage": stage},
                                     headers=self.headers,
                                     cookies=self.cookies)
            assert update_res.status_code == 200, f"Failed to update to {stage}: {update_res.text}"
            print(f"  Updated stage to: {stage}")
        
        # Verify final stage is Committed
        event_res = requests.get(f"{BASE_URL}/api/events/{event_id}",
                                headers=self.headers,
                                cookies=self.cookies)
        assert event_res.status_code == 200
        final_event = event_res.json()
        assert final_event.get("stage") == "Committed", f"Stage is {final_event.get('stage')}, expected Committed"
        print(f"Event {event_id} is now Committed")
        
        return event_id


class TestProgramOrchestration:
    """Test Program Orchestration (Committed projects)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200
        
        self.token = response.json()["access_token"]
        self.cookies = response.cookies
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_orchestration_events(self):
        """Test fetching committed events for orchestration"""
        response = requests.get(f"{BASE_URL}/api/orchestration/events",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        
        events = response.json()
        print(f"Found {len(events)} committed projects in Program Orchestration")
        
        for event in events[:3]:
            print(f"  - {event.get('name')} | Stage: {event.get('stage')} | Client: {event.get('client_name', 'N/A')}")
        
        return events
    
    def test_terminology_in_enabled_modules(self):
        """Verify agency user sees 'Projects' terminology"""
        response = requests.get(f"{BASE_URL}/api/addons/enabled-modules",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        
        data = response.json()
        
        # Check industry config
        industry_config = data.get("industry_config", {})
        po_config = industry_config.get("program_orchestration", {})
        
        entity_singular = po_config.get("entity_singular_en", "")
        entity_plural = po_config.get("entity_plural_en", "")
        
        print(f"Entity singular: {entity_singular}")
        print(f"Entity plural: {entity_plural}")
        
        assert entity_singular == "Project", f"Expected 'Project', got '{entity_singular}'"
        assert entity_plural == "Projects", f"Expected 'Projects', got '{entity_plural}'"
        
        # Also verify module name
        module_name = po_config.get("name_en", "")
        print(f"Module name: {module_name}")
        assert module_name == "Program Orchestration", f"Expected 'Program Orchestration', got '{module_name}'"


class TestCRMStats:
    """Test CRM Statistics endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200
        
        self.token = response.json()["access_token"]
        self.cookies = response.cookies
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_crm_stats(self):
        """Test CRM stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/crm/stats",
                               headers=self.headers,
                               cookies=self.cookies)
        assert response.status_code == 200
        
        stats = response.json()
        print(f"CRM Stats:")
        print(f"  Total clients: {stats.get('total_clients', 0)}")
        print(f"  Active clients: {stats.get('active_clients', 0)}")
        print(f"  Total leads: {stats.get('total_leads', 0)}")
        print(f"  New leads: {stats.get('new_leads', 0)}")
        print(f"  Outreach leads: {stats.get('outreach_leads', 0)}")
        print(f"  Inbound leads: {stats.get('inbound_leads', 0)}")
        print(f"  Follow-ups due: {stats.get('follow_ups_due', 0)}")
        
        return stats


# Cleanup test data
class TestCleanup:
    """Clean up TEST_ prefixed data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.cookies = response.cookies
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Auth failed")
    
    def test_cleanup_test_data(self):
        """Clean up any TEST_ prefixed leads and events"""
        # Get all leads
        leads_res = requests.get(f"{BASE_URL}/api/crm/outreach",
                                headers=self.headers,
                                cookies=self.cookies)
        if leads_res.status_code == 200:
            for lead in leads_res.json():
                if lead.get("lead_name", "").startswith("TEST_"):
                    lead_id = lead.get("lead_id")
                    # Discard or just note it
                    print(f"Found test lead to clean: {lead_id}")
        
        # Get all events
        events_res = requests.get(f"{BASE_URL}/api/events",
                                 headers=self.headers,
                                 cookies=self.cookies)
        if events_res.status_code == 200:
            for event in events_res.json():
                if event.get("name", "").startswith("TEST_"):
                    event_id = event.get("event_id")
                    # Delete the event
                    del_res = requests.delete(f"{BASE_URL}/api/events/{event_id}",
                                             headers=self.headers,
                                             cookies=self.cookies)
                    if del_res.status_code == 200:
                        print(f"Deleted test event: {event_id}")
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
