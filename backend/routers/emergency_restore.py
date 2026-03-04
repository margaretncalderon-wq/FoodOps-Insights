# routers/emergency_restore.py - Emergency endpoint to restore user's company_id
"""
EMERGENCY FIX: This endpoint allows users to restore their original company_id
after the OrgSwitcher bug incorrectly changed it.

DELETE THIS FILE AFTER ALL AFFECTED USERS ARE RESTORED.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from typing import Optional, List
from datetime import datetime, timezone

from config import db
from models.auth import User
from routers.auth import get_current_user

emergency_router = APIRouter(prefix="/emergency", tags=["Emergency"])


@emergency_router.get("/search-companies")
async def search_companies(
    q: str = Query(..., min_length=2, description="Search query"),
    user: User = Depends(get_current_user)
):
    """
    Search for companies by name. Available to all authenticated users
    since this is an emergency recovery tool.
    """
    # Search by name, legal_name, or company_id
    companies = await db.companies.find({
        "$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"legal_name": {"$regex": q, "$options": "i"}},
            {"company_id": {"$regex": q, "$options": "i"}}
        ]
    }, {"_id": 0, "company_id": 1, "name": 1, "legal_name": 1}).to_list(20)
    
    return {
        "query": q,
        "count": len(companies),
        "companies": companies
    }


@emergency_router.get("/all-companies")
async def get_all_companies(
    user: User = Depends(get_current_user)
):
    """
    Get all companies. For emergency use to find the correct company.
    """
    companies = await db.companies.find(
        {},
        {"_id": 0, "company_id": 1, "name": 1, "legal_name": 1, "created_at": 1}
    ).sort("name", 1).to_list(100)
    
    return {
        "count": len(companies),
        "companies": companies
    }


@emergency_router.post("/force-restore/{company_id}")
async def force_restore_company(
    company_id: str,
    user: User = Depends(get_current_user)
):
    """
    Force restore user's company_id without checking membership.
    This is for emergency use when the user lost all their memberships.
    Creates a membership if it doesn't exist.
    """
    # Verify the company exists
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    old_company_id = user.company_id
    
    # Update user's company_id
    await db.users.update_one(
        {"user_id": user.user_id},
        {
            "$set": {
                "company_id": company_id,
                "active_org_id": company_id,
                "restored_at": datetime.now(timezone.utc).isoformat(),
                "restored_from": old_company_id,
                "force_restored": True
            },
            "$unset": {
                "view_as_org_id": ""
            }
        }
    )
    
    # Check if membership exists, if not create one
    existing_membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "$or": [
            {"company_id": company_id},
            {"organization_id": company_id}
        ]
    })
    
    if not existing_membership:
        # Create a membership for this user
        import uuid
        new_membership = {
            "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
            "user_id": user.user_id,
            "company_id": company_id,
            "organization_id": company_id,
            "role": "owner",  # Restore as owner since they're recovering
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": "emergency_restore"
        }
        await db.memberships.insert_one(new_membership)
        membership_created = True
    else:
        membership_created = False
    
    return {
        "success": True,
        "message": f"Cuenta restaurada a {company.get('name')}",
        "old_company_id": old_company_id,
        "new_company_id": company_id,
        "company_name": company.get("name"),
        "membership_created": membership_created,
        "note": "Por favor cierra sesión y vuelve a iniciar sesión"
    }


@emergency_router.get("/my-status")
async def get_my_status(user: User = Depends(get_current_user)):
    """
    Check current user status and find their original company.
    """
    # Get current company
    current_company = await db.companies.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "name": 1, "legal_name": 1}
    )
    
    # Find all memberships for this user
    memberships = await db.memberships.find({
        "user_id": user.user_id
    }).to_list(100)
    
    # Get companies for each membership
    membership_companies = []
    for m in memberships:
        company_id = m.get("company_id") or m.get("organization_id")
        if company_id:
            company = await db.companies.find_one(
                {"company_id": company_id},
                {"_id": 0, "company_id": 1, "name": 1, "legal_name": 1}
            )
            if company:
                membership_companies.append({
                    "company_id": company["company_id"],
                    "name": company.get("name"),
                    "legal_name": company.get("legal_name"),
                    "role": m.get("role"),
                    "is_current": company["company_id"] == user.company_id
                })
    
    # Check if user created any companies (they would be the original owner)
    owned_companies = await db.companies.find({
        "$or": [
            {"created_by": user.user_id},
            {"owner_id": user.user_id}
        ]
    }, {"_id": 0, "company_id": 1, "name": 1, "legal_name": 1}).to_list(10)
    
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "current_company_id": user.company_id,
        "current_company_name": current_company.get("name") if current_company else "NOT FOUND",
        "current_company_legal_name": current_company.get("legal_name") if current_company else None,
        "is_super_admin": user.is_super_admin,
        "membership_companies": membership_companies,
        "owned_companies": [
            {
                "company_id": c["company_id"],
                "name": c.get("name"),
                "legal_name": c.get("legal_name")
            }
            for c in owned_companies
        ]
    }


@emergency_router.post("/restore-company/{company_id}")
async def restore_company(
    company_id: str,
    user: User = Depends(get_current_user)
):
    """
    Restore user's company_id to the specified company.
    User must have a membership or be super_admin.
    """
    # Verify the company exists
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if user has membership to this company OR is super_admin
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "$or": [
            {"company_id": company_id},
            {"organization_id": company_id}
        ]
    })
    
    is_owned = company.get("created_by") == user.user_id or company.get("owner_id") == user.user_id
    
    if not membership and not is_owned and not user.is_super_admin:
        raise HTTPException(
            status_code=403, 
            detail="You don't have access to this company. Must have membership or be owner."
        )
    
    # Update user's company_id
    old_company_id = user.company_id
    await db.users.update_one(
        {"user_id": user.user_id},
        {
            "$set": {
                "company_id": company_id,
                "active_org_id": company_id,
                "restored_at": datetime.now(timezone.utc).isoformat(),
                "restored_from": old_company_id
            },
            "$unset": {
                "view_as_org_id": ""
            }
        }
    )
    
    return {
        "success": True,
        "message": f"Company restored to {company.get('name')}",
        "old_company_id": old_company_id,
        "new_company_id": company_id,
        "company_name": company.get("name"),
        "note": "Please refresh your browser to see the changes"
    }


@emergency_router.get("/find-my-company")
async def find_my_company(user: User = Depends(get_current_user)):
    """
    Try to find the user's original company based on various signals.
    """
    candidates = []
    
    # 1. Check memberships with owner/admin role
    memberships = await db.memberships.find({
        "user_id": user.user_id,
        "role": {"$in": ["owner", "admin", "role_owner", "role_admin"]}
    }).to_list(10)
    
    for m in memberships:
        company_id = m.get("company_id") or m.get("organization_id")
        if company_id:
            company = await db.companies.find_one({"company_id": company_id})
            if company:
                candidates.append({
                    "company_id": company_id,
                    "name": company.get("name"),
                    "reason": f"You have {m.get('role')} membership",
                    "confidence": "high"
                })
    
    # 2. Check companies created by this user
    created = await db.companies.find({
        "$or": [
            {"created_by": user.user_id},
            {"owner_id": user.user_id}
        ]
    }).to_list(10)
    
    for c in created:
        if not any(cand["company_id"] == c["company_id"] for cand in candidates):
            candidates.append({
                "company_id": c["company_id"],
                "name": c.get("name"),
                "reason": "You created this company",
                "confidence": "very_high"
            })
    
    # 3. Check leads/contacts created by this user
    lead_companies = await db.leads.distinct("company_id", {"created_by": user.user_id})
    for company_id in lead_companies[:5]:
        if not any(cand["company_id"] == company_id for cand in candidates):
            company = await db.companies.find_one({"company_id": company_id})
            if company:
                candidates.append({
                    "company_id": company_id,
                    "name": company.get("name"),
                    "reason": "You created leads in this company",
                    "confidence": "medium"
                })
    
    return {
        "current_company_id": user.company_id,
        "candidates": candidates,
        "instruction": "Use POST /api/emergency/restore-company/{company_id} to restore your account"
    }


@emergency_router.get("/company-users/{company_id}")
async def get_company_users(
    company_id: str,
    user: User = Depends(get_current_user)
):
    """
    Get all users that should belong to a company (based on memberships).
    Useful to diagnose if users were hidden.
    """
    # Verify user has access
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "$or": [
            {"company_id": company_id},
            {"organization_id": company_id}
        ]
    })
    
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    is_owned = company.get("created_by") == user.user_id or company.get("owner_id") == user.user_id
    
    if not membership and not is_owned and not user.is_super_admin:
        raise HTTPException(status_code=403, detail="No access to this company")
    
    # Find all memberships for this company
    memberships = await db.memberships.find({
        "$or": [
            {"company_id": company_id},
            {"organization_id": company_id}
        ]
    }).to_list(100)
    
    # Get user details for each membership
    users_info = []
    for m in memberships:
        member_user = await db.users.find_one(
            {"user_id": m.get("user_id")},
            {"_id": 0, "user_id": 1, "email": 1, "name": 1, "company_id": 1, "is_active": 1}
        )
        if member_user:
            users_info.append({
                "user_id": member_user.get("user_id"),
                "email": member_user.get("email"),
                "name": member_user.get("name"),
                "role": m.get("role"),
                "current_company_id": member_user.get("company_id"),
                "is_pointing_to_this_company": member_user.get("company_id") == company_id,
                "is_active": m.get("is_active", True),
                "membership_id": m.get("membership_id")
            })
    
    # Also find users whose company_id directly points here
    direct_users = await db.users.find(
        {"company_id": company_id},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1}
    ).to_list(100)
    
    # Add direct users that aren't in memberships
    for du in direct_users:
        if not any(u["user_id"] == du["user_id"] for u in users_info):
            users_info.append({
                "user_id": du["user_id"],
                "email": du.get("email"),
                "name": du.get("name"),
                "role": "direct_assignment",
                "current_company_id": company_id,
                "is_pointing_to_this_company": True,
                "is_active": True,
                "membership_id": None
            })
    
    return {
        "company_id": company_id,
        "company_name": company.get("name"),
        "total_users": len(users_info),
        "users": users_info
    }


@emergency_router.post("/restore-user-to-company")
async def restore_user_to_company(
    target_user_id: str,
    target_company_id: str,
    user: User = Depends(get_current_user)
):
    """
    Restore a specific user's company_id. 
    Only company owner or super_admin can do this.
    """
    # Verify company exists
    company = await db.companies.find_one({"company_id": target_company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if current user is owner or super_admin
    is_owner = company.get("created_by") == user.user_id or company.get("owner_id") == user.user_id
    
    if not is_owner and not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Only company owner or super_admin can restore users")
    
    # Verify target user has membership to this company
    membership = await db.memberships.find_one({
        "user_id": target_user_id,
        "$or": [
            {"company_id": target_company_id},
            {"organization_id": target_company_id}
        ]
    })
    
    if not membership:
        raise HTTPException(status_code=400, detail="User doesn't have membership to this company")
    
    # Get target user info
    target_user = await db.users.find_one({"user_id": target_user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_company_id = target_user.get("company_id")
    
    # Update the user's company_id
    await db.users.update_one(
        {"user_id": target_user_id},
        {
            "$set": {
                "company_id": target_company_id,
                "active_org_id": target_company_id,
                "restored_at": datetime.now(timezone.utc).isoformat(),
                "restored_by": user.user_id,
                "restored_from": old_company_id
            }
        }
    )
    
    return {
        "success": True,
        "message": f"User {target_user.get('email')} restored to {company.get('name')}",
        "user_email": target_user.get("email"),
        "old_company_id": old_company_id,
        "new_company_id": target_company_id
    }


@emergency_router.post("/bulk-restore-company-users/{company_id}")
async def bulk_restore_company_users(
    company_id: str,
    user: User = Depends(get_current_user)
):
    """
    Restore ALL users with membership to this company back to this company.
    Only company owner or super_admin can do this.
    """
    # Verify company exists
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check permissions
    is_owner = company.get("created_by") == user.user_id or company.get("owner_id") == user.user_id
    
    if not is_owner and not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Only company owner or super_admin can bulk restore")
    
    # Find all memberships for this company
    memberships = await db.memberships.find({
        "$or": [
            {"company_id": company_id},
            {"organization_id": company_id}
        ]
    }).to_list(100)
    
    restored_users = []
    skipped_users = []
    
    for m in memberships:
        member_user_id = m.get("user_id")
        member = await db.users.find_one({"user_id": member_user_id})
        
        if not member:
            continue
        
        # Skip if already pointing to correct company
        if member.get("company_id") == company_id:
            skipped_users.append({
                "email": member.get("email"),
                "reason": "Already in correct company"
            })
            continue
        
        # Update user's company_id
        old_company_id = member.get("company_id")
        await db.users.update_one(
            {"user_id": member_user_id},
            {
                "$set": {
                    "company_id": company_id,
                    "active_org_id": company_id,
                    "restored_at": datetime.now(timezone.utc).isoformat(),
                    "restored_by": user.user_id,
                    "restored_from": old_company_id
                }
            }
        )
        
        restored_users.append({
            "email": member.get("email"),
            "old_company_id": old_company_id
        })
    
    return {
        "success": True,
        "company_id": company_id,
        "company_name": company.get("name"),
        "total_memberships": len(memberships),
        "restored_count": len(restored_users),
        "skipped_count": len(skipped_users),
        "restored_users": restored_users,
        "skipped_users": skipped_users
    }
