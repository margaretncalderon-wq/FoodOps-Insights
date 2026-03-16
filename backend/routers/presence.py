from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
from config import db
from models.auth import User
from routers.auth import get_current_user

presence_router = APIRouter(prefix="/presence", tags=["Presence"])

# Users are considered "online" if heartbeat was within last 60 seconds
ONLINE_THRESHOLD_SECONDS = 60


@presence_router.post("/heartbeat")
async def send_heartbeat(
    data: dict,
    user: User = Depends(get_current_user)
):
    """
    Send a presence heartbeat. Called every ~30s by the frontend.
    data: { page: str, entity_type?: str, entity_id?: str, entity_title?: str }
    """
    now = datetime.now(timezone.utc)
    company_id = user.company_id or user.active_org_id
    
    presence_doc = {
        "user_id": user.user_id,
        "company_id": company_id,
        "name": user.name or user.email,
        "email": user.email,
        "avatar": getattr(user, 'picture', None) or getattr(user, 'avatar', None),
        "page": data.get("page", ""),
        "entity_type": data.get("entity_type"),
        "entity_id": data.get("entity_id"),
        "entity_title": data.get("entity_title"),
        "org_id": data.get("org_id"),
        "last_seen": now.isoformat(),
        "is_online": True
    }
    
    await db.presence.update_one(
        {"user_id": user.user_id},
        {"$set": presence_doc},
        upsert=True
    )
    
    return {"ok": True}


@presence_router.get("/online")
async def get_online_users(
    org_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user)
):
    """Get all currently online users (within the last 60 seconds)"""
    threshold = (datetime.now(timezone.utc) - timedelta(seconds=ONLINE_THRESHOLD_SECONDS)).isoformat()
    company_id = org_id or user.company_id or user.active_org_id
    
    # Get users online across all orgs the current user has access to
    query = {
        "last_seen": {"$gte": threshold},
        "user_id": {"$ne": user.user_id}
    }
    
    online = await db.presence.find(query, {"_id": 0}).to_list(100)
    
    return {
        "online_users": online,
        "total": len(online)
    }


@presence_router.get("/entity/{entity_type}/{entity_id}")
async def get_entity_presence(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """Get users currently viewing/editing a specific entity"""
    threshold = (datetime.now(timezone.utc) - timedelta(seconds=ONLINE_THRESHOLD_SECONDS)).isoformat()
    
    query = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "last_seen": {"$gte": threshold},
        "user_id": {"$ne": user.user_id}
    }
    
    viewers = await db.presence.find(query, {"_id": 0}).to_list(50)
    
    return {
        "viewers": viewers,
        "count": len(viewers)
    }


@presence_router.post("/leave")
async def leave_entity(user: User = Depends(get_current_user)):
    """Clear entity-level presence (when closing a post dialog)"""
    await db.presence.update_one(
        {"user_id": user.user_id},
        {"$set": {"entity_type": None, "entity_id": None, "entity_title": None}}
    )
    return {"ok": True}
