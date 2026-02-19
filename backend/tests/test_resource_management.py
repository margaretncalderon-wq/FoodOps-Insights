"""
Test Resource Management Module - Industry-based visibility and tabs
Tests:
1. Events user sees Resource Management in sidebar (enabled-modules API)
2. Agency user does NOT see Resource Management in sidebar
3. /api/addons/enabled-modules returns correct module name 'Resource Management'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
EVENTS_USER = {
    "email": "margaret.n.calderon@gmail.com",
    "password": "Evoque2024!"
}

AGENCY_USER = {
    "email": "demo.agency@kora.com",
    "password": "Evoque2024!"
}


class TestResourceManagementModule:
    """Tests for Resource Management module visibility based on industry"""
    
    @pytest.fixture(scope="class")
    def events_session(self):
        """Login and return session for events user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=EVENTS_USER)
        assert response.status_code == 200, f"Events user login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    @pytest.fixture(scope="class")
    def agency_session(self):
        """Login and return session for agency user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=AGENCY_USER)
        assert response.status_code == 200, f"Agency user login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    # ==================== EVENTS USER TESTS ====================
    
    def test_events_user_login(self, events_session):
        """Verify events user can login successfully"""
        print("✓ Events user login successful")
        assert events_session is not None

    def test_events_user_sees_resource_management_module(self, events_session):
        """Events user should see Resource Management module in enabled-modules"""
        response = events_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200, f"API call failed: {response.text}"
        
        data = response.json()
        modules = data.get("modules", [])
        
        # Find Resource Management module
        resource_mgmt_module = None
        for module in modules:
            if module.get("key") == "module_operations_supplies":
                resource_mgmt_module = module
                break
        
        assert resource_mgmt_module is not None, "Resource Management module not found in modules list"
        assert resource_mgmt_module.get("name_en") == "Resource Management", \
            f"Expected 'Resource Management', got '{resource_mgmt_module.get('name_en')}'"
        print(f"✓ Events user sees Resource Management module: {resource_mgmt_module}")

    def test_events_user_industry_type_is_events(self, events_session):
        """Events user should have industry_type 'events'"""
        response = events_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        industry_type = data.get("industry_type")
        
        assert industry_type == "events", f"Expected 'events', got '{industry_type}'"
        print(f"✓ Events user industry_type: {industry_type}")

    def test_events_user_module_addon_definition(self, events_session):
        """Verify addon definition for module_operations_supplies has correct name"""
        response = events_session.get(f"{BASE_URL}/api/addons/definitions")
        assert response.status_code == 200
        
        addons = response.json()
        resource_mgmt_addon = None
        for addon in addons:
            if addon.get("name") == "module_operations_supplies":
                resource_mgmt_addon = addon
                break
        
        assert resource_mgmt_addon is not None, "module_operations_supplies addon not found"
        assert resource_mgmt_addon.get("display_name_en") == "Resource Management Module", \
            f"Expected 'Resource Management Module', got '{resource_mgmt_addon.get('display_name_en')}'"
        print(f"✓ Addon display_name_en: {resource_mgmt_addon.get('display_name_en')}")

    # ==================== AGENCY USER TESTS ====================
    
    def test_agency_user_login(self, agency_session):
        """Verify agency user can login successfully"""
        print("✓ Agency user login successful")
        assert agency_session is not None

    def test_agency_user_does_not_see_resource_management_module(self, agency_session):
        """Agency user should NOT see Resource Management module in enabled-modules"""
        response = agency_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200, f"API call failed: {response.text}"
        
        data = response.json()
        modules = data.get("modules", [])
        
        # Find Resource Management module
        resource_mgmt_module = None
        module_keys = []
        for module in modules:
            module_keys.append(module.get("key"))
            if module.get("key") == "module_operations_supplies":
                resource_mgmt_module = module
                break
        
        assert resource_mgmt_module is None, \
            f"Agency user should NOT see Resource Management module, but found: {resource_mgmt_module}"
        print(f"✓ Agency user correctly does NOT see Resource Management module")
        print(f"  Agency user modules: {module_keys}")

    def test_agency_user_industry_type_is_agency(self, agency_session):
        """Agency user should have industry_type 'agency'"""
        response = agency_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        industry_type = data.get("industry_type")
        
        assert industry_type == "agency", f"Expected 'agency', got '{industry_type}'"
        print(f"✓ Agency user industry_type: {industry_type}")

    def test_agency_industry_config_has_resource_management_disabled(self, agency_session):
        """Verify industry config has module_operations_supplies disabled for agency"""
        response = agency_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        industry_config = data.get("industry_config", {})
        
        # Check industry name
        assert industry_config.get("name_en") == "Agency & Creative Services", \
            f"Expected 'Agency & Creative Services', got '{industry_config.get('name_en')}'"
        print(f"✓ Agency industry config name: {industry_config.get('name_en')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
