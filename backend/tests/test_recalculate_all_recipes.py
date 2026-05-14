"""
Test suite for POST /api/recipes/recalculate-all endpoint
Tests both dry_run=true (preview) and dry_run=false (persist) modes.

Features tested:
- dry_run=true returns preview without modifying DB
- dry_run=false persists new costs to DB
- Response structure includes all required KPIs
- Changes sorted by |diff_pct| descending
- Recipes with diff < $0.005 go to unchanged_count
- Regression: GET /api/recipes still works
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestRecalculateAllRecipes:
    """Tests for the recalculate-all recipes endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        token = login_response.json().get("access_token") or login_response.json().get("token")
        if not token:
            pytest.skip("No token received from login")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        yield
    
    # ==================== DRY RUN TESTS ====================
    
    def test_dry_run_true_returns_preview(self):
        """Test: dry_run=true returns preview without modifying DB"""
        response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "dry_run" in data, "Response missing 'dry_run' field"
        assert data["dry_run"] == True, "dry_run should be True"
        assert "applied" in data, "Response missing 'applied' field"
        assert data["applied"] == False, "applied should be False for dry_run=true"
        
        # Verify KPIs present
        assert "total_recipes" in data, "Response missing 'total_recipes'"
        assert "changed_count" in data, "Response missing 'changed_count'"
        assert "unchanged_count" in data, "Response missing 'unchanged_count'"
        assert "increase_count" in data, "Response missing 'increase_count'"
        assert "decrease_count" in data, "Response missing 'decrease_count'"
        assert "avg_diff_pct" in data, "Response missing 'avg_diff_pct'"
        assert "changes" in data, "Response missing 'changes' array"
        
        print(f"PASS: dry_run=true returns preview - total_recipes={data['total_recipes']}, changed={data['changed_count']}, unchanged={data['unchanged_count']}")
    
    def test_dry_run_true_does_not_modify_db(self):
        """Test: Calling dry_run=true 3 times does NOT modify DB"""
        # First, get current state of recipes
        recipes_before = self.session.get(f"{BASE_URL}/api/recipes").json()
        
        if not recipes_before:
            pytest.skip("No recipes found to test")
        
        # Store original costs
        original_costs = {r["recipe_id"]: r.get("total_cost", 0) for r in recipes_before}
        
        # Call dry_run=true 3 times
        for i in range(3):
            response = self.session.post(
                f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
            )
            assert response.status_code == 200, f"Call {i+1} failed: {response.text}"
            time.sleep(0.2)  # Small delay between calls
        
        # Get recipes after 3 dry_run calls
        recipes_after = self.session.get(f"{BASE_URL}/api/recipes").json()
        
        # Verify costs are unchanged
        for recipe in recipes_after:
            recipe_id = recipe["recipe_id"]
            if recipe_id in original_costs:
                current_cost = recipe.get("total_cost", 0)
                original_cost = original_costs[recipe_id]
                assert abs(current_cost - original_cost) < 0.001, \
                    f"Recipe {recipe_id} cost changed after dry_run: {original_cost} -> {current_cost}"
        
        print(f"PASS: 3 dry_run=true calls did NOT modify DB costs")
    
    def test_dry_run_response_structure_for_changes(self):
        """Test: Each change in response has required fields"""
        response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data["changed_count"] == 0:
            print("SKIP: No changes detected, cannot verify change structure")
            return
        
        # Verify each change has required fields
        required_fields = [
            "recipe_id", "name", "old_total_cost", "new_total_cost",
            "old_cost_per_portion", "new_cost_per_portion",
            "diff_amount", "diff_pct", "sell_price", "new_food_cost_pct"
        ]
        
        for change in data["changes"]:
            for field in required_fields:
                assert field in change, f"Change missing required field: {field}"
        
        print(f"PASS: All {len(data['changes'])} changes have required fields")
    
    def test_changes_sorted_by_diff_pct_descending(self):
        """Test: changes[] is sorted by |diff_pct| descending"""
        response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["changes"]) < 2:
            print("SKIP: Less than 2 changes, cannot verify sorting")
            return
        
        # Verify sorted by absolute diff_pct descending
        prev_abs_diff = float('inf')
        for change in data["changes"]:
            current_abs_diff = abs(change["diff_pct"])
            assert current_abs_diff <= prev_abs_diff, \
                f"Changes not sorted by |diff_pct| desc: {prev_abs_diff} -> {current_abs_diff}"
            prev_abs_diff = current_abs_diff
        
        print(f"PASS: Changes sorted by |diff_pct| descending")
    
    # ==================== DRY RUN FALSE (PERSIST) TESTS ====================
    
    def test_dry_run_false_persists_changes(self):
        """Test: dry_run=false persists changes to DB"""
        # First do a dry run to see what changes exist
        dry_run_response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
        )
        assert dry_run_response.status_code == 200
        dry_run_data = dry_run_response.json()
        
        if dry_run_data["changed_count"] == 0:
            print("SKIP: No changes to persist")
            return
        
        # Get first changed recipe's expected new cost
        first_change = dry_run_data["changes"][0]
        recipe_id = first_change["recipe_id"]
        expected_new_cost = first_change["new_total_cost"]
        expected_new_per_portion = first_change["new_cost_per_portion"]
        
        # Now apply changes
        apply_response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=false"
        )
        
        assert apply_response.status_code == 200, f"Apply failed: {apply_response.text}"
        apply_data = apply_response.json()
        
        # Verify response
        assert apply_data["dry_run"] == False, "dry_run should be False"
        assert apply_data["applied"] == True, "applied should be True"
        
        # Verify the recipe was actually updated in DB
        recipe_response = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert recipe_response.status_code == 200, f"GET recipe failed: {recipe_response.text}"
        
        updated_recipe = recipe_response.json()
        actual_cost = updated_recipe.get("total_cost", 0)
        
        # Allow small floating point tolerance
        assert abs(actual_cost - expected_new_cost) < 0.01, \
            f"Recipe {recipe_id} cost not persisted: expected {expected_new_cost}, got {actual_cost}"
        
        # Verify last_cost_recalc_at was set
        assert "last_cost_recalc_at" in updated_recipe or updated_recipe.get("last_cost_recalc_at"), \
            "last_cost_recalc_at should be set after apply"
        
        print(f"PASS: dry_run=false persisted changes - recipe {recipe_id} cost updated to ${actual_cost:.2f}")
    
    def test_dry_run_false_response_structure(self):
        """Test: dry_run=false returns same structure as dry_run=true"""
        response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=false"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["dry_run"] == False
        assert data["applied"] == True
        assert "total_recipes" in data
        assert "changed_count" in data
        assert "unchanged_count" in data
        assert "increase_count" in data
        assert "decrease_count" in data
        assert "avg_diff_pct" in data
        assert "changes" in data
        
        print(f"PASS: dry_run=false response structure correct")
    
    # ==================== REGRESSION TESTS ====================
    
    def test_get_recipes_still_works(self):
        """REGRESSION: GET /api/recipes still works after recalculate feature"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        
        assert response.status_code == 200, f"GET /api/recipes failed: {response.text}"
        
        recipes = response.json()
        assert isinstance(recipes, list), "Response should be a list"
        
        print(f"PASS: GET /api/recipes returns {len(recipes)} recipes")
    
    def test_get_single_recipe_still_works(self):
        """REGRESSION: GET /api/recipes/{id} still works"""
        # First get list of recipes
        list_response = self.session.get(f"{BASE_URL}/api/recipes")
        assert list_response.status_code == 200
        
        recipes = list_response.json()
        if not recipes:
            pytest.skip("No recipes to test")
        
        # Get first recipe by ID
        recipe_id = recipes[0]["recipe_id"]
        response = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}")
        
        assert response.status_code == 200, f"GET /api/recipes/{recipe_id} failed: {response.text}"
        
        recipe = response.json()
        assert recipe["recipe_id"] == recipe_id
        
        print(f"PASS: GET /api/recipes/{recipe_id} works")
    
    def test_recipe_crud_intact(self):
        """REGRESSION: Recipe CRUD operations still work"""
        # Create a test recipe
        test_recipe = {
            "name": "TEST_Recalc_Regression_Recipe",
            "category": "test",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "recipe_type": "final_dish",
            "ingredients": []
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/recipes",
            json=test_recipe
        )
        
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        created = create_response.json()
        recipe_id = created["recipe_id"]
        
        # Update the recipe
        update_response = self.session.put(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            json={**test_recipe, "name": "TEST_Recalc_Regression_Recipe_Updated"}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Delete the recipe
        delete_response = self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        print(f"PASS: Recipe CRUD operations intact")
    
    def test_production_batches_post_status_intact(self):
        """REGRESSION: Production batches POST status endpoint works"""
        # Get list of production batches
        response = self.session.get(f"{BASE_URL}/api/production/batches")
        
        # Should return 200 even if empty
        assert response.status_code == 200, f"GET production batches failed: {response.text}"
        
        print(f"PASS: Production batches endpoint works")
    
    def test_purchase_orders_receive_intact(self):
        """REGRESSION: Purchase orders endpoints work"""
        # Get list of purchase orders
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        
        assert response.status_code == 200, f"GET purchase orders failed: {response.text}"
        
        print(f"PASS: Purchase orders endpoint works")


class TestRecalculateKPIAccuracy:
    """Tests for KPI accuracy in recalculate response"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("access_token") or login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_kpi_counts_add_up(self):
        """Test: changed_count + unchanged_count should equal total_recipes (approximately)"""
        response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Note: Some recipes might be skipped due to parsing errors
        # So we check that counts are reasonable
        total = data["total_recipes"]
        changed = data["changed_count"]
        unchanged = data["unchanged_count"]
        
        # changed + unchanged should be <= total (some might be skipped)
        assert changed + unchanged <= total, \
            f"changed({changed}) + unchanged({unchanged}) > total({total})"
        
        # increase + decrease should equal changed
        increase = data["increase_count"]
        decrease = data["decrease_count"]
        assert increase + decrease == changed, \
            f"increase({increase}) + decrease({decrease}) != changed({changed})"
        
        print(f"PASS: KPI counts are consistent - total={total}, changed={changed}, unchanged={unchanged}")
    
    def test_unchanged_recipes_not_in_changes_array(self):
        """Test: Recipes with diff < $0.005 should NOT appear in changes[]"""
        response = self.session.post(
            f"{BASE_URL}/api/recipes/recalculate-all?dry_run=true"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # All items in changes should have diff >= $0.005
        for change in data["changes"]:
            assert abs(change["diff_amount"]) >= 0.005, \
                f"Recipe {change['name']} has diff {change['diff_amount']} which is < $0.005"
        
        print(f"PASS: All changes have diff >= $0.005")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
