# Test Template Creation Features - Create Template from BrandHub, Upload, Save as Template from Studio
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTemplateCreateFeatures:
    """Tests for template creation features: Create Template dialog, Upload, Save as Template from Studio"""
    
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
        
        self.test_template_ids = []  # Track templates for cleanup
        yield
        
        # Cleanup test templates
        for template_id in self.test_template_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/brand-hub/templates/{template_id}")
            except:
                pass
                
    # ==== Test POST /api/brand-hub/templates ====
    def test_create_template_endpoint_basic(self):
        """Test POST /api/brand-hub/templates creates new template with required fields"""
        unique_name = f"TEST_Basic_Template_{uuid.uuid4().hex[:8]}"
        
        template_data = {
            "name": unique_name,
            "type": "social_post",
            "template_json": {"aspect_ratio": "1:1"},
            "auto_applies_tokens": True,
            "is_default": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        assert "template_id" in result, "Response missing template_id"
        assert result["name"] == unique_name, f"Name mismatch: {result['name']}"
        assert result["type"] == "social_post", f"Type mismatch: {result['type']}"
        
        self.test_template_ids.append(result["template_id"])
        print(f"SUCCESS: Created template with ID: {result['template_id']}")
        
    def test_create_template_with_category_field(self):
        """Test POST /api/brand-hub/templates creates template with category field"""
        unique_name = f"TEST_Category_Template_{uuid.uuid4().hex[:8]}"
        
        template_data = {
            "name": unique_name,
            "type": "social_post",
            "category": "promotion",  # Test category field
            "template_json": {"aspect_ratio": "1:1"},
            "auto_applies_tokens": True,
            "is_default": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        assert result.get("category") == "promotion", f"Category not saved: {result.get('category')}"
        
        self.test_template_ids.append(result["template_id"])
        print(f"SUCCESS: Created template with category='promotion', ID: {result['template_id']}")
        
    def test_create_template_with_all_types(self):
        """Test creating templates with different type values"""
        types_to_test = ["social_post", "story", "carousel", "email", "banner"]
        
        for tpl_type in types_to_test:
            unique_name = f"TEST_Type_{tpl_type}_{uuid.uuid4().hex[:8]}"
            
            template_data = {
                "name": unique_name,
                "type": tpl_type,
                "category": "custom",
                "template_json": {"aspect_ratio": "1:1"},
                "auto_applies_tokens": True,
                "is_default": False
            }
            
            response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
            assert response.status_code == 200, f"Failed for type '{tpl_type}': {response.text}"
            
            result = response.json()
            assert result["type"] == tpl_type, f"Type mismatch for '{tpl_type}'"
            
            self.test_template_ids.append(result["template_id"])
            print(f"  Created template type: {tpl_type}")
            
        print(f"SUCCESS: All {len(types_to_test)} template types created successfully")
        
    def test_create_template_with_all_categories(self):
        """Test creating templates with different category values"""
        categories = ["custom", "promotion", "engagement", "product", "newsletter"]
        
        for category in categories:
            unique_name = f"TEST_Cat_{category}_{uuid.uuid4().hex[:8]}"
            
            template_data = {
                "name": unique_name,
                "type": "social_post",
                "category": category,
                "template_json": {"aspect_ratio": "1:1"},
                "auto_applies_tokens": True,
                "is_default": False
            }
            
            response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
            assert response.status_code == 200, f"Failed for category '{category}': {response.text}"
            
            result = response.json()
            assert result.get("category") == category, f"Category mismatch for '{category}'"
            
            self.test_template_ids.append(result["template_id"])
            print(f"  Created template category: {category}")
            
        print(f"SUCCESS: All {len(categories)} template categories created successfully")
        
    def test_create_template_with_preview_url(self):
        """Test creating template with preview_url (simulating uploaded image)"""
        unique_name = f"TEST_Preview_Template_{uuid.uuid4().hex[:8]}"
        
        template_data = {
            "name": unique_name,
            "type": "social_post",
            "category": "custom",
            "template_json": {"aspect_ratio": "1:1"},
            "preview_url": "/api/uploads/test_preview.png",  # Simulated uploaded URL
            "auto_applies_tokens": True,
            "is_default": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        assert result.get("preview_url") == "/api/uploads/test_preview.png", \
            f"Preview URL not saved: {result.get('preview_url')}"
        
        self.test_template_ids.append(result["template_id"])
        print(f"SUCCESS: Created template with preview_url, ID: {result['template_id']}")
        
    def test_create_template_from_studio_with_filters(self):
        """Test creating template from Studio Editor (simulating Save as Template)"""
        unique_name = f"TEST_Studio_Template_{uuid.uuid4().hex[:8]}"
        
        # This simulates the handleSaveAsTemplate in StudioEditor.js
        template_data = {
            "name": unique_name,
            "type": "story",
            "category": "engagement",
            "template_json": {
                "aspect_ratio": "4:5",
                "look_id": "look_123",
                "sliders": {
                    "exposure": 10,
                    "contrast": 5,
                    "saturation": 15,
                    "temperature": -5
                },
                "source_asset": "asset_xyz"
            },
            "preview_url": "https://example.com/preview.jpg",
            "auto_applies_tokens": True,
            "is_default": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        result = response.json()
        assert result["name"] == unique_name
        assert result["type"] == "story"
        assert result["category"] == "engagement"
        
        # Verify template_json contains filter settings
        tpl_json = result.get("template_json", {})
        assert tpl_json.get("aspect_ratio") == "4:5", "aspect_ratio not saved"
        assert tpl_json.get("look_id") == "look_123", "look_id not saved"
        assert "sliders" in tpl_json, "sliders not saved"
        
        self.test_template_ids.append(result["template_id"])
        print(f"SUCCESS: Created template from Studio with filters, ID: {result['template_id']}")

    # ==== Test Upload Endpoint ====
    def test_upload_endpoint_exists(self):
        """Test that POST /api/upload endpoint exists and requires auth"""
        # Test without file - should fail with 422 (validation error)
        response = self.session.post(f"{BASE_URL}/api/upload")
        # Expecting 422 (unprocessable entity) because file is required
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print(f"SUCCESS: Upload endpoint exists and validates input (status: {response.status_code})")

    # ==== Test Template List Refresh ====
    def test_template_list_includes_new_template(self):
        """Test that GET /api/brand-hub/templates includes newly created template"""
        unique_name = f"TEST_ListCheck_Template_{uuid.uuid4().hex[:8]}"
        
        # Create template
        template_data = {
            "name": unique_name,
            "type": "social_post",
            "category": "custom",
            "template_json": {"aspect_ratio": "1:1"},
            "auto_applies_tokens": True,
            "is_default": False
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        assert create_response.status_code == 200
        created = create_response.json()
        self.test_template_ids.append(created["template_id"])
        
        # Fetch templates list
        list_response = self.session.get(f"{BASE_URL}/api/brand-hub/templates")
        assert list_response.status_code == 200, f"Failed: {list_response.text}"
        
        templates = list_response.json()
        template_names = [t.get("name") for t in templates]
        
        assert unique_name in template_names, f"New template '{unique_name}' not found in list"
        print(f"SUCCESS: New template appears in templates list (total: {len(templates)} templates)")

    # ==== Test TemplateCreate Model Validation ====
    def test_create_template_missing_name(self):
        """Test creating template without name fails"""
        template_data = {
            "type": "social_post",
            "category": "custom",
            "template_json": {"aspect_ratio": "1:1"}
        }
        
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        # Should fail with validation error
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"SUCCESS: Missing name correctly rejected (status: {response.status_code})")

    def test_create_template_missing_type(self):
        """Test creating template without type fails"""
        template_data = {
            "name": f"TEST_NoType_{uuid.uuid4().hex[:8]}",
            "category": "custom",
            "template_json": {"aspect_ratio": "1:1"}
        }
        
        response = self.session.post(f"{BASE_URL}/api/brand-hub/templates", json=template_data)
        # Should fail with validation error
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"SUCCESS: Missing type correctly rejected (status: {response.status_code})")


class TestStudioLooksForSaveAsTemplate:
    """Tests for Studio Looks - needed for Save as Template preview"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
    def test_studio_looks_returns_presets(self):
        """Test that studio looks endpoint returns presets for Save as Template preview"""
        response = self.session.get(f"{BASE_URL}/api/studio/looks")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        looks = response.json()
        assert isinstance(looks, list), "Response should be a list"
        print(f"SUCCESS: Studio looks returns {len(looks)} presets")
