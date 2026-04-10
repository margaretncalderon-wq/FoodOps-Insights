# routers/crm.py - CRM module routes
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from datetime import datetime, timezone, timedelta
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
from routers.notifications import create_notification


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
        {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
    ).to_list(100)
    
    # Build lookup dict
    user_map = {}
    for u in users:
        name = u.get("name")
        if not name:
            first = u.get("first_name") or ""
            last = u.get("last_name") or ""
            name = f"{first} {last}".strip()
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
        "client_type", "industry", "rnc", "address", "city", "country", "message", "notes", "owner_id", "event_type",
        "estimated_value", "budget_range", "guest_count", "event_date", "source", "lead_type"
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
async def convert_lead(lead_id: str, request: Request, user: User = Depends(get_current_user)):
    """Convert a lead to Client, optionally with Event (new or existing)"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Lead already converted")
    
    # Parse body
    try:
        body = await request.json()
    except:
        body = {}
    
    create_event = body.get("create_event", False)
    existing_event_id = body.get("existing_event_id")  # Link to existing event
    
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
        owner_doc = await db.users.find_one({"user_id": lead_owner_id}, {"_id": 0, "name": 1, "first_name": 1, "last_name": 1, "email": 1})
        if owner_doc:
            owner_name = owner_doc.get("name")
            if not owner_name:
                first = owner_doc.get("first_name") or ""
                last = owner_doc.get("last_name") or ""
                owner_name = f"{first} {last}".strip()
            if not owner_name:
                email = owner_doc.get("email", "")
                owner_name = email.split("@")[0].replace(".", " ").title() if email else None
    
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
    
    # Event handling: 3 modes
    event_id = None
    
    if existing_event_id:
        # Mode 1: Link to existing event
        existing_event = await db.events.find_one(
            {"event_id": existing_event_id, "company_id": user.company_id},
            {"_id": 0, "event_id": 1}
        )
        if existing_event:
            event_id = existing_event_id
            # Update event with client_id if not set
            await db.events.update_one(
                {"event_id": existing_event_id},
                {"$set": {"client_id": client_id, "updated_at": now.isoformat()}}
            )
            await db.clients.update_one({"client_id": client_id}, {"$inc": {"events_count": 1}})
    
    elif create_event:
        # Mode 2: Create new event
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
        await db.clients.update_one({"client_id": client_id}, {"$inc": {"events_count": 1}})
    
    # else: Mode 3 - Client only, no event
    
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
    """Get outreach leads - proactively contacted by the team (excludes converted)"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "lead_type": "outreach", "status": {"$ne": "Converted"}},
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
    """Get inbound leads - contacts from forms, email, social (excludes converted)"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "lead_type": {"$ne": "outreach"}, "status": {"$ne": "Converted"}},
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
            {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
        ).to_list(100)
        owner_names_map = {}
        for o in owners_data:
            name = o.get("name")
            if not name:
                first = o.get("first_name") or ""
                last = o.get("last_name") or ""
                name = f"{first} {last}".strip()
            if not name:
                email = o.get("email", "")
                name = email.split("@")[0].replace(".", " ").title() if email else o["user_id"]
            owner_names_map[o["user_id"]] = name
        
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


# ============== LEAD CONTACTS ==============

@crm_router.get("/leads/{lead_id}/contacts")
async def get_lead_contacts(lead_id: str, user: User = Depends(get_current_user)):
    """Get all contacts for a specific lead"""
    company_id = user.company_id or user.active_org_id
    
    # Verify lead exists
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    contacts = await db.contacts.find(
        {"company_id": company_id, "lead_id": lead_id},
        {"_id": 0}
    ).sort("is_primary", -1).to_list(50)
    
    return contacts


@crm_router.post("/leads/{lead_id}/contacts")
async def add_lead_contact(lead_id: str, contact: dict, user: User = Depends(get_current_user)):
    """Add a contact to a lead"""
    company_id = user.company_id or user.active_org_id
    
    # Verify lead exists
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    import secrets
    now = datetime.utcnow()
    
    # If this is primary, unset other primaries
    if contact.get("is_primary"):
        await db.contacts.update_many(
            {"lead_id": lead_id, "is_primary": True},
            {"$set": {"is_primary": False}}
        )
    
    new_contact = {
        "contact_id": f"contact_{secrets.token_hex(6)}",
        "company_id": company_id,
        "lead_id": lead_id,
        "client_id": None,
        "name": contact.get("name", ""),
        "email": contact.get("email"),
        "phone": contact.get("phone"),
        "whatsapp": contact.get("whatsapp"),
        "role": contact.get("role"),
        "role_title": contact.get("role") or contact.get("role_title"),
        "is_primary": contact.get("is_primary", False),
        "is_billing_contact": contact.get("is_billing_contact", False),
        "created_at": now
    }
    
    await db.contacts.insert_one(new_contact)
    del new_contact["_id"]
    
    return new_contact


@crm_router.delete("/leads/{lead_id}/contacts/{contact_id}")
async def delete_lead_contact(lead_id: str, contact_id: str, user: User = Depends(get_current_user)):
    """Delete a contact from a lead"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.contacts.delete_one({
        "contact_id": contact_id,
        "lead_id": lead_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    return {"success": True, "message": "Contact deleted"}


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
    # Get removed/revoked membership user_ids to exclude
    removed_memberships = await db.memberships.find({
        "$or": [{"company_id": user.company_id}, {"organization_id": user.company_id}],
        "status": {"$in": ["removed", "revoked", "suspended"]}
    }, {"_id": 0, "user_id": 1}).to_list(100)
    removed_user_ids = [m["user_id"] for m in removed_memberships]
    
    query = {"company_id": user.company_id, "is_active": {"$ne": False}}
    if removed_user_ids:
        query["user_id"] = {"$nin": removed_user_ids}
    
    users = await db.users.find(
        query,
        {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1, "role_id": 1}
    ).to_list(100)
    
    # Ensure each user has a display name: name → first_name + last_name → email fallback
    for u in users:
        if not u.get("name"):
            first = u.get("first_name") or ""
            last = u.get("last_name") or ""
            full = f"{first} {last}".strip()
            if full:
                u["name"] = full
            else:
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
    
    # Build base query for leads
    query = {"company_id": user.company_id}
    
    # Build query for company_entities (uses organization_id instead of company_id)
    company_query = {"organization_id": user.company_id}
    
    # Date filters
    if date_from or date_to:
        date_filter = {}
        if date_from:
            date_filter["$gte"] = date_from
        if date_to:
            date_filter["$lte"] = date_to + "T23:59:59"
        query["created_at"] = date_filter
        company_query["created_at"] = date_filter
    
    # Fetch all leads matching criteria
    leads = await db.leads.find(query, {"_id": 0}).to_list(10000)
    
    # Also fetch B2B companies/accounts (they appear in CRM list too)
    # Note: company_entities uses organization_id field
    companies_b2b = await db.company_entities.find(company_query, {"_id": 0}).to_list(10000)
    
    # Also fetch contacts (people within companies) - they also have status and owner_id
    contacts = await db.contacts.find(company_query, {"_id": 0}).to_list(10000)
    
    # Merge all CRM records into a unified list
    all_records = leads + companies_b2b + contacts
    
    # Debug: Log unique status values found
    unique_statuses = set()
    for record in all_records:
        s = record.get("status", "")
        if s:
            unique_statuses.add(s)
    print(f"DEBUG Sales Report - Unique status values found: {unique_statuses}")
    print(f"DEBUG Sales Report - Total leads: {len(leads)}, Total companies: {len(companies_b2b)}, Total contacts: {len(contacts)}")
    print(f"DEBUG Sales Report - user.company_id: {user.company_id}")
    
    # Log sample records to see their structure
    if companies_b2b:
        sample = companies_b2b[0]
        print(f"DEBUG Sample company: status={sample.get('status')}, owner_id={sample.get('owner_id')}, org_id={sample.get('organization_id')}")
    
    # Define CRM statuses - support both Spanish and English values (case-insensitive)
    def normalize_status(s):
        """Normalize status for comparison"""
        if not s:
            return ""
        return s.strip().lower()
    
    STATUS_MAP = {
        # Nuevo / New / Lead (initial state)
        "nuevo": "nuevo",
        "new": "nuevo",
        "lead": "nuevo",
        "prospecto": "nuevo",
        "prospect": "nuevo",
        # Contactado / Contacted (outreach made)
        "contactado": "contactado",
        "contacted": "contactado",
        "contact": "contactado",
        "en contacto": "contactado",
        "in contact": "contactado",
        # Sin Respuesta / No Response / NoResponse
        "sin respuesta": "sin_respuesta",
        "no response": "sin_respuesta",
        "no_response": "sin_respuesta",
        "noresponse": "sin_respuesta",  # Outreach uses this format
        "sin_respuesta": "sin_respuesta",
        "no responde": "sin_respuesta",
        # Interesado / Interested / Engaged
        "interesado": "interesado",
        "interested": "interesado",
        "engaged": "interesado",  # Outreach uses this
        "calificado": "interesado",
        "qualified": "interesado",
        "active": "interesado",  # Companies section uses this
        # Convertido / Converted / Client
        "converted": "convertido",
        "convertido": "convertido",
        "won": "convertido",
        "client": "convertido",  # Companies section uses this
        "cliente": "convertido",
        "ganado": "convertido",
        # Descartado / Discarded / Inactive
        "discarded": "descartado",
        "descartado": "descartado",
        "lost": "descartado",
        "perdido": "descartado",
        "inactive": "descartado",  # Companies section uses this
    }
    
    # Group by owner
    owner_stats = {}
    
    for lead in all_records:
        # Support multiple field names for owner assignment
        lead_owner = lead.get("owner_id") or lead.get("assigned_to") or lead.get("salesperson_id") or "__unassigned__"
        
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
        
        # Get status from multiple possible fields (outreach uses outreach_status)
        raw_status = lead.get("outreach_status") or lead.get("status") or ""
        normalized = normalize_status(raw_status)
        mapped_status = STATUS_MAP.get(normalized, "otro")
        
        if mapped_status == "nuevo":
            stats["nuevos"] += 1
        elif mapped_status == "contactado":
            stats["contactados"] += 1
            stats["trabajados"] += 1
        elif mapped_status == "sin_respuesta":
            stats["sin_respuesta"] += 1
            stats["trabajados"] += 1
        elif mapped_status == "interesado":
            stats["interesados"] += 1
            stats["trabajados"] += 1
        elif mapped_status == "convertido":
            stats["convertidos"] += 1
        # If status not in map, count as nuevo (default)
    
    # Fetch owner names
    owner_ids = [oid for oid in owner_stats.keys() if oid != "__unassigned__"]
    if owner_ids:
        users_data = await db.users.find(
            {"user_id": {"$in": owner_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
        ).to_list(100)
        user_names = {}
        for u in users_data:
            name = u.get("name")
            if not name:
                first = u.get("first_name") or ""
                last = u.get("last_name") or ""
                name = f"{first} {last}".strip()
            if not name:
                email = u.get("email", "")
                name = email.split("@")[0].replace(".", " ").title() if email else u["user_id"]
            user_names[u["user_id"]] = name
        
        for oid in owner_stats:
            if oid != "__unassigned__":
                if oid in user_names:
                    owner_stats[oid]["owner_name"] = user_names[oid]
                else:
                    # User was deleted - mark as such
                    owner_stats[oid]["owner_name"] = "Usuario Eliminado"
                    owner_stats[oid]["is_deleted"] = True
    
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


@crm_router.post("/cleanup-orphaned-assignments")
async def cleanup_orphaned_assignments(
    reassign_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """
    Clean up CRM records assigned to deleted/inactive users.
    If reassign_to is provided, reassign to that user. Otherwise, set to unassigned (None).
    """
    company_id = user.company_id
    
    # Get all active user IDs
    active_users = await db.users.find(
        {"company_id": company_id, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1}
    ).to_list(1000)
    active_user_ids = {u["user_id"] for u in active_users}
    
    # Validate reassign_to if provided
    if reassign_to and reassign_to not in active_user_ids:
        raise HTTPException(status_code=400, detail="Target user not found or inactive")
    
    new_owner = reassign_to  # Will be None if not provided
    cleaned = {"leads": 0, "companies": 0, "contacts": 0}
    
    # Clean leads collection
    leads_result = await db.leads.update_many(
        {
            "company_id": company_id,
            "owner_id": {"$nin": list(active_user_ids), "$ne": None}
        },
        {"$set": {"owner_id": new_owner}}
    )
    cleaned["leads"] = leads_result.modified_count
    
    # Clean company_entities collection
    companies_result = await db.company_entities.update_many(
        {
            "organization_id": company_id,
            "owner_id": {"$nin": list(active_user_ids), "$ne": None}
        },
        {"$set": {"owner_id": new_owner}}
    )
    cleaned["companies"] = companies_result.modified_count
    
    # Clean contacts collection
    contacts_result = await db.contacts.update_many(
        {
            "organization_id": company_id,
            "owner_id": {"$nin": list(active_user_ids), "$ne": None}
        },
        {"$set": {"owner_id": new_owner}}
    )
    cleaned["contacts"] = contacts_result.modified_count
    
    total_cleaned = sum(cleaned.values())
    
    return {
        "message": f"Cleaned {total_cleaned} orphaned assignments",
        "details": cleaned,
        "reassigned_to": reassign_to or "Unassigned"
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



# ============== SALES DAILY ACTIVITY ==============

@crm_router.get("/reports/daily-activity")
async def get_daily_activity(
    user: User = Depends(get_current_user),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    owner_id: Optional[str] = None
):
    """
    Daily activity breakdown per salesperson.
    Returns per-day rows with: calls, emails, whatsapp, follow_ups, new_leads, conversions.
    """
    user_role = getattr(user, 'role_id', None)
    if user_role == "sales":
        owner_id = user.user_id

    now = datetime.now(timezone.utc)
    if not date_from:
        # Default: last 7 days
        from_dt = now - __import__('datetime').timedelta(days=6)
        date_from = from_dt.strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")

    date_from_iso = date_from + "T00:00:00"
    date_to_iso = date_to + "T23:59:59"

    # Fetch comm_logs in range
    comm_query = {"company_id": user.company_id, "created_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    if owner_id and owner_id != "all":
        comm_query["owner_id"] = owner_id
    comm_logs = await db.comm_logs.find(comm_query, {"_id": 0}).to_list(10000)

    # Fetch leads created in range
    lead_query = {"company_id": user.company_id, "created_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    if owner_id and owner_id != "all":
        lead_query["owner_id"] = owner_id
    leads = await db.leads.find(lead_query, {"_id": 0, "lead_id": 1, "owner_id": 1, "status": 1, "created_at": 1}).to_list(10000)

    # Fetch conversions (leads marked Converted in range)
    conv_query = {"company_id": user.company_id, "status": "Converted", "updated_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    if owner_id and owner_id != "all":
        conv_query["owner_id"] = owner_id
    converted_leads = await db.leads.find(conv_query, {"_id": 0, "lead_id": 1, "owner_id": 1, "updated_at": 1}).to_list(10000)

    # Fetch follow-ups completed in range
    fu_query = {"company_id": user.company_id, "completed_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    if owner_id and owner_id != "all":
        fu_query["completed_by"] = owner_id
    follow_ups_done = await db.leads.find(
        {"company_id": user.company_id, "follow_up_completed_at": {"$gte": date_from_iso, "$lte": date_to_iso}},
        {"_id": 0}
    ).to_list(0)  # Might not have this field - gracefully handle

    # Build daily buckets: key = "owner_id|date"
    daily = {}

    def get_bucket(oid, date_str):
        key = f"{oid or '__unassigned__'}|{date_str}"
        if key not in daily:
            daily[key] = {
                "owner_id": oid or None,
                "date": date_str,
                "calls": 0,
                "emails": 0,
                "whatsapp": 0,
                "meetings": 0,
                "messages": 0,
                "notes": 0,
                "follow_ups_completed": 0,
                "new_leads": 0,
                "conversions": 0,
                "total_activities": 0
            }
        return daily[key]

    # Process comm_logs
    for log in comm_logs:
        date_str = (log.get("created_at") or "")[:10]
        if not date_str:
            continue
        bucket = get_bucket(log.get("owner_id"), date_str)
        comm_type = (log.get("comm_type") or "").lower()
        if comm_type == "call":
            bucket["calls"] += 1
        elif comm_type == "email":
            bucket["emails"] += 1
        elif comm_type in ("whatsapp", "message"):
            bucket["whatsapp"] += 1
        elif comm_type == "meeting":
            bucket["meetings"] += 1
        elif comm_type == "note":
            bucket["notes"] += 1
        else:
            bucket["messages"] += 1
        bucket["total_activities"] += 1

    # Process new leads
    for lead in leads:
        date_str = (lead.get("created_at") or "")[:10]
        if not date_str:
            continue
        bucket = get_bucket(lead.get("owner_id"), date_str)
        bucket["new_leads"] += 1
        bucket["total_activities"] += 1

    # Process conversions
    for lead in converted_leads:
        date_str = (lead.get("updated_at") or "")[:10]
        if not date_str:
            continue
        bucket = get_bucket(lead.get("owner_id"), date_str)
        bucket["conversions"] += 1
        bucket["total_activities"] += 1

    # Fetch owner names
    owner_ids = list(set(b["owner_id"] for b in daily.values() if b["owner_id"]))
    owner_names = {}
    if owner_ids:
        users_data = await db.users.find(
            {"user_id": {"$in": owner_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
        ).to_list(100)
        for u in users_data:
            name = u.get("name")
            if not name:
                first = u.get("first_name") or ""
                last = u.get("last_name") or ""
                name = f"{first} {last}".strip()
            if not name:
                name = u.get("email", "").split("@")[0].replace(".", " ").title()
            owner_names[u["user_id"]] = name

    # Build result
    result = []
    for bucket in daily.values():
        bucket["owner_name"] = owner_names.get(bucket["owner_id"], "Sin Asignar")
        result.append(bucket)

    # Sort by date desc, then owner_name
    result.sort(key=lambda x: (-x["date"].replace("-", "").zfill(8).__hash__(), x["owner_name"]))
    result.sort(key=lambda x: x["date"], reverse=True)

    # Calculate totals per owner
    owner_totals = {}
    for r in result:
        oid = r["owner_id"] or "__unassigned__"
        if oid not in owner_totals:
            owner_totals[oid] = {
                "owner_id": r["owner_id"],
                "owner_name": r["owner_name"],
                "calls": 0, "emails": 0, "whatsapp": 0, "meetings": 0,
                "notes": 0, "messages": 0, "follow_ups_completed": 0,
                "new_leads": 0, "conversions": 0, "total_activities": 0, "active_days": 0
            }
        t = owner_totals[oid]
        for k in ["calls", "emails", "whatsapp", "meetings", "notes", "messages", "follow_ups_completed", "new_leads", "conversions", "total_activities"]:
            t[k] += r[k]
        if r["total_activities"] > 0:
            t["active_days"] += 1

    return {
        "daily": result,
        "owner_totals": list(owner_totals.values()),
        "date_from": date_from,
        "date_to": date_to
    }


# ============== SALES WEEKLY GOALS ==============

@crm_router.get("/sales-goals")
async def get_sales_goals(user: User = Depends(get_current_user)):
    """Get weekly sales goals for all team members"""
    goals = await db.sales_goals.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    return goals


@crm_router.post("/sales-goals")
async def upsert_sales_goal(data: dict, user: User = Depends(get_current_user)):
    """Create or update weekly sales goal for a team member. Admin/manager only."""
    target_owner_id = data.get("owner_id")
    if not target_owner_id:
        raise HTTPException(status_code=400, detail="owner_id required")

    now = datetime.now(timezone.utc)
    goal_data = {
        "company_id": user.company_id,
        "owner_id": target_owner_id,
        "weekly_calls": data.get("weekly_calls", 0),
        "weekly_emails": data.get("weekly_emails", 0),
        "weekly_whatsapp": data.get("weekly_whatsapp", 0),
        "weekly_new_leads": data.get("weekly_new_leads", 0),
        "weekly_conversions": data.get("weekly_conversions", 0),
        "weekly_follow_ups": data.get("weekly_follow_ups", 0),
        "updated_at": now.isoformat(),
        "updated_by": user.user_id
    }

    existing = await db.sales_goals.find_one(
        {"company_id": user.company_id, "owner_id": target_owner_id}
    )

    if existing:
        await db.sales_goals.update_one(
            {"company_id": user.company_id, "owner_id": target_owner_id},
            {"$set": goal_data}
        )
    else:
        goal_data["goal_id"] = f"goal_{uuid.uuid4().hex[:12]}"
        goal_data["created_at"] = now.isoformat()
        await db.sales_goals.insert_one(goal_data)

    # Return clean (no _id)
    result = await db.sales_goals.find_one(
        {"company_id": user.company_id, "owner_id": target_owner_id},
        {"_id": 0}
    )
    return result


@crm_router.delete("/sales-goals/{owner_id}")
async def delete_sales_goal(owner_id: str, user: User = Depends(get_current_user)):
    """Delete weekly sales goal for a team member"""
    result = await db.sales_goals.delete_one(
        {"company_id": user.company_id, "owner_id": owner_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"message": "Goal deleted"}


@crm_router.get("/reports/weekly-progress")
async def get_weekly_progress(
    user: User = Depends(get_current_user),
    owner_id: Optional[str] = None
):
    """
    Get current week progress vs goals for each salesperson.
    """
    user_role = getattr(user, 'role_id', None)
    if user_role == "sales":
        owner_id = user.user_id

    # Calculate current week range (Monday to Sunday)
    now = datetime.now(timezone.utc)
    week_start = now - __import__('datetime').timedelta(days=now.weekday())
    week_end = week_start + __import__('datetime').timedelta(days=6)

    date_from = week_start.strftime("%Y-%m-%d")
    date_to = week_end.strftime("%Y-%m-%d")

    # Fetch goals
    goal_query = {"company_id": user.company_id}
    if owner_id and owner_id != "all":
        goal_query["owner_id"] = owner_id
    goals = await db.sales_goals.find(goal_query, {"_id": 0}).to_list(100)
    goals_map = {g["owner_id"]: g for g in goals}

    # Fetch this week's comm_logs
    date_from_iso = date_from + "T00:00:00"
    date_to_iso = date_to + "T23:59:59"

    comm_query = {"company_id": user.company_id, "created_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    comm_logs = await db.comm_logs.find(comm_query, {"_id": 0}).to_list(10000)

    # Fetch new leads this week
    lead_query = {"company_id": user.company_id, "created_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    leads = await db.leads.find(lead_query, {"_id": 0, "owner_id": 1, "created_at": 1}).to_list(10000)

    # Fetch conversions this week
    conv_query = {"company_id": user.company_id, "status": "Converted", "updated_at": {"$gte": date_from_iso, "$lte": date_to_iso}}
    conversions = await db.leads.find(conv_query, {"_id": 0, "owner_id": 1}).to_list(10000)

    # Aggregate per owner
    actuals = {}

    def get_actual(oid):
        if oid not in actuals:
            actuals[oid] = {"calls": 0, "emails": 0, "whatsapp": 0, "new_leads": 0, "conversions": 0, "follow_ups": 0}
        return actuals[oid]

    for log in comm_logs:
        oid = log.get("owner_id")
        if not oid:
            continue
        a = get_actual(oid)
        ct = (log.get("comm_type") or "").lower()
        if ct == "call":
            a["calls"] += 1
        elif ct == "email":
            a["emails"] += 1
        elif ct in ("whatsapp", "message"):
            a["whatsapp"] += 1

    for lead in leads:
        oid = lead.get("owner_id")
        if not oid:
            continue
        get_actual(oid)["new_leads"] += 1

    for c in conversions:
        oid = c.get("owner_id")
        if not oid:
            continue
        get_actual(oid)["conversions"] += 1

    # Fetch owner names
    all_owner_ids = list(set(list(goals_map.keys()) + list(actuals.keys())))
    owner_names = {}
    if all_owner_ids:
        users_data = await db.users.find(
            {"user_id": {"$in": all_owner_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
        ).to_list(100)
        for u in users_data:
            name = u.get("name")
            if not name:
                first = u.get("first_name") or ""
                last = u.get("last_name") or ""
                name = f"{first} {last}".strip()
            if not name:
                name = u.get("email", "").split("@")[0].replace(".", " ").title()
            owner_names[u["user_id"]] = name

    # Build progress for each owner with goals
    progress = []
    for oid in all_owner_ids:
        if owner_id and owner_id != "all" and oid != owner_id:
            continue
        goal = goals_map.get(oid, {})
        actual = actuals.get(oid, {"calls": 0, "emails": 0, "whatsapp": 0, "new_leads": 0, "conversions": 0, "follow_ups": 0})

        metrics = []
        goal_fields = [
            ("calls", "weekly_calls", "Llamadas"),
            ("emails", "weekly_emails", "Emails"),
            ("whatsapp", "weekly_whatsapp", "WhatsApp"),
            ("new_leads", "weekly_new_leads", "Leads Nuevos"),
            ("conversions", "weekly_conversions", "Conversiones"),
        ]
        total_goal = 0
        total_actual = 0
        for actual_key, goal_key, label in goal_fields:
            g = goal.get(goal_key, 0)
            a = actual.get(actual_key, 0)
            total_goal += g
            total_actual += a
            if g > 0:
                metrics.append({
                    "label": label,
                    "goal": g,
                    "actual": a,
                    "percentage": min(round(a / g * 100, 1), 999) if g > 0 else 0
                })

        progress.append({
            "owner_id": oid,
            "owner_name": owner_names.get(oid, "Desconocido"),
            "has_goals": bool(goal),
            "metrics": metrics,
            "total_goal": total_goal,
            "total_actual": total_actual,
            "overall_percentage": min(round(total_actual / total_goal * 100, 1), 999) if total_goal > 0 else 0
        })

    progress.sort(key=lambda x: -x["overall_percentage"])

    return {
        "week_start": date_from,
        "week_end": date_to,
        "progress": progress
    }


# ============== WEEKLY SUMMARY NOTIFICATIONS ==============

@crm_router.post("/reports/send-weekly-summary")
async def send_weekly_summary(user: User = Depends(get_current_user)):
    """
    Generate and send weekly goal summary notifications.
    - Each salesperson gets their own progress notification
    - Admins/managers get a full team summary
    Debounced: won't send again if already sent today for this company.
    """
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # Check if already sent today
    existing = await db.weekly_summary_log.find_one({
        "company_id": user.company_id,
        "date": today_str
    })
    if existing:
        return {"message": "Summary already sent today", "sent": False, "sent_at": existing.get("sent_at")}

    # Get weekly progress data
    week_start = now - timedelta(days=now.weekday())
    week_end = week_start + timedelta(days=6)
    date_from = week_start.strftime("%Y-%m-%d")
    date_to = week_end.strftime("%Y-%m-%d")
    date_from_iso = date_from + "T00:00:00"
    date_to_iso = date_to + "T23:59:59"

    # Fetch goals
    goals = await db.sales_goals.find({"company_id": user.company_id}, {"_id": 0}).to_list(100)
    goals_map = {g["owner_id"]: g for g in goals}

    if not goals:
        return {"message": "No goals configured", "sent": False}

    # Fetch comm_logs this week
    comm_logs = await db.comm_logs.find(
        {"company_id": user.company_id, "created_at": {"$gte": date_from_iso, "$lte": date_to_iso}},
        {"_id": 0}
    ).to_list(10000)

    # Fetch new leads this week
    leads = await db.leads.find(
        {"company_id": user.company_id, "created_at": {"$gte": date_from_iso, "$lte": date_to_iso}},
        {"_id": 0, "owner_id": 1}
    ).to_list(10000)

    # Fetch conversions this week
    conversions = await db.leads.find(
        {"company_id": user.company_id, "status": "Converted", "updated_at": {"$gte": date_from_iso, "$lte": date_to_iso}},
        {"_id": 0, "owner_id": 1}
    ).to_list(10000)

    # Aggregate per owner
    actuals = {}
    for log in comm_logs:
        oid = log.get("owner_id")
        if not oid:
            continue
        if oid not in actuals:
            actuals[oid] = {"calls": 0, "emails": 0, "whatsapp": 0, "new_leads": 0, "conversions": 0}
        ct = (log.get("comm_type") or "").lower()
        if ct == "call":
            actuals[oid]["calls"] += 1
        elif ct == "email":
            actuals[oid]["emails"] += 1
        elif ct in ("whatsapp", "message"):
            actuals[oid]["whatsapp"] += 1

    for lead in leads:
        oid = lead.get("owner_id")
        if oid:
            actuals.setdefault(oid, {"calls": 0, "emails": 0, "whatsapp": 0, "new_leads": 0, "conversions": 0})
            actuals[oid]["new_leads"] += 1

    for c in conversions:
        oid = c.get("owner_id")
        if oid:
            actuals.setdefault(oid, {"calls": 0, "emails": 0, "whatsapp": 0, "new_leads": 0, "conversions": 0})
            actuals[oid]["conversions"] += 1

    # Fetch owner names
    all_ids = list(set(list(goals_map.keys()) + list(actuals.keys())))
    owner_names = {}
    if all_ids:
        users_data = await db.users.find({"user_id": {"$in": all_ids}}, {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}).to_list(100)
        for u in users_data:
            name = u.get("name") or f'{u.get("first_name", "")} {u.get("last_name", "")}'.strip() or u.get("email", "").split("@")[0].replace(".", " ").title()
            owner_names[u["user_id"]] = name

    # Build summaries and send notifications
    notifications_sent = 0
    team_lines = []

    for oid, goal in goals_map.items():
        actual = actuals.get(oid, {"calls": 0, "emails": 0, "whatsapp": 0, "new_leads": 0, "conversions": 0})
        name = owner_names.get(oid, "?")

        goal_fields = [
            ("calls", "weekly_calls", "Llamadas"),
            ("emails", "weekly_emails", "Emails"),
            ("whatsapp", "weekly_whatsapp", "WhatsApp"),
            ("new_leads", "weekly_new_leads", "Leads Nuevos"),
            ("conversions", "weekly_conversions", "Conversiones"),
        ]

        total_goal = 0
        total_actual = 0
        lines = []
        for actual_key, goal_key, label in goal_fields:
            g = goal.get(goal_key, 0)
            a = actual.get(actual_key, 0)
            if g > 0:
                pct = min(round(a / g * 100), 999)
                total_goal += g
                total_actual += a
                status = "OK" if pct >= 100 else f"{pct}%"
                lines.append(f"  {label}: {a}/{g} ({status})")

        overall_pct = min(round(total_actual / total_goal * 100), 999) if total_goal > 0 else 0

        # Notification for the salesperson
        if overall_pct >= 100:
            title = f"Meta semanal alcanzada ({overall_pct}%)"
            priority = "normal"
        elif overall_pct >= 60:
            title = f"Progreso semanal: {overall_pct}%"
            priority = "normal"
        else:
            title = f"Progreso semanal bajo: {overall_pct}%"
            priority = "high"

        message = f"Semana {date_from} al {date_to}:\n" + "\n".join(lines)

        await create_notification(
            user_id=oid,
            notification_type="sales_goal_summary",
            title=title,
            message=message,
            link="/client-engagement/crm/sales-report",
            metadata={"overall_percentage": overall_pct, "week_start": date_from},
            priority=priority
        )
        notifications_sent += 1

        # Build team summary line
        emoji = "OK" if overall_pct >= 100 else f"{overall_pct}%"
        team_lines.append(f"  {name}: {emoji}")

    # Send team summary to admins
    if team_lines:
        admin_users = await db.users.find(
            {"company_id": user.company_id, "role": {"$in": ["owner", "admin", "manager"]}},
            {"_id": 0, "user_id": 1}
        ).to_list(50)

        team_msg = f"Resumen semanal del equipo ({date_from} al {date_to}):\n" + "\n".join(team_lines)

        for admin in admin_users:
            await create_notification(
                user_id=admin["user_id"],
                notification_type="sales_team_summary",
                title=f"Resumen semanal del equipo",
                message=team_msg,
                link="/client-engagement/crm/sales-report",
                metadata={"week_start": date_from, "team_size": len(team_lines)},
                priority="normal"
            )
            notifications_sent += 1

    # Log that we sent today
    await db.weekly_summary_log.insert_one({
        "company_id": user.company_id,
        "date": today_str,
        "sent_at": now.isoformat(),
        "sent_by": user.user_id,
        "notifications_sent": notifications_sent
    })

    return {
        "message": f"Summary sent: {notifications_sent} notifications",
        "sent": True,
        "notifications_sent": notifications_sent,
        "sent_at": now.isoformat()
    }


@crm_router.get("/reports/weekly-summary-status")
async def get_weekly_summary_status(user: User = Depends(get_current_user)):
    """Check if weekly summary was already sent today"""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.weekly_summary_log.find_one(
        {"company_id": user.company_id, "date": today_str},
        {"_id": 0}
    )
    return {
        "sent_today": existing is not None,
        "sent_at": existing.get("sent_at") if existing else None,
        "notifications_sent": existing.get("notifications_sent", 0) if existing else 0
    }


# ============== LEAD SOURCES CATALOG ==============

DEFAULT_SOURCES = [
    "LinkedIn", "Instagram", "Facebook", "Google", "Referido", "Evento",
    "Website", "Cold Call", "Email Campaign", "WhatsApp", "Base de Datos", "Otro"
]

@crm_router.get("/lead-sources")
async def get_lead_sources(user: User = Depends(get_current_user)):
    """Get lead sources catalog"""
    sources = await db.lead_sources.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(200)
    if not sources:
        # Seed defaults
        now = datetime.now(timezone.utc).isoformat()
        for s in DEFAULT_SOURCES:
            await db.lead_sources.insert_one({
                "source_id": f"src_{uuid.uuid4().hex[:8]}",
                "company_id": user.company_id,
                "name": s,
                "created_at": now
            })
        sources = await db.lead_sources.find(
            {"company_id": user.company_id},
            {"_id": 0}
        ).sort("name", 1).to_list(200)
    return sources


@crm_router.post("/lead-sources")
async def create_lead_source(data: dict, user: User = Depends(get_current_user)):
    """Create a new lead source"""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.lead_sources.find_one({"company_id": user.company_id, "name": name})
    if existing:
        raise HTTPException(status_code=400, detail="Source already exists")
    doc = {
        "source_id": f"src_{uuid.uuid4().hex[:8]}",
        "company_id": user.company_id,
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.lead_sources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@crm_router.delete("/lead-sources/{source_id}")
async def delete_lead_source(source_id: str, user: User = Depends(get_current_user)):
    result = await db.lead_sources.delete_one({"source_id": source_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"message": "Deleted"}


# ============== EVENTS LIST (for conversion linking) ==============

@crm_router.get("/events-list")
async def get_events_list(user: User = Depends(get_current_user)):
    """Get events for linking during conversion"""
    events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0, "event_id": 1, "name": 1, "event_type": 1, "event_date": 1, "status": 1, "client_id": 1}
    ).sort("created_at", -1).to_list(500)
    
    # Also get guest flow activations
    activations = await db.gf_activations.find(
        {"company_id": user.company_id},
        {"_id": 0, "activation_id": 1, "event_name": 1, "status": 1, "event_id": 1}
    ).sort("created_at", -1).to_list(200)
    
    return {"events": events, "activations": activations}


# ============== IMPORT LOG ==============

@crm_router.get("/import-logs")
async def get_import_logs(user: User = Depends(get_current_user)):
    """Get import history"""
    logs = await db.import_logs.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return logs


# ============== REPORT: LEADS BY SOURCE ==============

@crm_router.get("/reports/by-source")
async def get_leads_by_source(
    user: User = Depends(get_current_user),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    """Get lead counts and conversion rates grouped by source"""
    query = {"company_id": user.company_id}
    if date_from:
        query.setdefault("created_at", {})["$gte"] = date_from + "T00:00:00"
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"

    leads = await db.leads.find(query, {"_id": 0, "source": 1, "status": 1}).to_list(10000)

    sources = {}
    for lead in leads:
        src = lead.get("source") or "Sin Fuente"
        if src not in sources:
            sources[src] = {"source": src, "total": 0, "converted": 0, "new": 0, "contacted": 0, "interested": 0}
        sources[src]["total"] += 1
        status = (lead.get("status") or "").lower()
        if status == "converted":
            sources[src]["converted"] += 1
        elif status == "new" or status == "nuevo":
            sources[src]["new"] += 1
        elif status in ("contacted", "contactado"):
            sources[src]["contacted"] += 1
        elif status in ("interested", "interesado"):
            sources[src]["interested"] += 1

    result = list(sources.values())
    for r in result:
        r["conversion_rate"] = round(r["converted"] / r["total"] * 100, 1) if r["total"] > 0 else 0
    result.sort(key=lambda x: -x["total"])

    return result



# ============== SOURCE NORMALIZATION ==============

@crm_router.post("/normalize-sources")
async def normalize_lead_sources(user: User = Depends(get_current_user)):
    """Normalize all lead sources to consistent capitalization and naming."""
    source_map = {
        "import": "Importación",
        "importación": "Importación",
        "importacion": "Importación",
        "website": "Website",
        "website form": "Website",
        "web": "Website",
        "outreach": "Outreach",
        "cold call": "Cold Call",
        "cold_call": "Cold Call",
        "email": "Email",
        "email campaign": "Email Campaign",
        "linkedin": "LinkedIn",
        "instagram": "Instagram",
        "facebook": "Facebook",
        "google": "Google",
        "referido": "Referido",
        "referral": "Referido",
        "meta lead ads": "Meta Ads",
        "meta ads": "Meta Ads",
        "tiktok": "TikTok",
        "whatsapp": "WhatsApp",
        "evento": "Evento",
        "event": "Evento",
    }
    
    updated = 0
    leads = await db.leads.find(
        {"company_id": user.company_id},
        {"_id": 0, "lead_id": 1, "source": 1}
    ).to_list(None)
    
    for lead in leads:
        src = (lead.get("source") or "").strip()
        normalized = source_map.get(src.lower(), None)
        if normalized and normalized != src:
            await db.leads.update_one(
                {"lead_id": lead["lead_id"]},
                {"$set": {"source": normalized}}
            )
            updated += 1
    
    return {"normalized": updated, "total_checked": len(leads)}


# ============== TAGS ==============

@crm_router.get("/tags")
async def get_tags(user: User = Depends(get_current_user)):
    tags = await db.crm_tags.find(
        {"company_id": user.company_id}, {"_id": 0}
    ).sort("name", 1).to_list(None)
    if not tags:
        defaults = [
            {"name": "VIP", "color": "#8b5cf6"},
            {"name": "Hot Lead", "color": "#ef4444"},
            {"name": "Referido", "color": "#f59e0b"},
            {"name": "Corporativo", "color": "#3b82f6"},
            {"name": "Social", "color": "#ec4899"},
            {"name": "Hotel", "color": "#06b6d4"},
            {"name": "Gobierno", "color": "#64748b"},
            {"name": "Recurrente", "color": "#22c55e"},
        ]
        now = datetime.now(timezone.utc).isoformat()
        for d in defaults:
            d["tag_id"] = f"tag_{uuid.uuid4().hex[:10]}"
            d["company_id"] = user.company_id
            d["created_at"] = now
        await db.crm_tags.insert_many(defaults)
        tags = await db.crm_tags.find(
            {"company_id": user.company_id}, {"_id": 0}
        ).sort("name", 1).to_list(None)
    return tags

@crm_router.post("/tags")
async def create_tag(data: dict, user: User = Depends(get_current_user)):
    tag = {
        "tag_id": f"tag_{uuid.uuid4().hex[:10]}",
        "company_id": user.company_id,
        "name": data.get("name", "").strip(),
        "color": data.get("color", "#6b7280"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if not tag["name"]:
        raise HTTPException(status_code=400, detail="Tag name is required")
    await db.crm_tags.insert_one(tag)
    tag.pop("_id", None)
    return tag

@crm_router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user: User = Depends(get_current_user)):
    await db.crm_tags.delete_one({"tag_id": tag_id, "company_id": user.company_id})
    await db.leads.update_many(
        {"company_id": user.company_id},
        {"$pull": {"tags": tag_id}}
    )
    return {"deleted": True}

@crm_router.post("/leads/{lead_id}/tags")
async def update_lead_tags(lead_id: str, data: dict, user: User = Depends(get_current_user)):
    tags = data.get("tags", [])
    await db.leads.update_one(
        {"lead_id": lead_id, "company_id": user.company_id},
        {"$set": {"tags": tags}}
    )
    return {"updated": True}

# ============== SERVICE AREAS ==============

@crm_router.get("/service-areas")
async def get_service_areas(user: User = Depends(get_current_user)):
    areas = await db.service_areas.find(
        {"company_id": user.company_id}, {"_id": 0}
    ).sort("country", 1).to_list(None)
    if not areas:
        default = {
            "area_id": f"area_{uuid.uuid4().hex[:10]}",
            "company_id": user.company_id,
            "country": "República Dominicana",
            "country_code": "DO",
            "regions": [
                {"name": "Distrito Nacional", "cities": ["Santo Domingo"]},
                {"name": "Santo Domingo", "cities": ["Santo Domingo Este", "Santo Domingo Norte", "Santo Domingo Oeste"]},
                {"name": "Santiago", "cities": ["Santiago de los Caballeros"]},
                {"name": "La Altagracia", "cities": ["Punta Cana", "Higüey", "Bayahíbe"]},
                {"name": "Puerto Plata", "cities": ["Puerto Plata", "Sosúa", "Cabarete"]},
                {"name": "La Romana", "cities": ["La Romana", "Casa de Campo"]},
                {"name": "Samaná", "cities": ["Samaná", "Las Terrenas"]},
            ],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.service_areas.insert_one(default)
        default.pop("_id", None)
        areas = [default]
    return areas

@crm_router.post("/service-areas")
async def create_service_area(data: dict, user: User = Depends(get_current_user)):
    area = {
        "area_id": f"area_{uuid.uuid4().hex[:10]}",
        "company_id": user.company_id,
        "country": data.get("country", "").strip(),
        "country_code": data.get("country_code", "").strip().upper(),
        "regions": data.get("regions", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if not area["country"]:
        raise HTTPException(status_code=400, detail="Country name required")
    await db.service_areas.insert_one(area)
    area.pop("_id", None)
    return area

@crm_router.put("/service-areas/{area_id}")
async def update_service_area(area_id: str, data: dict, user: User = Depends(get_current_user)):
    updates = {}
    if "country" in data: updates["country"] = data["country"]
    if "country_code" in data: updates["country_code"] = data["country_code"]
    if "regions" in data: updates["regions"] = data["regions"]
    if updates:
        await db.service_areas.update_one(
            {"area_id": area_id, "company_id": user.company_id},
            {"$set": updates}
        )
    updated = await db.service_areas.find_one(
        {"area_id": area_id}, {"_id": 0}
    )
    return updated

@crm_router.delete("/service-areas/{area_id}")
async def delete_service_area(area_id: str, user: User = Depends(get_current_user)):
    await db.service_areas.delete_one({"area_id": area_id, "company_id": user.company_id})
    return {"deleted": True}

# ============== GEO STATS ==============

@crm_router.get("/geo-stats")
async def get_geo_stats(user: User = Depends(get_current_user)):
    """Get lead counts grouped by city for map visualization."""
    pipeline = [
        {"$match": {"company_id": user.company_id, "status": {"$nin": ["Converted", "Discarded"]}}},
        {"$group": {
            "_id": {"city": {"$ifNull": ["$city", ""]}, "country": {"$ifNull": ["$country", ""]}},
            "total": {"$sum": 1},
            "new": {"$sum": {"$cond": [{"$eq": ["$status", "New"]}, 1, 0]}},
            "contacted": {"$sum": {"$cond": [{"$eq": ["$status", "Contacted"]}, 1, 0]}},
            "engaged": {"$sum": {"$cond": [{"$eq": ["$status", "Engaged"]}, 1, 0]}},
        }},
        {"$sort": {"total": -1}}
    ]
    results = await db.leads.aggregate(pipeline).to_list(None)
    cities = []
    for r in results:
        city = r["_id"]["city"].strip()
        if city:
            cities.append({
                "city": city,
                "country": r["_id"]["country"],
                "total": r["total"],
                "new": r["new"],
                "contacted": r["contacted"],
                "engaged": r["engaged"],
            })
    return {"cities": cities, "no_city_count": sum(r["total"] for r in results if not r["_id"]["city"].strip())}
