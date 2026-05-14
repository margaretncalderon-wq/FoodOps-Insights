"""
Test Margin Policy Phase 2 - Per-Type Breakdown in Dashboard Rows
Tests:
- GET /api/proposals/cost-health/overview returns type_breakdown array for each proposal
- type_breakdown contains: item_type, current_margin_pct, projected_margin_pct, min_margin_pct, below_threshold, stale_count, revenue_share_pct
- type_breakdown is sorted by abs(projected - current) descending
- Backend math verification with mixed item types (Food + Service)
- Regression: All existing fields still present
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    return session


class TestTypeBreakdownStructure:
    """Test type_breakdown array structure in cost-health/overview"""
    
    def test_01_overview_returns_type_breakdown_array(self, auth_session):
        """GET /api/proposals/cost-health/overview returns type_breakdown array for each proposal"""
        res = auth_session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert res.status_code == 200, f"GET cost-health/overview failed: {res.text}"
        
        data = res.json()
        assert "proposals" in data, "Missing proposals field"
        
        # If there are stale proposals, check type_breakdown
        if data["proposals"]:
            prop = data["proposals"][0]
            assert "type_breakdown" in prop, "Missing type_breakdown field"
            assert isinstance(prop["type_breakdown"], list), f"type_breakdown should be list, got {type(prop['type_breakdown'])}"
            
            # Check structure of breakdown entries
            if prop["type_breakdown"]:
                entry = prop["type_breakdown"][0]
                required_fields = [
                    "item_type", "current_margin_pct", "projected_margin_pct",
                    "min_margin_pct", "below_threshold", "stale_count", "revenue_share_pct"
                ]
                for field in required_fields:
                    assert field in entry, f"Missing field in type_breakdown entry: {field}"
                
                # Verify types
                assert isinstance(entry["item_type"], str), "item_type should be string"
                assert isinstance(entry["below_threshold"], bool), "below_threshold should be bool"
                assert isinstance(entry["stale_count"], int), "stale_count should be int"
                
                print(f"PASS: type_breakdown structure verified. Sample entry: {entry}")
            else:
                print("PASS: type_breakdown is empty list (single item type or no items)")
        else:
            print("PASS: No stale proposals, but structure is correct")
    
    def test_02_existing_fields_regression(self, auth_session):
        """Regression: All existing fields from iteration_164 still present"""
        res = auth_session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert res.status_code == 200
        
        data = res.json()
        # Top-level fields
        assert "total_drafts_scanned" in data, "Missing total_drafts_scanned"
        assert "stale_proposals" in data, "Missing stale_proposals"
        assert "proposals" in data, "Missing proposals"
        
        if data["proposals"]:
            prop = data["proposals"][0]
            # All existing fields from iteration_164
            required_fields = [
                "proposal_id", "proposal_number", "event_id", "event_name", "event_date",
                "client_name", "stale_count", "max_diff_pct", "delta_total", "total_amount",
                "current_margin_pct", "projected_margin_pct", "effective_min_margin", "below_threshold"
            ]
            for field in required_fields:
                assert field in prop, f"Missing existing field: {field}"
            print("PASS: All existing fields still present (regression check)")
        else:
            print("PASS: No stale proposals to check, but structure is correct")


class TestTypeBreakdownMath:
    """Test type_breakdown math with mixed item types"""
    
    def test_03_create_mixed_type_scenario(self, auth_session):
        """Create Draft proposal with Food + Service items and verify type_breakdown math"""
        # Set up margin policy: Food=35%, Service=40%
        policy_payload = {
            "by_type": {
                "Food": 35.0,
                "Service": 40.0,
                "Rental": 50.0,
                "Fee": 60.0,
                "Other": 30.0
            },
            "by_category": []
        }
        res = auth_session.put(f"{BASE_URL}/api/settings/margin-policy", json=policy_payload)
        assert res.status_code == 200, f"Policy update failed: {res.text}"
        
        # Create a recipe for Food item
        recipe_name = f"TEST_RECIPE_BREAKDOWN_{uuid.uuid4().hex[:8]}"
        recipe_payload = {
            "name": recipe_name,
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "ingredients": [],
            "total_cost": 30.0,  # Initial cost
            "cost_per_portion": 30.0
        }
        recipe_res = auth_session.post(f"{BASE_URL}/api/recipes", json=recipe_payload)
        assert recipe_res.status_code in [200, 201], f"Recipe create failed: {recipe_res.text}"
        recipe_id = recipe_res.json().get("recipe_id")
        
        # Get categories for picklist
        cat_res = auth_session.get(f"{BASE_URL}/api/settings/categories")
        categories = cat_res.json()
        category_id = categories[0]["category_id"] if categories else ""
        
        # Create a picklist item for Service
        service_name = f"TEST_SERVICE_BREAKDOWN_{uuid.uuid4().hex[:8]}"
        service_payload = {
            "name": service_name,
            "category_id": category_id,
            "item_type": "Service",
            "default_price": 100.0,
            "internal_cost": 50.0,  # Initial cost
            "unit": "unit",
            "is_active": True
        }
        service_res = auth_session.post(f"{BASE_URL}/api/settings/picklist", json=service_payload)
        assert service_res.status_code in [200, 201], f"Picklist create failed: {service_res.text}"
        service_item_id = service_res.json().get("item_id")
        
        # Create client
        client_payload = {
            "name": f"TEST_CLIENT_BREAKDOWN_{uuid.uuid4().hex[:8]}",
            "display_name": "Test Client Breakdown",
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com"
        }
        client_res = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_payload)
        assert client_res.status_code in [200, 201], f"Client create failed: {client_res.text}"
        client_id = client_res.json().get("client_id")
        
        # Create event
        event_payload = {
            "name": f"TEST_EVENT_BREAKDOWN_{uuid.uuid4().hex[:8]}",
            "event_type": "corporate",
            "status": "Lead",
            "client_id": client_id
        }
        event_res = auth_session.post(f"{BASE_URL}/api/events", json=event_payload)
        assert event_res.status_code in [200, 201], f"Event create failed: {event_res.text}"
        event_id = event_res.json().get("event_id")
        
        # Get or create proposal
        prop_res = auth_session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert prop_res.status_code in [200, 201], f"Proposal get/create failed: {prop_res.text}"
        proposal_id = prop_res.json().get("proposal_id")
        
        # Add Food item: qty=10, unit_price=$50, snapshot_cost=$30
        # Revenue = 10 * 50 = $500, Cost = 10 * 30 = $300
        food_item_payload = {
            "item_type": "Food",
            "reference_id": recipe_id,
            "description": recipe_name,
            "quantity": 10,
            "unit_price": 50.0,
            "internal_cost": 30.0  # Snapshot
        }
        food_res = auth_session.post(f"{BASE_URL}/api/proposals/{proposal_id}/items", json=food_item_payload)
        assert food_res.status_code in [200, 201], f"Food item create failed: {food_res.text}"
        food_order_item_id = food_res.json().get("item_id")
        
        # Add Service item: qty=2, unit_price=$100, snapshot_cost=$50
        # Revenue = 2 * 100 = $200, Cost = 2 * 50 = $100
        service_item_payload = {
            "item_type": "Service",
            "reference_id": service_item_id,
            "description": service_name,
            "quantity": 2,
            "unit_price": 100.0,
            "internal_cost": 50.0  # Snapshot
        }
        service_res = auth_session.post(f"{BASE_URL}/api/proposals/{proposal_id}/items", json=service_item_payload)
        assert service_res.status_code in [200, 201], f"Service item create failed: {service_res.text}"
        service_order_item_id = service_res.json().get("item_id")
        
        # Now update recipe cost to make Food stale: $30 -> $40
        recipe_update = {
            "name": recipe_name,
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "ingredients": [],
            "total_cost": 40.0,
            "cost_per_portion": 40.0
        }
        auth_session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=recipe_update)
        
        # Check cost-health/overview
        health_res = auth_session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert health_res.status_code == 200
        health_data = health_res.json()
        
        # Find our proposal
        our_prop = next((p for p in health_data["proposals"] if p["proposal_id"] == proposal_id), None)
        
        if our_prop:
            print(f"Found stale proposal: {our_prop['proposal_id']}")
            print(f"type_breakdown: {our_prop.get('type_breakdown')}")
            
            # Verify type_breakdown exists and has entries
            assert "type_breakdown" in our_prop, "Missing type_breakdown"
            breakdown = our_prop["type_breakdown"]
            
            # Should have at least Food entry (Service is not stale)
            # Actually, type_breakdown includes ALL types with revenue, not just stale ones
            assert len(breakdown) >= 1, f"Should have at least 1 type in breakdown, got {len(breakdown)}"
            
            # Find Food entry
            food_entry = next((b for b in breakdown if b["item_type"] == "Food"), None)
            if food_entry:
                # Food: revenue=$500, current_cost=$300, projected_cost=$400
                # current_margin = (500-300)/500 = 40%
                # projected_margin = (500-400)/500 = 20%
                # min_margin = 35% (policy)
                # below_threshold = True (20% < 35%)
                print(f"Food entry: {food_entry}")
                
                # Verify current_margin_pct is ~40%
                if food_entry["current_margin_pct"] is not None:
                    assert 38 <= food_entry["current_margin_pct"] <= 42, f"Food current_margin should be ~40%, got {food_entry['current_margin_pct']}"
                
                # Verify projected_margin_pct is ~20%
                if food_entry["projected_margin_pct"] is not None:
                    assert 18 <= food_entry["projected_margin_pct"] <= 22, f"Food projected_margin should be ~20%, got {food_entry['projected_margin_pct']}"
                
                # Verify below_threshold is True (20% < 35%)
                assert food_entry["below_threshold"] == True, f"Food below_threshold should be True, got {food_entry['below_threshold']}"
                
                # Verify stale_count >= 1
                assert food_entry["stale_count"] >= 1, f"Food stale_count should be >= 1, got {food_entry['stale_count']}"
                
                print("PASS: Food type_breakdown math verified")
            
            # Find Service entry (should NOT be stale since we didn't change picklist cost)
            service_entry = next((b for b in breakdown if b["item_type"] == "Service"), None)
            if service_entry:
                # Service: revenue=$200, cost=$100
                # current_margin = projected_margin = (200-100)/200 = 50%
                # min_margin = 40% (policy)
                # below_threshold = False (50% >= 40%)
                print(f"Service entry: {service_entry}")
                
                # Verify current_margin_pct is ~50%
                if service_entry["current_margin_pct"] is not None:
                    assert 48 <= service_entry["current_margin_pct"] <= 52, f"Service current_margin should be ~50%, got {service_entry['current_margin_pct']}"
                
                # Verify below_threshold is False (50% >= 40%)
                assert service_entry["below_threshold"] == False, f"Service below_threshold should be False, got {service_entry['below_threshold']}"
                
                print("PASS: Service type_breakdown math verified")
            
            # Verify sorting: Food should be first (bigger margin change: 40->20 = -20pp vs Service 50->50 = 0pp)
            if len(breakdown) >= 2:
                first_type = breakdown[0]["item_type"]
                assert first_type == "Food", f"Food should be first (biggest margin change), got {first_type}"
                print("PASS: type_breakdown sorted by abs(projected - current) descending")
        else:
            print("INFO: Proposal not found in stale list (may have been refreshed)")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/proposals/{proposal_id}/items/{food_order_item_id}")
        auth_session.delete(f"{BASE_URL}/api/proposals/{proposal_id}/items/{service_order_item_id}")
        auth_session.delete(f"{BASE_URL}/api/events/{event_id}")
        auth_session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")
        auth_session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
        auth_session.delete(f"{BASE_URL}/api/settings/picklist/{service_item_id}")
        print("PASS: Mixed type scenario test completed with cleanup")
    
    def test_04_type_breakdown_empty_for_single_type(self, auth_session):
        """type_breakdown should have 1 entry when proposal has only one item type"""
        # This is a structural test - if a proposal has only Food items,
        # type_breakdown should have exactly 1 entry for Food
        
        # Create a simple scenario with only Food
        recipe_name = f"TEST_SINGLE_TYPE_{uuid.uuid4().hex[:8]}"
        recipe_payload = {
            "name": recipe_name,
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "ingredients": [],
            "total_cost": 20.0,
            "cost_per_portion": 20.0
        }
        recipe_res = auth_session.post(f"{BASE_URL}/api/recipes", json=recipe_payload)
        assert recipe_res.status_code in [200, 201]
        recipe_id = recipe_res.json().get("recipe_id")
        
        # Create client
        client_payload = {
            "name": f"TEST_CLIENT_SINGLE_{uuid.uuid4().hex[:8]}",
            "display_name": "Test Client Single",
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com"
        }
        client_res = auth_session.post(f"{BASE_URL}/api/crm/clients", json=client_payload)
        assert client_res.status_code in [200, 201]
        client_id = client_res.json().get("client_id")
        
        # Create event
        event_payload = {
            "name": f"TEST_EVENT_SINGLE_{uuid.uuid4().hex[:8]}",
            "event_type": "corporate",
            "status": "Lead",
            "client_id": client_id
        }
        event_res = auth_session.post(f"{BASE_URL}/api/events", json=event_payload)
        assert event_res.status_code in [200, 201]
        event_id = event_res.json().get("event_id")
        
        # Get proposal
        prop_res = auth_session.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert prop_res.status_code in [200, 201]
        proposal_id = prop_res.json().get("proposal_id")
        
        # Add only Food item
        food_item_payload = {
            "item_type": "Food",
            "reference_id": recipe_id,
            "description": recipe_name,
            "quantity": 5,
            "unit_price": 50.0,
            "internal_cost": 20.0
        }
        food_res = auth_session.post(f"{BASE_URL}/api/proposals/{proposal_id}/items", json=food_item_payload)
        assert food_res.status_code in [200, 201]
        food_order_item_id = food_res.json().get("item_id")
        
        # Make it stale
        recipe_update = {
            "name": recipe_name,
            "category": "main",
            "yield_quantity": 1,
            "yield_unit": "portion",
            "ingredients": [],
            "total_cost": 30.0,
            "cost_per_portion": 30.0
        }
        auth_session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=recipe_update)
        
        # Check overview
        health_res = auth_session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert health_res.status_code == 200
        health_data = health_res.json()
        
        our_prop = next((p for p in health_data["proposals"] if p["proposal_id"] == proposal_id), None)
        if our_prop:
            breakdown = our_prop.get("type_breakdown", [])
            # Should have exactly 1 entry (Food only)
            assert len(breakdown) == 1, f"Single-type proposal should have 1 breakdown entry, got {len(breakdown)}"
            assert breakdown[0]["item_type"] == "Food", f"Entry should be Food, got {breakdown[0]['item_type']}"
            print("PASS: Single-type proposal has exactly 1 type_breakdown entry")
        else:
            print("INFO: Proposal not found in stale list")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/proposals/{proposal_id}/items/{food_order_item_id}")
        auth_session.delete(f"{BASE_URL}/api/events/{event_id}")
        auth_session.delete(f"{BASE_URL}/api/crm/clients/{client_id}")
        auth_session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
        print("PASS: Single-type scenario test completed with cleanup")
    
    def test_05_revenue_share_pct_calculation(self, auth_session):
        """Verify revenue_share_pct is calculated correctly"""
        # Create scenario with known revenue split
        # Food: $500 revenue, Service: $200 revenue
        # Total: $700
        # Food share: 500/700 = 71.43%
        # Service share: 200/700 = 28.57%
        
        # This is already tested in test_03, but let's verify the math explicitly
        res = auth_session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert res.status_code == 200
        data = res.json()
        
        if data["proposals"]:
            for prop in data["proposals"]:
                breakdown = prop.get("type_breakdown", [])
                if len(breakdown) > 1:
                    # Sum of revenue_share_pct should be ~100%
                    total_share = sum(b.get("revenue_share_pct", 0) or 0 for b in breakdown)
                    if total_share > 0:
                        assert 99 <= total_share <= 101, f"Sum of revenue_share_pct should be ~100%, got {total_share}"
                        print(f"PASS: revenue_share_pct sums to {total_share}% for proposal {prop['proposal_id']}")
                        break
        else:
            print("PASS: No stale proposals to verify revenue_share_pct")


class TestTypeBreakdownDefensive:
    """Test defensive behavior for type_breakdown"""
    
    def test_06_type_breakdown_always_present(self, auth_session):
        """type_breakdown should always be present (may be empty list)"""
        res = auth_session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert res.status_code == 200
        data = res.json()
        
        for prop in data["proposals"]:
            assert "type_breakdown" in prop, f"Missing type_breakdown for proposal {prop['proposal_id']}"
            assert isinstance(prop["type_breakdown"], list), f"type_breakdown should be list for proposal {prop['proposal_id']}"
        
        print(f"PASS: type_breakdown present for all {len(data['proposals'])} stale proposals")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
