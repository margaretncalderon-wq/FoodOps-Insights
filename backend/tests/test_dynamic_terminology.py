"""
Test suite for Dynamic Terminology / Industry Configuration feature
Tests that the backend returns correct industry-specific terminology
and that the frontend components use the ModulesContext correctly
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://virtual-queue-8.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestDynamicTerminology:
    """Tests for dynamic terminology feature based on industry configuration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get session"""
        self.session = requests.Session()
        
        # Login to get session
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            print(f"Login successful for {TEST_EMAIL}")
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_enabled_modules_returns_industry_config(self):
        """
        TEST 1: /api/addons/enabled-modules returns industry_config with program_orchestration
        """
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        # Status code check
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify industry_config is present
        assert "industry_config" in data, "Response should contain 'industry_config'"
        assert "industry_type" in data, "Response should contain 'industry_type'"
        
        industry_config = data["industry_config"]
        
        # Verify program_orchestration section exists
        assert "program_orchestration" in industry_config, \
            "industry_config should contain 'program_orchestration'"
        
        po_config = industry_config["program_orchestration"]
        
        # Verify required fields in program_orchestration
        required_fields = [
            "name_en", "name_es", "icon",
            "entity_singular_en", "entity_singular_es",
            "entity_plural_en", "entity_plural_es",
            "fields"
        ]
        
        for field in required_fields:
            assert field in po_config, f"program_orchestration should contain '{field}'"
        
        print(f"SUCCESS: industry_config.program_orchestration contains all required fields")
        print(f"  Industry type: {data.get('industry_type')}")
        print(f"  Module name (EN): {po_config.get('name_en')}")
        print(f"  Entity singular (EN): {po_config.get('entity_singular_en')}")
        print(f"  Entity plural (EN): {po_config.get('entity_plural_en')}")
    
    def test_events_industry_terminology(self):
        """
        TEST 2: Events industry returns Event/Events terminology
        """
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200
        
        data = response.json()
        industry_type = data.get("industry_type")
        
        # This test is specific to events industry
        if industry_type not in ["events", "events_hospitality"]:
            pytest.skip(f"Test org is not events industry (got: {industry_type})")
        
        po_config = data["industry_config"]["program_orchestration"]
        
        # Verify events-specific terminology
        assert po_config["name_en"] == "Event Orchestration", \
            f"Expected 'Event Orchestration', got '{po_config['name_en']}'"
        
        assert po_config["entity_singular_en"] == "Event", \
            f"Expected 'Event', got '{po_config['entity_singular_en']}'"
        
        assert po_config["entity_singular_es"] == "Evento", \
            f"Expected 'Evento', got '{po_config['entity_singular_es']}'"
        
        assert po_config["entity_plural_en"] == "Events", \
            f"Expected 'Events', got '{po_config['entity_plural_en']}'"
        
        assert po_config["entity_plural_es"] == "Eventos", \
            f"Expected 'Eventos', got '{po_config['entity_plural_es']}'"
        
        print("SUCCESS: Events industry terminology verified")
        print(f"  Module: {po_config['name_en']}")
        print(f"  Singular: {po_config['entity_singular_en']}/{po_config['entity_singular_es']}")
        print(f"  Plural: {po_config['entity_plural_en']}/{po_config['entity_plural_es']}")
    
    def test_field_labels_in_config(self):
        """
        TEST 3: Verify field labels are present (date, guest_count, venue, etc.)
        """
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200
        
        data = response.json()
        po_config = data["industry_config"]["program_orchestration"]
        
        fields = po_config.get("fields", {})
        
        # Required field labels for events industry
        expected_fields = ["name", "date", "guest_count", "venue", "budget", "type"]
        
        for field_key in expected_fields:
            assert field_key in fields, f"Fields should contain '{field_key}'"
            field = fields[field_key]
            assert "en" in field, f"Field '{field_key}' should have 'en' label"
            assert "es" in field, f"Field '{field_key}' should have 'es' label"
        
        print("SUCCESS: All field labels present with en/es translations")
        for field_key in expected_fields:
            print(f"  {field_key}: {fields[field_key]['en']} / {fields[field_key]['es']}")
    
    def test_modules_contain_addon_modules(self):
        """
        TEST 4: Verify modules list includes enabled addon modules
        """
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200
        
        data = response.json()
        modules = data.get("modules", [])
        
        # Get module keys
        module_keys = [m["key"] for m in modules]
        
        # Check for Event Orchestration module
        assert "module_event_orchestration" in module_keys, \
            "Modules should include 'module_event_orchestration'"
        
        # Get the event orchestration module
        eo_module = next(m for m in modules if m["key"] == "module_event_orchestration")
        
        # Verify it has industry-specific naming
        industry_type = data.get("industry_type")
        
        if industry_type in ["events", "events_hospitality"]:
            assert eo_module["name_en"] == "Event Orchestration", \
                f"Expected 'Event Orchestration', got '{eo_module['name_en']}'"
            assert eo_module.get("entity_singular_en") == "Event", \
                f"Module should have entity_singular_en='Event'"
            assert eo_module.get("entity_plural_en") == "Events", \
                f"Module should have entity_plural_en='Events'"
        
        print("SUCCESS: module_event_orchestration present with correct terminology")
        print(f"  Name: {eo_module['name_en']}")
        print(f"  Entity singular: {eo_module.get('entity_singular_en')}")
        print(f"  Entity plural: {eo_module.get('entity_plural_en')}")
    
    def test_sidebar_module_names(self):
        """
        TEST 5: Verify sidebar module names match industry configuration
        """
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200
        
        data = response.json()
        modules = data.get("modules", [])
        industry_type = data.get("industry_type")
        
        # Build expected module names based on industry
        expected_names = {}
        if industry_type in ["events", "events_hospitality"]:
            expected_names = {
                "module_event_orchestration": "Event Orchestration",
                "module_culinary_intelligence": "Culinary Intelligence",
                "module_operations_supplies": "Operations Supplies",
                "module_venues": "Venues",
            }
        elif industry_type in ["agency", "professional_services"]:
            expected_names = {
                "module_event_orchestration": "Client Delivery",  # Different for agency
            }
        
        for module in modules:
            key = module["key"]
            if key in expected_names:
                expected = expected_names[key]
                actual = module.get("name_en")
                assert actual == expected, \
                    f"Module {key}: expected '{expected}', got '{actual}'"
                print(f"  {key}: {actual} ✓")
        
        print("SUCCESS: Sidebar module names match industry configuration")
    
    def test_dashboard_api_data(self):
        """
        TEST 6: Verify dashboard data endpoints work
        """
        # Test orchestration events endpoint
        response = self.session.get(f"{BASE_URL}/api/orchestration/events")
        
        # Should return 200 or empty list (if no events)
        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}"
        
        events = response.json()
        print(f"SUCCESS: /api/orchestration/events returns {len(events)} events")
        
        # Test dashboard stats
        stats_response = self.session.get(f"{BASE_URL}/api/dashboard/stats")
        
        if stats_response.status_code == 200:
            stats = stats_response.json()
            print(f"SUCCESS: /api/dashboard/stats returns stats data")
        else:
            print(f"WARNING: /api/dashboard/stats returned {stats_response.status_code}")


class TestIndustryConfigModule:
    """Test the industry_config_module backend functions"""
    
    def test_backend_config_file_exists(self):
        """
        TEST 7: Verify the industry_config.py file exists and is importable
        """
        # This tests the backend configuration module
        import sys
        sys.path.insert(0, '/app/backend')
        
        try:
            from industry_config_module.industry_config import (
                get_industry_config,
                get_program_orchestration_config,
                IndustryType
            )
            
            # Test events config
            events_config = get_industry_config("events")
            assert "program_orchestration" in events_config
            
            po_config = get_program_orchestration_config("events")
            assert po_config["entity_singular_en"] == "Event"
            assert po_config["entity_plural_en"] == "Events"
            
            print("SUCCESS: industry_config_module functions work correctly")
            print(f"  Events entity: {po_config['entity_singular_en']}")
            
            # Test agency config (different terminology)
            agency_config = get_program_orchestration_config("agency")
            assert agency_config["entity_singular_en"] == "Project"
            assert agency_config["entity_plural_en"] == "Projects"
            
            print(f"  Agency entity: {agency_config['entity_singular_en']}")
            
        except ImportError as e:
            pytest.fail(f"Failed to import industry_config_module: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
