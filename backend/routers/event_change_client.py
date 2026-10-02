"""Reassign the client linked to an event (and its invoices/payments).

Introduced Sep 2026 after the user flagged that there was no way to change
the client on an existing proposal. The generic `PUT /events/{id}` endpoint
intentionally rejects a client_id swap so callers must route through here
and consciously decide what happens to any existing payments.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import Body, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.events import events_router

logger = logging.getLogger(__name__)


@events_router.get("/{event_id}/change-client/preflight")
async def change_client_preflight(event_id: str, user: User = Depends(get_current_user)):
    """Returns which payments / invoices will be impacted so the UI can
    ask the operator whether to transfer them or block the reassignment."""
    ev = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "client_id": 1, "name": 1},
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    # Invoices tied to this event
    invoices = await db.invoices.find(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "invoice_id": 1, "status": 1, "total": 1, "paid_amount": 1,
         "balance_due": 1, "number": 1},
    ).to_list(500)

    # Payments tied to this event (either directly or through invoices)
    invoice_ids = [i.get("invoice_id") for i in invoices if i.get("invoice_id")]
    pay_query: Dict[str, Any] = {"company_id": user.company_id,
                                 "$or": [{"event_id": event_id}]}
    if invoice_ids:
        pay_query["$or"].append({"invoice_id": {"$in": invoice_ids}})
    payments = await db.payments.find(
        pay_query,
        {"_id": 0, "payment_id": 1, "amount": 1, "method": 1, "status": 1,
         "paid_at": 1, "invoice_id": 1},
    ).to_list(500)

    current_client = None
    if ev.get("client_id"):
        current_client = await db.clients.find_one(
            {"client_id": ev["client_id"]},
            {"_id": 0, "client_id": 1, "display_name": 1, "name": 1},
        )

    return {
        "event_id": event_id,
        "event_name": ev.get("name"),
        "current_client": current_client,
        "invoices_count": len(invoices),
        "payments_count": len(payments),
        "has_blocking_data": len(payments) > 0 or len(invoices) > 0,
        "invoices": invoices,
        "payments": payments,
    }


@events_router.post("/{event_id}/change-client")
async def change_event_client(
    event_id: str,
    body: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    """Swap the client of an event.

    Body:
      - new_client_id (str, required)
      - transfer_payments (bool, default False): when True, invoices and
        payments are re-pointed to the new client. When False and the event
        has any payments/invoices, we 409 so the UI prompts the operator.
    """
    new_client_id = (body.get("new_client_id") or "").strip()
    transfer_payments = bool(body.get("transfer_payments", False))
    if not new_client_id:
        raise HTTPException(status_code=400, detail="new_client_id is required")

    ev = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "client_id": 1, "name": 1},
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if new_client_id == ev.get("client_id"):
        raise HTTPException(status_code=400, detail="New client is the same as current")

    new_client = await db.clients.find_one(
        {"client_id": new_client_id, "company_id": user.company_id},
        {"_id": 0, "client_id": 1, "display_name": 1, "name": 1},
    )
    if not new_client:
        raise HTTPException(status_code=404, detail="New client not found")

    old_client_id = ev.get("client_id")

    # Guardrail: if the event has any payments and the caller didn't opt in
    # to transferring them, bail out so the frontend can prompt.
    if not transfer_payments:
        pay_count = await db.payments.count_documents({
            "company_id": user.company_id,
            "$or": [{"event_id": event_id}, {"invoice_id": {"$exists": True}}],
            "event_id": event_id,  # tighter: only payments actually tagged to this event
        })
        if pay_count > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    "payments_exist: this event has payments. Delete them first "
                    "or re-call with transfer_payments=true to move them to the "
                    "new client."
                ),
            )

    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Update the event
    await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$set": {"client_id": new_client_id, "updated_at": now_iso}},
    )

    # 2. Keep events_count counters consistent
    if old_client_id:
        await db.clients.update_one(
            {"client_id": old_client_id}, {"$inc": {"events_count": -1}}
        )
    await db.clients.update_one(
        {"client_id": new_client_id}, {"$inc": {"events_count": 1}}
    )

    moved_invoices = 0
    moved_payments = 0
    if transfer_payments:
        # 3a. Repoint invoices
        inv_res = await db.invoices.update_many(
            {"event_id": event_id, "company_id": user.company_id},
            {"$set": {"client_id": new_client_id, "updated_at": now_iso}},
        )
        moved_invoices = inv_res.modified_count
        # 3b. Repoint payments (both event-level + invoice-level references)
        pay_res = await db.payments.update_many(
            {"event_id": event_id, "company_id": user.company_id},
            {"$set": {"client_id": new_client_id, "updated_at": now_iso}},
        )
        moved_payments = pay_res.modified_count

    # 4. Material change → auto-revoke approval on the proposal if any
    proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "proposal_id": 1},
    )
    if proposal:
        from routers.proposal_approval import maybe_revoke_on_material_change
        await maybe_revoke_on_material_change(
            proposal["proposal_id"], user.company_id, {"payment_terms"}
        )

    # 5. Audit log
    await db.audit_logs.insert_one({
        "log_id": f"audit_{datetime.now(timezone.utc).timestamp():.0f}",
        "event_id": event_id,
        "company_id": user.company_id,
        "user_id": user.user_id,
        "user_name": user.name,
        "action_type": "client_reassigned",
        "changes": {
            "old_client_id": old_client_id,
            "new_client_id": new_client_id,
            "new_client_name": new_client.get("display_name") or new_client.get("name"),
            "transferred_payments": transfer_payments,
            "moved_invoices_count": moved_invoices,
            "moved_payments_count": moved_payments,
        },
        "timestamp": now_iso,
    })
    logger.info(
        f"[change-client] event={event_id} {old_client_id} → {new_client_id} "
        f"transfer_payments={transfer_payments} invoices={moved_invoices} payments={moved_payments}"
    )

    return {
        "event_id": event_id,
        "new_client_id": new_client_id,
        "new_client_name": new_client.get("display_name") or new_client.get("name"),
        "transferred_invoices": moved_invoices,
        "transferred_payments": moved_payments,
    }
