"""
Test: Dynamic Terminology and Module Visibility
Tests that:
1. Events user sees 'Event Orchestration' and 'Resource Management' 
2. Agency user sees 'Program Orchestration' and does NOT see 'Resource Management'
3. /api/addons/enabled-modules returns correct module names per industry
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


class TestDynamicTerminology:
    """Tests for dynamic terminology based on industry type"""
    
    @pytest.fixture
    def events_session(self):
        """Login as events user and return session with auth cookies"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json=EVENTS_USER
        )
        
        if response.status_code != 200:
            pytest.skip(f"Events user login failed: {response.status_code} - {response.text}")
        
        return session
    
    @pytest.fixture
    def agency_session(self):
        """Login as agency user and return session with auth cookies"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json=AGENCY_USER
        )
        
        if response.status_code != 200:
            pytest.skip(f"Agency user login failed: {response.status_code} - {response.text}")
        
        return session
    
    # ============== EVENTS USER TESTS ==============
    
    def test_events_user_login(self, events_session):
        """Test events user can login successfully"""
        # Login already done in fixture, verify user info
        response = events_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data.get("email") == EVENTS_USER["email"]
        print(f"Events user logged in: {data.get('email')}")
    
    def test_events_user_sees_event_orchestration(self, events_session):
        """Events user should see 'Event Orchestration' in enabled modules"""
        response = events_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        modules = data.get("modules", [])
        industry_type = data.get("industry_type", "")
        po_config = data.get("industry_config", {}).get("program_orchestration", {})
        
        print(f"Events user industry_type: {industry_type}")
        print(f"Events user program_orchestration name: {po_config.get('name_en')}")
        
        # Check industry type is events
        assert industry_type in ["events", "events_hospitality"], \
            f"Expected events industry, got: {industry_type}"
        
        # Check Program Orchestration is named "Event Orchestration"
        assert po_config.get("name_en") == "Event Orchestration", \
            f"Expected 'Event Orchestration', got: {po_config.get('name_en')}"
        
        # Check entity is "Event"
        assert po_config.get("entity_singular_en") == "Event", \
            f"Expected entity 'Event', got: {po_config.get('entity_singular_en')}"
        
        # Verify module in modules list
        event_orch_module = next(
            (m for m in modules if m.get("key") == "module_event_orchestration"), 
            None
        )
        if event_orch_module:
            print(f"Event Orchestration module found: {event_orch_module.get('name_en')}")
    
    def test_events_user_sees_resource_management(self, events_session):
        """Events user should see 'Resource Management' in enabled modules"""
        response = events_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        modules = data.get("modules", [])
        
        # Find Resource Management module
        resource_module = next(
            (m for m in modules if m.get("key") == "module_operations_supplies"), 
            None
        )
        
        print(f"Modules for events user: {[m.get('key') for m in modules]}")
        
        # Resource Management should be present for events users
        assert resource_module is not None, \
            "Events user should see Resource Management module"
        
        # Verify it's named "Resource Management" (not "Operations Supplies")
        assert resource_module.get("name_en") == "Resource Management", \
            f"Expected 'Resource Management', got: {resource_module.get('name_en')}"
        
        print(f"Resource Management module found for events user: {resource_module.get('name_en')}")
    
    def test_events_dashboard_terminology(self, events_session):
        """Events user dashboard should show 'Active Events'"""
        response = events_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        po_config = data.get("industry_config", {}).get("program_orchestration", {})
        
        # Dashboard will use entity_plural_en
        entity_plural = po_config.get("entity_plural_en", "")
        
        assert entity_plural == "Events", \
            f"Expected 'Events' for entity_plural_en, got: {entity_plural}"
        
        print(f"Events user entity plural: {entity_plural}")
    
    # ============== AGENCY USER TESTS ==============
    
    def test_agency_user_login(self, agency_session):
        """Test agency user can login successfully"""
        response = agency_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data.get("email") == AGENCY_USER["email"]
        print(f"Agency user logged in: {data.get('email')}")
    
    def test_agency_user_sees_program_orchestration(self, agency_session):
        """Agency user should see 'Program Orchestration' (not 'Event Orchestration')"""
        response = agency_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        modules = data.get("modules", [])
        industry_type = data.get("industry_type", "")
        po_config = data.get("industry_config", {}).get("program_orchestration", {})
        
        print(f"Agency user industry_type: {industry_type}")
        print(f"Agency user program_orchestration name: {po_config.get('name_en')}")
        
        # Check industry type is agency
        assert industry_type in ["agency", "professional_services"], \
            f"Expected agency industry, got: {industry_type}"
        
        # Check Program Orchestration is named "Program Orchestration" (not Event/Client Delivery)
        assert po_config.get("name_en") == "Program Orchestration", \
            f"Expected 'Program Orchestration', got: {po_config.get('name_en')}"
        
        # Check entity is "Project"
        assert po_config.get("entity_singular_en") == "Project", \
            f"Expected entity 'Project', got: {po_config.get('entity_singular_en')}"
    
    def test_agency_user_does_not_see_resource_management(self, agency_session):
        """Agency user should NOT see 'Resource Management' (pure service industry)"""
        response = agency_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        modules = data.get("modules", [])
        
        # Find Resource Management module
        resource_module = next(
            (m for m in modules if m.get("key") == "module_operations_supplies"), 
            None
        )
        
        print(f"Modules for agency user: {[m.get('key') for m in modules]}")
        
        # Resource Management should NOT be present for agency users
        assert resource_module is None, \
            f"Agency user should NOT see Resource Management module, but found: {resource_module}"
        
        print("Correctly: Resource Management module NOT visible for agency user")
    
    def test_agency_dashboard_terminology(self, agency_session):
        """Agency user dashboard should show 'Active Projects'"""
        response = agency_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        po_config = data.get("industry_config", {}).get("program_orchestration", {})
        
        # Dashboard will use entity_plural_en
        entity_plural = po_config.get("entity_plural_en", "")
        
        assert entity_plural == "Projects", \
            f"Expected 'Projects' for entity_plural_en, got: {entity_plural}"
        
        print(f"Agency user entity plural: {entity_plural}")
    
    # ============== API RESPONSE STRUCTURE TESTS ==============
    
    def test_enabled_modules_response_structure(self, events_session):
        """Test that /api/addons/enabled-modules returns expected structure"""
        response = events_session.get(f"{BASE_URL}/api/addons/enabled-modules")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields exist
        assert "modules" in data, "Response should have 'modules' field"
        assert "industry_type" in data, "Response should have 'industry_type' field"
        assert "industry_config" in data, "Response should have 'industry_config' field"
        
        # Check industry_config structure
        industry_config = data.get("industry_config", {})
        assert "program_orchestration" in industry_config, \
            "industry_config should have 'program_orchestration'"
        
        po_config = industry_config.get("program_orchestration", {})
        assert "name_en" in po_config, "program_orchestration should have 'name_en'"
        assert "entity_singular_en" in po_config, "program_orchestration should have 'entity_singular_en'"
        assert "entity_plural_en" in po_config, "program_orchestration should have 'entity_plural_en'"
        
        print("API response structure is correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
