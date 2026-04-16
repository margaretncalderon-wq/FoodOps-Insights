"""
Test Recurring Posts Feature for Demand Studio Social Media
Tests:
- POST /api/demand-studio/social/posts/recurring - Create recurring posts
- PUT /api/demand-studio/social/posts/recurring/{recurrence_id}/bulk-update - Bulk update recurring posts
- Weekly frequency with days_of_week creates posts on specified days
- Daily frequency creates consecutive daily posts
- Monthly frequency creates monthly posts
- Recurrence fields: recurrence_id, recurrence_index, recurrence_total, recurrence_frequency
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Authenticate and return session with token"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo.agency@kora.com",
        "password": "Evoque2024!"
    })
    assert login_response.status_code == 200, f"Login failed: {login_response.text}"
    
    token = login_response.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    
    return session


@pytest.fixture(scope="module")
def social_account_id(auth_session):
    """Get or create a social account for testing"""
    # Get existing accounts
    response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
    assert response.status_code == 200
    accounts = response.json()
    
    if accounts:
        return accounts[0]["account_id"]
    
    # Create one if none exist
    create_response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/accounts", json={
        "platform": "instagram",
        "handle": "test_recurring_account",
        "status": "active"
    })
    assert create_response.status_code in [200, 201]
    return create_response.json()["account_id"]


class TestRecurringPostsCreation:
    """Test POST /api/demand-studio/social/posts/recurring endpoint"""
    
    def test_create_weekly_recurring_posts_tuesday(self, auth_session, social_account_id):
        """Test creating weekly recurring posts on Tuesdays (day 1 in Python weekday)"""
        # Start from next Tuesday
        today = datetime.now()
        days_until_tuesday = (1 - today.weekday()) % 7
        if days_until_tuesday == 0:
            days_until_tuesday = 7
        start_date = (today + timedelta(days=days_until_tuesday)).strftime("%Y-%m-%d")
        
        payload = {
            "social_account_id": social_account_id,
            "title": "Tips del Martes",
            "caption": "Weekly Tuesday tips for our followers",
            "format": "post",
            "status": "calendar",
            "frequency": "weekly",
            "days_of_week": [1],  # Tuesday (Mon=0, Tue=1, ..., Sun=6)
            "start_date": start_date,
            "repeat_count": 8
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=payload)
        assert response.status_code == 200, f"Failed to create recurring posts: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "recurrence_id" in data, "Response missing recurrence_id"
        assert data["recurrence_id"].startswith("recur_"), f"Invalid recurrence_id format: {data['recurrence_id']}"
        assert data["frequency"] == "weekly"
        # Weekly with repeat_count=8 weeks creates posts for each Tuesday within 8 weeks
        # The count depends on how many Tuesdays fall within the date range
        assert data["count"] >= 8, f"Expected at least 8 posts, got {data['count']}"
        assert len(data["posts"]) == data["count"]
        assert len(data["dates"]) == data["count"]
        
        # Verify each post has correct recurrence fields
        recurrence_id = data["recurrence_id"]
        total_posts = data["count"]
        for i, post in enumerate(data["posts"]):
            assert post["recurrence_id"] == recurrence_id
            assert post["recurrence_index"] == i + 1, f"Post {i} has wrong recurrence_index"
            assert post["recurrence_total"] == total_posts
            assert post["recurrence_frequency"] == "weekly"
            assert post["title"] == "Tips del Martes"
            assert post["format"] == "post"
            assert post["status"] == "calendar"
        
        # Verify all dates are Tuesdays
        for date_str in data["dates"]:
            date = datetime.strptime(date_str, "%Y-%m-%d")
            assert date.weekday() == 1, f"Date {date_str} is not a Tuesday (weekday={date.weekday()})"
        
        # Store recurrence_id for cleanup
        self.__class__.recurrence_id_weekly = recurrence_id
        print(f"✓ Created 8 weekly recurring posts on Tuesdays with recurrence_id: {recurrence_id}")
    
    def test_create_daily_recurring_posts(self, auth_session, social_account_id):
        """Test creating daily recurring posts"""
        start_date = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "social_account_id": social_account_id,
            "title": "Daily Motivation",
            "caption": "Your daily dose of motivation",
            "format": "reel",
            "status": "calendar",
            "frequency": "daily",
            "start_date": start_date,
            "repeat_count": 5
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=payload)
        assert response.status_code == 200, f"Failed to create daily recurring posts: {response.text}"
        
        data = response.json()
        
        assert data["frequency"] == "daily"
        assert data["count"] == 5
        assert len(data["posts"]) == 5
        
        # Verify consecutive days
        dates = [datetime.strptime(d, "%Y-%m-%d") for d in data["dates"]]
        for i in range(1, len(dates)):
            diff = (dates[i] - dates[i-1]).days
            assert diff == 1, f"Dates not consecutive: {data['dates'][i-1]} to {data['dates'][i]}"
        
        # Verify recurrence fields
        for i, post in enumerate(data["posts"]):
            assert post["recurrence_index"] == i + 1
            assert post["recurrence_total"] == 5
            assert post["recurrence_frequency"] == "daily"
        
        self.__class__.recurrence_id_daily = data["recurrence_id"]
        print(f"✓ Created 5 daily recurring posts with recurrence_id: {data['recurrence_id']}")
    
    def test_create_monthly_recurring_posts(self, auth_session, social_account_id):
        """Test creating monthly recurring posts"""
        start_date = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "social_account_id": social_account_id,
            "title": "Monthly Newsletter",
            "caption": "Our monthly update",
            "format": "carousel",
            "status": "calendar",
            "frequency": "monthly",
            "start_date": start_date,
            "repeat_count": 4
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=payload)
        assert response.status_code == 200, f"Failed to create monthly recurring posts: {response.text}"
        
        data = response.json()
        
        assert data["frequency"] == "monthly"
        assert data["count"] == 4
        
        # Verify recurrence fields
        for i, post in enumerate(data["posts"]):
            assert post["recurrence_index"] == i + 1
            assert post["recurrence_total"] == 4
            assert post["recurrence_frequency"] == "monthly"
        
        self.__class__.recurrence_id_monthly = data["recurrence_id"]
        print(f"✓ Created 4 monthly recurring posts with recurrence_id: {data['recurrence_id']}")
    
    def test_create_biweekly_recurring_posts(self, auth_session, social_account_id):
        """Test creating biweekly recurring posts"""
        start_date = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "social_account_id": social_account_id,
            "title": "Biweekly Update",
            "caption": "Every two weeks update",
            "format": "post",
            "status": "calendar",
            "frequency": "biweekly",
            "start_date": start_date,
            "repeat_count": 6
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=payload)
        assert response.status_code == 200, f"Failed to create biweekly recurring posts: {response.text}"
        
        data = response.json()
        
        assert data["frequency"] == "biweekly"
        assert data["count"] == 6
        
        # Verify 2-week intervals
        dates = [datetime.strptime(d, "%Y-%m-%d") for d in data["dates"]]
        for i in range(1, len(dates)):
            diff = (dates[i] - dates[i-1]).days
            assert diff == 14, f"Biweekly interval wrong: {diff} days instead of 14"
        
        self.__class__.recurrence_id_biweekly = data["recurrence_id"]
        print(f"✓ Created 6 biweekly recurring posts with recurrence_id: {data['recurrence_id']}")
    
    def test_recurring_posts_validation_no_start_date(self, auth_session, social_account_id):
        """Test that start_date is required"""
        payload = {
            "social_account_id": social_account_id,
            "title": "Test Post",
            "frequency": "weekly",
            "repeat_count": 4
        }
        
        response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=payload)
        assert response.status_code == 400, f"Expected 400 for missing start_date, got {response.status_code}"
        assert "start_date" in response.text.lower()
        print("✓ Validation: start_date is required")


class TestBulkUpdateRecurring:
    """Test PUT /api/demand-studio/social/posts/recurring/{recurrence_id}/bulk-update endpoint"""
    
    def test_bulk_update_recurring_posts(self, auth_session, social_account_id):
        """Test bulk updating all unposted posts in a recurrence group"""
        # First create a recurring series
        start_date = datetime.now().strftime("%Y-%m-%d")
        
        create_payload = {
            "social_account_id": social_account_id,
            "title": "Original Title",
            "caption": "Original caption",
            "format": "post",
            "status": "calendar",
            "frequency": "daily",
            "start_date": start_date,
            "repeat_count": 3
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=create_payload)
        assert create_response.status_code == 200
        recurrence_id = create_response.json()["recurrence_id"]
        
        # Now bulk update
        update_payload = {
            "title": "Updated Title",
            "caption": "Updated caption for all posts"
        }
        
        update_response = auth_session.put(
            f"{BASE_URL}/api/demand-studio/social/posts/recurring/{recurrence_id}/bulk-update",
            json=update_payload
        )
        assert update_response.status_code == 200, f"Bulk update failed: {update_response.text}"
        
        data = update_response.json()
        assert data["recurrence_id"] == recurrence_id
        assert data["updated"] == 3, f"Expected 3 posts updated, got {data['updated']}"
        
        # Verify posts were actually updated by fetching them
        posts_response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert posts_response.status_code == 200
        
        posts = posts_response.json()
        updated_posts = [p for p in posts if p.get("recurrence_id") == recurrence_id]
        
        for post in updated_posts:
            assert post["title"] == "Updated Title", f"Post title not updated: {post['title']}"
            assert post["caption"] == "Updated caption for all posts"
        
        print(f"✓ Bulk updated {data['updated']} posts in recurrence group {recurrence_id}")
    
    def test_bulk_update_skips_posted_posts(self, auth_session, social_account_id):
        """Test that bulk update skips posts with status='posted'"""
        # Create recurring posts
        start_date = datetime.now().strftime("%Y-%m-%d")
        
        create_payload = {
            "social_account_id": social_account_id,
            "title": "Skip Posted Test",
            "format": "post",
            "status": "calendar",
            "frequency": "daily",
            "start_date": start_date,
            "repeat_count": 3
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=create_payload)
        assert create_response.status_code == 200
        recurrence_id = create_response.json()["recurrence_id"]
        first_post_id = create_response.json()["posts"][0]["post_id"]
        
        # Mark first post as posted
        mark_response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/{first_post_id}/mark-posted")
        assert mark_response.status_code == 200
        
        # Now bulk update - should only update 2 posts (not the posted one)
        update_payload = {"title": "New Title After Posted"}
        
        update_response = auth_session.put(
            f"{BASE_URL}/api/demand-studio/social/posts/recurring/{recurrence_id}/bulk-update",
            json=update_payload
        )
        assert update_response.status_code == 200
        
        data = update_response.json()
        assert data["updated"] == 2, f"Expected 2 posts updated (skipping posted), got {data['updated']}"
        
        print(f"✓ Bulk update correctly skipped posted posts, updated {data['updated']} of 3")


class TestRecurringPostsInCalendar:
    """Test that recurring posts appear correctly in calendar"""
    
    def test_recurring_posts_in_calendar(self, auth_session, social_account_id):
        """Test that recurring posts appear in calendar endpoint"""
        # Create recurring posts for current month
        today = datetime.now()
        start_date = today.strftime("%Y-%m-%d")
        
        payload = {
            "social_account_id": social_account_id,
            "title": "Calendar Test Recurring",
            "format": "story",
            "status": "calendar",
            "frequency": "daily",
            "start_date": start_date,
            "repeat_count": 3
        }
        
        create_response = auth_session.post(f"{BASE_URL}/api/demand-studio/social/posts/recurring", json=payload)
        assert create_response.status_code == 200
        recurrence_id = create_response.json()["recurrence_id"]
        
        # Fetch calendar for current month
        month_start = today.replace(day=1).strftime("%Y-%m-%dT00:00:00")
        month_end = (today.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        month_end_str = month_end.strftime("%Y-%m-%dT23:59:59")
        
        calendar_response = auth_session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar",
            params={"start_date": month_start, "end_date": month_end_str}
        )
        assert calendar_response.status_code == 200
        
        calendar_posts = calendar_response.json()
        recurring_in_calendar = [p for p in calendar_posts if p.get("recurrence_id") == recurrence_id]
        
        assert len(recurring_in_calendar) >= 1, "Recurring posts not found in calendar"
        
        # Verify recurrence fields are present
        for post in recurring_in_calendar:
            assert "recurrence_id" in post
            assert "recurrence_index" in post
            assert "recurrence_total" in post
            assert "recurrence_frequency" in post
        
        print(f"✓ Found {len(recurring_in_calendar)} recurring posts in calendar")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_recurring_posts(self, auth_session):
        """Clean up test recurring posts"""
        # Get all posts
        response = auth_session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        if response.status_code == 200:
            posts = response.json()
            test_posts = [p for p in posts if p.get("title", "").startswith(("Tips del Martes", "Daily Motivation", "Monthly Newsletter", "Biweekly Update", "Original Title", "Updated Title", "Skip Posted Test", "Calendar Test Recurring", "New Title After Posted"))]
            
            deleted = 0
            for post in test_posts:
                del_response = auth_session.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}")
                if del_response.status_code == 200:
                    deleted += 1
            
            print(f"✓ Cleaned up {deleted} test recurring posts")
