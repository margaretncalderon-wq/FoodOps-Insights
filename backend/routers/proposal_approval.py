"""
Proposal approval — endpoints for the state machine introduced Feb 2026.

State machine (per product owner):
    Draft ── submit-for-approval ─▶ Pending Approval
    Pending Approval ── approve ──▶ Approved
    Pending Approval ── withdraw ─▶ Draft (any editor; stamps withdrawn_by/at)
    Approved ── send-to-client ──▶ Sent
    Approved ── revoke-approval ▶ Pending Approval (motivo obligatorio)
    Sent   ── material edit ─────▶ Pending Approval (revoked, toast confirma en UI)

Gated by `company_settings.proposal_approval.require_approval` (default False —
all tenants keep today's behaviour). When the flag is off, the legacy
`status = Accepted` → `event.stage = Committed` flow still works untouched.

`text_only` edits (`client_notes`, `presentation_notes`, `internal_notes`,
long descriptions on items) DO NOT revoke approval — only quantity, price,
tax, discount, payment_terms, and item add/remove do.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import Body, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.proposals import proposals_router

logger = logging.getLogger(__name__)

# Fields whose change does NOT revoke an existing Approved status.
TEXT_ONLY_FIELDS = {
    "client_notes", "internal_notes", "presentation_notes",
    "long_description", "description", "notes",
    "sections", "section_titles",  # section-level text tweaks
}

# Explicit fields that DO revoke approval when they change.
MATERIAL_FIELDS = {
    "subtotal", "discount_amount", "discount_type", "discount_value",
    "tax_details", "total_tax", "total", "total_cost", "total_margin",
    "margin_percentage", "payment_terms", "valid_until",
}


async def is_approval_required(company_id: str) -> bool:
    """Read the tenant toggle. Default False for every tenant (Feb 2026)."""
    doc = await db.company_settings.find_one(
        {"company_id": company_id}, {"_id": 0, "proposal_approval": 1}
    )
    if not doc:
        return False
    return bool((doc.get("proposal_approval") or {}).get("require_approval", False))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@proposals_router.post("/{proposal_id}/submit-for-approval")
async def submit_for_approval(proposal_id: str, user: User = Depends(get_current_user)):
    p = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    cur = p.get("document_status") or "Draft"
    if cur not in ("Draft", "Ready to Send"):
        raise HTTPException(status_code=409, detail=f"Cannot submit from state '{cur}'")
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {"document_status": "Pending Approval", "last_edited_at": _now_iso()}},
    )
    return {"document_status": "Pending Approval"}


@proposals_router.post("/{proposal_id}/approve")
async def approve_proposal(proposal_id: str, user: User = Depends(get_current_user)):
    """Any teammate with proposals:edit permission may approve. Auth is
    already enforced via `get_current_user`; a finer-grained permission
    check can be added later without changing the endpoint contract."""
    p = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    cur = p.get("document_status") or "Draft"
    if cur != "Pending Approval":
        raise HTTPException(status_code=409, detail=f"Only 'Pending Approval' can be approved (current: '{cur}')")
    approved_by = {"user_id": user.user_id, "name": user.name, "at": _now_iso()}
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {
            "document_status": "Approved",
            "approved_by": approved_by,
            "approval_revoked_reason": None,
            "approval_revoked_at": None,
            "last_edited_at": _now_iso(),
        }},
    )
    return {"document_status": "Approved", "approved_by": approved_by}


@proposals_router.post("/{proposal_id}/revoke-approval")
async def revoke_approval(
    proposal_id: str,
    body: Dict[str, Any] = Body(default={}),
    user: User = Depends(get_current_user),
):
    reason = (body.get("reason") or "").strip()
    if not reason:
        # Product-owner decision Feb 2026: reason is mandatory so history
        # explains why (e.g. "modificación de cotización").
        raise HTTPException(status_code=400, detail="Reason is required (e.g. 'modificación de cotización')")
    p = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    cur = p.get("document_status") or "Draft"
    if cur not in ("Approved", "Sent"):
        raise HTTPException(status_code=409, detail=f"Nothing to revoke in state '{cur}'")
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {
            "document_status": "Pending Approval",
            "approval_revoked_reason": reason,
            "approval_revoked_at": _now_iso(),
            "last_edited_at": _now_iso(),
        }},
    )
    return {"document_status": "Pending Approval", "reason": reason}


@proposals_router.post("/{proposal_id}/send-to-client")
async def send_to_client(proposal_id: str, user: User = Depends(get_current_user)):
    p = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    cur = p.get("document_status") or "Draft"
    require = await is_approval_required(user.company_id)
    # When require_approval=false, allow Draft/Ready to Send → Sent directly
    # (legacy behaviour). When true, must be Approved first.
    if require:
        if cur != "Approved":
            raise HTTPException(status_code=409, detail=f"Approval required before sending (current: '{cur}')")
    else:
        if cur in ("Client Signed",):
            raise HTTPException(status_code=409, detail=f"Cannot resend from state '{cur}'")
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {"document_status": "Sent", "status": "Sent", "sent_at": _now_iso(), "last_edited_at": _now_iso()}},
    )
    return {"document_status": "Sent"}


@proposals_router.post("/{proposal_id}/withdraw-approval")
async def withdraw_approval(proposal_id: str, user: User = Depends(get_current_user)):
    """Any teammate with proposals:edit permission may withdraw a pending
    approval request and send the document back to Draft. Audit stamp is
    stored on `withdrawn_by` / `withdrawn_at` so history explains why the
    doc left the queue without being approved."""
    p = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    cur = p.get("document_status") or "Draft"
    if cur != "Pending Approval":
        raise HTTPException(
            status_code=409,
            detail=f"Only 'Pending Approval' can be withdrawn (current: '{cur}')",
        )
    withdrawn_by = {"user_id": user.user_id, "name": user.name, "at": _now_iso()}
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {
            "document_status": "Draft",
            "withdrawn_by": withdrawn_by,
            "withdrawn_at": _now_iso(),
            "last_edited_at": _now_iso(),
        }},
    )
    return {"document_status": "Draft", "withdrawn_by": withdrawn_by}


@proposals_router.post("/{proposal_id}/clear-incomplete-flag")
async def clear_incomplete_flag(proposal_id: str, user: User = Depends(get_current_user)):
    r = await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": {"data_incomplete": False, "data_incomplete_source": None, "last_edited_at": _now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return {"data_incomplete": False}


async def maybe_revoke_on_material_change(
    proposal_id: str, company_id: str, changed_fields: set
) -> bool:
    """Called from item POST/PUT/DELETE + proposal PUT. When the current
    proposal is Approved/Sent and any changed field is material, we bump the
    doc back to `Pending Approval` and stamp `last_material_edit_at`.

    Returns True when a revoke happened so the caller can bubble a hint to
    the UI ("your change revoked approval — confirm to proceed").
    """
    if not (changed_fields & MATERIAL_FIELDS):
        return False
    p = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": company_id},
        {"_id": 0, "document_status": 1},
    )
    if not p:
        return False
    if (p.get("document_status") or "") not in ("Approved", "Sent"):
        return False
    await db.proposals.update_one(
        {"proposal_id": proposal_id, "company_id": company_id},
        {"$set": {
            "document_status": "Pending Approval",
            "approval_revoked_reason": "auto: material edit after approval",
            "approval_revoked_at": _now_iso(),
            "last_material_edit_at": _now_iso(),
        }},
    )
    logger.info(f"proposal_approval: auto-revoked {proposal_id} due to material change")
    return True


@proposals_router.get("/settings/approval")
async def get_approval_settings(user: User = Depends(get_current_user)):
    require = await is_approval_required(user.company_id)
    return {"require_approval": require}


@proposals_router.get("/approval-overview")
async def approval_overview(user: User = Depends(get_current_user)):
    """Feeds the "Pending Approvals" tray, dashboard widget and sidebar badge.

    Returns:
      - require_approval: tenant flag
      - count_pending: number of proposals in Pending Approval
      - pending: [{proposal_id, event_id, event_name, client_name,
                   event_date, submitted_at, total, data_incomplete}]
        Sorted by urgency (nearest event first) then FIFO submission time.
      - event_status_map: {event_id: {document_status, data_incomplete, proposal_id}}
        so the events list can render filter chips without a second call.
    """
    require = await is_approval_required(user.company_id)

    # Pull the minimal proposal fields needed for the widget + filter map.
    proposals = await db.proposals.find(
        {"company_id": user.company_id},
        {
            "_id": 0,
            "proposal_id": 1,
            "event_id": 1,
            "event_name": 1,
            "client_id": 1,
            "document_status": 1,
            "data_incomplete": 1,
            "total": 1,
            "last_edited_at": 1,
            "created_at": 1,
            "approval_revoked_reason": 1,
            "approval_revoked_at": 1,
        },
    ).to_list(2000)

    event_ids = [p.get("event_id") for p in proposals if p.get("event_id")]
    client_ids = [p.get("client_id") for p in proposals if p.get("client_id")]

    events_by_id: Dict[str, Dict[str, Any]] = {}
    if event_ids:
        async for e in db.events.find(
            {"company_id": user.company_id, "event_id": {"$in": event_ids}},
            {"_id": 0, "event_id": 1, "name": 1, "event_date": 1, "client_id": 1},
        ):
            events_by_id[e["event_id"]] = e

    # Orphan proposals (their event was deleted) stay in the DB forever but
    # confuse the queue — exclude them from the pending list AND the
    # event_status_map so chip counts match what the user can actually open.
    live_proposals = [p for p in proposals if p.get("event_id") in events_by_id]

    clients_by_id: Dict[str, Dict[str, Any]] = {}
    all_client_ids = set(client_ids) | {e.get("client_id") for e in events_by_id.values() if e.get("client_id")}
    if all_client_ids:
        async for c in db.clients.find(
            {"client_id": {"$in": list(all_client_ids)}},
            {"_id": 0, "client_id": 1, "display_name": 1, "name": 1},
        ):
            clients_by_id[c["client_id"]] = c

    event_status_map: Dict[str, Dict[str, Any]] = {}
    pending: list = []
    for p in live_proposals:
        eid = p.get("event_id")
        status = p.get("document_status") or "Draft"
        if eid:
            event_status_map[eid] = {
                "proposal_id": p.get("proposal_id"),
                "document_status": status,
                "data_incomplete": bool(p.get("data_incomplete")),
            }
        if status == "Pending Approval":
            ev = events_by_id.get(eid) if eid else None
            client_id = (ev or {}).get("client_id") or p.get("client_id")
            client = clients_by_id.get(client_id) if client_id else None
            pending.append({
                "proposal_id": p.get("proposal_id"),
                "event_id": eid,
                "event_name": (ev or {}).get("name") or p.get("event_name") or "—",
                "client_name": (client or {}).get("display_name") or (client or {}).get("name") or "",
                "event_date": (ev or {}).get("event_date"),
                "submitted_at": p.get("last_edited_at") or p.get("created_at"),
                "total": p.get("total") or 0,
                "data_incomplete": bool(p.get("data_incomplete")),
                "revoked_reason": p.get("approval_revoked_reason"),
            })

    def _sort_key(item):
        # Primary: urgency (nearest event_date first, TBD/missing goes last).
        # Secondary: FIFO submission (oldest first) so nothing rots.
        ed = item.get("event_date") or ""
        # empty string sorts before real dates → push it to the end
        primary = ed if ed else "9999-12-31"
        submitted = item.get("submitted_at") or ""
        return (primary, submitted)

    pending.sort(key=_sort_key)

    return {
        "require_approval": require,
        "count_pending": len(pending),
        "pending": pending,
        "event_status_map": event_status_map,
    }


@proposals_router.put("/settings/approval")
async def set_approval_settings(
    body: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    val = bool(body.get("require_approval", False))
    await db.company_settings.update_one(
        {"company_id": user.company_id},
        {"$set": {"proposal_approval.require_approval": val}, "$setOnInsert": {"company_id": user.company_id}},
        upsert=True,
    )
    return {"require_approval": val}
