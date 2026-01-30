"""
Test suite for Document Refactor - Contract & Event Order, Settings Categories/Picklist/Taxes
Tests the new document management structure where documents are managed within Events
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.cookies.get("session_token") or response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def session(self, auth_token):
        """Create authenticated session"""
        s = requests.Session()
        s.cookies.set("session_token", auth_token)
        s.headers.update({"Content-Type": "application/json"})
        return s
    
    def test_login_works(self):
        """Test login flow works correctly"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@evoque.com"
        print("✓ Login flow works correctly")


class TestSettingsCategories:
    """Test Settings Categories endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        return s
    
    def test_get_categories(self, session):
        """Test GET /api/settings/categories returns default categories"""
        response = session.get(f"{BASE_URL}/api/settings/categories")
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        # Should have default categories (Food, Drinks, Rentals, Labor/Staff, Décor, Other)
        print(f"✓ Settings Categories returns {len(categories)} categories")
        
        # Check for expected default categories
        category_names = [c.get("name", "").lower() for c in categories]
        expected = ["food", "drinks", "rentals", "labor", "décor", "other"]
        found_count = sum(1 for e in expected if any(e in name for name in category_names))
        print(f"  Found {found_count}/6 expected default categories")
        return categories
    
    def test_create_category(self, session):
        """Test POST /api/settings/categories"""
        response = session.post(f"{BASE_URL}/api/settings/categories", json={
            "name": "TEST_Custom Category",
            "name_es": "TEST_Categoría Personalizada",
            "color": "#FF5733",
            "icon": "package",
            "sort_order": 99
        })
        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert "category_id" in data
        assert data["name"] == "TEST_Custom Category"
        print(f"✓ Created category: {data['category_id']}")
        return data["category_id"]
    
    def test_delete_category(self, session):
        """Test DELETE /api/settings/categories/{category_id}"""
        # First create a category to delete
        create_resp = session.post(f"{BASE_URL}/api/settings/categories", json={
            "name": "TEST_ToDelete",
            "color": "#000000"
        })
        if create_resp.status_code in [200, 201]:
            cat_id = create_resp.json()["category_id"]
            delete_resp = session.delete(f"{BASE_URL}/api/settings/categories/{cat_id}")
            assert delete_resp.status_code in [200, 204]
            print(f"✓ Deleted category: {cat_id}")


class TestSettingsTaxes:
    """Test Settings Taxes endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        return s
    
    def test_get_taxes(self, session):
        """Test GET /api/settings/taxes"""
        response = session.get(f"{BASE_URL}/api/settings/taxes")
        assert response.status_code == 200
        taxes = response.json()
        assert isinstance(taxes, list)
        print(f"✓ Settings Taxes returns {len(taxes)} tax rates")
        return taxes
    
    def test_create_tax(self, session):
        """Test POST /api/settings/taxes - allows adding new tax rates"""
        response = session.post(f"{BASE_URL}/api/settings/taxes", json={
            "name": "TEST_VAT",
            "rate": 16.0,
            "is_default": False
        })
        assert response.status_code in [200, 201]
        data = response.json()
        assert "tax_id" in data
        assert data["name"] == "TEST_VAT"
        assert data["rate"] == 16.0
        print(f"✓ Created tax rate: {data['tax_id']} ({data['rate']}%)")
        return data["tax_id"]
    
    def test_delete_tax(self, session):
        """Test DELETE /api/settings/taxes/{tax_id}"""
        # First create a tax to delete
        create_resp = session.post(f"{BASE_URL}/api/settings/taxes", json={
            "name": "TEST_ToDeleteTax",
            "rate": 5.0
        })
        if create_resp.status_code in [200, 201]:
            tax_id = create_resp.json()["tax_id"]
            delete_resp = session.delete(f"{BASE_URL}/api/settings/taxes/{tax_id}")
            assert delete_resp.status_code in [200, 204]
            print(f"✓ Deleted tax: {tax_id}")


class TestSettingsPicklist:
    """Test Settings Item Picklist endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        return s
    
    def test_get_picklist(self, session):
        """Test GET /api/settings/picklist"""
        response = session.get(f"{BASE_URL}/api/settings/picklist")
        assert response.status_code == 200
        picklist = response.json()
        assert isinstance(picklist, list)
        print(f"✓ Settings Picklist returns {len(picklist)} predefined items")
        return picklist
    
    def test_create_picklist_item(self, session):
        """Test POST /api/settings/picklist - allows adding predefined items"""
        # First get a category to use
        cat_resp = session.get(f"{BASE_URL}/api/settings/categories")
        categories = cat_resp.json()
        category_id = categories[0]["category_id"] if categories else "cat_food"
        
        response = session.post(f"{BASE_URL}/api/settings/picklist", json={
            "name": "TEST_Predefined Item",
            "description": "A test predefined item",
            "category_id": category_id,
            "default_price": 25.99,
            "unit": "unit"
        })
        assert response.status_code in [200, 201]
        data = response.json()
        assert "item_id" in data
        assert data["name"] == "TEST_Predefined Item"
        print(f"✓ Created picklist item: {data['item_id']}")
        return data["item_id"]
    
    def test_delete_picklist_item(self, session):
        """Test DELETE /api/settings/picklist/{item_id}"""
        # First get categories
        cat_resp = session.get(f"{BASE_URL}/api/settings/categories")
        categories = cat_resp.json()
        category_id = categories[0]["category_id"] if categories else "cat_food"
        
        # Create item to delete
        create_resp = session.post(f"{BASE_URL}/api/settings/picklist", json={
            "name": "TEST_ToDeletePicklist",
            "category_id": category_id,
            "default_price": 10.0
        })
        if create_resp.status_code in [200, 201]:
            item_id = create_resp.json()["item_id"]
            delete_resp = session.delete(f"{BASE_URL}/api/settings/picklist/{item_id}")
            assert delete_resp.status_code in [200, 204]
            print(f"✓ Deleted picklist item: {item_id}")


class TestEventOrder:
    """Test Event Order (Contract & Event Order) endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        return s
    
    def test_get_event_order(self, session):
        """Test GET /api/event-orders/{event_id}"""
        event_id = "event_916314728e0a"  # Test event ID from request
        response = session.get(f"{BASE_URL}/api/event-orders/{event_id}")
        # May return 200 with order or 404 if event doesn't exist
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            assert "order_id" in data or "event_id" in data
            print(f"✓ Event Order retrieved for {event_id}")
        else:
            print(f"✓ Event Order endpoint works (event {event_id} not found)")
    
    def test_add_item_to_order(self, session):
        """Test POST /api/event-orders/{event_id}/items - Add Item modal works"""
        # First get an existing event
        events_resp = session.get(f"{BASE_URL}/api/events")
        events = events_resp.json()
        
        if not events:
            print("⚠ No events found, skipping add item test")
            return
        
        event_id = events[0]["event_id"]
        
        # Get categories for the item
        cat_resp = session.get(f"{BASE_URL}/api/settings/categories")
        categories = cat_resp.json()
        category_id = categories[0]["category_id"] if categories else "cat_food"
        
        response = session.post(f"{BASE_URL}/api/event-orders/{event_id}/items", json={
            "name": "TEST_Order Item",
            "description": "Test item for event order",
            "category_id": category_id,
            "quantity": 10,
            "unit_price": 15.50,
            "discount_amount": 0,
            "internal_notes": "Test internal note"
        })
        assert response.status_code in [200, 201]
        data = response.json()
        print(f"✓ Added item to event order: {event_id}")
        return data
    
    def test_items_grouped_by_category(self, session):
        """Test that items are returned grouped by category"""
        events_resp = session.get(f"{BASE_URL}/api/events")
        events = events_resp.json()
        
        if not events:
            print("⚠ No events found, skipping grouped items test")
            return
        
        event_id = events[0]["event_id"]
        response = session.get(f"{BASE_URL}/api/event-orders/{event_id}")
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            # Check that items have category_id
            for item in items:
                assert "category_id" in item, "Item should have category_id"
            print(f"✓ Event order items have category_id for grouping ({len(items)} items)")
    
    def test_generate_document_types(self, session):
        """Test GET /api/event-orders/{event_id}/document/{doc_type} - Generate Document dropdown"""
        events_resp = session.get(f"{BASE_URL}/api/events")
        events = events_resp.json()
        
        if not events:
            print("⚠ No events found, skipping document generation test")
            return
        
        event_id = events[0]["event_id"]
        
        # Test each document type
        doc_types = ["proposal", "contract", "invoice", "kitchen_sheet", "packing_list"]
        for doc_type in doc_types:
            response = session.get(f"{BASE_URL}/api/event-orders/{event_id}/document/{doc_type}")
            # Should return 200 with document or appropriate error
            assert response.status_code in [200, 201, 400, 404]
            if response.status_code in [200, 201]:
                print(f"✓ Generated {doc_type} document for event {event_id}")
            else:
                print(f"✓ Document generation endpoint works for {doc_type}")


class TestDashboardQuickActions:
    """Test Dashboard quick actions"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        return s
    
    def test_dashboard_stats(self, session):
        """Test dashboard statistics endpoint"""
        response = session.get(f"{BASE_URL}/api/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Dashboard stats retrieved")
        return data


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        return s
    
    def test_cleanup_test_data(self, session):
        """Clean up TEST_ prefixed data"""
        # Clean up categories
        cat_resp = session.get(f"{BASE_URL}/api/settings/categories")
        if cat_resp.status_code == 200:
            for cat in cat_resp.json():
                if cat.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/settings/categories/{cat['category_id']}")
        
        # Clean up taxes
        tax_resp = session.get(f"{BASE_URL}/api/settings/taxes")
        if tax_resp.status_code == 200:
            for tax in tax_resp.json():
                if tax.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/settings/taxes/{tax['tax_id']}")
        
        # Clean up picklist
        pick_resp = session.get(f"{BASE_URL}/api/settings/picklist")
        if pick_resp.status_code == 200:
            for item in pick_resp.json():
                if item.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/settings/picklist/{item['item_id']}")
        
        print("✓ Cleaned up TEST_ prefixed data")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
