"""
Test Performance Dashboard endpoints (iteration 149)
- GET /api/crm/reports/performance - Performance report with KPIs, leaderboard, timeseries
- POST /api/crm/reports/notify-admin-alerts - Notify admins of performance alerts
- POST /api/crm/admin/cleanup-comm-logs - Cleanup comm_logs with missing owner_id/comm_type
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestPerformanceDashboard:
    """Performance Dashboard endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        
        # Store cookies for subsequent requests
        self.cookies = login_res.cookies
        yield
    
    # ============== GET /api/crm/reports/performance ==============
    
    def test_performance_report_week_granularity(self):
        """Test performance report with week granularity (default)"""
        res = self.session.get(
            f"{BASE_URL}/api/crm/reports/performance?granularity=week&period_offset=0",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        
        # Verify response structure
        assert "granularity" in data, "Missing granularity field"
        assert data["granularity"] == "week"
        
        assert "current_period" in data, "Missing current_period"
        assert "label" in data["current_period"]
        assert "start" in data["current_period"]
        assert "end" in data["current_period"]
        
        assert "previous_period" in data, "Missing previous_period"
        assert "label" in data["previous_period"]
        
        assert "kpis" in data, "Missing kpis"
        kpis = data["kpis"]
        
        # Verify KPI structure - each KPI should have current, previous, delta_pct
        expected_kpis = ["calls", "emails", "whatsapp", "meetings", "notes", 
                        "new_leads", "conversions", "follow_ups_completed", 
                        "proposals_sent", "pipeline_value", "revenue_closed"]
        for kpi_name in expected_kpis:
            assert kpi_name in kpis, f"Missing KPI: {kpi_name}"
            kpi = kpis[kpi_name]
            assert "current" in kpi, f"KPI {kpi_name} missing 'current'"
            assert "previous" in kpi, f"KPI {kpi_name} missing 'previous'"
            # delta_pct can be None if previous is 0
        
        assert "leaderboard" in data, "Missing leaderboard"
        assert isinstance(data["leaderboard"], list)
        
        # If leaderboard has entries, verify structure
        if len(data["leaderboard"]) > 0:
            entry = data["leaderboard"][0]
            assert "owner_id" in entry or entry.get("owner_name"), "Leaderboard entry missing owner info"
            assert "rank" in entry, "Leaderboard entry missing rank"
            assert "score" in entry, "Leaderboard entry missing score"
            assert "metrics" in entry, "Leaderboard entry missing metrics"
        
        assert "timeseries" in data, "Missing timeseries"
        assert isinstance(data["timeseries"], list)
        
        assert "alerts" in data, "Missing alerts"
        assert isinstance(data["alerts"], list)
        
        assert "is_sales_only" in data, "Missing is_sales_only flag"
        
        print(f"Performance report (week): {len(data['leaderboard'])} salespeople, {len(data['alerts'])} alerts")
    
    def test_performance_report_day_granularity(self):
        """Test performance report with day granularity"""
        res = self.session.get(
            f"{BASE_URL}/api/crm/reports/performance?granularity=day&period_offset=0",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["granularity"] == "day"
        assert "current_period" in data
        assert "kpis" in data
        assert "leaderboard" in data
        
        print(f"Performance report (day): granularity={data['granularity']}")
    
    def test_performance_report_month_granularity(self):
        """Test performance report with month granularity"""
        res = self.session.get(
            f"{BASE_URL}/api/crm/reports/performance?granularity=month&period_offset=0",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["granularity"] == "month"
        assert "current_period" in data
        assert "kpis" in data
        assert "leaderboard" in data
        
        print(f"Performance report (month): granularity={data['granularity']}")
    
    def test_performance_report_previous_period(self):
        """Test performance report with period_offset=-1 (previous period)"""
        res = self.session.get(
            f"{BASE_URL}/api/crm/reports/performance?granularity=week&period_offset=-1",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "current_period" in data
        assert "previous_period" in data
        
        print(f"Performance report (week, offset=-1): period={data['current_period']['label']}")
    
    def test_performance_report_invalid_granularity(self):
        """Test performance report with invalid granularity returns 400"""
        res = self.session.get(
            f"{BASE_URL}/api/crm/reports/performance?granularity=invalid",
            cookies=self.cookies
        )
        assert res.status_code == 400, f"Expected 400 for invalid granularity, got {res.status_code}"
    
    def test_performance_report_timeseries_buckets(self):
        """Test performance report with custom timeseries_buckets"""
        res = self.session.get(
            f"{BASE_URL}/api/crm/reports/performance?granularity=week&timeseries_buckets=6",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "timeseries" in data
        # Timeseries should have up to 6 buckets (may be less if no data)
        assert len(data["timeseries"]) <= 6, f"Expected max 6 timeseries buckets, got {len(data['timeseries'])}"
        
        print(f"Performance report timeseries: {len(data['timeseries'])} buckets")
    
    # ============== POST /api/crm/reports/notify-admin-alerts ==============
    
    def test_notify_admin_alerts(self):
        """Test notify admin alerts endpoint"""
        res = self.session.post(
            f"{BASE_URL}/api/crm/reports/notify-admin-alerts?granularity=week",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "ok" in data, "Missing 'ok' field"
        assert data["ok"] == True
        assert "alerts" in data, "Missing 'alerts' count"
        assert "notifications_sent" in data, "Missing 'notifications_sent' count"
        
        print(f"Notify admin alerts: {data['alerts']} alerts, {data['notifications_sent']} notifications sent")
    
    def test_notify_admin_alerts_idempotent(self):
        """Test notify admin alerts is idempotent (second call sends 0)"""
        # First call
        res1 = self.session.post(
            f"{BASE_URL}/api/crm/reports/notify-admin-alerts?granularity=week",
            cookies=self.cookies
        )
        assert res1.status_code == 200
        
        # Second call should be idempotent
        res2 = self.session.post(
            f"{BASE_URL}/api/crm/reports/notify-admin-alerts?granularity=week",
            cookies=self.cookies
        )
        assert res2.status_code == 200
        
        data2 = res2.json()
        # Second call should send 0 notifications (already sent today)
        assert data2["notifications_sent"] == 0, f"Expected 0 notifications on second call, got {data2['notifications_sent']}"
        
        print(f"Notify admin alerts idempotent: second call sent {data2['notifications_sent']} notifications")
    
    # ============== POST /api/crm/admin/cleanup-comm-logs ==============
    
    def test_cleanup_comm_logs(self):
        """Test cleanup comm logs endpoint"""
        res = self.session.post(
            f"{BASE_URL}/api/crm/admin/cleanup-comm-logs",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "ok" in data, "Missing 'ok' field"
        assert data["ok"] == True
        assert "scanned" in data, "Missing 'scanned' count"
        assert "fixed_owner_id" in data, "Missing 'fixed_owner_id' count"
        assert "fixed_comm_type" in data, "Missing 'fixed_comm_type' count"
        assert "fixed_log_id" in data, "Missing 'fixed_log_id' count"
        
        print(f"Cleanup comm logs: scanned={data['scanned']}, fixed_owner={data['fixed_owner_id']}, fixed_type={data['fixed_comm_type']}")
    
    def test_cleanup_comm_logs_idempotent(self):
        """Test cleanup comm logs is idempotent (second call fixes 0)"""
        # First call
        res1 = self.session.post(
            f"{BASE_URL}/api/crm/admin/cleanup-comm-logs",
            cookies=self.cookies
        )
        assert res1.status_code == 200
        
        # Second call should fix 0 (already cleaned)
        res2 = self.session.post(
            f"{BASE_URL}/api/crm/admin/cleanup-comm-logs",
            cookies=self.cookies
        )
        assert res2.status_code == 200
        
        data2 = res2.json()
        # Second call should fix 0
        assert data2["fixed_owner_id"] == 0, f"Expected 0 fixed_owner_id on second call, got {data2['fixed_owner_id']}"
        assert data2["fixed_comm_type"] == 0, f"Expected 0 fixed_comm_type on second call, got {data2['fixed_comm_type']}"
        
        print(f"Cleanup comm logs idempotent: second call fixed {data2['fixed_owner_id']} owners, {data2['fixed_comm_type']} types")


class TestExistingAPIs:
    """Regression tests for existing APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.cookies = login_res.cookies
        yield
    
    def test_get_social_posts(self):
        """Test GET /api/demand-studio/social/posts returns 200"""
        res = self.session.get(
            f"{BASE_URL}/api/demand-studio/social/posts",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Expected list of posts"
        print(f"Social posts: {len(data)} posts")
    
    def test_get_leads(self):
        """Test GET /api/leads returns 200"""
        res = self.session.get(
            f"{BASE_URL}/api/leads",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Expected list of leads"
        print(f"Leads: {len(data)} leads")
    
    def test_get_recipes(self):
        """Test GET /api/recipes returns 200"""
        res = self.session.get(
            f"{BASE_URL}/api/recipes",
            cookies=self.cookies
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Expected list of recipes"
        print(f"Recipes: {len(data)} recipes")
    
    def test_post_recipe_with_string_instructions(self):
        """Test POST /api/recipes with instructions as STRING (not array)"""
        recipe_data = {
            "name": "TEST_Recipe_E2E_149",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "unit",
            "instructions": "Step 1: Prepare ingredients.\nStep 2: Cook.\nStep 3: Serve.",
            "ingredients": [
                {"ingredient_id": "test_ing_1", "name": "Test Ingredient", "quantity": 100, "unit": "g"}
            ]
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            cookies=self.cookies
        )
        assert res.status_code in [200, 201], f"Expected 200/201, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "recipe_id" in data, "Missing recipe_id in response"
        
        # Cleanup - delete the test recipe
        recipe_id = data["recipe_id"]
        del_res = self.session.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            cookies=self.cookies
        )
        assert del_res.status_code in [200, 204], f"Failed to delete test recipe: {del_res.text}"
        
        print(f"Recipe created with string instructions: {recipe_id}")


class TestLandingPageWaitlist:
    """Test landing page waitlist endpoint"""
    
    def test_waitlist_registration(self):
        """Test POST /api/launch/waitlist with new email"""
        import uuid
        test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        
        session = requests.Session()
        res = session.post(
            f"{BASE_URL}/api/launch/waitlist",
            json={"email": test_email, "name": "Test User", "company": "Test Co"}
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "is_founding" in data, "Missing is_founding field"
        assert isinstance(data["is_founding"], bool), "is_founding should be boolean"
        
        print(f"Waitlist registration: email={test_email}, is_founding={data['is_founding']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
