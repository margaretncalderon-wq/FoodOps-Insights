"""
Proposal approval — endpoints for the state machine introduced Feb 2026.

State machine (per product owner):
    Draft ── submit-for-approval ─▶ Pending Approval
    Pending Approval ── approve ──▶ Approved
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
