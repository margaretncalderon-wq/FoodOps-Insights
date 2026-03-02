"""
Social Sharing API Tests - Test suite for sharing Social Media module with external agencies
Tests internal collaborators (invite Kora users) and external links (public access for non-Kora agencies)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Auth failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestCollaboratorsAPI:
    """Tests for internal collaborator endpoints"""
    
    def test_list_collaborators_success(self, authenticated_client):
        """GET /api/social-sharing/collaborators returns list of collaborators"""
        response = authenticated_client.get(f"{BASE_URL}/api/social-sharing/collaborators")
        assert response.status_code == 200
        
        data = response.json()
        assert "collaborators" in data
        assert "pending_invitations" in data
        assert isinstance(data["collaborators"], list)
        assert isinstance(data["pending_invitations"], list)
    
    def test_list_collaborators_unauthorized(self, api_client):
        """GET /api/social-sharing/collaborators requires auth"""
        # Remove auth header temporarily
        auth = api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/social-sharing/collaborators")
        assert response.status_code == 401
        # Restore header
        if auth:
            api_client.headers["Authorization"] = auth
    
    def test_invite_collaborator_creates_invitation(self, authenticated_client):
        """POST /api/social-sharing/collaborators/invite invites a user"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@agency.com"
        response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/collaborators/invite",
            json={"email": unique_email, "role": "social_contributor"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "status" in data
        assert data["status"] in ["invited", "added", "exists", "updated"]
        assert "message" in data
        # For non-existing user, should create invitation
        if data["status"] == "invited":
            assert "invitation_id" in data
            assert data["invitation_id"].startswith("inv_")
    
    def test_invite_collaborator_invalid_email(self, authenticated_client):
        """POST /api/social-sharing/collaborators/invite validates email format"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/collaborators/invite",
            json={"email": "invalid-email", "role": "social_contributor"}
        )
        # Pydantic EmailStr validation should fail
        assert response.status_code == 422
    
    def test_invite_collaborator_viewer_role(self, authenticated_client):
        """Invite collaborator with viewer role"""
        unique_email = f"test_viewer_{uuid.uuid4().hex[:8]}@agency.com"
        response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/collaborators/invite",
            json={"email": unique_email, "role": "social_viewer"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] in ["invited", "added"]


class TestShareLinksAPI:
    """Tests for external share link endpoints"""
    
    def test_list_share_links_success(self, authenticated_client):
        """GET /api/social-sharing/links returns list of share links"""
        response = authenticated_client.get(f"{BASE_URL}/api/social-sharing/links")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Each link should have expected fields
        for link in data:
            assert "share_id" in link
            assert "share_url" in link
            assert "name" in link
            assert "permissions" in link
    
    def test_create_share_link_success(self, authenticated_client):
        """POST /api/social-sharing/links creates a share link with URL"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/links",
            json={
                "name": f"TEST_Agency_{uuid.uuid4().hex[:6]}",
                "permissions": "contributor",
                "expires_in_days": 30
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "share_id" in data
        assert data["share_id"].startswith("share_")
        assert "share_url" in data
        assert "shared/social/" in data["share_url"]
        assert data["name"].startswith("TEST_")
        assert data["permissions"] == "contributor"
        assert "expires_at" in data
        assert data["access_count"] == 0
        
        # Store for cleanup
        TestShareLinksAPI.test_share_id = data["share_id"]
    
    def test_create_share_link_with_password(self, authenticated_client):
        """Create share link with password protection"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/links",
            json={
                "name": f"TEST_Protected_{uuid.uuid4().hex[:6]}",
                "password": "secret123",
                "permissions": "viewer",
                "expires_in_days": 7
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["permissions"] == "viewer"
        # Password should not be in response
        assert "password" not in data
        assert "password_hash" not in data
        
        # Store for cleanup and further tests
        TestShareLinksAPI.password_protected_share_id = data["share_id"]
        TestShareLinksAPI.password_protected_token = data["share_url"].split("/")[-1]
    
    def test_create_share_link_no_expiry(self, authenticated_client):
        """Create share link without expiration"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/links",
            json={
                "name": f"TEST_NoExpiry_{uuid.uuid4().hex[:6]}",
                "permissions": "contributor",
                "expires_in_days": None
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        # Store for cleanup
        TestShareLinksAPI.no_expiry_share_id = data["share_id"]
    
    def test_revoke_share_link_success(self, authenticated_client):
        """DELETE /api/social-sharing/links/{share_id} revokes a link"""
        # First create a link to delete
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/links",
            json={
                "name": f"TEST_ToRevoke_{uuid.uuid4().hex[:6]}",
                "permissions": "viewer"
            }
        )
        assert create_response.status_code == 200
        share_id = create_response.json()["share_id"]
        
        # Now delete it
        response = authenticated_client.delete(f"{BASE_URL}/api/social-sharing/links/{share_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "revoked"
        
        # Verify link is no longer in active list
        list_response = authenticated_client.get(f"{BASE_URL}/api/social-sharing/links")
        links = list_response.json()
        assert not any(link["share_id"] == share_id for link in links)
    
    def test_revoke_nonexistent_link(self, authenticated_client):
        """DELETE /api/social-sharing/links/{share_id} returns 404 for invalid ID"""
        response = authenticated_client.delete(f"{BASE_URL}/api/social-sharing/links/share_nonexistent123")
        assert response.status_code == 404


class TestExternalAccessAPI:
    """Tests for public external access validation"""
    
    def test_validate_access_success(self, api_client, authenticated_client):
        """POST /api/social-sharing/access/validate validates external access token"""
        # First get existing share links to find a valid token
        list_response = authenticated_client.get(f"{BASE_URL}/api/social-sharing/links")
        links = list_response.json()
        
        # Find a link without password
        valid_link = None
        for link in links:
            if not link.get("has_password", False):
                valid_link = link
                break
        
        if not valid_link:
            # Create one without password
            create_response = authenticated_client.post(
                f"{BASE_URL}/api/social-sharing/links",
                json={
                    "name": f"TEST_ForValidation_{uuid.uuid4().hex[:6]}",
                    "permissions": "contributor"
                }
            )
            valid_link = create_response.json()
        
        # Extract token from URL
        share_token = valid_link["share_url"].split("/")[-1]
        
        # Validate access (this is a PUBLIC endpoint - no auth needed)
        response = api_client.post(
            f"{BASE_URL}/api/social-sharing/access/validate",
            json={"share_token": share_token}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "session_token" in data
        assert "organization" in data
        assert "permissions" in data
        assert "shared_by" in data
        assert data["expires_in_hours"] == 8
    
    def test_validate_access_invalid_token(self, api_client):
        """POST /api/social-sharing/access/validate returns 404 for invalid token"""
        response = api_client.post(
            f"{BASE_URL}/api/social-sharing/access/validate",
            json={"share_token": "invalid_token_12345"}
        )
        assert response.status_code == 404
    
    def test_validate_access_password_required(self, api_client, authenticated_client):
        """POST /api/social-sharing/access/validate requires password when set"""
        # Create a password-protected link
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/links",
            json={
                "name": f"TEST_PwdRequired_{uuid.uuid4().hex[:6]}",
                "password": "testpassword",
                "permissions": "viewer"
            }
        )
        assert create_response.status_code == 200
        share_token = create_response.json()["share_url"].split("/")[-1]
        
        # Try without password - should fail
        response = api_client.post(
            f"{BASE_URL}/api/social-sharing/access/validate",
            json={"share_token": share_token}
        )
        assert response.status_code == 401
        assert "Password required" in response.json().get("detail", "")
    
    def test_validate_access_wrong_password(self, api_client, authenticated_client):
        """POST /api/social-sharing/access/validate rejects wrong password"""
        # Create a password-protected link
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/social-sharing/links",
            json={
                "name": f"TEST_WrongPwd_{uuid.uuid4().hex[:6]}",
                "password": "correctpassword",
                "permissions": "viewer"
            }
        )
        assert create_response.status_code == 200
        share_token = create_response.json()["share_url"].split("/")[-1]
        
        # Try with wrong password
        response = api_client.post(
            f"{BASE_URL}/api/social-sharing/access/validate",
            json={"share_token": share_token, "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "Invalid password" in response.json().get("detail", "")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_links(self, authenticated_client):
        """Delete all TEST_ prefixed share links"""
        response = authenticated_client.get(f"{BASE_URL}/api/social-sharing/links")
        links = response.json()
        
        deleted = 0
        for link in links:
            if link["name"].startswith("TEST_"):
                del_response = authenticated_client.delete(
                    f"{BASE_URL}/api/social-sharing/links/{link['share_id']}"
                )
                if del_response.status_code == 200:
                    deleted += 1
        
        print(f"Cleaned up {deleted} test share links")
        assert True  # Always pass cleanup
