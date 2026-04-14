# routers/companies.py - Company (B2B account) management endpoints
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from models.auth import User
from dependencies import get_current_user, db
from models.crm import CompanyCreate, ContactCreate

companies_router = APIRouter(prefix="/companies", tags=["companies"])


def generate_company_id():
    """Generate unique company entity ID"""
    import secrets
    return f"comp_{secrets.token_hex(6)}"


def generate_contact_id():
    """Generate unique contact ID"""
    import secrets
    return f"contact_{secrets.token_hex(6)}"


# ============== CUSTOM INDUSTRIES ==============

class IndustryCreate(BaseModel):
    name: str
    name_es: Optional[str] = None


@companies_router.get("/industries")
async def list_industries(user: User = Depends(get_current_user)):
    """Get all industries (predefined + custom for this org)"""
    org_id = user.company_id or user.active_org_id
    
    # Predefined industries
    predefined = [
        {"value": "technology", "labelEn": "Technology", "labelEs": "Tecnología", "custom": False},
        {"value": "healthcare", "labelEn": "Healthcare", "labelEs": "Salud", "custom": False},
        {"value": "finance", "labelEn": "Finance & Banking", "labelEs": "Finanzas y Banca", "custom": False},
        {"value": "retail", "labelEn": "Retail & E-commerce", "labelEs": "Retail y E-commerce", "custom": False},
        {"value": "manufacturing", "labelEn": "Manufacturing", "labelEs": "Manufactura", "custom": False},
        {"value": "real_estate", "labelEn": "Real Estate", "labelEs": "Bienes Raíces", "custom": False},
        {"value": "hospitality", "labelEn": "Hospitality & Tourism", "labelEs": "Hospitalidad y Turismo", "custom": False},
        {"value": "education", "labelEn": "Education", "labelEs": "Educación", "custom": False},
        {"value": "media", "labelEn": "Media & Entertainment", "labelEs": "Medios y Entretenimiento", "custom": False},
        {"value": "nonprofit", "labelEn": "Non-Profit", "labelEs": "Sin Fines de Lucro", "custom": False},
        {"value": "government", "labelEn": "Government", "labelEs": "Gobierno", "custom": False},
        {"value": "legal", "labelEn": "Legal Services", "labelEs": "Servicios Legales", "custom": False},
        {"value": "consulting", "labelEn": "Consulting", "labelEs": "Consultoría", "custom": False},
        {"value": "construction", "labelEn": "Construction", "labelEs": "Construcción", "custom": False},
        {"value": "automotive", "labelEn": "Automotive", "labelEs": "Automotriz", "custom": False},
        {"value": "food_beverage", "labelEn": "Food & Beverage", "labelEs": "Alimentos y Bebidas", "custom": False},
        {"value": "beauty", "labelEn": "Beauty & Wellness", "labelEs": "Belleza y Bienestar", "custom": False},
        {"value": "logistics", "labelEn": "Logistics & Transport", "labelEs": "Logística y Transporte", "custom": False},
        {"value": "agriculture", "labelEn": "Agriculture", "labelEs": "Agricultura", "custom": False},
    ]
    
    # Get custom industries for this org
    custom = await db.custom_industries.find(
        {"organization_id": org_id},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    custom_formatted = [
        {
            "value": f"custom_{ind['industry_id']}", 
            "labelEn": ind["name"], 
            "labelEs": ind.get("name_es") or ind["name"],
            "custom": True,
            "industry_id": ind["industry_id"]
        } 
        for ind in custom
    ]
    
    return {"predefined": predefined, "custom": custom_formatted}


@companies_router.post("/industries")
async def create_custom_industry(data: IndustryCreate, user: User = Depends(get_current_user)):
    """Create a custom industry for this organization"""
    org_id = user.company_id or user.active_org_id
    
    # Check for duplicate
    existing = await db.custom_industries.find_one({
        "organization_id": org_id,
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Industry already exists")
    
    import secrets
    industry = {
        "industry_id": f"ind_{secrets.token_hex(4)}",
        "organization_id": org_id,
        "name": data.name,
        "name_es": data.name_es or data.name,
        "created_at": datetime.utcnow(),
        "created_by": user.user_id
    }
    
    await db.custom_industries.insert_one(industry)
    del industry["_id"]
    
    return {
        "value": f"custom_{industry['industry_id']}", 
        "labelEn": industry["name"], 
        "labelEs": industry["name_es"],
        "custom": True,
        "industry_id": industry["industry_id"]
    }


@companies_router.delete("/industries/{industry_id}")
async def delete_custom_industry(industry_id: str, user: User = Depends(get_current_user)):
    """Delete a custom industry"""
    org_id = user.company_id or user.active_org_id
    
    result = await db.custom_industries.delete_one({
        "industry_id": industry_id,
        "organization_id": org_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Industry not found")
    
    return {"success": True, "message": "Industry deleted"}


# ============== COMPANY CRUD ==============

@companies_router.get("")
async def list_companies(
    status: Optional[str] = None,
    search: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List all companies for the organization"""
    org_id = user.company_id or user.active_org_id
    
    query = {"organization_id": org_id}
    if status:
        query["status"] = status
    
    companies = await db.company_entities.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    
    # Search filter
    if search:
        search_lower = search.lower()
        companies = [c for c in companies if 
                    search_lower in (c.get("name") or "").lower() or
                    search_lower in (c.get("email") or "").lower() or
                    search_lower in (c.get("industry") or "").lower()]
    
    # Enrich with contacts count
    for company in companies:
        ce_id = company.get("company_entity_id") or company.get("entity_id")
        if not ce_id:
            continue
        contacts_count = await db.contacts.count_documents({
            "organization_id": org_id,
            "company_entity_id": ce_id
        })
        company["contacts_count"] = contacts_count
        # Normalize field name for frontend
        if "company_entity_id" not in company and "entity_id" in company:
            company["company_entity_id"] = company["entity_id"]
    
    return companies


@companies_router.post("")
async def create_company(data: CompanyCreate, user: User = Depends(get_current_user)):
    """Create a new company"""
    org_id = user.company_id or user.active_org_id
    now = datetime.utcnow()
    
    # Check for duplicate by name
    existing = await db.company_entities.find_one({
        "organization_id": org_id,
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Company '{data.name}' already exists")
    
    company = {
        "company_entity_id": generate_company_id(),
        "organization_id": org_id,
        "name": data.name,
        "industry": data.industry,
        "website": data.website,
        "phone": data.phone,
        "email": data.email,
        "address": data.address,
        "city": data.city,
        "country": data.country,
        "rnc": data.rnc,
        "description": data.description,
        "social_linkedin": data.social_linkedin,
        "social_instagram": data.social_instagram,
        "tags": data.tags or [],
        "notes": data.notes,
        "has_credit": data.has_credit,
        "credit_limit": data.credit_limit,
        "credit_used": 0.0,
        "payment_terms": data.payment_terms,
        "contacts_count": 0,
        "leads_count": 0,
        "total_revenue": 0.0,
        "events_count": 0,
        "status": data.status or "Lead",  # Use provided status or default to Lead
        "owner_id": data.owner_id or user.user_id,  # Use provided owner or default to current user
        "created_at": now,
        "updated_at": now
    }
    
    await db.company_entities.insert_one(company)
    del company["_id"]
    
    return company


@companies_router.get("/{company_entity_id}")
async def get_company(company_entity_id: str, user: User = Depends(get_current_user)):
    """Get company details with contacts"""
    org_id = user.company_id or user.active_org_id
    
    company = await db.company_entities.find_one({
        "$or": [
            {"company_entity_id": company_entity_id, "organization_id": org_id},
            {"entity_id": company_entity_id, "organization_id": org_id},
        ]
    }, {"_id": 0})
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    ce_id = company.get("company_entity_id") or company.get("entity_id")
    
    # Normalize field
    if "company_entity_id" not in company:
        company["company_entity_id"] = ce_id
    
    # Get contacts
    contacts = await db.contacts.find({
        "organization_id": org_id,
        "company_entity_id": ce_id
    }, {"_id": 0}).sort("is_primary", -1).to_list(100)
    
    company["contacts"] = contacts
    
    # Get associated leads
    leads = await db.leads.find({
        "company_id": org_id,
        "company_entity_id": ce_id
    }, {"_id": 0, "lead_id": 1, "lead_name": 1, "status": 1, "created_at": 1}).to_list(50)
    
    company["leads"] = leads
    
    return company


@companies_router.put("/{company_entity_id}")
async def update_company(
    company_entity_id: str, 
    data: CompanyCreate, 
    user: User = Depends(get_current_user)
):
    """Update company details"""
    org_id = user.company_id or user.active_org_id
    
    company = await db.company_entities.find_one({
        "company_entity_id": company_entity_id,
        "organization_id": org_id
    })
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    update_data = {
        "name": data.name,
        "industry": data.industry,
        "website": data.website,
        "phone": data.phone,
        "email": data.email,
        "address": data.address,
        "city": data.city,
        "country": data.country,
        "rnc": data.rnc,
        "description": data.description,
        "social_linkedin": data.social_linkedin,
        "social_instagram": data.social_instagram,
        "tags": data.tags or [],
        "notes": data.notes,
        "has_credit": data.has_credit,
        "credit_limit": data.credit_limit,
        "payment_terms": data.payment_terms,
        "updated_at": datetime.utcnow()
    }
    
    # Only update status if provided
    if data.status:
        update_data["status"] = data.status
    
    # Only update owner_id if provided
    if data.owner_id is not None:
        update_data["owner_id"] = data.owner_id
    
    await db.company_entities.update_one(
        {"company_entity_id": company_entity_id},
        {"$set": update_data}
    )
    
    return {"success": True, "company_entity_id": company_entity_id}


@companies_router.delete("/{company_entity_id}")
async def delete_company(company_entity_id: str, user: User = Depends(get_current_user)):
    """Delete a company (soft delete by setting status to Deleted)"""
    org_id = user.company_id or user.active_org_id
    
    # Check if company exists
    company = await db.company_entities.find_one({
        "company_entity_id": company_entity_id,
        "organization_id": org_id
    })
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check for associated contacts
    contacts_count = await db.contacts.count_documents({
        "company_entity_id": company_entity_id
    })
    
    if contacts_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete company with {contacts_count} contacts. Remove contacts first."
        )
    
    # Soft delete
    await db.company_entities.update_one(
        {"company_entity_id": company_entity_id},
        {"$set": {"status": "Deleted", "updated_at": datetime.utcnow()}}
    )
    
    return {"success": True, "message": "Company deleted"}


@companies_router.patch("/{company_entity_id}/status")
async def update_company_status(
    company_entity_id: str,
    status: str,
    user: User = Depends(get_current_user)
):
    """Update company status (Lead, Active, Inactive, Client)"""
    org_id = user.company_id or user.active_org_id
    
    valid_statuses = ["Lead", "Active", "Inactive", "Client"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.company_entities.update_one(
        {"company_entity_id": company_entity_id, "organization_id": org_id},
        {"$set": {"status": status, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    
    return {"success": True, "status": status}


# ============== CONTACTS WITHIN COMPANY ==============

@companies_router.get("/{company_entity_id}/contacts")
async def list_company_contacts(
    company_entity_id: str,
    user: User = Depends(get_current_user)
):
    """List all contacts for a company"""
    org_id = user.company_id or user.active_org_id
    
    contacts = await db.contacts.find({
        "organization_id": org_id,
        "company_entity_id": company_entity_id
    }, {"_id": 0}).sort("is_primary", -1).to_list(100)
    
    return contacts


@companies_router.post("/{company_entity_id}/contacts")
async def add_contact_to_company(
    company_entity_id: str,
    data: ContactCreate,
    user: User = Depends(get_current_user)
):
    """Add a contact to a company"""
    org_id = user.company_id or user.active_org_id
    now = datetime.utcnow()
    
    # Verify company exists
    company = await db.company_entities.find_one({
        "company_entity_id": company_entity_id,
        "organization_id": org_id
    })
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # If this is primary, unset other primaries
    if data.is_primary:
        await db.contacts.update_many(
            {"company_entity_id": company_entity_id, "is_primary": True},
            {"$set": {"is_primary": False}}
        )
    
    contact = {
        "contact_id": generate_contact_id(),
        "organization_id": org_id,
        "company_entity_id": company_entity_id,
        "company_id": org_id,  # Legacy field
        "client_id": data.client_id,
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "whatsapp": data.whatsapp,
        "role": data.role or data.role_title,
        "role_title": data.role_title or data.role,
        "department": data.department,
        "is_primary": data.is_primary,
        "is_billing_contact": data.is_billing_contact,
        "is_decision_maker": data.is_decision_maker,
        "notes": None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.contacts.insert_one(contact)
    del contact["_id"]
    
    # Update company contacts count
    await db.company_entities.update_one(
        {"company_entity_id": company_entity_id},
        {"$inc": {"contacts_count": 1}, "$set": {"updated_at": now}}
    )
    
    return contact


@companies_router.put("/{company_entity_id}/contacts/{contact_id}")
async def update_contact(
    company_entity_id: str,
    contact_id: str,
    data: ContactCreate,
    user: User = Depends(get_current_user)
):
    """Update a contact"""
    org_id = user.company_id or user.active_org_id
    
    contact = await db.contacts.find_one({
        "contact_id": contact_id,
        "organization_id": org_id
    })
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # If setting as primary, unset other primaries
    if data.is_primary:
        await db.contacts.update_many(
            {"company_entity_id": company_entity_id, "is_primary": True, "contact_id": {"$ne": contact_id}},
            {"$set": {"is_primary": False}}
        )
    
    update_data = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "whatsapp": data.whatsapp,
        "role": data.role or data.role_title,
        "role_title": data.role_title or data.role,
        "department": data.department,
        "is_primary": data.is_primary,
        "is_billing_contact": data.is_billing_contact,
        "is_decision_maker": data.is_decision_maker,
        "updated_at": datetime.utcnow()
    }
    
    await db.contacts.update_one(
        {"contact_id": contact_id},
        {"$set": update_data}
    )
    
    return {"success": True, "contact_id": contact_id}


@companies_router.delete("/{company_entity_id}/contacts/{contact_id}")
async def delete_contact(
    company_entity_id: str,
    contact_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a contact from a company"""
    org_id = user.company_id or user.active_org_id
    
    result = await db.contacts.delete_one({
        "contact_id": contact_id,
        "organization_id": org_id,
        "company_entity_id": company_entity_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # Update company contacts count
    await db.company_entities.update_one(
        {"company_entity_id": company_entity_id},
        {"$inc": {"contacts_count": -1}, "$set": {"updated_at": datetime.utcnow()}}
    )
    
    return {"success": True, "message": "Contact deleted"}


# ============== LINK EXISTING LEAD TO COMPANY ==============

@companies_router.post("/{company_entity_id}/link-lead/{lead_id}")
async def link_lead_to_company(
    company_entity_id: str,
    lead_id: str,
    user: User = Depends(get_current_user)
):
    """Link an existing lead to a company"""
    org_id = user.company_id or user.active_org_id
    
    # Verify company exists
    company = await db.company_entities.find_one({
        "company_entity_id": company_entity_id,
        "organization_id": org_id
    })
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Update lead
    result = await db.leads.update_one(
        {"lead_id": lead_id, "company_id": org_id},
        {"$set": {
            "company_entity_id": company_entity_id,
            "company_name": company["name"],
            "updated_at": datetime.utcnow()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Update company leads count
    await db.company_entities.update_one(
        {"company_entity_id": company_entity_id},
        {"$inc": {"leads_count": 1}, "$set": {"updated_at": datetime.utcnow()}}
    )
    
    return {"success": True, "message": "Lead linked to company"}


# ============== MIGRATION HELPER ==============

@companies_router.post("/migrate-from-leads")
async def migrate_companies_from_leads(user: User = Depends(get_current_user)):
    """
    One-time migration: Create company records from existing leads with company_name.
    This is non-destructive and will skip duplicates.
    """
    org_id = user.company_id or user.active_org_id
    now = datetime.utcnow()
    
    # Find all unique company names from leads
    leads_with_companies = await db.leads.find({
        "company_id": org_id,
        "company_name": {"$exists": True, "$ne": "", "$ne": None},
        "client_type": "Company"
    }, {"company_name": 1, "lead_id": 1, "phone": 1, "email": 1, "address": 1, "city": 1, "country": 1, "rnc": 1}).to_list(1000)
    
    # Group by company name (case-insensitive)
    company_map = {}
    for lead in leads_with_companies:
        name = lead.get("company_name", "").strip()
        if name:
            key = name.lower()
            if key not in company_map:
                company_map[key] = {
                    "name": name,
                    "leads": [],
                    "phone": lead.get("phone"),
                    "email": lead.get("email"),
                    "address": lead.get("address"),
                    "city": lead.get("city"),
                    "country": lead.get("country"),
                    "rnc": lead.get("rnc")
                }
            company_map[key]["leads"].append(lead["lead_id"])
    
    created = 0
    linked = 0
    skipped = 0
    
    for company_data in company_map.values():
        # Check if company already exists
        existing = await db.company_entities.find_one({
            "organization_id": org_id,
            "name": {"$regex": f"^{company_data['name']}$", "$options": "i"}
        })
        
        if existing:
            company_entity_id = existing["company_entity_id"]
            skipped += 1
        else:
            # Create new company
            company_entity_id = generate_company_id()
            company = {
                "company_entity_id": company_entity_id,
                "organization_id": org_id,
                "name": company_data["name"],
                "phone": company_data.get("phone"),
                "email": company_data.get("email"),
                "address": company_data.get("address"),
                "city": company_data.get("city"),
                "country": company_data.get("country"),
                "rnc": company_data.get("rnc"),
                "industry": None,
                "website": None,
                "description": None,
                "social_linkedin": None,
                "social_instagram": None,
                "tags": [],
                "notes": None,
                "has_credit": False,
                "credit_limit": 0.0,
                "credit_used": 0.0,
                "payment_terms": "immediate",
                "contacts_count": 0,
                "leads_count": len(company_data["leads"]),
                "total_revenue": 0.0,
                "events_count": 0,
                "status": "Lead",
                "owner_id": None,
                "created_at": now,
                "updated_at": now
            }
            await db.company_entities.insert_one(company)
            created += 1
        
        # Link leads to company
        for lead_id in company_data["leads"]:
            result = await db.leads.update_one(
                {"lead_id": lead_id, "company_entity_id": {"$exists": False}},
                {"$set": {"company_entity_id": company_entity_id}}
            )
            if result.modified_count > 0:
                linked += 1
    
    return {
        "success": True,
        "companies_created": created,
        "companies_skipped": skipped,
        "leads_linked": linked
    }
