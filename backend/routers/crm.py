# routers/crm.py - CRM module routes
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime, timezone
from typing import Optional
import uuid
import math

from config import db
from dependencies import get_current_user
from models.auth import User
from models.crm import (
    LeadCreate, Lead, ContactCreate, Contact,
    ClientCreate, Client, CommLogCreate, CommLog,
    LeadFormCreate, LeadForm, LeadFormFieldConfig, CustomFieldConfig
)
from utils.activity_logger import log_activity, user_info
from utils.email_service import send_lead_assignment_notification


# ============== CAMPAIGN AUTO-LINK HELPER ==============

async def resolve_campaign_from_code(company_id: str, campaign_code: str) -> Optional[str]:
    """Find campaign_id by tracking code within organization. Returns None if not found."""
    if not campaign_code:
        return None
    normalized_code = campaign_code.strip().upper()
    campaign = await db.marketing_campaigns.find_one(
        {"company_id": company_id, "campaign_code": normalized_code},
        {"_id": 0, "campaign_id": 1}
    )
    return campaign["campaign_id"] if campaign else None


async def increment_campaign_leads_linked(campaign_id: str):
    """Increment the leads_linked counter on a campaign"""
    if campaign_id:
        await db.marketing_campaigns.update_one(
            {"campaign_id": campaign_id},
            {"$inc": {"leads_linked": 1}}
        )


def sanitize_float(value, default=0):
    """Convert non-JSON-compliant floats (inf, -inf, nan) to default value"""
    if value is None:
        return default
    try:
        if math.isnan(value) or math.isinf(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def sanitize_document(doc):
    """Recursively sanitize a document to ensure JSON compliance and clean 'nan' strings"""
    if doc is None:
        return None
    if isinstance(doc, dict):
        sanitized = {}
        for key, value in doc.items():
            sanitized[key] = sanitize_document(value)
        return sanitized
    elif isinstance(doc, list):
        return [sanitize_document(item) for item in doc]
    elif isinstance(doc, float):
        if math.isnan(doc) or math.isinf(doc):
            return 0
        return doc
    elif isinstance(doc, str):
        # Clean "nan" and "None" strings that come from pandas
        if doc.lower() in ["nan", "none", "null"]:
            return ""
        return doc
    else:
        return doc


async def enrich_leads_with_owner_names(leads: list, company_id: str) -> list:
    """Add owner_name to each lead that has an owner_id"""
    if not leads:
        return leads
    
    # Collect unique owner_ids
    owner_ids = set()
    for lead in leads:
        if lead.get("owner_id"):
            owner_ids.add(lead["owner_id"])
    
    if not owner_ids:
        return leads
    
    # Fetch user names in one query
    users = await db.users.find(
        {"user_id": {"$in": list(owner_ids)}, "company_id": company_id},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(100)
    
    # Build lookup dict
    user_map = {}
    for u in users:
        name = u.get("name")
        if not name:
            email = u.get("email", "")
            name = email.split("@")[0].replace(".", " ").title() if email else f"User {u.get('user_id', '')[-6:]}"
        user_map[u["user_id"]] = name
    
    # Enrich leads
    for lead in leads:
        if lead.get("owner_id") and lead["owner_id"] in user_map:
            lead["owner_name"] = user_map[lead["owner_id"]]
    
    return leads


# ============== ROUTERS ==============

crm_router = APIRouter(prefix="/crm", tags=["CRM"])
leads_router = APIRouter(prefix="/leads", tags=["Leads"])
contacts_router = APIRouter(prefix="/contacts", tags=["Contacts"])
lead_forms_router = APIRouter(prefix="/lead-forms", tags=["Lead Forms"])
webhooks_router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ============== LEADS ROUTES ==============

@leads_router.get("")
async def get_leads(
    user: User = Depends(get_current_user),
    status: Optional[str] = None,
    source: Optional[str] = None,
    event_type: Optional[str] = None,
    campaign_id: Optional[str] = None
):
    """Get all leads with optional filters"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if event_type:
        query["event_type"] = event_type
    if campaign_id:
        query["campaign_id"] = campaign_id
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Sanitize all leads to ensure JSON compliance
    sanitized_leads = []
    for lead in leads:
        sanitized_leads.append(sanitize_document(lead))
    
    return sanitized_leads


@leads_router.post("")
async def create_lead(data: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new lead (internal)"""
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    
    lead_data = data.model_dump()
    
    # Campaign auto-link: if campaign_code provided, resolve to campaign_id
    campaign_id = lead_data.get("campaign_id")
    campaign_code = lead_data.pop("campaign_code", None)  # Remove from doc, we don't store it
    attribution_source = lead_data.get("attribution_source")
    
    if not campaign_id and campaign_code:
        # Auto-link via campaign_code
        resolved_campaign_id = await resolve_campaign_from_code(user.company_id, campaign_code)
        if resolved_campaign_id:
            campaign_id = resolved_campaign_id
            attribution_source = attribution_source or "link"
    
    # If campaign_id selected manually and no attribution_source, mark as manual
    if campaign_id and not attribution_source:
        attribution_source = "manual"
    
    lead_doc = {
        "lead_id": lead_id,
        "company_id": user.company_id,
        **lead_data,
        "campaign_id": campaign_id,
        "attribution_source": attribution_source,
        "status": "New",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.leads.insert_one(lead_doc)
    del lead_doc["_id"]
    lead_doc["created_at"] = now
    lead_doc["updated_at"] = now
    
    # Increment campaign leads_linked counter
    if campaign_id:
        await increment_campaign_leads_linked(campaign_id)
    
    # Log activity
    await log_activity(
        module="crm",
        action="create",
        entity_type="lead",
        entity_id=lead_id,
        entity_name=data.lead_name or data.email or "New Lead",
        **user_info(user)
    )
    
    return lead_doc


@leads_router.get("/stats")
async def get_lead_stats(user: User = Depends(get_current_user)):
    """Get lead statistics"""
    total = await db.leads.count_documents({"company_id": user.company_id})
    new_count = await db.leads.count_documents({"company_id": user.company_id, "status": "New"})
    contacted = await db.leads.count_documents({"company_id": user.company_id, "status": "Contacted"})
    converted = await db.leads.count_documents({"company_id": user.company_id, "status": "Converted"})
    discarded = await db.leads.count_documents({"company_id": user.company_id, "status": "Discarded"})
    
    # By source
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}
    ]
    by_source = await db.leads.aggregate(pipeline).to_list(10)
    
    return {
        "total": total,
        "new": new_count,
        "contacted": contacted,
        "converted": converted,
        "discarded": discarded,
        "by_source": {s["_id"]: s["count"] for s in by_source if s["_id"]}
    }


@leads_router.get("/{lead_id}")
async def get_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Get a specific lead"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for field in ["created_at", "updated_at"]:
        if lead.get(field) and isinstance(lead[field], str):
            lead[field] = datetime.fromisoformat(lead[field])
    return lead


@leads_router.put("/{lead_id}")
async def update_lead(lead_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update a lead"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Fields that can be updated
    allowed_fields = [
        "lead_name", "name", "email", "phone", "whatsapp", "company_name", "company",
        "client_type", "rnc", "address", "city", "country", "message", "notes", "owner_id", "event_type",
        "estimated_value", "budget_range", "guest_count", "event_date", "source"
    ]
    
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in allowed_fields:
        if field in data:
            # Clean nan values
            value = data[field]
            if isinstance(value, str) and value.lower() in ["nan", "none", "null"]:
                value = ""
            updates[field] = value
    
    await db.leads.update_one(
        {"lead_id": lead_id, "company_id": user.company_id},
        {"$set": updates}
    )
    
    updated_lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    return sanitize_document(updated_lead)


@leads_router.post("/{lead_id}/convert")
async def convert_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Convert a lead to Client + Contact + Event"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Lead already converted")
    
    # OWNER ENFORCEMENT: Block conversion if no owner assigned
    lead_owner_id = lead.get("owner_id")
    if not lead_owner_id:
        raise HTTPException(
            status_code=400, 
            detail="Assign a salesperson before converting. / Asigna un vendedor antes de convertir."
        )
    
    # Get owner name for the client
    owner_name = None
    if lead_owner_id:
        owner_doc = await db.users.find_one({"user_id": lead_owner_id}, {"_id": 0, "name": 1})
        owner_name = owner_doc.get("name") if owner_doc else None
    
    now = datetime.now(timezone.utc)
    
    # Check for existing client by email or company name
    existing_client = None
    if lead.get("email"):
        existing_client = await db.clients.find_one({"company_id": user.company_id, "email": lead["email"]}, {"_id": 0})
    if not existing_client and lead.get("company_name"):
        existing_client = await db.clients.find_one({"company_id": user.company_id, "display_name": lead["company_name"]}, {"_id": 0})
    
    if existing_client:
        client_id = existing_client["client_id"]
        # Update existing client with owner if not set
        if not existing_client.get("owner_id"):
            await db.clients.update_one(
                {"client_id": client_id},
                {"$set": {"owner_id": lead_owner_id, "owner_name": owner_name, "updated_at": now.isoformat()}}
            )
    else:
        # Create new client with inherited owner
        client_id = f"client_{uuid.uuid4().hex[:12]}"
        client_type = "Company" if lead.get("company_name") else "Individual"
        display_name = lead.get("company_name") or lead.get("lead_name")
        
        client_doc = {
            "client_id": client_id,
            "company_id": user.company_id,
            "client_type": client_type,
            "display_name": display_name,
            "email": lead.get("email"),
            "phone": lead.get("phone"),
            "source": lead.get("source", "Website"),
            "source_lead_id": lead_id,  # Link back to original lead
            "owner_id": lead_owner_id,  # Inherit owner from lead
            "owner_name": owner_name,
            "tags": [],
            "notes": lead.get("message"),
            "status": "Active",
            "total_revenue": 0.0,
            "events_count": 0,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.clients.insert_one(client_doc)
    
    # Create contact for the client
    contact_id = f"contact_{uuid.uuid4().hex[:12]}"
    contact_doc = {
        "contact_id": contact_id,
        "company_id": user.company_id,
        "client_id": client_id,
        "name": lead.get("lead_name"),
        "email": lead.get("email"),
        "phone": lead.get("phone"),
        "role_title": None,
        "is_primary": True,
        "is_billing_contact": False,
        "created_at": now.isoformat()
    }
    # Only insert if contact doesn't already exist
    existing_contact = await db.contacts.find_one({"client_id": client_id, "email": lead.get("email")})
    if not existing_contact:
        await db.contacts.insert_one(contact_doc)
    
    # Create event
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    event_date = None
    event_date_tbd = True
    if lead.get("event_date") and lead.get("event_date") != "TBD":
        try:
            event_date = datetime.fromisoformat(lead["event_date"]).isoformat()
            event_date_tbd = False
        except:
            event_date_tbd = True
    
    event_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        "client_id": client_id,
        "name": f"{lead.get('event_type', 'Event')} - {lead.get('lead_name', 'New Event')}",
        "event_type": lead.get("event_type", "other"),
        "event_date": event_date,
        "event_date_tbd": event_date_tbd,
        "end_date": None,
        "is_booking": False,
        "venue": None,
        "guest_count": lead.get("estimated_guest_count") or 0,
        "budget": 0.0,
        "notes": lead.get("message"),
        "status": "planning",
        "stage": "Inquiry Received",
        "expected_value": None,
        "next_followup_date": None,
        "next_step": None,
        "lost_reason": None,
        "source": lead.get("source"),
        "timeline": [],
        "tasks": [],
        "menu_items": [],
        "documents": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.events.insert_one(event_doc)
    
    # Update client events count
    await db.clients.update_one({"client_id": client_id}, {"$inc": {"events_count": 1}})
    
    # Mark lead as converted
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "status": "Converted",
            "converted_client_id": client_id,
            "converted_event_id": event_id,
            "updated_at": now.isoformat()
        }}
    )
    
    return {
        "message": "Lead converted successfully",
        "client_id": client_id,
        "contact_id": contact_id,
        "event_id": event_id
    }


@leads_router.post("/{lead_id}/discard")
async def discard_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Mark a lead as discarded"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Cannot discard a converted lead")
    
    now = datetime.now(timezone.utc)
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"status": "Discarded", "updated_at": now.isoformat()}}
    )
    return {"message": "Lead discarded"}


# ============== CLIENTS ROUTES (via CRM Router) ==============

@crm_router.get("/clients-diagnostic")
async def get_clients_diagnostic(user: User = Depends(get_current_user)):
    """Diagnostic endpoint to debug client visibility issues"""
    # Get user's company_id
    user_company_id = user.company_id
    
    # Count with exact match in main clients collection
    exact_count = await db.clients.count_documents({"company_id": user_company_id})
    
    # Check if there's a clients_sandbox collection with data
    sandbox_count = 0
    sandbox_sample = None
    try:
        sandbox_count = await db.db["clients_sandbox"].count_documents({"company_id": user_company_id})
        sandbox_sample = await db.db["clients_sandbox"].find_one({"company_id": user_company_id}, {"_id": 0, "client_id": 1, "company_id": 1, "display_name": 1, "name": 1})
    except:
        pass
    
    # Get a sample client from the database (any client)
    sample_any = await db.clients.find_one({}, {"_id": 0, "client_id": 1, "company_id": 1, "display_name": 1})
    
    # Try to find clients with this company_id using regex (case insensitive)
    regex_count = await db.clients.count_documents({"company_id": {"$regex": f"^{user_company_id}$", "$options": "i"}})
    
    # Get a sample client for this user's company
    sample_user = await db.clients.find_one({"company_id": user_company_id}, {"_id": 0, "client_id": 1, "company_id": 1, "display_name": 1})
    
    # List all unique company_ids
    unique_company_ids = await db.clients.distinct("company_id")
    
    # Check if user's company_id exists in unique list
    company_id_exists = user_company_id in unique_company_ids
    
    # Find similar company_ids (for debugging typos/whitespace)
    similar_ids = [cid for cid in unique_company_ids if user_company_id.lower() in str(cid).lower() or str(cid).lower() in user_company_id.lower()]
    
    # Check all collections in the database
    collections = await db.db.list_collection_names()
    client_related_collections = [c for c in collections if "client" in c.lower()]
    
    return {
        "user_company_id": user_company_id,
        "user_company_id_repr": repr(user_company_id),
        "exact_match_count": exact_count,
        "regex_match_count": regex_count,
        "sandbox_count": sandbox_count,
        "sandbox_sample": sandbox_sample,
        "company_id_in_unique_list": company_id_exists,
        "sample_any_client": sample_any,
        "sample_user_client": sample_user,
        "unique_company_ids_count": len(unique_company_ids),
        "similar_company_ids": similar_ids[:5],
        "all_company_ids": unique_company_ids[:10],
        "client_related_collections": client_related_collections
    }


@crm_router.get("/clients")
async def get_clients(user: User = Depends(get_current_user), status: Optional[str] = None, include_all: bool = False):
    """Get all clients (qualified accounts)"""
    try:
        query = {"company_id": user.company_id}
        if status:
            query["status"] = status
        
        clients = await db.clients.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        
        # If no clients found with company_id, try without filter (for debugging)
        if len(clients) == 0 and include_all:
            clients = await db.clients.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        
        # Sanitize and process clients
        result = []
        for c in clients:
            try:
                # Sanitize the document first
                c = sanitize_document(c)
                
                for field in ["created_at", "updated_at"]:
                    val = c.get(field)
                    if val and isinstance(val, str):
                        try:
                            c[field] = datetime.fromisoformat(val.replace('Z', '+00:00'))
                        except:
                            c[field] = None
                
                # Ensure new fields have defaults
                if "display_name" not in c or not c.get("display_name"):
                    c["display_name"] = c.get("name") or c.get("company_name") or c.get("client_name") or ""
                if "client_type" not in c:
                    c["client_type"] = "Company" if c.get("company_name") else "Individual"
                if "status" not in c:
                    c["status"] = "Active"
                    
                result.append(c)
            except Exception as e:
                # Skip problematic clients but log
                print(f"Error processing client: {e}")
                continue
        
        return result
    except Exception as e:
        print(f"Error in get_clients: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@crm_router.post("/clients")
async def create_client(data: ClientCreate, user: User = Depends(get_current_user)):
    """Create a new client"""
    now = datetime.now(timezone.utc)
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    
    client_doc = {
        "client_id": client_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "total_revenue": 0.0,
        "events_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.clients.insert_one(client_doc)
    del client_doc["_id"]
    client_doc["created_at"] = now
    client_doc["updated_at"] = now
    
    # Log activity
    await log_activity(
        module="crm",
        action="create",
        entity_type="client",
        entity_id=client_id,
        entity_name=data.display_name or data.company_name or data.name or "New Client",
        **user_info(user)
    )
    
    return client_doc


# === BULK DELETE ROUTES - MUST be before parametrized routes to avoid path collision ===

@crm_router.delete("/clients/bulk-delete")
async def bulk_delete_clients(user: User = Depends(get_current_user)):
    """Delete all clients for this company - use with caution!"""
    result = await db.clients.delete_many({"company_id": user.company_id})
    return {"message": f"Deleted {result.deleted_count} clients", "deleted": result.deleted_count}


@crm_router.delete("/leads/bulk-delete")
async def bulk_delete_leads(lead_type: str = "all", user: User = Depends(get_current_user)):
    """Delete leads by type - use with caution!
    lead_type: 'outreach', 'inbound', or 'all'
    """
    query = {"company_id": user.company_id}
    if lead_type == "outreach":
        query["lead_type"] = "outreach"
    elif lead_type == "inbound":
        query["lead_type"] = {"$ne": "outreach"}
    # 'all' deletes everything
    
    result = await db.leads.delete_many(query)
    return {"message": f"Deleted {result.deleted_count} leads", "deleted": result.deleted_count}


# === END BULK DELETE ROUTES ===


@crm_router.get("/clients/{client_id}")
async def get_client(client_id: str, user: User = Depends(get_current_user)):
    """Get a specific client with contacts"""
    client = await db.clients.find_one({"client_id": client_id, "company_id": user.company_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    for field in ["created_at", "updated_at"]:
        if client.get(field) and isinstance(client[field], str):
            client[field] = datetime.fromisoformat(client[field])
    
    # Ensure new fields have defaults
    if "display_name" not in client:
        client["display_name"] = client.get("name", client.get("company_name", ""))
    if "client_type" not in client:
        client["client_type"] = "Company" if client.get("company_name") else "Individual"
    if "status" not in client:
        client["status"] = "Active"
    
    # Get contacts
    contacts = await db.contacts.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    for contact in contacts:
        if contact.get("created_at") and isinstance(contact["created_at"], str):
            contact["created_at"] = datetime.fromisoformat(contact["created_at"])
    client["contacts"] = contacts
    
    return client


@crm_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientCreate, user: User = Depends(get_current_user)):
    """Update a client"""
    # Get old data for logging
    old_client = await db.clients.find_one({"client_id": client_id, "company_id": user.company_id}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    result = await db.clients.update_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"$set": {**data.model_dump(), "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Log activity
    await log_activity(
        module="crm",
        action="update",
        entity_type="client",
        entity_id=client_id,
        entity_name=data.display_name or data.company_name or data.name or old_client.get("display_name", "Client"),
        **user_info(user)
    )
    
    return await get_client(client_id, user)


@crm_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: User = Depends(get_current_user)):
    """Delete a client"""
    # Get client name for logging
    client = await db.clients.find_one({"client_id": client_id, "company_id": user.company_id}, {"_id": 0})
    
    result = await db.clients.delete_one({"client_id": client_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    # Also delete associated contacts
    await db.contacts.delete_many({"client_id": client_id})
    
    # Log activity
    if client:
        await log_activity(
            module="crm",
            action="delete",
            entity_type="client",
            entity_id=client_id,
            entity_name=client.get("display_name") or client.get("company_name") or client.get("name", "Client"),
            **user_info(user)
        )
    
    return {"message": "Client deleted"}


@crm_router.get("/debug-info")
async def get_debug_info(user: User = Depends(get_current_user)):
    """Debug endpoint to diagnose data issues"""
    # Count all data for this user's company
    total_clients = await db.clients.count_documents({"company_id": user.company_id})
    total_leads = await db.leads.count_documents({"company_id": user.company_id})
    
    # Count ALL clients and leads in database (across all companies)
    all_clients = await db.clients.count_documents({})
    all_leads = await db.leads.count_documents({})
    
    # Get unique company_ids in the database
    client_company_ids = await db.clients.distinct("company_id")
    lead_company_ids = await db.leads.distinct("company_id")
    
    # Count clients per company_id (top 10)
    pipeline = [
        {"$group": {"_id": "$company_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    clients_by_company = await db.clients.aggregate(pipeline).to_list(10)
    
    # Sample of client data to check structure
    sample_client = await db.clients.find_one({"company_id": user.company_id}, {"_id": 0, "client_id": 1, "display_name": 1, "status": 1})
    sample_lead = await db.leads.find_one({"company_id": user.company_id}, {"_id": 0, "lead_id": 1, "lead_name": 1, "status": 1, "lead_type": 1})
    
    # Also get a sample client from ANY company to see what company_ids exist
    any_client = await db.clients.find_one({}, {"_id": 0, "client_id": 1, "company_id": 1, "display_name": 1})
    
    return {
        "your_user_id": user.user_id,
        "your_company_id": user.company_id,
        "your_email": user.email,
        "your_clients_count": total_clients,
        "your_leads_count": total_leads,
        "total_clients_all_companies": all_clients,
        "total_leads_all_companies": all_leads,
        "clients_count_by_company": clients_by_company,
        "company_ids_with_clients": client_company_ids[:10],
        "company_ids_with_leads": lead_company_ids[:10],
        "sample_your_client": sample_client,
        "sample_your_lead": sample_lead,
        "sample_any_client": any_client
    }


@crm_router.get("/stats")
async def get_crm_stats(user: User = Depends(get_current_user)):
    """Get CRM statistics - OPTIMIZED"""
    company_id = user.company_id
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Run all count queries in parallel using asyncio.gather
    import asyncio
    
    results = await asyncio.gather(
        db.clients.count_documents({"company_id": company_id}),
        db.clients.count_documents({"company_id": company_id, "status": "Active"}),
        db.leads.count_documents({"company_id": company_id}),
        db.leads.count_documents({"company_id": company_id, "status": "New"}),
        db.leads.count_documents({"company_id": company_id, "lead_type": "outreach"}),
        db.leads.count_documents({"company_id": company_id, "lead_type": {"$ne": "outreach"}}),
        db.leads.count_documents({
            "company_id": company_id,
            "next_follow_up_date": {"$lte": today},
            "status": {"$nin": ["Converted", "Discarded"]}
        }),
        db.clients.count_documents({
            "company_id": company_id,
            "next_follow_up_date": {"$lte": today}
        })
    )
    
    return {
        "total_clients": results[0],
        "active_clients": results[1],
        "total_leads": results[2],
        "new_leads": results[3],
        "outreach_leads": results[4],
        "inbound_leads": results[5],
        "follow_ups_due": results[6] + results[7]
    }


# ============== CRM ENHANCED VIEWS ==============

@crm_router.get("/outreach")
async def get_outreach_leads(user: User = Depends(get_current_user)):
    """Get outreach leads - proactively contacted by the team"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "lead_type": "outreach"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(2000)
    
    # Sanitize and enrich with owner names
    sanitized = [sanitize_document(lead) for lead in leads]
    return await enrich_leads_with_owner_names(sanitized, user.company_id)


@crm_router.post("/outreach")
async def create_outreach_lead(data: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new outreach lead"""
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    
    lead_data = data.model_dump()
    lead_data.update({
        "lead_id": lead_id,
        "company_id": user.company_id,
        "lead_type": "outreach",
        "source": "Outreach",
        "status": "New",
        "outreach_status": "New",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    })
    
    await db.leads.insert_one(lead_data)
    del lead_data["_id"]
    return lead_data


@crm_router.post("/cleanup-nan-values")
async def cleanup_nan_values(user: User = Depends(get_current_user)):
    """Clean up 'nan' string values from all leads - one-time migration endpoint"""
    # Find all leads with nan values
    leads = await db.leads.find({"company_id": user.company_id}).to_list(5000)
    
    updated_count = 0
    fields_to_check = ["lead_name", "name", "email", "phone", "whatsapp", "company", "company_name", 
                       "address", "rnc", "notes", "message", "event_type", "event_date", "budget_range"]
    
    for lead in leads:
        updates = {}
        for field in fields_to_check:
            if field in lead and isinstance(lead[field], str) and lead[field].lower() in ["nan", "none", "null"]:
                updates[field] = ""
        
        # Also ensure outreach leads have outreach_status
        if lead.get("lead_type") == "outreach" and not lead.get("outreach_status"):
            updates["outreach_status"] = lead.get("status", "New")
        
        if updates:
            await db.leads.update_one(
                {"lead_id": lead["lead_id"]},
                {"$set": updates}
            )
            updated_count += 1
    
    return {"message": f"Cleaned up {updated_count} leads", "updated": updated_count}


@crm_router.put("/outreach/{lead_id}/status")
async def update_outreach_status(lead_id: str, outreach_status: str, user: User = Depends(get_current_user)):
    """Update outreach status for a lead"""
    valid_statuses = ["New", "Contacted", "NoResponse", "Engaged"]
    if outreach_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    now = datetime.now(timezone.utc)
    result = await db.leads.update_one(
        {"lead_id": lead_id, "company_id": user.company_id},
        {"$set": {
            "outreach_status": outreach_status,
            "last_contact_date": now.isoformat() if outreach_status in ["Contacted", "Engaged"] else None,
            "updated_at": now.isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Status updated"}


@crm_router.get("/inbound")
async def get_inbound_leads(user: User = Depends(get_current_user)):
    """Get inbound leads - contacts from forms, email, social"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "lead_type": {"$ne": "outreach"}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(2000)
    
    # Sanitize and enrich with owner names
    sanitized = [sanitize_document(lead) for lead in leads]
    return await enrich_leads_with_owner_names(sanitized, user.company_id)


@crm_router.get("/follow-ups")
async def get_follow_ups(
    user: User = Depends(get_current_user),
    owner_id: Optional[str] = None
):
    """
    Get unified follow-up view across leads and clients.
    
    Filters:
    - owner_id: Filter by specific owner. Use '__unassigned__' for unassigned items.
    
    Permissions:
    - Sales users can only see their own follow-ups (enforced server-side).
    """
    # Permission check - Sales users can only see their own data
    user_role = getattr(user, 'role_id', None)
    if user_role == "sales":
        owner_id = user.user_id  # Force filter to self
    
    # Build lead query
    lead_query = {
        "company_id": user.company_id,
        "next_follow_up_date": {"$ne": None},
        "status": {"$nin": ["Converted", "Discarded"]}
    }
    
    # Build client query
    client_query = {
        "company_id": user.company_id,
        "next_follow_up_date": {"$ne": None}
    }
    
    # Apply owner filter
    if owner_id:
        if owner_id == "__unassigned__":
            lead_query["$or"] = [{"owner_id": None}, {"owner_id": {"$exists": False}}]
            client_query["$or"] = [{"owner_id": None}, {"owner_id": {"$exists": False}}]
        else:
            lead_query["owner_id"] = owner_id
            client_query["owner_id"] = owner_id
    
    # Get leads with follow-ups
    lead_follow_ups = await db.leads.find(lead_query, {"_id": 0}).sort("next_follow_up_date", 1).to_list(200)
    
    # Get clients with follow-ups
    client_follow_ups = await db.clients.find(client_query, {"_id": 0}).sort("next_follow_up_date", 1).to_list(200)
    
    # Combine and normalize
    follow_ups = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Collect unique owner_ids for name resolution
    owner_ids_set = set()
    
    for lead in lead_follow_ups:
        if lead.get("owner_id"):
            owner_ids_set.add(lead["owner_id"])
        follow_ups.append({
            "entity_type": "lead",
            "entity_id": lead["lead_id"],
            "name": lead.get("lead_name") or lead.get("company_name") or lead.get("contact_name"),
            "email": lead.get("email"),
            "phone": lead.get("phone"),
            "follow_up_date": lead.get("next_follow_up_date"),
            "follow_up_type": lead.get("follow_up_type", "Call"),
            "owner_id": lead.get("owner_id"),
            "owner_name": None,  # Will be filled below
            "status": "overdue" if lead.get("next_follow_up_date", "") < today else "pending",
            "source": lead.get("source"),
            "lead_status": lead.get("status")
        })
    
    for client in client_follow_ups:
        if client.get("owner_id"):
            owner_ids_set.add(client["owner_id"])
        follow_ups.append({
            "entity_type": "client",
            "entity_id": client["client_id"],
            "name": client.get("display_name"),
            "email": client.get("email"),
            "phone": client.get("phone"),
            "follow_up_date": client.get("next_follow_up_date"),
            "follow_up_type": client.get("follow_up_type", "CheckIn"),
            "owner_id": client.get("owner_id"),
            "owner_name": None,  # Will be filled below
            "status": "overdue" if client.get("next_follow_up_date", "") < today else "pending",
            "source": "Client",
            "client_status": client.get("status")
        })
    
    # Resolve owner names
    if owner_ids_set:
        owners_data = await db.users.find(
            {"user_id": {"$in": list(owner_ids_set)}},
            {"_id": 0, "user_id": 1, "name": 1}
        ).to_list(100)
        owner_names_map = {o["user_id"]: o.get("name", o["user_id"]) for o in owners_data}
        
        for fu in follow_ups:
            if fu.get("owner_id") and fu["owner_id"] in owner_names_map:
                fu["owner_name"] = owner_names_map[fu["owner_id"]]
    
    # Sort by date
    follow_ups.sort(key=lambda x: x.get("follow_up_date", "9999-12-31"))
    
    return follow_ups


@crm_router.put("/follow-ups/{entity_type}/{entity_id}")
async def update_follow_up(
    entity_type: str, 
    entity_id: str, 
    next_follow_up_date: Optional[str] = None,
    follow_up_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Update follow-up for a lead or client"""
    now = datetime.now(timezone.utc)
    
    update_data = {"updated_at": now.isoformat()}
    if next_follow_up_date is not None:
        update_data["next_follow_up_date"] = next_follow_up_date if next_follow_up_date else None
    if follow_up_type is not None:
        update_data["follow_up_type"] = follow_up_type if follow_up_type else None
    
    if entity_type == "lead":
        result = await db.leads.update_one(
            {"lead_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    elif entity_type == "client":
        result = await db.clients.update_one(
            {"client_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    # Auto-sync to Google Calendar (if configured)
    try:
        from routers.google_calendar import auto_sync_follow_up
        if entity_type == "lead":
            entity = await db.leads.find_one({"lead_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        else:
            entity = await db.clients.find_one({"client_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        if entity:
            await auto_sync_follow_up(user.company_id, entity_type, entity_id, entity)
    except Exception as e:
        print(f"Calendar sync failed (non-blocking): {e}")
    
    return {"message": "Follow-up updated"}


@crm_router.post("/follow-ups/{entity_type}/{entity_id}/complete")
async def complete_follow_up(entity_type: str, entity_id: str, user: User = Depends(get_current_user)):
    """Mark a follow-up as completed"""
    now = datetime.now(timezone.utc)
    
    update_data = {
        "next_follow_up_date": None,
        "follow_up_type": None,
        "last_contact_date": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    if entity_type == "lead":
        result = await db.leads.update_one(
            {"lead_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    elif entity_type == "client":
        result = await db.clients.update_one(
            {"client_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    # Auto-sync to Google Calendar (remove event since follow-up is complete)
    try:
        from routers.google_calendar import auto_sync_follow_up
        if entity_type == "lead":
            entity = await db.leads.find_one({"lead_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        else:
            entity = await db.clients.find_one({"client_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        if entity:
            await auto_sync_follow_up(user.company_id, entity_type, entity_id, entity)
    except Exception as e:
        print(f"Calendar sync failed (non-blocking): {e}")
    
    return {"message": "Follow-up completed"}


# ============== COMMUNICATION LOG ==============

@crm_router.get("/comms/all")
async def get_all_comm_logs(user: User = Depends(get_current_user)):
    """Get all communication logs for the company"""
    logs = await db.comm_logs.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Enrich with entity names and source
    for log in logs:
        if log.get("entity_type") == "lead" and log.get("entity_id"):
            lead = await db.leads.find_one(
                {"lead_id": log["entity_id"]},
                {"_id": 0, "name": 1, "company_name": 1, "contact_name": 1, "source": 1}
            )
            if lead:
                log["entity_name"] = lead.get("company_name") or lead.get("name") or lead.get("contact_name")
                log["entity_source"] = lead.get("source")
        elif log.get("entity_type") == "client" and log.get("entity_id"):
            client = await db.clients.find_one(
                {"client_id": log["entity_id"]},
                {"_id": 0, "name": 1, "company_name": 1}
            )
            if client:
                log["entity_name"] = client.get("company_name") or client.get("name")

    return logs


@crm_router.get("/comms/{entity_type}/{entity_id}")
async def get_comm_logs(entity_type: str, entity_id: str, user: User = Depends(get_current_user)):
    """Get communication logs for a lead or client"""
    logs = await db.comm_logs.find(
        {"company_id": user.company_id, "entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    return logs


# ============== COMMUNICATIONS TIMELINE (Lead/Client specific with history) ==============

@crm_router.get("/leads/{lead_id}/communications")
async def get_lead_communications(lead_id: str, user: User = Depends(get_current_user)):
    """Get all communications for a specific lead"""
    # Verify lead belongs to org
    lead = await db.leads.find_one(
        {"lead_id": lead_id, "company_id": user.company_id},
        {"_id": 0, "lead_id": 1}
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    logs = await db.comm_logs.find(
        {"company_id": user.company_id, "entity_type": "lead", "entity_id": lead_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    return logs


@crm_router.get("/clients/{client_id}/communications")
async def get_client_communications(client_id: str, user: User = Depends(get_current_user)):
    """
    Get all communications for a client, INCLUDING historical lead communications
    if the client was converted from a lead.
    """
    # Get client with source_lead_id
    client = await db.clients.find_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0, "client_id": 1, "source_lead_id": 1, "display_name": 1}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    source_lead_id = client.get("source_lead_id")
    
    # Build query to get client comms AND lead comms if source_lead exists
    if source_lead_id:
        query = {
            "company_id": user.company_id,
            "$or": [
                {"entity_type": "client", "entity_id": client_id},
                {"entity_type": "lead", "entity_id": source_lead_id}
            ]
        }
    else:
        query = {
            "company_id": user.company_id,
            "entity_type": "client",
            "entity_id": client_id
        }
    
    logs = await db.comm_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Add source info to response
    for log in logs:
        if log.get("entity_type") == "lead":
            log["from_source_lead"] = True
    
    return {
        "communications": logs,
        "source_lead_id": source_lead_id,
        "client_id": client_id
    }


@crm_router.post("/comms")
async def create_comm_log(data: CommLogCreate, user: User = Depends(get_current_user)):
    """Create a communication log entry"""
    now = datetime.now(timezone.utc)
    log_id = f"comm_{uuid.uuid4().hex[:12]}"
    
    # Get owner name
    owner_name = None
    if user.user_id:
        user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
        owner_name = user_doc.get("name") if user_doc else None
    
    log_data = {
        "log_id": log_id,
        "company_id": user.company_id,
        "entity_type": data.entity_type,
        "entity_id": data.entity_id,
        "comm_type": data.comm_type,
        "subject": data.subject,
        "content": data.content,
        "direction": data.direction,
        "owner_id": user.user_id,
        "owner_name": owner_name,
        "created_at": now.isoformat()
    }
    
    await db.comm_logs.insert_one(log_data)
    del log_data["_id"]
    
    # Update last contact date
    if data.entity_type == "lead":
        await db.leads.update_one(
            {"lead_id": data.entity_id, "company_id": user.company_id},
            {"$set": {"last_contact_date": now.isoformat(), "updated_at": now.isoformat()}}
        )
    elif data.entity_type == "client":
        await db.clients.update_one(
            {"client_id": data.entity_id, "company_id": user.company_id},
            {"$set": {"last_contact_date": now.isoformat(), "updated_at": now.isoformat()}}
        )
    
    return log_data


# ============== OWNER ASSIGNMENT ==============

@crm_router.put("/assign/{entity_type}/{entity_id}")
async def assign_owner(entity_type: str, entity_id: str, owner_id: str, user: User = Depends(get_current_user)):
    """Assign an owner to a lead or client"""
    now = datetime.now(timezone.utc)
    
    if entity_type == "lead":
        result = await db.leads.update_one(
            {"lead_id": entity_id, "company_id": user.company_id},
            {"$set": {"owner_id": owner_id, "updated_at": now.isoformat()}}
        )
    elif entity_type == "client":
        result = await db.clients.update_one(
            {"client_id": entity_id, "company_id": user.company_id},
            {"$set": {"owner_id": owner_id, "updated_at": now.isoformat()}}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    return {"message": "Owner assigned"}


@crm_router.get("/by-owner/{owner_id}")
async def get_by_owner(owner_id: str, user: User = Depends(get_current_user)):
    """Get all leads and clients assigned to a specific owner"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "owner_id": owner_id},
        {"_id": 0}
    ).to_list(500)
    
    clients = await db.clients.find(
        {"company_id": user.company_id, "owner_id": owner_id},
        {"_id": 0}
    ).to_list(500)
    
    return {"leads": leads, "clients": clients}


# ============== CLIENTS WITH EVENT HISTORY ==============

@crm_router.get("/clients-with-events")
async def get_clients_with_events(user: User = Depends(get_current_user)):
    """Get clients with their event history, contacts and credit info - OPTIMIZED"""
    # Get all clients
    clients = await db.clients.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    
    if not clients:
        return []
    
    # Sanitize all clients first
    clients = [sanitize_document(c) for c in clients]
    
    # Get all client IDs
    client_ids = [c["client_id"] for c in clients]
    
    # BATCH: Get all events for all clients in ONE query
    all_events = await db.events.find(
        {"client_id": {"$in": client_ids}, "company_id": user.company_id},
        {"_id": 0, "event_id": 1, "client_id": 1, "name": 1, "event_date": 1, "stage": 1, "status": 1, "ordered_by": 1, "contact_person": 1, "event_type": 1}
    ).sort("event_date", -1).to_list(1000)
    
    # Group events by client_id
    events_by_client = {}
    event_ids = []
    for event in all_events:
        cid = event["client_id"]
        if cid not in events_by_client:
            events_by_client[cid] = []
        events_by_client[cid].append(event)
        event_ids.append(event["event_id"])
    
    # BATCH: Get all proposals for all events in ONE query
    all_proposals = await db.proposals.find(
        {"event_id": {"$in": event_ids}},
        {"_id": 0, "event_id": 1, "final_total": 1}
    ).to_list(1000)
    
    # Map proposals by event_id
    proposals_by_event = {p["event_id"]: p for p in all_proposals}
    
    # BATCH: Get all unpaid invoices for all events in ONE query
    all_invoices = await db.invoices.find(
        {"event_id": {"$in": event_ids}, "status": {"$ne": "paid"}},
        {"_id": 0, "event_id": 1, "total": 1}
    ).to_list(1000)
    
    # Map invoices by event_id
    invoices_by_event = {i["event_id"]: i for i in all_invoices}
    
    # Enrich clients with pre-fetched data
    for client in clients:
        # Ensure status field exists
        if "status" not in client:
            client["status"] = "Active"
        
        # Ensure display_name exists
        if not client.get("display_name"):
            client["display_name"] = client.get("name") or client.get("company_name") or client.get("client_name") or ""
        
        # Ensure client_type exists
        if not client.get("client_type"):
            client["client_type"] = "Company" if client.get("company_name") else "Individual"
        
        # Get events from pre-fetched data
        client_events = events_by_client.get(client["client_id"], [])[:50]
        client["events"] = client_events
        client["events_count"] = len(client_events)
        
        # Calculate lifetime value and credit used from pre-fetched data
        total_value = 0
        credit_used = 0
        for event in client_events:
            proposal = proposals_by_event.get(event["event_id"])
            if proposal:
                total_value += sanitize_float(proposal.get("final_total", 0), 0)
            
            # Check unpaid invoices for credit used
            if client.get("has_credit"):
                invoice = invoices_by_event.get(event["event_id"])
                if invoice:
                    credit_used += sanitize_float(invoice.get("total", 0), 0)
        
        client["lifetime_value"] = sanitize_float(total_value, 0)
        client["credit_used"] = sanitize_float(credit_used, 0)
        
        # Calculate credit percentage (avoid division by zero)
        credit_limit = sanitize_float(client.get("credit_limit", 0), 0)
        if client.get("has_credit") and credit_limit > 0:
            client["credit_percentage"] = round(sanitize_float((credit_used / credit_limit) * 100, 0), 1)
        else:
            client["credit_percentage"] = 0
        
        # Get last event date
        if client_events:
            client["last_event_date"] = client_events[0].get("event_date")
        
        # Get contacts for this client (especially important for companies)
        contacts = await db.contacts.find(
            {"client_id": client["client_id"], "company_id": user.company_id},
            {"_id": 0}
        ).to_list(50)
        client["contacts"] = contacts
    
    return clients


# ============== CONTACTS ROUTES ==============

@contacts_router.get("")
async def get_contacts(user: User = Depends(get_current_user), client_id: Optional[str] = None):
    """Get contacts, optionally filtered by client"""
    query = {"company_id": user.company_id}
    if client_id:
        query["client_id"] = client_id
    
    contacts = await db.contacts.find(query, {"_id": 0}).to_list(1000)
    for contact in contacts:
        if contact.get("created_at") and isinstance(contact["created_at"], str):
            contact["created_at"] = datetime.fromisoformat(contact["created_at"])
    return contacts


@contacts_router.post("")
async def create_contact(data: ContactCreate, user: User = Depends(get_current_user)):
    """Create a new contact"""
    # Verify client exists
    client = await db.clients.find_one({"client_id": data.client_id, "company_id": user.company_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    now = datetime.now(timezone.utc)
    contact_id = f"contact_{uuid.uuid4().hex[:12]}"
    
    # If this is primary, unset other primary contacts
    if data.is_primary:
        await db.contacts.update_many(
            {"client_id": data.client_id},
            {"$set": {"is_primary": False}}
        )
    
    contact_doc = {
        "contact_id": contact_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.contacts.insert_one(contact_doc)
    del contact_doc["_id"]
    contact_doc["created_at"] = now
    return contact_doc


@contacts_router.get("/{contact_id}")
async def get_contact(contact_id: str, user: User = Depends(get_current_user)):
    """Get a specific contact"""
    contact = await db.contacts.find_one({"contact_id": contact_id, "company_id": user.company_id}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if contact.get("created_at") and isinstance(contact["created_at"], str):
        contact["created_at"] = datetime.fromisoformat(contact["created_at"])
    return contact


@contacts_router.put("/{contact_id}")
async def update_contact(contact_id: str, data: ContactCreate, user: User = Depends(get_current_user)):
    """Update a contact"""
    contact = await db.contacts.find_one({"contact_id": contact_id, "company_id": user.company_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # If setting as primary, unset other primary contacts
    if data.is_primary:
        await db.contacts.update_many(
            {"client_id": data.client_id, "contact_id": {"$ne": contact_id}},
            {"$set": {"is_primary": False}}
        )
    
    await db.contacts.update_one(
        {"contact_id": contact_id},
        {"$set": data.model_dump()}
    )
    return await get_contact(contact_id, user)


@contacts_router.delete("/{contact_id}")
async def delete_contact(contact_id: str, user: User = Depends(get_current_user)):
    """Delete a contact"""
    result = await db.contacts.delete_one({"contact_id": contact_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}


# ============== LEAD FORMS ROUTES ==============

@lead_forms_router.get("")
async def get_lead_forms(user: User = Depends(get_current_user)):
    """Get all lead forms"""
    forms = await db.lead_forms.find({"company_id": user.company_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for form in forms:
        for field in ["created_at", "updated_at"]:
            if form.get(field) and isinstance(form[field], str):
                form[field] = datetime.fromisoformat(form[field])
    return forms


@lead_forms_router.post("")
async def create_lead_form(data: LeadFormCreate, user: User = Depends(get_current_user)):
    """Create a new lead form"""
    now = datetime.now(timezone.utc)
    form_id = f"form_{uuid.uuid4().hex[:12]}"
    
    form_doc = {
        "form_id": form_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "submissions_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.lead_forms.insert_one(form_doc)
    del form_doc["_id"]
    form_doc["created_at"] = now
    form_doc["updated_at"] = now
    return form_doc


@lead_forms_router.get("/{form_id}")
async def get_lead_form(form_id: str, user: User = Depends(get_current_user)):
    """Get a specific lead form"""
    form = await db.lead_forms.find_one({"form_id": form_id, "company_id": user.company_id}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Lead form not found")
    for field in ["created_at", "updated_at"]:
        if form.get(field) and isinstance(form[field], str):
            form[field] = datetime.fromisoformat(form[field])
    return form


@lead_forms_router.put("/{form_id}")
async def update_lead_form(form_id: str, data: LeadFormCreate, user: User = Depends(get_current_user)):
    """Update a lead form"""
    now = datetime.now(timezone.utc)
    result = await db.lead_forms.update_one(
        {"form_id": form_id, "company_id": user.company_id},
        {"$set": {**data.model_dump(), "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead form not found")
    return await get_lead_form(form_id, user)


@lead_forms_router.delete("/{form_id}")
async def delete_lead_form(form_id: str, user: User = Depends(get_current_user)):
    """Delete a lead form"""
    result = await db.lead_forms.delete_one({"form_id": form_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead form not found")
    return {"message": "Lead form deleted"}


# ============== PUBLIC LEAD FORM SUBMISSION ==============

@lead_forms_router.get("/{form_id}/public")
async def get_public_lead_form(form_id: str):
    """Get public lead form configuration (no auth required)"""
    form = await db.lead_forms.find_one({"form_id": form_id, "is_active": True}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or inactive")
    
    # Get company info for logo
    company = await db.companies.find_one({"company_id": form["company_id"]}, {"_id": 0, "name": 1, "logo_url": 1, "primary_color": 1})
    
    # Return only public-safe fields
    return {
        "form_id": form["form_id"],
        "form_name": form["form_name"],
        "description": form.get("description"),
        "description_es": form.get("description_es"),
        "fields": form.get("fields", []),
        "custom_fields": form.get("custom_fields", []),
        "default_event_type": form.get("default_event_type"),
        "thank_you_message_en": form.get("thank_you_message_en", form.get("thank_you_message", "Thank you for your inquiry!")),
        "thank_you_message_es": form.get("thank_you_message_es", "¡Gracias por tu consulta! Te contactaremos pronto."),
        "banner_url": form.get("banner_url"),
        "show_logo": form.get("show_logo", True),
        "primary_color": form.get("primary_color") or (company.get("primary_color") if company else None),
        "company_name": company.get("name") if company else None,
        "company_logo": company.get("logo_url") if company and form.get("show_logo", True) else None
    }


@lead_forms_router.post("/{form_id}/submit")
async def submit_lead_form(form_id: str, data: dict, campaign_code: Optional[str] = None):
    """Submit a lead form (no auth required - public endpoint)
    
    Campaign tracking: pass campaign_code as query param or in body
    Example: POST /lead-forms/{form_id}/submit?campaign_code=TASTE-SJ-2026
    """
    form = await db.lead_forms.find_one({"form_id": form_id, "is_active": True}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or inactive")
    
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    company_id = form["company_id"]
    
    # Campaign auto-link: check query param first, then body
    tracking_code = campaign_code or data.get("campaign_code")
    linked_campaign_id = None
    attribution_source = None
    
    if tracking_code:
        linked_campaign_id = await resolve_campaign_from_code(company_id, tracking_code)
        if linked_campaign_id:
            attribution_source = "link"
    
    # Create lead from form submission
    lead_doc = {
        "lead_id": lead_id,
        "company_id": company_id,
        "lead_name": data.get("lead_name", data.get("name", "")),
        "email": data.get("email", ""),
        "phone": data.get("phone"),
        "whatsapp": data.get("whatsapp"),
        "company_name": data.get("company_name"),
        "event_type": data.get("event_type", form.get("default_event_type", "other")),
        "event_date": data.get("event_date"),
        "estimated_guest_count": data.get("estimated_guest_count") or data.get("guest_count"),
        "budget_range": data.get("budget_range"),
        "message": data.get("message", data.get("notes", "")),
        "source": form.get("default_source", "Website"),
        "form_name": form["form_name"],
        "status": "New",
        "lead_type": "inbound",
        "owner_id": form.get("assign_owner_id"),
        # Campaign tracking
        "campaign_id": linked_campaign_id,
        "attribution_source": attribution_source,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.leads.insert_one(lead_doc)
    
    # Increment campaign leads_linked counter if auto-linked
    if linked_campaign_id:
        await increment_campaign_leads_linked(linked_campaign_id)
    
    # Update form submission count
    await db.lead_forms.update_one(
        {"form_id": form_id},
        {"$inc": {"submissions_count": 1}}
    )
    
    return {
        "success": True,
        "message": form.get("thank_you_message", "Thank you for your inquiry!"),
        "lead_id": lead_id,
        "campaign_id": linked_campaign_id  # Confirms auto-link if happened
    }


# ============== TEAM MEMBERS FOR ASSIGNMENT ==============

@crm_router.get("/team-members")
async def get_team_members(user: User = Depends(get_current_user)):
    """Get all active team members for owner assignment dropdown"""
    users = await db.users.find(
        {"company_id": user.company_id, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role_id": 1}
    ).to_list(100)
    
    # Ensure each user has a display name
    for u in users:
        if not u.get("name"):
            # Use email username as fallback
            email = u.get("email", "")
            if email and "@" in email:
                u["name"] = email.split("@")[0].replace(".", " ").title()
            else:
                u["name"] = f"User {u.get('user_id', '')[-6:]}"
    
    return users


# ============== PIPELINE STAGES (CUSTOMIZABLE PER ORG) ==============

DEFAULT_PIPELINE_STAGES = [
    {"id": "new", "name": "New", "name_es": "Nuevo", "color": "#3B82F6", "order": 1},
    {"id": "contacted", "name": "Contacted", "name_es": "Contactado", "color": "#F59E0B", "order": 2},
    {"id": "qualified", "name": "Qualified", "name_es": "Calificado", "color": "#8B5CF6", "order": 3},
    {"id": "proposal", "name": "Proposal", "name_es": "Propuesta", "color": "#EC4899", "order": 4},
    {"id": "negotiation", "name": "Negotiation", "name_es": "Negociación", "color": "#F97316", "order": 5},
    {"id": "won", "name": "Won", "name_es": "Ganado", "color": "#22C55E", "order": 6},
    {"id": "lost", "name": "Lost", "name_es": "Perdido", "color": "#EF4444", "order": 7},
]


@crm_router.get("/pipeline-stages")
async def get_pipeline_stages(user: User = Depends(get_current_user)):
    """Get pipeline stages for the organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return DEFAULT_PIPELINE_STAGES
    
    # Check if org has custom stages
    config = await db.crm_pipeline_config.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    if config and config.get("stages"):
        return config["stages"]
    
    return DEFAULT_PIPELINE_STAGES


@crm_router.put("/pipeline-stages")
async def update_pipeline_stages(data: dict, user: User = Depends(get_current_user)):
    """Update pipeline stages for the organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    stages = data.get("stages", [])
    
    # Validate stages
    if not stages or not isinstance(stages, list):
        raise HTTPException(status_code=400, detail="stages must be a non-empty array")
    
    for i, stage in enumerate(stages):
        if not stage.get("id") or not stage.get("name"):
            raise HTTPException(status_code=400, detail=f"Stage {i} missing id or name")
        # Ensure order
        stage["order"] = i + 1
    
    now = datetime.now(timezone.utc)
    
    await db.crm_pipeline_config.update_one(
        {"company_id": company_id},
        {"$set": {
            "company_id": company_id,
            "stages": stages,
            "updated_at": now.isoformat(),
            "updated_by": user.user_id
        }},
        upsert=True
    )
    
    return {"success": True, "stages": stages}


@crm_router.post("/pipeline-stages/reset")
async def reset_pipeline_stages(user: User = Depends(get_current_user)):
    """Reset pipeline stages to defaults"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    await db.crm_pipeline_config.delete_one({"company_id": company_id})
    
    return {"success": True, "stages": DEFAULT_PIPELINE_STAGES}


@crm_router.get("/leads/by-stage")
async def get_leads_by_stage(user: User = Depends(get_current_user)):
    """Get leads grouped by pipeline stage for Kanban view"""
    import math
    
    def clean_nan_values(obj):
        """Recursively clean NaN and Inf values from dict/list"""
        if isinstance(obj, dict):
            return {k: clean_nan_values(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean_nan_values(item) for item in obj]
        elif isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                return None
            return obj
        return obj
    
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"stages": DEFAULT_PIPELINE_STAGES, "leads_by_stage": {}}
    
    # Get stages
    config = await db.crm_pipeline_config.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    stages = config["stages"] if config and config.get("stages") else DEFAULT_PIPELINE_STAGES
    
    # Get all active leads (not converted or discarded)
    leads = await db.leads.find(
        {
            "company_id": company_id,
            "status": {"$nin": ["Converted", "Discarded"]}
        },
        {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    
    # Clean NaN values
    leads = [clean_nan_values(lead) for lead in leads]
    
    # Group by pipeline_stage (fallback to status mapping)
    leads_by_stage = {stage["id"]: [] for stage in stages}
    
    # Status to stage mapping for backward compatibility
    status_to_stage = {
        "new": "new",
        "contacted": "contacted",
        "noresponse": "new",  # No response goes back to queue
        "engaged": "qualified",
        "qualified": "qualified",
        "proposal": "proposal",
        "negotiation": "negotiation",
        "won": "won",
        "lost": "lost"
    }
    
    for lead in leads:
        # Use pipeline_stage if set, otherwise map from status
        stage_id = lead.get("pipeline_stage")
        if not stage_id:
            status = (lead.get("outreach_status") or lead.get("status") or "new").lower()
            stage_id = status_to_stage.get(status, "new")
        
        if stage_id in leads_by_stage:
            leads_by_stage[stage_id].append(lead)
        else:
            # If stage doesn't exist, put in first stage
            first_stage = stages[0]["id"] if stages else "new"
            if first_stage in leads_by_stage:
                leads_by_stage[first_stage].append(lead)
    
    return {
        "stages": stages,
        "leads_by_stage": leads_by_stage
    }


@crm_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Delete a single lead with audit logging"""
    company_id = user.company_id or user.active_org_id
    
    # Find the lead first
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Log the deletion for audit purposes
    deletion_log = {
        "log_id": f"del_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{lead_id[-6:]}",
        "action": "lead_deleted",
        "lead_id": lead_id,
        "lead_data": {
            "lead_name": lead.get("lead_name"),
            "company_name": lead.get("company_name"),
            "email": lead.get("email"),
            "lead_type": lead.get("lead_type")
        },
        "deleted_by": user.user_id,
        "deleted_by_name": user.name or user.email,
        "company_id": company_id,
        "deleted_at": datetime.utcnow()
    }
    await db.audit_logs.insert_one(deletion_log)
    
    # Delete the lead
    result = await db.leads.delete_one({"lead_id": lead_id, "company_id": company_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"success": True, "message": "Lead deleted", "lead_id": lead_id}


@crm_router.patch("/leads/{lead_id}/stage")
async def update_lead_stage(lead_id: str, data: dict, user: User = Depends(get_current_user)):
    """Move a lead to a different pipeline stage"""
    company_id = user.company_id or user.active_org_id
    stage_id = data.get("stage_id")
    
    if not stage_id:
        raise HTTPException(status_code=400, detail="stage_id is required")
    
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    now = datetime.now(timezone.utc)
    
    # Update lead
    update_data = {
        "pipeline_stage": stage_id,
        "updated_at": now.isoformat()
    }
    
    # Also update status for backward compatibility
    stage_to_status = {
        "new": "New",
        "contacted": "Contacted",
        "qualified": "Engaged",
        "proposal": "Engaged",
        "negotiation": "Engaged",
        "won": "Converted",
        "lost": "Discarded"
    }
    if stage_id in stage_to_status:
        update_data["status"] = stage_to_status[stage_id]
        update_data["outreach_status"] = stage_to_status[stage_id]
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": update_data}
    )
    
    # Log activity
    await log_activity(
        db, company_id, user.user_id,
        "lead_stage_changed",
        f"Lead {lead.get('lead_name', lead_id)} moved to {stage_id}",
        {"lead_id": lead_id, "from_stage": lead.get("pipeline_stage"), "to_stage": stage_id}
    )
    
    return {"success": True, "lead_id": lead_id, "stage_id": stage_id}


# ============== LEAD OWNER ASSIGNMENT (New Endpoint per spec) ==============

@crm_router.patch("/leads/{lead_id}/owner")
async def patch_lead_owner(
    lead_id: str,
    data: dict,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """
    Assign or unassign owner to a lead.
    Body: { owner_id: string | null }
    
    Permissions:
    - Admin/Owner: Can assign anyone
    - Sales: Can only assign self or unassign (null)
    
    Sends email notification to the new owner.
    """
    owner_id = data.get("owner_id")
    
    # Find the lead
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Validate owner_id if provided
    target_user = None
    if owner_id:
        target_user = await db.users.find_one({
            "user_id": owner_id, 
            "company_id": user.company_id,
            "is_active": {"$ne": False}
        })
        if not target_user:
            raise HTTPException(status_code=400, detail="Invalid owner_id or user not active")
        
        # Permission check for Sales role
        user_role = user.role_id if hasattr(user, 'role_id') else None
        if user_role == "sales" and owner_id != user.user_id:
            raise HTTPException(status_code=403, detail="Sales users can only assign leads to themselves")
    
    # Get previous owner for audit
    previous_owner_id = lead.get("owner_id")
    
    # Update lead
    now = datetime.now(timezone.utc)
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"owner_id": owner_id, "updated_at": now.isoformat()}}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "lead_owner_assigned",
        "entity_type": "lead",
        "entity_id": lead_id,
        "meta": {
            "from_owner_id": previous_owner_id,
            "to_owner_id": owner_id
        },
        "created_at": now.isoformat()
    })
    
    # Send email notification to new owner (in background)
    if owner_id and target_user and target_user.get("email"):
        # Get assigner name
        assigner_name = user.name if hasattr(user, 'name') and user.name else user.email
        
        # Get company name
        company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0, "name": 1})
        company_name = company.get("name", "Kora OS") if company else "Kora OS"
        
        # Lead info
        lead_name = lead.get("company_name") or lead.get("name") or lead.get("contact_name") or lead.get("lead_name") or "Nuevo Lead"
        lead_source = lead.get("source") or lead.get("lead_type", "").title() or "CRM"
        
        background_tasks.add_task(
            send_lead_assignment_notification,
            owner_email=target_user.get("email"),
            owner_name=target_user.get("name", target_user.get("email")),
            lead_name=lead_name,
            lead_email=lead.get("email"),
            lead_phone=lead.get("phone"),
            lead_source=lead_source,
            assigned_by=assigner_name,
            company_name=company_name
        )
    
    return {"success": True, "lead_id": lead_id, "owner_id": owner_id, "notification_sent": bool(owner_id and target_user)}


# ============== SALES REPORT ENDPOINT ==============

@crm_router.get("/reports/owners")
async def get_owners_sales_report(
    user: User = Depends(get_current_user),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    owner_id: Optional[str] = None,
    include_unassigned: bool = True
):
    """
    Sales performance report grouped by owner.
    
    Filters:
    - date_from, date_to: Filter by lead created_at
    - owner_id: Filter by specific owner (Sales can only see their own)
    - include_unassigned: Include leads without owner (default true)
    
    Returns metrics per owner:
    - total_leads, nuevos, trabajados, contactados, sin_respuesta, interesados, convertidos
    - tasa_contacto, tasa_conversion
    """
    # Permission check - Sales users can only see their own data
    user_role = getattr(user, 'role_id', None)
    if user_role == "sales":
        owner_id = user.user_id  # Force filter to self
    
    # Build base query
    query = {"company_id": user.company_id}
    
    # Date filters
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to + "T23:59:59"
        query["created_at"] = date_filter
    
    # Fetch all leads matching criteria
    leads = await db.leads.find(query, {"_id": 0}).to_list(10000)
    
    # Define CRM statuses as per spec
    STATUS_NUEVO = "Nuevo"
    STATUS_CONTACTADO = "Contactado"
    STATUS_SIN_RESPUESTA = "Sin Respuesta"
    STATUS_INTERESADO = "Interesado"
    STATUS_CONVERTIDO = "Converted"
    
    # Group by owner
    owner_stats = {}
    
    for lead in leads:
        lead_owner = lead.get("owner_id") or "__unassigned__"
        
        # Skip unassigned if not included
        if lead_owner == "__unassigned__" and not include_unassigned:
            continue
        
        # Skip if filtering by specific owner
        if owner_id and lead_owner != owner_id and lead_owner != "__unassigned__":
            continue
        
        if lead_owner not in owner_stats:
            owner_stats[lead_owner] = {
                "owner_id": lead_owner if lead_owner != "__unassigned__" else None,
                "owner_name": None,
                "total_leads": 0,
                "nuevos": 0,
                "trabajados": 0,
                "contactados": 0,
                "sin_respuesta": 0,
                "interesados": 0,
                "convertidos": 0
            }
        
        stats = owner_stats[lead_owner]
        stats["total_leads"] += 1
        
        status = lead.get("status", "")
        
        if status == STATUS_NUEVO:
            stats["nuevos"] += 1
        elif status == STATUS_CONTACTADO:
            stats["contactados"] += 1
            stats["trabajados"] += 1
        elif status == STATUS_SIN_RESPUESTA:
            stats["sin_respuesta"] += 1
            stats["trabajados"] += 1
        elif status == STATUS_INTERESADO:
            stats["interesados"] += 1
            stats["trabajados"] += 1
        elif status == STATUS_CONVERTIDO:
            stats["convertidos"] += 1
    
    # Fetch owner names
    owner_ids = [oid for oid in owner_stats.keys() if oid != "__unassigned__"]
    if owner_ids:
        users_data = await db.users.find(
            {"user_id": {"$in": owner_ids}},
            {"_id": 0, "user_id": 1, "name": 1}
        ).to_list(100)
        user_names = {u["user_id"]: u.get("name", u["user_id"]) for u in users_data}
        
        for oid in owner_stats:
            if oid != "__unassigned__":
                owner_stats[oid]["owner_name"] = user_names.get(oid, oid)
    
    # Set name for unassigned
    if "__unassigned__" in owner_stats:
        owner_stats["__unassigned__"]["owner_name"] = "Sin Asignar"
    
    # Calculate derived metrics
    result = []
    for stats in owner_stats.values():
        total = stats["total_leads"]
        stats["tasa_contacto"] = round((stats["contactados"] / total * 100), 1) if total > 0 else 0
        stats["tasa_conversion"] = round((stats["convertidos"] / total * 100), 1) if total > 0 else 0
        result.append(stats)
    
    # Sort by convertidos desc, then interesados desc
    result.sort(key=lambda x: (-x["convertidos"], -x["interesados"]))
    
    # Calculate totals
    totals = {
        "total_leads": sum(r["total_leads"] for r in result),
        "nuevos": sum(r["nuevos"] for r in result),
        "trabajados": sum(r["trabajados"] for r in result),
        "contactados": sum(r["contactados"] for r in result),
        "sin_respuesta": sum(r["sin_respuesta"] for r in result),
        "interesados": sum(r["interesados"] for r in result),
        "convertidos": sum(r["convertidos"] for r in result)
    }
    totals["tasa_contacto"] = round((totals["contactados"] / totals["total_leads"] * 100), 1) if totals["total_leads"] > 0 else 0
    totals["tasa_conversion"] = round((totals["convertidos"] / totals["total_leads"] * 100), 1) if totals["total_leads"] > 0 else 0
    
    return {
        "owners": result,
        "totals": totals
    }


# ============== LEADS FOR COMMS DROPDOWN ==============

@crm_router.get("/leads-for-comms")
async def get_leads_for_comms(user: User = Depends(get_current_user)):
    """Get simplified list of leads for comms dropdown selection"""
    # Get outreach leads
    outreach = await db.leads.find(
        {"company_id": user.company_id, "lead_type": "outreach"},
        {"_id": 0, "lead_id": 1, "name": 1, "company_name": 1, "contact_name": 1, "lead_type": 1}
    ).sort("created_at", -1).to_list(200)
    
    # Get inbound leads
    inbound = await db.leads.find(
        {"company_id": user.company_id, "lead_type": {"$ne": "outreach"}},
        {"_id": 0, "lead_id": 1, "name": 1, "company_name": 1, "contact_name": 1, "lead_type": 1}
    ).sort("created_at", -1).to_list(200)
    
    result = []
    for lead in outreach:
        result.append({
            "lead_id": lead["lead_id"],
            "name": lead.get("company_name") or lead.get("name") or lead.get("contact_name") or lead["lead_id"],
            "source": "Outreach"
        })
    for lead in inbound:
        result.append({
            "lead_id": lead["lead_id"],
            "name": lead.get("company_name") or lead.get("name") or lead.get("contact_name") or lead["lead_id"],
            "source": "Inbound"
        })
    
    return result


# ============== WEBHOOKS - EXTERNAL INTEGRATIONS ==============
# These endpoints allow external services like Zapier/Make to send leads

@webhooks_router.post("/leads/{company_slug}")
async def webhook_create_lead(company_slug: str, data: dict, campaign_code: Optional[str] = None):
    """
    Public webhook to receive leads from external sources (Zapier, Make, Meta Lead Ads, etc.)
    
    URL: POST /api/webhooks/leads/{company_slug}?campaign_code=OPTIONAL
    
    The company_slug identifies which organization receives the lead.
    Campaign auto-linking works if campaign_code is provided (query param or body).
    
    Expected body (all fields optional except email):
    {
        "email": "required@example.com",
        "name": "John Doe",
        "phone": "+1234567890",
        "company_name": "Acme Inc",
        "message": "Interested in your services",
        "source": "Meta Lead Ads",
        "campaign_code": "CAM-XXXXX",
        "custom_fields": { ... }
    }
    
    Returns:
    {
        "success": true,
        "lead_id": "lead_xxx",
        "campaign_id": "camp_xxx" (if auto-linked),
        "message": "Lead created successfully"
    }
    """
    # Find company by slug
    company = await db.companies.find_one(
        {"$or": [
            {"slug": company_slug},
            {"company_id": company_slug}
        ]},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    company_id = company["company_id"]
    
    # Validate email is provided
    email = data.get("email", "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    
    # Campaign auto-link: check query param first, then body
    tracking_code = campaign_code or data.get("campaign_code")
    linked_campaign_id = None
    attribution_source = None
    
    if tracking_code:
        linked_campaign_id = await resolve_campaign_from_code(company_id, tracking_code)
        if linked_campaign_id:
            attribution_source = "link"
    
    # Determine source
    source = data.get("source", "Webhook")
    if "meta" in source.lower() or "facebook" in source.lower():
        attribution_source = attribution_source or "link"
    
    # Build lead document
    lead_doc = {
        "lead_id": lead_id,
        "company_id": company_id,
        "lead_name": data.get("name") or data.get("lead_name") or data.get("full_name") or "",
        "email": email,
        "phone": data.get("phone") or data.get("phone_number"),
        "whatsapp": data.get("whatsapp"),
        "company_name": data.get("company_name") or data.get("company"),
        "event_type": data.get("event_type", "other"),
        "event_date": data.get("event_date"),
        "estimated_guest_count": data.get("guest_count") or data.get("estimated_guest_count"),
        "budget_range": data.get("budget_range") or data.get("budget"),
        "message": data.get("message") or data.get("notes") or data.get("comments"),
        "source": source,
        "status": "New",
        "lead_type": "inbound",
        # Campaign tracking
        "campaign_id": linked_campaign_id,
        "attribution_source": attribution_source,
        # Webhook metadata
        "webhook_source": data.get("webhook_source", "external"),
        "raw_data": {k: v for k, v in data.items() if k not in ["email", "name", "phone", "message"]},
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.leads.insert_one(lead_doc)
    
    # Increment campaign leads_linked counter if auto-linked
    if linked_campaign_id:
        await increment_campaign_leads_linked(linked_campaign_id)
    
    return {
        "success": True,
        "lead_id": lead_id,
        "campaign_id": linked_campaign_id,
        "message": "Lead created successfully"
    }


@webhooks_router.get("/test/{company_slug}")
async def webhook_test(company_slug: str):
    """
    Test endpoint to verify webhook is accessible and company_slug is valid.
    Use this URL in Zapier/Make to test the connection.
    """
    company = await db.companies.find_one(
        {"$or": [
            {"slug": company_slug},
            {"company_id": company_slug}
        ]},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    return {
        "success": True,
        "message": "Webhook is ready to receive leads",
        "company_name": company.get("name"),
        "endpoint": f"/api/webhooks/leads/{company_slug}",
        "method": "POST",
        "example_body": {
            "email": "lead@example.com",
            "name": "John Doe",
            "phone": "+1234567890",
            "source": "Meta Lead Ads",
            "campaign_code": "CAM-XXXXX"
        }
    }
