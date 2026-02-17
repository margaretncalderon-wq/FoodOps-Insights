# routers/events.py - Events Router
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from config import db
from models.events import Event, EventCreate, EventUpdate
from dependencies import get_current_user, User
from utils.activity_logger import log_activity, user_info

# Stage mapping constants (imported from server.py context)
ENGAGEMENT_STAGES = ["Inquiry Received", "Context Captured", "Scope Drafted", "Definition In Review", "Committed", "Archived"]
LEGACY_STAGE_MAP = {
    "Lead": "Inquiry Received",
    "Contacted": "Context Captured",
    "Proposal": "Scope Drafted",
    "Negotiation": "Definition In Review",
    "Won": "Committed",
    "Approved": "Committed",
    "Closed": "Archived",
    "Lost": "Archived"
}

def normalize_stage(stage: str) -> str:
    """Normalize legacy stages to new Engagement Stages"""
    if not stage:
        return "Inquiry Received"
    if stage in LEGACY_STAGE_MAP:
        return LEGACY_STAGE_MAP[stage]
    if stage in ENGAGEMENT_STAGES:
        return stage
    return "Inquiry Received"

events_router = APIRouter(prefix="/events", tags=["Events"])


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
    return events


@events_router.get("/pipeline")
async def get_events_pipeline(user: User = Depends(get_current_user)):
    """Get events grouped by engagement stage"""
    new_stages = ["Inquiry Received", "Context Captured", "Scope Drafted", "Definition In Review", "Committed", "Archived"]
    
    pipeline = {stage: [] for stage in new_stages}
    
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
        
        # Normalize stage and add to correct pipeline bucket
        original_stage = e.get("stage", "Inquiry Received")
        normalized_stage = normalize_stage(original_stage)
        e["stage"] = normalized_stage
        e["original_stage"] = original_stage
        
        if normalized_stage in pipeline:
            pipeline[normalized_stage].append(e)
    
    return pipeline


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
    """Create a new event"""
    now = datetime.now(timezone.utc)
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    event_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "event_date": data.event_date.isoformat() if data.event_date else None,
        "end_date": data.end_date.isoformat() if data.end_date else None,
        "menu_items": [],
        "tasks": [],
        "documents": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.events.insert_one(event_doc)
    del event_doc["_id"]
    
    # Update usage metric
    await db.usage_metrics.update_one(
        {"company_id": user.company_id},
        {"$inc": {"events_created": 1}, "$set": {"last_updated": now.isoformat()}},
        upsert=True
    )
    
    # Log activity
    await log_activity(
        module="events",
        action="create",
        entity_type="event",
        entity_id=event_id,
        entity_name=data.name or "New Event",
        event_id=event_id,
        **user_info(user)
    )
    
    return event_doc


@events_router.get("/{event_id}")
async def get_event(event_id: str, user: User = Depends(get_current_user)):
    """Get a single event by ID"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
        if event.get(field) and isinstance(event[field], str):
            try:
                event[field] = datetime.fromisoformat(event[field])
            except (ValueError, TypeError):
                event[field] = None
    
    if "documents" not in event:
        event["documents"] = []
    
    return event


@events_router.put("/{event_id}")
async def update_event(event_id: str, data: EventUpdate, user: User = Depends(get_current_user)):
    """Update an event"""
    # Get old event data for logging
    old_event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = now.isoformat()
    
    # Convert dates to ISO strings
    for date_field in ["event_date", "end_date", "next_followup_date"]:
        if date_field in update_data and update_data[date_field]:
            update_data[date_field] = update_data[date_field].isoformat()
    
    result = await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Log activity - check for status change
    action = "update"
    if old_event and old_event.get("stage") != data.stage:
        action = "status_change"
    
    await log_activity(
        module="events",
        action=action,
        entity_type="event",
        entity_id=event_id,
        entity_name=data.name or old_event.get("name", "Event") if old_event else "Event",
        event_id=event_id,
        old_value=old_event.get("stage") if old_event and action == "status_change" else None,
        new_value=data.stage if action == "status_change" else None,
        **user_info(user)
    )
    
    return await get_event(event_id, user)


@events_router.delete("/{event_id}")
async def delete_event(event_id: str, user: User = Depends(get_current_user)):
    """Delete an event"""
    # Get event name for logging
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    
    result = await db.events.delete_one({"event_id": event_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Log activity
    if event:
        await log_activity(
            module="events",
            action="delete",
            entity_type="event",
            entity_id=event_id,
            entity_name=event.get("name", "Event"),
            event_id=event_id,
            **user_info(user)
        )
    
    return {"message": "Event deleted"}


@events_router.post("/{event_id}/duplicate", response_model=Event)
async def duplicate_event(event_id: str, user: User = Depends(get_current_user)):
    """Duplicate an event"""
    original = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    new_id = f"event_{uuid.uuid4().hex[:12]}"
    
    duplicate = {**original}
    duplicate["event_id"] = new_id
    duplicate["name"] = f"{original.get('name', 'Event')} (Copy)"
    duplicate["stage"] = "Inquiry Received"
    duplicate["created_at"] = now.isoformat()
    duplicate["updated_at"] = now.isoformat()
    
    await db.events.insert_one(duplicate)
    del duplicate["_id"]
    
    return Event(**duplicate)


# ============== EVENT TASKS ==============

@events_router.post("/{event_id}/tasks")
async def add_task(event_id: str, task: dict, user: User = Depends(get_current_user)):
    """Add a task to an event"""
    now = datetime.now(timezone.utc)
    task["task_id"] = f"task_{uuid.uuid4().hex[:8]}"
    task["status"] = "pending"
    task["created_at"] = now.isoformat()
    
    result = await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$push": {"tasks": task}, "$set": {"updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return task


@events_router.put("/{event_id}/tasks/{task_id}")
async def update_task(event_id: str, task_id: str, task_data: dict, user: User = Depends(get_current_user)):
    """Update a task in an event"""
    await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id, "tasks.task_id": task_id},
        {"$set": {f"tasks.$.{k}": v for k, v in task_data.items()}}
    )
    return {"message": "Task updated"}


# ============== EVENT MENU ==============

@events_router.post("/{event_id}/menu")
async def update_event_menu(event_id: str, menu_data: dict, user: User = Depends(get_current_user)):
    """Update event menu items"""
    await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$set": {"menu_items": menu_data.get("items", []), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Menu updated"}
