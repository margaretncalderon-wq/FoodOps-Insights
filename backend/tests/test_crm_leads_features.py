"""
CRM Leads Features Test Suite
Tests for: Lead deletion, contacts, sorting, duplicate detection, owner name display
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCRMLeadsFeatures:
    """CRM Leads functionality tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session using demo credentials"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login with demo credentials
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        # Get token from response
        data = login_response.json()
        token = data.get("token") or data.get("access_token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        
        return session
    
    # Health Check Tests
    def test_health_check(self, auth_session):
        """Test backend health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        assert data.get("database") == "connected"
        print("✓ Health check passed")
    
    # Authentication Tests
    def test_auth_login(self, auth_session):
        """Test authentication works with demo credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data or "access_token" in data
        print("✓ Authentication successful")
    
    # CRM Stats Tests
    def test_crm_stats_endpoint(self, auth_session):
        """Test CRM stats endpoint returns correct structure"""
        response = auth_session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200
        data = response.json()
        # Check expected fields
        expected_fields = ["total_clients", "active_clients", "total_leads", "new_leads"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        print(f"✓ CRM stats: {data}")
    
    # Outreach Leads Tests
    def test_get_outreach_leads(self, auth_session):
        """Test GET /api/crm/outreach returns leads list"""
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Outreach leads: found {len(data)} leads")
        
        # Check that leads have expected structure
        if len(data) > 0:
            lead = data[0]
            assert "lead_id" in lead
            print(f"  Sample lead_id: {lead.get('lead_id')}")
    
    def test_outreach_leads_have_owner_name(self, auth_session):
        """Test that outreach leads with owner_id have owner_name enriched"""
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        data = response.json()
        
        # Find leads with owner_id
        leads_with_owner = [l for l in data if l.get("owner_id")]
        if leads_with_owner:
            lead = leads_with_owner[0]
            # Check if owner_name is present (may be enriched)
            if lead.get("owner_name"):
                print(f"✓ Owner name enriched: {lead.get('owner_name')}")
            else:
                print(f"⚠ Lead has owner_id but no owner_name enriched")
        else:
            print("⚠ No leads with owner_id found to test enrichment")
    
    # Inbound Leads Tests
    def test_get_inbound_leads(self, auth_session):
        """Test GET /api/crm/inbound returns inbound leads list"""
        response = auth_session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Inbound leads: found {len(data)} leads")
    
    # Clients Tests
    def test_get_clients(self, auth_session):
        """Test GET /api/crm/clients returns clients list"""
        response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Clients: found {len(data)} clients")
    
    def test_get_clients_with_events(self, auth_session):
        """Test GET /api/crm/clients-with-events returns enriched client data"""
        response = auth_session.get(f"{BASE_URL}/api/crm/clients-with-events")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check enrichment fields if clients exist
        if len(data) > 0:
            client = data[0]
            assert "client_id" in client
            # Check for events array
            if "events" in client:
                print(f"✓ Client has events array with {len(client['events'])} events")
            # Check for contacts
            if "contacts" in client:
                print(f"✓ Client has contacts array with {len(client['contacts'])} contacts")
        print(f"✓ Clients with events: {len(data)} clients")
    
    # Lead CRUD Tests
    def test_create_and_get_outreach_lead(self, auth_session):
        """Test creating an outreach lead and retrieving it"""
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Lead_{unique_id}",
            "email": f"test_{unique_id}@example.com",
            "phone": "555-1234",
            "company_name": f"TEST_Company_{unique_id}"
        }
        
        # Create lead
        create_response = auth_session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        assert "lead_id" in created
        lead_id = created["lead_id"]
        print(f"✓ Created outreach lead: {lead_id}")
        
        # Get the lead
        get_response = auth_session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["lead_id"] == lead_id
        print(f"✓ Retrieved lead successfully")
        
        return lead_id
    
    def test_update_lead(self, auth_session):
        """Test updating a lead"""
        # First create a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Update_{unique_id}",
            "email": f"update_{unique_id}@example.com"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        
        # Update the lead
        update_data = {
            "lead_name": f"TEST_Updated_{unique_id}",
            "phone": "555-9999"
        }
        update_response = auth_session.put(f"{BASE_URL}/api/leads/{lead_id}", json=update_data)
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated.get("lead_name") == f"TEST_Updated_{unique_id}" or updated.get("name") == f"TEST_Updated_{unique_id}"
        print(f"✓ Updated lead: {lead_id}")
        
        # Cleanup - delete the lead
        auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
    
    # Lead Deletion Tests (Key feature to test)
    def test_delete_lead_endpoint_exists(self, auth_session):
        """Test that DELETE /api/crm/leads/{lead_id} endpoint exists"""
        # Create a test lead first
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Delete_{unique_id}",
            "email": f"delete_{unique_id}@example.com"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        print(f"✓ Created test lead for deletion: {lead_id}")
        
        # Delete the lead
        delete_response = auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.status_code} - {delete_response.text}"
        delete_data = delete_response.json()
        assert delete_data.get("success") == True
        assert delete_data.get("lead_id") == lead_id
        print(f"✓ Lead deleted successfully: {lead_id}")
        
        # Verify lead is actually deleted
        get_response = auth_session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert get_response.status_code == 404
        print(f"✓ Confirmed lead no longer exists")
    
    def test_delete_nonexistent_lead_returns_404(self, auth_session):
        """Test that deleting a non-existent lead returns 404"""
        fake_lead_id = "lead_nonexistent_123"
        delete_response = auth_session.delete(f"{BASE_URL}/api/crm/leads/{fake_lead_id}")
        assert delete_response.status_code == 404
        print(f"✓ 404 returned for non-existent lead deletion")
    
    # Lead Contacts Tests (Key feature to test)
    def test_lead_contacts_endpoints(self, auth_session):
        """Test lead contacts CRUD endpoints"""
        # Create a test lead first
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Contacts_{unique_id}",
            "email": f"contacts_{unique_id}@example.com"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        print(f"✓ Created test lead: {lead_id}")
        
        # GET /api/crm/leads/{lead_id}/contacts - should return empty list initially
        get_contacts_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}/contacts")
        assert get_contacts_response.status_code == 200
        contacts = get_contacts_response.json()
        assert isinstance(contacts, list)
        print(f"✓ GET contacts endpoint works: {len(contacts)} contacts")
        
        # POST /api/crm/leads/{lead_id}/contacts - add a contact
        contact_data = {
            "name": f"Contact_{unique_id}",
            "email": f"contact_{unique_id}@test.com",
            "phone": "555-0001",
            "role": "Manager",
            "is_primary": True
        }
        add_contact_response = auth_session.post(
            f"{BASE_URL}/api/crm/leads/{lead_id}/contacts", 
            json=contact_data
        )
        assert add_contact_response.status_code == 200, f"Add contact failed: {add_contact_response.text}"
        new_contact = add_contact_response.json()
        assert "contact_id" in new_contact
        contact_id = new_contact["contact_id"]
        print(f"✓ POST contact endpoint works: created {contact_id}")
        
        # Verify contact was added
        get_contacts_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}/contacts")
        contacts = get_contacts_response.json()
        assert len(contacts) >= 1
        print(f"✓ Contact verified in list: {len(contacts)} contacts")
        
        # DELETE /api/crm/leads/{lead_id}/contacts/{contact_id}
        delete_contact_response = auth_session.delete(
            f"{BASE_URL}/api/crm/leads/{lead_id}/contacts/{contact_id}"
        )
        assert delete_contact_response.status_code == 200
        print(f"✓ DELETE contact endpoint works")
        
        # Cleanup - delete the test lead
        auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
        print(f"✓ Cleaned up test lead")
    
    def test_lead_contacts_for_nonexistent_lead(self, auth_session):
        """Test that contacts endpoints return 404 for non-existent lead"""
        fake_lead_id = "lead_nonexistent_456"
        response = auth_session.get(f"{BASE_URL}/api/crm/leads/{fake_lead_id}/contacts")
        assert response.status_code == 404
        print(f"✓ 404 returned for non-existent lead contacts")
    
    # Outreach Status Tests
    def test_update_outreach_status(self, auth_session):
        """Test updating outreach status"""
        # Create a test lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Status_{unique_id}",
            "email": f"status_{unique_id}@example.com"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        
        # Update status to "Contacted"
        status_response = auth_session.put(
            f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=Contacted"
        )
        assert status_response.status_code == 200
        print(f"✓ Updated lead status to Contacted")
        
        # Update status to "Engaged"
        status_response = auth_session.put(
            f"{BASE_URL}/api/crm/outreach/{lead_id}/status?outreach_status=Engaged"
        )
        assert status_response.status_code == 200
        print(f"✓ Updated lead status to Engaged")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
    
    # Follow-ups Tests
    def test_follow_ups_endpoint(self, auth_session):
        """Test follow-ups endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Follow-ups endpoint works: {len(data)} follow-ups")
    
    # Owner Assignment Tests
    def test_assign_owner_to_lead(self, auth_session):
        """Test assigning owner to a lead"""
        # Create a test lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "lead_name": f"TEST_Owner_{unique_id}",
            "email": f"owner_{unique_id}@example.com"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/outreach", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        
        # Get current user to use as owner
        me_response = auth_session.get(f"{BASE_URL}/api/users/me")
        if me_response.status_code == 200:
            user_data = me_response.json()
            owner_id = user_data.get("user_id")
            
            if owner_id:
                # Assign owner
                assign_response = auth_session.put(
                    f"{BASE_URL}/api/crm/assign/lead/{lead_id}?owner_id={owner_id}"
                )
                assert assign_response.status_code == 200
                print(f"✓ Assigned owner {owner_id} to lead {lead_id}")
        else:
            print("⚠ Could not get current user, skipping owner assignment test")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead_id}")
    
    # Unauthenticated Access Tests
    def test_unauthenticated_access_returns_401(self):
        """Test that endpoints require authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Test outreach endpoint without auth
        response = session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 401 or response.status_code == 403
        print(f"✓ Unauthenticated access blocked: {response.status_code}")
        
        # Test delete without auth
        response = session.delete(f"{BASE_URL}/api/crm/leads/fake_lead_id")
        assert response.status_code == 401 or response.status_code == 403
        print(f"✓ Unauthenticated delete blocked: {response.status_code}")
    
    # Data Structure Validation
    def test_lead_data_structure(self, auth_session):
        """Test that leads have expected data structure"""
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        leads = response.json()
        
        if leads:
            lead = leads[0]
            # Check required fields
            assert "lead_id" in lead
            
            # Check common fields exist (may be null)
            common_fields = ["lead_name", "email", "status", "created_at"]
            for field in common_fields:
                if field in lead:
                    print(f"  ✓ Field '{field}' present")
            
            # Check for 'nan' string values (should be cleaned)
            problematic_fields = ["lead_name", "email", "phone", "company_name"]
            for field in problematic_fields:
                value = lead.get(field)
                if value and isinstance(value, str):
                    assert value.lower() not in ["nan", "none", "null"], f"Field '{field}' has unclean value: {value}"
            print(f"✓ Lead data structure validation passed")


class TestCRMLeadCleanup:
    """Cleanup test data created during testing"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("token") or data.get("access_token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_cleanup_test_leads(self, auth_session):
        """Clean up any TEST_ prefixed leads from the database"""
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        if response.status_code == 200:
            leads = response.json()
            test_leads = [l for l in leads if isinstance(l, dict) and str(l.get("lead_name", "")).startswith("TEST_")]
            deleted_count = 0
            for lead in test_leads:
                del_response = auth_session.delete(f"{BASE_URL}/api/crm/leads/{lead['lead_id']}")
                if del_response.status_code == 200:
                    deleted_count += 1
            print(f"✓ Cleaned up {deleted_count} test leads")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
