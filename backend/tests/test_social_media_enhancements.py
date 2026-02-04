"""
Test Social Media Module Enhancements:
- Content Ideas CRUD
- Global Marketing Calendar
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestSetup:
    """Setup and authentication"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return s


class TestContentIdeasCRUD(TestSetup):
    """Test Content Ideas CRUD operations"""
    
    created_idea_id = None
    
    def test_get_ideas_list(self, session):
        """Test GET /api/demand-studio/social/ideas"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        assert response.status_code == 200, f"Failed to get ideas: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET ideas list - Found {len(data)} ideas")
    
    def test_create_idea(self, session):
        """Test POST /api/demand-studio/social/ideas"""
        payload = {
            "title": "TEST_Idea_Social_Media_Enhancement",
            "description": "Test idea for social media module testing",
            "source_url": "https://example.com/inspiration",
            "tags": ["test", "automation"],
            "status": "new"
        }
        response = session.post(f"{BASE_URL}/api/demand-studio/social/ideas", json=payload)
        assert response.status_code == 200, f"Failed to create idea: {response.text}"
        
        data = response.json()
        assert "idea_id" in data, "Response should contain idea_id"
        assert data["title"] == payload["title"], "Title should match"
        assert data["status"] == "new", "Status should be 'new'"
        
        TestContentIdeasCRUD.created_idea_id = data["idea_id"]
        print(f"✓ CREATE idea - ID: {data['idea_id']}")
    
    def test_get_ideas_with_status_filter(self, session):
        """Test GET /api/demand-studio/social/ideas with status filter"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas?status=new")
        assert response.status_code == 200, f"Failed to get ideas with filter: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned ideas should have status 'new'
        for idea in data:
            assert idea.get("status") == "new", f"Idea {idea.get('idea_id')} has wrong status"
        print(f"✓ GET ideas with status filter - Found {len(data)} ideas with status 'new'")
    
    def test_update_idea(self, session):
        """Test PUT /api/demand-studio/social/ideas/{idea_id}"""
        if not TestContentIdeasCRUD.created_idea_id:
            pytest.skip("No idea created to update")
        
        payload = {
            "title": "TEST_Idea_Updated_Title",
            "description": "Updated description for testing",
            "source_url": "https://example.com/updated",
            "tags": ["test", "updated"],
            "status": "reviewing"
        }
        response = session.put(
            f"{BASE_URL}/api/demand-studio/social/ideas/{TestContentIdeasCRUD.created_idea_id}",
            json=payload
        )
        assert response.status_code == 200, f"Failed to update idea: {response.text}"
        
        data = response.json()
        assert data["title"] == payload["title"], "Title should be updated"
        assert data["status"] == "reviewing", "Status should be updated to 'reviewing'"
        print(f"✓ UPDATE idea - Status changed to 'reviewing'")
    
    def test_delete_idea(self, session):
        """Test DELETE /api/demand-studio/social/ideas/{idea_id}"""
        if not TestContentIdeasCRUD.created_idea_id:
            pytest.skip("No idea created to delete")
        
        response = session.delete(
            f"{BASE_URL}/api/demand-studio/social/ideas/{TestContentIdeasCRUD.created_idea_id}"
        )
        assert response.status_code == 200, f"Failed to delete idea: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Delete should return success"
        print(f"✓ DELETE idea - Successfully deleted")
        
        # Verify deletion
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        ideas = response.json()
        idea_ids = [i.get("idea_id") for i in ideas]
        assert TestContentIdeasCRUD.created_idea_id not in idea_ids, "Deleted idea should not appear in list"
        print(f"✓ Verified idea no longer in list")


class TestGlobalMarketingCalendar(TestSetup):
    """Test Global Marketing Calendar endpoint"""
    
    def test_get_global_calendar(self, session):
        """Test GET /api/demand-studio/global-calendar"""
        # Get current month date range
        now = datetime.now()
        start_date = datetime(now.year, now.month, 1).isoformat()
        end_date = datetime(now.year, now.month + 1 if now.month < 12 else 1, 1).isoformat() if now.month < 12 else datetime(now.year + 1, 1, 1).isoformat()
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/global-calendar?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200, f"Failed to get global calendar: {response.text}"
        
        data = response.json()
        assert "campaigns" in data, "Response should contain 'campaigns'"
        assert "posts" in data, "Response should contain 'posts'"
        assert "activations" in data, "Response should contain 'activations'"
        assert "emails" in data, "Response should contain 'emails'"
        
        assert isinstance(data["campaigns"], list), "campaigns should be a list"
        assert isinstance(data["posts"], list), "posts should be a list"
        assert isinstance(data["activations"], list), "activations should be a list"
        assert isinstance(data["emails"], list), "emails should be a list"
        
        print(f"✓ GET global calendar - Campaigns: {len(data['campaigns'])}, Posts: {len(data['posts'])}, Activations: {len(data['activations'])}, Emails: {len(data['emails'])}")
    
    def test_global_calendar_different_month(self, session):
        """Test global calendar with different month range"""
        # Test with next month
        now = datetime.now()
        next_month = now.month + 1 if now.month < 12 else 1
        next_year = now.year if now.month < 12 else now.year + 1
        
        start_date = datetime(next_year, next_month, 1).isoformat()
        end_month = next_month + 1 if next_month < 12 else 1
        end_year = next_year if next_month < 12 else next_year + 1
        end_date = datetime(end_year, end_month, 1).isoformat()
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/global-calendar?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200, f"Failed to get global calendar for next month: {response.text}"
        
        data = response.json()
        assert "campaigns" in data, "Response should contain 'campaigns'"
        print(f"✓ GET global calendar (next month) - Success")
    
    def test_global_calendar_data_structure(self, session):
        """Test that global calendar returns proper data structure"""
        now = datetime.now()
        start_date = datetime(now.year, now.month, 1).isoformat()
        end_date = (datetime(now.year, now.month, 1) + timedelta(days=31)).isoformat()
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/global-calendar?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Check campaign structure if any exist
        if data["campaigns"]:
            campaign = data["campaigns"][0]
            assert "campaign_id" in campaign or "name" in campaign, "Campaign should have id or name"
            print(f"✓ Campaign structure verified")
        
        # Check post structure if any exist
        if data["posts"]:
            post = data["posts"][0]
            assert "post_id" in post or "title" in post, "Post should have id or title"
            print(f"✓ Post structure verified")
        
        # Check activation structure if any exist
        if data["activations"]:
            activation = data["activations"][0]
            assert "activation_id" in activation or "name" in activation, "Activation should have id or name"
            print(f"✓ Activation structure verified")
        
        print(f"✓ Global calendar data structure verified")


class TestSocialMediaCalendarFilters(TestSetup):
    """Test Social Media Calendar with filters"""
    
    def test_get_social_calendar(self, session):
        """Test GET /api/demand-studio/social/calendar"""
        now = datetime.now()
        start_date = datetime(now.year, now.month, 1).isoformat()
        end_date = (datetime(now.year, now.month, 1) + timedelta(days=31)).isoformat()
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200, f"Failed to get social calendar: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET social calendar - Found {len(data)} posts")
    
    def test_get_social_accounts(self, session):
        """Test GET /api/demand-studio/social/accounts - needed for calendar filters"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200, f"Failed to get social accounts: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET social accounts - Found {len(data)} accounts")
    
    def test_get_social_pillars(self, session):
        """Test GET /api/demand-studio/social/pillars - needed for calendar filters"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/pillars")
        assert response.status_code == 200, f"Failed to get social pillars: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET social pillars - Found {len(data)} pillars")


class TestIdeaToPostConversion(TestSetup):
    """Test converting idea to post"""
    
    created_idea_id = None
    created_account_id = None
    
    def test_create_idea_for_conversion(self, session):
        """Create an idea to convert"""
        payload = {
            "title": "TEST_Idea_For_Conversion",
            "description": "This idea will be converted to a post",
            "source_url": "https://example.com/convert-test",
            "tags": ["conversion", "test"],
            "status": "approved"
        }
        response = session.post(f"{BASE_URL}/api/demand-studio/social/ideas", json=payload)
        assert response.status_code == 200, f"Failed to create idea: {response.text}"
        
        data = response.json()
        TestIdeaToPostConversion.created_idea_id = data["idea_id"]
        print(f"✓ Created idea for conversion: {data['idea_id']}")
    
    def test_get_or_create_social_account(self, session):
        """Get existing social account or create one for conversion test"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200
        
        accounts = response.json()
        if accounts:
            TestIdeaToPostConversion.created_account_id = accounts[0]["account_id"]
            print(f"✓ Using existing account: {accounts[0]['account_id']}")
        else:
            # Create a test account
            payload = {
                "platform": "instagram",
                "handle": "@test_conversion_account",
                "status": "active"
            }
            response = session.post(f"{BASE_URL}/api/demand-studio/social/accounts", json=payload)
            assert response.status_code == 200, f"Failed to create account: {response.text}"
            data = response.json()
            TestIdeaToPostConversion.created_account_id = data["account_id"]
            print(f"✓ Created test account: {data['account_id']}")
    
    def test_convert_idea_to_post(self, session):
        """Test POST /api/demand-studio/social/ideas/{idea_id}/convert-to-post"""
        if not TestIdeaToPostConversion.created_idea_id:
            pytest.skip("No idea created for conversion")
        if not TestIdeaToPostConversion.created_account_id:
            pytest.skip("No social account available")
        
        response = session.post(
            f"{BASE_URL}/api/demand-studio/social/ideas/{TestIdeaToPostConversion.created_idea_id}/convert-to-post?social_account_id={TestIdeaToPostConversion.created_account_id}"
        )
        assert response.status_code == 200, f"Failed to convert idea: {response.text}"
        
        data = response.json()
        assert "post_id" in data, "Response should contain post_id"
        assert data["title"] == "TEST_Idea_For_Conversion", "Post title should match idea title"
        print(f"✓ Converted idea to post: {data['post_id']}")
        
        # Verify idea status changed to 'used'
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        ideas = response.json()
        converted_idea = next((i for i in ideas if i["idea_id"] == TestIdeaToPostConversion.created_idea_id), None)
        if converted_idea:
            assert converted_idea["status"] == "used", "Idea status should be 'used' after conversion"
            print(f"✓ Idea status updated to 'used'")
    
    def test_cleanup_test_data(self, session):
        """Cleanup test data"""
        # Delete the converted idea
        if TestIdeaToPostConversion.created_idea_id:
            session.delete(f"{BASE_URL}/api/demand-studio/social/ideas/{TestIdeaToPostConversion.created_idea_id}")
            print(f"✓ Cleaned up test idea")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
