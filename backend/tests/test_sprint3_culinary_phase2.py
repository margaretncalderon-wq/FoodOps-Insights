"""
Sprint 3 Phase 2 - Culinary Intelligence Tests
Feature 1: Buffet Consumption Factors + Projected Event Cost (dual-cost view)
Feature 2: Kitchen BEO (Banquet Event Order) with allergen alerts + print/PDF

Test credentials: pamemey27@gmail.com / Evoque2024!
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "pamemey27@gmail.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    return session


@pytest.fixture(scope="module")
def test_data(auth_session):
    """Fetch test data: recipes, plated menus, events"""
    data = {}
    
    # Get recipes
    res = auth_session.get(f"{BASE_URL}/api/recipes")
    if res.status_code == 200:
        data["recipes"] = res.json()
    else:
        data["recipes"] = []
    
    # Get plated menus
    res = auth_session.get(f"{BASE_URL}/api/plated-menus")
    if res.status_code == 200:
        data["menus"] = res.json()
    else:
        data["menus"] = []
    
    # Get events
    res = auth_session.get(f"{BASE_URL}/api/events")
    if res.status_code == 200:
        data["events"] = res.json()
    else:
        data["events"] = []
    
    return data


# ============== FEATURE 1: BUFFET FACTORS CRUD ==============

class TestBuffetFactorsCRUD:
    """Test Buffet Consumption Factors CRUD operations"""
    
    def test_get_buffet_factors_requires_auth(self):
        """GET /api/buffet-factors requires authentication"""
        response = requests.get(f"{BASE_URL}/api/buffet-factors")
        # Should redirect to login or return 401/403
        assert response.status_code in [401, 403, 307, 302] or "login" in response.url.lower()
    
    def test_get_buffet_factors_empty_or_list(self, auth_session):
        """GET /api/buffet-factors returns list (may be empty for fresh company)"""
        response = auth_session.get(f"{BASE_URL}/api/buffet-factors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} existing buffet factors")
    
    def test_create_buffet_factor_invalid_scope_type(self, auth_session):
        """POST /api/buffet-factors with invalid scope_type returns 400"""
        response = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "invalid_type",
            "factor": 0.85,
            "applies_to_menu_types": ["buffet"]
        })
        assert response.status_code == 400
        assert "scope_type" in response.json().get("detail", "").lower()
    
    def test_create_buffet_factor_missing_scope_id(self, auth_session):
        """POST /api/buffet-factors with scope_type=recipe but no scope_id returns 400"""
        response = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "recipe",
            "factor": 0.85,
            "applies_to_menu_types": ["buffet"]
        })
        assert response.status_code == 400
        assert "scope_id" in response.json().get("detail", "").lower()
    
    def test_create_buffet_factor_invalid_factor_zero(self, auth_session):
        """POST /api/buffet-factors with factor=0 returns 400"""
        response = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0,
            "applies_to_menu_types": ["buffet"]
        })
        assert response.status_code == 400
        assert "factor" in response.json().get("detail", "").lower()
    
    def test_create_buffet_factor_invalid_factor_too_high(self, auth_session):
        """POST /api/buffet-factors with factor>5 returns 400"""
        response = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 6,
            "applies_to_menu_types": ["buffet"]
        })
        assert response.status_code == 400
        assert "factor" in response.json().get("detail", "").lower()
    
    def test_create_buffet_factor_empty_applies_to(self, auth_session):
        """POST /api/buffet-factors with empty applies_to_menu_types returns 400"""
        response = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.85,
            "applies_to_menu_types": []
        })
        assert response.status_code == 400
        assert "applies_to" in response.json().get("detail", "").lower()
    
    def test_create_default_buffet_factor_success(self, auth_session):
        """POST /api/buffet-factors with valid default factor succeeds"""
        response = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.85,
            "applies_to_menu_types": ["buffet"],
            "notes": "TEST_default_factor"
        })
        assert response.status_code == 200
        data = response.json()
        assert "factor_id" in data
        assert data["scope_type"] == "default"
        assert data["factor"] == 0.85
        assert "buffet" in data["applies_to_menu_types"]
        print(f"Created default factor: {data['factor_id']}")
        return data["factor_id"]
    
    def test_update_buffet_factor_success(self, auth_session):
        """PUT /api/buffet-factors/{factor_id} updates an existing factor"""
        # First create a factor
        create_res = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.9,
            "applies_to_menu_types": ["cocktail"],
            "notes": "TEST_update_factor"
        })
        assert create_res.status_code == 200
        factor_id = create_res.json()["factor_id"]
        
        # Update it
        update_res = auth_session.put(f"{BASE_URL}/api/buffet-factors/{factor_id}", json={
            "scope_type": "default",
            "factor": 0.75,
            "applies_to_menu_types": ["cocktail"],
            "notes": "TEST_updated_factor"
        })
        assert update_res.status_code == 200
        data = update_res.json()
        assert data["factor"] == 0.75
        assert data["notes"] == "TEST_updated_factor"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/buffet-factors/{factor_id}")
    
    def test_update_buffet_factor_not_found(self, auth_session):
        """PUT /api/buffet-factors/{factor_id} returns 404 for non-existent"""
        response = auth_session.put(f"{BASE_URL}/api/buffet-factors/nonexistent_id", json={
            "scope_type": "default",
            "factor": 0.85,
            "applies_to_menu_types": ["buffet"]
        })
        assert response.status_code == 404
    
    def test_delete_buffet_factor_success(self, auth_session):
        """DELETE /api/buffet-factors/{factor_id} removes a factor"""
        # Create a factor to delete
        create_res = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.8,
            "applies_to_menu_types": ["buffet"],
            "notes": "TEST_delete_factor"
        })
        assert create_res.status_code == 200
        factor_id = create_res.json()["factor_id"]
        
        # Delete it
        delete_res = auth_session.delete(f"{BASE_URL}/api/buffet-factors/{factor_id}")
        assert delete_res.status_code == 200
        
        # Verify it's gone
        get_res = auth_session.get(f"{BASE_URL}/api/buffet-factors")
        factors = get_res.json()
        assert not any(f["factor_id"] == factor_id for f in factors)
    
    def test_delete_buffet_factor_not_found(self, auth_session):
        """DELETE /api/buffet-factors/{factor_id} returns 404 for non-existent"""
        response = auth_session.delete(f"{BASE_URL}/api/buffet-factors/nonexistent_id")
        assert response.status_code == 404


# ============== FEATURE 1: PROJECTED COST ==============

class TestProjectedCost:
    """Test Projected Cost endpoint for plated menus"""
    
    def test_projected_cost_requires_auth(self):
        """GET /api/plated-menus/{menu_id}/projected-cost requires auth"""
        response = requests.get(f"{BASE_URL}/api/plated-menus/test_menu/projected-cost")
        assert response.status_code in [401, 403, 307, 302] or "login" in response.url.lower()
    
    def test_projected_cost_not_found(self, auth_session):
        """GET /api/plated-menus/{menu_id}/projected-cost returns 404 for non-existent"""
        response = auth_session.get(f"{BASE_URL}/api/plated-menus/nonexistent_menu/projected-cost")
        assert response.status_code == 404
    
    def test_projected_cost_response_structure(self, auth_session, test_data):
        """GET /api/plated-menus/{menu_id}/projected-cost returns correct structure"""
        menus = test_data.get("menus", [])
        if not menus:
            pytest.skip("No plated menus available for testing")
        
        menu = menus[0]
        menu_id = menu.get("menu_id")
        
        response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/projected-cost")
        assert response.status_code == 200
        
        data = response.json()
        assert "menu_id" in data
        assert "menu_type" in data
        assert "theoretical_cost_per_guest" in data
        assert "projected_cost_per_guest" in data
        assert "savings_or_overrun" in data
        assert "savings_percent" in data
        assert "factors_applied" in data
        assert isinstance(data["factors_applied"], list)
        
        print(f"Menu {menu_id} ({data['menu_type']}): theoretical=${data['theoretical_cost_per_guest']}, projected=${data['projected_cost_per_guest']}")
    
    def test_projected_cost_buffet_menu_with_factor(self, auth_session, test_data):
        """For buffet menu with default factor, projected ≈ theoretical * factor"""
        menus = test_data.get("menus", [])
        buffet_menus = [m for m in menus if m.get("menu_type") == "buffet"]
        
        if not buffet_menus:
            pytest.skip("No buffet menus available for testing")
        
        menu = buffet_menus[0]
        menu_id = menu.get("menu_id")
        
        # Clean up any existing test factors
        factors_res = auth_session.get(f"{BASE_URL}/api/buffet-factors")
        for f in factors_res.json():
            if "TEST_" in (f.get("notes") or ""):
                auth_session.delete(f"{BASE_URL}/api/buffet-factors/{f['factor_id']}")
        
        # Create a default factor of 0.85
        create_res = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.85,
            "applies_to_menu_types": ["buffet"],
            "notes": "TEST_projected_cost_factor"
        })
        assert create_res.status_code == 200
        factor_id = create_res.json()["factor_id"]
        
        try:
            # Get projected cost
            response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/projected-cost")
            assert response.status_code == 200
            data = response.json()
            
            theoretical = data["theoretical_cost_per_guest"]
            projected = data["projected_cost_per_guest"]
            
            # If there are recipes, projected should be less than theoretical (factor < 1)
            if theoretical > 0:
                assert projected <= theoretical, f"Projected ({projected}) should be <= theoretical ({theoretical}) with factor 0.85"
                print(f"Buffet menu: theoretical=${theoretical}, projected=${projected}, savings={data['savings_percent']}%")
        finally:
            # Cleanup
            auth_session.delete(f"{BASE_URL}/api/buffet-factors/{factor_id}")
    
    def test_projected_cost_non_buffet_menu(self, auth_session, test_data):
        """For non-buffet menu, projected == theoretical (factor=1.0)"""
        menus = test_data.get("menus", [])
        plated_menus = [m for m in menus if m.get("menu_type") == "plated"]
        
        if not plated_menus:
            pytest.skip("No plated (non-buffet) menus available for testing")
        
        menu = plated_menus[0]
        menu_id = menu.get("menu_id")
        
        response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/projected-cost")
        assert response.status_code == 200
        data = response.json()
        
        # For plated menus, projected should equal theoretical
        assert data["projected_cost_per_guest"] == data["theoretical_cost_per_guest"], \
            f"For plated menu, projected ({data['projected_cost_per_guest']}) should equal theoretical ({data['theoretical_cost_per_guest']})"


# ============== FEATURE 1: FACTOR RESOLUTION CASCADE ==============

class TestFactorResolutionCascade:
    """Test factor resolution: recipe → category → default → 1.0"""
    
    def test_factor_cascade_recipe_overrides_default(self, auth_session, test_data):
        """Recipe-specific factor overrides default factor"""
        menus = test_data.get("menus", [])
        buffet_menus = [m for m in menus if m.get("menu_type") == "buffet"]
        
        if not buffet_menus:
            pytest.skip("No buffet menus available for cascade testing")
        
        menu = buffet_menus[0]
        menu_id = menu.get("menu_id")
        
        # Find a recipe in this menu
        recipe_id = None
        for course in menu.get("courses", []):
            for item in course.get("items", []):
                if item.get("recipe_id"):
                    recipe_id = item.get("recipe_id")
                    break
            if recipe_id:
                break
        
        if not recipe_id:
            pytest.skip("No recipes in buffet menu for cascade testing")
        
        # Clean up test factors
        factors_res = auth_session.get(f"{BASE_URL}/api/buffet-factors")
        for f in factors_res.json():
            if "TEST_" in (f.get("notes") or ""):
                auth_session.delete(f"{BASE_URL}/api/buffet-factors/{f['factor_id']}")
        
        # Create default factor = 0.85
        default_res = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.85,
            "applies_to_menu_types": ["buffet"],
            "notes": "TEST_cascade_default"
        })
        assert default_res.status_code == 200
        default_id = default_res.json()["factor_id"]
        
        # Create recipe-specific factor = 0.5
        recipe_res = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "recipe",
            "scope_id": recipe_id,
            "factor": 0.5,
            "applies_to_menu_types": ["buffet"],
            "notes": "TEST_cascade_recipe"
        })
        assert recipe_res.status_code == 200
        recipe_factor_id = recipe_res.json()["factor_id"]
        
        try:
            # Get projected cost
            response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/projected-cost")
            assert response.status_code == 200
            data = response.json()
            
            # Check that the specific recipe uses factor 0.5
            factors_applied = data.get("factors_applied", [])
            recipe_factor = next((f for f in factors_applied if f.get("recipe_id") == recipe_id), None)
            
            if recipe_factor:
                assert recipe_factor["factor"] == 0.5, \
                    f"Recipe {recipe_id} should use factor 0.5, got {recipe_factor['factor']}"
                print(f"Recipe {recipe_id} correctly uses factor 0.5 (overrides default 0.85)")
            
            # Other recipes should use default 0.85
            other_factors = [f for f in factors_applied if f.get("recipe_id") != recipe_id]
            for f in other_factors:
                assert f["factor"] == 0.85, \
                    f"Recipe {f['recipe_id']} should use default factor 0.85, got {f['factor']}"
        finally:
            # Cleanup
            auth_session.delete(f"{BASE_URL}/api/buffet-factors/{default_id}")
            auth_session.delete(f"{BASE_URL}/api/buffet-factors/{recipe_factor_id}")


# ============== FEATURE 2: KITCHEN BEO ==============

class TestKitchenBEO:
    """Test Kitchen BEO (Banquet Event Order) endpoint"""
    
    def test_kitchen_beo_requires_auth(self):
        """GET /api/kitchen-beo/event/{event_id} requires auth"""
        response = requests.get(f"{BASE_URL}/api/kitchen-beo/event/test_event")
        assert response.status_code in [401, 403, 307, 302] or "login" in response.url.lower()
    
    def test_kitchen_beo_not_found(self, auth_session):
        """GET /api/kitchen-beo/event/{event_id} returns 404 for non-existent"""
        response = auth_session.get(f"{BASE_URL}/api/kitchen-beo/event/nonexistent_event")
        assert response.status_code == 404
    
    def test_kitchen_beo_response_structure(self, auth_session, test_data):
        """GET /api/kitchen-beo/event/{event_id} returns correct structure"""
        events = test_data.get("events", [])
        # Find an event with a menu
        events_with_menu = [e for e in events if e.get("menu_id")]
        
        if not events_with_menu:
            pytest.skip("No events with menus available for BEO testing")
        
        event = events_with_menu[0]
        event_id = event.get("event_id")
        
        response = auth_session.get(f"{BASE_URL}/api/kitchen-beo/event/{event_id}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert "event_id" in data
        assert "event_name" in data
        assert "event_date" in data
        assert "guest_count" in data
        assert "menu_id" in data
        assert "menu_name" in data
        assert "menu_type" in data
        assert "allergens_aggregate" in data
        assert "dietary_tags_aggregate" in data
        assert "courses" in data
        assert "totals" in data
        
        # Check totals structure
        totals = data["totals"]
        assert "recipes_count" in totals
        assert "total_input_cost" in totals
        
        print(f"BEO for event '{data['event_name']}': {totals['recipes_count']} recipes, ${totals['total_input_cost']} input cost")
    
    def test_kitchen_beo_recipe_structure(self, auth_session, test_data):
        """Each recipe in BEO has required fields"""
        events = test_data.get("events", [])
        events_with_menu = [e for e in events if e.get("menu_id")]
        
        if not events_with_menu:
            pytest.skip("No events with menus available for BEO testing")
        
        event = events_with_menu[0]
        event_id = event.get("event_id")
        
        response = auth_session.get(f"{BASE_URL}/api/kitchen-beo/event/{event_id}")
        assert response.status_code == 200
        data = response.json()
        
        for course in data.get("courses", []):
            for recipe in course.get("recipes", []):
                # Check required recipe fields
                assert "recipe_id" in recipe
                assert "recipe_name" in recipe
                assert "portions_required" in recipe
                assert "ingredients" in recipe
                assert "allergens" in recipe
                assert "dietary_tags" in recipe
                
                # Check ingredients have scaled quantities
                for ing in recipe.get("ingredients", []):
                    assert "name" in ing
                    assert "quantity" in ing
                    assert "unit" in ing
                    assert "line_cost" in ing
    
    def test_kitchen_beo_allergens_aggregate(self, auth_session, test_data):
        """allergens_aggregate unions allergens from all recipes"""
        events = test_data.get("events", [])
        events_with_menu = [e for e in events if e.get("menu_id")]
        
        if not events_with_menu:
            pytest.skip("No events with menus available for BEO testing")
        
        event = events_with_menu[0]
        event_id = event.get("event_id")
        
        response = auth_session.get(f"{BASE_URL}/api/kitchen-beo/event/{event_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Collect all allergens from recipes
        all_allergens = set()
        for course in data.get("courses", []):
            for recipe in course.get("recipes", []):
                for allergen in recipe.get("allergens", []):
                    all_allergens.add(allergen)
        
        # Check aggregate contains all
        aggregate = set(data.get("allergens_aggregate", []))
        assert all_allergens.issubset(aggregate), \
            f"Aggregate {aggregate} should contain all recipe allergens {all_allergens}"
        
        print(f"Allergens aggregate: {data['allergens_aggregate']}")
    
    def test_kitchen_beo_buffet_factor_applied(self, auth_session, test_data):
        """For buffet event with factor < 1.0, portions_required is reduced"""
        events = test_data.get("events", [])
        menus = test_data.get("menus", [])
        
        # Find a buffet menu
        buffet_menus = [m for m in menus if m.get("menu_type") == "buffet"]
        if not buffet_menus:
            pytest.skip("No buffet menus available")
        
        buffet_menu = buffet_menus[0]
        
        # Find an event with this buffet menu
        events_with_buffet = [e for e in events if e.get("menu_id") == buffet_menu.get("menu_id")]
        
        if not events_with_buffet:
            pytest.skip("No events with buffet menu available")
        
        event = events_with_buffet[0]
        event_id = event.get("event_id")
        
        # Clean up test factors
        factors_res = auth_session.get(f"{BASE_URL}/api/buffet-factors")
        for f in factors_res.json():
            if "TEST_" in (f.get("notes") or ""):
                auth_session.delete(f"{BASE_URL}/api/buffet-factors/{f['factor_id']}")
        
        # Create a default factor of 0.8
        create_res = auth_session.post(f"{BASE_URL}/api/buffet-factors", json={
            "scope_type": "default",
            "factor": 0.8,
            "applies_to_menu_types": ["buffet"],
            "notes": "TEST_beo_factor"
        })
        assert create_res.status_code == 200
        factor_id = create_res.json()["factor_id"]
        
        try:
            response = auth_session.get(f"{BASE_URL}/api/kitchen-beo/event/{event_id}")
            assert response.status_code == 200
            data = response.json()
            
            # Check that consumption_factor is applied
            for course in data.get("courses", []):
                for recipe in course.get("recipes", []):
                    factor = recipe.get("consumption_factor", 1.0)
                    # Should be 0.8 (our default factor)
                    assert factor == 0.8, f"Recipe should have factor 0.8, got {factor}"
            
            print(f"BEO correctly applies consumption factor 0.8 to buffet event")
        finally:
            # Cleanup
            auth_session.delete(f"{BASE_URL}/api/buffet-factors/{factor_id}")


# ============== REGRESSION TESTS ==============

class TestRegressionExistingEndpoints:
    """Ensure existing endpoints still work"""
    
    def test_get_plated_menus(self, auth_session):
        """GET /api/plated-menus still works"""
        response = auth_session.get(f"{BASE_URL}/api/plated-menus")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_plated_menu_by_id(self, auth_session, test_data):
        """GET /api/plated-menus/{id} still works"""
        menus = test_data.get("menus", [])
        if not menus:
            pytest.skip("No menus available")
        
        menu_id = menus[0].get("menu_id")
        response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}")
        assert response.status_code == 200
    
    def test_get_plated_menu_staleness(self, auth_session, test_data):
        """GET /api/plated-menus/{id}/staleness still works"""
        menus = test_data.get("menus", [])
        if not menus:
            pytest.skip("No menus available")
        
        menu_id = menus[0].get("menu_id")
        response = auth_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/staleness")
        assert response.status_code == 200
    
    def test_refresh_menu_costs(self, auth_session, test_data):
        """POST /api/plated-menus/{id}/refresh-costs still works"""
        menus = test_data.get("menus", [])
        if not menus:
            pytest.skip("No menus available")
        
        menu_id = menus[0].get("menu_id")
        response = auth_session.post(f"{BASE_URL}/api/plated-menus/{menu_id}/refresh-costs")
        assert response.status_code == 200
    
    def test_get_recipes(self, auth_session):
        """GET /api/recipes still works"""
        response = auth_session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_production_event_plan(self, auth_session, test_data):
        """POST /api/production/event-plan still works"""
        events = test_data.get("events", [])
        if not events:
            pytest.skip("No events available")
        
        event_id = events[0].get("event_id")
        response = auth_session.post(f"{BASE_URL}/api/production/event-plan", json={
            "event_id": event_id
        })
        # Should return 200 or 404 (if event has no menu)
        assert response.status_code in [200, 404]


# ============== CLEANUP ==============

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_factors(auth_session):
    """Clean up test factors after all tests"""
    yield
    
    # Cleanup any remaining test factors
    try:
        factors_res = auth_session.get(f"{BASE_URL}/api/buffet-factors")
        if factors_res.status_code == 200:
            for f in factors_res.json():
                if "TEST_" in (f.get("notes") or ""):
                    auth_session.delete(f"{BASE_URL}/api/buffet-factors/{f['factor_id']}")
    except:
        pass
