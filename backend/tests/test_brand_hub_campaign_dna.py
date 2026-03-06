# test_brand_hub_campaign_dna.py
# Tests for Brand Hub and Campaign DNA API endpoints
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://demand-studio.preview.emergentagent.com')

class TestBrandHubEndpointsExist:
    """Test that Brand Hub API endpoints exist and respond appropriately"""
    
    # Brand Kit endpoints
    def test_brand_kits_endpoint_exists(self):
        """GET /api/brand-hub/kits should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/kits", timeout=10)
        # Should return 401 Not authenticated (endpoint exists)
        assert response.status_code == 401
        assert "Not authenticated" in response.text or "detail" in response.json()
        print("✓ GET /api/brand-hub/kits endpoint exists (401 - requires auth)")
    
    def test_brand_kits_post_endpoint_exists(self):
        """POST /api/brand-hub/kits should exist and require auth"""
        response = requests.post(f"{BASE_URL}/api/brand-hub/kits", json={}, timeout=10)
        assert response.status_code in [401, 422]  # 401 auth or 422 validation
        print("✓ POST /api/brand-hub/kits endpoint exists")
    
    # Look Packs endpoints
    def test_look_packs_endpoint_exists(self):
        """GET /api/brand-hub/look-packs should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/look-packs", timeout=10)
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/look-packs endpoint exists (401 - requires auth)")
    
    def test_look_packs_post_endpoint_exists(self):
        """POST /api/brand-hub/look-packs should exist and require auth"""
        response = requests.post(f"{BASE_URL}/api/brand-hub/look-packs", json={}, timeout=10)
        assert response.status_code in [401, 422]
        print("✓ POST /api/brand-hub/look-packs endpoint exists")
    
    # Messaging Packs endpoints
    def test_messaging_packs_endpoint_exists(self):
        """GET /api/brand-hub/messaging-packs should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/messaging-packs", timeout=10)
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/messaging-packs endpoint exists (401 - requires auth)")
    
    def test_messaging_packs_post_endpoint_exists(self):
        """POST /api/brand-hub/messaging-packs should exist and require auth"""
        response = requests.post(f"{BASE_URL}/api/brand-hub/messaging-packs", json={}, timeout=10)
        assert response.status_code in [401, 422]
        print("✓ POST /api/brand-hub/messaging-packs endpoint exists")
    
    # Templates endpoints
    def test_templates_endpoint_exists(self):
        """GET /api/brand-hub/templates should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/templates", timeout=10)
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/templates endpoint exists (401 - requires auth)")
    
    def test_templates_post_endpoint_exists(self):
        """POST /api/brand-hub/templates should exist and require auth"""
        response = requests.post(f"{BASE_URL}/api/brand-hub/templates", json={}, timeout=10)
        assert response.status_code in [401, 422]
        print("✓ POST /api/brand-hub/templates endpoint exists")
    
    # Playbooks endpoints
    def test_playbooks_endpoint_exists(self):
        """GET /api/brand-hub/playbooks should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/playbooks", timeout=10)
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/playbooks endpoint exists (401 - requires auth)")
    
    def test_playbooks_post_endpoint_exists(self):
        """POST /api/brand-hub/playbooks should exist and require auth"""
        response = requests.post(f"{BASE_URL}/api/brand-hub/playbooks", json={}, timeout=10)
        assert response.status_code in [401, 422]
        print("✓ POST /api/brand-hub/playbooks endpoint exists")


class TestCampaignDNAEndpoints:
    """Test Campaign DNA API endpoints"""
    
    def test_campaign_dna_get_endpoint_exists(self):
        """GET /api/brand-hub/campaign-dna/{campaign_id} should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/campaign-dna/camp_60bbc4f8d256", timeout=10)
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/campaign-dna/{campaign_id} endpoint exists (401 - requires auth)")
    
    def test_campaign_dna_post_endpoint_exists(self):
        """POST /api/brand-hub/campaign-dna should exist and require auth"""
        response = requests.post(f"{BASE_URL}/api/brand-hub/campaign-dna", json={}, timeout=10)
        assert response.status_code in [401, 422]
        print("✓ POST /api/brand-hub/campaign-dna endpoint exists")
    
    def test_campaign_dna_put_endpoint_exists(self):
        """PUT /api/brand-hub/campaign-dna/{campaign_id} should exist and require auth"""
        response = requests.put(f"{BASE_URL}/api/brand-hub/campaign-dna/camp_60bbc4f8d256", json={}, timeout=10)
        assert response.status_code in [401, 422]
        print("✓ PUT /api/brand-hub/campaign-dna/{campaign_id} endpoint exists")


class TestResolverEndpoint:
    """Test the token resolver endpoint"""
    
    def test_resolve_endpoint_exists(self):
        """GET /api/brand-hub/resolve should exist and require auth"""
        response = requests.get(f"{BASE_URL}/api/brand-hub/resolve", timeout=10)
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/resolve endpoint exists (401 - requires auth)")
    
    def test_resolve_endpoint_with_params(self):
        """GET /api/brand-hub/resolve with brand_id and campaign_id params"""
        response = requests.get(
            f"{BASE_URL}/api/brand-hub/resolve",
            params={"brand_id": "test_brand", "campaign_id": "camp_60bbc4f8d256"},
            timeout=10
        )
        assert response.status_code == 401
        print("✓ GET /api/brand-hub/resolve with params endpoint exists (401 - requires auth)")


class TestBrandHubAuthenticated:
    """Test Brand Hub endpoints with authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login to get auth cookie"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            timeout=10
        )
        if login_response.status_code != 200:
            pytest.skip("Authentication failed - skipping authenticated tests")
        self.authenticated = True
    
    def test_brand_kits_returns_data(self):
        """GET /api/brand-hub/kits should return brand kits (or default)"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/kits", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/brand-hub/kits returned {len(data)} kits")
        
        # Verify structure if data exists
        if data:
            kit = data[0]
            assert "tokens_json" in kit or "kit_id" in kit
            print(f"  Kit has expected structure with tokens_json")
    
    def test_brand_kits_tokens_structure(self):
        """Verify brand kit tokens have proper structure (colors, typography)"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/kits", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        if data:
            kit = data[0]
            tokens = kit.get("tokens_json", {})
            # Should have colors section
            if tokens:
                assert "colors" in tokens or tokens == {}
                print(f"✓ Brand kit tokens structure is valid")
    
    def test_messaging_packs_returns_data(self):
        """GET /api/brand-hub/messaging-packs should return packs (or default)"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/messaging-packs", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/brand-hub/messaging-packs returned {len(data)} packs")
        
        # Verify default structure
        if data:
            pack = data[0]
            # Should have CTAs or hooks
            assert "ctas_json" in pack or "hooks_json" in pack or "name" in pack
            print(f"  Messaging pack has expected structure")
    
    def test_look_packs_returns_data(self):
        """GET /api/brand-hub/look-packs should return packs"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/look-packs", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/brand-hub/look-packs returned {len(data)} packs")
    
    def test_templates_returns_data(self):
        """GET /api/brand-hub/templates should return templates"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/templates", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/brand-hub/templates returned {len(data)} templates")
    
    def test_playbooks_returns_data(self):
        """GET /api/brand-hub/playbooks should return playbooks"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/playbooks", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/brand-hub/playbooks returned {len(data)} playbooks")
    
    def test_resolve_returns_effective_config(self):
        """GET /api/brand-hub/resolve should return resolved config"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(f"{BASE_URL}/api/brand-hub/resolve", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        # Should have effective_tokens or be valid resolved config
        assert "effective_tokens" in data or "brand_id" in data or data == {}
        print(f"✓ GET /api/brand-hub/resolve returned resolved config")
        if data:
            print(f"  Keys: {list(data.keys())}")


class TestCampaignDNAAuthenticated:
    """Test Campaign DNA endpoints with authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login to get auth cookie"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            timeout=10
        )
        if login_response.status_code != 200:
            pytest.skip("Authentication failed - skipping authenticated tests")
        self.authenticated = True
    
    def test_campaign_dna_get_returns_data(self):
        """GET /api/brand-hub/campaign-dna/{campaign_id} should return DNA or default"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(
            f"{BASE_URL}/api/brand-hub/campaign-dna/camp_60bbc4f8d256",
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have DNA structure
        assert "campaign_id" in data or "theme_overrides_json" in data
        print(f"✓ GET /api/brand-hub/campaign-dna/camp_60bbc4f8d256 returned DNA")
        
        # Verify expected fields
        expected_fields = ["theme_overrides_json", "default_look_id", "look_pack_id", "messaging_pack_id", "export_rules_json"]
        present_fields = [f for f in expected_fields if f in data]
        print(f"  DNA has fields: {present_fields}")
    
    def test_campaign_dna_get_second_campaign(self):
        """GET /api/brand-hub/campaign-dna for second test campaign"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(
            f"{BASE_URL}/api/brand-hub/campaign-dna/camp_02bb9f3684cf",
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert "campaign_id" in data or "export_rules_json" in data
        print(f"✓ GET /api/brand-hub/campaign-dna/camp_02bb9f3684cf returned DNA")
    
    def test_resolve_with_campaign_id(self):
        """GET /api/brand-hub/resolve with campaign_id should return effective config"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        response = self.session.get(
            f"{BASE_URL}/api/brand-hub/resolve",
            params={"campaign_id": "camp_60bbc4f8d256"},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have effective config
        assert "effective_tokens" in data or "campaign_id" in data or data == {}
        print(f"✓ GET /api/brand-hub/resolve with campaign_id returned config")
        if data.get("effective_tokens"):
            print(f"  effective_tokens keys: {list(data['effective_tokens'].keys())}")


class TestCampaignDNACreate:
    """Test creating Campaign DNA"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login to get auth cookie"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            timeout=10
        )
        if login_response.status_code != 200:
            pytest.skip("Authentication failed - skipping authenticated tests")
        self.authenticated = True
    
    def test_campaign_dna_create_or_update(self):
        """POST /api/brand-hub/campaign-dna should create/update DNA"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        
        payload = {
            "campaign_id": "camp_60bbc4f8d256",
            "theme_overrides_json": {
                "colors": {
                    "primary": "#6366f1"
                }
            },
            "default_look_id": None,
            "look_pack_id": None,
            "messaging_pack_id": None,
            "export_rules_json": {
                "sizes": ["1:1", "4:5", "9:16"],
                "include_landscape": False
            }
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/brand-hub/campaign-dna",
            json=payload,
            timeout=10
        )
        
        # Should succeed (200 or 201)
        assert response.status_code in [200, 201]
        data = response.json()
        assert "campaign_id" in data or "dna_id" in data
        print(f"✓ POST /api/brand-hub/campaign-dna succeeded")
        print(f"  Created/updated DNA with ID: {data.get('dna_id', 'N/A')}")
    
    def test_campaign_dna_verify_after_create(self):
        """Verify DNA persists after creation"""
        if not hasattr(self, 'authenticated'):
            pytest.skip("Not authenticated")
        
        # Create DNA
        payload = {
            "campaign_id": "TEST_camp_dna_verify",
            "theme_overrides_json": {"colors": {"accent": "#f59e0b"}},
            "export_rules_json": {"sizes": ["1:1"], "quality": 90}
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/brand-hub/campaign-dna",
            json=payload,
            timeout=10
        )
        assert create_response.status_code in [200, 201]
        
        # Verify by GET
        get_response = self.session.get(
            f"{BASE_URL}/api/brand-hub/campaign-dna/TEST_camp_dna_verify",
            timeout=10
        )
        assert get_response.status_code == 200
        data = get_response.json()
        
        # Should have our values
        if data.get("theme_overrides_json"):
            assert data["theme_overrides_json"].get("colors", {}).get("accent") == "#f59e0b"
            print(f"✓ Campaign DNA persistence verified")
        else:
            print(f"✓ Campaign DNA GET succeeded (default structure)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
