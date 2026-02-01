"""
Test Production Needs (PN) functionality
- Tests /api/events/generate-purchase-list endpoint for production_needs
- Tests /api/production/suggest-from-events endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"

# Known event IDs from context
EVENT_BODA_ID = "event_c35238fcb131"  # Evento Demo - Boda (has Food items with sub-recipes)
EVENT_PRUEBA_ID = "event_3bda405e212a"  # Evento de Prueba con Horario


class TestProductionNeeds:
    """Test Production Needs functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        # Store token if returned
        data = login_response.json()
        if "access_token" in data:
            self.session.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    
    def test_generate_purchase_list_returns_production_needs(self):
        """Test that generate-purchase-list returns production_needs array"""
        response = self.session.post(f"{BASE_URL}/api/events/generate-purchase-list", json={
            "event_ids": [EVENT_BODA_ID],
            "include_buffer": True,
            "compare_inventory": True
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "events" in data, "Response should contain 'events'"
        assert "stock_requisition" in data, "Response should contain 'stock_requisition'"
        assert "purchase_list" in data, "Response should contain 'purchase_list'"
        assert "production_needs" in data, "Response should contain 'production_needs'"
        assert "total_cost" in data, "Response should contain 'total_cost'"
        assert "production_total_cost" in data, "Response should contain 'production_total_cost'"
        
        print(f"Events: {len(data.get('events', []))}")
        print(f"Stock Requisition items: {len(data.get('stock_requisition', []))}")
        print(f"Purchase List items: {len(data.get('purchase_list', []))}")
        print(f"Production Needs items: {len(data.get('production_needs', []))}")
        print(f"Total Cost: ${data.get('total_cost', 0)}")
        print(f"Production Total Cost: ${data.get('production_total_cost', 0)}")
    
    def test_production_needs_structure(self):
        """Test that production_needs items have correct structure"""
        response = self.session.post(f"{BASE_URL}/api/events/generate-purchase-list", json={
            "event_ids": [EVENT_BODA_ID],
            "include_buffer": True,
            "compare_inventory": True
        })
        
        assert response.status_code == 200
        data = response.json()
        
        production_needs = data.get("production_needs", [])
        
        if len(production_needs) > 0:
            # Check structure of first item
            item = production_needs[0]
            
            assert "recipe_id" in item, "Production need should have recipe_id"
            assert "recipe_name" in item, "Production need should have recipe_name"
            assert "recipe_type" in item, "Production need should have recipe_type"
            assert "qty_needed" in item, "Production need should have qty_needed"
            assert "in_stock" in item, "Production need should have in_stock"
            assert "to_produce" in item, "Production need should have to_produce"
            assert "unit" in item, "Production need should have unit"
            assert "total_cost" in item, "Production need should have total_cost"
            
            # Verify recipe_type is BASE or COMPONENT
            assert item["recipe_type"] in ["base", "component"], f"Recipe type should be base or component, got {item['recipe_type']}"
            
            print(f"\nFirst Production Need:")
            print(f"  Recipe: {item.get('recipe_name')}")
            print(f"  Type: {item.get('recipe_type')}")
            print(f"  Qty Needed: {item.get('qty_needed')} {item.get('unit')}")
            print(f"  In Stock: {item.get('in_stock')}")
            print(f"  To Produce: {item.get('to_produce')}")
            print(f"  Total Cost: ${item.get('total_cost')}")
            print(f"  Dishes Using: {item.get('dishes_using', [])}")
        else:
            print("No production needs found - this may be expected if no BASE/COMPONENT sub-recipes exist")
    
    def test_suggest_production_from_events_endpoint(self):
        """Test /api/production/suggest-from-events endpoint"""
        response = self.session.post(f"{BASE_URL}/api/production/suggest-from-events", json={
            "event_ids": [EVENT_BODA_ID]
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "suggested_lines" in data, "Response should contain 'suggested_lines'"
        assert "events" in data, "Response should contain 'events'"
        
        suggested_lines = data.get("suggested_lines", [])
        print(f"\nSuggested Production Lines: {len(suggested_lines)}")
        
        for line in suggested_lines:
            print(f"  - {line.get('recipe_name')} ({line.get('recipe_type')}): {line.get('qty_needed')} {line.get('yield_unit')}")
            print(f"    Events using: {line.get('events_using', [])}")
    
    def test_suggest_production_line_structure(self):
        """Test that suggested_lines have correct structure"""
        response = self.session.post(f"{BASE_URL}/api/production/suggest-from-events", json={
            "event_ids": [EVENT_BODA_ID]
        })
        
        assert response.status_code == 200
        data = response.json()
        
        suggested_lines = data.get("suggested_lines", [])
        
        if len(suggested_lines) > 0:
            line = suggested_lines[0]
            
            assert "recipe_id" in line, "Suggested line should have recipe_id"
            assert "recipe_name" in line, "Suggested line should have recipe_name"
            assert "recipe_type" in line, "Suggested line should have recipe_type"
            assert "qty_needed" in line, "Suggested line should have qty_needed"
            assert "yield_unit" in line, "Suggested line should have yield_unit"
            assert "events_using" in line, "Suggested line should have events_using"
            
            # Verify recipe_type is BASE or COMPONENT
            assert line["recipe_type"] in ["base", "component"], f"Recipe type should be base or component, got {line['recipe_type']}"
            
            print(f"\nFirst Suggested Line Structure:")
            print(f"  recipe_id: {line.get('recipe_id')}")
            print(f"  recipe_name: {line.get('recipe_name')}")
            print(f"  recipe_type: {line.get('recipe_type')}")
            print(f"  qty_needed: {line.get('qty_needed')}")
            print(f"  yield_unit: {line.get('yield_unit')}")
            print(f"  cost_per_yield: {line.get('cost_per_yield')}")
            print(f"  events_using: {line.get('events_using')}")
        else:
            print("No suggested lines found - checking if event has Food items with sub-recipes")
    
    def test_suggest_production_empty_events(self):
        """Test suggest-from-events with empty event_ids"""
        response = self.session.post(f"{BASE_URL}/api/production/suggest-from-events", json={
            "event_ids": []
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("suggested_lines") == [], "Empty event_ids should return empty suggested_lines"
        print("Empty event_ids correctly returns empty suggested_lines")
    
    def test_suggest_production_multiple_events(self):
        """Test suggest-from-events with multiple events"""
        response = self.session.post(f"{BASE_URL}/api/production/suggest-from-events", json={
            "event_ids": [EVENT_BODA_ID, EVENT_PRUEBA_ID]
        })
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\nMultiple Events Test:")
        print(f"  Events processed: {len(data.get('events', []))}")
        print(f"  Suggested lines: {len(data.get('suggested_lines', []))}")
        
        for line in data.get("suggested_lines", []):
            print(f"  - {line.get('recipe_name')}: {line.get('qty_needed')} {line.get('yield_unit')}")
    
    def test_event_has_food_items_with_recipes(self):
        """Verify the test event has Food items with recipes"""
        # Get event details
        response = self.session.get(f"{BASE_URL}/api/events/{EVENT_BODA_ID}")
        
        if response.status_code != 200:
            pytest.skip(f"Event {EVENT_BODA_ID} not found")
        
        event = response.json()
        print(f"\nEvent: {event.get('name')}")
        print(f"  Stage: {event.get('stage')}")
        print(f"  Guest Count: {event.get('guest_count')}")
        
        # Get proposal for this event
        proposals_response = self.session.get(f"{BASE_URL}/api/proposals?event_id={EVENT_BODA_ID}")
        
        if proposals_response.status_code == 200:
            proposals = proposals_response.json()
            if proposals:
                proposal = proposals[0] if isinstance(proposals, list) else proposals
                proposal_id = proposal.get("proposal_id")
                print(f"  Proposal ID: {proposal_id}")
                
                # Get order items
                items_response = self.session.get(f"{BASE_URL}/api/event-orders/{EVENT_BODA_ID}/items")
                if items_response.status_code == 200:
                    items = items_response.json()
                    food_items = [i for i in items if i.get("item_type") == "Food"]
                    print(f"  Food Items: {len(food_items)}")
                    
                    for item in food_items[:5]:  # Show first 5
                        print(f"    - {item.get('description')}: reference_id={item.get('reference_id')}")
    
    def test_recipe_has_sub_recipes(self):
        """Check if recipes have sub-recipes (BASE/COMPONENT)"""
        # Get all recipes
        response = self.session.get(f"{BASE_URL}/api/recipes")
        
        assert response.status_code == 200
        recipes = response.json()
        
        recipes_with_sub = [r for r in recipes if r.get("sub_recipes")]
        base_recipes = [r for r in recipes if r.get("recipe_type") == "base"]
        component_recipes = [r for r in recipes if r.get("recipe_type") == "component"]
        
        print(f"\nRecipe Analysis:")
        print(f"  Total Recipes: {len(recipes)}")
        print(f"  Recipes with sub-recipes: {len(recipes_with_sub)}")
        print(f"  BASE recipes: {len(base_recipes)}")
        print(f"  COMPONENT recipes: {len(component_recipes)}")
        
        if base_recipes:
            print(f"\n  BASE Recipes:")
            for r in base_recipes[:5]:
                print(f"    - {r.get('name')} (ID: {r.get('recipe_id')})")
        
        if component_recipes:
            print(f"\n  COMPONENT Recipes:")
            for r in component_recipes[:5]:
                print(f"    - {r.get('name')} (ID: {r.get('recipe_id')})")
        
        if recipes_with_sub:
            print(f"\n  Recipes with Sub-recipes:")
            for r in recipes_with_sub[:5]:
                print(f"    - {r.get('name')}: {len(r.get('sub_recipes', []))} sub-recipes")
                for sub in r.get("sub_recipes", [])[:3]:
                    print(f"      * {sub.get('child_recipe_name', sub.get('recipe_name', 'Unknown'))}")


class TestProductionBatchCreation:
    """Test Production Batch creation from suggestions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        data = login_response.json()
        if "access_token" in data:
            self.session.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    
    def test_create_production_batch_endpoint_exists(self):
        """Test that production batch creation endpoint exists"""
        # First get suggestions
        suggest_response = self.session.post(f"{BASE_URL}/api/production/suggest-from-events", json={
            "event_ids": [EVENT_BODA_ID]
        })
        
        assert suggest_response.status_code == 200
        suggestions = suggest_response.json()
        
        if not suggestions.get("suggested_lines"):
            pytest.skip("No suggested lines to create batch from")
        
        # Try to create a batch (we'll use a test prefix to identify it)
        lines = []
        for line in suggestions.get("suggested_lines", [])[:2]:  # Only first 2 lines
            lines.append({
                "recipe_id": line.get("recipe_id"),
                "target_output_qty": 1,  # Minimal qty for test
                "output_unit": line.get("yield_unit", "batch")
            })
        
        if not lines:
            pytest.skip("No lines to create batch")
        
        response = self.session.post(f"{BASE_URL}/api/production/batches", json={
            "linked_event_id": EVENT_BODA_ID,
            "notes": "TEST_BATCH - Created by automated test",
            "lines": lines
        })
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        batch = response.json()
        print(f"\nCreated Production Batch:")
        print(f"  Batch ID: {batch.get('batch_id')}")
        print(f"  Batch Number: {batch.get('batch_number')}")
        print(f"  Status: {batch.get('status')}")
        print(f"  Lines: {len(batch.get('lines', []))}")
        
        # Cleanup - delete the test batch
        if batch.get("batch_id"):
            delete_response = self.session.delete(f"{BASE_URL}/api/production/batches/{batch.get('batch_id')}")
            print(f"  Cleanup: Deleted test batch (status: {delete_response.status_code})")
    
    def test_get_production_batches(self):
        """Test getting production batches list"""
        response = self.session.get(f"{BASE_URL}/api/production/batches")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        batches = response.json()
        print(f"\nExisting Production Batches: {len(batches)}")
        
        for batch in batches[:5]:
            print(f"  - {batch.get('batch_number')}: {batch.get('status')} ({len(batch.get('lines', []))} lines)")


class TestConfirmedEventsEndpoint:
    """Test confirmed events endpoint used by Consolidated Purchase Section"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        data = login_response.json()
        if "access_token" in data:
            self.session.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    
    def test_confirmed_events_endpoint(self):
        """Test /api/events/confirmed endpoint"""
        response = self.session.get(f"{BASE_URL}/api/events/confirmed")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        events = response.json()
        print(f"\nConfirmed Events: {len(events)}")
        
        committed_events = [e for e in events if e.get("stage") == "Committed"]
        print(f"  Committed stage: {len(committed_events)}")
        
        for event in events[:5]:
            print(f"  - {event.get('name')}: stage={event.get('stage')}, procurement_status={event.get('procurement_status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
