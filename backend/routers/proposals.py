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
    """Kept as internal alias for backward compatibility with callers.
    `generate_proposal_number` lives in this module (defined below)."""
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

