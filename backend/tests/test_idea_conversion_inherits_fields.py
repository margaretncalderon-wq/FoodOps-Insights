"""
Regression test — Feb 2026.

Verifies that when a content idea is converted to a social post:
1. The idea's `format` (reel/carousel/story/etc.) is inherited by the post,
   NOT hardcoded to "post".
2. `segment_id`, `audience_id`, `tags`, `pillar_id`, `content_body` all carry
   over. Nothing is silently dropped.
3. The idea gets marked `status="used"` with `used_at` and `used_as_post_id`.
4. `source_idea_id` on the post lets us trace it back.
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
async def test_convert_idea_to_post_inherits_all_fields():
    from config import db
    from routers.demand_studio import convert_idea_to_post

    tenant = f"t_conv_{uuid.uuid4().hex[:6]}"
    user = FakeUser(f"u_{uuid.uuid4().hex[:6]}", tenant)
    idea_id = f"idea_{uuid.uuid4().hex[:12]}"
    account_id = f"acc_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.social_accounts.insert_one({
        "account_id": account_id, "company_id": tenant,
        "platform": "instagram", "handle": "@test",
    })
    await db.content_ideas.insert_one({
        "idea_id": idea_id, "company_id": tenant,
        "title": "Detrás de las cámaras: shooting de pastas",
        "description": "Video mostrando la elaboración artesanal",
        "source_url": "https://inspiration.example/reel123",
        "pillar_id": "pillar_recetas",
        "segment_id": "segment_foodies",
        "audience_id": "audience_millennials",
        "social_account_id": account_id,
        "format": "reel",  # ← key test: this MUST carry over
        "tags": ["pastas", "artisanal", "bts"],
        "status": "approved",
        "content_body": "<p>Script del reel...</p>",
        "created_by_user_id": user.user_id,
        "created_at": now, "updated_at": now,
    })

    result = await convert_idea_to_post(
        idea_id=idea_id,
        social_account_id=account_id,
        target_status="production",
        org_id=None,
        user=user,
    )

    # Field inheritance
    assert result["format"] == "reel", f"format should be inherited as 'reel', got '{result['format']}'"
    assert result["title"] == "Detrás de las cámaras: shooting de pastas"
    assert result["pillar_id"] == "pillar_recetas"
    assert result["segment_id"] == "segment_foodies"
    assert result["audience_id"] == "audience_millennials"
    assert result["tags"] == ["pastas", "artisanal", "bts"]
    assert result["content_body"] == "<p>Script del reel...</p>"
    assert result["link_url"] == "https://inspiration.example/reel123"
    assert result["caption"] == "Video mostrando la elaboración artesanal"
    assert result["source_idea_id"] == idea_id
    assert result["status"] == "production"

    # Idea marked used
    idea_after = await db.content_ideas.find_one({"idea_id": idea_id}, {"_id": 0})
    assert idea_after["status"] == "used"
    assert idea_after.get("used_at") is not None
    assert idea_after.get("used_as_post_id") == result["post_id"]

    # Idea without format falls back to "post"
    fallback_id = f"idea_{uuid.uuid4().hex[:12]}"
    await db.content_ideas.insert_one({
        "idea_id": fallback_id, "company_id": tenant,
        "title": "Idea sin formato específico",
        "status": "new", "created_by_user_id": user.user_id,
        "created_at": now, "updated_at": now,
    })
    result2 = await convert_idea_to_post(
        idea_id=fallback_id, social_account_id=account_id,
        target_status="production", org_id=None, user=user,
    )
    assert result2["format"] == "post", (
        f"Idea without format should fallback to 'post', got '{result2['format']}'"
    )

    # Cleanup
    await db.social_accounts.delete_many({"company_id": tenant})
    await db.content_ideas.delete_many({"company_id": tenant})
    await db.social_posts.delete_many({"company_id": tenant})
