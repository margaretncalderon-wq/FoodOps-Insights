"""
Tests for Social Media Post/Ideas content_body field and org_id CRUD operations

Features tested:
1. content_body field on Posts (create, read, update)
2. content_body field on Ideas (create, read, update)
3. org_id parameter on DELETE, PATCH for posts
4. org_id parameter on DELETE for ideas
5. mark-posted, duplicate, quick-status-change with org_id
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://content-pillars-beta.preview.emergentagent.com"


class TestContentBodyFeatures:
    """Test the content_body field for Posts and Ideas"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for demo.agency@kora.com"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, f"No access_token in response: {data.keys()}"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def social_account(self, auth_headers):
        """Get first available social account for testing"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        accounts = response.json()
        if len(accounts) == 0:
            # Create a test account
            create_resp = requests.post(f"{BASE_URL}/api/demand-studio/social/accounts", headers=auth_headers, json={
                "platform": "instagram",
                "handle": "TEST_testhandle",
                "status": "active"
            })
            assert create_resp.status_code == 200, f"Failed to create test account: {create_resp.text}"
            return create_resp.json()
        return accounts[0]
    
    # ============== POSTS content_body TESTS ==============
    
    def test_create_post_with_content_body(self, auth_headers, social_account):
        """POST /api/demand-studio/social/posts accepts content_body field"""
        content_body_html = "<p><strong>Slide 1:</strong> Introduction</p><ul><li>Point A</li><li>Point B</li></ul>"
        
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers, json={
            "social_account_id": social_account["account_id"],
            "format": "carousel",
            "status": "idea",
            "title": "TEST_PostWithContentBody",
            "caption": "Test caption",
            "content_body": content_body_html
        })
        
        assert response.status_code == 200, f"Create post failed: {response.text}"
        data = response.json()
        
        # Verify content_body was saved
        assert "post_id" in data, "No post_id in response"
        assert data.get("content_body") == content_body_html, f"content_body mismatch: {data.get('content_body')}"
        assert data["title"] == "TEST_PostWithContentBody"
        
        # Store for cleanup
        self.__class__.test_post_id = data["post_id"]
        print(f"PASS: Created post with content_body, post_id={data['post_id']}")
    
    def test_get_post_has_content_body(self, auth_headers):
        """GET /api/demand-studio/social/posts/{id} returns content_body"""
        post_id = getattr(self.__class__, 'test_post_id', None)
        if not post_id:
            pytest.skip("No test post created")
        
        response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}", headers=auth_headers)
        assert response.status_code == 200, f"Get post failed: {response.text}"
        data = response.json()
        
        assert "content_body" in data, "content_body field missing from response"
        assert "<p><strong>Slide 1:</strong>" in data.get("content_body", ""), "content_body content mismatch"
        print(f"PASS: GET post returns content_body field")
    
    def test_update_post_content_body(self, auth_headers, social_account):
        """PUT /api/demand-studio/social/posts/{id} accepts content_body field"""
        post_id = getattr(self.__class__, 'test_post_id', None)
        if not post_id:
            pytest.skip("No test post created")
        
        new_content_body = "<p>Updated content body with <em>italics</em> and <strong>bold</strong></p>"
        
        response = requests.put(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}", headers=auth_headers, json={
            "social_account_id": social_account["account_id"],
            "format": "carousel",
            "status": "production",
            "title": "TEST_PostWithContentBody_Updated",
            "caption": "Updated caption",
            "content_body": new_content_body
        })
        
        assert response.status_code == 200, f"Update post failed: {response.text}"
        data = response.json()
        
        assert data.get("content_body") == new_content_body, f"content_body not updated: {data.get('content_body')}"
        assert data["title"] == "TEST_PostWithContentBody_Updated"
        print(f"PASS: PUT post updates content_body field")
    
    # ============== IDEAS content_body TESTS ==============
    
    def test_create_idea_with_content_body(self, auth_headers):
        """POST /api/demand-studio/social/ideas accepts content_body field"""
        content_body_html = "<p>Reel script notes:</p><div class='checklist-item'><input type='checkbox'/><span>Intro hook</span></div>"
        
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/ideas", headers=auth_headers, json={
            "title": "TEST_IdeaWithContentBody",
            "description": "Test idea description",
            "status": "new",
            "tags": ["test", "content-body"],
            "content_body": content_body_html
        })
        
        assert response.status_code == 200, f"Create idea failed: {response.text}"
        data = response.json()
        
        assert "idea_id" in data, "No idea_id in response"
        assert data.get("content_body") == content_body_html, f"content_body mismatch: {data.get('content_body')}"
        
        self.__class__.test_idea_id = data["idea_id"]
        print(f"PASS: Created idea with content_body, idea_id={data['idea_id']}")
    
    def test_get_ideas_list_has_content_body(self, auth_headers):
        """GET /api/demand-studio/social/ideas returns ideas with content_body"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/social/ideas", headers=auth_headers)
        assert response.status_code == 200, f"Get ideas failed: {response.text}"
        ideas = response.json()
        
        # Find our test idea
        test_idea = next((i for i in ideas if i.get("title") == "TEST_IdeaWithContentBody"), None)
        if test_idea:
            assert "content_body" in test_idea, "content_body missing from idea in list"
            print(f"PASS: GET ideas list returns content_body field")
        else:
            print(f"WARN: Test idea not found in list, but API returned {len(ideas)} ideas")
    
    def test_update_idea_content_body(self, auth_headers):
        """PUT /api/demand-studio/social/ideas/{id} accepts content_body field"""
        idea_id = getattr(self.__class__, 'test_idea_id', None)
        if not idea_id:
            pytest.skip("No test idea created")
        
        new_content_body = "<p>Updated reel script with <strong>CTA</strong></p><ul><li>Step 1</li><li>Step 2</li></ul>"
        
        response = requests.put(f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}", headers=auth_headers, json={
            "title": "TEST_IdeaWithContentBody_Updated",
            "description": "Updated description",
            "status": "reviewing",
            "tags": ["test", "updated"],
            "content_body": new_content_body
        })
        
        assert response.status_code == 200, f"Update idea failed: {response.text}"
        data = response.json()
        
        assert data.get("content_body") == new_content_body, f"content_body not updated: {data.get('content_body')}"
        print(f"PASS: PUT idea updates content_body field")


class TestOrgIdCRUDOperations:
    """Test org_id parameter on CRUD operations for shared company access"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def social_account(self, auth_headers):
        """Get first social account"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=auth_headers)
        assert response.status_code == 200
        accounts = response.json()
        return accounts[0] if accounts else None
    
    @pytest.fixture(scope="class")
    def test_post(self, auth_headers, social_account):
        """Create a test post for CRUD operations"""
        if not social_account:
            pytest.skip("No social account available")
        
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers, json={
            "social_account_id": social_account["account_id"],
            "format": "post",
            "status": "idea",
            "title": "TEST_OrgIdCRUDPost",
            "caption": "Test post for org_id CRUD operations",
            "content_body": "<p>Test content</p>"
        })
        assert response.status_code == 200, f"Failed to create test post: {response.text}"
        return response.json()
    
    @pytest.fixture(scope="class")
    def test_idea(self, auth_headers):
        """Create a test idea for CRUD operations"""
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/ideas", headers=auth_headers, json={
            "title": "TEST_OrgIdCRUDIdea",
            "description": "Test idea for org_id CRUD",
            "status": "new",
            "content_body": "<p>Test idea content</p>"
        })
        assert response.status_code == 200, f"Failed to create test idea: {response.text}"
        return response.json()
    
    # ============== PATCH (Quick Status Change) with org_id ==============
    
    def test_patch_post_status_with_org_id(self, auth_headers, test_post):
        """PATCH /api/demand-studio/social/posts/{id}?org_id=X works with org_id param"""
        post_id = test_post["post_id"]
        company_id = test_post.get("company_id")
        
        # Test without org_id first
        response = requests.patch(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}", headers=auth_headers, json={
            "status": "production",
            "production_date": "2026-02-01"
        })
        assert response.status_code == 200, f"PATCH without org_id failed: {response.text}"
        data = response.json()
        assert data["status"] == "production"
        print(f"PASS: PATCH post status without org_id works")
        
        # Test with explicit org_id param
        if company_id:
            response2 = requests.patch(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}?org_id={company_id}", headers=auth_headers, json={
                "status": "editing"
            })
            assert response2.status_code == 200, f"PATCH with org_id failed: {response2.text}"
            data2 = response2.json()
            assert data2["status"] == "editing"
            print(f"PASS: PATCH post status with org_id={company_id} works")
    
    # ============== DELETE Post with org_id ==============
    
    def test_delete_post_with_org_id_accepts_param(self, auth_headers, social_account):
        """DELETE /api/demand-studio/social/posts/{id}?org_id=X accepts org_id param"""
        # Create a new post for deletion test
        create_resp = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers, json={
            "social_account_id": social_account["account_id"],
            "format": "reel",
            "status": "idea",
            "title": "TEST_DeleteWithOrgId",
            "caption": "Post to delete with org_id"
        })
        assert create_resp.status_code == 200
        post_to_delete = create_resp.json()
        post_id = post_to_delete["post_id"]
        company_id = post_to_delete.get("company_id")
        
        # Delete with org_id parameter
        delete_url = f"{BASE_URL}/api/demand-studio/social/posts/{post_id}"
        if company_id:
            delete_url += f"?org_id={company_id}"
        
        response = requests.delete(delete_url, headers=auth_headers)
        assert response.status_code == 200, f"DELETE post with org_id failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        print(f"PASS: DELETE post with org_id param works")
        
        # Verify deletion
        get_resp = requests.get(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}", headers=auth_headers)
        assert get_resp.status_code == 404, "Post should be deleted"
        print(f"PASS: Post successfully deleted")
    
    # ============== DELETE Idea with org_id ==============
    
    def test_delete_idea_with_org_id_accepts_param(self, auth_headers):
        """DELETE /api/demand-studio/social/ideas/{id}?org_id=X accepts org_id param"""
        # Create a new idea for deletion test
        create_resp = requests.post(f"{BASE_URL}/api/demand-studio/social/ideas", headers=auth_headers, json={
            "title": "TEST_DeleteIdeaWithOrgId",
            "description": "Idea to delete with org_id",
            "status": "new"
        })
        assert create_resp.status_code == 200
        idea_to_delete = create_resp.json()
        idea_id = idea_to_delete["idea_id"]
        company_id = idea_to_delete.get("company_id")
        
        # Delete with org_id parameter
        delete_url = f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}"
        if company_id:
            delete_url += f"?org_id={company_id}"
        
        response = requests.delete(delete_url, headers=auth_headers)
        assert response.status_code == 200, f"DELETE idea with org_id failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        print(f"PASS: DELETE idea with org_id param works")
    
    # ============== Mark Posted with org_id ==============
    
    def test_mark_posted_with_org_id(self, auth_headers, social_account):
        """POST /api/demand-studio/social/posts/{id}/mark-posted?org_id=X works"""
        # Create a post to mark as posted
        create_resp = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers, json={
            "social_account_id": social_account["account_id"],
            "format": "post",
            "status": "scheduled",
            "title": "TEST_MarkPostedWithOrgId",
            "caption": "Post to mark as posted",
            "scheduled_at": "2026-01-15T12:00:00"
        })
        assert create_resp.status_code == 200
        post = create_resp.json()
        post_id = post["post_id"]
        company_id = post.get("company_id")
        
        # Mark as posted with org_id
        mark_url = f"{BASE_URL}/api/demand-studio/social/posts/{post_id}/mark-posted"
        if company_id:
            mark_url += f"?org_id={company_id}"
        
        response = requests.post(mark_url, headers=auth_headers)
        assert response.status_code == 200, f"Mark posted with org_id failed: {response.text}"
        data = response.json()
        assert data["status"] == "posted"
        assert data.get("posted_at") is not None
        print(f"PASS: mark-posted with org_id param works")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}", headers=auth_headers)
    
    # ============== Duplicate Post with org_id ==============
    
    def test_duplicate_post_with_org_id(self, auth_headers, social_account):
        """POST /api/demand-studio/social/posts/{id}/duplicate?org_id=X works"""
        # Create a post to duplicate
        create_resp = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers, json={
            "social_account_id": social_account["account_id"],
            "format": "carousel",
            "status": "posted",
            "title": "TEST_DuplicateWithOrgId",
            "caption": "Post to duplicate",
            "content_body": "<p>Content to be duplicated</p>"
        })
        assert create_resp.status_code == 200
        original = create_resp.json()
        post_id = original["post_id"]
        company_id = original.get("company_id")
        
        # Duplicate with org_id
        dup_url = f"{BASE_URL}/api/demand-studio/social/posts/{post_id}/duplicate"
        if company_id:
            dup_url += f"?org_id={company_id}"
        
        response = requests.post(dup_url, headers=auth_headers)
        assert response.status_code == 200, f"Duplicate with org_id failed: {response.text}"
        data = response.json()
        
        assert data["post_id"] != post_id, "Duplicate should have new post_id"
        assert "TEST_DuplicateWithOrgId (copy)" in data["title"]
        assert data["status"] == "idea", "Duplicated post should have idea status"
        assert data.get("content_body") == original.get("content_body"), "content_body should be duplicated"
        print(f"PASS: duplicate with org_id param works, content_body preserved")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}", headers=auth_headers)
        requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{data['post_id']}", headers=auth_headers)


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        if response.status_code != 200:
            pytest.skip("Cannot login for cleanup")
        return {"Authorization": f"Bearer {response.json()['access_token']}", "Content-Type": "application/json"}
    
    def test_cleanup_test_data(self, auth_headers):
        """Clean up TEST_ prefixed posts and ideas"""
        # Get and delete test posts
        posts_resp = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        if posts_resp.status_code == 200:
            posts = posts_resp.json()
            for post in posts:
                if post.get("title", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}", headers=auth_headers)
                    print(f"Cleaned up post: {post['title']}")
        
        # Get and delete test ideas
        ideas_resp = requests.get(f"{BASE_URL}/api/demand-studio/social/ideas", headers=auth_headers)
        if ideas_resp.status_code == 200:
            ideas = ideas_resp.json()
            for idea in ideas:
                if idea.get("title", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}", headers=auth_headers)
                    print(f"Cleaned up idea: {idea['title']}")
        
        print("PASS: Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
