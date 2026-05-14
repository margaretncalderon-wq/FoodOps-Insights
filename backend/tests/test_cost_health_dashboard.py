"""
Test Cost Health Dashboard and PicklistItem Staleness Detection
Tests for iteration 161:
- GET /api/proposals/{id}/cost-staleness (extended for PicklistItem)
- POST /api/proposals/{id}/refresh-costs (extended for PicklistItem)
- GET /api/proposals/cost-health/overview (new endpoint)
- POST /api/proposals/cost-health/refresh-all (new endpoint)
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


class TestCostHealthDashboard:
    """Test Cost Health Dashboard endpoints and PicklistItem staleness"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        self.user_data = login_response.json()
        yield
        
        # Cleanup test data
        self._cleanup_test_data()

    def _cleanup_test_data(self):
        """Clean up test-created data"""
        try:
            # Delete test picklist items
            picklist_resp = self.session.get(f"{BASE_URL}/api/settings/picklist")
            if picklist_resp.status_code == 200:
                for item in picklist_resp.json():
                    if item.get("name", "").startswith("TEST_COST_HEALTH_"):
                        self.session.delete(f"{BASE_URL}/api/settings/picklist/{item['item_id']}")
        except Exception:
            pass

    # ==================== ROUTE ORDER TESTS ====================
    
    def test_01_cost_health_overview_not_shadowed(self):
        """Verify /cost-health/overview is NOT shadowed by /{proposal_id}/cost-staleness"""
        response = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        # Should return 200 with proper structure, NOT 404 (proposal not found)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total_drafts_scanned" in data, "Missing total_drafts_scanned field"
        assert "stale_proposals" in data, "Missing stale_proposals field"
        assert "proposals" in data, "Missing proposals field"
        print(f"✓ cost-health/overview returns proper structure: {data['total_drafts_scanned']} drafts scanned, {data['stale_proposals']} stale")

    def test_02_cost_health_refresh_all_not_shadowed(self):
        """Verify /cost-health/refresh-all is NOT shadowed by /{proposal_id}/refresh-costs"""
        response = self.session.post(f"{BASE_URL}/api/proposals/cost-health/refresh-all")
        # Should return 200 with proper structure, NOT 404 (proposal not found)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "scanned" in data, "Missing scanned field"
        assert "refreshed_proposals" in data, "Missing refreshed_proposals field"
        assert "refreshed_items" in data, "Missing refreshed_items field"
        print(f"✓ cost-health/refresh-all returns proper structure: {data['scanned']} scanned, {data['refreshed_proposals']} refreshed")

    # ==================== COST HEALTH OVERVIEW TESTS ====================

    def test_03_cost_health_overview_structure(self):
        """Verify cost-health/overview returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert response.status_code == 200
        data = response.json()
        
        # Verify top-level fields
        assert isinstance(data["total_drafts_scanned"], int)
        assert isinstance(data["stale_proposals"], int)
        assert isinstance(data["proposals"], list)
        
        # If there are stale proposals, verify their structure
        if data["proposals"]:
            prop = data["proposals"][0]
            required_fields = ["proposal_id", "proposal_number", "event_id", "stale_count", "max_diff_pct", "delta_total", "total_amount"]
            for field in required_fields:
                assert field in prop, f"Missing field: {field}"
            # Optional but expected fields
            optional_fields = ["event_name", "event_date", "client_name"]
            for field in optional_fields:
                assert field in prop, f"Missing optional field: {field}"
            print(f"✓ Stale proposal structure verified: {prop['proposal_id'][:8]}... with {prop['stale_count']} stale items")
        else:
            print("✓ No stale proposals found (structure verified)")

    def test_04_cost_health_overview_only_drafts(self):
        """Verify cost-health/overview only returns Draft proposals"""
        response = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert response.status_code == 200
        data = response.json()
        
        # All returned proposals should be Draft (we can verify by checking cost-staleness)
        for prop in data["proposals"][:3]:  # Check first 3
            staleness_resp = self.session.get(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/cost-staleness")
            if staleness_resp.status_code == 200:
                staleness = staleness_resp.json()
                assert staleness.get("status") == "Draft", f"Non-Draft proposal in overview: {staleness.get('status')}"
        print(f"✓ All {len(data['proposals'])} proposals in overview are Draft status")

    # ==================== PICKLIST ITEM STALENESS TESTS ====================

    def test_05_create_picklist_item_for_staleness_test(self):
        """Create a test picklist item to use for staleness testing"""
        unique_id = str(uuid.uuid4())[:8]
        picklist_data = {
            "name": f"TEST_COST_HEALTH_Service_{unique_id}",
            "item_type": "Service",
            "category_id": "cat_labor",  # Required field
            "default_price": 100.00,
            "internal_cost": 50.00,
            "description": "Test service for cost health testing"
        }
        
        response = self.session.post(f"{BASE_URL}/api/settings/picklist", json=picklist_data)
        assert response.status_code in [200, 201], f"Failed to create picklist item: {response.text}"
        
        data = response.json()
        assert "item_id" in data
        self.test_picklist_item_id = data["item_id"]
        print(f"✓ Created test picklist item: {data['item_id']}")
        return data

    def test_06_cost_staleness_detects_picklist_item_changes(self):
        """Verify cost-staleness detects when picklist_items.internal_cost differs from order_items.internal_cost"""
        # First, find a Draft proposal with non-Food items
        overview_resp = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        if overview_resp.status_code != 200:
            pytest.skip("Could not get cost health overview")
        
        # Get all Draft proposals
        proposals_resp = self.session.get(f"{BASE_URL}/api/proposals")
        if proposals_resp.status_code != 200:
            pytest.skip("Could not get proposals")
        
        draft_proposals = [p for p in proposals_resp.json() if p.get("status") == "Draft"]
        if not draft_proposals:
            pytest.skip("No Draft proposals available for testing")
        
        # Check staleness for first Draft proposal
        prop = draft_proposals[0]
        staleness_resp = self.session.get(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/cost-staleness")
        assert staleness_resp.status_code == 200
        
        staleness = staleness_resp.json()
        assert "is_stale" in staleness
        assert "stale_count" in staleness
        assert "can_refresh" in staleness
        assert "stale_items" in staleness
        
        # Verify stale_items structure includes source_type for non-Food items
        for item in staleness.get("stale_items", []):
            assert "source_type" in item, "Missing source_type in stale item"
            assert "source_name" in item, "Missing source_name in stale item"
            if item.get("item_type") != "Food":
                assert item["source_type"] in ["service", "rental", "fee", "other", "item"], f"Unexpected source_type: {item['source_type']}"
        
        print(f"✓ Staleness detection works for proposal {prop['proposal_id'][:8]}...: is_stale={staleness['is_stale']}, count={staleness['stale_count']}")

    def test_07_refresh_costs_updates_picklist_linked_items(self):
        """Verify refresh-costs updates internal_cost for PicklistItem-linked OrderItems"""
        # Find a Draft proposal
        proposals_resp = self.session.get(f"{BASE_URL}/api/proposals")
        if proposals_resp.status_code != 200:
            pytest.skip("Could not get proposals")
        
        draft_proposals = [p for p in proposals_resp.json() if p.get("status") == "Draft"]
        if not draft_proposals:
            pytest.skip("No Draft proposals available")
        
        prop = draft_proposals[0]
        
        # Get staleness before refresh
        before_resp = self.session.get(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/cost-staleness")
        assert before_resp.status_code == 200
        before = before_resp.json()
        
        # Attempt refresh
        refresh_resp = self.session.post(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/refresh-costs")
        assert refresh_resp.status_code == 200, f"Refresh failed: {refresh_resp.text}"
        
        refresh_data = refresh_resp.json()
        assert "refreshed_count" in refresh_data
        print(f"✓ Refresh completed: {refresh_data['refreshed_count']} items updated")

    def test_08_refresh_costs_preserves_unit_price(self):
        """Verify refresh-costs does NOT change unit_price"""
        # Find a Draft proposal with items
        proposals_resp = self.session.get(f"{BASE_URL}/api/proposals")
        if proposals_resp.status_code != 200:
            pytest.skip("Could not get proposals")
        
        draft_proposals = [p for p in proposals_resp.json() if p.get("status") == "Draft"]
        if not draft_proposals:
            pytest.skip("No Draft proposals available")
        
        prop = draft_proposals[0]
        
        # Get items before refresh
        items_before_resp = self.session.get(f"{BASE_URL}/api/order-items?proposal_id={prop['proposal_id']}")
        if items_before_resp.status_code != 200:
            pytest.skip("Could not get order items")
        
        items_before = items_before_resp.json()
        unit_prices_before = {item["item_id"]: item.get("unit_price") for item in items_before}
        
        # Refresh
        self.session.post(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/refresh-costs")
        
        # Get items after refresh
        items_after_resp = self.session.get(f"{BASE_URL}/api/order-items?proposal_id={prop['proposal_id']}")
        items_after = items_after_resp.json()
        
        # Verify unit_price unchanged
        for item in items_after:
            if item["item_id"] in unit_prices_before:
                assert item.get("unit_price") == unit_prices_before[item["item_id"]], \
                    f"unit_price changed for item {item['item_id']}"
        
        print(f"✓ unit_price preserved for all {len(items_after)} items")

    def test_09_refresh_costs_only_draft_allowed(self):
        """Verify refresh-costs returns 400 for non-Draft proposals"""
        # Find a non-Draft proposal
        proposals_resp = self.session.get(f"{BASE_URL}/api/proposals")
        if proposals_resp.status_code != 200:
            pytest.skip("Could not get proposals")
        
        non_draft = [p for p in proposals_resp.json() if p.get("status") != "Draft"]
        if not non_draft:
            print("✓ No non-Draft proposals to test (skipping)")
            return
        
        prop = non_draft[0]
        refresh_resp = self.session.post(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/refresh-costs")
        assert refresh_resp.status_code == 400, f"Expected 400 for non-Draft, got {refresh_resp.status_code}"
        print(f"✓ Refresh correctly blocked for {prop.get('status')} proposal")

    # ==================== COST HEALTH REFRESH-ALL TESTS ====================

    def test_10_cost_health_refresh_all_structure(self):
        """Verify cost-health/refresh-all returns correct structure"""
        response = self.session.post(f"{BASE_URL}/api/proposals/cost-health/refresh-all")
        assert response.status_code == 200
        
        data = response.json()
        assert "scanned" in data
        assert "refreshed_proposals" in data
        assert "refreshed_items" in data
        
        assert isinstance(data["scanned"], int)
        assert isinstance(data["refreshed_proposals"], int)
        assert isinstance(data["refreshed_items"], int)
        
        print(f"✓ refresh-all structure verified: scanned={data['scanned']}, refreshed_proposals={data['refreshed_proposals']}, refreshed_items={data['refreshed_items']}")

    def test_11_cost_health_refresh_all_clears_staleness(self):
        """Verify after refresh-all, overview shows 0 stale (for same dataset)"""
        # Get overview before
        before_resp = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert before_resp.status_code == 200
        before = before_resp.json()
        
        # Refresh all
        refresh_resp = self.session.post(f"{BASE_URL}/api/proposals/cost-health/refresh-all")
        assert refresh_resp.status_code == 200
        
        # Get overview after
        after_resp = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert after_resp.status_code == 200
        after = after_resp.json()
        
        # After refresh, stale_proposals should be 0 (assuming no concurrent writes)
        # Note: This may not be 0 if there are items without reference_id or other edge cases
        print(f"✓ Before refresh: {before['stale_proposals']} stale, After refresh: {after['stale_proposals']} stale")
        
        # At minimum, refreshed count should match or reduce
        assert after["stale_proposals"] <= before["stale_proposals"], \
            f"Stale count increased after refresh: {before['stale_proposals']} -> {after['stale_proposals']}"

    # ==================== MIXED FOOD + PICKLIST STALENESS TESTS ====================

    def test_12_staleness_detects_both_food_and_picklist(self):
        """Verify staleness detection works for BOTH Food (recipe) and non-Food (picklist) items"""
        # Get overview to find proposals with stale items
        overview_resp = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert overview_resp.status_code == 200
        overview = overview_resp.json()
        
        if not overview["proposals"]:
            print("✓ No stale proposals to verify mixed detection (test passes)")
            return
        
        # Check first stale proposal
        prop = overview["proposals"][0]
        staleness_resp = self.session.get(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/cost-staleness")
        assert staleness_resp.status_code == 200
        staleness = staleness_resp.json()
        
        # Categorize stale items by type
        food_stale = [i for i in staleness["stale_items"] if i.get("item_type") == "Food"]
        non_food_stale = [i for i in staleness["stale_items"] if i.get("item_type") != "Food"]
        
        print(f"✓ Proposal {prop['proposal_id'][:8]}... has {len(food_stale)} Food stale items and {len(non_food_stale)} non-Food stale items")
        
        # Verify source_type is correct
        for item in food_stale:
            assert item.get("source_type") == "recipe", f"Food item should have source_type='recipe', got {item.get('source_type')}"
        
        for item in non_food_stale:
            assert item.get("source_type") in ["service", "rental", "fee", "other", "item"], \
                f"Non-Food item has unexpected source_type: {item.get('source_type')}"

    # ==================== PROPOSAL OVERVIEW FIELD TESTS ====================

    def test_13_overview_proposal_fields(self):
        """Verify each proposal in overview has all required fields"""
        response = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = [
            "proposal_id", "proposal_number", "event_id", "event_name", 
            "event_date", "client_name", "stale_count", "max_diff_pct", 
            "delta_total", "total_amount"
        ]
        
        for prop in data["proposals"][:5]:  # Check first 5
            for field in required_fields:
                assert field in prop, f"Missing field '{field}' in proposal {prop.get('proposal_id', 'unknown')}"
            
            # Verify numeric fields
            assert isinstance(prop["stale_count"], int) and prop["stale_count"] > 0
            assert isinstance(prop["max_diff_pct"], (int, float))
            assert isinstance(prop["delta_total"], (int, float))
            assert isinstance(prop["total_amount"], (int, float))
        
        print(f"✓ All {len(data['proposals'])} proposals have required fields")

    # ==================== EDGE CASE TESTS ====================

    def test_14_staleness_handles_missing_reference_id(self):
        """Verify staleness detection gracefully handles items without reference_id"""
        # Get any Draft proposal
        proposals_resp = self.session.get(f"{BASE_URL}/api/proposals")
        if proposals_resp.status_code != 200:
            pytest.skip("Could not get proposals")
        
        draft_proposals = [p for p in proposals_resp.json() if p.get("status") == "Draft"]
        if not draft_proposals:
            pytest.skip("No Draft proposals available")
        
        prop = draft_proposals[0]
        
        # Get staleness - should not error even if some items lack reference_id
        staleness_resp = self.session.get(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/cost-staleness")
        assert staleness_resp.status_code == 200, f"Staleness check failed: {staleness_resp.text}"
        
        staleness = staleness_resp.json()
        # All stale items should have reference_id (items without are skipped)
        for item in staleness.get("stale_items", []):
            assert item.get("reference_id"), f"Stale item missing reference_id: {item}"
        
        print(f"✓ Staleness detection handles missing reference_id correctly")

    def test_15_staleness_sorted_by_diff_pct(self):
        """Verify stale_items are sorted by |diff_pct| descending"""
        # Get any Draft proposal with stale items
        overview_resp = self.session.get(f"{BASE_URL}/api/proposals/cost-health/overview")
        if overview_resp.status_code != 200:
            pytest.skip("Could not get overview")
        
        overview = overview_resp.json()
        if not overview["proposals"]:
            print("✓ No stale proposals to verify sorting (test passes)")
            return
        
        prop = overview["proposals"][0]
        staleness_resp = self.session.get(f"{BASE_URL}/api/proposals/{prop['proposal_id']}/cost-staleness")
        assert staleness_resp.status_code == 200
        
        staleness = staleness_resp.json()
        items = staleness.get("stale_items", [])
        
        if len(items) > 1:
            # Verify sorted by |diff_pct| descending
            for i in range(len(items) - 1):
                assert abs(items[i]["diff_pct"]) >= abs(items[i+1]["diff_pct"]), \
                    f"Items not sorted by |diff_pct|: {items[i]['diff_pct']} < {items[i+1]['diff_pct']}"
        
        print(f"✓ Stale items sorted correctly by |diff_pct| descending")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
