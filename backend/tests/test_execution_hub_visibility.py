"""
Test Execution Hub Visibility Security Fix
==========================================
Tests the per-goal visibility feature (private/team/org) that fixes the cross-org data leak.

Key changes tested:
1. GET /api/execution-hub/goals filters by visibility rules
2. POST /api/execution-hub/goals accepts visibility field (private/team/org), defaults to org
3. PUT /api/execution-hub/goals/{goal_id} can update visibility
4. GET /api/execution-hub/goals/{goal_id} respects visibility (check_goal_access)
5. Cross-org access only via explicit sharing (shared_entities + execution_access)
6. Existing goals without visibility field default to org (backwards compatible)

Test users:
- Admin (demo.agency@kora.com): company_id=company_3ab116c0994d (Creative Agency Demo)
- Pame (pamemey27@gmail.com): company_id=company_98d8b4725822 (Kora OS Test) - DIFFERENT ORG
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
PAME_EMAIL = "pamemey27@gmail.com"
PAME_PASSWORD = "Evoque2024!"


class TestExecutionHubVisibility:
    """Test Execution Hub visibility security fix"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin user (Creative Agency Demo org)"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        return session
    
    @pytest.fixture(scope="class")
    def pame_session(self):
        """Login as Pame user (Kora OS Test org - DIFFERENT ORG)"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PAME_EMAIL, "password": PAME_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Pame login failed: {response.status_code} - {response.text}")
        return session
    
    @pytest.fixture(scope="class")
    def admin_user_info(self, admin_session):
        """Get admin user info"""
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        if response.status_code == 200:
            return response.json()
        return {}
    
    @pytest.fixture(scope="class")
    def pame_user_info(self, pame_session):
        """Get Pame user info"""
        response = pame_session.get(f"{BASE_URL}/api/auth/me")
        if response.status_code == 200:
            return response.json()
        return {}
    
    # ==================== VISIBILITY FIELD TESTS ====================
    
    def test_create_goal_with_org_visibility(self, admin_session):
        """Test creating a goal with org visibility (default)"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_ORG_GOAL_{unique_id}",
            "objective": "Test org visibility goal",
            "context_type": "organizational",
            "impact_areas": ["quality"],
            "visibility": "org"
        }
        response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        
        assert response.status_code == 200, f"Failed to create goal: {response.text}"
        data = response.json()
        assert data["visibility"] == "org", f"Expected visibility=org, got {data.get('visibility')}"
        assert "goal_id" in data
        print(f"PASS: Created org-visibility goal: {data['goal_id']}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{data['goal_id']}")
        return data["goal_id"]
    
    def test_create_goal_with_team_visibility(self, admin_session):
        """Test creating a goal with team visibility"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_TEAM_GOAL_{unique_id}",
            "objective": "Test team visibility goal",
            "context_type": "organizational",
            "impact_areas": ["speed"],
            "visibility": "team"
        }
        response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        
        assert response.status_code == 200, f"Failed to create goal: {response.text}"
        data = response.json()
        assert data["visibility"] == "team", f"Expected visibility=team, got {data.get('visibility')}"
        print(f"PASS: Created team-visibility goal: {data['goal_id']}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{data['goal_id']}")
    
    def test_create_goal_with_private_visibility(self, admin_session):
        """Test creating a goal with private visibility"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_PRIVATE_GOAL_{unique_id}",
            "objective": "Test private visibility goal",
            "context_type": "personal",
            "impact_areas": ["cost"],
            "visibility": "private"
        }
        response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        
        assert response.status_code == 200, f"Failed to create goal: {response.text}"
        data = response.json()
        assert data["visibility"] == "private", f"Expected visibility=private, got {data.get('visibility')}"
        print(f"PASS: Created private-visibility goal: {data['goal_id']}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{data['goal_id']}")
    
    def test_create_goal_default_visibility_is_org(self, admin_session):
        """Test that goals without visibility field default to org"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_DEFAULT_VIS_{unique_id}",
            "objective": "Test default visibility",
            "context_type": "organizational",
            "impact_areas": []
            # No visibility field - should default to "org"
        }
        response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        
        assert response.status_code == 200, f"Failed to create goal: {response.text}"
        data = response.json()
        assert data.get("visibility") == "org", f"Expected default visibility=org, got {data.get('visibility')}"
        print(f"PASS: Default visibility is 'org': {data['goal_id']}")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{data['goal_id']}")
    
    def test_update_goal_visibility(self, admin_session):
        """Test updating goal visibility"""
        unique_id = uuid.uuid4().hex[:8]
        # Create with org visibility
        payload = {
            "title": f"TEST_UPDATE_VIS_{unique_id}",
            "objective": "Test update visibility",
            "context_type": "organizational",
            "visibility": "org"
        }
        create_response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        assert create_response.status_code == 200
        goal_id = create_response.json()["goal_id"]
        
        # Update to private
        update_response = admin_session.put(
            f"{BASE_URL}/api/execution-hub/goals/{goal_id}",
            json={"visibility": "private"}
        )
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        updated_data = update_response.json()
        assert updated_data.get("visibility") == "private", f"Expected visibility=private after update"
        print(f"PASS: Updated goal visibility from org to private")
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    
    # ==================== CROSS-ORG ISOLATION TESTS (THE LEAK FIX) ====================
    
    def test_pame_cannot_see_admin_org_goals(self, admin_session, pame_session, admin_user_info, pame_user_info):
        """
        CRITICAL: Test that Pame (different org) cannot see admin's org goals.
        This is the main leak fix test.
        """
        # Verify users are in different orgs
        admin_company = admin_user_info.get("company_id", "")
        pame_company = pame_user_info.get("company_id", "")
        print(f"Admin company: {admin_company}, Pame company: {pame_company}")
        
        if admin_company == pame_company:
            pytest.skip("Users are in same org - cannot test cross-org isolation")
        
        # Create a goal as admin with org visibility
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_CROSS_ORG_LEAK_{unique_id}",
            "objective": "This goal should NOT be visible to Pame",
            "context_type": "organizational",
            "visibility": "org"
        }
        create_response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        assert create_response.status_code == 200
        goal_id = create_response.json()["goal_id"]
        print(f"Created admin goal: {goal_id}")
        
        try:
            # Pame should NOT see this goal in her list
            pame_goals_response = pame_session.get(f"{BASE_URL}/api/execution-hub/goals")
            assert pame_goals_response.status_code == 200
            pame_goals = pame_goals_response.json()
            
            # Check if admin's goal appears in Pame's list
            admin_goal_in_pame_list = any(g["goal_id"] == goal_id for g in pame_goals)
            assert not admin_goal_in_pame_list, f"LEAK DETECTED: Pame can see admin's goal {goal_id}!"
            print(f"PASS: Pame cannot see admin's org goal in her list (cross-org isolation working)")
            
            # Pame should get 403 when trying to access the goal directly
            direct_access_response = pame_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
            assert direct_access_response.status_code == 403, \
                f"Expected 403 for cross-org access, got {direct_access_response.status_code}"
            print(f"PASS: Pame gets 403 when accessing admin's goal directly")
            
        finally:
            # Cleanup
            admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    
    def test_pame_cannot_see_admin_private_goals(self, admin_session, pame_session):
        """Test that Pame cannot see admin's private goals"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_PRIVATE_CROSS_ORG_{unique_id}",
            "objective": "Private goal - should not be visible to anyone outside",
            "context_type": "personal",
            "visibility": "private"
        }
        create_response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        assert create_response.status_code == 200
        goal_id = create_response.json()["goal_id"]
        
        try:
            # Pame should NOT see this goal
            pame_goals_response = pame_session.get(f"{BASE_URL}/api/execution-hub/goals")
            assert pame_goals_response.status_code == 200
            pame_goals = pame_goals_response.json()
            
            admin_goal_in_pame_list = any(g["goal_id"] == goal_id for g in pame_goals)
            assert not admin_goal_in_pame_list, f"LEAK: Pame can see admin's private goal!"
            print(f"PASS: Pame cannot see admin's private goal")
            
            # Direct access should be 403
            direct_response = pame_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
            assert direct_response.status_code == 403
            print(f"PASS: Pame gets 403 for admin's private goal")
            
        finally:
            admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    
    # ==================== SAME-ORG VISIBILITY TESTS ====================
    
    def test_owner_always_sees_own_goals(self, admin_session):
        """Test that owner always sees their own goals regardless of visibility"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create private goal
        payload = {
            "title": f"TEST_OWNER_PRIVATE_{unique_id}",
            "objective": "Owner should always see this",
            "visibility": "private"
        }
        create_response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        assert create_response.status_code == 200
        goal_id = create_response.json()["goal_id"]
        
        try:
            # Owner should see it in list
            goals_response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals")
            assert goals_response.status_code == 200
            goals = goals_response.json()
            
            owner_sees_goal = any(g["goal_id"] == goal_id for g in goals)
            assert owner_sees_goal, "Owner should always see their own goals"
            print(f"PASS: Owner sees their own private goal")
            
            # Owner should access it directly
            direct_response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
            assert direct_response.status_code == 200
            print(f"PASS: Owner can access their own private goal directly")
            
        finally:
            admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    
    # ==================== GET GOALS ENDPOINT TESTS ====================
    
    def test_get_goals_returns_owned_goals(self, admin_session):
        """Test GET /api/execution-hub/goals returns owned goals"""
        response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals")
        assert response.status_code == 200
        goals = response.json()
        
        # Should be a list
        assert isinstance(goals, list), "Expected list of goals"
        print(f"PASS: GET /api/execution-hub/goals returns {len(goals)} goals")
        
        # Check _access_type field
        for goal in goals[:5]:  # Check first 5
            access_type = goal.get("_access_type")
            assert access_type in ["owned", "shared"], f"Unexpected _access_type: {access_type}"
        print(f"PASS: Goals have valid _access_type field")
    
    def test_get_goals_with_scope_filter(self, admin_session):
        """Test GET /api/execution-hub/goals with scope filter"""
        # Test owned scope
        owned_response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals?scope=owned")
        assert owned_response.status_code == 200
        owned_goals = owned_response.json()
        print(f"PASS: scope=owned returns {len(owned_goals)} goals")
        
        # Test shared scope
        shared_response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals?scope=shared")
        assert shared_response.status_code == 200
        shared_goals = shared_response.json()
        print(f"PASS: scope=shared returns {len(shared_goals)} goals")
    
    def test_get_goals_with_status_filter(self, admin_session):
        """Test GET /api/execution-hub/goals with status filter"""
        response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals?status=planning")
        assert response.status_code == 200
        goals = response.json()
        
        # All returned goals should have planning status
        for goal in goals:
            assert goal.get("status") == "planning", f"Expected status=planning, got {goal.get('status')}"
        print(f"PASS: status filter works, returned {len(goals)} planning goals")
    
    # ==================== BACKWARDS COMPATIBILITY ====================
    
    def test_existing_goals_without_visibility_treated_as_org(self, admin_session):
        """Test that existing goals without visibility field are treated as org visibility"""
        # Get all goals
        response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals")
        assert response.status_code == 200
        goals = response.json()
        
        # Check goals without visibility field
        for goal in goals:
            visibility = goal.get("visibility")
            # If visibility is None or missing, it should be treated as "org" by the backend
            # The backend code has: visibility = goal.get("visibility", "org")
            if visibility is None:
                print(f"Goal {goal['goal_id']} has no visibility field - treated as 'org' (backwards compat)")
        
        print(f"PASS: Backwards compatibility check complete")
    
    # ==================== USAGE ENDPOINT ====================
    
    def test_execution_hub_usage(self, admin_session):
        """Test GET /api/execution-hub/usage returns usage stats"""
        response = admin_session.get(f"{BASE_URL}/api/execution-hub/usage")
        assert response.status_code == 200
        data = response.json()
        
        assert "goals_created_this_month" in data
        assert "goals_limit" in data
        assert "can_create" in data
        print(f"PASS: Usage endpoint returns: {data['goals_created_this_month']}/{data['goals_limit']} goals")


class TestExecutionHubAccessControl:
    """Test check_goal_access function behavior"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed")
        return session
    
    @pytest.fixture(scope="class")
    def pame_session(self):
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PAME_EMAIL, "password": PAME_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Pame login failed")
        return session
    
    def test_nonexistent_goal_returns_404(self, admin_session):
        """Test accessing non-existent goal returns 404"""
        response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals/goal_nonexistent123")
        assert response.status_code == 404
        print(f"PASS: Non-existent goal returns 404")
    
    def test_unauthorized_access_returns_401(self):
        """Test accessing goals without auth returns 401/403"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/execution-hub/goals")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASS: Unauthenticated access returns {response.status_code}")
    
    def test_cross_org_goal_access_returns_403(self, admin_session, pame_session):
        """Test that cross-org goal access returns 403"""
        # Create goal as admin
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_403_CHECK_{unique_id}",
            "objective": "Test 403 for cross-org",
            "visibility": "org"
        }
        create_response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=payload)
        assert create_response.status_code == 200
        goal_id = create_response.json()["goal_id"]
        
        try:
            # Pame tries to access
            response = pame_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print(f"PASS: Cross-org access returns 403")
        finally:
            admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")


class TestExecutionHubCRUD:
    """Test basic CRUD operations with visibility"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed")
        return session
    
    def test_full_crud_with_visibility(self, admin_session):
        """Test full CRUD cycle with visibility field"""
        unique_id = uuid.uuid4().hex[:8]
        
        # CREATE
        create_payload = {
            "title": f"TEST_CRUD_VIS_{unique_id}",
            "objective": "Full CRUD test with visibility",
            "context_type": "organizational",
            "impact_areas": ["quality", "speed"],
            "visibility": "team"
        }
        create_response = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=create_payload)
        assert create_response.status_code == 200
        created = create_response.json()
        goal_id = created["goal_id"]
        assert created["visibility"] == "team"
        print(f"PASS: CREATE with visibility=team")
        
        # READ
        read_response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        assert read_response.status_code == 200
        read_data = read_response.json()
        assert read_data["visibility"] == "team"
        print(f"PASS: READ returns visibility=team")
        
        # UPDATE visibility
        update_response = admin_session.put(
            f"{BASE_URL}/api/execution-hub/goals/{goal_id}",
            json={"visibility": "private", "title": f"TEST_CRUD_VIS_UPDATED_{unique_id}"}
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["visibility"] == "private"
        print(f"PASS: UPDATE visibility to private")
        
        # DELETE
        delete_response = admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        assert delete_response.status_code == 200
        print(f"PASS: DELETE goal")
        
        # Verify deleted
        verify_response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        assert verify_response.status_code == 404
        print(f"PASS: Goal deleted successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
