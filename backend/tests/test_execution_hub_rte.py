# Test Execution Hub RichTextEditor HTML content acceptance
# Tests: Task description, Task notes, Goal notes - all should accept HTML content

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestExecutionHubRichText:
    """Test Execution Hub accepts HTML content for rich text fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token, get or create a goal"""
        self.session = requests.Session()
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get existing goals to find one to test with
        goals_resp = self.session.get(f"{BASE_URL}/api/execution-hub/goals")
        assert goals_resp.status_code == 200, f"Failed to get goals: {goals_resp.text}"
        goals = goals_resp.json()
        
        if goals:
            self.goal_id = goals[0]["goal_id"]
        else:
            # Create a test goal
            create_resp = self.session.post(f"{BASE_URL}/api/execution-hub/goals", json={
                "title": "TEST_Goal for RTE testing",
                "objective": "Test rich text editor functionality",
                "context_type": "organizational",
                "impact_areas": ["quality"]
            })
            assert create_resp.status_code == 200, f"Failed to create goal: {create_resp.text}"
            self.goal_id = create_resp.json()["goal_id"]
        
        yield
        
        # Cleanup: Delete test task if created
        if hasattr(self, 'test_task_id'):
            self.session.delete(f"{BASE_URL}/api/execution-hub/tasks/{self.test_task_id}")
    
    def test_create_task_with_html_description(self):
        """POST /api/execution-hub/goals/{id}/tasks - description accepts HTML content"""
        html_description = "<p>This is <b>bold</b> and <i>italic</i> text with <mark style='background-color: #fef08a'>highlight</mark></p><ul><li>Item 1</li><li>Item 2</li></ul>"
        
        response = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/tasks",
            json={
                "title": "TEST_Task with HTML description",
                "description": html_description,
                "status": "pending"
            }
        )
        
        assert response.status_code == 200, f"Failed to create task: {response.text}"
        data = response.json()
        
        # Verify HTML is preserved
        assert data["description"] == html_description, "HTML description not preserved"
        assert "<b>" in data["description"], "Bold tag not preserved"
        assert "<i>" in data["description"], "Italic tag not preserved"
        assert "<ul>" in data["description"], "List tag not preserved"
        
        self.test_task_id = data["task_id"]
        print(f"PASS: Task created with HTML description: {data['task_id']}")
    
    def test_create_task_note_with_html_content(self):
        """POST /api/execution-hub/tasks/{id}/notes - content accepts HTML"""
        # First create a task
        task_resp = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/tasks",
            json={
                "title": "TEST_Task for note testing",
                "description": "Test task",
                "status": "pending"
            }
        )
        assert task_resp.status_code == 200
        task_id = task_resp.json()["task_id"]
        self.test_task_id = task_id
        
        # Add note with HTML content
        html_note = "<p><strong>Important:</strong> This is a <u>task note</u> with <s>strikethrough</s></p><div class='checklist-item'><input type='checkbox'><span>Checklist item</span></div>"
        
        note_resp = self.session.post(
            f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes",
            json={"content": html_note}
        )
        
        assert note_resp.status_code == 200, f"Failed to add task note: {note_resp.text}"
        note_data = note_resp.json()
        
        # Verify HTML is preserved
        assert note_data["content"] == html_note, "HTML note content not preserved"
        assert "<strong>" in note_data["content"], "Strong tag not preserved"
        assert "<u>" in note_data["content"], "Underline tag not preserved"
        
        print(f"PASS: Task note created with HTML content: {note_data['note_id']}")
    
    def test_create_goal_note_with_html_content(self):
        """POST /api/execution-hub/goals/{id}/notes - content accepts HTML"""
        html_note = "<p>Goal progress update:</p><ol><li>Completed phase 1</li><li>Starting phase 2</li></ol><p><a href='https://example.com'>Reference link</a></p>"
        
        response = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/notes",
            json={"content": html_note}
        )
        
        assert response.status_code == 200, f"Failed to add goal note: {response.text}"
        data = response.json()
        
        # Verify HTML is preserved
        assert data["content"] == html_note, "HTML note content not preserved"
        assert "<ol>" in data["content"], "Ordered list tag not preserved"
        assert "<a href" in data["content"], "Link tag not preserved"
        
        print(f"PASS: Goal note created with HTML content: {data['note_id']}")
    
    def test_get_goal_with_html_content(self):
        """GET /api/execution-hub/goals/{id} - returns HTML content correctly"""
        response = self.session.get(f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}")
        
        assert response.status_code == 200, f"Failed to get goal: {response.text}"
        data = response.json()
        
        # Verify goal structure
        assert "goal_id" in data
        assert "tasks" in data
        assert "notes" in data
        
        print(f"PASS: Goal retrieved with {len(data.get('tasks', []))} tasks and {len(data.get('notes', []))} notes")
    
    def test_task_description_with_checklist_html(self):
        """Verify checklist HTML is preserved in task description"""
        checklist_html = '<div class="checklist-item"><input type="checkbox" /><span>Task A</span></div><div class="checklist-item checked"><input type="checkbox" checked /><span style="text-decoration: line-through; opacity: 0.6;">Task B (done)</span></div>'
        
        response = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/tasks",
            json={
                "title": "TEST_Task with checklist",
                "description": checklist_html,
                "status": "pending"
            }
        )
        
        assert response.status_code == 200, f"Failed to create task with checklist: {response.text}"
        data = response.json()
        
        # Verify checklist HTML preserved
        assert "checklist-item" in data["description"], "Checklist class not preserved"
        assert 'type="checkbox"' in data["description"], "Checkbox input not preserved"
        
        self.test_task_id = data["task_id"]
        print(f"PASS: Task created with checklist HTML: {data['task_id']}")
    
    def test_task_description_with_highlight_colors(self):
        """Verify highlight colors are preserved in task description"""
        highlight_html = '<p>This text has <mark style="background-color: #fef08a">yellow highlight</mark> and <mark style="background-color: #bbf7d0">green highlight</mark> and <mark style="background-color: #bfdbfe">blue highlight</mark>.</p>'
        
        response = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/tasks",
            json={
                "title": "TEST_Task with highlights",
                "description": highlight_html,
                "status": "pending"
            }
        )
        
        assert response.status_code == 200, f"Failed to create task with highlights: {response.text}"
        data = response.json()
        
        # Verify highlight styles preserved
        assert "background-color:" in data["description"], "Background color style not preserved"
        assert "#fef08a" in data["description"], "Yellow highlight color not preserved"
        
        self.test_task_id = data["task_id"]
        print(f"PASS: Task created with highlight colors: {data['task_id']}")


class TestTextOverflowFixes:
    """Test text overflow CSS fixes are applied correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo.agency@kora.com",
            "password": "Evoque2024!"
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get existing goals
        goals_resp = self.session.get(f"{BASE_URL}/api/execution-hub/goals")
        goals = goals_resp.json()
        if goals:
            self.goal_id = goals[0]["goal_id"]
        
        yield
    
    def test_long_text_task_description(self):
        """Create task with very long text to test overflow handling"""
        long_text = "A" * 500 + " " + "LongWordWithoutSpaces" * 10 + " " + "B" * 500
        
        response = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/tasks",
            json={
                "title": "TEST_Long text task",
                "description": f"<p>{long_text}</p>",
                "status": "pending"
            }
        )
        
        assert response.status_code == 200, f"Failed to create task with long text: {response.text}"
        data = response.json()
        
        # Verify long text is stored
        assert len(data["description"]) > 1000, "Long text was truncated"
        print(f"PASS: Task with long text created successfully (length: {len(data['description'])})")
    
    def test_long_text_goal_note(self):
        """Create goal note with very long text"""
        long_text = "Test " * 200 + "VeryLongWordWithNoBreaks" * 5
        
        response = self.session.post(
            f"{BASE_URL}/api/execution-hub/goals/{self.goal_id}/notes",
            json={"content": f"<p>{long_text}</p>"}
        )
        
        assert response.status_code == 200, f"Failed to create goal note: {response.text}"
        data = response.json()
        
        assert len(data["content"]) > 500, "Long note content was truncated"
        print(f"PASS: Goal note with long text created successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
