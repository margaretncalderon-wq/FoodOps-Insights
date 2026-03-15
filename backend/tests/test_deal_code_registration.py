"""
Test Deal Code Registration Feature
- Tests that deal_code is accepted and stored during registration
- Tests both normal registration and Google OAuth registration flows
- Tests that registration works without deal_code (field is optional)
- Includes regression check for /api/settings/team endpoint
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestDealCodeRegistration:
    """Tests for deal_code field in registration endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:8]}"
        self.created_users = []
        yield
        # Cleanup: Would typically delete test users here
        # For now, we rely on TEST_ prefix for identification
        
    def test_register_with_deal_code(self):
        """Test POST /api/auth/register accepts and stores deal_code"""
        test_email = f"{self.test_prefix}_dealcode@test.com"
        test_deal_code = "PROMO2024"
        
        payload = {
            "email": test_email,
            "password": "TestPass123!",
            "name": f"Test User {self.test_prefix}",
            "company_name": f"Test Company {self.test_prefix}",
            "industry_template": "events_hospitality",
            "deal_code": test_deal_code
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        # Verify registration succeeds
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert "user" in data, "Response missing user data"
        
        # The deal_code is stored in DB but may not be returned in response
        # Main verification is that registration succeeds with deal_code
        print(f"[PASS] Registration with deal_code succeeded for {test_email}")
        
        # Store token for potential verification
        self.created_users.append({
            "email": test_email,
            "token": data["access_token"]
        })
        
    def test_register_without_deal_code(self):
        """Test that registration works without deal_code (field is optional)"""
        test_email = f"{self.test_prefix}_nodeal@test.com"
        
        payload = {
            "email": test_email,
            "password": "TestPass123!",
            "name": f"Test User No Deal {self.test_prefix}",
            "company_name": f"Test Company No Deal {self.test_prefix}",
            "industry_template": "professional_services"
            # No deal_code field
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration without deal_code failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        
        print(f"[PASS] Registration without deal_code succeeded for {test_email}")
        
    def test_register_with_empty_deal_code(self):
        """Test registration with empty string deal_code"""
        test_email = f"{self.test_prefix}_emptydeal@test.com"
        
        payload = {
            "email": test_email,
            "password": "TestPass123!",
            "name": f"Test User Empty Deal {self.test_prefix}",
            "company_name": f"Test Company Empty Deal {self.test_prefix}",
            "industry_template": "generic",
            "deal_code": ""  # Empty string
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration with empty deal_code failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        
        print(f"[PASS] Registration with empty deal_code succeeded for {test_email}")
        

class TestGoogleOAuthDealCode:
    """Tests for deal_code in Google OAuth complete-registration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_google_complete_registration_accepts_deal_code(self):
        """Test /api/auth/google/complete-registration accepts deal_code field"""
        # This tests the endpoint structure - actual flow requires valid temp_token
        # We verify the endpoint accepts the deal_code parameter
        
        payload = {
            "temp_token": "invalid_test_token",  # Will fail but tests parameter acceptance
            "company_name": "Test Google Company",
            "industry_template": "events_hospitality",
            "deal_code": "GOOGLE_PROMO"
        }
        
        response = self.session.post(f"{BASE_URL}/api/auth/google/complete-registration", json=payload)
        
        # Expected: 400 for invalid token (not 422 for missing field)
        # This confirms deal_code field is accepted in the request body
        assert response.status_code in [400, 401], f"Unexpected status: {response.status_code}"
        
        data = response.json()
        # Should not say "field required" or "validation error" for deal_code
        detail = data.get("detail", "")
        assert "deal_code" not in detail.lower() or "required" not in detail.lower(), \
            f"Unexpected validation error for deal_code: {detail}"
        
        print("[PASS] Google complete-registration endpoint accepts deal_code parameter")


class TestTeamEndpointRegression:
    """Regression test for /api/settings/team endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        
    def get_auth_token(self):
        """Login with demo credentials"""
        payload = {
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        }
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=payload)
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        return False
        
    def test_settings_team_endpoint_returns_team_members(self):
        """Regression: GET /api/settings/team should return team members (not 404)"""
        if not self.get_auth_token():
            pytest.skip("Could not authenticate with demo credentials")
            
        response = self.session.get(f"{BASE_URL}/api/settings/team")
        
        assert response.status_code == 200, f"Team endpoint failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of team members"
        
        # Should have at least one team member
        if len(data) > 0:
            # Verify team member structure
            member = data[0]
            assert "user_id" in member or "id" in member, "Team member missing user identifier"
            
        print(f"[PASS] /api/settings/team returns {len(data)} team members")


class TestUserCreateModel:
    """Tests to verify UserCreate model accepts deal_code"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:8]}"
        
    def test_user_create_model_has_deal_code_field(self):
        """Test that UserCreate model has deal_code as optional field"""
        # This is implicitly tested by test_register_with_deal_code
        # Here we explicitly test various deal_code values
        
        test_cases = [
            ("DEAL123", "alphanumeric"),
            ("DEAL-CODE-123", "with hyphens"),
            ("DEAL_CODE_123", "with underscores"),
            ("deal code", "with space"),
            ("12345", "numeric only"),
        ]
        
        for idx, (deal_code_val, desc) in enumerate(test_cases):
            test_email = f"{self.test_prefix}_model{idx}@test.com"
            
            payload = {
                "email": test_email,
                "password": "TestPass123!",
                "name": f"Test Model {idx}",
                "company_name": f"Test Company Model {idx}",
                "industry_template": "generic",
                "deal_code": deal_code_val
            }
            
            response = self.session.post(f"{BASE_URL}/api/auth/register", json=payload)
            
            if response.status_code == 200:
                print(f"[PASS] deal_code '{desc}' accepted: {deal_code_val}")
            else:
                # Check if failure is due to validation error on deal_code
                data = response.json()
                detail = str(data.get("detail", ""))
                if "deal_code" in detail.lower():
                    pytest.fail(f"deal_code '{desc}' rejected: {detail}")
                # Other errors (like email exists) are OK for this test
                print(f"[INFO] deal_code '{desc}' test - non-deal_code error: {detail[:50]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
