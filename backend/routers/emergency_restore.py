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
    Emergency mode - no permission checks, just get the data.
    """
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Find all memberships for this company (no permission check for emergency)
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
        "users": users_info,
        "users_needing_fix": len([u for u in users_info if not u["is_pointing_to_this_company"]])
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
    Emergency mode - no permission checks.
    """
    # Verify company exists
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
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


@emergency_router.get("/diagnose-memberships/{company_id}")
async def diagnose_memberships(
    company_id: str,
    user: User = Depends(get_current_user)
):
    """
    Diagnose membership issues for a company.
    Shows raw membership data to find why users aren't showing.
    """
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Get raw memberships
    memberships = await db.memberships.find({
        "$or": [
            {"company_id": company_id},
            {"organization_id": company_id}
        ]
    }).to_list(100)
    
    # Clean up for JSON response
    raw_memberships = []
    for m in memberships:
        m.pop("_id", None)
        raw_memberships.append(m)
    
    # Check what status values exist
    status_values = {}
    for m in memberships:
        status = m.get("status", "NO_STATUS_FIELD")
        status_values[status] = status_values.get(status, 0) + 1
    
    return {
        "company_id": company_id,
        "company_name": company.get("name"),
        "total_memberships": len(memberships),
        "status_distribution": status_values,
        "memberships": raw_memberships
    }


@emergency_router.post("/fix-margaret")
async def fix_margaret_account(user: User = Depends(get_current_user)):
    """
    Specific fix for margaret.n.calderon@gmail.com:
    1. Find her correct company (Kora OS Test)
    2. Update her company_id to point to it
    3. Remove her membership from Staffdo if it exists
    """
    # Find Margaret's user
    margaret = await db.users.find_one({"email": "margaret.n.calderon@gmail.com"})
    if not margaret:
        raise HTTPException(status_code=404, detail="Usuario margaret.n.calderon@gmail.com no encontrado")
    
    # Find Kora OS Test company
    kora_company = await db.companies.find_one({"name": {"$regex": "kora.*os.*test", "$options": "i"}})
    if not kora_company:
        # Try other possible names
        kora_company = await db.companies.find_one({"name": {"$regex": "kora", "$options": "i"}})
    
    if not kora_company:
        # List all companies so user can identify the right one
        all_companies = await db.companies.find({}, {"_id": 0, "company_id": 1, "name": 1}).to_list(50)
        return {
            "error": "No se encontró la empresa 'Kora OS Test'",
            "available_companies": all_companies,
            "instruction": "Usa /api/emergency/fix-margaret-to/{company_id} con el ID correcto"
        }
    
    old_company_id = margaret.get("company_id")
    new_company_id = kora_company["company_id"]
    
    # Update Margaret's company_id
    await db.users.update_one(
        {"email": "margaret.n.calderon@gmail.com"},
        {
            "$set": {
                "company_id": new_company_id,
                "active_org_id": new_company_id,
                "fixed_at": datetime.now(timezone.utc).isoformat(),
                "fixed_from": old_company_id
            },
            "$unset": {"view_as_org_id": ""}
        }
    )
    
    # Ensure Margaret has membership to her company
    existing_membership = await db.memberships.find_one({
        "user_id": margaret["user_id"],
        "$or": [{"company_id": new_company_id}, {"organization_id": new_company_id}]
    })
    
    if not existing_membership:
        import uuid
        await db.memberships.insert_one({
            "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
            "user_id": margaret["user_id"],
            "company_id": new_company_id,
            "organization_id": new_company_id,
            "role": "owner",
            "status": "active",
            "is_active": True,
            "joined_at": datetime.now(timezone.utc).isoformat()
        })
        membership_created = True
    else:
        membership_created = False
    
    return {
        "success": True,
        "message": f"Margaret restaurada a {kora_company.get('name')}",
        "old_company_id": old_company_id,
        "new_company_id": new_company_id,
        "company_name": kora_company.get("name"),
        "membership_created": membership_created
    }


@emergency_router.post("/fix-margaret-to/{company_id}")
async def fix_margaret_to_specific_company(
    company_id: str,
    user: User = Depends(get_current_user)
):
    """Fix Margaret's account to a specific company by ID"""
    margaret = await db.users.find_one({"email": "margaret.n.calderon@gmail.com"})
    if not margaret:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    
    old_company_id = margaret.get("company_id")
    
    await db.users.update_one(
        {"email": "margaret.n.calderon@gmail.com"},
        {
            "$set": {
                "company_id": company_id,
                "active_org_id": company_id,
                "fixed_at": datetime.now(timezone.utc).isoformat()
            },
            "$unset": {"view_as_org_id": ""}
        }
    )
    
    # Ensure membership exists
    existing = await db.memberships.find_one({
        "user_id": margaret["user_id"],
        "$or": [{"company_id": company_id}, {"organization_id": company_id}]
    })
    
    if not existing:
        import uuid
        await db.memberships.insert_one({
            "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
            "user_id": margaret["user_id"],
            "company_id": company_id,
            "organization_id": company_id,
            "role": "owner",
            "status": "active",
            "is_active": True,
            "joined_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {
        "success": True,
        "message": f"Margaret movida a {company.get('name')}",
        "old_company_id": old_company_id,
        "new_company_id": company_id
    }


@emergency_router.post("/fix-everything")
async def fix_everything(user: User = Depends(get_current_user)):
    """
    ONE CLICK FIX - Does everything:
    1. Moves Margaret to Kora OS Test
    2. Moves Staffdo users back from Demand Generation
    3. Fixes all membership statuses
    """
    results = {
        "margaret_fix": None,
        "staffdo_users_fix": None,
        "memberships_fix": None,
        "errors": []
    }
    
    # === 1. FIX MARGARET ===
    try:
        margaret = await db.users.find_one({"email": "margaret.n.calderon@gmail.com"})
        if margaret:
            # Find her correct company (Kora OS Test)
            kora_company = await db.companies.find_one({"name": {"$regex": "kora.*os.*test", "$options": "i"}})
            if not kora_company:
                kora_company = await db.companies.find_one({"name": {"$regex": "kora", "$options": "i"}})
            
            if kora_company:
                old_company = margaret.get("company_id")
                await db.users.update_one(
                    {"email": "margaret.n.calderon@gmail.com"},
                    {"$set": {
                        "company_id": kora_company["company_id"],
                        "active_org_id": kora_company["company_id"]
                    }, "$unset": {"view_as_org_id": ""}}
                )
                
                # Ensure membership exists
                existing = await db.memberships.find_one({
                    "user_id": margaret["user_id"],
                    "$or": [{"company_id": kora_company["company_id"]}, {"organization_id": kora_company["company_id"]}]
                })
                if not existing:
                    import uuid
                    await db.memberships.insert_one({
                        "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
                        "user_id": margaret["user_id"],
                        "company_id": kora_company["company_id"],
                        "organization_id": kora_company["company_id"],
                        "role": "owner",
                        "status": "active",
                        "is_active": True,
                        "joined_at": datetime.now(timezone.utc).isoformat()
                    })
                
                # Remove Margaret from Staffdo
                staffdo = await db.companies.find_one({"name": {"$regex": "staffdo", "$options": "i"}})
                if staffdo:
                    await db.memberships.delete_many({
                        "user_id": margaret["user_id"],
                        "$or": [{"company_id": staffdo["company_id"]}, {"organization_id": staffdo["company_id"]}]
                    })
                
                results["margaret_fix"] = {
                    "success": True,
                    "moved_to": kora_company.get("name"),
                    "from": old_company
                }
            else:
                results["errors"].append("No se encontró Kora OS Test")
        else:
            results["errors"].append("Margaret no encontrada")
    except Exception as e:
        results["errors"].append(f"Error Margaret: {str(e)}")
    
    # === 2. FIX STAFFDO USERS ===
    try:
        staffdo = await db.companies.find_one({"name": {"$regex": "staffdo", "$options": "i"}})
        if staffdo:
            staffdo_id = staffdo["company_id"]
            margaret_id = margaret["user_id"] if margaret else None
            
            # Find all memberships for Staffdo
            staffdo_memberships = await db.memberships.find({
                "$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]
            }).to_list(100)
            
            moved_count = 0
            for m in staffdo_memberships:
                member_user_id = m.get("user_id")
                if member_user_id == margaret_id:
                    continue
                
                member = await db.users.find_one({"user_id": member_user_id})
                if member and member.get("company_id") != staffdo_id:
                    await db.users.update_one(
                        {"user_id": member_user_id},
                        {"$set": {
                            "company_id": staffdo_id,
                            "active_org_id": staffdo_id
                        }}
                    )
                    moved_count += 1
            
            # Fix all Staffdo memberships status
            fix_result = await db.memberships.update_many(
                {"$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]},
                {"$set": {"status": "active", "is_active": True}}
            )
            
            results["staffdo_users_fix"] = {
                "success": True,
                "users_moved_back": moved_count,
                "memberships_activated": fix_result.modified_count
            }
    except Exception as e:
        results["errors"].append(f"Error Staffdo: {str(e)}")
    
    # === 3. SUMMARY ===
    results["success"] = len(results["errors"]) == 0
    results["message"] = "Todo arreglado!" if results["success"] else "Algunos errores ocurrieron"
    
    return results
async def fix_staffdo_users(user: User = Depends(get_current_user)):
    """
    Fix all Staffdo memberships to be visible in Settings > Team:
    1. Find Staffdo company
    2. Set all memberships to status='active'
    3. Remove Margaret from Staffdo memberships
    """
    # Find Staffdo company
    staffdo = await db.companies.find_one({"name": {"$regex": "staffdo", "$options": "i"}})
    if not staffdo:
        return {"error": "No se encontró la empresa Staffdo"}
    
    staffdo_id = staffdo["company_id"]
    
    # Find Margaret to exclude her
    margaret = await db.users.find_one({"email": "margaret.n.calderon@gmail.com"})
    margaret_user_id = margaret["user_id"] if margaret else None
    
    # Fix all Staffdo memberships (except Margaret's)
    query = {
        "$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]
    }
    
    if margaret_user_id:
        query["user_id"] = {"$ne": margaret_user_id}
    
    # Update memberships to active
    result = await db.memberships.update_many(
        query,
        {
            "$set": {
                "status": "active",
                "is_active": True,
                "fixed_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Delete Margaret's membership from Staffdo
    if margaret_user_id:
        delete_result = await db.memberships.delete_many({
            "user_id": margaret_user_id,
            "$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]
        })
        margaret_removed = delete_result.deleted_count
    else:
        margaret_removed = 0
    
    # Get list of current Staffdo users
    memberships = await db.memberships.find({
        "$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]
    }).to_list(100)
    
    users_list = []
    for m in memberships:
        u = await db.users.find_one({"user_id": m.get("user_id")}, {"_id": 0, "email": 1, "name": 1})
        if u:
            users_list.append({"email": u.get("email"), "name": u.get("name"), "status": m.get("status")})
    
    return {
        "success": True,
        "staffdo_company_id": staffdo_id,
        "staffdo_name": staffdo.get("name"),
        "memberships_fixed": result.modified_count,
        "margaret_memberships_removed": margaret_removed,
        "current_staffdo_users": users_list
    }


@emergency_router.post("/move-users-back-to-staffdo")
async def move_users_back_to_staffdo(user: User = Depends(get_current_user)):
    """
    Find users that were incorrectly moved to 'Demand Generation' 
    and move them back to Staffdo.
    """
    # Find Staffdo company
    staffdo = await db.companies.find_one({"name": {"$regex": "staffdo", "$options": "i"}})
    if not staffdo:
        return {"error": "No se encontró la empresa Staffdo"}
    
    staffdo_id = staffdo["company_id"]
    
    # Find Demand Generation company
    demand_gen = await db.companies.find_one({"name": {"$regex": "demand.*gen", "$options": "i"}})
    if not demand_gen:
        # Try other variations
        demand_gen = await db.companies.find_one({"name": {"$regex": "demand", "$options": "i"}})
    
    if not demand_gen:
        return {"error": "No se encontró la empresa 'Demand Generation'"}
    
    demand_gen_id = demand_gen["company_id"]
    
    # Find Margaret to exclude her
    margaret = await db.users.find_one({"email": "margaret.n.calderon@gmail.com"})
    margaret_user_id = margaret["user_id"] if margaret else None
    
    # Find all users that have membership to Staffdo but company_id points to Demand Generation
    staffdo_memberships = await db.memberships.find({
        "$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]
    }).to_list(100)
    
    moved_users = []
    skipped_users = []
    
    for m in staffdo_memberships:
        member_user_id = m.get("user_id")
        
        # Skip Margaret
        if member_user_id == margaret_user_id:
            skipped_users.append({"reason": "Es Margaret", "user_id": member_user_id})
            continue
        
        member = await db.users.find_one({"user_id": member_user_id})
        if not member:
            continue
        
        current_company = member.get("company_id")
        
        # If user's company_id is pointing to Demand Generation (or not to Staffdo), fix it
        if current_company != staffdo_id:
            await db.users.update_one(
                {"user_id": member_user_id},
                {
                    "$set": {
                        "company_id": staffdo_id,
                        "active_org_id": staffdo_id,
                        "restored_at": datetime.now(timezone.utc).isoformat(),
                        "restored_from": current_company
                    }
                }
            )
            moved_users.append({
                "email": member.get("email"),
                "name": member.get("name"),
                "from_company": current_company,
                "to_company": staffdo_id
            })
        else:
            skipped_users.append({
                "email": member.get("email"),
                "reason": "Ya está en Staffdo"
            })
    
    # Also fix membership status
    await db.memberships.update_many(
        {"$or": [{"company_id": staffdo_id}, {"organization_id": staffdo_id}]},
        {"$set": {"status": "active", "is_active": True}}
    )
    
    return {
        "success": True,
        "staffdo_id": staffdo_id,
        "staffdo_name": staffdo.get("name"),
        "demand_gen_id": demand_gen_id,
        "demand_gen_name": demand_gen.get("name"),
        "users_moved_back": len(moved_users),
        "users_skipped": len(skipped_users),
        "moved_users": moved_users,
        "skipped_users": skipped_users
    }
