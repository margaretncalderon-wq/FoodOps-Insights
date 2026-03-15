# Test Demand Studio Settings CRUD operations and Calendar Pillar Stats
# Tests: pillar-stats API fields (actual_percentage, target_percentage, over_target, diff_from_target)
# Tests: Pillar, Audience, Segment, Account CRUD

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Login and get authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    login_response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo.agency@kora.com",
        "password": "Evoque2024!"
    })
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed with status {login_response.status_code}: {login_response.text}")
    
    return session


class TestCalendarPillarStats:
    """Test the calendar pillar-stats endpoint for new percentage fields"""
    
    def test_pillar_stats_endpoint_returns_percentage_fields(self, auth_session):
        """Verify pillar-stats returns actual_percentage, target_percentage, over_target, diff_from_target"""
        # Get stats for current month
        from datetime import datetime
        now = datetime.now()
        
        response = auth_session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar/pillar-stats",
            params={"year": now.year, "month": now.month}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "total_posts" in data, "Response should contain total_posts"
        assert "pillars" in data, "Response should contain pillars list"
        assert "period" in data, "Response should contain period info"
        
        # Check period info
        assert data["period"]["year"] == now.year
        assert data["period"]["month"] == now.month
        
        # If there are pillars with data, check required fields
        if data["pillars"]:
            pillar = data["pillars"][0]
            # Check new fields exist
            assert "actual_percentage" in pillar, "Pillar should have actual_percentage"
            assert "target_percentage" in pillar, "Pillar should have target_percentage"
            assert "over_target" in pillar, "Pillar should have over_target flag"
            assert "diff_from_target" in pillar, "Pillar should have diff_from_target"
            
            # Check old fields still exist
            assert "pillar_id" in pillar
            assert "name" in pillar
            assert "total" in pillar
            assert "by_status" in pillar
            
            print(f"✓ Pillar stats fields verified: actual_percentage={pillar['actual_percentage']}, "
                  f"target_percentage={pillar['target_percentage']}, over_target={pillar['over_target']}")


class TestPillarCRUD:
    """Test Pillar CRUD operations"""
    
    def test_create_pillar(self, auth_session):
        """Create a new pillar and verify it's returned"""
        payload = {
            "name": "TEST_Pillar_Settings_Test",
            "description": "Test pillar for settings test",
            "weight_percentage": 25.0,
            "color": "#FF5733",
            "icon": "🧪"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/pillars", json=payload)
        assert response.status_code == 200 or response.status_code == 201, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["description"] == payload["description"]
        assert data["weight_percentage"] == payload["weight_percentage"]
        assert "pillar_id" in data
        
        # Store for cleanup
        TestPillarCRUD.test_pillar_id = data["pillar_id"]
        print(f"✓ Created pillar: {data['pillar_id']}")
    
    def test_get_pillars_contains_created(self, auth_session):
        """Verify the created pillar appears in the list"""
        response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/pillars")
        assert response.status_code == 200
        
        pillars = response.json()
        pillar_ids = [p["pillar_id"] for p in pillars]
        assert hasattr(TestPillarCRUD, 'test_pillar_id'), "Pillar was not created in previous test"
        assert TestPillarCRUD.test_pillar_id in pillar_ids
        print(f"✓ Pillar found in list")
    
    def test_update_pillar(self, auth_session):
        """Update the pillar"""
        assert hasattr(TestPillarCRUD, 'test_pillar_id'), "Pillar was not created"
        
        payload = {
            "name": "TEST_Pillar_Settings_Updated",
            "description": "Updated description",
            "weight_percentage": 30.0,
            "color": "#33FF57",
            "icon": "✅"
        }
        
        response = auth_session.put(
            f"{BASE_URL}/api/demand-studio/social/pillars/{TestPillarCRUD.test_pillar_id}",
            json=payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["weight_percentage"] == payload["weight_percentage"]
        print(f"✓ Pillar updated successfully")
    
    def test_delete_pillar(self, auth_session):
        """Delete the test pillar"""
        assert hasattr(TestPillarCRUD, 'test_pillar_id'), "Pillar was not created"
        
        response = auth_session.delete(
            f"{BASE_URL}/api/demand-studio/social/pillars/{TestPillarCRUD.test_pillar_id}"
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"✓ Pillar deleted successfully")


class TestAudienceCRUD:
    """Test Audience CRUD operations"""
    
    def test_create_audience(self, auth_session):
        """Create a new audience"""
        payload = {
            "name": "TEST_Audience_Settings_Test",
            "description": "Test audience for settings test",
            "platforms": ["instagram", "linkedin"],
            "sub_audiences": []
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/audiences", json=payload)
        assert response.status_code == 200 or response.status_code == 201, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert "audience_id" in data
        
        TestAudienceCRUD.test_audience_id = data["audience_id"]
        print(f"✓ Created audience: {data['audience_id']}")
    
    def test_update_audience(self, auth_session):
        """Update the audience"""
        assert hasattr(TestAudienceCRUD, 'test_audience_id'), "Audience was not created"
        
        payload = {
            "name": "TEST_Audience_Settings_Updated",
            "description": "Updated description",
            "platforms": ["instagram", "tiktok"]
        }
        
        response = auth_session.put(
            f"{BASE_URL}/api/demand-studio/social/audiences/{TestAudienceCRUD.test_audience_id}",
            json=payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        print(f"✓ Audience updated successfully")
    
    def test_delete_audience(self, auth_session):
        """Delete the test audience"""
        assert hasattr(TestAudienceCRUD, 'test_audience_id'), "Audience was not created"
        
        response = auth_session.delete(
            f"{BASE_URL}/api/demand-studio/social/audiences/{TestAudienceCRUD.test_audience_id}"
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"✓ Audience deleted successfully")


class TestSegmentCRUD:
    """Test Segment CRUD operations"""
    
    def test_create_segment(self, auth_session):
        """Create a new segment"""
        payload = {
            "name": "TEST_Segment_Settings_Test",
            "description": "Test segment for settings test",
            "platforms": ["instagram"]
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/segments", json=payload)
        assert response.status_code == 200 or response.status_code == 201, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["name"] == payload["name"]
        assert "segment_id" in data
        
        TestSegmentCRUD.test_segment_id = data["segment_id"]
        print(f"✓ Created segment: {data['segment_id']}")
    
    def test_update_segment(self, auth_session):
        """Update the segment"""
        assert hasattr(TestSegmentCRUD, 'test_segment_id'), "Segment was not created"
        
        payload = {
            "name": "TEST_Segment_Settings_Updated",
            "description": "Updated description",
            "platforms": ["linkedin"]
        }
        
        response = auth_session.put(
            f"{BASE_URL}/api/demand-studio/social/segments/{TestSegmentCRUD.test_segment_id}",
            json=payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        print(f"✓ Segment updated successfully")
    
    def test_delete_segment(self, auth_session):
        """Delete the test segment"""
        assert hasattr(TestSegmentCRUD, 'test_segment_id'), "Segment was not created"
        
        response = auth_session.delete(
            f"{BASE_URL}/api/demand-studio/social/segments/{TestSegmentCRUD.test_segment_id}"
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"✓ Segment deleted successfully")


class TestAccountCRUD:
    """Test Social Account CRUD operations"""
    
    def test_create_account(self, auth_session):
        """Create a new social account"""
        payload = {
            "platform": "instagram",
            "handle": "test_settings_account_" + str(int(time.time())),
            "status": "active"
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/accounts", json=payload)
        assert response.status_code == 200 or response.status_code == 201, f"Create failed: {response.text}"
        
        data = response.json()
        assert data["handle"] == payload["handle"]
        assert "account_id" in data
        
        TestAccountCRUD.test_account_id = data["account_id"]
        print(f"✓ Created account: {data['account_id']}")
    
    def test_get_accounts_contains_created(self, auth_session):
        """Verify the created account appears in the list"""
        response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200
        
        accounts = response.json()
        account_ids = [a["account_id"] for a in accounts]
        assert hasattr(TestAccountCRUD, 'test_account_id'), "Account was not created"
        assert TestAccountCRUD.test_account_id in account_ids
        print(f"✓ Account found in list")
    
    def test_delete_account(self, auth_session):
        """Delete the test account"""
        assert hasattr(TestAccountCRUD, 'test_account_id'), "Account was not created"
        
        response = auth_session.delete(
            f"{BASE_URL}/api/demand-studio/social/accounts/{TestAccountCRUD.test_account_id}"
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"✓ Account deleted successfully")
