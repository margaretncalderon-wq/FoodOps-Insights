"""
Tests for Demand Studio Quick Status Change and Calendar Drag & Drop features
Features tested:
1. PATCH /api/demand-studio/social/posts/{post_id} - production_date and scheduled_at fields
2. Quick status changes (production, editing) with production_date
3. Calendar drag & drop - scheduled_at update
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestQuickStatusAndCalendar:
    """Tests for quick status changes and calendar drag & drop"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("access_token")
        assert token, "No access_token in response"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Headers with authentication"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def test_account(self, auth_headers):
        """Get or create a test social account"""
        # Get existing accounts
        response = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=auth_headers)
        assert response.status_code == 200
        accounts = response.json()
        
        if accounts:
            return accounts[0]
        
        # Create a test account if none exists
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/accounts", json={
            "platform": "instagram",
            "handle": "TEST_quick_status",
            "status": "active"
        }, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create account: {response.text}"
        return response.json()
    
    @pytest.fixture
    def test_post(self, auth_headers, test_account):
        """Create a test post for quick status testing"""
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", json={
            "social_account_id": test_account["account_id"],
            "title": "TEST_QuickStatus_Post",
            "format": "reel",
            "status": "idea",
            "caption": "Test caption for quick status"
        }, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create post: {response.text}"
        post = response.json()
        
        yield post
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}", headers=auth_headers)
    
    # Test 1: PATCH endpoint accepts production_date
    def test_patch_post_with_production_date(self, auth_headers, test_post):
        """PATCH endpoint should accept and store production_date"""
        production_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={
                "status": "production",
                "production_date": production_date
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"PATCH failed: {response.text}"
        
        # Verify the update by fetching the post
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        assert get_response.status_code == 200
        
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        assert updated_post is not None, "Post not found after update"
        assert updated_post["status"] == "production", "Status not updated"
        assert updated_post["production_date"] == production_date, "production_date not updated"
        print(f"✓ PATCH with production_date works: status={updated_post['status']}, production_date={updated_post['production_date']}")
    
    # Test 2: PATCH endpoint accepts scheduled_at
    def test_patch_post_with_scheduled_at(self, auth_headers, test_post):
        """PATCH endpoint should accept and store scheduled_at for calendar drag & drop"""
        scheduled_at = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%dT12:00:00")
        
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={
                "scheduled_at": scheduled_at
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"PATCH scheduled_at failed: {response.text}"
        
        # Verify the update
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        assert get_response.status_code == 200
        
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        assert updated_post is not None, "Post not found after scheduled_at update"
        # Check that scheduled_at was updated (may have timezone info)
        assert updated_post["scheduled_at"] is not None, "scheduled_at should not be None"
        assert scheduled_at[:10] in updated_post["scheduled_at"], f"scheduled_at date mismatch: expected {scheduled_at[:10]} in {updated_post['scheduled_at']}"
        print(f"✓ PATCH with scheduled_at works: scheduled_at={updated_post['scheduled_at']}")
    
    # Test 3: Quick status change to 'production' with production_date
    def test_quick_status_to_production(self, auth_headers, test_post):
        """Quick status change to production should set status and production_date"""
        production_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={
                "status": "production",
                "production_date": production_date
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Quick status to production failed: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        
        assert updated_post["status"] == "production"
        assert updated_post["production_date"] == production_date
        print(f"✓ Quick status to production works correctly")
    
    # Test 4: Quick status change to 'editing' with production_date
    def test_quick_status_to_editing(self, auth_headers, test_post):
        """Quick status change to editing should set status and production_date"""
        production_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={
                "status": "editing",
                "production_date": production_date
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Quick status to editing failed: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        
        assert updated_post["status"] == "editing"
        assert updated_post["production_date"] == production_date
        print(f"✓ Quick status to editing works correctly")
    
    # Test 5: Quick status change to 'drafted' (no date needed)
    def test_quick_status_to_drafted(self, auth_headers, test_post):
        """Quick status change to drafted should work without production_date"""
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={
                "status": "drafted"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Quick status to drafted failed: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        
        assert updated_post["status"] == "drafted"
        print(f"✓ Quick status to drafted works correctly")
    
    # Test 6: Calendar drag & drop simulation (updating scheduled_at)
    def test_calendar_drag_drop_simulation(self, auth_headers, test_post):
        """Simulates calendar drag & drop by updating scheduled_at to a new date"""
        # Initial date
        original_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%dT12:00:00")
        
        # Set initial scheduled_at
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={"scheduled_at": original_date},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Drag to new date (simulate drag & drop)
        new_date = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%dT12:00:00")
        
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={"scheduled_at": new_date},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Calendar drag & drop (PATCH scheduled_at) failed: {response.text}"
        
        # Verify the new date
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        
        assert updated_post["scheduled_at"] is not None
        assert new_date[:10] in updated_post["scheduled_at"], f"Calendar drag failed: expected {new_date[:10]} in {updated_post['scheduled_at']}"
        print(f"✓ Calendar drag & drop simulation works: moved to {updated_post['scheduled_at']}")
    
    # Test 7: PATCH with only status (no date)
    def test_patch_status_only(self, auth_headers, test_post):
        """PATCH with only status should work for statuses that don't require date"""
        for status in ["idea", "drafted", "scheduled", "archived"]:
            response = requests.patch(
                f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
                json={"status": status},
                headers=auth_headers
            )
            
            assert response.status_code == 200, f"PATCH status={status} failed: {response.text}"
            
            # Verify
            get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
            posts = get_response.json()
            updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
            assert updated_post["status"] == status, f"Status mismatch: expected {status}, got {updated_post['status']}"
        
        print(f"✓ PATCH with status only works for all statuses")
    
    # Test 8: Verify PATCH doesn't require all fields (partial update)
    def test_patch_is_partial_update(self, auth_headers, test_post):
        """PATCH should be a partial update - only specified fields should change"""
        # First set some initial values
        requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={
                "status": "production",
                "production_date": "2026-02-15"
            },
            headers=auth_headers
        )
        
        # Now PATCH only scheduled_at
        scheduled_at = "2026-03-01T14:00:00"
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{test_post['post_id']}", 
            json={"scheduled_at": scheduled_at},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        
        # Verify production_date was NOT cleared
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == test_post["post_id"]), None)
        
        assert updated_post["status"] == "production", "Status should remain unchanged"
        assert updated_post["production_date"] == "2026-02-15", "production_date should remain unchanged"
        assert "2026-03-01" in updated_post["scheduled_at"], "scheduled_at should be updated"
        print(f"✓ PATCH is correctly a partial update - other fields preserved")
    
    # Test 9: Calendar endpoint returns posts with scheduled_at
    def test_calendar_endpoint(self, auth_headers):
        """Calendar endpoint should return posts in date range with scheduled_at"""
        # Use current month range
        now = datetime.now()
        start_date = now.replace(day=1).strftime("%Y-%m-%dT00:00:00")
        end_date = (now.replace(day=28) + timedelta(days=4)).strftime("%Y-%m-%dT23:59:59")
        
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Calendar endpoint failed: {response.text}"
        
        posts = response.json()
        assert isinstance(posts, list), "Calendar should return a list"
        
        # Check structure of returned posts
        if posts:
            post = posts[0]
            assert "post_id" in post
            assert "title" in post
            # scheduled_at or posted_at should exist for calendar posts
            print(f"✓ Calendar endpoint works: returned {len(posts)} posts")
        else:
            print(f"✓ Calendar endpoint works: returned empty list (no posts in range)")


class TestQuickStatusFromIdeasTab:
    """Tests for quick status change from Ideas tab (Producción button)"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def test_account(self, auth_headers):
        """Get or create a test social account"""
        response = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=auth_headers)
        accounts = response.json()
        if accounts:
            return accounts[0]
        
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/accounts", json={
            "platform": "instagram",
            "handle": "TEST_ideas_tab",
            "status": "active"
        }, headers=auth_headers)
        return response.json()
    
    @pytest.fixture
    def idea_post(self, auth_headers, test_account):
        """Create a post with status='idea' to simulate Ideas tab"""
        response = requests.post(f"{BASE_URL}/api/demand-studio/social/posts", json={
            "social_account_id": test_account["account_id"],
            "title": "TEST_IdeaPost_ToProduction",
            "format": "reel",
            "status": "idea",
            "caption": "This is an idea that will go to production"
        }, headers=auth_headers)
        assert response.status_code == 200
        post = response.json()
        
        yield post
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}", headers=auth_headers)
    
    def test_idea_to_production_with_date(self, auth_headers, idea_post):
        """Test moving an idea to production with production_date (Producción button from Ideas tab)"""
        production_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        # This is what the frontend does when clicking "Producción" button from Ideas tab
        response = requests.patch(
            f"{BASE_URL}/api/demand-studio/social/posts/{idea_post['post_id']}", 
            json={
                "status": "production",
                "production_date": production_date
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Idea to production failed: {response.text}"
        
        # Verify the post is now in production
        get_response = requests.get(f"{BASE_URL}/api/demand-studio/social/posts", headers=auth_headers)
        posts = get_response.json()
        updated_post = next((p for p in posts if p["post_id"] == idea_post["post_id"]), None)
        
        assert updated_post["status"] == "production", f"Status should be production, got {updated_post['status']}"
        assert updated_post["production_date"] == production_date
        print(f"✓ Idea → Production with date works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
