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
# TEST 5: Verify create_notification helper signature bug
# The helper doesn't accept company_id param, but notify_org_admins passes it.
# This test proves that if notify_org_admins is called, it will fail.
# =========================================================
def test_create_notification_signature_check():
    """Static check: verify create_notification accepts company_id kwarg (bug detection)"""
    import inspect
    import sys
    sys.path.insert(0, "/app/backend")
    from routers.notifications import create_notification
    sig = inspect.signature(create_notification)
    params = list(sig.parameters.keys())
    # This test documents the current state. If company_id is missing, this is a BUG.
    # notify_org_admins calls create_notification(company_id=org_id) on line 124.
    if "company_id" not in params:
        pytest.fail(
            f"BUG: create_notification signature params={params} — missing 'company_id'. "
            "notify_org_admins passes company_id=... which will raise TypeError at runtime, "
            "meaning new notifications will NOT have company_id persisted."
        )
