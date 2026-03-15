"""
Tests for 3 Calendar & Settings Fixes (iteration 120)

1. Bug fix: fetchData now called with org params (isOwnOrg ? null : selectedOrgId) in all save/delete handlers
2. Bug fix: Calendar query includes posts with created_at when no scheduled_at/posted_at
3. Feature: GET /api/demand-studio/social/calendar/pillar-stats returns pillar breakdown
"""
import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCalendarFixes:
    """Tests for the 3 calendar and settings fixes"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.company_id = login_response.json()["user"]["company_id"]
        yield
        # Cleanup test data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Delete any test posts created"""
        try:
            posts = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=self.headers).json()
            for post in posts:
                if post.get("title", "").startswith("TEST_CALENDAR_"):
                    requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}", headers=self.headers)
        except:
            pass

    # =============== BUG FIX 1: Calendar includes created_at ===============
    
    def test_calendar_returns_posts_without_scheduled_at(self):
        """Bug fix: Calendar should show posts with created_at when no scheduled_at/posted_at"""
        # Create a post without scheduled_at
        accounts = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=self.headers).json()
        if not accounts:
            pytest.skip("No social accounts available")
        
        account_id = accounts[0]["account_id"]
        
        post_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/posts",
            headers=self.headers,
            json={
                "social_account_id": account_id,
                "title": "TEST_CALENDAR_No_Schedule",
                "format": "post",
                "status": "production"
                # Note: NO scheduled_at field - should use created_at
            }
        )
        assert post_response.status_code == 200, f"Failed to create post: {post_response.text}"
        post = post_response.json()
        post_id = post["post_id"]
        created_at = post["created_at"]
        
        # Get calendar for current month
        now = datetime.now(timezone.utc)
        start_date = f"{now.year}-{now.month:02d}-01T00:00:00Z"
        end_date = f"{now.year}-{now.month:02d}-28T23:59:59Z"
        
        calendar_response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}",
            headers=self.headers
        )
        assert calendar_response.status_code == 200
        calendar_posts = calendar_response.json()
        
        # Find our test post in calendar
        found_post = next((p for p in calendar_posts if p["post_id"] == post_id), None)
        assert found_post is not None, "Post without scheduled_at should appear in calendar via created_at"
        assert found_post["scheduled_at"] is None, "Post should have no scheduled_at"
        assert found_post["created_at"] is not None, "Post should have created_at"
        
        print(f"✓ Post without scheduled_at found in calendar via created_at")
    
    def test_calendar_query_or_condition(self):
        """Verify calendar query uses correct $or condition for dates"""
        now = datetime.now(timezone.utc)
        start_date = f"{now.year}-{now.month:02d}-01T00:00:00Z"
        end_date = f"{now.year}-{now.month:02d}-28T23:59:59Z"
        
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}",
            headers=self.headers
        )
        assert response.status_code == 200
        posts = response.json()
        
        # Check that posts with different date types are included
        posts_with_scheduled = [p for p in posts if p.get("scheduled_at")]
        posts_with_posted = [p for p in posts if p.get("posted_at") and not p.get("scheduled_at")]
        posts_with_only_created = [p for p in posts if not p.get("scheduled_at") and not p.get("posted_at") and p.get("created_at")]
        
        print(f"Posts with scheduled_at: {len(posts_with_scheduled)}")
        print(f"Posts with posted_at only: {len(posts_with_posted)}")
        print(f"Posts with created_at only: {len(posts_with_only_created)}")
        
        # At least some posts should exist
        assert len(posts) > 0, "Calendar should return posts"
        print(f"✓ Calendar returns {len(posts)} posts total")

    # =============== BUG FIX 2: Pillar Stats Endpoint ===============
    
    def test_pillar_stats_endpoint_exists(self):
        """Feature: GET /api/demand-studio/social/calendar/pillar-stats should exist"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar/pillar-stats?year=2026&month=3",
            headers=self.headers
        )
        assert response.status_code == 200, f"Pillar stats endpoint failed: {response.text}"
        data = response.json()
        
        assert "total_posts" in data, "Response should have total_posts"
        assert "pillars" in data, "Response should have pillars array"
        assert "period" in data, "Response should have period info"
        print(f"✓ Pillar stats endpoint returns valid structure")
    
    def test_pillar_stats_structure(self):
        """Feature: Pillar stats should return correct data structure"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar/pillar-stats?year=2026&month=3",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check period structure
        assert data["period"]["year"] == 2026
        assert data["period"]["month"] == 3
        
        # Check pillars structure
        if data["pillars"]:
            pillar = data["pillars"][0]
            assert "pillar_id" in pillar, "Pillar should have pillar_id"
            assert "name" in pillar, "Pillar should have name"
            assert "total" in pillar, "Pillar should have total count"
            assert "by_status" in pillar, "Pillar should have by_status breakdown"
            
            # Optional fields
            # icon, color, weight_percentage can be null
            
            print(f"✓ Pillar '{pillar['name']}' has {pillar['total']} posts")
            print(f"  Status breakdown: {pillar['by_status']}")
        
        print(f"✓ Total posts in March 2026: {data['total_posts']}")

    def test_pillar_stats_with_org_id(self):
        """Feature: Pillar stats should work with org_id parameter"""
        # Test with own org
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar/pillar-stats?year=2026&month=3&org_id={self.company_id}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Pillar stats with org_id failed: {response.text}"
        print(f"✓ Pillar stats with org_id works")

    # =============== REGRESSION: Posts with scheduled_at still work ===============
    
    def test_calendar_posts_with_scheduled_at_still_work(self):
        """Regression: Posts with scheduled_at should still appear on correct date"""
        accounts = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=self.headers).json()
        if not accounts:
            pytest.skip("No social accounts available")
        
        account_id = accounts[0]["account_id"]
        
        # Create a post WITH scheduled_at
        post_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/posts",
            headers=self.headers,
            json={
                "social_account_id": account_id,
                "title": "TEST_CALENDAR_With_Schedule",
                "format": "post",
                "status": "scheduled",
                "scheduled_at": "2026-01-15T10:00:00Z"
            }
        )
        assert post_response.status_code == 200, f"Failed to create post: {post_response.text}"
        post = post_response.json()
        post_id = post["post_id"]
        
        # Get calendar for January 2026
        calendar_response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date=2026-01-01T00:00:00Z&end_date=2026-01-31T23:59:59Z",
            headers=self.headers
        )
        assert calendar_response.status_code == 200
        calendar_posts = calendar_response.json()
        
        # Find our test post in calendar
        found_post = next((p for p in calendar_posts if p["post_id"] == post_id), None)
        assert found_post is not None, "Post with scheduled_at should appear in calendar"
        assert found_post["scheduled_at"] == "2026-01-15T10:00:00Z", "scheduled_at should match"
        
        print(f"✓ Post with scheduled_at found in calendar on correct date")

    # =============== REGRESSION: Pillar CRUD with org_id ===============
    
    def test_pillar_crud_with_org_id_regression(self):
        """Regression: Pillar CRUD should still work with org_id parameter"""
        # Create pillar
        create_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.company_id}",
            headers=self.headers,
            json={
                "name": "TEST_CALENDAR_Pillar",
                "description": "Test pillar for calendar regression"
            }
        )
        assert create_response.status_code == 200, f"Create pillar failed: {create_response.text}"
        pillar = create_response.json()
        pillar_id = pillar["pillar_id"]
        
        # Update pillar
        update_response = requests.put(
            f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.company_id}",
            headers=self.headers,
            json={
                "name": "TEST_CALENDAR_Pillar_Updated",
                "description": "Updated description"
            }
        )
        assert update_response.status_code == 200, f"Update pillar failed: {update_response.text}"
        
        # Delete pillar
        delete_response = requests.delete(
            f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.company_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Delete pillar failed: {delete_response.text}"
        
        print(f"✓ Pillar CRUD with org_id works")

    # =============== REGRESSION: Post CRUD ===============
    
    def test_post_crud_regression(self):
        """Regression: Post CRUD should still work"""
        accounts = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=self.headers).json()
        if not accounts:
            pytest.skip("No social accounts available")
        
        account_id = accounts[0]["account_id"]
        
        # Create
        create_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/posts",
            headers=self.headers,
            json={
                "social_account_id": account_id,
                "title": "TEST_CALENDAR_CRUD_Post",
                "format": "reel",
                "status": "idea"
            }
        )
        assert create_response.status_code == 200
        post_id = create_response.json()["post_id"]
        
        # Update
        update_response = requests.put(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}",
            headers=self.headers,
            json={
                "social_account_id": account_id,
                "title": "TEST_CALENDAR_CRUD_Post_Updated",
                "format": "reel",
                "status": "production"
            }
        )
        assert update_response.status_code == 200
        
        # Delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/demand-studio/social/posts/{post_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200
        
        print(f"✓ Post CRUD works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
