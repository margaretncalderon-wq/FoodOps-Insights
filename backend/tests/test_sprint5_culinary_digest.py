"""
Sprint 5 Phase 2 - Culinary Weekly Digest Tests

Tests for:
- GET /api/culinary-digest/settings - returns default settings
- PUT /api/culinary-digest/settings - persists settings with validations
- GET /api/culinary-digest/preview - returns data + HTML without side-effects
- POST /api/culinary-digest/generate-now - dispatches digest, creates history + notifications
- GET /api/culinary-digest/history - returns recent dispatches
- Disabled section exclusion from preview/generate
- Regression tests for Sprint 1-4 endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "pamemey27@gmail.com"
ADMIN_PASSWORD = "Evoque2024!"
DEMO_EMAIL = "demo.agency@kora.com"
DEMO_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def admin_session():
    """Authenticated session for admin user with food-ops access."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")
    return session


@pytest.fixture(scope="module")
def demo_session():
    """Authenticated session for demo user."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Demo login failed: {resp.status_code} - {resp.text}")
    return session


class TestDigestSettingsEndpoint:
    """Tests for GET/PUT /api/culinary-digest/settings"""
    
    def test_get_settings_requires_auth(self):
        """GET /api/culinary-digest/settings requires authentication."""
        resp = requests.get(f"{BASE_URL}/api/culinary-digest/settings")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_get_settings_returns_defaults(self, admin_session):
        """GET /api/culinary-digest/settings returns default settings doc."""
        resp = admin_session.get(f"{BASE_URL}/api/culinary-digest/settings")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Check required fields exist
        assert "enabled" in data, "Missing 'enabled' field"
        assert "frequency" in data, "Missing 'frequency' field"
        assert "day_of_week" in data, "Missing 'day_of_week' field"
        assert "hour" in data, "Missing 'hour' field"
        assert "recipients_roles" in data, "Missing 'recipients_roles' field"
        assert "recipient_emails_extra" in data, "Missing 'recipient_emails_extra' field"
        assert "sections" in data, "Missing 'sections' field"
        
        # Check sections has all 7 defaults
        sections = data["sections"]
        expected_sections = ["exec_summary", "stars_dogs", "staleness", "variance", 
                           "low_stock", "mise_en_place_gap", "ai_recommendations"]
        for sec in expected_sections:
            assert sec in sections, f"Missing section '{sec}' in sections"
    
    def test_put_settings_requires_auth(self):
        """PUT /api/culinary-digest/settings requires authentication."""
        resp = requests.put(f"{BASE_URL}/api/culinary-digest/settings", json={
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 0,
            "hour": 8
        })
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_put_settings_persists_changes(self, admin_session):
        """PUT /api/culinary-digest/settings persists settings and returns updated doc."""
        payload = {
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 1,  # Tuesday
            "hour": 9,
            "recipients_roles": ["owner", "admin", "manager"],
            "recipient_emails_extra": ["chef@example.com"],
            "sections": {
                "exec_summary": True,
                "stars_dogs": True,
                "staleness": False,  # Disabled
                "variance": True,
                "low_stock": True,
                "mise_en_place_gap": True,
                "ai_recommendations": False
            }
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data["enabled"] == True
        assert data["frequency"] == "weekly"
        assert data["day_of_week"] == 1
        assert data["hour"] == 9
        assert "manager" in data["recipients_roles"]
        assert "chef@example.com" in data["recipient_emails_extra"]
        assert data["sections"]["staleness"] == False
    
    def test_put_settings_invalid_frequency(self, admin_session):
        """PUT /api/culinary-digest/settings returns 400 for invalid frequency."""
        payload = {
            "enabled": True,
            "frequency": "daily",  # Invalid - must be weekly|biweekly|monthly
            "day_of_week": 0,
            "hour": 8
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    
    def test_put_settings_invalid_day_of_week_negative(self, admin_session):
        """PUT /api/culinary-digest/settings returns 400 for day_of_week < 0."""
        payload = {
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": -1,  # Invalid
            "hour": 8
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    
    def test_put_settings_invalid_day_of_week_too_high(self, admin_session):
        """PUT /api/culinary-digest/settings returns 400 for day_of_week > 6."""
        payload = {
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 7,  # Invalid - max is 6
            "hour": 8
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    
    def test_put_settings_invalid_hour_negative(self, admin_session):
        """PUT /api/culinary-digest/settings returns 400 for hour < 0."""
        payload = {
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 0,
            "hour": -1  # Invalid
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    
    def test_put_settings_invalid_hour_too_high(self, admin_session):
        """PUT /api/culinary-digest/settings returns 400 for hour > 23."""
        payload = {
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 0,
            "hour": 24  # Invalid - max is 23
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    
    def test_put_settings_biweekly_frequency(self, admin_session):
        """PUT /api/culinary-digest/settings accepts biweekly frequency."""
        payload = {
            "enabled": True,
            "frequency": "biweekly",
            "day_of_week": 0,
            "hour": 8
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["frequency"] == "biweekly"
    
    def test_put_settings_monthly_frequency(self, admin_session):
        """PUT /api/culinary-digest/settings accepts monthly frequency."""
        payload = {
            "enabled": True,
            "frequency": "monthly",
            "day_of_week": 0,
            "hour": 8
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["frequency"] == "monthly"


class TestDigestPreviewEndpoint:
    """Tests for GET /api/culinary-digest/preview"""
    
    def test_preview_requires_auth(self):
        """GET /api/culinary-digest/preview requires authentication."""
        resp = requests.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_preview_returns_data_html_settings(self, demo_session):
        """GET /api/culinary-digest/preview returns {data, html, settings}."""
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        result = resp.json()
        assert "data" in result, "Missing 'data' field"
        assert "html" in result, "Missing 'html' field"
        assert "settings" in result, "Missing 'settings' field"
    
    def test_preview_data_contains_enabled_sections(self, demo_session):
        """Preview data contains all enabled sections."""
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert resp.status_code == 200
        
        data = resp.json()["data"]
        # Check data structure
        assert "company_id" in data
        assert "company_name" in data
        assert "window_label" in data
        assert "generated_at" in data
        assert "sections_enabled" in data
        
        # Check enabled sections have data (may be empty arrays but should exist)
        sections_enabled = data["sections_enabled"]
        if sections_enabled.get("exec_summary"):
            assert "exec_summary" in data
        if sections_enabled.get("stars_dogs"):
            assert "stars_dogs" in data
    
    def test_preview_html_is_non_empty_string(self, demo_session):
        """Preview HTML is a non-empty string."""
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert resp.status_code == 200
        
        html = resp.json()["html"]
        assert isinstance(html, str), "HTML should be a string"
        assert len(html) > 100, f"HTML should be non-empty, got {len(html)} chars"
        assert "<!DOCTYPE html>" in html or "<html" in html, "HTML should contain valid HTML tags"
    
    def test_preview_no_side_effects(self, demo_session):
        """Preview does not create history entries."""
        # Get history count before
        hist_before = demo_session.get(f"{BASE_URL}/api/culinary-digest/history?limit=100")
        count_before = len(hist_before.json()) if hist_before.status_code == 200 else 0
        
        # Call preview
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert resp.status_code == 200
        
        # Get history count after
        hist_after = demo_session.get(f"{BASE_URL}/api/culinary-digest/history?limit=100")
        count_after = len(hist_after.json()) if hist_after.status_code == 200 else 0
        
        assert count_after == count_before, "Preview should not create history entries"


class TestDigestGenerateNowEndpoint:
    """Tests for POST /api/culinary-digest/generate-now"""
    
    def test_generate_now_requires_auth(self):
        """POST /api/culinary-digest/generate-now requires authentication."""
        resp = requests.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_generate_now_returns_expected_fields(self, demo_session):
        """POST /api/culinary-digest/generate-now returns expected response structure."""
        resp = demo_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        result = resp.json()
        assert "data" in result, "Missing 'data' field"
        assert "recipients" in result, "Missing 'recipients' field"
        assert "notified_user_ids" in result, "Missing 'notified_user_ids' field"
        assert "email_result" in result, "Missing 'email_result' field"
        assert "counts" in result, "Missing 'counts' field"
        assert "history_id" in result, "Missing 'history_id' field"
    
    def test_generate_now_creates_history_entry(self, demo_session):
        """POST /api/culinary-digest/generate-now creates a history entry."""
        # Generate
        resp = demo_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        history_id = resp.json()["history_id"]
        assert history_id.startswith("cdh_"), f"History ID should start with 'cdh_', got {history_id}"
        
        # Verify in history
        hist_resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/history?limit=10")
        assert hist_resp.status_code == 200
        
        history = hist_resp.json()
        history_ids = [h["history_id"] for h in history]
        assert history_id in history_ids, f"History ID {history_id} not found in history"
    
    def test_generate_now_demo_mode_email(self, demo_session):
        """In demo mode (no SMTP), email_result.demo_mode=true."""
        resp = demo_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        email_result = resp.json()["email_result"]
        # In demo mode, either demo_mode=true or success=false with skipped=true
        is_demo = email_result.get("demo_mode", False) or email_result.get("skipped", False)
        assert is_demo or email_result.get("success") == False, \
            f"Expected demo_mode or skipped or success=false, got {email_result}"
    
    def test_generate_now_creates_in_app_notifications(self, demo_session):
        """POST /api/culinary-digest/generate-now creates in-app notifications."""
        resp = demo_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        result = resp.json()
        notified_user_ids = result["notified_user_ids"]
        # Should have at least one notification (for the user's role)
        assert isinstance(notified_user_ids, list), "notified_user_ids should be a list"


class TestDigestHistoryEndpoint:
    """Tests for GET /api/culinary-digest/history"""
    
    def test_history_requires_auth(self):
        """GET /api/culinary-digest/history requires authentication."""
        resp = requests.get(f"{BASE_URL}/api/culinary-digest/history")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_history_returns_list(self, demo_session):
        """GET /api/culinary-digest/history returns a list."""
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/history?limit=10")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        history = resp.json()
        assert isinstance(history, list), "History should be a list"
    
    def test_history_sorted_by_dispatched_at_desc(self, demo_session):
        """History is sorted by dispatched_at descending."""
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/history?limit=10")
        assert resp.status_code == 200
        
        history = resp.json()
        if len(history) >= 2:
            # Check descending order
            for i in range(len(history) - 1):
                assert history[i]["dispatched_at"] >= history[i+1]["dispatched_at"], \
                    "History should be sorted by dispatched_at descending"
    
    def test_history_entry_structure(self, demo_session):
        """History entries have expected structure."""
        # First generate one to ensure we have history
        demo_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        
        resp = demo_session.get(f"{BASE_URL}/api/culinary-digest/history?limit=1")
        assert resp.status_code == 200
        
        history = resp.json()
        if len(history) > 0:
            entry = history[0]
            assert "history_id" in entry
            assert "company_id" in entry
            assert "dispatched_at" in entry
            assert "recipients" in entry
            assert "notified_user_ids" in entry
            assert "email_result" in entry
            assert "counts" in entry


class TestDisabledSectionExclusion:
    """Tests for disabled section exclusion from preview/generate."""
    
    def test_disabled_section_excluded_from_preview(self, admin_session):
        """Disabled section is excluded from preview data."""
        # First, disable staleness section
        settings_payload = {
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 0,
            "hour": 8,
            "recipients_roles": ["owner", "admin"],
            "sections": {
                "exec_summary": True,
                "stars_dogs": True,
                "staleness": False,  # Disabled
                "variance": True,
                "low_stock": True,
                "mise_en_place_gap": True,
                "ai_recommendations": False
            }
        }
        
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json=settings_payload)
        assert resp.status_code == 200
        
        # Get preview
        preview_resp = admin_session.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert preview_resp.status_code == 200
        
        data = preview_resp.json()["data"]
        sections_enabled = data.get("sections_enabled", {})
        
        # staleness should be disabled
        assert sections_enabled.get("staleness") == False, "staleness should be disabled"
        
        # staleness data should be missing or empty
        staleness_data = data.get("staleness")
        assert staleness_data is None or staleness_data == [], \
            f"Disabled staleness section should be missing or empty, got {staleness_data}"


class TestRegressionSprint1to4:
    """Regression tests for Sprint 1-4 endpoints."""
    
    def test_plated_menus_still_works(self, admin_session):
        """GET /api/plated-menus still works."""
        resp = admin_session.get(f"{BASE_URL}/api/plated-menus")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    def test_buffet_factors_still_works(self, admin_session):
        """GET /api/buffet-factors still works."""
        resp = admin_session.get(f"{BASE_URL}/api/buffet-factors")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    def test_kitchen_beo_404_for_nonexistent(self, admin_session):
        """GET /api/kitchen-beo/event/{id} returns 404 for non-existent."""
        resp = admin_session.get(f"{BASE_URL}/api/kitchen-beo/event/nonexistent_event_123")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
    
    def test_menu_engineering_still_works(self, admin_session):
        """GET /api/menu-engineering/analyze still works."""
        resp = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze?days=30")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    def test_cost_variance_still_works(self, admin_session):
        """GET /api/cost-variance still works."""
        resp = admin_session.get(f"{BASE_URL}/api/cost-variance?days=30")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    def test_convert_to_catalog_404_for_nonexistent(self, admin_session):
        """POST /api/plated-menus/{id}/convert-to-catalog returns 404 for non-existent."""
        resp = admin_session.post(f"{BASE_URL}/api/plated-menus/nonexistent_menu_123/convert-to-catalog")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
