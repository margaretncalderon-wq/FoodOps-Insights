# constants/crm_statuses.py - Single source of truth for CRM statuses

# Lead statuses (use EXACT strings everywhere)
LEAD_STATUSES = ["Nuevo", "Contactado", "Sin Respuesta", "Interesado"]

# Statuses that count as "worked" (lead has been actioned)
WORKED_STATUSES = ["Contactado", "Sin Respuesta", "Interesado"]

# Status after conversion
STATUS_CONVERTED = "Converted"

# Status mapping from legacy English values to Spanish
STATUS_MAPPING = {
    "New": "Nuevo",
    "Contacted": "Contactado", 
    "NoResponse": "Sin Respuesta",
    "Engaged": "Interesado",
    "Interested": "Interesado",
    # Spanish values map to themselves
    "Nuevo": "Nuevo",
    "Contactado": "Contactado",
    "Sin Respuesta": "Sin Respuesta",
    "Interesado": "Interesado"
}

def normalize_status(status: str) -> str:
    """Normalize a status to the canonical Spanish form"""
    if not status:
        return "Nuevo"
    return STATUS_MAPPING.get(status, status)

def is_valid_status(status: str) -> bool:
    """Check if status is valid (including converted)"""
    return status in LEAD_STATUSES or status == STATUS_CONVERTED
