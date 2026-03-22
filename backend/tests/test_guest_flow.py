"""
Guest Flow Virtual Queue Management System - Backend API Tests
Tests all endpoints for the guest flow feature including:
- Public endpoints (guest join, status, now-serving)
- Authenticated endpoints (activations, queue management, entry actions)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"

# Test activation ID (pre-existing)
TEST_ACTIVATION_ID = "act_ef6a9fabd2a6"
TEST_ENTRY_IDS = {
    "now_serving": "qe_a281df8a35db",
    "waiting_1": "qe_8881a4af7cb4",
    "waiting_2": "qe_2ced21f4c49a"
}


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for staff endpoints"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in response"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


# ============================================================
# PUBLIC ENDPOINTS (No Auth Required)
# ============================================================

class TestPublicActivationEndpoint:
    """Tests for GET /api/guest-flow/public/activation/{id}"""
    
    def test_get_activation_info_success(self):
        """Public endpoint returns activation info for guest join page"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/activation/{TEST_ACTIVATION_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["activation_id"] == TEST_ACTIVATION_ID
        assert "activation_name" in data
        assert "queue_status" in data
        assert "total_in_queue" in data
        assert "average_service_time" in data
        print(f"✓ Public activation info: {data['activation_name']}, status={data['queue_status']}, queue={data['total_in_queue']}")
    
    def test_get_activation_not_found(self):
        """Returns 404 for non-existent activation"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/activation/invalid_id_12345")
        assert response.status_code == 404


class TestPublicJoinEndpoint:
    """Tests for POST /api/guest-flow/public/join/{id}"""
    
    def test_join_queue_success(self):
        """Guest can join queue with valid data"""
        unique_phone = f"809-{uuid.uuid4().hex[:3]}-{uuid.uuid4().hex[:4]}"
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/public/join/{TEST_ACTIVATION_ID}",
            json={
                "guest_name": f"Test Guest {uuid.uuid4().hex[:6]}",
                "whatsapp_number": unique_phone,
                "group_size": 2
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "entry_id" in data
        assert "queue_number" in data
        assert "position" in data
        assert "estimated_wait" in data
        print(f"✓ Guest joined queue: #{data['queue_number']}, position={data['position']}, wait={data['estimated_wait']}min")
    
    def test_join_queue_duplicate_detection(self):
        """Duplicate WhatsApp number returns existing entry"""
        # Use existing test entry's phone number
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/public/join/{TEST_ACTIVATION_ID}",
            json={
                "guest_name": "Duplicate Test",
                "whatsapp_number": "809-555-1234",  # Same as Juan Perez
                "group_size": 1
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("duplicate") == True
        assert "entry_id" in data
        print(f"✓ Duplicate detected: entry_id={data['entry_id']}")
    
    def test_join_queue_missing_fields(self):
        """Returns 400 for missing required fields"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/public/join/{TEST_ACTIVATION_ID}",
            json={"guest_name": "Test"}  # Missing whatsapp_number
        )
        assert response.status_code == 400


class TestPublicStatusEndpoint:
    """Tests for GET /api/guest-flow/public/status/{entry_id}"""
    
    def test_get_status_now_serving(self):
        """Returns correct status for now_serving entry"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/status/{TEST_ENTRY_IDS['now_serving']}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["entry_id"] == TEST_ENTRY_IDS['now_serving']
        assert data["status"] == "now_serving"
        assert "queue_number" in data
        assert "people_ahead" in data
        assert "estimated_wait_minutes" in data
        print(f"✓ Status for now_serving: #{data['queue_number']}, people_ahead={data['people_ahead']}")
    
    def test_get_status_waiting(self):
        """Returns correct status for waiting entry"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/status/{TEST_ENTRY_IDS['waiting_1']}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "waiting"
        assert data["people_ahead"] >= 0
        print(f"✓ Status for waiting: #{data['queue_number']}, people_ahead={data['people_ahead']}, wait={data['estimated_wait_minutes']}min")
    
    def test_get_status_not_found(self):
        """Returns 404 for non-existent entry"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/status/invalid_entry_12345")
        assert response.status_code == 404


class TestPublicNowServingEndpoint:
    """Tests for GET /api/guest-flow/public/now-serving/{activation_id}"""
    
    def test_get_now_serving_display(self):
        """Returns now serving display data"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/now-serving/{TEST_ACTIVATION_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "activation_name" in data
        assert "queue_status" in data
        assert "now_serving_number" in data
        assert "upcoming" in data
        assert "total_waiting" in data
        print(f"✓ Now serving display: #{data['now_serving_number']}, upcoming={len(data['upcoming'])}, waiting={data['total_waiting']}")
    
    def test_now_serving_not_found(self):
        """Returns 404 for non-existent activation"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/public/now-serving/invalid_id_12345")
        assert response.status_code == 404


# ============================================================
# AUTHENTICATED ENDPOINTS (Staff - Auth Required)
# ============================================================

class TestActivationsEndpoints:
    """Tests for activation management endpoints"""
    
    def test_get_activations_list(self, auth_headers):
        """GET /api/guest-flow/activations returns list"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/activations", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        print(f"✓ Got {len(data)} activations")
    
    def test_get_single_activation(self, auth_headers):
        """GET /api/guest-flow/activations/{id} returns activation details"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["activation_id"] == TEST_ACTIVATION_ID
        assert "queue_status" in data
        assert "current_queue_number" in data
        print(f"✓ Got activation: {data['activation_name']}")
    
    def test_get_activation_stats(self, auth_headers):
        """GET /api/guest-flow/activations/{id}/stats returns queue statistics"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/stats", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "total_guests" in data
        assert "waiting" in data
        assert "now_serving" in data
        assert "completed" in data
        assert "canceled" in data
        assert "status_breakdown" in data
        print(f"✓ Stats: total={data['total_guests']}, waiting={data['waiting']}, serving={data['now_serving']}")
    
    def test_create_activation(self, auth_headers):
        """POST /api/guest-flow/activations creates new activation"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/activations",
            headers=auth_headers,
            json={
                "event_id": "test_event_pytest",
                "activation_name": f"Test Activation {uuid.uuid4().hex[:6]}",
                "activation_type": "headshot",
                "average_service_time": 5
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "activation_id" in data
        assert data["queue_status"] == "inactive"
        print(f"✓ Created activation: {data['activation_id']}")
        return data["activation_id"]
    
    def test_activations_require_auth(self):
        """Activations endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/activations")
        assert response.status_code == 401


class TestQueueEndpoints:
    """Tests for queue management endpoints"""
    
    def test_get_queue_entries(self, auth_headers):
        """GET /api/guest-flow/activations/{id}/queue returns queue entries"""
        response = requests.get(f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/queue", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Verify entry structure
        entry = data[0]
        assert "entry_id" in entry
        assert "guest_name" in entry
        assert "queue_number" in entry
        assert "status" in entry
        print(f"✓ Got {len(data)} queue entries")
    
    def test_get_queue_filtered_by_status(self, auth_headers):
        """GET /api/guest-flow/activations/{id}/queue?status=waiting filters by status"""
        response = requests.get(
            f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/queue?status=waiting",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        for entry in data:
            assert entry["status"] == "waiting"
        print(f"✓ Filtered queue: {len(data)} waiting entries")


class TestQueueActionEndpoints:
    """Tests for queue action endpoints (activate, pause, resume, close, reset)"""
    
    def test_queue_action_pause_resume(self, auth_headers):
        """POST /api/guest-flow/activations/{id}/queue-action can pause and resume"""
        # Pause
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/queue-action",
            headers=auth_headers,
            json={"action": "pause"}
        )
        assert response.status_code == 200
        assert response.json()["queue_status"] == "paused"
        print("✓ Queue paused")
        
        # Resume
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/queue-action",
            headers=auth_headers,
            json={"action": "resume"}
        )
        assert response.status_code == 200
        assert response.json()["queue_status"] == "active"
        print("✓ Queue resumed")
    
    def test_queue_action_invalid(self, auth_headers):
        """Invalid queue action returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/queue-action",
            headers=auth_headers,
            json={"action": "invalid_action"}
        )
        assert response.status_code == 400


class TestEntryActionEndpoints:
    """Tests for entry action endpoints (move_up, move_down, cancel, readd, complete, update_notes)"""
    
    def test_entry_action_update_notes(self, auth_headers):
        """POST /api/guest-flow/queue/{id}/action can update notes"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/queue/{TEST_ENTRY_IDS['waiting_1']}/action",
            headers=auth_headers,
            json={"action": "update_notes", "notes": "Test note from pytest"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["notes"] == "Test note from pytest"
        print("✓ Notes updated")
    
    def test_entry_action_move_down(self, auth_headers):
        """POST /api/guest-flow/queue/{id}/action can move entry down"""
        # Get current positions
        queue_response = requests.get(
            f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/queue?status=waiting",
            headers=auth_headers
        )
        queue = queue_response.json()
        
        if len(queue) >= 2:
            first_entry = queue[0]
            response = requests.post(
                f"{BASE_URL}/api/guest-flow/queue/{first_entry['entry_id']}/action",
                headers=auth_headers,
                json={"action": "move_down"}
            )
            assert response.status_code == 200
            print(f"✓ Entry moved down: {first_entry['entry_id']}")
            
            # Move back up
            response = requests.post(
                f"{BASE_URL}/api/guest-flow/queue/{first_entry['entry_id']}/action",
                headers=auth_headers,
                json={"action": "move_up"}
            )
            assert response.status_code == 200
            print(f"✓ Entry moved back up: {first_entry['entry_id']}")
    
    def test_entry_action_invalid(self, auth_headers):
        """Invalid entry action returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/queue/{TEST_ENTRY_IDS['waiting_1']}/action",
            headers=auth_headers,
            json={"action": "invalid_action"}
        )
        assert response.status_code == 400
    
    def test_entry_not_found(self, auth_headers):
        """Non-existent entry returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/queue/invalid_entry_12345/action",
            headers=auth_headers,
            json={"action": "update_notes", "notes": "test"}
        )
        assert response.status_code == 404


class TestWhatsAppLinkEndpoint:
    """Tests for WhatsApp link generation"""
    
    def test_generate_whatsapp_link(self, auth_headers):
        """POST /api/guest-flow/queue/{id}/whatsapp-link generates link"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/queue/{TEST_ENTRY_IDS['waiting_1']}/whatsapp-link",
            headers=auth_headers,
            json={"message_type": "next"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "link" in data
        assert "message" in data
        assert "wa.me" in data["link"]
        print(f"✓ WhatsApp link generated: {data['link'][:50]}...")
    
    def test_whatsapp_link_different_types(self, auth_headers):
        """WhatsApp link supports different message types"""
        for msg_type in ["next", "almost", "passed"]:
            response = requests.post(
                f"{BASE_URL}/api/guest-flow/queue/{TEST_ENTRY_IDS['waiting_1']}/whatsapp-link",
                headers=auth_headers,
                json={"message_type": msg_type}
            )
            assert response.status_code == 200
            print(f"✓ WhatsApp link type '{msg_type}' works")


class TestCallNextEndpoint:
    """Tests for call next guest endpoint"""
    
    def test_call_next_returns_next_guest(self, auth_headers):
        """POST /api/guest-flow/activations/{id}/call-next returns next guest"""
        response = requests.post(
            f"{BASE_URL}/api/guest-flow/activations/{TEST_ACTIVATION_ID}/call-next",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "success" in data
        # Either returns next guest or queue empty message
        if data.get("now_serving"):
            print(f"✓ Called next: #{data['now_serving']['queue_number']}")
        else:
            print(f"✓ Call next response: {data.get('message', 'No message')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
