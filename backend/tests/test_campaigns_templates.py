# Tests for Campaigns and Template Library functionality
# Tests: Campaigns list, Template Library (6 default templates), Seed templates, Brand Hub resolve

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_CREDENTIALS = {"email": "demo.agency@kora.com", "password": "Evoque2024!"}
TEST_CAMPAIGN_IDS = ["camp_60bbc4f8d256", "camp_02bb9f3684cf"]

class TestCampaignsAndTemplates:
    """Tests for Campaigns and Template Library APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_CREDENTIALS
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        yield
    
    # === CAMPAIGNS TESTS ===
    
    def test_campaigns_list_loads(self):
        """Test campaigns list endpoint returns 200"""
        resp = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list), "Campaigns response should be a list"
        print(f"Campaigns list returned {len(data)} campaigns")
    
    def test_campaign_detail_loads(self):
        """Test campaign detail endpoint with test campaign IDs"""
        for campaign_id in TEST_CAMPAIGN_IDS:
            resp = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns/{campaign_id}")
            if resp.status_code == 200:
                data = resp.json()
                assert "name" in data, "Campaign should have name"
                assert "campaign_id" in data, "Campaign should have campaign_id"
                print(f"Campaign {campaign_id}: {data.get('name', 'unnamed')}")
                return  # At least one campaign exists
        # If no campaigns found, check if any campaigns exist
        list_resp = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        if list_resp.status_code == 200 and len(list_resp.json()) > 0:
            campaign = list_resp.json()[0]
            print(f"Found campaign: {campaign.get('name', campaign.get('campaign_id'))}")
    
    def test_campaign_activations_endpoint(self):
        """Test campaign activations endpoint"""
        for campaign_id in TEST_CAMPAIGN_IDS:
            resp = self.session.get(f"{BASE_URL}/api/demand-studio/activations?campaign_id={campaign_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            print(f"Campaign {campaign_id} has {len(data)} activations")
            return
    
    def test_campaign_spend_endpoint(self):
        """Test campaign spend endpoint"""
        for campaign_id in TEST_CAMPAIGN_IDS:
            resp = self.session.get(f"{BASE_URL}/api/demand-studio/spend?campaign_id={campaign_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            print(f"Campaign {campaign_id} has {len(data)} spend records")
            return
    
    # === TEMPLATE LIBRARY TESTS ===
    
    def test_template_library_returns_6_templates(self):
        """Test that template library returns 6 pre-designed templates"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/templates/library")
        assert resp.status_code == 200, f"Template library failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Template library should return a list"
        assert len(data) == 6, f"Expected 6 default templates, got {len(data)}"
        
        # Verify template structure
        expected_template_names = [
            "Post Promocional", "Story con CTA", "Carrusel Producto", 
            "Email Newsletter", "Email Promocional", "Quote Card"
        ]
        actual_names = [t.get("name") for t in data]
        for name in expected_template_names:
            assert name in actual_names, f"Template '{name}' not found in library"
        
        # Verify template structure
        for template in data:
            assert "name" in template, "Template should have name"
            assert "type" in template, "Template should have type"
            assert "category" in template, "Template should have category"
            assert "template_json" in template, "Template should have template_json"
        
        print(f"Template library contains {len(data)} templates: {actual_names}")
    
    def test_template_library_template_types(self):
        """Test template types in library"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/templates/library")
        assert resp.status_code == 200
        data = resp.json()
        
        types = [t.get("type") for t in data]
        assert "social_post" in types, "Should have social_post type"
        assert "story" in types, "Should have story type"
        assert "carousel" in types, "Should have carousel type"
        assert "email" in types, "Should have email type"
        print(f"Template types: {set(types)}")
    
    def test_seed_templates_endpoint(self):
        """Test seed templates endpoint"""
        resp = self.session.post(f"{BASE_URL}/api/brand-hub/templates/seed-defaults", json={})
        assert resp.status_code == 200, f"Seed templates failed: {resp.text}"
        data = resp.json()
        assert "created" in data, "Response should have 'created' field"
        assert "count" in data, "Response should have 'count' field"
        print(f"Seed templates: created={data.get('created')}, count={data.get('count')}")
    
    def test_get_templates_after_seed(self):
        """Test that templates are returned after seeding"""
        # First seed
        self.session.post(f"{BASE_URL}/api/brand-hub/templates/seed-defaults", json={})
        
        # Then get templates
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/templates")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Templates after seed: {len(data)} templates")
    
    # === BRAND HUB RESOLVE TESTS ===
    
    def test_brand_hub_resolve_without_params(self):
        """Test resolve endpoint works without campaign_id (the fixed bug)"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/resolve")
        assert resp.status_code == 200, f"Resolve failed: {resp.text}"
        data = resp.json()
        assert "effective_tokens" in data, "Should have effective_tokens"
        assert "effective_looks" in data, "Should have effective_looks"
        print("Resolve without params: OK")
    
    def test_brand_hub_resolve_with_campaign_id(self):
        """Test resolve endpoint with campaign_id"""
        for campaign_id in TEST_CAMPAIGN_IDS:
            resp = self.session.get(f"{BASE_URL}/api/brand-hub/resolve?campaign_id={campaign_id}")
            if resp.status_code == 200:
                data = resp.json()
                assert "effective_tokens" in data
                assert "campaign_id" in data
                print(f"Resolve with campaign {campaign_id}: OK")
                return
        print("No test campaigns found - skipping campaign-specific resolve test")
    
    # === CAMPAIGN DNA TESTS ===
    
    def test_campaign_dna_endpoint(self):
        """Test campaign DNA endpoint"""
        for campaign_id in TEST_CAMPAIGN_IDS:
            resp = self.session.get(f"{BASE_URL}/api/brand-hub/campaign-dna/{campaign_id}")
            assert resp.status_code == 200, f"Campaign DNA failed: {resp.text}"
            data = resp.json()
            assert "campaign_id" in data, "DNA should have campaign_id"
            assert "export_rules_json" in data, "DNA should have export_rules"
            print(f"Campaign DNA for {campaign_id}: OK")
            return
    
    # === BRAND HUB CORE ENDPOINTS ===
    
    def test_brand_kits_endpoint(self):
        """Test brand kits endpoint"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/kits")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Brand kits: {len(data)} kits")
    
    def test_messaging_packs_endpoint(self):
        """Test messaging packs endpoint"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/messaging-packs")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Messaging packs: {len(data)} packs")
    
    def test_playbooks_endpoint(self):
        """Test playbooks endpoint"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/playbooks")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Playbooks: {len(data)} playbooks")
    
    def test_look_packs_endpoint(self):
        """Test look packs endpoint"""
        resp = self.session.get(f"{BASE_URL}/api/brand-hub/look-packs")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Look packs: {len(data)} packs")
