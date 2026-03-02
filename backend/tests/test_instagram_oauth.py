"""
Test Instagram OAuth 2.0 endpoints for multi-tenant Instagram integration.
Tests the real OAuth flow implementation at /api/instagram/oauth/*
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestInstagramOAuthStart:
    """Tests for GET /api/instagram/oauth/start endpoint"""
    
    def test_oauth_start_returns_503_when_not_configured(self, auth_headers):
        """
        Without INSTAGRAM_APP_ID configured, endpoint should return 503
        This is the expected behavior per documentation
        """
        response = requests.get(
            f"{BASE_URL}/api/instagram/oauth/start",
            headers=auth_headers
        )
        
        # Should return 503 when not configured (expected behavior)
        assert response.status_code == 503, f"Expected 503, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "not configured" in data["detail"].lower() or "INSTAGRAM_APP_ID" in data["detail"]
        print(f"✓ OAuth start correctly returns 503 when not configured: {data['detail']}")
    
    def test_oauth_start_requires_authentication(self):
        """OAuth start should require valid auth token"""
        response = requests.get(f"{BASE_URL}/api/instagram/oauth/start")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"✓ OAuth start correctly requires authentication: {response.status_code}")


class TestInstagramOAuthCallback:
    """Tests for GET /api/instagram/oauth/callback endpoint"""
    
    def test_callback_endpoint_exists(self):
        """Callback endpoint should exist and handle missing parameters"""
        # Test without required params - should return 422 (validation error)
        response = requests.get(f"{BASE_URL}/api/instagram/oauth/callback")
        
        # Should return 422 for missing required params (code, state)
        assert response.status_code == 422, f"Expected 422 for missing params, got {response.status_code}"
        print(f"✓ OAuth callback endpoint exists and validates params: {response.status_code}")
    
    def test_callback_with_invalid_state(self):
        """Callback should handle invalid state gracefully"""
        response = requests.get(
            f"{BASE_URL}/api/instagram/oauth/callback",
            params={"code": "test_code", "state": "invalid_state"},
            allow_redirects=False  # Don't follow redirects
        )
        
        # Should redirect to frontend with error (302) or return error (503 if not configured)
        assert response.status_code in [302, 503], f"Expected 302 or 503, got {response.status_code}"
        
        if response.status_code == 302:
            location = response.headers.get("Location", "")
            assert "ig_error" in location or "invalid_state" in location
            print(f"✓ OAuth callback redirects with error for invalid state: {location}")
        else:
            print(f"✓ OAuth callback returns 503 when not configured")


class TestInstagramTokenRefresh:
    """Tests for POST /api/instagram/oauth/refresh endpoint"""
    
    def test_refresh_requires_authentication(self):
        """Token refresh should require valid auth token"""
        response = requests.post(f"{BASE_URL}/api/instagram/oauth/refresh")
        
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"✓ Token refresh correctly requires authentication: {response.status_code}")
    
    def test_refresh_returns_404_when_no_connection(self, auth_headers):
        """Token refresh should return 404 when no Instagram connection exists"""
        response = requests.post(
            f"{BASE_URL}/api/instagram/oauth/refresh",
            headers=auth_headers
        )
        
        # Should return 404 if no connection exists, or 503 if Instagram not configured
        assert response.status_code in [404, 503], f"Expected 404 or 503, got {response.status_code}"
        
        if response.status_code == 404:
            data = response.json()
            assert "connection" in data.get("detail", "").lower() or "not found" in data.get("detail", "").lower()
            print(f"✓ Token refresh correctly returns 404 when no connection: {data.get('detail')}")
        else:
            print(f"✓ Token refresh returns 503 (Instagram not configured)")


class TestInstagramMediaEndpoint:
    """Tests for GET /api/instagram/media endpoint"""
    
    def test_media_requires_authentication(self):
        """Media endpoint should require valid auth token"""
        response = requests.get(f"{BASE_URL}/api/instagram/media")
        
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"✓ Media endpoint correctly requires authentication: {response.status_code}")
    
    def test_media_returns_404_when_no_connection(self, auth_headers):
        """Media endpoint should return 404 when no Instagram connection"""
        response = requests.get(
            f"{BASE_URL}/api/instagram/media",
            headers=auth_headers
        )
        
        # Should return 404 if no connection exists
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert "connection" in data.get("detail", "").lower() or "not found" in data.get("detail", "").lower()
        print(f"✓ Media endpoint correctly returns 404 when no connection: {data.get('detail')}")
    
    def test_media_limit_parameter(self, auth_headers):
        """Media endpoint should accept limit parameter"""
        response = requests.get(
            f"{BASE_URL}/api/instagram/media",
            headers=auth_headers,
            params={"limit": 10}
        )
        
        # Should return 404 (no connection) but accept the limit param
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Media endpoint accepts limit parameter")


class TestInstagramProfileEndpoint:
    """Tests for GET /api/instagram/profile endpoint"""
    
    def test_profile_requires_authentication(self):
        """Profile endpoint should require valid auth token"""
        response = requests.get(f"{BASE_URL}/api/instagram/profile")
        
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"✓ Profile endpoint correctly requires authentication: {response.status_code}")
    
    def test_profile_returns_404_when_no_connection(self, auth_headers):
        """Profile endpoint should return 404 when no Instagram connection"""
        response = requests.get(
            f"{BASE_URL}/api/instagram/profile",
            headers=auth_headers
        )
        
        # Should return 404 if no connection exists
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert "connection" in data.get("detail", "").lower() or "not found" in data.get("detail", "").lower()
        print(f"✓ Profile endpoint correctly returns 404 when no connection: {data.get('detail')}")


class TestOAuthEndpointRouting:
    """Tests to verify OAuth endpoints are properly routed"""
    
    def test_all_instagram_oauth_routes_exist(self, auth_headers):
        """Verify all Instagram OAuth routes are accessible"""
        routes_to_test = [
            ("GET", "/api/instagram/oauth/start", 503),  # 503 when not configured
            ("GET", "/api/instagram/oauth/callback?code=test&state=test", [302, 503]),
            ("POST", "/api/instagram/oauth/refresh", [404, 503]),
            ("GET", "/api/instagram/media", 404),
            ("GET", "/api/instagram/profile", 404),
        ]
        
        for method, path, expected_status in routes_to_test:
            full_url = f"{BASE_URL}{path}"
            
            if method == "GET":
                response = requests.get(full_url, headers=auth_headers, allow_redirects=False)
            else:
                response = requests.post(full_url, headers=auth_headers)
            
            if isinstance(expected_status, list):
                assert response.status_code in expected_status, \
                    f"{method} {path}: Expected one of {expected_status}, got {response.status_code}"
            else:
                assert response.status_code == expected_status, \
                    f"{method} {path}: Expected {expected_status}, got {response.status_code}"
            
            print(f"✓ {method} {path} - Status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
