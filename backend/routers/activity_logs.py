# routers/activity_logs.py - Activity Logs API Router
from fastapi import APIRouter, Depends, Query
from typing import Optional, List

from dependencies import get_current_user, User
from utils.activity_logger import get_activity_logs, get_entity_history

activity_logs_router = APIRouter(prefix="/activity-logs", tags=["Activity Logs"])


@activity_logs_router.get("/")
async def list_activity_logs(
    module: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    event_id: Optional[str] = None,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    org_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user)
):
    """
    Get activity logs with optional filters.
    Supports org_id for viewing shared organization logs.
    """
    # Determine which company_id to query
    target_company_id = user.company_id
    
    if org_id and org_id != user.company_id:
        # Verify user has membership to this org
        from config import db
        membership = await db.memberships.find_one({
            "user_id": user.user_id,
            "$or": [{"company_id": org_id}, {"organization_id": org_id}],
            "status": "active"
        })
        if membership:
            target_company_id = org_id
    
    logs = await get_activity_logs(
        company_id=target_company_id,
        module=module,
        entity_type=entity_type,
        entity_id=entity_id,
        event_id=event_id,
        user_id=user_id,
        action=action,
        limit=limit,
        skip=skip
    )
    return logs


@activity_logs_router.get("/entity/{entity_type}/{entity_id}")
async def get_entity_activity_history(
    entity_type: str,
    entity_id: str,
    org_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(get_current_user)
):
    """
    Get complete activity history for a specific entity.
    Supports org_id for shared organization context.
    """
    target_company_id = user.company_id
    
    if org_id and org_id != user.company_id:
        from config import db
        membership = await db.memberships.find_one({
            "user_id": user.user_id,
            "$or": [{"company_id": org_id}, {"organization_id": org_id}],
            "status": "active"
        })
        if membership:
            target_company_id = org_id
    
    logs = await get_entity_history(
        company_id=target_company_id,
        entity_type=entity_type,
        entity_id=entity_id,
        limit=limit
    )
    return logs


@activity_logs_router.get("/modules")
async def get_available_modules(
    user: User = Depends(get_current_user)
):
    """
    Get list of modules that have activity logs.
    """
    return {
        "modules": [
            {"id": "auth", "name": "Authentication", "icon": "🔐"},
            {"id": "crm", "name": "Client Management", "icon": "👥"},
            {"id": "events", "name": "Events", "icon": "📅"},
            {"id": "room_setup", "name": "Room Setup", "icon": "🚪"},
            {"id": "locations", "name": "Venues & Locations", "icon": "📍"},
            {"id": "execution_hub", "name": "Execution Hub", "icon": "🎯"},
            {"id": "demand_studio", "name": "Demand Studio", "icon": "📊"},
            {"id": "business_clarity", "name": "Business Clarity", "icon": "💰"},
            {"id": "addons", "name": "Add-ons", "icon": "🧩"},
            {"id": "culinary", "name": "Culinary Intelligence", "icon": "🍳"},
            {"id": "operations", "name": "Operations Supplies", "icon": "📦"},
            {"id": "settings", "name": "Settings", "icon": "⚙️"},
        ]
    }


@activity_logs_router.get("/actions")
async def get_available_actions(
    user: User = Depends(get_current_user)
):
    """
    Get list of action types.
    """
    return {
        "actions": [
            {"id": "create", "name": "Created", "icon": "➕", "color": "green"},
            {"id": "update", "name": "Updated", "icon": "✏️", "color": "amber"},
            {"id": "delete", "name": "Deleted", "icon": "🗑️", "color": "red"},
            {"id": "move", "name": "Moved", "icon": "↔️", "color": "blue"},
            {"id": "resize", "name": "Resized", "icon": "↕️", "color": "purple"},
            {"id": "assign", "name": "Assigned", "icon": "👤", "color": "cyan"},
            {"id": "unassign", "name": "Unassigned", "icon": "👤", "color": "gray"},
            {"id": "complete", "name": "Completed", "icon": "✅", "color": "green"},
            {"id": "approve", "name": "Approved", "icon": "👍", "color": "green"},
            {"id": "reject", "name": "Rejected", "icon": "👎", "color": "red"},
            {"id": "status_change", "name": "Status Changed", "icon": "🔄", "color": "blue"},
            {"id": "copy", "name": "Copied", "icon": "📋", "color": "blue"},
            {"id": "archive", "name": "Archived", "icon": "📁", "color": "gray"},
        ]
    }
