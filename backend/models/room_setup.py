# models/room_setup.py - Room Setup and Timeline Models for Event Orchestration
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class LayoutType(str, Enum):
    THEATER = "theater"
    BANQUET = "banquet"
    COCKTAIL = "cocktail"
    CLASSROOM = "classroom"
    U_SHAPE = "u_shape"
    CONFERENCE = "conference"
    HOLLOW_SQUARE = "hollow_square"
    CUSTOM = "custom"


class RoomNeedCategory(str, Enum):
    AV_EQUIPMENT = "av_equipment"
    FURNITURE = "furniture"
    DECOR = "decor"
    CATERING = "catering"
    TECHNICAL = "technical"
    OTHER = "other"


class RoomNeedItem(BaseModel):
    """Individual room need/requirement"""
    item_id: Optional[str] = None
    category: RoomNeedCategory = RoomNeedCategory.OTHER
    name: str
    quantity: int = 1
    notes: Optional[str] = None
    is_confirmed: bool = False
    assigned_to: Optional[str] = None  # Team member or vendor


class TimelineActivity(BaseModel):
    """Activity in the room timeline"""
    activity_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    start_time: str  # HH:MM format
    end_time: str    # HH:MM format
    activity_type: str = "general"  # setup, ceremony, cocktail, dinner, entertainment, breakdown
    responsible: Optional[str] = None
    color: Optional[str] = None
    notes: Optional[str] = None


class RoomSetupConfig(BaseModel):
    """Configuration for a single room in an event"""
    config_id: Optional[str] = None
    room_id: str
    room_name: Optional[str] = None
    venue_id: str
    venue_name: Optional[str] = None
    
    # Layout configuration
    layout_type: LayoutType = LayoutType.BANQUET
    custom_layout_name: Optional[str] = None
    layout_diagram_url: Optional[str] = None
    layout_notes: Optional[str] = None
    
    # Capacity
    room_capacity: int = 0
    planned_guests: int = 0
    
    # Room needs/requirements
    needs: List[RoomNeedItem] = []
    
    # Timeline for this room
    timeline: List[TimelineActivity] = []
    
    # Setup/Breakdown times
    setup_start_time: Optional[str] = None
    event_start_time: Optional[str] = None
    event_end_time: Optional[str] = None
    breakdown_end_time: Optional[str] = None
    
    # Additional
    special_instructions: Optional[str] = None
    vendor_access_notes: Optional[str] = None
    
    # Order for multi-room events
    order: int = 0
    
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RoomSetupCreate(BaseModel):
    """Create room setup configuration"""
    room_id: str
    venue_id: str
    layout_type: LayoutType = LayoutType.BANQUET
    custom_layout_name: Optional[str] = None
    layout_notes: Optional[str] = None
    planned_guests: int = 0
    needs: List[RoomNeedItem] = []
    timeline: List[TimelineActivity] = []
    setup_start_time: Optional[str] = None
    event_start_time: Optional[str] = None
    event_end_time: Optional[str] = None
    breakdown_end_time: Optional[str] = None
    special_instructions: Optional[str] = None
    vendor_access_notes: Optional[str] = None
    order: int = 0


class RoomSetupUpdate(BaseModel):
    """Update room setup configuration"""
    layout_type: Optional[LayoutType] = None
    custom_layout_name: Optional[str] = None
    layout_diagram_url: Optional[str] = None
    layout_notes: Optional[str] = None
    planned_guests: Optional[int] = None
    needs: Optional[List[RoomNeedItem]] = None
    timeline: Optional[List[TimelineActivity]] = None
    setup_start_time: Optional[str] = None
    event_start_time: Optional[str] = None
    event_end_time: Optional[str] = None
    breakdown_end_time: Optional[str] = None
    special_instructions: Optional[str] = None
    vendor_access_notes: Optional[str] = None
    order: Optional[int] = None


class EventRoomSetups(BaseModel):
    """All room setups for an event"""
    event_id: str
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    rooms: List[RoomSetupConfig] = []
    
    # Consolidated timeline across all rooms
    master_timeline: List[dict] = []  # Computed from individual room timelines



# ============== TEMPLATES ==============

class TemplateCategory(str, Enum):
    WEDDING = "wedding"
    CORPORATE = "corporate"
    SOCIAL = "social"
    CONFERENCE = "conference"
    GALA = "gala"
    CUSTOM = "custom"


class RoomSetupTemplate(BaseModel):
    """Reusable room setup template"""
    template_id: Optional[str] = None
    company_id: str
    name: str
    description: Optional[str] = None
    category: TemplateCategory = TemplateCategory.CUSTOM
    
    # Layout configuration
    layout_type: LayoutType = LayoutType.BANQUET
    custom_layout_name: Optional[str] = None
    layout_diagram_url: Optional[str] = None  # Visual layout image
    layout_notes: Optional[str] = None
    
    # Template needs (defaults)
    default_needs: List[RoomNeedItem] = []
    
    # Template timeline (relative times)
    default_timeline: List[TimelineActivity] = []
    
    # Typical capacity range
    min_capacity: int = 0
    max_capacity: int = 0
    
    # Visual elements
    thumbnail_url: Optional[str] = None
    
    # Metadata
    is_system_template: bool = False  # System-wide vs company-specific
    usage_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RoomSetupTemplateCreate(BaseModel):
    """Create a new template"""
    name: str
    description: Optional[str] = None
    category: TemplateCategory = TemplateCategory.CUSTOM
    layout_type: LayoutType = LayoutType.BANQUET
    custom_layout_name: Optional[str] = None
    layout_notes: Optional[str] = None
    default_needs: List[RoomNeedItem] = []
    default_timeline: List[TimelineActivity] = []
    min_capacity: int = 0
    max_capacity: int = 0


class LayoutDiagramUpload(BaseModel):
    """Upload visual layout diagram"""
    room_id: Optional[str] = None  # For room-specific
    template_id: Optional[str] = None  # For template
    diagram_url: str
    diagram_type: str = "floor_plan"  # floor_plan, seating_chart, 3d_view



# ============== ACTIVITY CHANGE LOG ==============

class ChangeType(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    MOVE = "move"  # Drag & drop in timeline
    RESIZE = "resize"  # Resize activity duration


class ActivityChangeLog(BaseModel):
    """Log of changes to activities for audit trail"""
    log_id: Optional[str] = None
    event_id: str
    room_id: str
    activity_id: str
    activity_title: str
    change_type: ChangeType
    changed_by_id: str
    changed_by_name: str
    changed_by_email: str
    timestamp: datetime
    
    # What changed
    field_changed: Optional[str] = None  # e.g., "start_time", "end_time", "title"
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    
    # For time changes, store both old and new times
    old_start_time: Optional[str] = None
    old_end_time: Optional[str] = None
    new_start_time: Optional[str] = None
    new_end_time: Optional[str] = None
    
    notes: Optional[str] = None
