# routers/social_sharing.py - Social Media Sharing for External Agencies
"""
Allows sharing Social Media module with external collaborators:
1. Internal: Invite Kora users as "Social Collaborator" to an organization
2. External: Public link with optional password for non-Kora users

Permissions:
- viewer: Read-only access to calendar, posts, ideas
- contributor: View + create drafts/ideas (no publish)
- manager: Full access (internal users only)
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, EmailStr
import uuid
import secrets
import hashlib
import os

from config import db
from models.auth import User
from routers.auth import get_current_user
from routers.notifications import notify_org_admins, create_notification

# Get frontend URL from environment - fallback to production
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://ourkora.com")

social_sharing_router = APIRouter(prefix="/social-sharing", tags=["Social Sharing"])


# ============== MODELS ==============

class SocialShareCreate(BaseModel):
    """Create a public share link for Social Media"""
    name: str  # "Agencia XYZ"
    password: Optional[str] = None
    expires_in_days: Optional[int] = 30
    permissions: str = "contributor"  # viewer | contributor


class SocialShareResponse(BaseModel):
    share_id: str
    share_url: str
    name: str
    permissions: str
    expires_at: Optional[str]
    created_at: str
    access_count: int


class CollaboratorInvite(BaseModel):
    """Invite a Kora user as collaborator"""
    email: EmailStr
    role: str = "social_contributor"  # social_viewer | social_contributor


class ExternalAccess(BaseModel):
    """Validate external access with share token"""
    share_token: str
    password: Optional[str] = None


# ============== INTERNAL COLLABORATORS ==============

@social_sharing_router.post("/collaborators/invite")
async def invite_social_collaborator(
    data: CollaboratorInvite,
    user: User = Depends(get_current_user)
):
    """
    Invite a Kora user to collaborate on Social Media.
    They'll see this organization in their account.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Check permissions (only admin/owner can invite)
    if user.role not in ["owner", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins can invite collaborators")
    
    # Find the user to invite
    invited_user = await db.users.find_one({"email": data.email.lower()})
    
    if not invited_user:
        # User doesn't exist - create pending invitation
        invitation_id = f"inv_{uuid.uuid4().hex[:12]}"
        invitation = {
            "invitation_id": invitation_id,
            "email": data.email.lower(),
            "organization_id": company_id,
            "role": data.role,
            "invited_by": user.user_id,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        }
        await db.social_invitations.insert_one(invitation)
        
        # TODO: Send invitation email
        
        return {
            "status": "invited",
            "message": f"Invitation sent to {data.email}",
            "invitation_id": invitation_id
        }
    
    # User exists - check if already a member
    existing = await db.memberships.find_one({
        "user_id": invited_user["user_id"],
        "organization_id": company_id
    })
    
    if existing:
        # Update role if needed
        if existing.get("role") != data.role:
            await db.memberships.update_one(
                {"_id": existing["_id"]},
                {"$set": {"role": data.role, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"status": "updated", "message": f"Updated {data.email} role to {data.role}"}
        return {"status": "exists", "message": f"{data.email} is already a collaborator"}
    
    # Create new membership
    membership = {
        "membership_id": f"member_{uuid.uuid4().hex[:12]}",
        "user_id": invited_user["user_id"],
        "company_id": company_id,  # Use company_id for consistency with org system
        "organization_id": company_id,  # Keep for backwards compatibility
        "role": data.role,
        "status": "active",
        "invited_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.memberships.insert_one(membership)
    
    # Send notification to the invited user
    await create_notification(
        user_id=invited_user["user_id"],
        notification_type="invitation_accepted",
        title="Te han agregado a una organización",
        message=f"Ahora tienes acceso a Social Media de una nueva organización como {data.role.replace('social_', '')}",
        link="/demand-studio/social",
        priority="high"
    )
    
    return {
        "status": "added",
        "message": f"{data.email} added as {data.role}",
        "membership_id": membership["membership_id"]
    }


@social_sharing_router.get("/collaborators")
async def list_social_collaborators(user: User = Depends(get_current_user)):
    """List all collaborators with social access"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Get memberships with social roles - check both company_id and organization_id for compatibility
    memberships = await db.memberships.find({
        "$or": [{"company_id": company_id}, {"organization_id": company_id}],
        "role": {"$in": ["social_viewer", "social_contributor", "admin", "manager", "owner"]}
    }).to_list(100)
    
    # Get user details
    user_ids = [m["user_id"] for m in memberships]
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {"user_id": 1, "email": 1, "first_name": 1, "last_name": 1}
    ).to_list(100)
    users_map = {u["user_id"]: u for u in users}
    
    collaborators = []
    for m in memberships:
        u = users_map.get(m["user_id"], {})
        collaborators.append({
            "membership_id": m["membership_id"],
            "user_id": m["user_id"],
            "email": u.get("email"),
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or u.get("email"),
            "role": m["role"],
            "created_at": m.get("created_at")
        })
    
    # Get pending invitations
    pending = await db.social_invitations.find({
        "organization_id": company_id,
        "status": "pending"
    }).to_list(50)
    
    return {
        "collaborators": collaborators,
        "pending_invitations": [
            {"email": p["email"], "role": p["role"], "invited_at": p["created_at"]}
            for p in pending
        ]
    }


@social_sharing_router.delete("/collaborators/{membership_id}")
async def remove_collaborator(
    membership_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a collaborator's access"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only admins can remove collaborators")
    
    # Try both company_id and organization_id for compatibility
    result = await db.memberships.delete_one({
        "membership_id": membership_id,
        "$or": [{"company_id": company_id}, {"organization_id": company_id}]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    
    return {"status": "removed"}

class CollaboratorUpdate(BaseModel):
    role: str

@social_sharing_router.patch("/collaborators/{membership_id}")
async def update_collaborator_role(
    membership_id: str,
    data: CollaboratorUpdate,
    user: User = Depends(get_current_user)
):
    """Update a collaborator's role"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only admins can update collaborator roles")
    
    # Validate role
    if data.role not in ["social_viewer", "social_contributor"]:
        raise HTTPException(status_code=400, detail="Invalid role. Use 'social_viewer' or 'social_contributor'")
    
    result = await db.memberships.update_one(
        {
            "membership_id": membership_id,
            "$or": [{"company_id": company_id}, {"organization_id": company_id}]
        },
        {"$set": {"role": data.role, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    
    return {"status": "updated", "role": data.role}


# ============== EXTERNAL SHARE LINKS ==============

def hash_password(password: str) -> str:
    """Hash password for share links"""
    return hashlib.sha256(password.encode()).hexdigest()


@social_sharing_router.post("/links")
async def create_share_link(
    data: SocialShareCreate,
    user: User = Depends(get_current_user)
) -> SocialShareResponse:
    """Create a public share link for external agencies"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    if user.role not in ["owner", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins can create share links")
    
    share_id = f"share_{uuid.uuid4().hex[:12]}"
    share_token = secrets.token_urlsafe(32)
    
    now = datetime.now(timezone.utc)
    expires_at = None
    if data.expires_in_days:
        expires_at = (now + timedelta(days=data.expires_in_days)).isoformat()
    
    share_link = {
        "share_id": share_id,
        "share_token": share_token,
        "organization_id": company_id,
        "name": data.name,
        "password_hash": hash_password(data.password) if data.password else None,
        "permissions": data.permissions,
        "expires_at": expires_at,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "access_count": 0,
        "last_accessed_at": None,
        "active": True
    }
    
    await db.social_share_links.insert_one(share_link)
    
    # Build share URL using environment variable
    share_url = f"{FRONTEND_URL}/shared/social/{share_token}"
    
    return SocialShareResponse(
        share_id=share_id,
        share_url=share_url,
        name=data.name,
        permissions=data.permissions,
        expires_at=expires_at,
        created_at=now.isoformat(),
        access_count=0
    )


@social_sharing_router.get("/links")
async def list_share_links(user: User = Depends(get_current_user)):
    """List all active share links"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    links = await db.social_share_links.find({
        "organization_id": company_id,
        "active": True
    }).to_list(50)
    
    return [
        {
            "share_id": link["share_id"],
            "share_url": f"{FRONTEND_URL}/shared/social/{link['share_token']}",
            "name": link["name"],
            "permissions": link["permissions"],
            "has_password": bool(link.get("password_hash")),
            "expires_at": link.get("expires_at"),
            "created_at": link["created_at"],
            "access_count": link.get("access_count", 0),
            "last_accessed_at": link.get("last_accessed_at")
        }
        for link in links
    ]


@social_sharing_router.delete("/links/{share_id}")
async def revoke_share_link(
    share_id: str,
    user: User = Depends(get_current_user)
):
    """Revoke a share link"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    result = await db.social_share_links.update_one(
        {"share_id": share_id, "organization_id": company_id},
        {"$set": {"active": False, "revoked_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    return {"status": "revoked"}

class ShareLinkUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[str] = None

@social_sharing_router.patch("/links/{share_id}")
async def update_share_link(
    share_id: str,
    data: ShareLinkUpdate,
    user: User = Depends(get_current_user)
):
    """Update a share link's settings"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    if user.role not in ["owner", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins can update share links")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.name is not None:
        update_data["name"] = data.name
    
    if data.password is not None and data.password.strip():
        update_data["password_hash"] = hash_password(data.password)
    
    if data.permissions is not None:
        if data.permissions not in ["viewer", "contributor"]:
            raise HTTPException(status_code=400, detail="Invalid permissions")
        update_data["permissions"] = data.permissions
    
    result = await db.social_share_links.update_one(
        {"share_id": share_id, "organization_id": company_id, "active": True},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    return {"status": "updated"}


# ============== EXTERNAL ACCESS (PUBLIC) ==============

@social_sharing_router.post("/access/validate")
async def validate_external_access(data: ExternalAccess):
    """
    Validate external access token and return session.
    This is a PUBLIC endpoint - no auth required.
    """
    # Find share link
    share_link = await db.social_share_links.find_one({
        "share_token": data.share_token,
        "active": True
    })
    
    if not share_link:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    
    # Check expiry
    if share_link.get("expires_at"):
        if datetime.fromisoformat(share_link["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Link has expired")
    
    # Check password if required
    if share_link.get("password_hash"):
        if not data.password:
            raise HTTPException(status_code=401, detail="Password required")
        if hash_password(data.password) != share_link["password_hash"]:
            raise HTTPException(status_code=401, detail="Invalid password")
    
    # Update access stats
    await db.social_share_links.update_one(
        {"share_id": share_link["share_id"]},
        {
            "$inc": {"access_count": 1},
            "$set": {"last_accessed_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Get organization info
    org = await db.companies.find_one(
        {"company_id": share_link["organization_id"]},
        {"company_id": 1, "name": 1, "logo_url": 1}
    )
    
    # Generate temporary session token for this external access
    session_token = secrets.token_urlsafe(32)
    session = {
        "session_token": session_token,
        "share_id": share_link["share_id"],
        "organization_id": share_link["organization_id"],
        "permissions": share_link["permissions"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    }
    await db.external_sessions.insert_one(session)
    
    return {
        "session_token": session_token,
        "organization": {
            "id": org.get("company_id") if org else share_link["organization_id"],
            "name": org.get("name", "Organization") if org else "Organization",
            "logo_url": org.get("logo_url") if org else None
        },
        "permissions": share_link["permissions"],
        "shared_by": share_link.get("name", "Unknown"),
        "expires_in_hours": 8
    }


@social_sharing_router.get("/external/social-posts")
async def get_external_social_posts(
    session_token: str = Query(...),
    status: Optional[str] = None,
    limit: int = Query(50, le=100)
):
    """
    Get social posts for external viewers.
    PUBLIC endpoint - uses session token instead of auth.
    """
    # Validate session
    session = await db.external_sessions.find_one({"session_token": session_token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    if datetime.fromisoformat(session["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    org_id = session["organization_id"]
    
    # Build query
    query = {"tenant_id": org_id}
    if status:
        query["status"] = status
    
    # Get posts
    posts = await db.social_posts.find(
        query,
        {"_id": 0}
    ).sort("scheduled_at", -1).limit(limit).to_list(limit)
    
    return posts


@social_sharing_router.get("/external/ideas")
async def get_external_ideas(
    session_token: str = Query(...),
    limit: int = Query(50, le=100)
):
    """Get content ideas for external viewers"""
    session = await db.external_sessions.find_one({"session_token": session_token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    if datetime.fromisoformat(session["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    org_id = session["organization_id"]
    
    ideas = await db.content_ideas.find(
        {"tenant_id": org_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return ideas


@social_sharing_router.post("/external/ideas")
async def create_external_idea(
    session_token: str = Query(...),
    idea: dict = {}
):
    """
    Create a content idea as external contributor.
    Only allowed if permissions = 'contributor'.
    """
    session = await db.external_sessions.find_one({"session_token": session_token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    if datetime.fromisoformat(session["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    if session["permissions"] != "contributor":
        raise HTTPException(status_code=403, detail="Read-only access")
    
    org_id = session["organization_id"]
    
    # Get share link name for attribution
    share_link = await db.social_share_links.find_one({"share_id": session["share_id"]})
    contributor_name = share_link.get("name", "External") if share_link else "External"
    
    now = datetime.now(timezone.utc)
    idea_id = f"idea_{uuid.uuid4().hex[:12]}"
    
    new_idea = {
        "idea_id": idea_id,
        "tenant_id": org_id,
        "title": idea.get("title", "Untitled Idea"),
        "description": idea.get("description", ""),
        "content_type": idea.get("content_type", "post"),
        "pillar_id": idea.get("pillar_id"),
        "campaign_id": idea.get("campaign_id"),
        "status": "draft",
        "created_by": f"external:{contributor_name}",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "is_external": True
    }
    
    await db.content_ideas.insert_one(new_idea)
    
    # Send notification to org admins
    await notify_org_admins(
        org_id=org_id,
        notification_type="content_created",
        title="Nueva idea de agencia externa",
        message=f"{contributor_name} creó una nueva idea: {idea.get('title', 'Sin título')}",
        link=f"/demand-studio/social?tab=ideas",
        metadata={"idea_id": idea_id, "contributor": contributor_name},
        priority="normal"
    )
    
    return {
        "idea_id": idea_id,
        "message": "Idea created successfully",
        "attributed_to": contributor_name
    }


@social_sharing_router.post("/external/drafts")
async def create_external_draft(
    session_token: str = Query(...),
    draft: dict = {}
):
    """
    Create a draft post as external contributor.
    Only allowed if permissions = 'contributor'.
    """
    session = await db.external_sessions.find_one({"session_token": session_token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    if datetime.fromisoformat(session["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    if session["permissions"] != "contributor":
        raise HTTPException(status_code=403, detail="Read-only access")
    
    org_id = session["organization_id"]
    
    share_link = await db.social_share_links.find_one({"share_id": session["share_id"]})
    contributor_name = share_link.get("name", "External") if share_link else "External"
    
    now = datetime.now(timezone.utc)
    post_id = f"post_{uuid.uuid4().hex[:12]}"
    
    new_post = {
        "post_id": post_id,
        "tenant_id": org_id,
        "caption": draft.get("caption", ""),
        "platforms": draft.get("platforms", ["instagram"]),
        "content_type": draft.get("content_type", "image"),
        "pillar_id": draft.get("pillar_id"),
        "campaign_id": draft.get("campaign_id"),
        "status": "draft",
        "scheduled_at": None,
        "created_by": f"external:{contributor_name}",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "is_external": True,
        "needs_approval": True  # External drafts need approval
    }
    
    await db.social_posts.insert_one(new_post)
    
    # Send notification to org admins
    await notify_org_admins(
        org_id=org_id,
        notification_type="approval_needed",
        title="Nuevo borrador pendiente de aprobación",
        message=f"{contributor_name} creó un borrador de post que requiere tu aprobación",
        link=f"/demand-studio/social?tab=queue",
        metadata={"post_id": post_id, "contributor": contributor_name},
        priority="high"
    )
    
    return {
        "post_id": post_id,
        "message": "Draft created successfully. Pending approval.",
        "attributed_to": contributor_name
    }
