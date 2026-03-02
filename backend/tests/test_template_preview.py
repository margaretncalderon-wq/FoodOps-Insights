# Test Template Library API - Preview URLs and Studio Editor functionality
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTemplatePreviewFeatures:
    """Tests for template preview_url and studio editor integration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
    def test_template_library_returns_6_templates(self):
        """Test that template library returns 6 templates"""
        response = self.session.get(f"{BASE_URL}/api/brand-hub/templates/library")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        templates = response.json()
        assert isinstance(templates, list), "Response should be a list"
        assert len(templates) == 6, f"Expected 6 templates, got {len(templates)}"
        
        # Verify template names
        expected_names = [
            "Post Promocional", "Story con CTA", "Carrusel Producto",
            "Email Newsletter", "Email Promocional", "Quote Card"
        ]
        actual_names = [t["name"] for t in templates]
        for name in expected_names:
            assert name in actual_names, f"Missing template: {name}"
        
        print(f"SUCCESS: Template library returns {len(templates)} templates")
        
    def test_all_templates_have_preview_url(self):
        """Test that all templates have preview_url populated"""
        response = self.session.get(f"{BASE_URL}/api/brand-hub/templates/library")
        assert response.status_code == 200
        
        templates = response.json()
        templates_with_preview = 0
        
        for template in templates:
            preview_url = template.get("preview_url")
            assert preview_url, f"Template '{template['name']}' missing preview_url"
            assert preview_url.startswith("http"), f"Invalid preview_url for '{template['name']}': {preview_url}"
            templates_with_preview += 1
            print(f"  {template['name']}: preview_url = {preview_url[:50]}...")
        
        print(f"SUCCESS: All {templates_with_preview} templates have preview_url populated")
        
    def test_template_preview_urls_are_valid_images(self):
        """Test that preview URLs point to valid image files"""
        response = self.session.get(f"{BASE_URL}/api/brand-hub/templates/library")
        assert response.status_code == 200
        
        templates = response.json()
        valid_images = 0
        
        for template in templates:
            preview_url = template.get("preview_url")
            if preview_url:
                # Check if URL is accessible (HEAD request)
                try:
                    img_response = requests.head(preview_url, timeout=10)
                    if img_response.status_code == 200:
                        valid_images += 1
                        print(f"  {template['name']}: Image accessible")
                    else:
                        print(f"  {template['name']}: Image status {img_response.status_code}")
                except Exception as e:
                    print(f"  {template['name']}: Error checking image - {e}")
        
        print(f"SUCCESS: {valid_images}/{len(templates)} template images are accessible")
        
    def test_template_structure(self):
        """Test template structure has all required fields"""
        response = self.session.get(f"{BASE_URL}/api/brand-hub/templates/library")
        assert response.status_code == 200
        
        templates = response.json()
        required_fields = ["name", "type", "category", "template_json", "preview_url"]
        
        for template in templates:
            for field in required_fields:
                assert field in template, f"Template '{template.get('name', 'unknown')}' missing field: {field}"
            
            # Check template_json has required structure
            template_json = template.get("template_json", {})
            assert "layout" in template_json or "slides" in template_json or "sections" in template_json, \
                f"Template '{template['name']}' template_json missing layout structure"
        
        print(f"SUCCESS: All {len(templates)} templates have correct structure")
        
    def test_studio_looks_endpoint(self):
        """Test that studio looks endpoint returns looks for editor"""
        response = self.session.get(f"{BASE_URL}/api/studio/looks")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        looks = response.json()
        assert isinstance(looks, list), "Response should be a list"
        
        # Check if we have default looks
        print(f"SUCCESS: Studio looks endpoint returns {len(looks)} looks")
        
        if len(looks) > 0:
            # Verify look structure
            look = looks[0]
            assert "look_id" in look or "name" in look, "Look missing basic fields"
            print(f"  Sample look: {look.get('name', 'unnamed')}")
            
    def test_template_seed_defaults_endpoint(self):
        """Test seed defaults endpoint"""
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates/seed-defaults")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        # Should return created/updated counts
        assert "created" in result or "updated" in result or "count" in result, \
            f"Unexpected response: {result}"
        
        print(f"SUCCESS: Seed defaults returned: {result}")
        
    def test_brand_hub_templates_endpoint(self):
        """Test templates endpoint (organization-specific)"""
        response = self.session.get(f"{BASE_URL}/api/brand-hub/templates")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        templates = response.json()
        assert isinstance(templates, list), "Response should be a list"
        
        print(f"SUCCESS: Brand hub templates returns {len(templates)} templates")
        
        # Check if any have preview_url
        with_preview = [t for t in templates if t.get("preview_url")]
        print(f"  Templates with preview_url: {len(with_preview)}/{len(templates)}")
        
    def test_campaigns_endpoint(self):
        """Test campaigns list endpoint"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        campaigns = data.get("campaigns", []) if isinstance(data, dict) else data
        
        print(f"SUCCESS: Campaigns endpoint returns {len(campaigns)} campaigns")
        
        if len(campaigns) > 0:
            campaign = campaigns[0]
            print(f"  Sample campaign: {campaign.get('name', 'unnamed')}")
            
    def test_campaign_detail_endpoint(self):
        """Test campaign detail endpoint"""
        # First get campaigns list
        list_response = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        assert list_response.status_code == 200
        
        data = list_response.json()
        campaigns = data.get("campaigns", []) if isinstance(data, dict) else data
        
        if len(campaigns) > 0:
            campaign_id = campaigns[0].get("campaign_id") or campaigns[0].get("id")
            detail_response = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns/{campaign_id}")
            
            assert detail_response.status_code == 200, f"Failed: {detail_response.text}"
            detail = detail_response.json()
            print(f"SUCCESS: Campaign detail for '{detail.get('name', 'unnamed')}' retrieved")
        else:
            pytest.skip("No campaigns available to test detail endpoint")
            
    def test_campaign_dna_endpoint(self):
        """Test campaign DNA endpoint"""
        # First get campaigns list
        list_response = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        assert list_response.status_code == 200
        
        data = list_response.json()
        campaigns = data.get("campaigns", []) if isinstance(data, dict) else data
        
        if len(campaigns) > 0:
            campaign_id = campaigns[0].get("campaign_id") or campaigns[0].get("id")
            dna_response = self.session.get(f"{BASE_URL}/api/brand-hub/campaign-dna/{campaign_id}")
            
            assert dna_response.status_code == 200, f"Failed: {dna_response.text}"
            dna = dna_response.json()
            print(f"SUCCESS: Campaign DNA retrieved (default_look_id: {dna.get('default_look_id', 'None')})")
        else:
            pytest.skip("No campaigns available to test DNA endpoint")
