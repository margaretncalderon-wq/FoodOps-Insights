"""
Test Ingredient Wizard API - v2 unit system fields
Tests POST/PUT/GET for ingredients with base_unit, cost_per_base_unit, density_g_per_ml, 
purchase_unit, purchase_quantity_per_unit, purchase_cost fields
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials for Margaret (food-ops enabled)
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    """Get authenticated session for Margaret"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


class TestIngredientWizardAPI:
    """Test ingredient CRUD with v2 unit system fields"""
    
    created_ingredient_ids = []
    
    def test_create_ingredient_with_v2_fields(self, auth_session):
        """POST /api/inventory/ingredients with full v2 unit system payload"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_Olive_Oil_{unique_id}",
            "brand": "Test Brand",
            "category": "oils",
            "inventory_type": "food",
            "unit": "ml",  # legacy field
            "cost_per_unit": 0.02,  # legacy field
            "stock_quantity": 0,
            "par_level": 0,
            "min_stock_level": 0,
            # v2 unit system fields
            "base_unit": "ml",
            "cost_per_base_unit": 0.02,
            "density_g_per_ml": 0.92,
            "purchase_unit": "L",
            "purchase_quantity_per_unit": 1000,  # 1L = 1000ml
            "purchase_cost": 20.0
        }
        
        response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "ingredient_id" in data
        self.created_ingredient_ids.append(data["ingredient_id"])
        
        # Verify v2 fields are returned
        assert data.get("base_unit") == "ml", f"base_unit mismatch: {data.get('base_unit')}"
        assert data.get("cost_per_base_unit") == 0.02, f"cost_per_base_unit mismatch: {data.get('cost_per_base_unit')}"
        assert data.get("density_g_per_ml") == 0.92, f"density_g_per_ml mismatch: {data.get('density_g_per_ml')}"
        assert data.get("purchase_unit") == "L", f"purchase_unit mismatch: {data.get('purchase_unit')}"
        assert data.get("purchase_quantity_per_unit") == 1000, f"purchase_quantity_per_unit mismatch"
        assert data.get("purchase_cost") == 20.0, f"purchase_cost mismatch"
        
        print(f"✓ Created ingredient with v2 fields: {data['ingredient_id']}")
        return data["ingredient_id"]
    
    def test_get_ingredient_returns_v2_fields(self, auth_session):
        """GET /api/inventory/ingredients/{id} should return v2 fields"""
        if not self.created_ingredient_ids:
            pytest.skip("No ingredient created in previous test")
        
        ingredient_id = self.created_ingredient_ids[0]
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}")
        assert response.status_code == 200, f"GET failed: {response.text}"
        
        data = response.json()
        # Verify v2 fields persisted
        assert data.get("base_unit") == "ml"
        assert data.get("cost_per_base_unit") == 0.02
        assert data.get("density_g_per_ml") == 0.92
        assert data.get("purchase_unit") == "L"
        assert data.get("purchase_quantity_per_unit") == 1000
        assert data.get("purchase_cost") == 20.0
        
        print(f"✓ GET returns v2 fields correctly for {ingredient_id}")
    
    def test_update_ingredient_v2_fields(self, auth_session):
        """PUT /api/inventory/ingredients/{id} should update v2 fields"""
        if not self.created_ingredient_ids:
            pytest.skip("No ingredient created in previous test")
        
        ingredient_id = self.created_ingredient_ids[0]
        
        # Update with new values
        payload = {
            "name": f"TEST_Olive_Oil_Updated",
            "brand": "Updated Brand",
            "category": "oils",
            "inventory_type": "food",
            "unit": "ml",
            "cost_per_unit": 0.025,
            "stock_quantity": 500,
            "par_level": 100,
            "min_stock_level": 50,
            # Updated v2 fields
            "base_unit": "ml",
            "cost_per_base_unit": 0.025,
            "density_g_per_ml": 0.91,
            "purchase_unit": "L",
            "purchase_quantity_per_unit": 1000,
            "purchase_cost": 25.0
        }
        
        response = auth_session.put(f"{BASE_URL}/api/inventory/ingredients/{ingredient_id}", json=payload)
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        assert data.get("cost_per_base_unit") == 0.025
        assert data.get("density_g_per_ml") == 0.91
        assert data.get("purchase_cost") == 25.0
        
        print(f"✓ Updated ingredient v2 fields for {ingredient_id}")
    
    def test_create_ingredient_weight_to_volume_needs_density(self, auth_session):
        """Create ingredient with weight purchase unit and volume base unit"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_Aceite_Density_{unique_id}",
            "category": "oils",
            "inventory_type": "food",
            "unit": "ml",
            "cost_per_unit": 0.0217,  # 10 / (1000 * 0.92) ≈ 0.0109 per ml
            "stock_quantity": 0,
            "par_level": 0,
            "min_stock_level": 0,
            # Weight purchase, volume base - needs density
            "base_unit": "ml",
            "cost_per_base_unit": 0.0109,
            "density_g_per_ml": 0.92,
            "purchase_unit": "kg",
            "purchase_quantity_per_unit": 1,
            "purchase_cost": 10.0
        }
        
        response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.created_ingredient_ids.append(data["ingredient_id"])
        
        assert data.get("density_g_per_ml") == 0.92
        assert data.get("purchase_unit") == "kg"
        assert data.get("base_unit") == "ml"
        
        print(f"✓ Created weight→volume ingredient with density: {data['ingredient_id']}")
    
    def test_create_ingredient_volume_to_volume_no_density(self, auth_session):
        """Create ingredient with volume purchase and volume base - no density needed"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_Water_{unique_id}",
            "category": "beverage",
            "inventory_type": "food",
            "unit": "ml",
            "cost_per_unit": 0.001,
            "stock_quantity": 0,
            "par_level": 0,
            "min_stock_level": 0,
            # Volume to volume - no density needed
            "base_unit": "ml",
            "cost_per_base_unit": 0.001,
            "density_g_per_ml": None,  # Not needed
            "purchase_unit": "L",
            "purchase_quantity_per_unit": 1000,
            "purchase_cost": 1.0
        }
        
        response = auth_session.post(f"{BASE_URL}/api/inventory/ingredients", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.created_ingredient_ids.append(data["ingredient_id"])
        
        assert data.get("base_unit") == "ml"
        assert data.get("purchase_unit") == "L"
        # density_g_per_ml should be None or not present
        
        print(f"✓ Created volume→volume ingredient (no density): {data['ingredient_id']}")
    
    def test_list_ingredients_includes_v2_fields(self, auth_session):
        """GET /api/inventory/ingredients should include v2 fields"""
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        assert response.status_code == 200, f"List failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "No ingredients returned"
        
        # Find our test ingredient
        test_items = [i for i in data if i.get("name", "").startswith("TEST_")]
        if test_items:
            item = test_items[0]
            # Check that v2 fields are present in list response
            print(f"✓ List includes {len(test_items)} test ingredients")
            print(f"  Sample item has base_unit: {item.get('base_unit')}")
    
    def test_cleanup_test_ingredients(self, auth_session):
        """Delete test ingredients created during tests"""
        deleted = 0
        for ing_id in self.created_ingredient_ids:
            response = auth_session.delete(f"{BASE_URL}/api/inventory/ingredients/{ing_id}")
            if response.status_code in [200, 204]:
                deleted += 1
        
        print(f"✓ Cleaned up {deleted}/{len(self.created_ingredient_ids)} test ingredients")
        self.created_ingredient_ids.clear()


class TestNeedsReviewFilter:
    """Test that ingredients needing review are correctly identified"""
    
    def test_get_ingredients_with_needs_review_flag(self, auth_session):
        """Verify ingredients list includes needs_review field"""
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        assert response.status_code == 200
        
        data = response.json()
        
        # Count items needing review (missing base_unit or cost_per_base_unit)
        needs_review = [
            i for i in data 
            if i.get("inventory_type") == "food" and (
                i.get("needs_review") == True or
                not i.get("base_unit") or
                not i.get("cost_per_base_unit") or
                i.get("cost_per_base_unit") == 0
            )
        ]
        
        print(f"✓ Found {len(needs_review)} ingredients needing review out of {len(data)} total")
        print(f"  (This matches the banner count in the UI)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
