"""
Test Food Ops Enhanced Features:
- Purchase Orders CRUD with lines
- Purchase Orders Send (Draft -> Sent)
- Purchase Orders Receive with expense creation
- Consolidated Purchase List generation
- Allergens API CRUD
- Inventory Value Summary
- Inventory Price History
- Recipe Portion Formats CRUD
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def session(self, auth_token):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        })
        return s
    
    def test_login(self, session):
        """Test login works"""
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data.get("email") == TEST_EMAIL
        print(f"✓ Logged in as: {data.get('name')}")


class TestAllergens:
    """Allergens API tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    def test_get_allergens(self, session):
        """Test getting allergens list (creates defaults if none exist)"""
        response = session.get(f"{BASE_URL}/api/allergens")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have default allergens"
        print(f"✓ Got {len(data)} allergens")
        # Check structure
        allergen = data[0]
        assert "allergen_id" in allergen
        assert "name" in allergen
        assert "name_es" in allergen
    
    def test_create_allergen(self, session):
        """Test creating a new allergen"""
        response = session.post(f"{BASE_URL}/api/allergens", json={
            "name": "TEST_Corn",
            "name_es": "TEST_Maíz",
            "icon": "corn",
            "is_active": True,
            "sort_order": 99
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("name") == "TEST_Corn"
        assert data.get("name_es") == "TEST_Maíz"
        print(f"✓ Created allergen: {data.get('allergen_id')}")
        return data.get("allergen_id")
    
    def test_update_allergen(self, session):
        """Test updating an allergen"""
        # First create one
        create_resp = session.post(f"{BASE_URL}/api/allergens", json={
            "name": "TEST_Update",
            "name_es": "TEST_Actualizar",
            "icon": "test",
            "is_active": True,
            "sort_order": 98
        })
        assert create_resp.status_code == 200
        allergen_id = create_resp.json().get("allergen_id")
        
        # Update it
        response = session.put(f"{BASE_URL}/api/allergens/{allergen_id}", json={
            "name": "TEST_Updated",
            "name_es": "TEST_Actualizado",
            "icon": "test2",
            "is_active": False,
            "sort_order": 97
        })
        assert response.status_code == 200
        print(f"✓ Updated allergen: {allergen_id}")
    
    def test_delete_allergen(self, session):
        """Test deleting an allergen"""
        # First create one
        create_resp = session.post(f"{BASE_URL}/api/allergens", json={
            "name": "TEST_Delete",
            "name_es": "TEST_Eliminar",
            "icon": "delete",
            "is_active": True,
            "sort_order": 96
        })
        assert create_resp.status_code == 200
        allergen_id = create_resp.json().get("allergen_id")
        
        # Delete it
        response = session.delete(f"{BASE_URL}/api/allergens/{allergen_id}")
        assert response.status_code == 200
        print(f"✓ Deleted allergen: {allergen_id}")


class TestInventoryValueSummary:
    """Inventory Value Summary tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    def test_get_value_summary(self, session):
        """Test getting inventory value summary by type"""
        response = session.get(f"{BASE_URL}/api/inventory/value-summary")
        assert response.status_code == 200
        data = response.json()
        assert "by_type" in data
        assert "total_value" in data
        print(f"✓ Inventory value summary: total=${data.get('total_value')}")
        print(f"  By type: {data.get('by_type')}")


class TestInventoryPriceHistory:
    """Inventory Price History tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    @pytest.fixture(scope="class")
    def test_ingredient(self, session):
        """Create a test ingredient for price history tests"""
        response = session.post(f"{BASE_URL}/api/inventory/ingredients", json={
            "name": "TEST_PriceHistory_Item",
            "category": "dry_goods",
            "inventory_type": "food",
            "unit": "kg",
            "cost_per_unit": 10.0,
            "stock_quantity": 5.0,
            "par_level": 2.0
        })
        assert response.status_code == 200
        return response.json()
    
    def test_add_price_history(self, session, test_ingredient):
        """Test adding price history entry"""
        item_id = test_ingredient.get("ingredient_id")
        response = session.post(f"{BASE_URL}/api/inventory/ingredients/{item_id}/price-history", json={
            "unit_cost": 12.50,
            "purchase_unit": "kg",
            "source": "Manual",
            "notes": "TEST price update"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("unit_cost") == 12.50
        assert data.get("source") == "Manual"
        print(f"✓ Added price history: ${data.get('unit_cost')}")
    
    def test_get_price_history(self, session, test_ingredient):
        """Test getting price history"""
        item_id = test_ingredient.get("ingredient_id")
        response = session.get(f"{BASE_URL}/api/inventory/ingredients/{item_id}/price-history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} price history entries")


class TestRecipePortionFormats:
    """Recipe Portion Formats tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    @pytest.fixture(scope="class")
    def test_recipe(self, session):
        """Create a test recipe for portion format tests"""
        response = session.post(f"{BASE_URL}/api/recipes", json={
            "name": "TEST_PortionFormat_Recipe",
            "recipe_type": "final_dish",
            "category": "main",
            "yield_quantity": 4,
            "yield_unit": "portions",
            "portion_size": 1,
            "portion_unit": "serving",
            "portions_per_yield": 4,
            "prep_time_minutes": 15,
            "cook_time_minutes": 30,
            "ingredients": [],
            "instructions": ["Step 1", "Step 2"],
            "sell_price": 25.0
        })
        assert response.status_code == 200
        return response.json()
    
    def test_create_portion_format(self, session, test_recipe):
        """Test creating a portion format"""
        recipe_id = test_recipe.get("recipe_id")
        response = session.post(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats", json={
            "format_name": "Plato Grande",
            "portions_obtained": 1,
            "portion_unit": "plate",
            "sell_price": 28.0,
            "sell_price_tax_included": False,
            "target_margin_pct": 70,
            "is_default": True,
            "notes": "TEST format"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("format_name") == "Plato Grande"
        assert data.get("sell_price") == 28.0
        print(f"✓ Created portion format: {data.get('format_id')}")
        return data.get("format_id")
    
    def test_get_portion_formats(self, session, test_recipe):
        """Test getting portion formats for a recipe"""
        recipe_id = test_recipe.get("recipe_id")
        response = session.get(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} portion formats")
    
    def test_update_portion_format(self, session, test_recipe):
        """Test updating a portion format"""
        recipe_id = test_recipe.get("recipe_id")
        
        # Create one first
        create_resp = session.post(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats", json={
            "format_name": "TEST_Update_Format",
            "portions_obtained": 2,
            "portion_unit": "bowl",
            "sell_price": 15.0,
            "is_default": False
        })
        assert create_resp.status_code == 200
        format_id = create_resp.json().get("format_id")
        
        # Update it
        response = session.put(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats/{format_id}", json={
            "format_name": "TEST_Updated_Format",
            "portions_obtained": 3,
            "portion_unit": "bowl",
            "sell_price": 18.0,
            "is_default": False
        })
        assert response.status_code == 200
        print(f"✓ Updated portion format: {format_id}")
    
    def test_delete_portion_format(self, session, test_recipe):
        """Test deleting a portion format"""
        recipe_id = test_recipe.get("recipe_id")
        
        # Create one first
        create_resp = session.post(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats", json={
            "format_name": "TEST_Delete_Format",
            "portions_obtained": 1,
            "portion_unit": "serving",
            "sell_price": 10.0,
            "is_default": False
        })
        assert create_resp.status_code == 200
        format_id = create_resp.json().get("format_id")
        
        # Delete it
        response = session.delete(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats/{format_id}")
        assert response.status_code == 200
        print(f"✓ Deleted portion format: {format_id}")


class TestPurchaseOrders:
    """Purchase Orders CRUD tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    @pytest.fixture(scope="class")
    def test_supplier(self, session):
        """Create a test supplier"""
        response = session.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_PO_Supplier",
            "contact_name": "Test Contact",
            "email": "test@supplier.com",
            "phone": "555-1234"
        })
        assert response.status_code == 200
        return response.json()
    
    @pytest.fixture(scope="class")
    def test_ingredient(self, session):
        """Create a test ingredient"""
        response = session.post(f"{BASE_URL}/api/inventory/ingredients", json={
            "name": "TEST_PO_Ingredient",
            "category": "produce",
            "inventory_type": "food",
            "unit": "kg",
            "cost_per_unit": 5.0,
            "stock_quantity": 10.0,
            "par_level": 5.0
        })
        assert response.status_code == 200
        return response.json()
    
    def test_get_purchase_orders(self, session):
        """Test getting purchase orders list"""
        response = session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} purchase orders")
    
    def test_create_purchase_order(self, session, test_supplier, test_ingredient):
        """Test creating a purchase order with lines"""
        supplier_id = test_supplier.get("supplier_id")
        ingredient_id = test_ingredient.get("ingredient_id")
        
        response = session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "needed_by_date": None,
            "payment_method": "Transfer",
            "notes": "TEST PO",
            "lines": [
                {
                    "inventory_item_id": ingredient_id,
                    "item_name": "TEST_PO_Ingredient",
                    "qty_ordered": 10,
                    "purchase_unit": "kg",
                    "unit_cost": 5.0,
                    "notes": "Test line"
                }
            ]
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "Draft"
        assert len(data.get("lines", [])) == 1
        assert data.get("total") == 50.0  # 10 * 5.0
        print(f"✓ Created PO: {data.get('po_number')} - Total: ${data.get('total')}")
        return data
    
    def test_send_purchase_order(self, session, test_supplier, test_ingredient):
        """Test sending a purchase order (Draft -> Sent)"""
        supplier_id = test_supplier.get("supplier_id")
        ingredient_id = test_ingredient.get("ingredient_id")
        
        # Create a PO first
        create_resp = session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "payment_method": "Transfer",
            "notes": "TEST PO for send",
            "lines": [
                {
                    "inventory_item_id": ingredient_id,
                    "item_name": "TEST_PO_Ingredient",
                    "qty_ordered": 5,
                    "purchase_unit": "kg",
                    "unit_cost": 5.0
                }
            ]
        })
        assert create_resp.status_code == 200
        po_id = create_resp.json().get("po_id")
        
        # Send it
        response = session.put(f"{BASE_URL}/api/purchase-orders/{po_id}/status?status=Sent")
        assert response.status_code == 200
        
        # Verify status changed
        get_resp = session.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert get_resp.status_code == 200
        assert get_resp.json().get("status") == "Sent"
        print(f"✓ Sent PO: {po_id}")
        return po_id
    
    def test_receive_purchase_order(self, session, test_supplier, test_ingredient):
        """Test receiving items from a purchase order with expense creation"""
        supplier_id = test_supplier.get("supplier_id")
        ingredient_id = test_ingredient.get("ingredient_id")
        
        # Create and send a PO
        create_resp = session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "payment_method": "Transfer",
            "notes": "TEST PO for receive",
            "lines": [
                {
                    "inventory_item_id": ingredient_id,
                    "item_name": "TEST_PO_Ingredient",
                    "qty_ordered": 8,
                    "purchase_unit": "kg",
                    "unit_cost": 5.0
                }
            ]
        })
        assert create_resp.status_code == 200
        po_data = create_resp.json()
        po_id = po_data.get("po_id")
        line_id = po_data.get("lines", [{}])[0].get("line_id")
        
        # Send it first
        session.put(f"{BASE_URL}/api/purchase-orders/{po_id}/status?status=Sent")
        
        # Receive items
        response = session.post(
            f"{BASE_URL}/api/purchase-orders/{po_id}/receive",
            json=[
                {
                    "line_id": line_id,
                    "qty_received": 8,
                    "unit_cost": 5.0
                }
            ],
            params={
                "create_expense": True,
                "invoice_number": "TEST-INV-001"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_status") == "Received"
        assert data.get("expense_id") is not None
        print(f"✓ Received PO: {po_id}, Expense: {data.get('expense_id')}")
    
    def test_delete_draft_purchase_order(self, session, test_supplier, test_ingredient):
        """Test deleting a draft purchase order"""
        supplier_id = test_supplier.get("supplier_id")
        ingredient_id = test_ingredient.get("ingredient_id")
        
        # Create a PO
        create_resp = session.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier_id,
            "payment_method": "Cash",
            "notes": "TEST PO for delete",
            "lines": [
                {
                    "inventory_item_id": ingredient_id,
                    "item_name": "TEST_PO_Ingredient",
                    "qty_ordered": 2,
                    "purchase_unit": "kg",
                    "unit_cost": 5.0
                }
            ]
        })
        assert create_resp.status_code == 200
        po_id = create_resp.json().get("po_id")
        
        # Delete it
        response = session.delete(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert response.status_code == 200
        print(f"✓ Deleted draft PO: {po_id}")


class TestConsolidatedPurchaseList:
    """Consolidated Purchase List tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    def test_generate_purchase_list_empty(self, session):
        """Test generating purchase list with no events"""
        response = session.post(f"{BASE_URL}/api/events/generate-purchase-list", json={
            "event_ids": [],
            "include_buffer": True,
            "compare_inventory": True
        })
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert "items_by_supplier" in data
        assert "total_cost" in data
        print(f"✓ Generated empty purchase list")
    
    def test_generate_purchase_list_with_events(self, session):
        """Test generating purchase list with existing events"""
        # Get existing events
        events_resp = session.get(f"{BASE_URL}/api/events")
        assert events_resp.status_code == 200
        events = events_resp.json()
        
        if len(events) == 0:
            print("⚠ No events found, skipping test")
            return
        
        # Use first event
        event_ids = [events[0].get("event_id")]
        
        response = session.post(f"{BASE_URL}/api/events/generate-purchase-list", json={
            "event_ids": event_ids,
            "include_buffer": True,
            "compare_inventory": True
        })
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert "items_by_supplier" in data
        assert "total_cost" in data
        print(f"✓ Generated purchase list for {len(data.get('events', []))} events")
        print(f"  Total cost: ${data.get('total_cost', 0)}")
        print(f"  Suppliers: {len(data.get('items_by_supplier', {}))}")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("access_token")
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return s
    
    def test_cleanup_test_allergens(self, session):
        """Clean up TEST_ prefixed allergens"""
        response = session.get(f"{BASE_URL}/api/allergens")
        if response.status_code == 200:
            allergens = response.json()
            for allergen in allergens:
                if allergen.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/allergens/{allergen.get('allergen_id')}")
        print("✓ Cleaned up test allergens")
    
    def test_cleanup_test_ingredients(self, session):
        """Clean up TEST_ prefixed ingredients"""
        response = session.get(f"{BASE_URL}/api/inventory/ingredients")
        if response.status_code == 200:
            ingredients = response.json()
            for ing in ingredients:
                if ing.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing.get('ingredient_id')}")
        print("✓ Cleaned up test ingredients")
    
    def test_cleanup_test_recipes(self, session):
        """Clean up TEST_ prefixed recipes"""
        response = session.get(f"{BASE_URL}/api/recipes")
        if response.status_code == 200:
            recipes = response.json()
            for recipe in recipes:
                if recipe.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/recipes/{recipe.get('recipe_id')}")
        print("✓ Cleaned up test recipes")
    
    def test_cleanup_test_suppliers(self, session):
        """Clean up TEST_ prefixed suppliers"""
        response = session.get(f"{BASE_URL}/api/suppliers")
        if response.status_code == 200:
            suppliers = response.json()
            for supplier in suppliers:
                if supplier.get("name", "").startswith("TEST_"):
                    session.delete(f"{BASE_URL}/api/suppliers/{supplier.get('supplier_id')}")
        print("✓ Cleaned up test suppliers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
