# test_pillar_rich_model.py - Testing enriched pillar model with new fields
# Tests: what_is_it, why_it_matters, content_tags, weight_percentage, color, icon
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPillarRichModel:
    """Test enriched content pillar model with new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Store token if returned
        data = login_response.json()
        if "token" in data:
            self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
        
        self.org_id = "company_3ab116c0994d"
        yield
    
    def test_create_pillar_with_all_rich_fields(self):
        """Create a pillar with all new fields: what_is_it, why_it_matters, content_tags, weight_percentage, color, icon"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_Rich_Pillar_{unique_id}",
            "description": "Test pillar with all rich fields",
            "what_is_it": "Qué es: Este pilar representa contenido de alta calidad visual",
            "why_it_matters": "Por qué importa: Genera engagement y fortalece la marca",
            "content_tags": ["Reel visual", "Foto de plato HD", "Behind the scenes"],
            "weight_percentage": 40.5,
            "color": "#FF5733",
            "icon": "🍕",
            "platforms": ["instagram", "tiktok"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=payload)
        print(f"Create pillar response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Create pillar failed: {response.text}"
        
        data = response.json()
        
        # Verify all new fields are stored and returned
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["what_is_it"] == payload["what_is_it"], "what_is_it mismatch"
        assert data["why_it_matters"] == payload["why_it_matters"], "why_it_matters mismatch"
        assert data["content_tags"] == payload["content_tags"], "content_tags mismatch"
        assert data["weight_percentage"] == payload["weight_percentage"], "weight_percentage mismatch"
        assert data["color"] == payload["color"], "color mismatch"
        assert data["icon"] == payload["icon"], "icon mismatch"
        assert "pillar_id" in data, "Missing pillar_id"
        
        # Store for cleanup
        self.created_pillar_id = data["pillar_id"]
        print(f"PASS: Created pillar with all rich fields: {data['pillar_id']}")
        
        # Cleanup
        delete_response = self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{self.created_pillar_id}?org_id={self.org_id}")
        assert delete_response.status_code == 200, f"Cleanup failed: {delete_response.text}"
        print("PASS: Cleanup successful")
    
    def test_update_pillar_all_fields(self):
        """Update pillar with all new fields"""
        unique_id = uuid.uuid4().hex[:8]
        
        # First create a pillar
        create_payload = {
            "name": f"TEST_Update_Pillar_{unique_id}",
            "description": "Initial description",
            "what_is_it": "Initial what_is_it",
            "why_it_matters": "Initial why_it_matters",
            "content_tags": ["tag1"],
            "weight_percentage": 20.0,
            "color": "#000000",
            "icon": "🏠",
            "platforms": ["instagram"]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=create_payload)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        pillar_id = create_response.json()["pillar_id"]
        
        # Now update with new values
        update_payload = {
            "name": f"TEST_Updated_Pillar_{unique_id}",
            "description": "Updated description",
            "what_is_it": "Updated: Qué es ahora algo completamente diferente",
            "why_it_matters": "Updated: Por qué importa mucho más ahora",
            "content_tags": ["Nuevo tag", "Video corto", "Contenido UGC"],
            "weight_percentage": 55.75,
            "color": "#00FF00",
            "icon": "🔥",
            "platforms": ["instagram", "youtube", "linkedin"]
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}", json=update_payload)
        print(f"Update pillar response: {update_response.status_code} - {update_response.text}")
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        data = update_response.json()
        
        # Verify all updated fields
        assert data["name"] == update_payload["name"], "Name not updated"
        assert data["what_is_it"] == update_payload["what_is_it"], "what_is_it not updated"
        assert data["why_it_matters"] == update_payload["why_it_matters"], "why_it_matters not updated"
        assert data["content_tags"] == update_payload["content_tags"], "content_tags not updated"
        assert data["weight_percentage"] == update_payload["weight_percentage"], "weight_percentage not updated"
        assert data["color"] == update_payload["color"], "color not updated"
        assert data["icon"] == update_payload["icon"], "icon not updated"
        
        print(f"PASS: Updated pillar with all rich fields")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}")
    
    def test_get_pillars_returns_new_fields(self):
        """GET /pillars returns all new fields in response"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create pillar with rich fields
        create_payload = {
            "name": f"TEST_GET_Pillar_{unique_id}",
            "description": "For GET test",
            "what_is_it": "GET test what_is_it",
            "why_it_matters": "GET test why_it_matters",
            "content_tags": ["GET tag1", "GET tag2"],
            "weight_percentage": 33.33,
            "color": "#AABBCC",
            "icon": "📷",
            "platforms": ["instagram"]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=create_payload)
        assert create_response.status_code == 200
        pillar_id = create_response.json()["pillar_id"]
        
        # GET all pillars
        get_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}")
        assert get_response.status_code == 200
        
        pillars = get_response.json()
        
        # Find our created pillar
        found_pillar = None
        for p in pillars:
            if p["pillar_id"] == pillar_id:
                found_pillar = p
                break
        
        assert found_pillar is not None, "Created pillar not found in GET response"
        
        # Verify all new fields are present
        assert found_pillar["what_is_it"] == create_payload["what_is_it"], "what_is_it missing in GET"
        assert found_pillar["why_it_matters"] == create_payload["why_it_matters"], "why_it_matters missing in GET"
        assert found_pillar["content_tags"] == create_payload["content_tags"], "content_tags missing in GET"
        assert found_pillar["weight_percentage"] == create_payload["weight_percentage"], "weight_percentage missing in GET"
        assert found_pillar["color"] == create_payload["color"], "color missing in GET"
        assert found_pillar["icon"] == create_payload["icon"], "icon missing in GET"
        
        print(f"PASS: GET /pillars returns all new fields")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}")
    
    def test_content_tags_stored_as_array(self):
        """Verify content_tags is stored as array of strings"""
        unique_id = uuid.uuid4().hex[:8]
        
        tags = ["Reel de 15s", "Carrusel educativo", "Foto lifestyle", "Video vertical"]
        
        create_payload = {
            "name": f"TEST_Tags_Pillar_{unique_id}",
            "content_tags": tags
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=create_payload)
        assert create_response.status_code == 200
        
        data = create_response.json()
        pillar_id = data["pillar_id"]
        
        # Verify tags are array
        assert isinstance(data["content_tags"], list), "content_tags is not a list"
        assert len(data["content_tags"]) == 4, f"Expected 4 tags, got {len(data['content_tags'])}"
        assert data["content_tags"] == tags, "Tags content mismatch"
        
        print(f"PASS: content_tags stored as array of strings: {data['content_tags']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}")
    
    def test_weight_percentage_stored_as_float(self):
        """Verify weight_percentage is stored as float"""
        unique_id = uuid.uuid4().hex[:8]
        
        create_payload = {
            "name": f"TEST_Weight_Pillar_{unique_id}",
            "weight_percentage": 42.857  # Float with decimals
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=create_payload)
        assert create_response.status_code == 200
        
        data = create_response.json()
        pillar_id = data["pillar_id"]
        
        # Verify weight is float
        assert isinstance(data["weight_percentage"], (int, float)), "weight_percentage is not numeric"
        assert data["weight_percentage"] == 42.857, f"Weight mismatch: expected 42.857, got {data['weight_percentage']}"
        
        print(f"PASS: weight_percentage stored as float: {data['weight_percentage']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}")
    
    def test_full_pillar_crud_with_rich_data(self):
        """Full CRUD flow: create with all fields -> read -> update -> verify update -> delete"""
        unique_id = uuid.uuid4().hex[:8]
        
        # 1. CREATE
        create_payload = {
            "name": f"TEST_CRUD_Pillar_{unique_id}",
            "description": "CRUD test description",
            "what_is_it": "CRUD: Qué es este pilar de contenido",
            "why_it_matters": "CRUD: Por qué importa este contenido",
            "content_tags": ["CRUD tag 1", "CRUD tag 2"],
            "weight_percentage": 25.0,
            "color": "#FF0000",
            "icon": "🎯",
            "platforms": ["instagram", "tiktok"]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=create_payload)
        assert create_response.status_code == 200, f"CREATE failed: {create_response.text}"
        created = create_response.json()
        pillar_id = created["pillar_id"]
        print(f"1. CREATE PASS - pillar_id: {pillar_id}")
        
        # 2. READ (verify in GET all)
        get_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}")
        assert get_response.status_code == 200
        pillars = get_response.json()
        found = [p for p in pillars if p["pillar_id"] == pillar_id]
        assert len(found) == 1, "Created pillar not found in READ"
        assert found[0]["what_is_it"] == create_payload["what_is_it"]
        print("2. READ PASS")
        
        # 3. UPDATE
        update_payload = {
            "name": f"TEST_CRUD_Updated_{unique_id}",
            "description": "Updated CRUD description",
            "what_is_it": "Updated: Qué es ahora",
            "why_it_matters": "Updated: Por qué importa ahora",
            "content_tags": ["New tag 1", "New tag 2", "New tag 3"],
            "weight_percentage": 50.0,
            "color": "#00FF00",
            "icon": "✨",
            "platforms": ["instagram", "youtube"]
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}", json=update_payload)
        assert update_response.status_code == 200, f"UPDATE failed: {update_response.text}"
        print("3. UPDATE PASS")
        
        # 4. VERIFY UPDATE (read again)
        get_response2 = self.session.get(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}")
        pillars2 = get_response2.json()
        found2 = [p for p in pillars2 if p["pillar_id"] == pillar_id]
        assert len(found2) == 1
        assert found2[0]["name"] == update_payload["name"], "Name not updated"
        assert found2[0]["what_is_it"] == update_payload["what_is_it"], "what_is_it not updated"
        assert found2[0]["weight_percentage"] == update_payload["weight_percentage"], "weight_percentage not updated"
        print("4. VERIFY UPDATE PASS")
        
        # 5. DELETE
        delete_response = self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}")
        assert delete_response.status_code == 200, f"DELETE failed: {delete_response.text}"
        
        # Verify deletion
        get_response3 = self.session.get(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}")
        pillars3 = get_response3.json()
        found3 = [p for p in pillars3 if p["pillar_id"] == pillar_id]
        assert len(found3) == 0, "Pillar still exists after delete"
        print("5. DELETE PASS")
        
        print(f"PASS: Full CRUD with rich data completed successfully")
    
    def test_pillar_with_org_id_regression(self):
        """Regression: verify pillar CRUD with org_id still works"""
        unique_id = uuid.uuid4().hex[:8]
        
        payload = {
            "name": f"TEST_OrgId_Regression_{unique_id}",
            "what_is_it": "Org ID regression test",
            "why_it_matters": "Testing org_id parameter",
            "content_tags": ["regression"],
            "weight_percentage": 10.0
        }
        
        # Create with org_id
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={self.org_id}", json=payload)
        assert create_response.status_code == 200, f"Create with org_id failed: {create_response.text}"
        
        data = create_response.json()
        pillar_id = data["pillar_id"]
        
        # Verify company_id matches org_id
        assert data.get("company_id") == self.org_id, f"company_id mismatch: expected {self.org_id}, got {data.get('company_id')}"
        
        # Update with org_id
        update_payload = {**payload, "name": f"TEST_OrgId_Updated_{unique_id}"}
        update_response = self.session.put(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}", json=update_payload)
        assert update_response.status_code == 200, f"Update with org_id failed: {update_response.text}"
        
        # Delete with org_id
        delete_response = self.session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={self.org_id}")
        assert delete_response.status_code == 200, f"Delete with org_id failed: {delete_response.text}"
        
        print(f"PASS: Pillar CRUD with org_id regression test")


class TestFetchDataResilience:
    """Test that Promise.all with .catch() prevents one failure from blocking all data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_response.status_code == 200
        yield
    
    def test_all_social_endpoints_accessible(self):
        """Verify all social endpoints return data or empty arrays (not errors)"""
        org_id = "company_3ab116c0994d"
        
        endpoints = [
            f"/api/demand-studio/social/stats?org_id={org_id}",
            f"/api/demand-studio/social/posts?org_id={org_id}",
            f"/api/demand-studio/social/accounts?include_shared=true&org_id={org_id}",
            f"/api/demand-studio/social/pillars?org_id={org_id}",
            f"/api/demand-studio/social/audiences?org_id={org_id}",
            f"/api/demand-studio/social/segments?org_id={org_id}",
            f"/api/demand-studio/campaigns?org_id={org_id}",
            f"/api/demand-studio/social/insights?org_id={org_id}",
            f"/api/demand-studio/social/ideas?org_id={org_id}",
        ]
        
        results = {}
        for endpoint in endpoints:
            response = self.session.get(f"{BASE_URL}{endpoint}")
            results[endpoint] = response.status_code
            print(f"{endpoint}: {response.status_code}")
        
        # All should return 200
        failed = [e for e, code in results.items() if code != 200]
        assert len(failed) == 0, f"Endpoints failed: {failed}"
        
        print("PASS: All social endpoints accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
