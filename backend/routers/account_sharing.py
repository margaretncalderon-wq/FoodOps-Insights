# routers/account_sharing.py - Account-Centric Social Media Sharing
"""
Account-centric sharing model where each social account is a self-contained workspace.
An agency sees a list of individual accounts (their own + shared) and upon selecting one,
sees the complete isolated workspace for that account only.

Collections:
- account_memberships: Maps user_id → social_account_id with role
- social_accounts: Individual social media accounts (Instagram, TikTok, etc.)

Permissions:
- owner: Full access (the account owner)
- contributor: View + create drafts/ideas (no publish, needs approval)
- viewer: Read-only access to calendar, posts, ideas
"""

from fastapi import APIRouter, HTTPException, Depends, Query
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

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://ourkora.com")

account_sharing_router = APIRouter(prefix="/account-sharing", tags=["Account Sharing"])


# ============== MODELS ==============

class AccountShareCreate(BaseModel):
    """Share a social account with another user"""
    email: EmailStr
    role: str = "contributor"  # viewer | contributor


class AccountShareLinkCreate(BaseModel):
    """Create a public share link for a specific account"""
    account_id: str
    name: str
    password: Optional[str] = None
    expires_in_days: Optional[int] = 30
    permissions: str = "contributor"


class AccountMembership(BaseModel):
    membership_id: str
    user_id: str
    social_account_id: str
    role: str
    granted_by: str
    created_at: str


# ============== GET ACCESSIBLE ACCOUNTS ==============

@account_sharing_router.get("/my-accounts")
async def get_my_accessible_accounts(user: User = Depends(get_current_user)):
    """
    Get all social accounts accessible to the user:
    - Accounts owned by user's organization
    - Accounts shared with the user directly
    
    Returns a unified list for the account selector dropdown.
    """
    company_id = user.company_id or user.active_org_id
    accounts = []
    
    # 1. Get accounts owned by user's organization
    if company_id:
        owned_accounts = await db.social_accounts.find(
            {"company_id": company_id},
            {"_id": 0}
        ).to_list(100)
        
        for acc in owned_accounts:
            acc["_access_type"] = "owned"
            acc["_role"] = "owner"
            accounts.append(acc)
    
    # 2. Get accounts shared with this user directly
    memberships = await db.account_memberships.find({
        "user_id": user.user_id,
        "status": "active"
    }).to_list(100)
    
    if memberships:
        shared_account_ids = [m["social_account_id"] for m in memberships]
        membership_map = {m["social_account_id"]: m for m in memberships}
        
        shared_accounts = await db.social_accounts.find(
            {"account_id": {"$in": shared_account_ids}},
            {"_id": 0}
        ).to_list(100)
        
        # Get owner company names for context
        company_ids = list(set(a.get("company_id") for a in shared_accounts if a.get("company_id")))
        companies = await db.companies.find(
            {"company_id": {"$in": company_ids}},
            {"_id": 0, "company_id": 1, "name": 1}
        ).to_list(100)
        company_map = {c["company_id"]: c["name"] for c in companies}
        
        for acc in shared_accounts:
            # Don't add if already in owned accounts
            if any(a["account_id"] == acc["account_id"] for a in accounts):
                continue
            
            membership = membership_map.get(acc["account_id"], {})
            acc["_access_type"] = "shared"
            acc["_role"] = membership.get("role", "viewer")
            acc["_shared_by"] = company_map.get(acc.get("company_id"), "Unknown")
            acc["_granted_at"] = membership.get("created_at")
            accounts.append(acc)
    
    return accounts


# ============== SHARE ACCOUNT WITH USER ==============

@account_sharing_router.post("/share")
async def share_account_with_user(
    data: AccountShareCreate,
    account_id: str = Query(..., description="Account ID to share"),
    user: User = Depends(get_current_user)
):
    """
    Share a social account with another Kora user.
    Only the account owner/admin can share.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Verify user owns this account
    account = await db.social_accounts.find_one({
        "account_id": account_id,
        "company_id": company_id
    })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found or not owned by you")
    
    # Check permissions
    if user.role not in ["owner", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only admins can share accounts")
    
    # Find user to share with
    target_user = await db.users.find_one({"email": data.email.lower()})
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {data.email} not found in Kora")
    
    # Check if already shared
    existing = await db.account_memberships.find_one({
        "user_id": target_user["user_id"],
        "social_account_id": account_id,
        "status": "active"
    })
    
    if existing:
        # Update role if different
        if existing.get("role") != data.role:
            await db.account_memberships.update_one(
                {"_id": existing["_id"]},
                {"$set": {"role": data.role, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"status": "updated", "message": f"Updated {data.email} role to {data.role}"}
        return {"status": "exists", "message": f"{data.email} already has access"}
    
    # Create membership
    membership_id = f"accmem_{uuid.uuid4().hex[:12]}"
    membership = {
        "membership_id": membership_id,
        "user_id": target_user["user_id"],
        "social_account_id": account_id,
        "role": data.role,
        "status": "active",
        "granted_by": user.user_id,
        "company_id": company_id,  # For reference
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.account_memberships.insert_one(membership)
    
    # Get company name for notification
    company = await db.companies.find_one({"company_id": company_id}, {"name": 1})
    company_name = company.get("name", "Unknown") if company else "Unknown"
    
    # Send notification
    await create_notification(
        user_id=target_user["user_id"],
        notification_type="account_shared",
        title="Nueva cuenta compartida contigo",
        message=f"{company_name} te compartió la cuenta @{account.get('handle', 'unknown')} ({account.get('platform', 'social')})",
        link="/demand-studio/social",
        priority="high"
    )
    
    return {
        "status": "shared",
        "message": f"Account shared with {data.email}",
        "membership_id": membership_id
    }


# ============== GET ACCOUNT COLLABORATORS ==============

@account_sharing_router.get("/collaborators/{account_id}")
async def get_account_collaborators(
    account_id: str,
    user: User = Depends(get_current_user)
):
    """Get all collaborators for a specific account"""
    company_id = user.company_id or user.active_org_id
    
    # Verify user has access to this account
    account = await db.social_accounts.find_one({"account_id": account_id})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Check if user owns it or is a collaborator
    is_owner = account.get("company_id") == company_id
    if not is_owner:
        membership = await db.account_memberships.find_one({
            "user_id": user.user_id,
            "social_account_id": account_id,
            "status": "active"
        })
        if not membership:
            raise HTTPException(status_code=403, detail="No access to this account")
    
    # Get all memberships for this account
    memberships = await db.account_memberships.find({
        "social_account_id": account_id,
        "status": "active"
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
            "granted_at": m.get("created_at")
        })
    
    return {
        "account": {
            "account_id": account["account_id"],
            "handle": account.get("handle"),
            "platform": account.get("platform")
        },
        "is_owner": is_owner,
        "collaborators": collaborators
    }


# ============== REMOVE COLLABORATOR ==============

@account_sharing_router.delete("/collaborators/{membership_id}")
async def remove_account_collaborator(
    membership_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a collaborator's access to an account"""
    company_id = user.company_id or user.active_org_id
    
    # Get the membership
    membership = await db.account_memberships.find_one({"membership_id": membership_id})
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Verify user owns the account
    account = await db.social_accounts.find_one({
        "account_id": membership["social_account_id"],
        "company_id": company_id
    })
    if not account:
        raise HTTPException(status_code=403, detail="You don't own this account")
    
    # Remove membership
    await db.account_memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"status": "revoked", "revoked_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"status": "removed"}


# ============== UPDATE COLLABORATOR ROLE ==============

@account_sharing_router.patch("/collaborators/{membership_id}")
async def update_collaborator_role(
    membership_id: str,
    role: str = Query(..., description="New role: viewer or contributor"),
    user: User = Depends(get_current_user)
):
    """Update a collaborator's role"""
    company_id = user.company_id or user.active_org_id
    
    if role not in ["viewer", "contributor"]:
        raise HTTPException(status_code=400, detail="Invalid role. Use 'viewer' or 'contributor'")
    
    # Get the membership
    membership = await db.account_memberships.find_one({"membership_id": membership_id})
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    # Verify user owns the account
    account = await db.social_accounts.find_one({
        "account_id": membership["social_account_id"],
        "company_id": company_id
    })
    if not account:
        raise HTTPException(status_code=403, detail="You don't own this account")
    
    # Update role
    await db.account_memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"role": role, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"status": "updated", "role": role}


# ============== EXTERNAL SHARE LINKS FOR ACCOUNTS ==============

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


@account_sharing_router.post("/links")
async def create_account_share_link(
    data: AccountShareLinkCreate,
    user: User = Depends(get_current_user)
):
    """Create a public share link for a specific account"""
    company_id = user.company_id or user.active_org_id
    
    # Verify user owns this account
    account = await db.social_accounts.find_one({
        "account_id": data.account_id,
        "company_id": company_id
    })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found or not owned by you")
    
    share_id = f"accshare_{uuid.uuid4().hex[:12]}"
    share_token = secrets.token_urlsafe(32)
    
    now = datetime.now(timezone.utc)
    expires_at = None
    if data.expires_in_days:
        expires_at = (now + timedelta(days=data.expires_in_days)).isoformat()
    
    share_link = {
        "share_id": share_id,
        "share_token": share_token,
        "social_account_id": data.account_id,
        "company_id": company_id,
        "name": data.name,
        "password_hash": hash_password(data.password) if data.password else None,
        "permissions": data.permissions,
        "expires_at": expires_at,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "access_count": 0,
        "active": True
    }
    
    await db.account_share_links.insert_one(share_link)
    
    share_url = f"{FRONTEND_URL}/shared/account/{share_token}"
    
    return {
        "share_id": share_id,
        "share_url": share_url,
        "account": {
            "account_id": account["account_id"],
            "handle": account.get("handle"),
            "platform": account.get("platform")
        },
        "name": data.name,
        "permissions": data.permissions,
        "expires_at": expires_at
    }


@account_sharing_router.get("/links/{account_id}")
async def get_account_share_links(
    account_id: str,
    user: User = Depends(get_current_user)
):
    """Get all active share links for an account"""
    company_id = user.company_id or user.active_org_id
    
    # Verify ownership
    account = await db.social_accounts.find_one({
        "account_id": account_id,
        "company_id": company_id
    })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    links = await db.account_share_links.find({
        "social_account_id": account_id,
        "active": True
    }).to_list(50)
    
    return [
        {
            "share_id": link["share_id"],
            "share_url": f"{FRONTEND_URL}/shared/account/{link['share_token']}",
            "name": link["name"],
            "permissions": link["permissions"],
            "has_password": bool(link.get("password_hash")),
            "expires_at": link.get("expires_at"),
            "access_count": link.get("access_count", 0)
        }
        for link in links
    ]


@account_sharing_router.delete("/links/{share_id}")
async def revoke_account_share_link(
    share_id: str,
    user: User = Depends(get_current_user)
):
    """Revoke an account share link"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.account_share_links.update_one(
        {"share_id": share_id, "company_id": company_id},
        {"$set": {"active": False, "revoked_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    return {"status": "revoked"}
