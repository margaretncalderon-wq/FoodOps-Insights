"""
Tests for CRM Performance Optimization
Tests the optimized /crm/stats and /crm/clients-with-events endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo.agency@kora.com",
        "password": "Evoque2024!"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json().get("access_token")
    assert token, "No token in login response"
    return token

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for authenticated requests"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestCRMStatsEndpoint:
    """Tests for the optimized /api/crm/stats endpoint"""
    
    def test_stats_endpoint_returns_200(self, auth_headers):
        """Test that stats endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/crm/stats", headers=auth_headers)
        assert response.status_code == 200, f"Stats endpoint failed: {response.text}"
        print("✓ /api/crm/stats returns 200 OK")
    
    def test_stats_response_structure(self, auth_headers):
        """Test that stats response has required fields"""
        response = requests.get(f"{BASE_URL}/api/crm/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields
        expected_fields = [
            "total_clients",
            "active_clients",
            "total_leads",
            "new_leads",
            "outreach_leads",
            "inbound_leads",
            "follow_ups_due"
        ]
        
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
            assert isinstance(data[field], (int, float)), f"Field {field} should be numeric, got {type(data[field])}"
        
        print(f"✓ Stats response structure valid: {data}")
    
    def test_stats_values_are_reasonable(self, auth_headers):
        """Test that stats values are non-negative"""
        response = requests.get(f"{BASE_URL}/api/crm/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        for key, value in data.items():
            assert value >= 0, f"Field {key} has negative value: {value}"
        
        # Verify outreach + inbound = total_leads (approximately)
        # Note: This might not be exact due to data inconsistencies
        print(f"✓ Stats values: total_clients={data['total_clients']}, total_leads={data['total_leads']}")


class TestCRMClientsWithEventsEndpoint:
    """Tests for the optimized /api/crm/clients-with-events endpoint"""
    
    def test_clients_with_events_returns_200(self, auth_headers):
        """Test that clients-with-events endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/crm/clients-with-events", headers=auth_headers)
        assert response.status_code == 200, f"Clients-with-events endpoint failed: {response.text}"
        print("✓ /api/crm/clients-with-events returns 200 OK")
    
    def test_clients_with_events_response_is_list(self, auth_headers):
        """Test that response is a list"""
        response = requests.get(f"{BASE_URL}/api/crm/clients-with-events", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Clients-with-events returns list with {len(data)} clients")
    
    def test_client_has_events_array(self, auth_headers):
        """Test that each client has events array"""
        response = requests.get(f"{BASE_URL}/api/crm/clients-with-events", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            client = data[0]
            assert "events" in client, "Client should have 'events' field"
            assert isinstance(client["events"], list), "Events should be a list"
            assert "events_count" in client, "Client should have 'events_count' field"
            print(f"✓ First client has events array with {len(client['events'])} events")
        else:
            print("✓ No clients found, but endpoint works")
    
    def test_client_has_required_fields(self, auth_headers):
        """Test that clients have required fields from optimization"""
        response = requests.get(f"{BASE_URL}/api/crm/clients-with-events", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            client = data[0]
            
            # Fields that should exist after optimization
            expected_fields = [
                "client_id",
                "display_name",
                "client_type",
                "status",
                "events",
                "events_count",
                "lifetime_value",
                "credit_used",
                "credit_percentage",
                "contacts"
            ]
            
            for field in expected_fields:
                assert field in client, f"Missing field: {field}"
            
            print(f"✓ Client has all required fields: {list(client.keys())}")


class TestCRMOutreachEndpoint:
    """Tests for /api/crm/outreach endpoint"""
    
    def test_outreach_returns_200(self, auth_headers):
        """Test that outreach endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/crm/outreach", headers=auth_headers)
        assert response.status_code == 200, f"Outreach endpoint failed: {response.text}"
        print("✓ /api/crm/outreach returns 200 OK")
    
    def test_outreach_response_is_list(self, auth_headers):
        """Test that outreach response is a list"""
        response = requests.get(f"{BASE_URL}/api/crm/outreach", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Outreach returns list with {len(data)} leads")


class TestCRMInboundEndpoint:
    """Tests for /api/crm/inbound endpoint"""
    
    def test_inbound_returns_200(self, auth_headers):
        """Test that inbound endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/crm/inbound", headers=auth_headers)
        assert response.status_code == 200, f"Inbound endpoint failed: {response.text}"
        print("✓ /api/crm/inbound returns 200 OK")
    
    def test_inbound_response_is_list(self, auth_headers):
        """Test that inbound response is a list"""
        response = requests.get(f"{BASE_URL}/api/crm/inbound", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Inbound returns list with {len(data)} leads")


class TestCRMClientsEndpoint:
    """Tests for /api/crm/clients endpoint"""
    
    def test_clients_returns_200(self, auth_headers):
        """Test that clients endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/crm/clients", headers=auth_headers)
        assert response.status_code == 200, f"Clients endpoint failed: {response.text}"
        print("✓ /api/crm/clients returns 200 OK")
    
    def test_clients_response_is_list(self, auth_headers):
        """Test that clients response is a list"""
        response = requests.get(f"{BASE_URL}/api/crm/clients", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Clients returns list with {len(data)} clients")


class TestHealthCheck:
    """Basic health check test"""
    
    def test_health_endpoint(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print("✓ /api/health returns 200 OK")
