"""Tests for 'Ask the team' approval-question flow.

Covers:
- Create approval_question → open_questions_count = 1, data_incomplete=true, source=open_questions
- Resolve toggles; count 0 clears flag only when source=open_questions
- data_incomplete already set from another source must stay untouched when count hits 0
- resolve on non-approval_question → 400
- delete recalculates and clears flag
- PUT category change resyncs
- approve blocked (409 {code:open_questions,count}); force=True approves
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

EVENT_ID = "event_qa_print_spacing_20260729"
PROPOSAL_ID = "prop_qa_print_spacing_20260729"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    token = body.get("access_token") or body.get("token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_proposal(auth_headers):
    r = requests.get(f"{BASE_URL}/api/proposals/event/{EVENT_ID}", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _cleanup_test_notes(auth_headers, note_ids):
    for nid in note_ids:
        try:
            requests.delete(
                f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{nid}",
                headers=auth_headers, timeout=10,
            )
        except Exception:
            pass


def test_proposal_exists_and_pending(auth_headers):
    p = _get_proposal(auth_headers)
    assert p.get("proposal_id") == PROPOSAL_ID
    assert p.get("document_status") == "Pending Approval", f"status={p.get('document_status')}"


def test_create_approval_question_flags_and_resolve(auth_headers):
    sfx = uuid.uuid4().hex[:6]
    created = []
    try:
        # Baseline
        p0 = _get_proposal(auth_headers)
        base_count = p0.get("open_questions_count") or 0
        assert not p0.get("data_incomplete"), "baseline should have data_incomplete=false"

        # Create question
        r = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes",
            headers=auth_headers,
            json={"body": f"TEST_Q {sfx}: shall we add dessert?", "category": "approval_question", "visibility": "internal_only"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        note = r.json()
        created.append(note["note_id"])
        assert note["category"] == "approval_question"
        assert note["resolved"] is False
        assert note["open_questions_count"] == base_count + 1

        # Verify proposal flag
        p1 = _get_proposal(auth_headers)
        assert p1.get("open_questions_count") == base_count + 1
        assert p1.get("data_incomplete") is True
        assert p1.get("data_incomplete_source") == "open_questions"

        # Resolve
        rr = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{note['note_id']}/resolve",
            headers=auth_headers, timeout=15,
        )
        assert rr.status_code == 200, rr.text
        body = rr.json()
        assert body["resolved"] is True
        assert body["resolved_by"]["user_id"]
        assert body["open_questions_count"] == base_count

        # Flag should clear (source was open_questions)
        p2 = _get_proposal(auth_headers)
        assert p2.get("open_questions_count") == base_count
        if base_count == 0:
            assert not p2.get("data_incomplete"), p2
            assert p2.get("data_incomplete_source") in (None, "")

        # Reopen (toggle again)
        rr2 = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{note['note_id']}/resolve",
            headers=auth_headers, timeout=15,
        )
        assert rr2.status_code == 200
        assert rr2.json()["resolved"] is False
        p3 = _get_proposal(auth_headers)
        assert p3.get("data_incomplete") is True
        assert p3.get("data_incomplete_source") == "open_questions"
    finally:
        _cleanup_test_notes(auth_headers, created)
        # Verify back to clean
        pf = _get_proposal(auth_headers)
        assert pf.get("open_questions_count", 0) == 0
        assert not pf.get("data_incomplete")


def test_resolve_non_approval_question_returns_400(auth_headers):
    sfx = uuid.uuid4().hex[:6]
    r = requests.post(
        f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes",
        headers=auth_headers,
        json={"body": f"TEST_internal {sfx}", "category": "internal"},
        timeout=15,
    )
    assert r.status_code == 200
    nid = r.json()["note_id"]
    try:
        rr = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{nid}/resolve",
            headers=auth_headers, timeout=10,
        )
        assert rr.status_code == 400
    finally:
        _cleanup_test_notes(auth_headers, [nid])


def test_delete_open_question_clears_flag(auth_headers):
    sfx = uuid.uuid4().hex[:6]
    r = requests.post(
        f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes",
        headers=auth_headers,
        json={"body": f"TEST_delQ {sfx}", "category": "approval_question"},
        timeout=15,
    )
    assert r.status_code == 200
    nid = r.json()["note_id"]
    p1 = _get_proposal(auth_headers)
    assert p1.get("data_incomplete") is True

    rd = requests.delete(f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{nid}", headers=auth_headers, timeout=10)
    assert rd.status_code == 200
    assert rd.json()["open_questions_count"] == 0
    p2 = _get_proposal(auth_headers)
    assert not p2.get("data_incomplete")
    assert p2.get("data_incomplete_source") in (None, "")


def test_put_category_change_resyncs(auth_headers):
    sfx = uuid.uuid4().hex[:6]
    r = requests.post(
        f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes",
        headers=auth_headers,
        json={"body": f"TEST_putQ {sfx}", "category": "approval_question"},
        timeout=15,
    )
    nid = r.json()["note_id"]
    try:
        p1 = _get_proposal(auth_headers)
        assert p1.get("open_questions_count") == 1

        # Change category away from approval_question
        ru = requests.put(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{nid}",
            headers=auth_headers,
            json={"category": "internal"}, timeout=15,
        )
        assert ru.status_code == 200
        p2 = _get_proposal(auth_headers)
        assert p2.get("open_questions_count") == 0
        assert not p2.get("data_incomplete")

        # Change back
        ru2 = requests.put(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{nid}",
            headers=auth_headers,
            json={"category": "approval_question"}, timeout=15,
        )
        assert ru2.status_code == 200
        p3 = _get_proposal(auth_headers)
        assert p3.get("open_questions_count") == 1
        assert p3.get("data_incomplete") is True
        assert p3.get("data_incomplete_source") == "open_questions"
    finally:
        _cleanup_test_notes(auth_headers, [nid])


def test_approve_blocked_then_force_then_revoke(auth_headers):
    sfx = uuid.uuid4().hex[:6]
    created = []
    # Create open question
    r = requests.post(
        f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes",
        headers=auth_headers,
        json={"body": f"TEST_approveQ {sfx}", "category": "approval_question"},
        timeout=15,
    )
    assert r.status_code == 200
    nid = r.json()["note_id"]
    created.append(nid)

    try:
        # Attempt approve → 409 with code open_questions
        ra = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/approve",
            headers=auth_headers, json={}, timeout=15,
        )
        assert ra.status_code == 409, ra.text
        detail = ra.json().get("detail")
        assert isinstance(detail, dict), detail
        assert detail.get("code") == "open_questions"
        assert detail.get("count") == 1

        # Approve with force
        ra2 = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/approve",
            headers=auth_headers, json={"force": True}, timeout=15,
        )
        assert ra2.status_code == 200, ra2.text
        assert ra2.json()["document_status"] == "Approved"

        # Revoke back to Pending Approval so QA state is preserved
        rr = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/revoke-approval",
            headers=auth_headers, json={"reason": "QA test cleanup"}, timeout=15,
        )
        assert rr.status_code == 200, rr.text

        # Verify back to Pending Approval
        p = _get_proposal(auth_headers)
        assert p.get("document_status") == "Pending Approval"
    finally:
        _cleanup_test_notes(auth_headers, created)
        pf = _get_proposal(auth_headers)
        assert pf.get("document_status") == "Pending Approval", pf.get("document_status")
        assert not pf.get("data_incomplete")


def test_data_incomplete_from_other_source_preserved(auth_headers):
    """If data_incomplete was set from a source other than open_questions,
    resolving all open questions must NOT clear the flag."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not available")
    client = MongoClient(mongo_url)
    coll = client[db_name].proposals

    # Pre-set a 'duplicate' source
    coll.update_one(
        {"proposal_id": PROPOSAL_ID},
        {"$set": {"data_incomplete": True, "data_incomplete_source": "duplicate"}},
    )
    sfx = uuid.uuid4().hex[:6]
    r = requests.post(
        f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes",
        headers=auth_headers,
        json={"body": f"TEST_otherSrc {sfx}", "category": "approval_question"},
        timeout=15,
    )
    assert r.status_code == 200
    nid = r.json()["note_id"]
    try:
        # Source should remain 'duplicate' (sync_open_questions only sets source when flag was false)
        p1 = _get_proposal(auth_headers)
        assert p1.get("data_incomplete") is True
        assert p1.get("data_incomplete_source") == "duplicate"
        assert p1.get("open_questions_count") == 1

        # Resolve the question → count 0; flag must stay set with source=duplicate
        rr = requests.post(
            f"{BASE_URL}/api/proposals/{PROPOSAL_ID}/notes/{nid}/resolve",
            headers=auth_headers, timeout=15,
        )
        assert rr.status_code == 200
        p2 = _get_proposal(auth_headers)
        assert p2.get("open_questions_count") == 0
        assert p2.get("data_incomplete") is True, "flag must be preserved when source != open_questions"
        assert p2.get("data_incomplete_source") == "duplicate"
    finally:
        _cleanup_test_notes(auth_headers, [nid])
        # Restore to clean state
        coll.update_one(
            {"proposal_id": PROPOSAL_ID},
            {"$set": {"data_incomplete": False, "data_incomplete_source": None}},
        )
        client.close()
