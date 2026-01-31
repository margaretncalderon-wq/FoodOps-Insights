"""
EEP Evoque Events Platform - Backend API Tests
Tests: Authentication, Events, Recipes, Menus, Inventory, Purchase Orders
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"Health check passed: {data}")
    
    def test_login_success(self):
        """Test successful login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"Login successful for: {data['user']['name']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 404]
        print("Invalid credentials correctly rejected")


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for subsequent tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestEvents:
    """Events module tests"""
    
    def test_get_events(self, auth_headers):
        """Test fetching all events"""
        response = requests.get(f"{BASE_URL}/api/events", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} events")
        if len(data) > 0:
            # Verify event structure
            event = data[0]
            assert "event_id" in event
            assert "name" in event or "event_name" in event
            print(f"First event: {event.get('name', event.get('event_name'))}")
    
    def test_get_event_details(self, auth_headers):
        """Test fetching event details"""
        # First get list of events
        response = requests.get(f"{BASE_URL}/api/events", headers=auth_headers)
        assert response.status_code == 200
        events = response.json()
        
        if len(events) > 0:
            event_id = events[0]["event_id"]
            # Get event details
            response = requests.get(f"{BASE_URL}/api/events/{event_id}", headers=auth_headers)
            assert response.status_code == 200
            event = response.json()
            assert event["event_id"] == event_id
            print(f"Event details retrieved: {event.get('name', event.get('event_name'))}")
        else:
            pytest.skip("No events available to test")


class TestRecipes:
    """Recipes module tests"""
    
    def test_get_recipes(self, auth_headers):
        """Test fetching all recipes"""
        response = requests.get(f"{BASE_URL}/api/recipes", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} recipes")
        if len(data) > 0:
            recipe = data[0]
            assert "recipe_id" in recipe
            assert "name" in recipe
            print(f"First recipe: {recipe['name']}")
    
    def test_get_recipe_details(self, auth_headers):
        """Test fetching recipe details with costing"""
        response = requests.get(f"{BASE_URL}/api/recipes", headers=auth_headers)
        assert response.status_code == 200
        recipes = response.json()
        
        if len(recipes) > 0:
            recipe_id = recipes[0]["recipe_id"]
            response = requests.get(f"{BASE_URL}/api/recipes/{recipe_id}", headers=auth_headers)
            assert response.status_code == 200
            recipe = response.json()
            assert recipe["recipe_id"] == recipe_id
            # Check for portion formats
            if "portion_formats" in recipe:
                print(f"Recipe has {len(recipe['portion_formats'])} portion formats")
            print(f"Recipe details retrieved: {recipe['name']}")
        else:
            pytest.skip("No recipes available to test")


class TestPlatedMenus:
    """Plated Menus module tests"""
    
    def test_get_menus(self, auth_headers):
        """Test fetching all plated menus"""
        response = requests.get(f"{BASE_URL}/api/plated-menus", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} plated menus")
        if len(data) > 0:
            menu = data[0]
            assert "menu_id" in menu
            assert "name" in menu
            print(f"First menu: {menu['name']}")
    
    def test_get_menu_details(self, auth_headers):
        """Test fetching menu details with courses"""
        response = requests.get(f"{BASE_URL}/api/plated-menus", headers=auth_headers)
        assert response.status_code == 200
        menus = response.json()
        
        if len(menus) > 0:
            menu_id = menus[0]["menu_id"]
            response = requests.get(f"{BASE_URL}/api/plated-menus/{menu_id}", headers=auth_headers)
            assert response.status_code == 200
            menu = response.json()
            assert menu["menu_id"] == menu_id
            # Check for courses
            if "courses" in menu:
                print(f"Menu has {len(menu['courses'])} courses")
            print(f"Menu details retrieved: {menu['name']}")
        else:
            pytest.skip("No menus available to test")


class TestInventory:
    """Inventory module tests"""
    
    def test_get_inventory_items(self, auth_headers):
        """Test fetching inventory items"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} inventory items")
        if len(data) > 0:
            item = data[0]
            assert "item_id" in item
            assert "name" in item
            print(f"First item: {item['name']}")
    
    def test_get_inventory_stats(self, auth_headers):
        """Test fetching inventory statistics"""
        response = requests.get(f"{BASE_URL}/api/inventory/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Check for expected stats fields
        assert "total_items" in data or "items" in data or isinstance(data, dict)
        print(f"Inventory stats: {data}")


class TestSuppliers:
    """Suppliers module tests"""
    
    def test_get_suppliers(self, auth_headers):
        """Test fetching suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} suppliers")


class TestPurchaseOrders:
    """Purchase Orders module tests"""
    
    def test_get_purchase_orders(self, auth_headers):
        """Test fetching purchase orders"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} purchase orders")
        if len(data) > 0:
            po = data[0]
            assert "po_id" in po
            print(f"First PO: {po.get('po_number', po['po_id'])}")
    
    def test_get_purchase_order_details(self, auth_headers):
        """Test fetching PO details"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_headers)
        assert response.status_code == 200
        pos = response.json()
        
        if len(pos) > 0:
            po_id = pos[0]["po_id"]
            response = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=auth_headers)
            assert response.status_code == 200
            po = response.json()
            assert po["po_id"] == po_id
            print(f"PO details retrieved: {po.get('po_number', po['po_id'])}")
        else:
            pytest.skip("No purchase orders available to test")


class TestCRM:
    """CRM module tests"""
    
    def test_get_clients(self, auth_headers):
        """Test fetching CRM clients"""
        response = requests.get(f"{BASE_URL}/api/crm/clients", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} clients")
    
    def test_get_leads(self, auth_headers):
        """Test fetching leads"""
        response = requests.get(f"{BASE_URL}/api/leads", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} leads")


class TestDashboard:
    """Dashboard stats tests"""
    
    def test_get_dashboard_stats(self, auth_headers):
        """Test fetching dashboard statistics"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Check for expected dashboard fields
        assert isinstance(data, dict)
        print(f"Dashboard stats: {data}")


class TestEventOrders:
    """Event Orders module tests"""
    
    def test_get_event_orders(self, auth_headers):
        """Test fetching event orders"""
        response = requests.get(f"{BASE_URL}/api/event-orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} event orders")


class TestAllergens:
    """Allergens module tests"""
    
    def test_get_allergens(self, auth_headers):
        """Test fetching allergens"""
        response = requests.get(f"{BASE_URL}/api/allergens", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} allergens")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
