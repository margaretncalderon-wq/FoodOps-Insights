"""
Test Ideas API with new fields: segment_id, audience_id, social_account_id
Tests full CRUD on ideas with all fields matching posts organization
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"
ORG_ID = "company_3ab116c0994d"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def test_pillar(auth_headers):
    """Create a test pillar for idea assignment"""
    response = requests.post(
        f"{BASE_URL}/api/demand-studio/social/pillars?org_id={ORG_ID}",
        json={"name": "TEST_PILLAR_IDEAS", "description": "Test pillar for idea fields"},
        headers=auth_headers
    )
    if response.status_code in [200, 201]:
        pillar = response.json()
        yield pillar
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/pillars/{pillar['pillar_id']}?org_id={ORG_ID}",
            headers=auth_headers
        )


@pytest.fixture(scope="module")
def test_segment(auth_headers):
    """Create a test segment for idea assignment"""
    response = requests.post(
        f"{BASE_URL}/api/demand-studio/social/segments?org_id={ORG_ID}",
        json={"name": "TEST_SEGMENT_IDEAS", "description": "Test segment for idea fields"},
        headers=auth_headers
    )
    if response.status_code in [200, 201]:
        segment = response.json()
        yield segment
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/segments/{segment['segment_id']}?org_id={ORG_ID}",
            headers=auth_headers
        )


@pytest.fixture(scope="module")
def test_audience(auth_headers):
    """Create a test audience for idea assignment"""
    response = requests.post(
        f"{BASE_URL}/api/demand-studio/social/audiences?org_id={ORG_ID}",
        json={"name": "TEST_AUDIENCE_IDEAS", "description": "Test audience for idea fields"},
        headers=auth_headers
    )
    if response.status_code in [200, 201]:
        audience = response.json()
        yield audience
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/audiences/{audience['audience_id']}?org_id={ORG_ID}",
            headers=auth_headers
        )


@pytest.fixture(scope="module")
def test_account(auth_headers):
    """Get or create a test social account"""
    # First try to get existing accounts
    response = requests.get(
        f"{BASE_URL}/api/demand-studio/social/accounts?org_id={ORG_ID}",
        headers=auth_headers
    )
    if response.status_code == 200:
        accounts = response.json()
        if accounts:
            yield accounts[0]
            return
    
    # Create a new account if none exist
    response = requests.post(
        f"{BASE_URL}/api/demand-studio/social/accounts?org_id={ORG_ID}",
        json={"platform": "instagram", "handle": "test_idea_account", "status": "active"},
        headers=auth_headers
    )
    if response.status_code in [200, 201]:
        account = response.json()
        yield account
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account['account_id']}?org_id={ORG_ID}",
            headers=auth_headers
        )


class TestIdeaNewFields:
    """Test ideas with segment_id, audience_id, social_account_id"""
    
    def test_create_idea_with_all_fields(self, auth_headers, test_pillar, test_segment, test_audience, test_account):
        """POST /api/demand-studio/social/ideas accepts new fields"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_IDEA_FULL_{unique_id}",
            "description": "Test idea with all new fields",
            "pillar_id": test_pillar["pillar_id"],
            "segment_id": test_segment["segment_id"],
            "audience_id": test_audience["audience_id"],
            "social_account_id": test_account["account_id"],
            "tags": ["test", "full-fields"],
            "status": "new"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Create idea failed: {response.status_code} - {response.text}"
        
        idea = response.json()
        assert idea["title"] == payload["title"]
        assert idea["pillar_id"] == test_pillar["pillar_id"]
        assert idea["segment_id"] == test_segment["segment_id"]
        assert idea["audience_id"] == test_audience["audience_id"]
        assert idea["social_account_id"] == test_account["account_id"]
        assert "idea_id" in idea
        
        print(f"Created idea with all fields: {idea['idea_id']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea['idea_id']}?org_id={ORG_ID}",
            headers=auth_headers
        )
    
    def test_update_idea_new_fields(self, auth_headers, test_pillar, test_segment, test_audience, test_account):
        """PUT /api/demand-studio/social/ideas/{id} updates new fields correctly"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create a minimal idea first
        create_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            json={"title": f"TEST_UPDATE_IDEA_{unique_id}", "status": "new"},
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201]
        idea = create_response.json()
        idea_id = idea["idea_id"]
        
        # Update with all new fields
        update_payload = {
            "title": f"TEST_UPDATE_IDEA_{unique_id}_UPDATED",
            "description": "Updated with new fields",
            "pillar_id": test_pillar["pillar_id"],
            "segment_id": test_segment["segment_id"],
            "audience_id": test_audience["audience_id"],
            "social_account_id": test_account["account_id"],
            "tags": ["updated"],
            "status": "reviewing"
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            json=update_payload,
            headers=auth_headers
        )
        
        assert update_response.status_code == 200, f"Update idea failed: {update_response.status_code} - {update_response.text}"
        
        updated_idea = update_response.json()
        assert updated_idea["segment_id"] == test_segment["segment_id"], "segment_id not updated"
        assert updated_idea["audience_id"] == test_audience["audience_id"], "audience_id not updated"
        assert updated_idea["social_account_id"] == test_account["account_id"], "social_account_id not updated"
        assert updated_idea["status"] == "reviewing", "status not updated"
        
        print(f"Updated idea with new fields: {idea_id}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            headers=auth_headers
        )
    
    def test_get_ideas_returns_new_fields(self, auth_headers, test_pillar, test_segment, test_audience, test_account):
        """GET /api/demand-studio/social/ideas returns ideas with new fields"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create idea with all fields
        payload = {
            "title": f"TEST_GET_IDEA_{unique_id}",
            "pillar_id": test_pillar["pillar_id"],
            "segment_id": test_segment["segment_id"],
            "audience_id": test_audience["audience_id"],
            "social_account_id": test_account["account_id"],
            "status": "new"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            json=payload,
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201]
        created_idea = create_response.json()
        idea_id = created_idea["idea_id"]
        
        # GET all ideas and find our idea
        get_response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        ideas = get_response.json()
        
        # Find our test idea
        our_idea = next((i for i in ideas if i["idea_id"] == idea_id), None)
        assert our_idea is not None, "Created idea not found in GET response"
        
        # Verify new fields are returned
        assert our_idea.get("segment_id") == test_segment["segment_id"], "segment_id not in GET response"
        assert our_idea.get("audience_id") == test_audience["audience_id"], "audience_id not in GET response"
        assert our_idea.get("social_account_id") == test_account["account_id"], "social_account_id not in GET response"
        
        print(f"GET ideas returns new fields correctly for: {idea_id}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            headers=auth_headers
        )
    
    def test_full_crud_with_all_fields(self, auth_headers, test_pillar, test_segment, test_audience, test_account):
        """Full CRUD on idea with all fields: create -> update new fields -> verify -> delete"""
        unique_id = uuid.uuid4().hex[:8]
        
        # 1. CREATE
        create_payload = {
            "title": f"TEST_CRUD_IDEA_{unique_id}",
            "description": "Initial description",
            "pillar_id": test_pillar["pillar_id"],
            "segment_id": test_segment["segment_id"],
            "audience_id": test_audience["audience_id"],
            "social_account_id": test_account["account_id"],
            "tags": ["crud-test"],
            "status": "new"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201], f"CREATE failed: {create_response.text}"
        created = create_response.json()
        idea_id = created["idea_id"]
        print(f"1. CREATE: idea_id={idea_id}")
        
        # Verify CREATE stored all fields
        assert created["segment_id"] == test_segment["segment_id"]
        assert created["audience_id"] == test_audience["audience_id"]
        assert created["social_account_id"] == test_account["account_id"]
        
        # 2. UPDATE - change status and verify fields persist
        update_payload = {
            **create_payload,
            "title": f"TEST_CRUD_IDEA_{unique_id}_UPDATED",
            "status": "approved",
            "description": "Updated description"
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            json=update_payload,
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"UPDATE failed: {update_response.text}"
        updated = update_response.json()
        print(f"2. UPDATE: status changed to {updated['status']}")
        
        assert updated["status"] == "approved"
        assert updated["segment_id"] == test_segment["segment_id"]
        assert updated["audience_id"] == test_audience["audience_id"]
        
        # 3. VERIFY via GET
        get_response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        ideas = get_response.json()
        verified_idea = next((i for i in ideas if i["idea_id"] == idea_id), None)
        assert verified_idea is not None, "Idea not found in GET"
        assert verified_idea["status"] == "approved"
        assert verified_idea["segment_id"] == test_segment["segment_id"]
        print(f"3. VERIFY: All fields persisted correctly")
        
        # 4. DELETE
        delete_response = requests.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"DELETE failed: {delete_response.text}"
        print(f"4. DELETE: idea removed")
        
        # Verify DELETE
        get_after_delete = requests.get(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            headers=auth_headers
        )
        ideas_after = get_after_delete.json()
        assert not any(i["idea_id"] == idea_id for i in ideas_after), "Idea still exists after DELETE"
        
        print("Full CRUD test PASSED")


class TestIdeaRegressionWithOrgId:
    """Regression: Idea create/update/delete still works with org_id"""
    
    def test_idea_crud_with_org_id(self, auth_headers):
        """Idea CRUD operations work correctly with org_id parameter"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create
        response = requests.post(
            f"{BASE_URL}/api/demand-studio/social/ideas?org_id={ORG_ID}",
            json={"title": f"TEST_ORG_ID_IDEA_{unique_id}", "status": "new"},
            headers=auth_headers
        )
        assert response.status_code in [200, 201], f"Create with org_id failed: {response.text}"
        idea = response.json()
        idea_id = idea["idea_id"]
        assert idea["company_id"] == ORG_ID, "company_id mismatch"
        
        # Update
        update_response = requests.put(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            json={"title": f"TEST_ORG_ID_IDEA_{unique_id}_UPDATED", "status": "reviewing"},
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Update with org_id failed: {update_response.text}"
        
        # Delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete with org_id failed: {delete_response.text}"
        
        print("Idea CRUD with org_id - PASSED")


class TestCalendarPillarStatsRegression:
    """Regression: Calendar pillar stats still works"""
    
    def test_pillar_stats_endpoint(self, auth_headers):
        """GET /api/demand-studio/social/calendar/pillar-stats works"""
        response = requests.get(
            f"{BASE_URL}/api/demand-studio/social/calendar/pillar-stats?year=2026&month=1&org_id={ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Pillar stats failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "total_posts" in data
        assert "pillars" in data
        assert "period" in data
        
        print(f"Pillar stats - total_posts: {data['total_posts']}, pillars: {len(data['pillars'])}")


# Cleanup test idea from main agent notes (idea_e66685be14fe)
class TestCleanupOldTestData:
    """Clean up test idea mentioned in main agent context"""
    
    def test_cleanup_test_idea(self, auth_headers):
        """Clean up idea_e66685be14fe if it exists"""
        idea_id = "idea_e66685be14fe"
        response = requests.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{idea_id}?org_id={ORG_ID}",
            headers=auth_headers
        )
        if response.status_code == 200:
            print(f"Cleaned up test idea: {idea_id}")
        elif response.status_code == 404:
            print(f"Test idea {idea_id} not found (already cleaned)")
        else:
            print(f"Cleanup attempt returned: {response.status_code}")
