"""
Test pydantic 422 error formatting
Verifies that the backend returns proper pydantic validation errors
that can be transformed by the frontend axios interceptor.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPydanticErrorFormat:
    """Test that backend returns proper pydantic 422 errors"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for authenticated requests"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_client_missing_display_name_returns_422_with_array_detail(self):
        """POST /api/crm/clients without display_name should return 422 with array detail"""
        response = requests.post(
            f"{BASE_URL}/api/crm/clients",
            headers=self.headers,
            json={}  # Missing required display_name
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Response should have 'detail' field"
        
        # Pydantic returns detail as an array
        detail = data["detail"]
        assert isinstance(detail, list), f"detail should be array, got {type(detail)}"
        assert len(detail) > 0, "detail array should not be empty"
        
        # Each item should have loc, msg, type
        first_error = detail[0]
        assert "loc" in first_error, "Error should have 'loc' field"
        assert "msg" in first_error, "Error should have 'msg' field"
        assert "type" in first_error, "Error should have 'type' field"
        
        # Verify the error is about display_name
        loc = first_error["loc"]
        assert "display_name" in loc, f"Error should be about display_name, got {loc}"
        assert first_error["type"] == "missing", f"Error type should be 'missing', got {first_error['type']}"
        
        print(f"✓ Backend returns proper pydantic 422 format: {detail}")
    
    def test_event_missing_required_fields_returns_422(self):
        """POST /api/events without required fields should return 422"""
        response = requests.post(
            f"{BASE_URL}/api/events",
            headers=self.headers,
            json={}  # Missing client_id and name
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        
        data = response.json()
        detail = data.get("detail", [])
        
        # Should have errors for client_id and name
        assert isinstance(detail, list), f"detail should be array, got {type(detail)}"
        
        error_fields = [err.get("loc", [])[-1] for err in detail if err.get("loc")]
        print(f"Missing fields reported: {error_fields}")
        
        # At minimum, client_id and name should be required
        assert "client_id" in error_fields or "name" in error_fields, \
            f"Expected client_id or name in errors, got {error_fields}"
    
    def test_lead_missing_required_fields_returns_422(self):
        """POST /api/leads without required fields should return 422"""
        response = requests.post(
            f"{BASE_URL}/api/leads",
            headers=self.headers,
            json={}  # Missing lead_name and email
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        
        data = response.json()
        detail = data.get("detail", [])
        
        assert isinstance(detail, list), f"detail should be array, got {type(detail)}"
        
        error_fields = [err.get("loc", [])[-1] for err in detail if err.get("loc")]
        print(f"Missing fields reported: {error_fields}")
        
        # lead_name and email are required
        assert "lead_name" in error_fields or "email" in error_fields, \
            f"Expected lead_name or email in errors, got {error_fields}"
    
    def test_plain_string_error_still_works(self):
        """Test that plain string errors (not pydantic) still work"""
        # Try to access a non-existent resource
        response = requests.get(
            f"{BASE_URL}/api/events/nonexistent_event_id",
            headers=self.headers
        )
        
        # Should return 404 with string detail
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        detail = data.get("detail", "")
        
        # Plain string errors should remain as strings
        assert isinstance(detail, str), f"Plain error detail should be string, got {type(detail)}"
        print(f"✓ Plain string error works: {detail}")
    
    def test_error_format_for_frontend_transformation(self):
        """
        Verify the exact format that frontend errorFormatter.js expects.
        
        Frontend expects:
        - detail: [{loc: ["body", "field_name"], msg: "...", type: "missing|email|..."}]
        
        Frontend transforms to:
        - "Falta: campo1, campo2" (Spanish) for missing fields
        - "campo: mensaje" for other errors
        """
        response = requests.post(
            f"{BASE_URL}/api/crm/clients",
            headers=self.headers,
            json={}
        )
        
        assert response.status_code == 422
        
        data = response.json()
        detail = data["detail"]
        
        # Verify structure matches what errorFormatter.js expects
        for error in detail:
            # Must have loc as array
            assert isinstance(error.get("loc"), list), "loc must be array"
            
            # loc should have at least 2 elements: ["body", "field_name"]
            assert len(error["loc"]) >= 2, f"loc should have >= 2 elements, got {error['loc']}"
            
            # First element is usually "body", "query", or "path"
            assert error["loc"][0] in ["body", "query", "path", "header"], \
                f"First loc element should be body/query/path/header, got {error['loc'][0]}"
            
            # Must have type
            assert "type" in error, "Error must have 'type' field"
            
            # Must have msg
            assert "msg" in error, "Error must have 'msg' field"
        
        print(f"✓ Error format matches frontend expectations")
        print(f"  Sample error: {detail[0]}")


class TestRegressionPlainErrors:
    """Regression tests for plain string errors"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo.agency@kora.com", "password": "Evoque2024!"}
        )
        self.token = login_response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_401_error_format(self):
        """401 errors should have string detail"""
        response = requests.get(
            f"{BASE_URL}/api/events",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        assert response.status_code == 401
        data = response.json()
        detail = data.get("detail", "")
        
        # 401 should be string, not array
        assert isinstance(detail, str), f"401 detail should be string, got {type(detail)}"
        print(f"✓ 401 error is string: {detail}")
    
    def test_404_error_format(self):
        """404 errors should have string detail"""
        response = requests.get(
            f"{BASE_URL}/api/crm/clients/nonexistent_client_id",
            headers=self.headers
        )
        
        assert response.status_code == 404
        data = response.json()
        detail = data.get("detail", "")
        
        assert isinstance(detail, str), f"404 detail should be string, got {type(detail)}"
        print(f"✓ 404 error is string: {detail}")
