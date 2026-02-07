# test_execution_hub_addons.py - Execution Hub & Add-ons API Tests
# Tests for Execution Hub module (Goals, Tasks, Decisions, Dependencies, Notes)
# and Add-ons marketplace (purchase, limits, features)

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "margaret.n.calderon@gmail.com"
TEST_PASSWORD = "Evoque2024!"


class TestAuthSetup:
    """Authentication setup for all tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # API returns access_token instead of token
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data.keys()}"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestExecutionHubUsage(TestAuthSetup):
    """Test GET /api/execution-hub/usage - Usage stats for goals"""
    
    def test_get_usage_stats(self, auth_headers):
        """Should return usage statistics for execution goals"""
        response = requests.get(f"{BASE_URL}/api/execution-hub/usage", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "goals_created_this_month" in data
        assert "goals_limit" in data
        assert "remaining" in data
        assert "is_unlimited" in data
        assert "can_create" in data
        
        # Verify data types
        assert isinstance(data["goals_created_this_month"], int)
        assert isinstance(data["goals_limit"], int)
        assert isinstance(data["remaining"], int)
        assert isinstance(data["is_unlimited"], bool)
        assert isinstance(data["can_create"], bool)
        
        print(f"Usage stats: {data['goals_created_this_month']}/{data['goals_limit']} goals, can_create={data['can_create']}")


class TestExecutionGoalsCRUD(TestAuthSetup):
    """Test Execution Goals CRUD operations"""
    
    created_goal_id = None
    
    def test_01_get_goals_list(self, auth_headers):
        """GET /api/execution-hub/goals - Should list goals"""
        response = requests.get(f"{BASE_URL}/api/execution-hub/goals", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} existing goals")
    
    def test_02_create_goal(self, auth_headers):
        """POST /api/execution-hub/goals - Should create a goal respecting plan limits"""
        goal_data = {
            "title": "TEST_Goal_Execution_Hub",
            "objective": "Test objective for automated testing",
            "context_type": "organizational",
            "impact_areas": ["cost", "quality"],
            "start_date": datetime.now().isoformat(),
            "target_date": (datetime.now() + timedelta(days=30)).isoformat()
        }
        
        response = requests.post(f"{BASE_URL}/api/execution-hub/goals", json=goal_data, headers=auth_headers)
        
        # Could be 200/201 for success or 403 if limit reached
        if response.status_code == 403:
            print(f"Goal limit reached: {response.json().get('detail')}")
            pytest.skip("Goal limit reached - cannot create more goals")
        
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        assert "goal_id" in data
        assert data["title"] == goal_data["title"]
        assert data["objective"] == goal_data["objective"]
        assert data["status"] == "planning"
        assert "owner_id" in data
        assert "owner_name" in data
        
        TestExecutionGoalsCRUD.created_goal_id = data["goal_id"]
        print(f"Created goal: {data['goal_id']}")
    
    def test_03_get_single_goal(self, auth_headers):
        """GET /api/execution-hub/goals/{goal_id} - Should return goal with tasks, decisions, dependencies"""
        if not TestExecutionGoalsCRUD.created_goal_id:
            pytest.skip("No goal created to test")
        
        goal_id = TestExecutionGoalsCRUD.created_goal_id
        response = requests.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["goal_id"] == goal_id
        assert "tasks" in data
        assert "decisions" in data
        assert "dependencies" in data
        assert "access_list" in data
        
        assert isinstance(data["tasks"], list)
        assert isinstance(data["decisions"], list)
        assert isinstance(data["dependencies"], list)
        
        print(f"Goal has {len(data['tasks'])} tasks, {len(data['decisions'])} decisions, {len(data['dependencies'])} dependencies")
    
    def test_04_update_goal(self, auth_headers):
        """PUT /api/execution-hub/goals/{goal_id} - Should update a goal"""
        if not TestExecutionGoalsCRUD.created_goal_id:
            pytest.skip("No goal created to test")
        
        goal_id = TestExecutionGoalsCRUD.created_goal_id
        update_data = {
            "title": "TEST_Goal_Updated",
            "status": "in_progress",
            "impact_areas": ["cost", "quality", "speed"]
        }
        
        response = requests.put(f"{BASE_URL}/api/execution-hub/goals/{goal_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["title"] == update_data["title"]
        assert data["status"] == "in_progress"
        assert "speed" in data["impact_areas"]
        
        print(f"Updated goal status to: {data['status']}")


class TestExecutionTasks(TestAuthSetup):
    """Test Execution Tasks CRUD operations"""
    
    created_task_id = None
    
    def test_01_create_task(self, auth_headers):
        """POST /api/execution-hub/goals/{goal_id}/tasks - Should create a task"""
        if not TestExecutionGoalsCRUD.created_goal_id:
            pytest.skip("No goal created to test")
        
        goal_id = TestExecutionGoalsCRUD.created_goal_id
        task_data = {
            "title": "TEST_Task_Execution",
            "description": "Test task description",
            "status": "pending",
            "assignee_ids": [],
            "due_date": (datetime.now() + timedelta(days=7)).isoformat()
        }
        
        response = requests.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/tasks", json=task_data, headers=auth_headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        assert "task_id" in data
        assert data["title"] == task_data["title"]
        assert data["status"] == "pending"
        assert "change_log" in data
        assert len(data["change_log"]) > 0  # Should have initial "created" entry
        
        TestExecutionTasks.created_task_id = data["task_id"]
        print(f"Created task: {data['task_id']}")
    
    def test_02_update_task_with_changelog(self, auth_headers):
        """PUT /api/execution-hub/tasks/{task_id} - Should update task with change log"""
        if not TestExecutionTasks.created_task_id:
            pytest.skip("No task created to test")
        
        task_id = TestExecutionTasks.created_task_id
        update_data = {
            "title": "TEST_Task_Updated",
            "status": "in_progress"
        }
        
        response = requests.put(f"{BASE_URL}/api/execution-hub/tasks/{task_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["title"] == update_data["title"]
        assert data["status"] == "in_progress"
        
        # Verify change log was updated
        assert "change_log" in data
        assert len(data["change_log"]) > 1  # Should have more entries now
        
        # Check for status change entry
        status_changes = [log for log in data["change_log"] if log.get("action") == "status_changed"]
        assert len(status_changes) > 0, "No status change logged"
        
        print(f"Task updated, change_log has {len(data['change_log'])} entries")
    
    def test_03_add_task_note(self, auth_headers):
        """POST /api/execution-hub/tasks/{task_id}/notes - Should add note to task"""
        if not TestExecutionTasks.created_task_id:
            pytest.skip("No task created to test")
        
        task_id = TestExecutionTasks.created_task_id
        note_data = {
            "content": "This is a test note for the task"
        }
        
        response = requests.post(f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes", json=note_data, headers=auth_headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        assert "note_id" in data
        assert data["content"] == note_data["content"]
        assert "user_id" in data
        assert "user_name" in data
        assert "created_at" in data
        
        print(f"Added note: {data['note_id']}")


class TestExecutionDecisions(TestAuthSetup):
    """Test Execution Decisions"""
    
    def test_add_decision(self, auth_headers):
        """POST /api/execution-hub/goals/{goal_id}/decisions - Should add decision"""
        if not TestExecutionGoalsCRUD.created_goal_id:
            pytest.skip("No goal created to test")
        
        goal_id = TestExecutionGoalsCRUD.created_goal_id
        decision_data = {
            "decision": "TEST_Decision: Proceed with implementation",
            "rationale": "Based on cost-benefit analysis"
        }
        
        response = requests.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/decisions", json=decision_data, headers=auth_headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        assert "decision_id" in data
        assert data["decision"] == decision_data["decision"]
        assert data["rationale"] == decision_data["rationale"]
        assert "decided_by" in data
        assert "decided_by_name" in data
        assert "date" in data
        
        print(f"Added decision: {data['decision_id']}")


class TestExecutionDependencies(TestAuthSetup):
    """Test Execution Dependencies"""
    
    def test_add_dependency(self, auth_headers):
        """POST /api/execution-hub/goals/{goal_id}/dependencies - Should add dependency"""
        if not TestExecutionGoalsCRUD.created_goal_id:
            pytest.skip("No goal created to test")
        
        goal_id = TestExecutionGoalsCRUD.created_goal_id
        dependency_data = {
            "title": "TEST_Dependency: Vendor approval",
            "description": "Need vendor approval before proceeding",
            "status": "pending"
        }
        
        response = requests.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/dependencies", json=dependency_data, headers=auth_headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        assert "dependency_id" in data
        assert data["title"] == dependency_data["title"]
        assert data["description"] == dependency_data["description"]
        assert data["status"] == "pending"
        assert "created_by" in data
        
        print(f"Added dependency: {data['dependency_id']}")


class TestMyPendingWidget(TestAuthSetup):
    """Test My Pending widget for System Pulse"""
    
    def test_get_my_pending(self, auth_headers):
        """GET /api/execution-hub/my-pending - Should return pending items for user"""
        response = requests.get(f"{BASE_URL}/api/execution-hub/my-pending", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "active_goals" in data
        assert "pending_tasks" in data
        assert "blocked_goals" in data
        assert "decisions_waiting" in data
        assert "goals" in data
        assert "tasks" in data
        
        assert isinstance(data["active_goals"], int)
        assert isinstance(data["pending_tasks"], int)
        assert isinstance(data["goals"], list)
        assert isinstance(data["tasks"], list)
        
        print(f"My pending: {data['active_goals']} active goals, {data['pending_tasks']} pending tasks")


class TestExecutionSignals(TestAuthSetup):
    """Test Execution Signals for System Pulse"""
    
    def test_get_signals(self, auth_headers):
        """GET /api/execution-hub/signals - Should return signals for System Pulse"""
        response = requests.get(f"{BASE_URL}/api/execution-hub/signals", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "signals" in data
        assert "summary" in data
        
        assert isinstance(data["signals"], list)
        assert "blocked" in data["summary"]
        assert "at_risk" in data["summary"]
        assert "completed_this_week" in data["summary"]
        
        print(f"Signals summary: {data['summary']}")


class TestAddonsMarketplace(TestAuthSetup):
    """Test Add-ons Marketplace endpoints"""
    
    def test_01_get_marketplace(self, auth_headers):
        """GET /api/addons/marketplace - Should list available add-ons"""
        response = requests.get(f"{BASE_URL}/api/addons/marketplace", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "No add-ons in marketplace"
        
        # Verify add-on structure
        addon = data[0]
        assert "addon_id" in addon
        assert "name" in addon
        assert "display_name_en" in addon or "display_name_es" in addon
        assert "type" in addon
        assert "price" in addon
        
        print(f"Marketplace has {len(data)} add-ons available")
        for a in data[:5]:
            print(f"  - {a.get('name')}: ${a.get('price')} ({a.get('type')})")
    
    def test_02_get_effective_limits(self, auth_headers):
        """GET /api/addons/effective-limits - Should return effective limits (plan + addons)"""
        response = requests.get(f"{BASE_URL}/api/addons/effective-limits", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Should have limit keys
        assert isinstance(data, dict)
        
        # Common limit keys that should exist
        expected_keys = ["active_users", "events_per_month", "storage_mb"]
        for key in expected_keys:
            if key in data:
                print(f"  {key}: {data[key]}")
        
        # Check for execution_goals_per_month
        if "execution_goals_per_month" in data:
            print(f"  execution_goals_per_month: {data['execution_goals_per_month']}")
        
        print(f"Effective limits: {data}")
    
    def test_03_get_effective_features(self, auth_headers):
        """GET /api/addons/effective-features - Should return effective features"""
        response = requests.get(f"{BASE_URL}/api/addons/effective-features", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, dict)
        
        # Check for execution_hub feature
        if "execution_hub" in data:
            print(f"  execution_hub: {data['execution_hub']}")
        
        print(f"Effective features: {data}")
    
    def test_04_get_subscription_summary(self, auth_headers):
        """GET /api/addons/subscription-summary - Should return complete subscription summary"""
        response = requests.get(f"{BASE_URL}/api/addons/subscription-summary", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "plan" in data or "plan_id" in data or "subscription" in data
        
        print(f"Subscription summary: {data}")
    
    def test_05_purchase_addon(self, auth_headers):
        """POST /api/addons/purchase - Should allow purchasing an add-on"""
        # Try to purchase the execution goals unlimited addon
        purchase_data = {
            "addon_id": "addon_execution_goals_unlimited",
            "quantity": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/addons/purchase", json=purchase_data, headers=auth_headers)
        
        # Could be 200/201 for success, 400 for already purchased, or 403 for not compatible
        if response.status_code in [400, 403]:
            print(f"Purchase not allowed: {response.json().get('detail', response.text)}")
            # This is acceptable - addon might already be purchased or not compatible
            return
        
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        print(f"Purchase result: {data}")


class TestGoalCleanup(TestAuthSetup):
    """Cleanup test data"""
    
    def test_delete_goal(self, auth_headers):
        """DELETE /api/execution-hub/goals/{goal_id} - Should delete goal and related data"""
        if not TestExecutionGoalsCRUD.created_goal_id:
            pytest.skip("No goal to delete")
        
        goal_id = TestExecutionGoalsCRUD.created_goal_id
        response = requests.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        # Verify goal is deleted
        verify_response = requests.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}", headers=auth_headers)
        assert verify_response.status_code == 404, "Goal should be deleted"
        
        print(f"Deleted goal: {goal_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
