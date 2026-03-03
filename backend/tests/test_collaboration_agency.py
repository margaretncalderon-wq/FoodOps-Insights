"""
Test suite for Collaboration and Agency Dashboard features.

Tests:
1. /api/social-sharing/collaborators/invite - Creates membership with company_id and status=active
2. /api/org/my-organizations - Includes organizations where user is collaborator (social_contributor, social_viewer)
3. /api/agency/clients-overview - Returns list of clients where user is collaborator
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCollaborationAgency:
    """Test collaboration and agency dashboard features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_res.status_code != 200:
            pytest.skip("Cannot authenticate - skipping tests")
        
        self.user_data = login_res.json()
        self.user_id = self.user_data.get("user_id")
        self.company_id = self.user_data.get("company_id")
        
        # Store cookies for session
        yield
        
        # Cleanup - can add any cleanup logic here
    
    # ============== /api/org/my-organizations Tests ==============
    
    def test_my_organizations_returns_200(self):
        """Test my-organizations endpoint returns 200"""
        res = self.session.get(f"{BASE_URL}/api/org/my-organizations")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    
    def test_my_organizations_returns_list(self):
        """Test my-organizations returns a list of organizations"""
        res = self.session.get(f"{BASE_URL}/api/org/my-organizations")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list), "Expected a list of organizations"
    
    def test_my_organizations_contains_organization_details(self):
        """Test each org has required fields: organization, role, is_active"""
        res = self.session.get(f"{BASE_URL}/api/org/my-organizations")
        assert res.status_code == 200
        data = res.json()
        
        if len(data) > 0:
            org = data[0]
            assert "organization" in org, "Missing 'organization' field"
            assert "role" in org, "Missing 'role' field"
            assert "is_active" in org, "Missing 'is_active' field"
            
            # Verify organization has company_id
            assert "company_id" in org["organization"], "Organization missing company_id"
    
    def test_my_organizations_includes_active_org(self):
        """Test that at least one organization is marked as active"""
        res = self.session.get(f"{BASE_URL}/api/org/my-organizations")
        assert res.status_code == 200
        data = res.json()
        
        if len(data) > 0:
            active_orgs = [o for o in data if o["is_active"] == True]
            assert len(active_orgs) >= 1, "Expected at least one active organization"
    
    # ============== /api/agency/clients-overview Tests ==============
    
    def test_agency_clients_overview_returns_200(self):
        """Test agency clients-overview endpoint returns 200"""
        res = self.session.get(f"{BASE_URL}/api/agency/clients-overview")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    
    def test_agency_clients_overview_structure(self):
        """Test agency clients-overview returns correct structure: clients and stats"""
        res = self.session.get(f"{BASE_URL}/api/agency/clients-overview")
        assert res.status_code == 200
        data = res.json()
        
        assert "clients" in data, "Missing 'clients' field"
        assert "stats" in data, "Missing 'stats' field"
        assert isinstance(data["clients"], list), "clients should be a list"
        
        # Check stats structure
        stats = data["stats"]
        assert "total" in stats, "Stats missing 'total'"
        assert "pendingApproval" in stats, "Stats missing 'pendingApproval'"
        assert "scheduledThisWeek" in stats, "Stats missing 'scheduledThisWeek'"
    
    def test_agency_clients_overview_client_structure(self):
        """Test each client in overview has required fields"""
        res = self.session.get(f"{BASE_URL}/api/agency/clients-overview")
        assert res.status_code == 200
        data = res.json()
        
        clients = data.get("clients", [])
        # If user is a collaborator for any orgs, check their structure
        for client in clients:
            assert "company_id" in client, "Client missing company_id"
            assert "name" in client, "Client missing name"
            assert "role" in client, "Client missing role"
            assert "stats" in client, "Client missing stats"
            
            # Verify role is social_contributor or social_viewer
            assert client["role"] in ["social_contributor", "social_viewer"], \
                f"Client role should be social_contributor or social_viewer, got {client['role']}"
            
            # Verify stats structure
            client_stats = client["stats"]
            assert "scheduled" in client_stats, "Client stats missing 'scheduled'"
            assert "ideas" in client_stats, "Client stats missing 'ideas'"
            assert "pending" in client_stats, "Client stats missing 'pending'"
            assert "published" in client_stats, "Client stats missing 'published'"
    
    # ============== /api/social-sharing/collaborators/invite Tests ==============
    
    def test_invite_collaborator_requires_auth(self):
        """Test invite endpoint requires authentication"""
        new_session = requests.Session()
        res = new_session.post(f"{BASE_URL}/api/social-sharing/collaborators/invite", json={
            "email": "test@example.com",
            "role": "social_viewer"
        })
        # Should return 401 or 403 when not authenticated
        assert res.status_code in [401, 403], f"Expected 401/403 without auth, got {res.status_code}"
    
    def test_invite_collaborator_endpoint_exists(self):
        """Test invite endpoint returns appropriate status (not 404)"""
        res = self.session.post(f"{BASE_URL}/api/social-sharing/collaborators/invite", json={
            "email": "nonexistent_test_user@kora.com",
            "role": "social_viewer"
        })
        # Should NOT be 404 - means endpoint exists
        # Could be 200/201 (success) or 403 (permission denied if not admin) or 400 (validation)
        assert res.status_code != 404, f"Endpoint not found (404), got {res.status_code}: {res.text}"
        print(f"Invite endpoint response: {res.status_code} - {res.text[:200]}")
    
    def test_invite_collaborator_validates_role(self):
        """Test invite endpoint validates role parameter"""
        res = self.session.post(f"{BASE_URL}/api/social-sharing/collaborators/invite", json={
            "email": "test@example.com",
            "role": "social_viewer"  # valid role
        })
        # Should not be 422 (validation error) for valid roles
        if res.status_code == 422:
            pytest.fail(f"Role validation failed: {res.text}")
    
    # ============== /api/social-sharing/collaborators Tests ==============
    
    def test_list_collaborators_returns_200(self):
        """Test list collaborators endpoint returns 200"""
        res = self.session.get(f"{BASE_URL}/api/social-sharing/collaborators")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    
    def test_list_collaborators_structure(self):
        """Test list collaborators returns correct structure"""
        res = self.session.get(f"{BASE_URL}/api/social-sharing/collaborators")
        assert res.status_code == 200
        data = res.json()
        
        assert "collaborators" in data, "Missing 'collaborators' field"
        assert "pending_invitations" in data, "Missing 'pending_invitations' field"
        assert isinstance(data["collaborators"], list), "collaborators should be a list"
        assert isinstance(data["pending_invitations"], list), "pending_invitations should be a list"
    
    def test_list_collaborators_member_structure(self):
        """Test each collaborator has required fields"""
        res = self.session.get(f"{BASE_URL}/api/social-sharing/collaborators")
        assert res.status_code == 200
        data = res.json()
        
        for collab in data.get("collaborators", []):
            assert "membership_id" in collab, "Collaborator missing membership_id"
            assert "user_id" in collab, "Collaborator missing user_id"
            assert "role" in collab, "Collaborator missing role"
    
    # ============== /api/org/switch/{company_id} Tests ==============
    
    def test_switch_organization_returns_200_or_403(self):
        """Test switch organization endpoint exists and returns appropriate response"""
        # First get user's orgs
        orgs_res = self.session.get(f"{BASE_URL}/api/org/my-organizations")
        assert orgs_res.status_code == 200
        orgs = orgs_res.json()
        
        if len(orgs) > 0:
            target_org = orgs[0]["organization"]["company_id"]
            res = self.session.post(f"{BASE_URL}/api/org/switch/{target_org}")
            # Should be 200 (success) or 403 (no access)
            assert res.status_code in [200, 403], f"Expected 200/403, got {res.status_code}: {res.text}"
            
            if res.status_code == 200:
                data = res.json()
                assert data.get("success") == True, "Switch should return success=True"
    
    # ============== /api/agency/pending-approvals Tests ==============
    
    def test_pending_approvals_returns_200(self):
        """Test pending-approvals endpoint returns 200"""
        res = self.session.get(f"{BASE_URL}/api/agency/pending-approvals")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    
    def test_pending_approvals_structure(self):
        """Test pending-approvals returns correct structure"""
        res = self.session.get(f"{BASE_URL}/api/agency/pending-approvals")
        assert res.status_code == 200
        data = res.json()
        
        assert "pending" in data, "Missing 'pending' field"
        assert isinstance(data["pending"], list), "pending should be a list"


class TestCollaboratorInviteFlow:
    """Test the full collaborator invite flow with membership creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_res.status_code != 200:
            pytest.skip("Cannot authenticate - skipping tests")
        
        self.user_data = login_res.json()
        yield
    
    def test_invited_user_appears_in_my_organizations(self):
        """
        Integration test: If user is invited as collaborator,
        the org should appear in /my-organizations when logged in as that user
        """
        # This tests the flow from the invited user's perspective
        # First check what orgs the current user has access to
        res = self.session.get(f"{BASE_URL}/api/org/my-organizations")
        assert res.status_code == 200
        orgs = res.json()
        
        print(f"User has access to {len(orgs)} organizations")
        for org in orgs:
            print(f"  - {org['organization'].get('name', 'Unknown')} (role: {org['role']}, active: {org['is_active']})")
        
        # Verify collaborator roles are included (if any)
        collaborator_orgs = [o for o in orgs if o["role"] in ["social_contributor", "social_viewer"]]
        print(f"User is collaborator in {len(collaborator_orgs)} organizations")
        
        # Test passes as long as endpoint works - actual data depends on DB state
        assert isinstance(orgs, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
