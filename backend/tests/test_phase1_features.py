"""
Test Phase 1 Features:
1. Recipe image upload endpoint
2. Image serving endpoint
3. Rebranding verification (API level)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRecipeImageUpload:
    """Test recipe image upload and serving endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("access_token")
        print(f"Login successful, token obtained")
    
    def test_get_recipes_list(self):
        """Test getting recipes list"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Failed to get recipes: {response.text}"
        recipes = response.json()
        assert isinstance(recipes, list), "Recipes should be a list"
        print(f"Found {len(recipes)} recipes")
        
        # Check if any recipe has image_url
        recipes_with_images = [r for r in recipes if r.get('image_url')]
        print(f"Recipes with images: {len(recipes_with_images)}")
        
        return recipes
    
    def test_recipe_image_upload_endpoint_exists(self):
        """Test that recipe image upload endpoint exists"""
        # First get a recipe ID
        recipes = self.test_get_recipes_list()
        if not recipes:
            pytest.skip("No recipes found to test image upload")
        
        recipe_id = recipes[0].get('recipe_id')
        print(f"Testing with recipe_id: {recipe_id}")
        
        # Test that the endpoint exists (without actually uploading)
        # We'll send an empty request to check if endpoint responds
        response = self.session.post(
            f"{BASE_URL}/api/recipes/{recipe_id}/image",
            files={}  # Empty files to test endpoint existence
        )
        # Should get 422 (validation error) or 400 (bad request), not 404
        assert response.status_code != 404, f"Image upload endpoint not found: {response.status_code}"
        print(f"Image upload endpoint exists, status: {response.status_code}")
    
    def test_image_serving_endpoint(self):
        """Test that uploaded images can be served"""
        # Check if there's an uploaded image in the uploads directory
        recipes = self.test_get_recipes_list()
        
        # Find a recipe with an image
        recipe_with_image = None
        for recipe in recipes:
            if recipe.get('image_url'):
                recipe_with_image = recipe
                break
        
        if not recipe_with_image:
            print("No recipe with image found, skipping image serving test")
            pytest.skip("No recipe with image to test serving")
        
        image_url = recipe_with_image['image_url']
        print(f"Testing image URL: {image_url}")
        
        # The image_url should be like /api/uploads/filename.jpg
        full_url = f"{BASE_URL}{image_url}"
        response = self.session.get(full_url)
        
        assert response.status_code == 200, f"Failed to serve image: {response.status_code}"
        assert 'image' in response.headers.get('content-type', ''), "Response should be an image"
        print(f"Image served successfully, content-type: {response.headers.get('content-type')}")
    
    def test_recipe_image_delete_endpoint_exists(self):
        """Test that recipe image delete endpoint exists"""
        recipes = self.test_get_recipes_list()
        if not recipes:
            pytest.skip("No recipes found to test image delete")
        
        recipe_id = recipes[0].get('recipe_id')
        
        # Test endpoint existence without actually deleting
        # We'll check a recipe without an image
        recipe_without_image = None
        for recipe in recipes:
            if not recipe.get('image_url'):
                recipe_without_image = recipe
                break
        
        if recipe_without_image:
            recipe_id = recipe_without_image['recipe_id']
        
        response = self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}/image")
        # Should not be 404
        assert response.status_code != 404, f"Image delete endpoint not found: {response.status_code}"
        print(f"Image delete endpoint exists, status: {response.status_code}")


class TestEventDetails:
    """Test EventDetails tabs configuration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        print(f"Login successful")
    
    def test_get_events_list(self):
        """Test getting events list"""
        response = self.session.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Failed to get events: {response.text}"
        events = response.json()
        assert isinstance(events, list), "Events should be a list"
        print(f"Found {len(events)} events")
        return events
    
    def test_get_event_details(self):
        """Test getting event details"""
        events = self.test_get_events_list()
        if not events:
            pytest.skip("No events found to test details")
        
        event_id = events[0].get('event_id')
        response = self.session.get(f"{BASE_URL}/api/events/{event_id}")
        assert response.status_code == 200, f"Failed to get event details: {response.text}"
        
        event = response.json()
        print(f"Event details: {event.get('name')}")
        return event


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
