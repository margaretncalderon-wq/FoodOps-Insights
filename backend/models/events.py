# models/events.py - Events module models
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============== ENGAGEMENT TYPE ENUM ==============

class EngagementType(str, Enum):
    """Types of engagements/work the organization can track"""
    EVENT = "event"           # Full event with venue, catering, timeline (catering, weddings)
    PROJECT = "project"       # Project-based work with deliverables (consulting, agencies)
    SERVICE = "service"       # Simple service → invoice flow (generic services)


# ============== EVENT CORE MODELS ==============

class EventCreate(BaseModel):
    client_id: str
    name: str
    event_type: Optional[str] = "other"  # Was required — relaxed because non-event engagement types don't need it
    # NEW: Engagement type determines what fields/modules are relevant
    engagement_type: EngagementType = EngagementType.EVENT
    event_date: Optional[datetime] = None
    event_date_tbd: bool = False
    end_date: Optional[datetime] = None  # For multi-day events
    start_time: Optional[str] = None  # e.g., "14:00"
    end_time: Optional[str] = None  # e.g., "22:00"
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int = 0
    # NEW: Generic fields for projects/services
    participant_count: Optional[int] = None  # Alternative to guest_count for projects
    deliverables: Optional[str] = None  # For projects
    scope_summary: Optional[str] = None  # Brief scope description
    budget: float = 0.0
    notes: Optional[str] = None
    status: str = "planning"
    # CRM Pipeline fields
    stage: str = "Inquiry Received"  # Inquiry Received, Context Captured, Scope Drafted, Definition In Review, Committed, Archived
    expected_value: Optional[float] = None
    next_followup_date: Optional[datetime] = None
    next_step: Optional[str] = None
    lost_reason: Optional[str] = None
    source: Optional[str] = None


class Event(BaseModel):
    event_id: str
    company_id: str
    client_id: str
    name: str
    event_type: str
    engagement_type: EngagementType = EngagementType.EVENT
    event_date: Optional[datetime] = None
    event_date_tbd: bool = False
    end_date: Optional[datetime] = None  # For multi-day events
    start_time: Optional[str] = None  # e.g., "14:00"
    end_time: Optional[str] = None  # e.g., "22:00"
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int
    participant_count: Optional[int] = None
    deliverables: Optional[str] = None
    scope_summary: Optional[str] = None
    budget: float
    notes: Optional[str] = None
    status: str
    # CRM Pipeline fields
    stage: str = "Inquiry Received"
    expected_value: Optional[float] = None
    next_followup_date: Optional[datetime] = None
    next_step: Optional[str] = None
    lost_reason: Optional[str] = None
    source: Optional[str] = None
    # Link to Demand Studio Activation
    linked_activation_id: Optional[str] = None
    linked_activation_name: Optional[str] = None  # Denormalized for display
    marketing_budget: Optional[float] = None  # From linked activation
    # Existing fields
    timeline: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    menu_items: List[str] = []
    menu_id: Optional[str] = None  # ID of assigned plated menu
    documents: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime


class EventUpdate(BaseModel):
    """Update model for events - all fields optional"""
    client_id: Optional[str] = None
    name: Optional[str] = None
    event_type: Optional[str] = None
    engagement_type: Optional[EngagementType] = None
    event_date: Optional[datetime] = None
    event_date_tbd: Optional[bool] = None
    end_date: Optional[datetime] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    is_booking: Optional[bool] = None
    venue: Optional[str] = None
    guest_count: Optional[int] = None
    participant_count: Optional[int] = None
    deliverables: Optional[str] = None
    scope_summary: Optional[str] = None
    budget: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    stage: Optional[str] = None
    expected_value: Optional[float] = None
    next_followup_date: Optional[datetime] = None
    next_step: Optional[str] = None
    lost_reason: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None  # user_id of assigned salesperson
    menu_id: Optional[str] = None  # ID of assigned plated menu


# ============== EVENT MENU MODELS ==============

class EventMenuCreate(BaseModel):
    event_id: str
    menu_items: List[Dict[str, Any]]  # [{menu_item_id, quantity, portion_multiplier}]
    notes: Optional[str] = None


# ============== EVENT ORCHESTRATION MODELS ==============

class EventBlueprintUpdate(BaseModel):
    """Extended event metadata for orchestration"""
    objectives: Optional[str] = None
    scope_definition: Optional[str] = None
    critical_assumptions: Optional[str] = None
    constraints: Optional[str] = None
    success_criteria: Optional[str] = None


class ExperienceDesignCreate(BaseModel):
    """Experience design for an event"""
    event_id: str
    color_palette: List[str] = []  # List of hex colors
    materials: List[Dict[str, Any]] = []  # [{name, description, category}]
    moodboard_images: List[Dict[str, str]] = []  # [{url, caption, type: 'upload'|'url'}]
    catering_setup: Optional[str] = None  # buffet, plated, stations, etc.
    layout_zones: List[Dict[str, Any]] = []  # [{name, purpose, capacity, position}]
    notes: Optional[str] = None


class OperationalPhase(BaseModel):
    """Phase in operational flow"""
    phase_id: str
    name: str  # Pre-Event, Live, Post-Event
    status: str = "pending"  # pending, in_progress, completed
    checklist: List[Dict[str, Any]] = []  # [{item, completed, notes}]
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class OperationalFlowCreate(BaseModel):
    """Operational flow for an event"""
    event_id: str
    phases: List[OperationalPhase] = []
    dependencies: List[Dict[str, Any]] = []  # [{name, type, status, linked_to}]
    risks: List[Dict[str, Any]] = []  # [{name, probability, impact, mitigation}]
    overall_status: str = "planning"  # planning, ready, executing, completed


class TimeBlock(BaseModel):
    """Time block for Run of Show"""
    block_id: str
    start_time: str  # HH:MM format
    end_time: str
    title: str
    description: Optional[str] = None
    responsible_role: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    is_buffer: bool = False
    order: int = 0


class RunOfShowCreate(BaseModel):
    """Run of Show for an event"""
    event_id: str
    time_blocks: List[TimeBlock] = []
    template_name: Optional[str] = None
    contingency_notes: Optional[str] = None


class EventRole(BaseModel):
    """Role assignment for an event"""
    role_id: str
    role_name: str
    quantity: int = 1
    assignees: List[str] = []  # List of names or user_ids
    responsibilities: Optional[str] = None
    capacity_notes: Optional[str] = None
    contact_info: Optional[str] = None


class TeamRolesCreate(BaseModel):
    """Team and roles for an event"""
    event_id: str
    roles: List[EventRole] = []
    coordinator_notes: Optional[str] = None


class ProductionAsset(BaseModel):
    """Production asset for an event"""
    asset_id: str
    name: str
    category: str  # equipment, decor, supplies, etc.
    quantity: int = 1
    status: str = "pending"  # pending, confirmed, packed, delivered
    source: Optional[str] = None  # rental, owned, client
    notes: Optional[str] = None


class ChecklistItem(BaseModel):
    """Checklist item for production"""
    item_id: str
    name: str
    category: str
    completed: bool = False
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None


class ProductionAssetsCreate(BaseModel):
    """Production assets for an event"""
    event_id: str
    assets: List[ProductionAsset] = []
    checklists: List[ChecklistItem] = []
    packing_list: List[Dict[str, Any]] = []  # [{item, quantity, packed}]
    preparation_status: str = "not_started"  # not_started, in_progress, ready


class PostEventReviewCreate(BaseModel):
    """Post-event review"""
    event_id: str
    what_worked: List[str] = []
    what_failed: List[str] = []
    deviations: List[Dict[str, str]] = []  # [{planned, actual, reason}]
    learnings: List[str] = []
    client_feedback: Optional[str] = None
    team_feedback: Optional[str] = None
    rating: Optional[int] = None  # 1-5
    is_locked: bool = False


# ============== EVENT SCALING MODELS ==============

class EventScalingRequest(BaseModel):
    """Request to generate purchase list from event menu"""
    event_ids: List[str]  # Can combine multiple events
    include_buffer: bool = True
    compare_inventory: bool = True  # Deduct current stock


class ScaledIngredient(BaseModel):
    inventory_item_id: str
    item_name: str
    unit: str
    total_required: float
    in_stock: float
    to_purchase: float
    unit_cost: float
    total_cost: float
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    recipes_used: List[str] = []


class ConsolidatedPurchaseList(BaseModel):
    events: List[Dict[str, Any]]  # [{event_id, event_name, guest_count, date}]
    items_by_supplier: Dict[str, List[ScaledIngredient]]
    total_cost: float
    generated_at: datetime


class CreatePOFromPurchaseListItem(BaseModel):
    inventory_item_id: Optional[str] = None
    item_name: str
    to_purchase: float
    unit: str = "unit"
    unit_cost: float = 0


class CreatePOFromPurchaseListRequest(BaseModel):
    supplier_id: Optional[str] = None
    items: List[CreatePOFromPurchaseListItem]
    needed_by_date: Optional[datetime] = None


# ============== EVENT EXTENSION MODELS ==============

class EventExtendedUpdate(BaseModel):
    """Extended event fields for the new proposal system"""
    owner_id: Optional[str] = None
    internal_notes: Optional[str] = None
    financial_status: Optional[str] = None  # Draft, In Review, Approved
    operational_status: Optional[str] = None  # Open, In Production, Completed, Closed


# ============== EVENT ORDER MODELS ==============

class EventOrderItemCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: str
    quantity: float = 1.0
    unit_price: float = 0.0
    discount_amount: float = 0.0  # Discount for this specific item
    recipe_id: Optional[str] = None  # Link to recipe if food item
    internal_notes: Optional[str] = None  # Shows in Kitchen Sheet & Packing List
    event_date: Optional[str] = None  # For grouping by date
    sort_order: int = 0


class EventOrderItem(BaseModel):
    item_id: str
    name: str
    description: Optional[str] = None
    category_id: str
    category_name: Optional[str] = None
    quantity: float
    unit_price: float
    discount_amount: float
    subtotal: float  # quantity * unit_price - discount_amount
    recipe_id: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: int
    created_at: datetime


class EventOrderCreate(BaseModel):
    items: List[EventOrderItemCreate] = []
    discount_amount: float = 0.0  # Overall discount
    tax_ids: List[str] = []  # Tax rates to apply
    payment_terms: Optional[str] = None
    client_notes: Optional[str] = None  # Notes visible to client


class EventOrder(BaseModel):
    order_id: str
    event_id: str
    company_id: str
    items: List[EventOrderItem]
    subtotal: float
    discount_amount: float
    tax_details: List[Dict[str, Any]]  # [{tax_id, name, rate, amount}]
    total_tax: float
    total: float
    payment_terms: Optional[str] = None
    client_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ============== RUN OF SHOW TEMPLATES ==============

RUN_OF_SHOW_TEMPLATES = {
    "wedding": {
        "name": "Wedding Ceremony & Reception",
        "name_es": "Ceremonia y Recepción de Boda",
        "blocks": [
            {"start_time": "14:00", "end_time": "14:30", "title": "Vendor Arrival & Setup", "title_es": "Llegada y Montaje de Proveedores", "is_buffer": False},
            {"start_time": "14:30", "end_time": "15:00", "title": "Sound Check & Final Touches", "title_es": "Prueba de Sonido y Toques Finales", "is_buffer": False},
            {"start_time": "15:00", "end_time": "15:30", "title": "Guest Arrival", "title_es": "Llegada de Invitados", "is_buffer": False},
            {"start_time": "15:30", "end_time": "16:00", "title": "Ceremony", "title_es": "Ceremonia", "is_buffer": False},
            {"start_time": "16:00", "end_time": "16:30", "title": "Cocktail Hour", "title_es": "Hora del Cóctel", "is_buffer": False},
            {"start_time": "16:30", "end_time": "17:00", "title": "Photos & Transition", "title_es": "Fotos y Transición", "is_buffer": True},
            {"start_time": "17:00", "end_time": "17:30", "title": "Grand Entrance & First Dance", "title_es": "Entrada y Primer Baile", "is_buffer": False},
            {"start_time": "17:30", "end_time": "19:00", "title": "Dinner Service", "title_es": "Servicio de Cena", "is_buffer": False},
            {"start_time": "19:00", "end_time": "19:30", "title": "Toasts & Speeches", "title_es": "Brindis y Discursos", "is_buffer": False},
            {"start_time": "19:30", "end_time": "20:00", "title": "Cake Cutting", "title_es": "Corte del Pastel", "is_buffer": False},
            {"start_time": "20:00", "end_time": "22:00", "title": "Dancing & Celebration", "title_es": "Baile y Celebración", "is_buffer": False},
            {"start_time": "22:00", "end_time": "22:30", "title": "Last Dance & Send-off", "title_es": "Último Baile y Despedida", "is_buffer": False}
        ]
    },
    "corporate": {
        "name": "Corporate Event",
        "name_es": "Evento Corporativo",
        "blocks": [
            {"start_time": "07:00", "end_time": "08:00", "title": "Setup & AV Check", "title_es": "Montaje y Prueba de Audio/Video", "is_buffer": False},
            {"start_time": "08:00", "end_time": "08:30", "title": "Registration & Coffee", "title_es": "Registro y Café", "is_buffer": False},
            {"start_time": "08:30", "end_time": "09:00", "title": "Welcome & Opening Remarks", "title_es": "Bienvenida y Palabras de Apertura", "is_buffer": False},
            {"start_time": "09:00", "end_time": "10:30", "title": "Morning Session", "title_es": "Sesión de la Mañana", "is_buffer": False},
            {"start_time": "10:30", "end_time": "11:00", "title": "Coffee Break", "title_es": "Receso para Café", "is_buffer": True},
            {"start_time": "11:00", "end_time": "12:30", "title": "Late Morning Session", "title_es": "Sesión Final de la Mañana", "is_buffer": False},
            {"start_time": "12:30", "end_time": "13:30", "title": "Lunch", "title_es": "Almuerzo", "is_buffer": False},
            {"start_time": "13:30", "end_time": "15:00", "title": "Afternoon Session", "title_es": "Sesión de la Tarde", "is_buffer": False},
            {"start_time": "15:00", "end_time": "15:30", "title": "Afternoon Break", "title_es": "Receso de la Tarde", "is_buffer": True},
            {"start_time": "15:30", "end_time": "17:00", "title": "Closing Session", "title_es": "Sesión de Cierre", "is_buffer": False},
            {"start_time": "17:00", "end_time": "18:00", "title": "Networking Reception", "title_es": "Recepción de Networking", "is_buffer": False}
        ]
    },
    "birthday": {
        "name": "Birthday Party",
        "name_es": "Fiesta de Cumpleaños",
        "blocks": [
            {"start_time": "14:00", "end_time": "15:00", "title": "Setup & Decoration", "title_es": "Montaje y Decoración", "is_buffer": False},
            {"start_time": "15:00", "end_time": "15:30", "title": "Guest Arrival", "title_es": "Llegada de Invitados", "is_buffer": False},
            {"start_time": "15:30", "end_time": "16:30", "title": "Activities & Games", "title_es": "Actividades y Juegos", "is_buffer": False},
            {"start_time": "16:30", "end_time": "17:30", "title": "Food Service", "title_es": "Servicio de Comida", "is_buffer": False},
            {"start_time": "17:30", "end_time": "18:00", "title": "Cake & Birthday Song", "title_es": "Pastel y Canción de Cumpleaños", "is_buffer": False},
            {"start_time": "18:00", "end_time": "18:30", "title": "Gift Opening", "title_es": "Apertura de Regalos", "is_buffer": False},
            {"start_time": "18:30", "end_time": "19:00", "title": "Free Time & Farewell", "title_es": "Tiempo Libre y Despedida", "is_buffer": False}
        ]
    },
    "blank": {
        "name": "Custom Event",
        "name_es": "Evento Personalizado",
        "blocks": []
    }
}
