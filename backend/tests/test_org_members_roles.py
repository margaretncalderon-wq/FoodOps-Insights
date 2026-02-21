"""
Test suite for Organization Member Management and Custom Roles
Features tested:
1. GET /api/org/members with include_suspended parameter
2. GET /api/org/members includes resolved role_name and role_name_es
3. GET /api/settings/roles returns custom roles
4. PUT /api/org/members/{id}/role accepts custom roles
5. PUT /api/org/members/{id} updates name and phone
6. PUT /api/org/members/{id}/suspend changes status to suspended
7. PUT /api/org/members/{id}/activate changes status to active
8. POST /api/org/members/create-direct accepts custom roles
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestOrgMembersAndRoles:
    """Tests for org member management and custom roles"""
    
    @pytest.fixture(autouse=True, scope="class")
    def setup_auth(self, request):
        """Authenticate and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        request.cls.token = data.get("access_token") or data.get("token")
        request.cls.headers = {
            "Authorization": f"Bearer {request.cls.token}",
            "Content-Type": "application/json"
        }
        
    # ---- GET /api/settings/roles ----
    
    def test_get_roles_returns_system_and_custom_roles(self):
        """GET /api/settings/roles should return roles for the company"""
        response = requests.get(
            f"{BASE_URL}/api/settings/roles",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get roles: {response.text}"
        roles = response.json()
        
        # Should have roles
        assert isinstance(roles, list), "Response should be a list"
        
        # Check that system roles exist
        role_ids = [r.get("role_id") for r in roles]
        print(f"Found roles: {role_ids}")
        
        # Verify role structure
        if len(roles) > 0:
            first_role = roles[0]
            assert "role_id" in first_role, "Role should have role_id"
            assert "name" in first_role, "Role should have name"
            assert "name_es" in first_role, "Role should have name_es"
    
    def test_create_custom_role(self):
        """POST /api/settings/roles - create a custom role"""
        custom_role_name = f"TEST_CustomRole_{uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/settings/roles",
            headers=self.headers,
            json={
                "name": custom_role_name,
                "name_es": f"{custom_role_name}_ES",
                "description": "Test custom role",
                "description_es": "Rol personalizado de prueba",
                "permissions": ["events.view", "crm.view"]
            }
        )
        assert response.status_code == 200, f"Failed to create role: {response.text}"
        role = response.json()
        
        # Store role_id for later tests
        self.__class__.custom_role_id = role.get("role_id")
        self.__class__.custom_role_name = role.get("name")
        
        assert role.get("role_id") is not None, "Role should have role_id"
        assert role.get("name") == custom_role_name, "Role name should match"
        assert role.get("is_system") == False, "Custom role should not be system role"
        print(f"Created custom role: {role.get('role_id')}")
    
    # ---- GET /api/org/members ----
    
    def test_get_members_returns_list(self):
        """GET /api/org/members should return list of members"""
        response = requests.get(
            f"{BASE_URL}/api/org/members",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get members: {response.text}"
        members = response.json()
        
        assert isinstance(members, list), "Response should be a list"
        print(f"Found {len(members)} active members")
        
        # Store for later reference
        self.__class__.initial_members_count = len(members)
        
        # Verify member structure
        if len(members) > 0:
            member = members[0]
            assert "membership_id" in member, "Member should have membership_id"
            assert "user_id" in member, "Member should have user_id"
            assert "email" in member, "Member should have email"
            assert "role" in member, "Member should have role"
            assert "role_name" in member, "Member should have role_name resolved"
            assert "role_name_es" in member, "Member should have role_name_es resolved"
            assert "status" in member, "Member should have status"
            print(f"First member has role: {member.get('role')} ({member.get('role_name')})")
    
    def test_get_members_includes_role_names(self):
        """GET /api/org/members should include resolved role_name and role_name_es"""
        response = requests.get(
            f"{BASE_URL}/api/org/members",
            headers=self.headers
        )
        assert response.status_code == 200
        members = response.json()
        
        for member in members:
            assert "role_name" in member, f"Member {member.get('email')} missing role_name"
            assert "role_name_es" in member, f"Member {member.get('email')} missing role_name_es"
            # role_name should not be empty
            assert member["role_name"], f"role_name should not be empty for {member.get('email')}"
        
        print("All members have resolved role_name and role_name_es")
    
    # ---- POST /api/org/members/create-direct ----
    
    def test_create_member_direct_with_system_role(self):
        """POST /api/org/members/create-direct should accept system roles"""
        test_email = f"TEST_user_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(
            f"{BASE_URL}/api/org/members/create-direct",
            headers=self.headers,
            json={
                "email": test_email,
                "name": "Test User System Role",
                "password": "TestPass123!",
                "role": "viewer"  # System role
            }
        )
        assert response.status_code == 200, f"Failed to create member: {response.text}"
        result = response.json()
        
        assert result.get("success") == True, "Should return success"
        assert result.get("membership_id") is not None, "Should return membership_id"
        
        # Store for cleanup
        self.__class__.test_membership_id = result.get("membership_id")
        self.__class__.test_user_id = result.get("user_id")
        print(f"Created member with system role: {result.get('membership_id')}")
    
    def test_create_member_direct_with_custom_role(self):
        """POST /api/org/members/create-direct should accept custom roles"""
        # First ensure we have a custom role
        if not hasattr(self, 'custom_role_id'):
            pytest.skip("No custom role created")
        
        test_email = f"TEST_custom_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(
            f"{BASE_URL}/api/org/members/create-direct",
            headers=self.headers,
            json={
                "email": test_email,
                "name": "Test User Custom Role",
                "password": "TestPass123!",
                "role": self.custom_role_id  # Custom role
            }
        )
        assert response.status_code == 200, f"Failed to create member with custom role: {response.text}"
        result = response.json()
        
        assert result.get("success") == True, "Should return success"
        
        # Store for later tests
        self.__class__.custom_role_membership_id = result.get("membership_id")
        print(f"Created member with custom role: {result.get('membership_id')}")
    
    def test_create_member_direct_with_invalid_role_fails(self):
        """POST /api/org/members/create-direct should reject invalid roles"""
        test_email = f"TEST_invalid_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(
            f"{BASE_URL}/api/org/members/create-direct",
            headers=self.headers,
            json={
                "email": test_email,
                "name": "Test Invalid Role",
                "password": "TestPass123!",
                "role": "invalid_role_that_does_not_exist"
            }
        )
        assert response.status_code == 400, f"Should reject invalid role, got: {response.status_code}"
        print("Correctly rejected invalid role")
    
    # ---- PUT /api/org/members/{id} (update name/phone) ----
    
    def test_update_member_name_and_phone(self):
        """PUT /api/org/members/{membership_id} should update name and phone"""
        if not hasattr(self, 'test_membership_id'):
            pytest.skip("No test member created")
        
        response = requests.put(
            f"{BASE_URL}/api/org/members/{self.test_membership_id}",
            headers=self.headers,
            json={
                "name": "Updated Test Name",
                "phone": "+1234567890"
            }
        )
        assert response.status_code == 200, f"Failed to update member: {response.text}"
        result = response.json()
        assert result.get("success") == True
        print("Successfully updated member name and phone")
        
        # Verify the update
        members_response = requests.get(
            f"{BASE_URL}/api/org/members?include_suspended=true",
            headers=self.headers
        )
        members = members_response.json()
        updated_member = next((m for m in members if m.get("membership_id") == self.test_membership_id), None)
        if updated_member:
            assert updated_member.get("name") == "Updated Test Name", "Name should be updated"
            print(f"Verified update - Name: {updated_member.get('name')}, Phone: {updated_member.get('phone')}")
    
    # ---- PUT /api/org/members/{id}/role ----
    
    def test_update_member_role_to_custom_role(self):
        """PUT /api/org/members/{membership_id}/role should accept custom roles"""
        if not hasattr(self, 'test_membership_id') or not hasattr(self, 'custom_role_id'):
            pytest.skip("Missing test member or custom role")
        
        response = requests.put(
            f"{BASE_URL}/api/org/members/{self.test_membership_id}/role",
            headers=self.headers,
            params={"role": self.custom_role_id}
        )
        assert response.status_code == 200, f"Failed to update role: {response.text}"
        result = response.json()
        assert result.get("success") == True
        print(f"Successfully updated member role to custom role: {self.custom_role_id}")
        
        # Verify the update by getting members
        members_response = requests.get(
            f"{BASE_URL}/api/org/members?include_suspended=true",
            headers=self.headers
        )
        members = members_response.json()
        updated_member = next((m for m in members if m.get("membership_id") == self.test_membership_id), None)
        if updated_member:
            assert updated_member.get("role") == self.custom_role_id, "Role should be custom role"
            # role_name should be the custom role name
            print(f"Verified - Role: {updated_member.get('role')}, Role Name: {updated_member.get('role_name')}")
    
    # ---- PUT /api/org/members/{id}/suspend ----
    
    def test_suspend_member(self):
        """PUT /api/org/members/{membership_id}/suspend should change status to suspended"""
        if not hasattr(self, 'test_membership_id'):
            pytest.skip("No test member created")
        
        response = requests.put(
            f"{BASE_URL}/api/org/members/{self.test_membership_id}/suspend",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to suspend member: {response.text}"
        result = response.json()
        assert result.get("success") == True
        print("Successfully suspended member")
        
        # Verify: member should NOT appear in default list (without include_suspended)
        members_response = requests.get(
            f"{BASE_URL}/api/org/members",
            headers=self.headers
        )
        members = members_response.json()
        suspended_member = next((m for m in members if m.get("membership_id") == self.test_membership_id), None)
        assert suspended_member is None, "Suspended member should not appear in active list"
        print("Verified: suspended member not in active list")
    
    def test_get_members_with_include_suspended(self):
        """GET /api/org/members?include_suspended=true should include suspended members"""
        if not hasattr(self, 'test_membership_id'):
            pytest.skip("No test member created")
        
        response = requests.get(
            f"{BASE_URL}/api/org/members?include_suspended=true",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get members: {response.text}"
        members = response.json()
        
        # Should find the suspended member
        suspended_member = next((m for m in members if m.get("membership_id") == self.test_membership_id), None)
        assert suspended_member is not None, "Suspended member should appear with include_suspended=true"
        assert suspended_member.get("status") == "suspended", "Member status should be suspended"
        print(f"Found suspended member with status: {suspended_member.get('status')}")
    
    # ---- PUT /api/org/members/{id}/activate ----
    
    def test_activate_member(self):
        """PUT /api/org/members/{membership_id}/activate should change status to active"""
        if not hasattr(self, 'test_membership_id'):
            pytest.skip("No test member created")
        
        response = requests.put(
            f"{BASE_URL}/api/org/members/{self.test_membership_id}/activate",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to activate member: {response.text}"
        result = response.json()
        assert result.get("success") == True
        print("Successfully activated member")
        
        # Verify: member should appear in default list now
        members_response = requests.get(
            f"{BASE_URL}/api/org/members",
            headers=self.headers
        )
        members = members_response.json()
        activated_member = next((m for m in members if m.get("membership_id") == self.test_membership_id), None)
        assert activated_member is not None, "Activated member should appear in active list"
        assert activated_member.get("status") == "active", "Member status should be active"
        print(f"Verified: member reactivated with status: {activated_member.get('status')}")
    
    # ---- Cleanup ----
    
    def test_cleanup_test_data(self):
        """Cleanup test members and roles"""
        # Remove test members
        if hasattr(self, 'test_membership_id'):
            response = requests.delete(
                f"{BASE_URL}/api/org/members/{self.test_membership_id}",
                headers=self.headers
            )
            print(f"Cleanup test_membership_id: {response.status_code}")
        
        if hasattr(self, 'custom_role_membership_id'):
            response = requests.delete(
                f"{BASE_URL}/api/org/members/{self.custom_role_membership_id}",
                headers=self.headers
            )
            print(f"Cleanup custom_role_membership_id: {response.status_code}")
        
        # Delete custom role
        if hasattr(self, 'custom_role_id'):
            response = requests.delete(
                f"{BASE_URL}/api/settings/roles/{self.custom_role_id}",
                headers=self.headers
            )
            print(f"Cleanup custom_role_id: {response.status_code}")
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
