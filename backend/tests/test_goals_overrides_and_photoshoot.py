"""
Regression test — Feb 2026.

Feature: Per-month target overrides + Photoshoot quick-log.

Verifies:
- Default targets apply when no override exists for the current month.
- Override for a specific month takes precedence over default.
- Reverting the override falls back to the default.
- Past months are read-only (endpoint returns 400 on write attempts).
- Photoshoot quick-log creates a countable post; undo removes it.
"""
import os, uuid, pytest
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


class FakeUser:
    def __init__(self, uid, cid):
        self.user_id = uid
        self.company_id = cid
        self.active_org_id = cid


@pytest.mark.asyncio
async def test_overrides_default_and_past_month_readonly():
    from config import db
    from routers.demand_studio import (
        get_goals_progress,
        set_monthly_targets,
        set_monthly_targets_override,
        clear_monthly_targets_override,
    )
    from fastapi import HTTPException

    tenant = f"t_ov_{uuid.uuid4().hex[:6]}"
    acc_id = f"acc_{uuid.uuid4().hex[:8]}"
    user = FakeUser(f"u_{uuid.uuid4().hex[:6]}", tenant)
    now_month = datetime.now(timezone.utc).strftime("%Y-%m")

    # Seed account
    await db.social_accounts.insert_one({
        "account_id": acc_id, "company_id": tenant,
        "platform": "instagram", "handle": "@test",
    })

    # Set default 5 reels
    await set_monthly_targets(acc_id, {"targets": {"reel": 5}}, org_id=None, user=user)
    prog = await get_goals_progress(month=now_month, org_id=None, include_shared=False, user=user)
    a = prog["accounts"][0]
    assert a["targets"] == {"reel": 5}
    assert a["targets_source"] == "default"

    # Set override 8 reels for the current month
    await set_monthly_targets_override(
        acc_id, now_month, {"targets": {"reel": 8}}, org_id=None, user=user,
    )
    prog = await get_goals_progress(month=now_month, org_id=None, include_shared=False, user=user)
    a = prog["accounts"][0]
    assert a["targets"] == {"reel": 8}, f"Override should win. Got: {a['targets']}"
    assert a["targets_source"] == "override"

    # A different (future) month still uses default
    fut = "2099-12"
    prog = await get_goals_progress(month=fut, org_id=None, include_shared=False, user=user)
    a = prog["accounts"][0]
    assert a["targets"] == {"reel": 5}
    assert a["targets_source"] == "default"

    # Revert
    await clear_monthly_targets_override(acc_id, now_month, org_id=None, user=user)
    prog = await get_goals_progress(month=now_month, org_id=None, include_shared=False, user=user)
    a = prog["accounts"][0]
    assert a["targets_source"] == "default"

    # Past month is read-only for writes but progress endpoint still returns data
    past = "2020-01"
    with pytest.raises(HTTPException) as exc:
        await set_monthly_targets_override(
            acc_id, past, {"targets": {"reel": 10}}, org_id=None, user=user,
        )
    assert exc.value.status_code == 400
    # Read still works
    prog_past = await get_goals_progress(month=past, org_id=None, include_shared=False, user=user)
    assert prog_past["accounts"][0]["is_past_month"] is True

    # Cleanup
    await db.social_accounts.delete_many({"company_id": tenant})


@pytest.mark.asyncio
async def test_photoshoot_quick_log_and_undo():
    from config import db
    from routers.demand_studio import (
        set_monthly_targets,
        photoshoot_quick_log,
        photoshoot_undo_quick_log,
        get_goals_progress,
    )

    tenant = f"t_ps_{uuid.uuid4().hex[:6]}"
    acc_id = f"acc_{uuid.uuid4().hex[:8]}"
    user = FakeUser(f"u_{uuid.uuid4().hex[:6]}", tenant)
    now_month = datetime.now(timezone.utc).strftime("%Y-%m")

    await db.social_accounts.insert_one({
        "account_id": acc_id, "company_id": tenant,
        "platform": "instagram", "handle": "@test",
    })
    await set_monthly_targets(acc_id, {"targets": {"photoshoot": 1}}, org_id=None, user=user)

    # Before: 0/1 photoshoot
    prog = await get_goals_progress(month=now_month, org_id=None, include_shared=False, user=user)
    a = prog["accounts"][0]
    assert a["actual"]["photoshoot"] == 0
    assert a["photoshoot_quick_logged"] is False

    # Quick log
    res = await photoshoot_quick_log(acc_id, {}, org_id=None, user=user)
    assert res["success"] is True
    post_id = res["post_id"]
    prog = await get_goals_progress(month=now_month, org_id=None, include_shared=False, user=user)
    a = prog["accounts"][0]
    assert a["actual"]["photoshoot"] == 1
    assert a["photoshoot_quick_logged"] is True
    assert a["photoshoot_quick_log_post_id"] == post_id
    assert a["health"]["photoshoot"] == "complete"

    # Undo
    res = await photoshoot_undo_quick_log(acc_id, now_month, org_id=None, user=user)
    assert res["success"] is True
    prog = await get_goals_progress(month=now_month, org_id=None, include_shared=False, user=user)
    assert prog["accounts"][0]["actual"]["photoshoot"] == 0
    assert prog["accounts"][0]["photoshoot_quick_logged"] is False

    # Cleanup
    await db.social_accounts.delete_many({"company_id": tenant})
    await db.social_posts.delete_many({"company_id": tenant})
