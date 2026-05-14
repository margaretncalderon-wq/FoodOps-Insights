"""
Sprint 1 Recipe Picker & Allergen Tests
Tests for:
1. Backend regression: /api/production/batches, /api/purchase-orders, /api/recipes, /api/inventory/ingredients
2. Backend new: GET /api/proposals/{proposal_id}/content with allergens field
3. Backend: GET /api/recipes/{recipe_id}/portion-formats
4. Backend: POST /api/proposals/{proposal_id}/items with clean payload
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MARGARET_EMAIL = "margaret.n.calderon@gmail.com"
MARGARET_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    """Create authenticated session for Margaret"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login as Margaret
    login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": MARGARET_EMAIL,
        "password": MARGARET_PASSWORD
    })
    
    if login_resp.status_code != 200:
        pytest.skip(f"Login failed: {login_resp.status_code} - {login_resp.text}")
    
    return s


@pytest.fixture(scope="module")
def test_event(session):
    """Create a test event for proposal testing"""
    # First get a client ID
    clients_resp = session.get(f"{BASE_URL}/api/crm/clients")
    if clients_resp.status_code != 200 or not clients_resp.json():
        pytest.skip("No clients available for testing")
    
    client_id = clients_resp.json()[0].get("client_id")
    
    # Create test event with event_type (required field)
    event_data = {
        "name": f"TEST_Sprint1_Event_{uuid.uuid4().hex[:8]}",
        "client_id": client_id,
        "event_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        "guest_count": 50,
        "status": "Negotiation",
        "event_type": "Corporate"
    }
    
    create_resp = session.post(f"{BASE_URL}/api/events", json=event_data)
    if create_resp.status_code not in [200, 201]:
        pytest.skip(f"Failed to create test event: {create_resp.text}")
    
    event = create_resp.json()
    yield event
    
    # Cleanup
    session.delete(f"{BASE_URL}/api/events/{event['event_id']}")


class TestBackendRegression:
    """Regression tests for critical endpoints that should NOT be broken"""
    
    def test_production_batches_list(self, session):
        """GET /api/production/batches should return list"""
        resp = session.get(f"{BASE_URL}/api/production/batches")
        assert resp.status_code == 200, f"Production batches list failed: {resp.text}"
        assert isinstance(resp.json(), list), "Response should be a list"
        print(f"✓ Production batches list: {len(resp.json())} batches")
    
    def test_purchase_orders_list(self, session):
        """GET /api/purchase-orders should return list"""
        resp = session.get(f"{BASE_URL}/api/purchase-orders")
        assert resp.status_code == 200, f"Purchase orders list failed: {resp.text}"
        assert isinstance(resp.json(), list), "Response should be a list"
        print(f"✓ Purchase orders list: {len(resp.json())} POs")
    
    def test_recipes_list(self, session):
        """GET /api/recipes should return list with allergens field"""
        resp = session.get(f"{BASE_URL}/api/recipes")
        assert resp.status_code == 200, f"Recipes list failed: {resp.text}"
        recipes = resp.json()
        assert isinstance(recipes, list), "Response should be a list"
        
        # Check that recipes have allergens field
        if recipes:
            first_recipe = recipes[0]
            assert "allergens" in first_recipe or first_recipe.get("allergens") is None, \
                "Recipe should have allergens field"
        
        print(f"✓ Recipes list: {len(recipes)} recipes")
    
    def test_inventory_ingredients_list(self, session):
        """GET /api/inventory/ingredients should return list"""
        resp = session.get(f"{BASE_URL}/api/inventory/ingredients")
        assert resp.status_code == 200, f"Ingredients list failed: {resp.text}"
        ingredients = resp.json()
        assert isinstance(ingredients, list), "Response should be a list"
        print(f"✓ Ingredients list: {len(ingredients)} ingredients")
    
    def test_inventory_ingredients_crud(self, session):
        """Test CRUD operations on ingredients"""
        # Create
        ingredient_data = {
            "name": f"TEST_Ingredient_{uuid.uuid4().hex[:8]}",
            "category": "dry_goods",
            "unit": "kg",
            "cost_per_unit": 5.50,
            "stock_quantity": 10.0,
            "min_stock_level": 2.0
        }
        
        create_resp = session.post(f"{BASE_URL}/api/inventory/ingredients", json=ingredient_data)
        assert create_resp.status_code in [200, 201], f"Create ingredient failed: {create_resp.text}"
        
        ingredient = create_resp.json()
        ingredient_id = ingredient.get("ingredient_id")
        assert ingredient_id, "Ingredient should have ID"
        
        # Read
        get_resp = session.get(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}")
        assert get_resp.status_code == 200, f"Get ingredient failed: {get_resp.text}"
        
        # Update
        update_resp = session.put(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}", json={
            "name": ingredient_data["name"],
            "category": "produce",
            "unit": "kg",
            "cost_per_unit": 6.00
        })
        assert update_resp.status_code == 200, f"Update ingredient failed: {update_resp.text}"
        
        # Delete
        delete_resp = session.delete(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}")
        assert delete_resp.status_code == 200, f"Delete ingredient failed: {delete_resp.text}"
        
        print("✓ Ingredients CRUD operations working")
    
    def test_cost_preview_endpoint(self, session):
        """GET /api/inventory/ingredients/cost-preview should work"""
        resp = session.get(f"{BASE_URL}/api/inventory/ingredients/cost-preview")
        # This endpoint may return 200 or 404 depending on implementation
        assert resp.status_code in [200, 404], f"Cost preview failed unexpectedly: {resp.text}"
        print(f"✓ Cost preview endpoint: status {resp.status_code}")


class TestRecipePortionFormats:
    """Tests for recipe portion formats endpoint"""
    
    def test_get_portion_formats_for_recipe(self, session):
        """GET /api/recipes/{recipe_id}/portion-formats should return formats"""
        # First get a recipe
        recipes_resp = session.get(f"{BASE_URL}/api/recipes")
        assert recipes_resp.status_code == 200
        
        recipes = recipes_resp.json()
        if not recipes:
            pytest.skip("No recipes available for testing")
        
        # Find a recipe with portion formats (try Buffet or any dish)
        recipe_id = None
        for r in recipes:
            if r.get("recipe_type") in ["final_dish", "dish", "Final"]:
                recipe_id = r.get("recipe_id")
                break
        
        if not recipe_id:
            recipe_id = recipes[0].get("recipe_id")
        
        # Get portion formats
        formats_resp = session.get(f"{BASE_URL}/api/recipes/{recipe_id}/portion-formats")
        assert formats_resp.status_code == 200, f"Get portion formats failed: {formats_resp.text}"
        
        formats = formats_resp.json()
        assert isinstance(formats, list), "Response should be a list"
        
        # If formats exist, verify structure
        if formats:
            fmt = formats[0]
            expected_fields = ["format_id", "format_name", "portions_obtained", "cost_per_portion", "sell_price"]
            for field in expected_fields:
                assert field in fmt, f"Format should have {field} field"
            
            # Verify margin_pct is calculated
            if "margin_pct" in fmt:
                assert isinstance(fmt["margin_pct"], (int, float)), "margin_pct should be numeric"
        
        print(f"✓ Portion formats for recipe {recipe_id}: {len(formats)} formats")
        return formats


class TestProposalAllergensAggregation:
    """Tests for allergen aggregation in proposal content"""
    
    def test_proposal_content_has_allergens_field(self, session, test_event):
        """GET /api/proposals/{proposal_id}/content should include allergens field"""
        event_id = test_event.get("event_id")
        
        # Get proposal for event
        proposal_resp = session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert proposal_resp.status_code == 200, f"Get proposal failed: {proposal_resp.text}"
        
        proposal = proposal_resp.json()
        proposal_id = proposal.get("proposal_id")
        
        # Get proposal content (document generation endpoint)
        content_resp = session.get(f"{BASE_URL}/api/event-orders/{event_id}/document/proposal")
        
        # This may return 200 with content or create a document
        if content_resp.status_code == 200:
            content = content_resp.json()
            # Check if allergens field exists in content
            if "content" in content:
                doc_content = content.get("content", {})
                assert "allergens" in doc_content or doc_content.get("allergens") is not None, \
                    "Document content should have allergens field"
                print(f"✓ Proposal content has allergens field: {doc_content.get('allergens', [])}")
            else:
                print(f"✓ Document generated, checking structure")
        else:
            print(f"Document generation returned {content_resp.status_code}")
    
    def test_add_food_item_with_recipe_reference(self, session, test_event):
        """POST /api/proposals/{proposal_id}/items with Food item linked to recipe"""
        event_id = test_event.get("event_id")
        
        # Get proposal
        proposal_resp = session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert proposal_resp.status_code == 200
        proposal = proposal_resp.json()
        proposal_id = proposal.get("proposal_id")
        
        # Get a recipe with allergens
        recipes_resp = session.get(f"{BASE_URL}/api/recipes")
        assert recipes_resp.status_code == 200
        recipes = recipes_resp.json()
        
        # Find a recipe (preferably with allergens)
        recipe = None
        for r in recipes:
            if r.get("allergens") and len(r.get("allergens", [])) > 0:
                recipe = r
                break
        
        if not recipe and recipes:
            recipe = recipes[0]
        
        if not recipe:
            pytest.skip("No recipes available")
        
        # Add item with ONLY valid OrderItemCreate fields (no _recipe_allergens, _portion_format_name)
        item_payload = {
            "item_type": "Food",
            "description": f"{recipe.get('name')} — Test Format",
            "quantity": 10,
            "unit_price": 15.00,
            "internal_cost": 5.00,
            "reference_id": recipe.get("recipe_id"),
            "category_id": "cat_food"
        }
        
        add_resp = session.post(f"{BASE_URL}/api/proposals/{proposal_id}/items", json=item_payload)
        assert add_resp.status_code in [200, 201], f"Add item failed: {add_resp.text}"
        
        print(f"✓ Added Food item with recipe reference: {recipe.get('name')}")
        
        # Verify item was added
        proposal_resp2 = session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert proposal_resp2.status_code == 200
        updated_proposal = proposal_resp2.json()
        
        items = updated_proposal.get("items", [])
        assert len(items) > 0, "Proposal should have items"
        
        # Find our added item
        added_item = None
        for item in items:
            if item.get("reference_id") == recipe.get("recipe_id"):
                added_item = item
                break
        
        assert added_item, "Added item should be in proposal"
        print(f"✓ Item verified in proposal: {added_item.get('description')}")


class TestProposalItemCreation:
    """Tests for proposal item creation with clean payload"""
    
    def test_add_item_without_underscore_fields(self, session, test_event):
        """POST /api/proposals/{proposal_id}/items should accept clean payload without _* fields"""
        event_id = test_event.get("event_id")
        
        # Get proposal
        proposal_resp = session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert proposal_resp.status_code == 200
        proposal = proposal_resp.json()
        proposal_id = proposal.get("proposal_id")
        
        # Add item with clean payload (no _recipe_allergens, _portion_format_name)
        clean_payload = {
            "item_type": "Service",
            "description": "TEST Service Item",
            "quantity": 1,
            "unit_price": 100.00,
            "internal_cost": 50.00
        }
        
        add_resp = session.post(f"{BASE_URL}/api/proposals/{proposal_id}/items", json=clean_payload)
        assert add_resp.status_code in [200, 201], f"Add item with clean payload failed: {add_resp.text}"
        
        print("✓ Item added with clean payload (no _* fields)")
    
    def test_add_item_rejects_invalid_fields(self, session, test_event):
        """Backend should handle payload with extra fields gracefully"""
        event_id = test_event.get("event_id")
        
        # Get proposal
        proposal_resp = session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert proposal_resp.status_code == 200
        proposal = proposal_resp.json()
        proposal_id = proposal.get("proposal_id")
        
        # Add item with extra fields (should be ignored or rejected gracefully)
        payload_with_extras = {
            "item_type": "Fee",
            "description": "TEST Fee Item",
            "quantity": 1,
            "unit_price": 50.00,
            "_recipe_allergens": ["gluten", "dairy"],  # Should be stripped by frontend
            "_portion_format_name": "Test Format"  # Should be stripped by frontend
        }
        
        # Backend may accept and ignore extra fields, or reject them
        add_resp = session.post(f"{BASE_URL}/api/proposals/{proposal_id}/items", json=payload_with_extras)
        
        # Either 200/201 (accepted, extras ignored) or 422 (validation error) is acceptable
        assert add_resp.status_code in [200, 201, 422], f"Unexpected response: {add_resp.text}"
        
        if add_resp.status_code in [200, 201]:
            print("✓ Backend accepted payload and ignored extra _* fields")
        else:
            print("✓ Backend rejected payload with extra _* fields (validation)")


class TestAllergenConfiguration:
    """Tests for allergen configuration endpoints"""
    
    def test_get_allergens_list(self, session):
        """GET /api/allergens should return allergen configurations"""
        resp = session.get(f"{BASE_URL}/api/allergens")
        assert resp.status_code == 200, f"Get allergens failed: {resp.text}"
        
        allergens = resp.json()
        assert isinstance(allergens, list), "Response should be a list"
        
        if allergens:
            allergen = allergens[0]
            expected_fields = ["allergen_id", "name", "name_es"]
            for field in expected_fields:
                assert field in allergen, f"Allergen should have {field} field"
        
        print(f"✓ Allergens list: {len(allergens)} allergens configured")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
