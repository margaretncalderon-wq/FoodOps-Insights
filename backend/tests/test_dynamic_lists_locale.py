# Test file for Dynamic Lists and Locale Settings features
# Tests: CRM Dynamic Lists, Locale Settings (Currency, Timezone, Language)

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLocaleSettings:
    """Tests for Locale Settings (Currency, Timezone, Language)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_locale_settings(self):
        """GET /api/org-config/locale returns locale settings with supported currencies and timezones"""
        response = self.session.get(f"{BASE_URL}/api/org-config/locale")
        assert response.status_code == 200, f"Failed to get locale: {response.text}"
        
        data = response.json()
        # Verify structure
        assert "currency" in data, "Missing currency field"
        assert "timezone" in data, "Missing timezone field"
        assert "language" in data, "Missing language field"
        assert "supported_currencies" in data, "Missing supported_currencies"
        assert "supported_timezones" in data, "Missing supported_timezones"
        
        # Verify defaults (DOP, America/Santo_Domingo, es)
        assert data["currency"] in ["DOP", "USD", "EUR", "MXN"], f"Unexpected currency: {data['currency']}"
        assert data["language"] in ["en", "es"], f"Unexpected language: {data['language']}"
        
        # Verify supported currencies list
        assert len(data["supported_currencies"]) > 0, "No supported currencies"
        currency_codes = [c["code"] for c in data["supported_currencies"]]
        assert "DOP" in currency_codes, "DOP not in supported currencies"
        assert "USD" in currency_codes, "USD not in supported currencies"
        
        # Verify supported timezones list
        assert len(data["supported_timezones"]) > 0, "No supported timezones"
        assert "America/Santo_Domingo" in data["supported_timezones"], "Santo Domingo timezone missing"
        
        print(f"✓ Locale settings: currency={data['currency']}, timezone={data['timezone']}, language={data['language']}")
    
    def test_update_locale_currency(self):
        """PUT /api/org-config/locale updates currency"""
        # Get current settings
        get_response = self.session.get(f"{BASE_URL}/api/org-config/locale")
        original_currency = get_response.json().get("currency", "DOP")
        
        # Update to USD
        update_response = self.session.put(f"{BASE_URL}/api/org-config/locale", json={
            "currency": "USD"
        })
        assert update_response.status_code == 200, f"Failed to update currency: {update_response.text}"
        
        data = update_response.json()
        assert data["currency"] == "USD", f"Currency not updated: {data['currency']}"
        
        # Restore original
        self.session.put(f"{BASE_URL}/api/org-config/locale", json={"currency": original_currency})
        print("✓ Currency update works correctly")
    
    def test_update_locale_timezone(self):
        """PUT /api/org-config/locale updates timezone"""
        # Get current settings
        get_response = self.session.get(f"{BASE_URL}/api/org-config/locale")
        original_tz = get_response.json().get("timezone", "America/Santo_Domingo")
        
        # Update to New York
        update_response = self.session.put(f"{BASE_URL}/api/org-config/locale", json={
            "timezone": "America/New_York"
        })
        assert update_response.status_code == 200, f"Failed to update timezone: {update_response.text}"
        
        data = update_response.json()
        assert data["timezone"] == "America/New_York", f"Timezone not updated: {data['timezone']}"
        
        # Restore original
        self.session.put(f"{BASE_URL}/api/org-config/locale", json={"timezone": original_tz})
        print("✓ Timezone update works correctly")
    
    def test_update_locale_language(self):
        """PUT /api/org-config/locale updates language"""
        # Get current settings
        get_response = self.session.get(f"{BASE_URL}/api/org-config/locale")
        original_lang = get_response.json().get("language", "es")
        
        # Update to English
        update_response = self.session.put(f"{BASE_URL}/api/org-config/locale", json={
            "language": "en"
        })
        assert update_response.status_code == 200, f"Failed to update language: {update_response.text}"
        
        data = update_response.json()
        assert data["language"] == "en", f"Language not updated: {data['language']}"
        
        # Restore original
        self.session.put(f"{BASE_URL}/api/org-config/locale", json={"language": original_lang})
        print("✓ Language update works correctly")
    
    def test_invalid_currency_rejected(self):
        """PUT /api/org-config/locale rejects invalid currency"""
        response = self.session.put(f"{BASE_URL}/api/org-config/locale", json={
            "currency": "INVALID"
        })
        assert response.status_code == 400, f"Expected 400 for invalid currency, got {response.status_code}"
        print("✓ Invalid currency correctly rejected")
    
    def test_invalid_timezone_rejected(self):
        """PUT /api/org-config/locale rejects invalid timezone"""
        response = self.session.put(f"{BASE_URL}/api/org-config/locale", json={
            "timezone": "Invalid/Timezone"
        })
        assert response.status_code == 400, f"Expected 400 for invalid timezone, got {response.status_code}"
        print("✓ Invalid timezone correctly rejected")


class TestDynamicLists:
    """Tests for CRM Dynamic Lists (Email Marketing Segmentation)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.created_list_id = None
    
    def test_get_dynamic_lists_empty_or_existing(self):
        """GET /api/crm/dynamic-lists returns array (empty or with existing lists)"""
        response = self.session.get(f"{BASE_URL}/api/crm/dynamic-lists")
        assert response.status_code == 200, f"Failed to get dynamic lists: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Dynamic lists endpoint returns {len(data)} lists")
    
    def test_create_dynamic_list(self):
        """POST /api/crm/dynamic-lists creates a new list with filters"""
        payload = {
            "name": "TEST_Hot Leads Santo Domingo",
            "description": "Test list for hot leads in Santo Domingo",
            "statuses": ["New", "Contacted"],
            "cities": ["Santo Domingo"],
            "sources": [],
            "tags": [],
            "lead_types": [],
            "has_email": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/dynamic-lists", json=payload)
        assert response.status_code == 200, f"Failed to create dynamic list: {response.text}"
        
        data = response.json()
        assert "list_id" in data, "Missing list_id in response"
        assert data["name"] == payload["name"], f"Name mismatch: {data['name']}"
        assert data["filters"]["statuses"] == payload["statuses"], "Statuses filter not saved"
        assert data["filters"]["cities"] == payload["cities"], "Cities filter not saved"
        assert data["filters"]["has_email"] == True, "has_email filter not saved"
        
        self.created_list_id = data["list_id"]
        print(f"✓ Created dynamic list: {data['list_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/dynamic-lists/{self.created_list_id}")
    
    def test_create_dynamic_list_requires_name(self):
        """POST /api/crm/dynamic-lists requires name"""
        response = self.session.post(f"{BASE_URL}/api/crm/dynamic-lists", json={
            "description": "No name provided"
        })
        assert response.status_code == 400, f"Expected 400 for missing name, got {response.status_code}"
        print("✓ Dynamic list creation correctly requires name")
    
    def test_preview_dynamic_list(self):
        """POST /api/crm/dynamic-lists/preview returns matching leads count"""
        payload = {
            "statuses": ["New"],
            "cities": [],
            "sources": [],
            "tags": [],
            "lead_types": [],
            "has_email": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/dynamic-lists/preview", json=payload)
        assert response.status_code == 200, f"Failed to preview: {response.text}"
        
        data = response.json()
        assert "count" in data, "Missing count in preview response"
        assert "leads" in data, "Missing leads in preview response"
        assert isinstance(data["leads"], list), "Leads should be a list"
        
        print(f"✓ Preview returned {data['count']} matching leads")
    
    def test_delete_dynamic_list(self):
        """DELETE /api/crm/dynamic-lists/{list_id} deletes a list"""
        # First create a list
        create_response = self.session.post(f"{BASE_URL}/api/crm/dynamic-lists", json={
            "name": "TEST_To Be Deleted",
            "description": "This list will be deleted"
        })
        assert create_response.status_code == 200
        list_id = create_response.json()["list_id"]
        
        # Delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/crm/dynamic-lists/{list_id}")
        assert delete_response.status_code == 200, f"Failed to delete: {delete_response.text}"
        
        data = delete_response.json()
        assert data.get("deleted") == True, "Delete response should confirm deletion"
        
        # Verify it's gone
        get_response = self.session.get(f"{BASE_URL}/api/crm/dynamic-lists/{list_id}")
        assert get_response.status_code == 404, "Deleted list should return 404"
        
        print("✓ Dynamic list deletion works correctly")
    
    def test_delete_nonexistent_list_returns_404(self):
        """DELETE /api/crm/dynamic-lists/{list_id} returns 404 for nonexistent list"""
        response = self.session.delete(f"{BASE_URL}/api/crm/dynamic-lists/nonexistent_list_id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete nonexistent list correctly returns 404")


class TestCRMDashboard:
    """Tests for CRM Dashboard (verify it still works)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_crm_stats_endpoint(self):
        """GET /api/crm/stats returns CRM statistics"""
        response = self.session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200, f"Failed to get CRM stats: {response.text}"
        
        data = response.json()
        assert "total_clients" in data, "Missing total_clients"
        assert "total_leads" in data, "Missing total_leads"
        print(f"✓ CRM stats: {data['total_leads']} leads, {data['total_clients']} clients")
    
    def test_crm_geo_stats_endpoint(self):
        """GET /api/crm/geo-stats returns geographic statistics"""
        response = self.session.get(f"{BASE_URL}/api/crm/geo-stats")
        assert response.status_code == 200, f"Failed to get geo stats: {response.text}"
        
        data = response.json()
        assert "cities" in data, "Missing cities in geo stats"
        print(f"✓ Geo stats: {len(data['cities'])} cities with leads")
    
    def test_crm_lead_sources_endpoint(self):
        """GET /api/crm/lead-sources returns lead sources"""
        response = self.session.get(f"{BASE_URL}/api/crm/lead-sources")
        assert response.status_code == 200, f"Failed to get lead sources: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Lead sources should be a list"
        print(f"✓ Lead sources: {len(data)} sources")
    
    def test_crm_tags_endpoint(self):
        """GET /api/crm/tags returns tags"""
        response = self.session.get(f"{BASE_URL}/api/crm/tags")
        assert response.status_code == 200, f"Failed to get tags: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Tags should be a list"
        print(f"✓ Tags: {len(data)} tags")


class TestDemandStudioEmailMarketing:
    """Tests for Email Marketing page APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_demand_studio_emails_endpoint(self):
        """GET /api/demand-studio/emails returns email campaigns"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/emails")
        assert response.status_code == 200, f"Failed to get emails: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Emails should be a list"
        print(f"✓ Email campaigns: {len(data)} campaigns")
    
    def test_demand_studio_campaigns_endpoint(self):
        """GET /api/demand-studio/campaigns returns marketing campaigns"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/campaigns")
        assert response.status_code == 200, f"Failed to get campaigns: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Campaigns should be a list"
        print(f"✓ Marketing campaigns: {len(data)} campaigns")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
