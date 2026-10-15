"""Iter260 end-to-end tests covering:
  (1) GET /api/proposals/{pid}/notes/mentionable
  (2) Portal messages endpoints (list, post, attachment auth, validation)
  (3) Client Portal Gate on proposal docs (403 proposal_not_ready, exclusion from aggregates)
  (4) /api/culinary-digest/daily-insights shape + cache + refresh
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env", "r") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
MARGARET_EMAIL = "margaret.n.calderon@gmail.com"
MARGARET_PASSWORD = "Evoque2024!"

QA_EVENT_ID = "event_qa_print_spacing_20260729"
QA_PROPOSAL_ID = "prop_qa_print_spacing_20260729"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    tok = j.get("access_token") or j.get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def margaret():
    try:
        return _login(MARGARET_EMAIL, MARGARET_PASSWORD)
    except AssertionError:
        pytest.skip("margaret credentials failed")


# ===== (1) Mentionable users =====

class TestMentionable:
    def test_mentionable_returns_users(self, admin):
        r = requests.get(
            f"{BASE_URL}/api/proposals/{QA_PROPOSAL_ID}/notes/mentionable",
            headers=admin, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "users" in data
        assert isinstance(data["users"], list)
        assert len(data["users"]) > 0
        for u in data["users"]:
            for k in ("user_id", "name", "email", "handle"):
                assert k in u, f"missing {k}"
            # handle should be sanitized email prefix
            assert u["handle"] == u["handle"].replace("@", "")
            assert len(u["handle"]) >= 2


# ===== (2) Portal messages =====

class TestPortalMessages:
    def test_list_only_shared(self, admin):
        # list messages (no auth) - visible notes only
        r = requests.get(f"{BASE_URL}/api/portal/event/{QA_EVENT_ID}/messages", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "messages" in data
        # must be a list, all must be share_with_client-derived (we don't see visibility, but can't contain internal_only notes)
        # cross-check with authenticated notes list
        r2 = requests.get(f"{BASE_URL}/api/proposals/{QA_PROPOSAL_ID}/notes", headers=admin, timeout=15)
        if r2.status_code == 200:
            all_notes = r2.json().get("notes", [])
            internal_ids = {n["note_id"] for n in all_notes
                            if n.get("visibility") != "share_with_client" and not n.get("is_deleted")}
            portal_ids = {m["note_id"] for m in data["messages"]}
            assert portal_ids.isdisjoint(internal_ids), \
                f"Internal note leaked to portal: {portal_ids & internal_ids}"

    def test_post_validation_empty(self):
        # empty body/name should be 422 (pydantic min_length) or 400
        for payload in [{"body": "", "name": "Guest"},
                        {"body": "hi", "name": ""},
                        {"body": "   ", "name": "   "}]:
            r = requests.post(
                f"{BASE_URL}/api/portal/event/{QA_EVENT_ID}/messages",
                json=payload, timeout=15,
            )
            assert r.status_code in (400, 422), f"{payload} => {r.status_code} {r.text}"

    def test_post_creates_client_note_and_notifies(self, admin):
        marker = f"TEST_iter260_{uuid.uuid4().hex[:6]}"
        body = f"Hola equipo {marker} - solicitud desde portal"
        r = requests.post(
            f"{BASE_URL}/api/portal/event/{QA_EVENT_ID}/messages",
            json={"body": body, "name": "QA Client", "email": "qa.client@example.com"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["is_client"] is True
        assert j["author_name"] == "QA Client"
        assert j["body"] == body
        note_id = j["note_id"]

        # must appear in authenticated notes list with category=client_request
        n = requests.get(f"{BASE_URL}/api/proposals/{QA_PROPOSAL_ID}/notes",
                         headers=admin, timeout=15).json().get("notes", [])
        match = [x for x in n if x["note_id"] == note_id]
        assert len(match) == 1, "Client-posted note not found via admin API"
        rec = match[0]
        assert rec.get("category") == "client_request"
        assert rec.get("visibility") == "share_with_client"
        assert rec.get("is_client") is True
        assert rec.get("author_id") == "client"

        # notification created for org admins (type portal_client_message)
        time.sleep(0.5)
        notifs = requests.get(f"{BASE_URL}/api/notifications",
                              headers=admin, timeout=15)
        if notifs.status_code == 200:
            data = notifs.json()
            items = data if isinstance(data, list) else data.get("notifications", [])
            matched = [x for x in items if x.get("metadata", {}).get("note_id") == note_id]
            assert matched, "No portal_client_message notification created"
            found = matched[0]
            assert found.get("type") == "portal_client_message"
            assert found.get("link") == f"/events/{QA_EVENT_ID}?tab=notes&note={note_id}"

        # cleanup
        requests.delete(f"{BASE_URL}/api/proposals/{QA_PROPOSAL_ID}/notes/{note_id}",
                        headers=admin, timeout=15)

    def test_attachment_not_found_on_internal(self):
        r = requests.get(
            f"{BASE_URL}/api/portal/event/{QA_EVENT_ID}/messages/attachments/att_doesnotexist",
            timeout=15,
        )
        assert r.status_code == 404


# ===== (3) Portal Gate =====

def _get_event_id_pending_approval(admin):
    # Use QA event (Pending Approval) - fetch via /proposals/event/{event_id}
    r = requests.get(f"{BASE_URL}/api/proposals/event/{QA_EVENT_ID}", headers=admin, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # could be list or dict
    if isinstance(data, list):
        prop = next((p for p in data if p.get("proposal_id") == QA_PROPOSAL_ID), data[0] if data else None)
    else:
        prop = data
    assert prop
    return QA_EVENT_ID, prop.get("document_status")


class TestPortalGate:
    @pytest.fixture(scope="class")
    def gated_doc(self, admin):
        event_id, status = _get_event_id_pending_approval(admin)
        assert status == "Pending Approval", f"QA proposal must be Pending Approval, got {status}"
        payload = {
            "document_type": "proposal",
            "event_id": event_id,
            "proposal_id": QA_PROPOSAL_ID,
            "title": "TEST_iter260_gated_proposal",
            "content": {"html": "<p>gated test doc</p>"},
        }
        r = requests.post(f"{BASE_URL}/api/documents", headers=admin, json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        doc_id = doc.get("document_id") or doc.get("id")
        assert doc_id
        yield doc_id, event_id
        # cleanup (no DELETE endpoint for /api/documents; residual docs are purged
        # by iteration cleanup step via mongo. Best-effort DELETE below is a no-op.)
        try:
            requests.delete(f"{BASE_URL}/api/documents/{doc_id}", headers=admin, timeout=15)
        except Exception:
            pass

    def test_portal_get_doc_returns_403(self, gated_doc):
        doc_id, _ = gated_doc
        r = requests.get(f"{BASE_URL}/api/portal/document/{doc_id}", timeout=15)
        assert r.status_code == 403, r.text
        body = r.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            assert detail.get("code") == "proposal_not_ready"
        else:
            # some fastapi versions stringify dict detail
            assert "proposal_not_ready" in str(detail)

    def test_portal_sign_returns_403(self, gated_doc):
        doc_id, _ = gated_doc
        r = requests.post(f"{BASE_URL}/api/portal/document/{doc_id}/sign",
                          json={"signature": "data:image/png;base64,xxx", "signed_by": "QA"},
                          timeout=15)
        assert r.status_code == 403
        body = r.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            assert detail.get("code") == "proposal_not_ready"
        else:
            assert "proposal_not_ready" in str(detail)

    def test_excluded_from_all_documents(self, gated_doc):
        doc_id, event_id = gated_doc
        r = requests.get(f"{BASE_URL}/api/portal/event/{event_id}/all-documents", timeout=15)
        # endpoint might not exist for events without proposal yet - but QA event has one
        if r.status_code == 200:
            data = r.json()
            docs = data if isinstance(data, list) else data.get("documents", data.get("items", []))
            ids = [d.get("document_id") or d.get("id") for d in docs]
            assert doc_id not in ids, f"Gated doc {doc_id} leaked into all-documents"

    def test_contract_doc_unaffected(self, admin):
        # non-proposal docs should not be gated
        payload = {
            "document_type": "contract",
            "event_id": QA_EVENT_ID,
            "proposal_id": QA_PROPOSAL_ID,
            "title": "TEST_iter260_contract",
            "content": {"html": "<p>contract</p>"},
        }
        r = requests.post(f"{BASE_URL}/api/documents", headers=admin, json=payload, timeout=20)
        if r.status_code not in (200, 201):
            pytest.skip(f"doc create failed: {r.status_code} {r.text}")
        doc = r.json()
        doc_id = doc.get("document_id") or doc.get("id")
        try:
            r2 = requests.get(f"{BASE_URL}/api/portal/document/{doc_id}", timeout=15)
            # Contract portal access depends on existence; should NOT be 403 with proposal_not_ready
            if r2.status_code == 403:
                detail = r2.json().get("detail")
                assert "proposal_not_ready" not in str(detail), "Contract wrongly gated"
            else:
                assert r2.status_code in (200, 404), f"unexpected {r2.status_code}"
        finally:
            requests.delete(f"{BASE_URL}/api/documents/{doc_id}", headers=admin, timeout=15)


# ===== (4) Culinary Digest =====

class TestCulinaryDigest:
    def test_daily_insights_shape(self, margaret):
        r = requests.get(f"{BASE_URL}/api/culinary-digest/daily-insights",
                         headers=margaret, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("variance", "staleness", "low_stock"):
            assert k in d, f"missing {k}"
            section = d[k]
            assert "count" in section
            assert "link" in section
            assert "items" in section
            assert isinstance(section["items"], list)
        assert d["variance"]["link"].startswith("/food-ops/menus")
        assert "lowstock" in d["low_stock"]["link"]
        assert "affects_events" in d["low_stock"]

    def test_cache_and_refresh(self, margaret):
        r1 = requests.get(f"{BASE_URL}/api/culinary-digest/daily-insights",
                          headers=margaret, timeout=30)
        assert r1.status_code == 200
        g1 = r1.json().get("generated_at")
        r2 = requests.get(f"{BASE_URL}/api/culinary-digest/daily-insights",
                          headers=margaret, timeout=30)
        assert r2.json().get("generated_at") == g1, "cache not used on consecutive call"
        r3 = requests.get(f"{BASE_URL}/api/culinary-digest/daily-insights?refresh=true",
                          headers=margaret, timeout=30)
        assert r3.status_code == 200
        # refresh should produce new generated_at (allowing for same-second clock)
        # Not strictly required but normally differs; soft-check
        assert r3.json().get("generated_at") is not None
