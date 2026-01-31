"""
Test Settings: Users, Roles, Automations, Integrations
Tests for the new Settings sections added to Evoke OS
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestSettingsAuth:
    """Authentication for settings tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return s


class TestUsersSettings(TestSettingsAuth):
    """Test Users management endpoints"""
    
    def test_get_users(self, session):
        """GET /api/settings/users - should return list of users"""
        response = session.get(f"{BASE_URL}/api/settings/users")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have at least the logged-in user
        if len(data) > 0:
            user = data[0]
            assert "user_id" in user, "User should have user_id"
            assert "email" in user, "User should have email"
            # password_hash should NOT be returned
            assert "password_hash" not in user, "password_hash should not be exposed"
        
        print(f"✓ GET /api/settings/users returned {len(data)} users")
    
    def test_invite_user(self, session):
        """POST /api/settings/users/invite - should create invited user"""
        import uuid
        test_email = f"test_invite_{uuid.uuid4().hex[:8]}@example.com"
        
        response = session.post(f"{BASE_URL}/api/settings/users/invite", json={
            "email": test_email,
            "name": "Test Invited User",
            "role_id": "operations"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("email") == test_email, "Email should match"
        assert data.get("name") == "Test Invited User", "Name should match"
        assert data.get("is_invited") == True, "User should be marked as invited"
        assert "user_id" in data, "Should return user_id"
        
        print(f"✓ POST /api/settings/users/invite created user: {data.get('user_id')}")
        return data.get("user_id")
    
    def test_invite_duplicate_user(self, session):
        """POST /api/settings/users/invite - should fail for duplicate email"""
        response = session.post(f"{BASE_URL}/api/settings/users/invite", json={
            "email": TEST_EMAIL,  # Already exists
            "name": "Duplicate User"
        })
        assert response.status_code == 400, "Should fail for duplicate email"
        print("✓ POST /api/settings/users/invite correctly rejects duplicate email")
    
    def test_update_user(self, session):
        """PUT /api/settings/users/{user_id} - should update user"""
        # First get users to find one to update
        response = session.get(f"{BASE_URL}/api/settings/users")
        users = response.json()
        
        if len(users) > 0:
            user_id = users[0]["user_id"]
            
            response = session.put(f"{BASE_URL}/api/settings/users/{user_id}", json={
                "name": "Updated Name Test"
            })
            assert response.status_code == 200, f"Failed: {response.text}"
            
            data = response.json()
            assert data.get("name") == "Updated Name Test", "Name should be updated"
            print(f"✓ PUT /api/settings/users/{user_id} updated successfully")


class TestRolesSettings(TestSettingsAuth):
    """Test Roles management endpoints"""
    
    def test_get_roles(self, session):
        """GET /api/settings/roles - should return list of roles"""
        response = session.get(f"{BASE_URL}/api/settings/roles")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have default roles (Admin, Finance, Operations)
        role_names = [r.get("name") for r in data]
        assert "Administrator" in role_names or any("admin" in r.get("role_id", "").lower() for r in data), \
            "Should have Admin role"
        
        # Check role structure
        if len(data) > 0:
            role = data[0]
            assert "role_id" in role, "Role should have role_id"
            assert "name" in role, "Role should have name"
            assert "permissions" in role, "Role should have permissions"
        
        print(f"✓ GET /api/settings/roles returned {len(data)} roles")
        return data
    
    def test_create_custom_role(self, session):
        """POST /api/settings/roles - should create custom role"""
        import uuid
        role_name = f"Test Role {uuid.uuid4().hex[:6]}"
        
        response = session.post(f"{BASE_URL}/api/settings/roles", json={
            "name": role_name,
            "name_es": f"Rol de Prueba {uuid.uuid4().hex[:6]}",
            "description": "Test role for automated testing",
            "description_es": "Rol de prueba para testing automatizado",
            "permissions": ["events.view", "crm.view"]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("name") == role_name, "Name should match"
        assert data.get("is_system") == False, "Custom role should not be system role"
        assert "events.view" in data.get("permissions", []), "Should have assigned permissions"
        
        print(f"✓ POST /api/settings/roles created role: {data.get('role_id')}")
        return data.get("role_id")
    
    def test_update_custom_role(self, session):
        """PUT /api/settings/roles/{role_id} - should update custom role"""
        # First create a role to update
        import uuid
        role_name = f"Update Test Role {uuid.uuid4().hex[:6]}"
        
        create_response = session.post(f"{BASE_URL}/api/settings/roles", json={
            "name": role_name,
            "permissions": ["events.view"]
        })
        role_id = create_response.json().get("role_id")
        
        # Update the role
        response = session.put(f"{BASE_URL}/api/settings/roles/{role_id}", json={
            "name": f"{role_name} Updated",
            "permissions": ["events.view", "events.create", "crm.view"]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "Updated" in data.get("name", ""), "Name should be updated"
        assert len(data.get("permissions", [])) == 3, "Should have 3 permissions"
        
        print(f"✓ PUT /api/settings/roles/{role_id} updated successfully")
    
    def test_cannot_update_system_role(self, session):
        """PUT /api/settings/roles/{role_id} - should fail for system roles"""
        response = session.put(f"{BASE_URL}/api/settings/roles/admin", json={
            "name": "Hacked Admin"
        })
        assert response.status_code == 400, "Should fail for system role"
        print("✓ PUT /api/settings/roles/admin correctly rejects system role modification")
    
    def test_delete_custom_role(self, session):
        """DELETE /api/settings/roles/{role_id} - should delete custom role"""
        # First create a role to delete
        import uuid
        create_response = session.post(f"{BASE_URL}/api/settings/roles", json={
            "name": f"Delete Test Role {uuid.uuid4().hex[:6]}",
            "permissions": []
        })
        role_id = create_response.json().get("role_id")
        
        # Delete the role
        response = session.delete(f"{BASE_URL}/api/settings/roles/{role_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify deletion
        get_response = session.get(f"{BASE_URL}/api/settings/roles")
        roles = get_response.json()
        role_ids = [r.get("role_id") for r in roles]
        assert role_id not in role_ids, "Role should be deleted"
        
        print(f"✓ DELETE /api/settings/roles/{role_id} deleted successfully")
    
    def test_cannot_delete_system_role(self, session):
        """DELETE /api/settings/roles/{role_id} - should fail for system roles"""
        response = session.delete(f"{BASE_URL}/api/settings/roles/admin")
        assert response.status_code == 400, "Should fail for system role"
        print("✓ DELETE /api/settings/roles/admin correctly rejects system role deletion")


class TestAutomationsSettings(TestSettingsAuth):
    """Test Automations management endpoints"""
    
    def test_get_automations(self, session):
        """GET /api/settings/automations - should return list of automations"""
        response = session.get(f"{BASE_URL}/api/settings/automations")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have default automations
        if len(data) > 0:
            auto = data[0]
            assert "automation_id" in auto, "Automation should have automation_id"
            assert "name" in auto, "Automation should have name"
            assert "trigger_type" in auto, "Automation should have trigger_type"
            assert "channels" in auto, "Automation should have channels"
            assert "is_active" in auto, "Automation should have is_active"
        
        print(f"✓ GET /api/settings/automations returned {len(data)} automations")
        return data
    
    def test_create_automation(self, session):
        """POST /api/settings/automations - should create automation"""
        import uuid
        auto_name = f"Test Automation {uuid.uuid4().hex[:6]}"
        
        response = session.post(f"{BASE_URL}/api/settings/automations", json={
            "name": auto_name,
            "trigger_type": "task_due_date",
            "channels": ["email", "in_app"],
            "is_active": True,
            "config": {"days_before": 2}
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("name") == auto_name, "Name should match"
        assert data.get("trigger_type") == "task_due_date", "Trigger type should match"
        assert "email" in data.get("channels", []), "Should have email channel"
        assert data.get("is_active") == True, "Should be active"
        
        print(f"✓ POST /api/settings/automations created: {data.get('automation_id')}")
        return data.get("automation_id")
    
    def test_update_automation(self, session):
        """PUT /api/settings/automations/{automation_id} - should update automation"""
        # First create an automation to update
        import uuid
        create_response = session.post(f"{BASE_URL}/api/settings/automations", json={
            "name": f"Update Test Auto {uuid.uuid4().hex[:6]}",
            "trigger_type": "new_lead",
            "channels": ["email"],
            "is_active": True
        })
        auto_id = create_response.json().get("automation_id")
        
        # Update the automation
        response = session.put(f"{BASE_URL}/api/settings/automations/{auto_id}", json={
            "name": "Updated Automation Name",
            "is_active": False,
            "channels": ["email", "in_app"]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("name") == "Updated Automation Name", "Name should be updated"
        assert data.get("is_active") == False, "Should be inactive"
        assert len(data.get("channels", [])) == 2, "Should have 2 channels"
        
        print(f"✓ PUT /api/settings/automations/{auto_id} updated successfully")
    
    def test_delete_automation(self, session):
        """DELETE /api/settings/automations/{automation_id} - should delete automation"""
        # First create an automation to delete
        import uuid
        create_response = session.post(f"{BASE_URL}/api/settings/automations", json={
            "name": f"Delete Test Auto {uuid.uuid4().hex[:6]}",
            "trigger_type": "payment_reminder",
            "channels": ["email"]
        })
        auto_id = create_response.json().get("automation_id")
        
        # Delete the automation
        response = session.delete(f"{BASE_URL}/api/settings/automations/{auto_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        print(f"✓ DELETE /api/settings/automations/{auto_id} deleted successfully")


class TestIntegrationsSettings(TestSettingsAuth):
    """Test Integrations management endpoints"""
    
    def test_get_integrations(self, session):
        """GET /api/settings/integrations - should return list of integrations"""
        response = session.get(f"{BASE_URL}/api/settings/integrations")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have Stripe pre-configured
        integration_ids = [i.get("integration_id") for i in data]
        assert "stripe" in integration_ids, "Stripe should be pre-configured"
        
        # Check Stripe status
        stripe = next((i for i in data if i.get("integration_id") == "stripe"), None)
        assert stripe is not None, "Stripe integration should exist"
        assert stripe.get("status") == "connected", "Stripe should be connected"
        
        print(f"✓ GET /api/settings/integrations returned {len(data)} integrations")
        return data
    
    def test_save_integration(self, session):
        """POST /api/settings/integrations - should save integration config"""
        response = session.post(f"{BASE_URL}/api/settings/integrations", json={
            "integration_id": "alegra",
            "config": {
                "api_key": "test_api_key_123",
                "company_id": "test_company_456"
            }
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("integration_id") == "alegra", "Integration ID should match"
        
        # Verify it's in the list
        get_response = session.get(f"{BASE_URL}/api/settings/integrations")
        integrations = get_response.json()
        integration_ids = [i.get("integration_id") for i in integrations]
        assert "alegra" in integration_ids, "Alegra should be in integrations list"
        
        print("✓ POST /api/settings/integrations saved Alegra integration")
    
    def test_test_integration(self, session):
        """POST /api/settings/integrations/{id}/test - should test connection"""
        response = session.post(f"{BASE_URL}/api/settings/integrations/alegra/test", json={
            "config": {
                "api_key": "test_key",
                "company_id": "test_company"
            }
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Test should return success"
        
        print("✓ POST /api/settings/integrations/alegra/test returned success")
    
    def test_delete_integration(self, session):
        """DELETE /api/settings/integrations/{id} - should disconnect integration"""
        # First save an integration to delete
        session.post(f"{BASE_URL}/api/settings/integrations", json={
            "integration_id": "quickbooks",
            "config": {"client_id": "test"}
        })
        
        # Delete it
        response = session.delete(f"{BASE_URL}/api/settings/integrations/quickbooks")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        print("✓ DELETE /api/settings/integrations/quickbooks disconnected successfully")
    
    def test_cannot_delete_stripe(self, session):
        """DELETE /api/settings/integrations/stripe - should fail for pre-configured"""
        response = session.delete(f"{BASE_URL}/api/settings/integrations/stripe")
        assert response.status_code == 400, "Should fail for pre-configured integration"
        print("✓ DELETE /api/settings/integrations/stripe correctly rejects deletion")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
