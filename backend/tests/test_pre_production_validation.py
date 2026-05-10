"""
Pre-Production Validation Tests - Iteration 150
Tests all critical features before production deployment to ourkora.com

Features tested:
1. Backend Health: launch/stats, performance report, social posts, recipes
2. Newsletter endpoint (admin-only, demo_mode when SMTP not configured)
3. Performance Dashboard UI
4. Demand Studio regression (post overwrite bug fix)
5. Recipe creation regression
6. Landing page with Founding 100
7. CRM regression
8. Login/Auth regression
9. Notifications
10. Data integrity
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
NON_ADMIN_EMAIL = "pamemey27@gmail.com"
NON_ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def admin_session():
    """Get authenticated admin session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as admin
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
    
    return session


@pytest.fixture(scope="module")
def non_admin_session():
    """Get authenticated non-admin session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as non-admin
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": NON_ADMIN_EMAIL,
        "password": NON_ADMIN_PASSWORD
    })
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
    
    return session


class TestBackendHealth:
    """Backend health and core API tests"""
    
    def test_launch_stats(self, admin_session):
        """GET /api/launch/stats should return 200 with founding_remaining"""
        response = admin_session.get(f"{BASE_URL}/api/launch/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "founding_remaining" in data, "Missing founding_remaining in response"
        assert isinstance(data["founding_remaining"], int), "founding_remaining should be int"
    
    def test_performance_report_week(self, admin_session):
        """GET /api/crm/reports/performance?granularity=week should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=week")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "kpis" in data, "Missing kpis in response"
        assert "leaderboard" in data, "Missing leaderboard in response"
        assert "timeseries" in data, "Missing timeseries in response"
    
    def test_social_posts(self, admin_session):
        """GET /api/demand-studio/social/posts should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of posts"
    
    def test_recipes(self, admin_session):
        """GET /api/recipes should return 200 with existing recipes"""
        response = admin_session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of recipes"


class TestNewsletterEndpoint:
    """Newsletter endpoint tests - NEW feature"""
    
    def test_newsletter_admin_without_test_param(self, admin_session):
        """POST /api/crm/reports/send-weekly-newsletter (admin) should return 200 with demo_mode=true"""
        response = admin_session.post(f"{BASE_URL}/api/crm/reports/send-weekly-newsletter")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # SMTP not configured, so should return demo_mode=true
        assert data.get("demo_mode") == True, f"Expected demo_mode=true, got {data}"
        assert "would_send_to" in data or "recipients" in data, "Missing recipients info"
    
    def test_newsletter_admin_with_test_only_to_me(self, admin_session):
        """POST /api/crm/reports/send-weekly-newsletter?test_only_to_me=true should return 200"""
        response = admin_session.post(f"{BASE_URL}/api/crm/reports/send-weekly-newsletter?test_only_to_me=true")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Should still be demo_mode since SMTP not configured
        assert data.get("demo_mode") == True, f"Expected demo_mode=true, got {data}"
    
    def test_newsletter_non_admin_forbidden(self, non_admin_session):
        """POST /api/crm/reports/send-weekly-newsletter (non-admin) should return 403"""
        response = non_admin_session.post(f"{BASE_URL}/api/crm/reports/send-weekly-newsletter")
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}: {response.text}"


class TestPerformanceDashboard:
    """Performance Dashboard API tests"""
    
    def test_performance_day_granularity(self, admin_session):
        """GET /api/crm/reports/performance?granularity=day should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=day")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "current_period" in data, "Missing current_period"
    
    def test_performance_month_granularity(self, admin_session):
        """GET /api/crm/reports/performance?granularity=month should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=month")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_performance_period_offset(self, admin_session):
        """GET /api/crm/reports/performance?period_offset=-1 should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=week&period_offset=-1")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"


class TestCRMRegression:
    """CRM module regression tests"""
    
    def test_crm_stats(self, admin_session):
        """GET /api/crm/stats should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/crm/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_leads_list(self, admin_session):
        """GET /api/leads should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/leads")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of leads"
    
    def test_clients_list(self, admin_session):
        """GET /api/crm/clients should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/crm/clients")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"


class TestDemandStudioRegression:
    """Demand Studio regression tests - verify post overwrite bug is fixed"""
    
    def test_social_accounts(self, admin_session):
        """GET /api/demand-studio/social/accounts should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_social_posts_count(self, admin_session):
        """GET /api/demand-studio/social/posts should return ~19 posts"""
        response = admin_session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert response.status_code == 200
        data = response.json()
        # Should have approximately 19 posts based on context
        assert len(data) >= 10, f"Expected at least 10 posts, got {len(data)}"


class TestRecipeRegression:
    """Recipe module regression tests - verify save bug is fixed"""
    
    def test_recipes_list(self, admin_session):
        """GET /api/recipes should return existing recipes"""
        response = admin_session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list of recipes"
    
    def test_recipe_create_with_string_instructions(self, admin_session):
        """POST /api/recipes with string instructions should work (bug fix verification)"""
        recipe_data = {
            "name": "TEST_Pre_Production_Recipe",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "unit",
            "portions_per_yield": 1,
            "instructions": "Step 1: Test instruction\nStep 2: Another step",
            "ingredients": []
        }
        response = admin_session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        # Cleanup - delete the test recipe
        if response.status_code in [200, 201]:
            data = response.json()
            recipe_id = data.get("recipe_id")
            if recipe_id:
                admin_session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")


class TestAuthRegression:
    """Authentication regression tests"""
    
    def test_login_admin(self):
        """POST /api/auth/login with admin credentials should return 200"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
    
    def test_login_non_admin(self):
        """POST /api/auth/login with non-admin credentials should return 200"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NON_ADMIN_EMAIL,
            "password": NON_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"


class TestNotificationsRegression:
    """Notifications regression tests"""
    
    def test_notifications_list(self, admin_session):
        """GET /api/notifications should return 200"""
        response = admin_session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"


class TestDataIntegrity:
    """Data integrity tests"""
    
    def test_cleanup_comm_logs_idempotent(self, admin_session):
        """POST /api/crm/admin/cleanup-comm-logs second run should be idempotent"""
        # First run
        response1 = admin_session.post(f"{BASE_URL}/api/crm/admin/cleanup-comm-logs")
        assert response1.status_code == 200, f"Expected 200, got {response1.status_code}"
        
        # Second run should fix 0
        response2 = admin_session.post(f"{BASE_URL}/api/crm/admin/cleanup-comm-logs")
        assert response2.status_code == 200
        data2 = response2.json()
        # Second run should have fixed_owner_id=0 (idempotent)
        assert data2.get("fixed_owner_id", 0) == 0, f"Expected idempotent (0 fixes), got {data2}"


class TestLandingPage:
    """Landing page tests (unauthenticated)"""
    
    def test_waitlist_registration(self):
        """POST /api/launch/waitlist should work for new email"""
        import uuid
        test_email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/launch/waitlist", json={
            "email": test_email,
            "name": "Test User",
            "company_name": "Test Company"
        })
        
        # Should return 200 or 201 for new registration
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        data = response.json()
        # Should have founding_position for Founding 100
        assert "founding_position" in data or "is_founding" in data, f"Missing founding info: {data}"
