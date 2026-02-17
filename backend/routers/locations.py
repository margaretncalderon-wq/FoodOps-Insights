# routers/locations.py - Venues and Event Locations Router
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from config import db
from dependencies import get_current_user, User
from models.locations import (
    VenueCreate, Venue, VenueUpdate, VenueRoomCreate, VenueRoom,
    EventLocationItemCreate, EventLocationItem, EventLocationsUpdate,
    SavedAddressCreate, SavedAddress, LocationType,
    RoomBookingCreate, RoomBooking, RoomAvailabilityCheck, RoomAvailabilityResponse
)
from utils.activity_logger import log_activity, user_info

locations_router = APIRouter(prefix="/locations", tags=["Locations & Venues"])


# ============== HELPER FUNCTIONS ==============

def compute_full_address(address: str, city: str = None, state: str = None, 
                         zip_code: str = None, country: str = None) -> str:
    """Compute full address string from components"""
    parts = [address]
    if city:
        parts.append(city)
    if state and zip_code:
        parts.append(f"{state} {zip_code}")
    elif state:
        parts.append(state)
    elif zip_code:
        parts.append(zip_code)
    if country and country != "USA":
        parts.append(country)
    return ", ".join(parts)


# ============== VENUES ==============

@locations_router.get("/venues")
async def get_venues(
    user: User = Depends(get_current_user),
    include_inactive: bool = False
):
    """Get all venues for the organization"""
    query = {"company_id": user.company_id}
    if not include_inactive:
        query["is_active"] = True
    
    venues = await db.venues.find(query, {"_id": 0}).sort("name", 1).to_list(100)
    
    # Get rooms for each venue
    for venue in venues:
        rooms = await db.venue_rooms.find(
            {"venue_id": venue["venue_id"], "is_active": True},
            {"_id": 0}
        ).sort("name", 1).to_list(50)
        venue["rooms"] = rooms
    
    return venues


@locations_router.post("/venues")
async def create_venue(
    data: VenueCreate,
    user: User = Depends(get_current_user)
):
    """Create a new venue"""
    now = datetime.now(timezone.utc)
    venue_id = f"venue_{uuid.uuid4().hex[:12]}"
    
    # If this is set as primary, unset other primary venues
    if data.is_primary:
        await db.venues.update_many(
            {"company_id": user.company_id, "is_primary": True},
            {"$set": {"is_primary": False}}
        )
    
    full_address = compute_full_address(
        data.address, data.city, data.state, data.zip_code, data.country
    )
    
    venue_doc = {
        "venue_id": venue_id,
        "company_id": user.company_id,
        "name": data.name,
        "address": data.address,
        "city": data.city,
        "state": data.state,
        "zip_code": data.zip_code,
        "country": data.country,
        "full_address": full_address,
        "contact_phone": data.contact_phone,
        "contact_email": data.contact_email,
        "description": data.description,
        "total_capacity": data.total_capacity,
        "parking_info": data.parking_info,
        "accessibility_info": data.accessibility_info,
        "image_url": data.image_url,
        "is_primary": data.is_primary,
        "is_active": data.is_active,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.venues.insert_one(venue_doc)
    del venue_doc["_id"]
    venue_doc["rooms"] = []
    
    # Log activity
    await log_activity(
        module="locations",
        action="create",
        entity_type="venue",
        entity_id=venue_id,
        entity_name=data.name,
        **user_info(user)
    )
    
    return venue_doc


@locations_router.get("/venues/{venue_id}")
async def get_venue(
    venue_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific venue with its rooms"""
    venue = await db.venues.find_one(
        {"venue_id": venue_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    
    # Get rooms
    rooms = await db.venue_rooms.find(
        {"venue_id": venue_id},
        {"_id": 0}
    ).sort("name", 1).to_list(50)
    venue["rooms"] = rooms
    
    return venue


@locations_router.put("/venues/{venue_id}")
async def update_venue(
    venue_id: str,
    data: VenueUpdate,
    user: User = Depends(get_current_user)
):
    """Update a venue"""
    venue = await db.venues.find_one(
        {"venue_id": venue_id, "company_id": user.company_id}
    )
    
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if update_data:
        # If setting as primary, unset others
        if update_data.get("is_primary"):
            await db.venues.update_many(
                {"company_id": user.company_id, "is_primary": True, "venue_id": {"$ne": venue_id}},
                {"$set": {"is_primary": False}}
            )
        
        # Recompute full address if address components changed
        if any(k in update_data for k in ["address", "city", "state", "zip_code", "country"]):
            full_address = compute_full_address(
                update_data.get("address", venue.get("address")),
                update_data.get("city", venue.get("city")),
                update_data.get("state", venue.get("state")),
                update_data.get("zip_code", venue.get("zip_code")),
                update_data.get("country", venue.get("country"))
            )
            update_data["full_address"] = full_address
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.venues.update_one(
            {"venue_id": venue_id},
            {"$set": update_data}
        )
    
    return await get_venue(venue_id, user)


@locations_router.delete("/venues/{venue_id}")
async def delete_venue(
    venue_id: str,
    user: User = Depends(get_current_user)
):
    """Delete (deactivate) a venue"""
    result = await db.venues.update_one(
        {"venue_id": venue_id, "company_id": user.company_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Venue not found")
    
    return {"message": "Venue deactivated"}


# ============== VENUE ROOMS ==============

@locations_router.post("/venues/{venue_id}/rooms")
async def create_venue_room(
    venue_id: str,
    data: VenueRoomCreate,
    user: User = Depends(get_current_user)
):
    """Create a room within a venue"""
    venue = await db.venues.find_one(
        {"venue_id": venue_id, "company_id": user.company_id}
    )
    
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    
    now = datetime.now(timezone.utc)
    room_id = f"room_{uuid.uuid4().hex[:12]}"
    
    room_doc = {
        "room_id": room_id,
        "venue_id": venue_id,
        "company_id": user.company_id,
        "name": data.name,
        "description": data.description,
        "capacity": data.capacity,
        "floor": data.floor,
        "amenities": data.amenities,
        "setup_options": data.setup_options,
        "hourly_rate": data.hourly_rate,
        "notes": data.notes,
        "is_active": data.is_active,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.venue_rooms.insert_one(room_doc)
    del room_doc["_id"]
    
    return room_doc


@locations_router.put("/venues/{venue_id}/rooms/{room_id}")
async def update_venue_room(
    venue_id: str,
    room_id: str,
    data: VenueRoomCreate,
    user: User = Depends(get_current_user)
):
    """Update a room"""
    room = await db.venue_rooms.find_one(
        {"room_id": room_id, "venue_id": venue_id, "company_id": user.company_id}
    )
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    update_data = data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.venue_rooms.update_one(
        {"room_id": room_id},
        {"$set": update_data}
    )
    
    return await db.venue_rooms.find_one({"room_id": room_id}, {"_id": 0})


@locations_router.delete("/venues/{venue_id}/rooms/{room_id}")
async def delete_venue_room(
    venue_id: str,
    room_id: str,
    user: User = Depends(get_current_user)
):
    """Delete (deactivate) a room"""
    result = await db.venue_rooms.update_one(
        {"room_id": room_id, "venue_id": venue_id, "company_id": user.company_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return {"message": "Room deactivated"}


# ============== SAVED ADDRESSES ==============

@locations_router.get("/saved-addresses")
async def get_saved_addresses(
    user: User = Depends(get_current_user)
):
    """Get all saved addresses for the organization"""
    addresses = await db.saved_addresses.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort([("is_favorite", -1), ("usage_count", -1)]).to_list(200)
    
    return addresses


@locations_router.post("/saved-addresses")
async def create_saved_address(
    data: SavedAddressCreate,
    user: User = Depends(get_current_user)
):
    """Create a saved address"""
    now = datetime.now(timezone.utc)
    address_id = f"addr_{uuid.uuid4().hex[:12]}"
    
    full_address = compute_full_address(
        data.address, data.city, data.state, data.zip_code, data.country
    )
    
    address_doc = {
        "address_id": address_id,
        "company_id": user.company_id,
        "name": data.name,
        "address": data.address,
        "city": data.city,
        "state": data.state,
        "zip_code": data.zip_code,
        "country": data.country,
        "full_address": full_address,
        "contact_name": data.contact_name,
        "contact_phone": data.contact_phone,
        "notes": data.notes,
        "is_favorite": data.is_favorite,
        "usage_count": 0,
        "last_used": None,
        "created_at": now.isoformat()
    }
    
    await db.saved_addresses.insert_one(address_doc)
    del address_doc["_id"]
    
    return address_doc


@locations_router.delete("/saved-addresses/{address_id}")
async def delete_saved_address(
    address_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a saved address"""
    result = await db.saved_addresses.delete_one(
        {"address_id": address_id, "company_id": user.company_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    
    return {"message": "Address deleted"}


# ============== EVENT LOCATIONS ==============

@locations_router.get("/events/{event_id}/locations")
async def get_event_locations(
    event_id: str,
    user: User = Depends(get_current_user)
):
    """Get locations for an event"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "locations": 1, "venue": 1, "client_id": 1}
    )
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Return locations array or convert legacy venue field
    locations = event.get("locations", [])
    
    # If no locations but has legacy venue field, convert it
    if not locations and event.get("venue"):
        locations = [{
            "location_id": "legacy",
            "location_type": "offsite",
            "label": "Main Location",
            "address": event.get("venue"),
            "full_address": event.get("venue"),
            "order": 0
        }]
    
    return {"locations": locations}


@locations_router.put("/events/{event_id}/locations")
async def update_event_locations(
    event_id: str,
    data: EventLocationsUpdate,
    user: User = Depends(get_current_user)
):
    """Update locations for an event (supports multiple locations)"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id}
    )
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    locations = []
    room_bookings_to_create = []
    
    # Get event date for room bookings
    event_date = event.get("event_date")
    if event_date:
        if isinstance(event_date, str):
            event_date_str = event_date[:10]  # YYYY-MM-DD
        else:
            event_date_str = event_date.strftime("%Y-%m-%d")
    else:
        event_date_str = None
    
    # Cancel existing room bookings for this event
    await db.room_bookings.update_many(
        {"event_id": event_id, "company_id": user.company_id},
        {"$set": {"status": "cancelled", "cancelled_at": now.isoformat()}}
    )
    
    for idx, loc_data in enumerate(data.locations):
        location_id = f"loc_{uuid.uuid4().hex[:8]}"
        
        location = {
            "location_id": location_id,
            "location_type": loc_data.location_type.value,
            "label": loc_data.label,
            "order": loc_data.order if loc_data.order else idx
        }
        
        if loc_data.location_type == LocationType.ONSITE:
            # Get venue and room details
            if loc_data.venue_id:
                venue = await db.venues.find_one(
                    {"venue_id": loc_data.venue_id, "company_id": user.company_id},
                    {"_id": 0, "name": 1, "full_address": 1}
                )
                if venue:
                    location["venue_id"] = loc_data.venue_id
                    location["venue_name"] = venue.get("name")
                    location["full_address"] = venue.get("full_address")
            
            if loc_data.room_id:
                room = await db.venue_rooms.find_one(
                    {"room_id": loc_data.room_id},
                    {"_id": 0, "name": 1, "capacity": 1}
                )
                if room:
                    location["room_id"] = loc_data.room_id
                    location["room_name"] = room.get("name")
                    
                    # Create room booking if event has a date
                    if event_date_str:
                        room_bookings_to_create.append({
                            "booking_id": f"booking_{uuid.uuid4().hex[:12]}",
                            "company_id": user.company_id,
                            "room_id": loc_data.room_id,
                            "room_name": room.get("name"),
                            "venue_id": loc_data.venue_id,
                            "venue_name": venue.get("name") if venue else None,
                            "event_id": event_id,
                            "event_name": event.get("name"),
                            "booking_date": event_date_str,
                            "start_time": loc_data.arrival_time,
                            "end_time": loc_data.departure_time,
                            "all_day": not (loc_data.arrival_time and loc_data.departure_time),
                            "notes": loc_data.setup_notes,
                            "booking_type": "event",
                            "status": "confirmed",
                            "created_at": now.isoformat(),
                            "created_by": user.user_id
                        })
        
        elif loc_data.location_type == LocationType.OFFSITE:
            location["address"] = loc_data.address
            location["city"] = loc_data.city
            location["state"] = loc_data.state
            location["zip_code"] = loc_data.zip_code
            location["country"] = loc_data.country
            location["full_address"] = compute_full_address(
                loc_data.address or "",
                loc_data.city,
                loc_data.state,
                loc_data.zip_code,
                loc_data.country
            )
            
            # Auto-save frequently used addresses
            if loc_data.address:
                existing = await db.saved_addresses.find_one({
                    "company_id": user.company_id,
                    "address": loc_data.address
                })
                if existing:
                    await db.saved_addresses.update_one(
                        {"address_id": existing["address_id"]},
                        {"$inc": {"usage_count": 1}, "$set": {"last_used": now.isoformat()}}
                    )
        
        elif loc_data.location_type == LocationType.CLIENT:
            location["use_client_address"] = True
            # Get client address
            client = await db.clients.find_one(
                {"client_id": event.get("client_id")},
                {"_id": 0, "address": 1, "city": 1, "state": 1, "zip_code": 1, "name": 1}
            )
            if client:
                location["address"] = client.get("address")
                location["city"] = client.get("city")
                location["state"] = client.get("state")
                location["zip_code"] = client.get("zip_code")
                location["full_address"] = compute_full_address(
                    client.get("address", ""),
                    client.get("city"),
                    client.get("state"),
                    client.get("zip_code")
                )
                location["contact_name"] = client.get("name")
        
        # Common fields
        location["contact_name"] = loc_data.contact_name or location.get("contact_name")
        location["contact_phone"] = loc_data.contact_phone
        location["arrival_time"] = loc_data.arrival_time
        location["departure_time"] = loc_data.departure_time
        location["setup_notes"] = loc_data.setup_notes
        location["parking_instructions"] = loc_data.parking_instructions
        
        locations.append(location)
    
    # Sort by order
    locations.sort(key=lambda x: x.get("order", 0))
    
    # Create room bookings
    if room_bookings_to_create:
        await db.room_bookings.insert_many(room_bookings_to_create)
    
    # Update event
    # Also update legacy venue field for backwards compatibility
    primary_location = locations[0] if locations else None
    legacy_venue = primary_location.get("full_address") if primary_location else None
    
    await db.events.update_one(
        {"event_id": event_id},
        {
            "$set": {
                "locations": locations,
                "venue": legacy_venue,
                "updated_at": now.isoformat()
            }
        }
    )
    
    return {"locations": locations, "bookings_created": len(room_bookings_to_create)}


@locations_router.post("/events/{event_id}/locations/add")
async def add_event_location(
    event_id: str,
    data: EventLocationItemCreate,
    user: User = Depends(get_current_user)
):
    """Add a single location to an event"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "locations": 1}
    )
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    current_locations = event.get("locations", [])
    
    # Create the new location using the update endpoint logic
    new_data = EventLocationsUpdate(locations=current_locations + [data])
    
    # Actually, we need to convert existing locations back to create format
    # This is simpler - just append and call update
    data.order = len(current_locations)
    
    return await update_event_locations(
        event_id,
        EventLocationsUpdate(locations=[
            EventLocationItemCreate(**{k: v for k, v in loc.items() if k != "location_id" and k != "full_address" and k != "venue_name" and k != "room_name"})
            for loc in current_locations
        ] + [data]),
        user
    )


@locations_router.delete("/events/{event_id}/locations/{location_id}")
async def remove_event_location(
    event_id: str,
    location_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a location from an event"""
    result = await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {
            "$pull": {"locations": {"location_id": location_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    
    return {"message": "Location removed"}


# ============== LOCATION SEARCH/SUGGESTIONS ==============

@locations_router.get("/search")
async def search_locations(
    q: str,
    user: User = Depends(get_current_user)
):
    """Search venues, rooms, and saved addresses"""
    results = {
        "venues": [],
        "rooms": [],
        "saved_addresses": []
    }
    
    # Search venues
    venues = await db.venues.find(
        {
            "company_id": user.company_id,
            "is_active": True,
            "$or": [
                {"name": {"$regex": q, "$options": "i"}},
                {"address": {"$regex": q, "$options": "i"}}
            ]
        },
        {"_id": 0}
    ).limit(5).to_list(5)
    results["venues"] = venues
    
    # Search rooms
    rooms = await db.venue_rooms.find(
        {
            "company_id": user.company_id,
            "is_active": True,
            "name": {"$regex": q, "$options": "i"}
        },
        {"_id": 0}
    ).limit(5).to_list(5)
    results["rooms"] = rooms
    
    # Search saved addresses
    addresses = await db.saved_addresses.find(
        {
            "company_id": user.company_id,
            "$or": [
                {"name": {"$regex": q, "$options": "i"}},
                {"address": {"$regex": q, "$options": "i"}}
            ]
        },
        {"_id": 0}
    ).limit(5).to_list(5)
    results["saved_addresses"] = addresses
    
    return results


# ============== ROOM BOOKINGS (Availability & Conflicts) ==============

async def check_room_availability_internal(
    room_id: str,
    booking_date: str,
    company_id: str,
    exclude_event_id: str = None,
    start_time: str = None,
    end_time: str = None
) -> dict:
    """Internal helper to check room availability"""
    query = {
        "room_id": room_id,
        "company_id": company_id,
        "booking_date": booking_date,
        "status": {"$ne": "cancelled"}
    }
    
    if exclude_event_id:
        query["event_id"] = {"$ne": exclude_event_id}
    
    conflicts = await db.room_bookings.find(query, {"_id": 0}).to_list(50)
    
    # If checking specific time slots
    if start_time and end_time and not any(c.get("all_day") for c in conflicts):
        time_conflicts = []
        for c in conflicts:
            c_start = c.get("start_time", "00:00")
            c_end = c.get("end_time", "23:59")
            # Check for overlap
            if not (end_time <= c_start or start_time >= c_end):
                time_conflicts.append(c)
        conflicts = time_conflicts
    
    return {
        "is_available": len(conflicts) == 0,
        "conflicts": conflicts
    }


@locations_router.get("/rooms/{room_id}/availability")
async def check_room_availability(
    room_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    start_time: Optional[str] = Query(None, description="Start time HH:MM"),
    end_time: Optional[str] = Query(None, description="End time HH:MM"),
    exclude_event_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Check if a room is available on a specific date"""
    # Get room details
    room = await db.venue_rooms.find_one(
        {"room_id": room_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Get venue details
    venue = await db.venues.find_one(
        {"venue_id": room.get("venue_id"), "company_id": user.company_id},
        {"_id": 0, "name": 1, "venue_id": 1}
    )
    
    result = await check_room_availability_internal(
        room_id, date, user.company_id, exclude_event_id, start_time, end_time
    )
    
    return {
        "room_id": room_id,
        "room_name": room.get("name"),
        "venue_id": room.get("venue_id"),
        "venue_name": venue.get("name") if venue else None,
        "date": date,
        "is_available": result["is_available"],
        "conflicts": result["conflicts"],
        "capacity": room.get("capacity", 0)
    }


@locations_router.get("/rooms/{room_id}/bookings")
async def get_room_bookings(
    room_id: str,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Get all bookings for a room within a date range"""
    room = await db.venue_rooms.find_one(
        {"room_id": room_id, "company_id": user.company_id}
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    end = end_date or start_date
    
    bookings = await db.room_bookings.find(
        {
            "room_id": room_id,
            "company_id": user.company_id,
            "booking_date": {"$gte": start_date, "$lte": end},
            "status": {"$ne": "cancelled"}
        },
        {"_id": 0}
    ).sort("booking_date", 1).to_list(100)
    
    return bookings


@locations_router.post("/rooms/{room_id}/bookings")
async def create_room_booking(
    room_id: str,
    data: RoomBookingCreate,
    user: User = Depends(get_current_user)
):
    """Create a room booking/reservation"""
    # Verify room exists
    room = await db.venue_rooms.find_one(
        {"room_id": room_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Get venue
    venue = await db.venues.find_one(
        {"venue_id": data.venue_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    
    # Check availability
    availability = await check_room_availability_internal(
        room_id, data.booking_date, user.company_id,
        data.event_id, data.start_time, data.end_time
    )
    
    if not availability["is_available"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Room is not available for this date/time",
                "conflicts": availability["conflicts"]
            }
        )
    
    now = datetime.now(timezone.utc)
    booking_id = f"booking_{uuid.uuid4().hex[:12]}"
    
    booking_doc = {
        "booking_id": booking_id,
        "company_id": user.company_id,
        "room_id": room_id,
        "room_name": room.get("name"),
        "venue_id": data.venue_id,
        "venue_name": venue.get("name") if venue else None,
        "event_id": data.event_id,
        "event_name": data.event_name,
        "booking_date": data.booking_date,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "all_day": data.all_day,
        "notes": data.notes,
        "booking_type": data.booking_type,
        "status": "confirmed",
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    await db.room_bookings.insert_one(booking_doc)
    del booking_doc["_id"]
    
    return booking_doc


@locations_router.delete("/rooms/{room_id}/bookings/{booking_id}")
async def cancel_room_booking(
    room_id: str,
    booking_id: str,
    user: User = Depends(get_current_user)
):
    """Cancel a room booking"""
    result = await db.room_bookings.update_one(
        {
            "booking_id": booking_id,
            "room_id": room_id,
            "company_id": user.company_id
        },
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "cancelled_by": user.user_id
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return {"message": "Booking cancelled"}


@locations_router.get("/venues/{venue_id}/availability")
async def get_venue_availability(
    venue_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    user: User = Depends(get_current_user)
):
    """Get availability for all rooms in a venue on a specific date"""
    venue = await db.venues.find_one(
        {"venue_id": venue_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    
    # Get all rooms
    rooms = await db.venue_rooms.find(
        {"venue_id": venue_id, "company_id": user.company_id, "is_active": True},
        {"_id": 0}
    ).to_list(50)
    
    # Get all bookings for this date
    bookings = await db.room_bookings.find(
        {
            "venue_id": venue_id,
            "company_id": user.company_id,
            "booking_date": date,
            "status": {"$ne": "cancelled"}
        },
        {"_id": 0}
    ).to_list(100)
    
    # Map bookings to rooms
    room_bookings = {}
    for booking in bookings:
        rid = booking.get("room_id")
        if rid not in room_bookings:
            room_bookings[rid] = []
        room_bookings[rid].append(booking)
    
    # Build response
    rooms_availability = []
    for room in rooms:
        rid = room.get("room_id")
        room_conflicts = room_bookings.get(rid, [])
        rooms_availability.append({
            "room_id": rid,
            "room_name": room.get("name"),
            "capacity": room.get("capacity", 0),
            "floor": room.get("floor"),
            "is_available": len(room_conflicts) == 0,
            "bookings": room_conflicts
        })
    
    return {
        "venue_id": venue_id,
        "venue_name": venue.get("name"),
        "date": date,
        "rooms": rooms_availability,
        "total_rooms": len(rooms),
        "available_rooms": sum(1 for r in rooms_availability if r["is_available"])
    }


@locations_router.get("/calendar")
async def get_rooms_calendar(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    venue_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get calendar view of all room bookings"""
    query = {
        "company_id": user.company_id,
        "booking_date": {"$gte": start_date, "$lte": end_date},
        "status": {"$ne": "cancelled"}
    }
    
    if venue_id:
        query["venue_id"] = venue_id
    
    bookings = await db.room_bookings.find(query, {"_id": 0}).sort("booking_date", 1).to_list(500)
    
    # Group by date
    calendar = {}
    for booking in bookings:
        date = booking.get("booking_date")
        if date not in calendar:
            calendar[date] = []
        calendar[date].append(booking)
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "bookings_by_date": calendar,
        "total_bookings": len(bookings)
    }

