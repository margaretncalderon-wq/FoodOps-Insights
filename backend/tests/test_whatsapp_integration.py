"""
Test WhatsApp Click-to-Chat Integration for Public Catalog
Tests for iteration 156 features:
- Quote request returns whatsapp links (visitor_link, owner_link)
- NO Communications are auto-created (critical regression)
- Performance Dashboard KPIs should NOT be inflated
- Lead created with interest_items and whatsapp field
- Admin notifications created with correct metadata
"""
import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MARGARET_EMAIL = "margaret.n.calderon@gmail.com"
MARGARET_PASSWORD = "Evoque2024!"
CATALOG_SLUG = "margaret-catering"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as Margaret
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": MARGARET_EMAIL,
        "password": MARGARET_PASSWORD
    })
    
    if login_resp.status_code != 200:
        pytest.skip(f"Login failed: {login_resp.status_code} - {login_resp.text}")
    
    data = login_resp.json()
    token = data.get("token")
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    
    # Also set cookies if present
    session.cookies.update(login_resp.cookies)
    
    yield session
    session.close()


class TestWhatsAppIntegration:
    """WhatsApp click-to-chat integration tests"""

    # ============== CRITICAL REGRESSION TESTS ==============
    
    def test_performance_dashboard_whatsapp_kpi_not_inflated(self, auth_session):
        """
        CRITICAL: GET /api/crm/reports/performance whatsapp KPI count 
        should NOT grow when quote-requests are submitted.
        """
        # Get initial performance report
        resp1 = auth_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=week")
        assert resp1.status_code == 200, f"Performance report failed: {resp1.text}"
        data1 = resp1.json()
        
        # Extract initial whatsapp KPI
        kpis1 = data1.get("kpis", {})
        initial_whatsapp = kpis1.get("whatsapp", {}).get("current", 0)
        print(f"Initial WhatsApp KPI: {initial_whatsapp}")
        
        # Submit 3 quote requests
        for i in range(3):
            unique_email = f"test_wa_kpi_{int(time.time())}_{i}@test.com"
            payload = {
                "name": f"Test WA KPI User {i}",
                "email": unique_email,
                "phone": f"+1809555{1000+i}",
                "event_date": "2026-03-15",
                "guest_count": 50,
                "message": "Testing WhatsApp KPI regression"
            }
            quote_resp = requests.post(
                f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
                json=payload
            )
            assert quote_resp.status_code == 200, f"Quote request {i} failed: {quote_resp.text}"
            print(f"Quote request {i+1} submitted successfully")
        
        # Get performance report again
        resp2 = auth_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=week")
        assert resp2.status_code == 200
        data2 = resp2.json()
        
        kpis2 = data2.get("kpis", {})
        final_whatsapp = kpis2.get("whatsapp", {}).get("current", 0)
        print(f"Final WhatsApp KPI: {final_whatsapp}")
        
        # CRITICAL: WhatsApp KPI should NOT have increased
        assert final_whatsapp == initial_whatsapp, \
            f"CRITICAL REGRESSION: WhatsApp KPI increased from {initial_whatsapp} to {final_whatsapp} after quote requests!"

    def test_communications_collection_not_inflated(self, auth_session):
        """
        CRITICAL: db.communications collection should NOT receive entries 
        with source='public_catalog' or comm_type='whatsapp' automatically.
        """
        # Submit a quote request
        unique_email = f"test_comm_check_{int(time.time())}@test.com"
        payload = {
            "name": "Test Comm Check User",
            "email": unique_email,
            "phone": "+18095559999",
            "message": "Testing communications regression"
        }
        quote_resp = requests.post(
            f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
            json=payload
        )
        assert quote_resp.status_code == 200
        lead_id = quote_resp.json().get("lead_id")
        print(f"Created lead: {lead_id}")
        
        # Check communications for this lead
        comm_resp = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}/communications")
        if comm_resp.status_code == 200:
            lead_comms = comm_resp.json()
            # Should be empty - no auto-created communications
            assert len(lead_comms) == 0, \
                f"CRITICAL: Found {len(lead_comms)} auto-created communications for catalog lead!"
            print(f"Lead communications count: {len(lead_comms)} (expected 0)")
        else:
            print(f"Communications endpoint returned: {comm_resp.status_code}")

    # ============== QUOTE REQUEST RESPONSE STRUCTURE ==============
    
    def test_quote_request_returns_whatsapp_links(self):
        """
        POST /api/public/catalog/{slug}/quote-request should return 
        {ok, lead_id, whatsapp:{visitor_link, owner_link}}
        """
        unique_email = f"test_wa_links_{int(time.time())}@test.com"
        payload = {
            "name": "Test WhatsApp Links",
            "email": unique_email,
            "phone": "+18095551234",
            "event_date": "2026-04-20",
            "guest_count": 100,
            "event_type": "wedding",
            "message": "Testing WhatsApp links"
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
            json=payload
        )
        assert resp.status_code == 200, f"Quote request failed: {resp.text}"
        
        data = resp.json()
        
        # Check response structure
        assert data.get("ok") is True, "Response should have ok=True"
        assert "lead_id" in data, "Response should have lead_id"
        assert "whatsapp" in data, "Response should have whatsapp object"
        
        whatsapp = data["whatsapp"]
        assert "visitor_link" in whatsapp, "whatsapp should have visitor_link"
        assert "owner_link" in whatsapp, "whatsapp should have owner_link"
        
        # Validate visitor_link format (company phone)
        visitor_link = whatsapp["visitor_link"]
        assert visitor_link is not None, "visitor_link should not be null (company has phone)"
        assert visitor_link.startswith("https://wa.me/"), f"visitor_link should start with wa.me: {visitor_link}"
        assert "?text=" in visitor_link, "visitor_link should have text parameter"
        
        # Validate owner_link format (visitor phone)
        owner_link = whatsapp["owner_link"]
        assert owner_link is not None, "owner_link should not be null (visitor provided phone)"
        assert owner_link.startswith("https://wa.me/"), f"owner_link should start with wa.me: {owner_link}"
        assert "18095551234" in owner_link, "owner_link should contain visitor's phone digits"
        
        print(f"visitor_link: {visitor_link[:80]}...")
        print(f"owner_link: {owner_link[:80]}...")

    def test_quote_request_without_phone_owner_link_null(self):
        """
        If visitor does NOT provide phone, owner_link should be null 
        but visitor_link should still work (if company has phone/whatsapp)
        """
        unique_email = f"test_no_phone_{int(time.time())}@test.com"
        payload = {
            "name": "Test No Phone",
            "email": unique_email,
            # NO phone provided
            "message": "Testing without phone"
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
            json=payload
        )
        assert resp.status_code == 200
        
        data = resp.json()
        whatsapp = data.get("whatsapp", {})
        
        # visitor_link should still work (company has phone)
        assert whatsapp.get("visitor_link") is not None, \
            "visitor_link should work even without visitor phone"
        
        # owner_link should be null (no visitor phone)
        assert whatsapp.get("owner_link") is None, \
            "owner_link should be null when visitor doesn't provide phone"
        
        print(f"visitor_link present: {whatsapp.get('visitor_link') is not None}")
        print(f"owner_link is null: {whatsapp.get('owner_link') is None}")

    # ============== LEAD DATA VERIFICATION ==============
    
    def test_lead_includes_interest_items(self, auth_session):
        """Lead created should include interest_items[] from payload"""
        unique_email = f"test_interest_{int(time.time())}@test.com"
        interest_items = [
            {"type": "recipe", "id": "rec_test1", "name": "Arroz con Pollo"},
            {"type": "menu", "id": "menu_test1", "name": "Paquete Premium"}
        ]
        payload = {
            "name": "Test Interest Items",
            "email": unique_email,
            "phone": "+18095554321",
            "interest_items": interest_items
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
            json=payload
        )
        assert resp.status_code == 200
        lead_id = resp.json().get("lead_id")
        
        # Fetch the lead
        lead_resp = auth_session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert lead_resp.status_code == 200, f"Failed to fetch lead: {lead_resp.text}"
        
        lead = lead_resp.json()
        assert "interest_items" in lead, "Lead should have interest_items field"
        assert len(lead["interest_items"]) == 2, f"Expected 2 interest items, got {len(lead['interest_items'])}"
        
        # Verify items match
        item_names = [i.get("name") for i in lead["interest_items"]]
        assert "Arroz con Pollo" in item_names
        assert "Paquete Premium" in item_names
        
        print(f"Lead interest_items: {lead['interest_items']}")

    def test_lead_whatsapp_field_prefilled(self, auth_session):
        """Lead should have whatsapp field pre-filled with visitor's phone"""
        unique_email = f"test_wa_field_{int(time.time())}@test.com"
        visitor_phone = "+18095556789"
        payload = {
            "name": "Test WA Field",
            "email": unique_email,
            "phone": visitor_phone
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
            json=payload
        )
        assert resp.status_code == 200
        lead_id = resp.json().get("lead_id")
        
        # Fetch the lead
        lead_resp = auth_session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert lead_resp.status_code == 200
        
        lead = lead_resp.json()
        assert lead.get("whatsapp") == visitor_phone, \
            f"Lead whatsapp should be {visitor_phone}, got {lead.get('whatsapp')}"
        assert lead.get("phone") == visitor_phone, \
            f"Lead phone should be {visitor_phone}, got {lead.get('phone')}"
        
        print(f"Lead whatsapp: {lead.get('whatsapp')}")

    # ============== ADMIN NOTIFICATION ==============
    
    def test_admin_notification_created(self, auth_session):
        """
        Admin notification should be created with type='catalog_quote_request',
        priority='high', and metadata including lead_id + owner_wa_link
        """
        unique_email = f"test_notif_{int(time.time())}@test.com"
        payload = {
            "name": "Test Notification",
            "email": unique_email,
            "phone": "+18095558888",
            "guest_count": 75,
            "event_date": "2026-05-10"
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/public/catalog/{CATALOG_SLUG}/quote-request",
            json=payload
        )
        assert resp.status_code == 200
        lead_id = resp.json().get("lead_id")
        
        # Fetch notifications
        notif_resp = auth_session.get(f"{BASE_URL}/api/notifications?limit=20")
        assert notif_resp.status_code == 200, f"Failed to fetch notifications: {notif_resp.text}"
        
        notifications = notif_resp.json()
        
        # Find the notification for this lead
        catalog_notif = None
        for n in notifications:
            if n.get("type") == "catalog_quote_request":
                metadata = n.get("metadata", {})
                if metadata.get("lead_id") == lead_id:
                    catalog_notif = n
                    break
        
        assert catalog_notif is not None, \
            f"No catalog_quote_request notification found for lead {lead_id}"
        
        # Verify notification properties
        assert catalog_notif.get("priority") == "high", \
            f"Notification priority should be 'high', got {catalog_notif.get('priority')}"
        
        metadata = catalog_notif.get("metadata", {})
        assert metadata.get("lead_id") == lead_id
        assert metadata.get("source") == "public_catalog"
        assert "owner_wa_link" in metadata, "metadata should include owner_wa_link"
        
        print(f"Notification found: {catalog_notif.get('title')}")
        print(f"Metadata: {metadata}")

    # ============== BACKEND REGRESSION TESTS ==============
    
    def test_performance_dashboard_still_works(self, auth_session):
        """Performance Dashboard tab should still work without errors"""
        resp = auth_session.get(f"{BASE_URL}/api/crm/reports/performance?granularity=week")
        assert resp.status_code == 200, f"Performance report failed: {resp.text}"
        
        data = resp.json()
        assert "kpis" in data, "Response should have kpis"
        assert "leaderboard" in data, "Response should have leaderboard"
        
        kpis = data["kpis"]
        # Verify expected KPI keys exist
        expected_keys = ["calls", "emails", "whatsapp", "new_leads", "conversions"]
        for key in expected_keys:
            assert key in kpis, f"KPI '{key}' should exist"
        
        print(f"Performance Dashboard KPIs: {list(kpis.keys())}")

    def test_production_batches_still_work(self, auth_session):
        """Production batches POST should still work"""
        payload = {
            "notes": "Test batch from WhatsApp integration test",
            "lines": []
        }
        resp = auth_session.post(f"{BASE_URL}/api/production/batches", json=payload)
        # Should succeed or fail gracefully (not 500)
        assert resp.status_code in [200, 201, 400, 422], \
            f"Production batch endpoint broken: {resp.status_code} - {resp.text}"
        print(f"Production batches endpoint: {resp.status_code}")

    def test_recipes_crud_still_works(self, auth_session):
        """Recipes CRUD should still work"""
        resp = auth_session.get(f"{BASE_URL}/api/recipes")
        assert resp.status_code == 200, f"Recipes list failed: {resp.text}"
        recipes = resp.json()
        print(f"Recipes count: {len(recipes)}")

    def test_ingredients_crud_still_works(self, auth_session):
        """Ingredients CRUD should still work"""
        resp = auth_session.get(f"{BASE_URL}/api/inventory")
        assert resp.status_code == 200, f"Inventory list failed: {resp.text}"
        ingredients = resp.json()
        print(f"Ingredients count: {len(ingredients)}")

    def test_leads_listing_still_works(self, auth_session):
        """Leads listing should still work"""
        resp = auth_session.get(f"{BASE_URL}/api/leads")
        assert resp.status_code == 200, f"Leads list failed: {resp.text}"
        leads = resp.json()
        print(f"Leads count: {len(leads)}")
        
        # Verify catalog leads exist
        catalog_leads = [l for l in leads if l.get("source") == "public_catalog"]
        print(f"Catalog leads count: {len(catalog_leads)}")

    def test_leads_detail_still_works(self, auth_session):
        """Lead detail should work and show interest_items"""
        # Get a catalog lead
        resp = auth_session.get(f"{BASE_URL}/api/leads")
        assert resp.status_code == 200
        leads = resp.json()
        
        catalog_leads = [l for l in leads if l.get("source") == "public_catalog"]
        if not catalog_leads:
            pytest.skip("No catalog leads found")
        
        lead = catalog_leads[0]
        lead_id = lead.get("lead_id")
        
        detail_resp = auth_session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert detail_resp.status_code == 200, f"Lead detail failed: {detail_resp.text}"
        
        detail = detail_resp.json()
        assert "lead_id" in detail
        print(f"Lead detail: {detail.get('name')} - interest_items: {detail.get('interest_items', [])}")

    def test_cost_preview_still_works(self, auth_session):
        """Cost preview endpoint should still work"""
        # Get a recipe first
        recipes_resp = auth_session.get(f"{BASE_URL}/api/recipes")
        if recipes_resp.status_code != 200:
            pytest.skip("No recipes available")
        
        recipes = recipes_resp.json()
        if not recipes:
            pytest.skip("No recipes found")
        
        recipe_id = recipes[0].get("recipe_id")
        
        # Test cost preview
        resp = auth_session.get(f"{BASE_URL}/api/recipes/{recipe_id}/cost-preview")
        assert resp.status_code in [200, 404], f"Cost preview broken: {resp.status_code}"
        print(f"Cost preview endpoint: {resp.status_code}")

    def test_purchase_orders_still_work(self, auth_session):
        """Purchase orders listing should still work"""
        resp = auth_session.get(f"{BASE_URL}/api/purchase-orders")
        assert resp.status_code == 200, f"PO list failed: {resp.text}"
        print(f"Purchase orders endpoint: {resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
