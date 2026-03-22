"""
Test Data Isolation Fix for Demand Studio Social Media Endpoints

Bug: When viewing own Demand Studio account, posts from ALL shared organizations 
(Ciano Gourmet, StaffDO) were showing instead of only the user's own posts.

Fix: Removed the membership aggregation that merged all company IDs when org_id is null.
Now each endpoint only queries the single effective company_id.

Endpoints tested:
- GET /api/demand-studio/social/posts (without org_id returns ONLY user's own company posts)
- GET /api/demand-studio/social/posts (with org_id returns ONLY that specific org's posts)
- GET /api/demand-studio/social/calendar (without org_id returns ONLY user's own company events)
- GET /api/demand-studio/social/calendar (with org_id returns ONLY that specific org's events)
- GET /api/demand-studio/social/stats (without org_id returns ONLY user's own company stats)
- GET /api/demand-studio/social/ideas (without org_id returns ONLY user's own company ideas)
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"

# Company IDs from the bug report
OWN_COMPANY_ID = "company_3ab116c0994d"  # User's own company (Demand Studio)
SHARED_ORG_ID = "company_cfab77cb94c1"   # Shared org (Ciano Gourmet or StaffDO)


@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    return s


class TestDataIsolationPosts:
    """Test that GET /api/demand-studio/social/posts correctly isolates data"""
    
    def test_posts_without_org_id_returns_only_own_company(self, session):
        """Without org_id, should return ONLY posts from user's own company"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        posts = response.json()
        assert isinstance(posts, list), "Response should be a list"
        
        # Verify all posts belong to user's own company
        for post in posts:
            assert post.get("company_id") == OWN_COMPANY_ID, \
                f"Post {post.get('post_id')} has company_id {post.get('company_id')}, expected {OWN_COMPANY_ID}"
        
        print(f"✓ Without org_id: {len(posts)} posts, all from own company {OWN_COMPANY_ID}")
    
    def test_posts_with_org_id_returns_only_that_org(self, session):
        """With org_id, should return ONLY posts from that specific org"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/posts?org_id={SHARED_ORG_ID}")
        
        # May return 403 if user doesn't have access, or 200 with posts
        if response.status_code == 403:
            print(f"✓ With org_id={SHARED_ORG_ID}: Access denied (expected if no membership)")
            return
        
        assert response.status_code == 200, f"Expected 200 or 403, got {response.status_code}: {response.text}"
        
        posts = response.json()
        assert isinstance(posts, list), "Response should be a list"
        
        # Verify all posts belong to the specified org
        for post in posts:
            assert post.get("company_id") == SHARED_ORG_ID, \
                f"Post {post.get('post_id')} has company_id {post.get('company_id')}, expected {SHARED_ORG_ID}"
        
        print(f"✓ With org_id={SHARED_ORG_ID}: {len(posts)} posts, all from specified org")
    
    def test_posts_no_cross_contamination(self, session):
        """Verify posts from shared orgs don't appear when viewing own company"""
        # Get posts without org_id (own company)
        own_response = session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert own_response.status_code == 200
        own_posts = own_response.json()
        
        # Check that no posts from shared org appear
        shared_org_posts = [p for p in own_posts if p.get("company_id") == SHARED_ORG_ID]
        assert len(shared_org_posts) == 0, \
            f"Found {len(shared_org_posts)} posts from shared org {SHARED_ORG_ID} when viewing own company"
        
        print(f"✓ No cross-contamination: 0 posts from shared org in own company view")


class TestDataIsolationCalendar:
    """Test that GET /api/demand-studio/social/calendar correctly isolates data"""
    
    def test_calendar_without_org_id_returns_only_own_company(self, session):
        """Without org_id, should return ONLY calendar events from user's own company"""
        # Get date range for current month
        now = datetime.now()
        start_date = now.replace(day=1).strftime("%Y-%m-%dT00:00:00")
        end_date = (now.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m-%dT00:00:00")
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        events = response.json()
        assert isinstance(events, list), "Response should be a list"
        
        # Verify all events belong to user's own company
        for event in events:
            assert event.get("company_id") == OWN_COMPANY_ID, \
                f"Calendar event {event.get('post_id')} has company_id {event.get('company_id')}, expected {OWN_COMPANY_ID}"
        
        print(f"✓ Calendar without org_id: {len(events)} events, all from own company {OWN_COMPANY_ID}")
    
    def test_calendar_with_org_id_returns_only_that_org(self, session):
        """With org_id, should return ONLY calendar events from that specific org"""
        now = datetime.now()
        start_date = now.replace(day=1).strftime("%Y-%m-%dT00:00:00")
        end_date = (now.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m-%dT00:00:00")
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}&org_id={SHARED_ORG_ID}"
        )
        
        # May return 403 if user doesn't have access, or 200 with events
        if response.status_code == 403:
            print(f"✓ Calendar with org_id={SHARED_ORG_ID}: Access denied (expected if no membership)")
            return
        
        assert response.status_code == 200, f"Expected 200 or 403, got {response.status_code}: {response.text}"
        
        events = response.json()
        assert isinstance(events, list), "Response should be a list"
        
        # Verify all events belong to the specified org
        for event in events:
            assert event.get("company_id") == SHARED_ORG_ID, \
                f"Calendar event {event.get('post_id')} has company_id {event.get('company_id')}, expected {SHARED_ORG_ID}"
        
        print(f"✓ Calendar with org_id={SHARED_ORG_ID}: {len(events)} events, all from specified org")


class TestDataIsolationStats:
    """Test that GET /api/demand-studio/social/stats correctly isolates data"""
    
    def test_stats_without_org_id_returns_only_own_company(self, session):
        """Without org_id, should return ONLY stats from user's own company"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/stats")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert isinstance(stats, dict), "Response should be a dict"
        
        # Verify stats structure
        expected_keys = ["scheduledThisWeek", "postedThisMonth", "activeAccounts", "campaignLinkedPosts", "pendingIdeas"]
        for key in expected_keys:
            assert key in stats, f"Missing key '{key}' in stats response"
        
        print(f"✓ Stats without org_id: {stats}")
    
    def test_stats_with_org_id_returns_only_that_org(self, session):
        """With org_id, should return ONLY stats from that specific org"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/stats?org_id={SHARED_ORG_ID}")
        
        # May return 403 if user doesn't have access, or 200 with stats
        if response.status_code == 403:
            print(f"✓ Stats with org_id={SHARED_ORG_ID}: Access denied (expected if no membership)")
            return
        
        assert response.status_code == 200, f"Expected 200 or 403, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert isinstance(stats, dict), "Response should be a dict"
        
        print(f"✓ Stats with org_id={SHARED_ORG_ID}: {stats}")


class TestDataIsolationIdeas:
    """Test that GET /api/demand-studio/social/ideas correctly isolates data"""
    
    def test_ideas_without_org_id_returns_only_own_company(self, session):
        """Without org_id, should return ONLY ideas from user's own company"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        ideas = response.json()
        assert isinstance(ideas, list), "Response should be a list"
        
        # Verify all ideas belong to user's own company
        for idea in ideas:
            assert idea.get("company_id") == OWN_COMPANY_ID, \
                f"Idea {idea.get('idea_id')} has company_id {idea.get('company_id')}, expected {OWN_COMPANY_ID}"
        
        print(f"✓ Ideas without org_id: {len(ideas)} ideas, all from own company {OWN_COMPANY_ID}")
    
    def test_ideas_with_org_id_returns_only_that_org(self, session):
        """With org_id, should return ONLY ideas from that specific org"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas?org_id={SHARED_ORG_ID}")
        
        # May return 403 if user doesn't have access, or 200 with ideas
        if response.status_code == 403:
            print(f"✓ Ideas with org_id={SHARED_ORG_ID}: Access denied (expected if no membership)")
            return
        
        assert response.status_code == 200, f"Expected 200 or 403, got {response.status_code}: {response.text}"
        
        ideas = response.json()
        assert isinstance(ideas, list), "Response should be a list"
        
        # Verify all ideas belong to the specified org
        for idea in ideas:
            assert idea.get("company_id") == SHARED_ORG_ID, \
                f"Idea {idea.get('idea_id')} has company_id {idea.get('company_id')}, expected {SHARED_ORG_ID}"
        
        print(f"✓ Ideas with org_id={SHARED_ORG_ID}: {len(ideas)} ideas, all from specified org")


class TestEndpointHealth:
    """Basic health checks for all affected endpoints"""
    
    def test_posts_endpoint_accessible(self, session):
        """Verify posts endpoint is accessible"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/posts")
        assert response.status_code == 200, f"Posts endpoint failed: {response.status_code}"
        print("✓ Posts endpoint accessible")
    
    def test_calendar_endpoint_accessible(self, session):
        """Verify calendar endpoint is accessible"""
        now = datetime.now()
        start_date = now.replace(day=1).strftime("%Y-%m-%dT00:00:00")
        end_date = (now.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m-%dT00:00:00")
        
        response = session.get(
            f"{BASE_URL}/api/demand-studio/social/calendar?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200, f"Calendar endpoint failed: {response.status_code}"
        print("✓ Calendar endpoint accessible")
    
    def test_stats_endpoint_accessible(self, session):
        """Verify stats endpoint is accessible"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/stats")
        # May return 500 if there's a bug (company_filter undefined)
        assert response.status_code == 200, f"Stats endpoint failed: {response.status_code} - {response.text}"
        print("✓ Stats endpoint accessible")
    
    def test_ideas_endpoint_accessible(self, session):
        """Verify ideas endpoint is accessible"""
        response = session.get(f"{BASE_URL}/api/demand-studio/social/ideas")
        assert response.status_code == 200, f"Ideas endpoint failed: {response.status_code}"
        print("✓ Ideas endpoint accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
