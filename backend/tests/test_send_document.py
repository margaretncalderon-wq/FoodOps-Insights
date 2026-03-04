"""
Tests for Send Document to Client feature
POST /api/documents/{document_id}/send
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://prod-fix-1.preview.emergentagent.com').rstrip('/')

class TestSendDocument:
    """Test the Send Document to Client feature"""
    
    # Login credentials
    email = "margaret.n.calderon@gmail.com"
    password = "Evoque2024!"
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": self.password}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token") or data.get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_send_document_quote_already_sent(self):
        """Test sending a quote document that was already sent (doc_d64a63376ae6)"""
        # This document is already marked as sent according to context
        doc_id = "doc_d64a63376ae6"
        
        response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/send",
            headers=self.headers,
            json={}
        )
        
        # Should succeed and return the portal link
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        assert "portal_link" in data
        assert "sent_to" in data
        # email_status will be 'skipped' without RESEND_API_KEY
        assert data.get("email_status") in ["success", "skipped"]
    
    def test_send_document_quote_demo_boda(self):
        """Test sending a quote document (doc_d64a63376ae6) from Evento Demo - Boda"""
        # This document exists and has a valid event and client
        doc_id = "doc_d64a63376ae6"
        
        response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/send",
            headers=self.headers,
            json={}
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        assert "portal_link" in data
        assert "sent_to" in data
        # email_status will be 'skipped' without RESEND_API_KEY
        assert data.get("email_status") in ["success", "skipped"]
        assert "cliente@demo.com" in data.get("sent_to", "")
        
    def test_send_document_not_found(self):
        """Test sending a non-existent document"""
        doc_id = "doc_nonexistent_123"
        
        response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/send",
            headers=self.headers,
            json={}
        )
        
        print(f"Response status: {response.status_code}")
        
        assert response.status_code == 404
    
    def test_document_status_updated_to_sent(self):
        """Verify document status is updated to 'sent' after sending"""
        # Get any contract/quote document to verify
        response = requests.get(
            f"{BASE_URL}/api/documents",
            headers=self.headers
        )
        
        assert response.status_code == 200
        docs = response.json()
        
        # Find a contract or quote document
        sendable_doc = None
        for doc in docs:
            if doc.get("document_type") in ["contract", "quote"]:
                sendable_doc = doc
                break
        
        if not sendable_doc:
            pytest.skip("No contract/quote documents found to test")
        
        doc_id = sendable_doc.get("document_id")
        
        # Send the document
        send_response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/send",
            headers=self.headers,
            json={}
        )
        
        print(f"Send response: {send_response.status_code} - {send_response.json()}")
        
        # Verify the document status was updated
        get_response = requests.get(
            f"{BASE_URL}/api/documents/{doc_id}",
            headers=self.headers
        )
        
        if get_response.status_code == 200:
            doc_data = get_response.json()
            print(f"Document status after send: {doc_data.get('status')}")
            assert doc_data.get("status") == "sent", f"Document status should be 'sent', got: {doc_data.get('status')}"


class TestDocumentsListForEvent:
    """Test listing documents for an event"""
    
    email = "margaret.n.calderon@gmail.com"
    password = "Evoque2024!"
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": self.password}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token") or data.get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_documents_for_event(self):
        """Get all documents for an event"""
        # Get events first
        response = requests.get(
            f"{BASE_URL}/api/events",
            headers=self.headers
        )
        assert response.status_code == 200
        events = response.json()
        
        # Find 'Evento Demo - Boda' or use first event
        event_id = None
        for event in events:
            if "Demo" in event.get("name", "") or "Boda" in event.get("name", ""):
                event_id = event.get("event_id")
                break
        
        if not event_id and events:
            event_id = events[0].get("event_id")
        
        if not event_id:
            pytest.skip("No events found")
        
        # Get documents for this event
        response = requests.get(
            f"{BASE_URL}/api/documents?event_id={event_id}",
            headers=self.headers
        )
        
        print(f"Documents response: {response.status_code}")
        print(f"Documents found: {len(response.json())}")
        
        assert response.status_code == 200
        docs = response.json()
        
        # Check structure of returned documents
        for doc in docs[:3]:  # Check first 3
            print(f"Document: {doc.get('document_id')} - Type: {doc.get('document_type')} - Status: {doc.get('status')}")
            assert "document_id" in doc
            assert "document_type" in doc
            assert "status" in doc


class TestDocumentSendPortalLink:
    """Test that the portal link is correctly formed"""
    
    email = "margaret.n.calderon@gmail.com"
    password = "Evoque2024!"
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": self.password}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token") or data.get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_portal_link_structure(self):
        """Verify the portal link is correctly formatted"""
        # Get documents
        response = requests.get(
            f"{BASE_URL}/api/documents",
            headers=self.headers
        )
        assert response.status_code == 200
        docs = response.json()
        
        # Find a document to send
        doc = None
        for d in docs:
            if d.get("document_type") in ["contract", "quote"]:
                doc = d
                break
        
        if not doc:
            pytest.skip("No contract/quote documents found")
        
        doc_id = doc.get("document_id")
        
        # Send the document
        send_response = requests.post(
            f"{BASE_URL}/api/documents/{doc_id}/send",
            headers=self.headers,
            json={}
        )
        
        assert send_response.status_code == 200
        data = send_response.json()
        
        # Verify portal link structure
        portal_link = data.get("portal_link")
        print(f"Portal link: {portal_link}")
        
        assert portal_link is not None
        assert "/portal/" in portal_link
        assert doc_id in portal_link


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
