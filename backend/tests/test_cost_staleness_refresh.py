"""
Test suite for Cost Staleness Detection and Refresh feature (Iteration 160)
Tests:
- GET /api/proposals/{id}/cost-staleness
- POST /api/proposals/{id}/refresh-costs
- Protection for non-Draft proposals
- Regression tests for related endpoints
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestCostStalenessRefresh:
    """Test suite for cost staleness detection and refresh functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Store test data IDs for cleanup
        self.created_recipes = []
        self.created_ingredients = []
        self.created_events = []
        self.created_proposals = []
        self.created_order_items = []
        
        yield
        
        # Cleanup
        self._cleanup()
    
    def _cleanup(self):
        """Clean up test data"""
        # Delete order items
        for item_id in self.created_order_items:
            try:
                if self.created_proposals:
                    self.session.delete(f"{BASE_URL}/api/proposals/{self.created_proposals[0]}/items/{item_id}")
            except Exception:
                pass
        
        # Delete proposals (via event deletion)
        for event_id in self.created_events:
            try:
                self.session.delete(f"{BASE_URL}/api/events/{event_id}")
            except Exception:
                pass
        
        # Delete recipes
        for recipe_id in self.created_recipes:
            try:
                self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
            except Exception:
                pass
        
        # Delete ingredients
        for ing_id in self.created_ingredients:
            try:
                self.session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}")
            except Exception:
                pass
    
    def _create_test_ingredient(self, name_suffix=""):
        """Create a test ingredient"""
        unique_id = uuid.uuid4().hex[:8]
        response = self.session.post(
            f"{BASE_URL}/api/inventory/ingredients",
            json={
                "name": f"Staleness_Test_Ingredient_{unique_id}{name_suffix}",
                "category": "produce",
                "unit": "kg",
                "cost_per_unit": 5.0,
                "stock_quantity": 100
            }
        )
        assert response.status_code in [200, 201], f"Failed to create ingredient: {response.text}"
        data = response.json()
        self.created_ingredients.append(data["ingredient_id"])
        return data
    
    def _create_test_recipe(self, ingredient_id, name_suffix=""):
        """Create a test recipe using the ingredient (cost derived from ingredient cost_per_unit)"""
        unique_id = uuid.uuid4().hex[:8]
        response = self.session.post(
            f"{BASE_URL}/api/recipes",
            json={
                "name": f"Staleness_Test_Recipe_{unique_id}{name_suffix}",
                "category": "Main",
                "yield_quantity": 1,
                "yield_unit": "portion",
                "ingredients": [
                    {
                        "item_id": ingredient_id,
                        "item_type": "ingredient",
                        "quantity": 1,
                        "unit": "kg"
                    }
                ],
                "default_portion_price": 15.0
            }
        )
        assert response.status_code in [200, 201], f"Failed to create recipe: {response.text}"
        data = response.json()
        self.created_recipes.append(data["recipe_id"])
        return data
    
    def _get_or_create_client(self):
        """Get an existing client or create one for testing"""
        # Try to get existing clients
        response = self.session.get(f"{BASE_URL}/api/crm/clients")
        if response.status_code == 200:
            clients = response.json()
            if clients:
                return clients[0]["client_id"]
        
        # Create a new client if none exist
        unique_id = uuid.uuid4().hex[:8]
        response = self.session.post(
            f"{BASE_URL}/api/crm/clients",
            json={
                "name": f"Staleness_Test_Client_{unique_id}",
                "email": f"test_{unique_id}@example.com",
                "phone": "555-0100"
            }
        )
        if response.status_code in [200, 201]:
            return response.json()["client_id"]
        return None
    
    def _create_test_event_with_proposal(self):
        """Create a test event which auto-creates a proposal"""
        client_id = self._get_or_create_client()
        unique_id = uuid.uuid4().hex[:8]
        response = self.session.post(
            f"{BASE_URL}/api/events",
            json={
                "name": f"Staleness_Test_Event_{unique_id}",
                "event_date": "2026-03-15",
                "event_type": "Corporate",
                "guest_count": 50,
                "status": "Lead",
                "client_id": client_id
            }
        )
        if response.status_code == 403 and "límite" in response.text:
            pytest.skip("Event creation limit reached - skipping test")
        assert response.status_code in [200, 201], f"Failed to create event: {response.text}"
        event = response.json()
        self.created_events.append(event["event_id"])
        
        # Get the auto-created proposal
        prop_response = self.session.get(f"{BASE_URL}/api/proposals/event/{event['event_id']}")
        assert prop_response.status_code == 200, f"Failed to get proposal: {prop_response.text}"
        proposal = prop_response.json()
        self.created_proposals.append(proposal["proposal_id"])
        
        return event, proposal
    
    def _add_food_item_to_proposal(self, proposal_id, recipe_id, internal_cost, unit_price=30.0, quantity=10):
        """Add a Food order item to proposal"""
        response = self.session.post(
            f"{BASE_URL}/api/proposals/{proposal_id}/items",
            json={
                "item_type": "Food",
                "description": f"Test Food Item - Recipe {recipe_id}",
                "reference_id": recipe_id,
                "quantity": quantity,
                "unit_price": unit_price,
                "internal_cost": internal_cost
            }
        )
        assert response.status_code in [200, 201], f"Failed to add item: {response.text}"
        data = response.json()
        self.created_order_items.append(data["item_id"])
        return data
    
    def _update_ingredient_cost(self, ingredient_id, new_cost_per_unit):
        """Update ingredient cost which triggers recipe recalculation"""
        # First get the ingredient
        get_response = self.session.get(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}")
        assert get_response.status_code == 200
        ingredient = get_response.json()
        
        # Update with new cost
        update_response = self.session.put(
            f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}",
            json={
                "name": ingredient["name"],
                "category": ingredient.get("category", "produce"),
                "unit": ingredient.get("unit", "kg"),
                "cost_per_unit": new_cost_per_unit,
                "stock_quantity": ingredient.get("stock_quantity", 100)
            }
        )
        assert update_response.status_code == 200, f"Failed to update ingredient: {update_response.text}"
        return update_response.json()
    
    # ==================== COST STALENESS TESTS ====================
    
    def test_01_cost_staleness_no_food_items_returns_not_stale(self):
        """Proposal without Food OrderItems returns is_stale=false, stale_count=0"""
        event, proposal = self._create_test_event_with_proposal()
        
        # Add a Service item (not Food)
        self.session.post(
            f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/items",
            json={
                "item_type": "Service",
                "description": "Test Service",
                "quantity": 1,
                "unit_price": 100.0
            }
        )
        
        # Check staleness
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_stale"] == False
        assert data["stale_count"] == 0
        assert data["can_refresh"] == True  # Draft proposal
        print("PASS: Proposal without Food items returns is_stale=false")
    
    def test_02_cost_staleness_detects_changed_recipe_cost(self):
        """Food OrderItem with changed recipe cost is detected as stale"""
        # Create ingredient with cost 1.0
        ingredient = self._create_test_ingredient()
        # Update ingredient to have cost 1.0
        self._update_ingredient_cost(ingredient["ingredient_id"], 1.0)
        
        # Create recipe (cost will be 1.0 from ingredient)
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        
        # Verify recipe cost
        recipe_resp = self.session.get(f"{BASE_URL}/api/recipes/{recipe['recipe_id']}")
        recipe_data = recipe_resp.json()
        initial_cost = recipe_data.get("cost_per_portion", 0)
        
        # Create event and proposal
        event, proposal = self._create_test_event_with_proposal()
        
        # Add Food item with snapshot cost
        item = self._add_food_item_to_proposal(
            proposal["proposal_id"],
            recipe["recipe_id"],
            internal_cost=initial_cost,
            unit_price=5.0,
            quantity=10
        )
        
        # Update ingredient cost to 3.0 (triggers recipe recalc)
        self._update_ingredient_cost(ingredient["ingredient_id"], 3.0)
        
        # Check staleness
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_stale"] == True
        assert data["stale_count"] == 1
        assert len(data["stale_items"]) == 1
        
        stale_item = data["stale_items"][0]
        assert stale_item["snapshot_cost"] == initial_cost
        assert stale_item["current_cost"] == 3.0
        assert "diff_amount" in stale_item
        assert "diff_pct" in stale_item
        assert "quantity" in stale_item
        assert "unit_price" in stale_item
        print(f"PASS: Stale cost detected - snapshot: {stale_item['snapshot_cost']}, current: {stale_item['current_cost']}, diff_pct: {stale_item['diff_pct']}%")
    
    def test_03_cost_staleness_ignores_non_food_items(self):
        """Non-Food items are ignored in staleness check"""
        event, proposal = self._create_test_event_with_proposal()
        
        # Add Service, Rental, Fee items
        for item_type in ["Service", "Rental", "Fee"]:
            self.session.post(
                f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/items",
                json={
                    "item_type": item_type,
                    "description": f"Test {item_type}",
                    "quantity": 1,
                    "unit_price": 100.0,
                    "internal_cost": 50.0
                }
            )
        
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_stale"] == False
        assert data["stale_count"] == 0
        print("PASS: Non-Food items are ignored in staleness check")
    
    def test_04_cost_staleness_ignores_food_without_reference_id(self):
        """Food items without reference_id are ignored"""
        event, proposal = self._create_test_event_with_proposal()
        
        # Add Food item without reference_id
        self.session.post(
            f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/items",
            json={
                "item_type": "Food",
                "description": "Custom Food Item",
                "quantity": 10,
                "unit_price": 25.0,
                "internal_cost": 10.0
                # No reference_id
            }
        )
        
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_stale"] == False
        assert data["stale_count"] == 0
        print("PASS: Food items without reference_id are ignored")
    
    def test_05_cost_staleness_sorted_by_diff_pct_desc(self):
        """Stale items are sorted by |diff_pct| descending"""
        # Create ingredients with different costs
        ing1 = self._create_test_ingredient("_1")
        ing2 = self._create_test_ingredient("_2")
        ing3 = self._create_test_ingredient("_3")
        
        # Set initial costs
        self._update_ingredient_cost(ing1["ingredient_id"], 1.0)
        self._update_ingredient_cost(ing2["ingredient_id"], 2.0)
        self._update_ingredient_cost(ing3["ingredient_id"], 5.0)
        
        recipe1 = self._create_test_recipe(ing1["ingredient_id"], name_suffix="_1")
        recipe2 = self._create_test_recipe(ing2["ingredient_id"], name_suffix="_2")
        recipe3 = self._create_test_recipe(ing3["ingredient_id"], name_suffix="_3")
        
        event, proposal = self._create_test_event_with_proposal()
        
        # Add items with snapshot costs (matching initial ingredient costs)
        self._add_food_item_to_proposal(proposal["proposal_id"], recipe1["recipe_id"], internal_cost=1.0)
        self._add_food_item_to_proposal(proposal["proposal_id"], recipe2["recipe_id"], internal_cost=2.0)
        self._add_food_item_to_proposal(proposal["proposal_id"], recipe3["recipe_id"], internal_cost=5.0)
        
        # Update ingredients with different % changes
        self._update_ingredient_cost(ing1["ingredient_id"], 3.0)   # 200% increase
        self._update_ingredient_cost(ing2["ingredient_id"], 2.5)   # 25% increase
        self._update_ingredient_cost(ing3["ingredient_id"], 6.0)   # 20% increase
        
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_stale"] == True
        assert data["stale_count"] == 3
        
        # Verify sorted by |diff_pct| desc
        stale_items = data["stale_items"]
        assert abs(stale_items[0]["diff_pct"]) >= abs(stale_items[1]["diff_pct"])
        assert abs(stale_items[1]["diff_pct"]) >= abs(stale_items[2]["diff_pct"])
        print(f"PASS: Stale items sorted by |diff_pct| desc: {[s['diff_pct'] for s in stale_items]}")
    
    def test_06_can_refresh_true_only_for_draft(self):
        """can_refresh=true only for Draft proposals"""
        ingredient = self._create_test_ingredient()
        self._update_ingredient_cost(ingredient["ingredient_id"], 1.0)
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        event, proposal = self._create_test_event_with_proposal()
        
        # Add item with snapshot cost
        self._add_food_item_to_proposal(proposal["proposal_id"], recipe["recipe_id"], internal_cost=1.0)
        
        # Update ingredient to make stale
        self._update_ingredient_cost(ingredient["ingredient_id"], 2.0)
        
        # Check Draft status
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.status_code == 200
        data = response.json()
        assert data["can_refresh"] == True
        assert data["status"] == "Draft"
        assert data["is_stale"] == True
        print("PASS: can_refresh=true for Draft proposal")
        
        # Change to Sent
        self.session.put(
            f"{BASE_URL}/api/proposals/{proposal['proposal_id']}",
            json={"status": "Sent"}
        )
        
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        data = response.json()
        assert data["can_refresh"] == False
        assert data["is_stale"] == True  # Still stale, just can't refresh
        print("PASS: can_refresh=false for Sent proposal (is_stale still true)")
    
    # ==================== REFRESH COSTS TESTS ====================
    
    def test_07_refresh_costs_updates_internal_cost_only(self):
        """POST refresh-costs updates internal_cost but NOT unit_price"""
        ingredient = self._create_test_ingredient()
        self._update_ingredient_cost(ingredient["ingredient_id"], 1.0)
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        event, proposal = self._create_test_event_with_proposal()
        
        original_unit_price = 5.0
        item = self._add_food_item_to_proposal(
            proposal["proposal_id"],
            recipe["recipe_id"],
            internal_cost=1.0,
            unit_price=original_unit_price,
            quantity=10
        )
        
        # Update ingredient cost (triggers recipe recalc)
        self._update_ingredient_cost(ingredient["ingredient_id"], 3.0)
        
        # Refresh costs
        response = self.session.post(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/refresh-costs")
        assert response.status_code == 200
        data = response.json()
        assert data["refreshed_count"] == 1
        
        # Verify item was updated
        prop_response = self.session.get(f"{BASE_URL}/api/proposals/event/{event['event_id']}")
        updated_proposal = prop_response.json()
        
        updated_item = next((i for i in updated_proposal["items"] if i["item_id"] == item["item_id"]), None)
        assert updated_item is not None
        assert updated_item["internal_cost"] == 3.0  # Updated
        assert updated_item["unit_price"] == original_unit_price  # NOT changed
        assert updated_item["total_cost"] == 30.0  # 10 * 3.0
        print("PASS: refresh-costs updates internal_cost but preserves unit_price")
    
    def test_08_refresh_costs_blocked_for_non_draft(self):
        """POST refresh-costs returns 400 for non-Draft proposals"""
        ingredient = self._create_test_ingredient()
        self._update_ingredient_cost(ingredient["ingredient_id"], 1.0)
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        event, proposal = self._create_test_event_with_proposal()
        
        self._add_food_item_to_proposal(proposal["proposal_id"], recipe["recipe_id"], internal_cost=1.0)
        self._update_ingredient_cost(ingredient["ingredient_id"], 2.0)
        
        # Test each non-Draft status
        for status in ["Sent", "Accepted", "Rejected"]:
            # Change status
            self.session.put(
                f"{BASE_URL}/api/proposals/{proposal['proposal_id']}",
                json={"status": status}
            )
            
            # Try to refresh
            response = self.session.post(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/refresh-costs")
            assert response.status_code == 400, f"Expected 400 for {status}, got {response.status_code}"
            assert "Only Draft proposals can refresh costs" in response.json().get("detail", "")
            print(f"PASS: refresh-costs blocked for {status} proposal")
        
        # Verify items were NOT modified (internal_cost should still be 1.0)
        prop_response = self.session.get(f"{BASE_URL}/api/proposals/event/{event['event_id']}")
        updated_proposal = prop_response.json()
        item = updated_proposal["items"][0]
        assert item["internal_cost"] == 1.0  # Still original
        print("PASS: OrderItems NOT modified when refresh blocked")
    
    def test_09_refresh_costs_updates_margin_fields(self):
        """refresh-costs updates total_cost, margin_amount, margin_percentage"""
        ingredient = self._create_test_ingredient()
        self._update_ingredient_cost(ingredient["ingredient_id"], 1.0)
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        event, proposal = self._create_test_event_with_proposal()
        
        item = self._add_food_item_to_proposal(
            proposal["proposal_id"],
            recipe["recipe_id"],
            internal_cost=1.0,
            unit_price=10.0,
            quantity=5
        )
        
        # Update ingredient cost
        self._update_ingredient_cost(ingredient["ingredient_id"], 4.0)
        
        # Refresh
        self.session.post(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/refresh-costs")
        
        # Verify margin calculations
        prop_response = self.session.get(f"{BASE_URL}/api/proposals/event/{event['event_id']}")
        updated_item = next(i for i in prop_response.json()["items"] if i["item_id"] == item["item_id"])
        
        # total_price = 5 * 10 = 50
        # total_cost = 5 * 4 = 20
        # margin_amount = 50 - 20 = 30
        # margin_percentage = 30/50 * 100 = 60%
        assert updated_item["total_cost"] == 20.0
        assert updated_item["margin_amount"] == 30.0
        assert abs(updated_item["margin_percentage"] - 60.0) < 0.1
        print("PASS: refresh-costs updates margin fields correctly")
    
    def test_10_after_refresh_staleness_is_false(self):
        """After refresh-costs, GET cost-staleness returns is_stale=false"""
        ingredient = self._create_test_ingredient()
        self._update_ingredient_cost(ingredient["ingredient_id"], 1.0)
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        event, proposal = self._create_test_event_with_proposal()
        
        self._add_food_item_to_proposal(proposal["proposal_id"], recipe["recipe_id"], internal_cost=1.0)
        self._update_ingredient_cost(ingredient["ingredient_id"], 2.0)
        
        # Verify stale before refresh
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        assert response.json()["is_stale"] == True
        
        # Refresh
        self.session.post(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/refresh-costs")
        
        # Verify not stale after refresh
        response = self.session.get(f"{BASE_URL}/api/proposals/{proposal['proposal_id']}/cost-staleness")
        data = response.json()
        assert data["is_stale"] == False
        assert data["stale_count"] == 0
        print("PASS: After refresh, is_stale=false")
    
    # ==================== REGRESSION TESTS ====================
    
    def test_11_regression_recipes_crud(self):
        """Regression: Recipes CRUD still works"""
        ingredient = self._create_test_ingredient()
        
        # Create
        recipe = self._create_test_recipe(ingredient["ingredient_id"])
        assert recipe["recipe_id"] is not None
        
        # Read
        response = self.session.get(f"{BASE_URL}/api/recipes/{recipe['recipe_id']}")
        assert response.status_code == 200
        
        # Update
        response = self.session.put(
            f"{BASE_URL}/api/recipes/{recipe['recipe_id']}",
            json={
                "name": recipe["name"] + "_updated",
                "category": recipe["category"],
                "yield_quantity": 1,
                "yield_unit": "portion"
            }
        )
        assert response.status_code == 200
        
        # List
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        print("PASS: Recipes CRUD regression")
    
    def test_12_regression_proposals_crud(self):
        """Regression: Proposals CRUD still works"""
        event, proposal = self._create_test_event_with_proposal()
        
        # Read
        response = self.session.get(f"{BASE_URL}/api/proposals/event/{event['event_id']}")
        assert response.status_code == 200
        
        # Update
        response = self.session.put(
            f"{BASE_URL}/api/proposals/{proposal['proposal_id']}",
            json={"client_notes": "Test notes"}
        )
        assert response.status_code == 200
        print("PASS: Proposals CRUD regression")
    
    def test_13_regression_inventory_crud(self):
        """Regression: Inventory CRUD still works"""
        # Create
        ingredient = self._create_test_ingredient()
        
        # Read
        response = self.session.get(f"{BASE_URL}/api/inventory/ingredients/{ingredient['ingredient_id']}")
        assert response.status_code == 200
        
        # Update
        response = self.session.put(
            f"{BASE_URL}/api/inventory/ingredients/{ingredient['ingredient_id']}",
            json={
                "name": ingredient["name"] + "_updated",
                "category": "produce",
                "unit": "kg",
                "cost_per_unit": 6.0
            }
        )
        assert response.status_code == 200
        
        # List
        response = self.session.get(f"{BASE_URL}/api/inventory")
        assert response.status_code == 200
        print("PASS: Inventory CRUD regression")
    
    def test_14_regression_production_batches(self):
        """Regression: Production batches GET works"""
        response = self.session.get(f"{BASE_URL}/api/production/batches")
        assert response.status_code == 200
        print("PASS: Production batches GET regression")
    
    def test_15_regression_purchase_orders(self):
        """Regression: Purchase orders GET works"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200
        print("PASS: Purchase orders GET regression")
    
    def test_16_regression_public_catalog(self):
        """Regression: Public catalog endpoints work"""
        # Get company settings for catalog slug
        response = self.session.get(f"{BASE_URL}/api/settings/company")
        if response.status_code == 200:
            company = response.json()
            slug = company.get("catalog_slug")
            if slug:
                response = self.session.get(f"{BASE_URL}/api/public/catalog/{slug}")
                # May return 404 if not published, but endpoint should work
                assert response.status_code in [200, 404]
        print("PASS: Public catalog regression")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
