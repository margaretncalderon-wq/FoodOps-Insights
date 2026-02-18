"""
Test: Send to Execution Hub from Event
Features:
- GET /api/execution-hub/default-tasks/{industry} - returns default tasks for an industry
- POST /api/execution-hub/from-event/{event_id} - creates Goal and Tasks from an event
- Duplicate goal rejection when event already has execution_goal_id
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestExecutionHubFromEvent:
    """Test suite for Send to Execution Hub from Event feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session"""
        self.session = requests.Session()
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"},
            timeout=30
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.auth_token = login_res.json().get("access_token")
        yield
        self.session.close()
    
    # Test GET /api/execution-hub/default-tasks/{industry}
    def test_get_default_tasks_events_hospitality(self):
        """Test default tasks for events_hospitality industry (6 tasks)"""
        res = self.session.get(
            f"{BASE_URL}/api/execution-hub/default-tasks/events_hospitality",
            timeout=30
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["industry"] == "events_hospitality"
        assert len(data["tasks"]) == 6
        # Verify task structure
        for task in data["tasks"]:
            assert "title" in task
            assert "order" in task
        print(f"PASS: GET default-tasks/events_hospitality - 6 tasks returned")
    
    def test_get_default_tasks_professional_services(self):
        """Test default tasks for professional_services industry (6 tasks)"""
        res = self.session.get(
            f"{BASE_URL}/api/execution-hub/default-tasks/professional_services",
            timeout=30
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["industry"] == "professional_services"
        assert len(data["tasks"]) == 6
        print(f"PASS: GET default-tasks/professional_services - 6 tasks returned")
    
    def test_get_default_tasks_generic(self):
        """Test default tasks for generic industry (5 tasks)"""
        res = self.session.get(
            f"{BASE_URL}/api/execution-hub/default-tasks/generic",
            timeout=30
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["industry"] == "generic"
        assert len(data["tasks"]) == 5
        print(f"PASS: GET default-tasks/generic - 5 tasks returned")
    
    def test_get_default_tasks_unknown_falls_back_to_generic(self):
        """Test unknown industry falls back to generic tasks"""
        res = self.session.get(
            f"{BASE_URL}/api/execution-hub/default-tasks/unknown_industry",
            timeout=30
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["industry"] == "unknown_industry"
        # Should return generic tasks (5)
        assert len(data["tasks"]) == 5
        print(f"PASS: GET default-tasks/unknown_industry - falls back to generic (5 tasks)")
    
    # Test POST /api/execution-hub/from-event/{event_id}
    def test_create_goal_from_event_with_committed_event(self):
        """Test creating execution goal from committed event"""
        # First find an event that is Committed and has no execution_goal_id
        events_res = self.session.get(f"{BASE_URL}/api/events", timeout=30)
        assert events_res.status_code == 200
        events = events_res.json()
        
        # Find the committed event without execution_goal_id
        committed_event = None
        for ev in events:
            if ev.get("stage") == "Committed" and not ev.get("execution_goal_id"):
                committed_event = ev
                break
        
        if not committed_event:
            pytest.skip("No committed event without execution_goal_id found for testing")
        
        event_id = committed_event["event_id"]
        event_name = committed_event["name"]
        
        # Create goal with custom tasks
        payload = {
            "title": f"TEST_Ejecutar: {event_name}",
            "objective": f"Completar exitosamente: {event_name}",
            "tasks": [
                {"title": "Tarea de prueba 1", "description": "Descripción 1"},
                {"title": "Tarea de prueba 2", "description": "Descripción 2"},
                {"title": "Tarea de prueba 3", "description": ""}
            ],
            "impact_areas": ["quality", "speed"]
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/execution-hub/from-event/{event_id}",
            json=payload,
            timeout=30
        )
        
        # Could be 200 or 403 (limit reached) or 400 (already exists)
        if res.status_code == 403:
            print(f"SKIP: Goal limit reached - cannot create more goals this month")
            pytest.skip("Goal limit reached")
        
        if res.status_code == 400 and "ya existe" in res.json().get("detail", "").lower():
            print(f"SKIP: Goal already exists for this event")
            pytest.skip("Goal already exists for this event")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert "goal" in data
        assert "tasks" in data
        assert "message" in data
        
        goal = data["goal"]
        tasks = data["tasks"]
        
        # Verify goal structure
        assert goal["title"] == payload["title"]
        assert goal["objective"] == payload["objective"]
        assert goal["context_type"] == "event"
        assert goal["context_id"] == event_id
        assert goal["status"] == "planning"
        assert "goal_id" in goal
        
        # Verify tasks created
        assert len(tasks) == 3
        for task in tasks:
            assert "task_id" in task
            assert "goal_id" in task
            assert task["goal_id"] == goal["goal_id"]
            assert task["status"] == "pending"
        
        print(f"PASS: POST from-event/{event_id} - Goal and {len(tasks)} tasks created")
        
        # Store goal_id for cleanup
        self.created_goal_id = goal["goal_id"]
        
        # Verify event was updated with execution_goal_id
        event_res = self.session.get(f"{BASE_URL}/api/events/{event_id}", timeout=30)
        assert event_res.status_code == 200
        updated_event = event_res.json()
        assert updated_event.get("execution_goal_id") == goal["goal_id"]
        print(f"PASS: Event updated with execution_goal_id: {goal['goal_id']}")
        
        return goal["goal_id"], event_id
    
    def test_duplicate_goal_rejection(self):
        """Test that creating a goal for an event that already has one is rejected"""
        # First find an event that already has execution_goal_id
        events_res = self.session.get(f"{BASE_URL}/api/events", timeout=30)
        assert events_res.status_code == 200
        events = events_res.json()
        
        # Find event with existing execution_goal_id
        event_with_goal = None
        for ev in events:
            if ev.get("execution_goal_id"):
                event_with_goal = ev
                break
        
        if not event_with_goal:
            pytest.skip("No event with existing execution_goal_id found")
        
        event_id = event_with_goal["event_id"]
        
        payload = {
            "title": "Test duplicate goal",
            "objective": "Should fail",
            "tasks": [{"title": "Task 1"}]
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/execution-hub/from-event/{event_id}",
            json=payload,
            timeout=30
        )
        
        # Should return 400 with message about existing goal
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        detail = res.json().get("detail", "")
        assert "ya existe" in detail.lower() or "already exists" in detail.lower()
        print(f"PASS: Duplicate goal creation correctly rejected with 400")
    
    def test_create_goal_from_nonexistent_event(self):
        """Test creating goal from non-existent event returns 404"""
        payload = {
            "title": "Test goal",
            "objective": "Should fail",
            "tasks": [{"title": "Task 1"}]
        }
        
        res = self.session.post(
            f"{BASE_URL}/api/execution-hub/from-event/nonexistent_event_123",
            json=payload,
            timeout=30
        )
        
        assert res.status_code == 404, f"Expected 404, got {res.status_code}: {res.text}"
        print(f"PASS: Non-existent event returns 404")


class TestExecutionHubGoalsAPI:
    """Test Execution Hub Goals CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session"""
        self.session = requests.Session()
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "margaret.n.calderon@gmail.com", "password": "Evoque2024!"},
            timeout=30
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        yield
        self.session.close()
    
    def test_get_execution_hub_usage(self):
        """Test getting Execution Hub usage stats"""
        res = self.session.get(f"{BASE_URL}/api/execution-hub/usage", timeout=30)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "goals_created_this_month" in data
        assert "goals_limit" in data
        assert "remaining" in data
        assert "can_create" in data
        print(f"PASS: GET /execution-hub/usage - usage stats retrieved")
    
    def test_get_execution_goals_list(self):
        """Test getting list of execution goals"""
        res = self.session.get(f"{BASE_URL}/api/execution-hub/goals", timeout=30)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        goals = res.json()
        assert isinstance(goals, list)
        print(f"PASS: GET /execution-hub/goals - {len(goals)} goals returned")
        return goals


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
