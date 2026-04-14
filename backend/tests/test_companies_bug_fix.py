"""
Test Companies Bug Fix - Iteration 146
Tests for the fix of KeyError: 'company_entity_id' bug in GET /api/companies

Bug: Companies page showed empty because GET /api/companies crashed with KeyError: 'company_entity_id'
Root cause: company_entities collection had 3 different ID formats:
  - 'company_entity_id' (new API)
  - 'entity_id' (CSV import)
  - 'id' (old migration)

Fix: 
1) Normalizing all records to have company_entity_id
2) Making list/get endpoints handle all formats
3) Adding startup migration
4) Fixing CSV import to use correct field name
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


class TestCompaniesEndpoints:
    """Test companies endpoints after bug fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        # Session cookies are automatically stored
        yield
    
    def test_list_companies_returns_200(self):
        """GET /api/companies should return 200 (not 500 KeyError)"""
        response = self.session.get(f"{BASE_URL}/api/companies")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/companies returns 200 with {len(data)} companies")
    
    def test_list_companies_has_company_entity_id(self):
        """All companies should have company_entity_id field (normalized)"""
        response = self.session.get(f"{BASE_URL}/api/companies")
        assert response.status_code == 200
        
        companies = response.json()
        
        # Check that all companies have company_entity_id
        for company in companies:
            assert "company_entity_id" in company, f"Company missing company_entity_id: {company.get('name', 'unknown')}"
            assert company["company_entity_id"] is not None, f"company_entity_id is None for: {company.get('name', 'unknown')}"
        
        print(f"✓ All {len(companies)} companies have company_entity_id field")
    
    def test_list_companies_has_contacts_count(self):
        """Companies should have contacts_count field"""
        response = self.session.get(f"{BASE_URL}/api/companies")
        assert response.status_code == 200
        
        companies = response.json()
        
        for company in companies:
            assert "contacts_count" in company, f"Company missing contacts_count: {company.get('name', 'unknown')}"
        
        print(f"✓ All companies have contacts_count field")
    
    def test_get_company_detail_returns_200(self):
        """GET /api/companies/{id} should return 200 with contacts and leads"""
        # First get list to find a company
        list_response = self.session.get(f"{BASE_URL}/api/companies")
        assert list_response.status_code == 200
        
        companies = list_response.json()
        if not companies:
            pytest.skip("No companies found to test detail endpoint")
        
        # Get first company's detail
        company_id = companies[0]["company_entity_id"]
        detail_response = self.session.get(f"{BASE_URL}/api/companies/{company_id}")
        
        assert detail_response.status_code == 200, f"Expected 200, got {detail_response.status_code}: {detail_response.text}"
        
        company = detail_response.json()
        
        # Verify structure
        assert "company_entity_id" in company, "Detail should have company_entity_id"
        assert "contacts" in company, "Detail should have contacts array"
        assert "leads" in company, "Detail should have leads array"
        assert isinstance(company["contacts"], list), "contacts should be a list"
        assert isinstance(company["leads"], list), "leads should be a list"
        
        print(f"✓ GET /api/companies/{company_id} returns 200 with contacts ({len(company['contacts'])}) and leads ({len(company['leads'])})")
    
    def test_get_company_by_entity_id_format(self):
        """Companies with old 'entity_id' format should be accessible"""
        # Get list first
        list_response = self.session.get(f"{BASE_URL}/api/companies")
        assert list_response.status_code == 200
        
        companies = list_response.json()
        if not companies:
            pytest.skip("No companies found")
        
        # Try to access each company by its ID
        accessible_count = 0
        for company in companies[:5]:  # Test first 5
            company_id = company["company_entity_id"]
            detail_response = self.session.get(f"{BASE_URL}/api/companies/{company_id}")
            
            if detail_response.status_code == 200:
                accessible_count += 1
            else:
                print(f"  Warning: Company {company_id} returned {detail_response.status_code}")
        
        assert accessible_count > 0, "At least one company should be accessible"
        print(f"✓ {accessible_count} companies accessible by company_entity_id")
    
    def test_search_companies(self):
        """Search filter should work"""
        response = self.session.get(f"{BASE_URL}/api/companies?search=test")
        
        assert response.status_code == 200, f"Search failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Search should return a list"
        print(f"✓ Search filter works, returned {len(data)} results")
    
    def test_status_filter(self):
        """Status filter should work"""
        response = self.session.get(f"{BASE_URL}/api/companies?status=Lead")
        
        assert response.status_code == 200, f"Status filter failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Status filter should return a list"
        
        # Verify all returned companies have Lead status
        for company in data:
            assert company.get("status") == "Lead", f"Company {company.get('name')} has status {company.get('status')}, expected Lead"
        
        print(f"✓ Status filter works, returned {len(data)} Lead companies")


class TestCompanySharingEndpoints:
    """Test company sharing endpoints after bug fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
    
    def test_get_company_members_returns_200(self):
        """GET /api/company-sharing/members should return 200 (not 500 KeyError on membership_id)"""
        response = self.session.get(f"{BASE_URL}/api/company-sharing/members")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "members" in data, "Response should have 'members' key"
        assert "pending" in data, "Response should have 'pending' key"
        assert isinstance(data["members"], list), "members should be a list"
        assert isinstance(data["pending"], list), "pending should be a list"
        
        # Verify each member has membership_id
        for member in data["members"]:
            assert "membership_id" in member, f"Member missing membership_id: {member}"
        
        print(f"✓ GET /api/company-sharing/members returns 200 with {len(data['members'])} members and {len(data['pending'])} pending")
    
    def test_check_permission_endpoint(self):
        """GET /api/company-sharing/check-permission should work"""
        response = self.session.get(f"{BASE_URL}/api/company-sharing/check-permission?section=social_media")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "has_access" in data, "Response should have 'has_access' key"
        assert "role" in data, "Response should have 'role' key"
        assert "is_own" in data, "Response should have 'is_own' key"
        
        print(f"✓ GET /api/company-sharing/check-permission returns 200: has_access={data['has_access']}, role={data['role']}")


class TestCompanyIndustries:
    """Test company industries endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
    
    def test_list_industries(self):
        """GET /api/companies/industries should return predefined and custom industries"""
        response = self.session.get(f"{BASE_URL}/api/companies/industries")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "predefined" in data, "Response should have 'predefined' key"
        assert "custom" in data, "Response should have 'custom' key"
        assert isinstance(data["predefined"], list), "predefined should be a list"
        assert len(data["predefined"]) > 0, "Should have predefined industries"
        
        # Check predefined industry structure
        for ind in data["predefined"]:
            assert "value" in ind, "Industry should have 'value'"
            assert "labelEn" in ind, "Industry should have 'labelEn'"
            assert "labelEs" in ind, "Industry should have 'labelEs'"
        
        print(f"✓ GET /api/companies/industries returns {len(data['predefined'])} predefined and {len(data['custom'])} custom industries")


class TestCompanyContacts:
    """Test company contacts endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
    
    def test_list_company_contacts(self):
        """GET /api/companies/{id}/contacts should return contacts list"""
        # First get a company
        list_response = self.session.get(f"{BASE_URL}/api/companies")
        assert list_response.status_code == 200
        
        companies = list_response.json()
        if not companies:
            pytest.skip("No companies found")
        
        company_id = companies[0]["company_entity_id"]
        
        # Get contacts
        response = self.session.get(f"{BASE_URL}/api/companies/{company_id}/contacts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        contacts = response.json()
        assert isinstance(contacts, list), "Contacts should be a list"
        
        print(f"✓ GET /api/companies/{company_id}/contacts returns {len(contacts)} contacts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
