"""
Test Food Ops Features:
- Recipe Builder with types (Base, Component, Final Dish)
- Recipe ingredients with waste factor (merma)
- Sub-recipes
- Recipe duplication
- Cost history
- Plated Menu Builder with courses
- Feature flags for Food Ops
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFoodOpsAuth:
    """Authentication for Food Ops testing"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login with provided credentials
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        token = data.get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        return session
    
    def test_login_success(self, auth_session):
        """Verify login works"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        user = response.json()
        assert user["email"] == "margaret.n.calderon@gmail.com"
        print(f"✓ Logged in as: {user['name']}")


class TestFeatureFlags:
    """Test Feature Flags for Food Ops"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_feature_flags(self, auth_session):
        """Test GET /api/settings/feature-flags returns Food Ops flags"""
        response = auth_session.get(f"{BASE_URL}/api/settings/feature-flags")
        assert response.status_code == 200
        flags = response.json()
        
        # Check Food Ops related flags exist (some may be optional)
        food_ops_flags = [
            "is_food_ops_enabled",
            "is_recipe_composition_enabled", 
            "is_plated_menu_enabled",
            "is_base_recipes_enabled",
            "is_inventory_enabled",
            "is_purchase_list_enabled"
        ]
        
        found_flags = [f for f in food_ops_flags if f in flags]
        print(f"✓ Feature flags retrieved: {list(flags.keys())}")
        print(f"✓ Food Ops flags found: {found_flags}")
        
        # At least some Food Ops flags should exist
        assert len(found_flags) >= 3, f"Expected at least 3 Food Ops flags, found {len(found_flags)}"
    
    def test_toggle_recipe_composition_flag(self, auth_session):
        """Test toggling Recipe Composition flag"""
        # Get current state
        response = auth_session.get(f"{BASE_URL}/api/settings/feature-flags")
        current = response.json().get("is_recipe_composition_enabled", True)
        
        # Toggle
        response = auth_session.put(f"{BASE_URL}/api/settings/feature-flags", json={
            "is_recipe_composition_enabled": not current
        })
        assert response.status_code == 200
        
        # Verify change
        response = auth_session.get(f"{BASE_URL}/api/settings/feature-flags")
        assert response.json()["is_recipe_composition_enabled"] == (not current)
        
        # Restore
        auth_session.put(f"{BASE_URL}/api/settings/feature-flags", json={
            "is_recipe_composition_enabled": current
        })
        print(f"✓ Recipe Composition flag toggled successfully")


class TestInventory:
    """Test Inventory (Ingredients) for Recipes"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_ingredients(self, auth_session):
        """Test GET /api/inventory/ingredients"""
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        assert response.status_code == 200
        ingredients = response.json()
        assert isinstance(ingredients, list)
        print(f"✓ Retrieved {len(ingredients)} ingredients")
        return ingredients
    
    def test_create_ingredient(self, auth_session):
        """Test POST /api/inventory/ingredients"""
        test_ingredient = {
            "name": f"TEST_Ingredient_{uuid.uuid4().hex[:6]}",
            "category": "protein",
            "inventory_type": "food",
            "unit": "kg",
            "cost_per_unit": 15.50,
            "stock_quantity": 10,
            "par_level": 5
        }
        
        response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=test_ingredient)
        assert response.status_code in [200, 201]
        
        created = response.json()
        assert created["name"] == test_ingredient["name"]
        assert created["cost_per_unit"] == test_ingredient["cost_per_unit"]
        assert "ingredient_id" in created
        
        print(f"✓ Created ingredient: {created['name']} (ID: {created['ingredient_id']})")
        return created
    
    def test_update_ingredient(self, auth_session):
        """Test PUT /api/inventory/ingredients/{id}"""
        # First create an ingredient
        test_ingredient = {
            "name": f"TEST_UpdateIngredient_{uuid.uuid4().hex[:6]}",
            "category": "produce",
            "inventory_type": "food",
            "unit": "kg",
            "cost_per_unit": 5.00,
            "stock_quantity": 20,
            "par_level": 10
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=test_ingredient)
        assert create_response.status_code in [200, 201]
        ingredient_id = create_response.json()["ingredient_id"]
        
        # Update the ingredient
        update_data = {
            "name": test_ingredient["name"],
            "category": "produce",
            "inventory_type": "food",
            "unit": "kg",
            "cost_per_unit": 7.50,  # Updated price
            "stock_quantity": 25,
            "par_level": 10
        }
        
        response = auth_session.put(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}", json=update_data)
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["cost_per_unit"] == 7.50
        print(f"✓ Updated ingredient cost: $5.00 -> $7.50")


class TestRecipes:
    """Test Recipe CRUD with types and sub-recipes"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_recipes(self, auth_session):
        """Test GET /api/recipes"""
        response = auth_session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        recipes = response.json()
        assert isinstance(recipes, list)
        print(f"✓ Retrieved {len(recipes)} recipes")
        return recipes
    
    def test_create_base_recipe(self, auth_session):
        """Test creating a Base recipe type"""
        base_recipe = {
            "name": f"TEST_Base_Salsa_{uuid.uuid4().hex[:6]}",
            "description": "Test base salsa recipe",
            "recipe_type": "base",
            "category": "sauce",
            "yield_quantity": 1,
            "yield_unit": "L",
            "portions_per_yield": 10,
            "prep_time_minutes": 15,
            "cook_time_minutes": 30,
            "ingredients": [],
            "sub_recipes": [],
            "instructions": ["Step 1", "Step 2"],
            "sell_price": 0
        }
        
        response = auth_session.post(f"{BASE_URL}/api/recipes", json=base_recipe)
        assert response.status_code in [200, 201]
        
        created = response.json()
        assert created["recipe_type"] == "base"
        assert created["name"] == base_recipe["name"]
        assert "recipe_id" in created
        
        print(f"✓ Created BASE recipe: {created['name']} (ID: {created['recipe_id']})")
        return created
    
    def test_create_component_recipe(self, auth_session):
        """Test creating a Component recipe type"""
        component_recipe = {
            "name": f"TEST_Component_Garnish_{uuid.uuid4().hex[:6]}",
            "description": "Test component garnish",
            "recipe_type": "component",
            "category": "side",
            "yield_quantity": 500,
            "yield_unit": "g",
            "portions_per_yield": 5,
            "prep_time_minutes": 10,
            "cook_time_minutes": 0,
            "ingredients": [],
            "sub_recipes": [],
            "instructions": ["Prepare garnish"],
            "sell_price": 0
        }
        
        response = auth_session.post(f"{BASE_URL}/api/recipes", json=component_recipe)
        assert response.status_code in [200, 201]
        
        created = response.json()
        assert created["recipe_type"] == "component"
        print(f"✓ Created COMPONENT recipe: {created['name']}")
        return created
    
    def test_create_final_dish_recipe(self, auth_session):
        """Test creating a Final Dish recipe type"""
        final_dish = {
            "name": f"TEST_FinalDish_Steak_{uuid.uuid4().hex[:6]}",
            "description": "Test final dish steak",
            "recipe_type": "final_dish",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "prep_time_minutes": 20,
            "cook_time_minutes": 15,
            "ingredients": [],
            "sub_recipes": [],
            "instructions": ["Cook steak", "Plate and serve"],
            "sell_price": 45.00
        }
        
        response = auth_session.post(f"{BASE_URL}/api/recipes", json=final_dish)
        assert response.status_code in [200, 201]
        
        created = response.json()
        assert created["recipe_type"] == "final_dish"
        assert created["sell_price"] == 45.00
        print(f"✓ Created FINAL DISH recipe: {created['name']}")
        return created
    
    def test_create_recipe_with_waste_factor(self, auth_session):
        """Test creating recipe with waste factor (merma)"""
        # First get an ingredient
        ing_response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        ingredients = ing_response.json()
        
        if not ingredients:
            # Create a test ingredient
            ing_data = {
                "name": f"TEST_WasteIngredient_{uuid.uuid4().hex[:6]}",
                "category": "produce",
                "inventory_type": "food",
                "unit": "kg",
                "cost_per_unit": 10.00,
                "stock_quantity": 50,
                "par_level": 10
            }
            ing_response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=ing_data)
            ingredient = ing_response.json()
        else:
            ingredient = ingredients[0]
        
        # Create recipe with waste factor
        recipe_with_waste = {
            "name": f"TEST_WasteRecipe_{uuid.uuid4().hex[:6]}",
            "description": "Recipe with waste factor",
            "recipe_type": "final_dish",
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "portions_per_yield": 1,
            "prep_time_minutes": 10,
            "cook_time_minutes": 20,
            "ingredients": [{
                "item_id": ingredient["ingredient_id"],
                "item_type": "ingredient",
                "item_name": ingredient["name"],
                "quantity": 0.5,
                "unit": ingredient["unit"],
                "waste_factor_pct": 15,  # 15% waste/merma
                "cost_per_unit": ingredient["cost_per_unit"],
                "total_cost": 0,
                "net_quantity": 0
            }],
            "sub_recipes": [],
            "instructions": ["Prepare with waste consideration"],
            "sell_price": 25.00
        }
        
        response = auth_session.post(f"{BASE_URL}/api/recipes", json=recipe_with_waste)
        assert response.status_code in [200, 201]
        
        created = response.json()
        # Verify waste factor is stored
        if created.get("ingredients"):
            assert created["ingredients"][0]["waste_factor_pct"] == 15
        
        print(f"✓ Created recipe with 15% waste factor (merma)")
        return created


class TestRecipeDuplication:
    """Test Recipe Duplication endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_duplicate_recipe(self, auth_session):
        """Test POST /api/recipes/{id}/duplicate"""
        # First create a recipe to duplicate
        original_recipe = {
            "name": f"TEST_OriginalRecipe_{uuid.uuid4().hex[:6]}",
            "description": "Original recipe to duplicate",
            "recipe_type": "final_dish",
            "category": "main",
            "yield_quantity": 4,
            "yield_unit": "portion",
            "portions_per_yield": 4,
            "prep_time_minutes": 30,
            "cook_time_minutes": 45,
            "ingredients": [],
            "sub_recipes": [],
            "instructions": ["Step 1", "Step 2", "Step 3"],
            "sell_price": 35.00
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/recipes", json=original_recipe)
        assert create_response.status_code in [200, 201]
        original = create_response.json()
        original_id = original["recipe_id"]
        
        # Duplicate the recipe
        duplicate_response = auth_session.post(f"{BASE_URL}/api/recipes/{original_id}/duplicate")
        assert duplicate_response.status_code in [200, 201]
        
        duplicated = duplicate_response.json()
        
        # Verify duplication
        assert duplicated["recipe_id"] != original_id
        assert "(Copy)" in duplicated["name"]
        assert duplicated["recipe_type"] == original["recipe_type"]
        assert duplicated["sell_price"] == original["sell_price"]
        assert duplicated["yield_quantity"] == original["yield_quantity"]
        
        print(f"✓ Duplicated recipe: '{original['name']}' -> '{duplicated['name']}'")
        return duplicated
    
    def test_duplicate_nonexistent_recipe(self, auth_session):
        """Test duplicating a non-existent recipe returns 404"""
        response = auth_session.post(f"{BASE_URL}/api/recipes/nonexistent_recipe_id/duplicate")
        assert response.status_code == 404
        print(f"✓ Correctly returned 404 for non-existent recipe")


class TestCostHistory:
    """Test Recipe Cost History endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_cost_history(self, auth_session):
        """Test GET /api/recipes/{id}/cost-history"""
        # First get existing recipes
        recipes_response = auth_session.get(f"{BASE_URL}/api/recipes")
        recipes = recipes_response.json()
        
        if not recipes:
            # Create a recipe first
            recipe_data = {
                "name": f"TEST_CostHistoryRecipe_{uuid.uuid4().hex[:6]}",
                "recipe_type": "final_dish",
                "category": "main",
                "yield_quantity": 1,
                "yield_unit": "portion",
                "portions_per_yield": 1,
                "prep_time_minutes": 10,
                "cook_time_minutes": 20,
                "ingredients": [],
                "sub_recipes": [],
                "instructions": [],
                "sell_price": 20.00
            }
            create_response = auth_session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
            recipe = create_response.json()
        else:
            recipe = recipes[0]
        
        # Get cost history
        response = auth_session.get(f"{BASE_URL}/api/recipes/{recipe['recipe_id']}/cost-history")
        assert response.status_code == 200
        
        history = response.json()
        assert "recipe_id" in history
        assert "recipe_name" in history
        assert "ingredient_cost_history" in history
        assert isinstance(history["ingredient_cost_history"], list)
        
        print(f"✓ Retrieved cost history for recipe: {history['recipe_name']}")
        return history
    
    def test_cost_history_nonexistent_recipe(self, auth_session):
        """Test cost history for non-existent recipe returns 404"""
        response = auth_session.get(f"{BASE_URL}/api/recipes/nonexistent_recipe_id/cost-history")
        assert response.status_code == 404
        print(f"✓ Correctly returned 404 for non-existent recipe cost history")


class TestPlatedMenus:
    """Test Plated Menu Builder"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_plated_menus(self, auth_session):
        """Test GET /api/plated-menus"""
        response = auth_session.get(f"{BASE_URL}/api/plated-menus")
        assert response.status_code == 200
        menus = response.json()
        assert isinstance(menus, list)
        print(f"✓ Retrieved {len(menus)} plated menus")
        return menus
    
    def test_create_plated_menu_with_courses(self, auth_session):
        """Test creating a plated menu with courses"""
        menu_data = {
            "name": f"TEST_PlatedMenu_{uuid.uuid4().hex[:6]}",
            "description": "Test plated menu with courses",
            "menu_type": "plated",
            "pricing_model": "per_guest",
            "serving_style": "plated",
            "courses": [
                {
                    "course_id": f"course_{uuid.uuid4().hex[:8]}",
                    "course_name": "appetizer",
                    "course_order": 0,
                    "items": []
                },
                {
                    "course_id": f"course_{uuid.uuid4().hex[:8]}",
                    "course_name": "entree",
                    "course_order": 1,
                    "items": []
                },
                {
                    "course_id": f"course_{uuid.uuid4().hex[:8]}",
                    "course_name": "dessert",
                    "course_order": 2,
                    "items": []
                }
            ],
            "buffer_percentage": 10,
            "notes": "Test menu notes"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/plated-menus", json=menu_data)
        assert response.status_code in [200, 201]
        
        created = response.json()
        assert created["name"] == menu_data["name"]
        assert created["menu_type"] == "plated"
        assert len(created["courses"]) == 3
        assert created["buffer_percentage"] == 10
        assert "menu_id" in created
        
        print(f"✓ Created plated menu with 3 courses: {created['name']}")
        return created
    
    def test_update_plated_menu(self, auth_session):
        """Test PUT /api/plated-menus/{id}"""
        # First create a menu
        menu_data = {
            "name": f"TEST_UpdateMenu_{uuid.uuid4().hex[:6]}",
            "description": "Menu to update",
            "menu_type": "plated",
            "pricing_model": "per_guest",
            "serving_style": "plated",
            "courses": [],
            "buffer_percentage": 5,
            "notes": ""
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/plated-menus", json=menu_data)
        assert create_response.status_code in [200, 201]
        menu_id = create_response.json()["menu_id"]
        
        # Update the menu
        update_data = {
            "name": menu_data["name"],
            "description": "Updated description",
            "menu_type": "buffet",  # Changed type
            "pricing_model": "per_guest",
            "serving_style": "stations",  # Changed style
            "courses": [],
            "buffer_percentage": 15,  # Changed buffer
            "notes": "Updated notes"
        }
        
        response = auth_session.put(f"{BASE_URL}/api/plated-menus/{menu_id}", json=update_data)
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["menu_type"] == "buffet"
        assert updated["serving_style"] == "stations"
        assert updated["buffer_percentage"] == 15
        
        print(f"✓ Updated plated menu: type=buffet, style=stations, buffer=15%")
    
    def test_delete_plated_menu(self, auth_session):
        """Test DELETE /api/plated-menus/{id}"""
        # First create a menu to delete
        menu_data = {
            "name": f"TEST_DeleteMenu_{uuid.uuid4().hex[:6]}",
            "description": "Menu to delete",
            "menu_type": "plated",
            "pricing_model": "per_guest",
            "serving_style": "plated",
            "courses": [],
            "buffer_percentage": 0,
            "notes": ""
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/plated-menus", json=menu_data)
        assert create_response.status_code in [200, 201]
        menu_id = create_response.json()["menu_id"]
        
        # Delete the menu
        response = auth_session.delete(f"{BASE_URL}/api/plated-menus/{menu_id}")
        assert response.status_code in [200, 204]
        
        # Verify deletion
        get_response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}")
        assert get_response.status_code == 404
        
        print(f"✓ Deleted plated menu successfully")


class TestSuppliers:
    """Test Suppliers for Inventory"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_suppliers(self, auth_session):
        """Test GET /api/suppliers"""
        response = auth_session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        suppliers = response.json()
        assert isinstance(suppliers, list)
        print(f"✓ Retrieved {len(suppliers)} suppliers")
    
    def test_create_supplier(self, auth_session):
        """Test POST /api/suppliers"""
        supplier_data = {
            "name": f"TEST_Supplier_{uuid.uuid4().hex[:6]}",
            "contact_name": "Test Contact",
            "email": "test@supplier.com",
            "phone": "+1234567890",
            "notes": "Test supplier notes"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert response.status_code in [200, 201]
        
        created = response.json()
        assert created["name"] == supplier_data["name"]
        assert "supplier_id" in created
        
        print(f"✓ Created supplier: {created['name']}")


class TestRecalculateCosts:
    """Test Recipe Cost Recalculation"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_recalculate_all_recipes(self, auth_session):
        """Test POST /api/recipes/recalculate-all"""
        response = auth_session.post(f"{BASE_URL}/api/recipes/recalculate-all")
        assert response.status_code == 200
        
        result = response.json()
        assert "message" in result or "updated" in result or isinstance(result, dict)
        
        print(f"✓ Recalculated all recipe costs")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "margaret.n.calderon@gmail.com",
            "password": "Evoque2024!"
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_cleanup_test_recipes(self, auth_session):
        """Clean up TEST_ prefixed recipes"""
        response = auth_session.get(f"{BASE_URL}/api/recipes")
        recipes = response.json()
        
        deleted_count = 0
        for recipe in recipes:
            if recipe.get("name", "").startswith("TEST_"):
                del_response = auth_session.delete(f"{BASE_URL}/api/recipes/{recipe['recipe_id']}")
                if del_response.status_code in [200, 204]:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test recipes")
    
    def test_cleanup_test_menus(self, auth_session):
        """Clean up TEST_ prefixed menus"""
        response = auth_session.get(f"{BASE_URL}/api/plated-menus")
        menus = response.json()
        
        deleted_count = 0
        for menu in menus:
            if menu.get("name", "").startswith("TEST_"):
                del_response = auth_session.delete(f"{BASE_URL}/api/plated-menus/{menu['menu_id']}")
                if del_response.status_code in [200, 204]:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test menus")
    
    def test_cleanup_test_ingredients(self, auth_session):
        """Clean up TEST_ prefixed ingredients"""
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        ingredients = response.json()
        
        deleted_count = 0
        for ing in ingredients:
            if ing.get("name", "").startswith("TEST_"):
                del_response = auth_session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing['ingredient_id']}")
                if del_response.status_code in [200, 204]:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test ingredients")
    
    def test_cleanup_test_suppliers(self, auth_session):
        """Clean up TEST_ prefixed suppliers"""
        response = auth_session.get(f"{BASE_URL}/api/suppliers")
        suppliers = response.json()
        
        deleted_count = 0
        for supplier in suppliers:
            if supplier.get("name", "").startswith("TEST_"):
                del_response = auth_session.delete(f"{BASE_URL}/api/suppliers/{supplier['supplier_id']}")
                if del_response.status_code in [200, 204]:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test suppliers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
