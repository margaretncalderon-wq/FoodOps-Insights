"""
Test Activity Log and Activity Feed org_id Support
Tests the new org_id parameter for viewing activity logs from shared organizations.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"
DEMO_ORG_ID = "company_3ab116c0994d"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for the test user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code}")
    data = response.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with authentication token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestActivityLogsEndpoint:
    """Tests for GET /api/activity-logs/ endpoint with org_id parameter"""
    
    def test_activity_logs_without_org_id_backwards_compatible(self, auth_headers):
        """Test that activity logs endpoint works without org_id (backwards compatible)"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Activity logs without org_id: {len(data)} logs returned")
    
    def test_activity_logs_with_org_id_parameter(self, auth_headers):
        """Test that activity logs endpoint accepts org_id parameter"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/?org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Activity logs with org_id={DEMO_ORG_ID}: {len(data)} logs returned")
    
    def test_activity_logs_with_module_filter(self, auth_headers):
        """Test activity logs with module filter and org_id"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/?module=demand_studio&org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Activity logs (demand_studio, org_id={DEMO_ORG_ID}): {len(data)} logs returned")
    
    def test_activity_logs_with_limit_parameter(self, auth_headers):
        """Test activity logs with limit parameter"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/?limit=10&org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        assert len(data) <= 10, "Should respect limit parameter"
        print(f"Activity logs limited to 10: {len(data)} logs returned")


class TestActivityLogsEntityHistory:
    """Tests for GET /api/activity-logs/entity/{type}/{id} endpoint with org_id parameter"""
    
    def test_entity_history_without_org_id(self, auth_headers):
        """Test entity history endpoint without org_id (backwards compatible)"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/entity/social_post/test-entity-id",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Entity history without org_id: {len(data)} logs returned")
    
    def test_entity_history_with_org_id_parameter(self, auth_headers):
        """Test entity history endpoint accepts org_id parameter"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/entity/social_post/test-entity-id?org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Entity history with org_id={DEMO_ORG_ID}: {len(data)} logs returned")


class TestActivityFeedEndpoint:
    """Tests for GET /api/activity-feed/recent endpoint with org_id parameter"""
    
    def test_activity_feed_without_org_id_backwards_compatible(self, auth_headers):
        """Test that activity feed endpoint works without org_id (backwards compatible)"""
        response = requests.get(
            f"{BASE_URL}/api/activity-feed/recent",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Activity feed without org_id: {len(data)} activities returned")
    
    def test_activity_feed_with_org_id_parameter(self, auth_headers):
        """Test that activity feed endpoint accepts org_id parameter"""
        response = requests.get(
            f"{BASE_URL}/api/activity-feed/recent?org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Activity feed with org_id={DEMO_ORG_ID}: {len(data)} activities returned")
    
    def test_activity_feed_with_limit_parameter(self, auth_headers):
        """Test activity feed with limit parameter and org_id"""
        response = requests.get(
            f"{BASE_URL}/api/activity-feed/recent?limit=5&org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        assert len(data) <= 5, "Should respect limit parameter"
        print(f"Activity feed limited to 5: {len(data)} activities returned")
    
    def test_activity_feed_with_days_parameter(self, auth_headers):
        """Test activity feed with days parameter and org_id"""
        response = requests.get(
            f"{BASE_URL}/api/activity-feed/recent?days=30&org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Activity feed (30 days, org_id={DEMO_ORG_ID}): {len(data)} activities returned")


class TestRegressionSocialEndpoints:
    """Regression tests for related social media endpoints"""
    
    def test_social_posts_endpoint(self, auth_headers):
        """Regression: GET /api/demand-studio/social/posts still works"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/posts",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Regression: /api/demand-studio/social/posts - PASS")
    
    def test_social_calendar_endpoint_with_org_id(self, auth_headers):
        """Regression: GET /api/demand-studio/social/calendar works with org_id"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date=2026-01-01&end_date=2026-01-31&org_id={DEMO_ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Regression: /api/demand-studio/social/calendar with org_id - PASS")
    
    def test_social_calendar_endpoint_without_org_id(self, auth_headers):
        """Regression: GET /api/demand-studio/social/calendar works without org_id (backwards compatible)"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date=2026-01-01&end_date=2026-01-31",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Regression: /api/demand-studio/social/calendar without org_id - PASS")
    
    def test_activity_modules_endpoint(self, auth_headers):
        """Test GET /api/activity-logs/modules endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/modules",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "modules" in data, "Expected modules in response"
        print(f"Activity modules: {len(data['modules'])} modules available")
    
    def test_activity_actions_endpoint(self, auth_headers):
        """Test GET /api/activity-logs/actions endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/activity-logs/actions",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "actions" in data, "Expected actions in response"
        print(f"Activity actions: {len(data['actions'])} actions available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
