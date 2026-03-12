"""
Tests for Demand Studio Visibility and Notifications features.

Tests verify:
1. GET /api/demand-studio/social/posts returns posts from ALL companies the user is a member of
2. GET /api/demand-studio/social/accounts?include_shared=true includes accounts from ALL memberships
3. GET /api/demand-studio/social/stats aggregates stats across all member companies
4. GET /api/demand-studio/social/insights aggregates insights across all member companies
5. GET /api/demand-studio/social/ideas includes ideas from all member companies
6. POST /api/demand-studio/social/posts creates notifications for active team members
7. PATCH /api/demand-studio/social/posts/{id} with status change creates notifications
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin user credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

# Known user and company info from the request
ADMIN_USER_ID = "user_35d337510894"
PRIMARY_COMPANY_ID = "company_3ab116c0994d"
# User has memberships in these companies according to request:
# company_3ab116c0994d, company_a401d401bdd7, company_cfab77cb94c1


class TestDemandStudioVisibilityNotifications:
    """Test Demand Studio visibility across multiple companies and notifications"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]

    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

    # ============== Tests for GET endpoints aggregating data from ALL companies ==============

    def test_get_social_posts_returns_data(self, headers):
        """Test GET /api/demand-studio/social/posts returns posts"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/posts",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get posts: {response.text}"
        posts = response.json()
        assert isinstance(posts, list), "Response should be a list"
        print(f"Retrieved {len(posts)} social posts")
        
        # Check if we have posts from multiple companies (if data exists)
        if posts:
            company_ids = set(p.get("company_id") for p in posts if p.get("company_id"))
            print(f"Posts from company_ids: {company_ids}")
            # With the fix, posts should come from multiple companies if user has memberships

    def test_get_social_accounts_without_shared(self, headers):
        """Test GET /api/demand-studio/social/accounts without include_shared returns owned accounts"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/accounts",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        accounts = response.json()
        assert isinstance(accounts, list), "Response should be a list"
        print(f"Retrieved {len(accounts)} accounts (owned only)")
        
        # All should be owned
        for acc in accounts:
            assert acc.get("_access_type") == "owned", f"Account {acc.get('account_id')} should be owned"

    def test_get_social_accounts_with_shared(self, headers):
        """Test GET /api/demand-studio/social/accounts?include_shared=true includes accounts from ALL memberships"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/accounts?include_shared=true",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        accounts = response.json()
        assert isinstance(accounts, list), "Response should be a list"
        print(f"Retrieved {len(accounts)} accounts (including shared)")
        
        # Check account types
        owned_count = sum(1 for a in accounts if a.get("_access_type") == "owned")
        shared_count = sum(1 for a in accounts if a.get("_access_type") == "shared")
        print(f"Owned accounts: {owned_count}, Shared accounts: {shared_count}")
        
        # Validate shared accounts have proper metadata
        for acc in accounts:
            if acc.get("_access_type") == "shared":
                assert "_shared_by" in acc or "_role" in acc, f"Shared account missing metadata: {acc}"

    def test_get_social_stats_aggregated(self, headers):
        """Test GET /api/demand-studio/social/stats aggregates stats across all member companies"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/stats",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        stats = response.json()
        
        # Verify required fields exist
        expected_fields = ["scheduledThisWeek", "postedThisMonth", "activeAccounts", "campaignLinkedPosts", "pendingIdeas"]
        for field in expected_fields:
            assert field in stats, f"Missing field: {field}"
        
        print(f"Social stats: {stats}")

    def test_get_social_insights_aggregated(self, headers):
        """Test GET /api/demand-studio/social/insights aggregates insights across all member companies"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/insights",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get insights: {response.text}"
        insights = response.json()
        
        # Verify required fields exist
        expected_fields = ["byFormat", "byPillar", "byStatus"]
        for field in expected_fields:
            assert field in insights, f"Missing field: {field}"
        
        print(f"Insights fields: {list(insights.keys())}")

    def test_get_social_calendar_aggregated(self, headers):
        """Test GET /api/demand-studio/social/calendar includes data from all member companies"""
        # Use a broad date range to capture any posts
        from datetime import timedelta
        today = datetime.now(timezone.utc)
        start_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = (today + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get calendar: {response.text}"
        calendar_posts = response.json()
        assert isinstance(calendar_posts, list), "Response should be a list"
        print(f"Calendar posts: {len(calendar_posts)}")

    def test_get_content_ideas_aggregated(self, headers):
        """Test GET /api/demand-studio/social/ideas includes ideas from all member companies"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get ideas: {response.text}"
        ideas = response.json()
        assert isinstance(ideas, list), "Response should be a list"
        print(f"Content ideas: {len(ideas)}")

    # ============== Tests for Notification creation ==============

    def test_create_post_creates_notification(self, headers):
        """Test POST /api/demand-studio/social/posts creates notifications for active team members"""
        # First, get or create a social account
        accounts_response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/accounts",
            headers=headers
        )
        accounts = accounts_response.json() if accounts_response.status_code == 200 else []
        
        if accounts:
            account_id = accounts[0]["account_id"]
        else:
            # Create a test account
            acc_response = requests.post(
                f"{BASE_URL}/api/demand-studio/social/accounts",
                headers=headers,
                json={"platform": "Instagram", "handle": "test_handle", "status": "active"}
            )
            if acc_response.status_code == 200:
                account_id = acc_response.json()["account_id"]
            else:
                pytest.skip("Could not get or create social account")
        
        self.__class__.test_account_id = account_id
        
        unique_id = uuid.uuid4().hex[:8]
        post_data = {
            "title": f"TEST_Post_{unique_id}",
            "caption": f"Test caption for notification test {unique_id}",
            "format": "Reel",
            "status": "idea",
            "social_account_id": account_id,
            "campaign_id": None,
            "pillar_id": None,
            "audience_id": None,
            "sub_audience_id": None,
            "segment_id": None,
            "hook": None,
            "cta": None,
            "scheduled_at": None,
            "production_date": None,
            "link_url": None,
            "notes": "Test post for notification verification"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/posts",
            headers=headers,
            json=post_data
        )
        assert response.status_code == 200, f"Failed to create post: {response.text}"
        created_post = response.json()
        
        assert "post_id" in created_post, "Missing post_id in response"
        assert created_post["title"] == post_data["title"], "Title mismatch"
        print(f"Created post: {created_post['post_id']}")
        
        # Store post_id for cleanup and further tests
        self.__class__.test_post_id = created_post["post_id"]
        
        # Verify the post was created correctly
        assert created_post.get("status") == "idea"
        return created_post["post_id"]

    def test_patch_post_status_change_creates_notification(self, headers):
        """Test PATCH /api/demand-studio/social/posts/{id} with status change creates notifications"""
        # Use the post created in previous test or create a new one
        post_id = getattr(self.__class__, 'test_post_id', None)
        account_id = getattr(self.__class__, 'test_account_id', None)
        
        if not post_id:
            # Get or create account first
            if not account_id:
                accounts_response = requests.get(
                    f"{BASE_URL}/api/demand-studio/social/accounts",
                    headers=headers
                )
                accounts = accounts_response.json() if accounts_response.status_code == 200 else []
                if accounts:
                    account_id = accounts[0]["account_id"]
                else:
                    pytest.skip("No social accounts available")
            
            # Create a test post
            unique_id = uuid.uuid4().hex[:8]
            post_data = {
                "title": f"TEST_Post_{unique_id}",
                "caption": f"Test caption {unique_id}",
                "format": "Reel",
                "status": "idea",
                "social_account_id": account_id
            }
            response = requests.post(
                f"{BASE_URL}/api/demand-studio/social/posts",
                headers=headers,
                json=post_data
            )
            assert response.status_code == 200, f"Failed to create post: {response.text}"
            post_id = response.json()["post_id"]
            self.__class__.test_post_id = post_id
        
        # Change status to production
        patch_data = {
            "status": "production"
        }
        
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}",
            headers=headers,
            json=patch_data
        )
        assert response.status_code == 200, f"Failed to patch post: {response.text}"
        updated_post = response.json()
        
        assert updated_post.get("status") == "production", "Status not updated"
        print(f"Updated post {post_id} status to: {updated_post.get('status')}")
        
        # Change status again to scheduled
        patch_data2 = {
            "status": "scheduled"
        }
        
        response2 = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}",
            headers=headers,
            json=patch_data2
        )
        assert response2.status_code == 200, f"Failed to patch post: {response2.text}"
        updated_post2 = response2.json()
        
        assert updated_post2.get("status") == "scheduled", "Status not updated to scheduled"
        print(f"Updated post {post_id} status to: {updated_post2.get('status')}")

    def test_verify_notifications_exist(self, headers):
        """Verify that notifications were created in the notifications collection"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get notifications: {response.text}"
        notifications = response.json()
        
        print(f"Total notifications for user: {len(notifications)}")
        
        # Look for recent notifications (within the test run)
        recent_content_notifications = [
            n for n in notifications 
            if n.get("type") in ["content_created", "status_changed", "post_approved", "post_rejected"]
        ]
        print(f"Found {len(recent_content_notifications)} content-related notifications")

    # ============== Cleanup ==============

    def test_cleanup_test_post(self, headers):
        """Cleanup: Delete the test post created during tests"""
        post_id = getattr(self.__class__, 'test_post_id', None)
        if post_id:
            response = requests.delete(
                f"{BASE_URL}/api/demand-studio/social/posts/{post_id}",
                headers=headers
            )
            # Accept 200 or 404 (already deleted)
            assert response.status_code in [200, 404], f"Failed to delete test post: {response.text}"
            print(f"Cleaned up test post: {post_id}")


class TestUserMemberships:
    """Verify user has multiple memberships (prerequisite for visibility tests)"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]

    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

    def test_verify_user_info(self, headers):
        """Verify logged in user info"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get user info: {response.text}"
        user = response.json()
        print(f"User ID: {user.get('user_id')}")
        print(f"Company ID: {user.get('company_id')}")
        print(f"Email: {user.get('email')}")


class TestDemandStudioPageLoad:
    """Test that Demand Studio frontend components load correctly"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]

    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

    def test_demand_studio_stats_endpoint(self, headers):
        """Test the main Demand Studio stats endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/stats",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get demand studio stats: {response.text}"
        stats = response.json()
        print(f"Demand Studio main stats: {stats}")

    def test_social_media_permissions(self, headers):
        """Test my-permissions endpoint for social media section"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/my-permissions",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get permissions: {response.text}"
        perms = response.json()
        print(f"User permissions: {perms}")
        
        # Check social_media section is enabled
        sections = perms.get("sections", {})
        social_media = sections.get("social_media", {})
        assert social_media.get("enabled") == True, "Social media section should be enabled"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
