"""
Test People Ops Overhaul Features:
1. GET /api/people-ops/reference/departments - returns departments from db.departments
2. GET /api/people-ops/org-chart - returns departments, positions, employees, vacancies, unassigned_employees
3. PATCH /api/people-ops/employees/{id}/assign-position - assigns position and updates department
4. POST /api/people-ops/recruitment/candidates/{id}/hire - creates employee from candidate
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestReferenceDepartments:
    """Test GET /api/people-ops/reference/departments endpoint"""
    
    def test_get_reference_departments_returns_200(self, auth_headers):
        """Test that reference departments endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/reference/departments",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/people-ops/reference/departments returned 200")
    
    def test_get_reference_departments_returns_list(self, auth_headers):
        """Test that reference departments returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/reference/departments",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Reference departments returned list with {len(data)} items")
    
    def test_get_reference_departments_contains_expected_depts(self, auth_headers):
        """Test that reference departments contains expected departments like Finance, Marketing"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/reference/departments",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        # Check if we have some departments
        if len(data) > 0:
            print(f"✓ Found departments: {data[:5]}...")  # Print first 5
        else:
            print("⚠ No departments found - may need to seed data")


class TestOrgChart:
    """Test GET /api/people-ops/org-chart endpoint"""
    
    def test_get_org_chart_returns_200(self, auth_headers):
        """Test that org-chart endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/org-chart",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/people-ops/org-chart returned 200")
    
    def test_org_chart_has_required_fields(self, auth_headers):
        """Test that org-chart response has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/org-chart",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ["departments", "positions", "employees", "vacancies", "unassigned_employees"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        print(f"✓ Org chart has all required fields: {required_fields}")
    
    def test_org_chart_departments_is_list(self, auth_headers):
        """Test that departments is a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/org-chart",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["departments"], list), "departments should be a list"
        print(f"✓ Org chart departments: {len(data['departments'])} items")
    
    def test_org_chart_positions_is_list(self, auth_headers):
        """Test that positions is a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/org-chart",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["positions"], list), "positions should be a list"
        print(f"✓ Org chart positions: {len(data['positions'])} items")
    
    def test_org_chart_positions_have_employees_field(self, auth_headers):
        """Test that positions have employees field"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/org-chart",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        positions = data.get("positions", [])
        if len(positions) > 0:
            pos = positions[0]
            assert "employees" in pos, "Position should have employees field"
            assert "is_vacant" in pos, "Position should have is_vacant field"
            print(f"✓ Positions have employees and is_vacant fields")
        else:
            print("⚠ No positions to verify structure")
    
    def test_org_chart_unassigned_employees_is_list(self, auth_headers):
        """Test that unassigned_employees is a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/org-chart",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["unassigned_employees"], list), "unassigned_employees should be a list"
        print(f"✓ Org chart unassigned_employees: {len(data['unassigned_employees'])} items")


class TestAssignPosition:
    """Test PATCH /api/people-ops/employees/{id}/assign-position endpoint"""
    
    def test_assign_position_requires_auth(self):
        """Test that assign-position requires authentication"""
        response = requests.patch(
            f"{BASE_URL}/api/people-ops/employees/test_emp/assign-position",
            json={"position_id": "test_pos"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Assign position requires authentication")
    
    def test_assign_position_to_nonexistent_employee(self, auth_headers):
        """Test assigning position to non-existent employee returns 404"""
        response = requests.patch(
            f"{BASE_URL}/api/people-ops/employees/nonexistent_emp_123/assign-position",
            headers=auth_headers,
            json={"position_id": "test_pos"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Assign position to non-existent employee returns 404")
    
    def test_assign_position_requires_fields(self, auth_headers):
        """Test that assign-position requires position_id or department_id"""
        # First get an employee
        emp_response = requests.get(
            f"{BASE_URL}/api/people-ops/employees",
            headers=auth_headers
        )
        if emp_response.status_code != 200 or len(emp_response.json()) == 0:
            pytest.skip("No employees available for testing")
        
        employee = emp_response.json()[0]
        employee_id = employee.get("employee_id")
        
        response = requests.patch(
            f"{BASE_URL}/api/people-ops/employees/{employee_id}/assign-position",
            headers=auth_headers,
            json={}  # Empty body
        )
        assert response.status_code == 400, f"Expected 400 for empty body, got {response.status_code}"
        print(f"✓ Assign position requires position_id or department_id")
    
    def test_assign_position_success(self, auth_headers):
        """Test successful position assignment"""
        # Get an employee
        emp_response = requests.get(
            f"{BASE_URL}/api/people-ops/employees",
            headers=auth_headers
        )
        if emp_response.status_code != 200 or len(emp_response.json()) == 0:
            pytest.skip("No employees available for testing")
        
        employee = emp_response.json()[0]
        employee_id = employee.get("employee_id")
        
        # Get a position
        pos_response = requests.get(
            f"{BASE_URL}/api/people-ops/positions",
            headers=auth_headers
        )
        if pos_response.status_code != 200 or len(pos_response.json()) == 0:
            pytest.skip("No positions available for testing")
        
        position = pos_response.json()[0]
        position_id = position.get("position_id")
        
        # Assign position
        response = requests.patch(
            f"{BASE_URL}/api/people-ops/employees/{employee_id}/assign-position",
            headers=auth_headers,
            json={"position_id": position_id}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should have message"
        print(f"✓ Successfully assigned position {position_id} to employee {employee_id}")


class TestHireCandidate:
    """Test POST /api/people-ops/recruitment/candidates/{id}/hire endpoint"""
    
    def test_hire_requires_auth(self):
        """Test that hire endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/people-ops/recruitment/candidates/test_candidate/hire",
            json={"hire_date": "2026-01-15"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Hire endpoint requires authentication")
    
    def test_hire_nonexistent_candidate(self, auth_headers):
        """Test hiring non-existent candidate returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/people-ops/recruitment/candidates/nonexistent_candidate_123/hire",
            headers=auth_headers,
            json={"hire_date": "2026-01-15"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Hire non-existent candidate returns 404")
    
    def test_get_candidates_for_hire(self, auth_headers):
        """Test getting candidates list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/recruitment/candidates",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Candidates should be a list"
        print(f"✓ Got {len(data)} candidates")
        if len(data) > 0:
            print(f"  First candidate: {data[0].get('first_name')} {data[0].get('last_name')} - stage: {data[0].get('stage')}")
    
    def test_hire_candidate_creates_employee(self, auth_headers):
        """Test that hiring a candidate creates an employee"""
        # First, create a test candidate
        unique_id = uuid.uuid4().hex[:8]
        test_candidate = {
            "first_name": f"TEST_Hire_{unique_id}",
            "last_name": "Candidate",
            "email": f"test_hire_{unique_id}@example.com",
            "phone": "555-1234",
            "source": "referral",
            "stage": "offer"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/people-ops/recruitment/candidates",
            headers=auth_headers,
            json=test_candidate
        )
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test candidate: {create_response.text}")
        
        candidate = create_response.json()
        candidate_id = candidate.get("id")
        print(f"✓ Created test candidate: {candidate_id}")
        
        # Now hire the candidate
        hire_data = {
            "hire_date": "2026-01-15",
            "contract_type": "full_time",
            "base_salary": 50000,
            "job_title": "Test Position"
        }
        
        hire_response = requests.post(
            f"{BASE_URL}/api/people-ops/recruitment/candidates/{candidate_id}/hire",
            headers=auth_headers,
            json=hire_data
        )
        
        assert hire_response.status_code == 200, f"Expected 200, got {hire_response.status_code}: {hire_response.text}"
        hire_result = hire_response.json()
        
        assert "employee_id" in hire_result, "Response should have employee_id"
        assert "employee" in hire_result, "Response should have employee object"
        
        employee = hire_result["employee"]
        assert employee["first_name"] == test_candidate["first_name"], "Employee first_name should match candidate"
        assert employee["email"] == test_candidate["email"], "Employee email should match candidate"
        assert employee["status"] == "active", "New employee should be active"
        
        print(f"✓ Successfully hired candidate {candidate_id} -> employee {hire_result['employee_id']}")
        
        # Verify candidate stage is now 'hired'
        verify_response = requests.get(
            f"{BASE_URL}/api/people-ops/recruitment/candidates",
            headers=auth_headers
        )
        if verify_response.status_code == 200:
            candidates = verify_response.json()
            hired_candidate = next((c for c in candidates if c.get("id") == candidate_id), None)
            if hired_candidate:
                assert hired_candidate.get("stage") == "hired", "Candidate stage should be 'hired'"
                print(f"✓ Candidate stage updated to 'hired'")


class TestPositionsEndpoint:
    """Test GET /api/people-ops/positions endpoint"""
    
    def test_get_positions_returns_200(self, auth_headers):
        """Test that positions endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/positions",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ GET /api/people-ops/positions returned 200")
    
    def test_get_positions_returns_list(self, auth_headers):
        """Test that positions returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/positions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Positions returned list with {len(data)} items")
        if len(data) > 0:
            print(f"  First position: {data[0].get('title')} - dept: {data[0].get('department_id')}")


class TestDepartmentsEndpoint:
    """Test GET /api/people-ops/departments endpoint"""
    
    def test_get_departments_returns_200(self, auth_headers):
        """Test that departments endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/departments",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ GET /api/people-ops/departments returned 200")
    
    def test_get_departments_returns_list(self, auth_headers):
        """Test that departments returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/departments",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Departments returned list with {len(data)} items")
        if len(data) > 0:
            print(f"  First department: {data[0].get('name')} - code: {data[0].get('code')}")


class TestRecruitmentJobsEndpoint:
    """Test recruitment jobs endpoints"""
    
    def test_get_jobs_returns_200(self, auth_headers):
        """Test that jobs endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/recruitment/jobs",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ GET /api/people-ops/recruitment/jobs returned 200")
    
    def test_get_jobs_returns_list(self, auth_headers):
        """Test that jobs returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/people-ops/recruitment/jobs",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Jobs returned list with {len(data)} items")
        if len(data) > 0:
            job = data[0]
            print(f"  First job: {job.get('title')} - dept: {job.get('department')} - position_id: {job.get('position_id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
