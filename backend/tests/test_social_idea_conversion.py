"""
Test Social Media Idea to Post Conversion - Bug Fix Verification
Tests for:
1. POST /api/demand-studio/social/ideas/{id}/convert-to-post with target_status param
2. Converted post preserves link_url from idea's source_url
3. Converted post has correct status (not 'idea')
4. Regression: GET /api/demand-studio/social/ideas works
5. Regression: GET /api/demand-studio/social/posts works
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSocialIdeaConversion:
    """Test idea to post conversion with bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "demo.agency@kora.com",
                "password": "Evoque2024!"
            }
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.auth_token = login_response.json().get("access_token")
        if self.auth_token:
            self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
        
        # Store created IDs for cleanup
        self.created_idea_ids = []
        self.created_post_ids = []
        
        yield
        
        # Cleanup
        for idea_id in self.created_idea_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}")
            except:
                pass
        for post_id in self.created_post_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}")
            except:
                pass
    
    def test_regression_get_ideas(self):
        """Regression: GET /api/demand-studio/social/ideas returns 200"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        assert response.status_code == 200, f"GET ideas failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Ideas response should be a list"
        print(f"[PASS] GET /api/demand-studio/social/ideas returned {len(data)} ideas")
    
    def test_regression_get_posts(self):
        """Regression: GET /api/demand-studio/social/posts returns 200"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert response.status_code == 200, f"GET posts failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Posts response should be a list"
        print(f"[PASS] GET /api/demand-studio/social/posts returned {len(data)} posts")
    
    def test_regression_get_accounts(self):
        """Regression: GET /api/demand-studio/social/accounts returns 200"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200, f"GET accounts failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Accounts response should be a list"
        print(f"[PASS] GET /api/demand-studio/social/accounts returned {len(data)} accounts")
        return data
    
    def test_create_idea_with_source_url(self):
        """Create an idea with source_url field"""
        unique_id = uuid.uuid4().hex[:8]
        idea_data = {
            "title": f"TEST_idea_{unique_id}",
            "description": "Test idea description for conversion",
            "source_url": f"https://example.com/inspiration/{unique_id}",
            "pillar_id": "",
            "tags": ["test", "conversion"],
            "status": "approved"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            json=idea_data
        )
        assert response.status_code == 200 or response.status_code == 201, f"Create idea failed: {response.status_code} - {response.text}"
        
        idea = response.json()
        self.created_idea_ids.append(idea["idea_id"])
        
        # Verify idea was created with source_url
        assert idea["title"] == idea_data["title"], "Idea title mismatch"
        assert idea.get("source_url") == idea_data["source_url"], f"source_url not saved: expected {idea_data['source_url']}, got {idea.get('source_url')}"
        
        print(f"[PASS] Created idea {idea['idea_id']} with source_url: {idea.get('source_url')}")
        return idea
    
    def test_convert_idea_to_post_with_target_status_production(self):
        """Bug fix: Convert idea to post with target_status=production should create post with status='production'"""
        # Get an account
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        if not accounts:
            pytest.skip("No social accounts available for test")
        account_id = accounts[0]["account_id"]
        
        # Create idea with source_url
        unique_id = uuid.uuid4().hex[:8]
        idea_data = {
            "title": f"TEST_convert_production_{unique_id}",
            "description": "Test conversion to production",
            "source_url": f"https://example.com/source/{unique_id}",
            "tags": ["test"],
            "status": "approved"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            json=idea_data
        )
        assert create_response.status_code in [200, 201], f"Create idea failed: {create_response.text}"
        idea = create_response.json()
        self.created_idea_ids.append(idea["idea_id"])
        
        # Convert with target_status=production
        convert_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}/convert-to-post?social_account_id={account_id}&target_status=production"
        )
        assert convert_response.status_code == 200, f"Convert idea failed: {convert_response.status_code} - {convert_response.text}"
        
        post = convert_response.json()
        self.created_post_ids.append(post["post_id"])
        
        # BUG FIX VERIFICATION: Post status should be 'production', NOT 'idea'
        assert post["status"] == "production", f"[BUG] Post status is '{post['status']}' but should be 'production'"
        
        # BUG FIX VERIFICATION: Post link_url should be preserved from idea's source_url
        assert post.get("link_url") == idea_data["source_url"], f"[BUG] Post link_url is '{post.get('link_url')}' but should be '{idea_data['source_url']}'"
        
        print(f"[PASS] Converted idea to post with status='production' and link_url preserved")
        print(f"  - Post ID: {post['post_id']}")
        print(f"  - Post status: {post['status']}")
        print(f"  - Post link_url: {post.get('link_url')}")
        return post
    
    def test_convert_idea_to_post_with_target_status_editing(self):
        """Bug fix: Convert idea to post with target_status=editing should create post with status='editing'"""
        # Get an account
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        if not accounts:
            pytest.skip("No social accounts available for test")
        account_id = accounts[0]["account_id"]
        
        # Create idea
        unique_id = uuid.uuid4().hex[:8]
        idea_data = {
            "title": f"TEST_convert_editing_{unique_id}",
            "description": "Test conversion to editing",
            "source_url": f"https://example.com/edit/{unique_id}",
            "tags": ["test"],
            "status": "approved"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            json=idea_data
        )
        assert create_response.status_code in [200, 201], f"Create idea failed: {create_response.text}"
        idea = create_response.json()
        self.created_idea_ids.append(idea["idea_id"])
        
        # Convert with target_status=editing
        convert_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}/convert-to-post?social_account_id={account_id}&target_status=editing"
        )
        assert convert_response.status_code == 200, f"Convert idea failed: {convert_response.status_code} - {convert_response.text}"
        
        post = convert_response.json()
        self.created_post_ids.append(post["post_id"])
        
        # BUG FIX VERIFICATION: Post status should be 'editing'
        assert post["status"] == "editing", f"[BUG] Post status is '{post['status']}' but should be 'editing'"
        
        # BUG FIX VERIFICATION: Post link_url preserved
        assert post.get("link_url") == idea_data["source_url"], f"[BUG] Post link_url not preserved"
        
        print(f"[PASS] Converted idea to post with status='editing' and link_url preserved")
        return post
    
    def test_convert_idea_default_status_is_production(self):
        """Test that default target_status is 'production' when not specified"""
        # Get an account
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        if not accounts:
            pytest.skip("No social accounts available for test")
        account_id = accounts[0]["account_id"]
        
        # Create idea
        unique_id = uuid.uuid4().hex[:8]
        idea_data = {
            "title": f"TEST_convert_default_{unique_id}",
            "description": "Test default status",
            "status": "approved"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            json=idea_data
        )
        idea = create_response.json()
        self.created_idea_ids.append(idea["idea_id"])
        
        # Convert WITHOUT specifying target_status (should default to production)
        convert_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}/convert-to-post?social_account_id={account_id}"
        )
        assert convert_response.status_code == 200, f"Convert failed: {convert_response.text}"
        
        post = convert_response.json()
        self.created_post_ids.append(post["post_id"])
        
        # Default should be 'production' not 'idea'
        assert post["status"] == "production", f"Default status is '{post['status']}' but should be 'production'"
        print(f"[PASS] Default target_status is 'production'")
        return post
    
    def test_idea_marked_as_used_after_conversion(self):
        """Verify idea is marked as 'used' after conversion"""
        # Get an account
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        if not accounts:
            pytest.skip("No social accounts available for test")
        account_id = accounts[0]["account_id"]
        
        # Create idea
        unique_id = uuid.uuid4().hex[:8]
        idea_data = {
            "title": f"TEST_mark_used_{unique_id}",
            "description": "Test marking as used",
            "status": "approved"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            json=idea_data
        )
        idea = create_response.json()
        self.created_idea_ids.append(idea["idea_id"])
        
        # Convert
        convert_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}/convert-to-post?social_account_id={account_id}&target_status=production"
        )
        post = convert_response.json()
        self.created_post_ids.append(post["post_id"])
        
        # Verify idea is now marked as 'used'
        ideas_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        ideas = ideas_response.json()
        
        converted_idea = next((i for i in ideas if i["idea_id"] == idea["idea_id"]), None)
        if converted_idea:
            assert converted_idea["status"] == "used", f"Idea status is '{converted_idea['status']}' but should be 'used'"
            print(f"[PASS] Idea marked as 'used' after conversion")
        else:
            print(f"[INFO] Idea might be filtered from list after conversion")
    
    def test_get_post_shows_link_url(self):
        """Verify converted post shows link_url when fetched"""
        # Get an account
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        if not accounts:
            pytest.skip("No social accounts available for test")
        account_id = accounts[0]["account_id"]
        
        # Create idea with source_url
        unique_id = uuid.uuid4().hex[:8]
        source_url = f"https://example.com/verify/{unique_id}"
        idea_data = {
            "title": f"TEST_verify_link_{unique_id}",
            "description": "Verify link_url persisted",
            "source_url": source_url,
            "status": "approved"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas",
            json=idea_data
        )
        idea = create_response.json()
        self.created_idea_ids.append(idea["idea_id"])
        
        # Convert
        convert_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}/convert-to-post?social_account_id={account_id}&target_status=production"
        )
        post = convert_response.json()
        self.created_post_ids.append(post["post_id"])
        
        # Fetch all posts and find our converted post
        posts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        posts = posts_response.json()
        
        found_post = next((p for p in posts if p["post_id"] == post["post_id"]), None)
        assert found_post is not None, f"Converted post {post['post_id']} not found in posts list"
        assert found_post.get("link_url") == source_url, f"link_url not preserved in GET response: expected '{source_url}', got '{found_post.get('link_url')}'"
        
        print(f"[PASS] GET posts shows link_url: {found_post.get('link_url')}")
        return found_post


class TestRegressionBusinessClarity:
    """Regression test for business clarity department report"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "demo.agency@kora.com",
                "password": "Evoque2024!"
            }
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.auth_token = login_response.json().get("access_token")
        if self.auth_token:
            self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
        
        yield
    
    def test_regression_department_report(self):
        """Regression: GET /api/business-clarity/reports/by-department still works"""
        response = self.session.get(f"{BASE_URL}/api/business-clarity/reports/by-department")
        assert response.status_code == 200, f"Department report failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "records" in data or "summary" in data, "Department report missing expected structure"
        print(f"[PASS] GET /api/business-clarity/reports/by-department works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
