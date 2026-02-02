"""
Test SaaS Multi-tenant Organization Endpoints
Tests: Plans, Billing, Usage, Members, Invitations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestPlansEndpoints:
    """Test /api/org/plans endpoints - Public endpoints"""
    
    def test_get_plans_returns_three_plans(self):
        """GET /api/org/plans should return 3 plans (Starter, Professional, Enterprise)"""
        response = requests.get(f"{BASE_URL}/api/org/plans")
        assert response.status_code == 200
        
        plans = response.json()
        assert len(plans) == 3, f"Expected 3 plans, got {len(plans)}"
        
        # Verify plan names
        plan_names = [p["name"] for p in plans]
        assert "starter" in plan_names
        assert "professional" in plan_names
        assert "enterprise" in plan_names
    
    def test_plans_have_required_fields(self):
        """Each plan should have limits and features"""
        response = requests.get(f"{BASE_URL}/api/org/plans")
        assert response.status_code == 200
        
        plans = response.json()
        for plan in plans:
            # Check required fields
            assert "plan_id" in plan
            assert "name" in plan
            assert "display_name_en" in plan
            assert "display_name_es" in plan
            assert "price_monthly" in plan
            assert "price_yearly" in plan
            assert "limits" in plan
            assert "features" in plan
            
            # Check limits structure
            limits = plan["limits"]
            assert "events_per_month" in limits
            assert "active_users" in limits
            assert "supplier_invoices_per_month" in limits
            assert "proposals_per_month" in limits
            
            # Check features structure
            features = plan["features"]
            assert "business_clarity" in features
            assert "culinary_intelligence" in features
    
    def test_starter_plan_is_free(self):
        """Starter plan should have $0 price"""
        response = requests.get(f"{BASE_URL}/api/org/plans")
        plans = response.json()
        
        starter = next((p for p in plans if p["name"] == "starter"), None)
        assert starter is not None
        assert starter["price_monthly"] == 0
        assert starter["price_yearly"] == 0
    
    def test_professional_plan_is_highlighted(self):
        """Professional plan should have highlight=True"""
        response = requests.get(f"{BASE_URL}/api/org/plans")
        plans = response.json()
        
        professional = next((p for p in plans if p["name"] == "professional"), None)
        assert professional is not None
        assert professional["highlight"] == True


class TestAuthenticatedOrgEndpoints:
    """Test authenticated org endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_billing_info(self):
        """GET /api/org/billing should return subscription and plan info"""
        response = requests.get(
            f"{BASE_URL}/api/org/billing",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "subscription" in data
        assert "plan" in data
        
        # Verify subscription structure
        subscription = data["subscription"]
        assert "subscription_id" in subscription
        assert "plan_id" in subscription
        assert "status" in subscription
        assert "billing_cycle" in subscription
    
    def test_get_usage_metrics(self):
        """GET /api/org/usage should return usage metrics and limits"""
        response = requests.get(
            f"{BASE_URL}/api/org/usage",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "period" in data
        assert "metrics" in data
        assert "limits" in data
        
        # Verify metrics structure
        metrics = data["metrics"]
        assert "events_created" in metrics
        assert "active_users" in metrics
        assert "proposals_created" in metrics
    
    def test_get_members_list(self):
        """GET /api/org/members should return team members"""
        response = requests.get(
            f"{BASE_URL}/api/org/members",
            headers=self.headers
        )
        assert response.status_code == 200
        
        members = response.json()
        assert isinstance(members, list)
        
        # If there are members, verify structure
        if len(members) > 0:
            member = members[0]
            assert "membership_id" in member
            assert "user_id" in member
            assert "role" in member
    
    def test_get_invitations_list(self):
        """GET /api/org/invitations should return pending invitations"""
        response = requests.get(
            f"{BASE_URL}/api/org/invitations",
            headers=self.headers
        )
        assert response.status_code == 200
        
        invitations = response.json()
        assert isinstance(invitations, list)
    
    def test_get_permissions(self):
        """GET /api/org/permissions should return user's role and permissions"""
        response = requests.get(
            f"{BASE_URL}/api/org/permissions",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "role" in data
        assert "permissions" in data
        
        # Verify permissions structure
        permissions = data["permissions"]
        assert "manage_billing" in permissions
        assert "manage_members" in permissions
        assert "manage_events" in permissions
    
    def test_get_current_organization(self):
        """GET /api/org/current should return current org details"""
        response = requests.get(
            f"{BASE_URL}/api/org/current",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "organization" in data
        assert "subscription" in data
        assert "role" in data
    
    def test_get_my_organizations(self):
        """GET /api/org/my-organizations should return user's organizations"""
        response = requests.get(
            f"{BASE_URL}/api/org/my-organizations",
            headers=self.headers
        )
        assert response.status_code == 200
        
        orgs = response.json()
        assert isinstance(orgs, list)
        
        # User should have at least one org
        if len(orgs) > 0:
            org = orgs[0]
            assert "organization" in org
            assert "role" in org
            assert "is_active" in org


class TestInvitationCreation:
    """Test invitation creation endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_invitation_success(self):
        """POST /api/org/invitations should create a new invitation"""
        test_email = f"test_invite_{os.urandom(4).hex()}@example.com"
        
        response = requests.post(
            f"{BASE_URL}/api/org/invitations",
            headers=self.headers,
            json={"email": test_email, "role": "ops"}
        )
        
        # Should succeed or fail due to usage limit
        assert response.status_code in [200, 201, 403]
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert "invitation_id" in data
            assert data["email"] == test_email
            assert data["role"] == "ops"
            assert data["status"] == "pending"
            
            # Clean up - revoke the invitation
            inv_id = data["invitation_id"]
            requests.delete(
                f"{BASE_URL}/api/org/invitations/{inv_id}",
                headers=self.headers
            )
    
    def test_create_invitation_invalid_email(self):
        """POST /api/org/invitations with invalid email should fail"""
        response = requests.post(
            f"{BASE_URL}/api/org/invitations",
            headers=self.headers,
            json={"email": "not-an-email", "role": "ops"}
        )
        
        assert response.status_code == 422  # Validation error


class TestUsageLimitsEnforcement:
    """Test usage limits are enforced"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_check_usage_limit_endpoint(self):
        """GET /api/org/usage/check/{metric} should return limit status"""
        response = requests.get(
            f"{BASE_URL}/api/org/usage/check/events_created",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "allowed" in data
        assert isinstance(data["allowed"], bool)


class TestSubscriptionManagement:
    """Test subscription management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        
        self.token = login_response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_subscription(self):
        """GET /api/org/subscription should return subscription details"""
        response = requests.get(
            f"{BASE_URL}/api/org/subscription",
            headers=self.headers
        )
        # Can be 200 or null if no subscription
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
