"""Proposal endpoints — extracted from server.py. LOGIC UNCHANGED.

Contains:
- Proposal CRUD by event_id
- Financials, day-logistics, custom-fields updates
- Order items CRUD + bulk-from-menu + bulk-from-plated-menu
- Cost staleness / refresh / margin approval
- Section templates CRUD + apply-template
- Duplicate-day (multi-day events)
- Cost health overview + refresh-all
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from models.proposals import (
    OrderItem,
    OrderItemCreate,
    OrderItemUpdate,
    Proposal,
    ProposalCreate,
    ProposalUpdate,
)

logger = logging.getLogger(__name__)
proposals_router = APIRouter(prefix="/proposals", tags=["Proposals"])


def sanitize_float(value, default=0):
    """Convert to float safely, handling None, empty strings, and invalid values.
    Copied from server.py to avoid circular imports."""
    try:
        result = float(value)
        if result != result or result in (float("inf"), float("-inf")):
            return default
        return result
    except (TypeError, ValueError):
        return default


def resolve_min_margin(
    policy: dict,
    item_type: Optional[str],
    category: Optional[str] = None,
    item_specific: Optional[float] = None,
) -> Optional[float]:
    """Resolve effective minimum margin for an item.
    Priority: item_specific > by_category match > by_type > None.
    Copied from server.py to avoid circular imports."""
    if item_specific is not None:
        try:
            return float(item_specific)
        except (TypeError, ValueError):
            pass
    if category:
        for rule in policy.get("by_category", []):
            if (rule.get("item_type") == item_type or not rule.get("item_type")) and rule.get("category") == category:
                try:
                    return float(rule.get("min_margin_pct"))
                except (TypeError, ValueError):
                    continue
    if item_type and item_type in policy.get("by_type", {}):
        return float(policy["by_type"][item_type])
    return None


async def _generate_proposal_number(company_id: str) -> str:
    """Late-imported wrapper to avoid circular import with server.py."""
    from server import generate_proposal_number
    return await generate_proposal_number(company_id)


async def get_margin_policy_doc(company_id: str) -> dict:
    """Late-imported wrapper to avoid circular import with server.py."""
    from server import get_margin_policy_doc as _impl
    return await _impl(company_id)


# ============ BODY (endpoints) — extracted from server.py ============
# ============== PROPOSALS ROUTES ==============

async def generate_proposal_number(company_id: str) -> str:
    """Generate sequential proposal number"""
    count = await db.proposals.count_documents({"company_id": company_id})
    year = datetime.now().year
    return f"PROP-{year}-{str(count + 1).zfill(4)}"


def _compute_item_discount(qty: float, unit_price: float, item_or_data) -> tuple:
    """Return (effective_total_price, discount_amount). Supports both new and legacy fields.
    `item_or_data` can be a Pydantic model or a dict containing discount_type/discount_value/discount_pct.
    """
    qty = float(qty or 0)
    unit_price = float(unit_price or 0)
    gross = qty * unit_price
    
    if hasattr(item_or_data, "model_dump"):
        src = item_or_data.model_dump(exclude_unset=True)
    elif isinstance(item_or_data, dict):
        src = item_or_data
    else:
        src = {}
    
    d_type = src.get("discount_type")
    d_value = src.get("discount_value")
    d_pct_legacy = src.get("discount_pct")
    
    # Resolve: explicit new fields take priority; legacy discount_pct = percentage
    if d_type in ("percentage", "fixed") and d_value is not None:
        d_type_final = d_type
        d_value_final = float(d_value or 0)
    elif d_pct_legacy is not None:
        d_type_final = "percentage"
        d_value_final = float(d_pct_legacy or 0)
    else:
        d_type_final = "percentage"
        d_value_final = 0.0
    
    if d_type_final == "percentage":
        d_pct = max(0.0, min(100.0, d_value_final))
        discount_amount = gross * (d_pct / 100.0)
    else:  # fixed
        discount_amount = max(0.0, min(gross, d_value_final))
    
    effective_total = max(0.0, gross - discount_amount)
    return effective_total, discount_amount, d_type_final, d_value_final


async def calculate_proposal_financials(proposal_id: str, company_id: str):
    """Calculate all financial totals for a proposal"""
    items = await db.order_items.find({"proposal_id": proposal_id, "company_id": company_id}, {"_id": 0}).to_list(500)
    
    # Get current proposal to read discount and tax settings
    proposal = await db.proposals.find_one({"proposal_id": proposal_id}, {"_id": 0})
    
    subtotal = 0
    taxable_subtotal = 0  # sum of (effective totals) for items that are NOT tax-exempt
    total_cost = 0
    has_missing_cost = False
    
    for item in items:
        qty = item.get("quantity", 1) or 0
        unit = item.get("unit_price", 0) or 0
        item_total, _disc_amt, _dt, _dv = _compute_item_discount(qty, unit, item)
        subtotal += item_total
        if not item.get("tax_exempt"):
            taxable_subtotal += item_total
        
        if item.get("internal_cost") is not None:
            total_cost += qty * item["internal_cost"]
        else:
            has_missing_cost = True
    
    margin = subtotal - total_cost
    margin_pct = (margin / subtotal * 100) if subtotal > 0 else 0
    
    # Calculate discount (supports both fixed amount and percentage)
    discount_type = proposal.get("discount_type", "fixed") if proposal else "fixed"  # "fixed" or "percentage"
    discount_value = proposal.get("discount_value", 0) if proposal else 0
    
    if discount_type == "percentage":
        discount_amount = subtotal * (discount_value / 100)
    else:
        discount_amount = discount_value
    
    subtotal_after_discount = subtotal - discount_amount
    
    # Proposal-level discount reduces the taxable base proportionally
    taxable_base = taxable_subtotal
    if subtotal > 0 and discount_amount > 0:
        taxable_base = max(0, taxable_subtotal - discount_amount * (taxable_subtotal / subtotal))
    
    # Calculate taxes from stored tax_ids using the taxable_base (excludes tax-exempt items)
    tax_details = []
    total_tax = 0
    stored_tax_details = proposal.get("tax_details", []) if proposal else []
    for td in stored_tax_details:
        rate = td.get("rate") or 0
        tax_amount = taxable_base * (rate / 100)
        total_tax += tax_amount
        tax_details.append({
            "tax_id": td.get("tax_id"),
            "name": td.get("name"),
            "rate": rate,
            "amount": tax_amount,
        })
    
    # Calculate total (subtotal - discount + tax)
    total = subtotal_after_discount + total_tax
    
    return {
        "subtotal": subtotal,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "discount_amount": discount_amount,
        "tax_details": tax_details,
        "total_tax": total_tax,
        "total": total,
        "total_cost": total_cost,
        "total_margin": margin,
        "margin_percentage": margin_pct,
        "has_missing_cost": has_missing_cost
    }

@proposals_router.get("/event/{event_id}")
async def get_event_proposal(event_id: str, user: User = Depends(get_current_user)):
    """Get or create the proposal for an event"""
    proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    
    if not proposal:
        # Create new proposal
        now = datetime.now(timezone.utc)
        proposal_id = f"prop_{uuid.uuid4().hex[:12]}"
        proposal_number = await _generate_proposal_number(user.company_id)
        
        proposal = {
            "proposal_id": proposal_id,
            "event_id": event_id,
            "company_id": user.company_id,
            "proposal_number": proposal_number,
            "status": "Draft",
            "valid_until": None,
            "client_notes": None,
            "payment_terms": None,
            "subtotal": 0,
            "discount_amount": 0,
            "tax_details": [],
            "total_tax": 0,
            "total": 0,
            "total_cost": 0,
            "total_margin": 0,
            "margin_percentage": 0,
            "custom_field_values": {},
            "last_edited_at": now.isoformat(),
            "created_at": now.isoformat()
        }
        await db.proposals.insert_one(proposal)
        del proposal["_id"]
    
    # Get order items
    items = await db.order_items.find({"proposal_id": proposal["proposal_id"]}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    proposal["items"] = items
    
    # Recalculate financials
    financials = await calculate_proposal_financials(proposal["proposal_id"], user.company_id)
    proposal.update(financials)
    
    # Get event to check client credit
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    credit_warnings = []
    
    if event and event.get("client_id"):
        client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0})
        if client and client.get("has_credit") and client.get("credit_limit", 0) > 0:
            credit_limit = client["credit_limit"]
            # Calculate credit used from unpaid invoices
            unpaid_invoices = await db.invoices.find({
                "client_id": event["client_id"],
                "company_id": user.company_id,
                "status": {"$in": ["pending", "partial", "overdue"]}
            }, {"_id": 0}).to_list(500)
            
            credit_used = sum(sanitize_float(inv.get("total", 0), 0) - sanitize_float(inv.get("paid_amount", 0), 0) for inv in unpaid_invoices)
            proposal_total = sanitize_float(proposal.get("total", 0), 0)
            projected_credit = credit_used + proposal_total
            credit_percentage = (projected_credit / credit_limit) * 100 if credit_limit > 0 else 0
            
            # Add credit context to proposal
            proposal["client_credit"] = {
                "has_credit": True,
                "credit_limit": sanitize_float(credit_limit, 0),
                "credit_used": sanitize_float(credit_used, 0),
                "projected_with_proposal": sanitize_float(projected_credit, 0),
                "credit_percentage": round(sanitize_float(credit_percentage, 0), 1),
                "available_credit": max(0, sanitize_float(credit_limit - credit_used, 0))
            }
            
            # Generate warnings
            if projected_credit > credit_limit:
                over_amount = projected_credit - credit_limit
                credit_warnings.append({
                    "type": "credit_exceeded",
                    "severity": "high",
                    "message": f"⚠️ Esta propuesta excedería el límite de crédito del cliente por ${over_amount:,.2f}",
                    "message_en": f"⚠️ This proposal would exceed client credit limit by ${over_amount:,.2f}"
                })
            elif credit_percentage >= 80:
                credit_warnings.append({
                    "type": "credit_warning",
                    "severity": "medium",
                    "message": f"⚡ El cliente está usando {credit_percentage:.0f}% de su línea de crédito (${credit_used:,.2f} de ${credit_limit:,.2f})",
                    "message_en": f"⚡ Client is using {credit_percentage:.0f}% of their credit line (${credit_used:,.2f} of ${credit_limit:,.2f})"
                })
    
    proposal["credit_warnings"] = credit_warnings
    
    return proposal

@proposals_router.put("/{proposal_id}")
async def update_proposal(proposal_id: str, data: ProposalUpdate, user: User = Depends(get_current_user)):
    """Update proposal details"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed (read-only)
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit proposal for a closed event")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["last_edited_at"] = now.isoformat()
    
    # If changing status to Accepted, log it
    old_status = proposal.get("status")
    new_status = update_data.get("status")
    
    await db.proposals.update_one(
        {"proposal_id": proposal_id},
        {"$set": update_data}
    )
    
    # Create audit log if status changed to/from Accepted
    if old_status != new_status and (old_status == "Accepted" or new_status == "Accepted"):
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "status_change",
            "changes": {"old_status": old_status, "new_status": new_status},
            "timestamp": now.isoformat()
        })
    
    # AUTOMATION: When proposal is Accepted, move event to "Committed" stage
    if new_status == "Accepted" and old_status != "Accepted":
        await db.events.update_one(
            {"event_id": proposal["event_id"], "company_id": user.company_id},
            {"$set": {"stage": "Committed", "updated_at": now.isoformat()}}
        )
        logger.info(f"Event {proposal['event_id']} auto-moved to 'Committed' stage after proposal acceptance")
    
    return await get_event_proposal(proposal["event_id"], user)

@proposals_router.put("/{proposal_id}/financials")
async def update_proposal_financials(proposal_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update discount, taxes, and recalculate totals"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit proposal for a closed event")
    
    # Get base items subtotal (honoring per-item discount and tax_exempt)
    items = await db.order_items.find({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0}).to_list(500)
    subtotal = 0.0
    taxable_subtotal = 0.0
    total_cost = 0.0
    for it in items:
        qty = it.get("quantity", 1) or 0
        unit = it.get("unit_price", 0) or 0
        eff, _disc_amt, _dt, _dv = _compute_item_discount(qty, unit, it)
        subtotal += eff
        if not it.get("tax_exempt"):
            taxable_subtotal += eff
        total_cost += qty * (it.get("internal_cost") or 0)
    
    # Handle discount - supports both fixed amount and percentage
    discount_type = data.get("discount_type", proposal.get("discount_type", "fixed"))  # "fixed" or "percentage"
    discount_value = data.get("discount_value", proposal.get("discount_value", 0))
    
    if discount_type == "percentage":
        discount_amount = subtotal * (discount_value / 100)
    else:
        discount_amount = discount_value
    
    subtotal_after_discount = subtotal - discount_amount
    
    # Proposal discount reduces taxable base proportionally
    taxable_base = taxable_subtotal
    if subtotal > 0 and discount_amount > 0:
        taxable_base = max(0, taxable_subtotal - discount_amount * (taxable_subtotal / subtotal))
    
    tax_ids = data.get("tax_ids", [])
    
    # Calculate taxes on the taxable_base (excludes tax-exempt items)
    tax_details = []
    total_tax = 0
    for tax_id in tax_ids:
        tax = await db.tax_rates.find_one({"tax_id": tax_id, "company_id": user.company_id}, {"_id": 0})
        if tax:
            tax_amount = taxable_base * (tax["rate"] / 100)
            total_tax += tax_amount
            tax_details.append({
                "tax_id": tax_id,
                "name": tax["name"],
                "rate": tax["rate"],
                "amount": tax_amount
            })
    
    total = subtotal_after_discount + total_tax
    margin = subtotal - total_cost
    margin_pct = (margin / subtotal * 100) if subtotal > 0 else 0
    
    update_data = {
        "subtotal": subtotal,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "discount_amount": discount_amount,
        "tax_details": tax_details,
        "total_tax": total_tax,
        "total": total,
        "total_cost": total_cost,
        "total_margin": margin,
        "margin_percentage": margin_pct,
        "payment_terms": data.get("payment_terms", proposal.get("payment_terms")),
        "client_notes": data.get("client_notes", proposal.get("client_notes")),
        "last_edited_at": now.isoformat()
    }
    
    await db.proposals.update_one(
        {"proposal_id": proposal_id},
        {"$set": update_data}
    )
    
    return await get_event_proposal(proposal["event_id"], user)

class DayLogistic(BaseModel):
    event_date: str
    delivery_time: Optional[str] = None
    delivery_end_time: Optional[str] = None
    address: Optional[str] = None
    instructions: Optional[str] = None
    guest_count: Optional[int] = None
    service_type: Optional[str] = None  # Desayuno | Almuerzo | Merienda | Cena | Coctel | Entrega | Otro / empty=auto


@proposals_router.put("/{proposal_id}/day-logistics")
async def update_proposal_day_logistics(proposal_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Replace per-date delivery logistics on a proposal.
    body = {"day_logistics": [DayLogistic, ...]}"""
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    days_in = body.get("day_logistics") or []
    cleaned = []
    for d in days_in:
        try:
            obj = DayLogistic(**d).model_dump()
            cleaned.append(obj)
        except Exception:
            continue
    cleaned.sort(key=lambda x: x.get("event_date") or "")
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {"day_logistics": cleaned, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"day_logistics": cleaned}


@proposals_router.get("/{proposal_id}/day-logistics")
async def get_proposal_day_logistics(proposal_id: str, user: User = Depends(get_current_user)):
    proposal = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0, "day_logistics": 1},
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return {"day_logistics": proposal.get("day_logistics") or []}


@proposals_router.put("/{proposal_id}/custom-fields")
async def update_proposal_custom_fields(proposal_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update custom field values for a proposal"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit custom fields for a closed event")
    
    await db.proposals.update_one(
        {"proposal_id": proposal_id},
        {"$set": {"custom_field_values": data.get("values", {}), "last_edited_at": now.isoformat()}}
    )
    
    return await get_event_proposal(proposal["event_id"], user)

# ============== ORDER ITEMS ROUTES ==============

@proposals_router.get("/{proposal_id}/items")
async def get_order_items(proposal_id: str, user: User = Depends(get_current_user)):
    """Get all order items for a proposal"""
    items = await db.order_items.find({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return items

@proposals_router.post("/{proposal_id}/items")
async def add_order_item(proposal_id: str, data: OrderItemCreate, user: User = Depends(get_current_user)):
    """Add an order item to a proposal"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot add items to a closed event")
    
    item_id = f"oi_{uuid.uuid4().hex[:12]}"
    
    # Calculate item financials (supports $ or % discount)
    total_price, discount_amount, d_type, d_value = _compute_item_discount(data.quantity, data.unit_price, data)
    total_cost = data.quantity * data.internal_cost if data.internal_cost else None
    margin_amount = total_price - total_cost if total_cost is not None else None
    margin_pct = (margin_amount / total_price * 100) if margin_amount is not None and total_price > 0 else None
    
    # Get category name
    category_name = None
    if data.category_id:
        cat = await db.item_categories.find_one({"category_id": data.category_id}, {"_id": 0, "name": 1})
        category_name = cat.get("name") if cat else None
    
    # If Food item with recipe, auto-calculate internal cost and pull long_description from recipe.description
    internal_cost = data.internal_cost
    long_description = data.long_description
    if data.item_type == "Food" and data.reference_id:
        recipe = await db.recipes.find_one({"recipe_id": data.reference_id, "company_id": user.company_id}, {"_id": 0})
        if recipe:
            internal_cost = recipe.get("cost_per_portion") or recipe.get("cost_per_serving") or 0
            total_cost = data.quantity * internal_cost
            margin_amount = total_price - total_cost
            margin_pct = (margin_amount / total_price * 100) if total_price > 0 else 0
            if not long_description:
                long_description = recipe.get("description") or None
    
    item_doc = {
        "item_id": item_id,
        "event_id": proposal["event_id"],
        "proposal_id": proposal_id,
        "company_id": user.company_id,
        "item_type": data.item_type,
        "reference_id": data.reference_id,
        "description": data.description,
        "long_description": long_description,
        "quantity": data.quantity,
        "unit_price": data.unit_price,
        "internal_cost": internal_cost,
        "discount_type": d_type,
        "discount_value": d_value,
        "discount_amount": discount_amount,
        "tax_exempt": bool(data.tax_exempt),
        "total_price": total_price,
        "total_cost": total_cost,
        "margin_amount": margin_amount,
        "margin_percentage": margin_pct,
        "category_id": data.category_id,
        "category_name": category_name,
        "internal_notes": data.internal_notes,
        "event_date": data.event_date,
        "section_title": data.section_title,
        "section_time": data.section_time,
        "section_end_time": data.section_end_time,
        "parent_item_id": data.parent_item_id,
        "sort_order": data.sort_order,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.order_items.insert_one(item_doc)
    del item_doc["_id"]
    
    # Log if proposal is already accepted
    if proposal.get("status") == "Accepted":
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "add_item",
            "item_id": item_id,
            "item_description": data.description,
            "changes": {"quantity": data.quantity, "unit_price": data.unit_price},
            "impact_on_total": total_price,
            "timestamp": now.isoformat()
        })
    
    return item_doc

@proposals_router.post("/{proposal_id}/items/bulk-from-menu")
async def add_items_from_menu(proposal_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Load a saved Menu/Package (with optional variant) into a proposal as multiple OrderItems."""
    menu_id = body.get("menu_id")
    variant_id = body.get("variant_id")
    quantity_multiplier = float(body.get("quantity_multiplier") or 1.0)
    section_title = body.get("section_title")
    if not menu_id:
        raise HTTPException(status_code=400, detail="menu_id is required")

    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot add items to a closed event")

    menu = await db.menus.find_one({"menu_id": menu_id, "company_id": user.company_id}, {"_id": 0})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Compute variant discount (if any)
    variant_discount = 0.0
    variant_discount_type = "percentage"
    if variant_id:
        v = next((vv for vv in (menu.get("variants") or []) if vv.get("variant_id") == variant_id), None)
        if v:
            variant_discount = float(v.get("discount_value") or 0)
            variant_discount_type = v.get("discount_type") or "percentage"

    now = datetime.now(timezone.utc)
    inserted = []
    food_cat = await db.item_categories.find_one({"company_id": user.company_id, "key": "Food"}, {"_id": 0, "category_id": 1, "name": 1}) or {}

    for entry in (menu.get("items") or []):
        qty = float(entry.get("quantity") or 1.0) * quantity_multiplier
        # Resolve recipe or picklist item
        recipe_id = entry.get("recipe_id")
        picklist_item_id = entry.get("picklist_item_id")
        description = entry.get("custom_name") or ""
        unit_price = entry.get("unit_price_override")
        internal_cost = entry.get("internal_cost_override")
        item_type = "Service"
        reference_id = None
        category_id = entry.get("category_id") or food_cat.get("category_id")
        category_name = food_cat.get("name")

        if recipe_id:
            rec = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
            if rec:
                description = description or rec.get("name") or "Item"
                if internal_cost is None:
                    internal_cost = rec.get("cost_per_portion") or 0
                if unit_price is None:
                    unit_price = rec.get("default_portion_price") or (internal_cost * 3 if internal_cost else 0)
                item_type = "Food"
                reference_id = recipe_id
        elif picklist_item_id:
            pli = await db.picklist_items.find_one({"item_id": picklist_item_id, "company_id": user.company_id}, {"_id": 0})
            if pli:
                description = description or pli.get("name") or "Item"
                if unit_price is None:
                    unit_price = pli.get("default_price") or 0
                if internal_cost is None:
                    internal_cost = pli.get("internal_cost")
                item_type = pli.get("item_type") or "Service"
                reference_id = pli.get("recipe_id") or pli.get("inventory_item_id")

        # Apply variant discount to unit_price
        if unit_price and variant_discount:
            if variant_discount_type == "percentage":
                unit_price = max(0.0, unit_price * (1 - variant_discount / 100))
            else:  # fixed_amount applied proportionally across items based on count
                unit_price = max(0.0, unit_price - 0)  # we keep fixed_amount as a separate proposal-level discount instead

        total_price = qty * (unit_price or 0)
        total_cost = qty * internal_cost if internal_cost is not None else None
        margin_amount = total_price - total_cost if total_cost is not None else None
        margin_pct = (margin_amount / total_price * 100) if margin_amount is not None and total_price > 0 else None

        item_id = f"oi_{uuid.uuid4().hex[:12]}"
        doc = {
            "item_id": item_id,
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "item_type": item_type,
            "reference_id": reference_id,
            "description": description or "Item",
            "quantity": qty,
            "unit_price": float(unit_price or 0),
            "internal_cost": internal_cost,
            "total_price": total_price,
            "total_cost": total_cost,
            "margin_amount": margin_amount,
            "margin_percentage": margin_pct,
            "category_id": category_id,
            "category_name": category_name,
            "section_title": section_title or menu.get("name"),
            "sort_order": int(entry.get("sort_order") or 0),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "loaded_from_menu_id": menu_id,
        }
        await db.order_items.insert_one(doc)
        doc.pop("_id", None)
        inserted.append(doc)

    return {"items_added": len(inserted), "menu_name": menu.get("name"), "items": inserted}


@proposals_router.post("/{proposal_id}/items/bulk-from-plated-menu")
async def add_items_from_plated_menu(proposal_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Load a Culinary Intelligence menu (plated/buffet/family-style/cocktail/grab_and_go) into a proposal.
    Each recipe in each course becomes one OrderItem. Quantity = portions_per_guest * guest_count.
    Unit price comes from recipe.default_portion_price (or default portion format), cost from recipe.cost_per_portion.

    Optional buffet-style fields:
      - selected_items: {course_id: [recipe_id, ...]} — operator's picks (filters dishes)
      - When menu.base_price_per_guest > 0: parent line price = base_price * guests + extras
        Extras = sum over courses of max(0, picks - max_choices) * course.extra_choice_price * guests
    """
    plated_menu_id = body.get("menu_id")
    guest_count = float(body.get("guest_count") or 0)
    section_title_override = body.get("section_title")
    mode = (body.get("mode") or "package").lower()  # "package" | "breakdown"
    selected_items = body.get("selected_items") or {}  # {course_id: [recipe_id, ...]}
    if mode not in ("package", "breakdown"):
        mode = "package"
    if not plated_menu_id:
        raise HTTPException(status_code=400, detail="menu_id is required")

    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot add items to a closed event")

    # Default guest_count from event if not provided
    if guest_count <= 0 and event:
        guest_count = float(event.get("guest_count") or event.get("num_guests") or 1)
    if guest_count <= 0:
        guest_count = 1.0

    menu = await db.plated_menus.find_one(
        {"menu_id": plated_menu_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Plated menu not found")

    base_price_pg = float(menu.get("base_price_per_guest") or 0)
    use_base_price = base_price_pg > 0

    # Filter courses' items by selected_items (if provided for that course)
    def _filter_course_items(course):
        course_id = course.get("course_id")
        if course_id in selected_items:
            picks = set(selected_items.get(course_id) or [])
            if picks:
                course = dict(course)
                course["items"] = [it for it in (course.get("items") or []) if it.get("recipe_id") in picks]
        return course

    now = datetime.now(timezone.utc)
    food_cat = await db.item_categories.find_one(
        {"company_id": user.company_id, "key": "Food"}, {"_id": 0, "category_id": 1, "name": 1}
    ) or {}

    inserted = []
    sort_idx = 0
    parent_id = None
    section_title_for_all = section_title_override or menu.get("name") or "Menú"

    if mode == "package":
        # Compute total cost & price first by iterating (filtered) courses
        total_menu_cost = 0.0
        total_menu_price = 0.0
        extras_charge_total = 0.0  # extras over max_choices, charged per guest
        for course in (menu.get("courses") or []):
            fcourse = _filter_course_items(course)
            for entry in (fcourse.get("items") or []):
                rid = entry.get("recipe_id")
                if not rid:
                    continue
                rec = await db.recipes.find_one(
                    {"recipe_id": rid, "company_id": user.company_id}, {"_id": 0, "cost_per_portion": 1, "default_portion_price": 1}
                )
                if not rec:
                    continue
                ppg = float(entry.get("portions_per_guest") or 1.0)
                fmt = await db.recipe_portion_formats.find_one(
                    {"recipe_id": rid, "company_id": user.company_id, "is_default": True}, {"_id": 0, "cost_per_portion": 1, "sell_price": 1}
                )
                cpp = (fmt.get("cost_per_portion") if fmt else None) or rec.get("cost_per_portion") or 0
                spp = (fmt.get("sell_price") if fmt else None) or rec.get("default_portion_price") or (cpp * 3 if cpp else 0)
                total_menu_cost += ppg * guest_count * cpp
                total_menu_price += ppg * guest_count * spp
            # Extras: picks beyond max_choices
            max_choices = course.get("max_choices")
            extra_price = float(course.get("extra_choice_price") or 0)
            picks_count = len(fcourse.get("items") or [])
            if max_choices is not None and extra_price > 0 and picks_count > max_choices:
                extras_charge_total += (picks_count - max_choices) * extra_price * guest_count

        # Override price with base_price if set
        if use_base_price:
            total_menu_price = base_price_pg * guest_count + extras_charge_total

        # Create ONE parent line for the menu
        parent_id = f"oi_{uuid.uuid4().hex[:12]}"
        guests_label = f" · {int(guest_count)} {'invitados'}"
        if use_base_price and extras_charge_total > 0:
            guests_label += f" · +${extras_charge_total:.2f} extras"
        parent_doc = {
            "item_id": parent_id,
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "item_type": "Food",
            "reference_id": plated_menu_id,
            "description": f"{menu.get('name') or 'Menú'}{guests_label}",
            "long_description": menu.get("description") or None,
            "quantity": 1,
            "unit_price": float(total_menu_price),
            "internal_cost": float(total_menu_cost),
            "discount_type": "percentage",
            "discount_value": 0.0,
            "discount_amount": 0.0,
            "tax_exempt": False,
            "total_price": float(total_menu_price),
            "total_cost": float(total_menu_cost),
            "margin_amount": float(total_menu_price - total_menu_cost),
            "margin_percentage": ((total_menu_price - total_menu_cost) / total_menu_price * 100) if total_menu_price > 0 else None,
            "category_id": food_cat.get("category_id"),
            "category_name": food_cat.get("name"),
            "section_title": section_title_for_all,
            "sort_order": 0,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "loaded_from_plated_menu_id": plated_menu_id,
        }
        await db.order_items.insert_one(parent_doc)
        parent_doc.pop("_id", None)
        inserted.append(parent_doc)
        sort_idx = 1

    for course in (menu.get("courses") or []):
        course = _filter_course_items(course)
        course_name = course.get("course_name") or "Course"
        for entry in (course.get("items") or []):
            recipe_id = entry.get("recipe_id")
            if not recipe_id:
                continue
            rec = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0}
            )
            if not rec:
                continue
            portions_per_guest = float(entry.get("portions_per_guest") or 1.0)
            qty = portions_per_guest * guest_count

            # Default portion format (if any) overrides price & cost
            fmt = await db.recipe_portion_formats.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id, "is_default": True}, {"_id": 0}
            )
            cost_per_portion = (fmt.get("cost_per_portion") if fmt else None) or rec.get("cost_per_portion") or 0
            sell_per_portion = (fmt.get("sell_price") if fmt else None) or rec.get("default_portion_price") or (cost_per_portion * 3 if cost_per_portion else 0)

            if mode == "package":
                # Child line: informational only, no charge (parent holds the total)
                doc_price = 0.0
                doc_cost = 0.0
                doc_unit_price = 0.0
                doc_internal_cost = 0.0
                description = f"{entry.get('recipe_name') or rec.get('name') or 'Item'} ({course_name})"
            else:
                doc_price = qty * sell_per_portion
                doc_cost = qty * cost_per_portion
                doc_unit_price = float(sell_per_portion or 0)
                doc_internal_cost = float(cost_per_portion or 0)
                description = entry.get("recipe_name") or rec.get("name") or "Item"

            margin_amount = doc_price - doc_cost
            margin_pct = (margin_amount / doc_price * 100) if doc_price > 0 else None

            item_id = f"oi_{uuid.uuid4().hex[:12]}"
            doc = {
                "item_id": item_id,
                "event_id": proposal["event_id"],
                "proposal_id": proposal_id,
                "company_id": user.company_id,
                "item_type": "Food",
                "reference_id": recipe_id,
                "description": description,
                "long_description": rec.get("description") or None,
                "quantity": qty,
                "unit_price": doc_unit_price,
                "internal_cost": doc_internal_cost,
                "discount_type": "percentage",
                "discount_value": 0.0,
                "discount_amount": 0.0,
                "tax_exempt": False,
                "total_price": float(doc_price or 0),
                "total_cost": float(doc_cost or 0),
                "margin_amount": float(margin_amount or 0),
                "margin_percentage": margin_pct,
                "category_id": food_cat.get("category_id"),
                "category_name": food_cat.get("name"),
                "section_title": section_title_for_all if mode == "package" else (section_title_override or f"{menu.get('name')} — {course_name}"),
                "sort_order": sort_idx,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "loaded_from_plated_menu_id": plated_menu_id,
                "loaded_from_course_id": course.get("course_id"),
                "_portion_format_id": fmt.get("format_id") if fmt else None,
                "_portion_format_name": fmt.get("format_name") if fmt else None,
                "parent_item_id": parent_id if mode == "package" else None,
            }
            await db.order_items.insert_one(doc)
            doc.pop("_id", None)
            inserted.append(doc)
            sort_idx += 1

    return {
        "items_added": len(inserted),
        "menu_name": menu.get("name"),
        "menu_type": menu.get("menu_type"),
        "serving_style": menu.get("serving_style"),
        "guest_count_used": guest_count,
        "mode": mode,
        "items": inserted,
    }


@proposals_router.get("/{proposal_id}/cost-staleness")
async def proposal_cost_staleness(proposal_id: str, user: User = Depends(get_current_user)):
    """Detect OrderItems whose snapshot internal_cost no longer matches the current source-of-truth cost.
    Sources: Food → recipe.cost_per_portion. Service/Rental/Fee/Other → picklist_items.internal_cost (when linked).
    Read-only — never modifies any item."""
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    items = await db.order_items.find(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0},
    ).to_list(500)

    # Cache recipes & picklist items lookups
    recipe_ids = list({it.get("reference_id") for it in items if it.get("item_type") == "Food" and it.get("reference_id")})
    picklist_ids = list({it.get("reference_id") for it in items if it.get("item_type") != "Food" and it.get("reference_id")})
    recipes_by_id = {}
    if recipe_ids:
        async for r in db.recipes.find({"recipe_id": {"$in": recipe_ids}, "company_id": user.company_id}, {"_id": 0, "recipe_id": 1, "name": 1, "cost_per_portion": 1, "total_cost": 1}):
            recipes_by_id[r["recipe_id"]] = r
    picklist_by_id = {}
    if picklist_ids:
        async for p in db.picklist_items.find({"item_id": {"$in": picklist_ids}, "company_id": user.company_id}, {"_id": 0, "item_id": 1, "name": 1, "internal_cost": 1, "default_price": 1, "item_type": 1}):
            picklist_by_id[p["item_id"]] = p

    stale_items = []
    for it in items:
        rid = it.get("reference_id")
        if not rid:
            continue
        snapshot_cost = float(it.get("internal_cost") or 0)
        source_label = None
        source_name = None
        current_cost = None
        if it.get("item_type") == "Food":
            recipe = recipes_by_id.get(rid)
            if not recipe:
                continue
            current_cost = float(recipe.get("cost_per_portion") or recipe.get("total_cost") or 0)
            source_label = "recipe"
            source_name = recipe.get("name")
        else:
            pli = picklist_by_id.get(rid)
            if not pli or pli.get("internal_cost") is None:
                continue
            current_cost = float(pli.get("internal_cost") or 0)
            source_label = (pli.get("item_type") or it.get("item_type") or "item").lower()
            source_name = pli.get("name")
        if current_cost is None or abs(current_cost - snapshot_cost) < 0.005:
            continue
        diff = current_cost - snapshot_cost
        diff_pct = (diff / snapshot_cost * 100) if snapshot_cost > 0 else (100 if current_cost > 0 else 0)
        stale_items.append({
            "item_id": it["item_id"],
            "description": it.get("description"),
            "item_type": it.get("item_type"),
            "source_type": source_label,
            "reference_id": rid,
            "recipe_id": rid if source_label == "recipe" else None,  # legacy field kept
            "recipe_name": source_name,  # kept for FE compat; really 'source_name'
            "source_name": source_name,
            "snapshot_cost": round(snapshot_cost, 4),
            "current_cost": round(current_cost, 4),
            "diff_amount": round(diff, 4),
            "diff_pct": round(diff_pct, 2),
            "quantity": float(it.get("quantity") or 0),
            "unit_price": float(it.get("unit_price") or 0),
        })

    stale_items.sort(key=lambda x: abs(x["diff_pct"]), reverse=True)
    return {
        "proposal_id": proposal_id,
        "status": proposal.get("status"),
        "is_stale": len(stale_items) > 0,
        "stale_count": len(stale_items),
        "can_refresh": proposal.get("status", "Draft") == "Draft",
        "stale_items": stale_items,
    }


# ============== MARGIN GUARDRAIL HELPERS (Phase 3) ==============

OVERRIDE_ROLES = {"owner", "admin", "finance"}


def _user_can_override_margin(user: User) -> bool:
    """Only owner/admin/finance may push a quote below its resolved margin threshold."""
    return str(getattr(user, "role", "")).lower() in OVERRIDE_ROLES


async def _compute_proposal_below_threshold(proposal: dict, policy: dict, user: User) -> dict:
    """Recompute current vs projected margin for a single proposal.
    Returns {below_threshold, current_margin_pct, projected_margin_pct, effective_min_margin, delta_total}.
    Lightweight version of cost_health_overview() restricted to one proposal.
    """
    items = await db.order_items.find(
        {"proposal_id": proposal["proposal_id"], "company_id": user.company_id},
        {"_id": 0, "item_type": 1, "reference_id": 1, "internal_cost": 1, "quantity": 1, "unit_price": 1},
    ).to_list(500)

    total_price = 0.0
    total_cost_current = 0.0
    total_cost_projected = 0.0
    weighted_min_num = 0.0
    weighted_min_den = 0.0
    delta_total = 0.0
    any_below = False
    for it in items:
        qty = float(it.get("quantity") or 0)
        unit_price = float(it.get("unit_price") or 0)
        snap = float(it.get("internal_cost") or 0)
        line_revenue = qty * unit_price
        total_price += line_revenue
        total_cost_current += qty * snap

        rid = it.get("reference_id")
        current_for_proj = snap
        item_category = None
        item_specific_min = None
        item_type = it.get("item_type") or "Other"
        if rid:
            current = None
            if item_type == "Food":
                rec = await db.recipes.find_one(
                    {"recipe_id": rid, "company_id": user.company_id},
                    {"_id": 0, "cost_per_portion": 1, "total_cost": 1, "category": 1, "min_margin_pct": 1},
                )
                if rec:
                    current = float(rec.get("cost_per_portion") or rec.get("total_cost") or 0)
                    item_category = rec.get("category")
                    item_specific_min = rec.get("min_margin_pct")
            else:
                pli = await db.picklist_items.find_one(
                    {"item_id": rid, "company_id": user.company_id},
                    {"_id": 0, "internal_cost": 1, "category_id": 1, "min_margin_pct": 1},
                )
                if pli and pli.get("internal_cost") is not None:
                    current = float(pli.get("internal_cost") or 0)
                    item_category = pli.get("category_id")
                    item_specific_min = pli.get("min_margin_pct")
            if current is not None and abs(current - snap) >= 0.005:
                delta_total += (current - snap) * qty
                current_for_proj = current
        total_cost_projected += qty * current_for_proj

        resolved_min = resolve_min_margin(
            policy,
            item_type=item_type,
            category=item_category,
            item_specific=item_specific_min,
        )
        if resolved_min is not None and line_revenue > 0:
            weighted_min_num += line_revenue * resolved_min
            weighted_min_den += line_revenue
            line_proj_cost = qty * current_for_proj
            line_proj_margin_pct = ((line_revenue - line_proj_cost) / line_revenue * 100) if line_revenue > 0 else None
            if line_proj_margin_pct is not None and line_proj_margin_pct < resolved_min:
                any_below = True

    current_margin_pct = ((total_price - total_cost_current) / total_price * 100) if total_price > 0 else None
    projected_margin_pct = ((total_price - total_cost_projected) / total_price * 100) if total_price > 0 else None
    effective_min_margin = (weighted_min_num / weighted_min_den) if weighted_min_den > 0 else None
    below = bool(any_below) or (
        effective_min_margin is not None
        and projected_margin_pct is not None
        and projected_margin_pct < effective_min_margin
    )
    return {
        "below_threshold": below,
        "current_margin_pct": round(current_margin_pct, 2) if current_margin_pct is not None else None,
        "projected_margin_pct": round(projected_margin_pct, 2) if projected_margin_pct is not None else None,
        "effective_min_margin": round(effective_min_margin, 2) if effective_min_margin is not None else None,
        "delta_total": round(delta_total, 2),
    }


async def _record_cost_refresh_audit(
    *,
    user: User,
    scope: str,  # "single" | "bulk"
    proposal_ids: list,
    stale_info: dict,
    refreshed_count: int,
    override: bool,
) -> None:
    """Append a row to cost_refresh_audit so admins can review margin guardrail bypasses."""
    now = datetime.now(timezone.utc).isoformat()
    await db.cost_refresh_audit.insert_one({
        "audit_id": f"cra_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "user_email": getattr(user, "email", None),
        "user_role": getattr(user, "role", None),
        "scope": scope,
        "proposal_ids": proposal_ids,
        "refreshed_count": refreshed_count,
        "below_threshold": bool(stale_info.get("below_threshold")),
        "override": bool(override),
        "current_margin_pct": stale_info.get("current_margin_pct"),
        "projected_margin_pct": stale_info.get("projected_margin_pct"),
        "effective_min_margin": stale_info.get("effective_min_margin"),
        "delta_total": stale_info.get("delta_total"),
        "created_at": now,
    })


async def _notify_margin_approval_request(
    *,
    requester: User,
    proposal: dict,
    stale_info: dict,
) -> int:
    """Drop an in-app notification on every owner/admin/finance in the company.
    Returns the number of notifications inserted.
    """
    approvers_cursor = db.users.find(
        {
            "company_id": requester.company_id,
            "role": {"$in": list(OVERRIDE_ROLES)},
            "user_id": {"$ne": requester.user_id},
        },
        {"_id": 0, "user_id": 1},
    )
    approver_ids = [u["user_id"] async for u in approvers_cursor]
    if not approver_ids:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    title = "Aprobación de margen requerida"
    body = (
        f"{getattr(requester, 'email', 'Un usuario')} solicita refrescar la cotización "
        f"{proposal.get('proposal_number') or proposal.get('proposal_id')[:8]}: "
        f"margen pasaría de {stale_info.get('current_margin_pct')}% a "
        f"{stale_info.get('projected_margin_pct')}% (mín {stale_info.get('effective_min_margin')}%)."
    )
    docs = [
        {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "company_id": requester.company_id,
            "user_id": approver_id,
            "type": "margin_approval_request",
            "title": title,
            "message": body,
            "link": f"/events/{proposal.get('event_id')}?tab=proposal",
            "metadata": {
                "proposal_id": proposal["proposal_id"],
                "event_id": proposal.get("event_id"),
                "requester_id": requester.user_id,
                "requester_email": getattr(requester, "email", None),
                "current_margin_pct": stale_info.get("current_margin_pct"),
                "projected_margin_pct": stale_info.get("projected_margin_pct"),
                "effective_min_margin": stale_info.get("effective_min_margin"),
                "delta_total": stale_info.get("delta_total"),
            },
            "read": False,
            "created_at": now,
        }
        for approver_id in approver_ids
    ]
    if docs:
        await db.notifications.insert_many(docs)
    return len(docs)


@proposals_router.post("/{proposal_id}/request-margin-approval")
async def request_margin_approval(proposal_id: str, user: User = Depends(get_current_user)):
    """Allow a non-override user (rep) to ping all admins/owners/finance asking for cost-refresh approval."""
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.get("status", "Draft") != "Draft":
        raise HTTPException(status_code=400, detail="Only Draft proposals can request approval")

    policy = await get_margin_policy_doc(user.company_id)
    stale_info = await _compute_proposal_below_threshold(proposal, policy, user)
    if not stale_info["below_threshold"]:
        raise HTTPException(status_code=400, detail="Proposal is not below threshold — no approval needed")
    sent = await _notify_margin_approval_request(requester=user, proposal=proposal, stale_info=stale_info)
    return {"approvers_notified": sent, "proposal_id": proposal_id}


@proposals_router.post("/{proposal_id}/refresh-costs")
async def refresh_proposal_costs(
    proposal_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Public endpoint — parses body and delegates to the internal helper."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    override = bool(body.get("override_below_threshold"))
    return await _apply_refresh_for_proposal(proposal_id=proposal_id, override=override, user=user, scope="single")


async def _apply_refresh_for_proposal(
    *,
    proposal_id: str,
    override: bool,
    user: User,
    scope: str,
) -> dict:
    """Shared refresh logic used by both single and bulk endpoints.

    Margin guardrail:
      - If projected margin falls below the resolved minimum, only owner/admin/finance can proceed
        AND must send `override_below_threshold=true`.
    Returns standardized payload {refreshed_count, proposal_id, below_threshold, override_applied, skipped_reason?}.
    """
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.get("status", "Draft") != "Draft":
        raise HTTPException(status_code=400, detail="Only Draft proposals can refresh costs")

    policy = await get_margin_policy_doc(user.company_id)
    stale_info = await _compute_proposal_below_threshold(proposal, policy, user)

    if stale_info["below_threshold"]:
        if not _user_can_override_margin(user):
            if scope == "bulk":
                return {
                    "refreshed_count": 0,
                    "proposal_id": proposal_id,
                    "below_threshold": True,
                    "override_applied": False,
                    "skipped_reason": "below_threshold_no_role",
                }
            raise HTTPException(
                status_code=403,
                detail=("Refrescar este costo dejaría el margen bajo el umbral. "
                        "Pide aprobación a un Admin/Owner."),
            )
        if not override:
            if scope == "bulk":
                return {
                    "refreshed_count": 0,
                    "proposal_id": proposal_id,
                    "below_threshold": True,
                    "override_applied": False,
                    "skipped_reason": "below_threshold_no_override",
                }
            raise HTTPException(
                status_code=403,
                detail=("La acción cruza el umbral mínimo de margen. "
                        "Reenvía con override_below_threshold=true para confirmar."),
            )

    items = await db.order_items.find(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0},
    ).to_list(500)

    updated_count = 0
    now = datetime.now(timezone.utc).isoformat()
    for it in items:
        rid = it.get("reference_id")
        if not rid:
            continue
        current_cost = None
        if it.get("item_type") == "Food":
            recipe = await db.recipes.find_one({"recipe_id": rid, "company_id": user.company_id}, {"_id": 0, "cost_per_portion": 1, "total_cost": 1})
            if recipe:
                current_cost = float(recipe.get("cost_per_portion") or recipe.get("total_cost") or 0)
        else:
            pli = await db.picklist_items.find_one({"item_id": rid, "company_id": user.company_id}, {"_id": 0, "internal_cost": 1})
            if pli and pli.get("internal_cost") is not None:
                current_cost = float(pli.get("internal_cost") or 0)
        if current_cost is None:
            continue
        snapshot_cost = float(it.get("internal_cost") or 0)
        if abs(current_cost - snapshot_cost) < 0.005:
            continue
        qty = float(it.get("quantity") or 0)
        unit_price = float(it.get("unit_price") or 0)
        total_cost = qty * current_cost
        total_price = qty * unit_price
        margin_amount = total_price - total_cost
        margin_pct = (margin_amount / total_price * 100) if total_price > 0 else None
        await db.order_items.update_one(
            {"item_id": it["item_id"], "company_id": user.company_id},
            {"$set": {
                "internal_cost": current_cost,
                "total_cost": total_cost,
                "margin_amount": margin_amount,
                "margin_percentage": margin_pct,
                "updated_at": now,
                "last_cost_refresh_at": now,
            }},
        )
        updated_count += 1

    # Audit only when an override actually applied
    if stale_info["below_threshold"] and override and updated_count > 0:
        await _record_cost_refresh_audit(
            user=user,
            scope=scope,
            proposal_ids=[proposal_id],
            stale_info=stale_info,
            refreshed_count=updated_count,
            override=True,
        )

    return {
        "refreshed_count": updated_count,
        "proposal_id": proposal_id,
        "below_threshold": stale_info["below_threshold"],
        "override_applied": bool(stale_info["below_threshold"] and override),
    }


@proposals_router.get("/cost-health/overview")
async def cost_health_overview(user: User = Depends(get_current_user)):
    """Cost Health Dashboard — list all DRAFT proposals with at least one stale item.
    For each proposal: count of stale items, max diff_pct, total $ delta if refreshed.
    Useful after a bulk ingredient/picklist price change."""
    draft_props = await db.proposals.find(
        {"company_id": user.company_id, "status": "Draft"},
        {"_id": 0, "proposal_id": 1, "event_id": 1, "proposal_number": 1, "created_at": 1, "total_amount": 1},
    ).sort("updated_at", -1).to_list(500)

    # Load margin policy once for the whole scan
    policy = await get_margin_policy_doc(user.company_id)

    rows = []
    for prop in draft_props:
        items = await db.order_items.find(
            {"proposal_id": prop["proposal_id"], "company_id": user.company_id},
            {"_id": 0, "item_id": 1, "item_type": 1, "reference_id": 1, "internal_cost": 1, "quantity": 1, "unit_price": 1, "description": 1},
        ).to_list(500)
        stale_count = 0
        max_pct = 0.0
        delta_total = 0.0
        total_price = 0.0
        total_cost_current = 0.0  # current snapshot
        total_cost_projected = 0.0  # after refresh
        weighted_min_num = 0.0  # sum(line_revenue * resolved_min_margin) for weighted avg
        weighted_min_den = 0.0  # sum(line_revenue) where min was resolvable
        any_below_projected = False  # at least one stale item projects below its own min
        # Per-type breakdown: { item_type: {revenue, cost_current, cost_projected, min_num, min_den, stale_count} }
        by_type: Dict[str, Dict[str, float]] = {}
        for it in items:
            qty = float(it.get("quantity") or 0)
            unit_price = float(it.get("unit_price") or 0)
            snap = float(it.get("internal_cost") or 0)
            line_revenue = qty * unit_price
            total_price += line_revenue
            total_cost_current += qty * snap
            item_type = (it.get("item_type") or "Other")
            bucket = by_type.setdefault(item_type, {
                "revenue": 0.0, "cost_current": 0.0, "cost_projected": 0.0,
                "min_num": 0.0, "min_den": 0.0, "stale_count": 0,
            })
            bucket["revenue"] += line_revenue
            bucket["cost_current"] += qty * snap

            rid = it.get("reference_id")
            current_for_proj = snap  # default: no change
            item_category: Optional[str] = None
            item_specific_min: Optional[float] = None
            if rid:
                current = None
                if item_type == "Food":
                    rec = await db.recipes.find_one(
                        {"recipe_id": rid, "company_id": user.company_id},
                        {"_id": 0, "cost_per_portion": 1, "total_cost": 1, "category": 1, "min_margin_pct": 1},
                    )
                    if rec:
                        current = float(rec.get("cost_per_portion") or rec.get("total_cost") or 0)
                        item_category = rec.get("category")
                        item_specific_min = rec.get("min_margin_pct")
                else:
                    pli = await db.picklist_items.find_one(
                        {"item_id": rid, "company_id": user.company_id},
                        {"_id": 0, "internal_cost": 1, "category_id": 1, "min_margin_pct": 1},
                    )
                    if pli and pli.get("internal_cost") is not None:
                        current = float(pli.get("internal_cost") or 0)
                        item_category = pli.get("category_id")
                        item_specific_min = pli.get("min_margin_pct")
                if current is not None and abs(current - snap) >= 0.005:
                    stale_count += 1
                    bucket["stale_count"] += 1
                    delta_total += (current - snap) * qty
                    pct = ((current - snap) / snap * 100) if snap > 0 else 100
                    if abs(pct) > abs(max_pct):
                        max_pct = pct
                    current_for_proj = current
            total_cost_projected += qty * current_for_proj
            bucket["cost_projected"] += qty * current_for_proj

            # Resolve per-item min_margin and accumulate weighted average
            resolved_min = resolve_min_margin(
                policy,
                item_type=item_type,
                category=item_category,
                item_specific=item_specific_min,
            )
            if resolved_min is not None and line_revenue > 0:
                weighted_min_num += line_revenue * resolved_min
                weighted_min_den += line_revenue
                bucket["min_num"] += line_revenue * resolved_min
                bucket["min_den"] += line_revenue
                # Per-item projected margin check
                line_proj_cost = qty * current_for_proj
                line_proj_margin_pct = ((line_revenue - line_proj_cost) / line_revenue * 100) if line_revenue > 0 else None
                if line_proj_margin_pct is not None and line_proj_margin_pct < resolved_min:
                    any_below_projected = True

        if stale_count == 0:
            continue

        # Margin calculations (None when total_price <= 0 to avoid divide-by-zero)
        current_margin_pct = ((total_price - total_cost_current) / total_price * 100) if total_price > 0 else None
        projected_margin_pct = ((total_price - total_cost_projected) / total_price * 100) if total_price > 0 else None
        effective_min_margin = (weighted_min_num / weighted_min_den) if weighted_min_den > 0 else None
        below_threshold = bool(any_below_projected) or (
            effective_min_margin is not None
            and projected_margin_pct is not None
            and projected_margin_pct < effective_min_margin
        )

        # Build per-type breakdown rows (only types that have revenue in this proposal)
        type_breakdown = []
        for t, b in by_type.items():
            rev = b["revenue"]
            if rev <= 0:
                continue
            t_current = ((rev - b["cost_current"]) / rev * 100) if rev > 0 else None
            t_projected = ((rev - b["cost_projected"]) / rev * 100) if rev > 0 else None
            t_min = (b["min_num"] / b["min_den"]) if b["min_den"] > 0 else None
            t_below = bool(t_min is not None and t_projected is not None and t_projected < t_min)
            type_breakdown.append({
                "item_type": t,
                "current_margin_pct": round(t_current, 2) if t_current is not None else None,
                "projected_margin_pct": round(t_projected, 2) if t_projected is not None else None,
                "min_margin_pct": round(t_min, 2) if t_min is not None else None,
                "below_threshold": t_below,
                "stale_count": int(b["stale_count"]),
                "revenue_share_pct": round(rev / total_price * 100, 2) if total_price > 0 else None,
            })
        # Sort by absolute margin change descending so biggest impact shows first
        type_breakdown.sort(
            key=lambda x: abs((x.get("projected_margin_pct") or 0) - (x.get("current_margin_pct") or 0)),
            reverse=True,
        )

        # Resolve client + event for display
        event = await db.events.find_one({"event_id": prop["event_id"], "company_id": user.company_id}, {"_id": 0, "name": 1, "event_date": 1, "client_id": 1})
        client = await db.clients.find_one({"client_id": (event or {}).get("client_id"), "company_id": user.company_id}, {"_id": 0, "name": 1}) if event else None
        rows.append({
            "proposal_id": prop["proposal_id"],
            "proposal_number": prop.get("proposal_number"),
            "event_id": prop["event_id"],
            "event_name": (event or {}).get("name"),
            "event_date": (event or {}).get("event_date"),
            "client_name": (client or {}).get("name"),
            "stale_count": stale_count,
            "max_diff_pct": round(max_pct, 2),
            "delta_total": round(delta_total, 2),
            "total_amount": float(prop.get("total_amount") or 0),
            "current_margin_pct": round(current_margin_pct, 2) if current_margin_pct is not None else None,
            "projected_margin_pct": round(projected_margin_pct, 2) if projected_margin_pct is not None else None,
            "effective_min_margin": round(effective_min_margin, 2) if effective_min_margin is not None else None,
            "below_threshold": below_threshold,
            "type_breakdown": type_breakdown,
        })
    # Sort: biggest |delta_total| first
    rows.sort(key=lambda r: abs(r["delta_total"]), reverse=True)
    return {
        "total_drafts_scanned": len(draft_props),
        "stale_proposals": len(rows),
        "proposals": rows,
    }


@proposals_router.post("/cost-health/refresh-all")
async def cost_health_refresh_all(request: Request, user: User = Depends(get_current_user)):
    """Refresh costs on ALL Draft proposals that have stale items.

    Phase 3 gating:
      - Below-threshold proposals are skipped for non-admin/owner/finance users.
      - For admin/owner/finance, the body flag `override_below_threshold=true` allows
        the bulk action to also refresh below-threshold proposals.
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    override = bool(body.get("override_below_threshold"))

    overview = await cost_health_overview(user)
    refreshed_proposals = 0
    refreshed_items = 0
    skipped_below_threshold = 0
    overridden_proposals = []
    for row in overview["proposals"]:
        try:
            res = await _apply_refresh_for_proposal(
                proposal_id=row["proposal_id"],
                override=override,
                user=user,
                scope="bulk",
            )
            if res.get("refreshed_count", 0) > 0:
                refreshed_proposals += 1
                refreshed_items += res["refreshed_count"]
                if res.get("override_applied"):
                    overridden_proposals.append(row["proposal_id"])
            elif res.get("skipped_reason", "").startswith("below_threshold"):
                skipped_below_threshold += 1
        except HTTPException:
            continue

    return {
        "scanned": overview["total_drafts_scanned"],
        "refreshed_proposals": refreshed_proposals,
        "refreshed_items": refreshed_items,
        "skipped_below_threshold": skipped_below_threshold,
        "overridden_proposals": overridden_proposals,
        "can_override": _user_can_override_margin(user),
    }


@proposals_router.post("/{proposal_id}/items/repair-descriptions")
async def repair_item_descriptions(proposal_id: str, user: User = Depends(get_current_user)):
    """For items linked to recipes/menus, restore description=name and long_description=recipe.description.
    Only modifies items where long_description is empty AND description != recipe.name."""
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    items = await db.order_items.find(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(500)
    fixed = 0
    for it in items:
        if it.get("long_description"):
            continue
        ref_id = it.get("reference_id")
        if not ref_id:
            continue
        # Try recipe first, then plated menu
        src = await db.recipes.find_one(
            {"recipe_id": ref_id, "company_id": user.company_id},
            {"_id": 0, "name": 1, "description": 1}
        )
        if not src:
            src = await db.plated_menus.find_one(
                {"menu_id": ref_id, "company_id": user.company_id},
                {"_id": 0, "name": 1, "description": 1}
            )
        if not src or not src.get("description"):
            continue
        new_desc = src.get("name") or it.get("description")
        new_long = src.get("description")
        if it.get("description") == new_desc and not new_long:
            continue
        await db.order_items.update_one(
            {"item_id": it["item_id"], "proposal_id": proposal_id, "company_id": user.company_id},
            {"$set": {
                "description": new_desc,
                "long_description": new_long,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        fixed += 1
    return {"success": True, "fixed": fixed, "scanned": len(items)}


@proposals_router.put("/{proposal_id}/items/{item_id}")
async def update_order_item(proposal_id: str, item_id: str, data: OrderItemUpdate, user: User = Depends(get_current_user)):
    """Update an order item"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit items in a closed event")
    
    item = await db.order_items.find_one({"item_id": item_id, "proposal_id": proposal_id, "company_id": user.company_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Recalculate financials (honoring per-item discount $ or %)
    quantity = update_data.get("quantity", item.get("quantity", 1))
    unit_price = update_data.get("unit_price", item.get("unit_price", 0))
    internal_cost = update_data.get("internal_cost", item.get("internal_cost"))
    # Merge stored discount fields with incoming partial updates
    merged_for_calc = {
        "discount_type": update_data.get("discount_type", item.get("discount_type")),
        "discount_value": update_data.get("discount_value", item.get("discount_value")),
        "discount_pct": update_data.get("discount_pct", item.get("discount_pct")),
    }
    total_price, discount_amount, d_type, d_value = _compute_item_discount(quantity, unit_price, merged_for_calc)
    total_cost = quantity * internal_cost if internal_cost is not None else None
    margin_amount = total_price - total_cost if total_cost is not None else None
    margin_pct = (margin_amount / total_price * 100) if margin_amount is not None and total_price > 0 else None
    
    # Drop legacy discount_pct from update_data so we only persist the new canonical fields
    update_data.pop("discount_pct", None)
    
    update_data.update({
        "discount_type": d_type,
        "discount_value": d_value,
        "discount_amount": discount_amount,
        "total_price": total_price,
        "total_cost": total_cost,
        "margin_amount": margin_amount,
        "margin_percentage": margin_pct,
        "updated_at": now.isoformat()
    })
    
    # Log if proposal is accepted
    old_total = item.get("total_price", 0)
    if proposal.get("status") == "Accepted":
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "edit_item",
            "item_id": item_id,
            "item_description": item.get("description"),
            "changes": update_data,
            "impact_on_total": total_price - old_total,
            "timestamp": now.isoformat()
        })
    
    await db.order_items.update_one(
        {"item_id": item_id},
        {"$set": update_data}
    )
    
    updated_item = await db.order_items.find_one({"item_id": item_id}, {"_id": 0})
    return updated_item


class BulkReorderItem(BaseModel):
    item_id: str
    sort_order: int
    section_title: Optional[str] = None


class BulkReorderPayload(BaseModel):
    items: List[BulkReorderItem]


@proposals_router.post("/{proposal_id}/items/bulk-reorder")
async def bulk_reorder_order_items(
    proposal_id: str,
    payload: BulkReorderPayload,
    user: User = Depends(get_current_user),
):
    """Bulk update sort_order (and optionally section_title) for many items at once.

    Used for section drag-and-drop reordering and other batch reorder operations
    so the UI can rewrite ordering atomically without firing N HTTP requests.
    """
    proposal = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": user.company_id}
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    event = await db.events.find_one(
        {"event_id": proposal["event_id"], "company_id": user.company_id}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit items in a closed event")

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = 0
    for entry in payload.items:
        patch = {"sort_order": entry.sort_order, "updated_at": now_iso}
        if entry.section_title is not None:
            patch["section_title"] = entry.section_title
        result = await db.order_items.update_one(
            {
                "item_id": entry.item_id,
                "proposal_id": proposal_id,
                "company_id": user.company_id,
            },
            {"$set": patch},
        )
        updated += result.modified_count

    return {"updated": updated, "total": len(payload.items)}


@proposals_router.delete("/{proposal_id}/items/{item_id}")
async def delete_order_item(proposal_id: str, item_id: str, user: User = Depends(get_current_user)):
    """Delete an order item"""
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot delete items from a closed event")
    
    item = await db.order_items.find_one({"item_id": item_id, "proposal_id": proposal_id, "company_id": user.company_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Log if proposal is accepted
    if proposal.get("status") == "Accepted":
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "remove_item",
            "item_id": item_id,
            "item_description": item.get("description"),
            "changes": {},
            "impact_on_total": -(item.get("total_price", 0)),
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    await db.order_items.delete_one({"item_id": item_id})
    return {"message": "Item deleted"}

# ============== SECTION TEMPLATES (Reusable Packs) ==============

@proposals_router.get("/section-templates")
async def list_section_templates(user: User = Depends(get_current_user)):
    """List reusable section/pack templates for the user's company."""
    templates = await db.section_templates.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(500)
    return templates

@proposals_router.post("/section-templates")
async def create_section_template(body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Create a section/pack template from a snapshot of items."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Template name is required")
    items = body.get("items") or []
    if not isinstance(items, list) or len(items) == 0:
        raise HTTPException(status_code=400, detail="At least one item is required")
    now = datetime.now(timezone.utc).isoformat()
    tpl_id = f"sectpl_{uuid.uuid4().hex[:12]}"
    doc = {
        "template_id": tpl_id,
        "company_id": user.company_id,
        "name": name,
        "description": body.get("description") or "",
        "scope": body.get("scope") or "pack",  # "pack" (multi-section) or "section" (single)
        "items": [
            {
                "item_type": (it.get("item_type") or "Service"),
                "description": it.get("description") or "",
                "quantity": float(it.get("quantity") or 1),
                "unit_price": float(it.get("unit_price") or 0),
                "internal_cost": float(it.get("internal_cost")) if it.get("internal_cost") not in (None, "") else None,
                "category_id": it.get("category_id"),
                "reference_id": it.get("reference_id"),
                "section_title": it.get("section_title") or "",
                "section_time": it.get("section_time") or None,
                "sort_order": int(it.get("sort_order") or 0),
                "internal_notes": it.get("internal_notes") or None,
            }
            for it in items
        ],
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.section_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc

@proposals_router.put("/section-templates/{template_id}")
async def rename_section_template(template_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Rename a template or update its description."""
    update = {}
    if "name" in body:
        n = (body.get("name") or "").strip()
        if not n:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        update["name"] = n
    if "description" in body:
        update["description"] = body.get("description") or ""
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.section_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return await db.section_templates.find_one({"template_id": template_id}, {"_id": 0})

@proposals_router.delete("/section-templates/{template_id}")
async def delete_section_template(template_id: str, user: User = Depends(get_current_user)):
    res = await db.section_templates.delete_one(
        {"template_id": template_id, "company_id": user.company_id}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}

async def _resolve_current_pricing(item: Dict[str, Any], company_id: str) -> Dict[str, Any]:
    """Look up current price/cost for a template item based on its reference.
    Returns dict with current_price, current_cost (None if no reference / not found)."""
    ref_id = item.get("reference_id")
    if not ref_id:
        return {"current_price": None, "current_cost": None}
    item_type = (item.get("item_type") or "").lower()
    # Food items can be linked to recipes
    if item_type == "food":
        recipe = await db.recipes.find_one(
            {"recipe_id": ref_id, "company_id": company_id},
            {"_id": 0, "cost_per_portion": 1, "cost_per_serving": 1, "default_price": 1, "unit_price": 1},
        )
        if recipe:
            return {
                "current_price": recipe.get("default_price") or recipe.get("unit_price"),
                "current_cost": recipe.get("cost_per_portion") or recipe.get("cost_per_serving"),
            }
    # Picklist items (Food, Service, Rental, Fee)
    pl = await db.picklist_items.find_one(
        {"item_id": ref_id, "company_id": company_id},
        {"_id": 0, "default_price": 1, "internal_cost": 1},
    )
    if pl:
        return {
            "current_price": pl.get("default_price"),
            "current_cost": pl.get("internal_cost"),
        }
    return {"current_price": None, "current_cost": None}

@proposals_router.get("/section-templates/{template_id}/check")
async def check_section_template(template_id: str, user: User = Depends(get_current_user)):
    """Enrich template items with current price/cost and stale flags."""
    tpl = await db.section_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    enriched_items = []
    stale_count = 0
    for idx, it in enumerate(tpl.get("items", [])):
        current = await _resolve_current_pricing(it, user.company_id)
        snap_price = it.get("unit_price")
        snap_cost = it.get("internal_cost")
        cur_price = current["current_price"]
        cur_cost = current["current_cost"]
        is_stale_price = cur_price is not None and snap_price is not None and abs(float(cur_price) - float(snap_price)) > 0.001
        is_stale_cost = cur_cost is not None and snap_cost is not None and abs(float(cur_cost) - float(snap_cost)) > 0.001
        if is_stale_price or is_stale_cost:
            stale_count += 1
        enriched_items.append({
            **it,
            "_idx": idx,
            "_current_price": cur_price,
            "_current_cost": cur_cost,
            "_is_stale_price": is_stale_price,
            "_is_stale_cost": is_stale_cost,
            "_has_reference": bool(it.get("reference_id")),
        })
    return {**tpl, "items": enriched_items, "stale_count": stale_count}

@proposals_router.post("/section-templates/{template_id}/refresh")
async def refresh_section_template(template_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Update template snapshot prices/costs to current values.
    body: { item_indexes: [int]|None (None = refresh all stale) }
    """
    tpl = await db.section_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    target_indexes = body.get("item_indexes")
    items = tpl.get("items", [])
    updated_count = 0
    for idx, it in enumerate(items):
        if target_indexes is not None and idx not in target_indexes:
            continue
        current = await _resolve_current_pricing(it, user.company_id)
        cp = current["current_price"]
        cc = current["current_cost"]
        changed = False
        if cp is not None and (it.get("unit_price") is None or abs(float(cp) - float(it.get("unit_price") or 0)) > 0.001):
            it["unit_price"] = float(cp)
            changed = True
        if cc is not None and (it.get("internal_cost") is None or abs(float(cc) - float(it.get("internal_cost") or 0)) > 0.001):
            it["internal_cost"] = float(cc)
            changed = True
        if changed:
            updated_count += 1
    await db.section_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": {"items": items, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"updated": updated_count, "total": len(items)}

@proposals_router.post("/{proposal_id}/apply-template")
async def apply_section_template(proposal_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Clone the template's items into the proposal."""
    template_id = body.get("template_id")
    target_date = body.get("target_date")  # Optional ISO date
    use_current_prices = bool(body.get("use_current_prices", False))
    if not template_id:
        raise HTTPException(status_code=400, detail="template_id required")

    proposal = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": user.company_id}
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    event = await db.events.find_one(
        {"event_id": proposal["event_id"], "company_id": user.company_id}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit items in a closed event")

    tpl = await db.section_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    now = datetime.now(timezone.utc).isoformat()
    created = []
    max_sort = 0
    cursor = await db.order_items.find(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0, "sort_order": 1},
    ).to_list(2000)
    for it in cursor:
        max_sort = max(max_sort, int(it.get("sort_order") or 0))

    for offset, it in enumerate(tpl.get("items", [])):
        # Optionally overwrite with current pricing
        price = float(it.get("unit_price") or 0)
        cost = it.get("internal_cost")
        if use_current_prices:
            current = await _resolve_current_pricing(it, user.company_id)
            if current["current_price"] is not None:
                price = float(current["current_price"])
            if current["current_cost"] is not None:
                cost = float(current["current_cost"])
        item_id = f"oi_{uuid.uuid4().hex[:12]}"
        qty = float(it.get("quantity") or 1)
        total_price = qty * price
        total_cost = qty * cost if cost is not None else None
        margin_amount = total_price - total_cost if total_cost is not None else None
        margin_pct = (margin_amount / total_price * 100) if margin_amount is not None and total_price > 0 else None
        doc = {
            "item_id": item_id,
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "item_type": it.get("item_type") or "Service",
            "reference_id": it.get("reference_id"),
            "description": it.get("description") or "",
            "quantity": qty,
            "unit_price": price,
            "internal_cost": cost,
            "total_price": total_price,
            "total_cost": total_cost,
            "margin_amount": margin_amount,
            "margin_percentage": margin_pct,
            "category_id": it.get("category_id"),
            "internal_notes": it.get("internal_notes"),
            "event_date": target_date or it.get("event_date"),
            "section_title": it.get("section_title") or "",
            "section_time": it.get("section_time"),
            "sort_order": max_sort + 1 + offset,
            "created_at": now,
            "updated_at": now,
        }
        await db.order_items.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc)
    return {"created": len(created), "items": created, "use_current_prices": use_current_prices}

# ============== DUPLICATE DAY (Multi-day events) ==============

@proposals_router.post("/{proposal_id}/duplicate-day")
async def duplicate_proposal_day(proposal_id: str, body: Dict[str, Any], user: User = Depends(get_current_user)):
    """Clone all items from one day to another within the same proposal.
    body: { source_date: 'YYYY-MM-DD'|None, target_date: 'YYYY-MM-DD'|None, mode: 'append'|'replace' }
    Either date may be None to indicate the unassigned bucket.
    """
    source_date = body.get("source_date")
    target_date = body.get("target_date")
    mode = (body.get("mode") or "append").lower()
    if mode not in ("append", "replace"):
        raise HTTPException(status_code=400, detail="mode must be append or replace")
    if (source_date or "") == (target_date or ""):
        raise HTTPException(status_code=400, detail="source and target dates must differ")

    proposal = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": user.company_id}
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    event = await db.events.find_one(
        {"event_id": proposal["event_id"], "company_id": user.company_id}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit items in a closed event")

    # Fetch source items
    source_query = {"proposal_id": proposal_id, "company_id": user.company_id}
    if source_date is None:
        source_query["$or"] = [{"event_date": None}, {"event_date": {"$exists": False}}]
    else:
        source_query["event_date"] = source_date
    source_items = await db.order_items.find(source_query, {"_id": 0}).sort("sort_order", 1).to_list(2000)
    if not source_items:
        raise HTTPException(status_code=400, detail="No items found in source day")

    # If replace mode: delete existing items in target day first
    if mode == "replace":
        target_query = {"proposal_id": proposal_id, "company_id": user.company_id}
        if target_date is None:
            target_query["$or"] = [{"event_date": None}, {"event_date": {"$exists": False}}]
        else:
            target_query["event_date"] = target_date
        await db.order_items.delete_many(target_query)

    now = datetime.now(timezone.utc).isoformat()
    # Determine base sort_order
    max_sort = 0
    all_items = await db.order_items.find(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0, "sort_order": 1},
    ).to_list(2000)
    for it in all_items:
        max_sort = max(max_sort, int(it.get("sort_order") or 0))

    created = []
    for offset, src in enumerate(source_items):
        new_doc = {
            **src,
            "item_id": f"oi_{uuid.uuid4().hex[:12]}",
            "event_date": target_date,
            "sort_order": max_sort + 1 + offset,
            "created_at": now,
            "updated_at": now,
        }
        new_doc.pop("_id", None)
        await db.order_items.insert_one(new_doc)
        new_doc.pop("_id", None)
        created.append(new_doc)
    return {"created": len(created), "mode": mode, "items": created}

