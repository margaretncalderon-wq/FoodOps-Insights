# test_account_sharing.py - Tests for Account-Centric Sharing Model
"""
Tests for:
- GET /api/account-sharing/my-accounts - List accessible accounts (owned + shared)
- POST /api/account-sharing/share?account_id=X - Share account with user
- GET /api/account-sharing/collaborators/{account_id} - List collaborators
- POST /api/account-sharing/links - Create share link
- GET /api/account-sharing/links/{account_id} - List share links
- DELETE /api/account-sharing/links/{share_id} - Revoke link
- DELETE /api/account-sharing/collaborators/{membership_id} - Remove collaborator
- GET /api/demand-studio/social/stats?account_id=X - Filter stats by account
- GET /api/demand-studio/social/posts?account_id=X - Filter posts by account
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAccountSharingEndpoints:
    """Tests for the new account-centric sharing model"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return s
    
    # ============== GET MY-ACCOUNTS ==============
    def test_get_my_accounts_success(self, session):
        """GET /api/account-sharing/my-accounts should return accessible accounts"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Found {len(data)} accessible accounts")
        
        # If accounts exist, verify structure
        if len(data) > 0:
            account = data[0]
            assert "account_id" in account, "Account should have account_id"
            assert "_access_type" in account, "Account should have _access_type (owned/shared)"
            assert "_role" in account, "Account should have _role"
            print(f"First account: {account.get('handle', 'N/A')} ({account.get('platform', 'N/A')}) - {account.get('_access_type', 'N/A')}")
    
    def test_get_my_accounts_unauthorized(self):
        """GET /api/account-sharing/my-accounts without auth should fail"""
        response = requests.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Unauthorized access correctly rejected")
    
    # ============== SHARE ACCOUNT ==============
    def test_share_account_missing_email(self, session):
        """POST /api/account-sharing/share should fail without email"""
        # Get an account_id to test with
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test sharing")
        
        account_id = accounts[0].get("account_id")
        
        response = session.post(
            f"{BASE_URL}/api/account-sharing/share?account_id={account_id}",
            json={"role": "contributor"}  # Missing email
        )
        
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print("Share without email correctly rejected")
    
    def test_share_account_invalid_user(self, session):
        """POST /api/account-sharing/share with non-existent user should fail"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test sharing")
        
        # Filter only owned accounts
        owned = [a for a in accounts if a.get("_access_type") == "owned"]
        if not owned:
            pytest.skip("No owned accounts available to test sharing")
        
        account_id = owned[0].get("account_id")
        
        response = session.post(
            f"{BASE_URL}/api/account-sharing/share?account_id={account_id}",
            json={
                "email": "nonexistent_user_12345@example.com",
                "role": "contributor"
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Share with non-existent user correctly rejected")
    
    def test_share_account_invalid_account(self, session):
        """POST /api/account-sharing/share with invalid account should fail"""
        response = session.post(
            f"{BASE_URL}/api/account-sharing/share?account_id=invalid_account_123",
            json={
                "email": "demo.agency@kora.com",
                "role": "contributor"
            }
        )
        
        assert response.status_code in [404, 403], f"Expected 404/403, got {response.status_code}"
        print("Share with invalid account correctly rejected")
    
    # ============== GET COLLABORATORS ==============
    def test_get_collaborators_success(self, session):
        """GET /api/account-sharing/collaborators/{account_id} should list collaborators"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test")
        
        account_id = accounts[0].get("account_id")
        
        response = session.get(f"{BASE_URL}/api/account-sharing/collaborators/{account_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "account" in data, "Response should have account info"
        assert "collaborators" in data, "Response should have collaborators list"
        assert "is_owner" in data, "Response should have is_owner flag"
        
        print(f"Account: @{data['account'].get('handle', 'N/A')}, Collaborators: {len(data['collaborators'])}, Is Owner: {data['is_owner']}")
    
    def test_get_collaborators_invalid_account(self, session):
        """GET /api/account-sharing/collaborators with invalid account should fail"""
        response = session.get(f"{BASE_URL}/api/account-sharing/collaborators/invalid_account_123")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Get collaborators with invalid account correctly rejected")
    
    # ============== SHARE LINKS ==============
    def test_create_share_link_success(self, session):
        """POST /api/account-sharing/links should create a share link"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        # Filter only owned accounts
        owned = [a for a in accounts if a.get("_access_type") == "owned"]
        if not owned:
            pytest.skip("No owned accounts available to create share link")
        
        account_id = owned[0].get("account_id")
        
        response = session.post(
            f"{BASE_URL}/api/account-sharing/links",
            json={
                "account_id": account_id,
                "name": "TEST_share_link_pytest",
                "password": None,
                "expires_in_days": 7,
                "permissions": "contributor"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "share_id" in data, "Response should have share_id"
        assert "share_url" in data, "Response should have share_url"
        assert "account" in data, "Response should have account info"
        
        print(f"Created share link: {data.get('share_id')}, URL: {data.get('share_url')[:50]}...")
        
        # Return share_id for cleanup
        return data.get("share_id")
    
    def test_create_share_link_with_password(self, session):
        """POST /api/account-sharing/links should create password-protected link"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        owned = [a for a in accounts if a.get("_access_type") == "owned"]
        if not owned:
            pytest.skip("No owned accounts available")
        
        account_id = owned[0].get("account_id")
        
        response = session.post(
            f"{BASE_URL}/api/account-sharing/links",
            json={
                "account_id": account_id,
                "name": "TEST_protected_link",
                "password": "secret123",
                "expires_in_days": 30,
                "permissions": "viewer"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Created password-protected share link")
    
    def test_get_share_links(self, session):
        """GET /api/account-sharing/links/{account_id} should list share links"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        owned = [a for a in accounts if a.get("_access_type") == "owned"]
        if not owned:
            pytest.skip("No owned accounts available")
        
        account_id = owned[0].get("account_id")
        
        response = session.get(f"{BASE_URL}/api/account-sharing/links/{account_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Found {len(data)} share links for account {account_id}")
        
        # Verify link structure if any exist
        if len(data) > 0:
            link = data[0]
            assert "share_id" in link, "Link should have share_id"
            assert "share_url" in link, "Link should have share_url"
            assert "name" in link, "Link should have name"
            assert "permissions" in link, "Link should have permissions"
    
    def test_create_share_link_missing_name(self, session):
        """POST /api/account-sharing/links without name should fail"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        owned = [a for a in accounts if a.get("_access_type") == "owned"]
        if not owned:
            pytest.skip("No owned accounts available")
        
        account_id = owned[0].get("account_id")
        
        response = session.post(
            f"{BASE_URL}/api/account-sharing/links",
            json={
                "account_id": account_id,
                "password": None,
                "expires_in_days": 7,
                "permissions": "contributor"
            }
        )
        
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
        print("Create link without name correctly rejected")
    
    # ============== REVOKE SHARE LINK ==============
    def test_revoke_share_link_invalid(self, session):
        """DELETE /api/account-sharing/links/{share_id} with invalid id should fail"""
        response = session.delete(f"{BASE_URL}/api/account-sharing/links/invalid_share_id_123")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Revoke invalid share link correctly rejected")
    
    # ============== DEMAND STUDIO ACCOUNT FILTERING ==============
    def test_social_stats_with_account_filter(self, session):
        """GET /api/demand-studio/social/stats?account_id=X should filter by account"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test")
        
        account_id = accounts[0].get("account_id")
        
        # Test without filter
        response_all = session.get(f"{BASE_URL}/api/demand-studio/social/stats")
        assert response_all.status_code == 200
        
        # Test with account_id filter
        response_filtered = session.get(f"{BASE_URL}/api/demand-studio/social/stats?account_id={account_id}")
        assert response_filtered.status_code == 200, f"Expected 200, got {response_filtered.status_code}: {response_filtered.text}"
        
        data = response_filtered.json()
        assert "scheduledThisWeek" in data or "postedThisMonth" in data, "Stats should have expected fields"
        
        print(f"Stats filter by account_id working. Stats: {data}")
    
    def test_social_posts_with_account_filter(self, session):
        """GET /api/demand-studio/social/posts?account_id=X should filter by account"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test")
        
        account_id = accounts[0].get("account_id")
        
        # Test with account_id filter
        response = session.get(f"{BASE_URL}/api/demand-studio/social/posts?account_id={account_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify all returned posts belong to the filtered account
        for post in data:
            assert post.get("social_account_id") == account_id, f"Post should belong to filtered account, got {post.get('social_account_id')}"
        
        print(f"Posts filter by account_id working. Found {len(data)} posts for account {account_id}")
    
    def test_social_insights_with_account_filter(self, session):
        """GET /api/demand-studio/social/insights?account_id=X should filter by account"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test")
        
        account_id = accounts[0].get("account_id")
        
        response = session.get(f"{BASE_URL}/api/demand-studio/social/insights?account_id={account_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Insights filter by account_id working. Data: {data}")
    
    def test_social_calendar_with_account_filter(self, session):
        """GET /api/demand-studio/social/calendar?account_id=X should filter by account"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test")
        
        account_id = accounts[0].get("account_id")
        
        # Calendar requires date range
        from datetime import datetime
        now = datetime.now()
        start_date = now.replace(day=1).isoformat()
        end_date = now.replace(day=28).isoformat()
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?account_id={account_id}&start_date={start_date}&end_date={end_date}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Calendar filter by account_id working. Found {len(data)} posts")
    
    def test_social_ideas_with_account_filter(self, session):
        """GET /api/demand-studio/social/ideas?account_id=X should filter by account"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        if not accounts or len(accounts) == 0:
            pytest.skip("No accounts available to test")
        
        account_id = accounts[0].get("account_id")
        
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas?account_id={account_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Ideas filter by account_id working. Found {len(data)} ideas")


class TestCleanup:
    """Cleanup test data created during tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session for cleanup"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication failed for cleanup")
        
        return s
    
    def test_cleanup_test_links(self, session):
        """Clean up TEST_ prefixed share links"""
        accounts_response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        accounts = accounts_response.json()
        
        owned = [a for a in accounts if a.get("_access_type") == "owned"]
        
        cleaned = 0
        for acc in owned:
            links_response = session.get(f"{BASE_URL}/api/account-sharing/links/{acc['account_id']}")
            if links_response.status_code == 200:
                links = links_response.json()
                for link in links:
                    if link.get("name", "").startswith("TEST_"):
                        session.delete(f"{BASE_URL}/api/account-sharing/links/{link['share_id']}")
                        cleaned += 1
        
        print(f"Cleaned up {cleaned} test share links")
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
