"""Tests for proposal notes (bitácora): CRUD + attachments + reactions + pin."""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not BASE_URL.startswith("http"):
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def existing_proposal(auth_headers):
    r = requests.get(f"{BASE_URL}/api/events", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    events = r.json() if isinstance(r.json(), list) else r.json().get("events", [])
    for ev in events:
        rp = requests.get(f"{BASE_URL}/api/proposals/event/{ev['event_id']}", headers=auth_headers, timeout=10)
        if rp.status_code == 200 and rp.json().get("proposal_id"):
            return rp.json()["proposal_id"]
    pytest.skip("no proposal available")


def test_create_list_delete_note(auth_headers, existing_proposal):
    sfx = uuid.uuid4().hex[:6]
    body = f"Nota de prueba {sfx}: cliente pidió cambiar hora al evento"
    r = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes",
        headers=auth_headers,
        json={"body": body, "category": "client_request", "visibility": "internal_only"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    note = r.json()
    assert note["note_id"]
    assert note["category"] == "client_request"
    assert note["body"] == body

    # List
    rl = requests.get(f"{BASE_URL}/api/proposals/{existing_proposal}/notes", headers=auth_headers, timeout=15)
    assert rl.status_code == 200
    ids = [n["note_id"] for n in rl.json()["notes"]]
    assert note["note_id"] in ids

    # Filter by category
    rf = requests.get(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes?category=client_request",
        headers=auth_headers, timeout=15,
    )
    assert rf.status_code == 200
    assert all(n["category"] == "client_request" for n in rf.json()["notes"])

    # Delete (soft)
    rd = requests.delete(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note['note_id']}",
        headers=auth_headers, timeout=15,
    )
    assert rd.status_code == 200

    # Verify gone
    rl2 = requests.get(f"{BASE_URL}/api/proposals/{existing_proposal}/notes", headers=auth_headers, timeout=15)
    assert note["note_id"] not in [n["note_id"] for n in rl2.json()["notes"]]


def test_pin_and_edit_note(auth_headers, existing_proposal):
    sfx = uuid.uuid4().hex[:6]
    r = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes",
        headers=auth_headers,
        json={"body": f"Pinnable {sfx}", "category": "internal"},
        timeout=15,
    )
    note_id = r.json()["note_id"]

    # Pin
    rp = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note_id}/pin",
        headers=auth_headers, timeout=15,
    )
    assert rp.status_code == 200
    assert rp.json()["pinned"] is True

    # Edit
    new_body = f"Pinnable edited {sfx}"
    re_ = requests.put(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note_id}",
        headers=auth_headers,
        json={"body": new_body, "category": "meeting"},
        timeout=15,
    )
    assert re_.status_code == 200
    assert re_.json()["body"] == new_body
    assert re_.json()["category"] == "meeting"
    assert re_.json()["edited_at"] is not None

    # Cleanup
    requests.delete(f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note_id}", headers=auth_headers, timeout=10)


def test_reactions_toggle(auth_headers, existing_proposal):
    sfx = uuid.uuid4().hex[:6]
    r = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes",
        headers=auth_headers,
        json={"body": f"React {sfx}", "category": "internal"},
        timeout=15,
    )
    note_id = r.json()["note_id"]

    rr = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note_id}/reactions",
        headers=auth_headers,
        json={"emoji": "👍"},
        timeout=15,
    )
    assert rr.status_code == 200
    assert len(rr.json()["reactions"]) == 1

    # Toggle off
    rr2 = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note_id}/reactions",
        headers=auth_headers,
        json={"emoji": "👍"},
        timeout=15,
    )
    assert rr2.status_code == 200
    assert len(rr2.json()["reactions"]) == 0

    requests.delete(f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note_id}", headers=auth_headers, timeout=10)


def test_attachment_upload_and_reference(auth_headers, existing_proposal):
    sfx = uuid.uuid4().hex[:6]
    headers_no_ct = {k: v for k, v in auth_headers.items() if k.lower() != "content-type"}
    files = {"file": (f"test_{sfx}.txt", io.BytesIO(b"hello bitacora"), "text/plain")}
    ra = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/attachments",
        headers=headers_no_ct,
        files=files,
        timeout=30,
    )
    # Storage may be unavailable in some envs; if so skip gracefully.
    if ra.status_code == 503:
        pytest.skip("Object storage not available in this environment")
    assert ra.status_code == 200, ra.text
    att_id = ra.json()["attachment_id"]

    # Reference it in a note
    rn = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes",
        headers=auth_headers,
        json={"body": f"Con adjunto {sfx}", "category": "internal", "attachment_ids": [att_id]},
        timeout=15,
    )
    assert rn.status_code == 200, rn.text
    note = rn.json()
    assert att_id in note["attachment_ids"]

    # List notes → attachment should be hydrated
    rl = requests.get(f"{BASE_URL}/api/proposals/{existing_proposal}/notes", headers=auth_headers, timeout=15)
    found = next((n for n in rl.json()["notes"] if n["note_id"] == note["note_id"]), None)
    assert found and len(found["attachments"]) == 1
    assert found["attachments"][0]["original_filename"] == f"test_{sfx}.txt"

    # Download it
    rd = requests.get(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes/attachments/{att_id}",
        headers=auth_headers, timeout=30,
    )
    assert rd.status_code == 200
    assert rd.content == b"hello bitacora"

    requests.delete(f"{BASE_URL}/api/proposals/{existing_proposal}/notes/{note['note_id']}", headers=auth_headers, timeout=10)


def test_validations(auth_headers, existing_proposal):
    # Invalid category
    r = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes",
        headers=auth_headers,
        json={"body": "x", "category": "bogus"},
        timeout=10,
    )
    assert r.status_code == 400

    # Invalid visibility
    r = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/notes",
        headers=auth_headers,
        json={"body": "x", "visibility": "bogus"},
        timeout=10,
    )
    assert r.status_code == 400

    # Nonexistent proposal → 404
    r = requests.get(f"{BASE_URL}/api/proposals/prop_nonexistent/notes", headers=auth_headers, timeout=10)
    assert r.status_code == 404
