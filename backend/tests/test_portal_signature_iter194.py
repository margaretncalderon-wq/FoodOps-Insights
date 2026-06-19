"""
Iteration 194 — Backend tests for digital signature capture on Client Portal.
Covers:
  * POST /api/portal/document/{document_id}/sign with {signature, signed_by, signed_email}
  * Captures client IP + User-Agent
  * Persists signed_email, signed_ip, signed_user_agent, status='signed' on documents
  * Propagates client_signature, client_signed_at, client_signed_by, client_signed_email,
    client_signed_ip, status='approved' onto the linked proposals record when document_type
    is 'proposal' or 'quote'
  * GET /api/portal/document/{id} returns these fields
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

# Tiny 1x1 transparent PNG data URL
TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZkN9swAAAAASUVORK5CYII="
)


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    return token


@pytest.fixture(scope="module")
def admin(session, auth_token):
    session.headers.update({"Authorization": f"Bearer {auth_token}"})
    return session


def _get_or_create_proposal_for_event(admin, event_id):
    """Helper: ensure a proposal exists for the given event by hitting the
    GET /api/proposals/event/{event_id} endpoint which auto-creates."""
    r = admin.get(f"{BASE_URL}/api/proposals/event/{event_id}")
    if r.status_code != 200:
        return None
    p = r.json()
    if isinstance(p, list):
        p = p[0] if p else None
    return p


@pytest.fixture(scope="module")
def proposal_and_document(admin):
    """Pick an existing event, fetch its proposal, then generate a portal document.

    Strategy: GET /api/events, find one event, GET /api/proposals/event/{event_id}
    to ensure a proposal exists, then POST /api/documents/generate/{event_id}/proposal.
    """
    r = admin.get(f"{BASE_URL}/api/events")
    assert r.status_code == 200, f"GET /api/events failed: {r.status_code} {r.text}"
    events = r.json()
    assert isinstance(events, list) and len(events) > 0, "No events exist to test"

    # Try multiple events in case some fail to generate documents
    last_err = None
    for ev in events[:10]:
        event_id = ev.get("event_id") or ev.get("id")
        if not event_id:
            continue
        proposal = _get_or_create_proposal_for_event(admin, event_id)
        if not proposal or not proposal.get("proposal_id"):
            continue
        g = admin.post(f"{BASE_URL}/api/documents/generate/{event_id}/proposal")
        if g.status_code != 200:
            last_err = f"event {event_id}: {g.status_code} {g.text[:200]}"
            continue
        doc = g.json()
        document_id = doc.get("document_id") or doc.get("id")
        if not document_id:
            last_err = f"event {event_id}: no document_id in {doc}"
            continue
        return {
            "proposal_id": proposal["proposal_id"],
            "event_id": event_id,
            "document_id": document_id,
            "document_type": doc.get("document_type", "proposal"),
        }
    pytest.fail(f"Could not seed proposal+document. Last error: {last_err}")


# ---------- Tests ----------
class TestPortalSignFlow:
    def test_portal_document_get_returns_doc(self, proposal_and_document):
        document_id = proposal_and_document["document_id"]
        r = requests.get(f"{BASE_URL}/api/portal/document/{document_id}")
        assert r.status_code == 200, f"GET portal doc failed: {r.text}"
        body = r.json()
        assert body.get("document_id") == document_id
        # Pre-sign state
        assert body.get("status") in (None, "draft", "pending", "sent", "signed", "approved")

    def test_sign_persists_all_audit_fields(self, proposal_and_document):
        document_id = proposal_and_document["document_id"]
        signer_name = f"TEST_Signer_{uuid.uuid4().hex[:8]}"
        signer_email = f"test_{uuid.uuid4().hex[:6]}@example.com"
        ua_marker = "PyTestUA/iter194"

        # Use a fresh session to avoid admin auth header
        sess = requests.Session()
        sess.headers.update({
            "Content-Type": "application/json",
            "User-Agent": ua_marker,
        })

        payload = {
            "signature": TINY_PNG_DATA_URL,
            "signed_by": signer_name,
            "signed_email": signer_email,
        }
        r = sess.post(
            f"{BASE_URL}/api/portal/document/{document_id}/sign",
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, f"Sign failed: {r.status_code} {r.text}"
        body = r.json()
        assert "signed_at" in body
        assert "signed successfully" in body.get("message", "").lower()

        # GET document and verify persisted fields
        g = requests.get(f"{BASE_URL}/api/portal/document/{document_id}")
        assert g.status_code == 200
        doc = g.json()
        assert doc.get("signature") == TINY_PNG_DATA_URL
        assert doc.get("signed_by") == signer_name
        assert doc.get("signed_email") == signer_email
        assert doc.get("status") == "signed"
        # IP should be captured (non-empty) — may be ingress IP, just ensure not None
        assert doc.get("signed_ip"), f"signed_ip missing: {doc.get('signed_ip')}"
        # User-Agent captured
        assert doc.get("signed_user_agent"), "signed_user_agent missing"
        assert ua_marker in (doc.get("signed_user_agent") or ""), \
            f"User-Agent not captured correctly: {doc.get('signed_user_agent')}"
        # signed_at present
        assert doc.get("signed_at"), "signed_at missing"

    def test_sign_propagates_to_proposal_collection(self, admin, proposal_and_document):
        """Verify propagation logic: when a document has a linked proposal_id
        and document_type in ('proposal','quote'), signing should push
        client_signature/client_signed_* + status='approved' onto proposals.
        
        Note: /api/documents/generate/{event_id}/proposal does NOT currently
        write `proposal_id` onto the document. To test the propagation logic
        in isolation, we patch the document directly via MongoDB to attach
        proposal_id, then call the sign endpoint and verify proposal record.
        """
        from pymongo import MongoClient as _MC

        proposal_id = proposal_and_document["proposal_id"]
        event_id = proposal_and_document["event_id"]
        document_id = proposal_and_document["document_id"]

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        mc = _MC(mongo_url)
        mdb = mc[db_name]
        # Patch the document to set proposal_id
        upd = mdb.documents.update_one(
            {"document_id": document_id},
            {"$set": {"proposal_id": proposal_id, "document_type": "proposal"}},
        )
        assert upd.matched_count == 1, "Could not patch document with proposal_id in MongoDB"

        # Now sign with a marker signer
        signer_name = f"TEST_Propagated_{uuid.uuid4().hex[:6]}"
        signer_email = f"propagate_{uuid.uuid4().hex[:6]}@example.com"
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json", "User-Agent": "PropagationTest"})
        s = sess.post(
            f"{BASE_URL}/api/portal/document/{document_id}/sign",
            json={
                "signature": TINY_PNG_DATA_URL,
                "signed_by": signer_name,
                "signed_email": signer_email,
            },
            timeout=30,
        )
        assert s.status_code == 200, f"Sign failed: {s.text}"

        # Read the proposal back via API
        r = admin.get(f"{BASE_URL}/api/proposals/event/{event_id}")
        assert r.status_code == 200, f"GET proposal failed: {r.status_code} {r.text}"
        p = r.json()
        if isinstance(p, list):
            p = next((x for x in p if x.get("proposal_id") == proposal_id), p[0])

        assert p.get("client_signature") == TINY_PNG_DATA_URL, \
            "client_signature not propagated to proposal"
        assert p.get("client_signed_by") == signer_name, \
            f"client_signed_by not propagated: {p.get('client_signed_by')}"
        assert p.get("client_signed_email") == signer_email, \
            f"client_signed_email not propagated: {p.get('client_signed_email')}"
        assert p.get("client_signed_at"), "client_signed_at missing"
        assert p.get("client_signed_ip"), "client_signed_ip missing"
        assert p.get("status") == "approved", \
            f"proposal status should be 'approved', got: {p.get('status')}"

    def test_sign_without_email_still_works(self, admin):
        """Email is optional — verify signing works when omitted."""
        # Find an event and generate a fresh document
        r = admin.get(f"{BASE_URL}/api/events")
        events = r.json()
        target = None
        for ev in events[:10]:
            event_id = ev.get("event_id") or ev.get("id")
            if not event_id:
                continue
            g = admin.post(f"{BASE_URL}/api/documents/generate/{event_id}/proposal")
            if g.status_code == 200 and g.json().get("document_id"):
                target = g.json().get("document_id")
                break
        if not target:
            pytest.skip("Could not generate a fresh document for no-email test")
        doc_id = target

        signer_name = f"TEST_NoEmail_{uuid.uuid4().hex[:6]}"
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        r = sess.post(
            f"{BASE_URL}/api/portal/document/{doc_id}/sign",
            json={"signature": TINY_PNG_DATA_URL, "signed_by": signer_name},
            timeout=30,
        )
        assert r.status_code == 200, f"Sign w/o email failed: {r.text}"

        d = requests.get(f"{BASE_URL}/api/portal/document/{doc_id}").json()
        assert d.get("signed_by") == signer_name
        assert d.get("signed_email") in (None, ""), \
            f"signed_email should be None when omitted: {d.get('signed_email')}"
        assert d.get("status") == "signed"

    def test_sign_nonexistent_document_returns_404(self):
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        r = sess.post(
            f"{BASE_URL}/api/portal/document/doc_does_not_exist_xyz/sign",
            json={"signature": TINY_PNG_DATA_URL, "signed_by": "Nobody"},
            timeout=15,
        )
        assert r.status_code == 404
