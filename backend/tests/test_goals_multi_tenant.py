"""
Multi-tenant regression test for the Monthly Content Goals feature.

Scenario: an agency (Kora Agency, own company) has a shared account
"Ciano Bites" from a client org where they are a member. The goals-progress
endpoint must:

1. When called WITHOUT org_id and WITHOUT include_shared → only return
   accounts from the agency's OWN company. Ciano Bites hidden.
2. When called WITHOUT org_id and WITH include_shared=true → return
   both agency-owned AND all shared org accounts, correctly tagged.
3. When called WITH org_id=ciano_bites_company → only Ciano Bites shows.
4. When the user has NO membership in an org they shouldn't see any of
   that org's accounts even with include_shared=true.
"""
import os, uuid, pytest
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


@pytest.mark.asyncio
async def test_goals_multi_tenant_isolation_and_shared_visibility():
    from config import db
    from routers.demand_studio import get_goals_progress

    # Two isolated tenants
    kora_agency_id = f"t_kora_{uuid.uuid4().hex[:8]}"
    ciano_bites_id = f"t_cb_{uuid.uuid4().hex[:8]}"
    outsider_id = f"t_out_{uuid.uuid4().hex[:8]}"

    # Users
    agency_user_id = f"u_agency_{uuid.uuid4().hex[:6]}"
    outsider_user_id = f"u_out_{uuid.uuid4().hex[:6]}"
    now = datetime.now(timezone.utc).isoformat()

    # Seed accounts under three separate companies
    await db.social_accounts.insert_many([
        {"account_id": "acc_kora_ig", "company_id": kora_agency_id,
         "platform": "instagram", "handle": "@kora",
         "monthly_targets": {"reel": 4, "carousel": 4}},
        {"account_id": "acc_ciano_ig", "company_id": ciano_bites_id,
         "platform": "instagram", "handle": "@ciano_bites",
         "monthly_targets": {"reel": 5, "carousel": 4, "photoshoot": 1}},
        {"account_id": "acc_outsider_ig", "company_id": outsider_id,
         "platform": "instagram", "handle": "@outsider",
         "monthly_targets": {"reel": 3}},
    ])

    # Agency user is member of Ciano Bites' org (shared), but NOT outsider's
    await db.memberships.insert_one({
        "user_id": agency_user_id, "company_id": ciano_bites_id,
        "role": "editor", "status": "active",
    })

    # Fake user objects (only the attrs the endpoint reads)
    class FakeUser:
        def __init__(self, uid, cid):
            self.user_id = uid
            self.company_id = cid
            self.active_org_id = cid

    agency_user = FakeUser(agency_user_id, kora_agency_id)
    outsider_user = FakeUser(outsider_user_id, outsider_id)

    # Case 1: no org, no include_shared → only own accounts
    res1 = await get_goals_progress(month="2026-02", org_id=None, include_shared=False, user=agency_user)
    ids1 = {a["account_id"] for a in res1["accounts"]}
    assert ids1 == {"acc_kora_ig"}, (
        f"Case 1 leak: expected only own accounts, got {ids1}"
    )

    # Case 2: no org, include_shared=true → own + shared, correctly tagged
    res2 = await get_goals_progress(month="2026-02", org_id=None, include_shared=True, user=agency_user)
    ids2 = {a["account_id"] for a in res2["accounts"]}
    assert "acc_kora_ig" in ids2 and "acc_ciano_ig" in ids2, (
        f"Case 2: expected both accounts visible, got {ids2}"
    )
    assert "acc_outsider_ig" not in ids2, (
        f"Case 2 CRITICAL LEAK: outsider account visible without membership! Got {ids2}"
    )
    tags2 = {a["account_id"]: a["_access_type"] for a in res2["accounts"]}
    assert tags2["acc_kora_ig"] == "owned"
    assert tags2["acc_ciano_ig"] == "shared", f"Ciano bites should be tagged 'shared', got {tags2}"

    # Case 3: specific org_id (Ciano Bites)
    res3 = await get_goals_progress(month="2026-02", org_id=ciano_bites_id, user=agency_user)
    ids3 = {a["account_id"] for a in res3["accounts"]}
    assert ids3 == {"acc_ciano_ig"}, (
        f"Case 3: expected only Ciano Bites, got {ids3}"
    )

    # Case 4: outsider tries to access agency's org — must be blocked
    res4 = await get_goals_progress(month="2026-02", org_id=kora_agency_id, user=outsider_user)
    ids4 = {a["account_id"] for a in res4["accounts"]}
    assert ids4 == set(), (
        f"Case 4 CRITICAL LEAK: outsider accessed agency accounts! Got {ids4}"
    )

    # Cleanup
    await db.social_accounts.delete_many({"company_id": {"$in": [kora_agency_id, ciano_bites_id, outsider_id]}})
    await db.memberships.delete_many({"user_id": {"$in": [agency_user_id, outsider_user_id]}})
