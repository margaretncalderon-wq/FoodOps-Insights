"""
Test Execution Hub File Attachment Feature
Tests:
1. POST /api/execution-hub/upload-attachment - Upload text file
2. POST /api/execution-hub/upload-attachment - Upload image file  
3. POST /api/execution-hub/upload-attachment - Reject unsupported file type
4. GET /api/uploads/exec_attachments/{filename} - Download uploaded file
5. POST /api/execution-hub/goals/{id}/notes with attachments array
6. POST /api/execution-hub/tasks/{id}/notes with attachments array
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://virtual-queue-8.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and get access token"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert res.status_code == 200, f"Login failed: {res.text}"
    data = res.json()
    return data.get("access_token")


@pytest.fixture(scope="module")
def session(auth_token):
    """Create authenticated session with Authorization header"""
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return s


@pytest.fixture(scope="module")
def goal_id(session):
    """Create or get an execution goal for testing"""
    # Get existing goals first
    res = session.get(f"{BASE_URL}/api/execution-hub/goals")
    assert res.status_code == 200
    goals = res.json()
    
    # Look for existing test goal or use first available
    for goal in goals:
        if goal.get("goal_id"):
            return goal["goal_id"]
    
    # Create a new test goal if none exist
    res = session.post(f"{BASE_URL}/api/execution-hub/goals", json={
        "title": "TEST_Attachment_Goal",
        "objective": "Test attachment feature",
        "context_type": "standalone",
        "impact_areas": ["quality"]
    })
    if res.status_code == 200:
        return res.json().get("goal_id")
    elif res.status_code == 403:
        # Goal limit reached, need to use existing
        pytest.skip("No available goals and cannot create more (limit reached)")
    
    raise Exception(f"Could not create goal: {res.text}")


@pytest.fixture(scope="module")
def task_id(session, goal_id):
    """Create or get a task for testing"""
    # Get goal details including tasks
    res = session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
    assert res.status_code == 200
    goal = res.json()
    
    tasks = goal.get("tasks", [])
    if tasks:
        return tasks[0]["task_id"]
    
    # Create a new task
    res = session.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/tasks", json={
        "title": "TEST_Attachment_Task",
        "description": "Task for testing attachments",
        "status": "pending"
    })
    assert res.status_code == 200, f"Task creation failed: {res.text}"
    return res.json().get("task_id")


class TestFileUpload:
    """Tests for file upload endpoint"""
    
    def test_upload_text_file(self, auth_token):
        """Test uploading a text file"""
        # Create a text file in memory
        file_content = b"This is a test text file for attachment testing."
        files = {
            "file": ("test_attachment.txt", io.BytesIO(file_content), "text/plain")
        }
        
        # Use Authorization header for auth
        headers = {"Authorization": f"Bearer {auth_token}"}
        res = requests.post(f"{BASE_URL}/api/execution-hub/upload-attachment", files=files, headers=headers)
        
        assert res.status_code == 200, f"Upload failed: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "file_url" in data, "Response missing file_url"
        assert "filename" in data, "Response missing filename"
        assert "content_type" in data, "Response missing content_type"
        assert "size" in data, "Response missing size"
        assert "is_image" in data, "Response missing is_image"
        
        # Verify values
        assert data["filename"] == "test_attachment.txt"
        assert data["content_type"] == "text/plain"
        assert data["size"] == len(file_content)
        assert data["is_image"] == False
        assert data["file_url"].startswith("/api/uploads/exec_attachments/")
        
        print(f"✓ Text file upload successful: {data['file_url']}")
        return data["file_url"]
    
    def test_upload_image_file(self, auth_token):
        """Test uploading an image file and verify is_image=true"""
        # Create a minimal PNG file (1x1 transparent pixel)
        png_content = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82
        ])
        
        files = {
            "file": ("test_image.png", io.BytesIO(png_content), "image/png")
        }
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        res = requests.post(f"{BASE_URL}/api/execution-hub/upload-attachment", files=files, headers=headers)
        
        assert res.status_code == 200, f"Upload failed: {res.text}"
        data = res.json()
        
        # Verify it's recognized as an image
        assert data["is_image"] == True, f"Image not recognized as is_image: {data}"
        assert data["content_type"] == "image/png"
        assert data["filename"] == "test_image.png"
        
        print(f"✓ Image file upload successful, is_image=True: {data['file_url']}")
        return data["file_url"]
    
    def test_reject_unsupported_file_type(self, auth_token):
        """Test that unsupported file types are rejected"""
        # Create an executable file (not allowed)
        exe_content = b"MZ\x90\x00\x03\x00\x00\x00"  # Minimal PE header
        files = {
            "file": ("malicious.exe", io.BytesIO(exe_content), "application/x-msdownload")
        }
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        res = requests.post(f"{BASE_URL}/api/execution-hub/upload-attachment", files=files, headers=headers)
        
        assert res.status_code == 400, f"Expected 400 for unsupported type, got {res.status_code}"
        data = res.json()
        assert "detail" in data
        print(f"✓ Unsupported file type rejected correctly: {data['detail']}")


class TestFileDownload:
    """Tests for file download endpoint"""
    
    def test_download_uploaded_file(self, auth_token):
        """Test that uploaded files can be downloaded"""
        # First upload a file
        file_content = b"Test content for download verification."
        files = {
            "file": ("download_test.txt", io.BytesIO(file_content), "text/plain")
        }
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        upload_res = requests.post(f"{BASE_URL}/api/execution-hub/upload-attachment", files=files, headers=headers)
        assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
        
        file_url = upload_res.json()["file_url"]
        
        # Download the file (no auth needed for static files)
        download_res = requests.get(f"{BASE_URL}{file_url}")
        
        assert download_res.status_code == 200, f"Download failed: {download_res.status_code}"
        assert download_res.content == file_content, "Downloaded content doesn't match"
        
        print(f"✓ File download successful: {file_url}")
    
    def test_download_nonexistent_file(self, auth_token):
        """Test that nonexistent file returns 404"""
        res = requests.get(f"{BASE_URL}/api/uploads/exec_attachments/nonexistent_file_xyz.txt")
        
        assert res.status_code == 404, f"Expected 404, got {res.status_code}"
        print("✓ Nonexistent file correctly returns 404")


class TestNotesWithAttachments:
    """Tests for notes with attachments"""
    
    def test_goal_note_with_attachments(self, session, goal_id, auth_token):
        """Test adding a goal note with attachments"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Upload a file first
        file_content = b"Attachment for goal note test"
        files = {
            "file": ("goal_note_attachment.txt", io.BytesIO(file_content), "text/plain")
        }
        
        upload_res = requests.post(f"{BASE_URL}/api/execution-hub/upload-attachment", files=files, headers=headers)
        assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
        
        upload_data = upload_res.json()
        
        # Add note with attachment
        note_payload = {
            "content": "TEST_Goal note with attachment",
            "attachments": [{
                "file_url": upload_data["file_url"],
                "filename": upload_data["filename"],
                "content_type": upload_data["content_type"],
                "size": upload_data["size"],
                "is_image": upload_data["is_image"]
            }]
        }
        
        res = session.post(f"{BASE_URL}/api/execution-hub/goals/{goal_id}/notes", json=note_payload)
        assert res.status_code == 200, f"Failed to add goal note: {res.text}"
        
        note_data = res.json()
        assert "note_id" in note_data
        assert "attachments" in note_data
        assert len(note_data["attachments"]) == 1
        assert note_data["attachments"][0]["filename"] == "goal_note_attachment.txt"
        
        # Verify note is stored in goal
        goal_res = session.get(f"{BASE_URL}/api/execution-hub/goals/{goal_id}")
        assert goal_res.status_code == 200
        goal_data = goal_res.json()
        
        notes = goal_data.get("notes", [])
        attachment_note = None
        for note in notes:
            if note.get("content") == "TEST_Goal note with attachment":
                attachment_note = note
                break
        
        assert attachment_note is not None, "Note not found in goal"
        assert len(attachment_note.get("attachments", [])) == 1
        
        print(f"✓ Goal note with attachment created successfully: {note_data['note_id']}")
    
    def test_task_note_with_attachments(self, session, goal_id, task_id, auth_token):
        """Test adding a task note with attachments"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Upload a file first
        file_content = b"Attachment for task note test"
        files = {
            "file": ("task_note_attachment.txt", io.BytesIO(file_content), "text/plain")
        }
        
        upload_res = requests.post(f"{BASE_URL}/api/execution-hub/upload-attachment", files=files, headers=headers)
        assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
        
        upload_data = upload_res.json()
        
        # Add note with attachment
        note_payload = {
            "content": "TEST_Task note with attachment",
            "attachments": [{
                "file_url": upload_data["file_url"],
                "filename": upload_data["filename"],
                "content_type": upload_data["content_type"],
                "size": upload_data["size"],
                "is_image": upload_data["is_image"]
            }]
        }
        
        res = session.post(f"{BASE_URL}/api/execution-hub/tasks/{task_id}/notes", json=note_payload)
        assert res.status_code == 200, f"Failed to add task note: {res.text}"
        
        note_data = res.json()
        assert "note_id" in note_data
        assert "attachments" in note_data
        assert len(note_data["attachments"]) == 1
        assert note_data["attachments"][0]["filename"] == "task_note_attachment.txt"
        
        # Verify note is stored in task
        task_res = session.get(f"{BASE_URL}/api/execution-hub/tasks/{task_id}")
        assert task_res.status_code == 200
        task_data = task_res.json()
        
        notes = task_data.get("notes", [])
        attachment_note = None
        for note in notes:
            if note.get("content") == "TEST_Task note with attachment":
                attachment_note = note
                break
        
        assert attachment_note is not None, "Note not found in task"
        assert len(attachment_note.get("attachments", [])) == 1
        
        print(f"✓ Task note with attachment created successfully: {note_data['note_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
