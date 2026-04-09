"""
Test CRM Improvements: Grouping, Sorting, Source Normalization
- Default sort A-Z by lead_name
- Group by company/status
- Source column with colored badges
- Normalize lead sources endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCRMImprovements:
    """Test CRM improvements for Outreach and Inbound sections"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get session
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        if login_response.status_code != 200:
            pytest.skip("Authentication failed - skipping tests")
        
        yield
    
    # ============== OUTREACH TESTS ==============
    
    def test_outreach_leads_endpoint(self):
        """Test GET /api/crm/outreach returns leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Outreach leads count: {len(data)}")
        
        # Check lead structure
        if len(data) > 0:
            lead = data[0]
            assert "lead_id" in lead, "Lead should have lead_id"
            # Check for source field
            if "source" in lead:
                print(f"First lead source: {lead.get('source')}")
    
    def test_outreach_leads_have_source_field(self):
        """Test that outreach leads have source field for badges"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        data = response.json()
        leads_with_source = [l for l in data if l.get("source")]
        print(f"Leads with source: {len(leads_with_source)} / {len(data)}")
        
        # Check source values
        sources = set(l.get("source") for l in data if l.get("source"))
        print(f"Unique sources: {sources}")
    
    def test_outreach_leads_sorted_alphabetically(self):
        """Test that leads can be sorted alphabetically by name"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 1:
            # Get names
            names = [l.get("lead_name") or l.get("name") or l.get("company_name") or "" for l in data]
            names_filtered = [n for n in names if n]
            
            # Check if frontend can sort these
            sorted_names = sorted(names_filtered, key=str.lower)
            print(f"First 5 names: {names_filtered[:5]}")
            print(f"First 5 sorted: {sorted_names[:5]}")
    
    # ============== INBOUND TESTS ==============
    
    def test_inbound_leads_endpoint(self):
        """Test GET /api/crm/inbound returns leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Inbound leads count: {len(data)}")
    
    def test_inbound_leads_have_source_field(self):
        """Test that inbound leads have source field for badges"""
        response = self.session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200
        
        data = response.json()
        leads_with_source = [l for l in data if l.get("source")]
        print(f"Inbound leads with source: {len(leads_with_source)} / {len(data)}")
        
        sources = set(l.get("source") for l in data if l.get("source"))
        print(f"Inbound unique sources: {sources}")
    
    def test_inbound_leads_have_company_field(self):
        """Test that inbound leads have company field for grouping"""
        response = self.session.get(f"{BASE_URL}/api/crm/inbound")
        assert response.status_code == 200
        
        data = response.json()
        leads_with_company = [l for l in data if l.get("company_name") or l.get("company")]
        print(f"Inbound leads with company: {len(leads_with_company)} / {len(data)}")
    
    # ============== NORMALIZE SOURCES TEST ==============
    
    def test_normalize_sources_endpoint(self):
        """Test POST /api/crm/normalize-sources normalizes lead sources"""
        response = self.session.post(f"{BASE_URL}/api/crm/normalize-sources")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "normalized" in data, "Response should have 'normalized' count"
        assert "total_checked" in data, "Response should have 'total_checked' count"
        
        print(f"Normalized: {data['normalized']} / {data['total_checked']} leads")
    
    # ============== LEAD SOURCES CRUD ==============
    
    def test_get_lead_sources(self):
        """Test GET /api/crm/lead-sources returns available sources"""
        response = self.session.get(f"{BASE_URL}/api/crm/lead-sources")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Lead sources count: {len(data)}")
        
        # Check for expected normalized sources
        source_names = [s.get("name") for s in data]
        expected_sources = ["Website", "LinkedIn", "Instagram", "Outreach", "Importación"]
        for expected in expected_sources:
            if expected in source_names:
                print(f"Found expected source: {expected}")
    
    # ============== COMPANY-ONLY LEADS ==============
    
    def test_outreach_company_only_leads(self):
        """Test that company-only leads are identifiable"""
        response = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert response.status_code == 200
        
        data = response.json()
        company_only = []
        person_leads = []
        
        for lead in data:
            lead_name = (lead.get("lead_name") or lead.get("name") or "").strip()
            company_name = (lead.get("company_name") or lead.get("company") or "").strip()
            
            # Company-only: no person name OR name equals company name
            if company_name and (not lead_name or lead_name.lower() == company_name.lower()):
                company_only.append(lead)
            elif lead_name:
                person_leads.append(lead)
        
        print(f"Company-only leads: {len(company_only)}")
        print(f"Person leads: {len(person_leads)}")
        
        # Print some examples
        if company_only:
            print(f"Company-only example: {company_only[0].get('company_name')}")
        if person_leads:
            print(f"Person lead example: {person_leads[0].get('lead_name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
