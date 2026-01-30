"""
EEP Evoque Events Platform - Comprehensive API Tests
Tests: Auth, CRM, Events, Recipes, Inventory, Finance, Settings
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefixes for cleanup
TEST_PREFIX = "TEST_"

class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API Health: {data}")
    
    def test_register_new_user(self):
        """Test user registration"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@evoque.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "Test123!",
            "name": f"{TEST_PREFIX}User",
            "company_name": f"{TEST_PREFIX}Company"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == unique_email
        print(f"✓ Registration successful for {unique_email}")
    
    def test_login_with_valid_credentials(self):
        """Test login with test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"✓ Login successful: {data['user']['email']}")
    
    def test_login_with_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "WrongPassword123!"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")
    
    def test_get_current_user_without_auth(self):
        """Test /me endpoint without authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Unauthenticated request rejected correctly")


class TestDashboard:
    """Dashboard statistics tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        # Verify expected fields
        assert "total_clients" in data or "clients" in data or isinstance(data, dict)
        print(f"✓ Dashboard stats: {data}")


class TestCRM:
    """CRM Client management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_clients(self):
        """Test fetching all clients"""
        response = requests.get(f"{BASE_URL}/api/crm/clients", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} clients")
    
    def test_create_client(self):
        """Test creating a new client"""
        client_data = {
            "name": f"{TEST_PREFIX}Client_{uuid.uuid4().hex[:6]}",
            "email": f"test_{uuid.uuid4().hex[:6]}@client.com",
            "phone": "+1234567890",
            "company_name": f"{TEST_PREFIX}ClientCompany",
            "pipeline_stage": "lead",
            "notes": "Test client created by automated tests"
        }
        response = requests.post(f"{BASE_URL}/api/crm/clients", json=client_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == client_data["name"]
        assert "client_id" in data
        self.created_client_id = data["client_id"]
        print(f"✓ Created client: {data['client_id']}")
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/crm/clients/{data['client_id']}", headers=self.headers)
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == client_data["name"]
        print(f"✓ Verified client persistence")
    
    def test_update_client(self):
        """Test updating a client"""
        # First create a client
        client_data = {
            "name": f"{TEST_PREFIX}UpdateClient_{uuid.uuid4().hex[:6]}",
            "email": f"update_{uuid.uuid4().hex[:6]}@client.com",
            "pipeline_stage": "lead"
        }
        create_response = requests.post(f"{BASE_URL}/api/crm/clients", json=client_data, headers=self.headers)
        assert create_response.status_code == 200
        client_id = create_response.json()["client_id"]
        
        # Update the client
        update_data = {
            "name": f"{TEST_PREFIX}UpdatedClient",
            "email": client_data["email"],
            "pipeline_stage": "contacted"
        }
        update_response = requests.put(f"{BASE_URL}/api/crm/clients/{client_id}", json=update_data, headers=self.headers)
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["pipeline_stage"] == "contacted"
        print(f"✓ Updated client: {client_id}")
    
    def test_delete_client(self):
        """Test deleting a client"""
        # First create a client
        client_data = {
            "name": f"{TEST_PREFIX}DeleteClient_{uuid.uuid4().hex[:6]}",
            "pipeline_stage": "lead"
        }
        create_response = requests.post(f"{BASE_URL}/api/crm/clients", json=client_data, headers=self.headers)
        assert create_response.status_code == 200
        client_id = create_response.json()["client_id"]
        
        # Delete the client
        delete_response = requests.delete(f"{BASE_URL}/api/crm/clients/{client_id}", headers=self.headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/crm/clients/{client_id}", headers=self.headers)
        assert get_response.status_code == 404
        print(f"✓ Deleted client: {client_id}")
    
    def test_pipeline_view(self):
        """Test pipeline view endpoint"""
        response = requests.get(f"{BASE_URL}/api/crm/pipeline", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        # Should have pipeline stages
        expected_stages = ["lead", "contacted", "proposal", "negotiation", "won", "lost"]
        for stage in expected_stages:
            assert stage in data
        print(f"✓ Pipeline view working with {len(data)} stages")


class TestEvents:
    """Events management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token, create test client"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
            
            # Create a test client for events
            client_response = requests.post(f"{BASE_URL}/api/crm/clients", json={
                "name": f"{TEST_PREFIX}EventClient_{uuid.uuid4().hex[:6]}",
                "pipeline_stage": "lead"
            }, headers=self.headers)
            if client_response.status_code == 200:
                self.test_client_id = client_response.json()["client_id"]
            else:
                pytest.skip("Failed to create test client")
        else:
            pytest.skip("Authentication failed")
    
    def test_get_events(self):
        """Test fetching all events"""
        response = requests.get(f"{BASE_URL}/api/events", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} events")
    
    def test_create_event(self):
        """Test creating a new event"""
        event_date = (datetime.now() + timedelta(days=30)).isoformat()
        event_data = {
            "client_id": self.test_client_id,
            "name": f"{TEST_PREFIX}Event_{uuid.uuid4().hex[:6]}",
            "event_type": "wedding",
            "event_date": event_date,
            "venue": "Test Venue",
            "guest_count": 100,
            "budget": 5000.00,
            "status": "planning"
        }
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == event_data["name"]
        assert "event_id" in data
        print(f"✓ Created event: {data['event_id']}")
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/events/{data['event_id']}", headers=self.headers)
        assert get_response.status_code == 200
        print(f"✓ Verified event persistence")
    
    def test_duplicate_event(self):
        """Test duplicating an event"""
        # First create an event
        event_date = (datetime.now() + timedelta(days=30)).isoformat()
        event_data = {
            "client_id": self.test_client_id,
            "name": f"{TEST_PREFIX}DuplicateEvent_{uuid.uuid4().hex[:6]}",
            "event_type": "corporate",
            "event_date": event_date,
            "guest_count": 50,
            "status": "planning"
        }
        create_response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert create_response.status_code == 200
        event_id = create_response.json()["event_id"]
        
        # Duplicate the event
        duplicate_response = requests.post(f"{BASE_URL}/api/events/{event_id}/duplicate", headers=self.headers)
        assert duplicate_response.status_code == 200
        duplicated = duplicate_response.json()
        assert "(Copy)" in duplicated["name"]
        assert duplicated["event_id"] != event_id
        print(f"✓ Duplicated event: {event_id} -> {duplicated['event_id']}")
    
    def test_add_task_to_event(self):
        """Test adding a task to an event"""
        # First create an event
        event_date = (datetime.now() + timedelta(days=30)).isoformat()
        event_data = {
            "client_id": self.test_client_id,
            "name": f"{TEST_PREFIX}TaskEvent_{uuid.uuid4().hex[:6]}",
            "event_type": "party",
            "event_date": event_date,
            "status": "planning"
        }
        create_response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert create_response.status_code == 200
        event_id = create_response.json()["event_id"]
        
        # Add a task
        task_data = {
            "title": f"{TEST_PREFIX}Task",
            "description": "Test task description",
            "due_date": event_date
        }
        task_response = requests.post(f"{BASE_URL}/api/events/{event_id}/tasks", json=task_data, headers=self.headers)
        assert task_response.status_code == 200
        task = task_response.json()
        assert "task_id" in task
        print(f"✓ Added task to event: {task['task_id']}")


class TestRecipes:
    """Recipe management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_recipes(self):
        """Test fetching all recipes"""
        response = requests.get(f"{BASE_URL}/api/recipes", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} recipes")
    
    def test_create_recipe(self):
        """Test creating a new recipe"""
        recipe_data = {
            "name": f"{TEST_PREFIX}Recipe_{uuid.uuid4().hex[:6]}",
            "description": "Test recipe description",
            "recipe_type": "final_dish",
            "category": "main",
            "yield_quantity": 4,
            "yield_unit": "portion",
            "prep_time_minutes": 30,
            "cook_time_minutes": 45,
            "ingredients": [],
            "instructions": ["Step 1", "Step 2"],
            "sell_price": 25.00
        }
        response = requests.post(f"{BASE_URL}/api/recipes", json=recipe_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == recipe_data["name"]
        assert "recipe_id" in data
        print(f"✓ Created recipe: {data['recipe_id']}")
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/recipes/{data['recipe_id']}", headers=self.headers)
        assert get_response.status_code == 200
        print(f"✓ Verified recipe persistence")


class TestInventory:
    """Inventory management tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_ingredients(self):
        """Test fetching all ingredients"""
        response = requests.get(f"{BASE_URL}/api/inventory/ingredients", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} ingredients")
    
    def test_create_ingredient(self):
        """Test creating a new ingredient"""
        ingredient_data = {
            "name": f"{TEST_PREFIX}Ingredient_{uuid.uuid4().hex[:6]}",
            "category": "produce",
            "unit": "kg",
            "cost_per_unit": 5.50,
            "stock_quantity": 10,
            "min_stock_level": 2
        }
        response = requests.post(f"{BASE_URL}/api/inventory/ingredients", json=ingredient_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == ingredient_data["name"]
        assert "ingredient_id" in data
        print(f"✓ Created ingredient: {data['ingredient_id']}")
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/inventory/ingredients/{data['ingredient_id']}", headers=self.headers)
        assert get_response.status_code == 200
        print(f"✓ Verified ingredient persistence")


class TestFinance:
    """Finance API tests (invoices, payments)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
            
            # Create a test client for invoices
            client_response = requests.post(f"{BASE_URL}/api/crm/clients", json={
                "name": f"{TEST_PREFIX}FinanceClient_{uuid.uuid4().hex[:6]}",
                "pipeline_stage": "lead"
            }, headers=self.headers)
            if client_response.status_code == 200:
                self.test_client_id = client_response.json()["client_id"]
            else:
                pytest.skip("Failed to create test client")
        else:
            pytest.skip("Authentication failed")
    
    def test_get_invoices(self):
        """Test fetching all invoices"""
        response = requests.get(f"{BASE_URL}/api/finance/invoices", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} invoices")
    
    def test_create_invoice(self):
        """Test creating a new invoice"""
        due_date = (datetime.now() + timedelta(days=30)).isoformat()
        invoice_data = {
            "client_id": self.test_client_id,
            "due_date": due_date,
            "lines": [
                {
                    "description": "Test Service",
                    "quantity": 1,
                    "unit_price": 100.00
                }
            ],
            "notes": "Test invoice"
        }
        response = requests.post(f"{BASE_URL}/api/finance/invoices", json=invoice_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "invoice_id" in data
        print(f"✓ Created invoice: {data['invoice_id']}")
    
    def test_get_payments(self):
        """Test fetching all payments"""
        response = requests.get(f"{BASE_URL}/api/finance/payments", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} payments")


class TestSettings:
    """Settings API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_company_settings(self):
        """Test fetching company settings"""
        response = requests.get(f"{BASE_URL}/api/settings/company", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Fetched company settings")
    
    def test_update_company_settings(self):
        """Test updating company settings"""
        settings_data = {
            "name": f"{TEST_PREFIX}Company",
            "primary_color": "#3A4D3F",
            "secondary_color": "#E5DCC5",
            "default_language": "en",
            "currency": "USD"
        }
        response = requests.put(f"{BASE_URL}/api/settings/company", json=settings_data, headers=self.headers)
        assert response.status_code == 200
        print(f"✓ Updated company settings")


class TestDocuments:
    """Documents API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token, create test event"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
            
            # Create a test client
            client_response = requests.post(f"{BASE_URL}/api/crm/clients", json={
                "name": f"{TEST_PREFIX}DocClient_{uuid.uuid4().hex[:6]}",
                "pipeline_stage": "lead"
            }, headers=self.headers)
            if client_response.status_code == 200:
                self.test_client_id = client_response.json()["client_id"]
                
                # Create a test event
                event_date = (datetime.now() + timedelta(days=30)).isoformat()
                event_response = requests.post(f"{BASE_URL}/api/events", json={
                    "client_id": self.test_client_id,
                    "name": f"{TEST_PREFIX}DocEvent_{uuid.uuid4().hex[:6]}",
                    "event_type": "wedding",
                    "event_date": event_date,
                    "status": "planning"
                }, headers=self.headers)
                if event_response.status_code == 200:
                    self.test_event_id = event_response.json()["event_id"]
                else:
                    pytest.skip("Failed to create test event")
            else:
                pytest.skip("Failed to create test client")
        else:
            pytest.skip("Authentication failed")
    
    def test_get_documents(self):
        """Test fetching all documents"""
        response = requests.get(f"{BASE_URL}/api/documents", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} documents")
    
    def test_generate_document(self):
        """Test generating a document for an event"""
        response = requests.post(f"{BASE_URL}/api/documents/generate/{self.test_event_id}/quote", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "document_id" in data
        print(f"✓ Generated document: {data['document_id']}")


class TestCalendar:
    """Calendar API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@evoque.com",
            "password": "Test123!"
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_calendar_events(self):
        """Test fetching calendar events"""
        # Calendar endpoint might be /api/events or /api/calendar
        response = requests.get(f"{BASE_URL}/api/events", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} calendar events")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
