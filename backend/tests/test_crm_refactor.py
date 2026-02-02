"""
Test CRM Refactor features for EEP Evoque Platform
Tests: Leads module, Clients (Company/Individual), Contacts, Events Pipeline, Lead Forms
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bizclarity-1.preview.emergentagent.com').rstrip('/')


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_login_with_email_password(self, session):
        """Test login with email/password works correctly"""
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"✓ Login successful for test@example.com")
        return data


class TestLeadsModule:
    """Test Leads module - inbound inquiries"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return session
    
    def test_create_lead_manual(self, auth_session):
        """CRM: Create lead manual with name, email, phone, company, event type, date, guests, source"""
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Lead_{unique_id}",
            "email": f"lead_{unique_id}@test.com",
            "phone": "+1 809 555 1234",
            "company_name": f"TEST_Company_{unique_id}",
            "event_type": "wedding",
            "event_date": "2025-08-15",
            "estimated_guest_count": 150,
            "budget_range": "$10,000 - $25,000",
            "message": "Test lead message",
            "source": "Website"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert response.status_code == 200, f"Failed to create lead: {response.text}"
        
        data = response.json()
        assert data["lead_name"] == lead_data["lead_name"]
        assert data["email"] == lead_data["email"]
        assert data["phone"] == lead_data["phone"]
        assert data["company_name"] == lead_data["company_name"]
        assert data["event_type"] == lead_data["event_type"]
        assert data["source"] == lead_data["source"]
        assert data["status"] == "New"
        assert "lead_id" in data
        print(f"✓ Lead created: {data['lead_name']} (status: {data['status']})")
        return data
    
    def test_get_leads_list(self, auth_session):
        """CRM: Get leads list"""
        response = auth_session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200, f"Failed to get leads: {response.text}"
        
        leads = response.json()
        assert isinstance(leads, list)
        print(f"✓ Retrieved {len(leads)} leads")
        return leads
    
    def test_filter_leads_by_status(self, auth_session):
        """CRM: Filter leads by status"""
        response = auth_session.get(f"{BASE_URL}/api/leads?status=New")
        assert response.status_code == 200, f"Failed to filter leads: {response.text}"
        
        leads = response.json()
        for lead in leads:
            assert lead["status"] == "New", f"Lead has wrong status: {lead['status']}"
        print(f"✓ Filtered {len(leads)} leads with status 'New'")
    
    def test_filter_leads_by_source(self, auth_session):
        """CRM: Filter leads by source"""
        response = auth_session.get(f"{BASE_URL}/api/leads?source=Website")
        assert response.status_code == 200, f"Failed to filter leads: {response.text}"
        
        leads = response.json()
        for lead in leads:
            assert lead["source"] == "Website", f"Lead has wrong source: {lead['source']}"
        print(f"✓ Filtered {len(leads)} leads with source 'Website'")
    
    def test_update_lead_status(self, auth_session):
        """CRM: Update lead status to Contacted"""
        # First create a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_StatusLead_{unique_id}",
            "email": f"status_{unique_id}@test.com",
            "event_type": "corporate",
            "source": "Instagram"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200
        lead = create_response.json()
        
        # Update status
        update_response = auth_session.put(f"{BASE_URL}/api/leads/{lead['lead_id']}", json={
            "status": "Contacted"
        })
        assert update_response.status_code == 200, f"Failed to update lead: {update_response.text}"
        
        updated_lead = update_response.json()
        assert updated_lead["status"] == "Contacted"
        print(f"✓ Lead status updated to 'Contacted'")
        return updated_lead
    
    def test_discard_lead(self, auth_session):
        """CRM: Discard lead"""
        # First create a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_DiscardLead_{unique_id}",
            "email": f"discard_{unique_id}@test.com",
            "event_type": "birthday",
            "source": "QR"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200
        lead = create_response.json()
        
        # Discard lead
        discard_response = auth_session.post(f"{BASE_URL}/api/leads/{lead['lead_id']}/discard")
        assert discard_response.status_code == 200, f"Failed to discard lead: {discard_response.text}"
        
        # Verify status
        get_response = auth_session.get(f"{BASE_URL}/api/leads/{lead['lead_id']}")
        assert get_response.status_code == 200
        discarded_lead = get_response.json()
        assert discarded_lead["status"] == "Discarded"
        print(f"✓ Lead discarded successfully")
        return discarded_lead


class TestLeadConversion:
    """Test Lead conversion to Client + Contact + Event"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200
        return session
    
    def test_convert_lead_to_client_contact_event(self, auth_session):
        """CRM: Convert lead to client + contact + event"""
        # Create a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_ConvertLead_{unique_id}",
            "email": f"convert_{unique_id}@test.com",
            "phone": "+1 809 555 9999",
            "company_name": f"TEST_ConvertCompany_{unique_id}",
            "event_type": "wedding",
            "event_date": "2025-09-20",
            "estimated_guest_count": 200,
            "message": "Lead to be converted",
            "source": "Referral"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200
        lead = create_response.json()
        
        # Convert lead
        convert_response = auth_session.post(f"{BASE_URL}/api/leads/{lead['lead_id']}/convert")
        assert convert_response.status_code == 200, f"Failed to convert lead: {convert_response.text}"
        
        result = convert_response.json()
        assert "client_id" in result
        assert "contact_id" in result
        assert "event_id" in result
        print(f"✓ Lead converted: client_id={result['client_id']}, event_id={result['event_id']}")
        return result
    
    def test_converted_lead_shows_converted_status(self, auth_session):
        """CRM: Converted lead shows status 'Converted'"""
        # Create and convert a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_ConvertStatus_{unique_id}",
            "email": f"convertstatus_{unique_id}@test.com",
            "event_type": "social",
            "source": "Website"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200
        lead = create_response.json()
        
        # Convert
        auth_session.post(f"{BASE_URL}/api/leads/{lead['lead_id']}/convert")
        
        # Check status
        get_response = auth_session.get(f"{BASE_URL}/api/leads/{lead['lead_id']}")
        assert get_response.status_code == 200
        converted_lead = get_response.json()
        assert converted_lead["status"] == "Converted"
        assert converted_lead.get("converted_client_id") is not None
        assert converted_lead.get("converted_event_id") is not None
        print(f"✓ Converted lead shows status 'Converted' with linked IDs")
    
    def test_converted_lead_cannot_be_edited(self, auth_session):
        """CRM: Converted lead cannot be edited"""
        # Create and convert a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_NoEdit_{unique_id}",
            "email": f"noedit_{unique_id}@test.com",
            "event_type": "corporate",
            "source": "Other"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200
        lead = create_response.json()
        
        # Convert
        auth_session.post(f"{BASE_URL}/api/leads/{lead['lead_id']}/convert")
        
        # Try to edit
        update_response = auth_session.put(f"{BASE_URL}/api/leads/{lead['lead_id']}", json={
            "lead_name": "Should Not Update"
        })
        assert update_response.status_code == 400, f"Expected 400, got {update_response.status_code}"
        print(f"✓ Converted lead cannot be edited (returns 400)")


class TestClientsModule:
    """Test Clients module - Company and Individual types"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200
        return session
    
    def test_create_company_client(self, auth_session):
        """CRM: Create client type Company"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "Company",
            "display_name": f"TEST_Company_{unique_id}",
            "email": f"company_{unique_id}@test.com",
            "phone": "+1 809 555 0001",
            "address": "123 Business Ave",
            "source": "Website",
            "tags": ["corporate", "premium"],
            "notes": "Test company client",
            "status": "Active"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200, f"Failed to create company client: {response.text}"
        
        data = response.json()
        assert data["client_type"] == "Company"
        assert data["display_name"] == client_data["display_name"]
        assert data["status"] == "Active"
        print(f"✓ Company client created: {data['display_name']}")
        return data
    
    def test_create_individual_client(self, auth_session):
        """CRM: Create client type Individual"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "Individual",
            "display_name": f"TEST_Individual_{unique_id}",
            "email": f"individual_{unique_id}@test.com",
            "phone": "+1 809 555 0002",
            "address": "456 Personal St",
            "source": "Referral",
            "tags": ["wedding"],
            "notes": "Test individual client",
            "status": "Active"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200, f"Failed to create individual client: {response.text}"
        
        data = response.json()
        assert data["client_type"] == "Individual"
        assert data["display_name"] == client_data["display_name"]
        print(f"✓ Individual client created: {data['display_name']}")
        return data
    
    def test_clients_list_with_type_badges(self, auth_session):
        """CRM: View list of clients with badges of type"""
        response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        
        clients = response.json()
        company_clients = [c for c in clients if c.get("client_type") == "Company"]
        individual_clients = [c for c in clients if c.get("client_type") == "Individual"]
        
        print(f"✓ Retrieved {len(clients)} clients: {len(company_clients)} Company, {len(individual_clients)} Individual")
        return clients


class TestContactsModule:
    """Test Contacts linked to Clients"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200
        return session
    
    @pytest.fixture(scope="class")
    def test_client(self, auth_session):
        """Create a client for contact testing"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "Company",
            "display_name": f"TEST_ContactClient_{unique_id}",
            "email": f"contactclient_{unique_id}@test.com",
            "source": "Direct",
            "status": "Active"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200
        return response.json()
    
    def test_create_contact_for_client(self, auth_session, test_client):
        """Create a contact linked to a client"""
        unique_id = uuid.uuid4().hex[:8]
        contact_data = {
            "client_id": test_client["client_id"],
            "name": f"TEST_Contact_{unique_id}",
            "email": f"contact_{unique_id}@test.com",
            "phone": "+1 809 555 3333",
            "role_title": "Event Manager",
            "is_primary": True,
            "is_billing_contact": False
        }
        
        response = auth_session.post(f"{BASE_URL}/api/contacts", json=contact_data)
        assert response.status_code == 200, f"Failed to create contact: {response.text}"
        
        data = response.json()
        assert data["client_id"] == test_client["client_id"]
        assert data["name"] == contact_data["name"]
        assert data["is_primary"] == True
        print(f"✓ Contact created: {data['name']} for client {test_client['display_name']}")
        return data
    
    def test_get_contacts_for_client(self, auth_session, test_client):
        """Get contacts filtered by client"""
        response = auth_session.get(f"{BASE_URL}/api/contacts?client_id={test_client['client_id']}")
        assert response.status_code == 200, f"Failed to get contacts: {response.text}"
        
        contacts = response.json()
        for contact in contacts:
            assert contact["client_id"] == test_client["client_id"]
        print(f"✓ Retrieved {len(contacts)} contacts for client")


class TestEventsPipeline:
    """Test Events Pipeline Kanban with stages"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200
        return session
    
    @pytest.fixture(scope="class")
    def test_client(self, auth_session):
        """Create a client for event testing"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "Individual",
            "display_name": f"TEST_PipelineClient_{unique_id}",
            "email": f"pipeline_{unique_id}@test.com",
            "source": "Direct",
            "status": "Active"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200
        return response.json()
    
    def test_get_pipeline_view(self, auth_session):
        """Events: Get Pipeline Kanban view with columns by stage"""
        response = auth_session.get(f"{BASE_URL}/api/events/pipeline")
        assert response.status_code == 200, f"Failed to get pipeline: {response.text}"
        
        pipeline = response.json()
        expected_stages = ["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost"]
        for stage in expected_stages:
            assert stage in pipeline, f"Missing stage: {stage}"
        print(f"✓ Pipeline view has all stages: {list(pipeline.keys())}")
        return pipeline
    
    def test_create_event_with_stage(self, auth_session, test_client):
        """Events: Create event with pipeline stage"""
        unique_id = uuid.uuid4().hex[:8]
        event_data = {
            "client_id": test_client["client_id"],
            "name": f"TEST_PipelineEvent_{unique_id}",
            "event_type": "wedding",
            "event_date": "2025-10-15T18:00:00Z",
            "event_date_tbd": False,
            "venue": "Garden Venue",
            "guest_count": 100,
            "budget": 25000,
            "status": "planning",
            "stage": "Lead",
            "expected_value": 30000,
            "next_step": "Schedule initial call"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/events", json=event_data)
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        
        data = response.json()
        assert data["stage"] == "Lead"
        assert data["expected_value"] == 30000
        print(f"✓ Event created with stage 'Lead': {data['name']}")
        return data
    
    def test_move_event_between_stages(self, auth_session, test_client):
        """Events: Move event between pipeline stages"""
        # Create event
        unique_id = uuid.uuid4().hex[:8]
        event_data = {
            "client_id": test_client["client_id"],
            "name": f"TEST_MoveStage_{unique_id}",
            "event_type": "corporate",
            "event_date": "2025-11-20T10:00:00Z",
            "event_date_tbd": False,
            "guest_count": 50,
            "budget": 15000,
            "status": "planning",
            "stage": "Lead"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/events", json=event_data)
        assert create_response.status_code == 200
        event = create_response.json()
        
        # Move to Contacted
        update_response = auth_session.put(f"{BASE_URL}/api/events/{event['event_id']}", json={
            **event_data,
            "stage": "Contacted"
        })
        assert update_response.status_code == 200, f"Failed to update stage: {update_response.text}"
        
        updated_event = update_response.json()
        assert updated_event["stage"] == "Contacted"
        print(f"✓ Event moved from 'Lead' to 'Contacted'")
        
        # Move to Proposal
        update_response2 = auth_session.put(f"{BASE_URL}/api/events/{event['event_id']}", json={
            **event_data,
            "stage": "Proposal"
        })
        assert update_response2.status_code == 200
        updated_event2 = update_response2.json()
        assert updated_event2["stage"] == "Proposal"
        print(f"✓ Event moved from 'Contacted' to 'Proposal'")
        return updated_event2
    
    def test_create_event_with_tbd_date(self, auth_session, test_client):
        """Events: Create event with date TBD (Por Definir)"""
        unique_id = uuid.uuid4().hex[:8]
        event_data = {
            "client_id": test_client["client_id"],
            "name": f"TEST_TBDEvent_{unique_id}",
            "event_type": "social",
            "event_date": None,
            "event_date_tbd": True,
            "venue": "TBD",
            "guest_count": 75,
            "budget": 10000,
            "status": "planning",
            "stage": "Lead"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/events", json=event_data)
        assert response.status_code == 200, f"Failed to create TBD event: {response.text}"
        
        data = response.json()
        assert data["event_date_tbd"] == True
        assert data["event_date"] is None
        print(f"✓ Event created with TBD date: {data['name']}")
        return data
    
    def test_events_list_with_stage_badges(self, auth_session):
        """Events: View events in list with badges of stage"""
        response = auth_session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Failed to get events: {response.text}"
        
        events = response.json()
        stages_found = set()
        for event in events:
            if event.get("stage"):
                stages_found.add(event["stage"])
        
        print(f"✓ Retrieved {len(events)} events with stages: {stages_found}")
        return events


class TestLeadForms:
    """Test Lead Forms - public embeddable forms"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200
        return session
    
    def test_create_lead_form(self, auth_session):
        """Create a lead form"""
        unique_id = uuid.uuid4().hex[:8]
        form_data = {
            "form_name": f"TEST_Form_{unique_id}",
            "description": "Test lead form",
            "fields": [
                {"field_name": "lead_name", "enabled": True, "required": True},
                {"field_name": "email", "enabled": True, "required": True},
                {"field_name": "phone", "enabled": True, "required": False},
                {"field_name": "event_type", "enabled": True, "required": True}
            ],
            "default_source": "Website",
            "default_event_type": "wedding",
            "is_active": True,
            "thank_you_message": "Thank you for your inquiry!"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/lead-forms", json=form_data)
        assert response.status_code == 200, f"Failed to create lead form: {response.text}"
        
        data = response.json()
        assert data["form_name"] == form_data["form_name"]
        assert data["is_active"] == True
        assert "form_id" in data
        print(f"✓ Lead form created: {data['form_name']} (id: {data['form_id']})")
        return data
    
    def test_get_public_lead_form(self, auth_session):
        """Lead Forms: GET /api/lead-forms/{id}/public (no auth required)"""
        # First create a form
        unique_id = uuid.uuid4().hex[:8]
        form_data = {
            "form_name": f"TEST_PublicForm_{unique_id}",
            "description": "Public test form",
            "fields": [],
            "default_source": "Website",
            "is_active": True,
            "thank_you_message": "Thanks!"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/lead-forms", json=form_data)
        assert create_response.status_code == 200
        form = create_response.json()
        
        # Get public form (no auth)
        public_session = requests.Session()
        public_response = public_session.get(f"{BASE_URL}/api/lead-forms/{form['form_id']}/public")
        assert public_response.status_code == 200, f"Failed to get public form: {public_response.text}"
        
        public_form = public_response.json()
        assert public_form["form_id"] == form["form_id"]
        assert public_form["form_name"] == form["form_name"]
        assert "thank_you_message" in public_form
        print(f"✓ Public form endpoint works: {public_form['form_name']}")
        return public_form
    
    def test_submit_public_lead_form(self, auth_session):
        """Lead Forms: POST /api/lead-forms/{id}/submit (no auth required)"""
        # First create a form
        unique_id = uuid.uuid4().hex[:8]
        form_data = {
            "form_name": f"TEST_SubmitForm_{unique_id}",
            "description": "Submit test form",
            "fields": [],
            "default_source": "Website",
            "default_event_type": "wedding",
            "is_active": True,
            "thank_you_message": "Thank you for submitting!"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/lead-forms", json=form_data)
        assert create_response.status_code == 200
        form = create_response.json()
        
        # Submit form (no auth)
        public_session = requests.Session()
        submission_data = {
            "lead_name": f"TEST_Submission_{unique_id}",
            "email": f"submission_{unique_id}@test.com",
            "phone": "+1 809 555 4444",
            "event_type": "wedding",
            "message": "Test submission"
        }
        submit_response = public_session.post(f"{BASE_URL}/api/lead-forms/{form['form_id']}/submit", json=submission_data)
        assert submit_response.status_code == 200, f"Failed to submit form: {submit_response.text}"
        
        result = submit_response.json()
        assert result["success"] == True
        assert "lead_id" in result
        assert result["message"] == form_data["thank_you_message"]
        print(f"✓ Form submission successful: lead_id={result['lead_id']}")
        return result


class TestCRMStats:
    """Test CRM statistics"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert response.status_code == 200
        return session
    
    def test_get_crm_stats(self, auth_session):
        """Get CRM statistics"""
        response = auth_session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200, f"Failed to get CRM stats: {response.text}"
        
        stats = response.json()
        assert "total_clients" in stats
        assert "active_clients" in stats
        assert "total_leads" in stats
        assert "new_leads" in stats
        print(f"✓ CRM Stats: {stats}")
        return stats
    
    def test_get_lead_stats(self, auth_session):
        """Get Lead statistics"""
        response = auth_session.get(f"{BASE_URL}/api/leads/stats")
        assert response.status_code == 200, f"Failed to get lead stats: {response.text}"
        
        stats = response.json()
        assert "total" in stats
        assert "new" in stats
        assert "contacted" in stats
        assert "converted" in stats
        assert "discarded" in stats
        print(f"✓ Lead Stats: {stats}")
        return stats


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        return session
    
    def test_cleanup_test_data(self, auth_session):
        """Delete all TEST_ prefixed data"""
        # Cleanup leads
        response = auth_session.get(f"{BASE_URL}/api/leads")
        if response.status_code == 200:
            leads = response.json()
            test_leads = [l for l in leads if l.get("lead_name", "").startswith("TEST_")]
            for lead in test_leads:
                # Can't delete leads directly, but they're test data
                pass
            print(f"✓ Found {len(test_leads)} test leads (not deleted - no delete endpoint)")
        
        # Cleanup clients
        response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        if response.status_code == 200:
            clients = response.json()
            test_clients = [c for c in clients if c.get("display_name", "").startswith("TEST_")]
            for client in test_clients:
                auth_session.delete(f"{BASE_URL}/api/crm/clients/{client['client_id']}")
            print(f"✓ Cleaned up {len(test_clients)} test clients")
        
        # Cleanup events
        response = auth_session.get(f"{BASE_URL}/api/events")
        if response.status_code == 200:
            events = response.json()
            test_events = [e for e in events if e.get("name", "").startswith("TEST_")]
            for event in test_events:
                auth_session.delete(f"{BASE_URL}/api/events/{event['event_id']}")
            print(f"✓ Cleaned up {len(test_events)} test events")
        
        # Cleanup lead forms
        response = auth_session.get(f"{BASE_URL}/api/lead-forms")
        if response.status_code == 200:
            forms = response.json()
            test_forms = [f for f in forms if f.get("form_name", "").startswith("TEST_")]
            for form in test_forms:
                auth_session.delete(f"{BASE_URL}/api/lead-forms/{form['form_id']}")
            print(f"✓ Cleaned up {len(test_forms)} test lead forms")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
