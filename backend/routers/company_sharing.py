# routers/company_sharing.py - Granular Company Sharing with Section-Level Permissions
"""
Company sharing system with granular permissions.
Allows owners to share their company with external collaborators
and configure access to specific sections.

Permission Model:
- Owner/Admin of company: Full access to everything
- Shared collaborator: Access only to sections they were granted

Sections:
- social_media, campaigns, spend_ledger, email_marketing, notes, insights, activations
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, EmailStr
import uuid

from config import db
from models.auth import User
from routers.auth import get_current_user
from routers.notifications import create_notification

company_sharing_router = APIRouter(prefix="/company-sharing", tags=["Company Sharing"])


# ============== MODELS ==============

class SectionPermission(BaseModel):
    enabled: bool = False
    role: str = "viewer"  # admin | editor | viewer


class CompanyShareInvite(BaseModel):
    email: EmailStr
    permissions: Dict[str, SectionPermission]


class PermissionsUpdate(BaseModel):
    permissions: Dict[str, SectionPermission]


# ============== INVITE COLLABORATOR ==============

@company_sharing_router.post("/invite")
async def invite_company_collaborator(
    data: CompanyShareInvite,
    user: User = Depends(get_current_user)
):
    """
    Invite a user to access your company with granular section permissions.
    Only owner/admin can invite.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Check permissions
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners/admins can share the company")
    
    # Get company info
    company = await db.companies.find_one({"company_id": company_id}, {"name": 1})
    company_name = company.get("name", "Unknown") if company else "Unknown"
    
    # Convert permissions to dict for storage
    permissions_dict = {
        section: {"enabled": perm.enabled, "role": perm.role}
        for section, perm in data.permissions.items()
    }
    
    # Find the user to invite
    invited_user = await db.users.find_one({"email": data.email.lower()})
    
    if not invited_user:
        # User doesn't exist - create pending invitation
        invitation_id = f"inv_{uuid.uuid4().hex[:12]}"
        invitation = {
            "invitation_id": invitation_id,
            "email": data.email.lower(),
            "company_id": company_id,
            "permissions": permissions_dict,
            "invited_by": user.user_id,
            "inviter_name": user.name or user.email,
            "company_name": company_name,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        }
        await db.company_invitations.insert_one(invitation)
        
        return {
            "status": "invitation_sent",
            "message": f"Invitation sent to {data.email}",
            "invitation_id": invitation_id,
            "note": "User will see invitation when they create an account"
        }
    
    # User exists - check if already a member
    existing = await db.memberships.find_one({
        "user_id": invited_user["user_id"],
        "company_id": company_id
    })
    
    if existing:
        # Update permissions
        await db.memberships.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "permissions": permissions_dict,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {
            "status": "updated",
            "message": f"Updated permissions for {data.email}"
        }
    
    # Create new membership
    membership_id = f"member_{uuid.uuid4().hex[:12]}"
    membership = {
        "membership_id": membership_id,
        "user_id": invited_user["user_id"],
        "company_id": company_id,
        "permissions": permissions_dict,
        "role": "collaborator",  # General role
        "status": "active",
        "invited_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.memberships.insert_one(membership)
    
    # Count enabled sections for notification
    enabled_sections = [s for s, p in permissions_dict.items() if p.get("enabled")]
    
    # Notify user
    await create_notification(
        user_id=invited_user["user_id"],
        notification_type="company_shared",
        title="Nueva empresa compartida contigo",
        message=f"{company_name} te compartió acceso a {len(enabled_sections)} secciones",
        link="/demand-studio",
        priority="high"
    )
    
    return {
        "status": "added",
        "message": f"{data.email} added with custom permissions",
        "membership_id": membership_id,
        "sections_enabled": len(enabled_sections)
    }


# ============== GET COMPANY MEMBERS ==============

@company_sharing_router.get("/members")
async def get_company_members(user: User = Depends(get_current_user)):
    """Get all members/collaborators of the user's company"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"members": [], "pending": []}
    
    # Get active members
    memberships = await db.memberships.find({
        "company_id": company_id,
        "status": "active"
    }).to_list(100)
    
    # Get user details
    user_ids = [m["user_id"] for m in memberships]
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "email": 1, "first_name": 1, "last_name": 1}
    ).to_list(100)
    users_map = {u["user_id"]: u for u in users}
    
    members = []
    for m in memberships:
        u = users_map.get(m["user_id"], {})
        members.append({
            "membership_id": m["membership_id"],
            "user_id": m["user_id"],
            "email": u.get("email"),
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or u.get("email"),
            "role": m.get("role", "collaborator"),
            "permissions": m.get("permissions", {}),
            "created_at": m.get("created_at")
        })
    
    # Get pending invitations
    pending = await db.company_invitations.find({
        "company_id": company_id,
        "status": "pending"
    }).to_list(50)
    
    pending_list = [
        {
            "invitation_id": p["invitation_id"],
            "email": p["email"],
            "permissions": p.get("permissions", {}),
            "created_at": p.get("created_at"),
            "expires_at": p.get("expires_at")
        }
        for p in pending
    ]
    
    return {
        "members": members,
        "pending": pending_list
    }


# ============== UPDATE MEMBER PERMISSIONS ==============

@company_sharing_router.patch("/members/{membership_id}")
async def update_member_permissions(
    membership_id: str,
    data: PermissionsUpdate,
    user: User = Depends(get_current_user)
):
    """Update a member's section permissions"""
    company_id = user.company_id or user.active_org_id
    
    # Verify ownership
    membership = await db.memberships.find_one({
        "membership_id": membership_id,
        "company_id": company_id
    })
    
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Check permissions
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners/admins can update permissions")
    
    # Convert permissions
    permissions_dict = {
        section: {"enabled": perm.enabled, "role": perm.role}
        for section, perm in data.permissions.items()
    }
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {
            "permissions": permissions_dict,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"status": "updated", "membership_id": membership_id}


# ============== REMOVE MEMBER ==============

@company_sharing_router.delete("/members/{membership_id}")
async def remove_company_member(
    membership_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a member's access to the company"""
    company_id = user.company_id or user.active_org_id
    
    # Verify ownership
    membership = await db.memberships.find_one({
        "membership_id": membership_id,
        "company_id": company_id
    })
    
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Check permissions
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners/admins can remove members")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {
            "status": "revoked",
            "revoked_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"status": "removed"}


# ============== CHECK USER PERMISSION ==============

@company_sharing_router.get("/check-permission")
async def check_section_permission(
    section: str,
    company_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """
    Check if user has permission to access a specific section.
    Returns the permission level (admin/editor/viewer) or None if no access.
    """
    target_company_id = company_id or user.company_id or user.active_org_id
    
    # If it's user's own company, they have full access
    if target_company_id == user.company_id:
        return {"has_access": True, "role": "owner", "is_own": True}
    
    # Check membership
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "company_id": target_company_id,
        "status": "active"
    })
    
    if not membership:
        return {"has_access": False, "role": None, "is_own": False}
    
    permissions = membership.get("permissions", {})
    section_perm = permissions.get(section, {})
    
    if section_perm.get("enabled"):
        return {
            "has_access": True,
            "role": section_perm.get("role", "viewer"),
            "is_own": False
        }
    
    return {"has_access": False, "role": None, "is_own": False}


# ============== REVOKE INVITATION ==============

@company_sharing_router.delete("/invitations/{invitation_id}")
async def revoke_invitation(
    invitation_id: str,
    user: User = Depends(get_current_user)
):
    """Revoke a pending invitation"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.company_invitations.update_one(
        {"invitation_id": invitation_id, "company_id": company_id},
        {"$set": {"status": "revoked"}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    return {"status": "revoked"}
