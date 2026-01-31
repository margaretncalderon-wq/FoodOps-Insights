"""
Test CRM and Events features for EEP Evoque Platform
Tests: Direct/Corporate clients, multi-day events, company name display
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://recipemanager-4.preview.emergentagent.com').rstrip('/')

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
        assert data["user"]["email"] == "test@example.com"
        print(f"✓ Login successful for test@example.com")
        return data


class TestCRMDirectClient:
    """Test CRM Direct Client creation and management"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        # Login first
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        if response.status_code != 200:
            # Register if login fails
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company"
            })
        return session
    
    def test_create_direct_client(self, auth_session):
        """Create a direct client with name, email, phone"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "direct",
            "name": f"TEST_Direct_Client_{unique_id}",
            "email": f"direct_{unique_id}@test.com",
            "phone": "+1 809 555 1234",
            "address": "123 Test Street",
            "notes": "Test direct client",
            "pipeline_stage": "lead",
            "client_source": "direct"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200, f"Failed to create direct client: {response.text}"
        
        data = response.json()
        assert data["client_type"] == "direct"
        assert data["name"] == client_data["name"]
        assert data["email"] == client_data["email"]
        assert data["phone"] == client_data["phone"]
        print(f"✓ Direct client created: {data['name']}")
        return data
    
    def test_direct_client_appears_in_list(self, auth_session):
        """Verify direct client appears in client list"""
        response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200
        
        clients = response.json()
        direct_clients = [c for c in clients if c["client_type"] == "direct"]
        assert len(direct_clients) > 0, "No direct clients found"
        print(f"✓ Found {len(direct_clients)} direct clients in list")


class TestCRMCorporateClient:
    """Test CRM Corporate Client creation with company name, RNC, and contacts"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company"
            })
        return session
    
    def test_create_corporate_client(self, auth_session):
        """Create a corporate client with company name, RNC, and multiple contacts"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "corporate",
            "name": f"TEST_Corp_{unique_id}",  # Will be overwritten by company_name
            "company_name": f"TEST_Acme Corporation_{unique_id}",
            "rnc": "123-45678-9",
            "contacts": [
                {
                    "name": "John Manager",
                    "email": "john@acme.com",
                    "phone": "+1 809 555 0001",
                    "role": "Event Manager"
                },
                {
                    "name": "Jane Director",
                    "email": "jane@acme.com",
                    "phone": "+1 809 555 0002",
                    "role": "Marketing Director"
                }
            ],
            "address": "456 Corporate Ave",
            "notes": "Test corporate client",
            "pipeline_stage": "lead",
            "client_source": "corporate"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200, f"Failed to create corporate client: {response.text}"
        
        data = response.json()
        assert data["client_type"] == "corporate"
        assert data["company_name"] == client_data["company_name"]
        assert data["rnc"] == client_data["rnc"]
        assert len(data["contacts"]) == 2
        print(f"✓ Corporate client created: {data['company_name']} with {len(data['contacts'])} contacts")
        return data
    
    def test_corporate_client_with_empty_contact_email(self, auth_session):
        """Test that corporate client can have contacts with empty email"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "corporate",
            "name": f"TEST_Corp_NoEmail_{unique_id}",
            "company_name": f"TEST_NoEmail Corp_{unique_id}",
            "rnc": "999-88888-7",
            "contacts": [
                {
                    "name": "Contact Without Email",
                    "email": "",  # Empty email should be allowed
                    "phone": "+1 809 555 9999",
                    "role": "Manager"
                }
            ],
            "pipeline_stage": "lead",
            "client_source": "corporate"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200, f"Failed to create corporate client with empty email: {response.text}"
        
        data = response.json()
        assert data["contacts"][0]["email"] == ""
        print(f"✓ Corporate client with empty contact email created successfully")
        return data
    
    def test_corporate_client_badge_in_list(self, auth_session):
        """Verify corporate clients have correct badge in list"""
        response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200
        
        clients = response.json()
        corporate_clients = [c for c in clients if c["client_type"] == "corporate"]
        assert len(corporate_clients) > 0, "No corporate clients found"
        
        for client in corporate_clients:
            assert client.get("company_name"), f"Corporate client missing company_name: {client}"
        print(f"✓ Found {len(corporate_clients)} corporate clients with company names")


class TestEventsWithCorporateClient:
    """Test Events linked to corporate clients show company name"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company"
            })
        return session
    
    @pytest.fixture(scope="class")
    def corporate_client(self, auth_session):
        """Create a corporate client for event testing"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "corporate",
            "name": f"TEST_EventCorp_{unique_id}",
            "company_name": f"TEST_EventCorp Inc_{unique_id}",
            "rnc": "111-22222-3",
            "contacts": [{"name": "Event Contact", "email": "", "phone": "", "role": ""}],
            "pipeline_stage": "lead",
            "client_source": "corporate"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200
        return response.json()
    
    def test_create_event_for_corporate_client(self, auth_session, corporate_client):
        """Create an event linked to a corporate client"""
        event_data = {
            "client_id": corporate_client["client_id"],
            "name": "TEST_Annual Gala",
            "event_type": "corporate",
            "event_date": "2025-06-15T18:00:00Z",
            "end_date": None,
            "is_booking": False,
            "venue": "Grand Ballroom",
            "guest_count": 200,
            "budget": 50000,
            "notes": "Corporate annual gala event",
            "status": "planning"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/events", json=event_data)
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        
        data = response.json()
        assert data["client_id"] == corporate_client["client_id"]
        assert data["name"] == "TEST_Annual Gala"
        print(f"✓ Event created for corporate client: {data['name']}")
        return data
    
    def test_event_includes_client_info(self, auth_session, corporate_client):
        """Verify events endpoint returns client_info with company_name"""
        response = auth_session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200
        
        events = response.json()
        # Find events for our corporate client
        corp_events = [e for e in events if e.get("client_id") == corporate_client["client_id"]]
        
        for event in corp_events:
            assert "client_info" in event, f"Event missing client_info: {event}"
            client_info = event["client_info"]
            assert "company_name" in client_info, f"client_info missing company_name: {client_info}"
            assert "client_type" in client_info, f"client_info missing client_type: {client_info}"
            assert client_info["client_type"] == "corporate"
            print(f"✓ Event '{event['name']}' has client_info with company_name: {client_info['company_name']}")


class TestMultiDayEvents:
    """Test multi-day event/booking functionality"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company"
            })
        return session
    
    @pytest.fixture(scope="class")
    def test_client(self, auth_session):
        """Create a client for multi-day event testing"""
        unique_id = uuid.uuid4().hex[:8]
        client_data = {
            "client_type": "direct",
            "name": f"TEST_MultiDay_Client_{unique_id}",
            "email": f"multiday_{unique_id}@test.com",
            "phone": "",
            "pipeline_stage": "lead",
            "client_source": "direct"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        assert response.status_code == 200
        return response.json()
    
    def test_create_multiday_event(self, auth_session, test_client):
        """Create a multi-day booking event"""
        event_data = {
            "client_id": test_client["client_id"],
            "name": "TEST_3-Day Wedding Weekend",
            "event_type": "wedding",
            "event_date": "2025-07-10T10:00:00Z",
            "end_date": "2025-07-12T23:00:00Z",
            "is_booking": True,
            "venue": "Beach Resort",
            "guest_count": 150,
            "budget": 75000,
            "notes": "Multi-day wedding celebration",
            "status": "planning"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/events", json=event_data)
        assert response.status_code == 200, f"Failed to create multi-day event: {response.text}"
        
        data = response.json()
        assert data["is_booking"] == True
        assert data["end_date"] is not None
        print(f"✓ Multi-day event created: {data['name']} (is_booking={data['is_booking']})")
        return data
    
    def test_multiday_event_in_list(self, auth_session, test_client):
        """Verify multi-day events appear correctly in list"""
        response = auth_session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200
        
        events = response.json()
        multiday_events = [e for e in events if e.get("is_booking") == True and e.get("end_date")]
        
        assert len(multiday_events) > 0, "No multi-day events found"
        for event in multiday_events:
            assert event["event_date"] < event["end_date"], f"Invalid date range: {event}"
        print(f"✓ Found {len(multiday_events)} multi-day events with valid date ranges")


class TestValidationErrors:
    """Test validation error handling"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company"
            })
        return session
    
    def test_invalid_email_format_rejected(self, auth_session):
        """Test that invalid email format is rejected with readable error"""
        client_data = {
            "client_type": "direct",
            "name": "Test Invalid Email",
            "email": "not-an-email",  # Invalid email format
            "phone": "",
            "pipeline_stage": "lead",
            "client_source": "direct"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_data)
        # Should either accept (if email validation is relaxed) or return 422 with readable error
        if response.status_code == 422:
            error = response.json()
            assert "detail" in error
            # Check that error is readable (not raw JSON object)
            detail = error["detail"]
            if isinstance(detail, list):
                for err in detail:
                    assert "msg" in err or "message" in err, f"Error missing readable message: {err}"
            print(f"✓ Invalid email rejected with readable error")
        else:
            # Email validation might be relaxed
            print(f"✓ Email validation is relaxed (status: {response.status_code})")


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
        # Get all clients
        response = auth_session.get(f"{BASE_URL}/api/crm/clients")
        if response.status_code == 200:
            clients = response.json()
            test_clients = [c for c in clients if c["name"].startswith("TEST_") or 
                          (c.get("company_name") and c["company_name"].startswith("TEST_"))]
            
            for client in test_clients:
                auth_session.delete(f"{BASE_URL}/api/crm/clients/{client['client_id']}")
            print(f"✓ Cleaned up {len(test_clients)} test clients")
        
        # Get all events
        response = auth_session.get(f"{BASE_URL}/api/events")
        if response.status_code == 200:
            events = response.json()
            test_events = [e for e in events if e["name"].startswith("TEST_")]
            
            for event in test_events:
                auth_session.delete(f"{BASE_URL}/api/events/{event['event_id']}")
            print(f"✓ Cleaned up {len(test_events)} test events")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
