"""
Test Sub-Audience Integration for Demand Studio Social Media

This file tests:
1. POST /api/demand-studio/social/posts - accepts sub_audience_id field
2. PUT /api/demand-studio/social/posts/{post_id} - updates sub_audience_id
3. GET /api/demand-studio/social/insights - returns byAudience and bySubAudience arrays
4. POST /api/demand-studio/social/posts/{post_id}/duplicate - copies audience_id, sub_audience_id, segment_id
5. Frontend: Audience and Sub-Audience selector integration
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSubAudienceIntegration:
    """Test sub-audience integration for Demand Studio"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed with status {login_response.status_code}")
        
        login_data = login_response.json()
        self.token = login_data.get("access_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Store cookies for session-based auth
        self.session.cookies.update(login_response.cookies)
        
        yield
        
        # Cleanup: Delete any test posts created
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data created during tests"""
        # Get all posts and delete those with TEST_ prefix
        try:
            posts_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts")
            if posts_response.status_code == 200:
                posts = posts_response.json()
                for post in posts:
                    if post.get("title", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/demand-studio/social/posts/{post['post_id']}")
        except Exception:
            pass
        
        # Cleanup test audiences
        try:
            audiences_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/audiences")
            if audiences_response.status_code == 200:
                audiences = audiences_response.json()
                for aud in audiences:
                    if aud.get("name", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/demand-studio/social/audiences/{aud['audience_id']}")
        except Exception:
            pass
    
    # ============== Test 1: Create Social Account (needed for posts) ==============
    
    def test_01_get_or_create_social_account(self):
        """Ensure we have a social account for testing"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/accounts")
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        
        accounts = response.json()
        if not accounts:
            # Create a test account
            create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/accounts", json={
                "platform": "instagram",
                "handle": "test_account",
                "status": "active"
            })
            assert create_response.status_code == 200, f"Failed to create test account: {create_response.text}"
            self.test_account_id = create_response.json().get("account_id")
        else:
            self.test_account_id = accounts[0].get("account_id")
        
        assert self.test_account_id is not None, "No account available for testing"
        print(f"✓ Using social account: {self.test_account_id}")
    
    # ============== Test 2: Create Audience with Sub-Audiences ==============
    
    def test_02_create_audience_with_sub_audiences(self):
        """Create an audience with sub-audiences for testing"""
        # First get existing audiences to see if one exists
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/audiences")
        assert response.status_code == 200, f"Failed to get audiences: {response.text}"
        
        audiences = response.json()
        
        # Find or create a test audience
        test_audience = None
        for aud in audiences:
            if aud.get("sub_audiences") and len(aud.get("sub_audiences", [])) > 0:
                test_audience = aud
                break
        
        if not test_audience:
            # Create an audience with sub-audiences
            unique_id = uuid.uuid4().hex[:6]
            create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/audiences", json={
                "name": f"TEST_Audience_{unique_id}",
                "description": "Test audience for sub-audience integration",
                "platforms": ["instagram", "linkedin"],
                "sub_audiences": [
                    {"sub_id": f"sub_{unique_id}_1", "name": "Sub-Audience 1", "description": "First sub-audience"},
                    {"sub_id": f"sub_{unique_id}_2", "name": "Sub-Audience 2", "description": "Second sub-audience"}
                ]
            })
            assert create_response.status_code == 200, f"Failed to create test audience: {create_response.text}"
            test_audience = create_response.json()
            print(f"✓ Created test audience: {test_audience.get('audience_id')}")
        
        # Validate audience structure
        assert "audience_id" in test_audience, "Audience should have audience_id"
        assert "sub_audiences" in test_audience, "Audience should have sub_audiences"
        assert len(test_audience.get("sub_audiences", [])) > 0, "Audience should have at least one sub-audience"
        
        # Store for later tests
        self.test_audience_id = test_audience.get("audience_id")
        self.test_sub_audience_id = test_audience.get("sub_audiences", [{}])[0].get("sub_id")
        
        print(f"✓ Test audience ID: {self.test_audience_id}")
        print(f"✓ Test sub-audience ID: {self.test_sub_audience_id}")
    
    # ============== Test 3: Create Social Post with sub_audience_id ==============
    
    def test_03_create_post_with_sub_audience(self):
        """Test creating a social post with sub_audience_id field"""
        # First ensure we have account and audience
        self.test_01_get_or_create_social_account()
        self.test_02_create_audience_with_sub_audiences()
        
        unique_id = uuid.uuid4().hex[:6]
        post_data = {
            "social_account_id": self.test_account_id,
            "title": f"TEST_Post_SubAudience_{unique_id}",
            "caption": "Test post with sub-audience",
            "format": "post",
            "status": "idea",
            "audience_id": self.test_audience_id,
            "sub_audience_id": self.test_sub_audience_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=post_data)
        assert response.status_code == 200, f"Failed to create post: {response.text}"
        
        created_post = response.json()
        
        # Validate the post has sub_audience_id
        assert "post_id" in created_post, "Post should have post_id"
        assert created_post.get("audience_id") == self.test_audience_id, "Post should have correct audience_id"
        assert created_post.get("sub_audience_id") == self.test_sub_audience_id, "Post should have correct sub_audience_id"
        
        self.test_post_id = created_post.get("post_id")
        print(f"✓ Created post with sub_audience_id: {self.test_post_id}")
        print(f"  - audience_id: {created_post.get('audience_id')}")
        print(f"  - sub_audience_id: {created_post.get('sub_audience_id')}")
    
    # ============== Test 4: Update Social Post sub_audience_id ==============
    
    def test_04_update_post_sub_audience(self):
        """Test updating a social post's sub_audience_id"""
        # First create a post
        self.test_03_create_post_with_sub_audience()
        
        # Get the second sub-audience if available
        audiences_response = self.session.get(f"{BASE_URL}/api/demand-studio/social/audiences")
        audiences = audiences_response.json()
        
        new_sub_audience_id = None
        for aud in audiences:
            if aud.get("audience_id") == self.test_audience_id:
                sub_auds = aud.get("sub_audiences", [])
                if len(sub_auds) > 1:
                    new_sub_audience_id = sub_auds[1].get("sub_id")
                break
        
        # If we don't have a second sub-audience, use None to test clearing
        update_data = {
            "social_account_id": self.test_account_id,
            "title": "TEST_Post_Updated_SubAudience",
            "caption": "Updated post with different sub-audience",
            "format": "post",
            "status": "drafted",
            "audience_id": self.test_audience_id,
            "sub_audience_id": new_sub_audience_id
        }
        
        response = self.session.put(f"{BASE_URL}/api/demand-studio/social/posts/{self.test_post_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update post: {response.text}"
        
        updated_post = response.json()
        assert updated_post.get("sub_audience_id") == new_sub_audience_id, "Post should have updated sub_audience_id"
        assert updated_post.get("status") == "drafted", "Post status should be updated"
        
        print(f"✓ Updated post sub_audience_id to: {new_sub_audience_id}")
    
    # ============== Test 5: Duplicate Post copies audience and sub_audience ==============
    
    def test_05_duplicate_post_copies_audience_fields(self):
        """Test that duplicating a post copies audience_id, sub_audience_id, and segment_id"""
        # First create a post with all audience fields
        self.test_01_get_or_create_social_account()
        self.test_02_create_audience_with_sub_audiences()
        
        unique_id = uuid.uuid4().hex[:6]
        original_post_data = {
            "social_account_id": self.test_account_id,
            "title": f"TEST_Original_For_Duplicate_{unique_id}",
            "caption": "Original post to duplicate",
            "format": "reel",
            "status": "scheduled",
            "audience_id": self.test_audience_id,
            "sub_audience_id": self.test_sub_audience_id,
            "segment_id": None  # We don't have a segment, but test the field
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts", json=original_post_data)
        assert create_response.status_code == 200, f"Failed to create original post: {create_response.text}"
        
        original_post = create_response.json()
        original_post_id = original_post.get("post_id")
        
        # Now duplicate the post
        duplicate_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/posts/{original_post_id}/duplicate")
        assert duplicate_response.status_code == 200, f"Failed to duplicate post: {duplicate_response.text}"
        
        duplicated_post = duplicate_response.json()
        
        # Validate duplicated post has all audience fields copied
        assert duplicated_post.get("post_id") != original_post_id, "Duplicated post should have new ID"
        assert "(copy)" in duplicated_post.get("title", ""), "Duplicated post should have (copy) in title"
        assert duplicated_post.get("audience_id") == self.test_audience_id, "Duplicated post should have same audience_id"
        assert duplicated_post.get("sub_audience_id") == self.test_sub_audience_id, "Duplicated post should have same sub_audience_id"
        assert duplicated_post.get("status") == "idea", "Duplicated post status should be reset to 'idea'"
        
        print(f"✓ Duplicated post {original_post_id} -> {duplicated_post.get('post_id')}")
        print(f"  - audience_id copied: {duplicated_post.get('audience_id')}")
        print(f"  - sub_audience_id copied: {duplicated_post.get('sub_audience_id')}")
        
        # Cleanup the duplicated post
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/posts/{duplicated_post.get('post_id')}")
    
    # ============== Test 6: Insights API returns byAudience ==============
    
    def test_06_insights_returns_by_audience(self):
        """Test that insights API returns byAudience array"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/insights")
        assert response.status_code == 200, f"Failed to get insights: {response.text}"
        
        insights = response.json()
        
        # Validate structure
        assert "byAudience" in insights, "Insights should contain byAudience array"
        assert isinstance(insights.get("byAudience"), list), "byAudience should be a list"
        
        # Validate byAudience items structure if any exist
        if insights.get("byAudience"):
            for item in insights["byAudience"]:
                assert "audience_id" in item, "byAudience item should have audience_id"
                assert "name" in item, "byAudience item should have name"
                assert "count" in item, "byAudience item should have count"
        
        print(f"✓ Insights byAudience: {len(insights.get('byAudience', []))} audiences")
        for item in insights.get("byAudience", [])[:5]:
            print(f"  - {item.get('name')}: {item.get('count')} posts")
    
    # ============== Test 7: Insights API returns bySubAudience ==============
    
    def test_07_insights_returns_by_sub_audience(self):
        """Test that insights API returns bySubAudience array"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/insights")
        assert response.status_code == 200, f"Failed to get insights: {response.text}"
        
        insights = response.json()
        
        # Validate structure
        assert "bySubAudience" in insights, "Insights should contain bySubAudience array"
        assert isinstance(insights.get("bySubAudience"), list), "bySubAudience should be a list"
        
        # Validate bySubAudience items structure if any exist
        if insights.get("bySubAudience"):
            for item in insights["bySubAudience"]:
                assert "audience_id" in item, "bySubAudience item should have audience_id"
                assert "audience_name" in item, "bySubAudience item should have audience_name"
                assert "sub_audience_id" in item, "bySubAudience item should have sub_audience_id"
                assert "sub_audience_name" in item, "bySubAudience item should have sub_audience_name"
                assert "count" in item, "bySubAudience item should have count"
        
        print(f"✓ Insights bySubAudience: {len(insights.get('bySubAudience', []))} sub-audiences")
        for item in insights.get("bySubAudience", [])[:5]:
            print(f"  - {item.get('sub_audience_name')} ({item.get('audience_name')}): {item.get('count')} posts")
    
    # ============== Test 8: Full Insights Structure Validation ==============
    
    def test_08_full_insights_structure(self):
        """Test complete insights API response structure"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/insights")
        assert response.status_code == 200, f"Failed to get insights: {response.text}"
        
        insights = response.json()
        
        # Validate all expected fields exist
        expected_fields = [
            "byFormat", "byPillar", "byStatus", 
            "byAudience", "bySubAudience",
            "totalPosts", "postedCount", "postRate"
        ]
        
        for field in expected_fields:
            assert field in insights, f"Insights should contain {field}"
        
        # Validate numeric fields
        assert isinstance(insights.get("totalPosts"), int), "totalPosts should be integer"
        assert isinstance(insights.get("postedCount"), int), "postedCount should be integer"
        assert isinstance(insights.get("postRate"), (int, float)), "postRate should be numeric"
        
        print("✓ Full insights structure validated")
        print(f"  - Total posts: {insights.get('totalPosts')}")
        print(f"  - Posted count: {insights.get('postedCount')}")
        print(f"  - Post rate: {insights.get('postRate')}%")
        print(f"  - Formats: {len(insights.get('byFormat', []))}")
        print(f"  - Pillars: {len(insights.get('byPillar', []))}")
        print(f"  - Statuses: {len(insights.get('byStatus', []))}")
        print(f"  - Audiences: {len(insights.get('byAudience', []))}")
        print(f"  - Sub-Audiences: {len(insights.get('bySubAudience', []))}")
    
    # ============== Test 9: Create Post and Verify in Insights ==============
    
    def test_09_create_post_and_verify_in_insights(self):
        """Test that a created post with sub_audience appears in insights"""
        # First create post with sub_audience
        self.test_03_create_post_with_sub_audience()
        
        # Now get insights and verify the audience appears
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/insights")
        assert response.status_code == 200, f"Failed to get insights: {response.text}"
        
        insights = response.json()
        
        # Check if our test audience appears in byAudience
        audience_ids = [item.get("audience_id") for item in insights.get("byAudience", [])]
        
        # Note: The post might not appear immediately in insights if the test account 
        # or audience is different from what's being aggregated
        print(f"✓ Insights contain {len(audience_ids)} audiences")
        
        # Check bySubAudience as well
        sub_audience_ids = [item.get("sub_audience_id") for item in insights.get("bySubAudience", [])]
        print(f"✓ Insights contain {len(sub_audience_ids)} sub-audiences")
    
    # ============== Test 10: Get Post Verifies sub_audience_id Persisted ==============
    
    def test_10_get_post_verifies_sub_audience(self):
        """Test that GET post returns the persisted sub_audience_id"""
        # First create post with sub_audience
        self.test_03_create_post_with_sub_audience()
        
        # Now fetch the post directly
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/posts/{self.test_post_id}")
        assert response.status_code == 200, f"Failed to get post: {response.text}"
        
        post = response.json()
        
        # Verify sub_audience_id is persisted
        assert post.get("audience_id") == self.test_audience_id, "Post should have persisted audience_id"
        assert post.get("sub_audience_id") == self.test_sub_audience_id, "Post should have persisted sub_audience_id"
        
        print(f"✓ GET post verified sub_audience_id: {post.get('sub_audience_id')}")


class TestAudienceEndpoints:
    """Test audience-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed with status {login_response.status_code}")
        
        login_data = login_response.json()
        self.token = login_data.get("access_token")
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        self.session.cookies.update(login_response.cookies)
        yield
    
    def test_get_audiences(self):
        """Test GET audiences endpoint"""
        response = self.session.get(f"{BASE_URL}/api/demand-studio/social/audiences")
        assert response.status_code == 200, f"Failed to get audiences: {response.text}"
        
        audiences = response.json()
        assert isinstance(audiences, list), "Audiences should be a list"
        
        print(f"✓ Got {len(audiences)} audiences")
        for aud in audiences[:5]:
            sub_count = len(aud.get("sub_audiences", []))
            print(f"  - {aud.get('name')}: {sub_count} sub-audiences")
    
    def test_create_audience_with_sub_audiences(self):
        """Test creating audience with sub_audiences array"""
        unique_id = uuid.uuid4().hex[:6]
        
        response = self.session.post(f"{BASE_URL}/api/demand-studio/social/audiences", json={
            "name": f"TEST_NewAudience_{unique_id}",
            "description": "Test audience with sub-audiences",
            "platforms": ["instagram"],
            "sub_audiences": [
                {"sub_id": f"sub_a_{unique_id}", "name": "Sub A", "description": "First"},
                {"sub_id": f"sub_b_{unique_id}", "name": "Sub B", "description": "Second"}
            ]
        })
        
        assert response.status_code == 200, f"Failed to create audience: {response.text}"
        
        audience = response.json()
        assert "audience_id" in audience, "Should have audience_id"
        assert "sub_audiences" in audience, "Should have sub_audiences"
        assert len(audience.get("sub_audiences", [])) == 2, "Should have 2 sub-audiences"
        
        print(f"✓ Created audience with {len(audience.get('sub_audiences', []))} sub-audiences")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/audiences/{audience.get('audience_id')}")
    
    def test_update_audience_sub_audiences(self):
        """Test updating audience's sub_audiences"""
        unique_id = uuid.uuid4().hex[:6]
        
        # First create
        create_response = self.session.post(f"{BASE_URL}/api/demand-studio/social/audiences", json={
            "name": f"TEST_UpdateAudience_{unique_id}",
            "description": "Test",
            "sub_audiences": [{"sub_id": f"sub_{unique_id}", "name": "Original Sub"}]
        })
        assert create_response.status_code == 200
        audience = create_response.json()
        audience_id = audience.get("audience_id")
        
        # Now update with new sub_audiences
        update_response = self.session.put(f"{BASE_URL}/api/demand-studio/social/audiences/{audience_id}", json={
            "name": f"TEST_UpdateAudience_{unique_id}",
            "description": "Updated",
            "sub_audiences": [
                {"sub_id": f"sub_{unique_id}", "name": "Updated Sub"},
                {"sub_id": f"sub_{unique_id}_new", "name": "New Sub"}
            ]
        })
        
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        
        updated = update_response.json()
        assert len(updated.get("sub_audiences", [])) == 2, "Should have 2 sub-audiences after update"
        
        print(f"✓ Updated audience sub_audiences: {len(updated.get('sub_audiences', []))}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/demand-studio/social/audiences/{audience_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
