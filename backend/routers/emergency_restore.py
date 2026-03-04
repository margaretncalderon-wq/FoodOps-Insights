# routers/emergency_restore.py - Emergency endpoint to restore user's company_id
"""
EMERGENCY FIX: This endpoint allows users to restore their original company_id
after the OrgSwitcher bug incorrectly changed it.

DELETE THIS FILE AFTER ALL AFFECTED USERS ARE RESTORED.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional
from datetime import datetime, timezone

from config import db
from models.auth import User
from routers.auth import get_current_user

emergency_router = APIRouter(prefix="/emergency", tags=["Emergency"])


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
