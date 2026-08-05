# config/industry_config.py - Industry Configuration Mapping
"""
This module defines the industry-specific configurations for the multi-industry platform.
Each industry has its own:
- Module names and labels
- Enabled/disabled modules
- Field labels and terminology
- Default settings
"""

from typing import Dict, List, Optional
from enum import Enum


class IndustryType(str, Enum):
    """Supported industry types"""
    EVENTS = "events"  # Catering, weddings, corporate events
    AGENCY = "agency"  # Marketing agencies, design studios, PR firms
    CONSULTING = "consulting"  # Business consulting, legal, accounting
    GENERIC = "generic"  # General service businesses


# ============== INDUSTRY CONFIGURATION MAP ==============
INDUSTRY_CONFIG = {
    IndustryType.EVENTS: {
        "name_en": "Events & Hospitality",
        "name_es": "Eventos y Hospitalidad",
        "description_en": "For catering companies, event planners, and hospitality businesses",
        "description_es": "Para empresas de catering, organizadores de eventos y negocios de hospitalidad",
        
        # Program Orchestration configuration
        "program_orchestration": {
            "name_en": "Event Orchestration",
            "name_es": "Event Orchestration",
            "icon": "calendar-check",
            "description_en": "Plan and execute events from start to finish",
            "description_es": "Planifica y ejecuta eventos de principio a fin",
            
            # Entity terminology
            "entity_singular_en": "Event",
            "entity_singular_es": "Evento",
            "entity_plural_en": "Events",
            "entity_plural_es": "Eventos",
            
            # Field labels
            "fields": {
                "name": {"en": "Event Name", "es": "Nombre del Evento"},
                "date": {"en": "Event Date", "es": "Fecha del Evento"},
                "end_date": {"en": "End Date", "es": "Fecha de Fin"},
                "guest_count": {"en": "Guest Count", "es": "Número de Invitados"},
                "venue": {"en": "Venue", "es": "Venue"},
                "budget": {"en": "Budget", "es": "Presupuesto"},
                "type": {"en": "Event Type", "es": "Tipo de Evento"},
            },
            
            # Event types for this industry
            "types": [
                {"key": "wedding", "en": "Wedding", "es": "Boda"},
                {"key": "corporate", "en": "Corporate Event", "es": "Evento Corporativo"},
                {"key": "social", "en": "Social Event", "es": "Evento Social"},
                {"key": "birthday", "en": "Birthday", "es": "Cumpleaños"},
                {"key": "anniversary", "en": "Anniversary", "es": "Aniversario"},
                {"key": "gala", "en": "Gala", "es": "Gala"},
                {"key": "conference", "en": "Conference", "es": "Conferencia"},
            ],
        },
        
        # Enabled modules for this industry
        "enabled_modules": [
            "module_event_orchestration",
            "module_culinary_intelligence",
            "module_resource_management",
            "module_venues",
            "module_demand_studio",
            "module_people_ops",
        ],
        
        # Module-specific configurations
        "modules": {
            "module_venues": {
                "enabled": True,
                "name_en": "Venues",
                "name_es": "Venues",
                "icon": "building-2",
            },
            "module_culinary_intelligence": {
                "enabled": True,
                "name_en": "Culinary Intelligence",
                "name_es": "Inteligencia Culinaria",
                "icon": "utensils",
            },
            "module_resource_management": {
                "enabled": True,
                "name_en": "Resource Management",
                "name_es": "Gestión de Recursos",
                "icon": "package",
            },
            "module_people_ops": {
                "enabled": True,
                "name_en": "People Ops",
                "name_es": "People Ops",
                "icon": "users",
            },
        },
        
        # Document types available
        "document_types": {
            "client_facing": ["quote", "contract", "invoice"],
            "internal": ["beo", "kitchen_sheet", "menu", "mise_en_place", "packing_list", "timeline"],
        },
        
        # Execution Hub tasks templates
        "execution_tasks": [
            {"title_en": "Confirm venue and vendors", "title_es": "Confirmar venue y proveedores"},
            {"title_en": "Finalize menu and catering details", "title_es": "Finalizar menú y detalles de catering"},
            {"title_en": "Coordinate logistics and setup", "title_es": "Coordinar logística y montaje"},
            {"title_en": "Pre-event team meeting", "title_es": "Reunión de pre-evento con equipo"},
            {"title_en": "Final client confirmation", "title_es": "Confirmación final con cliente"},
            {"title_en": "Event execution", "title_es": "Ejecución del evento"},
        ],
    },
    
    IndustryType.AGENCY: {
        "name_en": "Agency & Creative Services",
        "name_es": "Agencia y Servicios Creativos",
        "description_en": "For marketing agencies, design studios, and creative firms",
        "description_es": "Para agencias de marketing, estudios de diseño y empresas creativas",
        
        # Program Orchestration configuration
        "program_orchestration": {
            "name_en": "Program Orchestration",
            "name_es": "Orquestación de Programas",
            "icon": "folder-kanban",
            "description_en": "Manage client projects and deliverables",
            "description_es": "Gestiona proyectos y entregables de clientes",
            
            # Entity terminology
            "entity_singular_en": "Project",
            "entity_singular_es": "Proyecto",
            "entity_plural_en": "Projects",
            "entity_plural_es": "Proyectos",
            
            # Field labels
            "fields": {
                "name": {"en": "Project Name", "es": "Nombre del Proyecto"},
                "date": {"en": "Start Date", "es": "Fecha de Inicio"},
                "end_date": {"en": "Deadline", "es": "Fecha Límite"},
                "guest_count": {"en": "Team Size", "es": "Tamaño del Equipo"},
                "venue": {"en": "Location", "es": "Ubicación"},
                "budget": {"en": "Budget", "es": "Presupuesto"},
                "type": {"en": "Project Type", "es": "Tipo de Proyecto"},
            },
            
            # Project types for this industry
            "types": [
                {"key": "branding", "en": "Branding Project", "es": "Proyecto de Branding"},
                {"key": "campaign", "en": "Marketing Campaign", "es": "Campaña de Marketing"},
                {"key": "social_media", "en": "Social Media Management", "es": "Gestión de Redes Sociales"},
                {"key": "web_design", "en": "Web Design", "es": "Diseño Web"},
                {"key": "content", "en": "Content Creation", "es": "Creación de Contenido"},
                {"key": "video", "en": "Video Production", "es": "Producción de Video"},
                {"key": "consulting", "en": "Consulting", "es": "Consultoría"},
                {"key": "retainer", "en": "Monthly Retainer", "es": "Retainer Mensual"},
            ],
        },
        
        # Enabled modules for this industry (NO venues, NO culinary, NO resource management for pure service agencies)
        "enabled_modules": [
            "module_program_orchestration",
            "module_demand_studio",
            "module_resource_management",
            "module_people_ops",
        ],
        
        # Module-specific configurations
        "modules": {
            "module_venues": {
                "enabled": False,  # Disabled for agencies
            },
            "module_culinary_intelligence": {
                "enabled": False,  # Disabled for agencies
            },
            "module_resource_management": {
                "enabled": True,
                "name_en": "Resource Management",
                "name_es": "Gestión de Recursos",
                "icon": "boxes",
            },
            "module_people_ops": {
                "enabled": True,
                "name_en": "People Ops",
                "name_es": "People Ops",
                "icon": "users",
            },
        },
        
        # Document types available
        "document_types": {
            "client_facing": ["quote", "contract", "invoice"],
            "internal": ["sow", "project_brief", "progress_report", "deliverables_checklist", "meeting_notes", "monthly_report"],
        },
        
        # Execution Hub tasks templates
        "execution_tasks": [
            {"title_en": "Client kickoff meeting", "title_es": "Reunión de kickoff con cliente"},
            {"title_en": "Define deliverables and timeline", "title_es": "Definir entregables y cronograma"},
            {"title_en": "Initial project setup", "title_es": "Configuración inicial del proyecto"},
            {"title_en": "Weekly progress review", "title_es": "Revisión de avance semanal"},
            {"title_en": "QA and quality control", "title_es": "QA y control de calidad"},
            {"title_en": "Final delivery and closure", "title_es": "Entrega final y cierre"},
        ],
    },
    
    IndustryType.CONSULTING: {
        "name_en": "Professional Services",
        "name_es": "Servicios Profesionales",
        "description_en": "For consulting firms, legal offices, and professional services",
        "description_es": "Para firmas de consultoría, oficinas legales y servicios profesionales",
        
        # Program Orchestration configuration
        "program_orchestration": {
            "name_en": "Program Orchestration",
            "name_es": "Orquestación de Programas",
            "icon": "briefcase",
            "description_en": "Manage client engagements and projects",
            "description_es": "Gestiona compromisos y proyectos de clientes",
            
            # Entity terminology
            "entity_singular_en": "Engagement",
            "entity_singular_es": "Compromiso",
            "entity_plural_en": "Engagements",
            "entity_plural_es": "Compromisos",
            
            # Field labels
            "fields": {
                "name": {"en": "Engagement Name", "es": "Nombre del Compromiso"},
                "date": {"en": "Start Date", "es": "Fecha de Inicio"},
                "end_date": {"en": "End Date", "es": "Fecha de Fin"},
                "guest_count": {"en": "Team Size", "es": "Tamaño del Equipo"},
                "venue": {"en": "Location", "es": "Ubicación"},
                "budget": {"en": "Fee", "es": "Honorarios"},
                "type": {"en": "Engagement Type", "es": "Tipo de Compromiso"},
            },
            
            # Engagement types for this industry
            "types": [
                {"key": "advisory", "en": "Advisory", "es": "Asesoría"},
                {"key": "audit", "en": "Audit", "es": "Auditoría"},
                {"key": "implementation", "en": "Implementation", "es": "Implementación"},
                {"key": "strategy", "en": "Strategy", "es": "Estrategia"},
                {"key": "training", "en": "Training", "es": "Capacitación"},
                {"key": "assessment", "en": "Assessment", "es": "Evaluación"},
            ],
        },
        
        # Enabled modules for this industry (NO Resource Management for pure services)
        "enabled_modules": [
            "module_program_orchestration",
            "module_demand_studio",
            "module_people_ops",
        ],
        
        # Module-specific configurations
        "modules": {
            "module_venues": {
                "enabled": False,
            },
            "module_culinary_intelligence": {
                "enabled": False,
            },
            "module_resource_management": {
                "enabled": False,  # Not relevant for consulting/professional services
                "name_en": "Resource Management",
                "name_es": "Gestión de Recursos",
            },
            "module_people_ops": {
                "enabled": True,
                "name_en": "People Ops",
                "name_es": "People Ops",
                "icon": "users",
            },
        },
        
        # Document types available
        "document_types": {
            "client_facing": ["quote", "contract", "invoice"],
            "internal": ["sow", "project_brief", "progress_report", "meeting_notes"],
        },
        
        # Execution Hub tasks templates
        "execution_tasks": [
            {"title_en": "Initial client assessment", "title_es": "Evaluación inicial del cliente"},
            {"title_en": "Scope definition and agreement", "title_es": "Definición y acuerdo del alcance"},
            {"title_en": "Research and analysis", "title_es": "Investigación y análisis"},
            {"title_en": "Deliverable development", "title_es": "Desarrollo de entregables"},
            {"title_en": "Client review and feedback", "title_es": "Revisión y feedback del cliente"},
            {"title_en": "Final presentation and handoff", "title_es": "Presentación final y entrega"},
        ],
    },
    
    IndustryType.GENERIC: {
        "name_en": "General Services",
        "name_es": "Servicios Generales",
        "description_en": "For general service-based businesses",
        "description_es": "Para negocios de servicios generales",
        
        # Program Orchestration configuration
        "program_orchestration": {
            "name_en": "Program Orchestration",
            "name_es": "Orquestación de Programas",
            "icon": "clipboard-list",
            "description_en": "Manage services and work orders",
            "description_es": "Gestiona servicios y órdenes de trabajo",
            
            # Entity terminology
            "entity_singular_en": "Service",
            "entity_singular_es": "Servicio",
            "entity_plural_en": "Services",
            "entity_plural_es": "Servicios",
            
            # Field labels
            "fields": {
                "name": {"en": "Service Name", "es": "Nombre del Servicio"},
                "date": {"en": "Service Date", "es": "Fecha del Servicio"},
                "end_date": {"en": "End Date", "es": "Fecha de Fin"},
                "guest_count": {"en": "Quantity", "es": "Cantidad"},
                "venue": {"en": "Location", "es": "Ubicación"},
                "budget": {"en": "Price", "es": "Precio"},
                "type": {"en": "Service Type", "es": "Tipo de Servicio"},
            },
            
            # Service types
            "types": [
                {"key": "standard", "en": "Standard Service", "es": "Servicio Estándar"},
                {"key": "premium", "en": "Premium Service", "es": "Servicio Premium"},
                {"key": "custom", "en": "Custom Service", "es": "Servicio Personalizado"},
            ],
        },
        
        # Enabled modules
        "enabled_modules": [
            "module_program_orchestration",
            "module_resource_management",
            "module_demand_studio",
            "module_people_ops",
        ],
        
        # Module-specific configurations
        "modules": {
            "module_venues": {
                "enabled": False,
            },
            "module_culinary_intelligence": {
                "enabled": False,
            },
            "module_resource_management": {
                "enabled": True,
                "name_en": "Resource Management",
                "name_es": "Gestión de Recursos",
                "icon": "package",
            },
            "module_people_ops": {
                "enabled": True,
                "name_en": "People Ops",
                "name_es": "People Ops",
                "icon": "users",
            },
        },
        
        # Document types available
        "document_types": {
            "client_facing": ["quote", "contract", "invoice"],
            "internal": ["service_order", "work_checklist", "completion_report"],
        },
        
        # Execution Hub tasks templates
        "execution_tasks": [
            {"title_en": "Initial planning", "title_es": "Planificación inicial"},
            {"title_en": "Resource preparation", "title_es": "Preparación de recursos"},
            {"title_en": "Service execution", "title_es": "Ejecución del servicio"},
            {"title_en": "Quality control", "title_es": "Control de calidad"},
            {"title_en": "Closure and follow-up", "title_es": "Cierre y seguimiento"},
        ],
    },
}


def get_industry_config(industry_type: str) -> dict:
    """Get the full configuration for an industry"""
    try:
        industry = IndustryType(industry_type)
    except ValueError:
        industry = IndustryType.GENERIC
    
    return INDUSTRY_CONFIG.get(industry, INDUSTRY_CONFIG[IndustryType.GENERIC])


def get_program_orchestration_config(industry_type: str) -> dict:
    """Get the Program Orchestration configuration for an industry"""
    config = get_industry_config(industry_type)
    return config.get("program_orchestration", {})


def get_enabled_modules_for_industry(industry_type: str) -> List[str]:
    """Get list of enabled module keys for an industry"""
    config = get_industry_config(industry_type)
    return config.get("enabled_modules", [])


def get_module_config(industry_type: str, module_key: str) -> Optional[dict]:
    """Get configuration for a specific module in an industry"""
    config = get_industry_config(industry_type)
    modules = config.get("modules", {})
    return modules.get(module_key)


def get_execution_tasks_for_industry(industry_type: str) -> List[dict]:
    """Get default execution tasks for an industry"""
    config = get_industry_config(industry_type)
    return config.get("execution_tasks", [])


def get_document_types_for_industry(industry_type: str) -> dict:
    """Get document types configuration for an industry"""
    config = get_industry_config(industry_type)
    return config.get("document_types", {"client_facing": [], "internal": []})


def get_entity_types_for_industry(industry_type: str) -> List[dict]:
    """Get entity/project types for an industry"""
    config = get_industry_config(industry_type)
    po_config = config.get("program_orchestration", {})
    return po_config.get("types", [])


def get_field_label(industry_type: str, field_key: str, language: str = "en") -> str:
    """Get the label for a field based on industry and language"""
    config = get_industry_config(industry_type)
    po_config = config.get("program_orchestration", {})
    fields = po_config.get("fields", {})
    field = fields.get(field_key, {})
    return field.get(language, field.get("en", field_key))
