# routers/demand_studio.py - Demand Studio routes
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
import random
import string

from config import db
from models.auth import User
from models.demand_studio import (
    MarketingCampaignCreate, MarketingCampaign,
    CampaignChannelCreate, CampaignChannel,
    CampaignSpendCreate, CampaignSpend,
    CampaignAssetCreate, CampaignAsset,
    MarketingActivationCreate, MarketingActivation,
    EmailTrackingCreate, EmailTracking,
    CampaignLeadLinkCreate, CampaignOpportunityLinkCreate, CampaignAccessCreate,
    NotificationCreate,
    SocialAccountCreate, SocialAccount,
    ContentPillarCreate, ContentPillar,
    AudienceCreate, Audience,
    SegmentCreate, Segment,
    SocialPostCreate, SocialPost,
    SocialPostAssetLinkCreate, SocialPostSpendLinkCreate,
    ContentIdeaCreate, ContentIdea,
    CampaignCodeUpdate
)
from routers.auth import get_current_user
from utils.activity_logger import log_activity, user_info

demand_studio_router = APIRouter(prefix="/demand-studio", tags=["Demand Studio"])


# Helper function to get effective company_id (for viewing shared orgs)
async def get_effective_company_id(user: User, org_id: Optional[str] = None):
    """
    Returns the company_id to use for queries.
    If org_id is provided, verifies user has access to that org.
    Returns: (company_id, role) - backwards compatible
    """
    own_company_id = user.company_id or user.active_org_id
    
    if not org_id or org_id == own_company_id:
        # User's own company - full access
        return own_company_id, "owner"
    
    # Check if user has membership access to the requested org
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "$and": [
            {"$or": [{"company_id": org_id}, {"organization_id": org_id}]},
            {"$or": [{"status": "active"}, {"status": {"$exists": False}}]}
        ]
    })
    
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this organization")
    
    return org_id, membership.get("role", "viewer")


async def ensure_owner_membership(user: User):
    """Auto-create membership for company owners who are missing one.
    This fixes users who were created before the membership system was in place."""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return
    
    existing = await db.memberships.find_one({
        "user_id": user.user_id,
        "$or": [{"company_id": company_id}, {"organization_id": company_id}]
    })
    if not existing:
        await db.memberships.insert_one({
            "user_id": user.user_id,
            "company_id": company_id,
            "organization_id": company_id,
            "role": "admin",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat()
        })


async def check_section_permission(
    user: User, 
    org_id: Optional[str], 
    section: str, 
    required_role: str = "viewer"
) -> tuple:
    """
    Check if user has permission to access a specific section of an organization.
    
    Sections: social_media, campaigns, spend_ledger, email_marketing, notes, insights, activations
    Roles: admin > editor > contributor > viewer
    
    Returns: (company_id, can_write)
    """
    ROLE_HIERARCHY = {
        "admin": 4, "editor": 3, 
        "contributor": 2, "social_contributor": 2, "ops": 2,
        "social_viewer": 2,
        "viewer": 1
    }
    
    own_company_id = user.company_id or user.active_org_id
    
    # If no org_id or it's user's own company - full access
    if not org_id or org_id == own_company_id:
        return own_company_id, True
    
    # Get membership with permissions
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "$and": [
            {"$or": [{"company_id": org_id}, {"organization_id": org_id}]},
            {"$or": [{"status": "active"}, {"status": {"$exists": False}}]}
        ]
    })
    
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this organization")
    
    permissions = membership.get("permissions", {})
    
    # If no granular permissions set, check general role
    if not permissions:
        general_role = membership.get("role", "viewer")
        # For collaborators without specific permissions, deny access
        if general_role == "collaborator":
            raise HTTPException(status_code=403, detail=f"No access to {section}")
        can_write = ROLE_HIERARCHY.get(general_role, 0) >= ROLE_HIERARCHY.get("contributor", 2)
        return org_id, can_write
    
    # Check specific section permission
    section_perm = permissions.get(section, {})
    
    if not section_perm.get("enabled", False):
        raise HTTPException(status_code=403, detail=f"No access to {section}")
    
    section_role = section_perm.get("role", "viewer")
    required_level = ROLE_HIERARCHY.get(required_role, 1)
    user_level = ROLE_HIERARCHY.get(section_role, 1)
    
    if user_level < required_level:
        raise HTTPException(status_code=403, detail=f"Insufficient permissions for {section}")
    
    can_write = user_level >= ROLE_HIERARCHY.get("contributor", 2)
    return org_id, can_write


# ============== SECTION PERMISSIONS ENDPOINT ==============

@demand_studio_router.get("/my-permissions")
async def get_my_permissions(
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """
    Get user's permissions for each section in an organization.
    Returns which sections are accessible and the role for each.
    """
    own_company_id = user.company_id or user.active_org_id
    
    # If viewing own company, full access
    if not org_id or org_id == own_company_id:
        return {
            "org_id": own_company_id,
            "is_own_org": True,
            "sections": {
                "social_media": {"enabled": True, "role": "admin", "can_write": True},
                "campaigns": {"enabled": True, "role": "admin", "can_write": True},
                "spend_ledger": {"enabled": True, "role": "admin", "can_write": True},
                "email_marketing": {"enabled": True, "role": "admin", "can_write": True},
                "notes": {"enabled": True, "role": "admin", "can_write": True},
                "insights": {"enabled": True, "role": "admin", "can_write": True},
                "activations": {"enabled": True, "role": "admin", "can_write": True}
            }
        }
    
    # Check membership for the requested org
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "$and": [
            {"$or": [{"company_id": org_id}, {"organization_id": org_id}]},
            {"$or": [{"status": "active"}, {"status": {"$exists": False}}]}
        ]
    })
    
    if not membership:
        raise HTTPException(status_code=403, detail="No access to this organization")
    
    permissions = membership.get("permissions", {})
    general_role = membership.get("role", "viewer")
    
    ROLE_HIERARCHY = {
        "admin": 4, "editor": 3, 
        "contributor": 2, "social_contributor": 2, "ops": 2,
        "social_viewer": 2,
        "viewer": 1
    }
    
    # Build section permissions
    sections = {}
    default_sections = ["social_media", "campaigns", "spend_ledger", "email_marketing", "notes", "insights", "activations"]
    
    for section in default_sections:
        section_perm = permissions.get(section, {})
        
        if permissions:
            # Granular permissions defined
            enabled = section_perm.get("enabled", False)
            role = section_perm.get("role", "viewer") if enabled else None
        else:
            # No granular permissions - use general role (except for collaborator)
            enabled = general_role != "collaborator"
            role = general_role if enabled else None
        
        sections[section] = {
            "enabled": enabled,
            "role": role,
            "can_write": ROLE_HIERARCHY.get(role, 0) >= ROLE_HIERARCHY.get("contributor", 2) if role else False
        }
    
    return {
        "org_id": org_id,
        "is_own_org": False,
        "general_role": general_role,
        "sections": sections
    }


# ============== CAMPAIGN CODE HELPERS ==============

def generate_campaign_code() -> str:
    """Generate a random campaign code like CAM-7F3K2"""
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(random.choices(chars, k=5))
    return f"CAM-{random_part}"


async def ensure_unique_campaign_code(company_id: str, code: str, exclude_campaign_id: str = None) -> bool:
    """Check if campaign code is unique within organization"""
    query = {
        "company_id": company_id,
        "campaign_code": code.upper()
    }
    if exclude_campaign_id:
        query["campaign_id"] = {"$ne": exclude_campaign_id}
    
    existing = await db.marketing_campaigns.find_one(query)
    return existing is None


async def get_campaign_by_code(company_id: str, campaign_code: str) -> dict:
    """Find campaign by tracking code within organization"""
    normalized_code = campaign_code.strip().upper()
    return await db.marketing_campaigns.find_one(
        {"company_id": company_id, "campaign_code": normalized_code},
        {"_id": 0}
    )

# ============== ROLE PERMISSIONS ==============
ROLE_PERMISSIONS = {
    "owner": ["view", "edit", "delete", "manage_access", "view_financials"],
    "admin": ["view", "edit", "delete", "manage_access", "view_financials"],
    "manager": ["view", "edit", "view_financials"],
    "marketing_partner": ["view", "edit"]
}

async def get_user_role(user: User, campaign_id: str = None) -> str:
    """Get the user's role for a specific campaign or general role"""
    if user.is_super_admin:
        return "owner"
    
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return "marketing_partner"
    
    # Check if user has specific campaign access
    if campaign_id:
        access = await db.campaign_access.find_one({
            "campaign_id": campaign_id,
            "user_id": user.user_id
        })
        if access:
            level = access.get("access_level", "view")
            if level == "admin":
                return "admin"
            elif level == "edit":
                return "manager"
            return "marketing_partner"
    
    # Check membership role
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "organization_id": company_id
    })
    if membership:
        return membership.get("role", "admin")
    
    return "owner"

def can_user_perform_action(role: str, action: str) -> bool:
    """Check if a role can perform a specific action"""
    return action in ROLE_PERMISSIONS.get(role, [])


@demand_studio_router.get("/stats")
async def get_demand_studio_stats(
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get dashboard statistics for Demand Studio"""
    # Use org_id if provided and user has access
    if org_id:
        effective_company_id, role = await get_effective_company_id(user, org_id)
        if not effective_company_id:
            raise HTTPException(status_code=403, detail="No access to this organization")
        company_id = effective_company_id
    else:
        company_id = user.company_id or user.active_org_id
    
    if not company_id:
        return {
            "activeCampaigns": 0,
            "spendMTD": 0,
            "spendQTD": 0,
            "leadsLinked": 0,
            "opportunitiesLinked": 0,
            "onlineSpend": 0,
            "offlineSpend": 0
        }
    
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    quarter_month = ((now.month - 1) // 3) * 3 + 1
    quarter_start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Count active campaigns
    active_campaigns = await db.marketing_campaigns.count_documents({
        "company_id": company_id,
        "status": "active"
    })
    
    # Calculate spend MTD
    mtd_spend = await db.campaign_spend.aggregate([
        {"$match": {
            "company_id": company_id,
            "created_at": {"$gte": month_start.isoformat()}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    spend_mtd = mtd_spend[0]["total"] if mtd_spend else 0
    
    # Calculate spend QTD
    qtd_spend = await db.campaign_spend.aggregate([
        {"$match": {
            "company_id": company_id,
            "created_at": {"$gte": quarter_start.isoformat()}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    spend_qtd = qtd_spend[0]["total"] if qtd_spend else 0
    
    # Count linked leads - now from leads collection directly (includes auto-linked)
    leads_linked = await db.leads.count_documents({
        "company_id": company_id,
        "campaign_id": {"$ne": None}
    })
    
    # Also count from legacy campaign_lead_links table for backward compatibility
    legacy_leads_linked = await db.campaign_lead_links.count_documents({"company_id": company_id})
    leads_linked = max(leads_linked, legacy_leads_linked)
    
    # Count linked opportunities
    opportunities_linked = await db.campaign_opportunity_links.count_documents({"company_id": company_id})
    
    # Online vs Offline spend
    online_spend = await db.campaign_spend.aggregate([
        {"$match": {"company_id": company_id, "category": "online"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    offline_spend = await db.campaign_spend.aggregate([
        {"$match": {"company_id": company_id, "category": "offline"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    return {
        "activeCampaigns": active_campaigns,
        "spendMTD": round(spend_mtd, 2),
        "spendQTD": round(spend_qtd, 2),
        "leadsLinked": leads_linked,
        "opportunitiesLinked": opportunities_linked,
        "onlineSpend": round(online_spend[0]["total"] if online_spend else 0, 2),
        "offlineSpend": round(offline_spend[0]["total"] if offline_spend else 0, 2)
    }

# ---- Campaigns CRUD ----

@demand_studio_router.get("/campaigns")
async def get_campaigns(
    status: Optional[str] = None,
    campaign_type: Optional[str] = None,
    scope: Optional[str] = None,  # "owned" | "shared" | None (both)
    org_id: Optional[str] = None,  # Filter by specific organization
    user: User = Depends(get_current_user)
):
    """Get marketing campaigns with optional scope filter for collaboration"""
    # Check section permission for campaigns
    company_id, can_write = await check_section_permission(user, org_id, "campaigns", "viewer")
    
    if not company_id:
        return []
    
    campaigns = []
    
    # Get campaigns for the selected org
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if campaign_type:
        query["campaign_type"] = campaign_type
    
    owned_campaigns = await db.marketing_campaigns.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Mark as owned or shared based on context
    is_own_org = company_id == (user.company_id or user.active_org_id)
    for c in owned_campaigns:
        c["_access_type"] = "owned" if is_own_org else "shared"
        c["_can_edit"] = can_write
    campaigns.extend(owned_campaigns)
    
    # If viewing own org and scope allows, also get cross-org shared campaigns
    if is_own_org and scope != "owned":
        shared_entities = await db.shared_entities.find({
            "target_org_id": company_id,
            "entity_type": "campaign",
            "status": "active"
        }, {"_id": 0, "entity_id": 1, "source_org_name": 1, "permission_level": 1, "scope": 1}).to_list(100)
        
        if shared_entities:
            shared_campaign_ids = [s["entity_id"] for s in shared_entities]
            shared_info = {s["entity_id"]: s for s in shared_entities}
            
            shared_campaigns = await db.marketing_campaigns.find(
                {"campaign_id": {"$in": shared_campaign_ids}},
                {"_id": 0}
            ).to_list(100)
            
            existing_ids = {c["campaign_id"] for c in campaigns}
            for sc in shared_campaigns:
                if sc["campaign_id"] not in existing_ids:
                    info = shared_info.get(sc["campaign_id"], {})
                    sc["_access_type"] = "shared"
                    sc["_shared_from"] = info.get("source_org_name", "Unknown")
                    sc["_permission_level"] = info.get("permission_level", "view")
                    sc["_allowed_scope"] = info.get("scope", [])
                    campaigns.append(sc)
    
    return campaigns

@demand_studio_router.post("/campaigns")
async def create_campaign(
    data: MarketingCampaignCreate, 
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Create a new marketing campaign"""
    # Check write permission for campaigns section
    company_id, can_write = await check_section_permission(user, org_id, "campaigns", "editor")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    if not can_write:
        raise HTTPException(status_code=403, detail="No write permission for campaigns")
    
    # Generate or validate campaign_code
    campaign_code = None
    if data.campaign_code:
        # User provided a code - validate uniqueness
        normalized_code = data.campaign_code.strip().upper()
        if not await ensure_unique_campaign_code(company_id, normalized_code):
            raise HTTPException(status_code=400, detail="Campaign code already exists in your organization")
        campaign_code = normalized_code
    else:
        # Auto-generate unique code
        for _ in range(10):  # Try up to 10 times
            generated = generate_campaign_code()
            if await ensure_unique_campaign_code(company_id, generated):
                campaign_code = generated
                break
        if not campaign_code:
            campaign_code = f"CAM-{uuid.uuid4().hex[:8].upper()}"  # Fallback
    
    now = datetime.now(timezone.utc)
    campaign = {
        "campaign_id": f"camp_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "campaign_type": data.campaign_type,
        "objective": data.objective,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "budget": data.budget,
        "actual_spend": 0.0,
        "status": data.status,
        "tags": data.tags,
        "notes": data.notes,
        "owner_user_id": user.user_id,
        "leads_linked": 0,
        "opportunities_linked": 0,
        # Campaign Tracking fields
        "campaign_code": campaign_code,
        "channel_type": data.channel_type,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.marketing_campaigns.insert_one(campaign)
    del campaign["_id"]
    
    # Log activity
    await log_activity(
        module="demand_studio",
        action="create",
        entity_type="campaign",
        entity_id=campaign["campaign_id"],
        entity_name=data.name,
        **user_info(user)
    )
    
    return campaign

@demand_studio_router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user: User = Depends(get_current_user)):
    """Get a single campaign"""
    company_id = user.company_id or user.active_org_id
    campaign = await db.marketing_campaigns.find_one(
        {"campaign_id": campaign_id, "company_id": company_id},
        {"_id": 0}
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign

@demand_studio_router.put("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, data: MarketingCampaignCreate, user: User = Depends(get_current_user)):
    """Update a campaign"""
    company_id = user.company_id or user.active_org_id
    update_data = data.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # If campaign_code is being updated, validate uniqueness
    if "campaign_code" in update_data and update_data["campaign_code"]:
        normalized_code = update_data["campaign_code"].strip().upper()
        if not await ensure_unique_campaign_code(company_id, normalized_code, exclude_campaign_id=campaign_id):
            raise HTTPException(status_code=400, detail="Campaign code already exists in your organization")
        update_data["campaign_code"] = normalized_code
    
    result = await db.marketing_campaigns.update_one(
        {"campaign_id": campaign_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Log activity
    await log_activity(
        module="demand_studio",
        action="update",
        entity_type="campaign",
        entity_id=campaign_id,
        entity_name=data.name,
        **user_info(user)
    )
    
    return await db.marketing_campaigns.find_one(
        {"campaign_id": campaign_id},
        {"_id": 0}
    )


@demand_studio_router.patch("/campaigns/{campaign_id}/code")
async def update_campaign_code(campaign_id: str, data: CampaignCodeUpdate, user: User = Depends(get_current_user)):
    """Update campaign tracking code"""
    company_id = user.company_id or user.active_org_id
    
    normalized_code = data.campaign_code.strip().upper()
    if not await ensure_unique_campaign_code(company_id, normalized_code, exclude_campaign_id=campaign_id):
        raise HTTPException(status_code=400, detail="Campaign code already exists in your organization")
    
    result = await db.marketing_campaigns.update_one(
        {"campaign_id": campaign_id, "company_id": company_id},
        {"$set": {"campaign_code": normalized_code, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    return {"campaign_code": normalized_code}

@demand_studio_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: User = Depends(get_current_user)):
    """Delete a campaign"""
    company_id = user.company_id or user.active_org_id
    
    # Get campaign name for logging
    campaign = await db.marketing_campaigns.find_one(
        {"campaign_id": campaign_id, "company_id": company_id},
        {"_id": 0, "name": 1}
    )
    
    result = await db.marketing_campaigns.delete_one(
        {"campaign_id": campaign_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Also delete related data
    await db.campaign_channels.delete_many({"campaign_id": campaign_id})
    await db.campaign_spend.delete_many({"campaign_id": campaign_id})
    await db.campaign_assets.delete_many({"campaign_id": campaign_id})
    await db.campaign_lead_links.delete_many({"campaign_id": campaign_id})
    await db.campaign_opportunity_links.delete_many({"campaign_id": campaign_id})
    
    # Log activity
    if campaign:
        await log_activity(
            module="demand_studio",
            action="delete",
            entity_type="campaign",
            entity_id=campaign_id,
            entity_name=campaign.get("name", "Campaign"),
            **user_info(user)
        )
    
    return {"success": True}

# ---- Campaign Channels CRUD ----

@demand_studio_router.get("/channels")
async def get_channels(campaign_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get campaign channels"""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    channels = await db.campaign_channels.find(query, {"_id": 0}).to_list(500)
    return channels

@demand_studio_router.post("/channels")
async def create_channel(data: CampaignChannelCreate, user: User = Depends(get_current_user)):
    """Create a campaign channel"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    channel = {
        "channel_id": f"chan_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "channel_type": data.channel_type,
        "channel_name": data.channel_name,
        "budget_allocated": data.budget_allocated,
        "actual_spend": 0.0,
        "status": data.status,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.campaign_channels.insert_one(channel)
    del channel["_id"]
    return channel

@demand_studio_router.put("/channels/{channel_id}")
async def update_channel(channel_id: str, data: CampaignChannelCreate, user: User = Depends(get_current_user)):
    """Update a channel"""
    company_id = user.company_id or user.active_org_id
    update_data = data.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.campaign_channels.update_one(
        {"channel_id": channel_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    return await db.campaign_channels.find_one({"channel_id": channel_id}, {"_id": 0})

@demand_studio_router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str, user: User = Depends(get_current_user)):
    """Delete a channel"""
    company_id = user.company_id or user.active_org_id
    result = await db.campaign_channels.delete_one(
        {"channel_id": channel_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")
    return {"success": True}

# ---- Campaign Spend CRUD ----

@demand_studio_router.get("/spend")
async def get_spend(
    campaign_id: Optional[str] = None,
    channel_id: Optional[str] = None,
    category: Optional[str] = None,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get campaign spend records"""
    # Check section permission for spend_ledger
    company_id, can_write = await check_section_permission(user, org_id, "spend_ledger", "viewer")
    
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if channel_id:
        query["channel_id"] = channel_id
    if category:
        query["category"] = category
    
    spend = await db.campaign_spend.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Add write permission info to each record
    for s in spend:
        s["_can_edit"] = can_write
    return spend

@demand_studio_router.post("/spend")
async def create_spend(
    data: CampaignSpendCreate, 
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Record campaign spend"""
    # Check write permission for spend_ledger section
    company_id, can_write = await check_section_permission(user, org_id, "spend_ledger", "editor")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    if not can_write:
        raise HTTPException(status_code=403, detail="No write permission for spend ledger")
    
    now = datetime.now(timezone.utc)
    spend = {
        "spend_id": f"spend_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "channel_id": data.channel_id,
        "spend_type": data.spend_type,
        "category": data.category,
        "amount": data.amount,
        "spend_date": data.spend_date or now.strftime("%Y-%m-%d"),
        "description": data.description,
        "vendor": data.vendor,
        "invoice_ref": data.invoice_ref,
        "created_at": now.isoformat()
    }
    await db.campaign_spend.insert_one(spend)
    del spend["_id"]
    
    # Update campaign actual_spend
    await db.marketing_campaigns.update_one(
        {"campaign_id": data.campaign_id},
        {"$inc": {"actual_spend": data.amount}}
    )
    
    # Update channel actual_spend if applicable
    if data.channel_id:
        await db.campaign_channels.update_one(
            {"channel_id": data.channel_id},
            {"$inc": {"actual_spend": data.amount}}
        )
    
    return spend

@demand_studio_router.delete("/spend/{spend_id}")
async def delete_spend(spend_id: str, user: User = Depends(get_current_user)):
    """Delete spend record"""
    company_id = user.company_id or user.active_org_id
    spend = await db.campaign_spend.find_one(
        {"spend_id": spend_id, "company_id": company_id}
    )
    if not spend:
        raise HTTPException(status_code=404, detail="Spend record not found")
    
    # Reverse the spend from campaign and channel
    await db.marketing_campaigns.update_one(
        {"campaign_id": spend["campaign_id"]},
        {"$inc": {"actual_spend": -spend["amount"]}}
    )
    if spend.get("channel_id"):
        await db.campaign_channels.update_one(
            {"channel_id": spend["channel_id"]},
            {"$inc": {"actual_spend": -spend["amount"]}}
        )
    
    await db.campaign_spend.delete_one({"spend_id": spend_id})
    return {"success": True}

# ---- Campaign Assets CRUD ----

@demand_studio_router.get("/assets")
async def get_assets(campaign_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get campaign assets"""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    assets = await db.campaign_assets.find(query, {"_id": 0}).to_list(500)
    return assets

@demand_studio_router.post("/assets")
async def create_asset(data: CampaignAssetCreate, user: User = Depends(get_current_user)):
    """Create a campaign asset"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    asset = {
        "asset_id": f"asset_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "title": data.title,
        "asset_type": data.asset_type,
        "url_or_file_ref": data.url_or_file_ref,
        "description": data.description,
        "tags": data.tags,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.campaign_assets.insert_one(asset)
    del asset["_id"]
    return asset

@demand_studio_router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user: User = Depends(get_current_user)):
    """Delete an asset"""
    company_id = user.company_id or user.active_org_id
    result = await db.campaign_assets.delete_one(
        {"asset_id": asset_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"success": True}

# ---- Marketing Activations CRUD ----

@demand_studio_router.get("/activations")
async def get_activations(
    campaign_id: Optional[str] = None,
    status: Optional[str] = None,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get marketing activations"""
    # Check section permission for activations
    company_id, can_write = await check_section_permission(user, org_id, "activations", "viewer")
    
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if status:
        query["status"] = status
    
    activations = await db.marketing_activations.find(query, {"_id": 0}).sort("start_date", -1).to_list(500)
    
    # Enrich with linked event info
    for a in activations:
        a["_can_edit"] = can_write
        if a.get("linked_event_id"):
            event = await db.events.find_one(
                {"event_id": a["linked_event_id"]},
                {"_id": 0, "name": 1, "event_date": 1, "venue": 1, "status": 1, "client_id": 1}
            )
            if event:
                a["linked_event"] = event
                # Get client name
                if event.get("client_id"):
                    client = await db.clients.find_one(
                        {"client_id": event["client_id"]},
                        {"_id": 0, "name": 1}
                    )
                    a["linked_event"]["client_name"] = client.get("name") if client else None
    
    return activations

@demand_studio_router.post("/activations")
async def create_activation(
    data: MarketingActivationCreate, 
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Create a marketing activation"""
    # Check write permission for activations section
    company_id, can_write = await check_section_permission(user, org_id, "activations", "editor")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    if not can_write:
        raise HTTPException(status_code=403, detail="No write permission for activations")
    
    now = datetime.now(timezone.utc)
    activation = {
        "activation_id": f"activ_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "activation_type": data.activation_type,
        "campaign_id": data.campaign_id,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "location": data.location,
        "budget": data.budget,
        "actual_spend": 0.0,
        "status": data.status,
        "notes": data.notes,
        "linked_event_id": data.linked_event_id,
        "linked_event_name": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # If linked_event_id provided, get event name and create bidirectional link
    if data.linked_event_id:
        event = await db.events.find_one(
            {"event_id": data.linked_event_id, "company_id": company_id},
            {"_id": 0, "name": 1}
        )
        if event:
            activation["linked_event_name"] = event.get("name")
            # Update event with activation link
            await db.events.update_one(
                {"event_id": data.linked_event_id},
                {"$set": {
                    "linked_activation_id": activation["activation_id"],
                    "linked_activation_name": data.name,
                    "marketing_budget": data.budget,
                    "updated_at": now.isoformat()
                }}
            )
    
    await db.marketing_activations.insert_one(activation)
    del activation["_id"]
    return activation

@demand_studio_router.put("/activations/{activation_id}")
async def update_activation(activation_id: str, data: MarketingActivationCreate, user: User = Depends(get_current_user)):
    """Update an activation"""
    company_id = user.company_id or user.active_org_id
    update_data = data.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.marketing_activations.update_one(
        {"activation_id": activation_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Activation not found")
    
    return await db.marketing_activations.find_one({"activation_id": activation_id}, {"_id": 0})

@demand_studio_router.delete("/activations/{activation_id}")
async def delete_activation(activation_id: str, user: User = Depends(get_current_user)):
    """Delete an activation"""
    company_id = user.company_id or user.active_org_id
    
    # If linked to an event, unlink first
    activation = await db.marketing_activations.find_one({"activation_id": activation_id})
    if activation and activation.get("linked_event_id"):
        await db.events.update_one(
            {"event_id": activation["linked_event_id"]},
            {"$set": {"linked_activation_id": None, "linked_activation_name": None, "marketing_budget": None}}
        )
    
    result = await db.marketing_activations.delete_one(
        {"activation_id": activation_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Activation not found")
    return {"success": True}


# ---- Activation <-> Event Link Endpoints ----

@demand_studio_router.post("/activations/{activation_id}/link-event/{event_id}")
async def link_activation_to_event(
    activation_id: str, 
    event_id: str, 
    user: User = Depends(get_current_user)
):
    """Link an activation to an event (bidirectional)"""
    company_id = user.company_id or user.active_org_id
    
    # Verify activation exists and belongs to user
    activation = await db.marketing_activations.find_one({
        "activation_id": activation_id, 
        "company_id": company_id
    })
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")
    
    # Verify event exists and belongs to user
    event = await db.events.find_one({
        "event_id": event_id, 
        "company_id": company_id
    })
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if activation is already linked to another event
    if activation.get("linked_event_id") and activation["linked_event_id"] != event_id:
        # Unlink from old event first
        await db.events.update_one(
            {"event_id": activation["linked_event_id"]},
            {"$set": {"linked_activation_id": None, "linked_activation_name": None, "marketing_budget": None}}
        )
    
    # Check if event is already linked to another activation
    if event.get("linked_activation_id") and event["linked_activation_id"] != activation_id:
        # Unlink from old activation first
        await db.marketing_activations.update_one(
            {"activation_id": event["linked_activation_id"]},
            {"$set": {"linked_event_id": None, "linked_event_name": None}}
        )
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update activation with event link
    await db.marketing_activations.update_one(
        {"activation_id": activation_id},
        {"$set": {
            "linked_event_id": event_id,
            "linked_event_name": event.get("name"),
            "updated_at": now
        }}
    )
    
    # Update event with activation link
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {
            "linked_activation_id": activation_id,
            "linked_activation_name": activation.get("name"),
            "marketing_budget": activation.get("budget", 0),
            "updated_at": now
        }}
    )
    
    return {
        "success": True,
        "activation_id": activation_id,
        "event_id": event_id,
        "message": f"Activation '{activation.get('name')}' linked to Event '{event.get('name')}'"
    }


@demand_studio_router.delete("/activations/{activation_id}/unlink-event")
async def unlink_activation_from_event(
    activation_id: str, 
    user: User = Depends(get_current_user)
):
    """Unlink an activation from its linked event"""
    company_id = user.company_id or user.active_org_id
    
    # Get activation
    activation = await db.marketing_activations.find_one({
        "activation_id": activation_id, 
        "company_id": company_id
    })
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")
    
    linked_event_id = activation.get("linked_event_id")
    if not linked_event_id:
        return {"success": True, "message": "Activation was not linked to any event"}
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Remove link from activation
    await db.marketing_activations.update_one(
        {"activation_id": activation_id},
        {"$set": {
            "linked_event_id": None,
            "linked_event_name": None,
            "updated_at": now
        }}
    )
    
    # Remove link from event
    await db.events.update_one(
        {"event_id": linked_event_id},
        {"$set": {
            "linked_activation_id": None,
            "linked_activation_name": None,
            "marketing_budget": None,
            "updated_at": now
        }}
    )
    
    return {"success": True, "message": "Activation unlinked from event"}


@demand_studio_router.get("/activations/{activation_id}/linkable-events")
async def get_linkable_events(
    activation_id: str,
    user: User = Depends(get_current_user)
):
    """Get events that can be linked to this activation (same company, not already linked)"""
    company_id = user.company_id or user.active_org_id
    
    # Get activation to check dates
    activation = await db.marketing_activations.find_one({
        "activation_id": activation_id,
        "company_id": company_id
    })
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")
    
    # Confirmed stages for Event Orchestration
    CONFIRMED_STAGES = ["Committed", "Won", "Closed"]
    
    # Find events that are not linked or are linked to this activation
    events = await db.events.find({
        "company_id": company_id,
        "$or": [
            {"linked_activation_id": None},
            {"linked_activation_id": {"$exists": False}},
            {"linked_activation_id": activation_id}
        ]
    }, {
        "_id": 0, 
        "event_id": 1, 
        "name": 1, 
        "event_date": 1, 
        "client_id": 1,
        "venue": 1,
        "status": 1,
        "stage": 1,
        "guest_count": 1,
        "linked_activation_id": 1
    }).sort("event_date", -1).to_list(100)
    
    # Enrich with client names and confirmation status
    for event in events:
        if event.get("client_id"):
            client = await db.clients.find_one(
                {"client_id": event["client_id"]},
                {"_id": 0, "name": 1, "legal_name": 1, "display_name": 1}
            )
            event["client_name"] = client.get("display_name") or client.get("name") or client.get("legal_name") if client else None
        event["is_currently_linked"] = event.get("linked_activation_id") == activation_id
        event["is_confirmed"] = event.get("stage") in CONFIRMED_STAGES
    
    return events


@demand_studio_router.get("/activations/{activation_id}/linked-event-details")
async def get_linked_event_details(
    activation_id: str,
    user: User = Depends(get_current_user)
):
    """Get full details of the event linked to this activation"""
    company_id = user.company_id or user.active_org_id
    
    # Get activation
    activation = await db.marketing_activations.find_one({
        "activation_id": activation_id,
        "company_id": company_id
    }, {"_id": 0})
    
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")
    
    if not activation.get("linked_event_id"):
        raise HTTPException(status_code=404, detail="No event linked to this activation")
    
    # Get full event details
    event = await db.events.find_one({
        "event_id": activation["linked_event_id"],
        "company_id": company_id
    }, {"_id": 0})
    
    if not event:
        raise HTTPException(status_code=404, detail="Linked event not found")
    
    # Enrich with client info
    if event.get("client_id"):
        client = await db.clients.find_one(
            {"client_id": event["client_id"]},
            {"_id": 0, "display_name": 1, "name": 1, "legal_name": 1}
        )
        event["client_name"] = client.get("display_name") or client.get("name") or client.get("legal_name") if client else None
    
    # Check confirmation status
    CONFIRMED_STAGES = ["Committed", "Won", "Closed"]
    event["is_confirmed"] = event.get("stage") in CONFIRMED_STAGES
    
    return event



@demand_studio_router.get("/events/{event_id}/linked-activation")
async def get_linked_activation_for_event(
    event_id: str,
    user: User = Depends(get_current_user)
):
    """Get the activation linked to this event (for Event Orchestration view)"""
    company_id = user.company_id or user.active_org_id
    
    # Get activation linked to this event
    activation = await db.marketing_activations.find_one({
        "linked_event_id": event_id,
        "company_id": company_id
    }, {"_id": 0})
    
    if not activation:
        return None
    
    # Enrich with campaign name if linked
    if activation.get("campaign_id"):
        campaign = await db.campaigns.find_one(
            {"campaign_id": activation["campaign_id"]},
            {"_id": 0, "name": 1}
        )
        activation["campaign_name"] = campaign.get("name") if campaign else None
    
    return activation



# ---- Internal Cost Center / Quick Event Creation ----

class QuickEventCreate(BaseModel):
    """Model for creating a quick internal event from an Activation"""
    name: str
    event_date: Optional[str] = None
    budget: float = 0.0
    notes: Optional[str] = None


@demand_studio_router.get("/internal-cost-center")
async def get_or_create_internal_cost_center(user: User = Depends(get_current_user)):
    """Get or create the internal cost center 'client' for this organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Try to find existing internal cost center
    cost_center = await db.clients.find_one({
        "company_id": company_id,
        "is_internal_cost_center": True
    }, {"_id": 0})
    
    if cost_center:
        return cost_center
    
    # Create new internal cost center
    now = datetime.now(timezone.utc)
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    
    # Get organization name for display
    org = await db.organizations.find_one({"org_id": company_id}, {"_id": 0, "name": 1})
    org_name = org.get("name", "My Company") if org else "My Company"
    
    cost_center_doc = {
        "client_id": client_id,
        "company_id": company_id,
        "client_type": "Company",
        "display_name": f"Marketing Interno - {org_name}",
        "is_internal_cost_center": True,
        "source": "Internal",
        "tags": ["cost-center", "internal"],
        "notes": "Cliente interno para eventos y activaciones de marketing propio",
        "status": "Active",
        "total_revenue": 0.0,
        "events_count": 0,
        "has_credit": False,
        "credit_limit": 0.0,
        "credit_used": 0.0,
        "payment_terms": "immediate",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.clients.insert_one(cost_center_doc)
    del cost_center_doc["_id"]
    
    return cost_center_doc


@demand_studio_router.post("/activations/{activation_id}/create-internal-event")
async def create_internal_event_for_activation(
    activation_id: str,
    data: QuickEventCreate,
    user: User = Depends(get_current_user)
):
    """Create a quick internal event and link it to this activation"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Verify activation exists
    activation = await db.marketing_activations.find_one({
        "activation_id": activation_id,
        "company_id": company_id
    })
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")
    
    # Get or create internal cost center
    cost_center = await db.clients.find_one({
        "company_id": company_id,
        "is_internal_cost_center": True
    }, {"_id": 0, "client_id": 1, "display_name": 1})
    
    if not cost_center:
        # Create it
        now = datetime.now(timezone.utc)
        client_id = f"client_{uuid.uuid4().hex[:12]}"
        org = await db.organizations.find_one({"org_id": company_id}, {"_id": 0, "name": 1})
        org_name = org.get("name", "My Company") if org else "My Company"
        
        cost_center = {
            "client_id": client_id,
            "company_id": company_id,
            "client_type": "Company",
            "display_name": f"Marketing Interno - {org_name}",
            "is_internal_cost_center": True,
            "source": "Internal",
            "tags": ["cost-center", "internal"],
            "notes": "Cliente interno para eventos y activaciones de marketing propio",
            "status": "Active",
            "total_revenue": 0.0,
            "events_count": 0,
            "has_credit": False,
            "credit_limit": 0.0,
            "credit_used": 0.0,
            "payment_terms": "immediate",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.clients.insert_one(cost_center)
    
    # Create the internal event
    now = datetime.now(timezone.utc)
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    event_doc = {
        "event_id": event_id,
        "company_id": company_id,
        "client_id": cost_center["client_id"],
        "name": data.name,
        "event_type": "marketing",
        "engagement_type": "event",
        "event_date": data.event_date,
        "event_date_tbd": not bool(data.event_date),
        "venue": None,
        "guest_count": 0,
        "budget": data.budget,
        "notes": data.notes or f"Evento creado desde Activation: {activation.get('name', '')}",
        "status": "planning",
        "stage": "Committed",  # Internal events are auto-committed
        "source": "Demand Studio",
        "is_internal_event": True,
        # Link to activation
        "linked_activation_id": activation_id,
        "linked_activation_name": activation.get("name"),
        "marketing_budget": activation.get("budget", 0),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.events.insert_one(event_doc)
    
    # Update the cost center's event count
    await db.clients.update_one(
        {"client_id": cost_center["client_id"]},
        {"$inc": {"events_count": 1}}
    )
    
    # Update the activation with the link
    await db.marketing_activations.update_one(
        {"activation_id": activation_id},
        {"$set": {
            "linked_event_id": event_id,
            "linked_event_name": data.name,
            "updated_at": now.isoformat()
        }}
    )
    
    # Return the created event with client info
    del event_doc["_id"]
    event_doc["client_name"] = cost_center.get("display_name")
    event_doc["is_confirmed"] = True  # Committed = confirmed
    
    return event_doc


# ---- Email Tracking CRUD ----

@demand_studio_router.get("/emails")
async def get_emails(campaign_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get email tracking records"""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    emails = await db.email_tracking.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return emails

@demand_studio_router.post("/emails")
async def create_email(data: EmailTrackingCreate, user: User = Depends(get_current_user)):
    """Create email tracking record"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    email = {
        "email_id": f"email_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "name": data.name,
        "segment": data.segment,
        "list_size": data.list_size,
        "sent_count": 0,
        "open_count": 0,
        "click_count": 0,
        "send_date": data.send_date,
        "status": data.status,
        "cost": data.cost,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.email_tracking.insert_one(email)
    del email["_id"]
    return email

@demand_studio_router.put("/emails/{email_id}")
async def update_email(email_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update email tracking record"""
    company_id = user.company_id or user.active_org_id
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.email_tracking.update_one(
        {"email_id": email_id, "company_id": company_id},
        {"$set": data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Email record not found")
    
    return await db.email_tracking.find_one({"email_id": email_id}, {"_id": 0})

@demand_studio_router.delete("/emails/{email_id}")
async def delete_email(email_id: str, user: User = Depends(get_current_user)):
    """Delete email record"""
    company_id = user.company_id or user.active_org_id
    result = await db.email_tracking.delete_one(
        {"email_id": email_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Email record not found")
    return {"success": True}


# ============== EMAIL TEMPLATES ==============

@demand_studio_router.get("/email-templates")
async def get_email_templates(
    category: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get email templates"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    query = {"company_id": company_id}
    if category:
        query["category"] = category
    
    templates = await db.email_templates.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    return templates


@demand_studio_router.post("/email-templates")
async def create_email_template(data: dict, user: User = Depends(get_current_user)):
    """Create email template"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    template = {
        "template_id": f"tpl_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.get("name", "Untitled Template"),
        "subject": data.get("subject", ""),
        "body_html": data.get("body_html"),
        "body_text": data.get("body_text"),
        "category": data.get("category", "general"),
        "usage_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.email_templates.insert_one(template)
    del template["_id"]
    return template


@demand_studio_router.put("/email-templates/{template_id}")
async def update_email_template(template_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update email template"""
    company_id = user.company_id or user.active_org_id
    
    update_data = {k: v for k, v in data.items() if k not in ["template_id", "company_id", "created_at"]}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.email_templates.update_one(
        {"template_id": template_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return await db.email_templates.find_one({"template_id": template_id}, {"_id": 0})


@demand_studio_router.delete("/email-templates/{template_id}")
async def delete_email_template(template_id: str, user: User = Depends(get_current_user)):
    """Delete email template"""
    company_id = user.company_id or user.active_org_id
    result = await db.email_templates.delete_one(
        {"template_id": template_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}


# ============== EMAIL SEQUENCES ==============

@demand_studio_router.get("/email-sequences")
async def get_email_sequences(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get email sequences"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    
    sequences = await db.email_sequences.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return sequences


@demand_studio_router.post("/email-sequences")
async def create_email_sequence(data: dict, user: User = Depends(get_current_user)):
    """Create email sequence"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    sequence = {
        "sequence_id": f"seq_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.get("name", "Untitled Sequence"),
        "description": data.get("description"),
        "trigger_type": data.get("trigger_type", "manual"),
        "trigger_config": data.get("trigger_config"),
        "status": "draft",
        "total_enrolled": 0,
        "total_completed": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.email_sequences.insert_one(sequence)
    del sequence["_id"]
    return sequence


@demand_studio_router.get("/email-sequences/{sequence_id}")
async def get_email_sequence(sequence_id: str, user: User = Depends(get_current_user)):
    """Get email sequence with steps"""
    company_id = user.company_id or user.active_org_id
    
    sequence = await db.email_sequences.find_one(
        {"sequence_id": sequence_id, "company_id": company_id},
        {"_id": 0}
    )
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    
    # Get steps
    steps = await db.email_sequence_steps.find(
        {"sequence_id": sequence_id, "company_id": company_id},
        {"_id": 0}
    ).sort("step_order", 1).to_list(50)
    
    sequence["steps"] = steps
    return sequence


@demand_studio_router.put("/email-sequences/{sequence_id}")
async def update_email_sequence(sequence_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update email sequence"""
    company_id = user.company_id or user.active_org_id
    
    update_data = {k: v for k, v in data.items() if k not in ["sequence_id", "company_id", "created_at"]}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.email_sequences.update_one(
        {"sequence_id": sequence_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sequence not found")
    
    return await db.email_sequences.find_one({"sequence_id": sequence_id}, {"_id": 0})


@demand_studio_router.delete("/email-sequences/{sequence_id}")
async def delete_email_sequence(sequence_id: str, user: User = Depends(get_current_user)):
    """Delete email sequence and its steps"""
    company_id = user.company_id or user.active_org_id
    
    # Delete steps first
    await db.email_sequence_steps.delete_many(
        {"sequence_id": sequence_id, "company_id": company_id}
    )
    
    # Delete enrollments
    await db.email_sequence_enrollments.delete_many(
        {"sequence_id": sequence_id, "company_id": company_id}
    )
    
    # Delete sequence
    result = await db.email_sequences.delete_one(
        {"sequence_id": sequence_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sequence not found")
    
    return {"success": True}


# ============== SEQUENCE STEPS ==============

@demand_studio_router.post("/email-sequences/{sequence_id}/steps")
async def create_sequence_step(sequence_id: str, data: dict, user: User = Depends(get_current_user)):
    """Create a step in an email sequence"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Verify sequence exists
    sequence = await db.email_sequences.find_one(
        {"sequence_id": sequence_id, "company_id": company_id}
    )
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    
    # Get next step order
    last_step = await db.email_sequence_steps.find_one(
        {"sequence_id": sequence_id},
        sort=[("step_order", -1)]
    )
    next_order = (last_step.get("step_order", 0) + 1) if last_step else 1
    
    now = datetime.now(timezone.utc)
    step = {
        "step_id": f"step_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "sequence_id": sequence_id,
        "step_order": data.get("step_order", next_order),
        "delay_days": data.get("delay_days", 0),
        "delay_hours": data.get("delay_hours", 0),
        "subject": data.get("subject", ""),
        "body_html": data.get("body_html"),
        "body_text": data.get("body_text"),
        "template_id": data.get("template_id"),
        "sent_count": 0,
        "open_count": 0,
        "click_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.email_sequence_steps.insert_one(step)
    del step["_id"]
    return step


@demand_studio_router.put("/email-sequences/{sequence_id}/steps/{step_id}")
async def update_sequence_step(sequence_id: str, step_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update a sequence step"""
    company_id = user.company_id or user.active_org_id
    
    update_data = {k: v for k, v in data.items() if k not in ["step_id", "company_id", "sequence_id", "created_at"]}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.email_sequence_steps.update_one(
        {"step_id": step_id, "sequence_id": sequence_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")
    
    return await db.email_sequence_steps.find_one({"step_id": step_id}, {"_id": 0})


@demand_studio_router.delete("/email-sequences/{sequence_id}/steps/{step_id}")
async def delete_sequence_step(sequence_id: str, step_id: str, user: User = Depends(get_current_user)):
    """Delete a sequence step"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.email_sequence_steps.delete_one(
        {"step_id": step_id, "sequence_id": sequence_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")
    
    return {"success": True}


# ============== SEQUENCE ENROLLMENTS ==============

@demand_studio_router.get("/email-sequences/{sequence_id}/enrollments")
async def get_sequence_enrollments(
    sequence_id: str,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get enrollments for a sequence"""
    company_id = user.company_id or user.active_org_id
    
    query = {"sequence_id": sequence_id, "company_id": company_id}
    if status:
        query["status"] = status
    
    enrollments = await db.email_sequence_enrollments.find(
        query, {"_id": 0}
    ).sort("enrolled_at", -1).to_list(500)
    
    # Enrich with contact info
    for enrollment in enrollments:
        if enrollment["contact_type"] == "lead":
            contact = await db.leads.find_one(
                {"lead_id": enrollment["contact_id"]},
                {"_id": 0, "lead_name": 1, "email": 1}
            )
            if contact:
                enrollment["contact_name"] = contact.get("lead_name")
                enrollment["contact_email"] = contact.get("email")
        elif enrollment["contact_type"] == "client":
            contact = await db.clients.find_one(
                {"client_id": enrollment["contact_id"]},
                {"_id": 0, "name": 1, "email": 1}
            )
            if contact:
                enrollment["contact_name"] = contact.get("name")
                enrollment["contact_email"] = contact.get("email")
    
    return enrollments


@demand_studio_router.post("/email-sequences/{sequence_id}/enroll")
async def enroll_in_sequence(sequence_id: str, data: dict, user: User = Depends(get_current_user)):
    """Enroll a contact in a sequence"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Verify sequence exists and is active
    sequence = await db.email_sequences.find_one(
        {"sequence_id": sequence_id, "company_id": company_id}
    )
    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")
    
    contact_type = data.get("contact_type")
    contact_id = data.get("contact_id")
    
    # Check if already enrolled
    existing = await db.email_sequence_enrollments.find_one({
        "sequence_id": sequence_id,
        "contact_type": contact_type,
        "contact_id": contact_id,
        "status": {"$in": ["active", "paused"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Contact already enrolled in this sequence")
    
    now = datetime.now(timezone.utc)
    enrollment = {
        "enrollment_id": f"enroll_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "sequence_id": sequence_id,
        "contact_type": contact_type,
        "contact_id": contact_id,
        "status": "active",
        "current_step": 0,
        "next_send_at": now.isoformat(),  # First step sends immediately or based on first step delay
        "enrolled_at": now.isoformat(),
        "completed_at": None
    }
    
    await db.email_sequence_enrollments.insert_one(enrollment)
    
    # Update sequence stats
    await db.email_sequences.update_one(
        {"sequence_id": sequence_id},
        {"$inc": {"total_enrolled": 1}}
    )
    
    del enrollment["_id"]
    return enrollment


@demand_studio_router.post("/email-sequences/{sequence_id}/enrollments/{enrollment_id}/pause")
async def pause_enrollment(sequence_id: str, enrollment_id: str, user: User = Depends(get_current_user)):
    """Pause an enrollment"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.email_sequence_enrollments.update_one(
        {"enrollment_id": enrollment_id, "sequence_id": sequence_id, "company_id": company_id},
        {"$set": {"status": "paused"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    
    return {"success": True, "status": "paused"}


@demand_studio_router.post("/email-sequences/{sequence_id}/enrollments/{enrollment_id}/resume")
async def resume_enrollment(sequence_id: str, enrollment_id: str, user: User = Depends(get_current_user)):
    """Resume a paused enrollment"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.email_sequence_enrollments.update_one(
        {"enrollment_id": enrollment_id, "sequence_id": sequence_id, "company_id": company_id, "status": "paused"},
        {"$set": {"status": "active"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enrollment not found or not paused")
    
    return {"success": True, "status": "active"}


@demand_studio_router.delete("/email-sequences/{sequence_id}/enrollments/{enrollment_id}")
async def remove_enrollment(sequence_id: str, enrollment_id: str, user: User = Depends(get_current_user)):
    """Remove a contact from a sequence"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.email_sequence_enrollments.delete_one(
        {"enrollment_id": enrollment_id, "sequence_id": sequence_id, "company_id": company_id}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    
    return {"success": True}


# ---- Lead & Opportunity Links ----

@demand_studio_router.post("/link-lead")
async def link_lead_to_campaign(data: CampaignLeadLinkCreate, user: User = Depends(get_current_user)):
    """Link a lead to a campaign"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check if already linked
    existing = await db.campaign_lead_links.find_one({
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "lead_id": data.lead_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Lead already linked to this campaign")
    
    link = {
        "link_id": f"link_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "lead_id": data.lead_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.campaign_lead_links.insert_one(link)
    
    # Update campaign leads_linked count
    await db.marketing_campaigns.update_one(
        {"campaign_id": data.campaign_id},
        {"$inc": {"leads_linked": 1}}
    )
    
    del link["_id"]
    return link

@demand_studio_router.delete("/unlink-lead/{campaign_id}/{lead_id}")
async def unlink_lead_from_campaign(campaign_id: str, lead_id: str, user: User = Depends(get_current_user)):
    """Unlink a lead from a campaign"""
    company_id = user.company_id or user.active_org_id
    result = await db.campaign_lead_links.delete_one({
        "company_id": company_id,
        "campaign_id": campaign_id,
        "lead_id": lead_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    # Update campaign leads_linked count
    await db.marketing_campaigns.update_one(
        {"campaign_id": campaign_id},
        {"$inc": {"leads_linked": -1}}
    )
    
    return {"success": True}

@demand_studio_router.post("/link-opportunity")
async def link_opportunity_to_campaign(data: CampaignOpportunityLinkCreate, user: User = Depends(get_current_user)):
    """Link an opportunity/event to a campaign"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check if already linked
    existing = await db.campaign_opportunity_links.find_one({
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "event_id": data.event_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Opportunity already linked to this campaign")
    
    link = {
        "link_id": f"link_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": data.campaign_id,
        "event_id": data.event_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.campaign_opportunity_links.insert_one(link)
    
    # Update campaign opportunities_linked count
    await db.marketing_campaigns.update_one(
        {"campaign_id": data.campaign_id},
        {"$inc": {"opportunities_linked": 1}}
    )
    
    del link["_id"]
    return link

@demand_studio_router.delete("/unlink-opportunity/{campaign_id}/{event_id}")
async def unlink_opportunity_from_campaign(campaign_id: str, event_id: str, user: User = Depends(get_current_user)):
    """Unlink an opportunity from a campaign"""
    company_id = user.company_id or user.active_org_id
    result = await db.campaign_opportunity_links.delete_one({
        "company_id": company_id,
        "campaign_id": campaign_id,
        "event_id": event_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    
    # Update campaign opportunities_linked count
    await db.marketing_campaigns.update_one(
        {"campaign_id": campaign_id},
        {"$inc": {"opportunities_linked": -1}}
    )
    
    return {"success": True}

@demand_studio_router.get("/campaign-leads/{campaign_id}")
async def get_campaign_leads(campaign_id: str, user: User = Depends(get_current_user)):
    """Get all leads linked to a campaign"""
    company_id = user.company_id or user.active_org_id
    links = await db.campaign_lead_links.find(
        {"company_id": company_id, "campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(500)
    
    lead_ids = [l["lead_id"] for l in links]
    if not lead_ids:
        return []
    
    leads = await db.leads.find(
        {"lead_id": {"$in": lead_ids}},
        {"_id": 0}
    ).to_list(500)
    return leads

@demand_studio_router.get("/campaign-opportunities/{campaign_id}")
async def get_campaign_opportunities(campaign_id: str, user: User = Depends(get_current_user)):
    """Get all opportunities linked to a campaign"""
    company_id = user.company_id or user.active_org_id
    links = await db.campaign_opportunity_links.find(
        {"company_id": company_id, "campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(500)
    
    event_ids = [l["event_id"] for l in links]
    if not event_ids:
        return []
    
    events = await db.events.find(
        {"event_id": {"$in": event_ids}},
        {"_id": 0}
    ).to_list(500)
    return events

# ---- Campaign Insights ----

@demand_studio_router.get("/insights")
async def get_campaign_insights(user: User = Depends(get_current_user)):
    """Get campaign performance insights"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"campaigns": [], "summary": {}}
    
    # Get all campaigns with spend
    campaigns = await db.marketing_campaigns.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(500)
    
    total_budget = sum(c.get("budget", 0) for c in campaigns)
    total_spend = sum(c.get("actual_spend", 0) for c in campaigns)
    total_leads = sum(c.get("leads_linked", 0) for c in campaigns)
    total_opportunities = sum(c.get("opportunities_linked", 0) for c in campaigns)
    
    # Calculate ROI metrics
    cost_per_lead = total_spend / total_leads if total_leads > 0 else 0
    cost_per_opportunity = total_spend / total_opportunities if total_opportunities > 0 else 0
    
    return {
        "campaigns": campaigns,
        "summary": {
            "total_campaigns": len(campaigns),
            "active_campaigns": len([c for c in campaigns if c.get("status") == "active"]),
            "total_budget": round(total_budget, 2),
            "total_spend": round(total_spend, 2),
            "budget_utilization": round((total_spend / total_budget * 100) if total_budget > 0 else 0, 1),
            "total_leads_linked": total_leads,
            "total_opportunities_linked": total_opportunities,
            "cost_per_lead": round(cost_per_lead, 2),
            "cost_per_opportunity": round(cost_per_opportunity, 2)
        }
    }

# ---- Campaign Access Management (for Marketing Partners) ----

async def get_user_role(user: User, company_id: str) -> str:
    """Get the user's role in the company"""
    # Super admins always have owner privileges
    if getattr(user, 'is_super_admin', False):
        return "owner"
    
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "company_id": company_id,
        "status": "active"
    })
    
    if membership:
        return membership.get("role", "owner")
    
    # If no membership exists, check if user created this company
    company = await db.companies.find_one({"company_id": company_id})
    if company and company.get("owner_user_id") == user.user_id:
        return "owner"
    
    # Default to owner for users without explicit membership (legacy accounts)
    return "owner"

async def is_marketing_partner(user: User, company_id: str) -> bool:
    """Check if user is a marketing partner"""
    role = await get_user_role(user, company_id)
    return role == "marketing_partner"

async def create_notification(
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    metadata: Optional[dict] = None,
    send_email: bool = True
):
    """Create an in-app notification and optionally send email"""
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "notification_type": notification_type,
        "title": title,
        "message": message,
        "link": link,
        "metadata": metadata or {},
        "read": False,
        "email_sent": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    
    # Email sending placeholder - enable when email service is configured
    if send_email:
        email_config = os.environ.get("EMAIL_API_KEY")
        if email_config:
            # TODO: Implement email sending with Resend/SendGrid
            # For now, just log that email would be sent
            logging.info(f"Would send email to user {user_id}: {title}")
            notification["email_sent"] = True
            await db.notifications.update_one(
                {"notification_id": notification["notification_id"]},
                {"$set": {"email_sent": True}}
            )
    
    return notification

async def get_user_campaign_access(user_id: str, company_id: str) -> list:
    """Get list of campaign_ids the user has access to"""
    accesses = await db.campaign_access.find({
        "user_id": user_id,
        "company_id": company_id
    }, {"campaign_id": 1, "_id": 0}).to_list(500)
    return [a["campaign_id"] for a in accesses]

async def can_access_campaign(user: User, company_id: str, campaign_id: str) -> bool:
    """Check if user can access a specific campaign"""
    role = await get_user_role(user, company_id)
    if role in ["owner", "admin"]:
        return True
    if role == "marketing_partner":
        access = await db.campaign_access.find_one({
            "user_id": user.user_id,
            "company_id": company_id,
            "campaign_id": campaign_id
        })
        return access is not None
    return True  # Other roles can view all

def strip_financial_data(campaign: dict) -> dict:
    """Remove financial data from campaign for marketing partners"""
    sensitive_fields = ["budget", "actual_spend", "cost_per_lead", "cost_per_opportunity"]
    return {k: v for k, v in campaign.items() if k not in sensitive_fields}

@demand_studio_router.get("/campaigns/{campaign_id}/access")
async def get_campaign_access(campaign_id: str, user: User = Depends(get_current_user)):
    """Get users with access to a campaign (owner/admin only)"""
    company_id = user.company_id or user.active_org_id
    role = await get_user_role(user, company_id)
    
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can manage campaign access")
    
    accesses = await db.campaign_access.find(
        {"campaign_id": campaign_id, "company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with user info
    for access in accesses:
        user_doc = await db.users.find_one({"user_id": access["user_id"]}, {"_id": 0, "name": 1, "email": 1})
        if user_doc:
            access["user_name"] = user_doc.get("name", "")
            access["user_email"] = user_doc.get("email", "")
    
    return accesses

@demand_studio_router.post("/campaigns/{campaign_id}/access")
async def grant_campaign_access(campaign_id: str, data: CampaignAccessCreate, user: User = Depends(get_current_user)):
    """Grant a user access to a campaign (owner/admin only)"""
    company_id = user.company_id or user.active_org_id
    role = await get_user_role(user, company_id)
    
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can manage campaign access")
    
    # Verify campaign exists
    campaign = await db.marketing_campaigns.find_one({"campaign_id": campaign_id, "company_id": company_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Verify user exists
    target_user = await db.users.find_one({"user_id": data.user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already has access
    existing = await db.campaign_access.find_one({
        "campaign_id": campaign_id,
        "user_id": data.user_id,
        "company_id": company_id
    })
    if existing:
        # Update access level
        await db.campaign_access.update_one(
            {"campaign_id": campaign_id, "user_id": data.user_id, "company_id": company_id},
            {"$set": {"access_level": data.access_level, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True, "message": "Access updated"}
    
    # Create new access
    access = {
        "access_id": f"acc_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "campaign_id": campaign_id,
        "user_id": data.user_id,
        "access_level": data.access_level,
        "granted_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.campaign_access.insert_one(access)
    del access["_id"]
    
    # Create notification for the assigned user
    granter_name = user.name or user.email or "Un administrador"
    access_level_text = "ver y editar" if data.access_level == "edit" else "ver"
    
    await create_notification(
        user_id=data.user_id,
        notification_type="campaign_access_granted",
        title=f"Acceso a campaña: {campaign['name']}",
        message=f"{granter_name} te ha dado acceso para {access_level_text} la campaña '{campaign['name']}'.",
        link=f"/demand-studio/campaigns",
        metadata={
            "campaign_id": campaign_id,
            "campaign_name": campaign["name"],
            "access_level": data.access_level,
            "granted_by": user.user_id
        },
        send_email=True
    )
    
    return access

@demand_studio_router.delete("/campaigns/{campaign_id}/access/{user_id}")
async def revoke_campaign_access(campaign_id: str, user_id: str, user: User = Depends(get_current_user)):
    """Revoke a user's access to a campaign (owner/admin only)"""
    company_id = user.company_id or user.active_org_id
    role = await get_user_role(user, company_id)
    
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can manage campaign access")
    
    result = await db.campaign_access.delete_one({
        "campaign_id": campaign_id,
        "user_id": user_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Access not found")
    
    return {"success": True}

@demand_studio_router.get("/my-campaigns")
async def get_my_campaigns(user: User = Depends(get_current_user)):
    """Get campaigns accessible to the current user (for marketing partners)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    role = await get_user_role(user, company_id)
    
    if role in ["owner", "admin"]:
        # Full access - return all campaigns
        campaigns = await db.marketing_campaigns.find(
            {"company_id": company_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        return {"campaigns": campaigns, "role": role, "has_full_access": True}
    
    if role == "marketing_partner":
        # Limited access - only assigned campaigns without financial data
        campaign_ids = await get_user_campaign_access(user.user_id, company_id)
        if not campaign_ids:
            return {"campaigns": [], "role": role, "has_full_access": False}
        
        campaigns = await db.marketing_campaigns.find(
            {"campaign_id": {"$in": campaign_ids}, "company_id": company_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        
        # Strip financial data
        campaigns = [strip_financial_data(c) for c in campaigns]
        return {"campaigns": campaigns, "role": role, "has_full_access": False}
    
    # Other roles - return all campaigns
    campaigns = await db.marketing_campaigns.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"campaigns": campaigns, "role": role, "has_full_access": True}

@demand_studio_router.get("/my-stats")
async def get_my_stats(user: User = Depends(get_current_user)):
    """Get stats for marketing partner (limited view)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"activeCampaigns": 0, "leadsLinked": 0, "activationsCount": 0, "role": "viewer"}
    
    role = await get_user_role(user, company_id)
    
    if role == "marketing_partner":
        # Limited stats - only for assigned campaigns, no financial data
        campaign_ids = await get_user_campaign_access(user.user_id, company_id)
        if not campaign_ids:
            return {"activeCampaigns": 0, "leadsLinked": 0, "activationsCount": 0, "role": role}
        
        active_campaigns = await db.marketing_campaigns.count_documents({
            "campaign_id": {"$in": campaign_ids},
            "status": "active"
        })
        
        leads_linked = await db.campaign_lead_links.count_documents({
            "campaign_id": {"$in": campaign_ids}
        })
        
        activations_count = await db.marketing_activations.count_documents({
            "campaign_id": {"$in": campaign_ids}
        })
        
        return {
            "activeCampaigns": active_campaigns,
            "leadsLinked": leads_linked,
            "activationsCount": activations_count,
            "assignedCampaigns": len(campaign_ids),
            "role": role,
            "has_full_access": False
        }
    
    # For other roles, redirect to full stats
    return await get_demand_studio_stats(org_id=None, user=user)

@demand_studio_router.get("/marketing-partners")
async def get_marketing_partners(user: User = Depends(get_current_user)):
    """Get list of users with marketing_partner role (for assigning to campaigns)"""
    company_id = user.company_id or user.active_org_id
    role = await get_user_role(user, company_id)
    
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can view marketing partners")
    
    # Get all users with marketing_partner role in this company
    memberships = await db.memberships.find(
        {"company_id": company_id, "role": "marketing_partner", "status": "active"},
        {"_id": 0}
    ).to_list(100)
    
    user_ids = [m["user_id"] for m in memberships]
    if not user_ids:
        return []
    
    users = await db.users.find(
        {"user_id": {"$in": user_ids}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}
    ).to_list(100)
    
    return users

# ---- Notifications Endpoints ----

@demand_studio_router.get("/notifications")
async def get_notifications(unread_only: bool = False, user: User = Depends(get_current_user)):
    """Get user notifications"""
    query = {"user_id": user.user_id}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return notifications

@demand_studio_router.get("/notifications/unread-count")
async def get_unread_count(user: User = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": user.user_id,
        "read": False
    })
    return {"count": count}

@demand_studio_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}

@demand_studio_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": user.user_id, "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}

# ============== SOCIAL MEDIA ENDPOINTS ==============

# ---- Social Accounts CRUD ----

@demand_studio_router.get("/social/accounts")
async def get_social_accounts(
    include_shared: bool = False,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all social media accounts (owned and optionally shared)"""
    await ensure_owner_membership(user)
    
    # If org_id is specified, get accounts for that org only
    if org_id:
        try:
            company_id, role = await get_effective_company_id(user, org_id)
            accounts = await db.social_accounts.find(
                {"company_id": company_id},
                {"_id": 0}
            ).to_list(100)
            for acc in accounts:
                acc["_access_type"] = "shared"
                acc["_role"] = role
            return accounts
        except HTTPException:
            return []
    
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    # Get owned accounts
    owned_accounts = await db.social_accounts.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    
    # Mark as owned
    for acc in owned_accounts:
        acc["_access_type"] = "owned"
        acc["_shared_by"] = None
    
    if not include_shared:
        return owned_accounts
    
    # Get shared accounts - find ALL organizations where user is a member
    memberships = await db.memberships.find({
        "user_id": user.user_id,
        "$or": [{"status": "active"}, {"status": {"$exists": False}}]
    }).to_list(50)
    
    shared_accounts = []
    for membership in memberships:
        org_id = membership.get("company_id") or membership.get("organization_id")
        if not org_id or org_id == company_id:
            continue
        
        # Get company name
        company = await db.companies.find_one({"company_id": org_id}, {"name": 1, "_id": 0})
        company_name = company.get("name") if company else "Unknown"
        
        # Get accounts from that org
        org_accounts = await db.social_accounts.find(
            {"company_id": org_id},
            {"_id": 0}
        ).to_list(50)
        
        for acc in org_accounts:
            acc["_access_type"] = "shared"
            acc["_shared_by"] = company_name
            acc["_shared_org_id"] = org_id
            acc["_role"] = membership["role"]
        
        shared_accounts.extend(org_accounts)
    
    return owned_accounts + shared_accounts

@demand_studio_router.post("/social/accounts")
async def create_social_account(data: SocialAccountCreate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Create a social media account"""
    await ensure_owner_membership(user)
    
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    account = {
        "account_id": f"social_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "platform": data.platform,
        "handle": data.handle,
        "status": data.status,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.social_accounts.insert_one(account)
    del account["_id"]
    return account

@demand_studio_router.put("/social/accounts/{account_id}")
async def update_social_account(account_id: str, data: SocialAccountCreate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Update a social account"""
    company_id, _ = await get_effective_company_id(user, org_id)
    result = await db.social_accounts.update_one(
        {"account_id": account_id, "company_id": company_id},
        {"$set": {
            "platform": data.platform,
            "handle": data.handle,
            "status": data.status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return await db.social_accounts.find_one({"account_id": account_id}, {"_id": 0})

@demand_studio_router.delete("/social/accounts/{account_id}")
async def delete_social_account(account_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Delete a social account"""
    company_id, _ = await get_effective_company_id(user, org_id)
    result = await db.social_accounts.delete_one(
        {"account_id": account_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True}

# ---- Content Pillars CRUD ----

@demand_studio_router.get("/social/pillars")
async def get_content_pillars(org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all content pillars"""
    try:
        company_id, role = await get_effective_company_id(user, org_id)
    except HTTPException:
        company_id = user.company_id or user.active_org_id
        
    if not company_id:
        return []
    
    pillars = await db.content_pillars.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    return pillars

@demand_studio_router.post("/social/pillars")
async def create_content_pillar(data: ContentPillarCreate, user: User = Depends(get_current_user), org_id: Optional[str] = Query(None)):
    """Create a content pillar"""
    company_id, _ = await get_effective_company_id(user, org_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    pillar = {
        "pillar_id": f"pillar_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "description": data.description,
        "what_is_it": data.what_is_it,
        "why_it_matters": data.why_it_matters,
        "content_tags": data.content_tags or [],
        "weight_percentage": data.weight_percentage,
        "color": data.color,
        "icon": data.icon,
        "platforms": data.platforms or [],  # Empty = all platforms
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.content_pillars.insert_one(pillar)
    del pillar["_id"]
    return pillar

@demand_studio_router.delete("/social/pillars/{pillar_id}")
async def delete_content_pillar(pillar_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Delete a content pillar"""
    company_id, _ = await get_effective_company_id(user, org_id)
    result = await db.content_pillars.delete_one(
        {"pillar_id": pillar_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pillar not found")
    return {"success": True}

@demand_studio_router.put("/social/pillars/{pillar_id}")
async def update_content_pillar(pillar_id: str, data: ContentPillarCreate, user: User = Depends(get_current_user), org_id: Optional[str] = Query(None)):
    """Update a content pillar"""
    company_id, _ = await get_effective_company_id(user, org_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    result = await db.content_pillars.update_one(
        {"pillar_id": pillar_id, "company_id": company_id},
        {"$set": {
            "name": data.name,
            "description": data.description,
            "what_is_it": data.what_is_it,
            "why_it_matters": data.why_it_matters,
            "content_tags": data.content_tags or [],
            "weight_percentage": data.weight_percentage,
            "color": data.color,
            "icon": data.icon,
            "platforms": data.platforms or [],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pillar not found")
    
    updated = await db.content_pillars.find_one(
        {"pillar_id": pillar_id, "company_id": company_id},
        {"_id": 0}
    )
    return updated

# ---- Audiences CRUD ----

@demand_studio_router.get("/social/audiences")
async def get_audiences(org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all audiences"""
    company_id = org_id or user.company_id or user.active_org_id
    if not company_id:
        return []
    audiences = await db.audiences.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    return audiences

@demand_studio_router.post("/social/audiences")
async def create_audience(data: AudienceCreate, user: User = Depends(get_current_user), org_id: Optional[str] = Query(None)):
    """Create an audience"""
    company_id, _ = await get_effective_company_id(user, org_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    audience = {
        "audience_id": f"aud_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "description": data.description,
        "platforms": data.platforms or [],
        "sub_audiences": [sa.dict() for sa in (data.sub_audiences or [])],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.audiences.insert_one(audience)
    del audience["_id"]
    return audience

@demand_studio_router.put("/social/audiences/{audience_id}")
async def update_audience(audience_id: str, data: AudienceCreate, user: User = Depends(get_current_user), org_id: Optional[str] = Query(None)):
    """Update an audience"""
    company_id, _ = await get_effective_company_id(user, org_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    result = await db.audiences.update_one(
        {"audience_id": audience_id, "company_id": company_id},
        {"$set": {
            "name": data.name,
            "description": data.description,
            "platforms": data.platforms or [],
            "sub_audiences": [sa.dict() for sa in (data.sub_audiences or [])],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Audience not found")
    
    updated = await db.audiences.find_one(
        {"audience_id": audience_id, "company_id": company_id},
        {"_id": 0}
    )
    return updated

@demand_studio_router.delete("/social/audiences/{audience_id}")
async def delete_audience(audience_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Delete an audience"""
    company_id, _ = await get_effective_company_id(user, org_id)
    result = await db.audiences.delete_one(
        {"audience_id": audience_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Audience not found")
    return {"success": True}

# ---- Segments CRUD ----

@demand_studio_router.get("/social/segments")
async def get_segments(org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all segments"""
    company_id = org_id or user.company_id or user.active_org_id
    if not company_id:
        return []
    segments = await db.segments.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    return segments

@demand_studio_router.post("/social/segments")
async def create_segment(data: SegmentCreate, user: User = Depends(get_current_user), org_id: Optional[str] = Query(None)):
    """Create a segment"""
    company_id, _ = await get_effective_company_id(user, org_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    segment = {
        "segment_id": f"seg_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "description": data.description,
        "platforms": data.platforms or [],
        "pillar_ids": data.pillar_ids or [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.segments.insert_one(segment)
    del segment["_id"]
    return segment

@demand_studio_router.put("/social/segments/{segment_id}")
async def update_segment(segment_id: str, data: SegmentCreate, user: User = Depends(get_current_user), org_id: Optional[str] = Query(None)):
    """Update a segment"""
    company_id, _ = await get_effective_company_id(user, org_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    result = await db.segments.update_one(
        {"segment_id": segment_id, "company_id": company_id},
        {"$set": {
            "name": data.name,
            "description": data.description,
            "platforms": data.platforms or [],
            "pillar_ids": data.pillar_ids or [],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    updated = await db.segments.find_one(
        {"segment_id": segment_id, "company_id": company_id},
        {"_id": 0}
    )
    return updated

@demand_studio_router.delete("/social/segments/{segment_id}")
async def delete_segment(segment_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Delete a segment"""
    company_id, _ = await get_effective_company_id(user, org_id)
    result = await db.segments.delete_one(
        {"segment_id": segment_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Segment not found")
    return {"success": True}

# ---- Social Posts CRUD ----

@demand_studio_router.get("/social/posts")
async def get_social_posts(
    account_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    pillar_id: Optional[str] = None,
    status: Optional[str] = None,
    format: Optional[str] = None,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get social posts with filters"""
    await ensure_owner_membership(user)
    
    try:
        company_id, can_write = await check_section_permission(user, org_id, "social_media", "viewer")
    except HTTPException:
        company_id = user.company_id or user.active_org_id
        can_write = True
    
    if not company_id:
        return []
    
    # When org_id is specified, only query that specific org
    # When viewing own org (no org_id), only query own company
    query = {"company_id": company_id}
    if account_id:
        query["social_account_id"] = account_id
    if campaign_id:
        query["campaign_id"] = campaign_id
    if pillar_id:
        query["pillar_id"] = pillar_id
    if status:
        query["status"] = status
    if format:
        query["format"] = format
    
    # Check if marketing partner - filter by accessible campaigns
    role = await get_user_role(user, company_id)
    if role == "marketing_partner":
        accessible_campaigns = await get_user_campaign_access(user.user_id, company_id)
        query["$or"] = [
            {"campaign_id": {"$in": accessible_campaigns}},
            {"campaign_id": None, "created_by_user_id": user.user_id}
        ]
    
    posts = await db.social_posts.find(query, {"_id": 0}).sort("scheduled_at", -1).to_list(500)
    return posts

@demand_studio_router.post("/social/posts")
async def create_social_post(data: SocialPostCreate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Create a social post"""
    await ensure_owner_membership(user)
    
    # Use org_id if provided (shared org context), otherwise fallback to user's company
    if org_id:
        try:
            company_id, can_write = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
        # Check memberships - if user's own company has no accounts, use their primary membership
        own_accounts = await db.social_accounts.count_documents({"company_id": company_id})
        if own_accounts == 0:
            memberships = await db.memberships.find({
                "user_id": user.user_id,
                "$or": [{"status": "active"}, {"status": {"$exists": False}}]
            }).to_list(20)
            for m in memberships:
                mid = m.get("company_id") or m.get("organization_id")
                if mid and mid != company_id:
                    mid_accounts = await db.social_accounts.count_documents({"company_id": mid})
                    if mid_accounts > 0:
                        company_id = mid
                        break
    
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check campaign access for marketing partners
    role = await get_user_role(user, company_id)
    if role == "marketing_partner" and data.campaign_id:
        has_access = await can_access_campaign(user, company_id, data.campaign_id)
        if not has_access:
            raise HTTPException(status_code=403, detail="No access to this campaign")
    
    now = datetime.now(timezone.utc)
    post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "social_account_id": data.social_account_id,
        "campaign_id": data.campaign_id,
        "pillar_id": data.pillar_id,
        "audience_id": data.audience_id,
        "sub_audience_id": data.sub_audience_id,
        "segment_id": data.segment_id,
        "format": data.format,
        "status": data.status,
        "title": data.title,
        "caption": data.caption,
        "hook": data.hook,
        "cta": data.cta,
        "scheduled_at": data.scheduled_at,
        "production_date": data.production_date,
        "posted_at": None,
        "link_url": data.link_url,
        "notes": data.notes,
        "content_body": data.content_body,
        "created_by_user_id": user.user_id,
        "owner_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.social_posts.insert_one(post)
    del post["_id"]
    
    # Log activity
    user_name = user.name or user.email or "Usuario"
    caption_preview = (data.caption or data.title or "")[:50]
    if len(caption_preview) == 50:
        caption_preview += "..."
    
    from routers.activity_feed import log_activity
    await log_activity(
        company_id=company_id,
        user_id=user.user_id,
        user_name=user_name,
        activity_type="post_created",
        entity_type="post",
        entity_id=post["post_id"],
        description=f"creó un {data.format or 'post'}: \"{caption_preview}\"",
        account_id=data.social_account_id,
        metadata={"format": data.format, "status": data.status}
    )
    
    # Notify all active team members in the same company
    from routers.notifications import create_notification
    active_members = await db.memberships.find({
        "company_id": company_id,
        "user_id": {"$ne": user.user_id},
        "$or": [{"status": "active"}, {"status": {"$exists": False}}]
    }).to_list(100)
    for member in active_members:
        member_user = await db.users.find_one({"user_id": member["user_id"], "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1})
        if member_user:
            await create_notification(
                user_id=member["user_id"],
                notification_type="content_created",
                title="Nuevo contenido",
                message=f"{user_name} creó un nuevo {data.format or 'post'}: \"{caption_preview}\"",
                link=f"/demand-studio/social?tab=queue"
            )
    
    return post

@demand_studio_router.get("/social/posts/{post_id}")
async def get_social_post(post_id: str, user: User = Depends(get_current_user)):
    """Get a single social post"""
    company_id = user.company_id or user.active_org_id
    post = await db.social_posts.find_one(
        {"post_id": post_id, "company_id": company_id},
        {"_id": 0}
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Enrich with account and campaign info
    if post.get("social_account_id"):
        account = await db.social_accounts.find_one({"account_id": post["social_account_id"]}, {"_id": 0})
        post["account"] = account
    if post.get("campaign_id"):
        campaign = await db.marketing_campaigns.find_one({"campaign_id": post["campaign_id"]}, {"_id": 0, "campaign_id": 1, "name": 1})
        post["campaign"] = campaign
    if post.get("pillar_id"):
        pillar = await db.content_pillars.find_one({"pillar_id": post["pillar_id"]}, {"_id": 0})
        post["pillar"] = pillar
    
    # Get linked assets
    asset_links = await db.social_post_assets.find({"post_id": post_id}, {"_id": 0}).to_list(50)
    asset_ids = [l["asset_id"] for l in asset_links]
    if asset_ids:
        assets = await db.campaign_assets.find({"asset_id": {"$in": asset_ids}}, {"_id": 0}).to_list(50)
        post["assets"] = assets
    else:
        post["assets"] = []
    
    # Get linked spend
    spend_links = await db.social_post_spend.find({"post_id": post_id}, {"_id": 0}).to_list(50)
    spend_ids = [l["spend_id"] for l in spend_links]
    if spend_ids:
        spend = await db.campaign_spend.find({"spend_id": {"$in": spend_ids}}, {"_id": 0}).to_list(50)
        post["spend"] = spend
    else:
        post["spend"] = []
    
    return post

@demand_studio_router.put("/social/posts/{post_id}")
async def update_social_post(post_id: str, data: SocialPostCreate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Update a social post"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    
    # Also try membership companies if post not found with own company
    original_post = await db.social_posts.find_one({"post_id": post_id, "company_id": company_id})
    if not original_post and not org_id:
        memberships = await db.memberships.find({
            "user_id": user.user_id,
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        }).to_list(20)
        for m in memberships:
            mid = m.get("company_id") or m.get("organization_id")
            if mid and mid != company_id:
                original_post = await db.social_posts.find_one({"post_id": post_id, "company_id": mid})
                if original_post:
                    company_id = mid
                    break
    
    update_data = {
        "social_account_id": data.social_account_id,
        "campaign_id": data.campaign_id,
        "pillar_id": data.pillar_id,
        "audience_id": data.audience_id,
        "sub_audience_id": data.sub_audience_id,
        "segment_id": data.segment_id,
        "format": data.format,
        "status": data.status,
        "title": data.title,
        "caption": data.caption,
        "hook": data.hook,
        "cta": data.cta,
        "scheduled_at": data.scheduled_at,
        "production_date": data.production_date,
        "link_url": data.link_url,
        "notes": data.notes,
        "content_body": data.content_body,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.social_posts.update_one(
        {"post_id": post_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Log activity
    if original_post:
        user_name = user.name or user.email or "Usuario"
        caption_preview = (data.caption or data.title or "")[:40]
        if len(caption_preview) == 40:
            caption_preview += "..."
        
        from routers.activity_feed import log_activity
        await log_activity(
            company_id=company_id,
            user_id=user.user_id,
            user_name=user_name,
            activity_type="post_edited",
            entity_type="post",
            entity_id=post_id,
            description=f"editó un post: \"{caption_preview}\"",
            account_id=data.social_account_id or original_post.get("social_account_id"),
            metadata={"format": data.format, "status": data.status}
        )
    
    return await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})

@demand_studio_router.post("/social/posts/{post_id}/mark-posted")
async def mark_post_as_posted(post_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Mark a post as posted"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.social_posts.update_one(
        {"post_id": post_id, "company_id": company_id},
        {"$set": {
            "status": "posted",
            "posted_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    
    return await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})

class PostApprovalUpdate(BaseModel):
    status: Optional[str] = None
    needs_approval: Optional[bool] = None
    rejection_note: Optional[str] = None
    production_date: Optional[str] = None
    scheduled_at: Optional[str] = None

@demand_studio_router.patch("/social/posts/{post_id}")
async def patch_social_post(post_id: str, data: PostApprovalUpdate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Partial update for post approval/rejection workflow and quick status changes"""
    from routers.notifications import create_notification
    
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    
    # Get the post first to find who created it
    post = await db.social_posts.find_one({"post_id": post_id, "company_id": company_id})
    if not post and not org_id:
        # Try membership companies
        memberships = await db.memberships.find({
            "user_id": user.user_id,
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        }).to_list(20)
        for m in memberships:
            mid = m.get("company_id") or m.get("organization_id")
            if mid and mid != company_id:
                post = await db.social_posts.find_one({"post_id": post_id, "company_id": mid})
                if post:
                    company_id = mid
                    break
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.status is not None:
        update_data["status"] = data.status
    if data.needs_approval is not None:
        update_data["needs_approval"] = data.needs_approval
    if data.rejection_note is not None:
        update_data["rejection_note"] = data.rejection_note
    if data.production_date is not None:
        update_data["production_date"] = data.production_date
    if data.scheduled_at is not None:
        update_data["scheduled_at"] = data.scheduled_at
    
    await db.social_posts.update_one(
        {"post_id": post_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    # Send notification to the post creator (agency) if this is an approval/rejection action
    creator_id = post.get("created_by_user_id")
    user_name = user.name or user.email or "Usuario"
    caption_preview = (post.get("caption") or "Sin caption")[:40]
    if len(post.get("caption", "") or "") > 40:
        caption_preview += "..."
    
    # Log activity for approval/rejection
    from routers.activity_feed import log_activity
    if data.status == "scheduled" and data.needs_approval == False:
        await log_activity(
            company_id=company_id,
            user_id=user.user_id,
            user_name=user_name,
            activity_type="post_approved",
            entity_type="post",
            entity_id=post_id,
            description=f"aprobó un post: \"{caption_preview}\"",
            account_id=post.get("social_account_id"),
            metadata={"status": "scheduled"}
        )
    elif data.status == "draft" and data.rejection_note:
        await log_activity(
            company_id=company_id,
            user_id=user.user_id,
            user_name=user_name,
            activity_type="post_rejected",
            entity_type="post",
            entity_id=post_id,
            description=f"rechazó un post: \"{caption_preview}\"",
            account_id=post.get("social_account_id"),
            metadata={"status": "draft", "reason": data.rejection_note[:100] if data.rejection_note else None}
        )
    
    if creator_id and creator_id != user.user_id and data.needs_approval == False:
        # Get company name for the notification
        company = await db.companies.find_one({"company_id": company_id}, {"name": 1})
        company_name = company.get("name", "Cliente") if company else "Cliente"
        
        # Get post caption preview (first 50 chars)
        caption_preview = (post.get("caption") or "Sin caption")[:50]
        if len(post.get("caption", "") or "") > 50:
            caption_preview += "..."
        
        if data.status == "scheduled":
            # Post was approved
            await create_notification(
                user_id=creator_id,
                notification_type="post_approved",
                title="Post Aprobado",
                message=f'{company_name} aprobó tu post: "{caption_preview}"',
                link="/demand-studio/social",
                priority="normal"
            )
        elif data.status == "draft" and data.rejection_note:
            # Post was rejected
            await create_notification(
                user_id=creator_id,
                notification_type="post_rejected",
                title="Post Rechazado",
                message=f'{company_name} rechazó tu post: "{caption_preview}"',
                link="/demand-studio/social",
                priority="high"
            )
    
    # Notify team members about status changes
    if data.status and data.status != post.get("status"):
        post_title = (post.get("title") or "Sin título")[:40]
        status_labels = {
            "idea": "Idea", "production": "Producción", "editing": "Edición",
            "drafted": "Borrador", "scheduled": "Programado", "posted": "Publicado", "archived": "Archivado"
        }
        new_status_label = status_labels.get(data.status, data.status)
        active_members = await db.memberships.find({
            "company_id": company_id,
            "user_id": {"$ne": user.user_id},
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        }).to_list(100)
        for member in active_members:
            member_user = await db.users.find_one({"user_id": member["user_id"], "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1})
            if member_user:
                await create_notification(
                    user_id=member["user_id"],
                    notification_type="status_changed",
                    title="Cambio de estado",
                    message=f"{user_name} movió \"{post_title}\" a {new_status_label}",
                    link="/demand-studio/social?tab=queue"
                )
    
    return await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})

@demand_studio_router.post("/social/posts/{post_id}/duplicate")
async def duplicate_social_post(post_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Duplicate a social post"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    
    original = await db.social_posts.find_one({"post_id": post_id, "company_id": company_id})
    if not original and not org_id:
        memberships = await db.memberships.find({
            "user_id": user.user_id,
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        }).to_list(20)
        for m in memberships:
            mid = m.get("company_id") or m.get("organization_id")
            if mid and mid != company_id:
                original = await db.social_posts.find_one({"post_id": post_id, "company_id": mid})
                if original:
                    company_id = mid
                    break
    if not original:
        raise HTTPException(status_code=404, detail="Post not found")
    
    now = datetime.now(timezone.utc)
    new_post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "social_account_id": original["social_account_id"],
        "campaign_id": original.get("campaign_id"),
        "pillar_id": original.get("pillar_id"),
        "audience_id": original.get("audience_id"),
        "sub_audience_id": original.get("sub_audience_id"),
        "segment_id": original.get("segment_id"),
        "format": original["format"],
        "status": "idea",
        "title": f"{original['title']} (copy)",
        "caption": original.get("caption"),
        "hook": original.get("hook"),
        "cta": original.get("cta"),
        "scheduled_at": None,
        "posted_at": None,
        "link_url": original.get("link_url"),
        "notes": original.get("notes"),
        "content_body": original.get("content_body"),
        "created_by_user_id": user.user_id,
        "owner_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.social_posts.insert_one(new_post)
    del new_post["_id"]
    return new_post

@demand_studio_router.delete("/social/posts/{post_id}")
async def delete_social_post(post_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Delete a social post"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    
    result = await db.social_posts.delete_one(
        {"post_id": post_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        # Try membership companies
        if not org_id:
            memberships = await db.memberships.find({
                "user_id": user.user_id,
                "$or": [{"status": "active"}, {"status": {"$exists": False}}]
            }).to_list(20)
            for m in memberships:
                mid = m.get("company_id") or m.get("organization_id")
                if mid and mid != company_id:
                    result = await db.social_posts.delete_one({"post_id": post_id, "company_id": mid})
                    if result.deleted_count > 0:
                        break
            else:
                raise HTTPException(status_code=404, detail="Post not found")
        else:
            raise HTTPException(status_code=404, detail="Post not found")
    
    # Delete linked assets and spend
    await db.social_post_assets.delete_many({"post_id": post_id})
    await db.social_post_spend.delete_many({"post_id": post_id})
    
    return {"success": True}

# ---- Social Post Asset/Spend Links ----

@demand_studio_router.post("/social/posts/{post_id}/link-asset")
async def link_asset_to_post(post_id: str, data: SocialPostAssetLinkCreate, user: User = Depends(get_current_user)):
    """Link an asset to a social post"""
    company_id = user.company_id or user.active_org_id
    
    # Check post exists
    post = await db.social_posts.find_one({"post_id": post_id, "company_id": company_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if already linked
    existing = await db.social_post_assets.find_one({"post_id": post_id, "asset_id": data.asset_id})
    if existing:
        return {"success": True, "message": "Already linked"}
    
    link = {
        "link_id": f"link_{uuid.uuid4().hex[:12]}",
        "post_id": post_id,
        "asset_id": data.asset_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.social_post_assets.insert_one(link)
    del link["_id"]
    return link

@demand_studio_router.delete("/social/posts/{post_id}/unlink-asset/{asset_id}")
async def unlink_asset_from_post(post_id: str, asset_id: str, user: User = Depends(get_current_user)):
    """Unlink an asset from a social post"""
    result = await db.social_post_assets.delete_one({"post_id": post_id, "asset_id": asset_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"success": True}

@demand_studio_router.post("/social/posts/{post_id}/link-spend")
async def link_spend_to_post(post_id: str, data: SocialPostSpendLinkCreate, user: User = Depends(get_current_user)):
    """Link spend to a social post"""
    company_id = user.company_id or user.active_org_id
    
    # Check post exists
    post = await db.social_posts.find_one({"post_id": post_id, "company_id": company_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if already linked
    existing = await db.social_post_spend.find_one({"post_id": post_id, "spend_id": data.spend_id})
    if existing:
        return {"success": True, "message": "Already linked"}
    
    link = {
        "link_id": f"link_{uuid.uuid4().hex[:12]}",
        "post_id": post_id,
        "spend_id": data.spend_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.social_post_spend.insert_one(link)
    del link["_id"]
    return link

@demand_studio_router.delete("/social/posts/{post_id}/unlink-spend/{spend_id}")
async def unlink_spend_from_post(post_id: str, spend_id: str, user: User = Depends(get_current_user)):
    """Unlink spend from a social post"""
    result = await db.social_post_spend.delete_one({"post_id": post_id, "spend_id": spend_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"success": True}

# ---- Social Media Stats & Insights ----

@demand_studio_router.get("/social/stats")
async def get_social_stats(
    org_id: Optional[str] = None,
    account_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get social media statistics for dashboard"""
    try:
        company_id, role = await get_effective_company_id(user, org_id)
    except HTTPException:
        company_id = user.company_id or user.active_org_id
        
    if not company_id:
        return {
            "scheduledThisWeek": 0,
            "postedThisMonth": 0,
            "activeAccounts": 0,
            "campaignLinkedPosts": 0,
            "pendingIdeas": 0
        }
    
    # Only query the target company (own or specified org)
    now = datetime.now(timezone.utc)
    week_from_now = (now + timedelta(days=7)).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # Base query
    base_query = {"company_id": company_id}
    if account_id:
        base_query["social_account_id"] = account_id
    
    # Scheduled this week
    scheduled_query = {**base_query, "scheduled_at": {"$gte": now.isoformat(), "$lte": week_from_now}, "status": {"$in": ["scheduled", "drafted"]}}
    scheduled_this_week = await db.social_posts.count_documents(scheduled_query)
    
    # Posted this month
    posted_query = {**base_query, "posted_at": {"$gte": month_start}, "status": "posted"}
    posted_this_month = await db.social_posts.count_documents(posted_query)
    
    # Active accounts (only count if no specific account filter)
    if account_id:
        active_accounts = 1
    else:
        active_accounts = await db.social_accounts.count_documents({
            "company_id": company_id,
            "status": "active"
        })
    
    # Campaign-linked posts
    campaign_query = {**base_query, "campaign_id": {"$ne": None}}
    campaign_linked = await db.social_posts.count_documents(campaign_query)
    
    # Pending ideas
    ideas_query = {"company_id": company_id}
    if account_id:
        ideas_query["account_id"] = account_id
    pending_ideas = await db.social_ideas.count_documents({
        **ideas_query,
        "status": {"$in": ["new", "reviewing"]}
    })
    
    return {
        "scheduledThisWeek": scheduled_this_week,
        "postedThisMonth": posted_this_month,
        "activeAccounts": active_accounts,
        "campaignLinkedPosts": campaign_linked,
        "pendingIdeas": pending_ideas
    }

@demand_studio_router.get("/social/insights")
async def get_social_insights(
    org_id: Optional[str] = None,
    account_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get social media insights for reporting"""
    try:
        company_id, role = await get_effective_company_id(user, org_id)
    except HTTPException:
        company_id = user.company_id or user.active_org_id
        
    if not company_id:
        return {"byFormat": [], "byPillar": [], "byStatus": [], "byAudience": [], "bySubAudience": []}
    
    # Only query the target company (own or specified org)
    base_match = {"company_id": company_id}
    if account_id:
        base_match["social_account_id"] = account_id
    
    # Posts by format
    by_format = await db.social_posts.aggregate([
        {"$match": base_match},
        {"$group": {"_id": "$format", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    # Posts by pillar
    by_pillar_raw = await db.social_posts.aggregate([
        {"$match": {**base_match, "pillar_id": {"$ne": None}}},
        {"$group": {"_id": "$pillar_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    # Enrich pillar names
    by_pillar = []
    for item in by_pillar_raw:
        pillar = await db.content_pillars.find_one({"pillar_id": item["_id"]}, {"name": 1})
        by_pillar.append({
            "pillar_id": item["_id"],
            "name": pillar.get("name", "Unknown") if pillar else "Unknown",
            "count": item["count"]
        })
    
    # Posts by status
    by_status = await db.social_posts.aggregate([
        {"$match": base_match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    # Posts by audience
    by_audience_raw = await db.social_posts.aggregate([
        {"$match": {**base_match, "audience_id": {"$ne": None}}},
        {"$group": {"_id": "$audience_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    # Enrich audience names
    by_audience = []
    for item in by_audience_raw:
        audience = await db.audiences.find_one({"audience_id": item["_id"]}, {"name": 1, "sub_audiences": 1})
        by_audience.append({
            "audience_id": item["_id"],
            "name": audience.get("name", "Unknown") if audience else "Unknown",
            "count": item["count"]
        })
    
    # Posts by sub_audience
    by_sub_audience_raw = await db.social_posts.aggregate([
        {"$match": {**base_match, "sub_audience_id": {"$ne": None}}},
        {"$group": {
            "_id": {"audience_id": "$audience_id", "sub_audience_id": "$sub_audience_id"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]).to_list(50)
    
    # Enrich sub-audience names
    by_sub_audience = []
    for item in by_sub_audience_raw:
        aud_id = item["_id"].get("audience_id")
        sub_id = item["_id"].get("sub_audience_id")
        audience = await db.audiences.find_one({"audience_id": aud_id}, {"name": 1, "sub_audiences": 1})
        sub_name = "Unknown"
        aud_name = "Unknown"
        if audience:
            aud_name = audience.get("name", "Unknown")
            for sa in (audience.get("sub_audiences") or []):
                if sa.get("sub_id") == sub_id:
                    sub_name = sa.get("name", "Unknown")
                    break
        by_sub_audience.append({
            "audience_id": aud_id,
            "audience_name": aud_name,
            "sub_audience_id": sub_id,
            "sub_audience_name": sub_name,
            "count": item["count"]
        })
    
    # Scheduled vs Posted rate
    total_posts = await db.social_posts.count_documents(base_match)
    posted_count = await db.social_posts.count_documents({**base_match, "status": "posted"})
    
    return {
        "byFormat": [{"format": item["_id"], "count": item["count"]} for item in by_format],
        "byPillar": by_pillar,
        "byStatus": [{"status": item["_id"], "count": item["count"]} for item in by_status],
        "byAudience": by_audience,
        "bySubAudience": by_sub_audience,
        "totalPosts": total_posts,
        "postedCount": posted_count,
        "postRate": round((posted_count / total_posts * 100) if total_posts > 0 else 0, 1)
    }

@demand_studio_router.get("/social/calendar")
async def get_social_calendar(
    start_date: str,
    end_date: str,
    account_id: Optional[str] = None,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get posts for calendar view"""
    own_company_id = user.company_id or user.active_org_id
    
    # If org_id is specified, use that specific org
    if org_id:
        target_company_id = org_id
    else:
        target_company_id = own_company_id
    
    if not target_company_id:
        return []
    
    # Only query the target company (own or specified org)
    query = {
        "company_id": target_company_id,
        "status": {"$nin": ["archived"]},
        "$or": [
            {"scheduled_at": {"$gte": start_date, "$lte": end_date}},
            {"posted_at": {"$gte": start_date, "$lte": end_date}},
            {"created_at": {"$gte": start_date, "$lte": end_date}, "scheduled_at": {"$in": [None, ""]}}
        ]
    }
    if account_id:
        query["social_account_id"] = account_id
    
    posts = await db.social_posts.find(query, {"_id": 0}).to_list(500)
    
    # Enrich with account info
    for post in posts:
        if post.get("social_account_id"):
            account = await db.social_accounts.find_one(
                {"account_id": post["social_account_id"]},
                {"_id": 0, "platform": 1, "handle": 1}
            )
            post["account"] = account
    
    return posts

@demand_studio_router.get("/social/calendar/pillar-stats")
async def get_calendar_pillar_stats(
    year: int,
    month: int,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get post count by pillar for a given month - mini report for calendar view"""
    company_id, _ = await get_effective_company_id(user, org_id)
    
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    start_str = start_date.isoformat()
    end_str = end_date.isoformat()
    
    # Aggregate posts by pillar and status
    pipeline = [
        {"$match": {
            "company_id": company_id,
            "status": {"$nin": ["archived"]},
            "$or": [
                {"scheduled_at": {"$gte": start_str, "$lt": end_str}},
                {"posted_at": {"$gte": start_str, "$lt": end_str}},
                {"created_at": {"$gte": start_str, "$lt": end_str}, "scheduled_at": {"$in": [None, ""]}}
            ]
        }},
        {"$group": {
            "_id": {"pillar_id": "$pillar_id", "status": "$status"},
            "count": {"$sum": 1}
        }}
    ]
    
    results = await db.social_posts.aggregate(pipeline).to_list(200)
    
    # Get all pillars for names
    pillars = await db.content_pillars.find(
        {"company_id": company_id},
        {"_id": 0, "pillar_id": 1, "name": 1, "icon": 1, "color": 1, "weight_percentage": 1}
    ).to_list(50)
    pillar_map = {p["pillar_id"]: p for p in pillars}
    
    # Build stats
    pillar_stats = {}
    total_posts = 0
    for r in results:
        pid = r["_id"]["pillar_id"] or "unassigned"
        status = r["_id"]["status"]
        count = r["count"]
        total_posts += count
        
        if pid not in pillar_stats:
            p_info = pillar_map.get(pid, {})
            pillar_stats[pid] = {
                "pillar_id": pid,
                "name": p_info.get("name", "Sin pilar" if pid == "unassigned" else pid),
                "icon": p_info.get("icon"),
                "color": p_info.get("color"),
                "weight_percentage": p_info.get("weight_percentage"),
                "total": 0,
                "by_status": {}
            }
        pillar_stats[pid]["total"] += count
        pillar_stats[pid]["by_status"][status] = pillar_stats[pid]["by_status"].get(status, 0) + count
    
    # Calculate actual percentage and over-allocation alerts
    pillar_list = sorted(pillar_stats.values(), key=lambda x: x["total"], reverse=True)
    for ps in pillar_list:
        ps["actual_percentage"] = round((ps["total"] / total_posts * 100), 1) if total_posts > 0 else 0
        target = ps.get("weight_percentage") or 0
        ps["target_percentage"] = target
        # Flag if actual exceeds target by more than 10 percentage points
        ps["over_target"] = (ps["actual_percentage"] > target + 10) if target > 0 else False
        ps["diff_from_target"] = round(ps["actual_percentage"] - target, 1) if target > 0 else None
    
    return {
        "total_posts": total_posts,
        "pillars": pillar_list,
        "period": {"year": year, "month": month}
    }



# ---- Content Ideas CRUD ----

@demand_studio_router.get("/social/ideas")
async def get_content_ideas(
    status: Optional[str] = None,
    pillar_id: Optional[str] = None,
    org_id: Optional[str] = None,
    account_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get content ideas"""
    try:
        company_id, role = await get_effective_company_id(user, org_id)
    except HTTPException:
        company_id = user.company_id or user.active_org_id
        
    if not company_id:
        return []
    
    # Only query the target company (own or specified org)
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if pillar_id:
        query["pillar_id"] = pillar_id
    if account_id:
        query["account_id"] = account_id
    
    ideas = await db.content_ideas.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return ideas

@demand_studio_router.post("/social/ideas")
async def create_content_idea(data: ContentIdeaCreate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Create a content idea"""
    if org_id:
        try:
            company_id, can_write = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
        # Check memberships - resolve to the company with actual social data
        own_ideas = await db.content_ideas.count_documents({"company_id": company_id})
        own_accounts = await db.social_accounts.count_documents({"company_id": company_id})
        if own_ideas == 0 and own_accounts == 0:
            memberships = await db.memberships.find({
                "user_id": user.user_id,
                "$or": [{"status": "active"}, {"status": {"$exists": False}}]
            }).to_list(20)
            for m in memberships:
                mid = m.get("company_id") or m.get("organization_id")
                if mid and mid != company_id:
                    mid_accounts = await db.social_accounts.count_documents({"company_id": mid})
                    if mid_accounts > 0:
                        company_id = mid
                        break
    
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    idea = {
        "idea_id": f"idea_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "title": data.title,
        "description": data.description,
        "source_url": data.source_url,
        "pillar_id": data.pillar_id,
        "segment_id": data.segment_id,
        "audience_id": data.audience_id,
        "social_account_id": data.social_account_id,
        "tags": data.tags,
        "status": data.status,
        "content_body": data.content_body,
        "created_by_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.content_ideas.insert_one(idea)
    del idea["_id"]
    return idea

@demand_studio_router.put("/social/ideas/{idea_id}")
async def update_content_idea(idea_id: str, data: ContentIdeaCreate, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Update a content idea"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    
    result = await db.content_ideas.update_one(
        {"idea_id": idea_id, "company_id": company_id},
        {"$set": {
            "title": data.title,
            "description": data.description,
            "source_url": data.source_url,
            "pillar_id": data.pillar_id,
            "segment_id": data.segment_id,
            "audience_id": data.audience_id,
            "social_account_id": data.social_account_id,
            "tags": data.tags,
            "status": data.status,
            "content_body": data.content_body,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        # Try membership companies
        if not org_id:
            memberships = await db.memberships.find({
                "user_id": user.user_id,
                "$or": [{"status": "active"}, {"status": {"$exists": False}}]
            }).to_list(20)
            for m in memberships:
                mid = m.get("company_id") or m.get("organization_id")
                if mid and mid != company_id:
                    result = await db.content_ideas.update_one(
                        {"idea_id": idea_id, "company_id": mid},
                        {"$set": {
                            "title": data.title,
                            "description": data.description,
                            "source_url": data.source_url,
                            "pillar_id": data.pillar_id,
                            "segment_id": data.segment_id,
                            "audience_id": data.audience_id,
                            "social_account_id": data.social_account_id,
                            "tags": data.tags,
                            "status": data.status,
                            "content_body": data.content_body,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    if result.matched_count > 0:
                        return await db.content_ideas.find_one({"idea_id": idea_id}, {"_id": 0})
            raise HTTPException(status_code=404, detail="Idea not found")
        else:
            raise HTTPException(status_code=404, detail="Idea not found")
    
    return await db.content_ideas.find_one({"idea_id": idea_id}, {"_id": 0})

@demand_studio_router.delete("/social/ideas/{idea_id}")
async def delete_content_idea(idea_id: str, org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Delete a content idea"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    result = await db.content_ideas.delete_one(
        {"idea_id": idea_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        # Try membership companies
        if not org_id:
            memberships = await db.memberships.find({
                "user_id": user.user_id,
                "$or": [{"status": "active"}, {"status": {"$exists": False}}]
            }).to_list(20)
            for m in memberships:
                mid = m.get("company_id") or m.get("organization_id")
                if mid and mid != company_id:
                    result = await db.content_ideas.delete_one({"idea_id": idea_id, "company_id": mid})
                    if result.deleted_count > 0:
                        break
            else:
                raise HTTPException(status_code=404, detail="Idea not found")
        else:
            raise HTTPException(status_code=404, detail="Idea not found")
    return {"success": True}

@demand_studio_router.post("/social/ideas/{idea_id}/convert-to-post")
async def convert_idea_to_post(idea_id: str, social_account_id: str, target_status: Optional[str] = "production", org_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Convert an idea to a social post"""
    if org_id:
        try:
            company_id, _ = await check_section_permission(user, org_id, "social_media", "contributor")
        except HTTPException:
            company_id = org_id
    else:
        company_id = user.company_id or user.active_org_id
    
    idea = await db.content_ideas.find_one({"idea_id": idea_id, "company_id": company_id})
    if not idea and not org_id:
        memberships = await db.memberships.find({
            "user_id": user.user_id,
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        }).to_list(20)
        for m in memberships:
            mid = m.get("company_id") or m.get("organization_id")
            if mid and mid != company_id:
                idea = await db.content_ideas.find_one({"idea_id": idea_id, "company_id": mid})
                if idea:
                    company_id = mid
                    break
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    # Validate target_status
    valid_post_statuses = ["production", "editing", "drafted", "calendar", "scheduled"]
    if target_status not in valid_post_statuses:
        target_status = "production"
    
    now = datetime.now(timezone.utc)
    post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "social_account_id": social_account_id,
        "campaign_id": None,
        "pillar_id": idea.get("pillar_id"),
        "format": "post",
        "status": target_status,
        "title": idea["title"],
        "caption": idea.get("description"),
        "hook": None,
        "cta": None,
        "scheduled_at": None,
        "posted_at": None,
        "link_url": idea.get("source_url"),
        "notes": f"Converted from idea. Tags: {', '.join(idea.get('tags', []))}",
        "content_body": idea.get("content_body"),
        "created_by_user_id": user.user_id,
        "owner_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.social_posts.insert_one(post)
    del post["_id"]
    
    # Mark idea as used
    await db.content_ideas.update_one(
        {"idea_id": idea_id},
        {"$set": {"status": "used", "updated_at": now.isoformat()}}
    )
    
    return post

# ---- Global Marketing Calendar ----

@demand_studio_router.get("/global-calendar")
async def get_global_marketing_calendar(
    start_date: str,
    end_date: str,
    user: User = Depends(get_current_user)
):
    """Get all marketing events for global calendar"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"campaigns": [], "posts": [], "activations": [], "emails": []}
    
    # Get campaigns in date range
    campaigns = await db.marketing_campaigns.find({
        "company_id": company_id,
        "$or": [
            {"start_date": {"$gte": start_date, "$lte": end_date}},
            {"end_date": {"$gte": start_date, "$lte": end_date}},
            {"$and": [{"start_date": {"$lte": start_date}}, {"end_date": {"$gte": end_date}}]}
        ]
    }, {"_id": 0, "campaign_id": 1, "name": 1, "start_date": 1, "end_date": 1, "status": 1, "campaign_type": 1}).to_list(100)
    
    # Get social posts
    posts = await db.social_posts.find({
        "company_id": company_id,
        "$or": [
            {"scheduled_at": {"$gte": start_date, "$lte": end_date}},
            {"posted_at": {"$gte": start_date, "$lte": end_date}}
        ]
    }, {"_id": 0, "post_id": 1, "title": 1, "scheduled_at": 1, "posted_at": 1, "status": 1, "format": 1, "social_account_id": 1}).to_list(200)
    
    # Enrich posts with account info
    for post in posts:
        if post.get("social_account_id"):
            account = await db.social_accounts.find_one(
                {"account_id": post["social_account_id"]},
                {"_id": 0, "platform": 1, "handle": 1}
            )
            post["account"] = account
    
    # Get activations
    activations = await db.marketing_activations.find({
        "company_id": company_id,
        "$or": [
            {"start_date": {"$gte": start_date, "$lte": end_date}},
            {"end_date": {"$gte": start_date, "$lte": end_date}}
        ]
    }, {"_id": 0, "activation_id": 1, "name": 1, "start_date": 1, "end_date": 1, "status": 1, "activation_type": 1}).to_list(100)
    
    # Get email campaigns
    emails = await db.email_tracking.find({
        "company_id": company_id,
        "send_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0, "email_id": 1, "name": 1, "send_date": 1, "status": 1}).to_list(100)
    
    return {
        "campaigns": campaigns,
        "posts": posts,
        "activations": activations,
        "emails": emails
    }



# ============== SOCIAL METRICS ENDPOINTS ==============

from services.social_metrics import SocialMetricsManager, YouTubeMetricsService
from models.demand_studio import (
    ManualMetricsEntryCreate, ConnectedSocialAccountCreate
)


@demand_studio_router.get("/social-metrics/connections")
async def get_social_connections(
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all connected social accounts"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    connections = await db.connected_social_accounts.find(
        {"company_id": effective_company_id},
        {"_id": 0, "access_token": 0, "refresh_token": 0}
    ).to_list(50)
    
    return connections


# ============== YOUTUBE OAUTH FLOW ==============

from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL

@demand_studio_router.get("/social-metrics/youtube/auth-url")
async def get_youtube_auth_url(
    user: User = Depends(get_current_user)
):
    """Get the OAuth URL to connect YouTube channel"""
    redirect_uri = f"{FRONTEND_URL}/demand-studio/youtube-callback"
    
    # YouTube Data API scopes for reading channel and video data
    scopes = [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly"
    ]
    
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        f"&scope={'+'.join(scopes)}"
        "&access_type=offline"
        "&prompt=consent"
    )
    
    return {"auth_url": auth_url, "redirect_uri": redirect_uri}


@demand_studio_router.post("/social-metrics/youtube/callback")
async def youtube_oauth_callback(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Handle YouTube OAuth callback - exchange code for tokens and connect channel"""
    body = await request.json()
    code = body.get("code")
    redirect_uri = body.get("redirect_uri", f"{FRONTEND_URL}/demand-studio/youtube-callback")
    org_id = body.get("org_id")
    
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code required")
    
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    if role not in ["owner", "admin", "editor"]:
        raise HTTPException(status_code=403, detail="No permission to connect accounts")
    
    # Exchange code for tokens
    import httpx
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            }
        )
        
        if token_response.status_code != 200:
            logging.error(f"YouTube token error: {token_response.text}")
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code")
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)
    
    # Connect the YouTube channel
    from datetime import timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    
    manager = SocialMetricsManager(db, effective_company_id, user.user_id)
    result = await manager.connect_youtube(access_token, refresh_token, expires_at)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    # Sync initial metrics
    if result.get("connection_id"):
        sync_result = await manager.sync_youtube_metrics(result["connection_id"])
        result["initial_sync"] = sync_result
    
    return result


@demand_studio_router.post("/social-metrics/connect/youtube")
async def connect_youtube_account(
    access_token: str,
    refresh_token: Optional[str] = None,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Connect a YouTube channel using OAuth token (legacy endpoint)"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    if role not in ["owner", "admin", "editor"]:
        raise HTTPException(status_code=403, detail="No permission to connect accounts")
    
    manager = SocialMetricsManager(db, effective_company_id, user.user_id)
    result = await manager.connect_youtube(access_token, refresh_token)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@demand_studio_router.post("/social-metrics/sync/{connection_id}")
async def sync_social_metrics(
    connection_id: str,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Sync metrics for a connected account"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    # Get connection
    connection = await db.connected_social_accounts.find_one(
        {"connection_id": connection_id, "company_id": effective_company_id},
        {"_id": 0}
    )
    
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    manager = SocialMetricsManager(db, effective_company_id, user.user_id)
    
    if connection["platform"] == "youtube":
        result = await manager.sync_youtube_metrics(connection_id)
    else:
        raise HTTPException(status_code=400, detail=f"Sync not implemented for {connection['platform']}")
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return result


@demand_studio_router.delete("/social-metrics/connections/{connection_id}")
async def disconnect_social_account(
    connection_id: str,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Disconnect a social account"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="No permission to disconnect accounts")
    
    result = await db.connected_social_accounts.delete_one(
        {"connection_id": connection_id, "company_id": effective_company_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    return {"message": "Account disconnected", "connection_id": connection_id}


@demand_studio_router.get("/social-metrics/dashboard")
async def get_social_metrics_dashboard(
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get social metrics dashboard data"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    manager = SocialMetricsManager(db, effective_company_id, user.user_id)
    return await manager.get_dashboard_data()


@demand_studio_router.get("/social-metrics/snapshots")
async def get_metrics_snapshots(
    platform: Optional[str] = None,
    connection_id: Optional[str] = None,
    days: int = 30,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get historical metrics snapshots"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    from datetime import timedelta
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    
    query = {
        "company_id": effective_company_id,
        "snapshot_date": {"$gte": start_date}
    }
    
    if platform:
        query["platform"] = platform
    if connection_id:
        query["connection_id"] = connection_id
    
    snapshots = await db.social_metrics_snapshots.find(
        query,
        {"_id": 0}
    ).sort("snapshot_date", -1).to_list(500)
    
    return snapshots


@demand_studio_router.get("/social-metrics/posts")
async def get_post_metrics(
    platform: Optional[str] = None,
    connection_id: Optional[str] = None,
    limit: int = 30,
    sort_by: str = "reach",  # reach, likes, comments, published_at
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get metrics for individual posts"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    query = {"company_id": effective_company_id}
    
    if platform:
        query["platform"] = platform
    if connection_id:
        query["connection_id"] = connection_id
    
    sort_field = sort_by if sort_by in ["reach", "likes", "comments", "video_views"] else "reach"
    
    posts = await db.social_post_metrics.find(
        query,
        {"_id": 0}
    ).sort(sort_field, -1).limit(limit).to_list(limit)
    
    return posts


@demand_studio_router.post("/social-metrics/manual")
async def add_manual_metrics(
    data: ManualMetricsEntryCreate,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Add manual metrics entry"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    if role not in ["owner", "admin", "editor"]:
        raise HTTPException(status_code=403, detail="No permission to add metrics")
    
    manager = SocialMetricsManager(db, effective_company_id, user.user_id)
    result = await manager.add_manual_entry(data.dict())
    
    return result


@demand_studio_router.get("/social-metrics/manual")
async def get_manual_metrics(
    platform: Optional[str] = None,
    days: int = 90,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get manual metrics entries"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    from datetime import timedelta
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    
    query = {
        "company_id": effective_company_id,
        "entry_date": {"$gte": start_date}
    }
    
    if platform:
        query["platform"] = platform
    
    entries = await db.manual_social_metrics.find(
        query,
        {"_id": 0}
    ).sort("entry_date", -1).to_list(200)
    
    return entries


@demand_studio_router.delete("/social-metrics/manual/{entry_id}")
async def delete_manual_metrics(
    entry_id: str,
    org_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Delete a manual metrics entry"""
    effective_company_id, role = await get_effective_company_id(user, org_id)
    
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="No permission to delete metrics")
    
    result = await db.manual_social_metrics.delete_one(
        {"entry_id": entry_id, "company_id": effective_company_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    return {"message": "Entry deleted", "entry_id": entry_id}
