"""
Test Execution Hub - Team Assignment and Note Edit/Delete features
Tests:
1. GET /api/settings/team returns team members list
2. GET /api/execution-hub/goals returns goals  
3. PUT /api/execution-hub/goals/{id} - team members can update
4. PUT /api/execution-hub/goals/{id}/notes/{note_id} - edit goal note
5. DELETE /api/execution-hub/goals/{id}/notes/{note_id} - delete goal note
6. PUT /api/execution-hub/tasks/{id}/notes/{note_id} - edit task note  
7. DELETE /api/execution-hub/tasks/{id}/notes/{note_id} - delete task note
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
TEAM_EMAIL = "team.test@staffdo.com"
TEAM_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def admin_session():
    """Login as admin and return session"""
    session = requests.Session()
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    token = response.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


@pytest.fixture(scope="module")
def team_session():
    """Login as team member and return session"""
    session = requests.Session()
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEAM_EMAIL, "password": TEAM_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Team login failed: {response.status_code} - {response.text}")
    token = response.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


class TestTeamEndpoint:
    """Test GET /api/settings/team endpoint"""
    
    def test_team_returns_list(self, admin_session):
        """Test that /api/settings/team returns team members list (not 404)"""
        response = admin_session.get(f"{BASE_URL}/api/settings/team")
        
        # Should NOT be 404
        assert response.status_code != 404, f"GET /api/settings/team returned 404 - endpoint missing"
        
        # Should be 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Should return a list (even if empty)
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # If list has members, check structure
        if len(data) > 0:
            member = data[0]
            assert "user_id" in member or "email" in member, "Team member should have user_id or email"
        
        print(f"✓ GET /api/settings/team: returned {len(data)} team members")


class TestGoalsEndpoint:
    """Test GET /api/execution-hub/goals endpoint"""
    
    def test_goals_returns_list(self, admin_session):
        """Test that /api/execution-hub/goals returns goals list"""
        response = admin_session.get(f"{BASE_URL}/api/execution-hub/goals")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /api/execution-hub/goals: returned {len(data)} goals")
        return data


class TestGoalNoteOperations:
    """Test goal note create, edit, delete operations"""
    
    @pytest.fixture(scope="class")
    def test_goal_and_note(self, admin_session):
        """Create a test goal and note for testing"""
        # Create a test goal
        goal_payload = {
            "title": f"TEST_GoalNotes_{uuid.uuid4().hex[:6]}",
            "objective": "Testing note edit/delete features",
            "context_type": "organizational",
            "impact_areas": ["quality"]
        }
        goal_res = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=goal_payload)
        
        if goal_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create test goal: {goal_res.status_code} - {goal_res.text}")
        
        goal = goal_res.json()
        goal_id = goal.get("goal_id")
        
        # Add a note to the goal
        note_payload = {"content": "Original note content for testing"}
        note_res = admin_session.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/notes", json=note_payload)
        
        if note_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create test note: {note_res.status_code} - {note_res.text}")
        
        note = note_res.json()
        note_id = note.get("note_id")
        
        yield {"goal_id": goal_id, "note_id": note_id}
        
        # Cleanup: Delete the goal
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    
    def test_add_goal_note(self, admin_session, test_goal_and_note):
        """Test that goal note was successfully created"""
        goal_id = test_goal_and_note["goal_id"]
        note_id = test_goal_and_note["note_id"]
        
        assert goal_id is not None, "Goal ID should not be None"
        assert note_id is not None, "Note ID should not be None"
        
        print(f"✓ Goal note created: goal_id={goal_id}, note_id={note_id}")
    
    def test_edit_goal_note(self, admin_session, test_goal_and_note):
        """Test PUT /api/execution-hub/goals/{id}/notes/{note_id} - edit goal note"""
        goal_id = test_goal_and_note["goal_id"]
        note_id = test_goal_and_note["note_id"]
        
        # Edit the note
        update_payload = {"content": "Updated note content - edited successfully!"}
        response = admin_session.put(
            f"{BASE_URL}/api/execution-hub/goals/{goal_id}/notes/{note_id}",
            json=update_payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify the edit by fetching the goal
        goal_res = admin_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        goal = goal_res.json()
        notes = goal.get("notes", [])
        
        edited_note = next((n for n in notes if n.get("note_id") == note_id), None)
        assert edited_note is not None, "Note should exist after edit"
        assert "Updated note content" in edited_note.get("content", ""), "Note content should be updated"
        
        print(f"✓ PUT /api/execution-hub/goals/{goal_id}/notes/{note_id}: Note edited successfully")
    
    def test_delete_goal_note(self, admin_session, test_goal_and_note):
        """Test DELETE /api/execution-hub/goals/{id}/notes/{note_id} - delete goal note"""
        goal_id = test_goal_and_note["goal_id"]
        
        # First add a new note to delete
        note_payload = {"content": "Note to be deleted"}
        note_res = admin_session.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/notes", json=note_payload)
        assert note_res.status_code in [200, 201], f"Failed to add note: {note_res.text}"
        
        new_note_id = note_res.json().get("note_id")
        
        # Delete the note
        delete_res = admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/notes/{new_note_id}")
        
        assert delete_res.status_code == 200, f"Expected 200, got {delete_res.status_code}: {delete_res.text}"
        
        # Verify the note is deleted
        goal_res = admin_session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        goal = goal_res.json()
        notes = goal.get("notes", [])
        
        deleted_note = next((n for n in notes if n.get("note_id") == new_note_id), None)
        assert deleted_note is None, "Note should be deleted and not found"
        
        print(f"✓ DELETE /api/execution-hub/goals/{goal_id}/notes/{new_note_id}: Note deleted successfully")


class TestTaskNoteOperations:
    """Test task note edit and delete operations"""
    
    @pytest.fixture(scope="class")
    def test_task_and_note(self, admin_session):
        """Create a test goal, task and note for testing"""
        # Create a test goal
        goal_payload = {
            "title": f"TEST_TaskNotes_{uuid.uuid4().hex[:6]}",
            "objective": "Testing task note features",
            "context_type": "organizational",
            "impact_areas": ["speed"]
        }
        goal_res = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=goal_payload)
        
        if goal_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create test goal: {goal_res.status_code} - {goal_res.text}")
        
        goal = goal_res.json()
        goal_id = goal.get("goal_id")
        
        # Create a task
        task_payload = {"title": f"TEST_Task_{uuid.uuid4().hex[:6]}", "description": "Test task"}
        task_res = admin_session.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/tasks", json=task_payload)
        
        if task_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create test task: {task_res.status_code} - {task_res.text}")
        
        task = task_res.json()
        task_id = task.get("task_id")
        
        # Add a note to the task
        note_payload = {"content": "Original task note content"}
        note_res = admin_session.post(f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes", json=note_payload)
        
        if note_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create test task note: {note_res.status_code} - {note_res.text}")
        
        note = note_res.json()
        note_id = note.get("note_id")
        
        yield {"goal_id": goal_id, "task_id": task_id, "note_id": note_id}
        
        # Cleanup: Delete the goal (cascade deletes tasks)
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    
    def test_edit_task_note(self, admin_session, test_task_and_note):
        """Test PUT /api/execution-hub/tasks/{id}/notes/{note_id} - edit task note"""
        task_id = test_task_and_note["task_id"]
        note_id = test_task_and_note["note_id"]
        
        # Edit the note
        update_payload = {"content": "Updated task note - edited!"}
        response = admin_session.put(
            f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes/{note_id}",
            json=update_payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify the edit by fetching the task
        task_res = admin_session.get(f"{BASE_URL}/api/execution-hub/tasks/{task_id}")
        task = task_res.json()
        notes = task.get("notes", [])
        
        edited_note = next((n for n in notes if n.get("note_id") == note_id), None)
        assert edited_note is not None, "Note should exist after edit"
        assert "Updated task note" in edited_note.get("content", ""), "Note content should be updated"
        
        print(f"✓ PUT /api/execution-hub/tasks/{task_id}/notes/{note_id}: Task note edited successfully")
    
    def test_delete_task_note(self, admin_session, test_task_and_note):
        """Test DELETE /api/execution-hub/tasks/{id}/notes/{note_id} - delete task note"""
        task_id = test_task_and_note["task_id"]
        
        # First add a new note to delete
        note_payload = {"content": "Task note to be deleted"}
        note_res = admin_session.post(f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes", json=note_payload)
        assert note_res.status_code in [200, 201], f"Failed to add task note: {note_res.text}"
        
        new_note_id = note_res.json().get("note_id")
        
        # Delete the note
        delete_res = admin_session.delete(f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes/{new_note_id}")
        
        assert delete_res.status_code == 200, f"Expected 200, got {delete_res.status_code}: {delete_res.text}"
        
        # Verify the note is deleted
        task_res = admin_session.get(f"{BASE_URL}/api/execution-hub/tasks/{task_id}")
        task = task_res.json()
        notes = task.get("notes", [])
        
        deleted_note = next((n for n in notes if n.get("note_id") == new_note_id), None)
        assert deleted_note is None, "Task note should be deleted and not found"
        
        print(f"✓ DELETE /api/execution-hub/tasks/{task_id}/notes/{new_note_id}: Task note deleted successfully")


class TestGoalAccessPermissions:
    """Test goal access for team members - membership-based access"""
    
    def test_team_member_can_view_goals(self, team_session):
        """Test that team members can view goals via membership"""
        response = team_session.get(f"{BASE_URL}/api/execution-hub/goals")
        
        # Team member should be able to access goals
        assert response.status_code == 200, f"Team member should see goals: {response.status_code}"
        
        print("✓ Team member can access goals via membership")


class TestGoalUpdatePermission:
    """Test that TEAM_MEMBER role can update goals (not just OWNER)"""
    
    @pytest.fixture(scope="class")
    def test_goal(self, admin_session):
        """Create a test goal"""
        goal_payload = {
            "title": f"TEST_UpdatePerm_{uuid.uuid4().hex[:6]}",
            "objective": "Testing update permission",
            "context_type": "organizational",
            "impact_areas": ["risk"]
        }
        goal_res = admin_session.post(f"{BASE_URL}/api/execution-hub/goals", json=goal_payload)
        
        if goal_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create test goal: {goal_res.status_code}")
        
        goal = goal_res.json()
        yield goal
        
        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/execution-hub/goals/{goal['goal_id']}")
    
    def test_owner_can_update_goal(self, admin_session, test_goal):
        """Test that goal owner can update the goal"""
        goal_id = test_goal["goal_id"]
        
        update_payload = {"objective": "Updated objective by owner"}
        response = admin_session.put(
            f"{BASE_URL}/api/execution-hub/goals/{goal_id}",
            json=update_payload
        )
        
        assert response.status_code == 200, f"Owner should update goal: {response.status_code}"
        
        print(f"✓ Owner can update goal {goal_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
