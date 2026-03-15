"""
Test Social Media Settings org_id Parameter Support
Tests that accounts, pillars, audiences, and segments CRUD endpoints
now accept org_id parameter for shared organization operations.

Bug: When saving in Social Media Settings (accounts, pillars, audiences, segments),
the dialog doesn't close and data isn't visible until re-login.

Root cause: 5 backend endpoints were missing org_id parameter, so they used 
user.company_id instead of the shared org's company_id.

Fixed endpoints:
- PUT /api/demand-studio/social/accounts/{id}?org_id=...
- DELETE /api/demand-studio/social/accounts/{id}?org_id=...  
- DELETE /api/demand-studio/social/pillars/{id}?org_id=...
- DELETE /api/demand-studio/social/audiences/{id}?org_id=...
- DELETE /api/demand-studio/social/segments/{id}?org_id=...
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_ORG_ID = "company_3ab116c0994d"
TEST_CREDS = {
    "email": "demo.agency@kora.com",
    "password": "Evoque2024!"
}


class TestSocialSettingsOrgId:
    """Test Social Media Settings endpoints accept org_id parameter"""

    @pytest.fixture(scope="class")
    def session(self):
        """Authenticated session fixture"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = s.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDS)
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.status_code}")
        return s

    # ==================== PILLARS TESTS ====================
    
    def test_create_pillar_with_org_id(self, session):
        """POST /api/demand-studio/social/pillars?org_id=... creates pillar in correct company"""
        unique_name = f"TEST_Pillar_{uuid.uuid4().hex[:8]}"
        response = session.post(
            f"{BASE_URL}/api/demand-studio/social/pillars?org_id={TEST_ORG_ID}",
            json={
                "name": unique_name,
                "description": "Test pillar for org_id testing",
                "platforms": ["instagram", "linkedin"]
            }
        )
        assert response.status_code in [200, 201], f"Create pillar failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "pillar_id" in data
        assert data["name"] == unique_name
        assert data["company_id"] == TEST_ORG_ID, f"Expected company_id {TEST_ORG_ID}, got {data.get('company_id')}"
        
        # Store for later tests
        session.test_pillar_id = data["pillar_id"]
        print(f"✓ Created pillar {data['pillar_id']} in org {TEST_ORG_ID}")

    def test_get_pillars_with_org_id(self, session):
        """GET /api/demand-studio/social/pillars?org_id=... returns org pillars"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/pillars?org_id={TEST_ORG_ID}")
        assert response.status_code == 200, f"Get pillars failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} pillars from org {TEST_ORG_ID}")

    def test_update_pillar_with_org_id(self, session):
        """PUT /api/demand-studio/social/pillars/{id}?org_id=... updates pillar correctly"""
        pillar_id = getattr(session, 'test_pillar_id', None)
        if not pillar_id:
            pytest.skip("No test pillar created")
        
        updated_name = f"TEST_Updated_Pillar_{uuid.uuid4().hex[:6]}"
        response = session.put(
            f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={TEST_ORG_ID}",
            json={
                "name": updated_name,
                "description": "Updated description",
                "platforms": ["youtube"]
            }
        )
        assert response.status_code == 200, f"Update pillar failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data["name"] == updated_name
        print(f"✓ Updated pillar {pillar_id} with org_id")

    def test_delete_pillar_with_org_id(self, session):
        """DELETE /api/demand-studio/social/pillars/{id}?org_id=... works for shared org"""
        pillar_id = getattr(session, 'test_pillar_id', None)
        if not pillar_id:
            pytest.skip("No test pillar created")
        
        response = session.delete(
            f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}?org_id={TEST_ORG_ID}"
        )
        assert response.status_code == 200, f"Delete pillar failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"✓ Deleted pillar {pillar_id} with org_id")

    # ==================== AUDIENCES TESTS ====================

    def test_create_audience_with_org_id(self, session):
        """POST /api/demand-studio/social/audiences?org_id=... creates audience in correct company"""
        unique_name = f"TEST_Audience_{uuid.uuid4().hex[:8]}"
        response = session.post(
            f"{BASE_URL}/api/demand-studio/social/audiences?org_id={TEST_ORG_ID}",
            json={
                "name": unique_name,
                "description": "Test audience for org_id testing",
                "platforms": ["instagram"]
            }
        )
        assert response.status_code in [200, 201], f"Create audience failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "audience_id" in data
        assert data["name"] == unique_name
        assert data["company_id"] == TEST_ORG_ID
        
        session.test_audience_id = data["audience_id"]
        print(f"✓ Created audience {data['audience_id']} in org {TEST_ORG_ID}")

    def test_update_audience_with_org_id(self, session):
        """PUT /api/demand-studio/social/audiences/{id}?org_id=... updates audience correctly"""
        audience_id = getattr(session, 'test_audience_id', None)
        if not audience_id:
            pytest.skip("No test audience created")
        
        updated_name = f"TEST_Updated_Audience_{uuid.uuid4().hex[:6]}"
        response = session.put(
            f"{BASE_URL}/api/demand-studio/social/audiences/{audience_id}?org_id={TEST_ORG_ID}",
            json={
                "name": updated_name,
                "description": "Updated audience description",
                "platforms": ["linkedin"]
            }
        )
        assert response.status_code == 200, f"Update audience failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data["name"] == updated_name
        print(f"✓ Updated audience {audience_id} with org_id")

    def test_delete_audience_with_org_id(self, session):
        """DELETE /api/demand-studio/social/audiences/{id}?org_id=... works for shared org"""
        audience_id = getattr(session, 'test_audience_id', None)
        if not audience_id:
            pytest.skip("No test audience created")
        
        response = session.delete(
            f"{BASE_URL}/api/demand-studio/social/audiences/{audience_id}?org_id={TEST_ORG_ID}"
        )
        assert response.status_code == 200, f"Delete audience failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"✓ Deleted audience {audience_id} with org_id")

    # ==================== SEGMENTS TESTS ====================

    def test_create_segment_with_org_id(self, session):
        """POST /api/demand-studio/social/segments?org_id=... creates segment in correct company"""
        unique_name = f"TEST_Segment_{uuid.uuid4().hex[:8]}"
        response = session.post(
            f"{BASE_URL}/api/demand-studio/social/segments?org_id={TEST_ORG_ID}",
            json={
                "name": unique_name,
                "description": "Test segment for org_id testing",
                "platforms": ["instagram", "tiktok"]
            }
        )
        assert response.status_code in [200, 201], f"Create segment failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "segment_id" in data
        assert data["name"] == unique_name
        assert data["company_id"] == TEST_ORG_ID
        
        session.test_segment_id = data["segment_id"]
        print(f"✓ Created segment {data['segment_id']} in org {TEST_ORG_ID}")

    def test_update_segment_with_org_id(self, session):
        """PUT /api/demand-studio/social/segments/{id}?org_id=... updates segment correctly"""
        segment_id = getattr(session, 'test_segment_id', None)
        if not segment_id:
            pytest.skip("No test segment created")
        
        updated_name = f"TEST_Updated_Segment_{uuid.uuid4().hex[:6]}"
        response = session.put(
            f"{BASE_URL}/api/demand-studio/social/segments/{segment_id}?org_id={TEST_ORG_ID}",
            json={
                "name": updated_name,
                "description": "Updated segment description",
                "platforms": ["youtube"]
            }
        )
        assert response.status_code == 200, f"Update segment failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data["name"] == updated_name
        print(f"✓ Updated segment {segment_id} with org_id")

    def test_delete_segment_with_org_id(self, session):
        """DELETE /api/demand-studio/social/segments/{id}?org_id=... works for shared org"""
        segment_id = getattr(session, 'test_segment_id', None)
        if not segment_id:
            pytest.skip("No test segment created")
        
        response = session.delete(
            f"{BASE_URL}/api/demand-studio/social/segments/{segment_id}?org_id={TEST_ORG_ID}"
        )
        assert response.status_code == 200, f"Delete segment failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"✓ Deleted segment {segment_id} with org_id")

    # ==================== ACCOUNTS TESTS ====================

    def test_create_account_with_org_id(self, session):
        """POST /api/demand-studio/social/accounts?org_id=... creates account in correct company"""
        unique_handle = f"test_handle_{uuid.uuid4().hex[:8]}"
        response = session.post(
            f"{BASE_URL}/api/demand-studio/social/accounts?org_id={TEST_ORG_ID}",
            json={
                "platform": "instagram",
                "handle": unique_handle,
                "status": "active"
            }
        )
        assert response.status_code in [200, 201], f"Create account failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "account_id" in data
        assert data["handle"] == unique_handle
        assert data["company_id"] == TEST_ORG_ID
        
        session.test_account_id = data["account_id"]
        print(f"✓ Created account {data['account_id']} in org {TEST_ORG_ID}")

    def test_update_account_with_org_id(self, session):
        """PUT /api/demand-studio/social/accounts/{id}?org_id=... updates account correctly"""
        account_id = getattr(session, 'test_account_id', None)
        if not account_id:
            pytest.skip("No test account created")
        
        updated_handle = f"updated_handle_{uuid.uuid4().hex[:6]}"
        response = session.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}?org_id={TEST_ORG_ID}",
            json={
                "platform": "linkedin",
                "handle": updated_handle,
                "status": "active"
            }
        )
        assert response.status_code == 200, f"Update account failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data["handle"] == updated_handle
        assert data["platform"] == "linkedin"
        print(f"✓ Updated account {account_id} with org_id")

    def test_delete_account_with_org_id(self, session):
        """DELETE /api/demand-studio/social/accounts/{id}?org_id=... works for shared org"""
        account_id = getattr(session, 'test_account_id', None)
        if not account_id:
            pytest.skip("No test account created")
        
        response = session.delete(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}?org_id={TEST_ORG_ID}"
        )
        assert response.status_code == 200, f"Delete account failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"✓ Deleted account {account_id} with org_id")


class TestRegressionWithoutOrgId:
    """Regression: Endpoints still work WITHOUT org_id for direct company owners"""

    @pytest.fixture(scope="class")
    def session(self):
        """Authenticated session fixture"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        response = s.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDS)
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.status_code}")
        return s

    def test_get_accounts_without_org_id(self, session):
        """GET /api/demand-studio/social/accounts still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200
        print(f"✓ GET accounts without org_id works")

    def test_get_pillars_without_org_id(self, session):
        """GET /api/demand-studio/social/pillars still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/pillars")
        assert response.status_code == 200
        print(f"✓ GET pillars without org_id works")

    def test_get_audiences_without_org_id(self, session):
        """GET /api/demand-studio/social/audiences still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/audiences")
        assert response.status_code == 200
        print(f"✓ GET audiences without org_id works")

    def test_get_segments_without_org_id(self, session):
        """GET /api/demand-studio/social/segments still works"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/segments")
        assert response.status_code == 200
        print(f"✓ GET segments without org_id works")

    def test_crud_pillar_without_org_id(self, session):
        """Full CRUD cycle on pillar works without org_id"""
        # Create
        unique_name = f"TEST_Pillar_NoOrg_{uuid.uuid4().hex[:8]}"
        create_resp = session.post(
            f"{BASE_URL}/api/demand-studio/social/pillars",
            json={"name": unique_name, "description": "Test", "platforms": []}
        )
        assert create_resp.status_code in [200, 201], f"Create failed: {create_resp.text}"
        pillar_id = create_resp.json()["pillar_id"]
        
        # Update
        update_resp = session.put(
            f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}",
            json={"name": f"{unique_name}_updated", "description": "Updated", "platforms": []}
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Delete
        delete_resp = session.delete(f"{BASE_URL}/api/demand-studio/social/pillars/{pillar_id}")
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        
        print(f"✓ CRUD pillar without org_id works")


class TestCleanupOldTestData:
    """Clean up any old test data that may have been created"""

    @pytest.fixture(scope="class")
    def session(self):
        """Authenticated session fixture"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        response = s.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDS)
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.status_code}")
        return s

    def test_cleanup_test_accounts(self, session):
        """Clean up any TEST_ prefixed accounts from previous test runs"""
        # Get accounts
        response = session.get(f"{BASE_URL}/api/demand-studio/social/accounts?org_id={TEST_ORG_ID}")
        if response.status_code != 200:
            pytest.skip("Could not get accounts")
        
        accounts = response.json()
        test_accounts = [a for a in accounts if a.get("handle", "").startswith("test_") or a.get("handle", "").startswith("updated_")]
        
        deleted = 0
        for acc in test_accounts:
            del_resp = session.delete(
                f"{BASE_URL}/api/demand-studio/social/accounts/{acc['account_id']}?org_id={TEST_ORG_ID}"
            )
            if del_resp.status_code == 200:
                deleted += 1
        
        print(f"✓ Cleaned up {deleted} test accounts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
