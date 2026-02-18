import requests
import sys
import json
from datetime import datetime, timezone, timedelta

class EEPEvoqueAPITester:
    def __init__(self, base_url="https://kora-contracts.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session = requests.Session()  # Use session to maintain cookies
        self.token = None
        self.user_id = None
        self.company_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    details += f", Error: {error_detail}"
                except:
                    details += f", Response: {response.text[:100]}"
            
            self.log_test(name, success, details)
            
            if success:
                try:
                    result = response.json()
                    if name == "Create Event":  # Debug event creation
                        print(f"DEBUG: Event creation response: {result}")
                    return result
                except:
                    return {}
            return None

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return None

    def test_auth_register(self):
        """Test user registration"""
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        data = {
            "email": test_email,
            "password": "TestPass123!",
            "name": "Test User",
            "company_name": "Test Company"
        }
        
        response = self.run_test("User Registration", "POST", "auth/register", 200, data)
        if response:
            self.token = response.get('access_token')
            self.user_id = response.get('user', {}).get('user_id')
            self.company_id = response.get('user', {}).get('company_id')
            return True
        return False

    def test_auth_login(self):
        """Test user login with existing credentials"""
        data = {
            "email": "admin@test.com",
            "password": "admin123"
        }
        
        response = self.run_test("User Login", "POST", "auth/login", 200, data)
        if response:
            self.token = response.get('access_token')
            self.user_id = response.get('user', {}).get('user_id')
            self.company_id = response.get('user', {}).get('company_id')
            return True
        return False

    def test_auth_me(self):
        """Test get current user"""
        response = self.run_test("Get Current User", "GET", "auth/me", 200)
        return response is not None

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        response = self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)
        return response is not None

    def test_crm_operations(self):
        """Test CRM operations"""
        # Create client
        client_data = {
            "name": "Test Client",
            "email": "client@test.com",
            "phone": "+1234567890",
            "company_name": "Client Company",
            "pipeline_stage": "lead"
        }
        
        client = self.run_test("Create Client", "POST", "crm/clients", 200, client_data)
        if not client:
            return False
        
        client_id = client.get('client_id')
        
        # Get clients
        self.run_test("Get Clients", "GET", "crm/clients", 200)
        
        # Get specific client
        self.run_test("Get Client Details", "GET", f"crm/clients/{client_id}", 200)
        
        # Update client
        updated_data = {**client_data, "name": "Updated Client"}
        self.run_test("Update Client", "PUT", f"crm/clients/{client_id}", 200, updated_data)
        
        # Get pipeline
        self.run_test("Get Pipeline", "GET", "crm/pipeline", 200)
        
        return client_id

    def test_events_operations(self, client_id):
        """Test Events operations including new multi-day booking features"""
        if not client_id:
            self.log_test("Events Operations", False, "No client_id available")
            return None
        
        # Create regular event
        event_data = {
            "client_id": client_id,
            "name": "Test Event",
            "event_type": "wedding",
            "event_date": (datetime.now() + timedelta(days=30)).isoformat(),
            "venue": "Test Venue",
            "guest_count": 100,
            "budget": 5000.0,
            "status": "planning"
        }
        
        event = self.run_test("Create Event", "POST", "events", 200, event_data)
        if not event:
            return None
        
        event_id = event.get('event_id')
        print(f"DEBUG: Created event with ID: {event_id}")
        
        # Create multi-day booking
        booking_data = {
            "client_id": client_id,
            "name": "Test Multi-day Booking",
            "event_type": "corporate",
            "event_date": (datetime.now() + timedelta(days=45)).isoformat(),
            "end_date": (datetime.now() + timedelta(days=47)).isoformat(),
            "is_booking": True,
            "venue": "Conference Center",
            "guest_count": 200,
            "budget": 15000.0,
            "status": "planning"
        }
        
        booking = self.run_test("Create Multi-day Booking", "POST", "events", 200, booking_data)
        booking_id = booking.get('event_id') if booking else None
        
        # Get events
        self.run_test("Get Events", "GET", "events", 200)
        
        # Get specific event
        if event_id:
            self.run_test("Get Event Details", "GET", f"events/{event_id}", 200)
            
            # Update event
            updated_data = {**event_data, "name": "Updated Event"}
            self.run_test("Update Event", "PUT", f"events/{event_id}", 200, updated_data)
            
            # Test duplicate event functionality
            duplicate = self.run_test("Duplicate Event", "POST", f"events/{event_id}/duplicate", 200)
            if duplicate:
                duplicate_id = duplicate.get('event_id')
                print(f"DEBUG: Duplicated event with ID: {duplicate_id}")
        
        return event_id

    def test_recipes_operations(self):
        """Test Recipes operations"""
        # Create recipe
        recipe_data = {
            "name": "Test Recipe",
            "description": "A test recipe",
            "category": "main",
            "servings": 4,
            "prep_time_minutes": 30,
            "cook_time_minutes": 45,
            "ingredients": [
                {
                    "ingredient_id": "test_ing_1",
                    "name": "Test Ingredient",
                    "quantity": 2.0,
                    "unit": "kg",
                    "cost_per_unit": 5.0
                }
            ],
            "instructions": ["Step 1", "Step 2"]
        }
        
        recipe = self.run_test("Create Recipe", "POST", "recipes", 200, recipe_data)
        if not recipe:
            return None
        
        recipe_id = recipe.get('recipe_id')
        
        # Get recipes
        self.run_test("Get Recipes", "GET", "recipes", 200)
        
        # Get specific recipe
        self.run_test("Get Recipe Details", "GET", f"recipes/{recipe_id}", 200)
        
        # Test AI analysis (may fail if no API key)
        ai_data = {
            "name": "Test Recipe for AI",
            "servings": 4,
            "ingredients": ["chicken", "rice", "vegetables"]
        }
        self.run_test("AI Recipe Analysis", "POST", "recipes/ai-analyze", 200, ai_data)
        
        return recipe_id

    def test_inventory_operations(self):
        """Test Inventory operations"""
        # Create supplier first
        supplier_data = {
            "name": "Test Supplier",
            "contact_name": "John Doe",
            "email": "supplier@test.com",
            "phone": "+1234567890"
        }
        
        supplier = self.run_test("Create Supplier", "POST", "inventory/suppliers", 200, supplier_data)
        supplier_id = supplier.get('supplier_id') if supplier else None
        
        # Create ingredient
        ingredient_data = {
            "name": "Test Ingredient",
            "category": "produce",
            "unit": "kg",
            "cost_per_unit": 5.0,
            "stock_quantity": 100.0,
            "min_stock_level": 10.0,
            "supplier_id": supplier_id
        }
        
        ingredient = self.run_test("Create Ingredient", "POST", "inventory/ingredients", 200, ingredient_data)
        if not ingredient:
            return None
        
        ingredient_id = ingredient.get('ingredient_id')
        
        # Get ingredients
        self.run_test("Get Ingredients", "GET", "inventory/ingredients", 200)
        
        # Get suppliers
        self.run_test("Get Suppliers", "GET", "inventory/suppliers", 200)
        
        # Get low stock
        self.run_test("Get Low Stock", "GET", "inventory/low-stock", 200)
        
        return ingredient_id

    def test_documents_operations(self, event_id):
        """Test Documents operations including new document types"""
        if not event_id:
            self.log_test("Documents Operations", False, "No event_id available")
            return None
        
        # Test generating different document types
        doc_types = ["contract", "quote", "invoice", "beo", "kitchen_sheet", "packing_list", "menu", "mise_en_place"]
        generated_docs = []
        
        for doc_type in doc_types:
            doc = self.run_test(f"Generate {doc_type.title()}", "POST", f"documents/generate/{event_id}/{doc_type}", 200)
            if doc:
                generated_docs.append(doc.get('document_id'))
        
        # Get documents
        self.run_test("Get Documents", "GET", "documents", 200)
        
        # Get documents for specific event
        self.run_test("Get Event Documents", "GET", f"documents?event_id={event_id}", 200)
        
        # Test specific document access if we have any
        if generated_docs:
            doc_id = generated_docs[0]
            self.run_test("Get Document Details", "GET", f"documents/{doc_id}", 200)
            
            # Test client portal access
            self.run_test("Client Portal Access", "GET", f"portal/document/{doc_id}", 200)
        
        return generated_docs[0] if generated_docs else None

    def test_settings_operations(self):
        """Test Settings operations including document templates"""
        # Get company settings
        self.run_test("Get Company Settings", "GET", "settings/company", 200)
        
        # Update company settings
        settings_data = {
            "name": "Updated Company Name",
            "primary_color": "#FF0000"
        }
        self.run_test("Update Company Settings", "PUT", "settings/company", 200, settings_data)
        
        # Test document types endpoint
        self.run_test("Get Document Types", "GET", "settings/document-types", 200)
        
        # Test templates
        self.run_test("Get Templates", "GET", "settings/templates", 200)
        
        # Create a template
        template_data = {
            "name": "kitchen_sheet",
            "type": "kitchen_sheet",
            "settings": {
                "show_prices": False,
                "requires_signature": False
            }
        }
        template = self.run_test("Create Template", "POST", "settings/templates", 200, template_data)
        
        if template:
            template_id = template.get('template_id')
            if template_id:
                # Update template
                updated_template = {
                    "name": "kitchen_sheet",
                    "settings": {
                        "show_prices": True,
                        "requires_signature": False
                    }
                }
                self.run_test("Update Template", "PUT", f"settings/templates/{template_id}", 200, updated_template)

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting EEP Evoque Events Platform API Tests")
        print("=" * 60)
        
        # Test authentication first
        if not self.test_auth_register():
            print("❌ Registration failed, trying login...")
            if not self.test_auth_login():
                print("❌ Both registration and login failed, stopping tests")
                return False
        
        # Test authenticated endpoints
        self.test_auth_me()
        self.test_dashboard_stats()
        
        # Test core modules
        client_id = self.test_crm_operations()
        event_id = self.test_events_operations(client_id)
        recipe_id = self.test_recipes_operations()
        ingredient_id = self.test_inventory_operations()
        
        # Only test documents if we have an event
        if event_id:
            doc_id = self.test_documents_operations(event_id)
        else:
            self.log_test("Documents Operations", False, "No event_id available")
        
        # Test settings
        self.test_settings_operations()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = EEPEvoqueAPITester()
    success = tester.run_all_tests()
    
    # Save results
    with open('/app/test_reports/backend_api_results.json', 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'total_tests': tester.tests_run,
            'passed_tests': tester.tests_passed,
            'success_rate': (tester.tests_passed/tester.tests_run)*100 if tester.tests_run > 0 else 0,
            'results': tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())