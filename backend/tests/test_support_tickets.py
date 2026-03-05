# test_support_tickets.py - Tests for Support Tickets / Bug Report Feature
# Tests the POST /api/support/tickets, GET /api/support/tickets/mine,
# GET /api/support/admin/tickets, GET /api/support/admin/tickets/stats,
# PATCH /api/support/admin/tickets/{ticket_id}, DELETE /api/support/admin/tickets/{ticket_id}

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSupportTicketsEndpoints:
    """Test Support Tickets API endpoints"""
    
    # Session for authenticated requests
    session = None
    auth_token = None
    user_data = None
    created_ticket_id = None
    
    @classmethod
    def setup_class(cls):
        """Setup: Authenticate with demo credentials"""
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        
        # Login with demo credentials
        login_response = cls.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            cls.auth_token = data.get("access_token")
            cls.user_data = data.get("user")
            if cls.auth_token:
                cls.session.headers.update({"Authorization": f"Bearer {cls.auth_token}"})
        else:
            print(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup: Delete test tickets"""
        if cls.session and cls.created_ticket_id:
            try:
                cls.session.delete(f"{BASE_URL}/api/support/admin/tickets/{cls.created_ticket_id}")
            except:
                pass
    
    def test_01_health_check(self):
        """Verify API is healthy before testing"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ API health check passed")
    
    def test_02_auth_login(self):
        """Verify login was successful"""
        assert self.auth_token is not None, "Authentication failed - no token received"
        assert self.user_data is not None, "Authentication failed - no user data"
        print(f"✓ Authenticated as: {self.user_data.get('email')}")
    
    def test_03_create_support_ticket(self):
        """Test POST /api/support/tickets - Create a support ticket"""
        ticket_data = {
            "type": "bug",
            "subject": f"TEST_Bug Report - {uuid.uuid4().hex[:8]}",
            "description": "This is a test bug report for automated testing",
            "priority": "normal",
            "page_url": "https://employee-payments-rd.preview.emergentagent.com/test",
            "browser_info": "Playwright Test Browser"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/support/tickets",
            json=ticket_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "success" in data, "Response should contain 'success'"
        assert data["success"] == True, "Success should be True"
        assert "ticket_id" in data, "Response should contain 'ticket_id'"
        assert data["ticket_id"].startswith("TKT-"), f"Ticket ID should start with 'TKT-', got {data['ticket_id']}"
        
        TestSupportTicketsEndpoints.created_ticket_id = data["ticket_id"]
        print(f"✓ Created support ticket: {data['ticket_id']}")
    
    def test_04_create_ticket_feature_request(self):
        """Test creating a feature request ticket"""
        ticket_data = {
            "type": "feature",
            "subject": f"TEST_Feature Request - {uuid.uuid4().hex[:8]}",
            "description": "Feature suggestion for automated testing",
            "priority": "low"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/support/tickets",
            json=ticket_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("ticket_id").startswith("TKT-")
        print(f"✓ Created feature request ticket: {data['ticket_id']}")
        
        # Clean up - delete this ticket later
        self.session.delete(f"{BASE_URL}/api/support/admin/tickets/{data['ticket_id']}")
    
    def test_05_get_my_tickets(self):
        """Test GET /api/support/tickets/mine - Get user's tickets"""
        response = self.session.get(f"{BASE_URL}/api/support/tickets/mine")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Response should be a list"
        
        # If we created a ticket, it should be in the list
        if self.created_ticket_id:
            ticket_ids = [t.get("ticket_id") for t in data]
            assert self.created_ticket_id in ticket_ids, f"Created ticket {self.created_ticket_id} should be in user's tickets"
        
        print(f"✓ Retrieved {len(data)} user tickets")
    
    def test_06_get_my_tickets_with_filter(self):
        """Test GET /api/support/tickets/mine with status filter"""
        response = self.session.get(f"{BASE_URL}/api/support/tickets/mine?status=open")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        # All tickets should have status=open
        for ticket in data:
            assert ticket.get("status") == "open", f"Filtered ticket should have status=open, got {ticket.get('status')}"
        
        print(f"✓ Retrieved {len(data)} open tickets")
    
    def test_07_admin_get_all_tickets(self):
        """Test GET /api/support/admin/tickets - Admin list all tickets"""
        response = self.session.get(f"{BASE_URL}/api/support/admin/tickets")
        
        # Note: This might fail with 403 if user is not super_admin
        if response.status_code == 403:
            print("⚠ User is not super_admin - skipping admin endpoints test")
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "tickets" in data, "Response should contain 'tickets'"
        assert "total" in data, "Response should contain 'total'"
        assert isinstance(data["tickets"], list), "'tickets' should be a list"
        
        print(f"✓ Admin retrieved {data['total']} total tickets")
    
    def test_08_admin_get_tickets_with_filters(self):
        """Test GET /api/support/admin/tickets with filters"""
        # Test with status filter
        response = self.session.get(f"{BASE_URL}/api/support/admin/tickets?status=open&limit=10")
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "tickets" in data
        for ticket in data["tickets"]:
            assert ticket.get("status") == "open", f"Filtered ticket should have status=open"
        
        print(f"✓ Admin filtered tickets: {len(data['tickets'])} open tickets")
    
    def test_09_admin_get_ticket_stats(self):
        """Test GET /api/support/admin/tickets/stats - Admin statistics"""
        response = self.session.get(f"{BASE_URL}/api/support/admin/tickets/stats")
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify stats structure
        expected_fields = ["total", "open", "in_progress", "resolved", "urgent_open", "high_open", "bugs", "feature_requests"]
        for field in expected_fields:
            assert field in data, f"Stats should contain '{field}'"
            assert isinstance(data[field], (int, float)), f"'{field}' should be a number"
        
        print(f"✓ Admin stats: total={data['total']}, open={data['open']}, resolved={data['resolved']}")
    
    def test_10_admin_update_ticket(self):
        """Test PATCH /api/support/admin/tickets/{ticket_id} - Update ticket"""
        if not self.created_ticket_id:
            pytest.skip("No ticket created to update")
        
        update_data = {
            "status": "in_progress",
            "priority": "high",
            "resolution_notes": "Test resolution notes - investigating"
        }
        
        response = self.session.patch(
            f"{BASE_URL}/api/support/admin/tickets/{self.created_ticket_id}",
            json=update_data
        )
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True
        assert data.get("ticket_id") == self.created_ticket_id
        
        print(f"✓ Updated ticket {self.created_ticket_id} to status=in_progress")
    
    def test_11_admin_resolve_ticket(self):
        """Test PATCH to resolve ticket - should set resolved_at"""
        if not self.created_ticket_id:
            pytest.skip("No ticket created to resolve")
        
        update_data = {
            "status": "resolved",
            "resolution_notes": "Test - resolved via automated test"
        }
        
        response = self.session.patch(
            f"{BASE_URL}/api/support/admin/tickets/{self.created_ticket_id}",
            json=update_data
        )
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True
        print(f"✓ Resolved ticket {self.created_ticket_id}")
    
    def test_12_admin_get_single_ticket(self):
        """Test GET /api/support/admin/tickets/{ticket_id} - Get single ticket"""
        if not self.created_ticket_id:
            pytest.skip("No ticket created to get")
        
        response = self.session.get(f"{BASE_URL}/api/support/admin/tickets/{self.created_ticket_id}")
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify ticket data
        assert data.get("ticket_id") == self.created_ticket_id
        assert data.get("status") == "resolved"
        assert data.get("resolution_notes") is not None
        
        print(f"✓ Retrieved single ticket: {self.created_ticket_id}")
    
    def test_13_admin_update_nonexistent_ticket(self):
        """Test PATCH with non-existent ticket returns 404"""
        fake_ticket_id = "TKT-NONEXISTENT"
        
        response = self.session.patch(
            f"{BASE_URL}/api/support/admin/tickets/{fake_ticket_id}",
            json={"status": "resolved"}
        )
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ PATCH non-existent ticket returns 404")
    
    def test_14_admin_delete_ticket(self):
        """Test DELETE /api/support/admin/tickets/{ticket_id} - Delete ticket"""
        if not self.created_ticket_id:
            pytest.skip("No ticket created to delete")
        
        response = self.session.delete(f"{BASE_URL}/api/support/admin/tickets/{self.created_ticket_id}")
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True
        print(f"✓ Deleted ticket {self.created_ticket_id}")
        
        # Verify ticket is gone
        verify_response = self.session.get(f"{BASE_URL}/api/support/admin/tickets/{self.created_ticket_id}")
        assert verify_response.status_code == 404, "Deleted ticket should return 404"
        
        # Clear the ID since it's deleted
        TestSupportTicketsEndpoints.created_ticket_id = None
        print("✓ Verified ticket was deleted")
    
    def test_15_admin_delete_nonexistent_ticket(self):
        """Test DELETE with non-existent ticket returns 404"""
        fake_ticket_id = "TKT-NONEXISTENT"
        
        response = self.session.delete(f"{BASE_URL}/api/support/admin/tickets/{fake_ticket_id}")
        
        if response.status_code == 403:
            pytest.skip("User is not super_admin")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ DELETE non-existent ticket returns 404")
    
    def test_16_create_ticket_without_auth(self):
        """Test POST /api/support/tickets without auth returns 401"""
        # Create new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.post(
            f"{BASE_URL}/api/support/tickets",
            json={"type": "bug", "subject": "Test", "description": "Test"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated POST returns 401")
    
    def test_17_get_my_tickets_without_auth(self):
        """Test GET /api/support/tickets/mine without auth returns 401"""
        no_auth_session = requests.Session()
        
        response = no_auth_session.get(f"{BASE_URL}/api/support/tickets/mine")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated GET my tickets returns 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
