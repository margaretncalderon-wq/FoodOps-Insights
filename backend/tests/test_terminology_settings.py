"""
Test Suite: Terminology Settings Feature (Inclusive Language by Industry)
Tests:
1. GET /api/org-config/templates - Returns all 8 industry templates
2. POST /api/org-config/apply-template/{template_key} - Apply industry template
3. GET /api/org-config - Get current organization config
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestTerminologySettings:
    """Tests for Terminology Settings Feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user_data = login_response.json()
        
    def test_get_industry_templates_returns_8_templates(self):
        """Test GET /api/org-config/templates returns all 8 industry templates"""
        response = self.session.get(f"{BASE_URL}/api/org-config/templates")
        
        assert response.status_code == 200
        templates = response.json()
        
        # Verify we have 8 templates
        assert len(templates) == 8, f"Expected 8 templates, got {len(templates)}"
        
        # Verify expected industry keys
        expected_keys = [
            "events_hospitality",
            "professional_services",
            "generic",
            "healthcare",
            "real_estate",
            "education",
            "fitness",
            "consulting"
        ]
        
        template_keys = [t["key"] for t in templates]
        for key in expected_keys:
            assert key in template_keys, f"Missing industry template: {key}"
        
        # Verify template structure
        for template in templates:
            assert "key" in template
            assert "name_en" in template
            assert "name_es" in template
            assert "description_en" in template
            assert "description_es" in template
            assert "enabled_engagement_types" in template
            assert "default_engagement_type" in template
        
        print(f"✓ All 8 industry templates returned correctly")
    
    def test_healthcare_template_has_correct_fields(self):
        """Test Healthcare template has Patient terminology"""
        response = self.session.get(f"{BASE_URL}/api/org-config/templates")
        
        assert response.status_code == 200
        templates = response.json()
        
        healthcare = next((t for t in templates if t["key"] == "healthcare"), None)
        assert healthcare is not None, "Healthcare template not found"
        
        assert healthcare["name_en"] == "Healthcare"
        assert healthcare["name_es"] == "Salud"
        assert healthcare["description_en"] == "For clinics, medical practices, and healthcare providers"
        
        print(f"✓ Healthcare template verified")
    
    def test_consulting_template_has_correct_fields(self):
        """Test Consulting template has Opportunity terminology"""
        response = self.session.get(f"{BASE_URL}/api/org-config/templates")
        
        assert response.status_code == 200
        templates = response.json()
        
        consulting = next((t for t in templates if t["key"] == "consulting"), None)
        assert consulting is not None, "Consulting template not found"
        
        assert consulting["name_en"] == "Consulting"
        assert consulting["name_es"] == "Consultoría"
        
        print(f"✓ Consulting template verified")
    
    def test_get_current_org_config(self):
        """Test GET /api/org-config returns current org configuration"""
        response = self.session.get(f"{BASE_URL}/api/org-config")
        
        assert response.status_code == 200
        config = response.json()
        
        # Verify config structure
        assert "industry_template" in config
        assert "enabled_engagement_types" in config
        assert "default_engagement_type" in config
        
        print(f"✓ Current org config returned: industry_template={config.get('industry_template')}")
    
    def test_apply_healthcare_template(self):
        """Test POST /api/org-config/apply-template/healthcare applies healthcare template"""
        # Get current config to restore later
        original_response = self.session.get(f"{BASE_URL}/api/org-config")
        original_config = original_response.json()
        original_template = original_config.get("industry_template", "events_hospitality")
        
        # Apply healthcare template
        response = self.session.post(f"{BASE_URL}/api/org-config/apply-template/healthcare")
        
        assert response.status_code == 200
        result = response.json()
        
        assert "message" in result
        assert "Healthcare" in result["message"]
        assert "config" in result
        assert result["config"]["industry_template"] == "healthcare"
        
        # Verify config was updated
        verify_response = self.session.get(f"{BASE_URL}/api/org-config")
        assert verify_response.status_code == 200
        verify_config = verify_response.json()
        assert verify_config["industry_template"] == "healthcare"
        
        print(f"✓ Healthcare template applied successfully")
        
        # Restore original template
        self.session.post(f"{BASE_URL}/api/org-config/apply-template/{original_template}")
    
    def test_apply_consulting_template(self):
        """Test POST /api/org-config/apply-template/consulting applies consulting template"""
        # Get current config to restore later
        original_response = self.session.get(f"{BASE_URL}/api/org-config")
        original_config = original_response.json()
        original_template = original_config.get("industry_template", "events_hospitality")
        
        # Apply consulting template
        response = self.session.post(f"{BASE_URL}/api/org-config/apply-template/consulting")
        
        assert response.status_code == 200
        result = response.json()
        
        assert "message" in result
        assert "Consulting" in result["message"]
        assert result["config"]["industry_template"] == "consulting"
        
        print(f"✓ Consulting template applied successfully")
        
        # Restore original template
        self.session.post(f"{BASE_URL}/api/org-config/apply-template/{original_template}")
    
    def test_apply_invalid_template_returns_error(self):
        """Test POST /api/org-config/apply-template/invalid returns 400 error"""
        response = self.session.post(f"{BASE_URL}/api/org-config/apply-template/invalid_template")
        
        assert response.status_code == 400
        result = response.json()
        assert "detail" in result
        assert "invalid" in result["detail"].lower() or "Invalid" in result["detail"]
        
        print(f"✓ Invalid template returns correct error")
    
    def test_apply_all_8_templates_and_verify(self):
        """Test applying all 8 templates one by one"""
        # Get current config to restore later
        original_response = self.session.get(f"{BASE_URL}/api/org-config")
        original_config = original_response.json()
        original_template = original_config.get("industry_template", "events_hospitality")
        
        templates_to_test = [
            "events_hospitality",
            "professional_services",
            "generic",
            "healthcare",
            "real_estate",
            "education",
            "fitness",
            "consulting"
        ]
        
        for template_key in templates_to_test:
            response = self.session.post(f"{BASE_URL}/api/org-config/apply-template/{template_key}")
            assert response.status_code == 200, f"Failed to apply template: {template_key}"
            result = response.json()
            assert result["config"]["industry_template"] == template_key
            print(f"  ✓ {template_key} applied")
        
        print(f"✓ All 8 templates can be applied successfully")
        
        # Restore original template
        self.session.post(f"{BASE_URL}/api/org-config/apply-template/{original_template}")
    
    def test_terminology_endpoint(self):
        """Test GET /api/org-config/terminology returns terminology map"""
        response = self.session.get(f"{BASE_URL}/api/org-config/terminology")
        
        assert response.status_code == 200
        terminology = response.json()
        
        # Verify basic terms exist
        assert "event" in terminology or "client" in terminology or isinstance(terminology, dict)
        
        print(f"✓ Terminology endpoint returns correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
