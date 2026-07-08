"""Proposal Cost Health — cost staleness, refresh, margin approval, cost-health dashboard.

Extracted from routers/proposals.py in P2 refactor. LOGIC UNCHANGED.
Attaches endpoints to the shared `proposals_router` (URLs unchanged).

Contains:
- GET /{proposal_id}/cost-staleness
- POST /{proposal_id}/request-margin-approval
- POST /{proposal_id}/refresh-costs
- GET /cost-health/overview
- POST /cost-health/refresh-all
- Internal margin-guardrail helper functions used by the endpoints above
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, Request

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.proposals import (
    proposals_router,
    resolve_min_margin,
    get_margin_policy_doc,
)


logger = logging.getLogger(__name__)


# ============== COST HEALTH — extracted from proposals.py ==============
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


