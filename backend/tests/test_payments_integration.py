"""
Test Stripe Payments Integration for Kora OS
Tests:
1. GET /api/payments/pricing - returns module list with prices
2. POST /api/payments/create-subscription-checkout - creates Stripe checkout session
3. GET /api/payments/status/{session_id} - checks payment status
4. POST /api/payments/add-addon-checkout - creates checkout for additional addon
5. GET /api/payments/my-subscription - returns user subscription info
6. Payment transaction record creation in MongoDB
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"

# Expected module prices
EXPECTED_MODULE_PRICES = {
    "module_event_orchestration": 29.0,
    "module_culinary_intelligence": 25.0,
    "module_operations_supplies": 19.0,
    "module_venues": 15.0,
    "module_demand_studio": 35.0,
}


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
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
    """Get auth headers"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestPricingEndpoint:
    """Test GET /api/payments/pricing endpoint"""
    
    def test_pricing_returns_200(self):
        """Test pricing endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/payments/pricing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_pricing_returns_all_modules(self):
        """Test pricing returns all 5 modules"""
        response = requests.get(f"{BASE_URL}/api/payments/pricing")
        data = response.json()
        
        assert "modules" in data, "Missing 'modules' in response"
        assert len(data["modules"]) == 5, f"Expected 5 modules, got {len(data['modules'])}"
        
        module_keys = [m["key"] for m in data["modules"]]
        expected_keys = list(EXPECTED_MODULE_PRICES.keys())
        
        for key in expected_keys:
            assert key in module_keys, f"Missing module: {key}"
    
    def test_pricing_returns_correct_prices(self):
        """Test pricing returns correct prices for each module"""
        response = requests.get(f"{BASE_URL}/api/payments/pricing")
        data = response.json()
        
        for module in data["modules"]:
            key = module["key"]
            expected_price = EXPECTED_MODULE_PRICES.get(key)
            
            assert expected_price is not None, f"Unknown module key: {key}"
            assert module["price"] == expected_price, \
                f"Wrong price for {key}: expected {expected_price}, got {module['price']}"
            assert module["currency"] == "USD", f"Wrong currency for {key}"
            assert module["billing"] == "monthly", f"Wrong billing for {key}"
    
    def test_pricing_base_plan_is_free(self):
        """Test base plan price is 0 (free)"""
        response = requests.get(f"{BASE_URL}/api/payments/pricing")
        data = response.json()
        
        assert "base_plan_price" in data, "Missing 'base_plan_price'"
        assert data["base_plan_price"] == 0, f"Base plan should be free, got {data['base_plan_price']}"


class TestCreateSubscriptionCheckout:
    """Test POST /api/payments/create-subscription-checkout endpoint"""
    
    def test_checkout_requires_auth(self):
        """Test endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": ["module_event_orchestration"]
            }
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_checkout_creates_session_single_module(self, auth_headers):
        """Test checkout creates Stripe session for single module"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": ["module_event_orchestration"],
                "industry_template": "events_hospitality"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data.get("success") is True, "Expected success=True"
        assert "checkout_url" in data, "Missing checkout_url"
        assert "session_id" in data, "Missing session_id"
        assert "amount" in data, "Missing amount"
        
        # Verify amount is correct (single module: $29)
        assert data["amount"] == 29, f"Expected amount 29, got {data['amount']}"
        
        # Verify session_id format
        assert data["session_id"].startswith("cs_"), f"Invalid session_id format: {data['session_id']}"
        
        # Verify checkout_url contains stripe
        assert "stripe.com" in data["checkout_url"], f"checkout_url should be Stripe URL"
    
    def test_checkout_creates_session_multiple_modules(self, auth_headers):
        """Test checkout creates Stripe session for multiple modules with correct amount"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": [
                    "module_event_orchestration",  # $29
                    "module_culinary_intelligence",  # $25
                    "module_venues"  # $15
                ],
                "industry_template": "events_hospitality"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify amount is correct (29 + 25 + 15 = 69)
        assert data["amount"] == 69, f"Expected amount 69, got {data['amount']}"
        assert len(data["modules"]) == 3, f"Expected 3 modules in response"
    
    def test_checkout_skips_payment_for_free_tier(self, auth_headers):
        """Test checkout with no modules returns skip_payment"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": [],  # Empty - free tier
                "industry_template": "generic"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") is True, "Expected success=True"
        assert data.get("skip_payment") is True, "Expected skip_payment=True for free tier"
    
    def test_checkout_all_modules(self, auth_headers):
        """Test checkout with all 5 modules calculates correct total"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": list(EXPECTED_MODULE_PRICES.keys()),
                "industry_template": "events_hospitality"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Total should be 29 + 25 + 19 + 15 + 35 = 123
        expected_total = sum(EXPECTED_MODULE_PRICES.values())
        assert data["amount"] == expected_total, f"Expected amount {expected_total}, got {data['amount']}"


class TestPaymentStatus:
    """Test GET /api/payments/status/{session_id} endpoint"""
    
    @pytest.fixture(scope="class")
    def checkout_session(self, auth_headers):
        """Create a checkout session for status testing"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": ["module_event_orchestration"],
                "industry_template": "events_hospitality"
            }
        )
        assert response.status_code == 200
        return response.json()
    
    def test_status_requires_auth(self):
        """Test status endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/payments/status/cs_test_invalid"
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_status_returns_pending_for_new_session(self, auth_headers, checkout_session):
        """Test status returns pending for unpaid session"""
        session_id = checkout_session["session_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/payments/status/{session_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "status" in data or "payment_status" in data, "Missing status in response"
        assert "modules" in data, "Missing modules in response"
        
        # Status should be pending or unpaid since we haven't paid
        payment_status = data.get("payment_status", data.get("status"))
        assert payment_status in ["pending", "unpaid", "open"], \
            f"Expected pending/unpaid status, got {payment_status}"
    
    def test_status_returns_404_for_invalid_session(self, auth_headers):
        """Test status returns 404 for invalid session ID"""
        response = requests.get(
            f"{BASE_URL}/api/payments/status/cs_invalid_session_xyz",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestAddAddonCheckout:
    """Test POST /api/payments/add-addon-checkout endpoint"""
    
    def test_addon_requires_auth(self):
        """Test add-addon endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/payments/add-addon-checkout",
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "addon_key": "module_event_orchestration"
            }
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_addon_rejects_invalid_module(self, auth_headers):
        """Test add-addon rejects invalid module key"""
        response = requests.post(
            f"{BASE_URL}/api/payments/add-addon-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "addon_key": "invalid_module_xyz"
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "Invalid addon module" in data.get("detail", ""), "Expected invalid addon error"
    
    def test_addon_rejects_already_active_module(self, auth_headers):
        """Test add-addon rejects module that user already has"""
        # The test user has all modules already active (grandfathered)
        response = requests.post(
            f"{BASE_URL}/api/payments/add-addon-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "addon_key": "module_event_orchestration"
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "already have this addon" in data.get("detail", ""), "Expected already active error"


class TestMySubscription:
    """Test GET /api/payments/my-subscription endpoint"""
    
    def test_subscription_requires_auth(self):
        """Test my-subscription endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payments/my-subscription")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_subscription_returns_user_info(self, auth_headers):
        """Test my-subscription returns user subscription info"""
        response = requests.get(
            f"{BASE_URL}/api/payments/my-subscription",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "subscription" in data, "Missing 'subscription' in response"
        assert "active_modules" in data, "Missing 'active_modules' in response"
        assert "active_module_keys" in data, "Missing 'active_module_keys' in response"
        assert "monthly_cost" in data, "Missing 'monthly_cost' in response"
        assert "payment_history" in data, "Missing 'payment_history' in response"
    
    def test_subscription_active_modules_format(self, auth_headers):
        """Test active_modules returns correct format"""
        response = requests.get(
            f"{BASE_URL}/api/payments/my-subscription",
            headers=auth_headers
        )
        
        data = response.json()
        active_modules = data.get("active_modules", [])
        
        # Each module should have required fields
        for module in active_modules:
            assert "addon_id" in module, "Missing addon_id in module"
            assert "status" in module, "Missing status in module"
            assert "addon_name" in module, "Missing addon_name in module"
            assert module.get("status") == "active", f"Expected active status, got {module.get('status')}"
    
    def test_subscription_monthly_cost_calculation(self, auth_headers):
        """Test monthly_cost is correctly calculated"""
        response = requests.get(
            f"{BASE_URL}/api/payments/my-subscription",
            headers=auth_headers
        )
        
        data = response.json()
        active_keys = data.get("active_module_keys", [])
        monthly_cost = data.get("monthly_cost", 0)
        
        # Calculate expected cost based on active modules
        expected_cost = sum(EXPECTED_MODULE_PRICES.get(k, 0) for k in active_keys)
        
        assert monthly_cost == expected_cost, \
            f"Expected monthly_cost {expected_cost}, got {monthly_cost}"


class TestPaymentTransactionCreation:
    """Test that payment transactions are created in MongoDB"""
    
    def test_transaction_created_on_checkout(self, auth_headers):
        """Test transaction record is created when checkout session is created"""
        # Create a checkout session
        response = requests.post(
            f"{BASE_URL}/api/payments/create-subscription-checkout",
            headers=auth_headers,
            json={
                "origin_url": "https://partner-portal-87.preview.emergentagent.com",
                "selected_modules": ["module_demand_studio"],  # $35
                "industry_template": "professional_services"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        session_id = data["session_id"]
        
        # Verify we can get status for this transaction (proves it was created)
        status_response = requests.get(
            f"{BASE_URL}/api/payments/status/{session_id}",
            headers=auth_headers
        )
        
        assert status_response.status_code == 200, "Transaction should exist in database"
        status_data = status_response.json()
        
        # Verify the transaction has correct data
        assert status_data.get("modules") == ["module_demand_studio"], \
            f"Expected modules ['module_demand_studio'], got {status_data.get('modules')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
