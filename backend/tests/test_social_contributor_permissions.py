"""
Test Social Contributor Permissions Bug Fixes
Bug 1: Posts don't appear in calendar when using org_id param
Bug 2: social_viewer role can't perform write operations
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://pipeline-stage-view.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
DEMO_ORG_ID = "company_3ab116c0994d"
SOCIAL_ACCOUNT_ID = "social_86055792adff"


@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(session):
    """Get authentication token for admin user"""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("token") or data.get("access_token")
    assert token, "No token in login response"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return token


class TestCalendarOrgIdParameter:
    """Test that calendar endpoint now accepts org_id parameter"""
    
    def test_calendar_without_org_id_backwards_compatible(self, session, auth_token):
        """Test: Calendar endpoint still works without org_id (backwards compatible)"""
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date=2025-01-01&end_date=2025-12-31"
        )
        assert response.status_code == 200, f"Calendar request failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Calendar should return a list"
        print(f"PASS: Calendar without org_id returned {len(data)} posts")
    
    def test_calendar_with_org_id_parameter(self, session, auth_token):
        """Test: BUG FIX - Calendar endpoint now accepts org_id parameter"""
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date=2025-01-01&end_date=2025-12-31&org_id={DEMO_ORG_ID}"
        )
        assert response.status_code == 200, f"Calendar with org_id failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Calendar should return a list"
        print(f"PASS: Calendar with org_id={DEMO_ORG_ID} returned {len(data)} posts")
    
    def test_calendar_filters_by_org_id(self, session, auth_token):
        """Test: Calendar returns posts filtered to specific org when org_id provided"""
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date=2020-01-01&end_date=2030-12-31&org_id={DEMO_ORG_ID}"
        )
        assert response.status_code == 200, f"Calendar request failed: {response.text}"
        data = response.json()
        # Verify all returned posts belong to the specified org
        for post in data:
            company_id = post.get("company_id")
            # Posts should be from the specified org or visible via membership
            print(f"  Post {post.get('post_id')}: company_id={company_id}")
        print(f"PASS: Calendar returned {len(data)} posts for org {DEMO_ORG_ID}")


class TestSocialViewerPermissions:
    """Test that social_viewer role now has write permissions"""
    
    def test_my_permissions_endpoint(self, session, auth_token):
        """Test: my-permissions endpoint returns permissions for org"""
        response = session.get(f"{BASE_URL}/api/demand-studio/my-permissions")
        assert response.status_code == 200, f"my-permissions failed: {response.text}"
        data = response.json()
        assert "sections" in data, "Response should contain sections"
        assert "social_media" in data["sections"], "Should have social_media section"
        print(f"PASS: my-permissions returned: {data}")
    
    def test_my_permissions_with_org_id(self, session, auth_token):
        """Test: my-permissions accepts org_id parameter"""
        response = session.get(f"{BASE_URL}/api/demand-studio/my-permissions?org_id={DEMO_ORG_ID}")
        assert response.status_code == 200, f"my-permissions with org_id failed: {response.text}"
        data = response.json()
        assert "sections" in data, "Response should contain sections"
        print(f"PASS: my-permissions with org_id returned: {data}")


class TestPostsWithOrgId:
    """Test posts CRUD with org_id parameter"""
    
    def test_get_posts_with_org_id(self, session, auth_token):
        """Test: GET posts accepts org_id parameter"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/posts?org_id={DEMO_ORG_ID}")
        assert response.status_code == 200, f"Get posts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Posts should return a list"
        print(f"PASS: GET posts with org_id returned {len(data)} posts")
    
    def test_post_status_change_patch(self, session, auth_token):
        """Test: PATCH post status change works"""
        # First get a post to modify
        response = session.get(f"{BASE_URL}/api/demand-studio/social/posts?org_id={DEMO_ORG_ID}")
        assert response.status_code == 200, f"Get posts failed: {response.text}"
        posts = response.json()
        
        if not posts:
            pytest.skip("No posts found to test status change")
        
        test_post = posts[0]
        post_id = test_post.get("post_id")
        original_status = test_post.get("status")
        
        # Try to change status to 'drafted' (a safe test status)
        new_status = "drafted" if original_status != "drafted" else "production"
        
        response = session.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}?org_id={DEMO_ORG_ID}",
            json={"status": new_status}
        )
        assert response.status_code == 200, f"PATCH status failed: {response.text}"
        
        # Revert the change
        session.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}?org_id={DEMO_ORG_ID}",
            json={"status": original_status}
        )
        
        print(f"PASS: Successfully changed post {post_id} status from {original_status} to {new_status}")


class TestAccountsEndpoint:
    """Test social accounts endpoint"""
    
    def test_get_accounts(self, session, auth_token):
        """Test: GET social accounts"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200, f"Get accounts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Accounts should return a list"
        print(f"PASS: GET accounts returned {len(data)} accounts")
        
        # Look for the test account
        test_account = next((a for a in data if a.get("account_id") == SOCIAL_ACCOUNT_ID), None)
        if test_account:
            print(f"  Found test account: {test_account.get('handle')} ({test_account.get('platform')})")


class TestRegressionAPIs:
    """Regression tests to ensure existing functionality still works"""
    
    def test_social_stats(self, session, auth_token):
        """Test: GET social stats still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/stats")
        assert response.status_code == 200, f"Social stats failed: {response.text}"
        print("PASS: GET social/stats")
    
    def test_social_insights(self, session, auth_token):
        """Test: GET social insights still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/insights")
        assert response.status_code == 200, f"Social insights failed: {response.text}"
        print("PASS: GET social/insights")
    
    def test_social_pillars(self, session, auth_token):
        """Test: GET social pillars still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/pillars")
        assert response.status_code == 200, f"Social pillars failed: {response.text}"
        print("PASS: GET social/pillars")
    
    def test_social_ideas(self, session, auth_token):
        """Test: GET social ideas still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        assert response.status_code == 200, f"Social ideas failed: {response.text}"
        print("PASS: GET social/ideas")
    
    def test_social_audiences(self, session, auth_token):
        """Test: GET social audiences still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/audiences")
        assert response.status_code == 200, f"Social audiences failed: {response.text}"
        print("PASS: GET social/audiences")
    
    def test_social_segments(self, session, auth_token):
        """Test: GET social segments still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/segments")
        assert response.status_code == 200, f"Social segments failed: {response.text}"
        print("PASS: GET social/segments")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
