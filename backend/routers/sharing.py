# routers/sharing.py - Cross-Organization Collaboration (Sharing) Router
"""
Implements Collaboration Access for sharing Projects (Execution Hub) and 
Campaigns (Demand Studio) between organizations.

SECURITY RULES:
- Only admins/owners can share entities
- Shared access is scoped and revocable
- Multi-tenant isolation enforced everywhere
- Never expose CRM, Finance, System Pulse
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone
from enum import Enum
import uuid

from config import db
from dependencies import get_current_user, User
from utils.activity_logger import log_activity, user_info

sharing_router = APIRouter(prefix="/share", tags=["Collaboration"])


# ============== MODELS ==============

class PermissionLevel(str, Enum):
    VIEW = "view"
    COMMENT = "comment"
    CREATE = "create"
    EDIT = "edit"

class EntityType(str, Enum):
    PROJECT = "project"
    CAMPAIGN = "campaign"

class ScopeItem(str, Enum):
    TASKS = "tasks"
    ASSETS = "assets"
    DELIVERABLES = "deliverables"
    POSTS = "posts"
    COMMENTS = "comments"

class ShareEntityRequest(BaseModel):
    target_email: str = Field(..., description="Email of admin user in target organization")
    entity_type: EntityType
    entity_id: str
    permission_level: PermissionLevel = PermissionLevel.CREATE
    scope: List[ScopeItem] = Field(default=["tasks", "assets", "deliverables", "posts", "comments"])
    message: Optional[str] = Field(None, description="Optional message to include in notification")

class ShareEntityResponse(BaseModel):
    share_id: str
    source_org_id: str
    target_org_id: str
    entity_type: str
    entity_id: str
    entity_name: str
    permission_level: str
    scope: List[str]
    status: str
    created_at: str

class SharedEntityInfo(BaseModel):
    share_id: str
    source_org_id: str
    source_org_name: str
    target_org_id: str
    entity_type: str
    entity_id: str
    entity_name: str
    permission_level: str
    scope: List[str]
    status: str
    created_at: str
    created_by_user_name: str


# ============== HELPER FUNCTIONS ==============

async def validate_entity_ownership(entity_type: str, entity_id: str, company_id: str) -> dict:
    """Validate that entity belongs to the company and return entity data"""
    if entity_type == "project":
        entity = await db.execution_goals.find_one(
            {"goal_id": entity_id, "company_id": company_id},
            {"_id": 0}
        )
        if not entity:
            raise HTTPException(status_code=404, detail="Project not found or not owned by your organization")
        return {"name": entity.get("title", "Untitled Project"), "data": entity}
    
    elif entity_type == "campaign":
        entity = await db.marketing_campaigns.find_one(
            {"campaign_id": entity_id, "company_id": company_id},
            {"_id": 0}
        )
        if not entity:
            raise HTTPException(status_code=404, detail="Campaign not found or not owned by your organization")
        return {"name": entity.get("name", "Untitled Campaign"), "data": entity}
    
    raise HTTPException(status_code=400, detail="Invalid entity type")


async def get_target_org_from_email(email: str) -> dict:
    """Find organization by admin user email"""
    user = await db.users.find_one(
        {"email": email.lower()},
        {"_id": 0, "user_id": 1, "company_id": 1, "name": 1, "role": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email: {email}")
    
    if not user.get("company_id"):
        raise HTTPException(status_code=400, detail="Target user does not belong to any organization")
    
    # Get organization details
    org = await db.companies.find_one(
        {"company_id": user["company_id"]},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not org:
        raise HTTPException(status_code=404, detail="Target organization not found")
    
    return {
        "org_id": org["company_id"],
        "org_name": org.get("name", "Unknown Organization"),
        "user_id": user["user_id"],
        "user_name": user.get("name", email)
    }


async def check_user_is_admin(user: User) -> bool:
    """Check if user has admin/owner role in their organization"""
    if user.is_super_admin:
        return True
    
    if user.role in ["owner", "admin"]:
        return True
    
    # Check membership
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "organization_id": user.company_id
    })
    if membership and membership.get("role") in ["owner", "admin"]:
        return True
    
    return False


async def send_share_notification(
    target_user_id: str,
    target_email: str,
    source_org_name: str,
    entity_type: str,
    entity_name: str,
    permission_level: str,
    message: str = None
):
    """Send in-app and email notification for new share"""
    # In-app notification
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": target_user_id,
        "type": "collaboration_invite",
        "title": f"New {entity_type.title()} Shared With You",
        "message": f"{source_org_name} has shared a {entity_type} '{entity_name}' with your organization. Permission level: {permission_level}.",
        "data": {
            "entity_type": entity_type,
            "entity_name": entity_name,
            "source_org": source_org_name,
            "custom_message": message
        },
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    
    # Email notification (placeholder - requires RESEND_API_KEY)
    # TODO: Integrate with Resend when API key is available
    print(f"[EMAIL] To: {target_email}")
    print(f"[EMAIL] Subject: {source_org_name} shared a {entity_type} with you")
    print(f"[EMAIL] Body: You now have {permission_level} access to '{entity_name}'")
    if message:
        print(f"[EMAIL] Message: {message}")


async def send_revoke_notification(
    target_user_id: str,
    source_org_name: str,
    entity_type: str,
    entity_name: str
):
    """Send notification when access is revoked"""
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": target_user_id,
        "type": "collaboration_revoked",
        "title": f"Access Revoked",
        "message": f"Your access to {entity_type} '{entity_name}' from {source_org_name} has been revoked.",
        "data": {
            "entity_type": entity_type,
            "entity_name": entity_name,
            "source_org": source_org_name
        },
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)


# ============== ENDPOINTS ==============

@sharing_router.post("/entity", response_model=ShareEntityResponse)
async def share_entity(
    data: ShareEntityRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """
    Share a project or campaign with another organization.
    
    - Caller must be admin/owner in source organization
    - Entity must belong to caller's organization
    - Target is identified by email of an admin user
    """
    # Verify caller is admin
    if not await check_user_is_admin(user):
        raise HTTPException(status_code=403, detail="Only admins can share entities")
    
    source_org_id = user.company_id
    if not source_org_id:
        raise HTTPException(status_code=400, detail="You must belong to an organization to share")
    
    # Validate entity ownership
    entity_info = await validate_entity_ownership(
        data.entity_type.value, 
        data.entity_id, 
        source_org_id
    )
    
    # Get target organization from email
    target_info = await get_target_org_from_email(data.target_email)
    
    # Prevent sharing with self
    if target_info["org_id"] == source_org_id:
        raise HTTPException(status_code=400, detail="Cannot share with your own organization")
    
    # Check if already shared
    existing = await db.shared_entities.find_one({
        "source_org_id": source_org_id,
        "target_org_id": target_info["org_id"],
        "entity_type": data.entity_type.value,
        "entity_id": data.entity_id,
        "status": "active"
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="This entity is already shared with that organization"
        )
    
    # Get source org name
    source_org = await db.companies.find_one(
        {"company_id": source_org_id},
        {"_id": 0, "name": 1}
    )
    source_org_name = source_org.get("name", "Unknown") if source_org else "Unknown"
    
    # Create share record
    share_id = f"share_{uuid.uuid4().hex[:12]}"
    share_doc = {
        "share_id": share_id,
        "source_org_id": source_org_id,
        "source_org_name": source_org_name,
        "target_org_id": target_info["org_id"],
        "target_org_name": target_info["org_name"],
        "entity_type": data.entity_type.value,
        "entity_id": data.entity_id,
        "entity_name": entity_info["name"],
        "permission_level": data.permission_level.value,
        "scope": [s.value for s in data.scope],
        "status": "active",
        "created_by_user_id": user.user_id,
        "created_by_user_name": user.name or user.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "revoked_at": None,
        "revoked_by_user_id": None
    }
    
    await db.shared_entities.insert_one(share_doc)
    
    # Send notification in background
    background_tasks.add_task(
        send_share_notification,
        target_info["user_id"],
        data.target_email,
        source_org_name,
        data.entity_type.value,
        entity_info["name"],
        data.permission_level.value,
        data.message
    )
    
    # Log activity
    await log_activity(
        db, source_org_id,
        "collaboration", "share_created",
        f"Shared {data.entity_type.value} '{entity_info['name']}' with {target_info['org_name']}",
        user_info(user)
    )
    
    return ShareEntityResponse(
        share_id=share_id,
        source_org_id=source_org_id,
        target_org_id=target_info["org_id"],
        entity_type=data.entity_type.value,
        entity_id=data.entity_id,
        entity_name=entity_info["name"],
        permission_level=data.permission_level.value,
        scope=[s.value for s in data.scope],
        status="active",
        created_at=share_doc["created_at"]
    )


@sharing_router.post("/{share_id}/revoke")
async def revoke_share(
    share_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """
    Revoke a shared entity. Only source organization admin can revoke.
    """
    # Find share record
    share = await db.shared_entities.find_one(
        {"share_id": share_id},
        {"_id": 0}
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    # Verify caller owns the share
    if share["source_org_id"] != user.company_id:
        raise HTTPException(status_code=403, detail="Only source organization can revoke access")
    
    # Verify caller is admin
    if not await check_user_is_admin(user):
        raise HTTPException(status_code=403, detail="Only admins can revoke shares")
    
    if share["status"] == "revoked":
        raise HTTPException(status_code=400, detail="This share is already revoked")
    
    # Update status
    await db.shared_entities.update_one(
        {"share_id": share_id},
        {"$set": {
            "status": "revoked",
            "revoked_at": datetime.now(timezone.utc).isoformat(),
            "revoked_by_user_id": user.user_id
        }}
    )
    
    # Get a user from target org to notify
    target_user = await db.users.find_one(
        {"company_id": share["target_org_id"]},
        {"_id": 0, "user_id": 1}
    )
    if target_user:
        background_tasks.add_task(
            send_revoke_notification,
            target_user["user_id"],
            share["source_org_name"],
            share["entity_type"],
            share["entity_name"]
        )
    
    # Log activity
    await log_activity(
        db, user.company_id,
        "collaboration", "share_revoked",
        f"Revoked access to {share['entity_type']} '{share['entity_name']}' from {share['target_org_name']}",
        user_info(user)
    )
    
    return {"message": "Access revoked successfully", "share_id": share_id}


@sharing_router.get("/sent")
async def get_sent_shares(user: User = Depends(get_current_user)):
    """Get all entities shared BY this organization (outgoing shares)"""
    if not user.company_id:
        return []
    
    shares = await db.shared_entities.find(
        {"source_org_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    return shares


@sharing_router.get("/received")
async def get_received_shares(
    user: User = Depends(get_current_user),
    entity_type: Optional[str] = None,
    status: str = "active"
):
    """Get all entities shared WITH this organization (incoming shares)"""
    if not user.company_id:
        return []
    
    query = {
        "target_org_id": user.company_id,
        "status": status
    }
    if entity_type:
        query["entity_type"] = entity_type
    
    shares = await db.shared_entities.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    return shares


@sharing_router.get("/entity/{entity_type}/{entity_id}/access")
async def get_entity_share_info(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """
    Get sharing info for a specific entity.
    Returns the user's access level if they have shared access.
    """
    # Check if user owns the entity
    if entity_type == "project":
        entity = await db.execution_goals.find_one(
            {"goal_id": entity_id},
            {"_id": 0, "company_id": 1, "title": 1}
        )
    elif entity_type == "campaign":
        entity = await db.marketing_campaigns.find_one(
            {"campaign_id": entity_id},
            {"_id": 0, "company_id": 1, "name": 1}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    # If user owns it
    if entity.get("company_id") == user.company_id:
        return {
            "access_type": "owner",
            "permission_level": "edit",
            "scope": ["tasks", "assets", "deliverables", "posts", "comments"],
            "entity_name": entity.get("title") or entity.get("name")
        }
    
    # Check shared access
    share = await db.shared_entities.find_one({
        "target_org_id": user.company_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": "active"
    }, {"_id": 0})
    
    if not share:
        raise HTTPException(status_code=403, detail="No access to this entity")
    
    return {
        "access_type": "shared",
        "share_id": share["share_id"],
        "permission_level": share["permission_level"],
        "scope": share["scope"],
        "source_org_name": share["source_org_name"],
        "entity_name": share["entity_name"]
    }


@sharing_router.get("/collaboration-status")
async def get_collaboration_status(user: User = Depends(get_current_user)):
    """
    Check if user is a collaboration-only user (no internal projects/campaigns).
    Used by frontend to determine sidebar visibility.
    """
    if not user.company_id:
        return {"is_collaboration_only": True, "has_shared_access": False}
    
    # Check if org has any owned projects
    owned_projects = await db.execution_goals.count_documents({
        "company_id": user.company_id
    })
    
    # Check if org has any owned campaigns
    owned_campaigns = await db.marketing_campaigns.count_documents({
        "company_id": user.company_id
    })
    
    # Check if org has shared access to anything
    shared_count = await db.shared_entities.count_documents({
        "target_org_id": user.company_id,
        "status": "active"
    })
    
    # Collaboration-only if no owned projects/campaigns but has shared access
    is_collab_only = (owned_projects == 0 and owned_campaigns == 0 and shared_count > 0)
    
    return {
        "is_collaboration_only": is_collab_only,
        "has_shared_access": shared_count > 0,
        "owned_projects": owned_projects,
        "owned_campaigns": owned_campaigns,
        "shared_entities": shared_count
    }


# ============== PERMISSION CHECK HELPER (For other routers) ==============

async def check_shared_entity_permission(
    user: User,
    entity_type: str,
    entity_id: str,
    required_permission: str = "view",
    required_scope: str = None
) -> dict:
    """
    Check if user has shared access to an entity.
    Returns share info if access granted, raises HTTPException if not.
    
    Use this in execution_hub and demand_studio routers.
    """
    share = await db.shared_entities.find_one({
        "target_org_id": user.company_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": "active"
    }, {"_id": 0})
    
    if not share:
        return None  # No shared access
    
    # Check permission level
    permission_hierarchy = {"view": 0, "comment": 1, "create": 2, "edit": 3}
    user_level = permission_hierarchy.get(share["permission_level"], 0)
    required_level = permission_hierarchy.get(required_permission, 0)
    
    if user_level < required_level:
        raise HTTPException(
            status_code=403, 
            detail=f"Insufficient permissions. You have '{share['permission_level']}' access, but '{required_permission}' is required."
        )
    
    # Check scope if specified
    if required_scope and required_scope not in share["scope"]:
        raise HTTPException(
            status_code=403,
            detail=f"Your access scope does not include '{required_scope}'"
        )
    
    return share
