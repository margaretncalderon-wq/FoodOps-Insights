"""
Test Auth and Modules Bug Fixes
================================
Tests for two bugs:
1) Login issues - verify login works, /auth/me returns access_token, multiple sessions work
2) Client Engagement module visibility - verify module is in enabled-modules list

Test credentials: demo.agency@kora.com / Evoque2024!
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthLogin:
    """Test login flow and session persistence"""
    
    def test_login_returns_access_token_and_user(self):
        """POST /api/auth/login should return access_token and user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify access_token is returned
        assert "access_token" in data, "Response missing access_token"
        assert data["access_token"], "access_token is empty"
        assert isinstance(data["access_token"], str), "access_token should be string"
        
        # Verify user data is returned
        assert "user" in data, "Response missing user"
        assert data["user"]["email"] == "demo.agency@kora.com"
        assert "user_id" in data["user"]
        assert "company_id" in data["user"]
        
        print(f"PASS: Login returns access_token and user data")
    
    def test_auth_me_returns_user_and_access_token(self):
        """GET /api/auth/me should return user data AND access_token (new fix)"""
        # First login to get token
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Call /auth/me with token
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert me_response.status_code == 200, f"/auth/me failed: {me_response.text}"
        data = me_response.json()
        
        # Verify user data
        assert "user_id" in data, "Response missing user_id"
        assert "email" in data, "Response missing email"
        assert data["email"] == "demo.agency@kora.com"
        
        # NEW FIX: Verify access_token is returned
        assert "access_token" in data, "/auth/me should return access_token (new fix)"
        assert data["access_token"], "access_token is empty"
        
        print(f"PASS: /auth/me returns user data AND access_token")
    
    def test_token_refresh_returns_new_token(self):
        """POST /api/auth/refresh should return new access_token"""
        # First login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Refresh token
        refresh_response = requests.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert refresh_response.status_code == 200, f"Refresh failed: {refresh_response.text}"
        data = refresh_response.json()
        
        assert "access_token" in data, "Refresh response missing access_token"
        assert data["access_token"], "New access_token is empty"
        
        print(f"PASS: Token refresh returns new access_token")
    
    def test_multiple_sessions_both_tokens_work(self):
        """Login twice with same user, both tokens should work"""
        import time
        
        # First login
        login1 = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        assert login1.status_code == 200
        token1 = login1.json()["access_token"]
        
        # Wait 1 second to ensure different timestamp in JWT
        time.sleep(1)
        
        # Second login (simulating different browser)
        login2 = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        assert login2.status_code == 200
        token2 = login2.json()["access_token"]
        
        # Both tokens should work (they may be same if generated at same second, which is fine)
        me1 = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert me1.status_code == 200, f"First token failed: {me1.text}"
        
        me2 = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token2}"}
        )
        assert me2.status_code == 200, f"Second token failed: {me2.text}"
        
        print(f"PASS: Multiple sessions work - both tokens valid")


class TestModulesAccess:
    """Test module access and Client Engagement visibility"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token for all tests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_enabled_modules_returns_client_engagement(self):
        """GET /api/addons/enabled-modules should include client_engagement"""
        response = requests.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"enabled-modules failed: {response.text}"
        data = response.json()
        
        # Verify modules list exists
        assert "modules" in data, "Response missing modules"
        modules = data["modules"]
        assert isinstance(modules, list), "modules should be a list"
        assert len(modules) > 0, "modules list is empty"
        
        # Find client_engagement module
        module_keys = [m.get("key") for m in modules]
        module_paths = [m.get("path") for m in modules]
        
        assert "client_engagement" in module_keys, f"client_engagement not in modules. Found: {module_keys}"
        assert "/client-engagement" in module_paths, f"/client-engagement path not in modules. Found: {module_paths}"
        
        # Verify client_engagement module has correct structure
        ce_module = next((m for m in modules if m.get("key") == "client_engagement"), None)
        assert ce_module is not None
        assert "name_en" in ce_module
        assert "name_es" in ce_module
        assert "path" in ce_module
        
        print(f"PASS: client_engagement module is in enabled-modules list")
        print(f"  Module keys: {module_keys}")
    
    def test_enabled_modules_returns_all_expected_modules(self):
        """Verify all expected core modules are returned"""
        response = requests.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        modules = data["modules"]
        module_keys = [m.get("key") for m in modules]
        
        # Expected core modules
        expected_core = ["system_pulse", "client_engagement", "execution_hub", "partners", "business_clarity", "settings"]
        
        for expected in expected_core:
            assert expected in module_keys, f"Missing expected module: {expected}"
        
        print(f"PASS: All expected core modules present")
        print(f"  Found modules: {module_keys}")
    
    def test_enabled_modules_returns_industry_config(self):
        """Verify industry_config is returned with program_orchestration"""
        response = requests.get(
            f"{BASE_URL}/api/addons/enabled-modules",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify industry_type
        assert "industry_type" in data, "Response missing industry_type"
        
        # Verify industry_config
        assert "industry_config" in data, "Response missing industry_config"
        industry_config = data["industry_config"]
        
        # Verify program_orchestration config exists
        assert "program_orchestration" in industry_config, "Missing program_orchestration in industry_config"
        
        print(f"PASS: industry_config with program_orchestration returned")
        print(f"  Industry type: {data['industry_type']}")


class TestRolesAPI:
    """Test roles API for permissions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"},
            headers={"Content-Type": "application/json"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_roles_api_returns_roles_with_permissions(self):
        """GET /api/settings/roles should return roles with permission definitions"""
        response = requests.get(
            f"{BASE_URL}/api/settings/roles",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Roles API failed: {response.text}"
        roles = response.json()
        
        assert isinstance(roles, list), "Roles should be a list"
        
        # If roles exist, verify structure
        if len(roles) > 0:
            role = roles[0]
            assert "role_id" in role or "name" in role, "Role missing identifier"
            
            # Check for permissions
            if "permissions" in role:
                assert isinstance(role["permissions"], list), "permissions should be a list"
        
        print(f"PASS: Roles API returns {len(roles)} roles")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
