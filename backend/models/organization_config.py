# models/organization_config.py - Organization Configuration Models
from pydantic import BaseModel
from typing import Optional, Dict, List
from enum import Enum


class IndustryTemplate(str, Enum):
    """Pre-defined industry templates"""
    EVENTS_HOSPITALITY = "events_hospitality"  # Catering, weddings, corporate events
    PROFESSIONAL_SERVICES = "professional_services"  # Consulting, agencies, legal
    GENERIC = "generic"  # Any service-based business


class OrganizationConfig(BaseModel):
    """
    Configuration for an organization that controls terminology,
    enabled engagement types, and UI customization.
    """
    config_id: str
    company_id: str
    
    # Industry template (provides defaults)
    industry_template: IndustryTemplate = IndustryTemplate.EVENTS_HOSPITALITY
    
    # Which engagement types are enabled for this org
    enabled_engagement_types: List[str] = ["event", "project", "service"]
    
    # Default engagement type when creating new engagements
    default_engagement_type: str = "event"
    
    # Terminology customization
    # Key is the system term, value is the custom display name
    terminology: Dict[str, Dict[str, str]] = {}
    # Example: {"event": {"en": "Project", "es": "Proyecto"}, "guest_count": {"en": "Team Size", "es": "Tamaño del Equipo"}}
    
    # Pipeline stages (customizable per org)
    pipeline_stages: List[Dict[str, str]] = []
    # Example: [{"key": "inquiry", "en": "Inquiry", "es": "Consulta"}, ...]
    
    # Event types (customizable per org)  
    event_types: List[Dict[str, str]] = []
    # Example: [{"key": "wedding", "en": "Wedding", "es": "Boda"}, ...]
    
    # Client types (customizable per org)
    client_types: List[Dict[str, str]] = []
    # Example: [{"key": "individual", "en": "Individual", "es": "Individual"}, ...]
    
    created_at: str
    updated_at: str


class OrganizationConfigCreate(BaseModel):
    """Create organization config"""
    industry_template: IndustryTemplate = IndustryTemplate.EVENTS_HOSPITALITY
    enabled_engagement_types: List[str] = ["event", "project", "service"]
    default_engagement_type: str = "event"
    terminology: Dict[str, Dict[str, str]] = {}
    pipeline_stages: List[Dict[str, str]] = []
    event_types: List[Dict[str, str]] = []
    client_types: List[Dict[str, str]] = []


class OrganizationConfigUpdate(BaseModel):
    """Update organization config"""
    industry_template: Optional[IndustryTemplate] = None
    enabled_engagement_types: Optional[List[str]] = None
    default_engagement_type: Optional[str] = None
    terminology: Optional[Dict[str, Dict[str, str]]] = None
    pipeline_stages: Optional[List[Dict[str, str]]] = None
    event_types: Optional[List[Dict[str, str]]] = None
    client_types: Optional[List[Dict[str, str]]] = None


# ============== INDUSTRY TEMPLATE DEFAULTS ==============

INDUSTRY_TEMPLATES = {
    IndustryTemplate.EVENTS_HOSPITALITY: {
        "name_en": "Events & Hospitality",
        "name_es": "Eventos y Hospitalidad",
        "description_en": "For catering companies, wedding planners, and event venues",
        "description_es": "Para empresas de catering, wedding planners y venues de eventos",
        "enabled_engagement_types": ["event"],
        "default_engagement_type": "event",
        "terminology": {
            # Keep original terms
        },
        "event_types": [
            {"key": "wedding", "en": "Wedding", "es": "Boda"},
            {"key": "corporate", "en": "Corporate Event", "es": "Evento Corporativo"},
            {"key": "social", "en": "Social Event", "es": "Evento Social"},
            {"key": "birthday", "en": "Birthday", "es": "Cumpleaños"},
            {"key": "gala", "en": "Gala", "es": "Gala"},
            {"key": "conference", "en": "Conference", "es": "Conferencia"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "inquiry_received", "en": "Inquiry Received", "es": "Consulta Recibida"},
            {"key": "context_captured", "en": "Context Captured", "es": "Contexto Capturado"},
            {"key": "scope_drafted", "en": "Scope Drafted", "es": "Alcance Definido"},
            {"key": "definition_review", "en": "Definition In Review", "es": "Definición en Revisión"},
            {"key": "committed", "en": "Committed", "es": "Confirmado"},
            {"key": "archived", "en": "Archived", "es": "Archivado"},
        ],
        "client_types": [
            {"key": "individual", "en": "Individual", "es": "Individual"},
            {"key": "corporate", "en": "Corporate", "es": "Corporativo"},
            {"key": "wedding", "en": "Wedding Couple", "es": "Pareja de Novios"},
        ],
    },
    IndustryTemplate.PROFESSIONAL_SERVICES: {
        "name_en": "Professional Services",
        "name_es": "Servicios Profesionales",
        "description_en": "For consulting firms, agencies, and professional service providers",
        "description_es": "Para consultoras, agencias y proveedores de servicios profesionales",
        "enabled_engagement_types": ["project", "service"],
        "default_engagement_type": "project",
        "terminology": {
            "event": {"en": "Project", "es": "Proyecto"},
            "event_date": {"en": "Start Date", "es": "Fecha de Inicio"},
            "guest_count": {"en": "Team Size", "es": "Tamaño del Equipo"},
            "venue": {"en": "Location", "es": "Ubicación"},
            "event_type": {"en": "Project Type", "es": "Tipo de Proyecto"},
        },
        "event_types": [
            {"key": "consulting", "en": "Consulting", "es": "Consultoría"},
            {"key": "strategy", "en": "Strategy", "es": "Estrategia"},
            {"key": "implementation", "en": "Implementation", "es": "Implementación"},
            {"key": "audit", "en": "Audit", "es": "Auditoría"},
            {"key": "training", "en": "Training", "es": "Capacitación"},
            {"key": "retainer", "en": "Retainer", "es": "Retainer"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "lead", "en": "Lead", "es": "Lead"},
            {"key": "discovery", "en": "Discovery", "es": "Descubrimiento"},
            {"key": "proposal", "en": "Proposal Sent", "es": "Propuesta Enviada"},
            {"key": "negotiation", "en": "Negotiation", "es": "Negociación"},
            {"key": "won", "en": "Won", "es": "Ganado"},
            {"key": "lost", "en": "Lost", "es": "Perdido"},
        ],
        "client_types": [
            {"key": "corporate", "en": "Corporate", "es": "Corporativo"},
            {"key": "startup", "en": "Startup", "es": "Startup"},
            {"key": "government", "en": "Government", "es": "Gobierno"},
            {"key": "nonprofit", "en": "Non-Profit", "es": "Sin Fines de Lucro"},
        ],
    },
    IndustryTemplate.GENERIC: {
        "name_en": "Generic Services",
        "name_es": "Servicios Generales",
        "description_en": "For general service-based businesses",
        "description_es": "Para negocios de servicios en general",
        "enabled_engagement_types": ["service"],
        "default_engagement_type": "service",
        "terminology": {
            "event": {"en": "Service", "es": "Servicio"},
            "event_date": {"en": "Service Date", "es": "Fecha del Servicio"},
            "guest_count": {"en": "Quantity", "es": "Cantidad"},
            "venue": {"en": "Service Location", "es": "Ubicación del Servicio"},
            "event_type": {"en": "Service Type", "es": "Tipo de Servicio"},
        },
        "event_types": [
            {"key": "one_time", "en": "One-Time Service", "es": "Servicio Único"},
            {"key": "recurring", "en": "Recurring Service", "es": "Servicio Recurrente"},
            {"key": "subscription", "en": "Subscription", "es": "Suscripción"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "new", "en": "New", "es": "Nuevo"},
            {"key": "quoted", "en": "Quoted", "es": "Cotizado"},
            {"key": "accepted", "en": "Accepted", "es": "Aceptado"},
            {"key": "in_progress", "en": "In Progress", "es": "En Progreso"},
            {"key": "completed", "en": "Completed", "es": "Completado"},
            {"key": "cancelled", "en": "Cancelled", "es": "Cancelado"},
        ],
        "client_types": [
            {"key": "individual", "en": "Individual", "es": "Individual"},
            {"key": "business", "en": "Business", "es": "Empresa"},
        ],
    },
}
