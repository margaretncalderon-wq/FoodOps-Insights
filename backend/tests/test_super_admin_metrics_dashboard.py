"""
Super Admin Metrics Dashboard Tests
Testing: GET /api/super-admin/metrics/dashboard
Features:
- MRR calculation from active modules
- Organizations by industry breakdown
- Revenue by module with subscriptions count
- Conversion rate calculation
- New orgs/users this month
- Recent transactions list
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestSuperAdminMetricsDashboard:
    """Tests for Super Admin Metrics Dashboard endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as super admin and get auth cookie"""
        self.session = requests.Session()
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        
        # Verify user is super admin
        me_res = self.session.get(f"{BASE_URL}/api/auth/me")
        assert me_res.status_code == 200
        user_data = me_res.json()
        assert user_data.get("is_super_admin") == True, "User is not a super admin"

    def test_metrics_dashboard_returns_200(self):
        """Test: GET /api/super-admin/metrics/dashboard returns 200"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data is not None, "Response should not be None"
        print(f"✓ Metrics dashboard endpoint returns 200")
    
    def test_metrics_dashboard_mrr_structure(self):
        """Test: MRR section has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check MRR structure
        assert "mrr" in data, "Response missing 'mrr' field"
        mrr = data["mrr"]
        assert "total" in mrr, "MRR missing 'total' field"
        assert "currency" in mrr, "MRR missing 'currency' field"
        assert mrr["currency"] == "USD", f"Expected USD currency, got {mrr['currency']}"
        assert isinstance(mrr["total"], (int, float)), "MRR total should be numeric"
        assert mrr["total"] >= 0, "MRR total should be non-negative"
        print(f"✓ MRR structure is correct - Total: ${mrr['total']}")
    
    def test_metrics_dashboard_organizations_structure(self):
        """Test: Organizations section has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check organizations structure
        assert "organizations" in data, "Response missing 'organizations' field"
        orgs = data["organizations"]
        
        required_fields = ["total", "active", "paying", "free", "new_this_month"]
        for field in required_fields:
            assert field in orgs, f"Organizations missing '{field}' field"
            assert isinstance(orgs[field], (int, float)), f"Organizations.{field} should be numeric"
        
        # Logical checks
        assert orgs["paying"] + orgs["free"] == orgs["total"], \
            f"paying ({orgs['paying']}) + free ({orgs['free']}) should equal total ({orgs['total']})"
        assert orgs["active"] <= orgs["total"], "Active orgs should be <= total orgs"
        
        print(f"✓ Organizations structure correct - Total: {orgs['total']}, Paying: {orgs['paying']}, Active: {orgs['active']}")
    
    def test_metrics_dashboard_by_industry(self):
        """Test: Organizations by industry breakdown"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check by_industry structure
        assert "by_industry" in data, "Response missing 'by_industry' field"
        by_industry = data["by_industry"]
        
        expected_industries = ["events_hospitality", "professional_services", "generic", "not_set"]
        for industry in expected_industries:
            assert industry in by_industry, f"by_industry missing '{industry}' field"
            assert isinstance(by_industry[industry], int), f"by_industry.{industry} should be integer"
        
        # Sum should match or be close to total orgs
        industry_sum = sum(by_industry.values())
        total_orgs = data["organizations"]["total"]
        assert industry_sum == total_orgs, \
            f"Sum of by_industry ({industry_sum}) should equal total orgs ({total_orgs})"
        
        print(f"✓ Organizations by industry: {by_industry}")
    
    def test_metrics_dashboard_modules_structure(self):
        """Test: Modules section has correct structure with revenue data"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check modules structure
        assert "modules" in data, "Response missing 'modules' field"
        modules = data["modules"]
        
        assert "revenue_by_module" in modules, "Modules missing 'revenue_by_module' field"
        assert "top_modules" in modules, "Modules missing 'top_modules' field"
        assert "total_active_subscriptions" in modules, "Modules missing 'total_active_subscriptions' field"
        
        assert isinstance(modules["revenue_by_module"], list), "revenue_by_module should be a list"
        assert isinstance(modules["total_active_subscriptions"], int), "total_active_subscriptions should be integer"
        
        print(f"✓ Modules structure correct - Active subscriptions: {modules['total_active_subscriptions']}")
    
    def test_metrics_dashboard_revenue_by_module_items(self):
        """Test: Each module in revenue_by_module has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        revenue_by_module = data.get("modules", {}).get("revenue_by_module", [])
        
        for mod in revenue_by_module:
            assert "addon_id" in mod, f"Module missing 'addon_id': {mod}"
            assert "name" in mod, f"Module missing 'name': {mod}"
            assert "monthly_revenue" in mod, f"Module missing 'monthly_revenue': {mod}"
            assert "active_subscriptions" in mod, f"Module missing 'active_subscriptions': {mod}"
            
            assert isinstance(mod["monthly_revenue"], (int, float)), "monthly_revenue should be numeric"
            assert isinstance(mod["active_subscriptions"], int), "active_subscriptions should be integer"
            assert mod["active_subscriptions"] >= 0, "active_subscriptions should be non-negative"
        
        print(f"✓ Revenue by module items structure verified - {len(revenue_by_module)} modules")
        for mod in revenue_by_module:
            print(f"  - {mod['name']}: ${mod['monthly_revenue']} ({mod['active_subscriptions']} subs)")
    
    def test_metrics_dashboard_mrr_calculation(self):
        """Test: MRR equals sum of module revenues"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        mrr_total = data.get("mrr", {}).get("total", 0)
        revenue_by_module = data.get("modules", {}).get("revenue_by_module", [])
        
        calculated_mrr = sum(mod.get("monthly_revenue", 0) for mod in revenue_by_module)
        
        assert mrr_total == calculated_mrr, \
            f"MRR total ({mrr_total}) should equal sum of module revenues ({calculated_mrr})"
        
        print(f"✓ MRR calculation verified: ${mrr_total} = sum of module revenues")
    
    def test_metrics_dashboard_conversion_structure(self):
        """Test: Conversion section has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check conversion structure
        assert "conversion" in data, "Response missing 'conversion' field"
        conversion = data["conversion"]
        
        required_fields = ["rate", "paid_transactions", "pending_transactions"]
        for field in required_fields:
            assert field in conversion, f"Conversion missing '{field}' field"
        
        # Rate should be a percentage (0-100)
        assert 0 <= conversion["rate"] <= 100, f"Conversion rate ({conversion['rate']}) should be 0-100"
        assert isinstance(conversion["paid_transactions"], int), "paid_transactions should be integer"
        assert isinstance(conversion["pending_transactions"], int), "pending_transactions should be integer"
        
        print(f"✓ Conversion structure correct - Rate: {conversion['rate']}%, Paid: {conversion['paid_transactions']}, Pending: {conversion['pending_transactions']}")
    
    def test_metrics_dashboard_conversion_rate_calculation(self):
        """Test: Conversion rate calculation is correct"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        total_orgs = data.get("organizations", {}).get("total", 0)
        paying_customers = data.get("organizations", {}).get("paying", 0)
        reported_rate = data.get("conversion", {}).get("rate", 0)
        
        if total_orgs > 0:
            calculated_rate = round(paying_customers / total_orgs * 100, 1)
            assert reported_rate == calculated_rate, \
                f"Conversion rate ({reported_rate}) should equal calculated ({calculated_rate})"
        
        print(f"✓ Conversion rate calculation verified: {paying_customers}/{total_orgs} = {reported_rate}%")
    
    def test_metrics_dashboard_users_structure(self):
        """Test: Users section has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check users structure
        assert "users" in data, "Response missing 'users' field"
        users = data["users"]
        
        assert "total" in users, "Users missing 'total' field"
        assert "new_this_month" in users, "Users missing 'new_this_month' field"
        assert isinstance(users["total"], int), "users.total should be integer"
        assert isinstance(users["new_this_month"], int), "users.new_this_month should be integer"
        assert users["new_this_month"] >= 0, "new_this_month should be non-negative"
        
        print(f"✓ Users structure correct - Total: {users['total']}, New this month: {users['new_this_month']}")
    
    def test_metrics_dashboard_recent_transactions_structure(self):
        """Test: Recent transactions section has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check recent_transactions structure
        assert "recent_transactions" in data, "Response missing 'recent_transactions' field"
        transactions = data["recent_transactions"]
        
        assert isinstance(transactions, list), "recent_transactions should be a list"
        assert len(transactions) <= 10, "recent_transactions should have max 10 items"
        
        for tx in transactions:
            assert "transaction_id" in tx, f"Transaction missing 'transaction_id': {tx}"
            assert "amount" in tx, f"Transaction missing 'amount': {tx}"
            assert "user_email" in tx, f"Transaction missing 'user_email': {tx}"
            assert "created_at" in tx, f"Transaction missing 'created_at': {tx}"
            
            assert isinstance(tx["amount"], (int, float)), "Transaction amount should be numeric"
        
        print(f"✓ Recent transactions structure correct - {len(transactions)} transactions")
        for tx in transactions:
            print(f"  - {tx['user_email']}: ${tx['amount']} ({tx.get('payment_type', 'unknown')})")
    
    def test_metrics_dashboard_growth_metrics(self):
        """Test: Growth metrics (new orgs/users this month) are reasonable"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        new_orgs = data.get("organizations", {}).get("new_this_month", 0)
        new_users = data.get("users", {}).get("new_this_month", 0)
        total_orgs = data.get("organizations", {}).get("total", 0)
        total_users = data.get("users", {}).get("total", 0)
        
        # New should not exceed total
        assert new_orgs <= total_orgs, f"New orgs ({new_orgs}) should not exceed total ({total_orgs})"
        assert new_users <= total_users, f"New users ({new_users}) should not exceed total ({total_users})"
        
        print(f"✓ Growth metrics reasonable - New orgs: {new_orgs}/{total_orgs}, New users: {new_users}/{total_users}")
    
    def test_metrics_dashboard_unauthorized_access(self):
        """Test: Non-super-admin cannot access metrics dashboard"""
        # Create new session without auth
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 401, f"Expected 401 for unauthorized access, got {response.status_code}"
        print("✓ Unauthorized access correctly returns 401")


class TestMetricsDashboardUIIntegration:
    """Tests to verify metrics data matches what UI expects"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as super admin"""
        self.session = requests.Session()
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_res.status_code == 200

    def test_all_ui_required_fields_present(self):
        """Test: All fields used by SuperAdminOverview.js are present"""
        response = self.session.get(f"{BASE_URL}/api/super-admin/metrics/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # KPI Cards
        assert data.get("mrr", {}).get("total") is not None, "mrr.total required for MRR card"
        assert data.get("organizations", {}).get("paying") is not None, "organizations.paying required"
        assert data.get("organizations", {}).get("total") is not None, "organizations.total required"
        assert data.get("conversion", {}).get("rate") is not None, "conversion.rate required"
        assert data.get("modules", {}).get("total_active_subscriptions") is not None, "modules.total_active_subscriptions required"
        
        # Growth stats
        assert data.get("organizations", {}).get("new_this_month") is not None, "organizations.new_this_month required"
        assert data.get("users", {}).get("new_this_month") is not None, "users.new_this_month required"
        assert data.get("users", {}).get("total") is not None, "users.total required"
        
        # Charts
        assert data.get("by_industry") is not None, "by_industry required for industry chart"
        assert data.get("modules", {}).get("revenue_by_module") is not None, "modules.revenue_by_module required"
        
        # Summary stats
        assert data.get("organizations", {}).get("active") is not None, "organizations.active required"
        assert data.get("conversion", {}).get("paid_transactions") is not None, "conversion.paid_transactions required"
        assert data.get("conversion", {}).get("pending_transactions") is not None, "conversion.pending_transactions required"
        
        # Recent transactions
        assert data.get("recent_transactions") is not None, "recent_transactions required"
        
        print("✓ All UI-required fields are present in API response")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
