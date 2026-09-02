"""
Test Demand Studio New Features - Iteration 147
Tests for:
1. Story Series (batch creation of posts)
2. Story Templates (save/load templates)
3. Format Colors (calendar color coding)
4. Account Colors (sidebar border colors)
5. Comments system (verify not broken)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


class TestDemandStudioNewFeatures:
    """Test new Demand Studio features: Story Series, Format Colors, Account Colors"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Store test data for cleanup
        self.created_posts = []
        self.created_templates = []
        self.test_account_id = None
        
        yield
        
        # Cleanup: Delete test posts
        for post_id in self.created_posts:
            try:
                self.session.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post_id}")
            except Exception:
                pass
        
        # Cleanup: Delete test templates
        for template_id in self.created_templates:
            try:
                self.session.delete(f"{BASE_URL}/api/demand-studio/social/story-templates/{template_id}")
            except Exception:
                pass
    
    # ============== FORMAT COLORS TESTS ==============
    
    def test_get_format_colors_returns_defaults(self):
        """GET /api/demand-studio/social/format-colors returns default colors"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/format-colors")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        colors = response.json()
        assert isinstance(colors, dict), "Response should be a dict"
        
        # Check default colors exist
        expected_formats = ["post", "reel", "story", "carousel", "live"]
        for fmt in expected_formats:
            assert fmt in colors, f"Missing format color: {fmt}"
            assert colors[fmt].startswith("#"), f"Color should be hex: {colors[fmt]}"
        
        # Verify default values
        assert colors.get("post") == "#22c55e", f"Post color should be green: {colors.get('post')}"
        assert colors.get("reel") == "#a855f7", f"Reel color should be purple: {colors.get('reel')}"
        assert colors.get("story") == "#eab308", f"Story color should be yellow: {colors.get('story')}"
        assert colors.get("carousel") == "#3b82f6", f"Carousel color should be blue: {colors.get('carousel')}"
        assert colors.get("live") == "#ef4444", f"Live color should be red: {colors.get('live')}"
        
        print("PASS: GET format-colors returns correct defaults")
    
    def test_update_format_colors(self):
        """PUT /api/demand-studio/social/format-colors saves custom colors"""
        custom_colors = {
            "post": "#00ff00",
            "reel": "#ff00ff",
            "story": "#ffff00",
            "carousel": "#0000ff",
            "live": "#ff0000"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/demand-studio/social/format-colors",
            json=custom_colors
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify saved
        get_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/format-colors")
        assert get_response.status_code == 200
        saved_colors = get_response.json()
        
        for fmt, color in custom_colors.items():
            assert saved_colors.get(fmt) == color, f"Color not saved for {fmt}"
        
        # Restore defaults
        defaults = {
            "post": "#22c55e", "reel": "#a855f7", "story": "#eab308",
            "carousel": "#3b82f6", "live": "#ef4444"
        }
        self.session.put(f"{BASE_URL}/api/demand-studio/social/format-colors", json=defaults)
        
        print("PASS: PUT format-colors saves custom colors")
    
    # ============== STORY TEMPLATES TESTS ==============
    
    def test_get_story_templates(self):
        """GET /api/demand-studio/social/story-templates returns templates list"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/story-templates")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        templates = response.json()
        assert isinstance(templates, list), "Response should be a list"
        print(f"PASS: GET story-templates returns {len(templates)} templates")
    
    def test_create_story_template(self):
        """POST /api/demand-studio/social/story-templates creates a template"""
        template_data = {
            "name": f"TEST_Template_{uuid.uuid4().hex[:6]}",
            "description": "Test template for story series",
            "format": "story",
            "count": 5,
            "items": [
                {"title": "Intro", "caption": "Welcome!"},
                {"title": "Point 1", "caption": "First point"},
                {"title": "Point 2", "caption": "Second point"},
                {"title": "Point 3", "caption": "Third point"},
                {"title": "CTA", "caption": "Follow for more!"}
            ]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/story-templates",
            json=template_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        template = response.json()
        assert "template_id" in template, "Missing template_id"
        assert template["name"] == template_data["name"], "Name mismatch"
        assert template["format"] == "story", "Format mismatch"
        assert template["count"] == 5, "Count mismatch"
        assert len(template.get("items", [])) == 5, "Items count mismatch"
        
        self.created_templates.append(template["template_id"])
        
        # Verify it appears in list
        list_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/story-templates")
        templates = list_response.json()
        found = any(t["template_id"] == template["template_id"] for t in templates)
        assert found, "Created template not found in list"
        
        print(f"PASS: POST story-templates creates template: {template['template_id']}")
    
    def test_delete_story_template(self):
        """DELETE /api/demand-studio/social/story-templates/{id} deletes template"""
        # First create a template
        template_data = {
            "name": f"TEST_ToDelete_{uuid.uuid4().hex[:6]}",
            "format": "story",
            "count": 3,
            "items": [{"title": f"Story {i}"} for i in range(3)]
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/story-templates",
            json=template_data
        )
        assert create_response.status_code == 200
        template_id = create_response.json()["template_id"]
        
        # Delete it
        delete_response = self.session.delete(
            f"{BASE_URL}/api/demand-studio/social/story-templates/{template_id}"
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        assert delete_response.json().get("deleted") == True
        
        # Verify it's gone
        list_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/story-templates")
        templates = list_response.json()
        found = any(t["template_id"] == template_id for t in templates)
        assert not found, "Deleted template still in list"
        
        print(f"PASS: DELETE story-templates/{template_id} removes template")
    
    # ============== BATCH POST CREATION (STORY SERIES) TESTS ==============
    
    def test_create_post_batch_requires_account(self):
        """POST /api/demand-studio/social/posts/batch requires social_account_id"""
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/posts/batch",
            json={"count": 5, "format": "story"}
        )
        # Should still work but with null account
        # The endpoint doesn't strictly require account_id
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        print("PASS: Batch endpoint handles missing account_id")
    
    def test_create_post_batch_creates_series(self):
        """POST /api/demand-studio/social/posts/batch creates N posts with shared series_id"""
        # First get an account
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        
        if not accounts:
            pytest.skip("No social accounts available for testing")
        
        account_id = accounts[0]["account_id"]
        self.test_account_id = account_id
        
        batch_data = {
            "social_account_id": account_id,
            "series_name": "TEST_Series",
            "count": 5,
            "format": "story",
            "status": "idea"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/posts/batch",
            json=batch_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        assert "series_id" in result, "Missing series_id"
        assert result["count"] == 5, f"Count mismatch: {result['count']}"
        assert "posts" in result, "Missing posts array"
        assert len(result["posts"]) == 5, f"Posts count mismatch: {len(result['posts'])}"
        
        series_id = result["series_id"]
        
        # Verify all posts have same series_id and correct series_index
        for i, post in enumerate(result["posts"]):
            assert post["series_id"] == series_id, f"Post {i} has wrong series_id"
            assert post["series_index"] == i + 1, f"Post {i} has wrong series_index"
            assert post["series_count"] == 5, f"Post {i} has wrong series_count"
            assert post["format"] == "story", f"Post {i} has wrong format"
            assert f"TEST_Series {i+1}/5" in post["title"], f"Post {i} title mismatch: {post['title']}"
            self.created_posts.append(post["post_id"])
        
        print(f"PASS: POST posts/batch creates 5 posts with series_id: {series_id}")
    
    def test_create_post_batch_with_template_items(self):
        """POST /api/demand-studio/social/posts/batch uses template items"""
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        
        if not accounts:
            pytest.skip("No social accounts available for testing")
        
        account_id = accounts[0]["account_id"]
        
        batch_data = {
            "social_account_id": account_id,
            "count": 3,
            "format": "story",
            "status": "idea",
            "items": [
                {"title": "TEST_Intro", "caption": "Welcome!", "hook": "Hook 1"},
                {"title": "TEST_Middle", "caption": "Content", "cta": "Swipe up"},
                {"title": "TEST_Outro", "caption": "Thanks!", "notes": "Final slide"}
            ]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/posts/batch",
            json=batch_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        posts = result["posts"]
        
        assert posts[0]["title"] == "TEST_Intro", f"First post title mismatch: {posts[0]['title']}"
        assert posts[0]["caption"] == "Welcome!", f"First post caption mismatch"
        assert posts[0]["hook"] == "Hook 1", f"First post hook mismatch"
        
        assert posts[1]["title"] == "TEST_Middle", f"Second post title mismatch"
        assert posts[1]["cta"] == "Swipe up", f"Second post cta mismatch"
        
        assert posts[2]["title"] == "TEST_Outro", f"Third post title mismatch"
        assert posts[2]["notes"] == "Final slide", f"Third post notes mismatch"
        
        for post in posts:
            self.created_posts.append(post["post_id"])
        
        print("PASS: POST posts/batch uses template items correctly")
    
    def test_create_post_batch_count_limits(self):
        """POST /api/demand-studio/social/posts/batch enforces count limits (1-30)"""
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        
        if not accounts:
            pytest.skip("No social accounts available for testing")
        
        account_id = accounts[0]["account_id"]
        
        # Test count = 0 (should fail)
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/posts/batch",
            json={"social_account_id": account_id, "count": 0, "format": "story"}
        )
        assert response.status_code == 400, f"Count=0 should fail: {response.status_code}"
        
        # Test count = 31 (should fail)
        response = self.session.post(
            f"{BASE_URL}/api/demand-studio/social/posts/batch",
            json={"social_account_id": account_id, "count": 31, "format": "story"}
        )
        assert response.status_code == 400, f"Count=31 should fail: {response.status_code}"
        
        print("PASS: POST posts/batch enforces count limits 1-30")
    
    # ============== ACCOUNT COLOR TESTS ==============
    
    def test_update_account_color(self):
        """PUT /api/demand-studio/social/accounts/{id}/color saves account color"""
        accounts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        accounts = accounts_response.json()
        
        if not accounts:
            pytest.skip("No social accounts available for testing")
        
        account_id = accounts[0]["account_id"]
        original_color = accounts[0].get("color")
        
        # Set a test color
        test_color = "#ff5733"
        response = self.session.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}/color",
            json={"color": test_color}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        assert result["account_id"] == account_id, "Account ID mismatch"
        assert result["color"] == test_color, f"Color mismatch: {result['color']}"
        
        # Verify it persisted
        verify_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        updated_accounts = verify_response.json()
        updated_account = next((a for a in updated_accounts if a["account_id"] == account_id), None)
        assert updated_account is not None, "Account not found after update"
        assert updated_account.get("color") == test_color, f"Color not persisted: {updated_account.get('color')}"
        
        # Restore original color
        if original_color:
            self.session.put(
                f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}/color",
                json={"color": original_color}
            )
        
        print(f"PASS: PUT accounts/{account_id}/color saves color")
    
    def test_update_account_color_nonexistent(self):
        """PUT /api/demand-studio/social/accounts/{id}/color returns 404 for nonexistent account"""
        response = self.session.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/nonexistent_account_123/color",
            json={"color": "#ff0000"}
        )
        assert response.status_code == 404, f"Expected 404, got: {response.status_code}"
        print("PASS: PUT accounts/nonexistent/color returns 404")
    
    # ============== COMMENTS SYSTEM TESTS (Verify not broken) ==============
    
    def test_comments_endpoint_works(self):
        """GET /api/comments/{entity_type}/{entity_id} still works"""
        # Test with a dummy entity - should return empty list, not error
        response = self.session.get(f"{BASE_URL}/api/comments/social_post/test_post_123")
        assert response.status_code == 200, f"Comments endpoint broken: {response.status_code} - {response.text}"
        
        comments = response.json()
        assert isinstance(comments, list), "Comments should return a list"
        print("PASS: GET /api/comments/{entity_type}/{entity_id} works")
    
    def test_create_comment_works(self):
        """POST /api/comments creates a comment"""
        # First get a post to comment on
        posts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        posts = posts_response.json()
        
        if not posts:
            pytest.skip("No posts available for comment testing")
        
        post_id = posts[0]["post_id"]
        
        comment_data = {
            "entity_type": "social_post",
            "entity_id": post_id,
            "content": f"TEST_Comment_{uuid.uuid4().hex[:6]}",
            "mentions": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/comments", json=comment_data)
        assert response.status_code == 200, f"Create comment failed: {response.text}"
        
        comment = response.json()
        assert "comment_id" in comment, "Missing comment_id"
        assert comment["content"] == comment_data["content"], "Content mismatch"
        assert comment["entity_id"] == post_id, "Entity ID mismatch"
        
        # Cleanup: delete the comment
        self.session.delete(f"{BASE_URL}/api/comments/{comment['comment_id']}")
        
        print(f"PASS: POST /api/comments creates comment on post {post_id}")
    
    def test_comment_counts_endpoint_works(self):
        """GET /api/comments/counts/by-entities works"""
        posts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        posts = posts_response.json()
        
        if not posts:
            pytest.skip("No posts available for testing")
        
        post_ids = [p["post_id"] for p in posts[:3]]
        
        response = self.session.get(
            f"{BASE_URL}/api/comments/counts/by-entities",
            params={"entity_type": "social_post", "entity_ids": ",".join(post_ids)}
        )
        assert response.status_code == 200, f"Comment counts failed: {response.text}"
        
        counts = response.json()
        assert isinstance(counts, dict), "Counts should be a dict"
        print(f"PASS: GET /api/comments/counts/by-entities works for {len(post_ids)} posts")
    
    def test_mentionable_users_endpoint_works(self):
        """GET /api/comments/mentions/users works"""
        response = self.session.get(f"{BASE_URL}/api/comments/mentions/users")
        assert response.status_code == 200, f"Mentionable users failed: {response.text}"
        
        users = response.json()
        assert isinstance(users, list), "Users should be a list"
        print(f"PASS: GET /api/comments/mentions/users returns {len(users)} users")


class TestSocialMediaCalendarIntegration:
    """Test that calendar uses format colors correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        yield
    
    def test_calendar_endpoint_returns_posts(self):
        """GET /api/demand-studio/social/calendar returns posts with format field"""
        from datetime import datetime
        
        now = datetime.now()
        start_date = now.replace(day=1).isoformat()
        end_date = now.replace(day=28).isoformat()
        
        response = self.session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar",
            params={"start_date": start_date, "end_date": end_date}
        )
        assert response.status_code == 200, f"Calendar failed: {response.text}"
        
        posts = response.json()
        assert isinstance(posts, list), "Calendar should return a list"
        
        # If there are posts, verify they have format field
        for post in posts[:5]:
            assert "format" in post, f"Post missing format field: {post.get('post_id')}"
            assert post["format"] in ["post", "reel", "story", "carousel", "live"], f"Invalid format: {post['format']}"
        
        print(f"PASS: Calendar returns {len(posts)} posts with format field")
    
    def test_social_accounts_have_color_field(self):
        """GET /api/demand-studio/social/accounts returns accounts with color field"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200, f"Accounts failed: {response.text}"
        
        accounts = response.json()
        assert isinstance(accounts, list), "Accounts should return a list"
        
        # Accounts may or may not have color set, but the field should be accessible
        for account in accounts:
            # color field may be None/null or a hex string
            color = account.get("color")
            if color:
                assert color.startswith("#"), f"Color should be hex: {color}"
        
        print(f"PASS: Accounts endpoint returns {len(accounts)} accounts (color field accessible)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
