# models/crm.py - CRM module models
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class AttributionSource(str, Enum):
    MANUAL = "manual"
    LINK = "link"
    QR = "qr"
    IMPORT = "import"


# ============== COMPANY MODELS ==============

class CompanyCreate(BaseModel):
    """Model for creating a new company (B2B account)"""
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    rnc: Optional[str] = None  # Tax ID
    description: Optional[str] = None
    social_linkedin: Optional[str] = None
    social_instagram: Optional[str] = None
    tags: List[str] = []
    notes: Optional[str] = None
    # Credit/billing
    has_credit: bool = False
    credit_limit: float = 0.0
    payment_terms: str = "immediate"


class Company(BaseModel):
    """Company entity - parent for contacts"""
    company_entity_id: str  # Unique ID for this company record
    organization_id: str  # The org/tenant that owns this record
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    rnc: Optional[str] = None
    description: Optional[str] = None
    social_linkedin: Optional[str] = None
    social_instagram: Optional[str] = None
    tags: List[str] = []
    notes: Optional[str] = None
    # Credit/billing
    has_credit: bool = False
    credit_limit: float = 0.0
    credit_used: float = 0.0
    payment_terms: str = "immediate"
    # Stats
    contacts_count: int = 0
    leads_count: int = 0
    total_revenue: float = 0.0
    events_count: int = 0
    # Status
    status: str = "Active"  # Active, Inactive, Lead, Client
    owner_id: Optional[str] = None
    # Timestamps
    created_at: datetime
    updated_at: datetime


# ============== LEAD MODELS ==============

class LeadCreate(BaseModel):
    lead_name: str
    email: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
    company_entity_id: Optional[str] = None  # Link to Company record
    event_type: str = "other"
    event_date: Optional[str] = None  # Can be "TBD" or a date string
    estimated_guest_count: Optional[int] = None
    budget_range: Optional[str] = None
    message: Optional[str] = None
    source: str = "Website"  # Website, Instagram, QR, Referral, Outreach, Other
    form_name: Optional[str] = None
    # Additional client-compatible fields for easier conversion
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    rnc: Optional[str] = None
    client_type: str = "Individual"  # Individual, Company
    # CRM Enhancement fields (additive)
    lead_type: str = "inbound"  # inbound, outreach
    outreach_status: Optional[str] = None  # New, Contacted, NoResponse, Engaged
    next_follow_up_date: Optional[str] = None
    follow_up_type: Optional[str] = None  # Call, Email, Meeting, CheckIn
    # Campaign Attribution (additive)
    campaign_id: Optional[str] = None  # Linked campaign
    campaign_code: Optional[str] = None  # For auto-linking via tracking code
    attribution_source: Optional[str] = None  # manual, link, qr, import


class Lead(BaseModel):
    lead_id: str
    company_id: str  # Organization/tenant ID
    company_entity_id: Optional[str] = None  # Link to Company record
    lead_name: str
    email: str
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    rnc: Optional[str] = None
    client_type: str = "Individual"  # Individual, Company
    company_name: Optional[str] = None
    event_type: str
    event_date: Optional[str] = None
    estimated_guest_count: Optional[int] = None
    budget_range: Optional[str] = None
    message: Optional[str] = None
    source: str
    form_name: Optional[str] = None
    status: str = "New"  # New, Contacted, Converted, Discarded
    owner_id: Optional[str] = None
    converted_client_id: Optional[str] = None
    converted_event_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # CRM Enhancement fields (additive)
    lead_type: str = "inbound"  # inbound, outreach
    outreach_status: Optional[str] = None  # New, Contacted, NoResponse, Engaged
    next_follow_up_date: Optional[str] = None
    follow_up_type: Optional[str] = None  # Call, Email, Meeting, CheckIn
    last_contact_date: Optional[str] = None


# ============== CONTACT MODELS ==============

class ContactCreate(BaseModel):
    """Contact person - can belong to a Company and/or Client"""
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    role: Optional[str] = None  # Alias for role_title
    role_title: Optional[str] = None
    department: Optional[str] = None
    is_primary: bool = False
    is_billing_contact: bool = False
    is_decision_maker: bool = False
    # Links
    company_entity_id: Optional[str] = None  # Link to Company
    client_id: Optional[str] = None  # Legacy link to Client


class Contact(BaseModel):
    contact_id: str
    organization_id: str  # Tenant/org that owns this
    company_entity_id: Optional[str] = None  # Link to Company
    client_id: Optional[str] = None  # Legacy link to Client
    company_id: Optional[str] = None  # Legacy field (org id)
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    role: Optional[str] = None
    role_title: Optional[str] = None
    department: Optional[str] = None
    is_primary: bool = False
    is_billing_contact: bool = False
    is_decision_maker: bool = False
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# ============== CLIENT MODELS ==============

class ClientCreate(BaseModel):
    client_type: str = "Individual"  # "Company" or "Individual"
    display_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None  # WhatsApp number for direct communication
    address: Optional[str] = None
    rnc: Optional[str] = None  # Tax ID (RNC)
    source: str = "Direct"  # Website, Instagram, QR, Referral, Direct, Other
    tags: List[str] = []
    notes: Optional[str] = None
    status: str = "Active"  # Active, Inactive
    # Credit fields
    has_credit: bool = False
    credit_limit: float = 0.0
    payment_terms: str = "immediate"  # immediate, net_7, net_15, net_30, custom
    # New business profile fields
    website: Optional[str] = None  # Client's website URL
    industry: Optional[str] = None  # Client's industry/sector
    description: Optional[str] = None  # Description of what they do
    social_linkedin: Optional[str] = None  # LinkedIn profile/company page
    social_instagram: Optional[str] = None  # Instagram handle


class Client(BaseModel):
    client_id: str
    company_id: str
    client_type: str = "Individual"
    display_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None  # WhatsApp number
    address: Optional[str] = None
    rnc: Optional[str] = None  # Tax ID (RNC)
    source: str = "Direct"
    tags: List[str] = []
    notes: Optional[str] = None
    status: str = "Active"
    total_revenue: float = 0.0
    events_count: int = 0
    # Credit context fields (Business Clarity)
    has_credit: bool = False
    credit_limit: float = 0.0
    credit_used: float = 0.0  # Amount of credit currently used
    payment_terms: str = "immediate"  # immediate, net_7, net_15, net_30, custom
    # Business profile fields
    website: Optional[str] = None  # Client's website URL
    industry: Optional[str] = None  # Client's industry/sector
    description: Optional[str] = None  # Description of what they do
    social_linkedin: Optional[str] = None  # LinkedIn profile/company page
    social_instagram: Optional[str] = None  # Instagram handle
    created_at: datetime
    updated_at: datetime
    # CRM Enhancement fields (additive)
    owner_id: Optional[str] = None
    next_follow_up_date: Optional[str] = None
    follow_up_type: Optional[str] = None  # Call, Email, Meeting, CheckIn
    last_event_date: Optional[str] = None
    lifetime_value: float = 0.0


# ============== COMMUNICATION LOG MODELS ==============

class CommLogCreate(BaseModel):
    entity_type: Optional[str] = None  # lead, client, or None for general
    entity_id: Optional[str] = None  # lead_id or client_id
    comm_type: str  # call, email, meeting, note, message
    subject: Optional[str] = None
    content: str
    direction: str = "outbound"  # inbound, outbound


class CommLog(BaseModel):
    log_id: str
    company_id: str
    entity_type: str
    entity_id: str
    comm_type: str
    subject: Optional[str] = None
    content: str
    direction: str
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    created_at: datetime


# ============== LEAD FORM MODELS ==============

class LeadFormFieldConfig(BaseModel):
    field_name: str
    enabled: bool = True
    required: bool = False
    label_en: Optional[str] = None  # Custom label in English
    label_es: Optional[str] = None  # Custom label in Spanish


class CustomFieldConfig(BaseModel):
    field_id: str
    field_type: str = "text"  # text, textarea, select, number, date
    label_en: str
    label_es: str
    placeholder_en: Optional[str] = None
    placeholder_es: Optional[str] = None
    required: bool = False
    options: List[str] = []  # For select type


class LeadFormCreate(BaseModel):
    form_name: str
    description: Optional[str] = None
    description_es: Optional[str] = None
    fields: List[LeadFormFieldConfig] = []
    custom_fields: List[CustomFieldConfig] = []
    default_source: str = "Website"
    default_event_type: Optional[str] = None
    assign_owner_id: Optional[str] = None
    is_active: bool = True
    thank_you_message_en: str = "Thank you for your inquiry! We will contact you soon."
    thank_you_message_es: str = "¡Gracias por tu consulta! Te contactaremos pronto."
    # Branding
    banner_url: Optional[str] = None
    show_logo: bool = True
    primary_color: Optional[str] = None  # Override company primary color


class LeadForm(BaseModel):
    form_id: str
    company_id: str
    form_name: str
    description: Optional[str] = None
    description_es: Optional[str] = None
    fields: List[Dict[str, Any]] = []
    custom_fields: List[Dict[str, Any]] = []
    default_source: str = "Website"
    default_event_type: Optional[str] = None
    assign_owner_id: Optional[str] = None
    is_active: bool = True
    thank_you_message_en: str = "Thank you for your inquiry! We will contact you soon."
    thank_you_message_es: str = "¡Gracias por tu consulta! Te contactaremos pronto."
    banner_url: Optional[str] = None
    show_logo: bool = True
    primary_color: Optional[str] = None
    submissions_count: int = 0
    created_at: datetime
    updated_at: datetime
