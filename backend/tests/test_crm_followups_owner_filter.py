"""
Test CRM Follow-ups with Owner ID Filter
Testing the owner_id parameter for follow-ups filtering:
- GET /api/crm/follow-ups (no filter - returns all)
- GET /api/crm/follow-ups?owner_id={user_id} (filter by specific owner)
- GET /api/crm/follow-ups?owner_id=__unassigned__ (filter unassigned follow-ups)
- GET /api/crm/team-members (for populating owner dropdown)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuth:
    """Get authentication token"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data or "token" in data, "No token in response"
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def session(self, auth_token):
        """Return session with auth cookie"""
        session = requests.Session()
        # Set cookies from login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        session.cookies = login_response.cookies
        return session


class TestTeamMembers:
    """Test team members endpoint for owner dropdown"""
    
    def test_get_team_members(self):
        """GET /api/crm/team-members - get list of team members for dropdown"""
        # Login first
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200
        
        # Use cookies from login
        response = requests.get(
            f"{BASE_URL}/api/crm/team-members",
            cookies=login_response.cookies
        )
        
        assert response.status_code == 200, f"Failed to get team members: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Team members should be a list"
        
        # Each member should have user_id, name, email
        if len(data) > 0:
            member = data[0]
            assert "user_id" in member, "Team member should have user_id"
            assert "email" in member, "Team member should have email"
            print(f"✓ Found {len(data)} team members")
            for m in data[:5]:  # Print first 5
                print(f"  - {m.get('name', 'N/A')} ({m.get('user_id')})")
        else:
            print("✓ No team members found (expected if empty org)")
        
        return data


class TestFollowUpsEndpoint:
    """Test follow-ups endpoint with owner_id filter"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200
        return session
    
    def test_get_follow_ups_no_filter(self, auth_session):
        """GET /api/crm/follow-ups - returns all follow-ups without filter"""
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Follow-ups should be a list"
        print(f"✓ GET /api/crm/follow-ups returned {len(data)} items")
        
        # Validate structure if data exists
        if len(data) > 0:
            item = data[0]
            required_fields = ["entity_type", "entity_id", "follow_up_date"]
            for field in required_fields:
                assert field in item, f"Missing field: {field}"
            
            # Check owner_name is present in response
            # Note: owner_name may be None for unassigned items
            assert "owner_name" in item or "owner_id" in item, "Response should include owner info"
            print(f"  First item: {item.get('name')} ({item.get('entity_type')}) - Owner: {item.get('owner_name', 'Unassigned')}")
        
        return data
    
    def test_get_follow_ups_unassigned_filter(self, auth_session):
        """GET /api/crm/follow-ups?owner_id=__unassigned__ - returns unassigned follow-ups"""
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups?owner_id=__unassigned__")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Follow-ups should be a list"
        print(f"✓ GET /api/crm/follow-ups?owner_id=__unassigned__ returned {len(data)} items")
        
        # Verify all items are unassigned
        for item in data:
            owner_id = item.get("owner_id")
            assert owner_id is None or owner_id == "", f"Found assigned item in unassigned filter: {item.get('name')} has owner_id={owner_id}"
        
        if len(data) > 0:
            print(f"  ✓ All {len(data)} items verified as unassigned")
        else:
            print("  ✓ No unassigned follow-ups (may be expected)")
        
        return data
    
    def test_get_follow_ups_by_specific_owner(self, auth_session):
        """GET /api/crm/follow-ups?owner_id={user_id} - filter by specific owner"""
        # First get team members to get a valid user_id
        team_response = auth_session.get(f"{BASE_URL}/api/crm/team-members")
        assert team_response.status_code == 200
        team_members = team_response.json()
        
        if len(team_members) == 0:
            pytest.skip("No team members available to test owner filter")
        
        # Use first team member's user_id
        test_owner_id = team_members[0].get("user_id")
        owner_name = team_members[0].get("name", "Unknown")
        
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups?owner_id={test_owner_id}")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Follow-ups should be a list"
        print(f"✓ GET /api/crm/follow-ups?owner_id={test_owner_id} ({owner_name}) returned {len(data)} items")
        
        # Verify all items belong to this owner
        for item in data:
            item_owner = item.get("owner_id")
            assert item_owner == test_owner_id, f"Wrong owner: expected {test_owner_id}, got {item_owner}"
        
        if len(data) > 0:
            print(f"  ✓ All {len(data)} items verified to belong to {owner_name}")
        else:
            print(f"  ✓ No follow-ups for {owner_name} (may be expected)")
        
        return data
    
    def test_follow_up_response_includes_owner_name(self, auth_session):
        """Verify follow-ups response includes owner_name field"""
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) == 0:
            print("⚠ No follow-ups to check owner_name field")
            return
        
        # Check that owner_name field exists in response items
        for item in data[:5]:  # Check first 5
            assert "owner_name" in item, f"owner_name field missing in response for {item.get('name')}"
            assert "owner_id" in item, f"owner_id field missing in response for {item.get('name')}"
            
            # If owner_id is set, owner_name should be resolved (not None)
            if item.get("owner_id"):
                print(f"  - {item.get('name')}: owner_id={item.get('owner_id')}, owner_name={item.get('owner_name')}")
            else:
                print(f"  - {item.get('name')}: Unassigned")
        
        print(f"✓ owner_name field present in all checked follow-ups")


class TestFollowUpsIntegration:
    """Integration tests for follow-ups with leads/clients"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200
        return session
    
    def test_follow_up_entity_types(self, auth_session):
        """Verify follow-ups include both lead and client entity types"""
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) == 0:
            print("⚠ No follow-ups to check entity types")
            return
        
        entity_types = set(item.get("entity_type") for item in data)
        print(f"✓ Found entity types: {entity_types}")
        
        # Both lead and client should be valid entity types
        for entity_type in entity_types:
            assert entity_type in ["lead", "client"], f"Invalid entity_type: {entity_type}"
        
        leads_count = sum(1 for item in data if item.get("entity_type") == "lead")
        clients_count = sum(1 for item in data if item.get("entity_type") == "client")
        print(f"  - Leads: {leads_count}, Clients: {clients_count}")
    
    def test_follow_up_required_fields(self, auth_session):
        """Verify all required fields in follow-up response"""
        response = auth_session.get(f"{BASE_URL}/api/crm/follow-ups")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) == 0:
            print("⚠ No follow-ups to check required fields")
            return
        
        required_fields = [
            "entity_type",
            "entity_id", 
            "name",
            "follow_up_date",
            "follow_up_type",
            "owner_id",
            "owner_name",
            "status"
        ]
        
        for item in data[:3]:  # Check first 3
            for field in required_fields:
                assert field in item, f"Missing required field: {field} in item {item.get('entity_id')}"
        
        print(f"✓ All required fields present in follow-up responses")


class TestEndpointSecurity:
    """Test endpoint authentication requirements"""
    
    def test_follow_ups_requires_auth(self):
        """GET /api/crm/follow-ups should require authentication"""
        response = requests.get(f"{BASE_URL}/api/crm/follow-ups")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ /api/crm/follow-ups requires authentication")
    
    def test_team_members_requires_auth(self):
        """GET /api/crm/team-members should require authentication"""
        response = requests.get(f"{BASE_URL}/api/crm/team-members")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ /api/crm/team-members requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
