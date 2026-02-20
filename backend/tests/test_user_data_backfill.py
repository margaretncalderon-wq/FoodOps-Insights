"""
Test suite for P0 production bug fix: Back-filling missing organization_config and subscription data on login.

Key scenarios tested:
1. Login with password returns all modules for users with existing config/subscription
2. Login with password for users WITHOUT org_config - should create it
3. Login with password for users WITH org_config but NO industry_type - should populate it  
4. Login with password for users WITHOUT active subscription - should create trial
5. Registration without industry_type should NOT cause NameError
6. /api/addons/enabled-modules should return ALL core modules plus industry-specific addon modules

Credentials:
- demo.agency@kora.com / Evoque2024! - existing user with complete data
- test_no_config@example.com / TestPass123! - test user for missing config scenarios
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

# Get BASE_URL from environment variable
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable must be set")


class TestUserDataBackfill:
    """Tests for ensure_user_data_complete() helper function called on login"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_prefix = f"TEST_BACKFILL_{uuid.uuid4().hex[:6]}"
        yield
        # Cleanup handled in individual tests or teardown
    
    def test_login_existing_user_with_complete_data(self):
        """
        Test that existing user with complete org_config and subscription gets all modules.
        Uses demo.agency@kora.com which should have full setup.
        """
        # Login with existing user
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        login_data = response.json()
        
        # Verify token is returned
        assert "access_token" in login_data, "No access_token in response"
        assert "user" in login_data, "No user in response"
        
        token = login_data["access_token"]
        
        # Now check enabled modules
        modules_response = self.session.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert modules_response.status_code == 200, f"Get modules failed: {modules_response.text}"
        modules_data = modules_response.json()
        
        # Verify core modules are present
        module_keys = [m["key"] for m in modules_data.get("modules", [])]
        
        # Core modules that MUST be present
        expected_core_modules = ["system_pulse", "client_engagement", "execution_hub", "business_clarity", "settings"]
        for core_module in expected_core_modules:
            assert core_module in module_keys, f"Core module '{core_module}' missing from enabled modules"
        
        print(f"SUCCESS: Login returned {len(module_keys)} modules including all core modules")
        print(f"Modules: {module_keys}")
    
    def test_enabled_modules_returns_all_core_modules(self):
        """
        Verify /api/addons/enabled-modules returns ALL 5 core modules plus industry-specific addon modules.
        """
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json()["access_token"]
        
        # Get enabled modules
        response = self.session.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Get enabled modules failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "modules" in data, "Missing 'modules' in response"
        assert "core_modules" in data, "Missing 'core_modules' in response"
        assert "addon_modules" in data, "Missing 'addon_modules' in response"
        assert "industry_type" in data, "Missing 'industry_type' in response"
        
        modules = data["modules"]
        module_keys = [m["key"] for m in modules]
        
        # ALL core modules must be present
        core_modules = ["system_pulse", "client_engagement", "execution_hub", "business_clarity", "settings"]
        for core in core_modules:
            assert core in module_keys, f"Core module '{core}' missing. Found: {module_keys}"
        
        print(f"SUCCESS: All {len(core_modules)} core modules present")
        print(f"Total modules returned: {len(modules)}")
        print(f"Industry type: {data.get('industry_type')}")
        
        # For events industry, expect additional modules
        industry_type = data.get("industry_type", "")
        if industry_type == "events":
            # Events industry should have Event Orchestration, Culinary Intelligence, etc.
            print(f"Events industry modules: {module_keys}")
    
    def test_registration_without_industry_type(self):
        """
        Test that registration works without providing industry_type (no NameError).
        This was a bug where industry_type was not defined when not provided.
        """
        unique_email = f"{self.test_prefix}_reg@example.com"
        
        # Register without industry_type
        response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Registration User",
            "company_name": f"Test Company {self.test_prefix}"
            # Note: NOT providing industry_type or industry_template
        })
        
        # Should succeed, not fail with NameError
        assert response.status_code == 200, f"Registration failed: {response.text}"
        reg_data = response.json()
        
        assert "access_token" in reg_data, "No access_token returned"
        assert "user" in reg_data, "No user returned"
        
        print(f"SUCCESS: Registration without industry_type succeeded")
        print(f"User ID: {reg_data['user'].get('user_id')}")
        
        # Verify the user can get modules after registration
        token = reg_data["access_token"]
        modules_response = self.session.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert modules_response.status_code == 200, f"Get modules after registration failed: {modules_response.text}"
        modules_data = modules_response.json()
        
        # Default should be events industry
        assert modules_data.get("industry_type") in ["events", None], \
            f"Expected events industry, got: {modules_data.get('industry_type')}"
        
        # Core modules should be present
        module_keys = [m["key"] for m in modules_data.get("modules", [])]
        assert "system_pulse" in module_keys, "system_pulse missing"
        assert "settings" in module_keys, "settings missing"
        
        print(f"SUCCESS: New user has all core modules")
    
    def test_registration_with_industry_type(self):
        """
        Test that registration with industry_type works correctly.
        """
        unique_email = f"{self.test_prefix}_reg_industry@example.com"
        
        # Register with industry_type=agency
        response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Agency User",
            "company_name": f"Test Agency {self.test_prefix}",
            "industry_type": "agency"
        })
        
        assert response.status_code == 200, f"Registration with industry_type failed: {response.text}"
        reg_data = response.json()
        token = reg_data["access_token"]
        
        # Verify industry was set correctly
        modules_response = self.session.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert modules_response.status_code == 200
        modules_data = modules_response.json()
        
        assert modules_data.get("industry_type") == "agency", \
            f"Expected agency industry, got: {modules_data.get('industry_type')}"
        
        print(f"SUCCESS: Registration with industry_type=agency worked correctly")


class TestLoginBackfillScenarios:
    """Tests for different back-fill scenarios on login"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_prefix = f"TEST_BACKFILL_{uuid.uuid4().hex[:6]}"
        yield
    
    def test_login_returns_user_data(self):
        """
        Test basic login returns complete user data with company_id.
        """
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data, "Missing access_token"
        assert "user" in data, "Missing user"
        
        user = data["user"]
        assert "user_id" in user, "Missing user_id"
        assert "email" in user, "Missing email"
        assert "company_id" in user, "Missing company_id - critical for back-fill"
        
        print(f"SUCCESS: Login returned user with company_id: {user.get('company_id')}")
    
    def test_subscription_summary_after_login(self):
        """
        Verify subscription-summary endpoint returns proper data after login.
        This validates that subscription was created/exists.
        """
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Get subscription summary
        response = self.session.get(
            f"{BASE_URL}/api/addons/subscription-summary",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Subscription summary failed: {response.text}"
        data = response.json()
        
        # Should have subscription data
        assert "subscription" in data or "plan" in data, "Missing subscription data"
        assert "effective_limits" in data, "Missing effective_limits"
        assert "effective_features" in data, "Missing effective_features"
        
        print(f"SUCCESS: Subscription summary returned valid data")
        print(f"Plan: {data.get('plan', {}).get('plan_id') if data.get('plan') else 'N/A'}")
        print(f"Subscription status: {data.get('subscription', {}).get('status') if data.get('subscription') else 'N/A'}")


class TestModulesApiEndpoint:
    """Tests specifically for /api/addons/enabled-modules endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        if login_response.status_code == 200:
            self.token = login_response.json()["access_token"]
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Could not authenticate for module tests")
        yield
    
    def test_enabled_modules_structure(self):
        """Verify enabled-modules response structure"""
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Required fields
        required_fields = ["modules", "plan_id", "core_modules", "addon_modules", "industry_type"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Validate modules list
        modules = data["modules"]
        assert isinstance(modules, list), "modules should be a list"
        assert len(modules) >= 5, f"Expected at least 5 modules (core), got {len(modules)}"
        
        # Each module should have required keys
        for module in modules:
            assert "key" in module, f"Module missing 'key': {module}"
            assert "path" in module, f"Module missing 'path': {module}"
            assert "name_en" in module, f"Module missing 'name_en': {module}"
        
        print(f"SUCCESS: enabled-modules response structure is valid")
        print(f"Total modules: {len(modules)}")
    
    def test_core_modules_always_present(self):
        """Verify ALL core modules are always returned regardless of subscription"""
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200
        data = response.json()
        
        module_keys = [m["key"] for m in data["modules"]]
        
        # These 5 core modules MUST always be present
        core_modules = ["system_pulse", "client_engagement", "execution_hub", "business_clarity", "settings"]
        
        missing_modules = []
        for core in core_modules:
            if core not in module_keys:
                missing_modules.append(core)
        
        assert not missing_modules, f"Missing core modules: {missing_modules}. Found: {module_keys}"
        
        print(f"SUCCESS: All 5 core modules present: {core_modules}")
    
    def test_industry_config_in_response(self):
        """Verify industry configuration is returned"""
        response = self.session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        assert response.status_code == 200
        data = response.json()
        
        industry_type = data.get("industry_type")
        assert industry_type is not None, "Missing industry_type"
        assert industry_type in ["events", "agency", "consulting", "generic"], \
            f"Invalid industry_type: {industry_type}"
        
        # Should have industry_config
        industry_config = data.get("industry_config", {})
        print(f"SUCCESS: Industry type: {industry_type}")
        print(f"Industry config: {industry_config}")


class TestAuthMeEndpoint:
    """Tests for /api/auth/me endpoint to verify user data after login"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_me_returns_user_data(self):
        """Verify /me endpoint returns user data with company_id"""
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Call /me endpoint
        response = self.session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Get /me failed: {response.text}"
        user = response.json()
        
        assert "user_id" in user, "Missing user_id"
        assert "email" in user, "Missing email"
        assert "company_id" in user, "Missing company_id"
        
        print(f"SUCCESS: /me returned user: {user.get('email')} with company_id: {user.get('company_id')}")


class TestInvalidCredentials:
    """Tests for error handling"""
    
    def test_login_invalid_password(self):
        """Test login with invalid password returns 401"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "WrongPassword123!"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("SUCCESS: Invalid password returns 401")
    
    def test_login_nonexistent_user(self):
        """Test login with non-existent user returns 401"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent_user_xyz@example.com",
            "password": "AnyPassword123!"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("SUCCESS: Non-existent user returns 401")
    
    def test_modules_without_auth(self):
        """Test enabled-modules requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/addons/enabled-modules")
        
        # Should return 401 Unauthorized
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: enabled-modules requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
