"""
Test presence system API endpoints for Kora OS ERP

Tests:
- POST /api/presence/heartbeat - creates/updates presence record
- GET /api/presence/online - returns online users (excludes current user)
- GET /api/presence/entity/{entity_type}/{entity_id} - returns entity viewers
- POST /api/presence/leave - clears entity presence
"""

import pytest
import requests
import os
from datetime import datetime, timezone, timedelta
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestPresenceSystem:
    """Test presence system endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get session token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_res.status_code != 200:
            pytest.skip(f"Login failed: {login_res.status_code}")
        
        yield
        
        # Cleanup: Clear presence on teardown
        try:
            self.session.post(f"{BASE_URL}/api/presence/leave")
        except:
            pass
    
    # === HEARTBEAT ENDPOINT TESTS ===
    
    def test_heartbeat_creates_presence(self):
        """Test POST /api/presence/heartbeat creates/updates presence record"""
        payload = {
            "page": "demand-studio/social-media",
            "entity_type": None,
            "entity_id": None,
            "entity_title": None
        }
        
        res = self.session.post(f"{BASE_URL}/api/presence/heartbeat", json=payload)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("ok") == True, f"Expected ok=True, got {data}"
    
    def test_heartbeat_with_entity(self):
        """Test heartbeat with entity tracking (editing a post)"""
        payload = {
            "page": "demand-studio/social-media",
            "entity_type": "social_post",
            "entity_id": "post_test123",
            "entity_title": "Test Post Title"
        }
        
        res = self.session.post(f"{BASE_URL}/api/presence/heartbeat", json=payload)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("ok") == True
    
    def test_heartbeat_with_org_id(self):
        """Test heartbeat with org_id parameter"""
        payload = {
            "page": "dashboard",
            "org_id": "test_org_123"
        }
        
        res = self.session.post(f"{BASE_URL}/api/presence/heartbeat", json=payload)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("ok") == True
    
    def test_heartbeat_unauthenticated_fails(self):
        """Test that unauthenticated heartbeat fails"""
        new_session = requests.Session()
        payload = {"page": "dashboard"}
        
        res = new_session.post(f"{BASE_URL}/api/presence/heartbeat", json=payload)
        
        assert res.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {res.status_code}"
    
    # === ONLINE USERS ENDPOINT TESTS ===
    
    def test_get_online_users(self):
        """Test GET /api/presence/online returns online users"""
        # First, send heartbeat to register presence
        self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={"page": "test"})
        
        res = self.session.get(f"{BASE_URL}/api/presence/online")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Response should have online_users array and total count
        assert "online_users" in data, f"Missing online_users in response: {data}"
        assert "total" in data, f"Missing total in response: {data}"
        assert isinstance(data["online_users"], list), "online_users should be a list"
        assert isinstance(data["total"], int), "total should be an integer"
    
    def test_get_online_users_excludes_current_user(self):
        """Test that online users excludes the current authenticated user"""
        # Send heartbeat
        self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={"page": "test"})
        
        res = self.session.get(f"{BASE_URL}/api/presence/online")
        
        assert res.status_code == 200
        data = res.json()
        
        # Current user should NOT be in the list
        for user in data["online_users"]:
            assert user.get("email") != TEST_EMAIL, "Current user should be excluded from online users list"
    
    def test_get_online_users_with_org_filter(self):
        """Test online users with org_id filter"""
        res = self.session.get(f"{BASE_URL}/api/presence/online?org_id=test_org")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "online_users" in data
    
    def test_get_online_users_unauthenticated_fails(self):
        """Test that unauthenticated online users request fails"""
        new_session = requests.Session()
        
        res = new_session.get(f"{BASE_URL}/api/presence/online")
        
        assert res.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {res.status_code}"
    
    # === ENTITY PRESENCE ENDPOINT TESTS ===
    
    def test_get_entity_presence(self):
        """Test GET /api/presence/entity/{entity_type}/{entity_id} returns entity viewers"""
        # First register presence on an entity
        self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={
            "page": "demand-studio/social-media",
            "entity_type": "social_post",
            "entity_id": "post_abc123",
            "entity_title": "Test Post"
        })
        
        # Then get entity viewers
        res = self.session.get(f"{BASE_URL}/api/presence/entity/social_post/post_abc123")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Response should have viewers array and count
        assert "viewers" in data, f"Missing viewers in response: {data}"
        assert "count" in data, f"Missing count in response: {data}"
        assert isinstance(data["viewers"], list), "viewers should be a list"
        assert isinstance(data["count"], int), "count should be an integer"
    
    def test_get_entity_presence_excludes_current_user(self):
        """Test that entity viewers excludes the current authenticated user"""
        # Register presence on entity
        self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={
            "page": "test",
            "entity_type": "social_post",
            "entity_id": "post_xyz789"
        })
        
        res = self.session.get(f"{BASE_URL}/api/presence/entity/social_post/post_xyz789")
        
        assert res.status_code == 200
        data = res.json()
        
        # Current user should NOT be in the viewers list
        for viewer in data["viewers"]:
            assert viewer.get("email") != TEST_EMAIL, "Current user should be excluded from entity viewers"
    
    def test_get_entity_presence_empty_for_nonexistent(self):
        """Test that nonexistent entity returns empty viewers list"""
        res = self.session.get(f"{BASE_URL}/api/presence/entity/social_post/nonexistent_post_id")
        
        assert res.status_code == 200
        data = res.json()
        assert data["count"] == 0, "Should return empty viewers for nonexistent entity"
        assert len(data["viewers"]) == 0
    
    def test_get_entity_presence_unauthenticated_fails(self):
        """Test that unauthenticated entity presence request fails"""
        new_session = requests.Session()
        
        res = new_session.get(f"{BASE_URL}/api/presence/entity/social_post/test")
        
        assert res.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {res.status_code}"
    
    # === LEAVE ENTITY ENDPOINT TESTS ===
    
    def test_leave_entity_clears_presence(self):
        """Test POST /api/presence/leave clears entity presence"""
        # First set entity presence
        self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={
            "page": "demand-studio/social-media",
            "entity_type": "social_post",
            "entity_id": "post_to_leave",
            "entity_title": "Post I'm Leaving"
        })
        
        # Then leave
        res = self.session.post(f"{BASE_URL}/api/presence/leave", json={})
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("ok") == True
    
    def test_leave_entity_unauthenticated_fails(self):
        """Test that unauthenticated leave request fails"""
        new_session = requests.Session()
        
        res = new_session.post(f"{BASE_URL}/api/presence/leave", json={})
        
        assert res.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {res.status_code}"
    
    # === PRESENCE DATA STRUCTURE TESTS ===
    
    def test_presence_user_data_structure(self):
        """Test that presence records contain expected user data fields"""
        # Send heartbeat with entity
        self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={
            "page": "test-page",
            "entity_type": "test_entity",
            "entity_id": "entity_123",
            "entity_title": "Test Entity Title"
        })
        
        # Create a second session to see the first user's presence
        session2 = requests.Session()
        login_res = session2.post(f"{BASE_URL}/api/auth/login", json={
            "email": "evoque@emergent.com",  # Try alternate test user
            "password": "emergent123"
        })
        
        if login_res.status_code != 200:
            # Skip this test if second user unavailable
            pytest.skip("Second test user not available for presence data structure test")
        
        res = session2.get(f"{BASE_URL}/api/presence/online")
        
        if res.status_code == 200 and res.json().get("online_users"):
            user = res.json()["online_users"][0]
            # Check expected fields exist in presence record
            expected_fields = ["user_id", "name", "email", "page", "last_seen"]
            for field in expected_fields:
                assert field in user, f"Missing expected field '{field}' in presence record: {user}"


class TestPresenceIntegration:
    """Integration tests for presence system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_res.status_code != 200:
            pytest.skip("Login failed")
        
        yield
        
        # Cleanup
        try:
            self.session.post(f"{BASE_URL}/api/presence/leave")
        except:
            pass
    
    def test_full_presence_workflow(self):
        """Test complete presence workflow: heartbeat -> check online -> leave"""
        # Step 1: Send heartbeat
        heartbeat_res = self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={
            "page": "demand-studio/social-media"
        })
        assert heartbeat_res.status_code == 200, "Heartbeat should succeed"
        
        # Step 2: Check online users
        online_res = self.session.get(f"{BASE_URL}/api/presence/online")
        assert online_res.status_code == 200, "Online users should return"
        
        # Step 3: Send heartbeat with entity
        entity_heartbeat_res = self.session.post(f"{BASE_URL}/api/presence/heartbeat", json={
            "page": "demand-studio/social-media",
            "entity_type": "social_post",
            "entity_id": "post_workflow_test"
        })
        assert entity_heartbeat_res.status_code == 200, "Entity heartbeat should succeed"
        
        # Step 4: Leave entity
        leave_res = self.session.post(f"{BASE_URL}/api/presence/leave", json={})
        assert leave_res.status_code == 200, "Leave should succeed"
    
    def test_presence_with_social_post_entity(self):
        """Test presence for editing a social post specifically"""
        # This tests the specific use case shown in SocialMediaPage
        payload = {
            "page": "demand-studio/social-media",
            "entity_type": "social_post",
            "entity_id": "post_f6f2934fbcfc",  # Using a realistic post ID format
            "entity_title": "Test Social Post"
        }
        
        res = self.session.post(f"{BASE_URL}/api/presence/heartbeat", json=payload)
        assert res.status_code == 200
        
        # Verify entity presence endpoint works
        entity_res = self.session.get(f"{BASE_URL}/api/presence/entity/social_post/post_f6f2934fbcfc")
        assert entity_res.status_code == 200
        assert "viewers" in entity_res.json()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
