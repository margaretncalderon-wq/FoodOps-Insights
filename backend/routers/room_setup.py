# routers/room_setup.py - Room Setup API for Event Orchestration
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import base64

from config import db
from dependencies import get_current_user, User
from models.room_setup import (
    RoomSetupConfig, RoomSetupCreate, RoomSetupUpdate,
    EventRoomSetups, RoomNeedItem, TimelineActivity, LayoutType,
    RoomSetupTemplate, RoomSetupTemplateCreate, TemplateCategory, LayoutDiagramUpload
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


# ============== TEMPLATES CRUD ==============

@room_setup_router.get("/templates")
async def get_templates(
    category: Optional[str] = None,
    user: User = Depends(get_current_user)
) -> List[dict]:
    """Get all templates for the company"""
    query = {"$or": [
        {"company_id": user.company_id},
        {"is_system_template": True}
    ]}
    
    if category:
        query["category"] = category
    
    templates = await db.room_setup_templates.find(query, {"_id": 0}).sort("name", 1).to_list(100)
    return templates


@room_setup_router.post("/templates")
async def create_template(
    template: RoomSetupTemplateCreate,
    user: User = Depends(get_current_user)
):
    """Create a new room setup template"""
    now = datetime.now(timezone.utc)
    template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    
    # Generate IDs for needs and timeline items
    needs_with_ids = []
    for need in template.default_needs:
        need_dict = need.dict() if hasattr(need, 'dict') else dict(need)
        need_dict["item_id"] = f"need_{uuid.uuid4().hex[:8]}"
        needs_with_ids.append(need_dict)
    
    timeline_with_ids = []
    for activity in template.default_timeline:
        act_dict = activity.dict() if hasattr(activity, 'dict') else dict(activity)
        act_dict["activity_id"] = f"act_{uuid.uuid4().hex[:8]}"
        timeline_with_ids.append(act_dict)
    
    template_doc = {
        "template_id": template_id,
        "company_id": user.company_id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "layout_type": template.layout_type,
        "custom_layout_name": template.custom_layout_name,
        "layout_notes": template.layout_notes,
        "layout_diagram_url": None,
        "default_needs": needs_with_ids,
        "default_timeline": timeline_with_ids,
        "min_capacity": template.min_capacity,
        "max_capacity": template.max_capacity,
        "thumbnail_url": None,
        "is_system_template": False,
        "usage_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    
    await db.room_setup_templates.insert_one(template_doc)
    del template_doc["_id"]
    
    return template_doc


@room_setup_router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific template"""
    template = await db.room_setup_templates.find_one(
        {"template_id": template_id, "$or": [
            {"company_id": user.company_id},
            {"is_system_template": True}
        ]},
        {"_id": 0}
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return template


@room_setup_router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    update_data: dict,
    user: User = Depends(get_current_user)
):
    """Update a template"""
    template = await db.room_setup_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not editable")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.room_setup_templates.update_one(
        {"template_id": template_id},
        {"$set": update_data}
    )
    
    updated = await db.room_setup_templates.find_one(
        {"template_id": template_id}, {"_id": 0}
    )
    return updated


@room_setup_router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a template"""
    result = await db.room_setup_templates.delete_one(
        {"template_id": template_id, "company_id": user.company_id, "is_system_template": False}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or cannot be deleted")
    
    return {"message": "Template deleted"}


@room_setup_router.post("/templates/{template_id}/duplicate")
async def duplicate_template(
    template_id: str,
    new_name: str,
    new_description: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Duplicate an existing template with a new name"""
    # Get source template (can be system or company template)
    source = await db.room_setup_templates.find_one(
        {"$or": [
            {"template_id": template_id, "company_id": user.company_id},
            {"template_id": template_id, "is_system_template": True}
        ]},
        {"_id": 0}
    )
    
    if not source:
        raise HTTPException(status_code=404, detail="Template not found")
    
    now = datetime.now(timezone.utc)
    new_template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    
    # Create duplicate with new name
    new_template = {
        "template_id": new_template_id,
        "company_id": user.company_id,
        "name": new_name,
        "description": new_description or source.get("description", ""),
        "category": source.get("category", "custom"),
        "layout_type": source.get("layout_type", "banquet"),
        "custom_layout_name": source.get("custom_layout_name"),
        "layout_notes": source.get("layout_notes"),
        "layout_diagram_url": source.get("layout_diagram_url"),
        "default_needs": source.get("default_needs", []),
        "default_timeline": source.get("default_timeline", []),
        "min_capacity": source.get("min_capacity", 0),
        "max_capacity": source.get("max_capacity", 0),
        "thumbnail_url": source.get("thumbnail_url"),
        "is_system_template": False,  # Duplicated templates are always user templates
        "usage_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    
    await db.room_setup_templates.insert_one(new_template)
    del new_template["_id"]
    
    return new_template


@room_setup_router.post("/templates/{template_id}/apply/{event_id}")
async def apply_template_to_event(
    template_id: str,
    event_id: str,
    room_id: str,
    venue_id: str,
    user: User = Depends(get_current_user)
):
    """Apply a template to create room setup for an event"""
    # Get template
    template = await db.room_setup_templates.find_one(
        {"template_id": template_id, "$or": [
            {"company_id": user.company_id},
            {"is_system_template": True}
        ]},
        {"_id": 0}
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Verify event exists
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get room info
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    venue = await db.venues.find_one({"venue_id": venue_id}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    config_id = f"rsetup_{uuid.uuid4().hex[:12]}"
    
    # Generate new IDs for needs
    new_needs = []
    for need in template.get("default_needs", []):
        new_need = {**need}
        new_need["item_id"] = f"need_{uuid.uuid4().hex[:8]}"
        new_needs.append(new_need)
    
    # Generate new IDs for timeline
    new_timeline = []
    for activity in template.get("default_timeline", []):
        new_activity = {**activity}
        new_activity["activity_id"] = f"act_{uuid.uuid4().hex[:8]}"
        new_timeline.append(new_activity)
    
    # Create room setup from template
    room_setup = {
        "config_id": config_id,
        "event_id": event_id,
        "company_id": user.company_id,
        "room_id": room_id,
        "room_name": room.get("name") if room else None,
        "venue_id": venue_id,
        "venue_name": venue.get("name") if venue else None,
        "layout_type": template.get("layout_type", "banquet"),
        "custom_layout_name": template.get("custom_layout_name"),
        "layout_diagram_url": template.get("layout_diagram_url"),
        "layout_notes": template.get("layout_notes"),
        "room_capacity": room.get("capacity", 0) if room else 0,
        "planned_guests": event.get("guest_count", 0),
        "needs": new_needs,
        "timeline": new_timeline,
        "special_instructions": "",
        "vendor_access_notes": "",
        "order": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "from_template_id": template_id,
    }
    
    await db.room_setups.insert_one(room_setup)
    
    # Increment template usage count
    await db.room_setup_templates.update_one(
        {"template_id": template_id},
        {"$inc": {"usage_count": 1}}
    )
    
    del room_setup["_id"]
    return room_setup


@room_setup_router.post("/templates/create-from-room/{event_id}/{room_id}")
async def create_template_from_room(
    event_id: str,
    room_id: str,
    template_name: str,
    template_description: Optional[str] = None,
    category: str = "custom",
    user: User = Depends(get_current_user)
):
    """Create a template from an existing room setup"""
    room_setup = await db.room_setups.find_one(
        {"event_id": event_id, "room_id": room_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not room_setup:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    now = datetime.now(timezone.utc)
    template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    
    template_doc = {
        "template_id": template_id,
        "company_id": user.company_id,
        "name": template_name,
        "description": template_description,
        "category": category,
        "layout_type": room_setup.get("layout_type", "banquet"),
        "custom_layout_name": room_setup.get("custom_layout_name"),
        "layout_notes": room_setup.get("layout_notes"),
        "layout_diagram_url": room_setup.get("layout_diagram_url"),
        "default_needs": room_setup.get("needs", []),
        "default_timeline": room_setup.get("timeline", []),
        "min_capacity": 0,
        "max_capacity": room_setup.get("room_capacity", 0),
        "thumbnail_url": None,
        "is_system_template": False,
        "usage_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    
    await db.room_setup_templates.insert_one(template_doc)
    del template_doc["_id"]
    
    return template_doc


# ============== VISUAL LAYOUT ==============

@room_setup_router.post("/events/{event_id}/rooms/{room_id}/layout-diagram")
async def upload_layout_diagram(
    event_id: str,
    room_id: str,
    diagram_data: LayoutDiagramUpload,
    user: User = Depends(get_current_user)
):
    """Upload/update visual layout diagram for a room setup"""
    result = await db.room_setups.update_one(
        {"event_id": event_id, "room_id": room_id, "company_id": user.company_id},
        {"$set": {
            "layout_diagram_url": diagram_data.diagram_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    return {"message": "Layout diagram updated", "diagram_url": diagram_data.diagram_url}


@room_setup_router.delete("/events/{event_id}/rooms/{room_id}/layout-diagram")
async def delete_layout_diagram(
    event_id: str,
    room_id: str,
    user: User = Depends(get_current_user)
):
    """Remove visual layout diagram from a room setup"""
    result = await db.room_setups.update_one(
        {"event_id": event_id, "room_id": room_id, "company_id": user.company_id},
        {"$set": {
            "layout_diagram_url": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room setup not found")
    
    return {"message": "Layout diagram removed"}


@room_setup_router.post("/templates/{template_id}/layout-diagram")
async def upload_template_layout_diagram(
    template_id: str,
    diagram_data: LayoutDiagramUpload,
    user: User = Depends(get_current_user)
):
    """Upload/update visual layout diagram for a template"""
    result = await db.room_setup_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": {
            "layout_diagram_url": diagram_data.diagram_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template layout diagram updated", "diagram_url": diagram_data.diagram_url}


# ============== SYSTEM TEMPLATES (Seed Data) ==============

@room_setup_router.post("/templates/seed-system")
async def seed_system_templates(
    user: User = Depends(get_current_user)
):
    """Seed default system templates (admin only)"""
    # Check if already seeded
    existing = await db.room_setup_templates.count_documents({"is_system_template": True})
    if existing > 0:
        return {"message": f"System templates already exist ({existing} templates)"}
    
    now = datetime.now(timezone.utc).isoformat()
    
    system_templates = [
        {
            "template_id": "tpl_sys_wedding",
            "company_id": "system",
            "name": "Boda Clásica",
            "name_en": "Classic Wedding",
            "description": "Configuración típica para ceremonia y recepción de boda",
            "category": "wedding",
            "layout_type": "banquet",
            "layout_notes": "Mesas redondas de 10 personas, mesa principal para novios",
            "default_needs": [
                {"item_id": "sys_n1", "category": "furniture", "name": "Mesas redondas (10 pax)", "quantity": 15},
                {"item_id": "sys_n2", "category": "furniture", "name": "Sillas Chiavari", "quantity": 150},
                {"item_id": "sys_n3", "category": "av_equipment", "name": "Sistema de sonido", "quantity": 1},
                {"item_id": "sys_n4", "category": "av_equipment", "name": "Micrófono inalámbrico", "quantity": 2},
                {"item_id": "sys_n5", "category": "decor", "name": "Centros de mesa florales", "quantity": 15},
            ],
            "default_timeline": [
                {"activity_id": "sys_t1", "title": "Montaje", "start_time": "10:00", "end_time": "16:00", "activity_type": "setup"},
                {"activity_id": "sys_t2", "title": "Ceremonia", "start_time": "17:00", "end_time": "17:45", "activity_type": "ceremony"},
                {"activity_id": "sys_t3", "title": "Cóctel", "start_time": "17:45", "end_time": "19:00", "activity_type": "cocktail"},
                {"activity_id": "sys_t4", "title": "Recepción/Cena", "start_time": "19:00", "end_time": "21:00", "activity_type": "dinner"},
                {"activity_id": "sys_t5", "title": "Fiesta/Baile", "start_time": "21:00", "end_time": "01:00", "activity_type": "entertainment"},
                {"activity_id": "sys_t6", "title": "Desmontaje", "start_time": "01:00", "end_time": "03:00", "activity_type": "breakdown"},
            ],
            "min_capacity": 80,
            "max_capacity": 200,
            "is_system_template": True,
            "usage_count": 0,
            "created_at": now,
            "updated_at": now,
        },
        {
            "template_id": "tpl_sys_corporate",
            "company_id": "system",
            "name": "Conferencia Corporativa",
            "name_en": "Corporate Conference",
            "description": "Configuración para conferencias y presentaciones empresariales",
            "category": "corporate",
            "layout_type": "theater",
            "layout_notes": "Filas de sillas con pasillo central, escenario al frente",
            "default_needs": [
                {"item_id": "sys_cn1", "category": "furniture", "name": "Sillas teatro", "quantity": 100},
                {"item_id": "sys_cn2", "category": "av_equipment", "name": "Proyector HD", "quantity": 1},
                {"item_id": "sys_cn3", "category": "av_equipment", "name": "Pantalla 3x2m", "quantity": 1},
                {"item_id": "sys_cn4", "category": "av_equipment", "name": "Podio/Atril", "quantity": 1},
                {"item_id": "sys_cn5", "category": "av_equipment", "name": "Micrófono de solapa", "quantity": 3},
                {"item_id": "sys_cn6", "category": "technical", "name": "Laptop presentaciones", "quantity": 1},
            ],
            "default_timeline": [
                {"activity_id": "sys_ct1", "title": "Montaje técnico", "start_time": "07:00", "end_time": "08:30", "activity_type": "setup"},
                {"activity_id": "sys_ct2", "title": "Registro asistentes", "start_time": "08:30", "end_time": "09:00", "activity_type": "general"},
                {"activity_id": "sys_ct3", "title": "Conferencia principal", "start_time": "09:00", "end_time": "12:00", "activity_type": "general"},
                {"activity_id": "sys_ct4", "title": "Coffee break", "start_time": "10:30", "end_time": "11:00", "activity_type": "cocktail"},
                {"activity_id": "sys_ct5", "title": "Almuerzo networking", "start_time": "12:00", "end_time": "13:30", "activity_type": "dinner"},
                {"activity_id": "sys_ct6", "title": "Desmontaje", "start_time": "13:30", "end_time": "14:30", "activity_type": "breakdown"},
            ],
            "min_capacity": 50,
            "max_capacity": 200,
            "is_system_template": True,
            "usage_count": 0,
            "created_at": now,
            "updated_at": now,
        },
        {
            "template_id": "tpl_sys_gala",
            "company_id": "system",
            "name": "Gala de Premiación",
            "name_en": "Awards Gala",
            "description": "Configuración elegante para galas y eventos de premiación",
            "category": "gala",
            "layout_type": "banquet",
            "layout_notes": "Mesas redondas con escenario, pista de baile opcional",
            "default_needs": [
                {"item_id": "sys_gn1", "category": "furniture", "name": "Mesas redondas (8 pax)", "quantity": 20},
                {"item_id": "sys_gn2", "category": "furniture", "name": "Sillas doradas", "quantity": 160},
                {"item_id": "sys_gn3", "category": "av_equipment", "name": "Pantalla LED", "quantity": 1},
                {"item_id": "sys_gn4", "category": "av_equipment", "name": "Iluminación escénica", "quantity": 1},
                {"item_id": "sys_gn5", "category": "decor", "name": "Alfombra roja", "quantity": 1},
                {"item_id": "sys_gn6", "category": "decor", "name": "Centros de mesa premium", "quantity": 20},
            ],
            "default_timeline": [
                {"activity_id": "sys_gt1", "title": "Montaje completo", "start_time": "12:00", "end_time": "18:00", "activity_type": "setup"},
                {"activity_id": "sys_gt2", "title": "Llegada invitados", "start_time": "19:00", "end_time": "19:30", "activity_type": "general"},
                {"activity_id": "sys_gt3", "title": "Cóctel de bienvenida", "start_time": "19:30", "end_time": "20:30", "activity_type": "cocktail"},
                {"activity_id": "sys_gt4", "title": "Cena de gala", "start_time": "20:30", "end_time": "22:00", "activity_type": "dinner"},
                {"activity_id": "sys_gt5", "title": "Ceremonia de premiación", "start_time": "22:00", "end_time": "23:00", "activity_type": "ceremony"},
                {"activity_id": "sys_gt6", "title": "After party", "start_time": "23:00", "end_time": "02:00", "activity_type": "entertainment"},
            ],
            "min_capacity": 100,
            "max_capacity": 300,
            "is_system_template": True,
            "usage_count": 0,
            "created_at": now,
            "updated_at": now,
        },
    ]
    
    await db.room_setup_templates.insert_many(system_templates)
    
    return {"message": f"Created {len(system_templates)} system templates"}

