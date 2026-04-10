"""
CRM Dashboard Sprint 2 Tests
Tests for:
- CRM Dashboard route and data
- Pipeline stages (7 stages: New, Contacted, Qualified, Proposal, Negotiation, Won, Lost)
- Outreach status updates (9 statuses: 7 pipeline + NoResponse + Engaged)
- Inbound status filters
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    return session


class TestPipelineStages:
    """Test pipeline stages endpoint - should return 7 stages"""
    
    def test_get_pipeline_stages(self, auth_session):
        """GET /api/crm/pipeline-stages returns 7 stages"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pipeline-stages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stages = response.json()
        assert isinstance(stages, list), "Response should be a list"
        assert len(stages) == 7, f"Expected 7 stages, got {len(stages)}"
        
        # Verify stage names
        stage_names = [s["name"] for s in stages]
        expected_stages = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
        assert stage_names == expected_stages, f"Expected {expected_stages}, got {stage_names}"
        
        # Verify each stage has required fields
        for stage in stages:
            assert "id" in stage, "Stage missing 'id'"
            assert "name" in stage, "Stage missing 'name'"
            assert "color" in stage, "Stage missing 'color'"
            assert "order" in stage, "Stage missing 'order'"


class TestOutreachEndpoints:
    """Test outreach lead endpoints"""
    
    def test_get_outreach_leads(self, auth_session):
        """GET /api/crm/outreach returns outreach leads"""
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        leads = response.json()
        assert isinstance(leads, list), "Response should be a list"
    
    def test_update_outreach_status_valid_pipeline_stages(self, auth_session):
        """PUT /api/crm/outreach/{lead_id}/status accepts all 7 pipeline stages"""
        # First get an outreach lead
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No outreach leads available for testing")
        
        lead_id = leads[0]["lead_id"]
        
        # Test all 7 pipeline stages
        valid_statuses = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
        
        for status in valid_statuses:
            response = auth_session.put(
                f"{BASE_URL}/api/crm/outreach/{lead_id}/status",
                params={"outreach_status": status}
            )
            assert response.status_code == 200, f"Status '{status}' failed: {response.status_code} - {response.text}"
    
    def test_update_outreach_status_noresponse_engaged(self, auth_session):
        """PUT /api/crm/outreach/{lead_id}/status accepts NoResponse and Engaged"""
        # First get an outreach lead
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No outreach leads available for testing")
        
        lead_id = leads[0]["lead_id"]
        
        # Test NoResponse and Engaged (additional statuses beyond pipeline)
        additional_statuses = ["NoResponse", "Engaged"]
        
        for status in additional_statuses:
            response = auth_session.put(
                f"{BASE_URL}/api/crm/outreach/{lead_id}/status",
                params={"outreach_status": status}
            )
            assert response.status_code == 200, f"Status '{status}' failed: {response.status_code} - {response.text}"
    
    def test_update_outreach_status_invalid(self, auth_session):
        """PUT /api/crm/outreach/{lead_id}/status rejects invalid status"""
        # First get an outreach lead
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        leads = response.json()
        if not leads:
            pytest.skip("No outreach leads available for testing")
        
        lead_id = leads[0]["lead_id"]
        
        # Test invalid status
        response = auth_session.put(
            f"{BASE_URL}/api/crm/outreach/{lead_id}/status",
            params={"outreach_status": "InvalidStatus"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid status, got {response.status_code}"


class TestInboundEndpoints:
    """Test inbound lead endpoints"""
    
    def test_get_inbound_leads(self, auth_session):
        """GET /api/crm/inbound returns inbound leads"""
        response = auth_session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        leads = response.json()
        assert isinstance(leads, list), "Response should be a list"


class TestCRMStats:
    """Test CRM stats endpoint used by dashboard"""
    
    def test_get_crm_stats(self, auth_session):
        """GET /api/crm/stats returns stats for dashboard"""
        response = auth_session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert isinstance(stats, dict), "Response should be a dict"
        
        # Verify expected fields
        expected_fields = ["total_clients", "active_clients", "total_leads", "new_leads", 
                          "outreach_leads", "inbound_leads", "follow_ups_due"]
        for field in expected_fields:
            assert field in stats, f"Stats missing field: {field}"


class TestDashboardDataSources:
    """Test data sources used by CRM Dashboard component"""
    
    def test_outreach_data_for_dashboard(self, auth_session):
        """Verify outreach data has fields needed for dashboard metrics"""
        response = auth_session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        leads = response.json()
        if leads:
            lead = leads[0]
            # Dashboard uses these fields for metrics
            assert "lead_id" in lead, "Lead missing lead_id"
            # outreach_status or status used for funnel
            assert "outreach_status" in lead or "status" in lead, "Lead missing status field"
    
    def test_inbound_data_for_dashboard(self, auth_session):
        """Verify inbound data has fields needed for dashboard metrics"""
        response = auth_session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200
        
        leads = response.json()
        if leads:
            lead = leads[0]
            # Dashboard uses these fields for metrics
            assert "lead_id" in lead, "Lead missing lead_id"
            # pipeline_stage or status used for funnel
            assert "pipeline_stage" in lead or "status" in lead, "Lead missing status field"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
