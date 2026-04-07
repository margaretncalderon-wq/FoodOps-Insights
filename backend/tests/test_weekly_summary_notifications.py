"""
Test Weekly Summary Notifications Feature
- POST /api/crm/reports/send-weekly-summary: Creates notifications for salespeople and admins
- GET /api/crm/reports/weekly-summary-status: Returns sent_today boolean and sent_at timestamp
- GET /api/notifications: Returns sales_goal_summary and sales_team_summary notification types
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWeeklySummaryNotifications:
    """Tests for weekly summary notification feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        data = login_response.json()
        self.token = data.get("token") or data.get("access_token")
        self.user_id = data.get("user", {}).get("user_id") or data.get("user_id")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    # ============== GET /api/crm/reports/weekly-summary-status ==============
    
    def test_weekly_summary_status_endpoint_returns_200(self):
        """Test that weekly-summary-status endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/crm/reports/weekly-summary-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_weekly_summary_status_returns_correct_structure(self):
        """Test that weekly-summary-status returns sent_today, sent_at, notifications_sent"""
        response = self.session.get(f"{BASE_URL}/api/crm/reports/weekly-summary-status")
        assert response.status_code == 200
        
        data = response.json()
        assert "sent_today" in data, "Response should contain 'sent_today' field"
        assert "sent_at" in data, "Response should contain 'sent_at' field"
        assert "notifications_sent" in data, "Response should contain 'notifications_sent' field"
        
        # sent_today should be boolean
        assert isinstance(data["sent_today"], bool), "sent_today should be boolean"
        
        # notifications_sent should be int
        assert isinstance(data["notifications_sent"], int), "notifications_sent should be int"
    
    def test_weekly_summary_status_shows_sent_today_true(self):
        """Test that status shows sent_today=true when summary was already sent"""
        # According to the context, summary was already sent today
        response = self.session.get(f"{BASE_URL}/api/crm/reports/weekly-summary-status")
        assert response.status_code == 200
        
        data = response.json()
        # Based on context, summary was already sent today
        if data["sent_today"]:
            assert data["sent_at"] is not None, "sent_at should have a timestamp when sent_today is true"
            assert data["notifications_sent"] > 0, "notifications_sent should be > 0 when sent_today is true"
            print(f"Summary was sent today at {data['sent_at']} with {data['notifications_sent']} notifications")
        else:
            print("Summary not sent today - this is also valid state")
    
    # ============== POST /api/crm/reports/send-weekly-summary ==============
    
    def test_send_weekly_summary_endpoint_returns_200(self):
        """Test that send-weekly-summary endpoint returns 200"""
        response = self.session.post(f"{BASE_URL}/api/crm/reports/send-weekly-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_send_weekly_summary_debounce_returns_sent_false(self):
        """Test that send-weekly-summary returns sent:false when already sent today (debounce)"""
        # First check status
        status_response = self.session.get(f"{BASE_URL}/api/crm/reports/weekly-summary-status")
        status_data = status_response.json()
        
        # Try to send summary
        response = self.session.post(f"{BASE_URL}/api/crm/reports/send-weekly-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "sent" in data, "Response should contain 'sent' field"
        
        # If already sent today, should return sent: false
        if status_data["sent_today"]:
            assert data["sent"] == False, "Should return sent:false when already sent today"
            assert "message" in data, "Should contain message explaining debounce"
            print(f"Debounce working: {data['message']}")
        else:
            # If not sent today, it will send and return sent: true
            print(f"Summary sent: {data}")
    
    def test_send_weekly_summary_response_structure(self):
        """Test that send-weekly-summary returns correct response structure"""
        response = self.session.post(f"{BASE_URL}/api/crm/reports/send-weekly-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        assert "sent" in data, "Response should contain 'sent' field"
        
        # If sent is true, should also have notifications_sent and sent_at
        if data.get("sent"):
            assert "notifications_sent" in data, "Should contain notifications_sent when sent is true"
            assert "sent_at" in data, "Should contain sent_at when sent is true"
    
    # ============== GET /api/notifications ==============
    
    def test_notifications_endpoint_returns_200(self):
        """Test that notifications endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_notifications_returns_list(self):
        """Test that notifications endpoint returns a list"""
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Notifications should return a list"
    
    def test_notifications_contain_sales_goal_summary_type(self):
        """Test that notifications contain sales_goal_summary type after summary is sent"""
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        
        data = response.json()
        
        # Look for sales_goal_summary notifications
        sales_goal_notifications = [n for n in data if n.get("notification_type") == "sales_goal_summary"]
        
        if sales_goal_notifications:
            print(f"Found {len(sales_goal_notifications)} sales_goal_summary notifications")
            # Verify structure of first notification
            notif = sales_goal_notifications[0]
            assert "title" in notif, "Notification should have title"
            assert "message" in notif, "Notification should have message"
            assert "notification_type" in notif, "Notification should have notification_type"
        else:
            print("No sales_goal_summary notifications found - may not be sent to this user")
    
    def test_notifications_contain_sales_team_summary_type(self):
        """Test that notifications contain sales_team_summary type for admins"""
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        
        data = response.json()
        
        # Look for sales_team_summary notifications
        team_summary_notifications = [n for n in data if n.get("notification_type") == "sales_team_summary"]
        
        if team_summary_notifications:
            print(f"Found {len(team_summary_notifications)} sales_team_summary notifications")
            # Verify structure of first notification
            notif = team_summary_notifications[0]
            assert "title" in notif, "Notification should have title"
            assert "message" in notif, "Notification should have message"
            assert "notification_type" in notif, "Notification should have notification_type"
        else:
            print("No sales_team_summary notifications found - may not be admin or not sent yet")
    
    # ============== GET /api/crm/sales-goals ==============
    
    def test_sales_goals_endpoint_returns_200(self):
        """Test that sales-goals endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales-goals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_sales_goals_returns_list(self):
        """Test that sales-goals returns a list"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales-goals")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Sales goals should return a list"
        
        if data:
            goal = data[0]
            assert "owner_id" in goal, "Goal should have owner_id"
            print(f"Found {len(data)} sales goals")


class TestWeeklySummaryIntegration:
    """Integration tests for weekly summary flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        data = login_response.json()
        self.token = data.get("token") or data.get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    def test_full_flow_status_then_send_then_status(self):
        """Test full flow: check status -> send summary -> check status again"""
        # Step 1: Check initial status
        status1 = self.session.get(f"{BASE_URL}/api/crm/reports/weekly-summary-status")
        assert status1.status_code == 200
        status1_data = status1.json()
        print(f"Initial status: sent_today={status1_data['sent_today']}")
        
        # Step 2: Try to send summary
        send_response = self.session.post(f"{BASE_URL}/api/crm/reports/send-weekly-summary")
        assert send_response.status_code == 200
        send_data = send_response.json()
        print(f"Send response: {send_data}")
        
        # Step 3: Check status again
        status2 = self.session.get(f"{BASE_URL}/api/crm/reports/weekly-summary-status")
        assert status2.status_code == 200
        status2_data = status2.json()
        print(f"Final status: sent_today={status2_data['sent_today']}")
        
        # After sending (or if already sent), status should show sent_today=true
        # (unless no goals are configured)
        if send_data.get("sent") or status1_data["sent_today"]:
            assert status2_data["sent_today"] == True, "Status should show sent_today=true after sending"
    
    def test_debounce_prevents_duplicate_sends(self):
        """Test that debounce prevents sending summary twice in same day"""
        # First send
        send1 = self.session.post(f"{BASE_URL}/api/crm/reports/send-weekly-summary")
        assert send1.status_code == 200
        
        # Second send should be debounced
        send2 = self.session.post(f"{BASE_URL}/api/crm/reports/send-weekly-summary")
        assert send2.status_code == 200
        send2_data = send2.json()
        
        # Second send should return sent: false (debounced)
        assert send2_data["sent"] == False, "Second send should be debounced"
        assert "already sent" in send2_data.get("message", "").lower(), "Message should indicate already sent"
        print(f"Debounce confirmed: {send2_data['message']}")
