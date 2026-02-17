# models/locations.py - Location and Venue Models
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class LocationType(str, Enum):
    ONSITE = "onsite"      # Company's own venue/rooms
    OFFSITE = "offsite"    # External address
    CLIENT = "client"      # Use client's address
    MULTI = "multi"        # Multiple locations


# ============== VENUE/ROOM MODELS (Company's Spaces) ==============

class VenueRoomCreate(BaseModel):
    """A room or space within a company's venue"""
    name: str
    description: Optional[str] = None
    capacity: int = 0
    floor: Optional[str] = None
    amenities: List[str] = []  # WiFi, projector, kitchen access, etc.
    setup_options: List[str] = []  # theater, classroom, banquet, cocktail
    hourly_rate: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool = True


class VenueRoom(BaseModel):
    room_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    capacity: int = 0
    floor: Optional[str] = None
    amenities: List[str] = []
    setup_options: List[str] = []
    hourly_rate: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class VenueCreate(BaseModel):
    """A venue owned/operated by the company"""
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "USA"
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None
    total_capacity: int = 0
    parking_info: Optional[str] = None
    accessibility_info: Optional[str] = None
    image_url: Optional[str] = None
    is_primary: bool = False  # Primary company location
    is_active: bool = True


class Venue(BaseModel):
    venue_id: str
    company_id: str
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "USA"
    full_address: Optional[str] = None  # Computed: address, city, state zip
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None
    total_capacity: int = 0
    parking_info: Optional[str] = None
    accessibility_info: Optional[str] = None
    image_url: Optional[str] = None
    rooms: List[VenueRoom] = []  # Rooms within this venue
    is_primary: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None
    total_capacity: Optional[int] = None
    parking_info: Optional[str] = None
    accessibility_info: Optional[str] = None
    image_url: Optional[str] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None


# ============== EVENT LOCATION MODELS ==============

class EventLocationItem(BaseModel):
    """A single location entry for an event"""
    location_id: str
    location_type: LocationType
    label: Optional[str] = None  # e.g., "Main Event", "Cocktail Hour", "Ceremony"
    
    # For ONSITE locations
    venue_id: Optional[str] = None
    venue_name: Optional[str] = None
    room_id: Optional[str] = None
    room_name: Optional[str] = None
    
    # For OFFSITE or CLIENT locations
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    full_address: Optional[str] = None
    
    # Additional info
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    arrival_time: Optional[str] = None  # HH:MM
    departure_time: Optional[str] = None
    setup_notes: Optional[str] = None
    parking_instructions: Optional[str] = None
    
    # For CLIENT type
    use_client_address: bool = False
    
    # Order for multi-location events
    order: int = 0


class EventLocationItemCreate(BaseModel):
    """Create a location entry for an event"""
    location_type: LocationType
    label: Optional[str] = None
    
    # For ONSITE
    venue_id: Optional[str] = None
    room_id: Optional[str] = None
    
    # For OFFSITE
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    
    # For CLIENT
    use_client_address: bool = False
    
    # Additional
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    setup_notes: Optional[str] = None
    parking_instructions: Optional[str] = None
    order: int = 0


class EventLocationsUpdate(BaseModel):
    """Update event locations - supports multiple locations"""
    locations: List[EventLocationItemCreate] = []


# ============== SAVED ADDRESS MODELS ==============

class SavedAddressCreate(BaseModel):
    """A saved address for quick reuse"""
    name: str  # e.g., "Corporate Office", "Beach House"
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "USA"
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: bool = False


class SavedAddress(BaseModel):
    address_id: str
    company_id: str
    name: str
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "USA"
    full_address: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: bool = False
    usage_count: int = 0
    last_used: Optional[datetime] = None
    created_at: datetime


# ============== ROOM BOOKING MODELS (Availability & Conflicts) ==============

class RoomBookingCreate(BaseModel):
    """Create a room booking/reservation"""
    room_id: str
    venue_id: str
    event_id: Optional[str] = None
    event_name: Optional[str] = None
    booking_date: str  # YYYY-MM-DD format
    start_time: Optional[str] = None  # HH:MM format
    end_time: Optional[str] = None  # HH:MM format
    all_day: bool = True  # If true, blocks entire day
    notes: Optional[str] = None
    booking_type: str = "event"  # event, maintenance, hold, blocked


class RoomBooking(BaseModel):
    """Room booking record"""
    booking_id: str
    company_id: str
    room_id: str
    room_name: Optional[str] = None
    venue_id: str
    venue_name: Optional[str] = None
    event_id: Optional[str] = None
    event_name: Optional[str] = None
    booking_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: bool = True
    notes: Optional[str] = None
    booking_type: str = "event"
    status: str = "confirmed"  # confirmed, tentative, cancelled
    created_at: datetime
    created_by: str


class RoomAvailabilityCheck(BaseModel):
    """Check room availability for a date range"""
    room_id: str
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None  # YYYY-MM-DD, defaults to start_date
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class RoomAvailabilityResponse(BaseModel):
    """Room availability response"""
    room_id: str
    room_name: str
    venue_id: str
    venue_name: str
    is_available: bool
    conflicts: List[dict] = []  # List of conflicting bookings
    capacity: int = 0
