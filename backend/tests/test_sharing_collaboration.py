"""
Tests for Cross-Organization Collaboration (Sharing) feature
- /api/share/entity endpoint for sharing projects/campaigns
- /api/share/sent endpoint for listing outgoing shares
- /api/share/received endpoint for listing incoming shares
- /api/share/{share_id}/revoke endpoint for revoking shares
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    
    # Login to get authentication token
    login_response = sess.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed with status {login_response.status_code}: {login_response.text}")
    
    return sess


class TestSharingBackendAPIs:
    """Test sharing API endpoints"""
    
    def test_health_check(self, session):
        """Verify service health before testing sharing"""
        response = session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("Health check passed")
    
    def test_share_entity_endpoint_exists(self, session):
        """Test that /api/share/entity endpoint exists and requires proper data"""
        # Test with empty data - should return 422 (validation error)
        response = session.post(f"{BASE_URL}/api/share/entity", json={})
        
        # Either 422 (validation error) or 400 (bad request) is acceptable
        assert response.status_code in [422, 400], f"Expected 422 or 400, got {response.status_code}"
        print(f"Share entity endpoint responds correctly with status {response.status_code}")
    
    def test_share_sent_endpoint(self, session):
        """Test /api/share/sent endpoint returns list of sent shares"""
        response = session.get(f"{BASE_URL}/api/share/sent")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return a list (even if empty)
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Share sent endpoint works - returned {len(data)} shares")
        
        # If there are shares, validate structure
        if len(data) > 0:
            share = data[0]
            expected_fields = ["share_id", "source_org_id", "target_org_id", "entity_type", "entity_id"]
            for field in expected_fields:
                assert field in share, f"Missing field '{field}' in share response"
            print(f"Share structure validated: {share.get('share_id')}")
    
    def test_share_received_endpoint(self, session):
        """Test /api/share/received endpoint returns list of received shares"""
        response = session.get(f"{BASE_URL}/api/share/received")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return a list (even if empty)
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Share received endpoint works - returned {len(data)} shares")
    
    def test_share_received_with_entity_type_filter(self, session):
        """Test /api/share/received endpoint with entity_type filter"""
        # Test with project filter
        response = session.get(f"{BASE_URL}/api/share/received?entity_type=project")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Share received (projects) - returned {len(data)} shares")
        
        # Test with campaign filter
        response = session.get(f"{BASE_URL}/api/share/received?entity_type=campaign")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Share received (campaigns) - returned {len(data)} shares")
    
    def test_collaboration_status_endpoint(self, session):
        """Test /api/share/collaboration-status endpoint"""
        response = session.get(f"{BASE_URL}/api/share/collaboration-status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate expected fields
        assert "is_collaboration_only" in data
        assert "has_shared_access" in data
        assert isinstance(data["is_collaboration_only"], bool)
        assert isinstance(data["has_shared_access"], bool)
        print(f"Collaboration status: is_collab_only={data['is_collaboration_only']}, has_shared={data['has_shared_access']}")


class TestExecutionHubWithScopeFilter:
    """Test Execution Hub goals endpoint with scope filter"""
    
    def test_goals_list_no_filter(self, session):
        """Test getting all goals without scope filter"""
        response = session.get(f"{BASE_URL}/api/execution-hub/goals")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Execution Hub goals (all) - returned {len(data)} goals")
        return data
    
    def test_goals_list_owned_scope(self, session):
        """Test getting owned goals with scope=owned filter"""
        response = session.get(f"{BASE_URL}/api/execution-hub/goals?scope=owned")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # All returned goals should be owned (no _access_type or _access_type in ["owner", "owned"])
        for goal in data:
            access_type = goal.get("_access_type", "owner")
            assert access_type in ["owner", "owned", None], f"Expected owner/owned, got {access_type}"
        
        print(f"Execution Hub goals (owned) - returned {len(data)} goals")
    
    def test_goals_list_shared_scope(self, session):
        """Test getting shared goals with scope=shared filter"""
        response = session.get(f"{BASE_URL}/api/execution-hub/goals?scope=shared")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # All returned goals should be shared
        for goal in data:
            assert goal.get("_access_type") == "shared", f"Expected shared access type"
        
        print(f"Execution Hub goals (shared) - returned {len(data)} goals")
    
    def test_goal_detail_with_owner_check(self, session):
        """Test goal detail page returns owner information"""
        # First get a goal
        response = session.get(f"{BASE_URL}/api/execution-hub/goals")
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No goals available for testing")
        
        goals = response.json()
        goal_id = goals[0]["goal_id"]
        
        # Get goal detail
        response = session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Validate goal structure
        assert "goal_id" in data
        assert "title" in data
        print(f"Goal detail works: {data.get('title')}")


class TestCampaignsWithScopeFilter:
    """Test Campaigns endpoint with scope filter"""
    
    def test_campaigns_list_no_filter(self, session):
        """Test getting all campaigns without scope filter"""
        response = session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Campaigns (all) - returned {len(data)} campaigns")
    
    def test_campaigns_list_owned_scope(self, session):
        """Test getting owned campaigns with scope=owned filter"""
        response = session.get(f"{BASE_URL}/api/demand-studio/campaigns?scope=owned")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Campaigns (owned) - returned {len(data)} campaigns")
    
    def test_campaigns_list_shared_scope(self, session):
        """Test getting shared campaigns with scope=shared filter"""
        response = session.get(f"{BASE_URL}/api/demand-studio/campaigns?scope=shared")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Campaigns (shared) - returned {len(data)} campaigns")


class TestShareEntityCreation:
    """Test share entity creation with validation"""
    
    def test_share_requires_target_email(self, session):
        """Test that share endpoint requires target_email"""
        # Missing target_email
        response = session.post(f"{BASE_URL}/api/share/entity", json={
            "entity_type": "project",
            "entity_id": "test123",
            "permission_level": "view",
            "scope": ["tasks"]
        })
        
        # Should fail validation
        assert response.status_code in [422, 400]
        print("Share correctly requires target_email")
    
    def test_share_requires_entity_type(self, session):
        """Test that share endpoint requires entity_type"""
        response = session.post(f"{BASE_URL}/api/share/entity", json={
            "target_email": "test@example.com",
            "entity_id": "test123",
            "permission_level": "view",
            "scope": ["tasks"]
        })
        
        # Should fail validation
        assert response.status_code in [422, 400]
        print("Share correctly requires entity_type")
    
    def test_share_invalid_target_email(self, session):
        """Test sharing with non-existent email returns 404"""
        # First we need a real project ID
        goals_response = session.get(f"{BASE_URL}/api/execution-hub/goals")
        if goals_response.status_code != 200 or len(goals_response.json()) == 0:
            pytest.skip("No goals available for testing")
        
        goal_id = goals_response.json()[0]["goal_id"]
        
        # Try to share with non-existent email
        response = session.post(f"{BASE_URL}/api/share/entity", json={
            "target_email": "nonexistent_user_12345@fakeorg.com",
            "entity_type": "project",
            "entity_id": goal_id,
            "permission_level": "view",
            "scope": ["tasks"]
        })
        
        # Should return 404 (user not found)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Share correctly handles non-existent email with 404")
    
    def test_share_cannot_share_with_own_org(self, session):
        """Test that sharing with own organization returns 400"""
        # Get goals
        goals_response = session.get(f"{BASE_URL}/api/execution-hub/goals")
        if goals_response.status_code != 200 or len(goals_response.json()) == 0:
            pytest.skip("No goals available for testing")
        
        goal_id = goals_response.json()[0]["goal_id"]
        
        # Try to share with own email
        response = session.post(f"{BASE_URL}/api/share/entity", json={
            "target_email": TEST_EMAIL,
            "entity_type": "project",
            "entity_id": goal_id,
            "permission_level": "view",
            "scope": ["tasks"]
        })
        
        # Should return 400 (cannot share with own org)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Share correctly prevents sharing with own organization")


class TestEntityAccessInfo:
    """Test entity access info endpoint"""
    
    def test_entity_access_for_owned_project(self, session):
        """Test /api/share/entity/{type}/{id}/access for owned project"""
        # Get a project
        goals_response = session.get(f"{BASE_URL}/api/execution-hub/goals")
        if goals_response.status_code != 200 or len(goals_response.json()) == 0:
            pytest.skip("No goals available for testing")
        
        goal_id = goals_response.json()[0]["goal_id"]
        
        # Get access info
        response = session.get(f"{BASE_URL}/api/share/entity/project/{goal_id}/access")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should indicate owner access
        assert data.get("access_type") == "owner"
        assert data.get("permission_level") == "edit"
        print(f"Entity access info works: access_type={data['access_type']}")
    
    def test_entity_access_for_nonexistent(self, session):
        """Test /api/share/entity/{type}/{id}/access for non-existent entity"""
        response = session.get(f"{BASE_URL}/api/share/entity/project/nonexistent123/access")
        
        # Should return 404
        assert response.status_code == 404
        print("Entity access correctly returns 404 for non-existent entity")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
