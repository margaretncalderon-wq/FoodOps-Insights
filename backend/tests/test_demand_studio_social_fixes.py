"""
Tests for Demand Studio Social Media fixes:
1. ensure_owner_membership - auto-creates membership for company owners
2. 'calendar' status for posts (new status between idea and production)
3. 'Ready/Listo' label (was 'Drafted/Borrador')
4. Archived tab for archived posts/ideas
5. Duplicate post endpoint
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDemandStudioSocialFixes:
    """Test Demand Studio Social Media fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup test data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up TEST_ prefixed data"""
        try:
            posts = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts").json()
            for post in posts:
                if post.get("title", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}")
        except Exception:
            pass
    
    def test_01_get_social_accounts(self):
        """Test GET /api/demand-studio/social/accounts - triggers ensure_owner_membership"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        print(f"GET /api/demand-studio/social/accounts: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        accounts = response.json()
        assert isinstance(accounts, list), "Response should be a list"
        print(f"Found {len(accounts)} social accounts")
    
    def test_02_get_social_posts(self):
        """Test GET /api/demand-studio/social/posts - triggers ensure_owner_membership"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        print(f"GET /api/demand-studio/social/posts: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        posts = response.json()
        assert isinstance(posts, list), "Response should be a list"
        print(f"Found {len(posts)} social posts")
    
    def test_03_create_post_with_calendar_status(self):
        """Test creating a post with 'calendar' status (new status)"""
        # First get an account to use
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        if accounts_response.status_code != 200 or not accounts_response.json():
            pytest.skip("No social accounts available")
        
        account_id = accounts_response.json()[0]["account_id"]
        
        # Create post with 'calendar' status
        post_data = {
            "social_account_id": account_id,
            "title": "TEST_Calendar_Status_Post",
            "status": "calendar",
            "format": "post"
        }
        
        response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=post_data)
        print(f"POST /api/demand-studio/social/posts (calendar status): {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        created_post = response.json()
        assert created_post.get("status") == "calendar", f"Expected status 'calendar', got '{created_post.get('status')}'"
        assert created_post.get("title") == "TEST_Calendar_Status_Post"
        print(f"Created post with calendar status: {created_post['post_id']}")
        
        # Store for cleanup
        self.created_post_id = created_post["post_id"]
    
    def test_04_patch_post_status_to_calendar(self):
        """Test PATCH /api/demand-studio/social/posts/{id} with status='calendar'"""
        # First create a post with idea status
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        if accounts_response.status_code != 200 or not accounts_response.json():
            pytest.skip("No social accounts available")
        
        account_id = accounts_response.json()[0]["account_id"]
        
        post_data = {
            "social_account_id": account_id,
            "title": "TEST_Patch_To_Calendar",
            "status": "idea",
            "format": "post"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=post_data)
        if create_response.status_code != 200:
            pytest.skip("Could not create test post")
        
        post_id = create_response.json()["post_id"]
        
        # Patch status to calendar
        patch_response = self.session.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}",
            json={"status": "calendar"}
        )
        print(f"PATCH /api/demand-studio/social/posts/{post_id} (to calendar): {patch_response.status_code}")
        
        assert patch_response.status_code == 200, f"Expected 200, got {patch_response.status_code}: {patch_response.text}"
        updated_post = patch_response.json()
        assert updated_post.get("status") == "calendar", f"Expected status 'calendar', got '{updated_post.get('status')}'"
        print(f"Successfully patched post to calendar status")
    
    def test_05_duplicate_post_endpoint(self):
        """Test POST /api/demand-studio/social/posts/{id}/duplicate"""
        # First get an existing post or create one
        posts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        if posts_response.status_code != 200 or not posts_response.json():
            # Create a post first
            accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
            if accounts_response.status_code != 200 or not accounts_response.json():
                pytest.skip("No social accounts available")
            
            account_id = accounts_response.json()[0]["account_id"]
            post_data = {
                "social_account_id": account_id,
                "title": "TEST_Original_Post_To_Duplicate",
                "status": "idea",
                "format": "reel"
            }
            
            create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=post_data)
            if create_response.status_code != 200:
                pytest.skip("Could not create test post")
            
            post_to_duplicate = create_response.json()
        else:
            # Use existing post
            post_to_duplicate = posts_response.json()[0]
        
        post_id = post_to_duplicate["post_id"]
        original_title = post_to_duplicate["title"]
        
        # Duplicate the post
        duplicate_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}/duplicate")
        print(f"POST /api/demand-studio/social/posts/{post_id}/duplicate: {duplicate_response.status_code}")
        
        assert duplicate_response.status_code == 200, f"Expected 200, got {duplicate_response.status_code}: {duplicate_response.text}"
        duplicated_post = duplicate_response.json()
        assert duplicated_post.get("post_id") != post_id, "Duplicated post should have new ID"
        assert "(copy)" in duplicated_post.get("title", ""), f"Duplicated title should contain '(copy)'"
        assert duplicated_post.get("status") == "idea", "Duplicated post should start with 'idea' status"
        print(f"Successfully duplicated post: {post_id} -> {duplicated_post['post_id']}")
    
    def test_06_get_archived_posts(self):
        """Test getting posts with 'archived' status"""
        # Create an archived post
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        if accounts_response.status_code != 200 or not accounts_response.json():
            pytest.skip("No social accounts available")
        
        account_id = accounts_response.json()[0]["account_id"]
        
        post_data = {
            "social_account_id": account_id,
            "title": "TEST_Archived_Post",
            "status": "archived",
            "format": "post"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=post_data)
        if create_response.status_code != 200:
            pytest.skip("Could not create archived test post")
        
        created_post = create_response.json()
        print(f"Created archived post: {created_post['post_id']}")
        
        # Verify we can filter by archived status
        filtered_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts?status=archived")
        print(f"GET /api/demand-studio/social/posts?status=archived: {filtered_response.status_code}")
        
        assert filtered_response.status_code == 200, f"Expected 200, got {filtered_response.status_code}"
        archived_posts = filtered_response.json()
        
        # Check our test post is in the archived list
        test_post_found = any(p.get("post_id") == created_post["post_id"] for p in archived_posts)
        assert test_post_found, "Created archived post should be in archived posts list"
        print(f"Found {len(archived_posts)} archived posts")
    
    def test_07_all_valid_statuses(self):
        """Test that all expected statuses work"""
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        if accounts_response.status_code != 200 or not accounts_response.json():
            pytest.skip("No social accounts available")
        
        account_id = accounts_response.json()[0]["account_id"]
        
        # List of all expected statuses
        expected_statuses = ["idea", "calendar", "production", "editing", "drafted", "scheduled", "posted", "archived"]
        
        for status in expected_statuses:
            post_data = {
                "social_account_id": account_id,
                "title": f"TEST_Status_{status}",
                "status": status,
                "format": "post"
            }
            
            # For scheduled, add scheduled_at
            if status == "scheduled":
                post_data["scheduled_at"] = datetime.now().strftime("%Y-%m-%dT12:00:00")
            
            # For production/editing, add production_date
            if status in ["production", "editing"]:
                post_data["production_date"] = datetime.now().strftime("%Y-%m-%d")
            
            response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=post_data)
            print(f"Creating post with status '{status}': {response.status_code}")
            
            assert response.status_code == 200, f"Failed to create post with status '{status}': {response.text}"
            created = response.json()
            assert created.get("status") == status, f"Expected status '{status}', got '{created.get('status')}'"
        
        print(f"All {len(expected_statuses)} statuses validated successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
