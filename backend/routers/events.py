"""Event endpoints — extracted from server.py in the refactor sprint. LOGIC UNCHANGED.

Contains:
- Event CRUD (list, get, create, update, delete, duplicate)
- Pipeline / confirmed / lost-reasons-analytics
- Tasks (post, update status)
- Event menu attach + stock check + generate purchase list
- Purchase order status/receive routes (under `/events/purchase-orders/*` legacy prefix)
"""
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from models.events import (
    Event,
    EventCreate,
    EventUpdate,
)
from utils.activity_logger import log_activity, user_info

logger = logging.getLogger(__name__)

events_router = APIRouter(prefix="/events", tags=["Events"])


# Stage normalization — kept in sync with server.py's global map.
ENGAGEMENT_STAGES = ["Inquiry Received", "Context Captured", "Scope Drafted",
                     "Definition In Review", "Committed", "Archived"]
_LEGACY_STAGE_MAP = {
    "Lead": "Inquiry Received",
    "Contacted": "Context Captured",
    "Proposal": "Scope Drafted",
    "Negotiation": "Definition In Review",
    "Won": "Committed",
    "Approved": "Committed",
    "Closed": "Archived",
    "Lost": "Archived",
}


def normalize_stage(stage: Optional[str]) -> str:
    """Normalize legacy stages to new Engagement Stages."""
    if not stage:
        return "Inquiry Received"
    if stage in _LEGACY_STAGE_MAP:
        return _LEGACY_STAGE_MAP[stage]
    return stage if stage in ENGAGEMENT_STAGES else "Inquiry Received"


# Late-imported (avoids circular dependency with server.py). Call inside handlers.
async def _check_usage_limit(company_id: str, metric: str):
    from server import check_usage_limit
    return await check_usage_limit(company_id, metric)


async def _increment_usage(company_id: str, metric: str, amount: int = 1):
    from server import increment_usage
    return await increment_usage(company_id, metric, amount)


async def _generate_proposal_number(company_id: str) -> str:
    from server import generate_proposal_number
    return await generate_proposal_number(company_id)


# ============ BODY (endpoints) — extracted from server.py ============
# ============== EVENT MENU & STOCK CHECK ==============

@events_router.get("")
async def get_events(user: User = Depends(get_current_user), stage: Optional[str] = None):
    """Get all events with optional stage filter"""
    query = {"company_id": user.company_id}
    if stage:
        query["stage"] = stage
    
    events = await db.events.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get all client IDs to fetch client info
    client_ids = list(set(e.get("client_id") for e in events if e.get("client_id")))
    clients_data = {}
    if client_ids:
        clients = await db.clients.find({"client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1, "display_name": 1, "client_type": 1}).to_list(len(client_ids))
        clients_data = {c["client_id"]: c for c in clients}
    
    # Get all event IDs to fetch invoice balances
    event_ids = [e.get("event_id") for e in events if e.get("event_id")]
    invoices_by_event = {}
    if event_ids:
        invoices = await db.invoices.find(
            {"company_id": user.company_id, "event_id": {"$in": event_ids}, "status": {"$ne": "paid"}},
            {"_id": 0, "event_id": 1, "balance_due": 1}
        ).to_list(1000)
        for inv in invoices:
            eid = inv.get("event_id")
            if eid:
                invoices_by_event[eid] = invoices_by_event.get(eid, 0) + (inv.get("balance_due") or 0)
    
    # Compute live proposal totals per event from order_items so the events
    # list always reflects what's actually inside the proposal — see pipeline
    # endpoint for the same logic.
    live_totals = {}
    events_with_proposal = set()
    if event_ids:
        try:
            agg = [
                {"$match": {"company_id": user.company_id, "event_id": {"$in": event_ids}}},
                {"$project": {
                    "_id": 0,
                    "event_id": 1,
                    "line_total": {
                        "$cond": [
                            {"$gt": [{"$ifNull": ["$total_price", 0]}, 0]},
                            "$total_price",
                            {"$multiply": [{"$ifNull": ["$quantity", 0]}, {"$ifNull": ["$unit_price", 0]}]},
                        ]
                    },
                }},
                {"$group": {"_id": "$event_id", "total": {"$sum": "$line_total"}}},
            ]
            async for row in db.order_items.aggregate(agg):
                live_totals[row["_id"]] = float(row.get("total") or 0)
            async for p in db.proposals.find(
                {"company_id": user.company_id, "event_id": {"$in": event_ids}},
                {"_id": 0, "event_id": 1},
            ):
                if p.get("event_id"):
                    events_with_proposal.add(p["event_id"])
        except Exception:
            pass

    for e in events:
        for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except:
                    e[field] = None
        if "documents" not in e:
            e["documents"] = []
        # Normalize stage (map legacy to new)
        original_stage = e.get("stage", "Inquiry Received")
        e["stage"] = normalize_stage(original_stage)
        # Add client info to event
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_info"] = {
            "display_name": client_info.get("display_name", client_info.get("name", "")),
            "client_type": client_info.get("client_type", "Individual")
        }
        # Add pending balance from invoices
        e["pending_balance"] = invoices_by_event.get(e.get("event_id"), 0)
        # Override expected_value with the live proposal total when a proposal exists
        eid = e.get("event_id")
        if eid and eid in events_with_proposal:
            e["expected_value"] = live_totals.get(eid, 0)
    return events

@events_router.get("/pipeline")
async def get_events_pipeline(user: User = Depends(get_current_user)):
    """Get events grouped by engagement stage"""
    new_stages = ["Inquiry Received", "Context Captured", "Scope Drafted", "Definition In Review", "Committed", "Archived"]
    legacy_stages = ["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Approved", "Closed", "Lost"]
    all_stages = new_stages + legacy_stages
    
    pipeline = {stage: [] for stage in new_stages}  # Initialize with new stages only
    
    # Get all clients for client info
    all_clients = await db.clients.find({"company_id": user.company_id}, {"_id": 0, "client_id": 1, "display_name": 1, "client_type": 1}).to_list(1000)
    clients_data = {c["client_id"]: c for c in all_clients}
    
    # Get all invoices with pending balance for quick lookup
    all_invoices = await db.invoices.find(
        {"company_id": user.company_id, "status": {"$ne": "paid"}},
        {"_id": 0, "event_id": 1, "balance_due": 1}
    ).to_list(1000)
    invoices_by_event = {}
    for inv in all_invoices:
        eid = inv.get("event_id")
        if eid:
            invoices_by_event[eid] = invoices_by_event.get(eid, 0) + (inv.get("balance_due") or 0)
    
    # Get all events and normalize stages
    events = await db.events.find({"company_id": user.company_id}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Compute live proposal totals per event from order_items so the card
    # always reflects what's actually inside the proposal (deleting/editing
    # items does not auto-update proposal.total_amount, and the duplicated
    # event used to carry the original's stale expected_value forever).
    event_ids = [e.get("event_id") for e in events if e.get("event_id")]
    live_totals = {}
    if event_ids:
        try:
            pipeline_agg = [
                {"$match": {"company_id": user.company_id, "event_id": {"$in": event_ids}}},
                {"$project": {
                    "_id": 0,
                    "event_id": 1,
                    "line_total": {
                        "$cond": [
                            {"$gt": [{"$ifNull": ["$total_price", 0]}, 0]},
                            "$total_price",
                            {"$multiply": [
                                {"$ifNull": ["$quantity", 0]},
                                {"$ifNull": ["$unit_price", 0]}
                            ]},
                        ]
                    },
                }},
                {"$group": {"_id": "$event_id", "total": {"$sum": "$line_total"}}},
            ]
            async for row in db.order_items.aggregate(pipeline_agg):
                live_totals[row["_id"]] = float(row.get("total") or 0)
        except Exception:
            live_totals = {}

    # Look up which events have an attached proposal — we want to override
    # expected_value with the live items total ONLY for those (events without
    # a proposal keep their manually-entered expected_value untouched).
    events_with_proposal = set()
    if event_ids:
        try:
            async for p in db.proposals.find(
                {"company_id": user.company_id, "event_id": {"$in": event_ids}},
                {"_id": 0, "event_id": 1},
            ):
                if p.get("event_id"):
                    events_with_proposal.add(p["event_id"])
        except Exception:
            pass

    for e in events:
        for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except:
                    e[field] = None
        # Add client info
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_info"] = {
            "display_name": client_info.get("display_name", ""),
            "client_type": client_info.get("client_type", "Individual")
        }
        # Add pending balance from invoices
        e["pending_balance"] = invoices_by_event.get(e.get("event_id"), 0)

        # Override expected_value with the live proposal total when a proposal
        # is attached. Falls back to 0 when proposal exists but has no items
        # (e.g. after the user duplicated and deleted everything in the copy).
        eid = e.get("event_id")
        if eid and eid in events_with_proposal:
            e["expected_value"] = live_totals.get(eid, 0)

        # Normalize stage and add to correct pipeline bucket
        original_stage = e.get("stage", "Inquiry Received")
        normalized_stage = normalize_stage(original_stage)
        e["stage"] = normalized_stage  # Update event stage for frontend
        e["original_stage"] = original_stage  # Keep original for reference
        
        if normalized_stage in pipeline:
            pipeline[normalized_stage].append(e)
    
    return pipeline

@events_router.get("/lost-reasons-analytics")
async def get_lost_reasons_analytics(
    period: str = "90d",
    user: User = Depends(get_current_user)
):
    """Aggregate counts + total expected value of events marked as Lost,
    grouped by `lost_reason`. Used by the Client Engagement dashboard widget.

    `period` accepts `30d`, `90d`, `1y`, or `all`. Filters by `lost_reason_at`
    when present; falls back to `updated_at` for legacy lost events.
    """
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    period_map = {"30d": 30, "90d": 90, "1y": 365}
    days = period_map.get(period)
    base_query = {
        "company_id": user.company_id,
        "stage": {"$in": ["Archived", "Lost"]},
    }
    if days:
        cutoff = (now - timedelta(days=days)).isoformat()
        # Match either lost_reason_at OR updated_at >= cutoff (legacy fallback).
        base_query["$or"] = [
            {"lost_reason_at": {"$gte": cutoff}},
            {"$and": [{"lost_reason_at": None}, {"updated_at": {"$gte": cutoff}}]},
        ]

    events = await db.events.find(
        base_query,
        {
            "_id": 0,
            "event_id": 1,
            "name": 1,
            "lost_reason": 1,
            "lost_reason_notes": 1,
            "lost_reason_at": 1,
            "expected_value": 1,
            "updated_at": 1,
            "client_id": 1,
        },
    ).to_list(1000)

    # Bucket by reason
    buckets: Dict[str, Dict[str, Any]] = {}
    total_value = 0.0
    for e in events:
        reason = e.get("lost_reason") or "unspecified"
        b = buckets.setdefault(reason, {"reason": reason, "count": 0, "value": 0.0})
        b["count"] += 1
        v = e.get("expected_value") or 0
        try:
            v = float(v)
        except (TypeError, ValueError):
            v = 0.0
        b["value"] += v
        total_value += v

    total = sum(b["count"] for b in buckets.values())
    by_reason = sorted(buckets.values(), key=lambda x: x["count"], reverse=True)
    for b in by_reason:
        b["percentage"] = round((b["count"] / total) * 100, 1) if total else 0.0
        b["value"] = round(b["value"], 2)

    # Recent — last 5 lost events for the period, newest first
    def sort_key(e):
        return e.get("lost_reason_at") or e.get("updated_at") or ""
    recent_raw = sorted(events, key=sort_key, reverse=True)[:5]

    # Fetch client display names
    client_ids = list({e.get("client_id") for e in recent_raw if e.get("client_id")})
    clients_data = {}
    if client_ids:
        cs = await db.clients.find(
            {"client_id": {"$in": client_ids}},
            {"_id": 0, "client_id": 1, "display_name": 1},
        ).to_list(len(client_ids))
        clients_data = {c["client_id"]: c.get("display_name", "") for c in cs}

    recent = [
        {
            "event_id": e.get("event_id"),
            "name": e.get("name"),
            "client_name": clients_data.get(e.get("client_id"), ""),
            "lost_reason": e.get("lost_reason"),
            "lost_reason_notes": e.get("lost_reason_notes"),
            "lost_reason_at": e.get("lost_reason_at") or e.get("updated_at"),
            "expected_value": e.get("expected_value") or 0,
        }
        for e in recent_raw
    ]

    return {
        "period": period,
        "total_lost": total,
        "total_lost_value": round(total_value, 2),
        "by_reason": by_reason,
        "recent": recent,
    }


@events_router.get("/confirmed")
async def get_confirmed_events(user: User = Depends(get_current_user)):
    """Get only confirmed (Won/Closed) events for procurement and purchases"""
    events = await db.events.find(
        {"company_id": user.company_id, "stage": {"$in": ["Committed", "Won", "Closed"]}},
        {"_id": 0}
    ).sort("event_date", -1).to_list(500)
    
    # Get all client IDs to fetch client info
    client_ids = list(set(e.get("client_id") for e in events if e.get("client_id")))
    clients_data = {}
    if client_ids:
        clients = await db.clients.find({"client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1, "display_name": 1}).to_list(len(client_ids))
        clients_data = {c["client_id"]: c for c in clients}
    
    for e in events:
        for field in ["event_date", "end_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except:
                    e[field] = None
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_name"] = client_info.get("display_name", "")
    
    return events

@events_router.post("")
async def create_event(data: EventCreate, user: User = Depends(get_current_user)):
    # Check usage limit
    limit_check = await _check_usage_limit(user.company_id, "events_created")
    if not limit_check.get("allowed", True) == False:
        pass  # Allow if no limit info
    elif not limit_check["allowed"]:
        raise HTTPException(status_code=403, detail=limit_check.get("message", "Límite de eventos alcanzado"))
    
    now = datetime.now(timezone.utc)
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    event_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "event_date": data.event_date.isoformat() if data.event_date else None,
        "end_date": data.end_date.isoformat() if data.end_date else None,
        "next_followup_date": data.next_followup_date.isoformat() if data.next_followup_date else None,
        "timeline": [],
        "tasks": [],
        "menu_items": [],
        "documents": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.events.insert_one(event_doc)
    
    # Increment usage
    await _increment_usage(user.company_id, "events_created")
    
    await db.clients.update_one({"client_id": data.client_id}, {"$inc": {"events_count": 1}})
    
    del event_doc["_id"]
    event_doc["event_date"] = data.event_date
    event_doc["end_date"] = data.end_date
    event_doc["next_followup_date"] = data.next_followup_date
    event_doc["created_at"] = now
    event_doc["updated_at"] = now
    
    # Auto-sync to Google Calendar (silent no-op if not configured)
    try:
        from routers.google_calendar import auto_sync_event
        await auto_sync_event(user.company_id, event_id, action="upsert")
    except Exception as e:
        print(f"Google Calendar auto-sync failed (event create): {e}")
    
    return event_doc

@events_router.post("/{event_id}/duplicate", response_model=Event)
async def duplicate_event(event_id: str, user: User = Depends(get_current_user)):
    original = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Event not found")

    now = datetime.now(timezone.utc)
    new_event_id = f"event_{uuid.uuid4().hex[:12]}"

    new_event = {**original, "event_id": new_event_id, "name": f"{original['name']} (Copy)", "status": "planning", "tasks": [], "documents": [], "created_at": now.isoformat(), "updated_at": now.isoformat()}

    await db.events.insert_one(new_event)
    await db.clients.update_one({"client_id": original["client_id"]}, {"$inc": {"events_count": 1}})

    # Duplicate the proposal (sections, day logistics, financials, etc.) and ALL its line items.
    # Status is reset to Draft; identifiers and timestamps are regenerated.
    original_proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id}, {"_id": 0}
    )
    if original_proposal:
        new_proposal_id = f"prop_{uuid.uuid4().hex[:12]}"
        try:
            new_proposal_number = await _generate_proposal_number(user.company_id)
        except Exception:
            new_proposal_number = f"PROP-{now.year}-{uuid.uuid4().hex[:6].upper()}"
        new_proposal = {
            **original_proposal,
            "proposal_id": new_proposal_id,
            "proposal_number": new_proposal_number,
            "event_id": new_event_id,
            "status": "Draft",
            "sent_at": None,
            "accepted_at": None,
            "rejected_at": None,
            "last_edited_at": now.isoformat(),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        new_proposal.pop("_id", None)
        await db.proposals.insert_one(new_proposal)

        # Clone every line item, generating fresh item_ids while preserving sort_order,
        # section grouping, pricing, allergens, and notes. We don't carry across
        # transient run-time fields if any leaked into the doc.
        original_items = await db.order_items.find(
            {"proposal_id": original_proposal["proposal_id"]}, {"_id": 0}
        ).to_list(2000)
        cloned = []
        for it in original_items:
            new_item = {
                **it,
                "item_id": f"oi_{uuid.uuid4().hex[:12]}",
                "proposal_id": new_proposal_id,
                "event_id": new_event_id,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
            new_item.pop("_id", None)
            cloned.append(new_item)
        if cloned:
            await db.order_items.insert_many(cloned)

    # Normalize for the response model
    del new_event["_id"]
    for field in ["event_date", "end_date", "created_at", "updated_at"]:
        if new_event.get(field) and isinstance(new_event[field], str):
            new_event[field] = datetime.fromisoformat(new_event[field])

    return Event(**new_event)

@events_router.get("/{event_id}")
async def get_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
        if event.get(field) and isinstance(event[field], str):
            try:
                event[field] = datetime.fromisoformat(event[field])
            except:
                event[field] = None
    if "documents" not in event:
        event["documents"] = []
    # Normalize stage (map legacy to new)
    original_stage = event.get("stage", "Inquiry Received")
    event["stage"] = normalize_stage(original_stage)
    
    # Get client info
    client = await db.clients.find_one({"client_id": event.get("client_id")}, {"_id": 0, "display_name": 1, "client_type": 1})
    if client:
        event["client_info"] = {
            "display_name": client.get("display_name", ""),
            "client_type": client.get("client_type", "Individual")
        }
    
    return event

@events_router.put("/{event_id}")
async def update_event(event_id: str, data: EventUpdate, user: User = Depends(get_current_user)):
    # Get event name for logging
    old_event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "stage": 1, "operational_status": 1}
    )
    
    if not old_event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    # Only include non-None values in update
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Convert dates to ISO strings if present
    if "event_date" in update_data and update_data["event_date"]:
        update_data["event_date"] = update_data["event_date"].isoformat()
    if "end_date" in update_data and update_data["end_date"]:
        update_data["end_date"] = update_data["end_date"].isoformat()
    if "next_followup_date" in update_data and update_data["next_followup_date"]:
        update_data["next_followup_date"] = update_data["next_followup_date"].isoformat()

    # Normalize event_dates list: drop empties, ensure unique, sorted ascending
    if "event_dates" in update_data and isinstance(update_data["event_dates"], list):
        cleaned = sorted({d for d in update_data["event_dates"] if d})
        update_data["event_dates"] = cleaned

    # Lost-reason bookkeeping. Stamp `lost_reason_at` when stage transitions
    # INTO Archived/Lost. Clear lost_reason fields when moving OUT of those
    # stages so re-opened events don't carry stale "Perdida" metadata.
    cancellation_stages = {"Archived", "Lost"}
    incoming_stage = update_data.get("stage")
    prior_stage = old_event.get("stage")
    if incoming_stage in cancellation_stages and prior_stage not in cancellation_stages:
        update_data["lost_reason_at"] = now.isoformat()
    elif incoming_stage and incoming_stage not in cancellation_stages and prior_stage in cancellation_stages:
        update_data["lost_reason"] = None
        update_data["lost_reason_notes"] = None
        update_data["lost_reason_at"] = None

    update_data["updated_at"] = now.isoformat()
    
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # ---- Feature 6: Auto-release inventory reservations when event is cancelled.
    # Trigger when stage transitions into a cancellation-equivalent state
    # (Archived / legacy "Lost") OR operational_status becomes "Cancelled".
    try:
        cancellation_stages = {"Archived", "Lost"}
        old_stage = old_event.get("stage")
        new_stage = update_data.get("stage")
        old_op = old_event.get("operational_status")
        new_op = update_data.get("operational_status")
        became_cancelled = (
            (new_stage in cancellation_stages and old_stage not in cancellation_stages)
            or (new_op == "Cancelled" and old_op != "Cancelled")
        )
        if became_cancelled:
            released = await _auto_release_event_reservations(event_id, user, reason="event_cancelled")
            if released:
                await log_activity(
                    module="inventory",
                    action="auto_release_reservations",
                    entity_type="event",
                    entity_id=event_id,
                    entity_name=old_event.get("name") or "Event",
                    event_id=event_id,
                    metadata={"released_count": released, "trigger": "event_cancellation"},
                    **user_info(user),
                )
    except Exception as e:
        # Never block the event update if release fails — log and move on.
        logger.warning(f"[auto-release] event {event_id}: {e}")

    # Log activity
    await log_activity(
        module="events",
        action="update",
        entity_type="event",
        entity_id=event_id,
        entity_name=data.name or old_event.get("name") if old_event else "Event",
        event_id=event_id,
        **user_info(user)
    )
    
    # Auto-sync to Google Calendar
    try:
        from routers.google_calendar import auto_sync_event
        await auto_sync_event(user.company_id, event_id, action="upsert")
    except Exception as e:
        print(f"Google Calendar auto-sync failed (event update): {e}")
    
    return await get_event(event_id, user)

@events_router.delete("/{event_id}")
async def delete_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_name = event.get("name", "Event")
    _calendar_event_hint = event.get("calendar_event_id")  # captured for post-delete sync
    
    # ---- Feature 6: Release any active inventory reservations before deleting.
    try:
        released = await _auto_release_event_reservations(event_id, user, reason="event_deleted")
        if released:
            await log_activity(
                module="inventory",
                action="auto_release_reservations",
                entity_type="event",
                entity_id=event_id,
                entity_name=event_name,
                event_id=event_id,
                metadata={"released_count": released, "trigger": "event_deletion"},
                **user_info(user),
            )
    except Exception as e:
        logger.warning(f"[auto-release] event {event_id} on delete: {e}")

    await db.events.delete_one({"event_id": event_id})
    await db.clients.update_one({"client_id": event["client_id"]}, {"$inc": {"events_count": -1}})
    
    # Log activity
    await log_activity(
        module="events",
        action="delete",
        entity_type="event",
        entity_id=event_id,
        entity_name=event_name,
        event_id=event_id,
        **user_info(user)
    )
    
    # Remove from Google Calendar (silent no-op if not configured)
    try:
        from routers.google_calendar import auto_sync_event
        await auto_sync_event(user.company_id, event_id, action="delete", calendar_event_id_hint=_calendar_event_hint)
    except Exception as e:
        print(f"Google Calendar auto-sync failed (event delete): {e}")
    
    return {"message": "Event deleted"}


async def _auto_release_event_reservations(event_id: str, user: "User", reason: str = "event_cancelled") -> int:
    """Internal helper: release every ACTIVE inventory reservation linked to this event.

    Used by event cancellation/deletion hooks (Feature 6 — Auto-Release). Mirrors the
    public POST /api/inventory/release-reservation logic but skips API plumbing.
    Returns the count of reservations released. Never raises — caller handles errors.
    """
    now = datetime.now(timezone.utc)
    query = {
        "company_id": user.company_id,
        "status": "active",
        "event_ids": event_id,
    }
    reservations = await db.inventory_reservations.find(query, {"_id": 0}).to_list(1000)
    released_count = 0

    for res in reservations:
        item_id = res.get("inventory_item_id")
        qty_to_release = float(res.get("quantity_reserved") or 0)
        if not item_id or qty_to_release <= 0:
            continue

        await db.ingredients.update_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"$inc": {"reserved_quantity": -qty_to_release},
             "$set": {"updated_at": now.isoformat()}},
        )
        await db.inventory_reservations.update_one(
            {"reservation_id": res["reservation_id"]},
            {"$set": {
                "status": "released",
                "released_at": now.isoformat(),
                "released_by": user.user_id,
                "release_reason": reason,
            }},
        )
        released_count += 1

    return released_count

@events_router.post("/{event_id}/tasks")
async def add_task(event_id: str, task: dict, user: User = Depends(get_current_user)):
    task["task_id"] = f"task_{uuid.uuid4().hex[:8]}"
    task["completed"] = False
    task["created_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$push": {"tasks": task}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return task

@events_router.put("/{event_id}/tasks/{task_id}")
async def update_task(event_id: str, task_id: str, task: dict, user: User = Depends(get_current_user)):
    await db.events.update_one({"event_id": event_id, "company_id": user.company_id, "tasks.task_id": task_id}, {"$set": {"tasks.$": {**task, "task_id": task_id}}})
    return {"message": "Task updated"}

@events_router.post("/{event_id}/menu")
async def add_event_menu_item(event_id: str, data: dict, user: User = Depends(get_current_user)):
    recipe_id = data.get("recipe_id")
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$addToSet": {"menu_items": recipe_id}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Menu item added"}

@events_router.get("/{event_id}/stock-check")
async def check_event_stock(event_id: str, user: User = Depends(get_current_user)):
    """Check stock availability for event menu and generate purchase list"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    guest_count = event.get("guest_count", 1)
    menu_items = event.get("menu_items", [])
    
    # Calculate required ingredients
    required_ingredients = {}
    
    for recipe_id in menu_items:
        recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
        if not recipe:
            continue
        
        recipe_yield = recipe.get("yield_quantity", 1)
        multiplier = guest_count / recipe_yield
        
        for ing in recipe.get("ingredients", []):
            if ing.get("item_type") == "ingredient":
                ing_id = ing["item_id"]
                needed_qty = ing["quantity"] * multiplier
                
                if ing_id in required_ingredients:
                    required_ingredients[ing_id]["quantity_needed"] += needed_qty
                else:
                    required_ingredients[ing_id] = {
                        "ingredient_id": ing_id,
                        "name": ing.get("item_name", ""),
                        "quantity_needed": needed_qty,
                        "unit": ing.get("unit", "unit")
                    }
    
    # Check against current stock
    available = []
    short = []
    
    for ing_id, req in required_ingredients.items():
        ingredient = await db.ingredients.find_one({"ingredient_id": ing_id, "company_id": user.company_id}, {"_id": 0})
        if not ingredient:
            short.append({**req, "quantity_on_hand": 0, "shortage": req["quantity_needed"], "supplier_id": None})
            continue
        
        on_hand = ingredient.get("stock_quantity", 0)
        # Apply waste factor
        waste_percent = ingredient.get("yield_waste_percent", 0)
        effective_needed = req["quantity_needed"] * (1 + waste_percent / 100)
        
        if on_hand >= effective_needed:
            available.append({
                **req,
                "quantity_on_hand": on_hand,
                "surplus": on_hand - effective_needed
            })
        else:
            short.append({
                **req,
                "quantity_on_hand": on_hand,
                "shortage": effective_needed - on_hand,
                "supplier_id": ingredient.get("preferred_supplier_id"),
                "pack_size": ingredient.get("pack_size", 1),
                "pack_unit": ingredient.get("pack_unit", "unit"),
                "cost_per_unit": ingredient.get("cost_per_unit", 0)
            })
    
    return {
        "event_id": event_id,
        "guest_count": guest_count,
        "stock_requisition": available,  # Items we have in stock
        "purchase_list": short,           # Items we need to buy
        "available": available,           # Legacy support
        "short": short,                   # Legacy support
        "total_ingredients": len(required_ingredients)
    }

@events_router.post("/{event_id}/generate-purchase-list")
async def generate_event_purchase_list(event_id: str, user: User = Depends(get_current_user)):
    """Generate purchase orders grouped by supplier for event"""
    stock_check = await check_event_stock(event_id, user)
    short_items = stock_check.get("short", [])
    
    if not short_items:
        return {"message": "No items to purchase", "purchase_orders": []}
    
    # Group by supplier
    by_supplier = {}
    for item in short_items:
        supplier_id = item.get("supplier_id") or "no_supplier"
        if supplier_id not in by_supplier:
            by_supplier[supplier_id] = []
        
        pack_size = item.get("pack_size", 1)
        shortage = item.get("shortage", 0)
        packs_needed = math.ceil(shortage / pack_size)
        
        by_supplier[supplier_id].append({
            "ingredient_id": item["ingredient_id"],
            "ingredient_name": item["name"],
            "quantity_needed": item["quantity_needed"],
            "quantity_on_hand": item.get("quantity_on_hand", 0),
            "quantity_to_order": packs_needed * pack_size,
            "purchase_unit": item.get("pack_unit", "unit"),
            "pack_size": pack_size,
            "packs_to_order": packs_needed,
            "unit_cost": item.get("cost_per_unit", 0),
            "total_cost": packs_needed * pack_size * item.get("cost_per_unit", 0)
        })
    
    # Create purchase order drafts
    now = datetime.now(timezone.utc)
    purchase_orders = []
    
    for supplier_id, lines in by_supplier.items():
        if supplier_id == "no_supplier":
            continue
        
        po_id = f"po_{uuid.uuid4().hex[:12]}"
        total = sum(l["total_cost"] for l in lines)
        
        po_doc = {
            "po_id": po_id,
            "company_id": user.company_id,
            "supplier_id": supplier_id,
            "event_id": event_id,
            "lines": lines,
            "total_amount": total,
            "status": "draft",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.purchase_orders.insert_one(po_doc)
        del po_doc["_id"]
        purchase_orders.append(po_doc)
    
    return {
        "event_id": event_id,
        "purchase_orders": purchase_orders,
        "unassigned_items": by_supplier.get("no_supplier", [])
    }

# ============== PURCHASE ORDERS ==============

@events_router.get("/purchase-orders")
async def get_purchase_orders(status: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    
    pos = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return pos

@events_router.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update PO status: draft, ordered, partially_received, received"""
    new_status = data.get("status")
    if new_status not in ["draft", "ordered", "partially_received", "received"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    now = datetime.now(timezone.utc)
    result = await db.purchase_orders.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": {"status": new_status, "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return {"message": "Status updated"}

@events_router.post("/purchase-orders/{po_id}/receive")
async def receive_purchase_order(po_id: str, data: dict, user: User = Depends(get_current_user)):
    """Receive items from purchase order into inventory"""
    po = await db.purchase_orders.find_one({"po_id": po_id, "company_id": user.company_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    now = datetime.now(timezone.utc)
    received_items = data.get("items", [])  # [{ingredient_id, quantity_received}]
    
    for item in received_items:
        ing_id = item.get("ingredient_id")
        qty = item.get("quantity_received", 0)
        
        # Update inventory
        await db.ingredients.update_one(
            {"ingredient_id": ing_id, "company_id": user.company_id},
            {"$inc": {"stock_quantity": qty}, "$set": {"updated_at": now.isoformat()}}
        )
    
    # Update PO status
    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {"status": "received", "received_at": now.isoformat(), "updated_at": now.isoformat()}}
    )
    
    return {"message": "Items received into inventory"}

