# routers/room_setup.py - Room Setup API for Event Orchestration
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from config import db
from dependencies import get_current_user, User
from models.room_setup import (
    RoomSetupConfig, RoomSetupCreate, RoomSetupUpdate,
    EventRoomSetups, RoomNeedItem, TimelineActivity, LayoutType
)

room_setup_router = APIRouter(prefix="/orchestration/room-setup", tags=["Room Setup"])


# ============== ROOM SETUP CRUD ==============

@room_setup_router.get("/events/{event_id}")
async def get_event_room_setups(
    event_id: str,
    user: User = Depends(get_current_user)
) -> EventRoomSetups:
    """Get all room setups for an event"""
    # Get event info
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "event_date": 1, "locations": 1}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get room setups
    setups = await db.room_setups.find(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("order", 1).to_list(50)
    
    # Build master timeline from all rooms
    master_timeline = []
    for setup in setups:
        for activity in setup.get("timeline", []):
            master_timeline.append({
                **activity,
                "room_id": setup.get("room_id"),
                "room_name": setup.get("room_name"),
            })
    
    # Sort master timeline by start_time
    master_timeline.sort(key=lambda x: x.get("start_time", "00:00"))
    
    return EventRoomSetups(
        event_id=event_id,
        event_name=event.get("name"),
        event_date=event.get("event_date"),
        rooms=setups,
        master_timeline=master_timeline
    )


@room_setup_router.post("/events/{event_id}/rooms")
async def create_room_setup(
    event_id: str,
    data: RoomSetupCreate,
    user: User = Depends(get_current_user)
):
    """Create a room setup configuration for an event"""
    # Verify event exists
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get room and venue info
    room = await db.venue_rooms.find_one(
        {"room_id": data.room_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "capacity": 1, "venue_id": 1}
    )
    venue = await db.venues.find_one(
        {"venue_id": data.venue_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    
    # Check if setup already exists for this room
    existing = await db.room_setups.find_one({
        "event_id": event_id,
        "room_id": data.room_id,
        "company_id": user.company_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Room setup already exists for this event. Use PUT to update.")
    
    now = datetime.now(timezone.utc)
    config_id = f"rsetup_{uuid.uuid4().hex[:12]}"
    
    # Add IDs to needs items
    needs_with_ids = []
    for need in data.needs:
        need_dict = need.dict()
        if not need_dict.get("item_id"):
            need_dict["item_id"] = f"need_{uuid.uuid4().hex[:8]}"
        needs_with_ids.append(need_dict)
    
    # Add IDs to timeline items
    timeline_with_ids = []
    for activity in data.timeline:
        activity_dict = activity.dict()
        if not activity_dict.get("activity_id"):
            activity_dict["activity_id"] = f"act_{uuid.uuid4().hex[:8]}"
        timeline_with_ids.append(activity_dict)
    
    setup_doc = {
        "config_id": config_id,
        "event_id": event_id,
        "company_id": user.company_id,
        "room_id": data.room_id,
        "room_name": room.get("name") if room else None,
        "venue_id": data.venue_id,
        "venue_name": venue.get("name") if venue else None,
        "layout_type": data.layout_type.value,
        "custom_layout_name": data.custom_layout_name,
        "layout_notes": data.layout_notes,
        "room_capacity": room.get("capacity", 0) if room else 0,
        "planned_guests": data.planned_guests,
        "needs": needs_with_ids,
        "timeline": timeline_with_ids,
        "setup_start_time": data.setup_start_time,
        "event_start_time": data.event_start_time,
        "event_end_time": data.event_end_time,
        "breakdown_end_time": data.breakdown_end_time,
        "special_instructions": data.special_instructions,
        "vendor_access_notes": data.vendor_access_notes,
        "order": data.order,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    
    await db.room_setups.insert_one(setup_doc)
    del setup_doc["_id"]
    
    return setup_doc


@room_setup_router.put("/events/{event_id}/rooms/{room_id}")
async def update_room_setup(
    event_id: str,
    room_id: str,
    data: RoomSetupUpdate,
    user: User = Depends(get_current_user)
):
    """Update a room setup configuration"""
    existing = await db.room_setups.find_one({
        "event_id": event_id,
        "room_id": room_id,
        "company_id": user.company_id
    })
    if not existing:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    now = datetime.now(timezone.utc)
    update_data = {"updated_at": now.isoformat()}
    
    if data.layout_type is not None:
        update_data["layout_type"] = data.layout_type.value
    if data.custom_layout_name is not None:
        update_data["custom_layout_name"] = data.custom_layout_name
    if data.layout_diagram_url is not None:
        update_data["layout_diagram_url"] = data.layout_diagram_url
    if data.layout_notes is not None:
        update_data["layout_notes"] = data.layout_notes
    if data.planned_guests is not None:
        update_data["planned_guests"] = data.planned_guests
    if data.setup_start_time is not None:
        update_data["setup_start_time"] = data.setup_start_time
    if data.event_start_time is not None:
        update_data["event_start_time"] = data.event_start_time
    if data.event_end_time is not None:
        update_data["event_end_time"] = data.event_end_time
    if data.breakdown_end_time is not None:
        update_data["breakdown_end_time"] = data.breakdown_end_time
    if data.special_instructions is not None:
        update_data["special_instructions"] = data.special_instructions
    if data.vendor_access_notes is not None:
        update_data["vendor_access_notes"] = data.vendor_access_notes
    if data.order is not None:
        update_data["order"] = data.order
    
    # Handle needs list
    if data.needs is not None:
        needs_with_ids = []
        for need in data.needs:
            need_dict = need.dict()
            if not need_dict.get("item_id"):
                need_dict["item_id"] = f"need_{uuid.uuid4().hex[:8]}"
            needs_with_ids.append(need_dict)
        update_data["needs"] = needs_with_ids
    
    # Handle timeline list
    if data.timeline is not None:
        timeline_with_ids = []
        for activity in data.timeline:
            activity_dict = activity.dict()
            if not activity_dict.get("activity_id"):
                activity_dict["activity_id"] = f"act_{uuid.uuid4().hex[:8]}"
            timeline_with_ids.append(activity_dict)
        update_data["timeline"] = timeline_with_ids
    
    await db.room_setups.update_one(
        {"config_id": existing["config_id"]},
        {"$set": update_data}
    )
    
    updated = await db.room_setups.find_one(
        {"config_id": existing["config_id"]},
        {"_id": 0}
    )
    
    return updated


@room_setup_router.delete("/events/{event_id}/rooms/{room_id}")
async def delete_room_setup(
    event_id: str,
    room_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a room setup configuration"""
    result = await db.room_setups.delete_one({
        "event_id": event_id,
        "room_id": room_id,
        "company_id": user.company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    return {"message": "Room setup deleted"}


# ============== ROOM NEEDS MANAGEMENT ==============

@room_setup_router.post("/events/{event_id}/rooms/{room_id}/needs")
async def add_room_need(
    event_id: str,
    room_id: str,
    need: RoomNeedItem,
    user: User = Depends(get_current_user)
):
    """Add a need/requirement to a room setup"""
    setup = await db.room_setups.find_one({
        "event_id": event_id,
        "room_id": room_id,
        "company_id": user.company_id
    })
    if not setup:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    need_dict = need.dict()
    need_dict["item_id"] = f"need_{uuid.uuid4().hex[:8]}"
    
    await db.room_setups.update_one(
        {"config_id": setup["config_id"]},
        {
            "$push": {"needs": need_dict},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return need_dict


@room_setup_router.delete("/events/{event_id}/rooms/{room_id}/needs/{item_id}")
async def remove_room_need(
    event_id: str,
    room_id: str,
    item_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a need from a room setup"""
    result = await db.room_setups.update_one(
        {
            "event_id": event_id,
            "room_id": room_id,
            "company_id": user.company_id
        },
        {
            "$pull": {"needs": {"item_id": item_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Need not found")
    
    return {"message": "Need removed"}


# ============== TIMELINE MANAGEMENT ==============

@room_setup_router.post("/events/{event_id}/rooms/{room_id}/timeline")
async def add_timeline_activity(
    event_id: str,
    room_id: str,
    activity: TimelineActivity,
    user: User = Depends(get_current_user)
):
    """Add an activity to a room's timeline"""
    setup = await db.room_setups.find_one({
        "event_id": event_id,
        "room_id": room_id,
        "company_id": user.company_id
    })
    if not setup:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    activity_dict = activity.dict()
    activity_dict["activity_id"] = f"act_{uuid.uuid4().hex[:8]}"
    
    await db.room_setups.update_one(
        {"config_id": setup["config_id"]},
        {
            "$push": {"timeline": activity_dict},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return activity_dict


@room_setup_router.put("/events/{event_id}/rooms/{room_id}/timeline/{activity_id}")
async def update_timeline_activity(
    event_id: str,
    room_id: str,
    activity_id: str,
    activity: TimelineActivity,
    user: User = Depends(get_current_user)
):
    """Update a timeline activity"""
    activity_dict = activity.dict()
    activity_dict["activity_id"] = activity_id
    
    result = await db.room_setups.update_one(
        {
            "event_id": event_id,
            "room_id": room_id,
            "company_id": user.company_id,
            "timeline.activity_id": activity_id
        },
        {
            "$set": {
                "timeline.$": activity_dict,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    return activity_dict


@room_setup_router.delete("/events/{event_id}/rooms/{room_id}/timeline/{activity_id}")
async def delete_timeline_activity(
    event_id: str,
    room_id: str,
    activity_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a timeline activity"""
    result = await db.room_setups.update_one(
        {
            "event_id": event_id,
            "room_id": room_id,
            "company_id": user.company_id
        },
        {
            "$pull": {"timeline": {"activity_id": activity_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    return {"message": "Activity deleted"}


# ============== MASTER TIMELINE VIEW ==============

@room_setup_router.get("/events/{event_id}/master-timeline")
async def get_master_timeline(
    event_id: str,
    user: User = Depends(get_current_user)
):
    """Get consolidated timeline across all rooms for an event"""
    # Get event info
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "event_date": 1, "start_time": 1, "end_time": 1}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get all room setups
    setups = await db.room_setups.find(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(50)
    
    # Build consolidated timeline
    timeline_items = []
    rooms_info = []
    
    for setup in setups:
        room_info = {
            "room_id": setup.get("room_id"),
            "room_name": setup.get("room_name"),
            "venue_name": setup.get("venue_name"),
            "layout_type": setup.get("layout_type"),
            "planned_guests": setup.get("planned_guests"),
            "setup_start_time": setup.get("setup_start_time"),
            "event_start_time": setup.get("event_start_time"),
            "event_end_time": setup.get("event_end_time"),
            "breakdown_end_time": setup.get("breakdown_end_time"),
        }
        rooms_info.append(room_info)
        
        for activity in setup.get("timeline", []):
            timeline_items.append({
                **activity,
                "room_id": setup.get("room_id"),
                "room_name": setup.get("room_name"),
            })
    
    # Sort by start time
    timeline_items.sort(key=lambda x: x.get("start_time", "00:00"))
    
    # Group by time slots for timeline visualization
    time_slots = {}
    for item in timeline_items:
        start = item.get("start_time", "00:00")
        hour = start[:2] + ":00"  # Round to hour
        if hour not in time_slots:
            time_slots[hour] = []
        time_slots[hour].append(item)
    
    return {
        "event_id": event_id,
        "event_name": event.get("name"),
        "event_date": event.get("event_date"),
        "rooms": rooms_info,
        "timeline_items": timeline_items,
        "time_slots": dict(sorted(time_slots.items())),
    }


# ============== LAYOUT TEMPLATES ==============

@room_setup_router.get("/layout-templates")
async def get_layout_templates():
    """Get available layout types with descriptions"""
    return [
        {
            "type": "theater",
            "name_en": "Theater",
            "name_es": "Teatro",
            "description_en": "Rows of chairs facing a stage or presentation area",
            "description_es": "Filas de sillas frente a un escenario o área de presentación",
            "typical_capacity_multiplier": 1.0,
            "icon": "theater"
        },
        {
            "type": "banquet",
            "name_en": "Banquet",
            "name_es": "Banquete",
            "description_en": "Round tables with chairs, ideal for dining events",
            "description_es": "Mesas redondas con sillas, ideal para eventos de cena",
            "typical_capacity_multiplier": 0.6,
            "icon": "utensils"
        },
        {
            "type": "cocktail",
            "name_en": "Cocktail",
            "name_es": "Cóctel",
            "description_en": "Standing room with high-top tables scattered throughout",
            "description_es": "Espacio para estar de pie con mesas altas distribuidas",
            "typical_capacity_multiplier": 1.2,
            "icon": "wine"
        },
        {
            "type": "classroom",
            "name_en": "Classroom",
            "name_es": "Aula",
            "description_en": "Tables with chairs in rows, facing forward",
            "description_es": "Mesas con sillas en filas, mirando hacia adelante",
            "typical_capacity_multiplier": 0.5,
            "icon": "graduation-cap"
        },
        {
            "type": "u_shape",
            "name_en": "U-Shape",
            "name_es": "Forma de U",
            "description_en": "Tables arranged in a U formation",
            "description_es": "Mesas dispuestas en forma de U",
            "typical_capacity_multiplier": 0.4,
            "icon": "layout"
        },
        {
            "type": "conference",
            "name_en": "Conference",
            "name_es": "Conferencia",
            "description_en": "Large central table with chairs around",
            "description_es": "Mesa central grande con sillas alrededor",
            "typical_capacity_multiplier": 0.3,
            "icon": "users"
        },
        {
            "type": "hollow_square",
            "name_en": "Hollow Square",
            "name_es": "Cuadrado Hueco",
            "description_en": "Tables arranged in a square with open center",
            "description_es": "Mesas dispuestas en cuadrado con centro abierto",
            "typical_capacity_multiplier": 0.35,
            "icon": "square"
        },
        {
            "type": "custom",
            "name_en": "Custom",
            "name_es": "Personalizado",
            "description_en": "Custom layout defined by the user",
            "description_es": "Disposición personalizada definida por el usuario",
            "typical_capacity_multiplier": 1.0,
            "icon": "edit"
        },
    ]



# ============== COPY ROOM SETUP ==============

@room_setup_router.get("/events-with-setups")
async def get_events_with_room_setups(
    user: User = Depends(get_current_user)
):
    """Get list of events that have room setups configured (for copy feature)"""
    # Find events that have room setups
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$lookup": {
            "from": "events",
            "localField": "event_id",
            "foreignField": "event_id",
            "as": "event_info"
        }},
        {"$unwind": "$event_info"},
        {"$group": {
            "_id": "$event_id",
            "event_name": {"$first": "$event_info.name"},
            "event_date": {"$first": "$event_info.event_date"},
            "room_count": {"$sum": 1},
            "total_needs": {"$sum": {"$size": {"$ifNull": ["$needs", []]}}},
            "total_activities": {"$sum": {"$size": {"$ifNull": ["$timeline", []]}}}
        }},
        {"$sort": {"event_date": -1}},
        {"$limit": 20}
    ]
    
    results = await db.room_setups.aggregate(pipeline).to_list(20)
    
    return [
        {
            "event_id": r["_id"],
            "event_name": r["event_name"],
            "event_date": r["event_date"],
            "room_count": r["room_count"],
            "total_needs": r["total_needs"],
            "total_activities": r["total_activities"]
        }
        for r in results
    ]


@room_setup_router.post("/events/{target_event_id}/copy-from/{source_event_id}")
async def copy_room_setup(
    target_event_id: str,
    source_event_id: str,
    copy_needs: bool = True,
    copy_timeline: bool = True,
    user: User = Depends(get_current_user)
):
    """Copy room setup configuration from one event to another"""
    # Verify both events exist and belong to user's company
    target_event = await db.events.find_one(
        {"event_id": target_event_id, "company_id": user.company_id}
    )
    if not target_event:
        raise HTTPException(status_code=404, detail="Target event not found")
    
    source_event = await db.events.find_one(
        {"event_id": source_event_id, "company_id": user.company_id}
    )
    if not source_event:
        raise HTTPException(status_code=404, detail="Source event not found")
    
    # Get source room setups
    source_setups = await db.room_setups.find(
        {"event_id": source_event_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(50)
    
    if not source_setups:
        raise HTTPException(status_code=400, detail="Source event has no room setups to copy")
    
    # Delete existing setups in target event (if any)
    await db.room_setups.delete_many({
        "event_id": target_event_id,
        "company_id": user.company_id
    })
    
    now = datetime.now(timezone.utc)
    copied_count = 0
    
    for setup in source_setups:
        # Generate new IDs
        new_config_id = f"rsetup_{uuid.uuid4().hex[:12]}"
        
        # Copy needs with new IDs
        new_needs = []
        if copy_needs and setup.get("needs"):
            for need in setup["needs"]:
                new_need = {**need}
                new_need["item_id"] = f"need_{uuid.uuid4().hex[:8]}"
                new_needs.append(new_need)
        
        # Copy timeline with new IDs
        new_timeline = []
        if copy_timeline and setup.get("timeline"):
            for activity in setup["timeline"]:
                new_activity = {**activity}
                new_activity["activity_id"] = f"act_{uuid.uuid4().hex[:8]}"
                new_timeline.append(new_activity)
        
        # Create new setup document
        new_setup = {
            "config_id": new_config_id,
            "event_id": target_event_id,
            "company_id": user.company_id,
            "room_id": setup.get("room_id"),
            "room_name": setup.get("room_name"),
            "venue_id": setup.get("venue_id"),
            "venue_name": setup.get("venue_name"),
            "layout_type": setup.get("layout_type", "banquet"),
            "custom_layout_name": setup.get("custom_layout_name"),
            "layout_notes": setup.get("layout_notes"),
            "room_capacity": setup.get("room_capacity", 0),
            "planned_guests": setup.get("planned_guests", 0),
            "needs": new_needs,
            "timeline": new_timeline,
            "setup_start_time": setup.get("setup_start_time"),
            "event_start_time": setup.get("event_start_time"),
            "event_end_time": setup.get("event_end_time"),
            "breakdown_end_time": setup.get("breakdown_end_time"),
            "special_instructions": setup.get("special_instructions"),
            "vendor_access_notes": setup.get("vendor_access_notes"),
            "order": setup.get("order", 0),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "copied_from_event": source_event_id,
        }
        
        await db.room_setups.insert_one(new_setup)
        copied_count += 1
    
    return {
        "message": f"Successfully copied {copied_count} room setup(s)",
        "copied_rooms": copied_count,
        "source_event": source_event.get("name"),
        "target_event": target_event.get("name"),
        "copied_needs": copy_needs,
        "copied_timeline": copy_timeline
    }
