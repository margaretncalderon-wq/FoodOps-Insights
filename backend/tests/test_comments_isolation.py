"""
Test Comments Isolation Bug Fix
Verifies that comments are correctly filtered by entity_id and don't leak between posts
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"

# Test post IDs from the bug report
POST_WITH_2_COMMENTS = "post_f6f2934fbcfc"  # Should have 2 comments
POST_WITH_1_COMMENT = "post_e629ad2d789a"   # Should have 1 comment
POST_WITH_0_COMMENTS = "post_85921a53ee06"  # Should have 0 comments


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestCommentsIsolation:
    """Test that comments are correctly isolated per entity_id"""
    
    def test_post_with_2_comments_returns_exactly_2(self, api_client):
        """GET /api/comments/social_post/post_f6f2934fbcfc should return exactly 2 comments"""
        response = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_2_COMMENTS}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        comments = response.json()
        assert isinstance(comments, list), "Response should be a list"
        assert len(comments) == 2, f"Expected 2 comments, got {len(comments)}"
        
        # Verify all comments belong to this entity
        for comment in comments:
            assert comment.get("entity_id") == POST_WITH_2_COMMENTS, \
                f"Comment entity_id mismatch: expected {POST_WITH_2_COMMENTS}, got {comment.get('entity_id')}"
            assert comment.get("entity_type") == "social_post", \
                f"Comment entity_type mismatch: expected social_post, got {comment.get('entity_type')}"
        
        print(f"PASS: Post {POST_WITH_2_COMMENTS} has exactly 2 comments")
    
    def test_post_with_1_comment_returns_exactly_1(self, api_client):
        """GET /api/comments/social_post/post_e629ad2d789a should return exactly 1 comment"""
        response = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_1_COMMENT}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        comments = response.json()
        assert isinstance(comments, list), "Response should be a list"
        assert len(comments) == 1, f"Expected 1 comment, got {len(comments)}"
        
        # Verify comment belongs to this entity
        comment = comments[0]
        assert comment.get("entity_id") == POST_WITH_1_COMMENT, \
            f"Comment entity_id mismatch: expected {POST_WITH_1_COMMENT}, got {comment.get('entity_id')}"
        
        print(f"PASS: Post {POST_WITH_1_COMMENT} has exactly 1 comment")
    
    def test_post_with_0_comments_returns_empty(self, api_client):
        """GET /api/comments/social_post/post_85921a53ee06 should return 0 comments"""
        response = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_0_COMMENTS}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        comments = response.json()
        assert isinstance(comments, list), "Response should be a list"
        assert len(comments) == 0, f"Expected 0 comments, got {len(comments)}"
        
        print(f"PASS: Post {POST_WITH_0_COMMENTS} has 0 comments")
    
    def test_comments_dont_leak_between_posts(self, api_client):
        """Verify comments from one post don't appear in another post's response"""
        # Get comments for post with 2 comments
        response1 = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_2_COMMENTS}")
        comments1 = response1.json()
        
        # Get comments for post with 0 comments
        response2 = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_0_COMMENTS}")
        comments2 = response2.json()
        
        # Verify no overlap
        comment_ids_1 = {c.get("comment_id") for c in comments1}
        comment_ids_2 = {c.get("comment_id") for c in comments2}
        
        overlap = comment_ids_1.intersection(comment_ids_2)
        assert len(overlap) == 0, f"Comments leaked between posts: {overlap}"
        
        print("PASS: No comment leakage between posts")


class TestCreateCommentIsolation:
    """Test that creating a comment only appears on the correct post"""
    
    def test_create_comment_appears_only_on_target_post(self, api_client):
        """POST /api/comments creates a comment that only appears on the target entity"""
        import uuid
        
        # Create a unique test comment
        test_content = f"Test comment isolation {uuid.uuid4().hex[:8]}"
        
        # Create comment on post with 0 comments
        create_response = api_client.post(
            f"{BASE_URL}/api/comments",
            json={
                "entity_type": "social_post",
                "entity_id": POST_WITH_0_COMMENTS,
                "content": test_content,
                "mentions": []
            }
        )
        
        assert create_response.status_code == 200, \
            f"Failed to create comment: {create_response.status_code} - {create_response.text}"
        
        created_comment = create_response.json()
        comment_id = created_comment.get("comment_id")
        
        try:
            # Verify comment appears on target post
            response_target = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_0_COMMENTS}")
            comments_target = response_target.json()
            
            target_comment_ids = [c.get("comment_id") for c in comments_target]
            assert comment_id in target_comment_ids, \
                f"Created comment {comment_id} not found on target post"
            
            # Verify comment does NOT appear on other posts
            response_other = api_client.get(f"{BASE_URL}/api/comments/social_post/{POST_WITH_2_COMMENTS}")
            comments_other = response_other.json()
            
            other_comment_ids = [c.get("comment_id") for c in comments_other]
            assert comment_id not in other_comment_ids, \
                f"Created comment {comment_id} incorrectly appears on different post"
            
            print(f"PASS: Created comment {comment_id} only appears on target post")
            
        finally:
            # Cleanup: delete the test comment
            api_client.delete(f"{BASE_URL}/api/comments/{comment_id}")


class TestCommentCountsIsolation:
    """Test comment counts API returns correct counts per entity"""
    
    def test_comment_counts_by_entities(self, api_client):
        """GET /api/comments/counts/by-entities returns correct counts per entity"""
        entity_ids = f"{POST_WITH_2_COMMENTS},{POST_WITH_1_COMMENT},{POST_WITH_0_COMMENTS}"
        
        response = api_client.get(
            f"{BASE_URL}/api/comments/counts/by-entities",
            params={
                "entity_type": "social_post",
                "entity_ids": entity_ids
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        counts = response.json()
        
        # Verify counts match expected values
        if POST_WITH_2_COMMENTS in counts:
            assert counts[POST_WITH_2_COMMENTS].get("comments") == 2, \
                f"Expected 2 comments for {POST_WITH_2_COMMENTS}, got {counts[POST_WITH_2_COMMENTS].get('comments')}"
        
        if POST_WITH_1_COMMENT in counts:
            assert counts[POST_WITH_1_COMMENT].get("comments") == 1, \
                f"Expected 1 comment for {POST_WITH_1_COMMENT}, got {counts[POST_WITH_1_COMMENT].get('comments')}"
        
        # Post with 0 comments might not be in response (or have 0)
        if POST_WITH_0_COMMENTS in counts:
            assert counts[POST_WITH_0_COMMENTS].get("comments", 0) == 0, \
                f"Expected 0 comments for {POST_WITH_0_COMMENTS}, got {counts[POST_WITH_0_COMMENTS].get('comments')}"
        
        print(f"PASS: Comment counts are correctly isolated per entity")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
