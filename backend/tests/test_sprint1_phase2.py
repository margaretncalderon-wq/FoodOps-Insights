"""
Sprint 1 Phase 2 - Culinary Intelligence Tests
P1-D: Plated Menu Cost Staleness
P1-B: Filterable Recipe Tags (backend regression)
P1-C: Recipe Scaling Panel (backend regression)

Tests:
- GET /api/plated-menus/{menu_id}/staleness
- POST /api/plated-menus/{menu_id}/refresh-costs
- GET /api/plated-menus (regression)
- GET /api/plated-menus/{id} (regression)
- POST /api/plated-menus (regression)
- GET /api/recipes (regression)
- POST /api/recipes/{id}/scale (regression)
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "pamemey27@gmail.com"
ADMIN_PASSWORD = "Evoque2024!"
ALT_EMAIL = "demo.agency@kora.com"
ALT_PASSWORD = "Evoque2024!"


class TestSprint1Phase2:
    """Sprint 1 Phase 2 - Culinary Intelligence Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.user = None
        
    def login(self, email=ADMIN_EMAIL, password=ADMIN_PASSWORD):
        """Login and get auth token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user = data.get("user")
            self.session.cookies.set("token", self.token)
            return True
        return False
    
    # ==================== P1-D: Plated Menu Cost Staleness ====================
    
    def test_login_admin_user(self):
        """Test admin login with food-ops module enabled"""
        result = self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert result, f"Login failed for {ADMIN_EMAIL}"
        print(f"✓ Login successful for {ADMIN_EMAIL}")
        print(f"  User: {self.user.get('name')} ({self.user.get('email')})")
        print(f"  Company: {self.user.get('company_id')}")
    
    def test_get_plated_menus_list(self):
        """Test GET /api/plated-menus returns list of menus"""
        assert self.login(), "Login required"
        
        response = self.session.get(f"{BASE_URL}/api/plated-menus")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        menus = response.json()
        assert isinstance(menus, list), "Expected list of menus"
        print(f"✓ GET /api/plated-menus returned {len(menus)} menus")
        
        if menus:
            menu = menus[0]
            print(f"  Sample menu: {menu.get('name')} (ID: {menu.get('menu_id')})")
            print(f"  Cost/guest: ${menu.get('cost_per_guest', 0):.2f}")
    
    def test_get_plated_menu_staleness_success(self):
        """Test GET /api/plated-menus/{menu_id}/staleness returns staleness info"""
        assert self.login(), "Login required"
        
        # First get a menu
        menus_response = self.session.get(f"{BASE_URL}/api/plated-menus")
        assert menus_response.status_code == 200
        menus = menus_response.json()
        
        if not menus:
            pytest.skip("No plated menus available for testing")
        
        menu_id = menus[0].get("menu_id")
        
        # Get staleness
        response = self.session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/staleness")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "menu_id" in data, "Missing menu_id"
        assert "is_stale" in data, "Missing is_stale"
        assert "severity" in data, "Missing severity"
        assert "snapshot_cost_per_guest" in data, "Missing snapshot_cost_per_guest"
        assert "live_cost_per_guest" in data, "Missing live_cost_per_guest"
        assert "drift_percent" in data, "Missing drift_percent"
        assert "drift_amount" in data, "Missing drift_amount"
        assert "affected_recipes" in data, "Missing affected_recipes"
        assert "last_updated" in data, "Missing last_updated"
        
        # Validate severity values
        assert data["severity"] in ["ok", "warn", "critical"], f"Invalid severity: {data['severity']}"
        
        print(f"✓ GET /api/plated-menus/{menu_id}/staleness")
        print(f"  Menu: {data.get('name')}")
        print(f"  Is stale: {data['is_stale']}")
        print(f"  Severity: {data['severity']}")
        print(f"  Snapshot cost: ${data['snapshot_cost_per_guest']:.2f}")
        print(f"  Live cost: ${data['live_cost_per_guest']:.2f}")
        print(f"  Drift: {data['drift_percent']:.1f}% (${data['drift_amount']:.2f})")
        print(f"  Affected recipes: {len(data['affected_recipes'])}")
    
    def test_get_plated_menu_staleness_404(self):
        """Test GET /api/plated-menus/{menu_id}/staleness returns 404 for non-existent menu"""
        assert self.login(), "Login required"
        
        fake_menu_id = "pmenu_nonexistent_12345"
        response = self.session.get(f"{BASE_URL}/api/plated-menus/{fake_menu_id}/staleness")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ GET /api/plated-menus/{fake_menu_id}/staleness returns 404 as expected")
    
    def test_get_plated_menu_staleness_requires_auth(self):
        """Test GET /api/plated-menus/{menu_id}/staleness requires authentication"""
        # Don't login - use fresh session
        fresh_session = requests.Session()
        
        response = fresh_session.get(f"{BASE_URL}/api/plated-menus/pmenu_test/staleness")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Staleness endpoint requires authentication (got {response.status_code})")
    
    def test_post_refresh_costs_success(self):
        """Test POST /api/plated-menus/{menu_id}/refresh-costs updates costs"""
        assert self.login(), "Login required"
        
        # First get a menu
        menus_response = self.session.get(f"{BASE_URL}/api/plated-menus")
        assert menus_response.status_code == 200
        menus = menus_response.json()
        
        if not menus:
            pytest.skip("No plated menus available for testing")
        
        menu_id = menus[0].get("menu_id")
        old_cost = menus[0].get("cost_per_guest", 0)
        
        # Refresh costs
        response = self.session.post(f"{BASE_URL}/api/plated-menus/{menu_id}/refresh-costs")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "menu_id" in data, "Missing menu_id"
        assert "cost_per_guest" in data, "Missing cost_per_guest"
        assert "cost_with_buffer" in data, "Missing cost_with_buffer"
        assert "updated_at" in data, "Missing updated_at"
        
        print(f"✓ POST /api/plated-menus/{menu_id}/refresh-costs")
        print(f"  Old cost: ${old_cost:.2f}")
        print(f"  New cost: ${data['cost_per_guest']:.2f}")
        print(f"  With buffer: ${data['cost_with_buffer']:.2f}")
        print(f"  Updated at: {data['updated_at']}")
    
    def test_refresh_costs_then_staleness_is_ok(self):
        """Test that after refresh, staleness returns is_stale=false and severity=ok"""
        assert self.login(), "Login required"
        
        # First get a menu
        menus_response = self.session.get(f"{BASE_URL}/api/plated-menus")
        assert menus_response.status_code == 200
        menus = menus_response.json()
        
        if not menus:
            pytest.skip("No plated menus available for testing")
        
        menu_id = menus[0].get("menu_id")
        
        # Refresh costs
        refresh_response = self.session.post(f"{BASE_URL}/api/plated-menus/{menu_id}/refresh-costs")
        assert refresh_response.status_code == 200
        
        # Check staleness
        staleness_response = self.session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/staleness")
        assert staleness_response.status_code == 200
        
        data = staleness_response.json()
        
        # After refresh, drift should be ~0
        assert data["severity"] == "ok", f"Expected severity=ok after refresh, got {data['severity']}"
        assert abs(data["drift_percent"]) < 2, f"Expected drift_percent ~0 after refresh, got {data['drift_percent']}"
        
        print(f"✓ After refresh, staleness shows:")
        print(f"  is_stale: {data['is_stale']}")
        print(f"  severity: {data['severity']}")
        print(f"  drift_percent: {data['drift_percent']:.2f}%")
    
    def test_post_refresh_costs_404(self):
        """Test POST /api/plated-menus/{menu_id}/refresh-costs returns 404 for non-existent menu"""
        assert self.login(), "Login required"
        
        fake_menu_id = "pmenu_nonexistent_12345"
        response = self.session.post(f"{BASE_URL}/api/plated-menus/{fake_menu_id}/refresh-costs")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ POST /api/plated-menus/{fake_menu_id}/refresh-costs returns 404 as expected")
    
    def test_post_refresh_costs_requires_auth(self):
        """Test POST /api/plated-menus/{menu_id}/refresh-costs requires authentication"""
        fresh_session = requests.Session()
        
        response = fresh_session.post(f"{BASE_URL}/api/plated-menus/pmenu_test/refresh-costs")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Refresh costs endpoint requires authentication (got {response.status_code})")
    
    # ==================== Regression Tests ====================
    
    def test_get_plated_menu_by_id(self):
        """Test GET /api/plated-menus/{id} returns single menu"""
        assert self.login(), "Login required"
        
        # First get list
        menus_response = self.session.get(f"{BASE_URL}/api/plated-menus")
        assert menus_response.status_code == 200
        menus = menus_response.json()
        
        if not menus:
            pytest.skip("No plated menus available for testing")
        
        menu_id = menus[0].get("menu_id")
        
        # Get single menu
        response = self.session.get(f"{BASE_URL}/api/plated-menus/{menu_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("menu_id") == menu_id
        print(f"✓ GET /api/plated-menus/{menu_id} returns menu: {data.get('name')}")
    
    def test_get_recipes_list(self):
        """Test GET /api/recipes returns list of recipes"""
        assert self.login(), "Login required"
        
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        recipes = response.json()
        assert isinstance(recipes, list), "Expected list of recipes"
        print(f"✓ GET /api/recipes returned {len(recipes)} recipes")
        
        if recipes:
            recipe = recipes[0]
            print(f"  Sample recipe: {recipe.get('name')} (ID: {recipe.get('recipe_id')})")
            print(f"  Category: {recipe.get('category')}")
            print(f"  Dietary tags: {recipe.get('dietary_tags', [])}")
            print(f"  Allergens: {recipe.get('allergens', [])}")
    
    def test_recipe_scale_endpoint(self):
        """Test POST /api/recipes/{id}/scale returns scaled ingredients"""
        assert self.login(), "Login required"
        
        # First get a recipe
        recipes_response = self.session.get(f"{BASE_URL}/api/recipes")
        assert recipes_response.status_code == 200
        recipes = recipes_response.json()
        
        if not recipes:
            pytest.skip("No recipes available for testing")
        
        # Find a recipe with ingredients
        recipe = None
        for r in recipes:
            if r.get("ingredients") and len(r.get("ingredients", [])) > 0:
                recipe = r
                break
        
        if not recipe:
            pytest.skip("No recipes with ingredients available for testing")
        
        recipe_id = recipe.get("recipe_id")
        
        # Scale recipe
        response = self.session.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 10}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "recipe_id" in data, "Missing recipe_id"
        assert "scale_factor" in data, "Missing scale_factor"
        assert "ingredients" in data, "Missing ingredients"
        assert "total_cost_scaled" in data, "Missing total_cost_scaled"
        assert "cost_per_portion_scaled" in data, "Missing cost_per_portion_scaled"
        
        print(f"✓ POST /api/recipes/{recipe_id}/scale")
        print(f"  Recipe: {recipe.get('name')}")
        print(f"  Scale factor: {data['scale_factor']}")
        print(f"  Total cost scaled: ${data['total_cost_scaled']:.2f}")
        print(f"  Cost per portion: ${data['cost_per_portion_scaled']:.2f}")
        print(f"  Ingredients: {len(data['ingredients'])}")
    
    # ==================== Alternative User Tests ====================
    
    def test_staleness_with_alt_user(self):
        """Test staleness endpoint with alternative user (demo.agency@kora.com)"""
        assert self.login(ALT_EMAIL, ALT_PASSWORD), f"Login failed for {ALT_EMAIL}"
        
        # Get menus
        menus_response = self.session.get(f"{BASE_URL}/api/plated-menus")
        assert menus_response.status_code == 200
        menus = menus_response.json()
        
        print(f"✓ Alternative user {ALT_EMAIL} can access plated menus")
        print(f"  Found {len(menus)} menus")
        
        if menus:
            menu_id = menus[0].get("menu_id")
            staleness_response = self.session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/staleness")
            assert staleness_response.status_code == 200
            print(f"  Staleness check successful for menu {menu_id}")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
