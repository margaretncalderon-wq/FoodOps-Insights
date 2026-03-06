# routers/partners.py - Partner Management Routes
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import shutil
from pathlib import Path

from config import db, UPLOADS_DIR
from models.auth import User
from models.partners import (
    PartnerCreate, PartnerUpdate, Partner,
    PARTNER_STATUS_OPTIONS, PREFERRED_TIER_OPTIONS, PARTNER_TYPE_OPTIONS,
    PRIMARY_CATEGORY_OPTIONS, SERVICE_AREA_TYPE_OPTIONS, PRICING_LEVEL_OPTIONS,
    CAPABILITY_OPTIONS
)
from routers.auth import get_current_user
from utils.activity_logger import log_activity

partners_router = APIRouter(prefix="/partners", tags=["Partners"])

# Ensure partners attachments directory exists
PARTNER_ATTACHMENTS_DIR = UPLOADS_DIR / "partner_attachments"
PARTNER_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

# Allowed file types for partner attachments
ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}

ATTACHMENT_TYPE_OPTIONS = [
    {"value": "catalog", "label": "Catalog", "label_es": "Catálogo"},
    {"value": "coi", "label": "COI (Certificate of Insurance)", "label_es": "COI (Certificado de Seguro)"},
    {"value": "contract", "label": "Contract", "label_es": "Contrato"},
    {"value": "license", "label": "License", "label_es": "Licencia"},
    {"value": "portfolio", "label": "Portfolio", "label_es": "Portafolio"},
    {"value": "price_list", "label": "Price List", "label_es": "Lista de Precios"},
    {"value": "w9", "label": "W9 / Tax Form", "label_es": "W9 / Formulario Fiscal"},
    {"value": "nda", "label": "NDA", "label_es": "NDA"},
    {"value": "sow", "label": "SOW (Scope of Work)", "label_es": "SOW (Alcance de Trabajo)"},
    {"value": "other", "label": "Other", "label_es": "Otro"},
]


# ============== OPTIONS ENDPOINTS ==============

@partners_router.get("/options")
async def get_partner_options():
    """Get all dropdown options for partner forms"""
    return {
        "status": PARTNER_STATUS_OPTIONS,
        "preferred_tier": PREFERRED_TIER_OPTIONS,
        "partner_type": PARTNER_TYPE_OPTIONS,
        "primary_category": PRIMARY_CATEGORY_OPTIONS,
        "service_area_type": SERVICE_AREA_TYPE_OPTIONS,
        "pricing_level": PRICING_LEVEL_OPTIONS,
        "capabilities": CAPABILITY_OPTIONS,
        "attachment_types": ATTACHMENT_TYPE_OPTIONS,
    }


# ============== CRUD ENDPOINTS ==============

@partners_router.get("")
async def get_partners(
    user: User = Depends(get_current_user),
    status: Optional[str] = None,
    partner_type: Optional[str] = None,
    primary_category: Optional[str] = None,
    is_preferred: Optional[bool] = None,
    preferred_tier: Optional[str] = None,
    pricing_level: Optional[str] = None,
    country: Optional[str] = None,
    state_province: Optional[str] = None,
    city: Optional[str] = None,
    has_contract: Optional[bool] = None,
    has_documents: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = "partner_name",
    sort_order: str = "asc",
    skip: int = 0,
    limit: int = 100
):
    """Get all partners with filtering"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Build query
    query = {"company_id": company_id}
    
    if status:
        query["status"] = status
    if partner_type:
        query["partner_type"] = partner_type
    if primary_category:
        query["primary_category"] = primary_category
    if is_preferred is not None:
        query["is_preferred"] = is_preferred
    if preferred_tier:
        query["preferred_tier"] = preferred_tier
    if pricing_level:
        query["pricing_level"] = pricing_level
    if country:
        query["hq_country"] = country
    if state_province:
        query["hq_state_province"] = state_province
    if city:
        query["hq_city"] = city
    if has_contract is not None:
        if has_contract:
            query["linked_contract_id"] = {"$ne": None}
        else:
            query["$or"] = [{"linked_contract_id": None}, {"linked_contract_id": {"$exists": False}}]
    if has_documents is not None:
        query["documents_on_file"] = has_documents
    
    if search:
        query["$or"] = [
            {"partner_name": {"$regex": search, "$options": "i"}},
            {"legal_name": {"$regex": search, "$options": "i"}},
            {"display_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"primary_contact_name": {"$regex": search, "$options": "i"}},
        ]
    
    # Sort
    sort_direction = 1 if sort_order == "asc" else -1
    
    # Execute query
    cursor = db.partners.find(query, {"_id": 0})
    cursor = cursor.sort(sort_by, sort_direction)
    cursor = cursor.skip(skip).limit(limit)
    
    partners = await cursor.to_list(limit)
    
    # Get total count
    total = await db.partners.count_documents(query)
    
    return {
        "partners": partners,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@partners_router.get("/stats")
async def get_partner_stats(user: User = Depends(get_current_user)):
    """Get partner statistics for dashboard"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Aggregate stats
    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$facet": {
            "by_status": [
                {"$group": {"_id": "$status", "count": {"$sum": 1}}}
            ],
            "by_category": [
                {"$group": {"_id": "$primary_category", "count": {"$sum": 1}}}
            ],
            "by_type": [
                {"$group": {"_id": "$partner_type", "count": {"$sum": 1}}}
            ],
            "by_country": [
                {"$group": {"_id": "$hq_country", "count": {"$sum": 1}}}
            ],
            "totals": [
                {"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "preferred": {"$sum": {"$cond": ["$is_preferred", 1, 0]}},
                    "with_contract": {"$sum": {"$cond": [{"$ne": ["$linked_contract_id", None]}, 1, 0]}},
                    "with_issues": {"$sum": {"$cond": ["$issues_flag", 1, 0]}},
                }}
            ]
        }}
    ]
    
    result = await db.partners.aggregate(pipeline).to_list(1)
    
    if not result:
        return {
            "by_status": [],
            "by_category": [],
            "by_type": [],
            "by_country": [],
            "totals": {"total": 0, "preferred": 0, "with_contract": 0, "with_issues": 0}
        }
    
    data = result[0]
    totals = data["totals"][0] if data["totals"] else {"total": 0, "preferred": 0, "with_contract": 0, "with_issues": 0}
    if totals:
        totals.pop("_id", None)
    
    return {
        "by_status": data["by_status"],
        "by_category": data["by_category"],
        "by_type": data["by_type"],
        "by_country": data["by_country"],
        "totals": totals
    }


@partners_router.get("/locations")
async def get_partner_locations(user: User = Depends(get_current_user)):
    """Get unique locations for filtering"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$group": {
            "_id": {
                "country": "$hq_country",
                "state": "$hq_state_province",
                "city": "$hq_city"
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.country": 1, "_id.state": 1, "_id.city": 1}}
    ]
    
    result = await db.partners.aggregate(pipeline).to_list(500)
    
    # Organize hierarchically
    locations = {}
    for item in result:
        loc = item["_id"]
        country = loc.get("country") or "Unknown"
        state = loc.get("state") or "Unknown"
        city = loc.get("city") or "Unknown"
        
        if country not in locations:
            locations[country] = {"states": {}, "count": 0}
        locations[country]["count"] += item["count"]
        
        if state not in locations[country]["states"]:
            locations[country]["states"][state] = {"cities": [], "count": 0}
        locations[country]["states"][state]["count"] += item["count"]
        
        if city and city != "Unknown":
            locations[country]["states"][state]["cities"].append({
                "name": city,
                "count": item["count"]
            })
    
    return locations


@partners_router.get("/{partner_id}")
async def get_partner(partner_id: str, user: User = Depends(get_current_user)):
    """Get a single partner by ID"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Fetch linked data if available
    if partner.get("linked_culinary_supplier_id"):
        supplier = await db.suppliers.find_one(
            {"supplier_id": partner["linked_culinary_supplier_id"]},
            {"_id": 0, "supplier_id": 1, "name": 1}
        )
        partner["linked_supplier"] = supplier
    
    if partner.get("linked_contract_id"):
        contract = await db.contracts.find_one(
            {"contract_id": partner["linked_contract_id"]},
            {"_id": 0, "contract_id": 1, "title": 1, "status": 1}
        )
        partner["linked_contract"] = contract
    
    if partner.get("default_cost_center_id"):
        cost_center = await db.cost_centers.find_one(
            {"cost_center_id": partner["default_cost_center_id"]},
            {"_id": 0, "cost_center_id": 1, "name": 1}
        )
        partner["cost_center"] = cost_center
    
    return partner


@partners_router.post("")
async def create_partner(data: PartnerCreate, user: User = Depends(get_current_user)):
    """Create a new partner"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    partner_id = f"partner_{uuid.uuid4().hex[:12]}"
    
    partner_doc = {
        "partner_id": partner_id,
        "company_id": company_id,
        **data.model_dump(),
        "total_projects_used": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id,
        "updated_by": user.user_id
    }
    
    await db.partners.insert_one(partner_doc)
    
    # Log activity
    await log_activity(
        module="partners",
        action="create",
        entity_type="partner",
        entity_id=partner_id,
        entity_name=data.partner_name,
        **user_info(user)
    )
    
    partner_doc.pop("_id", None)
    return partner_doc


@partners_router.put("/{partner_id}")
async def update_partner(
    partner_id: str,
    data: PartnerUpdate,
    user: User = Depends(get_current_user)
):
    """Update a partner"""
    company_id = user.company_id or user.active_org_id
    
    # Get existing partner
    existing = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Build update
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user.user_id
    
    await db.partners.update_one(
        {"partner_id": partner_id},
        {"$set": update_data}
    )
    
    # Log activity
    await log_activity(
        module="partners",
        action="update",
        entity_type="partner",
        entity_id=partner_id,
        entity_name=existing.get("partner_name"),
        **user_info(user)
    )
    
    updated = await db.partners.find_one({"partner_id": partner_id}, {"_id": 0})
    return updated


@partners_router.delete("/{partner_id}")
async def delete_partner(partner_id: str, user: User = Depends(get_current_user)):
    """Delete a partner"""
    company_id = user.company_id or user.active_org_id
    
    existing = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    await db.partners.delete_one({"partner_id": partner_id})
    
    # Log activity
    await log_activity(
        module="partners",
        action="delete",
        entity_type="partner",
        entity_id=partner_id,
        entity_name=existing.get("partner_name"),
        **user_info(user)
    )
    
    return {"success": True, "deleted_id": partner_id}


# ============== BULK OPERATIONS ==============

@partners_router.post("/bulk/update-status")
async def bulk_update_status(
    partner_ids: List[str],
    new_status: str,
    user: User = Depends(get_current_user)
):
    """Bulk update partner status"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.partners.update_many(
        {"partner_id": {"$in": partner_ids}, "company_id": company_id},
        {"$set": {
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.user_id
        }}
    )
    
    return {"updated_count": result.modified_count}


@partners_router.post("/bulk/add-tags")
async def bulk_add_tags(
    partner_ids: List[str],
    tags: List[str],
    user: User = Depends(get_current_user)
):
    """Bulk add tags to partners"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.partners.update_many(
        {"partner_id": {"$in": partner_ids}, "company_id": company_id},
        {
            "$addToSet": {"tags": {"$each": tags}},
            "$set": {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.user_id
            }
        }
    )
    
    return {"updated_count": result.modified_count}


# ============== LINKING ENDPOINTS ==============

@partners_router.post("/{partner_id}/link-supplier/{supplier_id}")
async def link_culinary_supplier(
    partner_id: str,
    supplier_id: str,
    user: User = Depends(get_current_user)
):
    """Link a partner to an existing culinary supplier"""
    company_id = user.company_id or user.active_org_id
    
    # Verify partner exists
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Verify supplier exists
    supplier = await db.suppliers.find_one(
        {"supplier_id": supplier_id, "company_id": company_id}
    )
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    await db.partners.update_one(
        {"partner_id": partner_id},
        {"$set": {
            "linked_culinary_supplier_id": supplier_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "linked_supplier_id": supplier_id}


@partners_router.post("/{partner_id}/link-contract/{contract_id}")
async def link_contract(
    partner_id: str,
    contract_id: str,
    user: User = Depends(get_current_user)
):
    """Link a partner to an existing contract"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Verify contract exists (if contracts collection exists)
    contract = await db.contracts.find_one({"contract_id": contract_id})
    if not contract:
        # Create a minimal contract link even if contract doesn't exist
        pass
    
    await db.partners.update_one(
        {"partner_id": partner_id},
        {"$set": {
            "linked_contract_id": contract_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "linked_contract_id": contract_id}


@partners_router.post("/{partner_id}/record-usage")
async def record_partner_usage(
    partner_id: str,
    project_name: str,
    user: User = Depends(get_current_user)
):
    """Record that a partner was used in a project"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    now = datetime.now(timezone.utc)
    
    await db.partners.update_one(
        {"partner_id": partner_id},
        {
            "$set": {
                "last_used_date": now.isoformat()[:10],
                "last_project_name": project_name,
                "updated_at": now.isoformat()
            },
            "$inc": {"total_projects_used": 1}
        }
    )
    
    return {"success": True}


# ============== IMPORT FROM SUPPLIERS ==============

@partners_router.post("/import-from-suppliers")
async def import_partners_from_suppliers(
    user: User = Depends(get_current_user),
    category: str = "food_supplier"
):
    """Import existing culinary suppliers as partners"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Get all suppliers
    suppliers = await db.suppliers.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    
    imported = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    
    for supplier in suppliers:
        # Check if already linked
        existing = await db.partners.find_one({
            "company_id": company_id,
            "linked_culinary_supplier_id": supplier["supplier_id"]
        })
        
        if existing:
            skipped += 1
            continue
        
        # Create partner from supplier
        partner_doc = {
            "partner_id": f"partner_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "partner_name": supplier.get("name"),
            "legal_name": supplier.get("name"),
            "display_name": supplier.get("name"),
            "partner_type": "supplier",
            "status": "approved",
            "is_preferred": supplier.get("is_preferred", False),
            "primary_category": category,
            "email": supplier.get("email"),
            "phone": supplier.get("phone"),
            "full_address": supplier.get("address"),
            "payment_terms": supplier.get("payment_terms"),
            "internal_notes": supplier.get("notes"),
            "linked_culinary_supplier_id": supplier["supplier_id"],
            "total_projects_used": 0,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": user.user_id
        }
        
        await db.partners.insert_one(partner_doc)
        imported += 1
    
    return {
        "imported": imported,
        "skipped": skipped,
        "total_suppliers": len(suppliers)
    }


# ============== INTEGRATION ENDPOINTS - Pull Data from Other Modules ==============

@partners_router.get("/{partner_id}/transactions")
async def get_partner_transactions(
    partner_id: str,
    user: User = Depends(get_current_user),
    limit: int = 50,
    skip: int = 0
):
    """Get accounting transactions linked to a partner through their supplier"""
    company_id = user.company_id or user.active_org_id
    
    # Get partner and check for linked supplier
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    linked_supplier_id = partner.get("linked_culinary_supplier_id")
    
    # Build query for accounting entries
    query = {"company_id": company_id}
    
    # Search by partner_id, supplier_id, or partner name in description
    or_conditions = [
        {"partner_id": partner_id},
        {"description": {"$regex": partner.get("partner_name", ""), "$options": "i"}}
    ]
    
    if linked_supplier_id:
        or_conditions.append({"supplier_id": linked_supplier_id})
        or_conditions.append({"reference_id": linked_supplier_id})
    
    query["$or"] = or_conditions
    
    # Get transactions
    transactions = await db.accounting_entries.find(
        query, {"_id": 0}
    ).sort("entry_date", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.accounting_entries.count_documents(query)
    
    # Calculate totals
    total_amount = sum(t.get("amount", 0) for t in transactions)
    
    return {
        "transactions": transactions,
        "total": total,
        "total_amount": total_amount,
        "skip": skip,
        "limit": limit
    }


@partners_router.get("/{partner_id}/purchase-orders")
async def get_partner_purchase_orders(
    partner_id: str,
    user: User = Depends(get_current_user),
    limit: int = 50,
    skip: int = 0
):
    """Get purchase orders linked to a partner through their supplier"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    linked_supplier_id = partner.get("linked_culinary_supplier_id")
    
    if not linked_supplier_id:
        return {"purchase_orders": [], "total": 0, "total_amount": 0, "skip": skip, "limit": limit}
    
    # Get purchase orders for linked supplier
    pos = await db.purchase_orders.find(
        {"company_id": company_id, "supplier_id": linked_supplier_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.purchase_orders.count_documents(
        {"company_id": company_id, "supplier_id": linked_supplier_id}
    )
    
    total_amount = sum(po.get("total", 0) for po in pos)
    
    return {
        "purchase_orders": pos,
        "total": total,
        "total_amount": total_amount,
        "skip": skip,
        "limit": limit
    }


@partners_router.get("/{partner_id}/invoices")
async def get_partner_invoices(
    partner_id: str,
    user: User = Depends(get_current_user),
    limit: int = 50,
    skip: int = 0
):
    """Get supplier invoices/expenses linked to a partner"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    linked_supplier_id = partner.get("linked_culinary_supplier_id")
    
    if not linked_supplier_id:
        return {"invoices": [], "total": 0, "total_amount": 0, "pending_amount": 0, "skip": skip, "limit": limit}
    
    # Get expenses/invoices for linked supplier
    invoices = await db.expenses.find(
        {"company_id": company_id, "supplier_id": linked_supplier_id},
        {"_id": 0}
    ).sort("invoice_date", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.expenses.count_documents(
        {"company_id": company_id, "supplier_id": linked_supplier_id}
    )
    
    total_amount = sum(inv.get("total", 0) for inv in invoices)
    pending_amount = sum(
        inv.get("total", 0) - inv.get("paid_amount", 0) 
        for inv in invoices if inv.get("status") != "Paid"
    )
    
    return {
        "invoices": invoices,
        "total": total,
        "total_amount": total_amount,
        "pending_amount": pending_amount,
        "skip": skip,
        "limit": limit
    }


@partners_router.get("/{partner_id}/payables")
async def get_partner_payables(
    partner_id: str,
    user: User = Depends(get_current_user)
):
    """Get pending payables (accounts payable) for a partner"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    linked_supplier_id = partner.get("linked_culinary_supplier_id")
    
    # Check supplier_payables collection
    query = {"company_id": company_id, "status": {"$ne": "paid"}}
    
    or_conditions = [{"partner_id": partner_id}]
    if linked_supplier_id:
        or_conditions.append({"supplier_id": linked_supplier_id})
    
    query["$or"] = or_conditions
    
    payables = await db.supplier_payables.find(query, {"_id": 0}).to_list(500)
    
    total_pending = sum(p.get("amount", 0) - p.get("paid_amount", 0) for p in payables)
    
    return {
        "payables": payables,
        "total_pending": total_pending,
        "count": len(payables)
    }


@partners_router.get("/{partner_id}/events")
async def get_partner_events(
    partner_id: str,
    user: User = Depends(get_current_user),
    limit: int = 20
):
    """Get events where this partner was used (through supplier or direct reference)"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    linked_supplier_id = partner.get("linked_culinary_supplier_id")
    
    # Find events that reference this partner or supplier
    # Events might have partner_ids in their data or purchase orders linked to them
    
    event_ids = set()
    
    # Find from purchase orders
    if linked_supplier_id:
        pos = await db.purchase_orders.find(
            {"company_id": company_id, "supplier_id": linked_supplier_id, "event_id": {"$ne": None}},
            {"event_id": 1}
        ).to_list(500)
        event_ids.update(po.get("event_id") for po in pos if po.get("event_id"))
    
    # Find from expenses
    if linked_supplier_id:
        expenses = await db.expenses.find(
            {"company_id": company_id, "supplier_id": linked_supplier_id, "event_id": {"$ne": None}},
            {"event_id": 1}
        ).to_list(500)
        event_ids.update(exp.get("event_id") for exp in expenses if exp.get("event_id"))
    
    if not event_ids:
        return {"events": [], "total": 0}
    
    # Get event details
    events = await db.events.find(
        {"event_id": {"$in": list(event_ids)}, "company_id": company_id},
        {"_id": 0, "event_id": 1, "event_name": 1, "event_date": 1, "status": 1, "client_name": 1}
    ).sort("event_date", -1).limit(limit).to_list(limit)
    
    return {
        "events": events,
        "total": len(events)
    }


@partners_router.get("/{partner_id}/financial-summary")
async def get_partner_financial_summary(
    partner_id: str,
    user: User = Depends(get_current_user),
    year: Optional[int] = None
):
    """Get a financial summary for a partner (total spent, pending, by month)"""
    company_id = user.company_id or user.active_org_id
    
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    linked_supplier_id = partner.get("linked_culinary_supplier_id")
    
    if not linked_supplier_id:
        return {
            "total_spent": 0,
            "total_pending": 0,
            "total_orders": 0,
            "avg_order_value": 0,
            "monthly_breakdown": [],
            "no_linked_supplier": True
        }
    
    # Build date filter
    date_filter = {}
    if year:
        date_filter = {
            "created_at": {
                "$gte": f"{year}-01-01",
                "$lt": f"{year + 1}-01-01"
            }
        }
    
    # Get expenses totals
    expenses_pipeline = [
        {"$match": {
            "company_id": company_id, 
            "supplier_id": linked_supplier_id,
            **date_filter
        }},
        {"$group": {
            "_id": None,
            "total_amount": {"$sum": "$total"},
            "total_paid": {"$sum": "$paid_amount"},
            "count": {"$sum": 1}
        }}
    ]
    
    expenses_result = await db.expenses.aggregate(expenses_pipeline).to_list(1)
    expenses_data = expenses_result[0] if expenses_result else {"total_amount": 0, "total_paid": 0, "count": 0}
    
    # Monthly breakdown
    monthly_pipeline = [
        {"$match": {
            "company_id": company_id, 
            "supplier_id": linked_supplier_id,
            **date_filter
        }},
        {"$addFields": {
            "month": {"$substr": ["$created_at", 0, 7]}
        }},
        {"$group": {
            "_id": "$month",
            "total": {"$sum": "$total"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 12}
    ]
    
    monthly_result = await db.expenses.aggregate(monthly_pipeline).to_list(12)
    
    total_spent = expenses_data.get("total_amount", 0)
    total_paid = expenses_data.get("total_paid", 0)
    total_orders = expenses_data.get("count", 0)
    
    return {
        "total_spent": total_spent,
        "total_pending": total_spent - total_paid,
        "total_orders": total_orders,
        "avg_order_value": total_spent / total_orders if total_orders > 0 else 0,
        "monthly_breakdown": [
            {"month": m["_id"], "total": m["total"], "count": m["count"]}
            for m in monthly_result
        ]
    }



# ============== ATTACHMENT ENDPOINTS ==============

@partners_router.get("/{partner_id}/attachments")
async def get_partner_attachments(
    partner_id: str,
    user: User = Depends(get_current_user)
):
    """Get all attachments for a partner"""
    company_id = user.company_id or user.active_org_id
    
    # First check if partner exists
    partner_exists = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0, "partner_id": 1, "attachments": 1}
    )
    
    if not partner_exists:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    attachments = partner_exists.get("attachments", [])
    
    # Group by type
    by_type = {}
    for att in attachments:
        file_type = att.get("file_type", "other")
        if file_type not in by_type:
            by_type[file_type] = []
        by_type[file_type].append(att)
    
    return {
        "attachments": attachments,
        "by_type": by_type,
        "total": len(attachments)
    }


@partners_router.post("/{partner_id}/attachments")
async def upload_partner_attachment(
    partner_id: str,
    file: UploadFile = File(...),
    file_type: str = Form(default="other"),
    description: str = Form(default=None),
    expiration_date: str = Form(default=None),
    user: User = Depends(get_current_user)
):
    """Upload an attachment to a partner (catalog, COI, contract, etc.)"""
    company_id = user.company_id or user.active_org_id
    
    # Verify partner exists
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0, "partner_id": 1, "partner_name": 1}
    )
    
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Validate file type
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Allowed: PDF, images (JPEG, PNG, WebP, GIF), Word, Excel"
        )
    
    # Check file size (max 10MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 10MB")
    
    # Generate unique filename
    attachment_id = f"att_{uuid.uuid4().hex[:12]}"
    ext = ALLOWED_ATTACHMENT_TYPES.get(file.content_type, "bin")
    safe_name = file.filename.replace(" ", "_")[:50] if file.filename else "file"
    filename = f"{partner_id}_{attachment_id}.{ext}"
    filepath = PARTNER_ATTACHMENTS_DIR / filename
    
    # Save file
    with open(filepath, "wb") as buffer:
        buffer.write(content)
    
    # Generate file URL
    file_url = f"/api/uploads/partner_attachments/{filename}"
    
    # Generate thumbnail for images
    thumbnail_url = None
    if file.content_type.startswith("image/"):
        thumbnail_url = file_url  # Use same URL for images
    
    # Create attachment record
    attachment = {
        "attachment_id": attachment_id,
        "file_name": filename,
        "original_name": file.filename or safe_name,
        "file_type": file_type,
        "mime_type": file.content_type,
        "file_size": len(content),
        "file_url": file_url,
        "thumbnail_url": thumbnail_url,
        "description": description,
        "expiration_date": expiration_date,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": user.user_id
    }
    
    # Add to partner's attachments array
    await db.partners.update_one(
        {"partner_id": partner_id, "company_id": company_id},
        {
            "$push": {"attachments": attachment},
            "$set": {
                "documents_on_file": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.user_id
            }
        }
    )
    
    # Log activity
    await log_activity(
        module="partners",
        action="partner_attachment_uploaded",
        entity_type="partner_attachment",
        entity_id=attachment_id,
        entity_name=file.filename or "attachment",
        user_id=user.user_id,
        user_name=user.name or user.email,
        user_email=user.email,
        company_id=company_id,
        metadata={
            "partner_id": partner_id,
            "partner_name": partner.get("partner_name"),
            "file_type": file_type,
            "file_size": len(content)
        }
    )
    
    return attachment


@partners_router.delete("/{partner_id}/attachments/{attachment_id}")
async def delete_partner_attachment(
    partner_id: str,
    attachment_id: str,
    user: User = Depends(get_current_user)
):
    """Delete an attachment from a partner"""
    company_id = user.company_id or user.active_org_id
    
    # Get partner and find attachment
    partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0, "attachments": 1, "partner_name": 1}
    )
    
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    attachments = partner.get("attachments", [])
    attachment = next((a for a in attachments if a.get("attachment_id") == attachment_id), None)
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete file from disk
    filename = attachment.get("file_name")
    if filename:
        filepath = PARTNER_ATTACHMENTS_DIR / filename
        if filepath.exists():
            filepath.unlink()
    
    # Remove from partner's attachments
    await db.partners.update_one(
        {"partner_id": partner_id, "company_id": company_id},
        {
            "$pull": {"attachments": {"attachment_id": attachment_id}},
            "$set": {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.user_id
            }
        }
    )
    
    # Check if any attachments remain
    updated_partner = await db.partners.find_one(
        {"partner_id": partner_id, "company_id": company_id},
        {"_id": 0, "attachments": 1}
    )
    if not updated_partner.get("attachments"):
        await db.partners.update_one(
            {"partner_id": partner_id, "company_id": company_id},
            {"$set": {"documents_on_file": False}}
        )
    
    # Log activity
    await log_activity(
        module="partners",
        action="partner_attachment_deleted",
        entity_type="partner_attachment",
        entity_id=attachment_id,
        entity_name=attachment.get("original_name", "attachment"),
        user_id=user.user_id,
        user_name=user.name or user.email,
        user_email=user.email,
        company_id=company_id,
        metadata={
            "partner_id": partner_id,
            "partner_name": partner.get("partner_name"),
            "file_type": attachment.get("file_type")
        }
    )
    
    return {"success": True, "deleted_attachment_id": attachment_id}


@partners_router.put("/{partner_id}/attachments/{attachment_id}")
async def update_partner_attachment(
    partner_id: str,
    attachment_id: str,
    file_type: str = None,
    description: str = None,
    expiration_date: str = None,
    user: User = Depends(get_current_user)
):
    """Update attachment metadata (type, description, expiration)"""
    company_id = user.company_id or user.active_org_id
    
    # Build update
    update_fields = {}
    if file_type is not None:
        update_fields["attachments.$.file_type"] = file_type
    if description is not None:
        update_fields["attachments.$.description"] = description
    if expiration_date is not None:
        update_fields["attachments.$.expiration_date"] = expiration_date
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_fields["updated_by"] = user.user_id
    
    result = await db.partners.update_one(
        {
            "partner_id": partner_id, 
            "company_id": company_id,
            "attachments.attachment_id": attachment_id
        },
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Partner or attachment not found")
    
    return {"success": True, "updated_attachment_id": attachment_id}
