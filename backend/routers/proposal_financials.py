"""Proposal Financials — discount, taxes, day-logistics, custom-fields updates.

Extracted from routers/proposals.py in P2 refactor. LOGIC UNCHANGED.
Attaches endpoints to the shared `proposals_router` (URLs unchanged).
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.proposals import proposals_router, get_event_proposal, _compute_item_discount


logger = logging.getLogger(__name__)


# ============== PROPOSAL FINANCIALS / DAY-LOGISTICS / CUSTOM-FIELDS ==============
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
