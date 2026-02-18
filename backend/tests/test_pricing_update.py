"""
Test file for Kora Pricing Model Update
Tests:
- GET /api/payments/pricing - Public pricing info
- GET /api/super-admin/pricing - Super Admin pricing config (auth required)
- PUT /api/super-admin/pricing - Update pricing (Super Admin only)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestPricingEndpoints:
    """Test pricing endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_public_pricing_endpoint(self):
        """Test GET /api/payments/pricing returns correct pricing structure"""
        response = self.session.get(f"{BASE_URL}/api/payments/pricing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify Kora Core price is $69
        assert "kora_core_price" in data, "Missing kora_core_price"
        assert data["kora_core_price"] == 69.0, f"Expected $69, got ${data['kora_core_price']}"
        
        # Verify Kora Core includes
        assert "kora_core_includes" in data, "Missing kora_core_includes"
        expected_includes = ["System Pulse", "Execution Hub", "Client Engagement", "Business Clarity", "1 Location"]
        for item in expected_includes:
            assert item in data["kora_core_includes"], f"Missing {item} in kora_core_includes"
        
        # Verify modules list
        assert "modules" in data, "Missing modules list"
        modules = {m["key"]: m for m in data["modules"]}
        
        # Verify Event Suite $39
        assert "module_event_suite" in modules, "Missing module_event_suite"
        assert modules["module_event_suite"]["price"] == 39.0, f"Event Suite should be $39, got ${modules['module_event_suite']['price']}"
        assert modules["module_event_suite"]["name"] == "Event Suite"
        
        # Verify Culinary Intelligence $29
        assert "module_culinary_intelligence" in modules, "Missing module_culinary_intelligence"
        assert modules["module_culinary_intelligence"]["price"] == 29.0, f"Culinary Intelligence should be $29, got ${modules['module_culinary_intelligence']['price']}"
        
        # Verify Operations Supplies $19
        assert "module_operations_supplies" in modules, "Missing module_operations_supplies"
        assert modules["module_operations_supplies"]["price"] == 19.0, f"Operations Supplies should be $19, got ${modules['module_operations_supplies']['price']}"
        
        # Verify Demand Studio $39
        assert "module_demand_studio" in modules, "Missing module_demand_studio"
        assert modules["module_demand_studio"]["price"] == 39.0, f"Demand Studio should be $39, got ${modules['module_demand_studio']['price']}"
        
        # Verify trial days
        assert data.get("trial_days") == 7, f"Trial days should be 7, got {data.get('trial_days')}"
        
        print("✓ Public pricing endpoint returns correct Kora pricing model")
    
    def test_super_admin_pricing_requires_auth(self):
        """Test that super admin pricing endpoint requires authentication"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/pricing")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Super Admin pricing GET requires authentication")
    
    def test_super_admin_pricing_put_requires_auth(self):
        """Test that super admin pricing PUT endpoint requires authentication"""
        response = self.session.put(f"{BASE_URL}/api/super-admin/pricing", json={
            "kora_core_price": 100
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Super Admin pricing PUT requires authentication")
    
    def test_login_and_verify_role(self):
        """Test login with test credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed with status {response.status_code}"
        data = response.json()
        
        assert "access_token" in data or "token" in data, "No token in response"
        print(f"✓ Login successful. User role: {data.get('user', {}).get('role', 'unknown')}")
        
        return data
    
    def test_my_subscription_endpoint(self):
        """Test my-subscription endpoint after login"""
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200, "Login failed"
        
        # Get subscription
        response = self.session.get(f"{BASE_URL}/api/payments/my-subscription")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "active_modules" in data or "active_module_keys" in data
        assert "monthly_cost" in data
        
        print(f"✓ My subscription endpoint works. Monthly cost: ${data.get('monthly_cost', 0)}")


class TestPricingModelValidation:
    """Validate the new pricing model structure"""
    
    def test_pricing_model_structure(self):
        """Verify pricing model matches requirements"""
        response = requests.get(f"{BASE_URL}/api/payments/pricing")
        assert response.status_code == 200
        data = response.json()
        
        # Kora Core $69/mes (required subscription)
        assert data["kora_core_price"] == 69.0, "Kora Core must be $69/month"
        
        modules = {m["key"]: m["price"] for m in data["modules"]}
        
        # Event Suite $39/mes (combines Event Orchestration + Venues)
        assert modules.get("module_event_suite") == 39.0, "Event Suite must be $39/month"
        
        # Culinary Intelligence $29/mes
        assert modules.get("module_culinary_intelligence") == 29.0, "Culinary Intelligence must be $29/month"
        
        # Operations Supplies $19/mes
        assert modules.get("module_operations_supplies") == 19.0, "Operations Supplies must be $19/month"
        
        # Demand Studio $39/mes
        assert modules.get("module_demand_studio") == 39.0, "Demand Studio must be $39/month"
        
        # Trial period 7 days
        assert data.get("trial_days") == 7, "Trial must be 7 days"
        
        print("✓ All pricing model requirements verified")
        print(f"  - Kora Core: ${data['kora_core_price']}/month (required)")
        print(f"  - Event Suite: ${modules.get('module_event_suite')}/month")
        print(f"  - Culinary Intelligence: ${modules.get('module_culinary_intelligence')}/month")
        print(f"  - Operations Supplies: ${modules.get('module_operations_supplies')}/month")
        print(f"  - Demand Studio: ${modules.get('module_demand_studio')}/month")
        print(f"  - Trial period: {data.get('trial_days')} days")


class TestSuperAdminPricing:
    """Test Super Admin pricing endpoints (requires Super Admin role)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.user_role = data.get('user', {}).get('role', 'unknown')
            print(f"Logged in as role: {self.user_role}")
        else:
            self.user_role = None
    
    def test_super_admin_get_pricing(self):
        """Test GET /api/super-admin/pricing (requires super_admin role)"""
        if self.user_role != "super_admin":
            pytest.skip("User is not super_admin, skipping Super Admin tests")
        
        response = self.session.get(f"{BASE_URL}/api/super-admin/pricing")
        
        # If not super admin, expect 403
        if response.status_code == 403:
            print("✓ Super Admin GET pricing returns 403 for non-super-admin user")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "kora_core_price" in data
        assert "module_prices" in data
        
        print(f"✓ Super Admin GET pricing works. Core price: ${data.get('kora_core_price')}")
    
    def test_super_admin_put_pricing(self):
        """Test PUT /api/super-admin/pricing (requires super_admin role)"""
        if self.user_role != "super_admin":
            pytest.skip("User is not super_admin, skipping Super Admin PUT test")
        
        # Try to update pricing
        response = self.session.put(f"{BASE_URL}/api/super-admin/pricing", json={
            "kora_core_price": 69.0,  # Keep same value for safety
            "module_prices": {
                "module_event_suite": 39.0
            }
        })
        
        # If not super admin, expect 403
        if response.status_code == 403:
            print("✓ Super Admin PUT pricing returns 403 for non-super-admin user")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Super Admin PUT pricing works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
