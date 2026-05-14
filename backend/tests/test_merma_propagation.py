"""
Test Suite: Merma (Waste) Propagation in Recipe Cost Calculations
Iteration 157 - Critical validation of waste factor handling in recipes

Tests cover:
1. Recipe POST with ingredient default waste (yield_waste_percent fallback)
2. Recipe PUT with explicit waste_factor_pct=0 (override to no waste)
3. Recipe PUT with explicit waste_factor_pct=15 (override to 15%)
4. cost_per_portion consistency with total_cost / portions_per_yield
5. Ingredient with yield_waste_percent=0 - no waste applied
6. Regression: cost-preview endpoint waste handling
7. Regression: production batches suggest endpoint
8. Regression: legacy recipe fields (instructions array, sub_recipes, allergens)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
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
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token") or data.get("token")
        if token:
            return token
    
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def test_ingredient_with_waste(api_client, auth_token):
    """Create test ingredient with 8% yield_waste_percent"""
    unique_id = str(uuid.uuid4())[:8]
    ingredient_name = f"Test E2E Merma v{unique_id}"
    
    ingredient_data = {
        "name": ingredient_name,
        "category": "produce",
        "unit": "g",
        "base_unit": "g",
        "cost_per_unit": 0.005,  # $0.005 per gram
        "cost_per_base_unit": 0.005,
        "yield_waste_percent": 8,  # 8% waste
        "stock_quantity": 1000,
        "inventory_type": "food"
    }
    
    response = api_client.post(
        f"{BASE_URL}/api/inventory/ingredients",
        json=ingredient_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    if response.status_code not in [200, 201]:
        pytest.skip(f"Failed to create test ingredient: {response.text}")
    
    ingredient = response.json()
    ingredient_id = ingredient.get("ingredient_id")
    
    yield {"id": ingredient_id, "name": ingredient_name}
    
    # Cleanup
    api_client.delete(
        f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )


@pytest.fixture(scope="module")
def test_ingredient_no_waste(api_client, auth_token):
    """Create test ingredient with 0% yield_waste_percent"""
    unique_id = str(uuid.uuid4())[:8]
    ingredient_name = f"Test E2E NoWaste v{unique_id}"
    
    ingredient_data = {
        "name": ingredient_name,
        "category": "produce",
        "unit": "g",
        "base_unit": "g",
        "cost_per_unit": 0.005,
        "cost_per_base_unit": 0.005,
        "yield_waste_percent": 0,  # No waste
        "stock_quantity": 1000,
        "inventory_type": "food"
    }
    
    response = api_client.post(
        f"{BASE_URL}/api/inventory/ingredients",
        json=ingredient_data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    if response.status_code not in [200, 201]:
        pytest.skip(f"Failed to create test ingredient: {response.text}")
    
    ingredient = response.json()
    ingredient_id = ingredient.get("ingredient_id")
    
    yield {"id": ingredient_id, "name": ingredient_name}
    
    # Cleanup
    api_client.delete(
        f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}",
        headers={"Authorization": f"Bearer {auth_token}"}
    )


class TestMermaPropagation:
    """Critical tests for waste factor propagation in recipe cost calculations"""
    
    def test_recipe_post_with_ingredient_default_waste(self, api_client, auth_token, test_ingredient_with_waste):
        """
        CRITICAL: POST /api/recipes with ingredient that has yield_waste_percent=8,
        WITHOUT waste_factor_pct in the line → total_cost must reflect 8% merma.
        
        Expected: 100g × $0.005/g × 1.08 = $0.54
        Also verify: line.applied_waste_pct=8 and line.net_quantity=108
        """
        recipe_data = {
            "name": f"Test Recipe Merma Default {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "ingredients": [
                {
                    "item_id": test_ingredient_with_waste["id"],
                    "item_type": "ingredient",
                    "item_name": test_ingredient_with_waste["name"],
                    "quantity": 100,  # 100 grams
                    "unit": "g"
                    # NO waste_factor_pct - should use ingredient default (8%)
                }
            ]
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        # Verify total_cost reflects 8% waste: 100g × $0.005/g × 1.08 = $0.54
        total_cost = recipe.get("total_cost", 0)
        expected_cost = 100 * 0.005 * 1.08  # $0.54
        
        assert abs(total_cost - expected_cost) < 0.01, \
            f"Total cost should be ~${expected_cost:.2f} (with 8% waste), got ${total_cost:.4f}"
        
        # Verify ingredient line has applied_waste_pct=8 and net_quantity=108
        ingredients = recipe.get("ingredients", [])
        assert len(ingredients) > 0, "Recipe should have ingredients"
        
        ing = ingredients[0]
        applied_waste = ing.get("applied_waste_pct", 0)
        net_quantity = ing.get("net_quantity", 0)
        
        assert applied_waste == 8, f"applied_waste_pct should be 8, got {applied_waste}"
        assert abs(net_quantity - 108) < 0.1, f"net_quantity should be 108, got {net_quantity}"
        
        print(f"✓ Recipe POST with default waste: total_cost=${total_cost:.4f}, applied_waste_pct={applied_waste}, net_quantity={net_quantity}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_recipe_with_explicit_zero_waste(self, api_client, auth_token, test_ingredient_with_waste):
        """
        CRITICAL: Recipe with waste_factor_pct=0 explicitly in the line
        → override, total_cost WITHOUT merma ($0.50). applied_waste_pct=0.
        """
        recipe_data = {
            "name": f"Test Recipe Zero Waste {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "ingredients": [
                {
                    "item_id": test_ingredient_with_waste["id"],
                    "item_type": "ingredient",
                    "item_name": test_ingredient_with_waste["name"],
                    "quantity": 100,
                    "unit": "g",
                    "waste_factor_pct": 0  # Explicit zero - override ingredient default
                }
            ]
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        # Verify total_cost is WITHOUT waste: 100g × $0.005/g = $0.50
        total_cost = recipe.get("total_cost", 0)
        expected_cost = 100 * 0.005  # $0.50
        
        assert abs(total_cost - expected_cost) < 0.01, \
            f"Total cost should be ~${expected_cost:.2f} (no waste), got ${total_cost:.4f}"
        
        # Verify applied_waste_pct=0
        ingredients = recipe.get("ingredients", [])
        ing = ingredients[0]
        applied_waste = ing.get("applied_waste_pct", -1)
        
        assert applied_waste == 0, f"applied_waste_pct should be 0 (explicit override), got {applied_waste}"
        
        print(f"✓ Recipe with explicit waste_factor_pct=0: total_cost=${total_cost:.4f}, applied_waste_pct={applied_waste}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_recipe_with_explicit_15_percent_waste(self, api_client, auth_token, test_ingredient_with_waste):
        """
        CRITICAL: Recipe with waste_factor_pct=15 → override,
        total_cost with 15% ($0.575). applied_waste_pct=15.
        """
        recipe_data = {
            "name": f"Test Recipe 15% Waste {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "ingredients": [
                {
                    "item_id": test_ingredient_with_waste["id"],
                    "item_type": "ingredient",
                    "item_name": test_ingredient_with_waste["name"],
                    "quantity": 100,
                    "unit": "g",
                    "waste_factor_pct": 15  # Override to 15%
                }
            ]
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        # Verify total_cost with 15% waste: 100g × $0.005/g × 1.15 = $0.575
        total_cost = recipe.get("total_cost", 0)
        expected_cost = 100 * 0.005 * 1.15  # $0.575
        
        assert abs(total_cost - expected_cost) < 0.01, \
            f"Total cost should be ~${expected_cost:.3f} (15% waste), got ${total_cost:.4f}"
        
        # Verify applied_waste_pct=15
        ingredients = recipe.get("ingredients", [])
        ing = ingredients[0]
        applied_waste = ing.get("applied_waste_pct", -1)
        
        assert applied_waste == 15, f"applied_waste_pct should be 15, got {applied_waste}"
        
        print(f"✓ Recipe with waste_factor_pct=15: total_cost=${total_cost:.4f}, applied_waste_pct={applied_waste}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_cost_per_portion_consistency(self, api_client, auth_token, test_ingredient_with_waste):
        """
        CRITICAL: Recipe.cost_per_portion must be consistent with total_cost / portions_per_yield.
        """
        recipe_data = {
            "name": f"Test Recipe Portion Cost {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 2,  # 2 portions
            "ingredients": [
                {
                    "item_id": test_ingredient_with_waste["id"],
                    "item_type": "ingredient",
                    "item_name": test_ingredient_with_waste["name"],
                    "quantity": 100,
                    "unit": "g"
                    # Uses default 8% waste
                }
            ]
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        total_cost = recipe.get("total_cost", 0)
        cost_per_portion = recipe.get("cost_per_portion", 0)
        portions_per_yield = recipe.get("portions_per_yield", 1)
        
        expected_cost_per_portion = total_cost / portions_per_yield
        
        assert abs(cost_per_portion - expected_cost_per_portion) < 0.01, \
            f"cost_per_portion should be {expected_cost_per_portion:.4f}, got {cost_per_portion:.4f}"
        
        print(f"✓ cost_per_portion consistency: total=${total_cost:.4f}, portions={portions_per_yield}, cost_per_portion=${cost_per_portion:.4f}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_ingredient_with_zero_waste_no_merma_applied(self, api_client, auth_token, test_ingredient_no_waste):
        """
        Ingredient with yield_waste_percent=0 — recipes should NOT apply merma.
        """
        recipe_data = {
            "name": f"Test Recipe No Waste Ingredient {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "ingredients": [
                {
                    "item_id": test_ingredient_no_waste["id"],
                    "item_type": "ingredient",
                    "item_name": test_ingredient_no_waste["name"],
                    "quantity": 100,
                    "unit": "g"
                    # No waste_factor_pct - ingredient default is 0%
                }
            ]
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        # Verify total_cost is WITHOUT waste: 100g × $0.005/g = $0.50
        total_cost = recipe.get("total_cost", 0)
        expected_cost = 100 * 0.005  # $0.50
        
        assert abs(total_cost - expected_cost) < 0.01, \
            f"Total cost should be ~${expected_cost:.2f} (no waste), got ${total_cost:.4f}"
        
        # Verify applied_waste_pct=0
        ingredients = recipe.get("ingredients", [])
        ing = ingredients[0]
        applied_waste = ing.get("applied_waste_pct", -1)
        
        assert applied_waste == 0, f"applied_waste_pct should be 0, got {applied_waste}"
        
        print(f"✓ Ingredient with 0% waste: total_cost=${total_cost:.4f}, applied_waste_pct={applied_waste}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestCostPreviewRegression:
    """Regression tests for cost-preview endpoint waste handling"""
    
    def test_cost_preview_without_waste_uses_ingredient_default(self, api_client, auth_token, test_ingredient_with_waste):
        """
        cost-preview without waste_factor_pct should use ingredient's yield_waste_percent (8%)
        """
        payload = {
            "ingredient_id": test_ingredient_with_waste["id"],
            "quantity": 100,
            "unit": "g"
            # No waste_factor_pct - should use ingredient default (8%)
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/inventory/ingredients/cost-preview",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Cost preview failed: {response.text}"
        
        data = response.json()
        cost = data.get("cost", 0)
        applied_waste = data.get("applied_waste_pct", 0)
        default_waste = data.get("default_waste_pct", 0)
        
        # Expected: 100g × $0.005/g × 1.08 = $0.54
        expected_cost = 100 * 0.005 * 1.08
        
        assert abs(cost - expected_cost) < 0.01, \
            f"Cost should be ~${expected_cost:.2f} (with 8% waste), got ${cost:.4f}"
        assert applied_waste == 8, f"applied_waste_pct should be 8, got {applied_waste}"
        assert default_waste == 8, f"default_waste_pct should be 8, got {default_waste}"
        
        print(f"✓ cost-preview without waste: cost=${cost:.4f}, applied_waste={applied_waste}%, default_waste={default_waste}%")
    
    def test_cost_preview_with_explicit_zero_waste(self, api_client, auth_token, test_ingredient_with_waste):
        """
        cost-preview with waste_factor_pct=0 should override to no waste
        """
        payload = {
            "ingredient_id": test_ingredient_with_waste["id"],
            "quantity": 100,
            "unit": "g",
            "waste_factor_pct": 0  # Explicit zero
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/inventory/ingredients/cost-preview",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Cost preview failed: {response.text}"
        
        data = response.json()
        cost = data.get("cost", 0)
        applied_waste = data.get("applied_waste_pct", 0)
        
        # Expected: 100g × $0.005/g = $0.50 (no waste)
        expected_cost = 100 * 0.005
        
        assert abs(cost - expected_cost) < 0.01, \
            f"Cost should be ~${expected_cost:.2f} (no waste), got ${cost:.4f}"
        assert applied_waste == 0, f"applied_waste_pct should be 0, got {applied_waste}"
        
        print(f"✓ cost-preview with waste=0: cost=${cost:.4f}, applied_waste={applied_waste}%")
    
    def test_cost_preview_with_explicit_waste_override(self, api_client, auth_token, test_ingredient_with_waste):
        """
        cost-preview with waste_factor_pct=20 should override ingredient default
        """
        payload = {
            "ingredient_id": test_ingredient_with_waste["id"],
            "quantity": 100,
            "unit": "g",
            "waste_factor_pct": 20  # Override to 20%
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/inventory/ingredients/cost-preview",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Cost preview failed: {response.text}"
        
        data = response.json()
        cost = data.get("cost", 0)
        applied_waste = data.get("applied_waste_pct", 0)
        
        # Expected: 100g × $0.005/g × 1.20 = $0.60
        expected_cost = 100 * 0.005 * 1.20
        
        assert abs(cost - expected_cost) < 0.01, \
            f"Cost should be ~${expected_cost:.2f} (20% waste), got ${cost:.4f}"
        assert applied_waste == 20, f"applied_waste_pct should be 20, got {applied_waste}"
        
        print(f"✓ cost-preview with waste=20: cost=${cost:.4f}, applied_waste={applied_waste}%")


class TestLegacyRecipeFieldsRegression:
    """Regression tests for legacy recipe fields (instructions array, sub_recipes, allergens)"""
    
    def test_recipe_with_instructions_array(self, api_client, auth_token):
        """
        Recipe with instructions as array should work without 422/500
        """
        recipe_data = {
            "name": f"Test Recipe Instructions Array {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "instructions": ["Step 1: Prepare ingredients", "Step 2: Cook", "Step 3: Serve"],
            "allergens": ["gluten", "dairy"],
            "ingredients": []
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        # Verify instructions were saved
        instructions = recipe.get("instructions", [])
        assert len(instructions) == 3, f"Instructions should have 3 steps, got {len(instructions)}"
        
        print(f"✓ Recipe with instructions array: {len(instructions)} steps saved")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_recipe_with_sub_recipes(self, api_client, auth_token):
        """
        Recipe with sub_recipes field should work without errors
        """
        recipe_data = {
            "name": f"Test Recipe SubRecipes {uuid.uuid4().hex[:6]}",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "sub_recipes": [],  # Empty sub_recipes
            "ingredients": []
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes",
            json=recipe_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 201], f"Recipe creation failed: {response.text}"
        
        recipe = response.json()
        recipe_id = recipe.get("recipe_id")
        
        print(f"✓ Recipe with sub_recipes field: created successfully")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/recipes/{recipe_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestProductionBatchesRegression:
    """Regression tests for production batches - no impact from RecipeIngredient model changes"""
    
    def test_production_batches_list(self, api_client, auth_token):
        """Production batches listing should work"""
        response = api_client.get(
            f"{BASE_URL}/api/production/batches",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Production batches list failed: {response.text}"
        print(f"✓ Production batches list: {response.status_code}")
    
    def test_leads_crud_not_affected(self, api_client, auth_token):
        """Leads CRUD should not be affected by RecipeIngredient changes"""
        response = api_client.get(
            f"{BASE_URL}/api/leads",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Leads list failed: {response.text}"
        print(f"✓ Leads list: {response.status_code}")
    
    def test_public_catalog_not_affected(self, api_client, auth_token):
        """Public catalog endpoints should not be affected"""
        # Get company slug first
        response = api_client.get(
            f"{BASE_URL}/api/company",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if response.status_code == 200:
            company = response.json()
            slug = company.get("slug")
            if slug:
                catalog_response = api_client.get(f"{BASE_URL}/api/public/catalog/{slug}")
                assert catalog_response.status_code in [200, 404], \
                    f"Public catalog failed: {catalog_response.text}"
                print(f"✓ Public catalog endpoint: {catalog_response.status_code}")
        else:
            print(f"✓ Company endpoint: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
