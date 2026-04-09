"""
Test CRM Module Overhaul Features:
1. Lead conversion with 3 modes (client_only, new_event, existing_event)
2. Lead sources catalog CRUD
3. Events list for conversion linking
4. Leads by source report
5. CSV Import with default_lead_type and default_source params
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuth:
    """Authentication for tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # API returns access_token, not token
        token = data.get("access_token") or data.get("token")
        assert token, "No token in response"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestLeadSources(TestAuth):
    """Test Lead Sources Catalog CRUD - GET /api/crm/lead-sources, POST, DELETE"""
    
    def test_get_lead_sources_auto_seeds_defaults(self, auth_headers):
        """GET /api/crm/lead-sources should auto-seed 12 default sources"""
        response = requests.get(f"{BASE_URL}/api/crm/lead-sources", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        sources = response.json()
        assert isinstance(sources, list), "Response should be a list"
        # Should have at least the 12 default sources
        assert len(sources) >= 12, f"Expected at least 12 sources, got {len(sources)}"
        # Check some expected default sources
        source_names = [s.get("name") for s in sources]
        expected_defaults = ["LinkedIn", "Instagram", "Facebook", "Google", "Referido", "Website"]
        for expected in expected_defaults:
            assert expected in source_names, f"Missing default source: {expected}"
        print(f"✓ Lead sources returned {len(sources)} sources with defaults")
    
    def test_create_lead_source(self, auth_headers):
        """POST /api/crm/lead-sources - create a new source"""
        import uuid
        unique_name = f"TEST_Source_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/crm/lead-sources",
            headers=auth_headers,
            json={"name": unique_name}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("name") == unique_name, "Name mismatch"
        assert "source_id" in data, "Missing source_id"
        print(f"✓ Created lead source: {unique_name}")
        return data["source_id"]
    
    def test_create_duplicate_source_fails(self, auth_headers):
        """POST /api/crm/lead-sources - duplicate name should fail"""
        # Try to create a source with existing name
        response = requests.post(
            f"{BASE_URL}/api/crm/lead-sources",
            headers=auth_headers,
            json={"name": "LinkedIn"}  # This is a default source
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Duplicate source creation correctly rejected")
    
    def test_delete_lead_source(self, auth_headers):
        """DELETE /api/crm/lead-sources/{source_id} - delete a source"""
        # First create a source to delete
        import uuid
        unique_name = f"TEST_ToDelete_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{BASE_URL}/api/crm/lead-sources",
            headers=auth_headers,
            json={"name": unique_name}
        )
        assert create_resp.status_code == 200
        source_id = create_resp.json()["source_id"]
        
        # Now delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/crm/lead-sources/{source_id}",
            headers=auth_headers
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        print(f"✓ Deleted lead source: {source_id}")
    
    def test_delete_nonexistent_source_fails(self, auth_headers):
        """DELETE /api/crm/lead-sources/{source_id} - nonexistent should 404"""
        response = requests.delete(
            f"{BASE_URL}/api/crm/lead-sources/nonexistent_id",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete nonexistent source correctly returns 404")


class TestEventsList(TestAuth):
    """Test Events List endpoint for conversion linking"""
    
    def test_get_events_list(self, auth_headers):
        """GET /api/crm/events-list - should return events and activations"""
        response = requests.get(f"{BASE_URL}/api/crm/events-list", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "events" in data, "Missing 'events' key"
        assert "activations" in data, "Missing 'activations' key"
        assert isinstance(data["events"], list), "events should be a list"
        assert isinstance(data["activations"], list), "activations should be a list"
        print(f"✓ Events list returned {len(data['events'])} events, {len(data['activations'])} activations")


class TestLeadsBySourceReport(TestAuth):
    """Test Leads by Source Report endpoint"""
    
    def test_get_leads_by_source_report(self, auth_headers):
        """GET /api/crm/reports/by-source - should return source breakdown"""
        response = requests.get(f"{BASE_URL}/api/crm/reports/by-source", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Each item should have expected fields
        if len(data) > 0:
            item = data[0]
            assert "source" in item, "Missing 'source' field"
            assert "total" in item, "Missing 'total' field"
            assert "converted" in item, "Missing 'converted' field"
            assert "conversion_rate" in item, "Missing 'conversion_rate' field"
        print(f"✓ Leads by source report returned {len(data)} sources")
    
    def test_get_leads_by_source_with_date_filter(self, auth_headers):
        """GET /api/crm/reports/by-source with date filters"""
        response = requests.get(
            f"{BASE_URL}/api/crm/reports/by-source",
            headers=auth_headers,
            params={"date_from": "2024-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Leads by source report with date filter returned {len(data)} sources")


class TestLeadConversion(TestAuth):
    """Test Lead Conversion with 3 modes"""
    
    @pytest.fixture(scope="class")
    def test_lead_with_owner(self, auth_headers):
        """Create a test lead with owner assigned for conversion tests"""
        import uuid
        
        # First get a user to assign as owner
        users_resp = requests.get(f"{BASE_URL}/api/org/members", headers=auth_headers)
        if users_resp.status_code != 200:
            # Fallback: use current user
            me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
            owner_id = me_resp.json().get("user_id")
        else:
            members = users_resp.json()
            owner_id = members[0]["user_id"] if members else None
        
        # Create a lead
        lead_data = {
            "lead_name": f"TEST_ConvertLead_{uuid.uuid4().hex[:8]}",
            "email": f"test_convert_{uuid.uuid4().hex[:8]}@test.com",
            "company_name": f"TEST_Company_{uuid.uuid4().hex[:8]}",
            "source": "LinkedIn",
            "event_type": "Corporate",
            "lead_type": "outreach"
        }
        create_resp = requests.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=lead_data)
        assert create_resp.status_code == 200, f"Failed to create lead: {create_resp.text}"
        lead = create_resp.json()
        lead_id = lead["lead_id"]
        
        # Assign owner
        if owner_id:
            assign_resp = requests.put(
                f"{BASE_URL}/api/crm/assign/lead/{lead_id}",
                headers=auth_headers,
                params={"owner_id": owner_id}
            )
            # Ignore if fails, we'll test the error case separately
        
        return lead_id
    
    def test_convert_lead_without_owner_fails(self, auth_headers):
        """POST /api/leads/{lead_id}/convert - should fail without owner"""
        import uuid
        
        # Create a lead without owner
        lead_data = {
            "lead_name": f"TEST_NoOwner_{uuid.uuid4().hex[:8]}",
            "email": f"test_noowner_{uuid.uuid4().hex[:8]}@test.com",
            "source": "Website"
        }
        create_resp = requests.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=lead_data)
        assert create_resp.status_code == 200
        lead_id = create_resp.json()["lead_id"]
        
        # Try to convert without owner
        convert_resp = requests.post(
            f"{BASE_URL}/api/leads/{lead_id}/convert",
            headers=auth_headers,
            json={}
        )
        assert convert_resp.status_code == 400, f"Expected 400, got {convert_resp.status_code}"
        assert "salesperson" in convert_resp.text.lower() or "vendedor" in convert_resp.text.lower()
        print("✓ Convert without owner correctly rejected")
    
    def test_convert_lead_client_only_mode(self, auth_headers):
        """POST /api/leads/{lead_id}/convert - Mode 1: Solo Cliente (no event)"""
        import uuid
        
        # Create lead with owner
        lead_data = {
            "lead_name": f"TEST_ClientOnly_{uuid.uuid4().hex[:8]}",
            "email": f"test_clientonly_{uuid.uuid4().hex[:8]}@test.com",
            "company_name": f"TEST_Company_{uuid.uuid4().hex[:8]}",
            "source": "LinkedIn"
        }
        create_resp = requests.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=lead_data)
        assert create_resp.status_code == 200
        lead_id = create_resp.json()["lead_id"]
        
        # Get owner
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        owner_id = me_resp.json().get("user_id")
        
        # Assign owner
        requests.put(
            f"{BASE_URL}/api/crm/assign/lead/{lead_id}",
            headers=auth_headers,
            params={"owner_id": owner_id}
        )
        
        # Convert - client only (no create_event, no existing_event_id)
        convert_resp = requests.post(
            f"{BASE_URL}/api/leads/{lead_id}/convert",
            headers=auth_headers,
            json={}  # Empty body = client only
        )
        assert convert_resp.status_code == 200, f"Convert failed: {convert_resp.text}"
        data = convert_resp.json()
        assert "client_id" in data, "Missing client_id"
        assert data.get("event_id") is None, "event_id should be None for client-only mode"
        print(f"✓ Client-only conversion successful: client_id={data['client_id']}")
    
    def test_convert_lead_new_event_mode(self, auth_headers):
        """POST /api/leads/{lead_id}/convert - Mode 2: Cliente + Evento Nuevo"""
        import uuid
        
        # Create lead with owner
        lead_data = {
            "lead_name": f"TEST_NewEvent_{uuid.uuid4().hex[:8]}",
            "email": f"test_newevent_{uuid.uuid4().hex[:8]}@test.com",
            "company_name": f"TEST_Company_{uuid.uuid4().hex[:8]}",
            "source": "Instagram",
            "event_type": "Wedding"
        }
        create_resp = requests.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=lead_data)
        assert create_resp.status_code == 200
        lead_id = create_resp.json()["lead_id"]
        
        # Get owner
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        owner_id = me_resp.json().get("user_id")
        
        # Assign owner
        requests.put(
            f"{BASE_URL}/api/crm/assign/lead/{lead_id}",
            headers=auth_headers,
            params={"owner_id": owner_id}
        )
        
        # Convert - create new event
        convert_resp = requests.post(
            f"{BASE_URL}/api/leads/{lead_id}/convert",
            headers=auth_headers,
            json={"create_event": True}
        )
        assert convert_resp.status_code == 200, f"Convert failed: {convert_resp.text}"
        data = convert_resp.json()
        assert "client_id" in data, "Missing client_id"
        assert "event_id" in data and data["event_id"] is not None, "event_id should be set for new-event mode"
        print(f"✓ New event conversion successful: client_id={data['client_id']}, event_id={data['event_id']}")
    
    def test_convert_lead_existing_event_mode(self, auth_headers):
        """POST /api/leads/{lead_id}/convert - Mode 3: Cliente + Evento Existente"""
        import uuid
        
        # First get an existing event
        events_resp = requests.get(f"{BASE_URL}/api/crm/events-list", headers=auth_headers)
        assert events_resp.status_code == 200
        events_data = events_resp.json()
        events = events_data.get("events", [])
        
        if not events:
            pytest.skip("No existing events to link to")
        
        existing_event_id = events[0]["event_id"]
        
        # Create lead with owner
        lead_data = {
            "lead_name": f"TEST_ExistingEvent_{uuid.uuid4().hex[:8]}",
            "email": f"test_existingevent_{uuid.uuid4().hex[:8]}@test.com",
            "company_name": f"TEST_Company_{uuid.uuid4().hex[:8]}",
            "source": "Referido"
        }
        create_resp = requests.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=lead_data)
        assert create_resp.status_code == 200
        lead_id = create_resp.json()["lead_id"]
        
        # Get owner
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        owner_id = me_resp.json().get("user_id")
        
        # Assign owner
        requests.put(
            f"{BASE_URL}/api/crm/assign/lead/{lead_id}",
            headers=auth_headers,
            params={"owner_id": owner_id}
        )
        
        # Convert - link to existing event
        convert_resp = requests.post(
            f"{BASE_URL}/api/leads/{lead_id}/convert",
            headers=auth_headers,
            json={"existing_event_id": existing_event_id}
        )
        assert convert_resp.status_code == 200, f"Convert failed: {convert_resp.text}"
        data = convert_resp.json()
        assert "client_id" in data, "Missing client_id"
        assert data.get("event_id") == existing_event_id, f"event_id should be {existing_event_id}"
        print(f"✓ Existing event conversion successful: client_id={data['client_id']}, event_id={data['event_id']}")
    
    def test_convert_already_converted_lead_fails(self, auth_headers):
        """POST /api/leads/{lead_id}/convert - already converted should fail"""
        import uuid
        
        # Create and convert a lead
        lead_data = {
            "lead_name": f"TEST_AlreadyConverted_{uuid.uuid4().hex[:8]}",
            "email": f"test_alreadyconverted_{uuid.uuid4().hex[:8]}@test.com",
            "source": "Website"
        }
        create_resp = requests.post(f"{BASE_URL}/api/leads", headers=auth_headers, json=lead_data)
        assert create_resp.status_code == 200
        lead_id = create_resp.json()["lead_id"]
        
        # Get owner and assign
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        owner_id = me_resp.json().get("user_id")
        requests.put(
            f"{BASE_URL}/api/crm/assign/lead/{lead_id}",
            headers=auth_headers,
            params={"owner_id": owner_id}
        )
        
        # First conversion
        convert_resp = requests.post(
            f"{BASE_URL}/api/leads/{lead_id}/convert",
            headers=auth_headers,
            json={}
        )
        assert convert_resp.status_code == 200
        
        # Try to convert again
        convert_again_resp = requests.post(
            f"{BASE_URL}/api/leads/{lead_id}/convert",
            headers=auth_headers,
            json={}
        )
        assert convert_again_resp.status_code == 400, f"Expected 400, got {convert_again_resp.status_code}"
        assert "already converted" in convert_again_resp.text.lower()
        print("✓ Already converted lead correctly rejected")


class TestCSVImport(TestAuth):
    """Test CSV Import with default_lead_type and default_source params"""
    
    def test_import_leads_with_default_outreach_type(self, auth_headers):
        """POST /api/import-export/leads/import with default_lead_type=outreach"""
        # Create a simple CSV
        csv_content = """nombre,email,empresa,telefono
TEST_Import1,test_import1@test.com,Test Company 1,1234567890
TEST_Import2,test_import2@test.com,Test Company 2,0987654321"""
        
        files = {
            'file': ('test_leads.csv', csv_content, 'text/csv')
        }
        
        # Remove Content-Type from headers for multipart
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(
            f"{BASE_URL}/api/import-export/leads/import",
            headers=headers,
            files=files,
            params={"default_lead_type": "outreach", "default_source": "LinkedIn"}
        )
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        assert "imported" in data, "Missing 'imported' count"
        print(f"✓ CSV import with default_lead_type=outreach: {data.get('imported')} imported")
    
    def test_import_leads_with_default_source(self, auth_headers):
        """POST /api/import-export/leads/import with default_source parameter"""
        import uuid
        unique_id = uuid.uuid4().hex[:6]
        
        csv_content = f"""nombre,email,empresa
TEST_SourceImport_{unique_id},test_sourceimport_{unique_id}@test.com,Test Source Company"""
        
        files = {
            'file': ('test_source_leads.csv', csv_content, 'text/csv')
        }
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(
            f"{BASE_URL}/api/import-export/leads/import",
            headers=headers,
            files=files,
            params={"default_source": "Cold Call"}
        )
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        assert data.get("imported", 0) >= 1, "Should have imported at least 1 lead"
        print(f"✓ CSV import with default_source=Cold Call: {data.get('imported')} imported")


class TestOutreachLeads(TestAuth):
    """Test Outreach leads endpoints"""
    
    def test_get_outreach_leads(self, auth_headers):
        """GET /api/crm/outreach - should return outreach leads"""
        response = requests.get(f"{BASE_URL}/api/crm/outreach", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned leads should be outreach type
        for lead in data[:5]:  # Check first 5
            assert lead.get("lead_type") == "outreach", f"Lead {lead.get('lead_id')} is not outreach type"
        print(f"✓ Outreach leads returned {len(data)} leads")
    
    def test_create_outreach_lead(self, auth_headers):
        """POST /api/crm/outreach - create outreach lead"""
        import uuid
        lead_data = {
            "lead_name": f"TEST_Outreach_{uuid.uuid4().hex[:8]}",
            "email": f"test_outreach_{uuid.uuid4().hex[:8]}@test.com",
            "company_name": "Test Outreach Company"
        }
        response = requests.post(f"{BASE_URL}/api/crm/outreach", headers=auth_headers, json=lead_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("lead_type") == "outreach", "Should be outreach type"
        assert data.get("source") == "Outreach", "Source should be 'Outreach'"
        print(f"✓ Created outreach lead: {data.get('lead_id')}")


class TestInboundLeads(TestAuth):
    """Test Inbound leads endpoints"""
    
    def test_get_inbound_leads(self, auth_headers):
        """GET /api/crm/inbound - should return inbound leads"""
        response = requests.get(f"{BASE_URL}/api/crm/inbound", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned leads should NOT be outreach type
        for lead in data[:5]:  # Check first 5
            assert lead.get("lead_type") != "outreach", f"Lead {lead.get('lead_id')} should not be outreach type"
        print(f"✓ Inbound leads returned {len(data)} leads")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
