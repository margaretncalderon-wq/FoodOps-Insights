# routers/organization_config.py - Organization Configuration Router
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
import uuid

from config import db
from dependencies import get_current_user, User
from models.organization_config import (
    OrganizationConfig,
    OrganizationConfigCreate,
    OrganizationConfigUpdate,
    IndustryTemplate,
    INDUSTRY_TEMPLATES,
)
from utils.activity_logger import log_activity, user_info

org_config_router = APIRouter(prefix="/org-config", tags=["Organization Config"])


# ============== GET INDUSTRY TEMPLATES ==============

@org_config_router.get("/templates")
async def get_industry_templates():
    """Get all available industry templates"""
    templates = []
    for template_key, template_data in INDUSTRY_TEMPLATES.items():
        templates.append({
            "key": template_key.value,
            "name_en": template_data["name_en"],
            "name_es": template_data["name_es"],
            "description_en": template_data["description_en"],
            "description_es": template_data["description_es"],
            "enabled_engagement_types": template_data["enabled_engagement_types"],
            "default_engagement_type": template_data["default_engagement_type"],
        })
    return templates


# ============== GET/CREATE CONFIG ==============

@org_config_router.get("")
async def get_organization_config(user: User = Depends(get_current_user)):
    """Get configuration for the current organization"""
    config = await db.organization_configs.find_one(
        {"company_id": user.company_id},
        {"_id": 0}
    )
    
    # Always overlay company.currency (Settings → General) as the canonical app-wide currency
    company = await db.companies.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "currency": 1, "timezone": 1}
    )
    company_currency = (company or {}).get("currency") or "USD"
    company_timezone = (company or {}).get("timezone") or "UTC"
    
    if not config:
        # Return default config (Events & Hospitality)
        template = INDUSTRY_TEMPLATES[IndustryTemplate.EVENTS_HOSPITALITY]
        return {
            "config_id": None,
            "company_id": user.company_id,
            "industry_template": IndustryTemplate.EVENTS_HOSPITALITY.value,
            "enabled_engagement_types": template["enabled_engagement_types"],
            "default_engagement_type": template["default_engagement_type"],
            "terminology": template.get("terminology", {}),
            "pipeline_stages": template["pipeline_stages"],
            "event_types": template["event_types"],
            "client_types": template["client_types"],
            "is_default": True,
            "company_currency": company_currency,
            "company_timezone": company_timezone,
        }
    
    config["company_currency"] = company_currency
    config["company_timezone"] = company_timezone
    return config


@org_config_router.post("")
async def create_organization_config(
    data: OrganizationConfigCreate,
    user: User = Depends(get_current_user)
):
    """Create or replace organization configuration"""
    # Check if config already exists
    existing = await db.organization_configs.find_one({"company_id": user.company_id})
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get template defaults if not specified
    template = INDUSTRY_TEMPLATES.get(data.industry_template, INDUSTRY_TEMPLATES[IndustryTemplate.EVENTS_HOSPITALITY])
    
    # Map industry_template to industry_type for the modules system
    industry_type_map = {
        "events_hospitality": "events",
        "professional_services": "agency",
        "healthcare": "healthcare",
        "real_estate": "real_estate",
        "education": "education",
        "fitness": "fitness",
        "consulting": "consulting",
        "generic": "generic"
    }
    industry_type = industry_type_map.get(data.industry_template.value, "generic")
    
    config_doc = {
        "config_id": f"config_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "industry_template": data.industry_template.value,
        "industry_type": industry_type,  # Required for modules system
        "enabled_engagement_types": data.enabled_engagement_types or template["enabled_engagement_types"],
        "default_engagement_type": data.default_engagement_type or template["default_engagement_type"],
        "terminology": data.terminology if data.terminology else template.get("terminology", {}),
        "pipeline_stages": data.pipeline_stages if data.pipeline_stages else template["pipeline_stages"],
        "event_types": data.event_types if data.event_types else template["event_types"],
        "client_types": data.client_types if data.client_types else template["client_types"],
        "created_at": now,
        "updated_at": now,
    }
    
    if existing:
        # Update existing config
        config_doc["config_id"] = existing["config_id"]
        config_doc["created_at"] = existing.get("created_at", now)
        await db.organization_configs.replace_one(
            {"company_id": user.company_id},
            config_doc
        )
    else:
        # Create new config
        await db.organization_configs.insert_one(config_doc)
    
    config_doc.pop("_id", None)
    
    # Log activity
    await log_activity(
        module="settings",
        action="update" if existing else "create",
        entity_type="organization_config",
        entity_id=config_doc["config_id"],
        entity_name=f"Config - {data.industry_template.value}",
        **user_info(user)
    )
    
    return config_doc


@org_config_router.put("")
async def update_organization_config(
    data: OrganizationConfigUpdate,
    user: User = Depends(get_current_user)
):
    """Update organization configuration"""
    config = await db.organization_configs.find_one({"company_id": user.company_id})
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found. Create one first.")
    
    update_data = {}
    
    if data.industry_template is not None:
        update_data["industry_template"] = data.industry_template.value
    if data.enabled_engagement_types is not None:
        update_data["enabled_engagement_types"] = data.enabled_engagement_types
    if data.default_engagement_type is not None:
        update_data["default_engagement_type"] = data.default_engagement_type
    if data.terminology is not None:
        update_data["terminology"] = data.terminology
    if data.pipeline_stages is not None:
        update_data["pipeline_stages"] = data.pipeline_stages
    if data.event_types is not None:
        update_data["event_types"] = data.event_types
    if data.client_types is not None:
        update_data["client_types"] = data.client_types
    
    # Locale settings
    if hasattr(data, 'currency') and data.currency is not None:
        update_data["currency"] = data.currency
    if hasattr(data, 'timezone') and data.timezone is not None:
        update_data["timezone"] = data.timezone
    if hasattr(data, 'language') and data.language is not None:
        update_data["language"] = data.language
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.organization_configs.update_one(
            {"company_id": user.company_id},
            {"$set": update_data}
        )
    
    # Log activity
    await log_activity(
        module="settings",
        action="update",
        entity_type="organization_config",
        entity_id=config["config_id"],
        entity_name="Organization Config",
        **user_info(user)
    )
    
    return await db.organization_configs.find_one(
        {"company_id": user.company_id},
        {"_id": 0}
    )


# ============== APPLY TEMPLATE ==============

@org_config_router.post("/apply-template/{template_key}")
async def apply_industry_template(
    template_key: str,
    user: User = Depends(get_current_user)
):
    """Apply an industry template to the organization"""
    try:
        template_enum = IndustryTemplate(template_key)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid template: {template_key}")
    
    template = INDUSTRY_TEMPLATES[template_enum]
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Check if config exists
    existing = await db.organization_configs.find_one({"company_id": user.company_id})
    
    # Map industry_template to industry_type for the modules system
    industry_type_map = {
        "events_hospitality": "events",
        "professional_services": "agency",
        "healthcare": "healthcare",
        "real_estate": "real_estate",
        "education": "education",
        "fitness": "fitness",
        "consulting": "consulting",
        "generic": "generic"
    }
    industry_type = industry_type_map.get(template_key, "generic")
    
    config_doc = {
        "config_id": existing["config_id"] if existing else f"config_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "industry_template": template_key,
        "industry_type": industry_type,  # Required for modules system
        "enabled_engagement_types": template["enabled_engagement_types"],
        "default_engagement_type": template["default_engagement_type"],
        "terminology": template.get("terminology", {}),
        "pipeline_stages": template["pipeline_stages"],
        "event_types": template["event_types"],
        "client_types": template["client_types"],
        "created_at": existing.get("created_at", now) if existing else now,
        "updated_at": now,
    }
    
    if existing:
        await db.organization_configs.replace_one(
            {"company_id": user.company_id},
            config_doc
        )
    else:
        await db.organization_configs.insert_one(config_doc)
    
    # Log activity
    await log_activity(
        module="settings",
        action="update",
        entity_type="organization_config",
        entity_id=config_doc["config_id"],
        entity_name=f"Applied template: {template['name_en']}",
        **user_info(user)
    )
    
    config_doc.pop("_id", None)
    return {
        "message": f"Template '{template['name_en']}' applied successfully",
        "config": config_doc
    }


# ============== GET TERMINOLOGY ==============

@org_config_router.get("/terminology")
async def get_terminology(
    language: str = "en",
    user: User = Depends(get_current_user)
):
    """
    Get the terminology map for the current organization.
    Returns the custom term for each system term based on language.
    """
    config = await db.organization_configs.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "terminology": 1, "industry_template": 1}
    )
    
    terminology = {}
    
    if config and config.get("terminology"):
        for term, translations in config["terminology"].items():
            terminology[term] = translations.get(language, translations.get("en", term))
    
    # Add defaults for any missing terms
    default_terms = {
        "event": "Event" if language == "en" else "Evento",
        "project": "Project" if language == "en" else "Proyecto",
        "service": "Service" if language == "en" else "Servicio",
        "event_date": "Event Date" if language == "en" else "Fecha del Evento",
        "guest_count": "Guest Count" if language == "en" else "Cantidad de Invitados",
        "venue": "Venue" if language == "en" else "Venue",
        "event_type": "Event Type" if language == "en" else "Tipo de Evento",
        "client": "Client" if language == "en" else "Cliente",
        "proposal": "Proposal" if language == "en" else "Propuesta",
        "invoice": "Invoice" if language == "en" else "Factura",
    }
    
    for term, default_value in default_terms.items():
        if term not in terminology:
            terminology[term] = default_value
    
    return terminology


# ============== LOCALE SETTINGS (Currency, Timezone, Language) ==============

SUPPORTED_CURRENCIES = [
    {"code": "DOP", "name": "Peso Dominicano", "symbol": "RD$", "locale": "es-DO"},
    {"code": "USD", "name": "US Dollar", "symbol": "$", "locale": "en-US"},
    {"code": "EUR", "name": "Euro", "symbol": "\u20ac", "locale": "de-DE"},
    {"code": "MXN", "name": "Peso Mexicano", "symbol": "$", "locale": "es-MX"},
    {"code": "COP", "name": "Peso Colombiano", "symbol": "$", "locale": "es-CO"},
    {"code": "PEN", "name": "Sol Peruano", "symbol": "S/", "locale": "es-PE"},
    {"code": "ARS", "name": "Peso Argentino", "symbol": "$", "locale": "es-AR"},
    {"code": "CLP", "name": "Peso Chileno", "symbol": "$", "locale": "es-CL"},
    {"code": "BRL", "name": "Real Brasileño", "symbol": "R$", "locale": "pt-BR"},
    {"code": "GBP", "name": "British Pound", "symbol": "\u00a3", "locale": "en-GB"},
    {"code": "CAD", "name": "Canadian Dollar", "symbol": "CA$", "locale": "en-CA"},
]

SUPPORTED_TIMEZONES = [
    "America/Santo_Domingo", "America/New_York", "America/Chicago",
    "America/Denver", "America/Los_Angeles", "America/Mexico_City",
    "America/Bogota", "America/Lima", "America/Santiago",
    "America/Argentina/Buenos_Aires", "America/Sao_Paulo",
    "America/Panama", "America/Caracas", "America/Puerto_Rico",
    "Europe/Madrid", "Europe/London", "Europe/Paris", "Europe/Berlin",
    "UTC",
]


@org_config_router.get("/locale")
async def get_locale_settings(user: User = Depends(get_current_user)):
    """Get locale settings for the organization"""
    config = await db.organization_configs.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "currency": 1, "timezone": 1, "language": 1}
    )
    return {
        "currency": (config or {}).get("currency", "DOP"),
        "timezone": (config or {}).get("timezone", "America/Santo_Domingo"),
        "language": (config or {}).get("language", "es"),
        "supported_currencies": SUPPORTED_CURRENCIES,
        "supported_timezones": SUPPORTED_TIMEZONES,
    }


@org_config_router.put("/locale")
async def update_locale_settings(data: dict, user: User = Depends(get_current_user)):
    """Update locale settings for the organization"""
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if "currency" in data:
        valid_codes = [c["code"] for c in SUPPORTED_CURRENCIES]
        if data["currency"] not in valid_codes:
            raise HTTPException(status_code=400, detail=f"Invalid currency. Must be one of: {valid_codes}")
        update["currency"] = data["currency"]

    if "timezone" in data:
        if data["timezone"] not in SUPPORTED_TIMEZONES:
            raise HTTPException(status_code=400, detail="Invalid timezone")
        update["timezone"] = data["timezone"]

    if "language" in data:
        if data["language"] not in ["en", "es"]:
            raise HTTPException(status_code=400, detail="Invalid language. Must be 'en' or 'es'")
        update["language"] = data["language"]

    # Upsert - create config if it doesn't exist
    existing = await db.organization_configs.find_one({"company_id": user.company_id})
    if existing:
        await db.organization_configs.update_one(
            {"company_id": user.company_id}, {"$set": update}
        )
    else:
        update["config_id"] = f"config_{uuid.uuid4().hex[:12]}"
        update["company_id"] = user.company_id
        update["created_at"] = update["updated_at"]
        await db.organization_configs.insert_one(update)

    return await get_locale_settings(user)
