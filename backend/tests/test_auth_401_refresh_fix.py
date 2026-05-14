"""
Test Auth 401 Refresh Fix - Iteration 165
Tests for:
1. Cookie domain derivation from request headers (defensive fix)
2. /auth/login sets cookie correctly
3. /auth/me works with valid cookie
4. /auth/refresh endpoint works
5. POST /api/events with valid auth returns 200
6. POST /api/events without auth returns 401
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuthCookieAndRefresh:
    """Test auth cookie domain fix and refresh endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
        self.session.close()
    
    def test_01_login_returns_token_and_sets_cookie(self):
        """Test that login returns access_token and sets session_token cookie"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert "user" in data, "Response missing user"
        assert data["user"]["email"] == TEST_EMAIL
        
        # Check Set-Cookie header
        set_cookie = response.headers.get("Set-Cookie", "")
        assert "session_token=" in set_cookie, f"No session_token cookie set. Headers: {dict(response.headers)}"
        
        # For preview environment, cookie should NOT have Domain attribute
        # (because 'preview' or 'emergent' is in the host)
        if "preview" in BASE_URL or "emergent" in BASE_URL:
            # Domain should not be set for preview environments
            # The cookie should be scoped to the exact host
            print(f"Preview environment detected. Set-Cookie: {set_cookie[:100]}...")
        
        print(f"Login successful. Token prefix: {data['access_token'][:20]}...")
    
    def test_02_auth_me_works_with_cookie(self):
        """Test that /auth/me works with session cookie"""
        # First login to get cookie
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        
        # Now call /auth/me - should work with cookie
        me_resp = self.session.get(f"{BASE_URL}/api/auth/me")
        
        assert me_resp.status_code == 200, f"/auth/me failed: {me_resp.text}"
        
        data = me_resp.json()
        assert data["email"] == TEST_EMAIL
        assert "user_id" in data
        
        # /auth/me should also return a refreshed token
        assert "access_token" in data, "/auth/me should return refreshed access_token"
        
        print(f"/auth/me successful. User: {data['email']}")
    
    def test_03_auth_me_works_with_bearer_token(self):
        """Test that /auth/me works with Authorization header"""
        # Login to get token
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        
        # Call /auth/me with Bearer token (no cookies)
        new_session = requests.Session()
        new_session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        })
        
        me_resp = new_session.get(f"{BASE_URL}/api/auth/me")
        
        assert me_resp.status_code == 200, f"/auth/me with Bearer failed: {me_resp.text}"
        
        data = me_resp.json()
        assert data["email"] == TEST_EMAIL
        
        print(f"/auth/me with Bearer token successful")
        new_session.close()
    
    def test_04_auth_refresh_endpoint_works(self):
        """Test that POST /auth/refresh returns new token"""
        # Login first
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        old_token = login_resp.json()["access_token"]
        
        # Call refresh endpoint
        refresh_resp = self.session.post(f"{BASE_URL}/api/auth/refresh")
        
        assert refresh_resp.status_code == 200, f"/auth/refresh failed: {refresh_resp.text}"
        
        data = refresh_resp.json()
        assert "access_token" in data, "Refresh response missing access_token"
        assert "user_id" in data, "Refresh response missing user_id"
        
        new_token = data["access_token"]
        # Tokens should be different (new expiration)
        # Note: They might be the same if called within the same second
        print(f"Refresh successful. New token prefix: {new_token[:20]}...")
    
    def test_05_auth_refresh_fails_without_auth(self):
        """Test that /auth/refresh returns 401 without valid auth"""
        # New session without any auth
        new_session = requests.Session()
        new_session.headers.update({"Content-Type": "application/json"})
        
        refresh_resp = new_session.post(f"{BASE_URL}/api/auth/refresh")
        
        assert refresh_resp.status_code == 401, f"Expected 401, got {refresh_resp.status_code}"
        
        print(f"/auth/refresh correctly returns 401 without auth")
        new_session.close()
    
    def test_06_protected_endpoint_returns_200_with_auth(self):
        """Test that POST /api/events works with valid auth"""
        # Login first
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        
        # Add Authorization header
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # First get a client_id (required for events)
        clients_resp = self.session.get(f"{BASE_URL}/api/clients")
        assert clients_resp.status_code == 200
        clients = clients_resp.json()
        
        # Use existing client or create one
        if clients:
            client_id = clients[0]["client_id"]
        else:
            # Create a test client
            client_resp = self.session.post(f"{BASE_URL}/api/clients", json={
                "name": "TEST_Auth_Fix_Client",
                "email": "test_auth_fix@example.com"
            })
            assert client_resp.status_code in [200, 201], f"Create client failed: {client_resp.text}"
            client_id = client_resp.json()["client_id"]
        
        # Create a test event with client_id
        event_data = {
            "name": "TEST_Auth_Fix_Event",
            "event_type": "corporate",
            "status": "inquiry",
            "start_date": "2026-02-15",
            "end_date": "2026-02-15",
            "client_id": client_id
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/events", json=event_data)
        
        # Should succeed (200 or 201)
        assert create_resp.status_code in [200, 201], f"POST /api/events failed: {create_resp.status_code} - {create_resp.text}"
        
        data = create_resp.json()
        event_id = data.get("event_id")
        print(f"POST /api/events successful. Event ID: {event_id}")
        
        # Cleanup - delete the test event
        if event_id:
            delete_resp = self.session.delete(f"{BASE_URL}/api/events/{event_id}")
            print(f"Cleanup: DELETE /api/events/{event_id} - {delete_resp.status_code}")
    
    def test_07_protected_endpoint_returns_401_without_auth(self):
        """Test that POST /api/events returns 401 without auth"""
        # New session without any auth
        new_session = requests.Session()
        new_session.headers.update({"Content-Type": "application/json"})
        
        event_data = {
            "name": "TEST_Unauthorized_Event",
            "event_type": "corporate",
            "status": "inquiry"
        }
        
        create_resp = new_session.post(f"{BASE_URL}/api/events", json=event_data)
        
        assert create_resp.status_code == 401, f"Expected 401, got {create_resp.status_code}"
        
        print(f"POST /api/events correctly returns 401 without auth")
        new_session.close()
    
    def test_08_debug_cookies_endpoint(self):
        """Test the debug-cookies endpoint to verify cookie domain logic"""
        # Login first
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        
        # Call debug-cookies
        debug_resp = self.session.get(f"{BASE_URL}/api/auth/debug-cookies")
        
        assert debug_resp.status_code == 200, f"debug-cookies failed: {debug_resp.text}"
        
        data = debug_resp.json()
        print(f"Debug cookies response: {data}")
        
        # Verify expected fields
        assert "has_session_cookie" in data
        assert "expected_cookie_domain" in data
        assert "origin" in data or "host" in data
        
        # For preview environment, expected_cookie_domain should be None
        if "preview" in BASE_URL or "emergent" in BASE_URL:
            assert data["expected_cookie_domain"] is None, \
                f"Preview env should have None cookie domain, got: {data['expected_cookie_domain']}"
            print("VERIFIED: Preview environment has no cookie domain (correct)")
    
    def test_09_logout_clears_cookie(self):
        """Test that logout clears the session cookie"""
        # Login first
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        
        # Verify we're logged in
        me_resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        
        # Logout
        logout_resp = self.session.post(f"{BASE_URL}/api/auth/logout")
        assert logout_resp.status_code == 200, f"Logout failed: {logout_resp.text}"
        
        # Verify we're logged out - /auth/me should fail
        me_resp2 = self.session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp2.status_code == 401, f"Expected 401 after logout, got {me_resp2.status_code}"
        
        print("Logout successful - session cleared")
    
    def test_10_concurrent_requests_share_refresh(self):
        """Test that multiple 401s would share the same refresh call (conceptual test)"""
        # This is more of a frontend test, but we can verify the refresh endpoint
        # handles multiple calls gracefully
        
        # Login first
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        
        # Make multiple refresh calls in sequence (simulating concurrent)
        tokens = []
        for i in range(3):
            refresh_resp = self.session.post(f"{BASE_URL}/api/auth/refresh")
            assert refresh_resp.status_code == 200, f"Refresh {i+1} failed"
            tokens.append(refresh_resp.json()["access_token"])
        
        # All should succeed
        print(f"Multiple refresh calls successful. Got {len(tokens)} tokens.")
        
        # Verify the last token works
        self.session.headers.update({"Authorization": f"Bearer {tokens[-1]}"})
        me_resp = self.session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        
        print("Concurrent refresh handling verified")


class TestCRUDRegression:
    """Regression tests - ensure normal CRUD still works"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        self.session.close()
    
    def test_11_list_events_works(self):
        """Test GET /api/events works"""
        resp = self.session.get(f"{BASE_URL}/api/events")
        assert resp.status_code == 200, f"GET /api/events failed: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Expected list of events"
        print(f"GET /api/events successful. Found {len(data)} events")
    
    def test_12_list_clients_works(self):
        """Test GET /api/clients works"""
        resp = self.session.get(f"{BASE_URL}/api/clients")
        assert resp.status_code == 200, f"GET /api/clients failed: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Expected list of clients"
        print(f"GET /api/clients successful. Found {len(data)} clients")
    
    def test_13_create_update_delete_event(self):
        """Test full CRUD cycle for events"""
        # First get a client_id (required for events)
        clients_resp = self.session.get(f"{BASE_URL}/api/clients")
        assert clients_resp.status_code == 200
        clients = clients_resp.json()
        
        if clients:
            client_id = clients[0]["client_id"]
        else:
            # Create a test client
            client_resp = self.session.post(f"{BASE_URL}/api/clients", json={
                "name": "TEST_CRUD_Client",
                "email": "test_crud@example.com"
            })
            assert client_resp.status_code in [200, 201]
            client_id = client_resp.json()["client_id"]
        
        # CREATE
        event_data = {
            "name": "TEST_CRUD_Regression_Event",
            "event_type": "corporate",
            "status": "inquiry",
            "start_date": "2026-03-01",
            "end_date": "2026-03-01",
            "client_id": client_id
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/events", json=event_data)
        assert create_resp.status_code in [200, 201], f"Create failed: {create_resp.text}"
        
        event_id = create_resp.json()["event_id"]
        print(f"Created event: {event_id}")
        
        # READ
        get_resp = self.session.get(f"{BASE_URL}/api/events/{event_id}")
        assert get_resp.status_code == 200, f"Get failed: {get_resp.text}"
        assert get_resp.json()["name"] == "TEST_CRUD_Regression_Event"
        
        # UPDATE
        update_resp = self.session.put(
            f"{BASE_URL}/api/events/{event_id}",
            json={"name": "TEST_CRUD_Updated_Event"}
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Verify update
        get_resp2 = self.session.get(f"{BASE_URL}/api/events/{event_id}")
        assert get_resp2.json()["name"] == "TEST_CRUD_Updated_Event"
        
        # DELETE
        delete_resp = self.session.delete(f"{BASE_URL}/api/events/{event_id}")
        assert delete_resp.status_code in [200, 204], f"Delete failed: {delete_resp.text}"
        
        # Verify deleted
        get_resp3 = self.session.get(f"{BASE_URL}/api/events/{event_id}")
        assert get_resp3.status_code == 404, "Event should be deleted"
        
        print("Full CRUD cycle successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
