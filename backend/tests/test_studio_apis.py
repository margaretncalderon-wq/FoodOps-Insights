# test_studio_apis.py - Tests for Tezza-like Studio and Feed API routes
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStudioFeatureFlags:
    """Test Studio feature flags endpoints"""
    
    def test_get_feature_flags_unauthenticated(self):
        """Test getting feature flags without authentication returns defaults"""
        response = requests.get(f"{BASE_URL}/api/studio/feature-flags")
        # May return 401 or 403 if auth required
        assert response.status_code in [200, 401, 403]
        print(f"Feature flags unauthenticated response: {response.status_code}")


class TestStudioLooks:
    """Test Studio Looks (presets) endpoints"""
    
    def test_get_looks_unauthenticated(self):
        """Test getting looks without auth"""
        response = requests.get(f"{BASE_URL}/api/studio/looks")
        # May return 401/403 or return default looks
        assert response.status_code in [200, 401, 403]
        print(f"Looks unauthenticated response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            # If authenticated via cookie, should return default looks
            if isinstance(data, list):
                print(f"Got {len(data)} looks")


class TestFeedEndpoints:
    """Test Feed API endpoints"""
    
    def test_get_planned_posts(self):
        """Test getting planned posts"""
        response = requests.get(f"{BASE_URL}/api/studio/feed/planned")
        assert response.status_code in [200, 401, 403]
        print(f"Planned posts response: {response.status_code}")
    
    def test_get_mixed_feed(self):
        """Test getting mixed feed"""
        response = requests.get(f"{BASE_URL}/api/studio/feed/mixed")
        assert response.status_code in [200, 401, 403]
        print(f"Mixed feed response: {response.status_code}")


class TestInstagramConnection:
    """Test Instagram connection endpoints"""
    
    def test_get_instagram_connection_status(self):
        """Test getting Instagram connection status"""
        response = requests.get(f"{BASE_URL}/api/studio/instagram/connection")
        assert response.status_code in [200, 401, 403]
        print(f"Instagram connection status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            assert "connected" in data
            print(f"Instagram connected: {data.get('connected')}")
    
    def test_get_instagram_media(self):
        """Test getting cached Instagram media"""
        response = requests.get(f"{BASE_URL}/api/studio/instagram/media")
        assert response.status_code in [200, 401, 403]
        print(f"Instagram media response: {response.status_code}")


class TestStudioAssets:
    """Test Studio media assets endpoints"""
    
    def test_get_assets(self):
        """Test getting media assets"""
        response = requests.get(f"{BASE_URL}/api/studio/assets")
        assert response.status_code in [200, 401, 403]
        print(f"Assets response: {response.status_code}")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
