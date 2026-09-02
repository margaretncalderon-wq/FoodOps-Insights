# test_notifications.py - In-App Notification System Tests
"""
Tests for the notification system introduced for external agency content creation alerts.
Endpoints tested:
- GET /api/notifications - List user's notifications
- GET /api/notifications/unread-count - Get unread count
- POST /api/notifications/{id}/read - Mark notification as read
- POST /api/notifications/mark-all-read - Mark all as read
- POST /api/notifications/internal/create - Create notification (internal API)
- DELETE /api/notifications/{id} - Delete a notification
- DELETE /api/notifications - Clear all notifications
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNotificationsAPI:
    """Test notification system endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        self.user_data = login_resp.json().get("user", {})
        self.user_id = self.user_data.get("user_id")
        
        yield
        
        # Cleanup: Delete test notifications created during tests
        try:
            self.session.delete(f"{BASE_URL}/api/notifications?read_only=False")
        except Exception:
            pass
    
    # ============== GET /api/notifications ==============
    def test_get_notifications_returns_list(self):
        """GET /api/notifications - Should return list of notifications"""
        response = self.session.get(f"{BASE_URL}/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_get_notifications_structure(self):
        """GET /api/notifications - Verify notification object structure"""
        # First create a notification to ensure we have data
        create_resp = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "TEST_notification",
                "title": "TEST_Structure Check",
                "message": "Testing notification structure",
                "priority": "normal"
            }
        )
        assert create_resp.status_code == 200
        
        # Now get notifications
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) > 0, "Should have at least one notification"
        
        # Check structure of notification
        notif = data[0]
        assert "notification_id" in notif
        assert "user_id" in notif
        assert "type" in notif
        assert "title" in notif
        assert "message" in notif
        assert "read" in notif
        assert "created_at" in notif
        assert "priority" in notif
        
        # MongoDB _id should be excluded
        assert "_id" not in notif
    
    def test_get_notifications_with_limit(self):
        """GET /api/notifications?limit=5 - Should respect limit parameter"""
        response = self.session.get(f"{BASE_URL}/api/notifications?limit=5")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 5
    
    def test_get_notifications_unread_only(self):
        """GET /api/notifications?unread_only=true - Should filter unread only"""
        response = self.session.get(f"{BASE_URL}/api/notifications?unread_only=true")
        
        assert response.status_code == 200
        data = response.json()
        
        # All returned notifications should be unread
        for notif in data:
            assert notif.get("read") == False, f"Expected unread notifications only"
    
    # ============== GET /api/notifications/unread-count ==============
    def test_get_unread_count(self):
        """GET /api/notifications/unread-count - Should return count object"""
        response = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        
        assert response.status_code == 200
        data = response.json()
        assert "unread_count" in data
        assert isinstance(data["unread_count"], int)
        assert data["unread_count"] >= 0
    
    def test_unread_count_increases_on_new_notification(self):
        """Unread count should increase when new notification is created"""
        # Get initial count
        initial_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        initial_count = initial_resp.json().get("unread_count", 0)
        
        # Create a notification
        create_resp = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "TEST_count_check",
                "title": "TEST_Count Increase",
                "message": "Testing count increment",
                "priority": "normal"
            }
        )
        assert create_resp.status_code == 200
        
        # Get new count
        new_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        new_count = new_resp.json().get("unread_count", 0)
        
        assert new_count == initial_count + 1, f"Count should increase by 1. Was {initial_count}, now {new_count}"
    
    # ============== POST /api/notifications/internal/create ==============
    def test_create_notification_internal(self):
        """POST /api/notifications/internal/create - Should create notification"""
        unique_title = f"TEST_Create_{uuid.uuid4().hex[:8]}"
        
        response = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "content_created",
                "title": unique_title,
                "message": "External agency created new content",
                "link": "/demand-studio/social",
                "priority": "high"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "notification_id" in data
        assert data["notification_id"].startswith("notif_")
        
        # Verify notification was persisted
        get_resp = self.session.get(f"{BASE_URL}/api/notifications")
        notifications = get_resp.json()
        found = any(n.get("title") == unique_title for n in notifications)
        assert found, f"Created notification with title '{unique_title}' not found in list"
    
    def test_create_notification_with_metadata(self):
        """POST /api/notifications/internal/create - Should support metadata"""
        response = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "approval_needed",
                "title": "TEST_Metadata Notification",
                "message": "Content needs approval",
                "metadata": {"post_id": "post_abc123", "contributor": "Agency XYZ"},
                "priority": "high"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "notification_id" in data
    
    # ============== POST /api/notifications/{id}/read ==============
    def test_mark_notification_as_read(self):
        """POST /api/notifications/{id}/read - Should mark notification as read"""
        # Create a new notification first
        create_resp = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "TEST_mark_read",
                "title": "TEST_Mark Read",
                "message": "Testing mark as read",
                "priority": "normal"
            }
        )
        notif_id = create_resp.json().get("notification_id")
        
        # Mark as read
        read_resp = self.session.post(f"{BASE_URL}/api/notifications/{notif_id}/read")
        
        assert read_resp.status_code == 200
        assert read_resp.json().get("status") == "read"
        
        # Verify it's marked as read in the list
        list_resp = self.session.get(f"{BASE_URL}/api/notifications")
        notifications = list_resp.json()
        notif = next((n for n in notifications if n.get("notification_id") == notif_id), None)
        assert notif is not None
        assert notif.get("read") == True
    
    def test_mark_nonexistent_notification_returns_404(self):
        """POST /api/notifications/{id}/read - Should return 404 for invalid id"""
        response = self.session.post(f"{BASE_URL}/api/notifications/notif_invalid123/read")
        
        assert response.status_code == 404
    
    # ============== POST /api/notifications/mark-all-read ==============
    def test_mark_all_as_read(self):
        """POST /api/notifications/mark-all-read - Should mark all as read"""
        # Create a couple of notifications first
        for i in range(2):
            self.session.post(
                f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
                json={
                    "type": "TEST_mark_all",
                    "title": f"TEST_Mark All {i}",
                    "message": "Testing mark all",
                    "priority": "normal"
                }
            )
        
        # Mark all as read
        response = self.session.post(f"{BASE_URL}/api/notifications/mark-all-read")
        
        assert response.status_code == 200
        data = response.json()
        assert "marked_read" in data
        assert isinstance(data["marked_read"], int)
        
        # Verify unread count is now 0
        count_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert count_resp.json().get("unread_count") == 0
    
    # ============== DELETE /api/notifications/{id} ==============
    def test_delete_notification(self):
        """DELETE /api/notifications/{id} - Should delete notification"""
        # Create a notification
        create_resp = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "TEST_delete",
                "title": "TEST_Delete Me",
                "message": "Testing delete",
                "priority": "normal"
            }
        )
        notif_id = create_resp.json().get("notification_id")
        
        # Delete it
        delete_resp = self.session.delete(f"{BASE_URL}/api/notifications/{notif_id}")
        
        assert delete_resp.status_code == 200
        assert delete_resp.json().get("status") == "deleted"
        
        # Verify it's gone
        list_resp = self.session.get(f"{BASE_URL}/api/notifications")
        notifications = list_resp.json()
        found = any(n.get("notification_id") == notif_id for n in notifications)
        assert not found, "Deleted notification should not appear in list"
    
    def test_delete_nonexistent_notification_returns_404(self):
        """DELETE /api/notifications/{id} - Should return 404 for invalid id"""
        response = self.session.delete(f"{BASE_URL}/api/notifications/notif_invalid456")
        
        assert response.status_code == 404
    
    # ============== DELETE /api/notifications (clear all) ==============
    def test_clear_all_notifications(self):
        """DELETE /api/notifications - Should clear read notifications"""
        # Create and mark as read some notifications
        for i in range(2):
            create_resp = self.session.post(
                f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
                json={
                    "type": "TEST_clear",
                    "title": f"TEST_Clear {i}",
                    "message": "Testing clear",
                    "priority": "normal"
                }
            )
        
        # Mark all as read first
        self.session.post(f"{BASE_URL}/api/notifications/mark-all-read")
        
        # Clear read notifications
        clear_resp = self.session.delete(f"{BASE_URL}/api/notifications?read_only=true")
        
        assert clear_resp.status_code == 200
        data = clear_resp.json()
        assert "deleted" in data
        assert isinstance(data["deleted"], int)


class TestNotificationTypes:
    """Test different notification types used in the system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200
        
        self.user_id = login_resp.json().get("user", {}).get("user_id")
        
        yield
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/notifications?read_only=False")
        except Exception:
            pass
    
    def test_content_created_notification(self):
        """Test notification type used when external agency creates content"""
        response = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "content_created",
                "title": "Nueva idea de agencia externa",
                "message": "Agency XYZ creó una nueva idea: Campaign Q1",
                "link": "/demand-studio/social?tab=ideas",
                "metadata": {"idea_id": "idea_test123", "contributor": "Agency XYZ"},
                "priority": "normal"
            }
        )
        
        assert response.status_code == 200
        assert "notification_id" in response.json()
    
    def test_approval_needed_notification(self):
        """Test notification type used when external draft needs approval"""
        response = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "approval_needed",
                "title": "Nuevo borrador pendiente de aprobación",
                "message": "Agency XYZ creó un borrador de post que requiere tu aprobación",
                "link": "/demand-studio/social?tab=queue",
                "metadata": {"post_id": "post_test456", "contributor": "Agency XYZ"},
                "priority": "high"
            }
        )
        
        assert response.status_code == 200
        assert "notification_id" in response.json()


class TestNotificationIntegrationWithSocialSharing:
    """Test that notifications are created when external users create content"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200
        
        self.user_id = login_resp.json().get("user", {}).get("user_id")
        
        yield
    
    def test_notification_endpoint_is_registered(self):
        """Verify /api/notifications endpoints are accessible"""
        # Test main endpoint
        response = self.session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200
        
        # Test unread-count endpoint
        response = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 200
    
    def test_notification_bell_api_flow(self):
        """Test the full flow used by NotificationBell component"""
        # 1. Get unread count (initial)
        count_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert count_resp.status_code == 200
        initial_count = count_resp.json().get("unread_count", 0)
        
        # 2. Create a notification (simulating external content creation)
        create_resp = self.session.post(
            f"{BASE_URL}/api/notifications/internal/create?user_id={self.user_id}",
            json={
                "type": "content_created",
                "title": "TEST_Bell Flow",
                "message": "Testing notification bell flow",
                "priority": "normal"
            }
        )
        assert create_resp.status_code == 200
        notif_id = create_resp.json().get("notification_id")
        
        # 3. Verify count increased
        count_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert count_resp.json().get("unread_count") == initial_count + 1
        
        # 4. Get notifications list (when user clicks bell)
        list_resp = self.session.get(f"{BASE_URL}/api/notifications?limit=20")
        assert list_resp.status_code == 200
        
        # 5. Mark as read (when user clicks notification)
        read_resp = self.session.post(f"{BASE_URL}/api/notifications/{notif_id}/read")
        assert read_resp.status_code == 200
        
        # 6. Verify count decreased
        count_resp = self.session.get(f"{BASE_URL}/api/notifications/unread-count")
        assert count_resp.json().get("unread_count") == initial_count


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
