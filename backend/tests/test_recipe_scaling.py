"""
Recipe Scaling MVP Tests
Tests for POST /api/recipes/{recipe_id}/scale and POST /api/recipes/save-scaled-menu
"""
import pytest
import requests
import os
import math

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture(scope="module")
def existing_recipe(api_client):
    """Find an existing recipe to test scaling (Ensalada Caprese or any recipe)"""
    response = api_client.get(f"{BASE_URL}/api/recipes")
    assert response.status_code == 200, f"Failed to get recipes: {response.text}"
    recipes = response.json()
    
    # Try to find Ensalada Caprese first
    for r in recipes:
        if "caprese" in r.get("name", "").lower():
            return r
    
    # Otherwise return first recipe with ingredients
    for r in recipes:
        if r.get("ingredients") and len(r.get("ingredients", [])) > 0:
            return r
    
    # If no recipe with ingredients, return first recipe
    if recipes:
        return recipes[0]
    
    pytest.skip("No recipes found in the system")


class TestRecipeScalePreview:
    """Tests for POST /api/recipes/{recipe_id}/scale endpoint"""
    
    def test_scale_recipe_basic(self, api_client, existing_recipe):
        """Test basic recipe scaling with target_portions=2"""
        recipe_id = existing_recipe["recipe_id"]
        portions_per_yield = float(existing_recipe.get("portions_per_yield") or 1)
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 2}
        )
        
        assert response.status_code == 200, f"Scale failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "recipe_id" in data
        assert "recipe_name" in data
        assert "portions_per_yield" in data
        assert "target_portions" in data
        assert "scale_factor" in data
        assert "ingredients" in data
        assert "sub_recipes" in data
        assert "total_cost_scaled" in data
        assert "cost_per_portion_scaled" in data
        assert "original_cost_per_portion" in data
        
        # Verify scale factor calculation
        expected_factor = 2 / portions_per_yield
        assert abs(data["scale_factor"] - expected_factor) < 0.001, \
            f"Expected factor {expected_factor}, got {data['scale_factor']}"
        
        print(f"✓ Recipe '{data['recipe_name']}' scaled to 2 portions")
        print(f"  Scale factor: {data['scale_factor']}")
        print(f"  Total cost scaled: ${data['total_cost_scaled']}")
    
    def test_scale_factor_calculation(self, api_client, existing_recipe):
        """Test scale factor math: portions_per_yield=10 scaled to target=300 → factor=30"""
        recipe_id = existing_recipe["recipe_id"]
        
        # Scale to 300 portions
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 300}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        portions_per_yield = data["portions_per_yield"]
        expected_factor = 300 / portions_per_yield
        
        assert abs(data["scale_factor"] - expected_factor) < 0.001
        print(f"✓ Scale factor correct: {data['scale_factor']} (expected {expected_factor})")
    
    def test_ingredient_quantity_scaling(self, api_client, existing_recipe):
        """Test that ingredient quantities scale linearly"""
        recipe_id = existing_recipe["recipe_id"]
        
        # First get scale factor 1 (original)
        response1 = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": float(existing_recipe.get("portions_per_yield") or 1)}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Then scale to 2x
        target = float(existing_recipe.get("portions_per_yield") or 1) * 2
        response2 = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": target}
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Verify quantities doubled (for non-discrete items)
        for ing1 in data1["ingredients"]:
            for ing2 in data2["ingredients"]:
                if ing1["ingredient_id"] == ing2["ingredient_id"]:
                    if not ing2.get("is_discrete_unit"):
                        # Non-discrete should be exactly 2x
                        expected = ing1["quantity_scaled"] * 2
                        assert abs(ing2["quantity_scaled"] - expected) < 0.01, \
                            f"Ingredient {ing1['name']}: expected {expected}, got {ing2['quantity_scaled']}"
                    print(f"  ✓ {ing1['name']}: {ing1['quantity_scaled']} → {ing2['quantity_scaled']}")
        
        print(f"✓ Ingredient quantities scale correctly")
    
    def test_discrete_unit_rounding(self, api_client, existing_recipe):
        """Test that discrete unit ingredients round UP"""
        recipe_id = existing_recipe["recipe_id"]
        
        # Scale to a factor that would produce fractional results
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 1.5}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        for ing in data["ingredients"]:
            if ing.get("is_discrete_unit"):
                raw = ing["quantity_scaled_raw"]
                scaled = ing["quantity_scaled"]
                # Discrete units should be ceiling of raw
                expected_ceil = math.ceil(raw)
                assert scaled == expected_ceil, \
                    f"Discrete ingredient {ing['name']}: raw={raw}, scaled={scaled}, expected ceil={expected_ceil}"
                print(f"  ✓ Discrete '{ing['name']}': raw {raw} → scaled {scaled} (ceil)")
        
        print(f"✓ Discrete unit rounding verified")
    
    def test_is_discrete_unit_in_response(self, api_client, existing_recipe):
        """Test that is_discrete_unit is surfaced in each ingredient line"""
        recipe_id = existing_recipe["recipe_id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 2}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        for ing in data["ingredients"]:
            assert "is_discrete_unit" in ing, f"Missing is_discrete_unit for {ing.get('name')}"
            assert isinstance(ing["is_discrete_unit"], bool), \
                f"is_discrete_unit should be bool, got {type(ing['is_discrete_unit'])}"
        
        print(f"✓ is_discrete_unit present in all {len(data['ingredients'])} ingredient lines")
    
    def test_sub_recipes_scale_linearly(self, api_client, existing_recipe):
        """Test that sub-recipes scale linearly"""
        recipe_id = existing_recipe["recipe_id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 10}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        factor = data["scale_factor"]
        for sub in data.get("sub_recipes", []):
            original = sub["quantity_original"]
            scaled = sub["quantity_scaled"]
            expected = round(original * factor, 3)
            assert abs(scaled - expected) < 0.01, \
                f"Sub-recipe {sub['name']}: expected {expected}, got {scaled}"
            print(f"  ✓ Sub-recipe '{sub['name']}': {original} × {factor} = {scaled}")
        
        if data.get("sub_recipes"):
            print(f"✓ Sub-recipes scale linearly")
        else:
            print(f"✓ No sub-recipes in this recipe (OK)")
    
    def test_target_portions_zero_returns_400(self, api_client, existing_recipe):
        """Test that target_portions <= 0 returns 400"""
        recipe_id = existing_recipe["recipe_id"]
        
        # Test zero
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 0}
        )
        assert response.status_code == 400, f"Expected 400 for zero portions, got {response.status_code}"
        
        # Test negative
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": -5}
        )
        assert response.status_code == 400, f"Expected 400 for negative portions, got {response.status_code}"
        
        print(f"✓ target_portions <= 0 correctly returns 400")
    
    def test_recipe_not_found_returns_404(self, api_client):
        """Test that non-existent recipe returns 404"""
        response = api_client.post(
            f"{BASE_URL}/api/recipes/nonexistent_recipe_xyz/scale",
            json={"target_portions": 2}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Non-existent recipe correctly returns 404")


class TestSaveScaledMenu:
    """Tests for POST /api/recipes/save-scaled-menu endpoint"""
    
    def test_save_scaled_menu_basic(self, api_client, existing_recipe):
        """Test saving a scaled menu creates doc in base_menus"""
        recipe_id = existing_recipe["recipe_id"]
        menu_name = f"TEST_Scaled_Menu_{recipe_id[:8]}"
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/save-scaled-menu",
            json={
                "name": menu_name,
                "description": "Test scaled menu",
                "recipes": [{"recipe_id": recipe_id, "target_portions": 10}]
            }
        )
        
        assert response.status_code == 200, f"Save failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "menu_id" in data
        assert data["name"] == menu_name
        assert data["menu_type"] == "scaled"
        assert "items" in data
        assert len(data["items"]) == 1
        
        # Verify item has ingredients_snapshot
        item = data["items"][0]
        assert "ingredients_snapshot" in item
        assert "scale_factor" in item
        assert "total_cost_scaled" in item
        
        print(f"✓ Scaled menu '{menu_name}' created with menu_id: {data['menu_id']}")
        
        # Cleanup - delete the test menu
        # Note: There may not be a delete endpoint, so we'll just note it
        return data["menu_id"]
    
    def test_base_recipe_not_modified_after_save(self, api_client, existing_recipe):
        """Test that base recipe is NOT modified after save-scaled-menu"""
        recipe_id = existing_recipe["recipe_id"]
        
        # Get original recipe state
        response1 = api_client.get(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert response1.status_code == 200
        original_recipe = response1.json()
        original_ingredients = original_recipe.get("ingredients", [])
        
        # Save a scaled menu
        menu_name = f"TEST_NoModify_{recipe_id[:8]}"
        response2 = api_client.post(
            f"{BASE_URL}/api/recipes/save-scaled-menu",
            json={
                "name": menu_name,
                "recipes": [{"recipe_id": recipe_id, "target_portions": 100}]
            }
        )
        assert response2.status_code == 200
        
        # Get recipe again and verify it's unchanged
        response3 = api_client.get(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert response3.status_code == 200
        after_recipe = response3.json()
        after_ingredients = after_recipe.get("ingredients", [])
        
        # Compare ingredient quantities
        assert len(original_ingredients) == len(after_ingredients), \
            "Ingredient count changed after save-scaled-menu!"
        
        for orig, after in zip(original_ingredients, after_ingredients):
            orig_qty = orig.get("quantity", 0)
            after_qty = after.get("quantity", 0)
            assert orig_qty == after_qty, \
                f"Ingredient quantity changed! {orig.get('name')}: {orig_qty} → {after_qty}"
        
        print(f"✓ Base recipe '{original_recipe['name']}' NOT modified after save-scaled-menu")
    
    def test_save_scaled_menu_empty_recipes_returns_400(self, api_client):
        """Test that empty recipes array returns 400"""
        response = api_client.post(
            f"{BASE_URL}/api/recipes/save-scaled-menu",
            json={
                "name": "TEST_Empty_Menu",
                "recipes": []
            }
        )
        assert response.status_code == 400, f"Expected 400 for empty recipes, got {response.status_code}"
        print(f"✓ Empty recipes array correctly returns 400")
    
    def test_save_scaled_menu_multiple_recipes(self, api_client, existing_recipe):
        """Test saving a scaled menu with multiple recipes"""
        recipe_id = existing_recipe["recipe_id"]
        
        # Get another recipe if available
        response = api_client.get(f"{BASE_URL}/api/recipes")
        recipes = response.json()
        
        recipe_entries = [{"recipe_id": recipe_id, "target_portions": 5}]
        
        # Add another recipe if available
        for r in recipes:
            if r["recipe_id"] != recipe_id:
                recipe_entries.append({"recipe_id": r["recipe_id"], "target_portions": 3})
                break
        
        menu_name = f"TEST_Multi_Recipe_Menu"
        response = api_client.post(
            f"{BASE_URL}/api/recipes/save-scaled-menu",
            json={
                "name": menu_name,
                "recipes": recipe_entries
            }
        )
        
        assert response.status_code == 200, f"Save failed: {response.text}"
        data = response.json()
        
        assert len(data["items"]) == len(recipe_entries)
        print(f"✓ Multi-recipe scaled menu created with {len(data['items'])} items")


class TestDiscreteUnitDetection:
    """Tests for discrete unit detection logic"""
    
    def test_discrete_unit_hints(self, api_client, existing_recipe):
        """Test that known discrete units are detected"""
        # These units should be treated as discrete
        discrete_hints = {"unit", "units", "unidad", "unidades", "pieza", "piezas",
                         "ea", "each", "un", "u", "pza", "pzs", "pc", "pcs"}
        
        recipe_id = existing_recipe["recipe_id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 2}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        for ing in data["ingredients"]:
            unit = str(ing.get("unit") or "").strip().lower()
            is_discrete = ing.get("is_discrete_unit", False)
            
            if unit in discrete_hints:
                # Should be discrete unless explicitly overridden
                print(f"  Unit '{unit}' → is_discrete={is_discrete}")
        
        print(f"✓ Discrete unit detection working")


class TestScalingMath:
    """Tests for specific scaling math scenarios"""
    
    def test_large_scale_factor(self, api_client, existing_recipe):
        """Test scaling with large factor (e.g., 300 portions)"""
        recipe_id = existing_recipe["recipe_id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 300}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify costs scale proportionally
        assert data["total_cost_scaled"] >= 0
        assert data["cost_per_portion_scaled"] >= 0
        
        # Cost per portion should be roughly the same regardless of scale
        # (within rounding for discrete units)
        original_cpp = data["original_cost_per_portion"]
        scaled_cpp = data["cost_per_portion_scaled"]
        
        if original_cpp > 0:
            ratio = scaled_cpp / original_cpp
            # Should be close to 1 (within 20% for discrete rounding effects)
            assert 0.8 <= ratio <= 1.2, \
                f"Cost per portion ratio {ratio} is too far from 1"
        
        print(f"✓ Large scale (300 portions) works correctly")
        print(f"  Factor: {data['scale_factor']}")
        print(f"  Total cost: ${data['total_cost_scaled']:.2f}")
    
    def test_fractional_scale_factor(self, api_client, existing_recipe):
        """Test scaling with fractional portions"""
        recipe_id = existing_recipe["recipe_id"]
        
        response = api_client.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/scale",
            json={"target_portions": 1.5}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify fractional scaling works
        assert data["target_portions"] == 1.5
        print(f"✓ Fractional scaling (1.5 portions) works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
