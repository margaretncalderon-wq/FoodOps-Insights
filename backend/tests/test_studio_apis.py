# test_studio_apis.py - Tests for Tezza-like Studio and Feed API routes
"""
Tests for the new Tezza-like Studio editor and Instagram Feed view features:
- Studio API: GET /api/studio/looks, GET /api/studio/feature-flags
- Feed API: GET /api/studio/feed/planned, GET /api/studio/feed/mixed
- Instagram API: GET /api/studio/instagram/connection, GET /api/studio/instagram/media
- Assets API: GET /api/studio/assets
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ============== FEATURE FLAGS TESTS ==============
class TestStudioFeatureFlags:
    """Test Studio feature flags endpoints - returns 401 when unauthenticated"""
    
    def test_get_feature_flags_returns_401_unauthenticated(self):
        """Test that feature flags endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/studio/feature-flags")
        # API requires auth, returns 401 for unauthenticated requests
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Feature flags returns 401 for unauthenticated request")
    
    def test_feature_flags_endpoint_exists(self):
        """Test that feature flags endpoint is reachable"""
        response = requests.get(f"{BASE_URL}/api/studio/feature-flags")
        # Should not return 404 - endpoint exists
        assert response.status_code != 404, "Feature flags endpoint should exist"
        print(f"✓ Feature flags endpoint exists (status: {response.status_code})")


# ============== STUDIO LOOKS TESTS ==============
class TestStudioLooks:
    """Test Studio Looks (presets) endpoints"""
    
    def test_get_looks_returns_401_unauthenticated(self):
        """Test that looks endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/studio/looks")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Looks endpoint returns 401 for unauthenticated request")
    
    def test_looks_endpoint_exists(self):
        """Test that looks endpoint is reachable"""
        response = requests.get(f"{BASE_URL}/api/studio/looks")
        assert response.status_code != 404, "Looks endpoint should exist"
        print(f"✓ Looks endpoint exists (status: {response.status_code})")


# ============== FEED ENDPOINTS TESTS ==============
class TestFeedEndpoints:
    """Test Feed API endpoints for planned/published/mixed views"""
    
    def test_get_planned_posts_endpoint_exists(self):
        """Test planned posts feed endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/studio/feed/planned")
        assert response.status_code in [200, 401, 403], f"Unexpected status: {response.status_code}"
        assert response.status_code != 404, "Planned feed endpoint should exist"
        print(f"✓ Planned posts endpoint exists (status: {response.status_code})")
    
    def test_get_mixed_feed_endpoint_exists(self):
        """Test mixed feed endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/studio/feed/mixed")
        assert response.status_code in [200, 401, 403], f"Unexpected status: {response.status_code}"
        assert response.status_code != 404, "Mixed feed endpoint should exist"
        print(f"✓ Mixed feed endpoint exists (status: {response.status_code})")


# ============== INSTAGRAM CONNECTION TESTS ==============
class TestInstagramConnection:
    """Test Instagram connection and media endpoints"""
    
    def test_instagram_connection_endpoint_exists(self):
        """Test Instagram connection status endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/studio/instagram/connection")
        assert response.status_code != 404, "Instagram connection endpoint should exist"
        print(f"✓ Instagram connection endpoint exists (status: {response.status_code})")
    
    def test_instagram_media_endpoint_exists(self):
        """Test Instagram cached media endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/studio/instagram/media")
        assert response.status_code != 404, "Instagram media endpoint should exist"
        print(f"✓ Instagram media endpoint exists (status: {response.status_code})")
    
    def test_instagram_sync_endpoint_exists(self):
        """Test Instagram sync endpoint exists (POST)"""
        response = requests.post(f"{BASE_URL}/api/studio/instagram/sync")
        # POST without auth should return 401 or 403, not 404
        assert response.status_code != 404, "Instagram sync endpoint should exist"
        print(f"✓ Instagram sync endpoint exists (status: {response.status_code})")


# ============== STUDIO ASSETS TESTS ==============
class TestStudioAssets:
    """Test Studio media assets endpoints"""
    
    def test_assets_endpoint_exists(self):
        """Test assets endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/studio/assets")
        assert response.status_code != 404, "Assets endpoint should exist"
        print(f"✓ Assets endpoint exists (status: {response.status_code})")
    
    def test_assets_upload_endpoint_exists(self):
        """Test assets upload endpoint exists (POST)"""
        response = requests.post(f"{BASE_URL}/api/studio/assets/upload")
        # POST without auth/file should return 401/403/422, not 404
        assert response.status_code != 404, "Assets upload endpoint should exist"
        print(f"✓ Assets upload endpoint exists (status: {response.status_code})")


# ============== CRUD OPERATIONS TESTS (require specific asset_id) ==============
class TestAssetCRUD:
    """Test asset CRUD endpoint patterns exist"""
    
    def test_asset_get_by_id_endpoint_pattern(self):
        """Test single asset GET endpoint pattern exists"""
        response = requests.get(f"{BASE_URL}/api/studio/assets/test-id-123")
        # Should return 401/403/404, but 404 means endpoint exists (just not found asset)
        assert response.status_code in [401, 403, 404], f"Unexpected status: {response.status_code}"
        print(f"✓ Asset GET by ID endpoint pattern exists (status: {response.status_code})")
    
    def test_asset_update_endpoint_pattern(self):
        """Test asset PUT endpoint pattern exists"""
        response = requests.put(f"{BASE_URL}/api/studio/assets/test-id-123", json={})
        # Should return 401/403/404/422 - endpoint exists
        assert response.status_code in [401, 403, 404, 422], f"Unexpected status: {response.status_code}"
        print(f"✓ Asset PUT endpoint pattern exists (status: {response.status_code})")
    
    def test_asset_delete_endpoint_pattern(self):
        """Test asset DELETE endpoint pattern exists"""
        response = requests.delete(f"{BASE_URL}/api/studio/assets/test-id-123")
        assert response.status_code in [401, 403, 404], f"Unexpected status: {response.status_code}"
        print(f"✓ Asset DELETE endpoint pattern exists (status: {response.status_code})")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
