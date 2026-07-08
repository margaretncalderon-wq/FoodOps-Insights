"""Proposal Section Templates — reusable pack templates for proposals.

Extracted from routers/proposals.py in P2 refactor. LOGIC UNCHANGED.

Endpoints attach to the shared `proposals_router` from routers.proposals so URLs
stay identical (`/api/proposals/section-templates/*` and
`/api/proposals/{proposal_id}/apply-template`).
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Body, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.proposals import proposals_router

logger = logging.getLogger(__name__)


# ============== SECTION TEMPLATES (Reusable Packs) — extracted from proposals.py ==============

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
