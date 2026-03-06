# routers/notifications.py - In-App Notification System
"""
Real-time in-app notifications for Kora users.
Notifications appear in the header bell icon.

Events that trigger notifications:
- External collaborator creates content (idea, draft)
- Invitation accepted
- Content needs approval
- Campaign updates
- System alerts
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import uuid

from config import db
from models.auth import User
from routers.auth import get_current_user

notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ============== MODELS ==============

class NotificationCreate(BaseModel):
    """Create a notification"""
    type: str  # content_created, invitation_accepted, approval_needed, campaign_update, system
    title: str
    message: str
    link: Optional[str] = None  # URL to navigate to
    metadata: Optional[dict] = None
    priority: str = "normal"  # low, normal, high, urgent


class Notification(BaseModel):
    notification_id: str
    user_id: str
    type: str
    title: str
    message: str
    link: Optional[str] = None
    metadata: Optional[dict] = None
    priority: str
    read: bool
    created_at: str


# ============== NOTIFICATION HELPERS ==============

async def create_notification(
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    metadata: Optional[dict] = None,
    priority: str = "normal"
) -> str:
    """Helper to create a notification for a user"""
    notification_id = f"notif_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    notification = {
        "notification_id": notification_id,
        "user_id": user_id,
        "type": notification_type,
        "title": title,
        "message": message,
        "link": link,
        "metadata": metadata or {},
        "priority": priority,
        "read": False,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.notifications.insert_one(notification)
    return notification_id


async def notify_org_admins(
    org_id: str,
    notification_type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    metadata: Optional[dict] = None,
    priority: str = "normal",
    exclude_user_id: Optional[str] = None
):
    """Send notification to all admins/managers of an organization"""
    # Get org members with admin roles
    memberships = await db.memberships.find({
        "organization_id": org_id,
        "role": {"$in": ["owner", "admin", "manager"]}
    }).to_list(50)
    
    user_ids = [m["user_id"] for m in memberships if m["user_id"] != exclude_user_id]
    
    # Also check users with this company_id
    users = await db.users.find({
        "company_id": org_id,
        "role": {"$in": ["owner", "admin", "manager"]}
    }).to_list(50)
    
    for u in users:
        if u["user_id"] not in user_ids and u["user_id"] != exclude_user_id:
            user_ids.append(u["user_id"])
    
    # Create notifications for all admins
    for user_id in user_ids:
        await create_notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            link=link,
            metadata=metadata,
            priority=priority
        )
    
    return len(user_ids)


# ============== API ENDPOINTS ==============

@notifications_router.get("")
async def get_notifications(
    user: User = Depends(get_current_user),
    unread_only: bool = Query(False),
    limit: int = Query(50, le=100)
) -> List[dict]:
    """Get user's notifications"""
    query = {"user_id": user.user_id}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return notifications


@notifications_router.get("/unread-count")
async def get_unread_count(user: User = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": user.user_id,
        "read": False
    })
    return {"unread_count": count}


@notifications_router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    user: User = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"status": "read"}


@notifications_router.post("/mark-all-read")
async def mark_all_as_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    result = await db.notifications.update_many(
        {"user_id": user.user_id, "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"marked_read": result.modified_count}


@notifications_router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a notification"""
    result = await db.notifications.delete_one({
        "notification_id": notification_id,
        "user_id": user.user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"status": "deleted"}


@notifications_router.delete("")
async def clear_all_notifications(
    user: User = Depends(get_current_user),
    read_only: bool = Query(True)  # Only delete read notifications by default
):
    """Clear notifications"""
    query = {"user_id": user.user_id}
    if read_only:
        query["read"] = True
    
    result = await db.notifications.delete_many(query)
    
    return {"deleted": result.deleted_count}


# ============== INTERNAL API (for other routers to use) ==============

@notifications_router.post("/internal/create")
async def create_notification_internal(
    data: NotificationCreate,
    user_id: str = Query(...),
    api_key: str = Query(None)  # For internal service calls
):
    """
    Internal endpoint to create notifications.
    Used by other services/routers.
    """
    # In production, validate api_key for internal calls
    notification_id = await create_notification(
        user_id=user_id,
        notification_type=data.type,
        title=data.title,
        message=data.message,
        link=data.link,
        metadata=data.metadata,
        priority=data.priority
    )
    
    return {"notification_id": notification_id}


@notifications_router.post("/generate-follow-up-reminders")
async def generate_follow_up_reminders(
    user: User = Depends(get_current_user)
):
    """
    Generate notifications for follow-ups that are overdue or due today/tomorrow.
    This endpoint should be called when the user opens the CRM or follow-up view.
    It will only create notifications that don't already exist for the same entity.
    """
    company_id = user.company_id
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    
    notifications_created = 0
    
    # Get leads with follow-ups that are overdue or due today/tomorrow
    lead_query = {
        "company_id": company_id,
        "next_follow_up_date": {"$ne": None, "$lte": tomorrow},
        "status": {"$nin": ["Converted", "Discarded"]}
    }
    leads = await db.leads.find(lead_query, {"_id": 0, "lead_id": 1, "lead_name": 1, 
                                              "contact_name": 1, "company_name": 1,
                                              "next_follow_up_date": 1, "owner_id": 1,
                                              "follow_up_type": 1}).to_list(100)
    
    # Get clients with follow-ups that are overdue or due today/tomorrow
    client_query = {
        "company_id": company_id,
        "next_follow_up_date": {"$ne": None, "$lte": tomorrow}
    }
    clients = await db.clients.find(client_query, {"_id": 0, "client_id": 1, "display_name": 1,
                                                    "company_name": 1, "next_follow_up_date": 1,
                                                    "owner_id": 1, "follow_up_type": 1}).to_list(100)
    
    # Combine all follow-ups
    all_follow_ups = []
    for lead in leads:
        all_follow_ups.append({
            "entity_type": "lead",
            "entity_id": lead["lead_id"],
            "name": lead.get("lead_name") or lead.get("contact_name") or lead.get("company_name"),
            "follow_up_date": lead.get("next_follow_up_date"),
            "follow_up_type": lead.get("follow_up_type", "Llamada"),
            "owner_id": lead.get("owner_id")
        })
    
    for client in clients:
        all_follow_ups.append({
            "entity_type": "client",
            "entity_id": client["client_id"],
            "name": client.get("display_name") or client.get("company_name"),
            "follow_up_date": client.get("next_follow_up_date"),
            "follow_up_type": client.get("follow_up_type", "Seguimiento"),
            "owner_id": client.get("owner_id")
        })
    
    # For each follow-up, check if notification already exists and create if not
    for fu in all_follow_ups:
        # Determine target user (owner or current user)
        target_user_id = fu.get("owner_id") or user.user_id
        
        # Check if notification already exists for this entity and date
        existing = await db.notifications.find_one({
            "user_id": target_user_id,
            "type": "follow_up_reminder",
            "metadata.entity_id": fu["entity_id"],
            "metadata.follow_up_date": fu["follow_up_date"]
        })
        
        if existing:
            continue
        
        # Determine urgency
        fu_date = fu["follow_up_date"][:10] if fu["follow_up_date"] else None
        is_overdue = fu_date and fu_date < today
        is_today = fu_date == today
        is_tomorrow = fu_date == tomorrow
        
        # Build notification - cleaner titles without emojis for better readability
        if is_overdue:
            title = f"Seguimiento vencido: {fu['name']}"
            message = f"El seguimiento ({fu['follow_up_type']}) programado para {fu_date} está vencido."
            priority = "high"
        elif is_today:
            title = f"Seguimiento hoy: {fu['name']}"
            message = f"Tienes un seguimiento ({fu['follow_up_type']}) programado para hoy."
            priority = "high"
        else:
            title = f"Seguimiento mañana: {fu['name']}"
            message = f"Tienes un seguimiento ({fu['follow_up_type']}) programado para mañana."
            priority = "normal"
        
        # Create notification
        await create_notification(
            user_id=target_user_id,
            notification_type="follow_up_reminder",
            title=title,
            message=message,
            link=f"/crm/{fu['entity_type']}s/{fu['entity_id']}",
            metadata={
                "entity_type": fu["entity_type"],
                "entity_id": fu["entity_id"],
                "entity_name": fu["name"],
                "follow_up_date": fu["follow_up_date"],
                "follow_up_type": fu["follow_up_type"],
                "is_overdue": is_overdue,
                "is_today": is_today
            },
            priority=priority
        )
        notifications_created += 1
    
    return {
        "notifications_created": notifications_created,
        "total_follow_ups_checked": len(all_follow_ups)
    }

