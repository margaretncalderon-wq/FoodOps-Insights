"""
Test suite for POST /api/inventory/ingredients/cost-preview endpoint.
Tests the Live Cost Preview feature for Recipe Builder.

Features tested:
1. Valid cost preview with compatible units
2. Cross-unit conversion (g↔kg, ml↔L)
3. Incompatible unit detection (mass vs volume without density)
4. Mass↔volume conversion with density
5. 404 for invalid ingredient_id
6. Waste factor calculation
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCostPreviewEndpoint:
    """Tests for POST /api/inventory/ingredients/cost-preview"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session cookies"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        
        # Fetch ingredients to find test data
        ing_resp = self.session.get(f"{BASE_URL}/api/inventory/ingredients?limit=50")
        assert ing_resp.status_code == 200
        self.ingredients = ing_resp.json()
        
        # Find ingredients with specific base_units for testing
        self.weight_ingredient = None  # base_unit = 'g'
        self.volume_ingredient = None  # base_unit = 'ml'
        self.ingredient_with_density = None  # has density_g_per_ml
        self.ingredient_without_density = None  # no density
        
        for ing in self.ingredients:
            base = ing.get("base_unit", "")
            density = ing.get("density_g_per_ml")
            
            if base == "g" and not self.weight_ingredient:
                self.weight_ingredient = ing
            if base == "ml" and not self.volume_ingredient:
                self.volume_ingredient = ing
            if density and density > 0 and not self.ingredient_with_density:
                self.ingredient_with_density = ing
            if (not density or density == 0) and base == "g" and not self.ingredient_without_density:
                self.ingredient_without_density = ing
    
    def test_cost_preview_valid_same_unit(self):
        """Test cost preview with same unit as base_unit - should return compatible=true"""
        if not self.weight_ingredient:
            pytest.skip("No weight ingredient found")
        
        ing_id = self.weight_ingredient["ingredient_id"]
        base_unit = self.weight_ingredient.get("base_unit", "g")
        
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 100,
            "unit": base_unit,
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Validate response structure
        assert "cost" in data, "Response missing 'cost' field"
        assert "compatible" in data, "Response missing 'compatible' field"
        assert "base_unit" in data, "Response missing 'base_unit' field"
        assert "quantity_in_base" in data, "Response missing 'quantity_in_base' field"
        assert "ingredient_unit_kind" in data, "Response missing 'ingredient_unit_kind' field"
        assert "message" in data, "Response missing 'message' field"
        
        # Validate values
        assert data["compatible"] == True, f"Expected compatible=true for same unit, got {data['compatible']}"
        assert data["base_unit"] == base_unit
        assert data["quantity_in_base"] == 100, f"Expected quantity_in_base=100, got {data['quantity_in_base']}"
        assert data["cost"] >= 0, "Cost should be non-negative"
        assert data["message"] is None, f"Expected no message for compatible units, got {data['message']}"
        
        print(f"✓ Cost preview valid same unit: cost=${data['cost']}, compatible={data['compatible']}")
    
    def test_cost_preview_cross_unit_weight(self):
        """Test cross-unit conversion within weight (g↔kg) - should return compatible=true"""
        if not self.weight_ingredient:
            pytest.skip("No weight ingredient found")
        
        ing_id = self.weight_ingredient["ingredient_id"]
        
        # Request in kg when base is g
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 1,
            "unit": "kg",
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["compatible"] == True, f"Expected compatible=true for kg→g conversion, got {data['compatible']}"
        assert data["quantity_in_base"] == 1000, f"Expected 1kg = 1000g, got {data['quantity_in_base']}"
        assert data["message"] is None
        
        print(f"✓ Cross-unit weight (kg→g): quantity_in_base={data['quantity_in_base']}, cost=${data['cost']}")
    
    def test_cost_preview_cross_unit_oz_to_g(self):
        """Test oz to g conversion - should return compatible=true"""
        if not self.weight_ingredient:
            pytest.skip("No weight ingredient found")
        
        ing_id = self.weight_ingredient["ingredient_id"]
        
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 1,
            "unit": "oz",
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["compatible"] == True, f"Expected compatible=true for oz→g conversion"
        # 1 oz ≈ 28.3495 g
        assert 28 <= data["quantity_in_base"] <= 29, f"Expected ~28.35g for 1oz, got {data['quantity_in_base']}"
        
        print(f"✓ Cross-unit oz→g: quantity_in_base={data['quantity_in_base']}")
    
    def test_cost_preview_incompatible_units_no_density(self):
        """Test incompatible units (mass vs volume) without density - should return compatible=false"""
        # Find an ingredient with base_unit='g' and no density
        test_ing = None
        for ing in self.ingredients:
            base = ing.get("base_unit", "")
            density = ing.get("density_g_per_ml")
            if base == "g" and (not density or density == 0):
                test_ing = ing
                break
        
        if not test_ing:
            # Use weight ingredient and assume it might not have density
            test_ing = self.weight_ingredient
            if not test_ing:
                pytest.skip("No suitable ingredient found for incompatible unit test")
        
        ing_id = test_ing["ingredient_id"]
        
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 100,
            "unit": "ml",  # Volume unit when base is weight
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200
        data = resp.json()
        
        # If ingredient has density, it will be compatible; if not, incompatible
        if test_ing.get("density_g_per_ml") and test_ing["density_g_per_ml"] > 0:
            # Has density - should be compatible
            assert data["compatible"] == True
            print(f"✓ Ingredient has density, ml→g conversion compatible")
        else:
            # No density - should be incompatible
            assert data["compatible"] == False, f"Expected compatible=false for ml→g without density"
            assert data["message"] is not None, "Expected warning message for incompatible units"
            assert "no es compatible" in data["message"].lower() or "incompatible" in data["message"].lower()
            print(f"✓ Incompatible units detected: message='{data['message']}'")
    
    def test_cost_preview_mass_volume_with_density(self):
        """Test mass↔volume conversion when ingredient has density - should return compatible=true"""
        if not self.ingredient_with_density:
            pytest.skip("No ingredient with density found")
        
        ing_id = self.ingredient_with_density["ingredient_id"]
        base_unit = self.ingredient_with_density.get("base_unit", "")
        density = self.ingredient_with_density.get("density_g_per_ml")
        
        # Determine which unit to request based on base_unit
        if base_unit in ["g", "kg", "oz", "lb"]:
            request_unit = "ml"  # Request volume when base is weight
        else:
            request_unit = "g"  # Request weight when base is volume
        
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 100,
            "unit": request_unit,
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["compatible"] == True, f"Expected compatible=true with density={density}, got {data['compatible']}"
        assert data["quantity_in_base"] is not None, "Expected quantity_in_base for density conversion"
        
        print(f"✓ Mass↔volume with density: {request_unit}→{base_unit}, quantity_in_base={data['quantity_in_base']}")
    
    def test_cost_preview_invalid_ingredient_id(self):
        """Test 404 for invalid ingredient_id"""
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": "ing_nonexistent_12345",
            "quantity": 100,
            "unit": "g",
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 404, f"Expected 404 for invalid ingredient, got {resp.status_code}"
        print("✓ 404 returned for invalid ingredient_id")
    
    def test_cost_preview_missing_ingredient_id(self):
        """Test 400 for missing ingredient_id"""
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "quantity": 100,
            "unit": "g"
        })
        
        assert resp.status_code == 400, f"Expected 400 for missing ingredient_id, got {resp.status_code}"
        print("✓ 400 returned for missing ingredient_id")
    
    def test_cost_preview_with_waste_factor(self):
        """Test cost calculation with waste factor"""
        if not self.weight_ingredient:
            pytest.skip("No weight ingredient found")
        
        ing_id = self.weight_ingredient["ingredient_id"]
        base_unit = self.weight_ingredient.get("base_unit", "g")
        
        # First get cost without waste
        resp_no_waste = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 100,
            "unit": base_unit,
            "waste_factor_pct": 0
        })
        assert resp_no_waste.status_code == 200
        cost_no_waste = resp_no_waste.json()["cost"]
        
        # Then get cost with 10% waste
        resp_with_waste = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 100,
            "unit": base_unit,
            "waste_factor_pct": 10
        })
        assert resp_with_waste.status_code == 200
        cost_with_waste = resp_with_waste.json()["cost"]
        
        # Cost with 10% waste should be ~10% higher
        expected_cost = cost_no_waste * 1.1
        assert abs(cost_with_waste - expected_cost) < 0.01, \
            f"Expected cost with 10% waste to be ~{expected_cost}, got {cost_with_waste}"
        
        print(f"✓ Waste factor: cost_no_waste=${cost_no_waste}, cost_with_10%_waste=${cost_with_waste}")
    
    def test_cost_preview_zero_quantity(self):
        """Test cost preview with zero quantity - should return cost=0"""
        if not self.weight_ingredient:
            pytest.skip("No weight ingredient found")
        
        ing_id = self.weight_ingredient["ingredient_id"]
        
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 0,
            "unit": "g",
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200
        data = resp.json()
        assert data["cost"] == 0, f"Expected cost=0 for zero quantity, got {data['cost']}"
        
        print("✓ Zero quantity returns cost=0")
    
    def test_cost_preview_volume_cross_unit(self):
        """Test cross-unit conversion within volume (ml↔L)"""
        if not self.volume_ingredient:
            pytest.skip("No volume ingredient found")
        
        ing_id = self.volume_ingredient["ingredient_id"]
        
        resp = self.session.post(f"{BASE_URL}/api/inventory/ingredients/cost-preview", json={
            "ingredient_id": ing_id,
            "quantity": 1,
            "unit": "L",
            "waste_factor_pct": 0
        })
        
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["compatible"] == True, f"Expected compatible=true for L→ml conversion"
        assert data["quantity_in_base"] == 1000, f"Expected 1L = 1000ml, got {data['quantity_in_base']}"
        
        print(f"✓ Cross-unit volume (L→ml): quantity_in_base={data['quantity_in_base']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
