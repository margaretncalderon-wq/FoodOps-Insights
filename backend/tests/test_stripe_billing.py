"""
Test Stripe Billing Integration and Super Admin Stats
Tests:
1. Super Admin dashboard stats - organization count
2. POST /api/org/billing/checkout - Stripe checkout session creation
3. GET /api/org/billing/checkout/status/{session_id} - Transaction status
4. GET /api/org/billing - Billing information
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuth:
    """Authentication helper"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestSuperAdminStats(TestAuth):
    """Test Super Admin dashboard stats - organization count fix"""
    
    def test_super_admin_stats_endpoint(self, auth_headers):
        """Test GET /api/super-admin/stats returns correct organization count"""
        response = requests.get(
            f"{BASE_URL}/api/super-admin/stats",
            headers=auth_headers
        )
        
        # Should return 200 for super admin user
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Super Admin Stats Response: {data}")
        
        # Verify response structure
        assert "organizations" in data, "Missing 'organizations' in response"
        assert "total" in data["organizations"], "Missing 'total' in organizations"
        assert "active" in data["organizations"], "Missing 'active' in organizations"
        assert "suspended" in data["organizations"], "Missing 'suspended' in organizations"
        
        # Verify active organizations count is not 0 (bug fix verification)
        active_orgs = data["organizations"]["active"]
        total_orgs = data["organizations"]["total"]
        
        print(f"Total Organizations: {total_orgs}")
        print(f"Active Organizations: {active_orgs}")
        print(f"Suspended Organizations: {data['organizations']['suspended']}")
        
        # The bug was showing 0 active orgs - should now show correct count
        # Based on context, should show 18 active orgs
        assert active_orgs > 0, f"Active organizations should be > 0, got {active_orgs}"
        
        # Verify other stats
        assert "subscriptions_by_plan" in data, "Missing 'subscriptions_by_plan'"
        assert "total_users" in data, "Missing 'total_users'"
        assert "events_this_month" in data, "Missing 'events_this_month'"
        
        return data


class TestBillingEndpoints(TestAuth):
    """Test billing endpoints"""
    
    def test_get_billing_info(self, auth_headers):
        """Test GET /api/org/billing returns billing information"""
        response = requests.get(
            f"{BASE_URL}/api/org/billing",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Billing Info Response: {data}")
        
        # Verify response structure
        assert "subscription" in data, "Missing 'subscription' in response"
        assert "plan" in data, "Missing 'plan' in response"
        
        # Verify subscription details
        subscription = data["subscription"]
        if subscription:
            assert "subscription_id" in subscription, "Missing subscription_id"
            assert "status" in subscription, "Missing status"
            assert "billing_cycle" in subscription, "Missing billing_cycle"
            print(f"Subscription Status: {subscription['status']}")
            print(f"Billing Cycle: {subscription['billing_cycle']}")
        
        # Verify plan details
        plan = data["plan"]
        if plan:
            assert "plan_id" in plan, "Missing plan_id"
            assert "name" in plan, "Missing name"
            assert "price_monthly" in plan, "Missing price_monthly"
            assert "price_yearly" in plan, "Missing price_yearly"
            print(f"Current Plan: {plan['name']}")
            print(f"Monthly Price: ${plan['price_monthly']}")
            print(f"Yearly Price: ${plan['price_yearly']}")
        
        return data
    
    def test_get_plans(self, auth_headers):
        """Test GET /api/org/plans returns available plans"""
        response = requests.get(
            f"{BASE_URL}/api/org/plans",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Plans Response: {data}")
        
        # Should have 3 plans
        assert len(data) == 3, f"Expected 3 plans, got {len(data)}"
        
        # Verify plan structure
        for plan in data:
            assert "plan_id" in plan, "Missing plan_id"
            assert "name" in plan, "Missing name"
            assert "display_name_en" in plan, "Missing display_name_en"
            assert "price_monthly" in plan, "Missing price_monthly"
            assert "price_yearly" in plan, "Missing price_yearly"
            assert "limits" in plan, "Missing limits"
            assert "features" in plan, "Missing features"
            print(f"Plan: {plan['name']} - Monthly: ${plan['price_monthly']}, Yearly: ${plan['price_yearly']}")
        
        return data


class TestStripeCheckout(TestAuth):
    """Test Stripe checkout endpoints"""
    
    def test_create_checkout_session_professional(self, auth_headers):
        """Test POST /api/org/billing/checkout creates Stripe checkout session"""
        response = requests.post(
            f"{BASE_URL}/api/org/billing/checkout",
            headers=auth_headers,
            json={
                "plan_id": "plan_professional",
                "billing_cycle": "monthly",
                "origin_url": "https://collab-execution.preview.emergentagent.com"
            }
        )
        
        print(f"Checkout Response Status: {response.status_code}")
        print(f"Checkout Response: {response.text}")
        
        # Should return 200 with checkout URL
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "checkout_url" in data, "Missing 'checkout_url' in response"
        assert "session_id" in data, "Missing 'session_id' in response"
        
        checkout_url = data["checkout_url"]
        session_id = data["session_id"]
        
        print(f"Checkout URL: {checkout_url}")
        print(f"Session ID: {session_id}")
        
        # Verify checkout URL is a valid Stripe URL
        assert "stripe.com" in checkout_url or "checkout" in checkout_url, \
            f"Checkout URL should be a Stripe URL, got: {checkout_url}"
        
        # Verify session_id format
        assert session_id.startswith("cs_"), f"Session ID should start with 'cs_', got: {session_id}"
        
        return data
    
    def test_create_checkout_session_yearly(self, auth_headers):
        """Test checkout with yearly billing cycle"""
        response = requests.post(
            f"{BASE_URL}/api/org/billing/checkout",
            headers=auth_headers,
            json={
                "plan_id": "plan_enterprise",
                "billing_cycle": "yearly",
                "origin_url": "https://collab-execution.preview.emergentagent.com"
            }
        )
        
        print(f"Yearly Checkout Response Status: {response.status_code}")
        print(f"Yearly Checkout Response: {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "checkout_url" in data, "Missing checkout_url"
        assert "session_id" in data, "Missing session_id"
        
        return data
    
    def test_create_checkout_free_plan_fails(self, auth_headers):
        """Test that free plan checkout returns error"""
        response = requests.post(
            f"{BASE_URL}/api/org/billing/checkout",
            headers=auth_headers,
            json={
                "plan_id": "plan_starter",
                "billing_cycle": "monthly",
                "origin_url": "https://collab-execution.preview.emergentagent.com"
            }
        )
        
        print(f"Free Plan Checkout Response Status: {response.status_code}")
        print(f"Free Plan Checkout Response: {response.text}")
        
        # Free plan should return 400 error
        assert response.status_code == 400, f"Expected 400 for free plan, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"Error message: {data['detail']}")
    
    def test_get_checkout_status_invalid_session(self, auth_headers):
        """Test GET /api/org/billing/checkout/status with invalid session"""
        response = requests.get(
            f"{BASE_URL}/api/org/billing/checkout/status/cs_invalid_session_123",
            headers=auth_headers
        )
        
        print(f"Invalid Session Status Response: {response.status_code}")
        print(f"Invalid Session Response: {response.text}")
        
        # Should return 404 for invalid session
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_get_checkout_status_valid_session(self, auth_headers):
        """Test GET /api/org/billing/checkout/status with valid session from previous test"""
        # First create a checkout session
        create_response = requests.post(
            f"{BASE_URL}/api/org/billing/checkout",
            headers=auth_headers,
            json={
                "plan_id": "plan_professional",
                "billing_cycle": "monthly",
                "origin_url": "https://collab-execution.preview.emergentagent.com"
            }
        )
        
        assert create_response.status_code == 200, f"Failed to create checkout: {create_response.text}"
        session_id = create_response.json()["session_id"]
        
        # Now check the status
        status_response = requests.get(
            f"{BASE_URL}/api/org/billing/checkout/status/{session_id}",
            headers=auth_headers
        )
        
        print(f"Valid Session Status Response: {status_response.status_code}")
        print(f"Valid Session Response: {status_response.text}")
        
        assert status_response.status_code == 200, f"Expected 200, got {status_response.status_code}"
        
        data = status_response.json()
        
        # Verify response structure
        assert "status" in data or "payment_status" in data, "Missing status in response"
        
        # Status should be pending/initiated since we haven't completed payment
        payment_status = data.get("payment_status", data.get("status"))
        print(f"Payment Status: {payment_status}")
        
        return data


class TestUsageEndpoints(TestAuth):
    """Test usage tracking endpoints"""
    
    def test_get_usage(self, auth_headers):
        """Test GET /api/org/usage returns usage metrics"""
        response = requests.get(
            f"{BASE_URL}/api/org/usage",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Usage Response: {data}")
        
        # Verify response structure
        assert "period" in data, "Missing 'period'"
        assert "metrics" in data, "Missing 'metrics'"
        assert "limits" in data, "Missing 'limits'"
        
        return data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
