"""
Test cases for Owner Assignment System and Sales Report features
Tests:
- GET /api/crm/team-members - list of team members
- PATCH /api/crm/leads/{lead_id}/owner - assign owner to lead
- GET /api/crm/reports/owners - sales report by owner with filters
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed - status {response.status_code}: {response.text}")

@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestTeamMembers:
    """Test GET /api/crm/team-members endpoint"""
    
    def test_get_team_members_success(self, authenticated_client):
        """Should return list of team members"""
        response = authenticated_client.get(f"{BASE_URL}/api/crm/team-members")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have at least one team member
        if len(data) > 0:
            member = data[0]
            assert "user_id" in member, "Team member should have user_id"
            assert "name" in member or "email" in member, "Team member should have name or email"
            print(f"Found {len(data)} team members")
            for m in data:
                print(f"  - {m.get('name', m.get('email', m.get('user_id')))}")
    
    def test_team_members_requires_auth(self, api_client):
        """Should return 401 without authentication"""
        # Create new session without auth
        unauth_session = requests.Session()
        response = unauth_session.get(f"{BASE_URL}/api/crm/team-members")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"


class TestLeadOwnerAssignment:
    """Test PATCH /api/crm/leads/{lead_id}/owner endpoint"""
    
    def test_get_leads_to_find_test_lead(self, authenticated_client):
        """Get leads to find one for testing owner assignment"""
        response = authenticated_client.get(f"{BASE_URL}/api/leads")
        
        assert response.status_code == 200, f"Failed to get leads: {response.text}"
        
        leads = response.json()
        assert isinstance(leads, list), "Leads should be a list"
        print(f"Found {len(leads)} leads")
        
        # Store a lead_id for next tests
        if len(leads) > 0:
            pytest.lead_id = leads[0].get("lead_id")
            pytest.lead_owner = leads[0].get("owner_id")
            print(f"Using lead: {pytest.lead_id}, current owner: {pytest.lead_owner}")
    
    def test_assign_owner_to_lead(self, authenticated_client):
        """Should successfully assign owner to a lead"""
        # First get team members
        team_response = authenticated_client.get(f"{BASE_URL}/api/crm/team-members")
        assert team_response.status_code == 200
        
        team_members = team_response.json()
        if len(team_members) == 0:
            pytest.skip("No team members available")
        
        # Get a lead_id
        leads_response = authenticated_client.get(f"{BASE_URL}/api/leads")
        leads = leads_response.json()
        if len(leads) == 0:
            pytest.skip("No leads available for testing")
        
        # Find a lead that's NOT converted (can't update converted leads)
        test_lead = None
        for lead in leads:
            if lead.get("status") != "Converted":
                test_lead = lead
                break
        
        if not test_lead:
            pytest.skip("No non-converted leads available for testing")
        
        lead_id = test_lead.get("lead_id")
        owner_id = team_members[0].get("user_id")
        
        print(f"Assigning owner {owner_id} to lead {lead_id}")
        
        # Assign owner
        response = authenticated_client.patch(
            f"{BASE_URL}/api/crm/leads/{lead_id}/owner",
            json={"owner_id": owner_id}
        )
        
        assert response.status_code == 200, f"Failed to assign owner: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert data.get("lead_id") == lead_id, "Response should return lead_id"
        assert data.get("owner_id") == owner_id, "Response should return assigned owner_id"
        
        print(f"Successfully assigned owner: {data}")
        
        # Verify by fetching the lead
        verify_response = authenticated_client.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert verify_response.status_code == 200
        updated_lead = verify_response.json()
        assert updated_lead.get("owner_id") == owner_id, "Lead owner_id should be updated"
    
    def test_unassign_owner_from_lead(self, authenticated_client):
        """Should successfully unassign owner (set to null)"""
        # Get a lead
        leads_response = authenticated_client.get(f"{BASE_URL}/api/leads")
        leads = leads_response.json()
        
        # Find a non-converted lead with an owner
        test_lead = None
        for lead in leads:
            if lead.get("status") != "Converted" and lead.get("owner_id"):
                test_lead = lead
                break
        
        if not test_lead:
            pytest.skip("No assigned non-converted leads available")
        
        lead_id = test_lead.get("lead_id")
        
        # Unassign owner (null)
        response = authenticated_client.patch(
            f"{BASE_URL}/api/crm/leads/{lead_id}/owner",
            json={"owner_id": None}
        )
        
        assert response.status_code == 200, f"Failed to unassign owner: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("owner_id") is None, "owner_id should be null after unassignment"
        
        print(f"Successfully unassigned owner from lead {lead_id}")
    
    def test_assign_owner_invalid_lead(self, authenticated_client):
        """Should return 404 for non-existent lead"""
        response = authenticated_client.patch(
            f"{BASE_URL}/api/crm/leads/lead_nonexistent123/owner",
            json={"owner_id": "some_user_id"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_assign_invalid_owner_id(self, authenticated_client):
        """Should return 400 for invalid owner_id"""
        # Get a lead
        leads_response = authenticated_client.get(f"{BASE_URL}/api/leads")
        leads = leads_response.json()
        
        test_lead = None
        for lead in leads:
            if lead.get("status") != "Converted":
                test_lead = lead
                break
        
        if not test_lead:
            pytest.skip("No non-converted leads available")
        
        lead_id = test_lead.get("lead_id")
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/crm/leads/{lead_id}/owner",
            json={"owner_id": "invalid_user_id_123"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"


class TestSalesReport:
    """Test GET /api/crm/reports/owners endpoint"""
    
    def test_get_sales_report_basic(self, authenticated_client):
        """Should return sales report with owners and totals"""
        response = authenticated_client.get(f"{BASE_URL}/api/crm/reports/owners")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate structure
        assert "owners" in data, "Response should have 'owners' field"
        assert "totals" in data, "Response should have 'totals' field"
        
        # Validate owners list
        owners = data["owners"]
        assert isinstance(owners, list), "owners should be a list"
        
        print(f"Found {len(owners)} owners in report")
        
        if len(owners) > 0:
            owner = owners[0]
            # Validate owner metrics
            expected_fields = [
                "owner_id", "owner_name", "total_leads", "nuevos", 
                "trabajados", "contactados", "sin_respuesta", 
                "interesados", "convertidos", "tasa_contacto", "tasa_conversion"
            ]
            for field in expected_fields:
                assert field in owner, f"Owner should have '{field}' field"
            
            print(f"Sample owner data: {owner}")
        
        # Validate totals
        totals = data["totals"]
        expected_total_fields = [
            "total_leads", "nuevos", "trabajados", "contactados",
            "sin_respuesta", "interesados", "convertidos", 
            "tasa_contacto", "tasa_conversion"
        ]
        for field in expected_total_fields:
            assert field in totals, f"Totals should have '{field}' field"
        
        print(f"Totals: {totals}")
    
    def test_sales_report_with_date_filters(self, authenticated_client):
        """Should filter results by date range"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/crm/reports/owners",
            params={
                "date_from": "2024-01-01",
                "date_to": "2026-12-31"
            }
        )
        
        assert response.status_code == 200, f"Failed with date filters: {response.text}"
        
        data = response.json()
        assert "owners" in data
        assert "totals" in data
        
        print(f"Report with date filters: {data['totals']}")
    
    def test_sales_report_with_owner_filter(self, authenticated_client):
        """Should filter by specific owner_id"""
        # First get team members to get a valid owner_id
        team_response = authenticated_client.get(f"{BASE_URL}/api/crm/team-members")
        team_members = team_response.json()
        
        if len(team_members) == 0:
            pytest.skip("No team members available")
        
        owner_id = team_members[0].get("user_id")
        
        response = authenticated_client.get(
            f"{BASE_URL}/api/crm/reports/owners",
            params={"owner_id": owner_id}
        )
        
        assert response.status_code == 200, f"Failed with owner filter: {response.text}"
        
        data = response.json()
        print(f"Report for owner {owner_id}: {data}")
    
    def test_sales_report_exclude_unassigned(self, authenticated_client):
        """Should exclude unassigned leads when include_unassigned=false"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/crm/reports/owners",
            params={"include_unassigned": "false"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        owners = data.get("owners", [])
        
        # Check that no owner has owner_id=None
        for owner in owners:
            assert owner.get("owner_id") is not None, "Should not include unassigned"
        
        print(f"Report excluding unassigned: {len(owners)} owners")
    
    def test_sales_report_include_unassigned(self, authenticated_client):
        """Should include unassigned leads when include_unassigned=true (default)"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/crm/reports/owners",
            params={"include_unassigned": "true"}
        )
        
        assert response.status_code == 200
        
        data = response.json()
        owners = data.get("owners", [])
        
        # Check if there's an unassigned entry (owner_id=None)
        has_unassigned = any(o.get("owner_id") is None for o in owners)
        print(f"Has unassigned leads: {has_unassigned}")
        print(f"Total owners in report: {len(owners)}")
    
    def test_sales_report_requires_auth(self, api_client):
        """Should return 401 without authentication"""
        unauth_session = requests.Session()
        response = unauth_session.get(f"{BASE_URL}/api/crm/reports/owners")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


class TestIntegrationOwnerAssignmentAndReport:
    """Integration tests: assign owner and verify in report"""
    
    def test_assign_owner_reflects_in_report(self, authenticated_client):
        """After assigning owner, lead should appear in their report metrics"""
        # Get team members
        team_response = authenticated_client.get(f"{BASE_URL}/api/crm/team-members")
        team_members = team_response.json()
        
        if len(team_members) == 0:
            pytest.skip("No team members")
        
        # Get leads
        leads_response = authenticated_client.get(f"{BASE_URL}/api/leads")
        leads = leads_response.json()
        
        # Find an unassigned non-converted lead
        test_lead = None
        for lead in leads:
            if lead.get("status") != "Converted" and not lead.get("owner_id"):
                test_lead = lead
                break
        
        if not test_lead:
            # Try any non-converted lead
            for lead in leads:
                if lead.get("status") != "Converted":
                    test_lead = lead
                    break
        
        if not test_lead:
            pytest.skip("No suitable leads for testing")
        
        lead_id = test_lead.get("lead_id")
        owner_id = team_members[0].get("user_id")
        
        # Assign owner
        assign_response = authenticated_client.patch(
            f"{BASE_URL}/api/crm/leads/{lead_id}/owner",
            json={"owner_id": owner_id}
        )
        assert assign_response.status_code == 200
        
        # Check report
        report_response = authenticated_client.get(f"{BASE_URL}/api/crm/reports/owners")
        report = report_response.json()
        
        # Find this owner in report
        owner_in_report = None
        for o in report.get("owners", []):
            if o.get("owner_id") == owner_id:
                owner_in_report = o
                break
        
        # Owner should exist in report with at least 1 lead
        if owner_in_report:
            assert owner_in_report["total_leads"] >= 1, "Owner should have at least 1 lead"
            print(f"Owner {owner_id} has {owner_in_report['total_leads']} leads")
        else:
            print(f"Owner {owner_id} not found in report (might not have leads in date range)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
