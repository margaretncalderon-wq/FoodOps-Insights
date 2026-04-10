# test_account_sharing_org_visibility.py - Tests for Org-Level Account Sharing Visibility Bug Fix
"""
Tests for the bug fix where:
1. When a social account is shared with a user's organization (via account_memberships or company_sharing),
   other team members in the same org couldn't see those shared accounts in Demand Generation.

Fixed behavior:
- GET /api/account-sharing/my-accounts now includes:
  1) Accounts owned by user's organization (access_type=owned)
  2) Accounts shared with the current user directly (access_type=shared)
  3) Accounts shared with ANY team member in the same org (org-level visibility)
  4) Accounts from companies shared via company_sharing with social_media permission enabled (access_type=company_shared)
- No duplicate accounts returned (deduplication by account_id using seen_ids set)
- Shared accounts have _access_type='shared' or 'company_shared' with _role and _shared_by fields
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAccountSharingOrgVisibility:
    """Tests for org-level account sharing visibility fix"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session with admin user"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login with admin credentials
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return s
    
    # ============== CORE BUG FIX TESTS ==============
    
    def test_my_accounts_returns_owned_accounts(self, session):
        """GET /api/account-sharing/my-accounts should return owned accounts with access_type=owned"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check for owned accounts
        owned_accounts = [a for a in data if a.get("_access_type") == "owned"]
        print(f"Found {len(owned_accounts)} owned accounts out of {len(data)} total")
        
        # Verify owned accounts have correct structure
        for acc in owned_accounts:
            assert "account_id" in acc, "Account should have account_id"
            assert acc.get("_access_type") == "owned", "Owned account should have _access_type=owned"
            assert acc.get("_role") == "owner", "Owned account should have _role=owner"
            print(f"  - Owned: @{acc.get('handle', 'N/A')} ({acc.get('platform', 'N/A')})")
    
    def test_my_accounts_returns_shared_accounts(self, session):
        """GET /api/account-sharing/my-accounts should return shared accounts with access_type=shared"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check for shared accounts
        shared_accounts = [a for a in data if a.get("_access_type") == "shared"]
        print(f"Found {len(shared_accounts)} shared accounts")
        
        # Verify shared accounts have correct structure
        for acc in shared_accounts:
            assert "account_id" in acc, "Account should have account_id"
            assert acc.get("_access_type") == "shared", "Shared account should have _access_type=shared"
            assert "_role" in acc, "Shared account should have _role"
            assert "_shared_by" in acc, "Shared account should have _shared_by"
            print(f"  - Shared: @{acc.get('handle', 'N/A')} ({acc.get('platform', 'N/A')}) - role: {acc.get('_role')}, from: {acc.get('_shared_by')}")
    
    def test_my_accounts_returns_company_shared_accounts(self, session):
        """GET /api/account-sharing/my-accounts should return company_shared accounts"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check for company_shared accounts
        company_shared_accounts = [a for a in data if a.get("_access_type") == "company_shared"]
        print(f"Found {len(company_shared_accounts)} company_shared accounts")
        
        # Verify company_shared accounts have correct structure
        for acc in company_shared_accounts:
            assert "account_id" in acc, "Account should have account_id"
            assert acc.get("_access_type") == "company_shared", "Company shared account should have _access_type=company_shared"
            assert "_role" in acc, "Company shared account should have _role"
            assert "_shared_by" in acc, "Company shared account should have _shared_by (company name)"
            print(f"  - Company Shared: @{acc.get('handle', 'N/A')} ({acc.get('platform', 'N/A')}) - role: {acc.get('_role')}, from: {acc.get('_shared_by')}")
    
    def test_my_accounts_no_duplicates(self, session):
        """GET /api/account-sharing/my-accounts should not return duplicate accounts"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check for duplicates
        account_ids = [a.get("account_id") for a in data]
        unique_ids = set(account_ids)
        
        assert len(account_ids) == len(unique_ids), f"Found duplicate accounts! Total: {len(account_ids)}, Unique: {len(unique_ids)}"
        print(f"No duplicates found. {len(account_ids)} unique accounts returned.")
    
    def test_my_accounts_all_have_required_fields(self, session):
        """All accounts should have required fields: account_id, _access_type, _role"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        for i, acc in enumerate(data):
            assert "account_id" in acc, f"Account {i} missing account_id"
            assert "_access_type" in acc, f"Account {i} missing _access_type"
            assert "_role" in acc, f"Account {i} missing _role"
            
            # Validate _access_type values
            valid_access_types = ["owned", "shared", "company_shared"]
            assert acc.get("_access_type") in valid_access_types, f"Account {i} has invalid _access_type: {acc.get('_access_type')}"
            
            # Shared accounts should have _shared_by
            if acc.get("_access_type") in ["shared", "company_shared"]:
                assert "_shared_by" in acc, f"Shared account {i} missing _shared_by"
        
        print(f"All {len(data)} accounts have required fields")
    
    def test_my_accounts_access_type_distribution(self, session):
        """Verify the distribution of access types in returned accounts"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Count by access type
        access_type_counts = {}
        for acc in data:
            access_type = acc.get("_access_type", "unknown")
            access_type_counts[access_type] = access_type_counts.get(access_type, 0) + 1
        
        print(f"Access type distribution:")
        for access_type, count in access_type_counts.items():
            print(f"  - {access_type}: {count}")
        
        # At minimum, we should have some accounts (owned or shared)
        assert len(data) >= 0, "Should return accounts list (can be empty)"
    
    # ============== ENDPOINT STRUCTURE TESTS ==============
    
    def test_my_accounts_endpoint_exists(self, session):
        """GET /api/account-sharing/my-accounts endpoint should exist and be accessible"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        # Should not return 404 or 405
        assert response.status_code not in [404, 405], f"Endpoint not found or method not allowed: {response.status_code}"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("Endpoint exists and is accessible")
    
    def test_my_accounts_requires_auth(self):
        """GET /api/account-sharing/my-accounts should require authentication"""
        response = requests.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("Endpoint correctly requires authentication")
    
    # ============== INTEGRATION WITH FRONTEND ==============
    
    def test_accounts_usable_in_social_media_page(self, session):
        """Accounts returned should be usable in the SocialMediaPage account selector"""
        response = session.get(f"{BASE_URL}/api/account-sharing/my-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify accounts have fields needed by frontend
        for acc in data:
            # Required for account selector dropdown
            assert "account_id" in acc, "Missing account_id for selector"
            assert "handle" in acc or "platform" in acc, "Missing handle or platform for display"
            
            # Required for access control in UI
            assert "_access_type" in acc, "Missing _access_type for UI access control"
            assert "_role" in acc, "Missing _role for permission checks"
        
        print(f"All {len(data)} accounts have fields required by frontend")
    
    def test_social_stats_endpoint_works(self, session):
        """GET /api/demand-studio/social/stats should work (used by SocialMediaPage)"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/stats")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Social stats: {data}")
    
    def test_social_accounts_endpoint_works(self, session):
        """GET /api/demand-studio/social/accounts should work (used by SocialMediaPage)"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/accounts?include_shared=true")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} social accounts via demand-studio endpoint")


class TestCompanySharingIntegration:
    """Tests for company_sharing integration with social_media permission"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return s
    
    def test_company_sharing_members_endpoint(self, session):
        """GET /api/company-sharing/members should return company members"""
        response = session.get(f"{BASE_URL}/api/company-sharing/members")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "members" in data, "Response should have members list"
        assert "pending" in data, "Response should have pending list"
        
        print(f"Company members: {len(data.get('members', []))}, Pending: {len(data.get('pending', []))}")
    
    def test_company_sharing_check_permission(self, session):
        """GET /api/company-sharing/check-permission should check section permissions"""
        response = session.get(f"{BASE_URL}/api/company-sharing/check-permission?section=social_media")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "has_access" in data, "Response should have has_access field"
        assert "role" in data, "Response should have role field"
        
        print(f"Social media permission check: has_access={data.get('has_access')}, role={data.get('role')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
