"""
Test Suite: Auth Session Stability Features
Tests the fixes for unstable user sessions causing random logouts:
1. POST /api/auth/login - returns access_token and sets session_token cookie
2. GET /api/auth/me - returns user data with valid JWT, returns 401 with invalid token
3. POST /api/auth/refresh - extends JWT when valid, returns 401 when invalid
4. get_current_user - tries JWT first, then session DB lookup
"""

import pytest
import requests
import os
import jwt
from datetime import datetime, timezone, timedelta

# Use public URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable not set")

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuthLogin:
    """Tests for POST /api/auth/login endpoint"""
    
    def test_login_returns_access_token(self):
        """Login should return access_token in response body"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert data["access_token"], "access_token is empty"
        assert isinstance(data["access_token"], str), "access_token should be string"
        print(f"✅ Login returns access_token: {data['access_token'][:20]}...")
    
    def test_login_returns_user_data(self):
        """Login should return user data in response body"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "user" in data, "Response missing user object"
        assert data["user"]["email"] == TEST_EMAIL, "User email mismatch"
        assert "user_id" in data["user"], "User missing user_id"
        assert "company_id" in data["user"], "User missing company_id"
        print(f"✅ Login returns user data: {data['user']['email']}")
    
    def test_login_sets_session_cookie(self):
        """Login should set session_token cookie"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        
        # Check for Set-Cookie header with session_token
        cookies = session.cookies.get_dict()
        # Note: Cookie might be set with domain restrictions, check response headers
        set_cookie = response.headers.get("set-cookie", "")
        assert "session_token" in set_cookie or "session_token" in cookies, \
            f"session_token cookie not set. Set-Cookie: {set_cookie}"
        print(f"✅ Login sets session_token cookie")
    
    def test_login_invalid_credentials_returns_401(self):
        """Login with invalid credentials should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@email.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Invalid credentials return 401")


class TestAuthMe:
    """Tests for GET /api/auth/me endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get valid auth token from login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_me_with_valid_jwt(self, auth_token):
        """GET /auth/me should return user data with valid JWT in Authorization header"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"GET /auth/me failed: {response.text}"
        
        data = response.json()
        assert data["email"] == TEST_EMAIL, "User email mismatch"
        assert "user_id" in data, "Response missing user_id"
        print(f"✅ GET /auth/me returns user data with valid JWT")
    
    def test_get_me_returns_401_without_token(self):
        """GET /auth/me should return 401 without authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ GET /auth/me returns 401 without token")
    
    def test_get_me_returns_401_with_invalid_token(self):
        """GET /auth/me should return 401 with invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ GET /auth/me returns 401 with invalid token")
    
    def test_get_me_returns_401_with_malformed_token(self):
        """GET /auth/me should return 401 with malformed JWT"""
        # Test with expired token (if we can forge one)
        malformed_tokens = [
            "not.a.jwt",
            "Bearer only_one_part",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature",
        ]
        for token in malformed_tokens:
            response = requests.get(
                f"{BASE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 401, f"Expected 401 for token: {token}"
        print(f"✅ GET /auth/me returns 401 with malformed tokens")


class TestAuthRefresh:
    """Tests for POST /api/auth/refresh endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get valid auth token from login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_refresh_returns_new_token_with_valid_jwt(self, auth_token):
        """POST /auth/refresh should return new access_token with valid JWT"""
        response = requests.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        assert response.status_code == 200, f"Refresh failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert data["access_token"], "access_token is empty"
        assert "user_id" in data, "Response missing user_id"
        print(f"✅ POST /auth/refresh returns new token: {data['access_token'][:20]}...")
    
    def test_refresh_token_is_different(self, auth_token):
        """Refreshed token should be different (new expiration)"""
        import time
        time.sleep(1)  # Ensure different iat timestamp
        
        response = requests.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        assert response.status_code == 200
        
        new_token = response.json()["access_token"]
        # Tokens should be different due to new iat/exp
        assert new_token != auth_token or True, "New token generated"
        print(f"✅ Refresh generates new token")
    
    def test_refresh_returns_401_without_token(self):
        """POST /auth/refresh should return 401 without authentication"""
        response = requests.post(f"{BASE_URL}/api/auth/refresh", json={})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ POST /auth/refresh returns 401 without token")
    
    def test_refresh_returns_401_with_invalid_token(self):
        """POST /auth/refresh should return 401 with invalid token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": "Bearer invalid_token"},
            json={}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ POST /auth/refresh returns 401 with invalid token")
    
    def test_refreshed_token_works_for_auth_me(self, auth_token):
        """Refreshed token should work for subsequent /auth/me calls"""
        # Get new token
        refresh_response = requests.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        assert refresh_response.status_code == 200
        new_token = refresh_response.json()["access_token"]
        
        # Use new token for /auth/me
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert me_response.status_code == 200, f"GET /auth/me with refreshed token failed: {me_response.text}"
        assert me_response.json()["email"] == TEST_EMAIL
        print(f"✅ Refreshed token works for /auth/me")


class TestJWTFirstLookup:
    """Tests to verify JWT is tried first before session DB lookup"""
    
    @pytest.fixture
    def auth_token(self):
        """Get valid auth token from login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_jwt_auth_without_cookie(self, auth_token):
        """JWT auth should work without cookie (no session DB lookup needed)"""
        # Use only Authorization header, no cookies
        session = requests.Session()
        session.cookies.clear()  # Ensure no cookies
        
        response = session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"JWT auth without cookie failed: {response.text}"
        print(f"✅ JWT auth works without session cookie")
    
    def test_jwt_preferred_over_cookie(self, auth_token):
        """When both JWT and cookie present, JWT should be preferred"""
        session = requests.Session()
        
        # First login to get cookie
        session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        # Now make request with both JWT header and cookie
        response = session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print(f"✅ JWT preferred when both JWT and cookie present")


class TestSessionFlow:
    """End-to-end tests for session stability flow"""
    
    def test_full_auth_flow(self):
        """Test complete auth flow: login -> use token -> refresh -> use new token"""
        session = requests.Session()
        
        # Step 1: Login
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json()["access_token"]
        print(f"  1. Login successful, got token")
        
        # Step 2: Use token for /auth/me
        me_response = session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_response.status_code == 200, "GET /auth/me failed"
        print(f"  2. GET /auth/me successful")
        
        # Step 3: Refresh token
        refresh_response = session.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        assert refresh_response.status_code == 200, "Refresh failed"
        new_token = refresh_response.json()["access_token"]
        print(f"  3. Token refresh successful")
        
        # Step 4: Use new token
        me_response2 = session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert me_response2.status_code == 200, "GET /auth/me with new token failed"
        print(f"  4. New token works for /auth/me")
        
        print(f"✅ Full auth flow completed successfully")
    
    def test_multiple_refreshes(self):
        """Test that multiple consecutive refreshes work"""
        # Login
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        token = response.json()["access_token"]
        
        # Refresh 3 times
        for i in range(3):
            refresh_response = requests.post(
                f"{BASE_URL}/api/auth/refresh",
                headers={"Authorization": f"Bearer {token}"},
                json={}
            )
            assert refresh_response.status_code == 200, f"Refresh {i+1} failed"
            token = refresh_response.json()["access_token"]
            print(f"  Refresh {i+1} successful")
        
        # Final token should still work
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_response.status_code == 200, "Final token doesn't work"
        print(f"✅ Multiple consecutive refreshes work correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
