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
from routers.notifications import create_notification, notify_org_admins


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
    
    # Send in-app notifications for conversion
    lead_name = lead.get("lead_name", "Lead")
    notif_title = f"Lead convertido: {lead_name}"
    notif_message = f"{lead_name} ha sido convertido a cliente exitosamente."
    notif_link = f"/crm/clients"
    notif_metadata = {"lead_id": lead_id, "client_id": client_id, "event_id": event_id}
    
    # Notify the lead owner
    if lead_owner_id and lead_owner_id != user.user_id:
        await create_notification(
            user_id=lead_owner_id,
            notification_type="lead_converted",
            title=notif_title,
            message=notif_message,
            link=notif_link,
            metadata=notif_metadata,
            priority="high"
        )
    
    # Notify org admins/managers (excluding the user who converted)
    await notify_org_admins(
        org_id=user.company_id,
        notification_type="lead_converted",
        title=notif_title,
        message=notif_message,
        link=notif_link,
        metadata=notif_metadata,
        priority="high",
        exclude_user_id=user.user_id
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
        "source": data.source or "Outreach",
        "status": "New",
        "outreach_status": "New",
        "source_event_id": data.source_event_id,
        "activation_id": data.activation_id,
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
    valid_statuses = ["New", "Contacted", "NoResponse", "Engaged", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
    if outreach_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    now = datetime.now(timezone.utc)
    result = await db.leads.update_one(
        {"lead_id": lead_id, "company_id": user.company_id},
        {"$set": {
            "outreach_status": outreach_status,
            "last_contact_date": now.isoformat() if outreach_status in ["Contacted", "Engaged", "Qualified", "Proposal", "Negotiation", "Won"] else None,
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
async def complete_follow_up(entity_type: str, entity_id: str, request: Request, user: User = Depends(get_current_user)):
    """Mark a follow-up as completed, optionally with notes and next follow-up"""
    now = datetime.now(timezone.utc)
    
    # Parse optional body
    try:
        body = await request.json()
    except:
        body = {}
    
    notes = body.get("notes", "").strip()
    next_date = body.get("next_follow_up_date")
    next_type = body.get("next_follow_up_type")
    
    update_data = {
        "follow_up_completed_at": now.isoformat(),
        "last_contact_date": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # If next follow-up scheduled, set it; otherwise clear
    if next_date:
        update_data["next_follow_up_date"] = next_date
        update_data["follow_up_type"] = next_type or "Call"
    else:
        update_data["next_follow_up_date"] = None
        update_data["follow_up_type"] = None
    
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
    
    # Log communication if notes provided
    if notes:
        comm_id = f"comm_{uuid.uuid4().hex[:12]}"
        comm_doc = {
            "comm_id": comm_id,
            "company_id": user.company_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "channel": body.get("follow_up_type_completed") or "Call",
            "direction": "outbound",
            "subject": "Follow-up completed",
            "content": notes,
            "logged_by": user.user_id,
            "logged_by_name": user.email,
            "created_at": now.isoformat(),
        }
        await db.comm_logs.insert_one(comm_doc)
    
    # Auto-sync to Google Calendar
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
    
    return {"message": "Follow-up completed", "next_scheduled": bool(next_date)}


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
    """Get all active team members for owner assignment dropdown.

    Source-of-truth is the `memberships` collection — a user is only shown if
    they have an ACTIVE membership in this company. This prevents stale/deleted
    users from surfacing when the `users.is_active` flag was not set at delete
    time.
    """
    # Active memberships → user_ids allowed to appear
    memberships = await db.memberships.find({
        "$or": [{"company_id": user.company_id}, {"organization_id": user.company_id}],
        "status": {"$nin": ["removed", "revoked", "suspended", "inactive", "pending"]},
    }, {"_id": 0, "user_id": 1, "role": 1}).to_list(500)
    active_user_ids = list({m.get("user_id") for m in memberships if m.get("user_id")})
    if not active_user_ids:
        return []

    users = await db.users.find(
        {
            "user_id": {"$in": active_user_ids},
            "is_active": {"$ne": False},
        },
        {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1, "role_id": 1}
    ).to_list(500)

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
            {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1,
             "email": 1, "is_active": 1, "status": 1}
        ).to_list(100)
        user_names = {}
        inactive_ids = set()
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
            # Soft-deleted / deactivated users are still in the DB but should
            # show up in the sales report under the "Inactivo" badge (amber),
            # not with the crossed-out "Eliminado" red style anymore.
            if u.get("is_active") is False or u.get("status") in ("inactive", "removed", "revoked", "suspended"):
                inactive_ids.add(u["user_id"])

        for oid in owner_stats:
            if oid != "__unassigned__":
                if oid in user_names:
                    owner_stats[oid]["owner_name"] = user_names[oid]
                    if oid in inactive_ids:
                        # Existing user but deactivated → flag same as deleted
                        # so the FE renders the "Inactivo" badge.
                        owner_stats[oid]["is_deleted"] = True
                else:
                    # User was hard-deleted from DB (legacy) — mark inactive
                    # too. Label unified to "Usuario Inactivo".
                    owner_stats[oid]["owner_name"] = "Usuario Inactivo"
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
    "Activación", "Website", "Cold Call", "Email Campaign", "WhatsApp", "Outreach", "Base de Datos", "Otro"
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
    else:
        # Ensure new default sources are added
        existing_names = {s["name"] for s in sources}
        now = datetime.now(timezone.utc).isoformat()
        added = False
        for s in DEFAULT_SOURCES:
            if s not in existing_names:
                await db.lead_sources.insert_one({
                    "source_id": f"src_{uuid.uuid4().hex[:8]}",
                    "company_id": user.company_id,
                    "name": s,
                    "created_at": now
                })
                added = True
        if added:
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
    """Get lead and client counts grouped by city for map visualization."""
    # Leads aggregation
    lead_pipeline = [
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
    lead_results = await db.leads.aggregate(lead_pipeline).to_list(None)

    # Clients aggregation
    client_pipeline = [
        {"$match": {"company_id": user.company_id, "status": {"$nin": ["Inactive", "Deleted"]}}},
        {"$project": {"city": {"$ifNull": [{"$trim": {"input": {"$ifNull": ["$city", ""]}}}, ""]}, "country": {"$ifNull": ["$country", ""]}}},
        {"$match": {"city": {"$ne": ""}}},
        {"$group": {"_id": {"city": "$city", "country": "$country"}, "total": {"$sum": 1}}},
        {"$sort": {"total": -1}}
    ]
    client_results = await db.clients.aggregate(client_pipeline).to_list(None)

    # Build combined city map
    city_map = {}
    for r in lead_results:
        city = r["_id"]["city"].strip()
        if city:
            key = city.lower()
            if key not in city_map:
                city_map[key] = {"city": city, "country": r["_id"]["country"], "leads": 0, "clients": 0, "new": 0, "contacted": 0, "engaged": 0}
            city_map[key]["leads"] += r["total"]
            city_map[key]["new"] += r["new"]
            city_map[key]["contacted"] += r["contacted"]
            city_map[key]["engaged"] += r["engaged"]

    for r in client_results:
        city = r["_id"]["city"].strip()
        if city:
            key = city.lower()
            if key not in city_map:
                city_map[key] = {"city": city, "country": r["_id"]["country"], "leads": 0, "clients": 0, "new": 0, "contacted": 0, "engaged": 0}
            city_map[key]["clients"] += r["total"]

    cities = sorted(city_map.values(), key=lambda c: c["leads"] + c["clients"], reverse=True)
    # Add total field for backwards compat
    for c in cities:
        c["total"] = c["leads"] + c["clients"]

    no_city_leads = sum(r["total"] for r in lead_results if not r["_id"]["city"].strip())
    return {"cities": cities, "no_city_count": no_city_leads}


@crm_router.get("/geo-stats/city-detail")
async def get_city_detail(city: str, user: User = Depends(get_current_user)):
    """Get leads and clients for a specific city"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "city": {"$regex": f"^{city}$", "$options": "i"}, "status": {"$nin": ["Converted", "Discarded"]}},
        {"_id": 0, "lead_id": 1, "lead_name": 1, "email": 1, "phone": 1, "source": 1, "status": 1, "outreach_status": 1, "lead_type": 1, "company_name": 1}
    ).to_list(500)
    # Clean NaN
    for l in leads:
        for k, v in list(l.items()):
            if isinstance(v, float) and v != v:
                l[k] = None

    clients = await db.clients.find(
        {"company_id": user.company_id, "city": {"$regex": f"^{city}$", "$options": "i"}},
        {"_id": 0, "client_id": 1, "display_name": 1, "email": 1, "phone": 1, "source": 1, "status": 1, "client_type": 1}
    ).to_list(500)

    return {"city": city, "leads": leads, "clients": clients}


# ============== DYNAMIC LISTS (Segmentation for Email Marketing) ==============

@crm_router.get("/dynamic-lists")
async def get_dynamic_lists(user: User = Depends(get_current_user)):
    """Get all saved dynamic lists for the organization"""
    lists = await db.crm_dynamic_lists.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return lists


@crm_router.post("/dynamic-lists")
async def create_dynamic_list(data: dict, user: User = Depends(get_current_user)):
    """Create a dynamic list with segmentation criteria"""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "list_id": f"list_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "name": name,
        "description": data.get("description", ""),
        "filters": {
            "statuses": data.get("statuses", []),
            "cities": data.get("cities", []),
            "sources": data.get("sources", []),
            "tags": data.get("tags", []),
            "lead_types": data.get("lead_types", []),
            "has_email": data.get("has_email", False),
        },
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
    }
    await db.crm_dynamic_lists.insert_one(doc)
    doc.pop("_id", None)
    return doc


@crm_router.get("/dynamic-lists/{list_id}")
async def get_dynamic_list(list_id: str, user: User = Depends(get_current_user)):
    """Get a dynamic list with its matching leads"""
    dl = await db.crm_dynamic_lists.find_one(
        {"list_id": list_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not dl:
        raise HTTPException(status_code=404, detail="List not found")

    leads = await _query_leads_by_filters(user.company_id, dl.get("filters", {}))
    dl["leads"] = leads
    dl["count"] = len(leads)
    return dl


@crm_router.post("/dynamic-lists/preview")
async def preview_dynamic_list(data: dict, user: User = Depends(get_current_user)):
    """Preview leads matching filter criteria without saving"""
    filters = {
        "statuses": data.get("statuses", []),
        "cities": data.get("cities", []),
        "sources": data.get("sources", []),
        "tags": data.get("tags", []),
        "lead_types": data.get("lead_types", []),
        "has_email": data.get("has_email", False),
    }
    leads = await _query_leads_by_filters(user.company_id, filters)
    return {"count": len(leads), "leads": leads}


@crm_router.put("/dynamic-lists/{list_id}")
async def update_dynamic_list(list_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update a dynamic list"""
    dl = await db.crm_dynamic_lists.find_one({"list_id": list_id, "company_id": user.company_id})
    if not dl:
        raise HTTPException(status_code=404, detail="List not found")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "name" in data:
        update["name"] = data["name"]
    if "description" in data:
        update["description"] = data["description"]
    for key in ["statuses", "cities", "sources", "tags", "lead_types", "has_email"]:
        if key in data:
            update[f"filters.{key}"] = data[key]

    await db.crm_dynamic_lists.update_one({"list_id": list_id}, {"$set": update})
    result = await db.crm_dynamic_lists.find_one({"list_id": list_id}, {"_id": 0})
    return result


@crm_router.delete("/dynamic-lists/{list_id}")
async def delete_dynamic_list(list_id: str, user: User = Depends(get_current_user)):
    result = await db.crm_dynamic_lists.delete_one({"list_id": list_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="List not found")
    return {"deleted": True}


async def _query_leads_by_filters(company_id: str, filters: dict) -> list:
    """Internal helper to query leads matching dynamic list filters"""
    query = {"company_id": company_id}

    statuses = filters.get("statuses", [])
    if statuses:
        query["$or"] = [
            {"status": {"$in": statuses}},
            {"outreach_status": {"$in": statuses}},
        ]

    cities = filters.get("cities", [])
    if cities:
        query["city"] = {"$in": cities}

    sources = filters.get("sources", [])
    if sources:
        query["source"] = {"$in": sources}

    tags = filters.get("tags", [])
    if tags:
        query["tags"] = {"$in": tags}

    lead_types = filters.get("lead_types", [])
    if lead_types:
        query["lead_type"] = {"$in": lead_types}

    if filters.get("has_email"):
        query["email"] = {"$exists": True, "$nin": [None, "", "nan", "null"]}

    leads = await db.leads.find(query, {"_id": 0, "lead_id": 1, "lead_name": 1, "email": 1, "phone": 1, "company_name": 1, "city": 1, "source": 1, "status": 1, "outreach_status": 1, "lead_type": 1, "tags": 1}).to_list(5000)
    # Clean any non-serializable values
    for lead in leads:
        for key, val in list(lead.items()):
            if isinstance(val, float) and (val != val):  # NaN check
                lead[key] = None
    return leads


# ============================================================================
# PERFORMANCE DASHBOARD — Activity per salesperson by day/week/month
# ============================================================================

def _period_bounds(granularity: str, offset: int, ref: datetime):
    """
    Compute UTC start/end ISO of a period.
    granularity: 'day' | 'week' | 'month'
    offset: 0 = current, -1 = previous, etc. (negative = past)
    """
    if granularity == "day":
        d = ref + timedelta(days=offset)
        start = d.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1) - timedelta(microseconds=1)
        label = start.strftime("%Y-%m-%d")
    elif granularity == "week":
        # Monday is start of the week
        weekday = ref.weekday()  # 0=Mon
        monday_this = (ref - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
        start = monday_this + timedelta(weeks=offset)
        end = start + timedelta(days=7) - timedelta(microseconds=1)
        label = f"{start.strftime('%Y-%m-%d')}_to_{end.strftime('%Y-%m-%d')}"
    elif granularity == "month":
        # First day of month
        first = ref.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Move offset months
        year = first.year
        month = first.month + offset
        while month <= 0:
            month += 12
            year -= 1
        while month > 12:
            month -= 12
            year += 1
        start = first.replace(year=year, month=month)
        # End = first of next month - 1us
        nm_year = year if month < 12 else year + 1
        nm_month = month + 1 if month < 12 else 1
        next_start = start.replace(year=nm_year, month=nm_month)
        end = next_start - timedelta(microseconds=1)
        label = start.strftime("%Y-%m")
    else:
        raise HTTPException(status_code=400, detail="Invalid granularity")
    return start, end, label


def _bucket_key(date_iso: str, granularity: str) -> str:
    """Group a date string into its bucket key."""
    try:
        d = datetime.fromisoformat(date_iso.replace("Z", "+00:00"))
    except Exception:
        return "unknown"
    if granularity == "day":
        return d.strftime("%Y-%m-%d")
    if granularity == "week":
        weekday = d.weekday()
        monday = d - timedelta(days=weekday)
        return monday.strftime("%Y-%m-%d")
    if granularity == "month":
        return d.strftime("%Y-%m")
    return "unknown"


def _delta_pct(current: float, previous: float):
    if previous == 0:
        return None if current == 0 else 100.0
    return round(((current - previous) / previous) * 100, 1)


# Weights for the salesperson score (sums to 100).
# Conversions and revenue dominate, but base activity is rewarded too.
SCORE_WEIGHTS = {
    "calls": 5,
    "emails": 5,
    "whatsapp": 5,
    "meetings": 10,
    "notes": 2,
    "new_leads": 8,
    "conversions": 25,
    "follow_ups_completed": 5,
    "proposals_sent": 10,
}


@crm_router.get("/reports/performance")
async def get_performance_report(
    user: User = Depends(get_current_user),
    granularity: str = "week",
    period_offset: int = 0,
    owner_id: Optional[str] = None,
    include_unassigned: bool = True,
    timeseries_buckets: int = 12,
):
    """
    Performance Dashboard report.
    Returns KPIs with delta vs previous period, leaderboard with score,
    timeseries buckets, and inactivity / below-goal alerts.
    """
    user_role = getattr(user, "role_id", None) or getattr(user, "role", None)
    is_sales_only = user_role == "sales"
    if is_sales_only:
        owner_id = user.user_id

    if granularity not in ("day", "week", "month"):
        raise HTTPException(status_code=400, detail="granularity must be day|week|month")

    now = datetime.now(timezone.utc)
    cur_start, cur_end, cur_label = _period_bounds(granularity, period_offset, now)
    prev_start, prev_end, prev_label = _period_bounds(granularity, period_offset - 1, now)
    cur_start_iso, cur_end_iso = cur_start.isoformat(), cur_end.isoformat()
    prev_start_iso, prev_end_iso = prev_start.isoformat(), prev_end.isoformat()

    # Range covering both periods + timeseries lookback
    ts_start, _, _ = _period_bounds(granularity, period_offset - timeseries_buckets + 1, now)
    full_start_iso = ts_start.isoformat()
    full_end_iso = cur_end_iso

    company_id = user.company_id

    # --- Fetch raw events ---
    base_q = {"company_id": company_id, "created_at": {"$gte": full_start_iso, "$lte": full_end_iso}}
    if owner_id and owner_id != "all":
        base_q["owner_id"] = owner_id

    comm_logs = await db.comm_logs.find(base_q, {"_id": 0}).to_list(20000)
    leads_in_range = await db.leads.find(base_q, {"_id": 0}).to_list(20000)

    # Conversions (use updated_at since status flip happens then)
    conv_q = {"company_id": company_id, "status": "Converted", "updated_at": {"$gte": full_start_iso, "$lte": full_end_iso}}
    if owner_id and owner_id != "all":
        conv_q["owner_id"] = owner_id
    conversions = await db.leads.find(conv_q, {"_id": 0}).to_list(20000)

    # Proposals sent — proposals where status changed to Sent in range; we use last_edited_at fallback to created_at
    prop_q = {"company_id": company_id, "status": {"$in": ["Sent", "Accepted", "Rejected"]}}
    proposals_all = await db.proposals.find(prop_q, {"_id": 0}).to_list(20000)
    # Map proposal -> owner via event -> client.owner_id (or lead chain)
    event_ids = list({p.get("event_id") for p in proposals_all if p.get("event_id")})
    events_map = {}
    if event_ids:
        evs = await db.events.find({"event_id": {"$in": event_ids}}, {"_id": 0, "event_id": 1, "client_id": 1, "owner_id": 1}).to_list(20000)
        events_map = {e["event_id"]: e for e in evs}
    client_ids = list({e.get("client_id") for e in events_map.values() if e.get("client_id")})
    clients_map = {}
    if client_ids:
        cls = await db.clients.find({"client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1, "owner_id": 1, "total_revenue": 1}).to_list(20000)
        clients_map = {c["client_id"]: c for c in cls}

    def proposal_owner(p):
        ev = events_map.get(p.get("event_id"))
        if not ev:
            return None
        if ev.get("owner_id"):
            return ev["owner_id"]
        cl = clients_map.get(ev.get("client_id"))
        if cl:
            return cl.get("owner_id")
        return None

    # Follow-ups completed in range
    fu_q = {"company_id": company_id, "follow_up_completed_at": {"$gte": full_start_iso, "$lte": full_end_iso}}
    if owner_id and owner_id != "all":
        fu_q["owner_id"] = owner_id
    follow_ups = await db.leads.find(fu_q, {"_id": 0, "lead_id": 1, "owner_id": 1, "follow_up_completed_at": 1}).to_list(20000)

    # --- Aggregate per (owner, bucket) ---
    def empty_metrics():
        return {
            "calls": 0, "emails": 0, "whatsapp": 0, "meetings": 0, "notes": 0,
            "new_leads": 0, "conversions": 0, "follow_ups_completed": 0, "proposals_sent": 0,
        }

    by_owner_bucket = {}  # (owner_id, bucket) -> metrics

    def bump(oid, ts_iso, key, n=1):
        if not ts_iso:
            return
        bk = _bucket_key(ts_iso, granularity)
        oid_key = oid or "__unassigned__"
        if include_unassigned is False and oid_key == "__unassigned__":
            return
        if owner_id and owner_id != "all" and oid_key != owner_id:
            return
        slot = by_owner_bucket.setdefault((oid_key, bk), empty_metrics())
        slot[key] += n

    # comm_logs
    for log in comm_logs:
        ct = (log.get("comm_type") or "").lower()
        oid = log.get("owner_id")
        ts = log.get("created_at")
        if ct == "call":
            bump(oid, ts, "calls")
        elif ct == "email":
            bump(oid, ts, "emails")
        elif ct in ("whatsapp", "message", "sms"):
            bump(oid, ts, "whatsapp")
        elif ct == "meeting":
            bump(oid, ts, "meetings")
        elif ct == "note":
            bump(oid, ts, "notes")

    for lead in leads_in_range:
        bump(lead.get("owner_id"), lead.get("created_at"), "new_leads")

    for cv in conversions:
        bump(cv.get("owner_id"), cv.get("updated_at"), "conversions")

    for fu in follow_ups:
        bump(fu.get("owner_id"), fu.get("follow_up_completed_at"), "follow_ups_completed")

    for p in proposals_all:
        oid = proposal_owner(p)
        # Use last_edited_at or created_at to date the proposal
        ts = p.get("last_edited_at") or p.get("created_at")
        if not ts or ts < full_start_iso or ts > full_end_iso:
            continue
        bump(oid, ts, "proposals_sent")

    # --- KPIs current vs previous ---
    def sum_in(window_start_iso, window_end_iso):
        out = empty_metrics()
        for (oid, bk), m in by_owner_bucket.items():
            # bk to date: take first day of bucket
            try:
                if granularity == "month":
                    d = datetime.fromisoformat(bk + "-01").replace(tzinfo=timezone.utc)
                else:
                    d = datetime.fromisoformat(bk).replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if window_start_iso <= d.isoformat() <= window_end_iso:
                for k in out:
                    out[k] += m[k]
        return out

    kpi_cur = sum_in(cur_start_iso, cur_end_iso)
    kpi_prev = sum_in(prev_start_iso, prev_end_iso)

    # Pipeline value = sum of estimated_value for leads not Converted/Lost as of NOW (snapshot)
    pipeline_q = {"company_id": company_id, "status": {"$nin": ["Converted", "Lost", "Discarded"]}}
    if owner_id and owner_id != "all":
        pipeline_q["owner_id"] = owner_id
    pipeline_leads = await db.leads.find(pipeline_q, {"_id": 0, "owner_id": 1, "estimated_value": 1, "lead_value": 1, "status": 1}).to_list(20000)
    pipeline_by_owner = {}
    for ld in pipeline_leads:
        ev = ld.get("estimated_value") or ld.get("lead_value") or 0
        try:
            ev = float(ev)
        except Exception:
            ev = 0
        oid = ld.get("owner_id") or "__unassigned__"
        pipeline_by_owner[oid] = pipeline_by_owner.get(oid, 0) + ev
    pipeline_total_cur = sum(pipeline_by_owner.values())

    # Revenue closed = sum of clients.total_revenue for clients with owner_id, restricted to those created in current period (proxy)
    rev_q = {"company_id": company_id, "created_at": {"$gte": cur_start_iso, "$lte": cur_end_iso}}
    if owner_id and owner_id != "all":
        rev_q["owner_id"] = owner_id
    cur_clients = await db.clients.find(rev_q, {"_id": 0, "owner_id": 1, "total_revenue": 1}).to_list(20000)
    revenue_by_owner_cur = {}
    for cl in cur_clients:
        rv = cl.get("total_revenue") or 0
        oid = cl.get("owner_id") or "__unassigned__"
        revenue_by_owner_cur[oid] = revenue_by_owner_cur.get(oid, 0) + (rv or 0)
    revenue_total_cur = sum(revenue_by_owner_cur.values())

    rev_q_prev = {"company_id": company_id, "created_at": {"$gte": prev_start_iso, "$lte": prev_end_iso}}
    if owner_id and owner_id != "all":
        rev_q_prev["owner_id"] = owner_id
    prev_clients = await db.clients.find(rev_q_prev, {"_id": 0, "owner_id": 1, "total_revenue": 1}).to_list(20000)
    revenue_total_prev = sum((c.get("total_revenue") or 0) for c in prev_clients)

    kpis = {}
    for k in ["calls", "emails", "whatsapp", "meetings", "notes", "new_leads", "conversions", "follow_ups_completed", "proposals_sent"]:
        kpis[k] = {"current": kpi_cur[k], "previous": kpi_prev[k], "delta_pct": _delta_pct(kpi_cur[k], kpi_prev[k])}
    kpis["pipeline_value"] = {"current": round(pipeline_total_cur, 2), "previous": None, "delta_pct": None}
    kpis["revenue_closed"] = {"current": round(revenue_total_cur, 2), "previous": round(revenue_total_prev, 2), "delta_pct": _delta_pct(revenue_total_cur, revenue_total_prev)}

    # --- Leaderboard ---
    # Aggregate per owner for current period
    owners_cur = {}
    owners_prev = {}
    for (oid, bk), m in by_owner_bucket.items():
        try:
            if granularity == "month":
                d_iso = datetime.fromisoformat(bk + "-01").replace(tzinfo=timezone.utc).isoformat()
            else:
                d_iso = datetime.fromisoformat(bk).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            continue
        target = None
        if cur_start_iso <= d_iso <= cur_end_iso:
            target = owners_cur
        elif prev_start_iso <= d_iso <= prev_end_iso:
            target = owners_prev
        if target is None:
            continue
        slot = target.setdefault(oid, empty_metrics())
        for k in slot:
            slot[k] += m[k]

    # Pull goals
    goals = await db.sales_goals.find({"company_id": company_id}, {"_id": 0}).to_list(200)
    goals_map = {g["owner_id"]: g for g in goals}

    # Pull users
    user_docs = await db.users.find({"company_id": company_id}, {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}).to_list(500)
    user_names = {}
    for u in user_docs:
        nm = u.get("name")
        if not nm:
            nm = (u.get("first_name") or "") + " " + (u.get("last_name") or "")
            nm = nm.strip()
        if not nm:
            email = u.get("email") or ""
            nm = email.split("@")[0].replace(".", " ").title() if email else u["user_id"]
        user_names[u["user_id"]] = nm

    # Build leaderboard entries
    all_owner_ids = set(owners_cur.keys()) | set(owners_prev.keys()) | set(pipeline_by_owner.keys()) | set(revenue_by_owner_cur.keys())
    if include_unassigned is False:
        all_owner_ids.discard("__unassigned__")

    leaderboard = []
    for oid in all_owner_ids:
        cur = owners_cur.get(oid, empty_metrics())
        prev = owners_prev.get(oid, empty_metrics())
        pname = "Sin Asignar" if oid == "__unassigned__" else user_names.get(oid, "Usuario Eliminado")
        # Score (weighted current activity)
        score = sum(cur[k] * SCORE_WEIGHTS.get(k, 0) for k in cur)
        prev_score = sum(prev[k] * SCORE_WEIGHTS.get(k, 0) for k in prev)
        delta_pct = _delta_pct(score, prev_score)

        # Goal % (weekly comparison only when granularity=week)
        goal = goals_map.get(oid)
        goal_pct = None
        if goal and granularity == "week":
            goal_keys = [
                ("weekly_calls", "calls"),
                ("weekly_emails", "emails"),
                ("weekly_whatsapp", "whatsapp"),
                ("weekly_new_leads", "new_leads"),
                ("weekly_conversions", "conversions"),
                ("weekly_follow_ups", "follow_ups_completed"),
            ]
            ratios = []
            for gk, mk in goal_keys:
                gv = goal.get(gk) or 0
                if gv > 0:
                    ratios.append((cur[mk] / gv) * 100)
            if ratios:
                goal_pct = round(sum(ratios) / len(ratios), 1)

        # Sparkline: last `timeseries_buckets` buckets ordered ascending
        sparkline = []
        for n in range(-(timeseries_buckets - 1), 1):
            s, e, _ = _period_bounds(granularity, period_offset + n, now)
            total = 0
            for (boid, bk), m in by_owner_bucket.items():
                if boid != oid:
                    continue
                try:
                    if granularity == "month":
                        d_iso = datetime.fromisoformat(bk + "-01").replace(tzinfo=timezone.utc).isoformat()
                    else:
                        d_iso = datetime.fromisoformat(bk).replace(tzinfo=timezone.utc).isoformat()
                except Exception:
                    continue
                if s.isoformat() <= d_iso <= e.isoformat():
                    total += sum(m[k] * SCORE_WEIGHTS.get(k, 0) for k in m)
            sparkline.append(total)

        # Alerts: inactivity >=3 days (only for granularity=week or day)
        alert = None
        if oid != "__unassigned__":
            three_days_ago = (now - timedelta(days=3)).isoformat()
            recent = sum(1 for log in comm_logs if log.get("owner_id") == oid and (log.get("created_at") or "") >= three_days_ago)
            recent += sum(1 for ld in leads_in_range if ld.get("owner_id") == oid and (ld.get("created_at") or "") >= three_days_ago)
            if recent == 0:
                alert = "inactivity"
            elif goal_pct is not None and goal_pct < 50:
                alert = "below_goal"

        leaderboard.append({
            "owner_id": None if oid == "__unassigned__" else oid,
            "owner_name": pname,
            "score": int(round(score)),
            "delta_pct": delta_pct,
            "metrics": cur,
            "previous_metrics": prev,
            "pipeline_value": round(pipeline_by_owner.get(oid, 0), 2),
            "revenue_closed": round(revenue_by_owner_cur.get(oid, 0), 2),
            "goal_pct": goal_pct,
            "sparkline": sparkline,
            "alert": alert,
        })

    leaderboard.sort(key=lambda x: -x["score"])
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    # --- Timeseries (aggregate across owners for the current view) ---
    timeseries = []
    for n in range(-(timeseries_buckets - 1), 1):
        s, e, lab = _period_bounds(granularity, period_offset + n, now)
        bucket_total = empty_metrics()
        for (boid, bk), m in by_owner_bucket.items():
            try:
                if granularity == "month":
                    d_iso = datetime.fromisoformat(bk + "-01").replace(tzinfo=timezone.utc).isoformat()
                else:
                    d_iso = datetime.fromisoformat(bk).replace(tzinfo=timezone.utc).isoformat()
            except Exception:
                continue
            if s.isoformat() <= d_iso <= e.isoformat():
                for k in bucket_total:
                    bucket_total[k] += m[k]
        timeseries.append({"bucket": lab, "start": s.isoformat(), "end": e.isoformat(), **bucket_total})

    # --- Alerts (separate from leaderboard) ---
    alerts = []
    for entry in leaderboard:
        if entry["alert"] == "inactivity":
            alerts.append({
                "type": "inactivity",
                "owner_id": entry["owner_id"],
                "owner_name": entry["owner_name"],
                "message": f"{entry['owner_name']} sin actividad en 3+ días",
            })
        elif entry["alert"] == "below_goal":
            alerts.append({
                "type": "below_goal",
                "owner_id": entry["owner_id"],
                "owner_name": entry["owner_name"],
                "goal_pct": entry["goal_pct"],
                "message": f"{entry['owner_name']} al {entry['goal_pct']}% de su meta semanal",
            })

    return {
        "granularity": granularity,
        "period_offset": period_offset,
        "current_period": {"label": cur_label, "start": cur_start_iso, "end": cur_end_iso},
        "previous_period": {"label": prev_label, "start": prev_start_iso, "end": prev_end_iso},
        "kpis": kpis,
        "leaderboard": leaderboard,
        "timeseries": timeseries,
        "alerts": alerts,
        "is_sales_only": is_sales_only,
    }


@crm_router.post("/reports/notify-admin-alerts")
async def notify_admin_alerts(
    user: User = Depends(get_current_user),
    granularity: str = "week",
):
    """
    Compute current-period alerts (inactivity / below_goal) and notify all admins.
    Idempotent per day — won't double-notify the same alert on the same day.
    """
    user_role = getattr(user, "role_id", None) or getattr(user, "role", None)
    if user_role not in ("admin", "owner"):
        raise HTTPException(status_code=403, detail="Admin only")

    # Reuse get_performance_report logic by calling it directly
    report = await get_performance_report(user=user, granularity=granularity, period_offset=0, owner_id=None, include_unassigned=False, timeseries_buckets=4)
    alerts = report.get("alerts", [])
    if not alerts:
        return {"ok": True, "alerts": 0, "notifications_sent": 0}

    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sent = 0
    for a in alerts:
        if not a.get("owner_id"):
            continue
        # Idempotency check
        already = await db.alert_notifications_log.find_one({
            "company_id": user.company_id,
            "owner_id": a["owner_id"],
            "type": a["type"],
            "day": today_key,
        })
        if already:
            continue
        title = "⚠️ Vendedor inactivo" if a["type"] == "inactivity" else "⚠️ Vendedor bajo meta"
        await notify_org_admins(
            org_id=user.company_id,
            notification_type=f"sales_{a['type']}",
            title=title,
            message=a["message"],
            link="/client-engagement/crm/sales-report",
            metadata={"owner_id": a["owner_id"], "alert_type": a["type"]},
        )
        await db.alert_notifications_log.insert_one({
            "company_id": user.company_id,
            "owner_id": a["owner_id"],
            "type": a["type"],
            "day": today_key,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        sent += 1

    return {"ok": True, "alerts": len(alerts), "notifications_sent": sent}


@crm_router.post("/admin/cleanup-comm-logs")
async def cleanup_comm_logs(user: User = Depends(get_current_user)):
    """
    Backfill comm_logs:
    - assign owner_id from the linked lead/client when missing
    - infer comm_type from the subject line when empty
    Admin only.
    """
    user_role = getattr(user, "role_id", None) or getattr(user, "role", None)
    if user_role not in ("admin", "owner"):
        raise HTTPException(status_code=403, detail="Admin only")

    company_id = user.company_id
    # Keep _id for upserts on records missing log_id
    logs = await db.comm_logs.find({"company_id": company_id}).to_list(50000)

    fixed_owner = 0
    fixed_type = 0
    fixed_log_id = 0

    # Build entity → owner map
    lead_owners = {ld["lead_id"]: ld.get("owner_id") for ld in await db.leads.find({"company_id": company_id}, {"_id": 0, "lead_id": 1, "owner_id": 1}).to_list(50000)}
    client_owners = {c["client_id"]: c.get("owner_id") for c in await db.clients.find({"company_id": company_id}, {"_id": 0, "client_id": 1, "owner_id": 1}).to_list(50000)}

    type_keywords = {
        "call": ["call", "llamada", "phone", "telefono", "teléfono"],
        "email": ["email", "correo", "mail"],
        "whatsapp": ["whatsapp", "wa", "wapp"],
        "meeting": ["meeting", "reunion", "reunión", "junta", "demo", "presentation"],
        "sms": ["sms", "text"],
    }

    for log in logs:
        updates = {}
        # owner_id
        if not log.get("owner_id"):
            entity_type = (log.get("entity_type") or "").lower()
            entity_id = log.get("entity_id")
            if entity_id:
                if entity_type == "lead" and entity_id in lead_owners:
                    if lead_owners[entity_id]:
                        updates["owner_id"] = lead_owners[entity_id]
                elif entity_type == "client" and entity_id in client_owners:
                    if client_owners[entity_id]:
                        updates["owner_id"] = client_owners[entity_id]
                else:
                    # Try both
                    if entity_id in lead_owners and lead_owners[entity_id]:
                        updates["owner_id"] = lead_owners[entity_id]
                    elif entity_id in client_owners and client_owners[entity_id]:
                        updates["owner_id"] = client_owners[entity_id]
        # comm_type
        if not (log.get("comm_type") or "").strip():
            subject = (log.get("subject") or "") + " " + (log.get("content") or "")
            subject_l = subject.lower()
            for ct, kws in type_keywords.items():
                if any(kw in subject_l for kw in kws):
                    updates["comm_type"] = ct
                    break
            else:
                updates["comm_type"] = "note"  # safe default

        # Backfill log_id if missing
        log_id = log.get("log_id")
        if not log_id:
            log_id = log.get("comm_log_id") or f"comm_{uuid.uuid4().hex[:12]}"
            updates["log_id"] = log_id
            fixed_log_id += 1

        if updates:
            await db.comm_logs.update_one({"_id": log["_id"]}, {"$set": updates})
            if "owner_id" in updates:
                fixed_owner += 1
            if "comm_type" in updates:
                fixed_type += 1

    return {
        "ok": True,
        "scanned": len(logs),
        "fixed_owner_id": fixed_owner,
        "fixed_comm_type": fixed_type,
        "fixed_log_id": fixed_log_id,
    }


# ============================================================================
# WEEKLY NEWSLETTER — sent every Saturday 8am via SMTP
# ============================================================================
import os as _os_newsletter

def _money_short(n):
    if n is None:
        return "—"
    try:
        n = float(n)
    except Exception:
        return "—"
    if abs(n) >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"${n / 1_000:.1f}k"
    return f"${int(round(n))}"


def _delta_arrow_html(pct):
    if pct is None or pct == 0:
        return '<span style="color:#94a3b8;font-size:11px;">—</span>'
    sign = "+" if pct > 0 else ""
    color = "#16a34a" if pct > 0 else "#dc2626"
    arrow = "▲" if pct > 0 else "▼"
    return f'<span style="color:{color};font-weight:700;font-size:11px;">{arrow} {sign}{pct}%</span>'


def _build_newsletter_html(report: dict, company_name: str, frontend_url: str) -> str:
    kpis = report.get("kpis", {})
    leaderboard = report.get("leaderboard", [])
    alerts = report.get("alerts", [])
    cur = report.get("current_period", {})

    week_label = cur.get("label", "")
    if "_to_" in week_label:
        s, e = week_label.split("_to_")
        week_label_pretty = f"{s} → {e}"
    else:
        week_label_pretty = week_label

    def kpi_block(label, key, money=False):
        v = kpis.get(key, {}) or {}
        cur_v = v.get("current", 0)
        prev_v = v.get("previous", 0)
        delta = v.get("delta_pct")
        cur_str = _money_short(cur_v) if money else str(cur_v)
        prev_str = _money_short(prev_v) if money else str(prev_v)
        return f'''
          <td align="center" style="padding:12px 6px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;width:33%;">
            <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">{label}</div>
            <div style="font-size:22px;font-weight:800;color:#1f2937;margin-top:4px;line-height:1;">{cur_str}</div>
            <div style="margin-top:4px;font-size:10px;color:#9ca3af;">vs {prev_str} {_delta_arrow_html(delta)}</div>
          </td>'''

    top3 = leaderboard[:3]
    medals = ["🥇", "🥈", "🥉"]
    leaderboard_rows = ""
    for i, entry in enumerate(top3):
        medal = medals[i]
        name = entry.get("owner_name") or "Sin Asignar"
        score = entry.get("score", 0)
        delta = entry.get("delta_pct")
        m = entry.get("metrics", {})
        pipeline = entry.get("pipeline_value", 0)
        revenue = entry.get("revenue_closed", 0)
        leaderboard_rows += f'''
        <tr>
          <td style="padding:10px 12px;border-top:1px solid #f1f5f9;">
            <div style="font-size:14px;font-weight:700;color:#1f2937;">{medal} {name}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:3px;">
              📞 {m.get("calls", 0)} · ✉️ {m.get("emails", 0)} · 💬 {m.get("whatsapp", 0)} · 🤝 {m.get("meetings", 0)} · ✅ {m.get("conversions", 0)}
            </div>
            <div style="font-size:11px;color:#6b7280;margin-top:3px;">
              💼 {_money_short(pipeline)} pipeline · 💰 {_money_short(revenue)} cerrado
            </div>
          </td>
          <td align="right" style="padding:10px 12px;border-top:1px solid #f1f5f9;vertical-align:middle;">
            <div style="font-size:18px;font-weight:800;color:#1f2937;">{score}</div>
            <div>{_delta_arrow_html(delta)}</div>
          </td>
        </tr>'''

    alerts_html = ""
    if alerts:
        items = "".join(
            f'<li style="margin-bottom:4px;color:#92400e;">{("💤" if a.get("type") == "inactivity" else "⚠️")} {a.get("message", "")}</li>'
            for a in alerts[:8]
        )
        alerts_html = f'''
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-top:18px;">
          <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">⚠️ Alertas de la semana</div>
          <ul style="margin:8px 0 0 0;padding-left:18px;font-size:13px;">{items}</ul>
        </div>'''

    pipeline_total = (kpis.get("pipeline_value") or {}).get("current", 0)
    revenue_total = (kpis.get("revenue_closed") or {}).get("current", 0)
    revenue_delta = (kpis.get("revenue_closed") or {}).get("delta_pct")

    dashboard_link = f"{frontend_url}/client-engagement/crm/sales-report"

    return f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:24px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:24px 28px 16px;background:#1f2937;color:#ffffff;">
          <div style="font-size:11px;color:#AED768;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Performance Weekly · {company_name}</div>
          <div style="font-size:24px;font-weight:800;margin-top:6px;">Tu equipo esta semana 📊</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">{week_label_pretty}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:14px;border-radius:10px;background:#eff6ff;width:50%;border:1px solid #dbeafe;">
                <div style="font-size:10px;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Pipeline activo</div>
                <div style="font-size:28px;font-weight:800;color:#1d4ed8;margin-top:6px;line-height:1;">{_money_short(pipeline_total)}</div>
              </td>
              <td style="width:8px;"></td>
              <td align="center" style="padding:14px;border-radius:10px;background:#f0fdf4;width:50%;border:1px solid #bbf7d0;">
                <div style="font-size:10px;color:#166534;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Revenue cerrado</div>
                <div style="font-size:28px;font-weight:800;color:#166534;margin-top:6px;line-height:1;">{_money_short(revenue_total)}</div>
                <div style="margin-top:4px;">{_delta_arrow_html(revenue_delta)}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:14px 28px 0;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:10px;">Actividad del equipo</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing:6px;">
            <tr>{kpi_block("Llamadas", "calls")}{kpi_block("Emails", "emails")}{kpi_block("WhatsApp", "whatsapp")}</tr>
            <tr>{kpi_block("Reuniones", "meetings")}{kpi_block("Conversiones", "conversions")}{kpi_block("Propuestas", "proposals_sent")}</tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 28px 0;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:10px;">🏆 Top performers</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1f5f9;border-radius:10px;">
            {leaderboard_rows or '<tr><td style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">Sin actividad esta semana</td></tr>'}
          </table>
        </td></tr>
        <tr><td style="padding:0 28px;">{alerts_html}</td></tr>
        <tr><td align="center" style="padding:24px 28px 28px;">
          <a href="{dashboard_link}" style="display:inline-block;background:#AED768;color:#1f2937;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;">Ver Dashboard completo →</a>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #f1f5f9;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;">
            Recibes este email porque eres admin de <strong>{company_name}</strong> en Kora OS.<br>
            Llega cada sábado a las 8:00 AM. <a href="{frontend_url}" style="color:#6b7280;">Kora OS</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>'''


@crm_router.post("/reports/send-weekly-newsletter")
async def send_weekly_newsletter_endpoint(
    user: User = Depends(get_current_user),
    test_only_to_me: bool = False,
):
    """
    Trigger the weekly Performance newsletter for the current company.
    Admin only. Sends to all admins by default; if test_only_to_me=true, sends only to caller.
    """
    user_role = getattr(user, "role_id", None) or getattr(user, "role", None)
    if user_role not in ("admin", "owner"):
        raise HTTPException(status_code=403, detail="Admin only")

    target = user.user_id if test_only_to_me else None
    return await _send_weekly_newsletter_for_company(user.company_id, target_user_id=target)


async def _send_weekly_newsletter_for_company(company_id: str, target_user_id: Optional[str] = None) -> dict:
    """Build and send the weekly newsletter for one company."""
    from utils.smtp_service import send_smtp_email, is_smtp_configured

    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "name": 1})
    company_name = (company or {}).get("name", "tu equipo")

    if target_user_id:
        users = await db.users.find({"user_id": target_user_id, "company_id": company_id}, {"_id": 0, "email": 1, "name": 1}).to_list(2)
    else:
        users = await db.users.find(
            {"company_id": company_id, "role": {"$in": ["admin", "owner", "manager"]}},
            {"_id": 0, "email": 1, "name": 1, "user_id": 1},
        ).to_list(50)

    recipients = [u["email"] for u in users if u.get("email")]
    if not recipients:
        return {"ok": False, "message": "no admin emails", "sent": 0}

    class _U:
        def __init__(self, cid):
            self.company_id = cid
            self.user_id = None
            self.role = "admin"
    fake = _U(company_id)
    report = await get_performance_report(user=fake, granularity="week", period_offset=-1, owner_id=None, include_unassigned=False, timeseries_buckets=4)

    frontend_url = _os_newsletter.environ.get("FRONTEND_URL", "https://ourkora.com")
    html = _build_newsletter_html(report, company_name, frontend_url)

    if not is_smtp_configured():
        return {"ok": False, "message": "SMTP not configured — set SMTP_USER/SMTP_PASSWORD in backend/.env", "sent": 0, "would_send_to": recipients, "demo_mode": True}

    subject = f"📊 Performance Weekly · {company_name}"
    res = send_smtp_email(to=recipients, subject=subject, html=html, text_fallback=f"Tu reporte semanal de Kora OS está listo: {frontend_url}/client-engagement/crm/sales-report")

    await db.newsletter_log.insert_one({
        "company_id": company_id,
        "type": "weekly_performance",
        "recipients": recipients,
        "success": res.get("success", False),
        "message": res.get("message", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": res.get("success", False), "sent": len(recipients) if res.get("success") else 0, "recipients": recipients, "smtp_message": res.get("message", "")}

