# Test Partner Attachments Module - File upload, download, delete functionality
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"
TEST_PARTNER_ID = "partner_386242788890"

class TestPartnerAttachments:
    """Tests for Partner Attachments CRUD operations"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session for tests"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth cookie
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return session
    
    # =================== GET /api/partners/{partner_id}/attachments ===================
    def test_get_partner_attachments(self, auth_session):
        """Test GET /api/partners/{partner_id}/attachments - list attachments"""
        response = auth_session.get(f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "attachments" in data, "Missing 'attachments' array"
        assert "total" in data, "Missing 'total' count"
        assert "by_type" in data, "Missing 'by_type' grouping"
        
        assert isinstance(data["attachments"], list), "Attachments should be a list"
        assert isinstance(data["total"], int), "Total should be integer"
        
        print(f"✓ Attachments listed: {data['total']} files")
        
        # If there are existing attachments, verify structure
        if len(data["attachments"]) > 0:
            attachment = data["attachments"][0]
            assert "attachment_id" in attachment, "Missing attachment_id"
            assert "file_name" in attachment, "Missing file_name"
            assert "original_name" in attachment, "Missing original_name"
            assert "file_type" in attachment, "Missing file_type"
            assert "mime_type" in attachment, "Missing mime_type"
            assert "file_size" in attachment, "Missing file_size"
            assert "file_url" in attachment, "Missing file_url"
            print(f"✓ First attachment: {attachment['original_name']} ({attachment['file_type']})")
    
    def test_get_attachments_partner_not_found(self, auth_session):
        """Test GET /api/partners/{partner_id}/attachments with invalid partner ID"""
        response = auth_session.get(f"{BASE_URL}/api/partners/nonexistent_partner_xyz/attachments")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ 404 returned for non-existent partner")
    
    # =================== POST /api/partners/{partner_id}/attachments ===================
    def test_upload_attachment_pdf(self, auth_session):
        """Test POST /api/partners/{partner_id}/attachments - upload PDF file"""
        # Create a fake PDF file
        pdf_content = b"%PDF-1.4 fake pdf content for testing purposes only"
        files = {
            "file": ("TEST_test_document.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        data = {
            "file_type": "catalog",
            "description": "TEST catalog document",
            "expiration_date": "2027-12-31"
        }
        
        # Remove Content-Type header for multipart upload
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
        
        response = requests.post(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
            files=files,
            data=data,
            cookies=auth_session.cookies,
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        attachment = response.json()
        
        # Verify response structure
        assert "attachment_id" in attachment, "Missing attachment_id"
        assert "file_name" in attachment, "Missing file_name"
        assert "file_type" in attachment, "Missing file_type"
        assert attachment["file_type"] == "catalog", f"File type mismatch: {attachment['file_type']}"
        assert "description" in attachment, "Missing description"
        assert attachment["description"] == "TEST catalog document", "Description mismatch"
        assert "expiration_date" in attachment, "Missing expiration_date"
        assert attachment["expiration_date"] == "2027-12-31", "Expiration date mismatch"
        assert "file_url" in attachment, "Missing file_url"
        assert "file_size" in attachment, "Missing file_size"
        
        print(f"✓ PDF uploaded: {attachment['attachment_id']}")
        
        # Cleanup: delete the uploaded attachment
        delete_response = auth_session.delete(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments/{attachment['attachment_id']}"
        )
        assert delete_response.status_code == 200, "Failed to cleanup test attachment"
        print("✓ Test attachment cleaned up")
    
    def test_upload_attachment_image(self, auth_session):
        """Test POST /api/partners/{partner_id}/attachments - upload image file"""
        # Create a minimal PNG file (1x1 pixel transparent)
        png_content = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG header
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82
        ])
        
        files = {
            "file": ("TEST_portfolio_image.png", io.BytesIO(png_content), "image/png")
        }
        data = {
            "file_type": "portfolio",
            "description": "TEST portfolio image"
        }
        
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
        
        response = requests.post(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
            files=files,
            data=data,
            cookies=auth_session.cookies,
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        attachment = response.json()
        
        assert attachment["file_type"] == "portfolio", "File type mismatch"
        assert attachment["mime_type"] == "image/png", f"MIME type mismatch: {attachment['mime_type']}"
        # Images should have thumbnail_url
        assert "thumbnail_url" in attachment, "Missing thumbnail_url for image"
        
        print(f"✓ Image uploaded: {attachment['attachment_id']}")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments/{attachment['attachment_id']}")
    
    def test_upload_attachment_invalid_file_type(self, auth_session):
        """Test POST /api/partners/{partner_id}/attachments with unsupported file type"""
        # Create a fake executable file
        files = {
            "file": ("test.exe", io.BytesIO(b"fake executable content"), "application/x-msdownload")
        }
        data = {"file_type": "other"}
        
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
        
        response = requests.post(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
            files=files,
            data=data,
            cookies=auth_session.cookies,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        error = response.json()
        assert "detail" in error, "Missing error detail"
        print(f"✓ Invalid file type rejected: {error.get('detail')}")
    
    def test_upload_attachment_file_too_large(self, auth_session):
        """Test POST /api/partners/{partner_id}/attachments with file > 10MB"""
        # Create a file larger than 10MB
        large_content = b"x" * (11 * 1024 * 1024)  # 11MB
        
        files = {
            "file": ("large_file.pdf", io.BytesIO(large_content), "application/pdf")
        }
        data = {"file_type": "other"}
        
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
        
        response = requests.post(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
            files=files,
            data=data,
            cookies=auth_session.cookies,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        error = response.json()
        assert "detail" in error, "Missing error detail"
        assert "10MB" in error.get("detail", "") or "large" in error.get("detail", "").lower(), f"Unexpected error: {error}"
        print(f"✓ Large file rejected: {error.get('detail')}")
    
    def test_upload_attachment_all_file_types(self, auth_session):
        """Test uploading with different document type options"""
        file_types_to_test = ["coi", "contract", "license", "w9", "nda", "sow", "price_list", "other"]
        
        for file_type in file_types_to_test:
            pdf_content = b"%PDF-1.4 test content"
            files = {
                "file": (f"TEST_{file_type}_document.pdf", io.BytesIO(pdf_content), "application/pdf")
            }
            data = {"file_type": file_type}
            
            headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
            
            response = requests.post(
                f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
                files=files,
                data=data,
                cookies=auth_session.cookies,
                headers=headers
            )
            
            assert response.status_code == 200, f"Failed to upload {file_type}: {response.status_code}"
            
            attachment = response.json()
            assert attachment["file_type"] == file_type, f"File type mismatch for {file_type}"
            
            # Cleanup
            auth_session.delete(f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments/{attachment['attachment_id']}")
        
        print(f"✓ All file types tested: {file_types_to_test}")
    
    # =================== DELETE /api/partners/{partner_id}/attachments/{attachment_id} ===================
    def test_delete_attachment(self, auth_session):
        """Test DELETE /api/partners/{partner_id}/attachments/{attachment_id}"""
        # First upload a file to delete
        pdf_content = b"%PDF-1.4 test content for deletion"
        files = {
            "file": ("TEST_to_delete.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        data = {"file_type": "other"}
        
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
            files=files,
            data=data,
            cookies=auth_session.cookies,
            headers=headers
        )
        
        assert upload_response.status_code == 200, "Upload failed"
        attachment_id = upload_response.json()["attachment_id"]
        
        # Delete the attachment
        delete_response = auth_session.delete(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments/{attachment_id}"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        result = delete_response.json()
        assert result.get("success") == True, "Delete should return success=true"
        assert result.get("deleted_attachment_id") == attachment_id, "Returned attachment_id mismatch"
        
        # Verify it's deleted by listing attachments
        list_response = auth_session.get(f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments")
        attachments = list_response.json().get("attachments", [])
        
        attachment_ids = [a["attachment_id"] for a in attachments]
        assert attachment_id not in attachment_ids, "Deleted attachment still appears in list"
        
        print(f"✓ Attachment deleted: {attachment_id}")
    
    def test_delete_attachment_not_found(self, auth_session):
        """Test DELETE /api/partners/{partner_id}/attachments/{attachment_id} with invalid ID"""
        response = auth_session.delete(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments/nonexistent_attachment_xyz"
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ 404 returned for non-existent attachment")
    
    # =================== GET /api/uploads/partner_attachments/{filename} ===================
    def test_download_attachment_file(self, auth_session):
        """Test GET /api/uploads/partner_attachments/{filename} - download file"""
        # First upload a file
        pdf_content = b"%PDF-1.4 test content for download"
        files = {
            "file": ("TEST_download_test.pdf", io.BytesIO(pdf_content), "application/pdf")
        }
        data = {"file_type": "catalog"}
        
        headers = {k: v for k, v in auth_session.headers.items() if k.lower() != "content-type"}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments",
            files=files,
            data=data,
            cookies=auth_session.cookies,
            headers=headers
        )
        
        assert upload_response.status_code == 200, "Upload failed"
        attachment = upload_response.json()
        file_url = attachment["file_url"]
        
        # Download the file using the file_url
        download_response = requests.get(f"{BASE_URL}{file_url}")
        
        assert download_response.status_code == 200, f"Download failed: {download_response.status_code}"
        assert len(download_response.content) > 0, "Downloaded file is empty"
        
        print(f"✓ File downloaded: {len(download_response.content)} bytes")
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments/{attachment['attachment_id']}")
    
    def test_download_file_not_found(self, auth_session):
        """Test GET /api/uploads/partner_attachments/{filename} with invalid filename"""
        response = requests.get(f"{BASE_URL}/api/uploads/partner_attachments/nonexistent_file.pdf")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ 404 returned for non-existent file")
    
    # =================== Verify attachment_types in options ===================
    def test_attachment_types_in_options(self, auth_session):
        """Test that attachment_types is included in /api/partners/options"""
        response = auth_session.get(f"{BASE_URL}/api/partners/options")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert "attachment_types" in data, "Missing 'attachment_types' in options"
        
        attachment_types = data["attachment_types"]
        assert isinstance(attachment_types, list), "attachment_types should be a list"
        assert len(attachment_types) > 0, "attachment_types should not be empty"
        
        # Verify expected types
        expected_types = ["catalog", "coi", "contract", "license", "portfolio", "price_list", "w9", "nda", "sow", "other"]
        actual_types = [t["value"] for t in attachment_types]
        
        for expected in expected_types:
            assert expected in actual_types, f"Missing attachment type: {expected}"
        
        # Verify structure
        first_type = attachment_types[0]
        assert "value" in first_type, "Missing 'value' in attachment type"
        assert "label" in first_type, "Missing 'label' in attachment type"
        assert "label_es" in first_type, "Missing 'label_es' in attachment type (Spanish)"
        
        print(f"✓ Attachment types in options: {actual_types}")
    
    # =================== Test existing attachments on test partner ===================
    def test_existing_attachments(self, auth_session):
        """Test that test partner has expected attachments"""
        response = auth_session.get(f"{BASE_URL}/api/partners/{TEST_PARTNER_ID}/attachments")
        
        if response.status_code == 404:
            pytest.skip("Test partner not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        attachments = data.get("attachments", [])
        total = data.get("total", 0)
        
        print(f"✓ Test partner has {total} attachments")
        
        # Log each attachment for debugging
        for att in attachments:
            print(f"  - {att.get('original_name')} ({att.get('file_type')}) - {att.get('file_size')} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
