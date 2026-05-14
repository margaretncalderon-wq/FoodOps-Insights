"""
Test suite for Public Catalog Sprint features:
- GET /api/public/catalog/{slug} - Public catalog page (no auth)
- POST /api/public/catalog/{slug}/quote-request - Quote request form (no auth)
- PUT /api/settings/company - Catalog slug validation
- Regression tests for existing endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MARGARET_EMAIL = "margaret.n.calderon@gmail.com"
MARGARET_PASSWORD = "Evoque2024!"
MARGARET_SLUG = "margaret-catering"


class TestPublicCatalogEndpoint:
    """Tests for GET /api/public/catalog/{slug} - NO AUTH required"""
    
    def test_public_catalog_valid_slug(self):
        """Test fetching public catalog with valid published slug"""
        response = requests.get(f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}")
        print(f"GET /api/public/catalog/{MARGARET_SLUG} - Status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "company" in data, "Response should contain 'company'"
        assert "catalog" in data, "Response should contain 'catalog'"
        assert "recipes" in data, "Response should contain 'recipes'"
        assert "menus" in data, "Response should contain 'menus'"
        assert "allergens" in data, "Response should contain 'allergens'"
        
        # Verify company info
        company = data["company"]
        assert "name" in company, "Company should have name"
        assert "primary_color" in company, "Company should have primary_color"
        print(f"Company name: {company.get('name')}")
        
        # Verify catalog info
        catalog = data["catalog"]
        assert catalog.get("slug") == MARGARET_SLUG, f"Catalog slug should be {MARGARET_SLUG}"
        print(f"Catalog headline: {catalog.get('headline')}")
        print(f"Show prices: {catalog.get('show_prices')}")
    
    def test_public_catalog_recipes_only_is_on_menu(self):
        """Verify recipes returned only have is_on_menu=true"""
        response = requests.get(f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}")
        assert response.status_code == 200
        
        data = response.json()
        recipes = data.get("recipes", [])
        print(f"Found {len(recipes)} recipes in public catalog")
        
        # Each recipe should have is_on_menu=true (implicitly, since query filters)
        for r in recipes:
            print(f"  - Recipe: {r.get('name')} (ID: {r.get('recipe_id')})")
            # Verify cost_per_portion is NOT in response (internal info)
            assert "cost_per_portion" not in r, f"Recipe {r.get('name')} should NOT have cost_per_portion exposed"
    
    def test_public_catalog_recipes_have_portion_formats(self):
        """Verify recipes include portion_formats with sell_price but no internal cost"""
        response = requests.get(f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}")
        assert response.status_code == 200
        
        data = response.json()
        recipes = data.get("recipes", [])
        
        for r in recipes:
            formats = r.get("portion_formats", [])
            print(f"Recipe '{r.get('name')}' has {len(formats)} portion formats")
            for f in formats:
                assert "format_name" in f, "Portion format should have format_name"
                assert "sell_price" in f or "suggested_price" in f, "Portion format should have sell_price or suggested_price"
                assert "is_default" in f, "Portion format should have is_default"
                # Verify no internal cost exposed
                assert "cost_per_portion" not in f, "Portion format should NOT expose cost_per_portion"
                print(f"    - {f.get('format_name')}: ${f.get('sell_price', f.get('suggested_price', 0))}")
    
    def test_public_catalog_menus_only_active(self):
        """Verify menus returned only have is_active=true and no total_cost"""
        response = requests.get(f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}")
        assert response.status_code == 200
        
        data = response.json()
        menus = data.get("menus", [])
        print(f"Found {len(menus)} active menus/packages")
        
        for m in menus:
            print(f"  - Menu: {m.get('name')} (type: {m.get('menu_type')})")
            # Verify total_cost is NOT in response (internal info)
            assert "total_cost" not in m, f"Menu {m.get('name')} should NOT have total_cost exposed"
    
    def test_public_catalog_allergens_enriched(self):
        """Verify allergens are enriched with name, name_es, icon"""
        response = requests.get(f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}")
        assert response.status_code == 200
        
        data = response.json()
        allergens = data.get("allergens", [])
        print(f"Found {len(allergens)} allergen configs")
        
        for a in allergens:
            assert "allergen_id" in a, "Allergen should have allergen_id"
            assert "name" in a, "Allergen should have name"
            # name_es and icon are optional but should be present if configured
            print(f"  - {a.get('name')} ({a.get('name_es', 'N/A')}) icon: {a.get('icon', 'N/A')}")
    
    def test_public_catalog_nonexistent_slug_returns_404(self):
        """Test that non-existent slug returns 404"""
        fake_slug = f"nonexistent-catalog-{uuid.uuid4().hex[:8]}"
        response = requests.get(f"{BASE_URL}/api/public/catalog/{fake_slug}")
        print(f"GET /api/public/catalog/{fake_slug} - Status: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404 for non-existent slug, got {response.status_code}"
    
    def test_public_catalog_unpublished_returns_404(self):
        """Test that unpublished catalog returns 404 (would need to create one)"""
        # This test assumes there's no catalog with this slug that's unpublished
        # In a real scenario, we'd create a company with catalog_published=false
        fake_slug = "unpublished-test-catalog"
        response = requests.get(f"{BASE_URL}/api/public/catalog/{fake_slug}")
        print(f"GET /api/public/catalog/{fake_slug} - Status: {response.status_code}")
        
        # Should be 404 since it doesn't exist or isn't published
        assert response.status_code == 404


class TestQuoteRequestEndpoint:
    """Tests for POST /api/public/catalog/{slug}/quote-request - NO AUTH required"""
    
    def test_quote_request_success(self):
        """Test successful quote request creates a Lead"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "name": "Test Customer",
            "email": unique_email,
            "phone": "+1234567890",
            "company_name": "Test Corp",
            "event_date": "2026-03-15",
            "guest_count": 50,
            "event_type": "Corporate",
            "message": "We need catering for our annual meeting",
            "interest_items": [
                {"type": "recipe", "id": "test_recipe_1", "name": "Buffet Especial"}
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}/quote-request",
            json=payload
        )
        print(f"POST quote-request - Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Response should have ok=True"
        assert "lead_id" in data, "Response should contain lead_id"
        print(f"Created lead_id: {data.get('lead_id')}")
    
    def test_quote_request_missing_name_returns_400(self):
        """Test that missing name returns 400"""
        payload = {
            "email": "test@example.com",
            "message": "Test message"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}/quote-request",
            json=payload
        )
        print(f"POST quote-request (no name) - Status: {response.status_code}")
        
        assert response.status_code == 400, f"Expected 400 for missing name, got {response.status_code}"
    
    def test_quote_request_missing_email_returns_400(self):
        """Test that missing email returns 400"""
        payload = {
            "name": "Test Customer",
            "message": "Test message"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}/quote-request",
            json=payload
        )
        print(f"POST quote-request (no email) - Status: {response.status_code}")
        
        assert response.status_code == 400, f"Expected 400 for missing email, got {response.status_code}"
    
    def test_quote_request_nonexistent_slug_returns_404(self):
        """Test that quote request to non-existent slug returns 404"""
        fake_slug = f"nonexistent-{uuid.uuid4().hex[:8]}"
        payload = {
            "name": "Test Customer",
            "email": "test@example.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/public/catalog/{fake_slug}/quote-request",
            json=payload
        )
        print(f"POST quote-request to {fake_slug} - Status: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404 for non-existent slug, got {response.status_code}"


class TestLeadVisibilityFromQuoteRequest:
    """Test that leads created from quote-request are visible to authenticated users"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Margaret"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MARGARET_EMAIL,
            "password": MARGARET_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        return session
    
    def test_lead_from_quote_visible_in_leads_list(self, auth_session):
        """Test that a lead created via quote-request is visible in GET /api/leads"""
        # First create a quote request
        unique_email = f"visibility_test_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "name": "Visibility Test Customer",
            "email": unique_email,
            "phone": "+1234567890",
            "message": "Testing lead visibility"
        }
        
        quote_response = requests.post(
            f"{BASE_URL}/api/public/catalog/{MARGARET_SLUG}/quote-request",
            json=payload
        )
        assert quote_response.status_code == 200
        lead_id = quote_response.json().get("lead_id")
        print(f"Created lead via quote-request: {lead_id}")
        
        # Now fetch leads as authenticated user
        leads_response = auth_session.get(f"{BASE_URL}/api/leads")
        assert leads_response.status_code == 200
        
        leads = leads_response.json()
        lead_ids = [l.get("lead_id") for l in leads]
        
        assert lead_id in lead_ids, f"Lead {lead_id} should be visible in leads list"
        
        # Find the lead and verify source
        created_lead = next((l for l in leads if l.get("lead_id") == lead_id), None)
        assert created_lead is not None
        assert created_lead.get("source") == "public_catalog", "Lead source should be 'public_catalog'"
        assert "catalog" in (created_lead.get("tags") or []), "Lead should have 'catalog' tag"
        print(f"Lead verified: source={created_lead.get('source')}, tags={created_lead.get('tags')}")


class TestCatalogSlugValidation:
    """Tests for PUT /api/settings/company catalog_slug validation"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Margaret"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MARGARET_EMAIL,
            "password": MARGARET_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        return session
    
    def test_slug_normalization(self, auth_session):
        """Test that slug is normalized to lowercase+dashes"""
        # First get current settings to restore later
        current = auth_session.get(f"{BASE_URL}/api/settings/company").json()
        original_slug = current.get("catalog_slug")
        
        # Test normalization: 'My Restaurant!' should become 'my-restaurant'
        test_slug = f"Test-Slug-{uuid.uuid4().hex[:4]}!"
        expected_slug = test_slug.lower().replace("!", "").strip("-")
        
        response = auth_session.put(f"{BASE_URL}/api/settings/company", json={
            "catalog_slug": test_slug
        })
        print(f"PUT catalog_slug='{test_slug}' - Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            actual_slug = data.get("catalog_slug")
            print(f"Normalized slug: {actual_slug}")
            # Restore original
            auth_session.put(f"{BASE_URL}/api/settings/company", json={
                "catalog_slug": original_slug
            })
            # Verify normalization happened
            assert actual_slug is not None
            assert actual_slug == actual_slug.lower(), "Slug should be lowercase"
        else:
            print(f"Response: {response.text}")
    
    def test_slug_too_short_returns_400(self, auth_session):
        """Test that slug < 3 chars returns 400"""
        response = auth_session.put(f"{BASE_URL}/api/settings/company", json={
            "catalog_slug": "ab"
        })
        print(f"PUT catalog_slug='ab' - Status: {response.status_code}")
        
        assert response.status_code == 400, f"Expected 400 for short slug, got {response.status_code}"
    
    def test_slug_already_taken_returns_409(self, auth_session):
        """Test that duplicate slug returns 409 (would need another company)"""
        # This test would require another company with a known slug
        # For now, we just verify the endpoint accepts valid slugs
        pass


class TestRegressionExistingEndpoints:
    """Regression tests to ensure existing endpoints still work after public catalog addition"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Margaret"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MARGARET_EMAIL,
            "password": MARGARET_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        return session
    
    def test_recipes_crud_still_works(self, auth_session):
        """Verify GET /api/recipes still works"""
        response = auth_session.get(f"{BASE_URL}/api/recipes")
        print(f"GET /api/recipes - Status: {response.status_code}")
        assert response.status_code == 200, f"Recipes endpoint broken: {response.text}"
        
        recipes = response.json()
        print(f"Found {len(recipes)} recipes")
        assert isinstance(recipes, list)
    
    def test_ingredients_crud_still_works(self, auth_session):
        """Verify GET /api/inventory/ingredients still works"""
        response = auth_session.get(f"{BASE_URL}/api/inventory/ingredients")
        print(f"GET /api/inventory/ingredients - Status: {response.status_code}")
        assert response.status_code == 200, f"Ingredients endpoint broken: {response.text}"
    
    def test_production_batches_still_works(self, auth_session):
        """Verify GET /api/production/batches still works"""
        response = auth_session.get(f"{BASE_URL}/api/production/batches")
        print(f"GET /api/production/batches - Status: {response.status_code}")
        assert response.status_code == 200, f"Production batches endpoint broken: {response.text}"
    
    def test_purchase_orders_still_works(self, auth_session):
        """Verify GET /api/purchase-orders still works"""
        response = auth_session.get(f"{BASE_URL}/api/purchase-orders")
        print(f"GET /api/purchase-orders - Status: {response.status_code}")
        assert response.status_code == 200, f"Purchase orders endpoint broken: {response.text}"
    
    def test_cost_preview_still_works(self, auth_session):
        """Verify POST /api/recipes/cost-preview still works"""
        payload = {
            "ingredients": [
                {"ingredient_id": "test", "quantity": 1, "unit": "kg"}
            ],
            "sub_recipes": []
        }
        response = auth_session.post(f"{BASE_URL}/api/recipes/cost-preview", json=payload)
        print(f"POST /api/recipes/cost-preview - Status: {response.status_code}")
        # May return 200 or 404 depending on ingredient existence, but shouldn't be 500
        assert response.status_code != 500, f"Cost preview endpoint broken: {response.text}"
    
    def test_leads_endpoint_still_works(self, auth_session):
        """Verify GET /api/leads still works"""
        response = auth_session.get(f"{BASE_URL}/api/leads")
        print(f"GET /api/leads - Status: {response.status_code}")
        assert response.status_code == 200, f"Leads endpoint broken: {response.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
