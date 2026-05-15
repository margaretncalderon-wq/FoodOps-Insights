"""
Sprint 6 Phase 2 — Deeplinks from Weekly Digest in-app notifications.

Tests:
1. POST /api/culinary-digest/generate-now returns primary_action field
2. primary_action has correct shape: {type, link, label, event_id?, menu_id?}
3. Priority cascade: variance > staleness > low_stock > mise_en_place > menu_engineering > digest
4. GET /api/notifications returns culinary_digest notification with link = primary_action.link
5. GET /api/culinary-digest/history stores primary_action
6. GET /api/cost-variance/event/{id} returns event detail for deeplink
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "pamemey27@gmail.com"
ADMIN_PASSWORD = "Evoque2024!"

DEMO_EMAIL = "demo.agency@kora.com"
DEMO_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def admin_session():
    """Login as admin user with food-ops data."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")
    
    return session


@pytest.fixture(scope="module")
def demo_session():
    """Login as demo user."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Demo login failed: {resp.status_code} - {resp.text}")
    
    return session


class TestGenerateNowPrimaryAction:
    """Test POST /api/culinary-digest/generate-now returns primary_action."""
    
    def test_generate_now_returns_primary_action(self, admin_session):
        """Verify generate-now response includes primary_action field."""
        resp = admin_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "primary_action" in data, "Response missing primary_action field"
        
        pa = data["primary_action"]
        assert "type" in pa, "primary_action missing 'type'"
        assert "link" in pa, "primary_action missing 'link'"
        
        # Type must be one of the valid types
        valid_types = ["variance", "staleness", "low_stock", "mise_en_place", "menu_engineering", "digest"]
        assert pa["type"] in valid_types, f"Invalid type: {pa['type']}, expected one of {valid_types}"
        
        # Link must start with /food-ops/menus
        assert pa["link"].startswith("/food-ops/menus"), f"Link should start with /food-ops/menus, got: {pa['link']}"
        
        # Link must contain dialog param
        assert "dialog=" in pa["link"], f"Link should contain dialog param, got: {pa['link']}"
    
    def test_primary_action_shape_variance(self, admin_session):
        """If variance count > 0, primary_action should be variance type with event_id."""
        resp = admin_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        data = resp.json()
        counts = data.get("counts", {})
        pa = data["primary_action"]
        
        if counts.get("variance", 0) > 0:
            assert pa["type"] == "variance", f"With variance > 0, type should be 'variance', got: {pa['type']}"
            assert "event_id" in pa, "Variance primary_action should have event_id"
            assert "dialog=variance" in pa["link"], f"Variance link should have dialog=variance, got: {pa['link']}"
            if pa.get("event_id"):
                assert f"event_id={pa['event_id']}" in pa["link"], "Link should contain event_id param"
    
    def test_primary_action_shape_staleness(self, admin_session):
        """If staleness count > 0 and variance = 0, primary_action should be staleness type."""
        resp = admin_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        data = resp.json()
        counts = data.get("counts", {})
        pa = data["primary_action"]
        
        if counts.get("variance", 0) == 0 and counts.get("stale", 0) > 0:
            assert pa["type"] == "staleness", f"With stale > 0 and variance = 0, type should be 'staleness', got: {pa['type']}"
            assert "menu_id" in pa, "Staleness primary_action should have menu_id"
            assert "dialog=staleness" in pa["link"], f"Staleness link should have dialog=staleness, got: {pa['link']}"
    
    def test_primary_action_shape_menu_engineering(self, admin_session):
        """If only stars/dogs exist, primary_action should be menu_engineering type."""
        resp = admin_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        data = resp.json()
        counts = data.get("counts", {})
        pa = data["primary_action"]
        
        # If no variance, stale, low_stock, mep_gap but has stars or dogs
        if (counts.get("variance", 0) == 0 and 
            counts.get("stale", 0) == 0 and 
            counts.get("low_stock", 0) == 0 and 
            counts.get("mep_gap", 0) == 0 and
            (counts.get("stars", 0) > 0 or counts.get("dogs", 0) > 0)):
            assert pa["type"] == "menu_engineering", f"Expected menu_engineering, got: {pa['type']}"
            assert "dialog=menu-engineering" in pa["link"], f"Link should have dialog=menu-engineering, got: {pa['link']}"
    
    def test_primary_action_fallback_digest(self, admin_session):
        """If no actionable items, primary_action should be digest type."""
        resp = admin_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        data = resp.json()
        counts = data.get("counts", {})
        pa = data["primary_action"]
        
        # If all counts are 0, should fallback to digest
        if all(counts.get(k, 0) == 0 for k in ["variance", "stale", "low_stock", "mep_gap", "stars", "dogs"]):
            assert pa["type"] == "digest", f"Expected digest fallback, got: {pa['type']}"
            assert "dialog=digest" in pa["link"], f"Link should have dialog=digest, got: {pa['link']}"


class TestNotificationsWithPrimaryAction:
    """Test GET /api/notifications returns culinary_digest with primary_action."""
    
    def test_notifications_culinary_digest_has_link(self, demo_session):
        """Verify culinary_digest notification has link field matching primary_action.link."""
        # First generate a digest to create notification
        gen_resp = demo_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert gen_resp.status_code == 200
        
        gen_data = gen_resp.json()
        expected_link = gen_data["primary_action"]["link"]
        
        # Wait a moment for notification to be created
        time.sleep(0.5)
        
        # Fetch notifications
        notif_resp = demo_session.get(f"{BASE_URL}/api/notifications")
        assert notif_resp.status_code == 200
        
        notifications = notif_resp.json()
        
        # Find culinary_digest notification (field is 'type' not 'notification_type')
        digest_notifs = [n for n in notifications if n.get("type") == "culinary_digest"]
        assert len(digest_notifs) > 0, "No culinary_digest notifications found"
        
        latest = digest_notifs[0]  # Should be sorted by created_at desc
        assert "link" in latest, "Notification missing 'link' field"
        assert latest["link"] == expected_link, f"Notification link mismatch: {latest['link']} != {expected_link}"
    
    def test_notification_metadata_has_primary_action(self, demo_session):
        """Verify notification metadata contains primary_action."""
        # Fetch notifications
        notif_resp = demo_session.get(f"{BASE_URL}/api/notifications")
        assert notif_resp.status_code == 200
        
        notifications = notif_resp.json()
        digest_notifs = [n for n in notifications if n.get("type") == "culinary_digest"]
        
        if len(digest_notifs) > 0:
            latest = digest_notifs[0]
            metadata = latest.get("metadata", {})
            assert "primary_action" in metadata, "Notification metadata missing primary_action"
            
            pa = metadata["primary_action"]
            assert "type" in pa, "primary_action in metadata missing 'type'"
            assert "link" in pa, "primary_action in metadata missing 'link'"


class TestHistoryStoresPrimaryAction:
    """Test GET /api/culinary-digest/history stores primary_action."""
    
    def test_history_contains_primary_action(self, admin_session):
        """Verify history entries have primary_action field."""
        resp = admin_session.get(f"{BASE_URL}/api/culinary-digest/history")
        assert resp.status_code == 200
        
        history = resp.json()
        assert isinstance(history, list), "History should be a list"
        
        if len(history) > 0:
            latest = history[0]
            assert "primary_action" in latest, "History entry missing primary_action"
            
            pa = latest["primary_action"]
            assert "type" in pa, "primary_action missing 'type'"
            assert "link" in pa, "primary_action missing 'link'"
            
            valid_types = ["variance", "staleness", "low_stock", "mise_en_place", "menu_engineering", "digest"]
            assert pa["type"] in valid_types, f"Invalid type in history: {pa['type']}"


class TestCostVarianceEventEndpoint:
    """Test GET /api/cost-variance/event/{id} for deeplink support."""
    
    def test_cost_variance_event_endpoint_exists(self, admin_session):
        """Verify the endpoint exists and returns proper structure."""
        # First get list of events with variance
        list_resp = admin_session.get(f"{BASE_URL}/api/cost-variance?days=365")
        assert list_resp.status_code == 200
        
        data = list_resp.json()
        events = data.get("events", [])
        
        if len(events) > 0:
            event_id = events[0]["event_id"]
            
            # Fetch single event detail
            detail_resp = admin_session.get(f"{BASE_URL}/api/cost-variance/event/{event_id}")
            assert detail_resp.status_code == 200, f"Expected 200, got {detail_resp.status_code}"
            
            detail = detail_resp.json()
            assert "event_id" in detail, "Event detail missing event_id"
            assert "event_name" in detail, "Event detail missing event_name"
            assert "theoretical_cost" in detail, "Event detail missing theoretical_cost"
            assert "actual_cost" in detail, "Event detail missing actual_cost"
            assert "variance_percent" in detail, "Event detail missing variance_percent"
            assert "severity" in detail, "Event detail missing severity"
    
    def test_cost_variance_event_not_found(self, admin_session):
        """Verify 404 for non-existent event."""
        resp = admin_session.get(f"{BASE_URL}/api/cost-variance/event/nonexistent_event_id_12345")
        assert resp.status_code == 404, f"Expected 404 for non-existent event, got {resp.status_code}"


class TestPriorityPrecedence:
    """Test the priority cascade: variance > staleness > low_stock > mise_en_place > menu_engineering > digest."""
    
    def test_priority_cascade_documented(self, admin_session):
        """Document the current priority based on actual data."""
        resp = admin_session.post(f"{BASE_URL}/api/culinary-digest/generate-now")
        assert resp.status_code == 200
        
        data = resp.json()
        counts = data.get("counts", {})
        pa = data["primary_action"]
        
        print(f"\n=== Priority Cascade Test ===")
        print(f"Counts: {counts}")
        print(f"Primary Action Type: {pa['type']}")
        print(f"Primary Action Link: {pa['link']}")
        
        # Verify the cascade logic
        if counts.get("variance", 0) > 0:
            assert pa["type"] == "variance", "Variance should take priority"
        elif counts.get("stale", 0) > 0:
            assert pa["type"] == "staleness", "Staleness should be second priority"
        elif counts.get("low_stock", 0) > 0:
            assert pa["type"] == "low_stock", "Low stock should be third priority"
        elif counts.get("mep_gap", 0) > 0:
            assert pa["type"] == "mise_en_place", "Mise en place should be fourth priority"
        elif counts.get("stars", 0) > 0 or counts.get("dogs", 0) > 0:
            assert pa["type"] == "menu_engineering", "Menu engineering should be fifth priority"
        else:
            assert pa["type"] == "digest", "Digest should be fallback"


class TestRegressionSprint5:
    """Regression tests for Sprint 5 functionality."""
    
    def test_settings_get(self, admin_session):
        """GET /api/culinary-digest/settings still works."""
        resp = admin_session.get(f"{BASE_URL}/api/culinary-digest/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "sections" in data
    
    def test_settings_put(self, admin_session):
        """PUT /api/culinary-digest/settings still works."""
        resp = admin_session.put(f"{BASE_URL}/api/culinary-digest/settings", json={
            "enabled": True,
            "frequency": "weekly",
            "day_of_week": 1,
            "hour": 9,
            "recipients_roles": ["owner", "admin"],
            "sections": {
                "exec_summary": True,
                "stars_dogs": True,
                "staleness": True,
                "variance": True,
                "low_stock": True,
                "mise_en_place_gap": True,
                "ai_recommendations": False
            }
        })
        assert resp.status_code == 200
    
    def test_preview(self, admin_session):
        """GET /api/culinary-digest/preview still works."""
        resp = admin_session.get(f"{BASE_URL}/api/culinary-digest/preview")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "html" in data
        assert "settings" in data
    
    def test_history(self, admin_session):
        """GET /api/culinary-digest/history still works."""
        resp = admin_session.get(f"{BASE_URL}/api/culinary-digest/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_menu_engineering_analyze(self, admin_session):
        """GET /api/menu-engineering/analyze still works."""
        resp = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze")
        assert resp.status_code == 200
    
    def test_cost_variance_list(self, admin_session):
        """GET /api/cost-variance still works."""
        resp = admin_session.get(f"{BASE_URL}/api/cost-variance")
        assert resp.status_code == 200
        data = resp.json()
        assert "events" in data
        assert "summary" in data
    
    def test_plated_menus_list(self, admin_session):
        """GET /api/plated-menus still works."""
        resp = admin_session.get(f"{BASE_URL}/api/plated-menus")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_buffet_factors(self, admin_session):
        """GET /api/buffet-factors still works."""
        resp = admin_session.get(f"{BASE_URL}/api/buffet-factors")
        assert resp.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
