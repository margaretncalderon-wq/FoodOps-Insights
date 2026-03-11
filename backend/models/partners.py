# models/partners.py - Partner Management Models
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class PartnerAttachment(BaseModel):
    """Attachment for a partner (catalogs, COI, contracts, etc.)"""
    attachment_id: str
    file_name: str
    original_name: str
    file_type: str  # catalog, coi, contract, license, portfolio, other
    mime_type: str
    file_size: int
    file_url: str
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    expiration_date: Optional[str] = None
    uploaded_at: str
    uploaded_by: str


class PartnerStatus(str, Enum):
    PREFERRED = "preferred"
    APPROVED = "approved"
    UNDER_REVIEW = "under_review"
    POTENTIAL = "potential"
    DO_NOT_USE = "do_not_use"
    INACTIVE = "inactive"


class PreferredTier(str, Enum):
    A = "A"
    B = "B"
    TRIAL = "Trial"


class PartnerType(str, Enum):
    VENDOR = "vendor"
    SUPPLIER = "supplier"
    FREELANCER = "freelancer"
    AGENCY = "agency"
    ASSOCIATION = "association"
    VENUE_PARTNER = "venue_partner"
    STAFFING_PARTNER = "staffing_partner"
    LOGISTICS_PARTNER = "logistics_partner"
    SERVICE_PROVIDER = "service_provider"


class PrimaryCategory(str, Enum):
    FOOD_SUPPLIER = "food_supplier"
    RENTALS = "rentals"
    FLORALS = "florals"
    AV = "av"
    LIGHTING = "lighting"
    FABRICATION = "fabrication"
    PRINTING = "printing"
    STAFFING = "staffing"
    TRANSPORTATION = "transportation"
    SECURITY = "security"
    PHOTO_VIDEO = "photo_video"
    LOGISTICS = "logistics"
    VENUE_SERVICES = "venue_services"
    CLEANING = "cleaning"
    DECOR = "decor"
    OTHER = "other"


class ServiceAreaType(str, Enum):
    LOCAL = "local"
    REGIONAL = "regional"
    NATIONAL = "national"
    INTERNATIONAL = "international"


class PricingLevel(str, Enum):
    BUDGET = "budget"
    MID = "mid"
    PREMIUM = "premium"
    LUXURY = "luxury"


class PartnerContact(BaseModel):
    """Contact information for a partner"""
    name: str
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool = False


class ServiceArea(BaseModel):
    """Service area definition"""
    country: str
    state_province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    postal_codes: Optional[List[str]] = None
    notes: Optional[str] = None


class PartnerCreate(BaseModel):
    """Create a new partner"""
    # Basic Identity
    partner_name: str
    legal_name: Optional[str] = None
    display_name: Optional[str] = None
    logo_url: Optional[str] = None  # Logo for promotions
    partner_type: str = "vendor"
    status: str = "potential"
    is_preferred: bool = False
    preferred_tier: Optional[str] = None
    industry_fit: Optional[str] = None
    
    # Category & Capability
    primary_category: Optional[str] = None
    capabilities: Optional[List[str]] = []
    product_or_service_types: Optional[List[str]] = []
    tags: Optional[List[str]] = []
    
    # Location & Coverage
    hq_country: Optional[str] = None
    hq_state_province: Optional[str] = None
    hq_city: Optional[str] = None
    hq_district_municipality: Optional[str] = None
    postal_code: Optional[str] = None
    full_address: Optional[str] = None
    service_area_type: Optional[str] = None
    service_areas: Optional[List[dict]] = []
    coverage_notes: Optional[str] = None
    
    # Primary Contact
    primary_contact_name: Optional[str] = None
    primary_contact_role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    linkedin: Optional[str] = None
    
    # Secondary Contact
    secondary_contact_name: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    secondary_contact_phone: Optional[str] = None
    
    # Commercial / Ops
    minimum_spend: Optional[float] = None
    pricing_level: Optional[str] = None
    lead_time: Optional[str] = None
    payment_terms: Optional[str] = None
    availability_notes: Optional[str] = None
    capacity_notes: Optional[str] = None
    response_time: Optional[str] = None
    contract_required: bool = False
    insurance_required: bool = False
    documents_on_file: bool = False
    
    # Quality / Performance (usually set via UI interactions)
    reliability_score: Optional[float] = None
    quality_score: Optional[float] = None
    communication_score: Optional[float] = None
    issues_flag: bool = False
    issue_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    
    # Finance / System Links
    default_cost_center_id: Optional[str] = None
    default_expense_category: Optional[str] = None
    tax_id: Optional[str] = None
    currency: str = "DOP"
    compliance_docs_on_file: bool = False
    linked_contract_id: Optional[str] = None
    linked_culinary_supplier_id: Optional[str] = None
    
    # Attachments (managed separately via upload endpoint)
    attachments: Optional[List[dict]] = []


class PartnerUpdate(BaseModel):
    """Update partner fields"""
    partner_name: Optional[str] = None
    legal_name: Optional[str] = None
    display_name: Optional[str] = None
    logo_url: Optional[str] = None  # Logo for promotions
    partner_type: Optional[str] = None
    status: Optional[str] = None
    is_preferred: Optional[bool] = None
    preferred_tier: Optional[str] = None
    industry_fit: Optional[str] = None
    
    primary_category: Optional[str] = None
    capabilities: Optional[List[str]] = None
    product_or_service_types: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    
    hq_country: Optional[str] = None
    hq_state_province: Optional[str] = None
    hq_city: Optional[str] = None
    hq_district_municipality: Optional[str] = None
    postal_code: Optional[str] = None
    full_address: Optional[str] = None
    service_area_type: Optional[str] = None
    service_areas: Optional[List[dict]] = None
    coverage_notes: Optional[str] = None
    
    primary_contact_name: Optional[str] = None
    primary_contact_role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    linkedin: Optional[str] = None
    
    secondary_contact_name: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    secondary_contact_phone: Optional[str] = None
    
    minimum_spend: Optional[float] = None
    pricing_level: Optional[str] = None
    lead_time: Optional[str] = None
    payment_terms: Optional[str] = None
    availability_notes: Optional[str] = None
    capacity_notes: Optional[str] = None
    response_time: Optional[str] = None
    contract_required: Optional[bool] = None
    insurance_required: Optional[bool] = None
    documents_on_file: Optional[bool] = None
    
    reliability_score: Optional[float] = None
    quality_score: Optional[float] = None
    communication_score: Optional[float] = None
    issues_flag: Optional[bool] = None
    issue_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    
    default_cost_center_id: Optional[str] = None
    default_expense_category: Optional[str] = None
    tax_id: Optional[str] = None
    currency: Optional[str] = None
    compliance_docs_on_file: Optional[bool] = None
    linked_contract_id: Optional[str] = None
    linked_culinary_supplier_id: Optional[str] = None


class Partner(PartnerCreate):
    """Full partner model with system fields"""
    partner_id: str
    company_id: str
    
    # Usage tracking (updated by system)
    last_used_date: Optional[str] = None
    total_projects_used: int = 0
    last_project_name: Optional[str] = None
    
    # Audit fields
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


# Constants for UI dropdowns
PARTNER_STATUS_OPTIONS = [
    {"value": "preferred", "label": "Preferred", "label_es": "Preferido", "color": "green"},
    {"value": "approved", "label": "Approved", "label_es": "Aprobado", "color": "blue"},
    {"value": "under_review", "label": "Under Review", "label_es": "En Revisión", "color": "yellow"},
    {"value": "potential", "label": "Potential", "label_es": "Potencial", "color": "gray"},
    {"value": "do_not_use", "label": "Do Not Use", "label_es": "No Usar", "color": "red"},
    {"value": "inactive", "label": "Inactive", "label_es": "Inactivo", "color": "gray"},
]

PREFERRED_TIER_OPTIONS = [
    {"value": "A", "label": "Tier A", "label_es": "Nivel A"},
    {"value": "B", "label": "Tier B", "label_es": "Nivel B"},
    {"value": "Trial", "label": "Trial", "label_es": "Prueba"},
]

PARTNER_TYPE_OPTIONS = [
    {"value": "vendor", "label": "Vendor", "label_es": "Proveedor"},
    {"value": "supplier", "label": "Supplier", "label_es": "Suplidor"},
    {"value": "freelancer", "label": "Freelancer", "label_es": "Freelancer"},
    {"value": "agency", "label": "Agency", "label_es": "Agencia"},
    {"value": "association", "label": "Association", "label_es": "Asociación"},
    {"value": "venue_partner", "label": "Venue Partner", "label_es": "Socio de Venue"},
    {"value": "staffing_partner", "label": "Staffing Partner", "label_es": "Socio de Personal"},
    {"value": "logistics_partner", "label": "Logistics Partner", "label_es": "Socio Logístico"},
    {"value": "service_provider", "label": "Service Provider", "label_es": "Proveedor de Servicios"},
]

PRIMARY_CATEGORY_OPTIONS = [
    {"value": "food_supplier", "label": "Food Supplier", "label_es": "Suplidor de Alimentos"},
    {"value": "rentals", "label": "Rentals", "label_es": "Alquileres"},
    {"value": "florals", "label": "Florals", "label_es": "Florales"},
    {"value": "av", "label": "AV", "label_es": "Audiovisual"},
    {"value": "lighting", "label": "Lighting", "label_es": "Iluminación"},
    {"value": "fabrication", "label": "Fabrication", "label_es": "Fabricación"},
    {"value": "printing", "label": "Printing", "label_es": "Impresión"},
    {"value": "staffing", "label": "Staffing", "label_es": "Personal"},
    {"value": "transportation", "label": "Transportation", "label_es": "Transporte"},
    {"value": "security", "label": "Security", "label_es": "Seguridad"},
    {"value": "photo_video", "label": "Photo/Video", "label_es": "Foto/Video"},
    {"value": "logistics", "label": "Logistics", "label_es": "Logística"},
    {"value": "venue_services", "label": "Venue Services", "label_es": "Servicios de Venue"},
    {"value": "cleaning", "label": "Cleaning", "label_es": "Limpieza"},
    {"value": "decor", "label": "Decor", "label_es": "Decoración"},
    {"value": "other", "label": "Other", "label_es": "Otro"},
]

SERVICE_AREA_TYPE_OPTIONS = [
    {"value": "local", "label": "Local", "label_es": "Local"},
    {"value": "regional", "label": "Regional", "label_es": "Regional"},
    {"value": "national", "label": "National", "label_es": "Nacional"},
    {"value": "international", "label": "International", "label_es": "Internacional"},
]

PRICING_LEVEL_OPTIONS = [
    {"value": "budget", "label": "Budget", "label_es": "Económico"},
    {"value": "mid", "label": "Mid", "label_es": "Medio"},
    {"value": "premium", "label": "Premium", "label_es": "Premium"},
    {"value": "luxury", "label": "Luxury", "label_es": "Lujo"},
]

CAPABILITY_OPTIONS = [
    {"value": "catering", "label": "Catering", "label_es": "Catering"},
    {"value": "event_design", "label": "Event Design", "label_es": "Diseño de Eventos"},
    {"value": "floral_design", "label": "Floral Design", "label_es": "Diseño Floral"},
    {"value": "lighting_design", "label": "Lighting Design", "label_es": "Diseño de Iluminación"},
    {"value": "sound_engineering", "label": "Sound Engineering", "label_es": "Ingeniería de Sonido"},
    {"value": "video_production", "label": "Video Production", "label_es": "Producción de Video"},
    {"value": "photography", "label": "Photography", "label_es": "Fotografía"},
    {"value": "furniture_rental", "label": "Furniture Rental", "label_es": "Alquiler de Mobiliario"},
    {"value": "tent_structures", "label": "Tent & Structures", "label_es": "Carpas y Estructuras"},
    {"value": "stage_design", "label": "Stage Design", "label_es": "Diseño de Escenario"},
    {"value": "signage", "label": "Signage", "label_es": "Señalización"},
    {"value": "custom_fabrication", "label": "Custom Fabrication", "label_es": "Fabricación a Medida"},
    {"value": "valet_parking", "label": "Valet Parking", "label_es": "Valet Parking"},
    {"value": "security_services", "label": "Security Services", "label_es": "Servicios de Seguridad"},
    {"value": "event_staffing", "label": "Event Staffing", "label_es": "Personal de Eventos"},
    {"value": "bartending", "label": "Bartending", "label_es": "Bartending"},
    {"value": "transportation", "label": "Transportation", "label_es": "Transporte"},
    {"value": "entertainment", "label": "Entertainment", "label_es": "Entretenimiento"},
    {"value": "dj_services", "label": "DJ Services", "label_es": "Servicios de DJ"},
    {"value": "live_music", "label": "Live Music", "label_es": "Música en Vivo"},
]
