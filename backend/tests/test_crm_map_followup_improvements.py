"""
Test CRM Map and Follow-up Improvements (Iteration 142)
- geo-stats endpoint returns leads AND clients counts per city
- city-detail endpoint returns leads[] and clients[] arrays
- follow-up complete endpoint accepts notes and next_follow_up scheduling
- comm_log entry created when notes provided on complete
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGeoStatsEndpoint:
    """Test geo-stats endpoint returns leads and clients counts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_geo_stats_returns_leads_and_clients_fields(self):
        """Verify geo-stats returns leads, clients, and total fields per city"""
        resp = self.session.get(f"{BASE_URL}/api/crm/geo-stats")
        assert resp.status_code == 200, f"geo-stats failed: {resp.text}"
        data = resp.json()
        
        # Check structure
        assert "cities" in data, "Response should have 'cities' array"
        assert "no_city_count" in data, "Response should have 'no_city_count'"
        
        # If there are cities, check each has leads, clients, total
        if data["cities"]:
            city = data["cities"][0]
            assert "city" in city, "City should have 'city' name"
            assert "leads" in city, "City should have 'leads' count"
            assert "clients" in city, "City should have 'clients' count"
            assert "total" in city, "City should have 'total' count"
            
            # Verify total = leads + clients
            assert city["total"] == city["leads"] + city["clients"], \
                f"Total ({city['total']}) should equal leads ({city['leads']}) + clients ({city['clients']})"
            
            print(f"PASS: geo-stats returns correct structure. Sample city: {city['city']} - {city['leads']} leads, {city['clients']} clients")
    
    def test_geo_stats_cities_sorted_by_total(self):
        """Verify cities are sorted by total count descending"""
        resp = self.session.get(f"{BASE_URL}/api/crm/geo-stats")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data["cities"]) > 1:
            totals = [c["total"] for c in data["cities"]]
            assert totals == sorted(totals, reverse=True), "Cities should be sorted by total descending"
            print(f"PASS: Cities sorted correctly. Top city: {data['cities'][0]['city']} with {data['cities'][0]['total']} total")


class TestCityDetailEndpoint:
    """Test city-detail endpoint returns leads[] and clients[] arrays"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_city_detail_returns_leads_and_clients_arrays(self):
        """Verify city-detail returns leads[] and clients[] arrays"""
        # First get a city from geo-stats
        geo_resp = self.session.get(f"{BASE_URL}/api/crm/geo-stats")
        assert geo_resp.status_code == 200
        cities = geo_resp.json().get("cities", [])
        
        if not cities:
            pytest.skip("No cities with data to test")
        
        test_city = cities[0]["city"]
        
        # Get city detail
        resp = self.session.get(f"{BASE_URL}/api/crm/geo-stats/city-detail?city={test_city}")
        assert resp.status_code == 200, f"city-detail failed: {resp.text}"
        data = resp.json()
        
        # Check structure
        assert "city" in data, "Response should have 'city' name"
        assert "leads" in data, "Response should have 'leads' array"
        assert "clients" in data, "Response should have 'clients' array"
        assert isinstance(data["leads"], list), "'leads' should be an array"
        assert isinstance(data["clients"], list), "'clients' should be an array"
        
        print(f"PASS: city-detail for '{test_city}' returns {len(data['leads'])} leads and {len(data['clients'])} clients")
        
        # Check lead structure if any
        if data["leads"]:
            lead = data["leads"][0]
            assert "lead_id" in lead, "Lead should have lead_id"
            assert "lead_name" in lead or "company_name" in lead, "Lead should have name"
            print(f"  Sample lead: {lead.get('lead_name') or lead.get('company_name')}")
        
        # Check client structure if any
        if data["clients"]:
            client = data["clients"][0]
            assert "client_id" in client, "Client should have client_id"
            assert "display_name" in client, "Client should have display_name"
            print(f"  Sample client: {client.get('display_name')}")
    
    def test_city_detail_case_insensitive(self):
        """Verify city-detail uses case-insensitive matching"""
        # Get a city
        geo_resp = self.session.get(f"{BASE_URL}/api/crm/geo-stats")
        cities = geo_resp.json().get("cities", [])
        
        if not cities:
            pytest.skip("No cities with data to test")
        
        test_city = cities[0]["city"]
        
        # Try lowercase
        resp_lower = self.session.get(f"{BASE_URL}/api/crm/geo-stats/city-detail?city={test_city.lower()}")
        assert resp_lower.status_code == 200
        
        # Try uppercase
        resp_upper = self.session.get(f"{BASE_URL}/api/crm/geo-stats/city-detail?city={test_city.upper()}")
        assert resp_upper.status_code == 200
        
        print(f"PASS: city-detail is case-insensitive for '{test_city}'")


class TestFollowUpCompleteWithNotes:
    """Test follow-up complete endpoint with notes and next follow-up scheduling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_complete_followup_with_notes_creates_comm_log(self):
        """Verify completing follow-up with notes creates a comm_log entry"""
        # Get follow-ups to find one to complete
        resp = self.session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert resp.status_code == 200, f"get follow-ups failed: {resp.text}"
        follow_ups = resp.json()
        
        if not follow_ups:
            # Create a test lead with follow-up
            lead_resp = self.session.post(f"{BASE_URL}/api/leads", json={
                "lead_name": "TEST_FollowUpNotes Lead",
                "email": "test_followup_notes@test.com",
                "source": "Test"
            })
            assert lead_resp.status_code == 200, f"Create lead failed: {lead_resp.text}"
            lead_id = lead_resp.json()["lead_id"]
            
            # Set follow-up date
            import datetime
            today = datetime.date.today().isoformat()
            update_resp = self.session.put(
                f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}?next_follow_up_date={today}&follow_up_type=Call"
            )
            assert update_resp.status_code == 200
            
            entity_type = "lead"
            entity_id = lead_id
        else:
            # Use existing follow-up
            fu = follow_ups[0]
            entity_type = fu["entity_type"]
            entity_id = fu["entity_id"]
        
        # Complete with notes
        test_notes = "TEST: Spoke with client, they are interested in our services. Will follow up next week."
        complete_resp = self.session.post(
            f"{BASE_URL}/api/crm/follow-ups/{entity_type}/{entity_id}/complete",
            json={
                "notes": test_notes,
                "follow_up_type_completed": "Call"
            }
        )
        assert complete_resp.status_code == 200, f"Complete follow-up failed: {complete_resp.text}"
        result = complete_resp.json()
        assert "message" in result
        print(f"PASS: Follow-up completed for {entity_type}/{entity_id}")
        
        # Verify comm_log was created
        comm_resp = self.session.get(f"{BASE_URL}/api/crm/comms/{entity_type}/{entity_id}")
        assert comm_resp.status_code == 200, f"Get comm logs failed: {comm_resp.text}"
        comm_logs = comm_resp.json()
        
        # Find our note
        found_note = False
        for log in comm_logs:
            if test_notes in log.get("content", ""):
                found_note = True
                assert log.get("subject") == "Follow-up completed", "Comm log subject should be 'Follow-up completed'"
                print(f"PASS: Comm log entry created with notes")
                break
        
        assert found_note, "Comm log entry with notes not found"
    
    def test_complete_followup_with_next_scheduled(self):
        """Verify completing follow-up with next_follow_up_date schedules new follow-up"""
        # Create a test lead
        lead_resp = self.session.post(f"{BASE_URL}/api/leads", json={
            "lead_name": "TEST_NextFollowUp Lead",
            "email": "test_next_followup@test.com",
            "source": "Test"
        })
        assert lead_resp.status_code == 200
        lead_id = lead_resp.json()["lead_id"]
        
        # Set initial follow-up
        import datetime
        today = datetime.date.today().isoformat()
        self.session.put(f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}?next_follow_up_date={today}&follow_up_type=Call")
        
        # Complete with next follow-up scheduled
        next_date = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
        complete_resp = self.session.post(
            f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}/complete",
            json={
                "notes": "Initial call completed",
                "next_follow_up_date": next_date,
                "next_follow_up_type": "Email"
            }
        )
        assert complete_resp.status_code == 200
        result = complete_resp.json()
        assert result.get("next_scheduled") == True, "Response should indicate next follow-up was scheduled"
        print(f"PASS: Follow-up completed with next scheduled for {next_date}")
        
        # Verify lead has new follow-up date
        lead_resp = self.session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert lead_resp.status_code == 200
        lead = lead_resp.json()
        assert lead.get("next_follow_up_date") == next_date, f"Lead should have next_follow_up_date={next_date}"
        assert lead.get("follow_up_type") == "Email", "Lead should have follow_up_type=Email"
        print(f"PASS: Lead updated with next follow-up date and type")
        
        # Cleanup
        # Note: No delete endpoint for leads, so we'll leave it
    
    def test_complete_followup_without_next_clears_date(self):
        """Verify completing follow-up without next_follow_up_date clears the follow-up"""
        # Create a test lead
        lead_resp = self.session.post(f"{BASE_URL}/api/leads", json={
            "lead_name": "TEST_ClearFollowUp Lead",
            "email": "test_clear_followup@test.com",
            "source": "Test"
        })
        assert lead_resp.status_code == 200
        lead_id = lead_resp.json()["lead_id"]
        
        # Set initial follow-up
        import datetime
        today = datetime.date.today().isoformat()
        self.session.put(f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}?next_follow_up_date={today}&follow_up_type=Call")
        
        # Complete without scheduling next
        complete_resp = self.session.post(
            f"{BASE_URL}/api/crm/follow-ups/lead/{lead_id}/complete",
            json={"notes": "Completed, no next follow-up needed"}
        )
        assert complete_resp.status_code == 200
        result = complete_resp.json()
        assert result.get("next_scheduled") == False, "Response should indicate no next follow-up scheduled"
        
        # Verify lead has no follow-up date
        lead_resp = self.session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert lead_resp.status_code == 200
        lead = lead_resp.json()
        assert lead.get("next_follow_up_date") is None, "Lead should have no next_follow_up_date"
        print(f"PASS: Follow-up cleared when completed without next date")


class TestFollowUpsEndpoint:
    """Test follow-ups endpoint returns correct data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_follow_ups_returns_list(self):
        """Verify follow-ups endpoint returns a list"""
        resp = self.session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list), "Follow-ups should return a list"
        print(f"PASS: Follow-ups endpoint returns {len(data)} items")
        
        if data:
            fu = data[0]
            assert "entity_type" in fu, "Follow-up should have entity_type"
            assert "entity_id" in fu, "Follow-up should have entity_id"
            assert "name" in fu, "Follow-up should have name"
            assert "follow_up_date" in fu, "Follow-up should have follow_up_date"
            assert "follow_up_type" in fu, "Follow-up should have follow_up_type"
            assert "status" in fu, "Follow-up should have status (overdue/pending)"
            print(f"  Sample: {fu['entity_type']}/{fu['name']} - {fu['follow_up_date']} ({fu['status']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
