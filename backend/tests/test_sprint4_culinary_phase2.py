"""
Sprint 4 (FINAL) - Culinary Intelligence Phase 2 Tests
Feature 3: Menu Engineering Dashboard + What-If Simulator
Feature 4: Theoretical vs Actual Cost Variance
Feature 5: Plated → Catalog Menu Conversion
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "pamemey27@gmail.com"
ADMIN_PASSWORD = "Evoque2024!"
DEMO_EMAIL = "demo.agency@kora.com"
DEMO_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def admin_session():
    """Login as admin user with food-ops access"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code}")
    return session


@pytest.fixture(scope="module")
def demo_session():
    """Login as demo agency user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Demo login failed: {response.status_code}")
    return session


# ============== FEATURE 3: MENU ENGINEERING ==============

class TestMenuEngineeringAnalyze:
    """Feature 3: GET /api/menu-engineering/analyze"""
    
    def test_analyze_requires_auth(self):
        """Endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/menu-engineering/analyze")
        assert response.status_code == 401
    
    def test_analyze_default_days(self, admin_session):
        """GET /api/menu-engineering/analyze with default days=90"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "window_days" in data
        assert "recipes" in data
        assert "quadrants_summary" in data
        assert "thresholds" in data
        assert "generated_at" in data
        
        # Verify quadrants_summary structure
        summary = data["quadrants_summary"]
        assert "star" in summary
        assert "plowhorse" in summary
        assert "puzzle" in summary
        assert "dog" in summary
        
        # Verify thresholds structure
        thresholds = data["thresholds"]
        assert "popularity_avg" in thresholds
        assert "profit_avg" in thresholds
    
    def test_analyze_custom_days(self, admin_session):
        """GET /api/menu-engineering/analyze?days=180"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": 180})
        assert response.status_code == 200
        data = response.json()
        assert data["window_days"] == 180
    
    def test_analyze_invalid_days_zero(self, admin_session):
        """GET /api/menu-engineering/analyze?days=0 returns 400"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": 0})
        assert response.status_code == 400
    
    def test_analyze_invalid_days_negative(self, admin_session):
        """GET /api/menu-engineering/analyze?days=-5 returns 400"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": -5})
        assert response.status_code == 400
    
    def test_analyze_invalid_days_too_large(self, admin_session):
        """GET /api/menu-engineering/analyze?days=1000 returns 400"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": 1000})
        assert response.status_code == 400
    
    def test_analyze_recipe_structure(self, admin_session):
        """Verify each recipe in response has required fields"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": 365})
        assert response.status_code == 200
        data = response.json()
        
        if len(data["recipes"]) > 0:
            recipe = data["recipes"][0]
            assert "recipe_id" in recipe
            assert "recipe_name" in recipe
            assert "quadrant" in recipe
            assert "popularity_score" in recipe
            assert "profit_per_portion" in recipe
            assert "profit_margin_percent" in recipe
            assert "cost_per_portion" in recipe
            assert "sell_price" in recipe
            
            # Verify quadrant is valid
            assert recipe["quadrant"] in ["star", "plowhorse", "puzzle", "dog"]
    
    def test_analyze_empty_gracefully(self, admin_session):
        """Returns empty array gracefully when no priced recipes"""
        response = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze")
        assert response.status_code == 200
        data = response.json()
        # Even if empty, structure should be valid
        assert isinstance(data["recipes"], list)
        assert isinstance(data["quadrants_summary"], dict)


class TestMenuEngineeringWhatIf:
    """Feature 3: POST /api/menu-engineering/what-if"""
    
    def test_whatif_requires_auth(self):
        """Endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/menu-engineering/what-if", json={
            "recipe_id": "test"
        })
        assert response.status_code == 401
    
    def test_whatif_nonexistent_recipe(self, admin_session):
        """POST /api/menu-engineering/what-if with non-existent recipe returns 404"""
        response = admin_session.post(f"{BASE_URL}/api/menu-engineering/what-if", json={
            "recipe_id": "nonexistent_recipe_12345"
        })
        assert response.status_code == 404
    
    def test_whatif_with_valid_recipe(self, admin_session):
        """POST /api/menu-engineering/what-if with valid recipe"""
        # First get a valid recipe from analysis
        analyze_resp = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": 365})
        if analyze_resp.status_code != 200 or len(analyze_resp.json().get("recipes", [])) == 0:
            pytest.skip("No recipes with sell price available for what-if test")
        
        recipe = analyze_resp.json()["recipes"][0]
        recipe_id = recipe["recipe_id"]
        
        response = admin_session.post(f"{BASE_URL}/api/menu-engineering/what-if", json={
            "recipe_id": recipe_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["recipe_id"] == recipe_id
        assert "recipe_name" in data
        assert "current" in data
        assert "simulated" in data
        assert "popularity_score" in data
        assert "thresholds" in data
        
        # Verify current structure
        current = data["current"]
        assert "cost_per_portion" in current
        assert "sell_price" in current
        assert "profit_per_portion" in current
        assert "quadrant" in current
        
        # Verify simulated structure
        simulated = data["simulated"]
        assert "cost_per_portion" in simulated
        assert "sell_price" in simulated
        assert "profit_per_portion" in simulated
        assert "quadrant" in simulated
    
    def test_whatif_changes_quadrant(self, admin_session):
        """Verify changing cost/price can change the simulated quadrant"""
        analyze_resp = admin_session.get(f"{BASE_URL}/api/menu-engineering/analyze", params={"days": 365})
        if analyze_resp.status_code != 200 or len(analyze_resp.json().get("recipes", [])) == 0:
            pytest.skip("No recipes available for quadrant change test")
        
        data = analyze_resp.json()
        recipe = data["recipes"][0]
        recipe_id = recipe["recipe_id"]
        thresholds = data["thresholds"]
        
        # Try to push to star quadrant by setting high price, low cost
        response = admin_session.post(f"{BASE_URL}/api/menu-engineering/what-if", json={
            "recipe_id": recipe_id,
            "new_cost_per_portion": 1.0,  # Very low cost
            "new_sell_price": 1000.0  # Very high price
        })
        assert response.status_code == 200
        result = response.json()
        
        # With very high profit, should be star or puzzle (depending on popularity)
        assert result["simulated"]["profit_per_portion"] > thresholds["profit_avg"]


# ============== FEATURE 4: COST VARIANCE ==============

class TestCostVarianceList:
    """Feature 4: GET /api/cost-variance"""
    
    def test_variance_requires_auth(self):
        """Endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cost-variance")
        assert response.status_code == 401
    
    def test_variance_default_days(self, admin_session):
        """GET /api/cost-variance with default days"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "window_days" in data
        assert "events" in data
        assert "summary" in data
        
        # Verify summary structure
        summary = data["summary"]
        assert "ok" in summary
        assert "warn" in summary
        assert "critical" in summary
    
    def test_variance_custom_days(self, admin_session):
        """GET /api/cost-variance?days=180"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 180})
        assert response.status_code == 200
        data = response.json()
        assert data["window_days"] == 180
    
    def test_variance_invalid_days(self, admin_session):
        """GET /api/cost-variance with invalid days returns 400"""
        # Test days=0
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 0})
        assert response.status_code == 400
        
        # Test days=-5
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": -5})
        assert response.status_code == 400
        
        # Test days=1000 (>730)
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 1000})
        assert response.status_code == 400
    
    def test_variance_severity_filter_critical(self, admin_session):
        """GET /api/cost-variance?severity_filter=critical only returns critical events"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={
            "days": 365,
            "severity_filter": "critical"
        })
        assert response.status_code == 200
        data = response.json()
        
        # All events should be critical
        for event in data["events"]:
            assert event["severity"] == "critical"
    
    def test_variance_severity_filter_ok(self, admin_session):
        """GET /api/cost-variance?severity_filter=ok only returns ok events"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={
            "days": 365,
            "severity_filter": "ok"
        })
        assert response.status_code == 200
        data = response.json()
        
        for event in data["events"]:
            assert event["severity"] == "ok"
    
    def test_variance_severity_filter_warn(self, admin_session):
        """GET /api/cost-variance?severity_filter=warn only returns warn events"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={
            "days": 365,
            "severity_filter": "warn"
        })
        assert response.status_code == 200
        data = response.json()
        
        for event in data["events"]:
            assert event["severity"] == "warn"
    
    def test_variance_empty_when_no_batches(self, admin_session):
        """Returns empty when no POSTED batches"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 1})
        assert response.status_code == 200
        data = response.json()
        # Structure should still be valid
        assert isinstance(data["events"], list)
        assert isinstance(data["summary"], dict)
    
    def test_variance_event_structure(self, admin_session):
        """Verify event row structure when events exist"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 365})
        assert response.status_code == 200
        data = response.json()
        
        if len(data["events"]) > 0:
            event = data["events"][0]
            assert "event_id" in event
            assert "event_name" in event
            assert "event_date" in event
            assert "theoretical_cost" in event
            assert "actual_cost" in event
            assert "variance_amount" in event
            assert "variance_percent" in event
            assert "severity" in event
            assert "is_overrun" in event
            assert "batches_count" in event
            
            # Verify severity is valid
            assert event["severity"] in ["ok", "warn", "critical"]


class TestCostVarianceEvent:
    """Feature 4: GET /api/cost-variance/event/{event_id}"""
    
    def test_variance_event_requires_auth(self):
        """Endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cost-variance/event/test123")
        assert response.status_code == 401
    
    def test_variance_event_nonexistent(self, admin_session):
        """GET /api/cost-variance/event/{id} returns 404 for non-existent"""
        response = admin_session.get(f"{BASE_URL}/api/cost-variance/event/nonexistent_event_12345")
        assert response.status_code == 404
    
    def test_variance_event_detail_structure(self, admin_session):
        """Verify event detail structure includes production_batches list"""
        # First get an event from the list
        list_resp = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 365})
        if list_resp.status_code != 200 or len(list_resp.json().get("events", [])) == 0:
            pytest.skip("No events with POSTED batches available")
        
        event_id = list_resp.json()["events"][0]["event_id"]
        
        response = admin_session.get(f"{BASE_URL}/api/cost-variance/event/{event_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify full detail structure
        assert "event_id" in data
        assert "event_name" in data
        assert "theoretical_cost" in data
        assert "actual_cost" in data
        assert "variance_amount" in data
        assert "variance_percent" in data
        assert "severity" in data
        assert "is_overrun" in data
        assert "production_batches" in data
        assert "batches_count" in data
        assert "has_actuals" in data
        
        # Verify production_batches is a list
        assert isinstance(data["production_batches"], list)
    
    def test_variance_severity_bands(self, admin_session):
        """Verify severity bands: <5% ok, 5-10% warn, >10% critical"""
        list_resp = admin_session.get(f"{BASE_URL}/api/cost-variance", params={"days": 365})
        if list_resp.status_code != 200:
            pytest.skip("Could not fetch variance list")
        
        for event in list_resp.json().get("events", []):
            abs_pct = abs(event["variance_percent"])
            if abs_pct < 5:
                assert event["severity"] == "ok", f"Expected ok for {abs_pct}%"
            elif abs_pct < 10:
                assert event["severity"] == "warn", f"Expected warn for {abs_pct}%"
            else:
                assert event["severity"] == "critical", f"Expected critical for {abs_pct}%"


# ============== FEATURE 5: PLATED → CATALOG CONVERSION ==============

class TestPlatedToCatalogConversion:
    """Feature 5: POST /api/plated-menus/{menu_id}/convert-to-catalog"""
    
    def test_convert_requires_auth(self):
        """Endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/plated-menus/test123/convert-to-catalog")
        assert response.status_code == 401
    
    def test_convert_nonexistent_menu(self, admin_session):
        """POST /api/plated-menus/{id}/convert-to-catalog returns 404 for non-existent"""
        response = admin_session.post(f"{BASE_URL}/api/plated-menus/nonexistent_menu_12345/convert-to-catalog")
        assert response.status_code == 404
    
    def test_convert_menu_no_recipes(self, admin_session):
        """POST /api/plated-menus/{id}/convert-to-catalog returns 400 when no recipe items"""
        # Get plated menus
        menus_resp = admin_session.get(f"{BASE_URL}/api/plated-menus")
        if menus_resp.status_code != 200:
            pytest.skip("Could not fetch plated menus")
        
        menus = menus_resp.json()
        # Find a menu with empty courses
        empty_menu = None
        for menu in menus:
            has_recipes = False
            for course in menu.get("courses", []):
                if len(course.get("items", [])) > 0:
                    has_recipes = True
                    break
            if not has_recipes:
                empty_menu = menu
                break
        
        if not empty_menu:
            pytest.skip("No empty plated menu available for test")
        
        response = admin_session.post(f"{BASE_URL}/api/plated-menus/{empty_menu['menu_id']}/convert-to-catalog")
        assert response.status_code == 400
        assert "no recipe items" in response.json().get("detail", "").lower()
    
    def test_convert_menu_with_recipes(self, demo_session):
        """POST /api/plated-menus/{id}/convert-to-catalog creates catalog menu"""
        # Use demo account which has plated menu with recipes
        menus_resp = demo_session.get(f"{BASE_URL}/api/plated-menus")
        if menus_resp.status_code != 200:
            pytest.skip("Could not fetch plated menus")
        
        menus = menus_resp.json()
        # Find a menu with recipes
        menu_with_recipes = None
        for menu in menus:
            for course in menu.get("courses", []):
                if len(course.get("items", [])) > 0:
                    menu_with_recipes = menu
                    break
            if menu_with_recipes:
                break
        
        if not menu_with_recipes:
            pytest.skip("No plated menu with recipes available")
        
        menu_id = menu_with_recipes["menu_id"]
        original_name = menu_with_recipes["name"]
        
        response = demo_session.post(f"{BASE_URL}/api/plated-menus/{menu_id}/convert-to-catalog")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "menu_id" in data
        assert data["menu_id"].startswith("menu_")
        assert "source" in data
        assert data["source"] == "plated_menu_conversion"
        assert "source_plated_menu_id" in data
        assert data["source_plated_menu_id"] == menu_id
        assert "items" in data
        assert len(data["items"]) > 0
        assert "snapshot_cost_per_guest" in data
        
        # Verify name includes (Catalog)
        assert "(Catalog)" in data["name"] or "(Catálogo)" in data.get("name_es", "")
        
        # Verify the new menu appears in settings/menus
        settings_resp = demo_session.get(f"{BASE_URL}/api/settings/menus")
        assert settings_resp.status_code == 200
        settings_menus = settings_resp.json()
        
        found = False
        for m in settings_menus:
            if m["menu_id"] == data["menu_id"]:
                found = True
                break
        assert found, "Converted menu should appear in /api/settings/menus"
        
        # Cleanup: delete the test menu
        cleanup_resp = demo_session.delete(f"{BASE_URL}/api/settings/menus/{data['menu_id']}")
        # Don't fail test if cleanup fails
    
    def test_original_menu_not_modified(self, demo_session):
        """Verify original plated menu is NOT modified after conversion"""
        menus_resp = demo_session.get(f"{BASE_URL}/api/plated-menus")
        if menus_resp.status_code != 200:
            pytest.skip("Could not fetch plated menus")
        
        menus = menus_resp.json()
        menu_with_recipes = None
        for menu in menus:
            for course in menu.get("courses", []):
                if len(course.get("items", [])) > 0:
                    menu_with_recipes = menu
                    break
            if menu_with_recipes:
                break
        
        if not menu_with_recipes:
            pytest.skip("No plated menu with recipes available")
        
        menu_id = menu_with_recipes["menu_id"]
        original_data = menu_with_recipes.copy()
        
        # Convert
        convert_resp = demo_session.post(f"{BASE_URL}/api/plated-menus/{menu_id}/convert-to-catalog")
        if convert_resp.status_code != 200:
            pytest.skip("Conversion failed")
        
        new_menu_id = convert_resp.json()["menu_id"]
        
        # Verify original is unchanged
        original_resp = demo_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}")
        assert original_resp.status_code == 200
        after_data = original_resp.json()
        
        # Key fields should be unchanged
        assert after_data["name"] == original_data["name"]
        assert after_data["menu_type"] == original_data["menu_type"]
        assert len(after_data.get("courses", [])) == len(original_data.get("courses", []))
        
        # Cleanup
        demo_session.delete(f"{BASE_URL}/api/settings/menus/{new_menu_id}")


# ============== REGRESSION TESTS ==============

class TestRegressionExistingEndpoints:
    """Verify existing endpoints still work"""
    
    def test_plated_menus_crud(self, admin_session):
        """GET /api/plated-menus still works"""
        response = admin_session.get(f"{BASE_URL}/api/plated-menus")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_buffet_factors_crud(self, admin_session):
        """GET /api/buffet-factors still works"""
        response = admin_session.get(f"{BASE_URL}/api/buffet-factors")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_kitchen_beo_endpoint(self, admin_session):
        """GET /api/kitchen-beo/event/{id} returns 404 for non-existent (not 500)"""
        response = admin_session.get(f"{BASE_URL}/api/kitchen-beo/event/nonexistent_event")
        assert response.status_code == 404
    
    def test_production_event_plan(self, admin_session):
        """POST /api/production/event-plan still works"""
        response = admin_session.post(f"{BASE_URL}/api/production/event-plan", json={
            "event_id": "nonexistent"
        })
        # Should return 404 for non-existent event, not 500
        assert response.status_code in [200, 404]
    
    def test_plated_menu_staleness(self, admin_session):
        """GET /api/plated-menus/{id}/staleness still works"""
        menus_resp = admin_session.get(f"{BASE_URL}/api/plated-menus")
        if menus_resp.status_code != 200 or len(menus_resp.json()) == 0:
            pytest.skip("No plated menus available")
        
        menu_id = menus_resp.json()[0]["menu_id"]
        response = admin_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/staleness")
        assert response.status_code == 200
    
    def test_plated_menu_refresh_costs(self, admin_session):
        """POST /api/plated-menus/{id}/refresh-costs still works"""
        menus_resp = admin_session.get(f"{BASE_URL}/api/plated-menus")
        if menus_resp.status_code != 200 or len(menus_resp.json()) == 0:
            pytest.skip("No plated menus available")
        
        menu_id = menus_resp.json()[0]["menu_id"]
        response = admin_session.post(f"{BASE_URL}/api/plated-menus/{menu_id}/refresh-costs")
        assert response.status_code == 200
    
    def test_plated_menu_projected_cost(self, admin_session):
        """GET /api/plated-menus/{id}/projected-cost still works"""
        menus_resp = admin_session.get(f"{BASE_URL}/api/plated-menus")
        if menus_resp.status_code != 200 or len(menus_resp.json()) == 0:
            pytest.skip("No plated menus available")
        
        menu_id = menus_resp.json()[0]["menu_id"]
        response = admin_session.get(f"{BASE_URL}/api/plated-menus/{menu_id}/projected-cost")
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
