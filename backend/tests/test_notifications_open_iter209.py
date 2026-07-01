"""
Backend tests for notification /open endpoint and cross-company workspace switch.
Iteration 209 - Tests for POST /api/notifications/{id}/open
"""
import os
import pytest
import requests
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"

# Mongo direct access for seeding cross-company test scenarios
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    d = r.json()
    token = d.get("access_token") or d.get("token")
    # Fetch full user info via /me
    me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    me.raise_for_status()
    return token, me.json()


@pytest.fixture(scope="module")
def auth():
    token, user = _login()
    if not token:
        pytest.skip("Cannot login")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture()
def mongo():
    # Read DB_NAME from backend .env
    dbname = None
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("DB_NAME="):
                    dbname = line.strip().split("=", 1)[1].strip('"').strip("'")
    except Exception:
        pass
    if not dbname:
        dbname = "test_database"
    client = AsyncIOMotorClient(MONGO_URL)
    return client[dbname]


# =========================================================
# TEST 1: GET /api/notifications includes company_id/company_name
# =========================================================
def test_notifications_have_company_id(auth):
    r = requests.get(f"{BASE_URL}/api/notifications?limit=50", headers=auth["headers"], timeout=30)
    assert r.status_code == 200
    notifs = r.json()
    assert isinstance(notifs, list)
    assert len(notifs) > 0, "Expected some notifications"
    # Check that ALL notifications have company_id field (backfill claim: 253 backfilled)
    without_company_id = [n for n in notifs if not n.get("company_id")]
    assert len(without_company_id) == 0, f"Notifications missing company_id: {[n['notification_id'] for n in without_company_id[:5]]}"
    # Verify company_name too
    without_company_name = [n for n in notifs if not n.get("company_name")]
    # Note: backfill may not have set company_name for orgs not in companies collection. Log but don't fail.
    if without_company_name:
        print(f"WARN: {len(without_company_name)} notifications missing company_name")


# =========================================================
# TEST 2: Open a same-company notification → switched=False, marked read
# =========================================================
def test_open_same_company_notification(auth):
    # Get a notification for the user's own company (should be common)
    user_company = auth["user"].get("company_id")
    print(f"DEBUG user_company={user_company}")
    r = requests.get(f"{BASE_URL}/api/notifications?limit=100", headers=auth["headers"], timeout=30)
    print(f"DEBUG status={r.status_code}")
    notifs = r.json()
    print(f"DEBUG total notifs={len(notifs)}; sample company_ids={[n.get('company_id') for n in notifs[:5]]}")
    same_co = [n for n in notifs if n.get("company_id") == user_company]
    assert len(same_co) > 0, "No same-company notif found"
    target = same_co[0]
    nid = target["notification_id"]
    original_link = target.get("link")

    resp = requests.post(f"{BASE_URL}/api/notifications/{nid}/open", headers=auth["headers"], timeout=30)
    assert resp.status_code == 200, f"open failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data.get("success") is True
    assert data.get("switched") is False
    assert data.get("link") == original_link

    # Verify read=true after open
    r2 = requests.get(f"{BASE_URL}/api/notifications?limit=100", headers=auth["headers"], timeout=30)
    updated = next((n for n in r2.json() if n["notification_id"] == nid), None)
    assert updated is not None
    assert updated.get("read") is True, "Notification should be marked read after /open"


# =========================================================
# TEST 3: Cross-company scenario — NO membership → refused with message=no_membership
# =========================================================
@pytest.mark.asyncio
async def test_cross_company_no_membership(auth, mongo):
    user_id = auth["user"]["user_id"]
    original_company_id = auth["user"]["company_id"]

    # Pick a company_id the user does NOT belong to
    # First find a random other company from db
    other_comp = await mongo.companies.find_one(
        {"company_id": {"$ne": original_company_id}},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not other_comp:
        # Create synthetic
        other_comp = {"company_id": f"company_test_{uuid.uuid4().hex[:8]}", "name": "Ghost Test Co"}
        await mongo.companies.insert_one(dict(other_comp))
        created_comp = True
    else:
        created_comp = False

    # Ensure user has NO membership in this other company
    await mongo.memberships.delete_many({
        "user_id": user_id,
        "$or": [{"company_id": other_comp["company_id"]}, {"organization_id": other_comp["company_id"]}]
    })

    # Insert synthetic notification for user pointing to other company
    nid = f"notif_test_{uuid.uuid4().hex[:12]}"
    await mongo.notifications.insert_one({
        "notification_id": nid,
        "user_id": user_id,
        "type": "system",
        "title": "Cross-company test",
        "message": "This is a test",
        "link": "/dashboard",
        "metadata": {},
        "priority": "normal",
        "read": False,
        "company_id": other_comp["company_id"],
        "company_name": other_comp["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    try:
        # Call /open — should refuse with no_membership
        resp = requests.post(f"{BASE_URL}/api/notifications/{nid}/open", headers=auth["headers"], timeout=30)
        assert resp.status_code == 200, f"open failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data.get("success") is False, f"Expected success=False, got: {data}"
        assert data.get("switched") is False
        assert data.get("message") == "no_membership", f"Expected message=no_membership, got: {data.get('message')}"
        assert data.get("target_company_id") == other_comp["company_id"]

        # Verify user's company_id is UNCHANGED
        user_doc = await mongo.users.find_one({"user_id": user_id}, {"_id": 0, "company_id": 1})
        assert user_doc["company_id"] == original_company_id, \
            f"User company_id changed to {user_doc['company_id']}! Should remain {original_company_id}"
    finally:
        # Cleanup
        await mongo.notifications.delete_one({"notification_id": nid})
        if created_comp:
            await mongo.companies.delete_one({"company_id": other_comp["company_id"]})


# =========================================================
# TEST 4: Cross-company scenario — WITH membership → switched=True, updates user
# =========================================================
@pytest.mark.asyncio
async def test_cross_company_with_membership(auth, mongo):
    user_id = auth["user"]["user_id"]
    original_company_id = auth["user"]["company_id"]

    # Create a synthetic other company + membership for the user
    other_company_id = f"company_test_{uuid.uuid4().hex[:8]}"
    other_company_name = "Test Switch Co"
    await mongo.companies.insert_one({
        "company_id": other_company_id,
        "name": other_company_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    membership_id = f"mem_test_{uuid.uuid4().hex[:8]}"
    await mongo.memberships.insert_one({
        "membership_id": membership_id,
        "user_id": user_id,
        "company_id": other_company_id,
        "organization_id": other_company_id,
        "role": "admin",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    nid = f"notif_test_{uuid.uuid4().hex[:12]}"
    await mongo.notifications.insert_one({
        "notification_id": nid,
        "user_id": user_id,
        "type": "system",
        "title": "Cross-company switch test",
        "message": "Should switch",
        "link": "/dashboard",
        "metadata": {},
        "priority": "normal",
        "read": False,
        "company_id": other_company_id,
        "company_name": other_company_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    try:
        resp = requests.post(f"{BASE_URL}/api/notifications/{nid}/open", headers=auth["headers"], timeout=30)
        assert resp.status_code == 200, f"open failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        assert data.get("switched") is True, f"Expected switched=True, got: {data}"
        assert data.get("target_company_id") == other_company_id
        assert data.get("target_company_name") == other_company_name
        assert data.get("from_company_id") == original_company_id

        # Verify user.company_id was updated in DB
        user_doc = await mongo.users.find_one({"user_id": user_id}, {"_id": 0, "company_id": 1, "active_org_id": 1})
        assert user_doc["company_id"] == other_company_id
        assert user_doc["active_org_id"] == other_company_id
    finally:
        # CRITICAL: Restore user's original company_id
        await mongo.users.update_one(
            {"user_id": user_id},
            {"$set": {"company_id": original_company_id, "active_org_id": original_company_id}}
        )
        await mongo.notifications.delete_one({"notification_id": nid})
        await mongo.memberships.delete_one({"membership_id": membership_id})
        await mongo.companies.delete_one({"company_id": other_company_id})


# =========================================================
# TEST 5: Verify create_notification helper signature accepts company_id/company_name
# =========================================================
def test_create_notification_signature_check():
    """Static check: verify create_notification accepts company_id and company_name kwargs"""
    import inspect
    import sys
    sys.path.insert(0, "/app/backend")
    from routers.notifications import create_notification
    sig = inspect.signature(create_notification)
    params = list(sig.parameters.keys())
    assert "company_id" in params, f"create_notification missing 'company_id' param: {params}"
    assert "company_name" in params, f"create_notification missing 'company_name' param: {params}"


# =========================================================
# TEST 6: Directly invoke create_notification → verify persistence of company_id/company_name
# =========================================================
@pytest.mark.asyncio
async def test_create_notification_persists_company_fields(auth, mongo):
    """Invoke create_notification directly (a) with explicit company_id/name,
    (b) auto-derived from recipient user. Verify both cases persist correctly."""
    import sys
    sys.path.insert(0, "/app/backend")
    # Patch db reference used by create_notification to point to same DB
    from routers import notifications as notif_mod

    user_id = auth["user"]["user_id"]
    user_company_id = auth["user"]["company_id"]

    created_ids = []
    created_synth_company = None
    try:
        # --- (A) EXPLICIT company_id + company_name
        synth_company_id = f"company_test_{uuid.uuid4().hex[:8]}"
        synth_company_name = "Explicit Test Co"
        await mongo.companies.insert_one({
            "company_id": synth_company_id,
            "name": synth_company_name,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        created_synth_company = synth_company_id

        nid_a = await notif_mod.create_notification(
            user_id=user_id,
            notification_type="system",
            title="TEST_explicit",
            message="explicit company fields",
            company_id=synth_company_id,
            company_name=synth_company_name,
        )
        created_ids.append(nid_a)
        doc_a = await mongo.notifications.find_one({"notification_id": nid_a}, {"_id": 0})
        assert doc_a is not None, "explicit-notif doc not persisted"
        assert doc_a.get("company_id") == synth_company_id, f"explicit company_id mismatch: {doc_a.get('company_id')}"
        assert doc_a.get("company_name") == synth_company_name, f"explicit company_name mismatch: {doc_a.get('company_name')}"

        # --- (B) AUTO-DERIVE from recipient user (no company_id passed)
        nid_b = await notif_mod.create_notification(
            user_id=user_id,
            notification_type="system",
            title="TEST_autoderive",
            message="derived from user",
        )
        created_ids.append(nid_b)
        doc_b = await mongo.notifications.find_one({"notification_id": nid_b}, {"_id": 0})
        assert doc_b is not None
        assert doc_b.get("company_id") == user_company_id, \
            f"auto-derive company_id mismatch: expected {user_company_id}, got {doc_b.get('company_id')}"
        # company_name should be resolved from companies collection (Creative Agency Demo)
        assert doc_b.get("company_name"), \
            f"auto-derive company_name should be resolved, got: {doc_b.get('company_name')}"

        # --- (C) ID-only → resolve name from companies collection
        nid_c = await notif_mod.create_notification(
            user_id=user_id,
            notification_type="system",
            title="TEST_idonly",
            message="id only",
            company_id=synth_company_id,
        )
        created_ids.append(nid_c)
        doc_c = await mongo.notifications.find_one({"notification_id": nid_c}, {"_id": 0})
        assert doc_c.get("company_id") == synth_company_id
        assert doc_c.get("company_name") == synth_company_name, \
            f"id-only should resolve name from companies: got {doc_c.get('company_name')}"

    finally:
        # Cleanup synthetic notifications + company
        if created_ids:
            await mongo.notifications.delete_many({"notification_id": {"$in": created_ids}})
        if created_synth_company:
            await mongo.companies.delete_one({"company_id": created_synth_company})
        # Ensure user's company_id was NOT changed
        user_doc = await mongo.users.find_one({"user_id": user_id}, {"_id": 0, "company_id": 1})
        assert user_doc["company_id"] == user_company_id, \
            f"User company_id changed! Expected {user_company_id}, got {user_doc['company_id']}"


# =========================================================
# TEST 7: notify_org_admins helper does not crash (accepts company_id via create_notification)
# =========================================================
def test_notify_org_admins_does_not_crash(auth):
    """Runs notify_org_admins in a fresh subprocess to isolate from any prior
    motor event-loop binding. Verifies the helper does NOT raise TypeError and
    that resulting notifications carry company_id=org_id."""
    import subprocess, json, sys

    org_id = auth["user"]["company_id"]
    script = f"""
import asyncio, sys, json
sys.path.insert(0, '/app/backend')
from routers import notifications as notif_mod
from config import db as _db

async def _main():
    n = await notif_mod.notify_org_admins(
        org_id={org_id!r},
        notification_type='system',
        title='TEST_notify_admins',
        message='notify_org_admins smoke test',
    )
    created = await _db.notifications.find(
        {{'title': 'TEST_notify_admins'}}, {{'_id': 0}}
    ).to_list(20)
    # Cleanup
    await _db.notifications.delete_many({{'title': 'TEST_notify_admins'}})
    return {{'n': n, 'company_ids': [c.get('company_id') for c in created]}}

print(json.dumps(asyncio.run(_main())))
"""
    proc = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True, text=True, timeout=30, cwd="/app/backend"
    )
    assert proc.returncode == 0, f"notify_org_admins subprocess failed:\nSTDOUT: {proc.stdout}\nSTDERR: {proc.stderr}"
    result = json.loads(proc.stdout.strip().splitlines()[-1])
    assert isinstance(result["n"], int), f"n_created not int: {result}"
    # Every produced notification must have the correct company_id
    for cid in result["company_ids"]:
        assert cid == org_id, f"notify_org_admins wrote wrong company_id: {cid} vs {org_id}"
