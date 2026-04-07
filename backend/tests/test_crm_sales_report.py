"""
Test CRM Sales Report Features:
1. Bug fix: Outreach/Inbound endpoints exclude Converted leads
2. Daily Activity endpoint
3. Sales Goals CRUD
4. Weekly Progress endpoint
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuth:
    """Get auth token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("token") or data.get("access_token")
        assert token, "No token in response"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestConvertedLeadsExclusion(TestAuth):
    """Bug fix: Converted leads should NOT appear in outreach/inbound lists"""
    
    def test_outreach_excludes_converted(self, auth_headers):
        """GET /api/crm/outreach should NOT return leads with status 'Converted'"""
        response = requests.get(
            f"{BASE_URL}/api/crm/outreach",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Outreach endpoint failed: {response.text}"
        leads = response.json()
        
        # Check that no lead has status 'Converted'
        converted_leads = [l for l in leads if l.get("status") == "Converted"]
        assert len(converted_leads) == 0, f"Found {len(converted_leads)} converted leads in outreach list - bug not fixed!"
        print(f"✓ Outreach endpoint returned {len(leads)} leads, none with status 'Converted'")
    
    def test_inbound_excludes_converted(self, auth_headers):
        """GET /api/crm/inbound should NOT return leads with status 'Converted'"""
        response = requests.get(
            f"{BASE_URL}/api/crm/inbound",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Inbound endpoint failed: {response.text}"
        leads = response.json()
        
        # Check that no lead has status 'Converted'
        converted_leads = [l for l in leads if l.get("status") == "Converted"]
        assert len(converted_leads) == 0, f"Found {len(converted_leads)} converted leads in inbound list - bug not fixed!"
        print(f"✓ Inbound endpoint returned {len(leads)} leads, none with status 'Converted'")


class TestDailyActivity(TestAuth):
    """Test daily activity endpoint"""
    
    def test_daily_activity_returns_correct_structure(self, auth_headers):
        """GET /api/crm/reports/daily-activity returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/crm/reports/daily-activity",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Daily activity endpoint failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "daily" in data, "Response missing 'daily' array"
        assert "owner_totals" in data, "Response missing 'owner_totals' array"
        assert "date_from" in data, "Response missing 'date_from'"
        assert "date_to" in data, "Response missing 'date_to'"
        
        assert isinstance(data["daily"], list), "'daily' should be a list"
        assert isinstance(data["owner_totals"], list), "'owner_totals' should be a list"
        
        print(f"✓ Daily activity returned {len(data['daily'])} daily records, {len(data['owner_totals'])} owner totals")
        
        # Check daily record structure if any exist
        if data["daily"]:
            record = data["daily"][0]
            expected_fields = ["owner_id", "date", "calls", "emails", "whatsapp", "new_leads", "conversions", "total_activities", "owner_name"]
            for field in expected_fields:
                assert field in record, f"Daily record missing field: {field}"
            print(f"✓ Daily record structure verified with all expected fields")
        
        # Check owner_totals structure if any exist
        if data["owner_totals"]:
            total = data["owner_totals"][0]
            expected_fields = ["owner_id", "owner_name", "calls", "emails", "whatsapp", "new_leads", "conversions", "total_activities", "active_days"]
            for field in expected_fields:
                assert field in total, f"Owner total missing field: {field}"
            print(f"✓ Owner totals structure verified with all expected fields")
    
    def test_daily_activity_with_date_filters(self, auth_headers):
        """GET /api/crm/reports/daily-activity with date_from and date_to filters"""
        # Use last 30 days
        date_to = datetime.now().strftime("%Y-%m-%d")
        date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/crm/reports/daily-activity",
            params={"date_from": date_from, "date_to": date_to},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Daily activity with filters failed: {response.text}"
        data = response.json()
        
        assert data["date_from"] == date_from, f"date_from mismatch: expected {date_from}, got {data['date_from']}"
        assert data["date_to"] == date_to, f"date_to mismatch: expected {date_to}, got {data['date_to']}"
        
        print(f"✓ Daily activity with date filters works correctly (from {date_from} to {date_to})")


class TestSalesGoals(TestAuth):
    """Test sales goals CRUD operations"""
    
    @pytest.fixture(scope="class")
    def test_owner_id(self, auth_headers):
        """Get a team member ID for testing"""
        response = requests.get(
            f"{BASE_URL}/api/crm/team-members",
            headers=auth_headers
        )
        if response.status_code == 200 and response.json():
            return response.json()[0].get("user_id")
        # Fallback: use a test ID
        return "TEST_user_for_goals"
    
    def test_get_sales_goals(self, auth_headers):
        """GET /api/crm/sales-goals returns all goals"""
        response = requests.get(
            f"{BASE_URL}/api/crm/sales-goals",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get sales goals failed: {response.text}"
        goals = response.json()
        assert isinstance(goals, list), "Response should be a list"
        print(f"✓ GET /api/crm/sales-goals returned {len(goals)} goals")
    
    def test_create_sales_goal(self, auth_headers, test_owner_id):
        """POST /api/crm/sales-goals creates/updates a weekly goal"""
        goal_data = {
            "owner_id": test_owner_id,
            "weekly_calls": 20,
            "weekly_emails": 15,
            "weekly_whatsapp": 10,
            "weekly_new_leads": 5,
            "weekly_conversions": 2
        }
        
        response = requests.post(
            f"{BASE_URL}/api/crm/sales-goals",
            json=goal_data,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Create sales goal failed: {response.text}"
        result = response.json()
        
        # Verify the goal was created/updated
        assert result.get("owner_id") == test_owner_id, "owner_id mismatch"
        assert result.get("weekly_calls") == 20, "weekly_calls mismatch"
        assert result.get("weekly_emails") == 15, "weekly_emails mismatch"
        assert result.get("weekly_whatsapp") == 10, "weekly_whatsapp mismatch"
        assert result.get("weekly_new_leads") == 5, "weekly_new_leads mismatch"
        assert result.get("weekly_conversions") == 2, "weekly_conversions mismatch"
        
        print(f"✓ POST /api/crm/sales-goals created goal for owner {test_owner_id}")
    
    def test_create_goal_requires_owner_id(self, auth_headers):
        """POST /api/crm/sales-goals without owner_id should fail"""
        goal_data = {
            "weekly_calls": 10,
            "weekly_emails": 5
        }
        
        response = requests.post(
            f"{BASE_URL}/api/crm/sales-goals",
            json=goal_data,
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400 for missing owner_id, got {response.status_code}"
        print("✓ POST /api/crm/sales-goals correctly rejects request without owner_id")
    
    def test_delete_sales_goal(self, auth_headers, test_owner_id):
        """DELETE /api/crm/sales-goals/{owner_id} removes a goal"""
        # First ensure goal exists
        goal_data = {
            "owner_id": test_owner_id,
            "weekly_calls": 10
        }
        requests.post(
            f"{BASE_URL}/api/crm/sales-goals",
            json=goal_data,
            headers=auth_headers
        )
        
        # Now delete
        response = requests.delete(
            f"{BASE_URL}/api/crm/sales-goals/{test_owner_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete sales goal failed: {response.text}"
        result = response.json()
        assert "deleted" in result.get("message", "").lower() or "message" in result, "Expected deletion confirmation"
        
        print(f"✓ DELETE /api/crm/sales-goals/{test_owner_id} successfully deleted goal")
    
    def test_delete_nonexistent_goal(self, auth_headers):
        """DELETE /api/crm/sales-goals/{owner_id} for non-existent goal returns 404"""
        response = requests.delete(
            f"{BASE_URL}/api/crm/sales-goals/nonexistent_owner_12345",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for non-existent goal, got {response.status_code}"
        print("✓ DELETE for non-existent goal correctly returns 404")


class TestWeeklyProgress(TestAuth):
    """Test weekly progress endpoint"""
    
    def test_weekly_progress_returns_correct_structure(self, auth_headers):
        """GET /api/crm/reports/weekly-progress returns current week progress vs goals"""
        response = requests.get(
            f"{BASE_URL}/api/crm/reports/weekly-progress",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Weekly progress endpoint failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "week_start" in data, "Response missing 'week_start'"
        assert "week_end" in data, "Response missing 'week_end'"
        assert "progress" in data, "Response missing 'progress' array"
        
        assert isinstance(data["progress"], list), "'progress' should be a list"
        
        print(f"✓ Weekly progress returned for week {data['week_start']} to {data['week_end']}")
        print(f"  Found {len(data['progress'])} team members with progress data")
        
        # Check progress record structure if any exist
        if data["progress"]:
            record = data["progress"][0]
            expected_fields = ["owner_id", "owner_name", "has_goals", "metrics", "overall_percentage"]
            for field in expected_fields:
                assert field in record, f"Progress record missing field: {field}"
            
            # Check metrics structure if has_goals
            if record.get("has_goals") and record.get("metrics"):
                metric = record["metrics"][0]
                assert "label" in metric, "Metric missing 'label'"
                assert "goal" in metric, "Metric missing 'goal'"
                assert "actual" in metric, "Metric missing 'actual'"
                assert "percentage" in metric, "Metric missing 'percentage'"
                print(f"✓ Progress metrics structure verified")
    
    def test_weekly_progress_with_owner_filter(self, auth_headers):
        """GET /api/crm/reports/weekly-progress with owner_id filter"""
        # First get team members
        team_response = requests.get(
            f"{BASE_URL}/api/crm/team-members",
            headers=auth_headers
        )
        if team_response.status_code == 200 and team_response.json():
            owner_id = team_response.json()[0].get("user_id")
            
            response = requests.get(
                f"{BASE_URL}/api/crm/reports/weekly-progress",
                params={"owner_id": owner_id},
                headers=auth_headers
            )
            assert response.status_code == 200, f"Weekly progress with filter failed: {response.text}"
            data = response.json()
            
            # Should only have progress for the filtered owner
            if data["progress"]:
                assert all(p["owner_id"] == owner_id for p in data["progress"]), "Filter not applied correctly"
            print(f"✓ Weekly progress with owner_id filter works correctly")
        else:
            print("⚠ No team members found, skipping owner filter test")


class TestTeamMembers(TestAuth):
    """Test team members endpoint (used by Sales Report)"""
    
    def test_get_team_members(self, auth_headers):
        """GET /api/crm/team-members returns team members"""
        response = requests.get(
            f"{BASE_URL}/api/crm/team-members",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Team members endpoint failed: {response.text}"
        members = response.json()
        assert isinstance(members, list), "Response should be a list"
        print(f"✓ GET /api/crm/team-members returned {len(members)} members")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
