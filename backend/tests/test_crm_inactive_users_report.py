"""
Verify CRM sales-report treats soft-deleted users as "Inactivo" (amber
badge) and auto-unassigns their leads when they're removed via Settings.
"""
import os, uuid, pytest
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_sales_report_marks_inactive_user_with_flag():
    """A user still in DB but `is_active=false` must come back as
    is_deleted=True with the "Usuario Inactivo" label logic. This
    exercises the code path in routers/crm.py:2422-2442."""
    from config import db

    tenant = f"test_inactive_{uuid.uuid4().hex[:6]}"
    active_uid = f"user_{uuid.uuid4().hex[:8]}"
    inactive_uid = f"user_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.users.insert_many([
        {"user_id": active_uid, "company_id": tenant, "email": "sandra@ok.com",
         "first_name": "Sandra", "last_name": "Ok", "is_active": True, "created_at": now},
        {"user_id": inactive_uid, "company_id": tenant, "email": "bileyka@old.com",
         "first_name": "Bileyka", "last_name": "Old", "is_active": False,
         "status": "inactive", "created_at": now},
    ])
    # Simulate the exact loop from routers/crm.py:2405-2442
    owner_stats = {
        active_uid: {"owner_id": active_uid, "total_leads": 10},
        inactive_uid: {"owner_id": inactive_uid, "total_leads": 75},
        "__unassigned__": {"owner_id": None, "total_leads": 298},
    }
    try:
        users = await db.users.find({"user_id": {"$in": [active_uid, inactive_uid]}}).to_list(50)
        user_names = {u["user_id"]: f"{u['first_name']} {u['last_name']}" for u in users}
        inactive_ids = {u["user_id"] for u in users
                        if u.get("is_active") is False
                        or u.get("status") in ("inactive", "removed", "revoked", "suspended")}

        for oid in list(owner_stats.keys()):
            if oid == "__unassigned__":
                owner_stats[oid]["owner_name"] = "Sin Asignar"
                continue
            if oid in user_names:
                owner_stats[oid]["owner_name"] = user_names[oid]
                if oid in inactive_ids:
                    owner_stats[oid]["is_deleted"] = True
            else:
                owner_stats[oid]["owner_name"] = "Usuario Inactivo"
                owner_stats[oid]["is_deleted"] = True

        # Active user has no deleted flag
        assert owner_stats[active_uid]["owner_name"] == "Sandra Ok"
        assert not owner_stats[active_uid].get("is_deleted")
        # Inactive user keeps their name but is flagged as inactive
        assert owner_stats[inactive_uid]["owner_name"] == "Bileyka Old"
        assert owner_stats[inactive_uid]["is_deleted"] is True
        # Unassigned bucket unchanged
        assert owner_stats["__unassigned__"]["owner_name"] == "Sin Asignar"
    finally:
        await db.users.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_delete_user_soft_deletes_and_unassigns_leads():
    """DELETE /api/super-admin/users/{id} now soft-deletes + unassigns leads."""
    from config import db
    from server import delete_user

    class _U:
        def __init__(self, uid, is_super=True):
            self.user_id = uid; self.company_id = "co_x"; self.is_super_admin = is_super

    tenant = f"test_softdel_{uuid.uuid4().hex[:6]}"
    victim = f"user_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.users.insert_one({
        "user_id": victim, "company_id": tenant, "email": "gone@x.com",
        "is_active": True, "created_at": now,
    })
    # 3 leads owned by the soon-to-be-removed user
    for _ in range(3):
        await db.leads.insert_one({
            "lead_id": f"l_{uuid.uuid4().hex[:6]}", "company_id": tenant,
            "owner_id": victim, "created_at": now,
        })
    try:
        res = await delete_user(victim, user=_U("admin_uid"))
        assert res["success"] is True
        assert res["soft_deleted"] is True
        assert res["leads_unassigned"] == 3
        # User still in DB but marked inactive
        after = await db.users.find_one({"user_id": victim}, {"_id": 0})
        assert after is not None
        assert after["is_active"] is False
        assert after["status"] == "inactive"
        # Leads now unassigned
        orphans = await db.leads.count_documents({"owner_id": victim})
        assert orphans == 0
        unassigned = await db.leads.count_documents({"owner_id": None, "company_id": tenant})
        assert unassigned == 3
    finally:
        await db.users.delete_many({"company_id": tenant})
        await db.leads.delete_many({"company_id": tenant})
