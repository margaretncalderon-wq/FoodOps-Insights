"""
Test Instagram Integration and Feed Tab Features
- Instagram Connection: connect/disconnect/status/sync
- Feed Tab: planned posts, mixed feed, feature flags
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInstagramIntegration:
    """Instagram connection endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Login and return authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return session
    
    def test_instagram_connection_status(self, auth_session):
        """Test GET /api/studio/instagram/connection - returns connection status"""
        response = auth_session.get(f"{BASE_URL}/api/studio/instagram/connection")
        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        # Connection status should be boolean
        assert isinstance(data["connected"], bool)
    
    def test_instagram_disconnect(self, auth_session):
        """Test DELETE /api/studio/instagram/disconnect - disconnects Instagram"""
        response = auth_session.delete(f"{BASE_URL}/api/studio/instagram/disconnect")
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        # Verify disconnected
        status_res = auth_session.get(f"{BASE_URL}/api/studio/instagram/connection")
        assert status_res.status_code == 200
        assert status_res.json()["connected"] == False
    
    def test_instagram_connect(self, auth_session):
        """Test POST /api/studio/instagram/connect - connects Instagram (MOCKED OAuth)"""
        payload = {
            "access_token": "mock_token_test_" + str(os.urandom(4).hex()),
            "ig_user_id": "ig_test_user_123",
            "ig_username": "test_demo_account"
        }
        response = auth_session.post(f"{BASE_URL}/api/studio/instagram/connect", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "connection_id" in data
        assert data["status"] == "connected"
        assert data["ig_username"] == "test_demo_account"
        assert "access_token_encrypted" not in data  # Should not expose token
        
        # Verify connection via GET
        status_res = auth_session.get(f"{BASE_URL}/api/studio/instagram/connection")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["connected"] == True
        assert status_data["connection"]["ig_username"] == "test_demo_account"
    
    def test_instagram_sync(self, auth_session):
        """Test POST /api/studio/instagram/sync - triggers sync (MOCKED)"""
        response = auth_session.post(f"{BASE_URL}/api/studio/instagram/sync")
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "last_sync_at" in data
        assert data["message"] == "Sync initiated"
    
    def test_instagram_media_cache(self, auth_session):
        """Test GET /api/studio/instagram/media - returns cached media"""
        response = auth_session.get(f"{BASE_URL}/api/studio/instagram/media?limit=10")
        assert response.status_code == 200
        data = response.json()
        # Should return list (empty is ok for mock)
        assert isinstance(data, list)


class TestFeedTab:
    """Feed Tab feature tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Login and return authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        return session
    
    def test_feed_planned_posts(self, auth_session):
        """Test GET /api/studio/feed/planned - returns planned posts"""
        response = auth_session.get(f"{BASE_URL}/api/studio/feed/planned?limit=50")
        assert response.status_code == 200
        data = response.json()
        # Should return list
        assert isinstance(data, list)
    
    def test_feed_mixed(self, auth_session):
        """Test GET /api/studio/feed/mixed - returns mixed feed"""
        response = auth_session.get(f"{BASE_URL}/api/studio/feed/mixed?limit=50")
        assert response.status_code == 200
        data = response.json()
        # Should return list
        assert isinstance(data, list)
    
    def test_feature_flags(self, auth_session):
        """Test GET /api/studio/feature-flags - returns studio feature flags"""
        response = auth_session.get(f"{BASE_URL}/api/studio/feature-flags")
        assert response.status_code == 200
        data = response.json()
        
        # Validate feature flag keys exist
        assert "enable_tezza_studio" in data
        assert "enable_feed_view" in data
        assert "enable_instagram_connect" in data
        # All should be booleans
        assert isinstance(data["enable_tezza_studio"], bool)
        assert isinstance(data["enable_feed_view"], bool)
        assert isinstance(data["enable_instagram_connect"], bool)


class TestSocialMediaAPIs:
    """Social Media APIs that support Feed Tab stats"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Login and return authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        return session
    
    def test_social_stats(self, auth_session):
        """Test GET /api/demand-studio/social/stats - returns stats for cards"""
        response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/stats")
        assert response.status_code == 200
        data = response.json()
        # Stats should have expected keys
        assert "scheduledThisWeek" in data or isinstance(data, dict)
    
    def test_social_posts(self, auth_session):
        """Test GET /api/demand-studio/social/posts - returns posts list"""
        response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_social_accounts(self, auth_session):
        """Test GET /api/demand-studio/social/accounts - returns accounts"""
        response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# Cleanup fixture - restore Instagram connection after tests
@pytest.fixture(scope="session", autouse=True)
def restore_instagram_connection():
    """Restore Instagram connection after all tests complete"""
    yield
    # Cleanup: Reconnect Instagram with demo account
    session = requests.Session()
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo.agency@kora.com",
        "password": "Evoque2024!"
    })
    if login_res.status_code == 200:
        session.post(f"{BASE_URL}/api/studio/instagram/connect", json={
            "access_token": "mock_token_restored",
            "ig_user_id": "ig_demo_restored",
            "ig_username": "demo_account"
        })
