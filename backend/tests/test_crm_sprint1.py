"""
CRM Sprint 1 Tests: Tags, Service Areas, Geo Stats, Lead Map
Tests for:
- Tags CRUD (auto-seed 8 defaults, create, delete, update lead tags)
- Service Areas CRUD (auto-seed RD with 7 regions, create, update, delete)
- Geo Stats (city aggregation with lead counts)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCRMTags:
    """CRM Tags endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        yield
        self.session.close()
    
    def test_get_tags_returns_8_defaults(self):
        """GET /api/crm/tags - should return 8 auto-seeded default tags"""
        res = self.session.get(f"{BASE_URL}/api/crm/tags")
        assert res.status_code == 200, f"Failed: {res.text}"
        tags = res.json()
        assert isinstance(tags, list), "Tags should be a list"
        # Should have at least 8 default tags
        assert len(tags) >= 8, f"Expected at least 8 tags, got {len(tags)}"
        # Check default tag names exist
        tag_names = [t.get("name") for t in tags]
        expected_defaults = ["VIP", "Hot Lead", "Referido", "Corporativo", "Social", "Hotel", "Gobierno", "Recurrente"]
        for expected in expected_defaults:
            assert expected in tag_names, f"Missing default tag: {expected}"
        # Check tag structure
        for tag in tags:
            assert "tag_id" in tag, "Tag missing tag_id"
            assert "name" in tag, "Tag missing name"
            assert "color" in tag, "Tag missing color"
            assert tag["color"].startswith("#"), f"Color should be hex: {tag['color']}"
    
    def test_create_tag(self):
        """POST /api/crm/tags - create new tag with name and color"""
        new_tag = {"name": "TEST_Sprint1_Tag", "color": "#ff5733"}
        res = self.session.post(f"{BASE_URL}/api/crm/tags", json=new_tag)
        assert res.status_code == 200, f"Failed: {res.text}"
        created = res.json()
        assert created.get("name") == "TEST_Sprint1_Tag"
        assert created.get("color") == "#ff5733"
        assert "tag_id" in created
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/tags/{created['tag_id']}")
    
    def test_create_tag_empty_name_fails(self):
        """POST /api/crm/tags - should fail with empty name"""
        res = self.session.post(f"{BASE_URL}/api/crm/tags", json={"name": "", "color": "#000000"})
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    
    def test_delete_tag(self):
        """DELETE /api/crm/tags/{tag_id} - delete tag"""
        # Create a tag first
        create_res = self.session.post(f"{BASE_URL}/api/crm/tags", json={
            "name": "TEST_ToDelete", "color": "#123456"
        })
        assert create_res.status_code == 200
        tag_id = create_res.json()["tag_id"]
        # Delete it
        del_res = self.session.delete(f"{BASE_URL}/api/crm/tags/{tag_id}")
        assert del_res.status_code == 200, f"Delete failed: {del_res.text}"
        assert del_res.json().get("deleted") == True
        # Verify it's gone
        tags_res = self.session.get(f"{BASE_URL}/api/crm/tags")
        tag_ids = [t["tag_id"] for t in tags_res.json()]
        assert tag_id not in tag_ids, "Tag should be deleted"


class TestCRMServiceAreas:
    """CRM Service Areas endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        yield
        self.session.close()
    
    def test_get_service_areas_returns_rd_default(self):
        """GET /api/crm/service-areas - should return RD with 7 regions"""
        res = self.session.get(f"{BASE_URL}/api/crm/service-areas")
        assert res.status_code == 200, f"Failed: {res.text}"
        areas = res.json()
        assert isinstance(areas, list), "Areas should be a list"
        assert len(areas) >= 1, "Should have at least 1 area"
        # Find RD
        rd_area = next((a for a in areas if a.get("country") == "República Dominicana"), None)
        assert rd_area is not None, "República Dominicana should be auto-seeded"
        assert rd_area.get("country_code") == "DO", "Country code should be DO"
        # Check 7 regions
        regions = rd_area.get("regions", [])
        assert len(regions) >= 7, f"Expected 7 regions, got {len(regions)}"
        region_names = [r.get("name") for r in regions]
        expected_regions = ["Distrito Nacional", "Santo Domingo", "Santiago", "La Altagracia", "Puerto Plata", "La Romana", "Samaná"]
        for expected in expected_regions:
            assert expected in region_names, f"Missing region: {expected}"
    
    def test_create_service_area(self):
        """POST /api/crm/service-areas - create new country"""
        new_area = {
            "country": "TEST_Mexico",
            "country_code": "MX",
            "regions": [{"name": "CDMX", "cities": ["Mexico City"]}]
        }
        res = self.session.post(f"{BASE_URL}/api/crm/service-areas", json=new_area)
        assert res.status_code == 200, f"Failed: {res.text}"
        created = res.json()
        assert created.get("country") == "TEST_Mexico"
        assert created.get("country_code") == "MX"
        assert "area_id" in created
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/service-areas/{created['area_id']}")
    
    def test_create_service_area_empty_country_fails(self):
        """POST /api/crm/service-areas - should fail with empty country"""
        res = self.session.post(f"{BASE_URL}/api/crm/service-areas", json={"country": "", "country_code": "XX"})
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    
    def test_update_service_area_regions(self):
        """PUT /api/crm/service-areas/{area_id} - update regions/cities"""
        # Create a test area
        create_res = self.session.post(f"{BASE_URL}/api/crm/service-areas", json={
            "country": "TEST_UpdateArea",
            "country_code": "TA",
            "regions": []
        })
        assert create_res.status_code == 200
        area_id = create_res.json()["area_id"]
        # Update with regions
        new_regions = [
            {"name": "Region1", "cities": ["City1", "City2"]},
            {"name": "Region2", "cities": ["City3"]}
        ]
        update_res = self.session.put(f"{BASE_URL}/api/crm/service-areas/{area_id}", json={
            "regions": new_regions
        })
        assert update_res.status_code == 200, f"Update failed: {update_res.text}"
        updated = update_res.json()
        assert len(updated.get("regions", [])) == 2
        assert updated["regions"][0]["name"] == "Region1"
        assert "City1" in updated["regions"][0]["cities"]
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/crm/service-areas/{area_id}")
    
    def test_delete_service_area(self):
        """DELETE /api/crm/service-areas/{area_id} - delete area"""
        # Create a test area
        create_res = self.session.post(f"{BASE_URL}/api/crm/service-areas", json={
            "country": "TEST_ToDeleteArea",
            "country_code": "TD"
        })
        assert create_res.status_code == 200
        area_id = create_res.json()["area_id"]
        # Delete it
        del_res = self.session.delete(f"{BASE_URL}/api/crm/service-areas/{area_id}")
        assert del_res.status_code == 200, f"Delete failed: {del_res.text}"
        assert del_res.json().get("deleted") == True


class TestCRMGeoStats:
    """CRM Geo Stats endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        yield
        self.session.close()
    
    def test_get_geo_stats_structure(self):
        """GET /api/crm/geo-stats - returns city aggregation with lead counts"""
        res = self.session.get(f"{BASE_URL}/api/crm/geo-stats")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        # Check structure
        assert "cities" in data, "Response should have 'cities' key"
        assert "no_city_count" in data, "Response should have 'no_city_count' key"
        assert isinstance(data["cities"], list), "cities should be a list"
        assert isinstance(data["no_city_count"], int), "no_city_count should be int"
        # Check city structure if any exist
        if data["cities"]:
            city = data["cities"][0]
            assert "city" in city, "City should have 'city' name"
            assert "total" in city, "City should have 'total' count"
            assert "new" in city, "City should have 'new' count"
            assert "contacted" in city, "City should have 'contacted' count"
            assert "engaged" in city, "City should have 'engaged' count"


class TestCRMLeadTags:
    """CRM Lead Tags update tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        yield
        self.session.close()
    
    def test_update_lead_tags(self):
        """POST /api/crm/leads/{lead_id}/tags - update lead tags"""
        # Get existing leads
        leads_res = self.session.get(f"{BASE_URL}/api/crm/outreach")
        assert leads_res.status_code == 200
        leads = leads_res.json()
        if not leads:
            pytest.skip("No leads available for testing")
        lead_id = leads[0]["lead_id"]
        # Get existing tags
        tags_res = self.session.get(f"{BASE_URL}/api/crm/tags")
        tags = tags_res.json()
        if not tags:
            pytest.skip("No tags available for testing")
        tag_ids = [tags[0]["tag_id"]]
        # Update lead tags
        update_res = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/tags", json={
            "tags": tag_ids
        })
        assert update_res.status_code == 200, f"Failed: {update_res.text}"
        assert update_res.json().get("updated") == True
        # Verify by getting the lead
        lead_res = self.session.get(f"{BASE_URL}/api/leads/{lead_id}")
        if lead_res.status_code == 200:
            lead = lead_res.json()
            assert tag_ids[0] in lead.get("tags", []), "Tag should be applied to lead"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
