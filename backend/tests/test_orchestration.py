"""
Test suite for Event Orchestration Module
Tests all 8 tabs: Event Blueprint, Experience Design, Operational Flow, Run of Show,
Team & Roles, Production Assets, Event Calendar, Post-Event Review
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"
TEST_EVENT_ID = "event_c35238fcb131"


class TestOrchestrationAuth:
    """Authentication tests for orchestration module"""
    
    @pytest.fixture(scope="class")
    def session(self):
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
    
    def test_login_success(self, session):
        """Verify login works"""
        # Session is already authenticated from fixture
        assert session is not None
        print("✓ Login successful")


class TestOrchestrationEventsList:
    """Test orchestration events list endpoint"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_orchestration_events(self, session):
        """GET /api/orchestration/events - Get all events for orchestration"""
        response = session.get(f"{BASE_URL}/api/orchestration/events")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} events for orchestration")
        
        # Check event structure
        if len(data) > 0:
            event = data[0]
            assert "event_id" in event
            assert "name" in event
            # Check orchestration status fields
            assert "has_blueprint" in event
            assert "has_run_of_show" in event
            assert "has_team" in event
            print(f"✓ Event structure verified: {event.get('name')}")


class TestEventBlueprint:
    """Test Event Blueprint tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_blueprint(self, session):
        """GET /api/orchestration/blueprint/{event_id} - Get event blueprint"""
        response = session.get(f"{BASE_URL}/api/orchestration/blueprint/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event" in data
        assert "blueprint" in data
        assert data["event"]["event_id"] == TEST_EVENT_ID
        print(f"✓ Got blueprint for event: {data['event'].get('name')}")
    
    def test_update_blueprint(self, session):
        """PUT /api/orchestration/blueprint/{event_id} - Update blueprint"""
        test_objectives = f"TEST_Objectives_{uuid.uuid4().hex[:8]}"
        
        response = session.put(f"{BASE_URL}/api/orchestration/blueprint/{TEST_EVENT_ID}", json={
            "objectives": test_objectives,
            "scope_definition": "Test scope definition",
            "critical_assumptions": "Test assumptions",
            "constraints": "Test constraints",
            "success_criteria": "Test success criteria"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["objectives"] == test_objectives
        print(f"✓ Blueprint updated with objectives: {test_objectives}")
        
        # Verify persistence with GET
        get_response = session.get(f"{BASE_URL}/api/orchestration/blueprint/{TEST_EVENT_ID}")
        assert get_response.status_code == 200
        assert get_response.json()["blueprint"]["objectives"] == test_objectives
        print("✓ Blueprint persistence verified")


class TestExperienceDesign:
    """Test Experience Design tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_experience_design(self, session):
        """GET /api/orchestration/experience/{event_id} - Get experience design"""
        response = session.get(f"{BASE_URL}/api/orchestration/experience/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event_id" in data
        assert "color_palette" in data
        assert "materials" in data
        assert "moodboard_images" in data
        assert "layout_zones" in data
        print("✓ Got experience design")
    
    def test_update_experience_design(self, session):
        """PUT /api/orchestration/experience/{event_id} - Update experience design"""
        test_color = "#FF5733"
        test_material = {"id": 1, "name": "TEST_Linen", "category": "linens", "description": "Test material"}
        test_zone = {"id": 1, "name": "TEST_Zone", "purpose": "Test purpose", "capacity": "50"}
        
        response = session.put(f"{BASE_URL}/api/orchestration/experience/{TEST_EVENT_ID}", json={
            "event_id": TEST_EVENT_ID,
            "color_palette": [test_color, "#3498DB"],
            "materials": [test_material],
            "moodboard_images": [{"id": 1, "url": "https://example.com/test.jpg", "caption": "Test image"}],
            "catering_setup": "buffet",
            "layout_zones": [test_zone],
            "notes": "Test design notes"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert test_color in data["color_palette"]
        assert len(data["materials"]) > 0
        assert data["catering_setup"] == "buffet"
        print("✓ Experience design updated")
        
        # Verify persistence
        get_response = session.get(f"{BASE_URL}/api/orchestration/experience/{TEST_EVENT_ID}")
        assert get_response.status_code == 200
        assert test_color in get_response.json()["color_palette"]
        print("✓ Experience design persistence verified")


class TestOperationalFlow:
    """Test Operational Flow tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_operational_flow(self, session):
        """GET /api/orchestration/operational-flow/{event_id} - Get operational flow"""
        response = session.get(f"{BASE_URL}/api/orchestration/operational-flow/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event_id" in data
        assert "phases" in data
        assert "dependencies" in data
        assert "risks" in data
        print(f"✓ Got operational flow with {len(data['phases'])} phases")
    
    def test_update_operational_flow(self, session):
        """PUT /api/orchestration/operational-flow/{event_id} - Update operational flow"""
        test_phase_id = f"phase_{uuid.uuid4().hex[:8]}"
        test_risk = {"name": "TEST_Risk", "probability": "medium", "impact": "high", "mitigation": "Test mitigation"}
        test_dep = {"name": "TEST_Dependency", "type": "vendor", "status": "pending"}
        
        response = session.put(f"{BASE_URL}/api/orchestration/operational-flow/{TEST_EVENT_ID}", json={
            "event_id": TEST_EVENT_ID,
            "phases": [
                {"phase_id": test_phase_id, "name": "Pre-Event", "status": "in_progress", "checklist": [
                    {"id": 1, "item": "TEST_Checklist item", "completed": False}
                ]},
                {"phase_id": f"phase_{uuid.uuid4().hex[:8]}", "name": "Live", "status": "pending", "checklist": []},
                {"phase_id": f"phase_{uuid.uuid4().hex[:8]}", "name": "Post-Event", "status": "pending", "checklist": []}
            ],
            "dependencies": [test_dep],
            "risks": [test_risk],
            "overall_status": "planning"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["phases"]) == 3
        assert data["phases"][0]["status"] == "in_progress"
        assert len(data["risks"]) > 0
        print("✓ Operational flow updated with phases, risks, and dependencies")
        
        # Verify persistence
        get_response = session.get(f"{BASE_URL}/api/orchestration/operational-flow/{TEST_EVENT_ID}")
        assert get_response.status_code == 200
        assert get_response.json()["phases"][0]["status"] == "in_progress"
        print("✓ Operational flow persistence verified")


class TestRunOfShow:
    """Test Run of Show tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_templates(self, session):
        """GET /api/orchestration/run-of-show/templates - Get available templates"""
        response = session.get(f"{BASE_URL}/api/orchestration/run-of-show/templates")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Got {len(data)} Run of Show templates")
        
        # Check template structure
        for key, template in data.items():
            assert "name" in template
            assert "blocks" in template
            print(f"  - Template: {template['name']}")
    
    def test_get_run_of_show(self, session):
        """GET /api/orchestration/run-of-show/{event_id} - Get run of show"""
        response = session.get(f"{BASE_URL}/api/orchestration/run-of-show/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event_id" in data
        assert "time_blocks" in data
        print(f"✓ Got run of show with {len(data['time_blocks'])} time blocks")
    
    def test_apply_template(self, session):
        """POST /api/orchestration/run-of-show/{event_id}/apply-template - Apply template"""
        # First get available templates
        templates_response = session.get(f"{BASE_URL}/api/orchestration/run-of-show/templates")
        templates = templates_response.json()
        
        if len(templates) > 0:
            template_key = list(templates.keys())[0]
            response = session.post(
                f"{BASE_URL}/api/orchestration/run-of-show/{TEST_EVENT_ID}/apply-template?template_key={template_key}"
            )
            assert response.status_code == 200
            
            data = response.json()
            assert len(data["time_blocks"]) > 0
            assert data["template_name"] is not None
            print(f"✓ Applied template '{data['template_name']}' with {len(data['time_blocks'])} blocks")
    
    def test_update_run_of_show(self, session):
        """PUT /api/orchestration/run-of-show/{event_id} - Update run of show"""
        test_block_id = f"block_{uuid.uuid4().hex[:8]}"
        
        response = session.put(f"{BASE_URL}/api/orchestration/run-of-show/{TEST_EVENT_ID}", json={
            "event_id": TEST_EVENT_ID,
            "time_blocks": [
                {
                    "block_id": test_block_id,
                    "start_time": "09:00",
                    "end_time": "10:00",
                    "title": "TEST_Block",
                    "description": "Test description",
                    "responsible_role": "Coordinator",
                    "location": "Main Hall",
                    "notes": "Test notes",
                    "is_buffer": False,
                    "order": 0
                },
                {
                    "block_id": f"block_{uuid.uuid4().hex[:8]}",
                    "start_time": "10:00",
                    "end_time": "11:00",
                    "title": "TEST_Block_2",
                    "description": None,
                    "responsible_role": None,
                    "location": None,
                    "notes": None,
                    "is_buffer": False,
                    "order": 1
                }
            ],
            "template_name": None,
            "contingency_notes": "Test contingency notes"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["time_blocks"]) == 2
        assert data["time_blocks"][0]["title"] == "TEST_Block"
        print("✓ Run of show updated with custom blocks")


class TestTeamRoles:
    """Test Team & Roles tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_team_roles(self, session):
        """GET /api/orchestration/team/{event_id} - Get team roles"""
        response = session.get(f"{BASE_URL}/api/orchestration/team/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event_id" in data
        assert "roles" in data
        print(f"✓ Got team with {len(data['roles'])} roles")
    
    def test_update_team_roles(self, session):
        """PUT /api/orchestration/team/{event_id} - Update team roles"""
        test_role_id = f"role_{uuid.uuid4().hex[:8]}"
        
        response = session.put(f"{BASE_URL}/api/orchestration/team/{TEST_EVENT_ID}", json={
            "event_id": TEST_EVENT_ID,
            "roles": [
                {
                    "role_id": test_role_id,
                    "name": "TEST_Coordinator",
                    "responsibilities": "Test responsibilities",
                    "assignees": [{"name": "John Doe", "contact": "john@test.com"}],
                    "is_quick_add": False
                },
                {
                    "role_id": f"role_{uuid.uuid4().hex[:8]}",
                    "name": "TEST_DJ",
                    "responsibilities": "Music",
                    "assignees": [],
                    "is_quick_add": True
                }
            ],
            "coordinator_notes": "Test coordinator notes"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["roles"]) == 2
        assert data["roles"][0]["name"] == "TEST_Coordinator"
        print("✓ Team roles updated")
        
        # Verify persistence
        get_response = session.get(f"{BASE_URL}/api/orchestration/team/{TEST_EVENT_ID}")
        assert get_response.status_code == 200
        assert len(get_response.json()["roles"]) == 2
        print("✓ Team roles persistence verified")


class TestProductionAssets:
    """Test Production Assets tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_production_assets(self, session):
        """GET /api/orchestration/production/{event_id} - Get production assets"""
        response = session.get(f"{BASE_URL}/api/orchestration/production/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event_id" in data
        assert "assets" in data
        assert "checklists" in data
        print(f"✓ Got production with {len(data['assets'])} assets and {len(data['checklists'])} checklist items")
    
    def test_update_production_assets(self, session):
        """PUT /api/orchestration/production/{event_id} - Update production assets"""
        test_asset_id = f"asset_{uuid.uuid4().hex[:8]}"
        test_checklist_id = f"item_{uuid.uuid4().hex[:8]}"
        
        response = session.put(f"{BASE_URL}/api/orchestration/production/{TEST_EVENT_ID}", json={
            "event_id": TEST_EVENT_ID,
            "assets": [
                {
                    "asset_id": test_asset_id,
                    "name": "TEST_Tables",
                    "category": "furniture",
                    "quantity": 10,
                    "status": "confirmed",
                    "source": "Rental Company",
                    "notes": "Test notes"
                }
            ],
            "checklists": [
                {
                    "item_id": test_checklist_id,
                    "name": "TEST_Verify table delivery",
                    "category": "logistics",
                    "completed": False
                }
            ],
            "packing_list": [],
            "preparation_status": "in_progress"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["assets"]) == 1
        assert data["assets"][0]["name"] == "TEST_Tables"
        assert data["preparation_status"] == "in_progress"
        print("✓ Production assets updated")


class TestEventCalendar:
    """Test Event Calendar tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_calendar(self, session):
        """GET /api/orchestration/calendar - Get events calendar"""
        response = session.get(f"{BASE_URL}/api/orchestration/calendar")
        assert response.status_code == 200
        
        data = response.json()
        assert "events" in data
        assert "conflicts" in data
        print(f"✓ Got calendar with {len(data['events'])} events and {len(data['conflicts'])} conflict dates")
    
    def test_get_calendar_with_date_filter(self, session):
        """GET /api/orchestration/calendar with date filter"""
        response = session.get(
            f"{BASE_URL}/api/orchestration/calendar?start_date=2025-01-01&end_date=2025-12-31"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "events" in data
        print(f"✓ Got filtered calendar with {len(data['events'])} events in 2025")


class TestPostEventReview:
    """Test Post-Event Review tab endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_get_review(self, session):
        """GET /api/orchestration/review/{event_id} - Get post-event review"""
        response = session.get(f"{BASE_URL}/api/orchestration/review/{TEST_EVENT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "event_id" in data
        assert "what_worked" in data
        assert "what_failed" in data
        assert "learnings" in data
        assert "rating" in data
        assert "is_locked" in data
        print("✓ Got post-event review")
    
    def test_update_review(self, session):
        """PUT /api/orchestration/review/{event_id} - Update post-event review"""
        # First check if review is locked
        get_response = session.get(f"{BASE_URL}/api/orchestration/review/{TEST_EVENT_ID}")
        if get_response.json().get("is_locked"):
            pytest.skip("Review is locked, cannot update")
        
        response = session.put(f"{BASE_URL}/api/orchestration/review/{TEST_EVENT_ID}", json={
            "event_id": TEST_EVENT_ID,
            "what_worked": ["TEST_Good communication", "TEST_On-time delivery"],
            "what_failed": ["TEST_Minor delay in setup"],
            "deviations": [{"id": 1, "planned": "10 tables", "actual": "8 tables", "reason": "Space constraint"}],
            "learnings": ["TEST_Always confirm table count 2 days before"],
            "client_feedback": "TEST_Client was happy",
            "team_feedback": "TEST_Team worked well together",
            "rating": 4,
            "is_locked": False
        })
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["what_worked"]) == 2
        assert data["rating"] == 4
        print("✓ Post-event review updated")
        
        # Verify persistence
        get_response = session.get(f"{BASE_URL}/api/orchestration/review/{TEST_EVENT_ID}")
        assert get_response.status_code == 200
        assert get_response.json()["rating"] == 4
        print("✓ Post-event review persistence verified")


class TestOrchestrationErrors:
    """Test error handling for orchestration endpoints"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        login_response = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        return s
    
    def test_invalid_event_id(self, session):
        """Test 404 for invalid event ID"""
        response = session.get(f"{BASE_URL}/api/orchestration/blueprint/invalid_event_id_12345")
        assert response.status_code == 404
        print("✓ 404 returned for invalid event ID")
    
    def test_invalid_template(self, session):
        """Test 400 for invalid template key"""
        response = session.post(
            f"{BASE_URL}/api/orchestration/run-of-show/{TEST_EVENT_ID}/apply-template?template_key=invalid_template"
        )
        assert response.status_code == 400
        print("✓ 400 returned for invalid template key")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
