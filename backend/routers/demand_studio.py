# routers/demand_studio.py - Demand Studio routes
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os

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
    SocialPostCreate, SocialPost,
    SocialPostAssetLinkCreate, SocialPostSpendLinkCreate,
    ContentIdeaCreate, ContentIdea
)
from routers.auth import get_current_user
from utils.activity_logger import log_activity, user_info

demand_studio_router = APIRouter(prefix="/demand-studio", tags=["Demand Studio"])

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
async def get_demand_studio_stats(user: User = Depends(get_current_user)):
    """Get dashboard statistics for Demand Studio"""
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
    
    # Count linked leads
    leads_linked = await db.campaign_lead_links.count_documents({"company_id": company_id})
    
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
    user: User = Depends(get_current_user)
):
    """Get marketing campaigns with optional scope filter for collaboration"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    campaigns = []
    
    # Get owned campaigns (unless scope is "shared" only)
    if scope != "shared":
        query = {"company_id": company_id}
        if status:
            query["status"] = status
        if campaign_type:
            query["campaign_type"] = campaign_type
        
        owned_campaigns = await db.marketing_campaigns.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        
        # Mark as owned
        for c in owned_campaigns:
            c["_access_type"] = "owned"
        campaigns.extend(owned_campaigns)
    
    # Get cross-org shared campaigns (unless scope is "owned" only)
    if scope != "owned":
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
async def create_campaign(data: MarketingCampaignCreate, user: User = Depends(get_current_user)):
    """Create a new marketing campaign"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
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
    user: User = Depends(get_current_user)
):
    """Get campaign spend records"""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if channel_id:
        query["channel_id"] = channel_id
    if category:
        query["category"] = category
    
    spend = await db.campaign_spend.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return spend

@demand_studio_router.post("/spend")
async def create_spend(data: CampaignSpendCreate, user: User = Depends(get_current_user)):
    """Record campaign spend"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
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
    user: User = Depends(get_current_user)
):
    """Get marketing activations"""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if status:
        query["status"] = status
    
    activations = await db.marketing_activations.find(query, {"_id": 0}).sort("start_date", -1).to_list(500)
    return activations

@demand_studio_router.post("/activations")
async def create_activation(data: MarketingActivationCreate, user: User = Depends(get_current_user)):
    """Create a marketing activation"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
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
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
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
    result = await db.marketing_activations.delete_one(
        {"activation_id": activation_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Activation not found")
    return {"success": True}

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
    return await get_demand_studio_stats(user)

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
        {"user_id": {"$in": user_ids}},
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
async def get_social_accounts(user: User = Depends(get_current_user)):
    """Get all social media accounts"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    accounts = await db.social_accounts.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    return accounts

@demand_studio_router.post("/social/accounts")
async def create_social_account(data: SocialAccountCreate, user: User = Depends(get_current_user)):
    """Create a social media account"""
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
async def update_social_account(account_id: str, data: SocialAccountCreate, user: User = Depends(get_current_user)):
    """Update a social account"""
    company_id = user.company_id or user.active_org_id
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
async def delete_social_account(account_id: str, user: User = Depends(get_current_user)):
    """Delete a social account"""
    company_id = user.company_id or user.active_org_id
    result = await db.social_accounts.delete_one(
        {"account_id": account_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True}

# ---- Content Pillars CRUD ----

@demand_studio_router.get("/social/pillars")
async def get_content_pillars(user: User = Depends(get_current_user)):
    """Get all content pillars"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    pillars = await db.content_pillars.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    return pillars

@demand_studio_router.post("/social/pillars")
async def create_content_pillar(data: ContentPillarCreate, user: User = Depends(get_current_user)):
    """Create a content pillar"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    pillar = {
        "pillar_id": f"pillar_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "name": data.name,
        "description": data.description,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.content_pillars.insert_one(pillar)
    del pillar["_id"]
    return pillar

@demand_studio_router.delete("/social/pillars/{pillar_id}")
async def delete_content_pillar(pillar_id: str, user: User = Depends(get_current_user)):
    """Delete a content pillar"""
    company_id = user.company_id or user.active_org_id
    result = await db.content_pillars.delete_one(
        {"pillar_id": pillar_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pillar not found")
    return {"success": True}

# ---- Social Posts CRUD ----

@demand_studio_router.get("/social/posts")
async def get_social_posts(
    account_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    pillar_id: Optional[str] = None,
    status: Optional[str] = None,
    format: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get social posts with filters"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
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
async def create_social_post(data: SocialPostCreate, user: User = Depends(get_current_user)):
    """Create a social post"""
    company_id = user.company_id or user.active_org_id
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
        "format": data.format,
        "status": data.status,
        "title": data.title,
        "caption": data.caption,
        "hook": data.hook,
        "cta": data.cta,
        "scheduled_at": data.scheduled_at,
        "posted_at": None,
        "link_url": data.link_url,
        "notes": data.notes,
        "created_by_user_id": user.user_id,
        "owner_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.social_posts.insert_one(post)
    del post["_id"]
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
async def update_social_post(post_id: str, data: SocialPostCreate, user: User = Depends(get_current_user)):
    """Update a social post"""
    company_id = user.company_id or user.active_org_id
    
    update_data = {
        "social_account_id": data.social_account_id,
        "campaign_id": data.campaign_id,
        "pillar_id": data.pillar_id,
        "format": data.format,
        "status": data.status,
        "title": data.title,
        "caption": data.caption,
        "hook": data.hook,
        "cta": data.cta,
        "scheduled_at": data.scheduled_at,
        "link_url": data.link_url,
        "notes": data.notes,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.social_posts.update_one(
        {"post_id": post_id, "company_id": company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    
    return await db.social_posts.find_one({"post_id": post_id}, {"_id": 0})

@demand_studio_router.post("/social/posts/{post_id}/mark-posted")
async def mark_post_as_posted(post_id: str, user: User = Depends(get_current_user)):
    """Mark a post as posted"""
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

@demand_studio_router.post("/social/posts/{post_id}/duplicate")
async def duplicate_social_post(post_id: str, user: User = Depends(get_current_user)):
    """Duplicate a social post"""
    company_id = user.company_id or user.active_org_id
    
    original = await db.social_posts.find_one({"post_id": post_id, "company_id": company_id})
    if not original:
        raise HTTPException(status_code=404, detail="Post not found")
    
    now = datetime.now(timezone.utc)
    new_post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "social_account_id": original["social_account_id"],
        "campaign_id": original.get("campaign_id"),
        "pillar_id": original.get("pillar_id"),
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
        "created_by_user_id": user.user_id,
        "owner_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.social_posts.insert_one(new_post)
    del new_post["_id"]
    return new_post

@demand_studio_router.delete("/social/posts/{post_id}")
async def delete_social_post(post_id: str, user: User = Depends(get_current_user)):
    """Delete a social post"""
    company_id = user.company_id or user.active_org_id
    result = await db.social_posts.delete_one(
        {"post_id": post_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
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
async def get_social_stats(user: User = Depends(get_current_user)):
    """Get social media statistics for dashboard"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {
            "scheduledThisWeek": 0,
            "postedThisMonth": 0,
            "activeAccounts": 0,
            "campaignLinkedPosts": 0
        }
    
    now = datetime.now(timezone.utc)
    week_from_now = (now + timedelta(days=7)).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # Scheduled this week
    scheduled_this_week = await db.social_posts.count_documents({
        "company_id": company_id,
        "scheduled_at": {"$gte": now.isoformat(), "$lte": week_from_now},
        "status": {"$in": ["scheduled", "drafted"]}
    })
    
    # Posted this month
    posted_this_month = await db.social_posts.count_documents({
        "company_id": company_id,
        "posted_at": {"$gte": month_start},
        "status": "posted"
    })
    
    # Active accounts
    active_accounts = await db.social_accounts.count_documents({
        "company_id": company_id,
        "status": "active"
    })
    
    # Campaign-linked posts
    campaign_linked = await db.social_posts.count_documents({
        "company_id": company_id,
        "campaign_id": {"$ne": None}
    })
    
    return {
        "scheduledThisWeek": scheduled_this_week,
        "postedThisMonth": posted_this_month,
        "activeAccounts": active_accounts,
        "campaignLinkedPosts": campaign_linked
    }

@demand_studio_router.get("/social/insights")
async def get_social_insights(user: User = Depends(get_current_user)):
    """Get social media insights for reporting"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"byFormat": [], "byPillar": [], "byStatus": []}
    
    # Posts by format
    by_format = await db.social_posts.aggregate([
        {"$match": {"company_id": company_id}},
        {"$group": {"_id": "$format", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    # Posts by pillar
    by_pillar_raw = await db.social_posts.aggregate([
        {"$match": {"company_id": company_id, "pillar_id": {"$ne": None}}},
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
        {"$match": {"company_id": company_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    # Scheduled vs Posted rate
    total_posts = await db.social_posts.count_documents({"company_id": company_id})
    posted_count = await db.social_posts.count_documents({"company_id": company_id, "status": "posted"})
    
    return {
        "byFormat": [{"format": item["_id"], "count": item["count"]} for item in by_format],
        "byPillar": by_pillar,
        "byStatus": [{"status": item["_id"], "count": item["count"]} for item in by_status],
        "totalPosts": total_posts,
        "postedCount": posted_count,
        "postRate": round((posted_count / total_posts * 100) if total_posts > 0 else 0, 1)
    }

@demand_studio_router.get("/social/calendar")
async def get_social_calendar(
    start_date: str,
    end_date: str,
    user: User = Depends(get_current_user)
):
    """Get posts for calendar view"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    posts = await db.social_posts.find({
        "company_id": company_id,
        "$or": [
            {"scheduled_at": {"$gte": start_date, "$lte": end_date}},
            {"posted_at": {"$gte": start_date, "$lte": end_date}}
        ]
    }, {"_id": 0}).to_list(500)
    
    # Enrich with account info
    for post in posts:
        if post.get("social_account_id"):
            account = await db.social_accounts.find_one(
                {"account_id": post["social_account_id"]},
                {"_id": 0, "platform": 1, "handle": 1}
            )
            post["account"] = account
    
    return posts

# ---- Content Ideas CRUD ----

@demand_studio_router.get("/social/ideas")
async def get_content_ideas(
    status: Optional[str] = None,
    pillar_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get content ideas"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if pillar_id:
        query["pillar_id"] = pillar_id
    
    ideas = await db.content_ideas.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return ideas

@demand_studio_router.post("/social/ideas")
async def create_content_idea(data: ContentIdeaCreate, user: User = Depends(get_current_user)):
    """Create a content idea"""
    company_id = user.company_id or user.active_org_id
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
        "tags": data.tags,
        "status": data.status,
        "created_by_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.content_ideas.insert_one(idea)
    del idea["_id"]
    return idea

@demand_studio_router.put("/social/ideas/{idea_id}")
async def update_content_idea(idea_id: str, data: ContentIdeaCreate, user: User = Depends(get_current_user)):
    """Update a content idea"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.content_ideas.update_one(
        {"idea_id": idea_id, "company_id": company_id},
        {"$set": {
            "title": data.title,
            "description": data.description,
            "source_url": data.source_url,
            "pillar_id": data.pillar_id,
            "tags": data.tags,
            "status": data.status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    return await db.content_ideas.find_one({"idea_id": idea_id}, {"_id": 0})

@demand_studio_router.delete("/social/ideas/{idea_id}")
async def delete_content_idea(idea_id: str, user: User = Depends(get_current_user)):
    """Delete a content idea"""
    company_id = user.company_id or user.active_org_id
    result = await db.content_ideas.delete_one(
        {"idea_id": idea_id, "company_id": company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Idea not found")
    return {"success": True}

@demand_studio_router.post("/social/ideas/{idea_id}/convert-to-post")
async def convert_idea_to_post(idea_id: str, social_account_id: str, user: User = Depends(get_current_user)):
    """Convert an idea to a social post"""
    company_id = user.company_id or user.active_org_id
    
    idea = await db.content_ideas.find_one({"idea_id": idea_id, "company_id": company_id})
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    now = datetime.now(timezone.utc)
    post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "social_account_id": social_account_id,
        "campaign_id": None,
        "pillar_id": idea.get("pillar_id"),
        "format": "post",
        "status": "idea",
        "title": idea["title"],
        "caption": idea.get("description"),
        "hook": None,
        "cta": None,
        "scheduled_at": None,
        "posted_at": None,
        "link_url": idea.get("source_url"),
        "notes": f"Converted from idea. Tags: {', '.join(idea.get('tags', []))}",
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
