# models/organization_config.py - Organization Configuration Models
from pydantic import BaseModel
from typing import Optional, Dict, List
from enum import Enum


class IndustryTemplate(str, Enum):
    """Pre-defined industry templates"""
    EVENTS_HOSPITALITY = "events_hospitality"  # Catering, weddings, corporate events
    PROFESSIONAL_SERVICES = "professional_services"  # Consulting, agencies, legal
    HEALTHCARE = "healthcare"  # Medical practices, clinics
    REAL_ESTATE = "real_estate"  # Property sales, rentals
    EDUCATION = "education"  # Schools, training centers
    FITNESS = "fitness"  # Gyms, wellness centers
    CONSULTING = "consulting"  # Business consulting
    GENERIC = "generic"  # Any service-based business


class DocumentTypeConfig(BaseModel):
    """Configuration for a document type"""
    key: str  # Internal key (e.g., "quote", "contract", "kitchen_sheet")
    name_en: str
    name_es: str
    category: str  # "client_facing" or "internal"
    requires_signature: bool = False
    description_en: Optional[str] = None
    description_es: Optional[str] = None


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
    
    # Document types enabled for this org (by category)
    enabled_document_types: List[str] = []  # List of document type keys
    
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
    enabled_document_types: List[str] = []


class OrganizationConfigUpdate(BaseModel):
    """Update organization config"""
    industry_template: Optional[IndustryTemplate] = None
    enabled_engagement_types: Optional[List[str]] = None
    default_engagement_type: Optional[str] = None
    terminology: Optional[Dict[str, Dict[str, str]]] = None
    pipeline_stages: Optional[List[Dict[str, str]]] = None
    event_types: Optional[List[Dict[str, str]]] = None
    client_types: Optional[List[Dict[str, str]]] = None
    enabled_document_types: Optional[List[str]] = None


# ============== DOCUMENT TYPE DEFINITIONS ==============
# Client-facing documents (standard across industries)
CLIENT_FACING_DOCUMENTS = [
    {
        "key": "quote",
        "name_en": "Proposal",
        "name_es": "Propuesta",
        "category": "client_facing",
        "requires_signature": True,
        "description_en": "Commercial proposal for the client",
        "description_es": "Propuesta comercial para el cliente"
    },
    {
        "key": "contract",
        "name_en": "Contract",
        "name_es": "Contrato",
        "category": "client_facing",
        "requires_signature": True,
        "description_en": "Legal service agreement",
        "description_es": "Contrato legal de servicios"
    },
    {
        "key": "invoice",
        "name_en": "Invoice",
        "name_es": "Factura",
        "category": "client_facing",
        "requires_signature": False,
        "description_en": "Payment invoice",
        "description_es": "Factura de pago"
    },
]

# Industry-specific internal documents
INTERNAL_DOCUMENTS_BY_INDUSTRY = {
    IndustryTemplate.EVENTS_HOSPITALITY: [
        {
            "key": "beo",
            "name_en": "Banquet Event Order (BEO)",
            "name_es": "Orden de Evento (BEO)",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Detailed event specifications for operations team",
            "description_es": "Especificaciones detalladas del evento para el equipo de operaciones"
        },
        {
            "key": "kitchen_sheet",
            "name_en": "Kitchen Production Sheet",
            "name_es": "Hoja de Producción de Cocina",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Production guide for kitchen staff",
            "description_es": "Guía de producción para el personal de cocina"
        },
        {
            "key": "menu",
            "name_en": "Menu",
            "name_es": "Menú",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Event menu for display or printing",
            "description_es": "Menú del evento para mostrar o imprimir"
        },
        {
            "key": "mise_en_place",
            "name_en": "Mise en Place Checklist",
            "name_es": "Checklist Mise en Place",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Preparation checklist for kitchen",
            "description_es": "Checklist de preparación para cocina"
        },
        {
            "key": "packing_list",
            "name_en": "Packing/Setup List",
            "name_es": "Lista de Empaque/Montaje",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Equipment and supplies packing list",
            "description_es": "Lista de empaque de equipo y suministros"
        },
        {
            "key": "timeline",
            "name_en": "Event Timeline",
            "name_es": "Timeline del Evento",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Detailed schedule of event activities",
            "description_es": "Cronograma detallado de actividades del evento"
        },
    ],
    IndustryTemplate.PROFESSIONAL_SERVICES: [
        {
            "key": "sow",
            "name_en": "Statement of Work (SOW)",
            "name_es": "Alcance de Trabajo (SOW)",
            "category": "internal",
            "requires_signature": True,
            "description_en": "Detailed scope and deliverables",
            "description_es": "Alcance detallado y entregables"
        },
        {
            "key": "project_brief",
            "name_en": "Project Brief",
            "name_es": "Brief del Proyecto",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Project overview and objectives",
            "description_es": "Resumen y objetivos del proyecto"
        },
        {
            "key": "progress_report",
            "name_en": "Progress Report",
            "name_es": "Reporte de Avance",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Project status and milestone updates",
            "description_es": "Estado del proyecto y avance de hitos"
        },
        {
            "key": "deliverables_checklist",
            "name_en": "Deliverables Checklist",
            "name_es": "Checklist de Entregables",
            "category": "internal",
            "requires_signature": False,
            "description_en": "List of project deliverables and status",
            "description_es": "Lista de entregables del proyecto y estado"
        },
        {
            "key": "meeting_notes",
            "name_en": "Meeting Notes",
            "name_es": "Notas de Reunión",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Client meeting summary and action items",
            "description_es": "Resumen de reunión con cliente y acciones"
        },
        {
            "key": "monthly_report",
            "name_en": "Monthly Report",
            "name_es": "Reporte Mensual",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Monthly activity and metrics report",
            "description_es": "Reporte mensual de actividades y métricas"
        },
    ],
    IndustryTemplate.GENERIC: [
        {
            "key": "service_order",
            "name_en": "Service Order",
            "name_es": "Orden de Servicio",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Internal service work order",
            "description_es": "Orden de trabajo de servicio interno"
        },
        {
            "key": "work_checklist",
            "name_en": "Work Checklist",
            "name_es": "Checklist de Trabajo",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Task completion checklist",
            "description_es": "Checklist de tareas completadas"
        },
        {
            "key": "completion_report",
            "name_en": "Completion Report",
            "name_es": "Reporte de Finalización",
            "category": "internal",
            "requires_signature": False,
            "description_en": "Service completion summary",
            "description_es": "Resumen de finalización del servicio"
        },
    ],
}


def get_document_types_for_industry(industry: IndustryTemplate) -> List[dict]:
    """Get all document types (client-facing + internal) for an industry"""
    internal_docs = INTERNAL_DOCUMENTS_BY_INDUSTRY.get(industry, [])
    return CLIENT_FACING_DOCUMENTS + internal_docs


def get_default_enabled_documents(industry: IndustryTemplate) -> List[str]:
    """Get default enabled document type keys for an industry"""
    docs = get_document_types_for_industry(industry)
    return [d["key"] for d in docs]


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
    IndustryTemplate.HEALTHCARE: {
        "name_en": "Healthcare",
        "name_es": "Salud",
        "description_en": "For clinics, medical practices, and healthcare providers",
        "description_es": "Para clínicas, consultorios médicos y proveedores de salud",
        "enabled_engagement_types": ["service"],
        "default_engagement_type": "service",
        "terminology": {
            "event": {"en": "Appointment", "es": "Cita"},
            "event_date": {"en": "Appointment Date", "es": "Fecha de Cita"},
            "guest_count": {"en": "Patients", "es": "Pacientes"},
            "venue": {"en": "Clinic", "es": "Clínica"},
            "event_type": {"en": "Service Type", "es": "Tipo de Servicio"},
            "client": {"en": "Patient", "es": "Paciente"},
            "proposal": {"en": "Treatment Plan", "es": "Plan de Tratamiento"},
        },
        "event_types": [
            {"key": "consultation", "en": "Consultation", "es": "Consulta"},
            {"key": "treatment", "en": "Treatment", "es": "Tratamiento"},
            {"key": "followup", "en": "Follow-up", "es": "Seguimiento"},
            {"key": "checkup", "en": "Check-up", "es": "Chequeo"},
            {"key": "procedure", "en": "Procedure", "es": "Procedimiento"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "new_patient", "en": "New Patient", "es": "Paciente Nuevo"},
            {"key": "scheduled", "en": "Scheduled", "es": "Programado"},
            {"key": "in_treatment", "en": "In Treatment", "es": "En Tratamiento"},
            {"key": "completed", "en": "Completed", "es": "Completado"},
            {"key": "follow_up", "en": "Follow-up Required", "es": "Requiere Seguimiento"},
        ],
        "client_types": [
            {"key": "individual", "en": "Individual Patient", "es": "Paciente Individual"},
            {"key": "family", "en": "Family", "es": "Familia"},
            {"key": "corporate", "en": "Corporate", "es": "Corporativo"},
        ],
    },
    IndustryTemplate.REAL_ESTATE: {
        "name_en": "Real Estate",
        "name_es": "Bienes Raíces",
        "description_en": "For real estate agencies, property managers, and brokers",
        "description_es": "Para inmobiliarias, administradores de propiedades y corredores",
        "enabled_engagement_types": ["service"],
        "default_engagement_type": "service",
        "terminology": {
            "event": {"en": "Showing", "es": "Visita"},
            "event_date": {"en": "Showing Date", "es": "Fecha de Visita"},
            "guest_count": {"en": "Viewers", "es": "Visitantes"},
            "venue": {"en": "Property", "es": "Propiedad"},
            "event_type": {"en": "Transaction Type", "es": "Tipo de Transacción"},
            "client": {"en": "Buyer/Seller", "es": "Comprador/Vendedor"},
            "proposal": {"en": "Property Listing", "es": "Listado de Propiedad"},
        },
        "event_types": [
            {"key": "sale", "en": "Sale", "es": "Venta"},
            {"key": "rental", "en": "Rental", "es": "Alquiler"},
            {"key": "lease", "en": "Lease", "es": "Arrendamiento"},
            {"key": "appraisal", "en": "Appraisal", "es": "Avalúo"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "prospect", "en": "Prospect", "es": "Prospecto"},
            {"key": "showing", "en": "Showing", "es": "En Visita"},
            {"key": "offer", "en": "Offer Made", "es": "Oferta Realizada"},
            {"key": "negotiation", "en": "Negotiation", "es": "Negociación"},
            {"key": "closing", "en": "Closing", "es": "Cierre"},
            {"key": "closed", "en": "Closed", "es": "Cerrado"},
        ],
        "client_types": [
            {"key": "buyer", "en": "Buyer", "es": "Comprador"},
            {"key": "seller", "en": "Seller", "es": "Vendedor"},
            {"key": "investor", "en": "Investor", "es": "Inversionista"},
            {"key": "tenant", "en": "Tenant", "es": "Inquilino"},
        ],
    },
    IndustryTemplate.EDUCATION: {
        "name_en": "Education & Training",
        "name_es": "Educación y Capacitación",
        "description_en": "For schools, training centers, and educational institutions",
        "description_es": "Para escuelas, centros de capacitación e instituciones educativas",
        "enabled_engagement_types": ["service"],
        "default_engagement_type": "service",
        "terminology": {
            "event": {"en": "Course", "es": "Curso"},
            "event_date": {"en": "Start Date", "es": "Fecha de Inicio"},
            "guest_count": {"en": "Students", "es": "Estudiantes"},
            "venue": {"en": "Campus", "es": "Campus"},
            "event_type": {"en": "Program Type", "es": "Tipo de Programa"},
            "client": {"en": "Student", "es": "Estudiante"},
            "proposal": {"en": "Enrollment", "es": "Inscripción"},
        },
        "event_types": [
            {"key": "course", "en": "Course", "es": "Curso"},
            {"key": "workshop", "en": "Workshop", "es": "Taller"},
            {"key": "certification", "en": "Certification", "es": "Certificación"},
            {"key": "degree", "en": "Degree Program", "es": "Programa de Grado"},
            {"key": "tutoring", "en": "Tutoring", "es": "Tutoría"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "inquiry", "en": "Inquiry", "es": "Consulta"},
            {"key": "application", "en": "Application", "es": "Solicitud"},
            {"key": "enrolled", "en": "Enrolled", "es": "Inscrito"},
            {"key": "in_progress", "en": "In Progress", "es": "En Curso"},
            {"key": "graduated", "en": "Graduated", "es": "Graduado"},
            {"key": "dropped", "en": "Dropped", "es": "Abandonado"},
        ],
        "client_types": [
            {"key": "individual", "en": "Individual Student", "es": "Estudiante Individual"},
            {"key": "corporate", "en": "Corporate Training", "es": "Capacitación Corporativa"},
            {"key": "group", "en": "Group", "es": "Grupo"},
        ],
    },
    IndustryTemplate.FITNESS: {
        "name_en": "Fitness & Wellness",
        "name_es": "Fitness y Bienestar",
        "description_en": "For gyms, wellness centers, and personal trainers",
        "description_es": "Para gimnasios, centros de bienestar y entrenadores personales",
        "enabled_engagement_types": ["service"],
        "default_engagement_type": "service",
        "terminology": {
            "event": {"en": "Session", "es": "Sesión"},
            "event_date": {"en": "Session Date", "es": "Fecha de Sesión"},
            "guest_count": {"en": "Participants", "es": "Participantes"},
            "venue": {"en": "Facility", "es": "Instalación"},
            "event_type": {"en": "Program Type", "es": "Tipo de Programa"},
            "client": {"en": "Member", "es": "Miembro"},
            "proposal": {"en": "Membership", "es": "Membresía"},
        },
        "event_types": [
            {"key": "personal_training", "en": "Personal Training", "es": "Entrenamiento Personal"},
            {"key": "group_class", "en": "Group Class", "es": "Clase Grupal"},
            {"key": "assessment", "en": "Fitness Assessment", "es": "Evaluación Física"},
            {"key": "nutrition", "en": "Nutrition Consultation", "es": "Consulta Nutricional"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "trial", "en": "Trial", "es": "Prueba"},
            {"key": "prospect", "en": "Prospect", "es": "Prospecto"},
            {"key": "active", "en": "Active Member", "es": "Miembro Activo"},
            {"key": "renewal", "en": "Renewal Due", "es": "Renovación Pendiente"},
            {"key": "inactive", "en": "Inactive", "es": "Inactivo"},
        ],
        "client_types": [
            {"key": "individual", "en": "Individual", "es": "Individual"},
            {"key": "couple", "en": "Couple", "es": "Pareja"},
            {"key": "family", "en": "Family", "es": "Familia"},
            {"key": "corporate", "en": "Corporate", "es": "Corporativo"},
        ],
    },
    IndustryTemplate.CONSULTING: {
        "name_en": "Consulting",
        "name_es": "Consultoría",
        "description_en": "For consulting firms and business advisors",
        "description_es": "Para firmas de consultoría y asesores de negocios",
        "enabled_engagement_types": ["project", "service"],
        "default_engagement_type": "project",
        "terminology": {
            "event": {"en": "Engagement", "es": "Consultoría"},
            "event_date": {"en": "Start Date", "es": "Fecha de Inicio"},
            "guest_count": {"en": "Stakeholders", "es": "Stakeholders"},
            "venue": {"en": "Site", "es": "Sitio"},
            "event_type": {"en": "Engagement Type", "es": "Tipo de Consultoría"},
            "client": {"en": "Client", "es": "Cliente"},
            "proposal": {"en": "Statement of Work", "es": "Propuesta de Trabajo"},
        },
        "event_types": [
            {"key": "strategy", "en": "Strategy", "es": "Estrategia"},
            {"key": "operations", "en": "Operations", "es": "Operaciones"},
            {"key": "technology", "en": "Technology", "es": "Tecnología"},
            {"key": "finance", "en": "Finance", "es": "Finanzas"},
            {"key": "hr", "en": "Human Resources", "es": "Recursos Humanos"},
            {"key": "other", "en": "Other", "es": "Otro"},
        ],
        "pipeline_stages": [
            {"key": "opportunity", "en": "Opportunity", "es": "Oportunidad"},
            {"key": "discovery", "en": "Discovery", "es": "Descubrimiento"},
            {"key": "proposal", "en": "Proposal", "es": "Propuesta"},
            {"key": "negotiation", "en": "Negotiation", "es": "Negociación"},
            {"key": "active", "en": "Active Engagement", "es": "Consultoría Activa"},
            {"key": "completed", "en": "Completed", "es": "Completado"},
        ],
        "client_types": [
            {"key": "enterprise", "en": "Enterprise", "es": "Empresa Grande"},
            {"key": "midmarket", "en": "Mid-Market", "es": "Mediana Empresa"},
            {"key": "startup", "en": "Startup", "es": "Startup"},
            {"key": "nonprofit", "en": "Non-Profit", "es": "Sin Fines de Lucro"},
        ],
    },
}
