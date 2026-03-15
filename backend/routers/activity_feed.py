# routers/activity_feed.py - Activity Feed for Social Media
"""
Activity feed system to track changes in social media accounts.
Shows recent activity like posts created, edited, approved, etc.
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from config import db
from models.auth import User
from routers.auth import get_current_user

activity_feed_router = APIRouter(prefix="/activity-feed", tags=["Activity Feed"])


class ActivityEntry(BaseModel):
    activity_type: str  # post_created, post_edited, post_approved, post_rejected, idea_created, etc.
    entity_type: str    # post, idea, account
    entity_id: str
    description: str
    metadata: dict = {}


async def log_activity(
    company_id: str,
    user_id: str,
    user_name: str,
    activity_type: str,
    entity_type: str,
    entity_id: str,
    description: str,
    account_id: str = None,
    metadata: dict = None
):
    """
    Log an activity to the feed.
    Called from other routers when actions happen.
    """
    activity = {
        "company_id": company_id,
        "user_id": user_id,
        "user_name": user_name,
        "activity_type": activity_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "description": description,
        "account_id": account_id,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.social_activity_feed.insert_one(activity)
    return activity


@activity_feed_router.get("/recent")
async def get_recent_activity(
    account_id: Optional[str] = None,
    org_id: Optional[str] = None,
    limit: int = Query(default=20, le=50),
    days: int = Query(default=7, le=30),
    user: User = Depends(get_current_user)
):
    """
    Get recent activity for the user's accounts.
    Shows activity from owned accounts and accounts shared with the user.
    Supports org_id for viewing shared organization activity.
    """
    # Determine target company
    if org_id:
        membership = await db.memberships.find_one({
            "user_id": user.user_id,
            "$or": [{"company_id": org_id}, {"organization_id": org_id}],
            "status": "active"
        })
        company_id = org_id if membership else (user.company_id or user.active_org_id)
    else:
        company_id = user.company_id or user.active_org_id
    
    if not company_id:
        return []
    
    # Calculate date threshold
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    # Build query
    query = {
        "created_at": {"$gte": since}
    }
    
    if account_id:
        # Filter by specific account
        query["account_id"] = account_id
    else:
        # Get all accounts the user has access to
        # 1. Owned accounts for the target company
        owned_accounts = await db.social_accounts.find(
            {"company_id": company_id},
            {"account_id": 1}
        ).to_list(100)
        owned_ids = [a["account_id"] for a in owned_accounts]
        
        # 2. Shared accounts (only if not already in org context)
        shared_ids = []
        if not org_id:
            memberships = await db.account_memberships.find({
                "user_id": user.user_id,
                "status": "active"
            }).to_list(100)
            shared_ids = [m["social_account_id"] for m in memberships]
        
        # Combine
        all_account_ids = list(set(owned_ids + shared_ids))
        
        if all_account_ids:
            query["$or"] = [
                {"account_id": {"$in": all_account_ids}},
                {"company_id": company_id, "account_id": None}  # Company-wide activities
            ]
        else:
            query["company_id"] = company_id
    
    # Fetch activities
    activities = await db.social_activity_feed.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Enrich with account info
    account_ids = list(set(a.get("account_id") for a in activities if a.get("account_id")))
    if account_ids:
        accounts = await db.social_accounts.find(
            {"account_id": {"$in": account_ids}},
            {"_id": 0, "account_id": 1, "handle": 1, "platform": 1}
        ).to_list(100)
        accounts_map = {a["account_id"]: a for a in accounts}
        
        for activity in activities:
            if activity.get("account_id"):
                activity["account"] = accounts_map.get(activity["account_id"])
    
    return activities


@activity_feed_router.get("/stats")
async def get_activity_stats(
    days: int = Query(default=7, le=30),
    user: User = Depends(get_current_user)
):
    """Get activity statistics for the dashboard"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"total": 0, "by_type": {}}
    
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    # Get owned account IDs
    owned_accounts = await db.social_accounts.find(
        {"company_id": company_id},
        {"account_id": 1}
    ).to_list(100)
    owned_ids = [a["account_id"] for a in owned_accounts]
    
    # Count by type
    pipeline = [
        {"$match": {
            "created_at": {"$gte": since},
            "$or": [
                {"account_id": {"$in": owned_ids}},
                {"company_id": company_id}
            ]
        }},
        {"$group": {
            "_id": "$activity_type",
            "count": {"$sum": 1}
        }}
    ]
    
    results = await db.social_activity_feed.aggregate(pipeline).to_list(20)
    
    by_type = {r["_id"]: r["count"] for r in results}
    total = sum(by_type.values())
    
    return {
        "total": total,
        "by_type": by_type,
        "days": days
    }
