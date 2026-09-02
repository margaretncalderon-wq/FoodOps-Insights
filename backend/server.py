from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Body
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
import os
import logging
import io
import re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import math
import shutil
import pandas as pd

# Stripe integration
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

# Import from new modules
from config import (
    ROOT_DIR, UPLOADS_DIR, client, db, 
    JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL
)
from utils.activity_logger import log_activity, user_info
from models.auth import User, UserCreate, UserLogin, TokenResponse
from models.demand_studio import (
    MarketingCampaignCreate, MarketingCampaign,
    CampaignChannelCreate, CampaignChannel,
    CampaignSpendCreate, CampaignSpend,
    CampaignAssetCreate, CampaignAsset,
    MarketingActivationCreate, MarketingActivation,
    EmailTrackingCreate, EmailTracking,
    CampaignLeadLinkCreate, CampaignOpportunityLinkCreate, CampaignAccessCreate,
    NotificationCreate,
    SocialAccountCreate, SocialAccount,
    ContentPillarCreate, ContentPillar,
    SocialPostCreate, SocialPost,
    SocialPostAssetLinkCreate, SocialPostSpendLinkCreate,
    ContentIdeaCreate, ContentIdea
)
from models.business_clarity import (
    PaymentCreate as BCPaymentCreate, InvoiceCreate
)
from models.events import (
    EventCreate, EventUpdate, Event, EventMenuCreate,
    EventBlueprintUpdate, ExperienceDesignCreate, OperationalFlowCreate, OperationalPhase,
    RunOfShowCreate, TimeBlock, TeamRolesCreate, EventRole,
    ProductionAssetsCreate, ProductionAsset, ChecklistItem, PostEventReviewCreate,
    EventScalingRequest, ScaledIngredient, ConsolidatedPurchaseList,
    CreatePOFromPurchaseListItem, CreatePOFromPurchaseListRequest,
    EventExtendedUpdate, EventOrderItemCreate, EventOrderItem, EventOrderCreate, EventOrder,
    RUN_OF_SHOW_TEMPLATES
)

# Simple Payment model for finance_router (different from Business Clarity)
class PaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_method: str = "transfer"
    reference: Optional[str] = None
    notes: Optional[str] = None
from routers.auth import auth_router, get_current_user, hash_password, verify_password, create_jwt_token
from routers.demand_studio import demand_studio_router, get_user_role, can_user_perform_action
from routers.business_clarity import business_clarity_router
from routers.crm import crm_router, leads_router, contacts_router, lead_forms_router, webhooks_router
from routers.companies import companies_router
from routers.execution_hub import execution_hub_router
from routers.addons import addons_router, ensure_default_addons
from routers.locations import locations_router
from routers.room_setup import room_setup_router
from routers.activity_logs import activity_logs_router
from routers.payments import payments_router
from routers.automation import automation_router
from routers.sharing import sharing_router
from routers.notes import notes_router
from routers.people_ops import people_ops_router
from routers.launch import launch_router
from routers.buffet_factors import buffet_factors_router, _resolve_buffet_factor, BuffetFactorCreate
from routers.kitchen_beo import kitchen_beo_router
from routers.cost_audit import cost_audit_router
from routers.suppliers import suppliers_router
from routers.supplier_contracts import supplier_contracts_router
from routers.inventory import inventory_router
from routers.packing_templates import packing_templates_router
from routers.nav_badges import router as nav_badges_router
from routers.hr_alerts import router as hr_alerts_router
from routers.purchase_lists import purchase_list_router
from models.purchase_lists import PurchaseList, PurchaseListCreate, PurchaseListItem
from routers.events import events_router
from routers.purchase_orders import purchase_orders_router
from routers.proposals import proposals_router
from routers import proposal_section_templates  # noqa: F401 — registers section-template routes on proposals_router
from routers import proposal_financials  # noqa: F401 — registers financials/day-logistics/custom-fields routes
from routers import proposal_cost_health  # noqa: F401 — registers cost-staleness/refresh/margin-approval/cost-health routes
from models.proposals import (
    OrderItem,
    OrderItemCreate,
    OrderItemUpdate,
    Proposal,
    ProposalCreate,
    ProposalUpdate,
)
from models.purchase_orders import (
    PurchaseOrderFullCreate,
    PurchaseOrderLineCreateModel,
    PurchaseOrderLineModel,
)
from models.suppliers import (
    Supplier,
    SupplierCreate,
    SupplierExtendedUpdate,
    SupplierItemCreate,
)
from models.inventory import (
    Ingredient,
    IngredientCreate,
    InventoryItem,
    InventoryItemCreate,
    InventoryItemExtendedUpdate,
    InventoryItemUpdate,
    InventoryPriceHistory,
    InventoryPriceHistoryCreate,
    InventoryTransaction,
    InventoryTransactionCreate,
)
from routers.plated_menus import plated_menus_router, calculate_menu_cost
from routers.recipes import (
    recipes_router,
    calculate_recipe_cost,
    compute_full_recipe_costing,
    check_circular_dependency,
    is_discrete_unit_for_ingredient,
    _scale_ingredient_line,
    DISCRETE_UNIT_HINTS,
)
from models.recipes import (
    Recipe,
    RecipeCreate,
    RecipeIngredient,
    RecipeExtendedUpdate,
    RecipePortionFormat,
    RecipePortionFormatCreate,
    RecipePackagingFormat,
    RecipePackagingFormatCreate,
    RecipeScalePreview,
    SaveScaledMenuRequest,
)
from models.crm import (
    LeadCreate, Lead, ContactCreate, Contact,
    ClientCreate, Client, CommLogCreate, CommLog,
    LeadFormCreate, LeadForm, LeadFormFieldConfig, CustomFieldConfig
)


def sanitize_float(value, default=0):
    """Convert non-JSON-compliant floats (inf, -inf, nan) to default value"""
    if value is None:
        return default
    try:
        if math.isnan(value) or math.isinf(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


# Create the main app
app = FastAPI(title="Kora OS - Business Management Platform")

# CORS middleware - MUST be added early, before routes
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression for faster responses
app.add_middleware(GZipMiddleware, minimum_size=500)  # Compress responses > 500 bytes

# Health check endpoint for Kubernetes - MUST be at root level, not under /api
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness/readiness probes"""
    try:
        # Quick DB ping to verify connection
        await client.admin.command('ping')
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )

# Create routers
api_router = APIRouter(prefix="/api")

# Health check also under /api for ingress compatibility
@api_router.get("/health")
async def api_health_check():
    """Health check endpoint under /api prefix"""
    try:
        await client.admin.command('ping')
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )

# auth_router imported from routers.auth
# crm_router, leads_router, contacts_router, lead_forms_router imported from routers.crm
# events_router imported from routers.events
# recipes_router imported from routers.recipes
# plated_menus_router imported from routers.plated_menus
# inventory_router imported from routers.inventory
# suppliers_router imported from routers.suppliers
operations_router = APIRouter(prefix="/operations", tags=["Operations Inventory"])
documents_router = APIRouter(prefix="/documents", tags=["Documents"])
finance_router = APIRouter(prefix="/finance", tags=["Finance"])
settings_router = APIRouter(prefix="/settings", tags=["Settings"])
portal_router = APIRouter(prefix="/portal", tags=["Client Portal"])
public_catalog_router = APIRouter(prefix="/public", tags=["Public Catalog"])
reports_router = APIRouter(prefix="/reports", tags=["Reports"])
event_order_router = APIRouter(prefix="/event-orders", tags=["Event Orders"])
# proposals_router imported from routers.proposals
audit_router = APIRouter(prefix="/audit", tags=["Audit"])
# purchase_orders_router imported from routers.purchase_orders
expenses_router = APIRouter(prefix="/expenses", tags=["Expenses"])
allergens_router = APIRouter(prefix="/allergens", tags=["Allergens"])
# business_clarity_router imported from routers.business_clarity
orchestration_router = APIRouter(prefix="/orchestration", tags=["Event Orchestration"])
production_router = APIRouter(prefix="/production", tags=["Production"])
# buffet_factors_router imported from routers.buffet_factors
# kitchen_beo_router imported from routers.kitchen_beo
menu_engineering_router = None  # moved to routers/menu_engineering.py (imported below)
cost_variance_router = APIRouter(prefix="/cost-variance", tags=["Cost Variance"])
delivery_notes_router = APIRouter(prefix="/delivery-notes", tags=["Delivery Notes"])
org_router = APIRouter(prefix="/org", tags=["Organization & SaaS"])
super_admin_router = APIRouter(prefix="/super-admin", tags=["Super Admin"])
# demand_studio_router imported from routers.demand_studio

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== MODELS ==============
# Auth Models (User, UserCreate, UserLogin, TokenResponse) imported from models.auth

# ============== ENGAGEMENT STAGES ==============
# Legacy stage mapping to new Engagement Stages (OS-level)
LEGACY_STAGE_MAP = {
    "Lead": "Inquiry Received",
    "Contacted": "Context Captured",
    "Proposal": "Scope Drafted",
    "Negotiation": "Definition In Review",
    "Won": "Committed",
    "Approved": "Committed",
    "Closed": "Committed",
    "Lost": "Archived"
}

ENGAGEMENT_STAGES = ["Inquiry Received", "Context Captured", "Scope Drafted", "Definition In Review", "Committed", "Archived"]

def normalize_stage(stage: str) -> str:
    """Normalize legacy stages to new Engagement Stages"""
    if not stage:
        return "Inquiry Received"
    if stage in LEGACY_STAGE_MAP:
        return LEGACY_STAGE_MAP[stage]
    if stage in ENGAGEMENT_STAGES:
        return stage
    return "Inquiry Received"

# Company Model
class ProposalItemType(BaseModel):
    """Customizable item type for proposals (multi-tenant flexibility)"""
    type_key: str  # Internal key: food, service, rental, fee, custom_1, etc.
    label_en: str  # Display name in English
    label_es: str  # Display name in Spanish
    color: str = "#6b7280"  # Hex color for UI
    icon: str = "Package"  # Lucide icon name
    is_active: bool = True
    sort_order: int = 0

class Company(BaseModel):
    company_id: str
    name: str
    logo_url: Optional[str] = None
    signature_image_url: Optional[str] = None  # Authorized signatory's signature
    stamp_image_url: Optional[str] = None  # Company seal/stamp
    signatory_name: Optional[str] = None  # Name displayed under the signature
    signatory_title: Optional[str] = None  # Title displayed under the signature
    primary_color: str = "#3A4D3F"
    secondary_color: str = "#E5DCC5"
    default_language: str = "en"
    currency: str = "USD"
    default_tax_rate: float = 0.0
    time_format: str = "24h"  # "12h" or "24h"
    # Multi-tenant customizable proposal item types
    proposal_item_types: List[ProposalItemType] = []
    # SaaS Organization fields
    timezone: str = "America/Santo_Domingo"
    status: str = "active"  # active, suspended, canceled
    billing_email: Optional[str] = None
    onboarding_completed: bool = False
    created_at: datetime
    # Business Information Fields (for invoices, proposals, etc.)
    legal_name: Optional[str] = None  # Razón social
    trade_name: Optional[str] = None  # Nombre comercial
    tax_id: Optional[str] = None  # RNC o Cédula
    email: Optional[str] = None  # Correo electrónico
    phone: Optional[str] = None  # Teléfono
    website: Optional[str] = None  # Sitio web
    # Location Information
    address: Optional[str] = None  # Dirección
    city: Optional[str] = None  # Municipio
    state: Optional[str] = None  # Provincia
    country: Optional[str] = None  # País
    postal_code: Optional[str] = None  # Código postal
    # Additional Business Data
    tax_regime: Optional[str] = None  # Régimen fiscal
    industry_sector: Optional[str] = None  # Sector
    employee_count: Optional[str] = None  # Número de empleados
    decimal_precision: int = 2  # Precisión decimal
    decimal_separator: str = "."  # Separador decimal
    # Terms & Conditions Templates
    terms_proposal_es: Optional[str] = None  # Términos para propuestas (español)
    terms_proposal_en: Optional[str] = None  # Terms for proposals (english)
    terms_invoice_es: Optional[str] = None  # Términos para facturas (español)
    terms_invoice_en: Optional[str] = None  # Terms for invoices (english)
    terms_contract_es: Optional[str] = None  # Términos para contratos (español)
    terms_contract_en: Optional[str] = None  # Terms for contracts (english)
    payment_terms_default: Optional[str] = None  # Default payment terms
    # Bank Account Information
    bank_name: Optional[str] = None  # Nombre del banco
    bank_account_number: Optional[str] = None  # Número de cuenta
    bank_account_type: Optional[str] = None  # Tipo (corriente/ahorro)
    bank_routing_number: Optional[str] = None  # SWIFT/Routing number
    bank_beneficiary: Optional[str] = None  # Nombre del beneficiario
    bank_notes: Optional[str] = None  # Notas adicionales de pago
    # Public Catalog
    catalog_slug: Optional[str] = None  # Public URL slug, e.g. "/catalog/{slug}"
    catalog_published: bool = False  # Show the public catalog page
    catalog_headline: Optional[str] = None  # Tagline shown at top
    catalog_description: Optional[str] = None  # Longer description / bio
    catalog_hero_image_url: Optional[str] = None  # Optional cover image
    catalog_show_prices: bool = True  # If false, prices are hidden (request-only)
    # Recipe Costing Configuration (Sprint P0)
    chef_hourly_rate: float = 20.0  # $/hr for labor cost calculations
    recipe_overhead_percent: float = 15.0  # Applied to food cost
    recipe_target_food_cost_percent: float = 30.0  # Method A: food ÷ target%
    recipe_target_prime_cost_percent: float = 55.0  # Method B: (food+labor) ÷ target%
    recipe_target_gross_margin_percent: float = 65.0  # Method C: total ÷ (1-margin%)

# ============== SAAS MULTI-TENANT MODELS ==============

class PlanLimits(BaseModel):
    """Limits for a subscription plan"""
    events_per_month: int = 10
    active_users: int = 3
    supplier_invoices_per_month: int = 50
    storage_mb: int = 500
    proposals_per_month: int = 20
    execution_goals_per_month: int = 3  # Execution Hub limits

class PlanFeatures(BaseModel):
    """Feature flags for a subscription plan"""
    business_clarity: bool = True
    culinary_intelligence: bool = False
    advanced_reports: bool = False
    api_access: bool = False
    white_label: bool = False
    priority_support: bool = False
    execution_hub: bool = True  # Included for all plans

class Plan(BaseModel):
    """Subscription plan definition"""
    plan_id: str
    name: str
    display_name_en: str
    display_name_es: str
    description_en: str
    description_es: str
    price_monthly: float
    price_yearly: float
    currency: str = "USD"
    limits: PlanLimits = PlanLimits()
    features: PlanFeatures = PlanFeatures()
    is_active: bool = True
    sort_order: int = 0
    highlight: bool = False  # For "Most Popular" badge

class Subscription(BaseModel):
    """Organization subscription to a plan"""
    subscription_id: str
    company_id: str  # orgId
    plan_id: str
    status: str = "trialing"  # trialing, active, past_due, canceled, paused
    billing_cycle: str = "monthly"  # monthly, yearly
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    canceled_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    # Stripe stub fields (for future integration)
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class UsageMeter(BaseModel):
    """Monthly usage tracking per organization"""
    meter_id: str
    company_id: str  # orgId
    period: str  # "2026-02" format (year-month)
    metrics: Dict[str, int] = {
        "events_created": 0,
        "active_users": 0,
        "supplier_invoices": 0,
        "proposals_created": 0,
        "storage_mb": 0
    }
    updated_at: datetime

class Membership(BaseModel):
    """User membership in an organization with role"""
    membership_id: str
    company_id: str  # orgId
    user_id: str
    role: str = "viewer"  # owner, admin, ops, finance, viewer
    status: str = "active"  # active, suspended, removed
    invited_by: Optional[str] = None
    joined_at: datetime
    updated_at: datetime

class Invitation(BaseModel):
    """Team invitation to an organization"""
    invitation_id: str
    company_id: str  # orgId
    email: str
    role: str = "ops"  # owner, admin, ops, finance, viewer
    token: str
    invited_by: str
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    status: str = "pending"  # pending, accepted, expired, revoked
    created_at: datetime

class InvitationCreate(BaseModel):
    email: EmailStr
    role: str = "ops"

class OrganizationCreate(BaseModel):
    """Create new organization during onboarding"""
    name: str
    currency: str = "USD"
    timezone: str = "America/Santo_Domingo"
    billing_email: Optional[str] = None

# Role permissions mapping
ROLE_PERMISSIONS = {
    "owner": {
        "manage_billing": True,
        "manage_plans": True,
        "manage_members": True,
        "manage_settings": True,
        "manage_events": True,
        "manage_inventory": True,
        "view_business_clarity": True,
        "manage_business_clarity": True,
        "view_all": True
    },
    "admin": {
        "manage_billing": True,
        "manage_plans": True,
        "manage_members": True,
        "manage_settings": True,
        "manage_events": True,
        "manage_inventory": True,
        "view_business_clarity": True,
        "manage_business_clarity": True,
        "view_all": True
    },
    "ops": {
        "manage_billing": False,
        "manage_plans": False,
        "manage_members": False,
        "manage_settings": False,
        "manage_events": True,
        "manage_inventory": True,
        "view_business_clarity": False,
        "manage_business_clarity": False,
        "view_all": True
    },
    "finance": {
        "manage_billing": False,
        "manage_plans": False,
        "manage_members": False,
        "manage_settings": False,
        "manage_events": False,
        "manage_inventory": False,
        "view_business_clarity": True,
        "manage_business_clarity": True,
        "view_all": True
    },
    "viewer": {
        "manage_billing": False,
        "manage_plans": False,
        "manage_members": False,
        "manage_settings": False,
        "manage_events": False,
        "manage_inventory": False,
        "view_business_clarity": False,
        "manage_business_clarity": False,
        "view_all": True
    },
    "marketing_partner": {
        "manage_billing": False,
        "manage_plans": False,
        "manage_members": False,
        "manage_settings": False,
        "manage_events": False,
        "manage_inventory": False,
        "view_business_clarity": False,
        "manage_business_clarity": False,
        "view_all": False,
        "view_assigned_campaigns": True,
        "edit_assigned_campaigns": True,
        "view_financial_data": False
    },
    "sales": {
        "manage_billing": False,
        "manage_plans": False,
        "manage_members": False,
        "manage_settings": False,
        "manage_events": False,
        "manage_inventory": False,
        "view_business_clarity": False,
        "manage_business_clarity": False,
        "view_all": False,
        "view_crm": True,
        "manage_crm": True,
        "view_assigned_leads": True
    }
}

# Default plans
DEFAULT_PLANS = [
    {
        "plan_id": "plan_starter",
        "name": "starter",
        "display_name_en": "Starter",
        "display_name_es": "Inicial",
        "description_en": "Perfect for small catering businesses just getting started",
        "description_es": "Perfecto para pequeños negocios de catering que están comenzando",
        "price_monthly": 0,
        "price_yearly": 0,
        "currency": "USD",
        "limits": {"events_per_month": 5, "active_users": 2, "supplier_invoices_per_month": 20, "storage_mb": 200, "proposals_per_month": 10, "execution_goals_per_month": 3},
        "features": {"business_clarity": True, "culinary_intelligence": False, "advanced_reports": False, "api_access": False, "white_label": False, "priority_support": False, "execution_hub": True},
        "is_active": True,
        "sort_order": 0,
        "highlight": False
    },
    {
        "plan_id": "plan_professional",
        "name": "professional",
        "display_name_en": "Professional",
        "display_name_es": "Profesional",
        "description_en": "For growing catering companies with more events and team members",
        "description_es": "Para empresas de catering en crecimiento con más eventos y equipo",
        "price_monthly": 49,
        "price_yearly": 490,
        "currency": "USD",
        "limits": {"events_per_month": 30, "active_users": 10, "supplier_invoices_per_month": 200, "storage_mb": 2000, "proposals_per_month": 50, "execution_goals_per_month": 999},
        "features": {"business_clarity": True, "culinary_intelligence": True, "advanced_reports": True, "api_access": False, "white_label": False, "priority_support": False, "execution_hub": True},
        "is_active": True,
        "sort_order": 1,
        "highlight": True
    },
    {
        "plan_id": "plan_enterprise",
        "name": "enterprise",
        "display_name_en": "Enterprise",
        "display_name_es": "Empresarial",
        "description_en": "For large operations with unlimited needs and dedicated support",
        "description_es": "Para operaciones grandes con necesidades ilimitadas y soporte dedicado",
        "price_monthly": 149,
        "price_yearly": 1490,
        "currency": "USD",
        "limits": {"events_per_month": 999, "active_users": 999, "supplier_invoices_per_month": 999, "storage_mb": 10000, "proposals_per_month": 999, "execution_goals_per_month": 999},
        "features": {"business_clarity": True, "culinary_intelligence": True, "advanced_reports": True, "api_access": True, "white_label": True, "priority_support": True, "execution_hub": True},
        "is_active": True,
        "sort_order": 2,
        "highlight": False
    }
]

# CRM Models imported from models.crm

# Event Models imported from models.events

# Supplier Models moved to models/suppliers.py


# Supplier Item Models moved to models/suppliers.py

# Plated Menu Models (MenuCourse, PlatedMenuCreate, PlatedMenu) moved to models/plated_menus.py

# Purchase Order Models

# Invoice Models - with discounts and taxes
class InvoiceLineCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    linked_item_id: Optional[str] = None
    linked_item_type: Optional[str] = None  # menu_item, service, rental

class InvoiceCreateLocal(BaseModel):
    client_id: str
    event_id: Optional[str] = None
    due_date: datetime
    lines: List[InvoiceLineCreate]
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    notes: Optional[str] = None

# ============== BUSINESS CLARITY MODELS ==============
# All Business Clarity models moved to models/business_clarity.py

# ============== EVENT ORCHESTRATION MODELS ==============
# All Event Orchestration models moved to models/events.py

# Document Model
class DocumentCreate(BaseModel):
    event_id: str
    document_type: str
    title: str
    content: Dict[str, Any] = {}

class Document(BaseModel):
    document_id: str
    company_id: str
    event_id: str
    document_type: str
    title: str
    content: Dict[str, Any]
    signature: Optional[str] = None
    signed_at: Optional[datetime] = None
    signed_by: Optional[str] = None
    status: str = "draft"
    requires_signature: bool = False
    created_at: datetime
    updated_at: datetime

# ============== FEATURE FLAGS MODELS ==============

class FeatureFlags(BaseModel):
    """Feature flags for controlling module visibility"""
    is_proposal_editing_enabled: bool = True
    is_order_items_enabled: bool = True
    is_margin_tracking_enabled: bool = True
    is_document_autogeneration_enabled: bool = True
    is_custom_fields_enabled: bool = True
    is_food_ops_enabled: bool = True  # Links to recipes module
    is_inventory_enabled: bool = False  # Inventory management module
    is_purchase_list_enabled: bool = False  # Purchase lists for events
    is_recipe_composition_enabled: bool = True  # Sub-recipes in recipes
    is_plated_menu_enabled: bool = True  # Plated menu with courses
    is_base_recipes_enabled: bool = True  # Base/Component recipe types

class FeatureFlagsUpdate(BaseModel):
    is_proposal_editing_enabled: Optional[bool] = None
    is_order_items_enabled: Optional[bool] = None
    is_margin_tracking_enabled: Optional[bool] = None
    is_document_autogeneration_enabled: Optional[bool] = None
    is_custom_fields_enabled: Optional[bool] = None
    is_food_ops_enabled: Optional[bool] = None
    is_inventory_enabled: Optional[bool] = None
    is_purchase_list_enabled: Optional[bool] = None
    is_recipe_composition_enabled: Optional[bool] = None
    is_plated_menu_enabled: Optional[bool] = None
    is_base_recipes_enabled: Optional[bool] = None


    created_at: datetime
    updated_at: datetime

# ============== PROPOSAL MODELS (Client-facing Contract) ==============


# ============== DOCUMENT TEMPLATE & CUSTOM FIELDS MODELS ==============

class CustomFieldDefinition(BaseModel):
    """Custom field definition for templates"""
    field_key: str
    label_en: str
    label_es: str
    field_type: str = "Text"  # Text, Number, Date, Boolean, Dropdown
    default_value: Optional[str] = None
    required: bool = False
    visibility: str = "Client-facing"  # Internal, Client-facing
    applies_to: List[str] = []  # Proposal, Invoice, Packing, Kitchen, Service
    options: List[str] = []  # For Dropdown type
    is_active: bool = True

class DocumentTemplateCreate(BaseModel):
    """Document template configuration"""
    template_type: str  # Proposal, Invoice, PackingList, KitchenSheet, ServiceSheet
    name: str
    is_active: bool = True
    custom_fields: List[CustomFieldDefinition] = []
    header_text_en: Optional[str] = None
    header_text_es: Optional[str] = None
    tagline_en: Optional[str] = None  # Short slogan rendered directly under the company logo in documents
    tagline_es: Optional[str] = None
    footer_text_en: Optional[str] = None
    footer_text_es: Optional[str] = None
    # Section titles customization
    food_section_title_en: Optional[str] = "Custom Menu"
    food_section_title_es: Optional[str] = "Menú Personalizado"
    service_section_title_en: Optional[str] = "Services"
    service_section_title_es: Optional[str] = "Servicios"
    rental_section_title_en: Optional[str] = "Rentals & Equipment"
    rental_section_title_es: Optional[str] = "Alquileres y Equipos"
    # Invoice specific
    terms_and_conditions_en: Optional[str] = None
    terms_and_conditions_es: Optional[str] = None
    payment_instructions_en: Optional[str] = None
    payment_instructions_es: Optional[str] = None
    bank_details: Optional[str] = None
    # Document styling
    primary_color: Optional[str] = "#3A4D3F"
    style_variant: Optional[str] = "classic"  # classic | minimal | editorial | luxury
    show_logo: bool = True
    logo_size: Optional[str] = "medium"  # small | medium | large — max-height applied to printed/document logo
    logo_position: Optional[str] = "left"  # left | center | right — horizontal alignment of logo in the document header
    pdf_density: Optional[str] = "normal"  # compact | normal | spacious — controls section/row spacing & font size for the printed PDF
    show_company_address: bool = True
    show_tax_id: bool = True
    # Packing List / Kitchen Sheet specific
    show_quantities: bool = True
    show_notes_column: bool = True
    show_checkboxes: bool = True
    group_by_category: bool = True

class DocumentTemplate(BaseModel):
    template_id: str
    company_id: str
    template_type: str
    name: str
    is_active: bool
    custom_fields: List[Dict[str, Any]] = []
    header_text_en: Optional[str] = None
    header_text_es: Optional[str] = None
    footer_text_en: Optional[str] = None
    footer_text_es: Optional[str] = None
    food_section_title_en: Optional[str] = "Custom Menu"
    food_section_title_es: Optional[str] = "Menú Personalizado"
    service_section_title_en: Optional[str] = "Services"
    service_section_title_es: Optional[str] = "Servicios"
    rental_section_title_en: Optional[str] = "Rentals & Equipment"
    rental_section_title_es: Optional[str] = "Alquileres y Equipos"
    primary_color: Optional[str] = "#3A4D3F"
    style_variant: Optional[str] = "classic"
    created_at: datetime
    updated_at: datetime

# ============== AUDIT LOG MODEL ==============

class AuditLogEntry(BaseModel):
    """Audit log for tracking changes after proposal acceptance"""
    log_id: str
    event_id: str
    proposal_id: str
    company_id: str
    user_id: str
    user_name: str
    action_type: str  # add_item, remove_item, edit_item, status_change
    item_id: Optional[str] = None
    item_description: Optional[str] = None
    changes: Dict[str, Any] = {}
    impact_on_total: Optional[float] = None
    timestamp: datetime

# ============== FOOD OPS ENHANCED MODELS ==============

# Allergen Configuration (Settings)
class AllergenConfig(BaseModel):
    """Configurable allergen options"""
    allergen_id: str
    company_id: str
    name: str
    name_es: str
    icon: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0

class AllergenConfigCreate(BaseModel):
    name: str
    name_es: str
    icon: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


    notes: Optional[str] = None


# Extended PlatedMenu fields (pricing)
class PlatedMenuExtendedUpdate(BaseModel):
    default_guest_count: Optional[int] = None
    sell_price_per_guest: Optional[float] = None
    target_margin_pct: Optional[float] = None
    suggested_sell_price_per_guest: Optional[float] = None
    tax_included: Optional[bool] = None

# Extended Supplier Model


# ============== PRODUCTION MODELS ==============

class ProductionLineCreate(BaseModel):
    recipe_id: str
    target_output_qty: float
    output_unit: str

class ProductionLine(BaseModel):
    line_id: str
    recipe_id: str
    recipe_name: str
    recipe_type: str  # base, component, final_dish
    produces_stock: bool
    target_output_qty: float
    output_unit: str
    computed_inputs: List[Dict[str, Any]] = []  # Expanded BOM
    actual_output_qty: Optional[float] = None

class ProductionBatchCreate(BaseModel):
    linked_event_id: Optional[str] = None
    source_sr_id: Optional[str] = None
    notes: Optional[str] = None
    lines: List[ProductionLineCreate] = []

class ProductionBatch(BaseModel):
    batch_id: str
    company_id: str
    batch_number: str
    status: str = "PLANNED"  # PLANNED, IN_PROGRESS, POSTED, VOIDED
    linked_event_id: Optional[str] = None
    linked_event_name: Optional[str] = None
    source_sr_id: Optional[str] = None
    notes: Optional[str] = None
    lines: List[ProductionLine] = []
    total_input_cost: float = 0.0
    total_output_value: float = 0.0
    created_by: str
    created_at: datetime
    updated_at: datetime
    posted_at: Optional[datetime] = None
    posted_by: Optional[str] = None

# ============== PURCHASE ORDER MODELS (Full PO System) ==============


# ============== EXPENSE / INVOICE MODELS (Supplier Invoice on receive) ==============

class ExpenseLineCreate(BaseModel):
    inventory_item_id: Optional[str] = None
    description: str
    quantity: float = 1.0
    unit_cost: float
    tax_rate: float = 0.0

class ExpenseCreate(BaseModel):
    """Supplier expense/invoice when receiving PO"""
    supplier_id: str
    po_id: Optional[str] = None  # Link to PO if applicable
    invoice_number: Optional[str] = None
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    payment_method: str = "Transfer"  # Cash, Transfer, Credit, Other
    lines: List[ExpenseLineCreate] = []
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    notes: Optional[str] = None
    status: str = "Pending"  # Pending, Paid, Partial

class Expense(BaseModel):
    expense_id: str
    company_id: str
    supplier_id: str
    supplier_name: Optional[str] = None
    po_id: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    payment_method: str
    lines: List[Dict[str, Any]] = []
    subtotal: float
    tax_amount: float
    total: float
    paid_amount: float = 0.0
    notes: Optional[str] = None
    status: str = "Pending"
    created_at: datetime
    updated_at: datetime

# ============== EVENT SCALING / CONSOLIDATED PURCHASE MODELS ==============
# All Event Scaling models moved to models/events.py

# ============== EVENT EXTENSION MODELS ==============
# EventExtendedUpdate moved to models/events.py

# ============== EVENT ORDER MODELS (Contract & Event Order) ==============

# Item Category Model (Food, Drinks, Rentals, Labor/Staff, Décor, Other)
class ItemCategoryCreate(BaseModel):
    name: str
    name_es: Optional[str] = None
    color: str = "#6B7280"
    icon: str = "package"
    sort_order: int = 0

class ItemCategory(BaseModel):
    category_id: str
    company_id: str
    name: str
    name_es: Optional[str] = None
    color: str
    icon: str
    sort_order: int
    is_default: bool = False
    created_at: datetime

# Picklist Item Model (pre-defined items for quick selection)
class PicklistItemCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: str
    item_type: str = "Service"  # Food, Service, Rental, Fee
    default_price: float = 0.0
    internal_cost: Optional[float] = None  # Manual cost override
    recipe_id: Optional[str] = None  # Link to recipe for food items (auto cost)
    recipe_portion_format_id: Optional[str] = None  # Specific portion format within the recipe
    inventory_item_id: Optional[str] = None  # Link to inventory for disposables
    unit: str = "unit"
    is_active: bool = True
    min_margin_pct: Optional[float] = None  # Per-item override for margin policy

class PicklistItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    item_type: Optional[str] = None
    default_price: Optional[float] = None
    internal_cost: Optional[float] = None
    recipe_id: Optional[str] = None
    recipe_portion_format_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None
    min_margin_pct: Optional[float] = None

class PicklistItem(BaseModel):
    item_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    category_id: str
    item_type: str
    default_price: float
    internal_cost: Optional[float] = None
    recipe_id: Optional[str] = None
    recipe_portion_format_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    unit: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    min_margin_pct: Optional[float] = None

# Bulk Add Picklist Items
class PicklistBulkCreate(BaseModel):
    items: List[PicklistItemCreate]

# ============== MENU / PACKAGE MODELS ==============
# A Menu (or Package) groups multiple picklist items together for quick selection

class MenuItemEntry(BaseModel):
    """An item within a menu/package"""
    picklist_item_id: Optional[str] = None  # Reference to picklist item
    recipe_id: Optional[str] = None  # Or direct recipe reference
    custom_name: Optional[str] = None  # Custom name override
    custom_description: Optional[str] = None
    quantity: float = 1.0
    unit_price_override: Optional[float] = None  # Override default price
    internal_cost_override: Optional[float] = None  # Override default cost
    sort_order: int = 0

class MenuVariant(BaseModel):
    """A variant of a menu with different pricing tier"""
    variant_id: Optional[str] = None
    name: str  # e.g., "Gold", "Silver", "Bronze"
    name_es: Optional[str] = None
    description: Optional[str] = None
    discount_type: str = "percentage"  # percentage, fixed_amount
    discount_value: float = 0  # e.g., 10 for 10% or 100 for $100 off
    is_default: bool = False

class MenuCreate(BaseModel):
    """Create a menu/package with items"""
    name: str
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    menu_type: str = "Menu"  # Menu, Package, Bundle
    category_id: Optional[str] = None
    items: List[MenuItemEntry] = []
    variants: List[MenuVariant] = []  # Gold, Silver, Bronze variants
    default_price: Optional[float] = None  # Fixed price for entire package
    is_fixed_price: bool = False  # If true, use default_price instead of sum
    is_active: bool = True

class MenuUpdate(BaseModel):
    name: Optional[str] = None
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    menu_type: Optional[str] = None
    category_id: Optional[str] = None
    items: Optional[List[MenuItemEntry]] = None
    variants: Optional[List[MenuVariant]] = None
    default_price: Optional[float] = None
    is_fixed_price: Optional[bool] = None
    is_active: Optional[bool] = None

class Menu(BaseModel):
    menu_id: str
    company_id: str
    name: str
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    menu_type: str
    category_id: Optional[str] = None
    items: List[Dict[str, Any]] = []
    variants: List[Dict[str, Any]] = []  # Variants with calculated prices
    default_price: Optional[float] = None
    is_fixed_price: bool
    is_active: bool
    # Calculated fields
    total_price: float = 0
    total_cost: float = 0
    margin_amount: float = 0
    margin_percentage: float = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

# Tax Rate Model
class TaxRateCreate(BaseModel):
    name: str
    rate: float  # e.g., 16.0 for 16%
    is_default: bool = False

class TaxRate(BaseModel):
    tax_id: str
    company_id: str
    name: str
    rate: float
    is_default: bool
    created_at: datetime

# Event Order models moved to models/events.py (EventOrderItemCreate, EventOrderItem, EventOrderCreate, EventOrder)

# ============== DEMAND STUDIO MODELS ==============
# All Demand Studio models moved to models/demand_studio.py

# ============== AUTH HELPERS ==============
# hash_password, verify_password, create_jwt_token, get_current_user imported from routers.auth

# UNIT_CONVERSIONS and convert_units moved to utils/legacy_units.py

# ============== AUTH ROUTES ==============
# All auth routes moved to routers/auth.py

# All CRM routes moved to routers/crm.py (leads, contacts, clients, lead_forms)

# ============== SUPPLIERS ROUTES ==============

# ============== OPERATIONS INVENTORY (Non-food) ==============

@operations_router.get("/items")
async def get_operations_items(user: User = Depends(get_current_user)):
    """Get all non-food inventory items"""
    items = await db.ingredients.find({
        "company_id": user.company_id,
        "inventory_type": {"$in": ["packaging", "disposable", "equipment", "event_supply"]}
    }, {"_id": 0}).sort("name", 1).to_list(1000)
    return items

@operations_router.get("/below-par")
async def get_below_par(user: User = Depends(get_current_user)):
    """Get items below par level"""
    items = await db.ingredients.find({
        "company_id": user.company_id,
        "inventory_type": {"$in": ["packaging", "disposable", "equipment", "event_supply"]},
        "$expr": {"$lt": ["$stock_quantity", "$par_level"]}
    }, {"_id": 0}).to_list(100)
    return items

@operations_router.get("/reorder-list")
async def get_reorder_list(user: User = Depends(get_current_user)):
    """Generate reorder list grouped by supplier"""
    items = await db.ingredients.find({
        "company_id": user.company_id,
        "inventory_type": {"$in": ["packaging", "disposable", "equipment", "event_supply"]},
        "$expr": {"$lt": ["$stock_quantity", "$par_level"]}
    }, {"_id": 0}).to_list(100)
    
    # Group by supplier
    by_supplier = {}
    for item in items:
        supplier_id = item.get("preferred_supplier_id", "no_supplier")
        if supplier_id not in by_supplier:
            by_supplier[supplier_id] = []
        
        qty_needed = item.get("par_level", 0) - item.get("stock_quantity", 0)
        pack_size = item.get("pack_size", 1)
        packs_to_order = math.ceil(qty_needed / pack_size)

        by_supplier[supplier_id].append({
            "ingredient_id": item["ingredient_id"],
            "name": item["name"],
            "current_stock": item.get("stock_quantity", 0),
            "par_level": item.get("par_level", 0),
            "qty_needed": qty_needed,
            "pack_size": pack_size,
            "pack_unit": item.get("pack_unit", "unit"),
            "packs_to_order": packs_to_order,
            # PASE A: cost_per_unit is $/purchase_unit (i.e. per full pack),
            # so estimated_cost = packs_to_order × cpu. Multiplying by
            # pack_size on top would inflate the total by the container size.
            "estimated_cost": packs_to_order * item.get("cost_per_unit", 0)
        })
    
    return by_supplier



# ============== DOCUMENTS ROUTES - Enhanced with taxes/discounts ==============

@documents_router.get("", response_model=List[Document])
async def get_documents(event_id: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if event_id:
        query["event_id"] = event_id
    
    documents = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for d in documents:
        for field in ["created_at", "updated_at", "signed_at"]:
            if d.get(field) and isinstance(d[field], str):
                d[field] = datetime.fromisoformat(d[field])
        if "requires_signature" not in d:
            d["requires_signature"] = d.get("document_type") in ["contract", "quote"]
    return documents

@documents_router.post("", response_model=Document)
async def create_document(data: DocumentCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    
    doc = {
        "document_id": document_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "signature": None,
        "signed_at": None,
        "signed_by": None,
        "status": "draft",
        "requires_signature": data.document_type in ["contract", "quote"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.documents.insert_one(doc)
    del doc["_id"]
    doc["created_at"] = now
    doc["updated_at"] = now
    return Document(**doc)

@documents_router.get("/{document_id}", response_model=Document)
async def get_document(document_id: str, user: User = Depends(get_current_user)):
    doc = await db.documents.find_one({"document_id": document_id, "company_id": user.company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    for field in ["created_at", "updated_at", "signed_at"]:
        if doc.get(field) and isinstance(doc[field], str):
            doc[field] = datetime.fromisoformat(doc[field])
    return Document(**doc)

@documents_router.put("/{document_id}", response_model=Document)
async def update_document(document_id: str, data: DocumentCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    result = await db.documents.update_one(
        {"document_id": document_id, "company_id": user.company_id},
        {"$set": {**data.model_dump(), "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return await get_document(document_id, user)

@documents_router.post("/{document_id}/sign")
async def sign_document(document_id: str, data: dict, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    signature = data.get("signature")
    signed_by = data.get("signed_by", user.name)
    
    result = await db.documents.update_one(
        {"document_id": document_id, "company_id": user.company_id},
        {"$set": {"signature": signature, "signed_at": now.isoformat(), "signed_by": signed_by, "status": "signed", "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document signed successfully"}


@documents_router.post("/{document_id}/send")
async def send_document_to_client(document_id: str, user: User = Depends(get_current_user)):
    """Send a document to the client via email with portal link and optional PDF"""
    from services.email_service import send_contract_email, is_email_configured
    
    # Get the document
    doc = await db.documents.find_one({"document_id": document_id, "company_id": user.company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Get related event
    event = await db.events.find_one({"event_id": doc.get("event_id")}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get client with email
    client = await db.clients.find_one({"client_id": event.get("client_id")}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not client.get("email"):
        raise HTTPException(status_code=400, detail="Client does not have an email address")
    
    # Get company info for branding
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    company_name = company.get("name", "Kora OS") if company else "Kora OS"
    company_color = company.get("primary_color", "#3A4D3F") if company else "#3A4D3F"
    
    # Build portal link
    frontend_url = os.environ.get("FRONTEND_URL", "https://ourkora.com")
    portal_link = f"{frontend_url}/portal/{document_id}"
    
    # Get financials from document content if available
    total_amount = 0
    content = doc.get("content", {})
    if content.get("financials"):
        total_amount = content["financials"].get("total", 0)
    
    # Format event date
    event_date = event.get("event_date")
    if event_date:
        try:
            event_date_obj = datetime.fromisoformat(event_date.replace("Z", "+00:00")) if isinstance(event_date, str) else event_date
            event_date = event_date_obj.strftime("%d/%m/%Y")
        except Exception:
            event_date = event_date
    else:
        event_date = "Por confirmar"
    
    # Send email
    email_result = await send_contract_email(
        to_email=client.get("email"),
        client_name=client.get("display_name") or client.get("name", "Cliente"),
        event_name=event.get("name", "Evento"),
        event_date=event_date,
        document_type=doc.get("document_type", "contract"),
        portal_link=portal_link,
        company_name=company_name,
        company_color=company_color,
        total_amount=total_amount,
        requires_signature=doc.get("requires_signature", True)
    )
    
    now = datetime.now(timezone.utc)
    
    # Update document status to sent
    await db.documents.update_one(
        {"document_id": document_id},
        {"$set": {
            "status": "sent",
            "sent_at": now.isoformat(),
            "sent_to": client.get("email"),
            "sent_by": user.user_id,
            "updated_at": now.isoformat()
        }}
    )
    
    # Log activity
    from utils.activity_logger import log_activity, user_info  # noqa: F811
    await log_activity(
        module="documents",
        action="send",
        entity_type="document",
        entity_id=document_id,
        entity_name=doc.get("title", "Document"),
        metadata={"sent_to": client.get("email"), "document_type": doc.get("document_type")},
        **user_info(user)
    )
    
    return {
        "message": "Document sent successfully",
        "email_status": email_result.get("status"),
        "sent_to": client.get("email"),
        "portal_link": portal_link
    }


@documents_router.post("/generate/{event_id}/{doc_type}")
async def generate_document(event_id: str, doc_type: str, user: User = Depends(get_current_user)):
    """Generate a document for an event with full content including order items organized by day and type"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0})
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    
    # Get proposal and order items
    proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    order_items = []
    if proposal:
        order_items = await db.order_items.find(
            {"proposal_id": proposal["proposal_id"]},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(500)
    
    # Get recipes for legacy support
    recipes = []
    for recipe_id in event.get("menu_items", []):
        recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
        if recipe:
            recipes.append(recipe)
    
    # Get categories
    categories = await db.item_categories.find(
        {"company_id": user.company_id}, {"_id": 0}
    ).to_list(100)
    cat_map = {c["category_id"]: c["name"] for c in categories}
    
    # Organize items by day and type for multi-day events
    items_by_day = {}
    items_by_type = {"Food": [], "Service": [], "Rental": [], "Fee": [], "Other": []}
    
    for item in order_items:
        item_type = item.get("item_type", "Other")
        event_day = item.get("event_date") or "main"
        
        # Add category name
        if item.get("category_id"):
            item["category_name"] = cat_map.get(item["category_id"], "")
        
        # Group by type
        if item_type in items_by_type:
            items_by_type[item_type].append(item)
        else:
            items_by_type["Other"].append(item)
        
        # Group by day
        if event_day not in items_by_day:
            items_by_day[event_day] = []
        items_by_day[event_day].append(item)
    
    now = datetime.now(timezone.utc)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    
    # Get template settings
    template = await db.templates.find_one({"company_id": user.company_id, "type": doc_type}, {"_id": 0})
    template_settings = template.get("settings", {}) if template else {}
    
    # Get document template for section titles
    doc_template = await db.document_templates.find_one(
        {"company_id": user.company_id, "template_type": "Proposal", "is_active": True},
        {"_id": 0}
    )
    
    # Section titles from template or defaults
    section_titles = {
        "food_en": doc_template.get("food_section_title_en", "Custom Menu") if doc_template else "Custom Menu",
        "food_es": doc_template.get("food_section_title_es", "Menú Personalizado") if doc_template else "Menú Personalizado",
        "service_en": doc_template.get("service_section_title_en", "Services") if doc_template else "Services",
        "service_es": doc_template.get("service_section_title_es", "Servicios") if doc_template else "Servicios",
        "rental_en": doc_template.get("rental_section_title_en", "Rentals & Equipment") if doc_template else "Rentals & Equipment",
        "rental_es": doc_template.get("rental_section_title_es", "Alquileres y Equipos") if doc_template else "Alquileres y Equipos",
    }
    
    if doc_type == "kitchen_sheet" and "show_prices" not in template_settings:
        template_settings["show_prices"] = False
    
    # Calculate totals from order items
    subtotal = sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in order_items)
    
    # Get discount/tax from proposal if available
    discount_percent = proposal.get("discount_percent", 0) if proposal else 0
    tax_percent = proposal.get("tax_percent", company.get("default_tax_rate", 0) if company else 0) if proposal else 0
    
    discount_amount = subtotal * (discount_percent / 100)
    taxable_amount = subtotal - discount_amount
    tax_amount = taxable_amount * (tax_percent / 100)
    total = taxable_amount + tax_amount
    
    # Check if multi-day event
    is_multiday = event.get("end_date") and event.get("event_date") != event.get("end_date")
    
    # Aggregate allergens across all recipe-linked Food items (for proposal/quote/contract PDFs)
    aggregated_allergen_ids = set()
    for item in order_items:
        if item.get("item_type") != "Food" or not item.get("reference_id"):
            continue
        rec = await db.recipes.find_one(
            {"recipe_id": item["reference_id"], "company_id": user.company_id},
            {"_id": 0, "allergens": 1},
        )
        for aid in (rec or {}).get("allergens", []) or []:
            aggregated_allergen_ids.add(aid)
    # Also include legacy recipes pulled from event.menu_items
    for rec in recipes:
        for aid in rec.get("allergens", []) or []:
            aggregated_allergen_ids.add(aid)
    
    # Resolve allergen ids → names for display in the PDF
    allergen_list = []
    if aggregated_allergen_ids:
        allergen_docs = await db.allergen_configs.find(
            {"allergen_id": {"$in": list(aggregated_allergen_ids)}},
            {"_id": 0, "allergen_id": 1, "name": 1, "name_es": 1, "icon": 1},
        ).to_list(50)
        allergen_list = [{
            "allergen_id": a.get("allergen_id"),
            "name": a.get("name"),
            "name_es": a.get("name_es") or a.get("name"),
            "icon": a.get("icon"),
        } for a in allergen_docs]
    
    content = {
        "event": event,
        "client": client,
        "company": company,
        "recipes": recipes,  # Legacy
        "order_items": order_items,  # New: all items
        "items_by_type": items_by_type,  # Grouped by type
        "items_by_day": items_by_day,  # Grouped by day
        "day_logistics": (proposal or {}).get("day_logistics") or [],  # Per-date delivery info
        "is_multiday": is_multiday,
        "template_settings": template_settings,
        "section_titles": section_titles,
        "allergens": allergen_list,  # NEW: aggregated allergens across all recipes
        "financials": {
            "subtotal": subtotal,
            "discount_percent": discount_percent,
            "discount_amount": discount_amount,
            "tax_percent": tax_percent,
            "tax_amount": tax_amount,
            "total": total
        },
        "generated_at": now.isoformat()
    }
    
    # Add terms and conditions based on document type and language
    lang = company.get("default_language", "en") if company else "en"
    terms_key_map = {
        "quote": f"terms_proposal_{lang}",
        "proposal": f"terms_proposal_{lang}",
        "invoice": f"terms_invoice_{lang}",
        "contract": f"terms_contract_{lang}",
    }
    terms_key = terms_key_map.get(doc_type)
    if terms_key and company:
        content["terms_and_conditions"] = company.get(terms_key, "")
        content["payment_terms"] = company.get("payment_terms_default", "")
    
    # Add bank account information for invoices and quotes
    if company and doc_type in ["quote", "proposal", "invoice"]:
        content["bank_info"] = {
            "bank_name": company.get("bank_name", ""),
            "account_number": company.get("bank_account_number", ""),
            "account_type": company.get("bank_account_type", ""),
            "routing_number": company.get("bank_routing_number", ""),
            "beneficiary": company.get("bank_beneficiary", ""),
            "notes": company.get("bank_notes", "")
        }
    
    titles = {
        "contract": "Contract", "beo": "Banquet Event Order", "kitchen_sheet": "Kitchen Production Sheet",
        "packing_list": "Packing/Setup List", "mise_en_place": "Mise en Place Checklist",
        "quote": "Event Proposal", "invoice": "Invoice", "menu": "Menu"
    }
    titles_es = {
        "contract": "Contrato", "beo": "Orden de Evento de Banquete", "kitchen_sheet": "Hoja de Cocina",
        "packing_list": "Lista de Montaje", "mise_en_place": "Mise en Place",
        "quote": "Propuesta", "invoice": "Factura", "menu": "Menú"
    }
    
    lang = company.get("default_language", "en") if company else "en"
    title_dict = titles_es if lang == "es" else titles
    
    doc = {
        "document_id": document_id,
        "company_id": user.company_id,
        "event_id": event_id,
        "document_type": doc_type,
        "title": f"{title_dict.get(doc_type, doc_type)} - {event['name']}",
        "content": content,
        "signature": None,
        "signed_at": None,
        "signed_by": None,
        "status": "draft",
        "requires_signature": doc_type in ["contract", "quote"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.documents.insert_one(doc)
    
    await db.events.update_one(
        {"event_id": event_id},
        {"$push": {"documents": {"document_id": document_id, "type": doc_type, "title": doc["title"]}}}
    )
    
    del doc["_id"]
    doc["created_at"] = now
    doc["updated_at"] = now
    return Document(**doc)

@documents_router.post("/{document_id}/regenerate")
async def regenerate_document(document_id: str, user: User = Depends(get_current_user)):
    """Regenerate a document with current event/proposal data"""
    # Get existing document
    existing_doc = await db.documents.find_one(
        {"document_id": document_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not existing_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    event_id = existing_doc.get("event_id")
    doc_type = existing_doc.get("document_type")
    
    if not event_id:
        raise HTTPException(status_code=400, detail="Document has no linked event")
    
    # Get current event data
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0})
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    
    # Get current proposal and order items
    proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    order_items = []
    if proposal:
        order_items = await db.order_items.find(
            {"proposal_id": proposal["proposal_id"]},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(500)
    
    # Get categories
    categories = await db.item_categories.find(
        {"company_id": user.company_id}, {"_id": 0}
    ).to_list(100)
    cat_map = {c["category_id"]: c["name"] for c in categories}
    
    # Organize items by day and type
    items_by_day = {}
    items_by_type = {"Food": [], "Service": [], "Rental": [], "Fee": [], "Other": []}
    
    for item in order_items:
        item_type = item.get("item_type", "Other")
        event_day = item.get("event_date") or "main"
        
        if item.get("category_id"):
            item["category_name"] = cat_map.get(item["category_id"], "")
        
        if item_type in items_by_type:
            items_by_type[item_type].append(item)
        else:
            items_by_type["Other"].append(item)
        
        if event_day not in items_by_day:
            items_by_day[event_day] = []
        items_by_day[event_day].append(item)
    
    # Calculate totals from order items
    subtotal = sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in order_items)
    
    discount_percent = proposal.get("discount_percent", 0) if proposal else 0
    tax_percent = proposal.get("tax_percent", company.get("default_tax_rate", 0) if company else 0) if proposal else 0
    
    discount_amount = subtotal * (discount_percent / 100)
    taxable_amount = subtotal - discount_amount
    tax_amount = taxable_amount * (tax_percent / 100)
    total = taxable_amount + tax_amount
    
    is_multiday = event.get("end_date") and event.get("event_date") != event.get("end_date")
    
    now = datetime.now(timezone.utc)
    
    # Build new content
    new_content = {
        "event": event,
        "client": client,
        "company": company,
        "recipes": existing_doc.get("content", {}).get("recipes", []),  # Keep legacy recipes
        "order_items": order_items,
        "items_by_type": items_by_type,
        "items_by_day": items_by_day,
        "is_multiday": is_multiday,
        "template_settings": existing_doc.get("content", {}).get("template_settings", {}),
        "financials": {
            "subtotal": subtotal,
            "discount_percent": discount_percent,
            "discount_amount": discount_amount,
            "tax_percent": tax_percent,
            "tax_amount": tax_amount,
            "total": total
        },
        "generated_at": now.isoformat(),
        "regenerated_at": now.isoformat(),
        "previous_generated_at": existing_doc.get("content", {}).get("generated_at")
    }
    
    # Update the document
    await db.documents.update_one(
        {"document_id": document_id},
        {"$set": {
            "content": new_content,
            "updated_at": now.isoformat()
        }}
    )
    
    # Return updated document
    updated_doc = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    return updated_doc

# ============== FINANCE ROUTES ==============

@finance_router.get("/invoices")
async def get_invoices(invoice_type: str = "client", status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get invoices (client or supplier)"""
    query = {"company_id": user.company_id, "invoice_type": invoice_type}
    if status:
        query["status"] = status
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return invoices

@finance_router.post("/invoices")
async def create_invoice(data: InvoiceCreate, user: User = Depends(get_current_user)):
    """Create a client invoice"""
    now = datetime.now(timezone.utc)
    invoice_id = f"inv_{uuid.uuid4().hex[:12]}"
    invoice_number = f"INV-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:4].upper()}"
    
    # Calculate totals
    subtotal = 0
    lines = []
    for line in data.lines:
        line_subtotal = line.quantity * line.unit_price
        line_discount = line_subtotal * (line.discount_percent / 100)
        line_taxable = line_subtotal - line_discount
        line_tax = line_taxable * (line.tax_rate / 100)
        line_total = line_taxable + line_tax
        
        lines.append({
            **line.model_dump(),
            "line_subtotal": line_subtotal,
            "line_discount": line_discount,
            "line_tax": line_tax,
            "line_total": line_total
        })
        subtotal += line_subtotal
    
    # Apply invoice-level discount and tax
    invoice_discount = subtotal * (data.discount_percent / 100)
    taxable = subtotal - invoice_discount
    invoice_tax = taxable * (data.tax_rate / 100)
    total = taxable + invoice_tax
    
    invoice_doc = {
        "invoice_id": invoice_id,
        "invoice_number": invoice_number,
        "company_id": user.company_id,
        "invoice_type": "client",
        "client_id": data.client_id,
        "event_id": data.event_id,
        "issue_date": now.isoformat(),
        "due_date": data.due_date.isoformat(),
        "lines": lines,
        "subtotal": subtotal,
        "discount_percent": data.discount_percent,
        "discount_amount": invoice_discount,
        "tax_rate": data.tax_rate,
        "tax_amount": invoice_tax,
        "total": total,
        "amount_paid": 0,
        "balance_due": total,
        "status": "draft",
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.invoices.insert_one(invoice_doc)
    del invoice_doc["_id"]
    return invoice_doc

@finance_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, data: dict, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    
    # Allow editing these fields
    allowed_fields = [
        "status", "notes", "due_date", "issue_date", "invoice_type", "subtotal", 
        "tax_rate", "tax_amount", "discount_percent", "discount_amount", 
        "total", "lines", "terms", "payment_terms"
    ]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    update_data["updated_at"] = now.isoformat()
    
    # Convert date strings to proper datetime format
    if "issue_date" in update_data and update_data["issue_date"]:
        try:
            # Handle date string (YYYY-MM-DD)
            if isinstance(update_data["issue_date"], str) and len(update_data["issue_date"]) == 10:
                update_data["issue_date"] = datetime.fromisoformat(update_data["issue_date"] + "T00:00:00+00:00").isoformat()
        except Exception:
            pass
    
    if "due_date" in update_data and update_data["due_date"]:
        try:
            if isinstance(update_data["due_date"], str) and len(update_data["due_date"]) == 10:
                update_data["due_date"] = datetime.fromisoformat(update_data["due_date"] + "T00:00:00+00:00").isoformat()
        except Exception:
            pass
    
    # Recalculate balance_due if total changed
    if "total" in update_data:
        invoice = await db.invoices.find_one(
            {"invoice_id": invoice_id, "company_id": user.company_id},
            {"_id": 0, "amount_paid": 1}
        )
        if invoice:
            amount_paid = invoice.get("amount_paid", 0)
            update_data["balance_due"] = update_data["total"] - amount_paid
    
    result = await db.invoices.update_one(
        {"invoice_id": invoice_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice updated"}

@finance_router.post("/supplier-invoices")
async def create_supplier_invoice(data: dict, user: User = Depends(get_current_user)):
    """Create a supplier invoice (accounts payable)"""
    now = datetime.now(timezone.utc)
    invoice_id = f"sinv_{uuid.uuid4().hex[:12]}"
    
    invoice_doc = {
        "invoice_id": invoice_id,
        "company_id": user.company_id,
        "invoice_type": "supplier",
        "supplier_id": data.get("supplier_id"),
        "supplier_invoice_number": data.get("supplier_invoice_number"),
        "issue_date": data.get("issue_date", now.isoformat()),
        "due_date": data.get("due_date"),
        "category": data.get("category", "food"),
        "lines": data.get("lines", []),
        "subtotal": data.get("subtotal", 0),
        "tax_amount": data.get("tax_amount", 0),
        "total": data.get("total", 0),
        "amount_paid": 0,
        "balance_due": data.get("total", 0),
        "status": "pending",
        "linked_po_id": data.get("linked_po_id"),
        "notes": data.get("notes"),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.invoices.insert_one(invoice_doc)
    del invoice_doc["_id"]
    return invoice_doc

@finance_router.post("/payments")
async def create_payment(data: PaymentCreate, user: User = Depends(get_current_user)):
    """Record a payment"""
    now = datetime.now(timezone.utc)
    payment_id = f"pay_{uuid.uuid4().hex[:12]}"
    
    # Get invoice
    invoice = await db.invoices.find_one({"invoice_id": data.invoice_id, "company_id": user.company_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    payment_doc = {
        "payment_id": payment_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "payment_date": now.isoformat(),
        "created_at": now.isoformat()
    }
    await db.payments.insert_one(payment_doc)
    
    # Update invoice
    new_amount_paid = invoice.get("amount_paid", 0) + data.amount
    new_balance = invoice.get("total", 0) - new_amount_paid
    new_status = "paid" if new_balance <= 0 else "partially_paid"
    
    await db.invoices.update_one(
        {"invoice_id": data.invoice_id},
        {"$set": {"amount_paid": new_amount_paid, "balance_due": max(0, new_balance), "status": new_status, "updated_at": now.isoformat()}}
    )
    
    del payment_doc["_id"]
    return payment_doc

@finance_router.get("/payments")
async def get_payments(payment_type: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if payment_type:
        query["payment_type"] = payment_type
    
    payments = await db.payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments

@finance_router.get("/summary")
async def get_finance_summary(user: User = Depends(get_current_user)):
    """Get financial summary dashboard"""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Accounts Receivable
    ar_pipeline = [
        {"$match": {"company_id": user.company_id, "invoice_type": "client", "status": {"$nin": ["paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$balance_due"}}}
    ]
    ar_result = await db.invoices.aggregate(ar_pipeline).to_list(1)
    total_ar = ar_result[0]["total"] if ar_result else 0
    
    # Accounts Payable
    ap_pipeline = [
        {"$match": {"company_id": user.company_id, "invoice_type": "supplier", "status": {"$nin": ["paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$balance_due"}}}
    ]
    ap_result = await db.invoices.aggregate(ap_pipeline).to_list(1)
    total_ap = ap_result[0]["total"] if ap_result else 0
    
    # Cash received this month
    cash_in_pipeline = [
        {"$match": {"company_id": user.company_id, "payment_type": "incoming", "payment_date": {"$gte": month_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    cash_in_result = await db.payments.aggregate(cash_in_pipeline).to_list(1)
    cash_in = cash_in_result[0]["total"] if cash_in_result else 0
    
    # Cash paid this month
    cash_out_pipeline = [
        {"$match": {"company_id": user.company_id, "payment_type": "outgoing", "payment_date": {"$gte": month_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    cash_out_result = await db.payments.aggregate(cash_out_pipeline).to_list(1)
    cash_out = cash_out_result[0]["total"] if cash_out_result else 0
    
    return {
        "total_accounts_receivable": total_ar,
        "total_accounts_payable": total_ap,
        "cash_received_this_month": cash_in,
        "cash_paid_this_month": cash_out,
        "net_cash_flow": cash_in - cash_out
    }

@finance_router.get("/aging")
async def get_aging_report(invoice_type: str = "client", user: User = Depends(get_current_user)):
    """Get aging report for receivables or payables"""
    now = datetime.now(timezone.utc)
    
    invoices = await db.invoices.find({
        "company_id": user.company_id,
        "invoice_type": invoice_type,
        "status": {"$nin": ["paid"]}
    }, {"_id": 0}).to_list(1000)
    
    aging = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    
    for inv in invoices:
        due_date = datetime.fromisoformat(inv["due_date"]) if isinstance(inv.get("due_date"), str) else inv.get("due_date")
        if not due_date:
            continue
        
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
        
        days_overdue = (now - due_date).days
        balance = inv.get("balance_due", 0)
        
        if days_overdue <= 30:
            aging["0-30"] += balance
        elif days_overdue <= 60:
            aging["31-60"] += balance
        elif days_overdue <= 90:
            aging["61-90"] += balance
        else:
            aging["90+"] += balance
    
    return aging

# ============== REPORTS ROUTES ==============

@reports_router.get("/recipe-costs")
async def get_recipe_cost_report(user: User = Depends(get_current_user)):
    """Get recipe cost dashboard - top cost drivers"""
    recipes = await db.recipes.find({"company_id": user.company_id}, {"_id": 0}).sort("total_cost", -1).limit(20).to_list(20)
    return recipes

@reports_router.get("/price-changes")
async def get_price_change_log(user: User = Depends(get_current_user)):
    """Get ingredient price change history"""
    ingredients = await db.ingredients.find(
        {"company_id": user.company_id, "price_history.1": {"$exists": True}},
        {"_id": 0, "ingredient_id": 1, "name": 1, "price_history": 1}
    ).to_list(100)
    return ingredients

@reports_router.get("/event-costs/{event_id}")
async def get_event_cost_summary(event_id: str, user: User = Depends(get_current_user)):
    """Get cost summary for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get menu costs
    menu_costs = []
    total_food_cost = 0
    for recipe_id in event.get("menu_items", []):
        recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
        if recipe:
            cost = recipe.get("cost_per_portion", 0) * event.get("guest_count", 1)
            menu_costs.append({"name": recipe["name"], "cost": cost})
            total_food_cost += cost
    
    # Get invoices for event
    invoices = await db.invoices.find({"event_id": event_id, "invoice_type": "client"}, {"_id": 0}).to_list(10)
    total_revenue = sum(inv.get("total", 0) for inv in invoices)
    
    return {
        "event": event,
        "menu_costs": menu_costs,
        "total_food_cost": total_food_cost,
        "total_revenue": total_revenue,
        "gross_profit": total_revenue - total_food_cost,
        "food_cost_percent": (total_food_cost / total_revenue * 100) if total_revenue > 0 else 0
    }

@reports_router.get("/supplier-spend")
async def get_supplier_spend(user: User = Depends(get_current_user)):
    """Get monthly spend by supplier"""
    pipeline = [
        {"$match": {"company_id": user.company_id, "invoice_type": "supplier"}},
        {"$group": {"_id": "$supplier_id", "total_spend": {"$sum": "$total"}, "invoice_count": {"$sum": 1}}}
    ]
    result = await db.invoices.aggregate(pipeline).to_list(100)
    return result

# ============== SETTINGS ROUTES ==============

@settings_router.get("/company", response_model=Company)
async def get_company_settings(user: User = Depends(get_current_user)):
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if isinstance(company.get("created_at"), str):
        company["created_at"] = datetime.fromisoformat(company["created_at"])
    if "default_tax_rate" not in company:
        company["default_tax_rate"] = 0.0
    # Default proposal item types if not set
    if "proposal_item_types" not in company or not company["proposal_item_types"]:
        company["proposal_item_types"] = [
            {"type_key": "Food", "label_en": "Food & Beverages", "label_es": "Alimentos y Bebidas", "color": "#22c55e", "icon": "Utensils", "is_active": True, "sort_order": 0},
            {"type_key": "Service", "label_en": "Services & Staff", "label_es": "Servicios y Personal", "color": "#3b82f6", "icon": "Users", "is_active": True, "sort_order": 1},
            {"type_key": "Rental", "label_en": "Rentals & Equipment", "label_es": "Alquileres y Equipos", "color": "#f59e0b", "icon": "Armchair", "is_active": True, "sort_order": 2},
            {"type_key": "Fee", "label_en": "Fees & Charges", "label_es": "Cargos y Tarifas", "color": "#8b5cf6", "icon": "DollarSign", "is_active": True, "sort_order": 3},
        ]
    return Company(**company)

@settings_router.post("/upload-banner")
async def upload_lead_form_banner(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload a lead-form banner image. Returns a base64 data URL the caller
    can drop straight into the form's `banner_url`. Same pattern as the
    company-logo uploader. Cap: 3 MB, common image MIME types."""
    import base64
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG, PNG, WebP, GIF or SVG")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB")
    data_url = f"data:{file.content_type};base64,{base64.b64encode(content).decode('utf-8')}"
    return {"banner_url": data_url, "size_bytes": len(content), "content_type": file.content_type}


@settings_router.post("/company/logo")
async def upload_company_logo(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload company logo - stores as base64 in database for persistence"""
    import base64
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG, PNG, WebP or SVG")
    
    # Read file content
    content = await file.read()
    
    # Check file size (max 2MB)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 2MB")
    
    # Convert to base64 data URL
    base64_content = base64.b64encode(content).decode('utf-8')
    logo_data_url = f"data:{file.content_type};base64,{base64_content}"
    
    # Update company logo_url with base64 data URL
    await db.companies.update_one(
        {"company_id": user.company_id},
        {"$set": {"logo_url": logo_data_url}}
    )
    
    return {"logo_url": logo_data_url}


@settings_router.post("/company/signature")
async def upload_company_signature(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload an authorized signatory's signature image (PNG with transparent
    background recommended). Stored as base64 data URL on the company doc.
    Embedded at the bottom of every generated document (proposal, BEO,
    delivery note, etc.) above the signature line.
    """
    import base64
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG, PNG or WebP")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 2MB")
    data_url = f"data:{file.content_type};base64,{base64.b64encode(content).decode('utf-8')}"
    await db.companies.update_one(
        {"company_id": user.company_id},
        {"$set": {"signature_image_url": data_url}},
    )
    return {"signature_image_url": data_url}


@settings_router.post("/company/stamp")
async def upload_company_stamp(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload the company seal/stamp image. PNG with transparent background
    recommended so it overlays cleanly on top of the signature line.
    """
    import base64
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG, PNG or WebP")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 2MB")
    data_url = f"data:{file.content_type};base64,{base64.b64encode(content).decode('utf-8')}"
    await db.companies.update_one(
        {"company_id": user.company_id},
        {"$set": {"stamp_image_url": data_url}},
    )
    return {"stamp_image_url": data_url}


@settings_router.put("/company")
async def update_company_settings(data: dict, user: User = Depends(get_current_user)):
    allowed_fields = [
        "name", "logo_url", "primary_color", "secondary_color", "default_language", 
        "currency", "default_tax_rate", "time_format", "proposal_item_types",
        # Business Information Fields
        "legal_name", "trade_name", "tax_id", "email", "phone", "website",
        # Location Information
        "address", "city", "state", "country", "postal_code",
        # Additional Business Data
        "tax_regime", "industry_sector", "employee_count", "decimal_precision", "decimal_separator",
        # Terms & Conditions
        "terms_proposal_es", "terms_proposal_en", "terms_invoice_es", "terms_invoice_en",
        "terms_contract_es", "terms_contract_en", "payment_terms_default",
        # Bank Account Information
        "bank_name", "bank_account_number", "bank_account_type", "bank_routing_number",
        "bank_beneficiary", "bank_notes",
        # Public Catalog
        "catalog_slug", "catalog_published", "catalog_headline",
        "catalog_description", "catalog_hero_image_url", "catalog_show_prices",
        # Document signature & stamp (appended to PDFs / preview of every doc)
        "signature_image_url", "stamp_image_url",
        "signatory_name", "signatory_title",
        # Recipe Costing Configuration (Sprint P0)
        "chef_hourly_rate", "recipe_overhead_percent", "recipe_target_food_cost_percent",
        "recipe_target_prime_cost_percent", "recipe_target_gross_margin_percent",
    ]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}

    # Normalize / validate catalog_slug (lowercase, alphanumeric+dashes only) and uniqueness
    if "catalog_slug" in update_data and update_data["catalog_slug"]:
        slug = (update_data["catalog_slug"] or "").strip().lower()
        slug = re.sub(r"[^a-z0-9-]+", "-", slug).strip("-")
        if len(slug) < 3:
            raise HTTPException(status_code=400, detail="catalog_slug must be at least 3 chars")
        existing = await db.companies.find_one(
            {"catalog_slug": slug, "company_id": {"$ne": user.company_id}},
            {"_id": 0, "company_id": 1},
        )
        if existing:
            raise HTTPException(status_code=409, detail=f"Slug '{slug}' is already taken")
        update_data["catalog_slug"] = slug
    
    # Auto-sync the company display name with trade_name or legal_name
    if "trade_name" in update_data and update_data["trade_name"]:
        update_data["name"] = update_data["trade_name"]
    elif "legal_name" in update_data and update_data["legal_name"] and "name" not in update_data:
        update_data["name"] = update_data["legal_name"]
    
    result = await db.companies.update_one({"company_id": user.company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    return await get_company_settings(user)

@settings_router.get("/templates")
async def get_templates(user: User = Depends(get_current_user)):
    templates = await db.templates.find({"company_id": user.company_id}, {"_id": 0}).to_list(100)
    return templates

@settings_router.post("/templates")
async def create_template(data: dict, user: User = Depends(get_current_user)):
    template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    template_doc = {
        "template_id": template_id,
        "company_id": user.company_id,
        "name": data.get("name"),
        "type": data.get("type"),
        "settings": data.get("settings", {}),
        "content": data.get("content", {}),
        "created_at": now.isoformat()
    }
    await db.templates.insert_one(template_doc)
    del template_doc["_id"]
    return template_doc

@settings_router.put("/templates/{template_id}")
async def update_template(template_id: str, data: dict, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    update_data = {"name": data.get("name"), "settings": data.get("settings", {}), "content": data.get("content", {}), "updated_at": now.isoformat()}
    
    result = await db.templates.update_one({"template_id": template_id, "company_id": user.company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template updated"}

@settings_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: User = Depends(get_current_user)):
    result = await db.templates.delete_one({"template_id": template_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}

@settings_router.get("/document-types")
async def get_document_types(user: User = Depends(get_current_user)):
    """Get available document types based on organization's industry template"""
    from models.organization_config import (
        get_document_types_for_industry, 
        IndustryTemplate,
        CLIENT_FACING_DOCUMENTS,
        INTERNAL_DOCUMENTS_BY_INDUSTRY
    )
    
    # Get org config to determine industry
    org_config = await db.organization_configs.find_one({"company_id": user.company_id}, {"_id": 0})
    industry = IndustryTemplate.EVENTS_HOSPITALITY  # default
    if org_config and org_config.get("industry_template"):
        try:
            industry = IndustryTemplate(org_config["industry_template"])
        except ValueError:
            pass
    
    # Get document types for this industry
    all_doc_types = get_document_types_for_industry(industry)
    
    # Format for API response
    doc_types = []
    for doc in all_doc_types:
        doc_types.append({
            "type": doc["key"],
            "name": doc["name_en"],
            "name_es": doc["name_es"],
            "category": doc["category"],
            "requires_signature": doc.get("requires_signature", False),
            "show_prices": doc["category"] == "client_facing",
            "description": doc.get("description_en"),
            "description_es": doc.get("description_es"),
        })
    
    # Check for custom templates
    templates = await db.templates.find({"company_id": user.company_id}, {"_id": 0}).to_list(100)
    templates_by_type = {t["type"]: t for t in templates}
    
    for dt in doc_types:
        if dt["type"] in templates_by_type:
            dt["custom_settings"] = templates_by_type[dt["type"]].get("settings", {})
            dt["template_id"] = templates_by_type[dt["type"]]["template_id"]
    
    return {
        "industry": industry.value,
        "document_types": doc_types,
        "client_facing": [d for d in doc_types if d["category"] == "client_facing"],
        "internal": [d for d in doc_types if d["category"] == "internal"],
    }

# ============== CLIENT PORTAL ROUTES ==============

# ============== PUBLIC CATALOG ROUTES (no auth required) ==============

@public_catalog_router.get("/catalog/{slug}")
async def get_public_catalog(slug: str):
    """Public catalog page — returns company info, recipes on menu, and active packages.
    No authentication required. Only published catalogs are exposed."""
    company = await db.companies.find_one(
        {"catalog_slug": slug, "catalog_published": True},
        {"_id": 0},
    )
    if not company:
        raise HTTPException(status_code=404, detail="Catalog not found or not published")

    cid = company["company_id"]
    # Recipes on the base menu (with photos + portion formats for richer cards)
    recipes_cursor = db.recipes.find(
        {"company_id": cid, "is_on_menu": True},
        {
            "_id": 0, "recipe_id": 1, "name": 1, "name_es": 1, "description": 1, "description_es": 1,
            "category": 1, "work_category": 1, "photo_url": 1, "image_url": 1, "allergens": 1,
            "dietary_tags": 1, "cost_per_portion": 1, "default_portion_price": 1, "sell_price": 1,
            "yield_unit": 1, "portion_unit": 1,
        },
    ).sort("name", 1)
    recipes = await recipes_cursor.to_list(200)

    # Enrich each recipe with its portion formats for size + price tiers
    enriched_recipes = []
    for r in recipes:
        formats = await db.recipe_portion_formats.find(
            {"recipe_id": r["recipe_id"], "company_id": cid},
            {"_id": 0, "format_id": 1, "format_name": 1, "portion_unit": 1, "sell_price": 1, "suggested_price": 1, "is_default": 1},
        ).sort("is_default", -1).to_list(20)
        r["portion_formats"] = formats
        # Hide internal cost
        r.pop("cost_per_portion", None)
        enriched_recipes.append(r)

    # Active menus / packages
    menus = await db.menus.find(
        {"company_id": cid, "is_active": True},
        {
            "_id": 0, "menu_id": 1, "name": 1, "name_es": 1, "description": 1, "description_es": 1,
            "menu_type": 1, "items": 1, "variants": 1, "default_price": 1, "is_fixed_price": 1,
            "total_price": 1, "total_cost": 1,
        },
    ).to_list(50)
    # Hide total_cost (internal)
    for m in menus:
        m.pop("total_cost", None)

    # Allergen reference for display
    allergen_ids = set()
    for r in enriched_recipes:
        for aid in r.get("allergens", []) or []:
            allergen_ids.add(aid)
    allergen_docs = []
    if allergen_ids:
        allergen_docs = await db.allergen_configs.find(
            {"allergen_id": {"$in": list(allergen_ids)}},
            {"_id": 0, "allergen_id": 1, "name": 1, "name_es": 1, "icon": 1},
        ).to_list(50)

    show_prices = company.get("catalog_show_prices", True)

    return {
        "company": {
            "name": company.get("trade_name") or company.get("name"),
            "legal_name": company.get("legal_name"),
            "logo_url": company.get("logo_url"),
            "primary_color": company.get("primary_color"),
            "secondary_color": company.get("secondary_color"),
            "email": company.get("email"),
            "phone": company.get("phone"),
            "website": company.get("website"),
            "address": company.get("address"),
            "city": company.get("city"),
            "country": company.get("country"),
            "default_language": company.get("default_language") or "en",
        },
        "catalog": {
            "headline": company.get("catalog_headline"),
            "description": company.get("catalog_description"),
            "hero_image_url": company.get("catalog_hero_image_url"),
            "show_prices": show_prices,
            "slug": slug,
        },
        "recipes": enriched_recipes,
        "menus": menus,
        "allergens": allergen_docs,
    }


@public_catalog_router.post("/catalog/{slug}/quote-request")
async def submit_public_quote_request(slug: str, payload: Dict[str, Any]):
    """Create a Lead in the catalog owner's CRM from a public visitor request.
    Also returns WhatsApp click-to-chat links (visitor→company and company→visitor)
    so both sides can continue the conversation instantly. NO Communications are
    auto-created — that would inflate the salesperson's Performance Dashboard.
    """
    company = await db.companies.find_one(
        {"catalog_slug": slug, "catalog_published": True},
        {"_id": 0, "company_id": 1, "name": 1, "trade_name": 1, "phone": 1, "whatsapp": 1},
    )
    if not company:
        raise HTTPException(status_code=404, detail="Catalog not found")

    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    if not name or not email:
        raise HTTPException(status_code=400, detail="name and email are required")

    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    interest_items = payload.get("interest_items") or []  # [{type:'recipe'|'menu', id, name}]
    notes_parts = [
        f"Solicitud desde Catálogo Público ({slug})",
        f"Fecha del evento: {payload.get('event_date') or 'No especificada'}",
        f"# de invitados: {payload.get('guest_count') or 'N/A'}",
        f"Tipo de evento: {payload.get('event_type') or 'N/A'}",
        f"Mensaje: {payload.get('message') or '—'}",
    ]
    if interest_items:
        names = ", ".join([i.get("name", "?") for i in interest_items[:8]])
        notes_parts.append(f"Interesado en: {names}")

    doc = {
        "lead_id": lead_id,
        "company_id": company["company_id"],
        "name": name,
        "email": email,
        "phone": phone or None,
        "whatsapp": phone or None,  # let the user choose later but pre-fill from form
        "company_name": payload.get("company_name") or None,
        "source": "public_catalog",
        "source_detail": slug,
        "stage": "new",
        "status": "active",
        "estimated_value": None,
        "event_date_tbd": True,
        "notes": "\n".join(notes_parts),
        "tags": ["catalog"],
        "interest_items": interest_items,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.leads.insert_one(doc)

    # Helpers — build wa.me links without external dependencies
    def _wa_link(number: Optional[str], message: str) -> Optional[str]:
        if not number:
            return None
        digits = "".join(c for c in str(number) if c.isdigit())
        if not digits:
            return None
        encoded = message.replace(" ", "%20").replace("\n", "%0A")
        return f"https://wa.me/{digits}?text={encoded}"

    company_display = company.get("trade_name") or company.get("name") or "us"
    visitor_to_company_msg = (
        f"Hola {company_display}, soy {name}. "
        f"Acabo de enviar una solicitud de cotización por su catálogo en línea"
        f"{(' para el ' + payload.get('event_date')) if payload.get('event_date') else ''}"
        f". ¿Podemos coordinar?"
    )
    company_to_visitor_msg = (
        f"Hola {name}, soy de {company_display}. Recibimos tu solicitud de cotización"
        f"{(' para el ' + payload.get('event_date')) if payload.get('event_date') else ''}"
        f". ¡Gracias! Te contactamos pronto."
    )
    visitor_wa_link = _wa_link(company.get("whatsapp") or company.get("phone"), visitor_to_company_msg)
    owner_wa_link = _wa_link(phone, company_to_visitor_msg)

    # Notify the company's admins inside the app (NO communications row created)
    try:
        from routers.notifications import notify_org_admins
        await notify_org_admins(
            org_id=company["company_id"],
            notification_type="catalog_quote_request",
            title=f"Nueva solicitud desde el catálogo — {name}",
            message=f"{name} ({email}{', ' + phone if phone else ''}) solicitó cotización"
                    + (f" para {payload.get('guest_count')} invitados" if payload.get("guest_count") else "")
                    + (f" el {payload.get('event_date')}" if payload.get("event_date") else "")
                    + ".",
            link=f"/client-engagement?lead={lead_id}",
            metadata={
                "lead_id": lead_id,
                "source": "public_catalog",
                "owner_wa_link": owner_wa_link,
                "interest_count": len(interest_items),
            },
            priority="high",
        )
    except Exception as _e:
        logger.warning(f"Catalog notification failed (non-fatal): {_e}")

    return {
        "ok": True,
        "message": "Quote request received",
        "lead_id": lead_id,
        "whatsapp": {
            "visitor_link": visitor_wa_link,  # visitor → company (shown on the public page)
            "owner_link": owner_wa_link,       # company admin → visitor (shown inside CRM)
        },
    }


@portal_router.get("/document/{document_id}")
async def get_portal_document(document_id: str, token: Optional[str] = None):
    doc = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    for field in ["created_at", "updated_at", "signed_at"]:
        if doc.get(field) and isinstance(doc[field], str):
            doc[field] = datetime.fromisoformat(doc[field])
    return doc

@portal_router.post("/document/{document_id}/sign")
async def client_sign_document(document_id: str, data: dict, request: Request):
    """Client-facing signature capture. Saves the drawn signature data URL,
    signer name, optional email, IP and User-Agent for audit trail. Marks
    the document as 'signed'.

    For proposal/quote documents this also propagates the signature onto the
    underlying proposal record so the admin sees the client's actual approval
    on the proposal preview.
    """
    now = datetime.now(timezone.utc)
    signature = data.get("signature")
    signed_by = data.get("signed_by", "Client")
    signed_email = (data.get("signed_email") or "").strip() or None
    # Behind an ingress/proxy the request.client.host is the internal cluster
    # IP. Honour X-Forwarded-For (first hop = real client) when present so the
    # audit record matches the actual signer.
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_ip = xff or (request.client.host if request.client else None)
    user_agent = request.headers.get("user-agent")

    update = {
        "signature": signature,
        "signed_at": now.isoformat(),
        "signed_by": signed_by,
        "signed_email": signed_email,
        "signed_ip": client_ip,
        "signed_user_agent": user_agent,
        "status": "signed",
        "updated_at": now.isoformat(),
    }
    result = await db.documents.update_one(
        {"document_id": document_id},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    # Propagate to the linked proposal so admin preview shows the actual
    # client-captured signature in the "Firma del cliente" block.
    doc = await db.documents.find_one(
        {"document_id": document_id},
        {"_id": 0, "proposal_id": 1, "document_type": 1, "event_id": 1}
    )
    if doc and doc.get("document_type") in ("proposal", "quote"):
        # Prefer the explicit proposal_id on the document; fall back to a
        # lookup by event_id so legacy generated docs (which never set
        # proposal_id) still propagate the client approval correctly.
        proposal_id = doc.get("proposal_id")
        if not proposal_id and doc.get("event_id"):
            linked = await db.proposals.find_one(
                {"event_id": doc["event_id"]},
                {"_id": 0, "proposal_id": 1},
            )
            if linked:
                proposal_id = linked.get("proposal_id")
        if proposal_id:
            await db.proposals.update_one(
                {"proposal_id": proposal_id},
                {"$set": {
                    "client_signature": signature,
                    "client_signed_at": now.isoformat(),
                    "client_signed_by": signed_by,
                    "client_signed_email": signed_email,
                    "client_signed_ip": client_ip,
                    "status": "approved",
                    "updated_at": now.isoformat(),
                }}
            )

    return {"message": "Document signed successfully", "signed_at": now.isoformat()}

@portal_router.get("/event/{event_id}/delivery-notes")
async def get_portal_delivery_notes(event_id: str):
    """Get delivery notes for an event - accessible via client portal"""
    # Get the event to verify it exists
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0, "company_id": 1})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get delivery notes for this event
    notes = await db.delivery_notes.find(
        {"event_id": event_id},
        {"_id": 0}
    ).to_list(length=100)
    
    # Enrich items with photos from inventory
    for note in notes:
        for item in note.get("items", []):
            item_id = item.get("item_id")
            if item_id:
                inv_item = await db.ingredients.find_one(
                    {"ingredient_id": item_id},
                    {"_id": 0, "image_url": 1}
                )
                if inv_item and inv_item.get("image_url"):
                    item["image_url"] = inv_item["image_url"]
    
    return notes

@portal_router.get("/event/{event_id}/all-documents")
async def get_portal_all_documents(event_id: str):
    """Get all documents for an event - accessible via client portal"""
    # Get the event with basic info
    event = await db.events.find_one(
        {"event_id": event_id}, 
        {"_id": 0, "name": 1, "event_date": 1, "client_id": 1, "company_id": 1, "documents": 1, "venue": 1, "guest_count": 1}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get client info
    client = None
    if event.get("client_id"):
        client = await db.clients.find_one(
            {"client_id": event["client_id"]},
            {"_id": 0, "name": 1, "email": 1, "phone": 1}
        )
    
    # Get company info
    company = None
    if event.get("company_id"):
        company = await db.companies.find_one(
            {"company_id": event["company_id"]},
            {"_id": 0, "name": 1, "logo_url": 1, "primary_color": 1}
        )
    
    # Get all documents for this event
    documents = await db.documents.find(
        {"event_id": event_id},
        {"_id": 0}
    ).to_list(length=100)
    
    # Get delivery notes
    delivery_notes = await db.delivery_notes.find(
        {"event_id": event_id},
        {"_id": 0}
    ).to_list(length=100)
    
    # Get event design/blueprint
    blueprint = await db.event_blueprints.find_one(
        {"event_id": event_id},
        {"_id": 0}
    )
    
    return {
        "event": event,
        "client": client,
        "company": company,
        "documents": documents,
        "delivery_notes": delivery_notes,
        "blueprint": blueprint
    }

@portal_router.get("/client/{client_id}/summary")
async def get_client_portal_summary(client_id: str):
    """Get client summary for client portal - all events and documents"""
    # Get client info
    client = await db.clients.find_one(
        {"client_id": client_id},
        {"_id": 0, "client_id": 1, "name": 1, "email": 1, "phone": 1, "company_id": 1}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get company info
    company = None
    if client.get("company_id"):
        company = await db.companies.find_one(
            {"company_id": client["company_id"]},
            {"_id": 0, "name": 1, "logo_url": 1, "primary_color": 1}
        )
    
    # Get all events for this client
    events = await db.events.find(
        {"client_id": client_id},
        {"_id": 0, "event_id": 1, "name": 1, "event_date": 1, "venue": 1, "guest_count": 1, "status": 1}
    ).sort("event_date", -1).to_list(length=100)
    
    # Get event IDs for document lookup
    event_ids = [e["event_id"] for e in events]
    
    # Get all documents for this client's events (client-facing only)
    client_doc_types = ["proposal", "quote", "contract", "invoice", "receipt", "statement"]
    documents = await db.documents.find(
        {"event_id": {"$in": event_ids}, "document_type": {"$in": client_doc_types}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=50)
    
    # Add event name to each document
    event_names = {e["event_id"]: e["name"] for e in events}
    for doc in documents:
        doc["event_name"] = event_names.get(doc.get("event_id"), "")
    
    # Calculate financial summary
    total_billed = 0
    total_paid = 0
    for doc in documents:
        if doc.get("document_type") == "invoice":
            total_billed += doc.get("total", 0) or doc.get("amount", 0) or 0
        if doc.get("document_type") == "receipt":
            total_paid += doc.get("amount", 0) or doc.get("total", 0) or 0
    
    financial_summary = {
        "total_events": len(events),
        "total_billed": total_billed,
        "total_paid": total_paid,
        "outstanding": total_billed - total_paid
    }
    
    return {
        "client": client,
        "company": company,
        "events": events,
        "documents": documents,
        "financial_summary": financial_summary
    }

# ============== DASHBOARD ROUTES ==============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    total_clients = await db.clients.count_documents({"company_id": user.company_id})
    total_events = await db.events.count_documents({"company_id": user.company_id})
    upcoming_events = await db.events.count_documents({"company_id": user.company_id, "event_date": {"$gte": now.isoformat()}})
    total_recipes = await db.recipes.count_documents({"company_id": user.company_id})
    
    low_stock = await db.ingredients.count_documents({
        "company_id": user.company_id,
        "$or": [
            {"$expr": {"$lte": ["$stock_quantity", "$min_stock_level"]}},
            {"$expr": {"$lte": ["$stock_quantity", "$par_level"]}}
        ]
    })
    
    pipeline_stats = {}
    stages = ["lead", "contacted", "proposal", "negotiation", "won", "lost", "converted"]
    for stage in stages:
        count = await db.clients.count_documents({"company_id": user.company_id, "pipeline_stage": stage})
        pipeline_stats[stage] = count
    
    recent_events = await db.events.find({"company_id": user.company_id}, {"_id": 0}).sort("event_date", 1).limit(5).to_list(5)
    
    # NEW: Get tasks due today and overdue from events
    tasks_due_today = []
    tasks_overdue = []
    events_with_tasks = await db.events.find(
        {"company_id": user.company_id, "tasks": {"$exists": True, "$ne": []}},
        {"_id": 0, "event_id": 1, "name": 1, "tasks": 1}
    ).to_list(100)
    
    for event in events_with_tasks:
        for task in event.get("tasks", []):
            if task.get("status") == "completed":
                continue
            due_date = task.get("due_date", "")
            if due_date:
                due_str = due_date[:10] if isinstance(due_date, str) else due_date.strftime("%Y-%m-%d")
                task_entry = {
                    "task_id": task.get("task_id", ""),
                    "title": task.get("title", ""),
                    "due_date": due_str,
                    "event_id": event.get("event_id"),
                    "event_name": event.get("name"),
                    "priority": task.get("priority", "medium"),
                    "assignee": task.get("assignee")
                }
                if due_str == today:
                    tasks_due_today.append(task_entry)
                elif due_str < today:
                    tasks_overdue.append(task_entry)
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    tasks_due_today.sort(key=lambda x: priority_order.get(x.get("priority", "medium"), 1))
    tasks_overdue.sort(key=lambda x: priority_order.get(x.get("priority", "medium"), 1))
    
    # NEW: Get new leads (inbound leads from last 7 days with status "New")
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    new_leads = await db.leads.find(
        {
            "company_id": user.company_id,
            "status": "New",
            "lead_type": {"$in": ["inbound", None]},
            "created_at": {"$gte": seven_days_ago}
        },
        {"_id": 0, "lead_id": 1, "lead_name": 1, "email": 1, "source": 1, "event_type": 1, "created_at": 1}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    new_leads_count = await db.leads.count_documents({
        "company_id": user.company_id,
        "status": "New",
        "lead_type": {"$in": ["inbound", None]}
    })
    
    return {
        "total_clients": total_clients,
        "total_events": total_events,
        "upcoming_events": upcoming_events,
        "total_recipes": total_recipes,
        "low_stock_alerts": low_stock,
        "pipeline_stats": pipeline_stats,
        "recent_events": recent_events,
        "tasks_due_today": tasks_due_today,
        "tasks_overdue": tasks_overdue,
        "tasks_due_count": len(tasks_due_today),
        "tasks_overdue_count": len(tasks_overdue),
        "new_leads": new_leads,
        "new_leads_count": new_leads_count
    }

@api_router.get("/")
async def root():
    return {"message": "EEP Evoque Events Platform API", "version": "2.0.0"}

# ============== ITEM CATEGORIES ROUTES ==============

@settings_router.get("/categories")
async def get_item_categories(user: User = Depends(get_current_user)):
    """Get all item categories for event orders"""
    categories = await db.item_categories.find({"company_id": user.company_id}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    
    # If no custom categories, return defaults
    if not categories:
        defaults = [
            {"category_id": "cat_food", "company_id": user.company_id, "name": "Food", "name_es": "Comida", "color": "#22C55E", "icon": "utensils", "sort_order": 0, "is_default": True},
            {"category_id": "cat_drinks", "company_id": user.company_id, "name": "Drinks", "name_es": "Bebidas", "color": "#3B82F6", "icon": "wine", "sort_order": 1, "is_default": True},
            {"category_id": "cat_rentals", "company_id": user.company_id, "name": "Rentals", "name_es": "Alquiler", "color": "#F59E0B", "icon": "armchair", "sort_order": 2, "is_default": True},
            {"category_id": "cat_labor", "company_id": user.company_id, "name": "Labor/Staff", "name_es": "Personal", "color": "#8B5CF6", "icon": "users", "sort_order": 3, "is_default": True},
            {"category_id": "cat_decor", "company_id": user.company_id, "name": "Décor", "name_es": "Decoración", "color": "#EC4899", "icon": "flower", "sort_order": 4, "is_default": True},
            {"category_id": "cat_other", "company_id": user.company_id, "name": "Other", "name_es": "Otro", "color": "#6B7280", "icon": "package", "sort_order": 5, "is_default": True},
        ]
        # Save defaults
        for cat in defaults:
            cat["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.item_categories.insert_one(cat)
        return defaults
    
    return categories

@settings_router.post("/categories")
async def create_item_category(data: ItemCategoryCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    category_id = f"cat_{uuid.uuid4().hex[:12]}"
    
    cat_doc = {
        "category_id": category_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "is_default": False,
        "created_at": now.isoformat()
    }
    await db.item_categories.insert_one(cat_doc)
    del cat_doc["_id"]
    return cat_doc

@settings_router.put("/categories/{category_id}")
async def update_item_category(category_id: str, data: ItemCategoryCreate, user: User = Depends(get_current_user)):
    result = await db.item_categories.update_one(
        {"category_id": category_id, "company_id": user.company_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category updated"}

@settings_router.delete("/categories/{category_id}")
async def delete_item_category(category_id: str, user: User = Depends(get_current_user)):
    # Allow deleting any category (including defaults) so users can fully customize
    result = await db.item_categories.delete_one({"category_id": category_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

# ============== ITEM TYPES (Configurable per company) ==============

@settings_router.get("/item-types")
async def get_item_types(user: User = Depends(get_current_user)):
    """Get item types for company - defaults to hospitality types if not customized"""
    types = await db.item_types.find({"company_id": user.company_id}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    
    if not types:
        # Return default hospitality types
        default_types = [
            {"type_id": "Food", "company_id": user.company_id, "name": "Food", "name_es": "Comida", "sort_order": 0, "is_default": True},
            {"type_id": "Service", "company_id": user.company_id, "name": "Service", "name_es": "Servicio", "sort_order": 1, "is_default": True},
            {"type_id": "Rental", "company_id": user.company_id, "name": "Rental", "name_es": "Alquiler", "sort_order": 2, "is_default": True},
            {"type_id": "Fee", "company_id": user.company_id, "name": "Fee", "name_es": "Cargo", "sort_order": 3, "is_default": True},
        ]
        # Insert defaults for this company
        for t in default_types:
            await db.item_types.insert_one(t)
        return default_types
    
    return types

class ItemTypeCreate(BaseModel):
    name: str
    name_es: Optional[str] = None
    sort_order: Optional[int] = 0
    is_commissionable: Optional[bool] = True

@settings_router.post("/item-types")
async def create_item_type(data: ItemTypeCreate, user: User = Depends(get_current_user)):
    """Create a new item type"""
    type_id = f"type_{uuid.uuid4().hex[:8]}"
    type_doc = {
        "type_id": type_id,
        "company_id": user.company_id,
        "name": data.name,
        "name_es": data.name_es or data.name,
        "sort_order": data.sort_order,
        "is_default": False,
        "is_commissionable": data.is_commissionable if data.is_commissionable is not None else True
    }
    await db.item_types.insert_one(type_doc)
    return {**type_doc, "_id": None}

@settings_router.put("/item-types/{type_id}")
async def update_item_type(type_id: str, data: ItemTypeCreate, user: User = Depends(get_current_user)):
    """Update an item type"""
    update_data = {
        "name": data.name, 
        "name_es": data.name_es, 
        "sort_order": data.sort_order,
        "is_commissionable": data.is_commissionable if data.is_commissionable is not None else True
    }
    result = await db.item_types.update_one(
        {"type_id": type_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item type not found")
    return {"message": "Item type updated"}

@settings_router.delete("/item-types/{type_id}")
async def delete_item_type(type_id: str, user: User = Depends(get_current_user)):
    """Delete an item type"""
    result = await db.item_types.delete_one({"type_id": type_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item type not found")
    return {"message": "Item type deleted"}

# ============== OPERATIONS SUPPLIES CATEGORIES ==============

@settings_router.get("/ops-categories")
async def get_ops_categories(user: User = Depends(get_current_user)):
    """Get operations supplies categories for company"""
    result = await db.company_settings.find_one({
        "company_id": user.company_id,
        "setting_type": "ops_categories"
    })
    if not result:
        return {"categories": None}  # Use defaults
    
    return {"categories": result.get("categories", [])}

class OpsCategoriesUpdate(BaseModel):
    categories: List[dict]  # [{value, label, labelEs}]

@settings_router.post("/ops-categories")
async def save_ops_categories(data: OpsCategoriesUpdate, user: User = Depends(get_current_user)):
    """Save operations supplies categories for company"""
    now = datetime.now(timezone.utc)
    
    await db.company_settings.update_one(
        {
            "company_id": user.company_id,
            "setting_type": "ops_categories"
        },
        {
            "$set": {
                "categories": data.categories,
                "updated_at": now.isoformat()
            },
            "$setOnInsert": {
                "company_id": user.company_id,
                "setting_type": "ops_categories",
                "created_at": now.isoformat()
            }
        },
        upsert=True
    )
    
    return {"message": "Categories saved", "count": len(data.categories)}


# ============== MARGIN POLICY ==============
# Hierarchical resolution: item-specific override > category > type > default seed
# Stored in company_settings as a single doc per company.

DEFAULT_MARGIN_BY_TYPE = {
    "Food": 35.0,
    "Service": 40.0,
    "Rental": 50.0,
    "Fee": 60.0,
    "Other": 30.0,
}


class MarginCategoryRule(BaseModel):
    item_type: str  # Food / Service / Rental / Fee / Other
    category: str   # category_id OR category label
    min_margin_pct: float


class MarginPolicyUpdate(BaseModel):
    by_type: Dict[str, float] = {}  # {"Food": 35, "Service": 40, ...}
    by_category: List[MarginCategoryRule] = []


async def get_margin_policy_doc(company_id: str) -> dict:
    """Load margin policy for a company, falling back to defaults when missing."""
    doc = await db.company_settings.find_one(
        {"company_id": company_id, "setting_type": "margin_policy"},
        {"_id": 0},
    )
    by_type = dict(DEFAULT_MARGIN_BY_TYPE)
    by_category: list = []
    if doc:
        # Merge so missing types still get the default
        stored = doc.get("by_type") or {}
        for k, v in stored.items():
            try:
                by_type[k] = float(v)
            except (TypeError, ValueError):
                pass
        by_category = doc.get("by_category") or []
    return {"by_type": by_type, "by_category": by_category}


def resolve_min_margin(
    policy: dict,
    item_type: Optional[str],
    category: Optional[str] = None,
    item_specific: Optional[float] = None,
) -> Optional[float]:
    """Resolve effective minimum margin for an item.
    Priority: item_specific > by_category match > by_type > None.
    """
    if item_specific is not None:
        try:
            return float(item_specific)
        except (TypeError, ValueError):
            pass
    # Category rule
    if category:
        for rule in policy.get("by_category", []):
            if (rule.get("item_type") == item_type or not rule.get("item_type")) and rule.get("category") == category:
                try:
                    return float(rule.get("min_margin_pct"))
                except (TypeError, ValueError):
                    continue
    # By type
    if item_type and item_type in policy.get("by_type", {}):
        return float(policy["by_type"][item_type])
    return None


@settings_router.get("/margin-policy")
async def get_margin_policy(user: User = Depends(get_current_user)):
    """Return the company margin policy. Falls back to seed defaults if not yet configured."""
    policy = await get_margin_policy_doc(user.company_id)
    return {
        "by_type": policy["by_type"],
        "by_category": policy["by_category"],
        "defaults": DEFAULT_MARGIN_BY_TYPE,
    }


@settings_router.put("/margin-policy")
async def update_margin_policy(data: MarginPolicyUpdate, user: User = Depends(get_current_user)):
    """Upsert the company margin policy."""
    now = datetime.now(timezone.utc).isoformat()
    # Normalize by_type — keep only known types and float coerce
    clean_by_type: Dict[str, float] = {}
    for k, v in (data.by_type or {}).items():
        try:
            clean_by_type[k] = float(v)
        except (TypeError, ValueError):
            continue
    clean_rules = [
        {
            "item_type": r.item_type,
            "category": r.category,
            "min_margin_pct": float(r.min_margin_pct),
        }
        for r in (data.by_category or [])
    ]
    await db.company_settings.update_one(
        {"company_id": user.company_id, "setting_type": "margin_policy"},
        {
            "$set": {
                "by_type": clean_by_type,
                "by_category": clean_rules,
                "updated_at": now,
            },
            "$setOnInsert": {
                "company_id": user.company_id,
                "setting_type": "margin_policy",
                "created_at": now,
            },
        },
        upsert=True,
    )
    return await get_margin_policy(user)


# ============== PICKLIST ITEMS ROUTES ==============

@settings_router.get("/picklist")
async def get_picklist_items(category_id: Optional[str] = None, item_type: Optional[str] = None, active_only: bool = True, user: User = Depends(get_current_user)):
    """Get picklist items for quick selection"""
    query = {"company_id": user.company_id}
    if category_id:
        query["category_id"] = category_id
    if item_type:
        query["item_type"] = item_type
    if active_only:
        query["$or"] = [{"is_active": True}, {"is_active": {"$exists": False}}]
    
    items = await db.picklist_items.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    
    # Enrich with recipe/inventory cost info
    for item in items:
        calculated_cost = item.get("internal_cost")
        cost_source = "manual" if calculated_cost else None
        
        # If linked to recipe, get recipe cost
        if item.get("recipe_id"):
            recipe = await db.recipes.find_one({"recipe_id": item["recipe_id"]}, {"_id": 0, "name": 1, "cost_per_portion": 1, "cost_per_serving": 1})
            if recipe:
                item["recipe_name"] = recipe.get("name")
                recipe_cost = recipe.get("cost_per_portion") or recipe.get("cost_per_serving") or 0
                if not calculated_cost:
                    calculated_cost = recipe_cost
                    cost_source = "recipe"

            # If linked to a specific portion format, prefer its cost & price
            if item.get("recipe_portion_format_id"):
                fmt = await db.recipe_portion_formats.find_one(
                    {"format_id": item["recipe_portion_format_id"], "recipe_id": item["recipe_id"]},
                    {"_id": 0, "format_name": 1, "cost_per_portion": 1, "sell_price": 1, "suggested_price": 1},
                )
                if fmt:
                    item["recipe_format_name"] = fmt.get("format_name")
                    item["recipe_format_sell_price"] = fmt.get("sell_price") or 0
                    item["recipe_format_suggested_price"] = fmt.get("suggested_price") or 0
                    fmt_cost = fmt.get("cost_per_portion") or 0
                    if fmt_cost:
                        calculated_cost = fmt_cost if not item.get("internal_cost") else calculated_cost
                        cost_source = "recipe_format" if not item.get("internal_cost") else cost_source
        
        # If linked to inventory, get inventory cost.
        # Inventory items live in `db.ingredients` (keyed by `ingredient_id`
        # with unit price under `cost_per_unit`). The old query hit a
        # non-existent `db.inventory` collection with the wrong field name,
        # so every inventory-linked picklist item showed "Costo: —" and no
        # margin — matches the user report "no me deja asociarlo al inventario"
        # (the link was saved but the enrichment silently failed).
        if item.get("inventory_item_id"):
            inv_item = await db.ingredients.find_one(
                {"ingredient_id": item["inventory_item_id"]},
                {"_id": 0, "name": 1, "cost_per_unit": 1, "unit_cost": 1, "pack_unit": 1},
            )
            if inv_item:
                item["inventory_item_name"] = inv_item.get("name")
                # `cost_per_unit` is the current schema; `unit_cost` is legacy —
                # fall back to legacy so pre-migration tenants also enrich.
                inv_cost = inv_item.get("cost_per_unit") or inv_item.get("unit_cost") or 0
                if not calculated_cost:
                    calculated_cost = inv_cost
                    cost_source = "inventory"
        
        item["calculated_cost"] = calculated_cost
        item["cost_source"] = cost_source
        
        # Calculate suggested margin
        if calculated_cost and item.get("default_price", 0) > 0:
            item["margin_percentage"] = ((item["default_price"] - calculated_cost) / item["default_price"]) * 100
    
    return items

@settings_router.get("/picklist/{item_id}")
async def get_picklist_item(item_id: str, user: User = Depends(get_current_user)):
    """Get a single picklist item with full details"""
    item = await db.picklist_items.find_one({"item_id": item_id, "company_id": user.company_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@settings_router.post("/picklist")
async def create_picklist_item(data: PicklistItemCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    item_id = f"pli_{uuid.uuid4().hex[:12]}"
    
    item_doc = {
        "item_id": item_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.picklist_items.insert_one(item_doc)
    del item_doc["_id"]
    return item_doc

@settings_router.post("/picklist/bulk")
async def create_picklist_items_bulk(data: PicklistBulkCreate, user: User = Depends(get_current_user)):
    """Create multiple picklist items at once.
    For Food items without a recipe_id, auto-creates a Recipe stub in Culinary Intelligence
    (flagged needs_review=True) so it can be completed later with real ingredients."""
    now = datetime.now(timezone.utc)
    created_items = []
    auto_created_recipes = 0

    # Fast lookup of existing recipes by lower-cased name
    existing = await db.recipes.find(
        {"company_id": user.company_id},
        {"_id": 0, "recipe_id": 1, "name": 1, "name_es": 1, "cost_per_portion": 1},
    ).to_list(2000)
    name_to_recipe = {}
    for r in existing:
        for key in [r.get("name"), r.get("name_es")]:
            if key:
                name_to_recipe[key.strip().lower()] = r

    for item_data in data.items:
        item_dict = item_data.model_dump()
        item_id = f"pli_{uuid.uuid4().hex[:12]}"

        # Auto-link / auto-create recipe for Food items
        if (item_dict.get("item_type") or "").lower() == "food" and not item_dict.get("recipe_id"):
            name_key = (item_dict.get("name") or "").strip().lower()
            matched = name_to_recipe.get(name_key) if name_key else None
            if matched:
                # Reuse existing — also adopt its cost if user didn't provide one
                item_dict["recipe_id"] = matched["recipe_id"]
                if item_dict.get("internal_cost") in (None, 0) and matched.get("cost_per_portion"):
                    item_dict["internal_cost"] = matched["cost_per_portion"]
            elif name_key:
                # Auto-create recipe stub
                recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
                seed_cost = float(item_dict.get("internal_cost") or 0)
                recipe_doc = {
                    "recipe_id": recipe_id,
                    "company_id": user.company_id,
                    "name": item_data.name,
                    "name_es": item_data.name,
                    "description": item_data.description or "",
                    "category": "Uncategorized",
                    "yield_quantity": 1.0,
                    "yield_unit": "portion",
                    "portion_size": 1.0,
                    "portion_unit": "serving",
                    "portions_per_yield": 1.0,
                    "prep_time": 0,
                    "cook_time": 0,
                    "difficulty": "medium",
                    "ingredients": [],
                    "instructions": "",
                    "allergens": [],
                    "dietary_tags": [],
                    "default_portion_price": float(item_dict.get("default_price") or 0),
                    "recipe_type": "Final",
                    "is_public": True,
                    "is_on_menu": False,
                    "sub_recipes": [],
                    "total_cost": seed_cost,
                    "cost_per_portion": seed_cost,
                    "cost_breakdown": {"ingredients": 0, "labor": 0, "overhead": 0, "manual_override": seed_cost},
                    # Review flags so it appears in Culinary Intelligence with a "Pending Review" pill
                    "needs_review": True,
                    "auto_created_from": "bulk_picklist_add",
                    "auto_created_at": now.isoformat(),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
                await db.recipes.insert_one(recipe_doc)
                name_to_recipe[name_key] = {"recipe_id": recipe_id, "name": item_data.name, "cost_per_portion": seed_cost}
                item_dict["recipe_id"] = recipe_id
                auto_created_recipes += 1

        item_doc = {
            "item_id": item_id,
            "company_id": user.company_id,
            **item_dict,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.picklist_items.insert_one(item_doc)
        item_doc.pop("_id", None)
        created_items.append(item_doc)

    return {
        "created": len(created_items),
        "items": created_items,
        "auto_created_recipes": auto_created_recipes,
    }

@settings_router.put("/picklist/{item_id}")
async def update_picklist_item(item_id: str, data: PicklistItemUpdate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    raw = data.model_dump(exclude_unset=True)
    # Allow explicit null only for fields that represent optional overrides.
    nullable_fields = {"min_margin_pct", "internal_cost", "recipe_id", "recipe_portion_format_id", "inventory_item_id", "description"}
    update_data = {k: v for k, v in raw.items() if v is not None or k in nullable_fields}
    update_data["updated_at"] = now.isoformat()
    
    result = await db.picklist_items.update_one(
        {"item_id": item_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Return updated item
    return await db.picklist_items.find_one({"item_id": item_id}, {"_id": 0})

@settings_router.delete("/picklist/{item_id}")
async def delete_picklist_item(item_id: str, user: User = Depends(get_current_user)):
    result = await db.picklist_items.delete_one({"item_id": item_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}


# ============== MENUS / PACKAGES ROUTES ==============

async def enrich_menu_items(menu: dict, company_id: str):
    """Enrich menu items with picklist/recipe data and calculate totals"""
    total_price = 0
    total_cost = 0
    enriched_items = []
    
    for item in menu.get("items", []):
        enriched = {**item}
        item_price = 0
        item_cost = 0
        
        # Get picklist item data
        if item.get("picklist_item_id"):
            pli = await db.picklist_items.find_one(
                {"item_id": item["picklist_item_id"], "company_id": company_id}, 
                {"_id": 0}
            )
            if pli:
                enriched["picklist_item"] = pli
                item_price = item.get("unit_price_override") or pli.get("default_price", 0)
                item_cost = item.get("internal_cost_override") or pli.get("internal_cost") or 0
                
                # If picklist links to recipe, get recipe cost
                if pli.get("recipe_id") and not item_cost:
                    recipe = await db.recipes.find_one({"recipe_id": pli["recipe_id"]}, {"_id": 0, "cost_per_portion": 1})
                    if recipe:
                        item_cost = recipe.get("cost_per_portion", 0)
        
        # Get recipe data directly
        elif item.get("recipe_id"):
            recipe = await db.recipes.find_one(
                {"recipe_id": item["recipe_id"], "company_id": company_id}, 
                {"_id": 0}
            )
            if recipe:
                enriched["recipe"] = recipe
                item_price = item.get("unit_price_override") or (recipe.get("cost_per_portion", 0) * 3)  # 33% food cost
                item_cost = item.get("internal_cost_override") or recipe.get("cost_per_portion", 0)
        
        # Apply quantity
        qty = item.get("quantity", 1)
        enriched["calculated_price"] = item_price * qty
        enriched["calculated_cost"] = item_cost * qty
        enriched["unit_price"] = item_price
        enriched["unit_cost"] = item_cost
        
        total_price += enriched["calculated_price"]
        total_cost += enriched["calculated_cost"]
        enriched_items.append(enriched)
    
    menu["items"] = enriched_items
    
    # Use fixed price if set
    if menu.get("is_fixed_price") and menu.get("default_price"):
        menu["total_price"] = menu["default_price"]
    else:
        menu["total_price"] = total_price
    
    menu["total_cost"] = total_cost
    menu["margin_amount"] = menu["total_price"] - total_cost
    menu["margin_percentage"] = (menu["margin_amount"] / menu["total_price"] * 100) if menu["total_price"] > 0 else 0
    
    # Calculate variant prices
    base_price = menu["total_price"]
    enriched_variants = []
    for variant in menu.get("variants", []):
        var_copy = {**variant}
        discount_type = variant.get("discount_type", "percentage")
        discount_value = variant.get("discount_value", 0)
        
        if discount_type == "percentage":
            var_copy["final_price"] = base_price * (1 - discount_value / 100)
            var_copy["discount_amount"] = base_price * (discount_value / 100)
        else:  # fixed_amount
            var_copy["final_price"] = base_price - discount_value
            var_copy["discount_amount"] = discount_value
        
        var_copy["margin_amount"] = var_copy["final_price"] - total_cost
        var_copy["margin_percentage"] = (var_copy["margin_amount"] / var_copy["final_price"] * 100) if var_copy["final_price"] > 0 else 0
        enriched_variants.append(var_copy)
    
    menu["variants"] = enriched_variants
    
    return menu

@settings_router.get("/menus")
async def get_menus(menu_type: Optional[str] = None, active_only: bool = True, user: User = Depends(get_current_user)):
    """Get all menus/packages"""
    query = {"company_id": user.company_id}
    if menu_type:
        query["menu_type"] = menu_type
    if active_only:
        query["$or"] = [{"is_active": True}, {"is_active": {"$exists": False}}]
    
    menus = await db.menus.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    
    # Enrich each menu with calculated totals
    enriched_menus = []
    for menu in menus:
        enriched = await enrich_menu_items(menu, user.company_id)
        enriched_menus.append(enriched)
    
    return enriched_menus

@settings_router.get("/menus/{menu_id}")
async def get_menu(menu_id: str, user: User = Depends(get_current_user)):
    """Get a single menu with full details"""
    menu = await db.menus.find_one({"menu_id": menu_id, "company_id": user.company_id}, {"_id": 0})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    return await enrich_menu_items(menu, user.company_id)

@settings_router.post("/menus")
async def create_menu(data: MenuCreate, user: User = Depends(get_current_user)):
    """Create a new menu/package"""
    now = datetime.now(timezone.utc)
    menu_id = f"menu_{uuid.uuid4().hex[:12]}"
    
    # Process items
    items = []
    for idx, item in enumerate(data.items):
        item_dict = item.model_dump() if hasattr(item, 'model_dump') else item
        item_dict["item_id"] = f"mi_{uuid.uuid4().hex[:8]}"
        item_dict["sort_order"] = idx
        items.append(item_dict)
    
    # Process variants
    variants = []
    for variant in data.variants:
        var_dict = variant.model_dump() if hasattr(variant, 'model_dump') else variant
        if not var_dict.get("variant_id"):
            var_dict["variant_id"] = f"var_{uuid.uuid4().hex[:8]}"
        variants.append(var_dict)
    
    menu_doc = {
        "menu_id": menu_id,
        "company_id": user.company_id,
        "name": data.name,
        "name_es": data.name_es,
        "description": data.description,
        "description_es": data.description_es,
        "menu_type": data.menu_type,
        "category_id": data.category_id,
        "items": items,
        "variants": variants,
        "default_price": data.default_price,
        "is_fixed_price": data.is_fixed_price,
        "is_active": data.is_active,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.menus.insert_one(menu_doc)
    del menu_doc["_id"]
    
    return await enrich_menu_items(menu_doc, user.company_id)

@settings_router.put("/menus/{menu_id}")
async def update_menu(menu_id: str, data: MenuUpdate, user: User = Depends(get_current_user)):
    """Update a menu/package"""
    now = datetime.now(timezone.utc)
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Process items if provided
    if "items" in update_data and update_data["items"] is not None:
        items = []
        for idx, item in enumerate(update_data["items"]):
            item_dict = item.model_dump() if hasattr(item, 'model_dump') else item
            if "item_id" not in item_dict or not item_dict["item_id"]:
                item_dict["item_id"] = f"mi_{uuid.uuid4().hex[:8]}"
            item_dict["sort_order"] = idx
            items.append(item_dict)
        update_data["items"] = items
    
    # Process variants if provided
    if "variants" in update_data and update_data["variants"] is not None:
        variants = []
        for variant in update_data["variants"]:
            var_dict = variant.model_dump() if hasattr(variant, 'model_dump') else variant
            if not var_dict.get("variant_id"):
                var_dict["variant_id"] = f"var_{uuid.uuid4().hex[:8]}"
            variants.append(var_dict)
        update_data["variants"] = variants
    
    update_data["updated_at"] = now.isoformat()
    
    result = await db.menus.update_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    return await get_menu(menu_id, user)

@settings_router.post("/menus/{menu_id}/items")
async def add_menu_item(menu_id: str, data: MenuItemEntry, user: User = Depends(get_current_user)):
    """Add an item to a menu"""
    now = datetime.now(timezone.utc)
    
    menu = await db.menus.find_one({"menu_id": menu_id, "company_id": user.company_id})
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    item_dict = data.model_dump()
    item_dict["item_id"] = f"mi_{uuid.uuid4().hex[:8]}"
    item_dict["sort_order"] = len(menu.get("items", []))
    
    await db.menus.update_one(
        {"menu_id": menu_id},
        {"$push": {"items": item_dict}, "$set": {"updated_at": now.isoformat()}}
    )
    
    return await get_menu(menu_id, user)

@settings_router.delete("/menus/{menu_id}/items/{item_id}")
async def remove_menu_item(menu_id: str, item_id: str, user: User = Depends(get_current_user)):
    """Remove an item from a menu"""
    now = datetime.now(timezone.utc)
    
    result = await db.menus.update_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"$pull": {"items": {"item_id": item_id}}, "$set": {"updated_at": now.isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    return await get_menu(menu_id, user)

@settings_router.delete("/menus/{menu_id}")
async def delete_menu(menu_id: str, user: User = Depends(get_current_user)):
    """Delete a menu/package"""
    result = await db.menus.delete_one({"menu_id": menu_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    return {"message": "Menu deleted"}


# ============== TAX RATES ROUTES ==============

@settings_router.get("/taxes")
async def get_tax_rates(user: User = Depends(get_current_user)):
    """Get all tax rates"""
    taxes = await db.tax_rates.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    return taxes

@settings_router.post("/taxes")
async def create_tax_rate(data: TaxRateCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    tax_id = f"tax_{uuid.uuid4().hex[:12]}"
    
    # If this is default, unset other defaults
    if data.is_default:
        await db.tax_rates.update_many(
            {"company_id": user.company_id},
            {"$set": {"is_default": False}}
        )
    
    tax_doc = {
        "tax_id": tax_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.tax_rates.insert_one(tax_doc)
    del tax_doc["_id"]
    return tax_doc

@settings_router.put("/taxes/{tax_id}")
async def update_tax_rate(tax_id: str, data: TaxRateCreate, user: User = Depends(get_current_user)):
    if data.is_default:
        await db.tax_rates.update_many(
            {"company_id": user.company_id, "tax_id": {"$ne": tax_id}},
            {"$set": {"is_default": False}}
        )
    
    result = await db.tax_rates.update_one(
        {"tax_id": tax_id, "company_id": user.company_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tax rate not found")
    return {"message": "Tax rate updated"}

@settings_router.delete("/taxes/{tax_id}")
async def delete_tax_rate(tax_id: str, user: User = Depends(get_current_user)):
    result = await db.tax_rates.delete_one({"tax_id": tax_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tax rate not found")
    return {"message": "Tax rate deleted"}

# ============== FEATURE FLAGS ROUTES ==============

@settings_router.get("/feature-flags")
async def get_feature_flags(user: User = Depends(get_current_user)):
    """Get feature flags for the company"""
    flags = await db.feature_flags.find_one({"company_id": user.company_id}, {"_id": 0})
    
    if not flags:
        # Return defaults
        now = datetime.now(timezone.utc)
        flags = {
            "company_id": user.company_id,
            "is_proposal_editing_enabled": True,
            "is_order_items_enabled": True,
            "is_margin_tracking_enabled": True,
            "is_document_autogeneration_enabled": True,
            "is_custom_fields_enabled": True,
            "is_food_ops_enabled": True,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.feature_flags.insert_one(flags)
        del flags["_id"]
    
    return flags

@settings_router.put("/feature-flags")
async def update_feature_flags(data: FeatureFlagsUpdate, user: User = Depends(get_current_user)):
    """Update feature flags for the company"""
    now = datetime.now(timezone.utc)
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = now.isoformat()
    
    existing = await db.feature_flags.find_one({"company_id": user.company_id})
    if existing:
        await db.feature_flags.update_one(
            {"company_id": user.company_id},
            {"$set": update_data}
        )
    else:
        flags = {
            "company_id": user.company_id,
            "is_proposal_editing_enabled": True,
            "is_order_items_enabled": True,
            "is_margin_tracking_enabled": True,
            "is_document_autogeneration_enabled": True,
            "is_custom_fields_enabled": True,
            "is_food_ops_enabled": True,
            "created_at": now.isoformat(),
            **update_data
        }
        await db.feature_flags.insert_one(flags)
    
    return await get_feature_flags(user)

# ============== DOCUMENT TEMPLATES ROUTES ==============

@settings_router.get("/document-templates")
async def get_document_templates(user: User = Depends(get_current_user)):
    """Get all document templates with custom fields.

    Also backfills any missing default templates for existing companies
    (e.g. after adding new document types).
    """
    templates = await db.document_templates.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)

    now = datetime.now(timezone.utc)
    default_types = ["Proposal", "Invoice", "PackingList", "KitchenSheet", "ServiceSheet", "PurchaseOrder", "DeliveryNote", "Recipe"]
    existing_types = {t.get("template_type") for t in templates}
    for ttype in default_types:
        if ttype in existing_types:
            continue
        template = {
            "template_id": f"tpl_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "template_type": ttype,
            "name": ttype,
            "is_active": True,
            "custom_fields": [],
            "header_text_en": None,
            "header_text_es": None,
            "footer_text_en": None,
            "footer_text_es": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.document_templates.insert_one(template)
        template.pop("_id", None)
        templates.append(template)

    return templates

@settings_router.post("/document-templates")
async def create_document_template(data: DocumentTemplateCreate, user: User = Depends(get_current_user)):
    """Create a new document template"""
    now = datetime.now(timezone.utc)
    template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    
    # Process custom fields - add field_id if not present
    custom_fields = []
    for cf in data.custom_fields:
        cf_dict = cf.model_dump() if hasattr(cf, 'model_dump') else cf
        if 'field_id' not in cf_dict:
            cf_dict['field_id'] = f"cf_{uuid.uuid4().hex[:8]}"
        custom_fields.append(cf_dict)
    
    template_doc = {
        "template_id": template_id,
        "company_id": user.company_id,
        "template_type": data.template_type,
        "name": data.name,
        "is_active": data.is_active,
        "custom_fields": custom_fields,
        "header_text_en": data.header_text_en,
        "header_text_es": data.header_text_es,
        "tagline_en": data.tagline_en,
        "tagline_es": data.tagline_es,
        "footer_text_en": data.footer_text_en,
        "footer_text_es": data.footer_text_es,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.document_templates.insert_one(template_doc)
    del template_doc["_id"]
    return template_doc

@settings_router.put("/document-templates/{template_id}")
async def update_document_template(template_id: str, data: DocumentTemplateCreate, user: User = Depends(get_current_user)):
    """Update a document template"""
    now = datetime.now(timezone.utc)
    
    # Process custom fields
    custom_fields = []
    for cf in data.custom_fields:
        cf_dict = cf.model_dump() if hasattr(cf, 'model_dump') else cf
        if 'field_id' not in cf_dict:
            cf_dict['field_id'] = f"cf_{uuid.uuid4().hex[:8]}"
        custom_fields.append(cf_dict)
    
    update_data = {
        "name": data.name,
        "is_active": data.is_active,
        "custom_fields": custom_fields,
        "header_text_en": data.header_text_en,
        "header_text_es": data.header_text_es,
        "tagline_en": data.tagline_en,
        "tagline_es": data.tagline_es,
        "footer_text_en": data.footer_text_en,
        "footer_text_es": data.footer_text_es,
        "food_section_title_en": data.food_section_title_en,
        "food_section_title_es": data.food_section_title_es,
        "service_section_title_en": data.service_section_title_en,
        "service_section_title_es": data.service_section_title_es,
        "rental_section_title_en": data.rental_section_title_en,
        "rental_section_title_es": data.rental_section_title_es,
        # New fields
        "terms_and_conditions_en": data.terms_and_conditions_en,
        "terms_and_conditions_es": data.terms_and_conditions_es,
        "payment_instructions_en": data.payment_instructions_en,
        "payment_instructions_es": data.payment_instructions_es,
        "bank_details": data.bank_details,
        "primary_color": data.primary_color,
        "style_variant": data.style_variant or "classic",
        "show_logo": data.show_logo,
        "logo_size": data.logo_size or "medium",
        "logo_position": data.logo_position or "left",
        "pdf_density": data.pdf_density or "normal",
        "show_company_address": data.show_company_address,
        "show_tax_id": data.show_tax_id,
        "show_quantities": data.show_quantities,
        "show_notes_column": data.show_notes_column,
        "show_checkboxes": data.show_checkboxes,
        "group_by_category": data.group_by_category,
        "updated_at": now.isoformat()
    }
    
    result = await db.document_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return await db.document_templates.find_one({"template_id": template_id}, {"_id": 0})

@settings_router.delete("/document-templates/{template_id}")
async def delete_document_template(template_id: str, user: User = Depends(get_current_user)):
    """Deactivate a document template (soft delete)"""
    result = await db.document_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deactivated"}

# ============== USERS MANAGEMENT ==============

@settings_router.get("/users")
async def get_company_users(user: User = Depends(get_current_user)):
    """Get all users in the company"""
    users = await db.users.find(
        {"company_id": user.company_id},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return users

@settings_router.post("/users/invite")
async def invite_user(data: dict, user: User = Depends(get_current_user)):
    """Invite a new user to the company"""
    email = data.get("email", "").lower().strip()
    name = data.get("name", "")
    role_id = data.get("role_id")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    
    # Check if user already exists
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Create user with pending status
    now = datetime.now(timezone.utc)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "company_id": user.company_id,
        "role_id": role_id,
        "password_hash": "",  # User will set password on first login
        "is_active": True,
        "is_invited": True,
        "invited_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.users.insert_one(user_doc)
    del user_doc["_id"]
    del user_doc["password_hash"]
    
    # TODO: Send invitation email
    
    return user_doc

@settings_router.put("/users/{user_id}")
async def update_user(user_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update user information"""
    target_user = await db.users.find_one({"user_id": user_id, "company_id": user.company_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    if "name" in data:
        update_data["name"] = data["name"]
    if "role_id" in data:
        update_data["role_id"] = data["role_id"]
    if "is_active" in data:
        update_data["is_active"] = data["is_active"]
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"user_id": user_id}, {"$set": update_data})
    
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return updated

# ============== ROLES MANAGEMENT ==============

DEFAULT_ROLES = [
    {
        "role_id": "admin",
        "name": "Administrator",
        "name_es": "Administrador",
        "description": "Full access to all features",
        "description_es": "Acceso completo a todas las funciones",
        "permissions": ["events.view", "events.create", "events.edit", "events.delete",
                       "crm.view", "crm.create", "crm.edit", "crm.delete",
                       "culinary.view", "culinary.manage", "culinary.purchases",
                       "finance.view", "finance.invoices", "finance.payments", "finance.reports",
                       "settings.view", "settings.manage", "settings.users"],
        "is_system": True
    },
    {
        "role_id": "sales",
        "name": "Sales",
        "name_es": "Ventas",
        "description": "Access to CRM and lead management",
        "description_es": "Acceso al CRM y gestión de leads",
        "permissions": ["crm.view", "crm.create", "crm.edit", "leads.view", "leads.manage", "clients.view"],
        "is_system": True
    },
    {
        "role_id": "finance",
        "name": "Finance",
        "name_es": "Finanzas",
        "description": "Access to Business Clarity and financial reports",
        "description_es": "Acceso a Business Clarity y reportes financieros",
        "permissions": ["events.view", "crm.view", "finance.view", "finance.invoices", "finance.payments", "finance.reports"],
        "is_system": True
    },
    {
        "role_id": "operations",
        "name": "Operations",
        "name_es": "Operaciones",
        "description": "Access to Events and Culinary Intelligence",
        "description_es": "Acceso a Eventos e Inteligencia Culinaria",
        "permissions": ["events.view", "events.create", "events.edit", "crm.view", "culinary.view", "culinary.manage", "culinary.purchases"],
        "is_system": True
    },
    {
        "role_id": "viewer",
        "name": "Viewer",
        "name_es": "Visor",
        "description": "Read-only access to basic features",
        "description_es": "Acceso de solo lectura a funciones básicas",
        "permissions": ["events.view", "crm.view"],
        "is_system": True
    }
]

@settings_router.get("/roles")
async def get_roles(user: User = Depends(get_current_user)):
    """Get all roles for the company"""
    roles = await db.roles.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    
    # Ensure all system roles exist (add missing ones without affecting existing)
    existing_role_ids = {r["role_id"] for r in roles}
    for role in DEFAULT_ROLES:
        if role["role_id"] not in existing_role_ids:
            role_doc = {**role, "company_id": user.company_id}
            await db.roles.update_one(
                {"role_id": role["role_id"], "company_id": user.company_id},
                {"$setOnInsert": role_doc},
                upsert=True
            )
    
    # Re-fetch to include newly added roles
    roles = await db.roles.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    
    return roles

@settings_router.post("/roles")
async def create_role(data: dict, user: User = Depends(get_current_user)):
    """Create a new role"""
    role_id = f"role_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    role_doc = {
        "role_id": role_id,
        "company_id": user.company_id,
        "name": data.get("name", ""),
        "name_es": data.get("name_es", ""),
        "description": data.get("description", ""),
        "description_es": data.get("description_es", ""),
        "permissions": data.get("permissions", []),
        "is_system": False,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.roles.insert_one(role_doc)
    del role_doc["_id"]
    return role_doc

@settings_router.put("/roles/{role_id}")
async def update_role(role_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update a role"""
    role = await db.roles.find_one({"role_id": role_id, "company_id": user.company_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.get("is_system"):
        # System roles: only allow updating permissions and description, not the name
        update_data = {
            "description": data.get("description", role.get("description")),
            "description_es": data.get("description_es", role.get("description_es")),
            "permissions": data.get("permissions", role.get("permissions", [])),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    else:
        # Custom roles: allow updating everything
        update_data = {
            "name": data.get("name", role.get("name")),
            "name_es": data.get("name_es", role.get("name_es")),
            "description": data.get("description", role.get("description")),
            "description_es": data.get("description_es", role.get("description_es")),
            "permissions": data.get("permissions", role.get("permissions", [])),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    
    await db.roles.update_one({"role_id": role_id, "company_id": user.company_id}, {"$set": update_data})
    updated = await db.roles.find_one({"role_id": role_id, "company_id": user.company_id}, {"_id": 0})
    return updated

@settings_router.delete("/roles/{role_id}")
async def delete_role(role_id: str, user: User = Depends(get_current_user)):
    """Delete a role"""
    role = await db.roles.find_one({"role_id": role_id, "company_id": user.company_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot delete system role")
    
    await db.roles.delete_one({"role_id": role_id})
    return {"message": "Role deleted"}

# ============== AUTOMATIONS ==============

@settings_router.get("/automations")
async def get_automations(user: User = Depends(get_current_user)):
    """Get all automations for the company"""
    automations = await db.automations.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    
    # Return default automations if none exist
    if not automations:
        default_automations = [
            {"automation_id": "auto_1", "company_id": user.company_id, "name": "Payment Reminder", "trigger_type": "payment_reminder", "channels": ["email"], "is_active": True, "config": {"days_overdue": 7}},
            {"automation_id": "auto_2", "company_id": user.company_id, "name": "Low Stock Alert", "trigger_type": "low_stock_alert", "channels": ["email", "in_app"], "is_active": False, "config": {}},
            {"automation_id": "auto_3", "company_id": user.company_id, "name": "Event Reminder", "trigger_type": "event_reminder", "channels": ["email"], "is_active": True, "config": {"days_before": 3}},
        ]
        for auto in default_automations:
            await db.automations.update_one(
                {"automation_id": auto["automation_id"], "company_id": user.company_id},
                {"$setOnInsert": auto},
                upsert=True
            )
        automations = await db.automations.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    
    return automations

@settings_router.post("/automations")
async def create_automation(data: dict, user: User = Depends(get_current_user)):
    """Create a new automation"""
    automation_id = f"auto_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    automation_doc = {
        "automation_id": automation_id,
        "company_id": user.company_id,
        "name": data.get("name", ""),
        "trigger_type": data.get("trigger_type", ""),
        "channels": data.get("channels", ["email"]),
        "is_active": data.get("is_active", True),
        "config": data.get("config", {}),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.automations.insert_one(automation_doc)
    del automation_doc["_id"]
    return automation_doc

@settings_router.put("/automations/{automation_id}")
async def update_automation(automation_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update an automation"""
    automation = await db.automations.find_one({"automation_id": automation_id, "company_id": user.company_id})
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    update_data = {
        "name": data.get("name", automation.get("name")),
        "trigger_type": data.get("trigger_type", automation.get("trigger_type")),
        "channels": data.get("channels", automation.get("channels", [])),
        "is_active": data.get("is_active", automation.get("is_active")),
        "config": data.get("config", automation.get("config", {})),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.automations.update_one({"automation_id": automation_id}, {"$set": update_data})
    updated = await db.automations.find_one({"automation_id": automation_id}, {"_id": 0})
    return updated

@settings_router.delete("/automations/{automation_id}")
async def delete_automation(automation_id: str, user: User = Depends(get_current_user)):
    """Delete an automation"""
    result = await db.automations.delete_one({"automation_id": automation_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Automation not found")
    return {"message": "Automation deleted"}

# ============== INTEGRATIONS ==============

@settings_router.get("/integrations")
async def get_integrations(user: User = Depends(get_current_user)):
    """Get all integrations for the company"""
    integrations = await db.integrations.find({"company_id": user.company_id}, {"_id": 0, "config": 0}).to_list(50)
    
    # Always include Stripe as pre-configured
    has_stripe = any(i.get("integration_id") == "stripe" for i in integrations)
    if not has_stripe:
        integrations.append({
            "integration_id": "stripe",
            "status": "connected",
            "connected_at": datetime.now(timezone.utc).isoformat()
        })
    
    return integrations

@settings_router.post("/integrations")
async def save_integration(data: dict, user: User = Depends(get_current_user)):
    """Save integration configuration"""
    integration_id = data.get("integration_id")
    config = data.get("config", {})
    
    if not integration_id:
        raise HTTPException(status_code=400, detail="Integration ID required")
    
    now = datetime.now(timezone.utc)
    
    integration_doc = {
        "integration_id": integration_id,
        "company_id": user.company_id,
        "config": config,
        "status": "connected",
        "connected_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.integrations.update_one(
        {"integration_id": integration_id, "company_id": user.company_id},
        {"$set": integration_doc},
        upsert=True
    )
    
    return {"message": "Integration saved", "integration_id": integration_id}

@settings_router.post("/integrations/{integration_id}/test")
async def test_integration(integration_id: str, data: dict, user: User = Depends(get_current_user)):
    """Test integration connection"""
    config = data.get("config", {})
    
    # For now, return success for all integrations (actual testing would require real API calls)
    # TODO: Implement actual connection testing for each integration
    
    return {"success": True, "message": "Connection successful"}

@settings_router.delete("/integrations/{integration_id}")
async def delete_integration(integration_id: str, user: User = Depends(get_current_user)):
    """Delete/disconnect an integration"""
    if integration_id == "stripe":
        raise HTTPException(status_code=400, detail="Cannot disconnect pre-configured integration")
    
    result = await db.integrations.delete_one({"integration_id": integration_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"message": "Integration disconnected"}

@orchestration_router.post("/calendar/reschedule-service")
async def reschedule_service(
    payload: dict,
    user: User = Depends(get_current_user),
):
    """Reschedule a service slot (all order_items sharing the same
    `event_date` + `section_title` + `section_time` inside an event's
    proposal) to a new time / date. Used by the Week-timeline drag-to-
    reschedule UI.

    Body: ``{event_id, section_title, event_date, old_time, new_time,
              new_end_time?, new_date?}``
    """
    event_id = (payload or {}).get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit items in a closed event")

    proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "proposal_id": 1},
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found for this event")

    def _norm(v):
        return (v or "").strip() if isinstance(v, str) else (v or "")

    section_title = _norm(payload.get("section_title"))
    event_date = _norm(payload.get("event_date"))
    old_time = _norm(payload.get("old_time"))
    new_time = _norm(payload.get("new_time"))
    new_end_time = payload.get("new_end_time")
    new_date = _norm(payload.get("new_date"))

    # Build a permissive match on the source slot. Items may store the date
    # as ``YYYY-MM-DD`` or as a full ISO string (legacy), so we try both.
    date_clauses = []
    if event_date:
        date_clauses.append({"event_date": event_date})
        date_clauses.append({"event_date": {"$regex": f"^{event_date}"}})
    else:
        date_clauses.append({"event_date": {"$in": ["", None]}})

    title_clauses = (
        [{"section_title": section_title}]
        if section_title
        else [{"section_title": {"$in": ["", None]}}]
    )

    time_clauses = (
        [{"section_time": old_time}]
        if old_time
        else [{"section_time": {"$in": ["", None]}}]
    )

    query = {
        "proposal_id": proposal["proposal_id"],
        "company_id": user.company_id,
        "$and": [
            {"$or": date_clauses},
            {"$or": title_clauses},
            {"$or": time_clauses},
        ],
    }

    now_iso = datetime.now(timezone.utc).isoformat()
    patch = {"updated_at": now_iso, "section_time": new_time}
    if new_end_time is not None:
        patch["section_end_time"] = (_norm(new_end_time) or None)
    if new_date:
        patch["event_date"] = new_date

    result = await db.order_items.update_many(query, {"$set": patch})
    return {
        "matched": result.matched_count,
        "modified": result.modified_count,
        "new_time": new_time,
        "new_end_time": new_end_time,
        "new_date": new_date or event_date,
    }

# ============== AUDIT LOG ROUTES ==============

@audit_router.get("/event/{event_id}")
async def get_event_audit_log(event_id: str, user: User = Depends(get_current_user)):
    """Get audit log for an event"""
    logs = await db.audit_logs.find(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(500)
    return logs

@audit_router.get("/proposal/{proposal_id}")
async def get_proposal_audit_log(proposal_id: str, user: User = Depends(get_current_user)):
    """Get audit log for a proposal"""
    logs = await db.audit_logs.find(
        {"proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(500)
    return logs



# ============== EVENT ORDER ROUTES ==============

@event_order_router.get("/{event_id}")
async def get_event_order(event_id: str, user: User = Depends(get_current_user)):
    """Get the Contract & Event Order for an event"""
    order = await db.event_orders.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    
    if not order:
        # Create empty order if doesn't exist
        now = datetime.now(timezone.utc)
        order = {
            "order_id": f"eo_{uuid.uuid4().hex[:12]}",
            "event_id": event_id,
            "company_id": user.company_id,
            "items": [],
            "subtotal": 0,
            "discount_amount": 0,
            "tax_details": [],
            "total_tax": 0,
            "total": 0,
            "payment_terms": None,
            "client_notes": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.event_orders.insert_one(order)
        del order["_id"]
    
    return order

@event_order_router.put("/{event_id}")
async def update_event_order(event_id: str, data: EventOrderCreate, user: User = Depends(get_current_user)):
    """Update the Contract & Event Order - this is the main data entry point"""
    now = datetime.now(timezone.utc)
    
    # Get categories for item names
    categories = await db.item_categories.find({"company_id": user.company_id}, {"_id": 0}).to_list(100)
    cat_map = {c["category_id"]: c["name"] for c in categories}
    
    # Process items
    processed_items = []
    subtotal = 0
    
    for idx, item in enumerate(data.items):
        item_id = f"eoi_{uuid.uuid4().hex[:8]}"
        item_subtotal = (item.quantity * item.unit_price) - item.discount_amount
        subtotal += item_subtotal
        
        processed_items.append({
            "item_id": item_id,
            "name": item.name,
            "description": item.description,
            "category_id": item.category_id,
            "category_name": cat_map.get(item.category_id, "Other"),
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "discount_amount": item.discount_amount,
            "subtotal": item_subtotal,
            "recipe_id": item.recipe_id,
            "internal_notes": item.internal_notes,
            "event_date": item.event_date,
            "sort_order": item.sort_order if item.sort_order else idx,
            "created_at": now.isoformat()
        })
    
    # Apply overall discount
    subtotal_after_discount = subtotal - data.discount_amount
    
    # Calculate taxes
    tax_details = []
    total_tax = 0
    for tax_id in data.tax_ids:
        tax = await db.tax_rates.find_one({"tax_id": tax_id, "company_id": user.company_id}, {"_id": 0})
        if tax:
            tax_amount = subtotal_after_discount * (tax["rate"] / 100)
            total_tax += tax_amount
            tax_details.append({
                "tax_id": tax_id,
                "name": tax["name"],
                "rate": tax["rate"],
                "amount": tax_amount
            })
    
    total = subtotal_after_discount + total_tax
    
    order_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        "items": processed_items,
        "subtotal": subtotal,
        "discount_amount": data.discount_amount,
        "tax_details": tax_details,
        "total_tax": total_tax,
        "total": total,
        "payment_terms": data.payment_terms,
        "client_notes": data.client_notes,
        "updated_at": now.isoformat()
    }
    
    # Upsert the order
    existing = await db.event_orders.find_one({"event_id": event_id, "company_id": user.company_id})
    if existing:
        await db.event_orders.update_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"$set": order_doc}
        )
        order_doc["order_id"] = existing["order_id"]
        order_doc["created_at"] = existing["created_at"]
    else:
        order_doc["order_id"] = f"eo_{uuid.uuid4().hex[:12]}"
        order_doc["created_at"] = now.isoformat()
        await db.event_orders.insert_one(order_doc)
        del order_doc["_id"]
    
    return order_doc

@event_order_router.post("/{event_id}/items")
async def add_event_order_item(event_id: str, data: EventOrderItemCreate, user: User = Depends(get_current_user)):
    """Add a single item to the event order"""
    now = datetime.now(timezone.utc)
    
    # Get or create order
    order = await db.event_orders.find_one({"event_id": event_id, "company_id": user.company_id})
    if not order:
        order = {
            "order_id": f"eo_{uuid.uuid4().hex[:12]}",
            "event_id": event_id,
            "company_id": user.company_id,
            "items": [],
            "subtotal": 0,
            "discount_amount": 0,
            "tax_details": [],
            "total_tax": 0,
            "total": 0,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.event_orders.insert_one(order)
    
    # Get category name
    cat = await db.item_categories.find_one({"category_id": data.category_id}, {"_id": 0})
    cat_name = cat["name"] if cat else "Other"
    
    item_id = f"eoi_{uuid.uuid4().hex[:8]}"
    item_subtotal = (data.quantity * data.unit_price) - data.discount_amount
    
    new_item = {
        "item_id": item_id,
        "name": data.name,
        "description": data.description,
        "category_id": data.category_id,
        "category_name": cat_name,
        "quantity": data.quantity,
        "unit_price": data.unit_price,
        "discount_amount": data.discount_amount,
        "subtotal": item_subtotal,
        "recipe_id": data.recipe_id,
        "internal_notes": data.internal_notes,
        "event_date": data.event_date,
        "sort_order": data.sort_order,
        "created_at": now.isoformat()
    }
    
    # Add item and recalculate totals
    await db.event_orders.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {
            "$push": {"items": new_item},
            "$inc": {"subtotal": item_subtotal, "total": item_subtotal},
            "$set": {"updated_at": now.isoformat()}
        }
    )
    
    return new_item

@event_order_router.delete("/{event_id}/items/{item_id}")
async def delete_event_order_item(event_id: str, item_id: str, user: User = Depends(get_current_user)):
    """Delete an item from the event order"""
    now = datetime.now(timezone.utc)
    
    order = await db.event_orders.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Event order not found")
    
    # Find item and its subtotal
    item_to_remove = None
    for item in order.get("items", []):
        if item["item_id"] == item_id:
            item_to_remove = item
            break
    
    if not item_to_remove:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Remove item and update totals
    await db.event_orders.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {
            "$pull": {"items": {"item_id": item_id}},
            "$inc": {"subtotal": -item_to_remove["subtotal"], "total": -item_to_remove["subtotal"]},
            "$set": {"updated_at": now.isoformat()}
        }
    )
    
    return {"message": "Item deleted"}

@event_order_router.get("/{event_id}/document/{doc_type}")
async def generate_document_from_order(event_id: str, doc_type: str, user: User = Depends(get_current_user)):
    """Generate a document from the event order data"""
    # Get event order
    order = await db.event_orders.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Event order not found")
    
    # Get event and client info
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    client = await db.clients.find_one({"client_id": event.get("client_id")}, {"_id": 0})
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    
    # Get categories
    categories = await db.item_categories.find({"company_id": user.company_id}, {"_id": 0}).to_list(100)

    # Operational docs (kitchen, mise, packing) group by service time (tanda)
    # NOT by category — the chef wants the full prep list for "08:15", not
    # split between Bocadillos / Bebidas / Desechables.
    operational_docs = {"kitchen_sheet", "mise_en_place", "packing_list", "beo"}
    is_operational = doc_type in operational_docs

    # Item-type ordering from the company's catalog so the tanda items sort
    # the same way they do in the editor (Bebidas → Bocadillos → ...).
    type_order = {}
    for idx, t in enumerate((company or {}).get("proposal_item_types", []) or []):
        if t.get("type_key"):
            type_order[t["type_key"]] = idx
    def _type_ordinal(it_type):
        return type_order.get(it_type, 999)

    # Filter and group items based on document type
    items_by_category = {}
    items_by_date = {}
    items_by_tanda = {}  # NEW — populated only for operational docs
    
    for item in order.get("items", []):
        cat_id = item.get("category_id", "cat_other")
        cat_name = item.get("category_name", "Other")
        date_key = item.get("event_date") or "main"
        
        # Filter based on doc type
        if doc_type == "kitchen_sheet":
            # Only food and drinks
            if cat_id not in ["cat_food", "cat_drinks"]:
                continue
        elif doc_type == "mise_en_place":
            # Only food items for mise en place prep list
            if cat_id not in ["cat_food"]:
                continue
        elif doc_type == "packing_list":
            # Physical items only - exclude food, drinks, labor
            if cat_id in ["cat_food", "cat_drinks", "cat_labor"]:
                continue
        
        # Group by category (legacy / client-facing)
        if cat_id not in items_by_category:
            items_by_category[cat_id] = {"name": cat_name, "items": []}
        items_by_category[cat_id]["items"].append(item)
        
        # Group by date
        if date_key not in items_by_date:
            items_by_date[date_key] = []
        items_by_date[date_key].append(item)

        # Group by tanda (date + section_time) for operational docs
        if is_operational:
            time_key = (item.get("section_time") or "").strip() or "__no_time__"
            tanda_key = f"{date_key}|{time_key}"
            if tanda_key not in items_by_tanda:
                items_by_tanda[tanda_key] = {
                    "tanda_key": tanda_key,
                    "event_date": item.get("event_date"),
                    "section_time": item.get("section_time"),
                    "section_end_time": item.get("section_end_time"),
                    "items": [],
                }
            items_by_tanda[tanda_key]["items"].append(item)

    # Sort items inside each tanda by item_type order then sort_order so the
    # chef reads Bebidas first, then Bocadillos, etc. — matching the editor.
    for tk, t in items_by_tanda.items():
        t["items"].sort(key=lambda i: (
            _type_ordinal(i.get("item_type") or ""),
            int(i.get("sort_order") or 0),
            i.get("description") or i.get("name") or "",
        ))
    # Order tandas chronologically per day then by time.
    items_by_tanda = dict(sorted(
        items_by_tanda.items(),
        key=lambda kv: (kv[1].get("event_date") or "", kv[1].get("section_time") or ""),
    ))
    
    # Build document content
    now = datetime.now(timezone.utc)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    
    titles = {
        "contract": "Contract", "proposal": "Proposal", "invoice": "Invoice",
        "kitchen_sheet": "Kitchen Sheet", "packing_list": "Packing List",
        "mise_en_place": "Mise en Place"
    }
    titles_es = {
        "contract": "Contrato", "proposal": "Propuesta", "invoice": "Factura",
        "kitchen_sheet": "Hoja de Cocina", "packing_list": "Lista de Montaje",
        "mise_en_place": "Mise en Place"
    }
    
    lang = company.get("default_language", "en") if company else "en"
    title_dict = titles_es if lang == "es" else titles
    
    # Determine what to show based on doc type
    show_prices = doc_type not in ["kitchen_sheet", "packing_list", "mise_en_place"]
    show_internal_notes = doc_type in ["kitchen_sheet", "packing_list", "mise_en_place"]
    
    content = {
        "event": event,
        "client": client,
        "company": company,
        "order": order,
        "items_by_category": items_by_category,
        "items_by_date": items_by_date,
        "items_by_tanda": items_by_tanda,
        "is_operational": is_operational,
        "show_prices": show_prices,
        "show_internal_notes": show_internal_notes,
        "financials": {
            "subtotal": order.get("subtotal", 0),
            "discount_amount": order.get("discount_amount", 0),
            "tax_details": order.get("tax_details", []),
            "total_tax": order.get("total_tax", 0),
            "total": order.get("total", 0)
        } if show_prices else None,
        "payment_terms": order.get("payment_terms"),
        "client_notes": order.get("client_notes"),
        "generated_at": now.isoformat()
    }
    
    doc = {
        "document_id": document_id,
        "company_id": user.company_id,
        "event_id": event_id,
        "document_type": doc_type,
        "title": f"{title_dict.get(doc_type, doc_type)} - {event['name']}",
        "content": content,
        "signature": None,
        "signed_at": None,
        "signed_by": None,
        "status": "draft",
        "requires_signature": doc_type in ["contract", "proposal"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.documents.insert_one(doc)
    del doc["_id"]
    
    # Update event with document reference
    await db.events.update_one(
        {"event_id": event_id},
        {"$push": {"documents": {"document_id": document_id, "type": doc_type, "title": doc["title"]}}}
    )
    
    return doc

# ============== ALLERGENS ROUTES ==============

@allergens_router.get("")
async def get_allergens(user: User = Depends(get_current_user)):
    """Get all allergen configurations for company"""
    allergens = await db.allergen_configs.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    
    # Return default allergens if none configured
    if not allergens:
        default_allergens = [
            {"name": "Gluten", "name_es": "Gluten", "icon": "wheat"},
            {"name": "Dairy", "name_es": "Lácteos", "icon": "milk"},
            {"name": "Eggs", "name_es": "Huevo", "icon": "egg"},
            {"name": "Shellfish", "name_es": "Mariscos", "icon": "shell"},
            {"name": "Peanuts", "name_es": "Maní", "icon": "peanut"},
            {"name": "Tree Nuts", "name_es": "Nueces", "icon": "nut"},
            {"name": "Soy", "name_es": "Soya", "icon": "soybean"},
            {"name": "Fish", "name_es": "Pescado", "icon": "fish"},
            {"name": "Celery", "name_es": "Apio", "icon": "celery"},
            {"name": "Mustard", "name_es": "Mostaza", "icon": "mustard"},
            {"name": "Sesame", "name_es": "Sésamo", "icon": "sesame"},
            {"name": "Sulfites", "name_es": "Sulfitos", "icon": "sulfite"},
            {"name": "Mollusks", "name_es": "Moluscos", "icon": "mollusk"},
            {"name": "Lupin", "name_es": "Lupino", "icon": "lupin"},
        ]
        now = datetime.now(timezone.utc)
        for i, a in enumerate(default_allergens):
            allergen_id = f"allergen_{uuid.uuid4().hex[:12]}"
            await db.allergen_configs.insert_one({
                "allergen_id": allergen_id,
                "company_id": user.company_id,
                "name": a["name"],
                "name_es": a["name_es"],
                "icon": a.get("icon"),
                "is_active": True,
                "sort_order": i,
                "created_at": now.isoformat()
            })
        allergens = await db.allergen_configs.find(
            {"company_id": user.company_id},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(100)
    
    return allergens

@allergens_router.post("")
async def create_allergen(data: AllergenConfigCreate, user: User = Depends(get_current_user)):
    """Create a new allergen configuration"""
    now = datetime.now(timezone.utc)
    allergen_id = f"allergen_{uuid.uuid4().hex[:12]}"
    
    # Get max sort order
    max_order = await db.allergen_configs.find_one(
        {"company_id": user.company_id},
        sort=[("sort_order", -1)]
    )
    sort_order = (max_order.get("sort_order", 0) + 1) if max_order else 0
    
    allergen = {
        "allergen_id": allergen_id,
        "company_id": user.company_id,
        "name": data.name,
        "name_es": data.name_es,
        "icon": data.icon,
        "is_active": data.is_active,
        "sort_order": data.sort_order if data.sort_order > 0 else sort_order,
        "created_at": now.isoformat()
    }
    await db.allergen_configs.insert_one(allergen)
    del allergen["_id"]
    return allergen

@allergens_router.put("/{allergen_id}")
async def update_allergen(allergen_id: str, data: AllergenConfigCreate, user: User = Depends(get_current_user)):
    """Update an allergen configuration"""
    result = await db.allergen_configs.update_one(
        {"allergen_id": allergen_id, "company_id": user.company_id},
        {"$set": {
            "name": data.name,
            "name_es": data.name_es,
            "icon": data.icon,
            "is_active": data.is_active,
            "sort_order": data.sort_order
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Allergen not found")
    return {"message": "Updated"}

@allergens_router.delete("/{allergen_id}")
async def delete_allergen(allergen_id: str, user: User = Depends(get_current_user)):
    """Delete an allergen configuration"""
    result = await db.allergen_configs.delete_one(
        {"allergen_id": allergen_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Allergen not found")
    return {"message": "Deleted"}

# ============== RECIPES BULK IMPORT ==============
# Separate router prefix to avoid conflict with GET /recipes/{recipe_id}
recipes_bulk_router = APIRouter(prefix="/recipes-bulk", tags=["Recipes Bulk Import"])

def _parse_ingredients_string(s: str) -> list:
    """Parse ingredient string format: 'Tomate: 0.5 kg; Cebolla: 200 g; Aceite: 30 ml'.
    Returns list of dicts: [{name, quantity, unit}].
    """
    out = []
    if not s or (isinstance(s, float) and pd.isna(s)):
        return out
    for chunk in str(s).split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            # No quantity → treat as name only
            out.append({"name": chunk, "quantity": 1.0, "unit": "unit", "raw": chunk})
            continue
        name_part, qty_part = chunk.split(":", 1)
        name = name_part.strip()
        qty_part = qty_part.strip()
        # qty_part like "0.5 kg" or "200g"
        import re as _re
        m = _re.match(r"^([0-9]*\.?[0-9]+)\s*([a-zA-Zµ]*)$", qty_part)
        if m:
            qty = float(m.group(1))
            unit = (m.group(2) or "unit").lower()
        else:
            qty, unit = 1.0, "unit"
        out.append({"name": name, "quantity": qty, "unit": unit, "raw": chunk})
    return out


def _recipes_template_rows():
    """Sample rows for the recipes import template."""
    columns = [
        "nombre", "descripcion", "categoria", "tipo", "porciones", "tiempo_preparacion",
        "instrucciones", "notas", "precio_por_porcion", "ingredientes",
    ]
    samples = [
        [
            "Ensalada César",
            "Lechuga romana fresca con aderezo César cremoso, queso parmesano y crutones crujientes.",
            "Ensaladas",
            "final_dish",
            4,
            "15 min",
            "Mezclar lechuga, aderezo y queso parmesano.",
            "Servir frío.",
            12.50,
            "Lechuga romana: 0.4 kg; Queso parmesano: 80 g; Aderezo César: 100 ml; Crutones: 50 g",
        ],
        [
            "Pollo al limón",
            "Pechuga de pollo marinada en limón y hierbas, horneada hasta dorar.",
            "Plato principal",
            "final_dish",
            2,
            "30 min",
            "Marinar con limón y hornear 25 min a 180°C.",
            "",
            18.00,
            "Pechuga de pollo: 0.6 kg; Limón: 2 unit; Aceite de oliva: 40 ml; Sal: 5 g",
        ],
    ]
    return columns, samples


@recipes_bulk_router.get("/import-template")
async def recipes_import_template(format: str = "csv", user: User = Depends(get_current_user)):
    """Download a CSV/XLSX template for bulk recipe import."""
    columns, samples = _recipes_template_rows()
    df = pd.DataFrame(samples, columns=columns)
    no_cache = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }
    if format == "excel" or format == "xlsx":
        out = io.BytesIO()
        with pd.ExcelWriter(out, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Recetas")
        out.seek(0)
        return StreamingResponse(
            out,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=template_recetas.xlsx", **no_cache},
        )
    out = io.StringIO()
    df.to_csv(out, index=False)
    out.seek(0)
    return StreamingResponse(
        io.BytesIO(out.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_recetas.csv", **no_cache},
    )


_RECIPE_COL_MAP = {
    "nombre": "name", "name": "name", "receta": "name",
    "descripcion": "description", "descripción": "description", "description": "description",
    "categoria": "category", "categoría": "category", "category": "category",
    "tipo": "recipe_type", "type": "recipe_type", "recipe_type": "recipe_type",
    "porciones": "servings", "servings": "servings", "yield": "servings",
    "tiempo_preparacion": "prep_time", "tiempo": "prep_time", "prep_time": "prep_time",
    "instrucciones": "instructions", "instructions": "instructions",
    "notas": "notes", "notes": "notes",
    "precio_por_porcion": "default_portion_price", "precio": "default_portion_price",
    "default_portion_price": "default_portion_price",
    "ingredientes": "ingredients_str", "ingredients": "ingredients_str",
}


def _read_recipes_dataframe(file_bytes: bytes, filename: str):
    """Read CSV or Excel into a normalized DataFrame for recipes import."""
    if filename.lower().endswith(".xlsx") or filename.lower().endswith(".xls"):
        df = pd.read_excel(io.BytesIO(file_bytes))
    else:
        df = pd.read_csv(io.BytesIO(file_bytes))
    df.columns = df.columns.str.lower().str.strip().str.replace(" ", "_")
    df.rename(columns=_RECIPE_COL_MAP, inplace=True)
    return df


@recipes_bulk_router.post("/validate-import-file")
async def recipes_validate_import(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Validate a recipes import file. Returns a preview without persisting anything."""
    filename = (file.filename or "").lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos CSV o Excel")
    try:
        content = await file.read()
        df = _read_recipes_dataframe(content, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {e}")

    if "name" not in df.columns:
        return {
            "valid": False,
            "error": "El archivo debe contener una columna 'nombre' (o 'name').",
            "columns_found": list(df.columns),
            "rows": [],
        }

    # Preload existing ingredients for matching
    existing_ings = await db.ingredients.find(
        {"company_id": user.company_id},
        {"_id": 0, "ingredient_id": 1, "name": 1, "base_unit": 1},
    ).to_list(10000)
    ing_by_name = {(i.get("name") or "").lower().strip(): i for i in existing_ings}

    # Preload existing recipe names for duplicate detection
    existing_recipes = await db.recipes.find(
        {"company_id": user.company_id}, {"_id": 0, "name": 1}
    ).to_list(5000)
    existing_recipe_names = {(r.get("name") or "").lower().strip() for r in existing_recipes}

    rows = []
    valid_rows = 0
    warning_rows = 0
    error_rows = 0

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # +2 for header + 1-indexed
        name = str(row.get("name") or "").strip()
        errors = []
        warnings = []
        if not name:
            errors.append("Nombre requerido")
        # Ingredients
        ing_parsed = _parse_ingredients_string(row.get("ingredients_str", ""))
        matched_count = 0
        unmatched_names = []
        for ing in ing_parsed:
            match = ing_by_name.get((ing["name"] or "").lower().strip())
            if match:
                matched_count += 1
                ing["ingredient_id"] = match.get("ingredient_id")
            else:
                unmatched_names.append(ing["name"])
        if ing_parsed and unmatched_names:
            warnings.append(
                f"{len(unmatched_names)} ingrediente(s) no encontrado(s) en inventario: "
                + ", ".join(unmatched_names[:5])
                + ("…" if len(unmatched_names) > 5 else "")
            )
        if name and name.lower() in existing_recipe_names:
            warnings.append("Receta existente — se actualizará")

        servings = row.get("servings")
        try:
            servings_int = int(float(servings)) if servings is not None and not (isinstance(servings, float) and pd.isna(servings)) else 1
        except Exception:
            servings_int = 1
            warnings.append("Porciones inválidas, se usará 1")

        status = "error" if errors else ("warning" if warnings else "valid")
        if status == "valid":
            valid_rows += 1
        elif status == "warning":
            warning_rows += 1
        else:
            error_rows += 1

        rows.append({
            "row_num": row_num,
            "status": status,
            "name": name,
            "category": str(row.get("category") or "main").strip() or "main",
            "recipe_type": str(row.get("recipe_type") or "final_dish").strip() or "final_dish",
            "servings": servings_int,
            "ingredients_count": len(ing_parsed),
            "matched_count": matched_count,
            "unmatched_count": len(unmatched_names),
            "errors": errors,
            "warnings": warnings,
        })

    return {
        "valid": True,
        "total_rows": len(rows),
        "valid_rows": valid_rows,
        "warning_rows": warning_rows,
        "error_rows": error_rows,
        "rows": rows,
    }


@recipes_bulk_router.post("/import-from-file")
async def recipes_import_from_file(
    file: UploadFile = File(...),
    update_existing: bool = False,
    user: User = Depends(get_current_user),
):
    """Import recipes from CSV/Excel. Matches ingredients to inventory by name and computes cost when possible."""
    filename = (file.filename or "").lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos CSV o Excel")
    try:
        content = await file.read()
        df = _read_recipes_dataframe(content, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {e}")

    if "name" not in df.columns:
        raise HTTPException(status_code=400, detail="Falta la columna 'nombre' (o 'name')")

    existing_ings = await db.ingredients.find(
        {"company_id": user.company_id},
        {"_id": 0, "ingredient_id": 1, "name": 1, "base_unit": 1, "purchase_unit": 1},
    ).to_list(10000)
    ing_by_name = {(i.get("name") or "").lower().strip(): i for i in existing_ings}

    now = datetime.now(timezone.utc)
    created = 0
    updated = 0
    skipped = 0
    errors = []

    for idx, row in df.iterrows():
        row_num = int(idx) + 2
        try:
            name = str(row.get("name") or "").strip()
            if not name:
                errors.append({"row": row_num, "error": "Nombre vacío"})
                continue
            # Build ingredients list
            parsed = _parse_ingredients_string(row.get("ingredients_str", ""))
            recipe_ings = []
            has_unmatched = False
            for ing in parsed:
                match = ing_by_name.get((ing["name"] or "").lower().strip())
                if match:
                    recipe_ings.append({
                        "item_type": "ingredient",
                        "item_id": match.get("ingredient_id"),
                        "ingredient_id": match.get("ingredient_id"),
                        "ingredient_name": match.get("name"),
                        "quantity": float(ing.get("quantity") or 1),
                        "unit": ing.get("unit") or match.get("base_unit") or "unit",
                        "cost": 0.0,
                    })
                else:
                    has_unmatched = True
                    recipe_ings.append({
                        "item_type": "ingredient",
                        "item_id": None,
                        "ingredient_id": None,
                        "ingredient_name": ing.get("name"),
                        "quantity": float(ing.get("quantity") or 1),
                        "unit": ing.get("unit") or "unit",
                        "cost": 0.0,
                        "needs_review": True,
                    })

            try:
                servings = int(float(row.get("servings"))) if row.get("servings") is not None and not (isinstance(row.get("servings"), float) and pd.isna(row.get("servings"))) else 1
            except Exception:
                servings = 1
            if servings < 1:
                servings = 1

            recipe_type = str(row.get("recipe_type") or "final_dish").strip() or "final_dish"
            if recipe_type not in ("base", "component", "final_dish"):
                recipe_type = "final_dish"

            try:
                portion_price = float(row.get("default_portion_price")) if row.get("default_portion_price") is not None and not (isinstance(row.get("default_portion_price"), float) and pd.isna(row.get("default_portion_price"))) else 0.0
            except Exception:
                portion_price = 0.0

            # Compute cost from matched ingredients (best-effort)
            total_cost = 0.0
            try:
                from utils.units import cost_for_recipe_line  # type: ignore
            except Exception:
                cost_for_recipe_line = None
            if cost_for_recipe_line:
                for ri in recipe_ings:
                    if not ri.get("ingredient_id"):
                        continue
                    ing_doc = ing_by_name.get((ri.get("ingredient_name") or "").lower().strip())
                    if not ing_doc:
                        continue
                    try:
                        line_cost = cost_for_recipe_line(ing_doc, ri.get("quantity"), ri.get("unit"))
                        if line_cost is not None:
                            ri["cost"] = float(line_cost)
                            total_cost += float(line_cost)
                    except Exception:
                        pass

            cost_per_portion = (total_cost / servings) if servings > 0 else total_cost

            data = {
                "name": name,
                "description": str(row.get("description") or "").strip() or "",
                "category": str(row.get("category") or "main").strip() or "main",
                "recipe_type": recipe_type,
                "servings": servings,
                "yield_quantity": float(servings),
                "yield_unit": "portion",
                "portion_size": 1.0,
                "portion_unit": "serving",
                "prep_time": str(row.get("prep_time") or "").strip() or "",
                "instructions": str(row.get("instructions") or "").strip() or "",
                "notes": str(row.get("notes") or "").strip() or "",
                "default_portion_price": portion_price,
                "sell_price": portion_price * servings if portion_price else 0.0,
                "ingredients": recipe_ings,
                "sub_recipes": [],
                "total_cost": round(total_cost, 4),
                "cost_per_portion": round(cost_per_portion, 4),
                "cost_per_serving": round(cost_per_portion, 4),
                "cost_per_yield": round(cost_per_portion, 4),
                "needs_review": has_unmatched,
                "updated_at": now.isoformat(),
            }

            existing = await db.recipes.find_one({
                "company_id": user.company_id,
                "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            })
            if existing:
                if update_existing:
                    await db.recipes.update_one(
                        {"recipe_id": existing["recipe_id"], "company_id": user.company_id},
                        {"$set": data},
                    )
                    updated += 1
                else:
                    skipped += 1
            else:
                data["recipe_id"] = f"recipe_{uuid.uuid4().hex[:12]}"
                data["company_id"] = user.company_id
                data["created_at"] = now.isoformat()
                data["status"] = "active"
                data["allergens"] = []
                data["verified_status"] = "Draft"
                await db.recipes.insert_one(data)
                created += 1
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})

    return {
        "success": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
    }


# ============== PLATED MENU EXTENDED FIELDS ROUTES ==============

@plated_menus_router.put("/{menu_id}/extended")
async def update_plated_menu_extended(menu_id: str, data: PlatedMenuExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended plated menu fields (guest count, pricing)"""
    # Get current menu to calculate suggested price
    menu = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    update_data = {}
    if data.default_guest_count is not None:
        update_data["default_guest_count"] = data.default_guest_count
    if data.sell_price_per_guest is not None:
        update_data["sell_price_per_guest"] = data.sell_price_per_guest
    if data.target_margin_pct is not None:
        update_data["target_margin_pct"] = data.target_margin_pct
    if data.tax_included is not None:
        update_data["tax_included"] = data.tax_included
    
    # Calculate suggested price if target margin is set
    cost_with_buffer = menu.get("cost_with_buffer", menu.get("cost_per_guest", 0))
    target_margin = data.target_margin_pct if data.target_margin_pct is not None else menu.get("target_margin_pct", 0)
    if target_margin and target_margin > 0 and target_margin < 100:
        update_data["suggested_sell_price_per_guest"] = round(cost_with_buffer / (1 - target_margin / 100), 2)
    
    if not update_data:
        return {"message": "No updates provided"}
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.plated_menus.update_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    return {"message": "Updated"}

# ============== SUPPLIER EXTENDED FIELDS ROUTES ==============


# ============== EXPENSES ROUTES ==============

@expenses_router.get("")
async def get_expenses(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all expenses"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return expenses

@expenses_router.get("/{expense_id}")
async def get_expense(expense_id: str, user: User = Depends(get_current_user)):
    """Get a single expense"""
    expense = await db.expenses.find_one(
        {"expense_id": expense_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense

@expenses_router.post("")
async def create_expense(data: ExpenseCreate, user: User = Depends(get_current_user)):
    """Create a new expense"""
    # Get supplier name
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    
    now = datetime.now(timezone.utc)
    expense_id = f"expense_{uuid.uuid4().hex[:12]}"
    
    # Calculate totals
    lines = []
    subtotal = 0
    for line in data.lines:
        line_total = line.quantity * line.unit_cost
        lines.append({
            "inventory_item_id": line.inventory_item_id,
            "description": line.description,
            "quantity": line.quantity,
            "unit_cost": line.unit_cost,
            "tax_rate": line.tax_rate,
            "line_total": round(line_total, 2)
        })
        subtotal += line_total
    
    expense = {
        "expense_id": expense_id,
        "company_id": user.company_id,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier.get("name") if supplier else None,
        "po_id": data.po_id,
        "invoice_number": data.invoice_number,
        "invoice_date": data.invoice_date.isoformat() if data.invoice_date else now.isoformat(),
        "due_date": data.due_date.isoformat() if data.due_date else None,
        "payment_method": data.payment_method,
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "tax_amount": data.tax_amount,
        "total": round(subtotal + data.tax_amount, 2),
        "paid_amount": 0,
        "notes": data.notes,
        "status": data.status,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.expenses.insert_one(expense)
    del expense["_id"]
    return expense

@expenses_router.put("/{expense_id}/pay")
async def pay_expense(expense_id: str, amount: float, user: User = Depends(get_current_user)):
    """Record payment against an expense"""
    expense = await db.expenses.find_one(
        {"expense_id": expense_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    now = datetime.now(timezone.utc)
    new_paid = expense.get("paid_amount", 0) + amount
    new_status = "Paid" if new_paid >= expense.get("total", 0) else "Partial"
    
    await db.expenses.update_one(
        {"expense_id": expense_id, "company_id": user.company_id},
        {"$set": {
            "paid_amount": round(new_paid, 2),
            "status": new_status,
            "payment_status": new_status,  # Also update payment_status for UI compatibility
            "updated_at": now.isoformat()
        }}
    )
    return {"message": "Payment recorded", "new_status": new_status, "paid_amount": new_paid}

# ============== EVENT SCALING / CONSOLIDATED PURCHASE ROUTES ==============

@events_router.post("/generate-purchase-list")
async def generate_consolidated_purchase_list(data: EventScalingRequest, user: User = Depends(get_current_user)):
    """
    Generate a consolidated purchase list from one or more events.
    Scales recipe ingredients based on guest count and compares with inventory.
    """
    now = datetime.now(timezone.utc)
    events_info = []
    all_ingredients = {}  # {inventory_item_id: ScaledIngredient}
    total_quoted = 0  # Sum of all event quoted totals
    
    for event_id in data.event_ids:
        # Get event
        event = await db.events.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if not event:
            continue
        
        guest_count = event.get("guest_count", event.get("num_guests", 0)) or 0
        
        # Get proposal to get quoted total
        proposal = await db.proposals.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0}
        )
        
        quoted_inventory_total = 0  # All items from inventory (Food, Beverages, Disposables)
        proposal_total = 0          # Full proposal total for reference
        
        if proposal:
            proposal_total = proposal.get("total_amount", 0) or proposal.get("total", 0) or 0
            
            # Calculate quoted total for ALL inventory-related items
            # Include: Food (with recipes), Beverages, Disposables/Supplies
            # Exclude: Services, Rentals (these don't come from inventory)
            order_items_for_quote = await db.order_items.find(
                {"proposal_id": proposal.get("proposal_id"), "event_id": event_id},
                {"_id": 0}
            ).to_list(500)
            
            for oi in order_items_for_quote:
                item_type = oi.get("item_type", "")
                
                # Skip non-inventory items (services, rentals, fees, etc.)
                if item_type in ["Service", "Rental", "Staff", "Fee", "Other"]:
                    continue
                
                # Include Food with recipes
                if item_type == "Food" and oi.get("reference_id"):
                    item_total = (oi.get("quantity", 1) * oi.get("unit_price", 0))
                    quoted_inventory_total += item_total
                
                # Include Beverages (they come from inventory)
                elif item_type == "Beverage":
                    item_total = (oi.get("quantity", 1) * oi.get("unit_price", 0))
                    quoted_inventory_total += item_total
                
                # Include Disposables/Supplies (they come from inventory)
                elif item_type in ["Disposable", "Supply", "Supplies", "Equipment"]:
                    item_total = (oi.get("quantity", 1) * oi.get("unit_price", 0))
                    quoted_inventory_total += item_total
            
            total_quoted += quoted_inventory_total
        
        events_info.append({
            "event_id": event_id,
            "event_name": event.get("name"),
            "guest_count": guest_count,
            "date": event.get("event_date"),
            "time": event.get("event_time") or event.get("start_time"),
            "quoted_total": round(quoted_inventory_total, 2),  # All inventory items
            "proposal_total": round(proposal_total, 2)          # Full proposal for reference
        })
        
        # First, try to get recipes from event's assigned menu (menu_id)
        # This is the primary source for culinary prep planning
        menu_id = event.get("menu_id")
        recipes_to_process = []
        
        if menu_id:
            menu = await db.plated_menus.find_one(
                {"menu_id": menu_id, "company_id": user.company_id},
                {"_id": 0}
            )
            if menu:
                # Extract all recipes from menu courses
                for course in menu.get("courses", []):
                    for menu_item in course.get("items", []):
                        recipe_id = menu_item.get("recipe_id")
                        if recipe_id:
                            portions_per_guest = menu_item.get("portions_per_guest", 1) or 1
                            recipes_to_process.append({
                                "recipe_id": recipe_id,
                                "portions_needed": guest_count * portions_per_guest
                            })
        
        # Fallback: If no menu or no recipes from menu, try order_items from proposal
        if not recipes_to_process and proposal:
            order_items = await db.order_items.find(
                {"proposal_id": proposal.get("proposal_id"), "event_id": event_id},
                {"_id": 0}
            ).to_list(500)
            
            for item in order_items:
                if item.get("item_type") != "Food":
                    continue
                
                recipe_id = item.get("reference_id")
                if recipe_id:
                    recipes_to_process.append({
                        "recipe_id": recipe_id,
                        "portions_needed": item.get("quantity", 1) or 1
                    })
        
        # Skip if no recipes to process
        if not recipes_to_process:
            continue
        
        # Process each recipe
        for recipe_info in recipes_to_process:
            recipe_id = recipe_info.get("recipe_id")
            portions_needed = recipe_info.get("portions_needed", 0)
            
            # Get recipe
            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id},
                {"_id": 0}
            )
            if not recipe:
                continue
            
            # Get yield info
            portions_per_yield = recipe.get("portions_per_yield", 1) or 1
            yields_needed = portions_needed / portions_per_yield
            
            # Apply buffer if requested
            if data.include_buffer:
                buffer_pct = 1.1  # 10% default buffer
                yields_needed *= buffer_pct
            
            # Process recipe ingredients
            for ing in recipe.get("ingredients", []):
                # Support both item_id and ingredient_id (legacy field name)
                item_id = ing.get("item_id") or ing.get("ingredient_id")
                if not item_id:
                    continue
                
                # Get inventory item
                inv_item = await db.ingredients.find_one(
                    {"ingredient_id": item_id, "company_id": user.company_id},
                    {"_id": 0}
                )
                if not inv_item:
                    continue
                
                # Calculate required quantity
                qty_per_yield = ing.get("quantity", 0)
                waste_factor = ing.get("waste_factor_pct", 0)
                # Also check inventory item for default waste percentage
                inv_waste = inv_item.get("yield_waste_percent", 0)
                effective_waste = waste_factor if waste_factor > 0 else inv_waste
                effective_qty = qty_per_yield * (1 + effective_waste / 100) if effective_waste > 0 else qty_per_yield
                total_required = effective_qty * yields_needed
                
                if item_id in all_ingredients:
                    all_ingredients[item_id]["total_required"] += total_required
                    if recipe.get("name") not in all_ingredients[item_id]["recipes_used"]:
                        all_ingredients[item_id]["recipes_used"].append(recipe.get("name"))
                    # Keep max waste factor across all recipes using this ingredient
                    if effective_waste > all_ingredients[item_id].get("waste_percent", 0):
                        all_ingredients[item_id]["waste_percent"] = effective_waste
                else:
                    all_ingredients[item_id] = {
                        "inventory_item_id": item_id,
                        "item_name": inv_item.get("name"),
                        "unit": inv_item.get("unit"),
                        "total_required": total_required,
                        "base_required": qty_per_yield * yields_needed,  # Before waste adjustment
                        "waste_percent": effective_waste,
                        "in_stock": inv_item.get("stock_quantity", 0) if data.compare_inventory else 0,
                        "to_purchase": 0,
                        "unit_cost": inv_item.get("cost_per_unit", 0),
                        "total_cost": 0,
                        "supplier_id": inv_item.get("preferred_supplier_id"),
                        "supplier_name": None,
                        "recipes_used": [recipe.get("name")]
                    }
            
            # Process sub-recipes (recursive)
            for sub in recipe.get("sub_recipes", []):
                sub_recipe = await db.recipes.find_one(
                    {"recipe_id": sub.get("child_recipe_id"), "company_id": user.company_id},
                    {"_id": 0}
                )
                if not sub_recipe:
                    continue
                
                sub_qty = sub.get("quantity_used", 1)
                sub_yields_needed = sub_qty * yields_needed
                
                for ing in sub_recipe.get("ingredients", []):
                    # Support both item_id and ingredient_id (legacy field name)
                    item_id = ing.get("item_id") or ing.get("ingredient_id")
                    if not item_id:
                        continue
                    
                    inv_item = await db.ingredients.find_one(
                        {"ingredient_id": item_id, "company_id": user.company_id},
                        {"_id": 0}
                    )
                    if not inv_item:
                        continue
                    
                    qty_per_yield = ing.get("quantity", 0)
                    waste_factor = ing.get("waste_factor_pct", 0)
                    inv_waste = inv_item.get("yield_waste_percent", 0)
                    effective_waste = waste_factor if waste_factor > 0 else inv_waste
                    effective_qty = qty_per_yield * (1 + effective_waste / 100) if effective_waste > 0 else qty_per_yield
                    total_required = effective_qty * sub_yields_needed
                    
                    if item_id in all_ingredients:
                        all_ingredients[item_id]["total_required"] += total_required
                        if sub_recipe.get("name") not in all_ingredients[item_id]["recipes_used"]:
                            all_ingredients[item_id]["recipes_used"].append(sub_recipe.get("name"))
                        if effective_waste > all_ingredients[item_id].get("waste_percent", 0):
                            all_ingredients[item_id]["waste_percent"] = effective_waste
                    else:
                        all_ingredients[item_id] = {
                            "inventory_item_id": item_id,
                            "item_name": inv_item.get("name"),
                            "unit": inv_item.get("unit"),
                            "total_required": total_required,
                            "base_required": qty_per_yield * sub_yields_needed,
                            "waste_percent": effective_waste,
                            "in_stock": inv_item.get("stock_quantity", 0) if data.compare_inventory else 0,
                            "to_purchase": 0,
                            "unit_cost": inv_item.get("cost_per_unit", 0),
                            "total_cost": 0,
                            "supplier_id": inv_item.get("preferred_supplier_id"),
                            "supplier_name": None,
                            "recipes_used": [sub_recipe.get("name")]
                        }
    
    # Calculate to_purchase and group by supplier
    items_by_supplier = {}
    stock_requisition = []  # Items covered by inventory
    purchase_list = []       # Items that need purchasing
    production_needs = []    # PREPARED items that need to be produced
    total_cost = 0
    
    # Track sub-recipe (BASE/COMPONENT) needs separately
    sub_recipe_needs = {}  # {recipe_id: {recipe_name, recipe_type, qty_needed, in_stock, to_produce, unit, cost}}
    
    # Re-process events to calculate sub-recipe needs
    for event_id in data.event_ids:
        event = await db.events.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if not event:
            continue
        
        guest_count = event.get("guest_count", event.get("num_guests", 0)) or 0
        
        proposal = await db.proposals.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if not proposal:
            continue
        
        order_items = await db.order_items.find(
            {"proposal_id": proposal.get("proposal_id"), "event_id": event_id},
            {"_id": 0}
        ).to_list(500)
        
        for item in order_items:
            if item.get("item_type") != "Food":
                continue
            
            recipe_id = item.get("reference_id")
            if not recipe_id:
                continue
            
            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id},
                {"_id": 0}
            )
            if not recipe:
                continue
            
            # Calculate yields needed for this dish
            item_qty = item.get("quantity", 1)
            portions_needed = guest_count * item_qty
            portions_per_yield = recipe.get("portions_per_yield", 1) or 1
            yields_needed = portions_needed / portions_per_yield
            
            if data.include_buffer:
                yields_needed *= 1.1
            
            # Track sub-recipe needs (BASE/COMPONENT)
            for sub in recipe.get("sub_recipes", []):
                sub_recipe_id = sub.get("child_recipe_id") or sub.get("recipe_id")
                if not sub_recipe_id:
                    continue
                
                sub_recipe = await db.recipes.find_one(
                    {"recipe_id": sub_recipe_id, "company_id": user.company_id},
                    {"_id": 0}
                )
                if not sub_recipe:
                    continue
                
                sub_type = sub_recipe.get("recipe_type", "component")
                # Only track BASE and COMPONENT recipes for production
                if sub_type not in ["base", "component"]:
                    continue
                
                sub_qty = sub.get("quantity_used", sub.get("quantity", 1))
                sub_yields_needed = sub_qty * yields_needed
                
                if sub_recipe_id in sub_recipe_needs:
                    sub_recipe_needs[sub_recipe_id]["qty_needed"] += sub_yields_needed
                    if recipe.get("name") not in sub_recipe_needs[sub_recipe_id]["dishes_using"]:
                        sub_recipe_needs[sub_recipe_id]["dishes_using"].append(recipe.get("name"))
                else:
                    # Check PREPARED inventory for this recipe
                    prepared_item = await db.ingredients.find_one(
                        {"linked_recipe_id": sub_recipe_id, "company_id": user.company_id, "item_type": "PREPARED"},
                        {"_id": 0}
                    )
                    in_stock = prepared_item.get("stock_quantity", 0) if prepared_item else 0
                    
                    sub_recipe_needs[sub_recipe_id] = {
                        "recipe_id": sub_recipe_id,
                        "recipe_name": sub_recipe.get("name"),
                        "recipe_type": sub_type,
                        "qty_needed": sub_yields_needed,
                        "in_stock": in_stock,
                        "to_produce": 0,
                        "unit": sub_recipe.get("yield_unit", "batch"),
                        "cost_per_yield": sub_recipe.get("cost_per_yield", 0),
                        "dishes_using": [recipe.get("name")],
                        "prepared_item_id": prepared_item.get("ingredient_id") if prepared_item else None
                    }
    
    # Calculate production needs
    for recipe_id, needs in sub_recipe_needs.items():
        needs["qty_needed"] = round(needs["qty_needed"], 2)
        to_produce = max(0, needs["qty_needed"] - needs["in_stock"])
        needs["to_produce"] = round(to_produce, 2)
        needs["total_cost"] = round(to_produce * needs["cost_per_yield"], 2)
        
        if to_produce > 0:
            production_needs.append(needs)
    
    # Sort production needs by quantity
    production_needs.sort(key=lambda x: x["qty_needed"], reverse=True)
    
    for item_id, item in all_ingredients.items():
        to_purchase = max(0, item["total_required"] - item["in_stock"])
        item["to_purchase"] = round(to_purchase, 2)
        item["total_required"] = round(item["total_required"], 2)
        item["total_cost"] = round(to_purchase * item["unit_cost"], 2)
        total_cost += item["total_cost"]
        
        # Get supplier name
        supplier_id = item["supplier_id"] or "no_supplier"
        if supplier_id != "no_supplier":
            supplier = await db.suppliers.find_one(
                {"supplier_id": supplier_id, "company_id": user.company_id},
                {"_id": 0, "name": 1}
            )
            item["supplier_name"] = supplier.get("name") if supplier else None
        
        if supplier_id not in items_by_supplier:
            items_by_supplier[supplier_id] = []
        items_by_supplier[supplier_id].append(item)
        
        # Categorize into SR vs PL
        if item["in_stock"] > 0:
            stock_qty = round(min(item["in_stock"], item["total_required"]), 2)
            stock_requisition.append({
                "inventory_item_id": item_id,
                "item_name": item["item_name"],
                "unit": item["unit"],
                "in_stock": stock_qty,
                "total_required": item["total_required"],
                "unit_cost": item["unit_cost"],
                "total_cost": round(stock_qty * item["unit_cost"], 2),
                "recipes_used": item.get("recipes_used", [])
            })
        
        if to_purchase > 0:
            purchase_list.append({
                "inventory_item_id": item_id,
                "item_name": item["item_name"],
                "unit": item["unit"],
                "to_purchase": round(to_purchase, 2),
                "unit_cost": item["unit_cost"],
                "total_cost": item["total_cost"],
                "supplier_id": item.get("supplier_id"),
                "supplier_name": item.get("supplier_name"),
                "recipes_used": item.get("recipes_used", [])
            })
    
    # Calculate production total cost
    production_total_cost = sum(p["total_cost"] for p in production_needs)
    
    # Calculate SR total cost (inventory value used)
    sr_total_cost = sum(item.get("total_cost", 0) for item in stock_requisition)
    
    # Grand total = SR (inventory used) + PL (to purchase)
    grand_total = round(sr_total_cost + total_cost, 2)
    
    return {
        "events": events_info,
        "items_by_supplier": items_by_supplier,
        "stock_requisition": stock_requisition,  # Items from inventory (SR)
        "purchase_list": purchase_list,          # Items to buy (PL)
        "production_needs": production_needs,     # BASE/COMPONENT to produce (PN)
        "total_cost": round(total_cost, 2),      # Only PL cost
        "sr_total_cost": round(sr_total_cost, 2), # SR inventory value
        "grand_total": grand_total,              # SR + PL total
        "total_quoted": round(total_quoted, 2),  # Sum of quoted amounts from proposals
        "production_total_cost": round(production_total_cost, 2),
        "generated_at": now.isoformat()
    }

@events_router.post("/create-po-from-purchase-list")
async def create_po_from_purchase_list(
    data: CreatePOFromPurchaseListRequest,
    user: User = Depends(get_current_user)
):
    """
    Create a PO from a generated purchase list.
    items: [{inventory_item_id, item_name, to_purchase, unit, unit_cost}]
    """
    supplier_id = data.supplier_id
    items = data.items
    needed_by_date = data.needed_by_date
    
    # Handle case where no supplier is assigned
    supplier_name = "No Supplier Assigned"
    if supplier_id:
        supplier = await db.suppliers.find_one(
            {"supplier_id": supplier_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        if supplier:
            supplier_name = supplier.get("name", "Unknown Supplier")
    
    now = datetime.now(timezone.utc)
    po_id = f"po_{uuid.uuid4().hex[:12]}"
    
    # Generate PO number
    count = await db.purchase_orders_full.count_documents({"company_id": user.company_id})
    po_number = f"PO-{now.year}-{str(count + 1).zfill(4)}"
    
    # Create lines
    lines = []
    subtotal = 0
    for item in items:
        if item.to_purchase <= 0:
            continue
        
        line_id = f"poline_{uuid.uuid4().hex[:12]}"
        # Ensure numeric values
        qty = float(item.to_purchase) if item.to_purchase else 0
        cost = float(item.unit_cost) if item.unit_cost else 0
        line_total = qty * cost
        
        lines.append({
            "line_id": line_id,
            "inventory_item_id": item.inventory_item_id,
            "item_name": item.item_name,
            "qty_ordered": qty,
            "purchase_unit": item.unit or "unit",
            "unit_cost": cost,
            "line_total": round(line_total, 2),
            "qty_received": 0,
            "notes": None
        })
        subtotal += line_total
    
    if not lines:
        raise HTTPException(status_code=400, detail="No items to order")
    
    po = {
        "po_id": po_id,
        "company_id": user.company_id,
        "po_number": po_number,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "status": "Draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "needed_by_date": needed_by_date.isoformat() if needed_by_date else None,
        "payment_method": "Transfer",
        "notes": "Generated from purchase list",
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "tax_amount": 0,
        "total": round(subtotal, 2),
        "received_at": None,
        "received_by": None
    }
    await db.purchase_orders_full.insert_one(po)
    del po["_id"]
    return po

@events_router.post("/mark-procurement-complete")
async def mark_procurement_complete(data: dict, user: User = Depends(get_current_user)):
    """Mark events as procurement complete and save history"""
    event_ids = data.get("event_ids", [])
    procurement_data = data.get("procurement_data", {})
    now = datetime.now(timezone.utc)
    
    if not event_ids:
        raise HTTPException(status_code=400, detail="No events provided")
    
    # Update each event
    for event_id in event_ids:
        await db.events.update_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"$set": {
                "procurement_status": "completed",
                "procurement_completed_at": now.isoformat(),
                "procurement_history": procurement_data,
                "updated_at": now.isoformat()
            }}
        )
    
    return {"message": f"{len(event_ids)} events marked as procurement complete", "event_ids": event_ids}

@events_router.post("/{event_id}/reopen-procurement")
async def reopen_event_procurement(event_id: str, user: User = Depends(get_current_user)):
    """Reopen an event for procurement (move back to pending)"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$set": {
            "procurement_status": "pending",
            "updated_at": datetime.now(timezone.utc).isoformat()
        },
        "$unset": {
            "procurement_completed_at": "",
            "procurement_history": ""
        }}
    )
    
    return {"message": "Event reopened for procurement", "event_id": event_id}

# ============== PRODUCTION ROUTES ==============

@production_router.get("/batches")
async def get_production_batches(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all production batches"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    
    batches = await db.production_batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return batches

@production_router.get("/batches/{batch_id}")
async def get_production_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Get a specific production batch"""
    batch = await db.production_batches.find_one(
        {"batch_id": batch_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Production batch not found")
    return batch

@production_router.post("/batches")
async def create_production_batch(
    data: ProductionBatchCreate,
    user: User = Depends(get_current_user)
):
    """Create a new production batch"""
    now = datetime.now(timezone.utc)
    batch_id = f"batch_{uuid.uuid4().hex[:12]}"
    
    # Generate batch number
    count = await db.production_batches.count_documents({"company_id": user.company_id})
    batch_number = f"PROD-{now.year}-{str(count + 1).zfill(4)}"
    
    # Get event name if linked
    event_name = None
    if data.linked_event_id:
        event = await db.events.find_one({"event_id": data.linked_event_id}, {"_id": 0, "name": 1})
        event_name = event.get("name") if event else None
    
    # Process lines - expand BOM for each recipe
    lines = []
    total_input_cost = 0
    
    for line_data in data.lines:
        recipe = await db.recipes.find_one(
            {"recipe_id": line_data.recipe_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if not recipe:
            continue
        
        line_id = f"prodline_{uuid.uuid4().hex[:8]}"
        
        # Calculate multiplier based on target output
        recipe_yield = recipe.get("yield_quantity", 1)
        multiplier = line_data.target_output_qty / recipe_yield if recipe_yield > 0 else 1
        
        # Expand BOM - get all required inputs
        computed_inputs = []
        
        # Direct ingredients
        for ing in recipe.get("ingredients", []):
            if ing.get("item_type") == "ingredient":
                item_id = ing.get("item_id") or ing.get("ingredient_id")
                inv_item = await db.ingredients.find_one(
                    {"ingredient_id": item_id, "company_id": user.company_id},
                    {"_id": 0}
                )
                
                required_qty = (ing.get("quantity", 0) * multiplier)
                # PASE A: use cost_for_recipe_line so conversions between the
                # line's unit and the ingredient's base_unit are respected.
                # Multiplying required_qty (in ing.unit like "ml") by
                # cost_per_unit ($/purchase_unit like "botella") would
                # explode the total by the container factor.
                from utils.units import cost_for_recipe_line as _cfl_prod, UnitConversionError as _UCE_prod
                try:
                    total_cost_line = _cfl_prod(required_qty, ing.get("unit", "unit"), inv_item or {})
                    unit_cost = round(total_cost_line / required_qty, 6) if required_qty > 0 else 0
                except _UCE_prod:
                    total_cost_line = 0.0
                    unit_cost = float(inv_item.get("cost_per_base_unit") or 0) if inv_item else 0

                computed_inputs.append({
                    "inventory_item_id": item_id,
                    "item_name": ing.get("item_name", inv_item.get("name") if inv_item else "Unknown"),
                    "item_type": inv_item.get("item_type", "RAW") if inv_item else "RAW",
                    "required_qty": round(required_qty, 3),
                    "unit": ing.get("unit", "unit"),
                    "unit_cost": unit_cost,
                    "total_cost": round(total_cost_line, 2),
                    "in_stock": inv_item.get("stock_quantity", 0) if inv_item else 0
                })
                total_input_cost += total_cost_line
        
        # Sub-recipes (components)
        for sub in recipe.get("sub_recipes", []):
            sub_recipe_id = sub.get("recipe_id")
            sub_recipe = await db.recipes.find_one(
                {"recipe_id": sub_recipe_id, "company_id": user.company_id},
                {"_id": 0}
            )
            if sub_recipe:
                sub_qty = sub.get("quantity", 1) * multiplier
                computed_inputs.append({
                    "recipe_id": sub_recipe_id,
                    "item_name": sub_recipe.get("name"),
                    "item_type": "RECIPE",
                    "recipe_type": sub_recipe.get("recipe_type", "component"),
                    "required_qty": round(sub_qty, 3),
                    "unit": sub_recipe.get("yield_unit", "batch"),
                    "unit_cost": sub_recipe.get("cost_per_yield", 0),
                    "total_cost": round(sub_qty * sub_recipe.get("cost_per_yield", 0), 2)
                })
                total_input_cost += sub_qty * sub_recipe.get("cost_per_yield", 0)
        
        # Determine if this produces stock
        recipe_type = recipe.get("recipe_type", "final_dish")
        produces_stock = recipe_type in ["base", "component"] or recipe.get("produces_stock", False)
        
        lines.append({
            "line_id": line_id,
            "recipe_id": line_data.recipe_id,
            "recipe_name": recipe.get("name"),
            "recipe_type": recipe_type,
            "produces_stock": produces_stock,
            "target_output_qty": line_data.target_output_qty,
            "output_unit": line_data.output_unit or recipe.get("yield_unit", "batch"),
            "computed_inputs": computed_inputs,
            "actual_output_qty": None
        })
    
    batch = {
        "batch_id": batch_id,
        "company_id": user.company_id,
        "batch_number": batch_number,
        "status": "PLANNED",
        "linked_event_id": data.linked_event_id,
        "linked_event_name": event_name,
        "source_sr_id": data.source_sr_id,
        "notes": data.notes,
        "lines": lines,
        "total_input_cost": round(total_input_cost, 2),
        "total_output_value": 0,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "posted_at": None,
        "posted_by": None
    }
    
    await db.production_batches.insert_one(batch)
    del batch["_id"]
    return batch

@production_router.put("/batches/{batch_id}/status")
async def update_production_batch_status(
    batch_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update production batch status (including posting)"""
    new_status = data.get("status")
    if new_status not in ["PLANNED", "IN_PROGRESS", "POSTED", "VOIDED"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    batch = await db.production_batches.find_one(
        {"batch_id": batch_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Production batch not found")
    
    if batch["status"] == "POSTED":
        raise HTTPException(status_code=400, detail="Cannot modify a posted batch")
    
    now = datetime.now(timezone.utc)
    update_data = {"status": new_status, "updated_at": now.isoformat()}
    
    # If posting, process inventory
    if new_status == "POSTED":
        shortages = []
        
        # 1. Validate sufficient RAW inventory (check Available, not just On Hand)
        for line in batch.get("lines", []):
            for input_item in line.get("computed_inputs", []):
                if input_item.get("item_type") == "RAW":
                    inv_item = await db.ingredients.find_one(
                        {"ingredient_id": input_item.get("inventory_item_id"), "company_id": user.company_id},
                        {"_id": 0}
                    )
                    on_hand = inv_item.get("stock_quantity", 0) if inv_item else 0
                    reserved = inv_item.get("reserved_quantity", 0) if inv_item else 0
                    available = on_hand - reserved
                    required = input_item.get("required_qty", 0)
                    
                    # Production can use from reserved inventory
                    # Check if enough total stock (on_hand) exists
                    if on_hand < required:
                        shortages.append({
                            "item_name": input_item.get("item_name"),
                            "required": required,
                            "on_hand": on_hand,
                            "reserved": reserved,
                            "available": available,
                            "shortage": round(required - on_hand, 2)
                        })
        
        if shortages:
            raise HTTPException(
                status_code=400,
                detail={"message": "Insufficient inventory", "shortages": shortages}
            )
        
        # 2. Deduct RAW inventory (On Hand) and reduce Reserved
        total_output_value = 0
        
        for line in batch.get("lines", []):
            # Deduct inputs from On Hand AND reduce Reserved
            for input_item in line.get("computed_inputs", []):
                if input_item.get("item_type") == "RAW" and input_item.get("inventory_item_id"):
                    required_qty = input_item.get("required_qty", 0)
                    
                    # Get current reserved for this item
                    inv_item = await db.ingredients.find_one(
                        {"ingredient_id": input_item["inventory_item_id"], "company_id": user.company_id},
                        {"_id": 0}
                    )
                    current_reserved = inv_item.get("reserved_quantity", 0) if inv_item else 0
                    
                    # Calculate how much of this consumption was reserved
                    # Consume from reserved first, then from unreserved
                    consume_from_reserved = min(required_qty, current_reserved)
                    
                    # Update inventory: deduct from On Hand, reduce Reserved
                    await db.ingredients.update_one(
                        {"ingredient_id": input_item["inventory_item_id"], "company_id": user.company_id},
                        {
                            "$inc": {
                                "stock_quantity": -required_qty,  # Deduct from On Hand
                                "reserved_quantity": -consume_from_reserved  # Reduce Reserved
                            }
                        }
                    )
                    
                    # Mark related reservations as consumed
                    event_id = batch.get("linked_event_id")
                    if event_id and consume_from_reserved > 0:
                        await db.inventory_reservations.update_many(
                            {
                                "inventory_item_id": input_item["inventory_item_id"],
                                "event_ids": event_id,
                                "status": "active"
                            },
                            {"$set": {"status": "consumed", "consumed_at": now.isoformat()}}
                        )
                    
                    # Audit log
                    await db.audit_logs.insert_one({
                        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
                        "company_id": user.company_id,
                        "user_id": user.user_id,
                        "action_type": "production_deduction",
                        "entity_type": "ingredient",
                        "entity_id": input_item["inventory_item_id"],
                        "changes": {
                            "batch_id": batch_id,
                            "quantity_deducted": required_qty,
                            "from_reserved": consume_from_reserved,
                            "item_name": input_item.get("item_name")
                        },
                        "timestamp": now.isoformat()
                    })
            
            # Create/increment PREPARED outputs if produces_stock
            if line.get("produces_stock", False):
                recipe_id = line.get("recipe_id")
                output_qty = line.get("actual_output_qty") or line.get("target_output_qty", 0)
                output_unit = line.get("output_unit", "batch")
                
                # Check if PREPARED inventory exists for this recipe
                existing = await db.ingredients.find_one(
                    {"linked_recipe_id": recipe_id, "company_id": user.company_id, "item_type": "PREPARED"},
                    {"_id": 0}
                )
                
                if existing:
                    # Increment stock
                    await db.ingredients.update_one(
                        {"ingredient_id": existing["ingredient_id"]},
                        {"$inc": {"stock_quantity": output_qty}}
                    )
                else:
                    # Create new PREPARED inventory item
                    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
                    ing_id = f"ing_{uuid.uuid4().hex[:12]}"
                    
                    new_prepared = {
                        "ingredient_id": ing_id,
                        "company_id": user.company_id,
                        "name": f"{line.get('recipe_name')} (Prepared)",
                        "category": "Prepared",
                        "inventory_type": "food",
                        "item_type": "PREPARED",
                        "linked_recipe_id": recipe_id,
                        "unit": output_unit,
                        "cost_per_unit": recipe.get("cost_per_yield", 0) if recipe else 0,
                        "stock_quantity": output_qty,
                        "min_stock_level": 0,
                        "par_level": 0,
                        "yield_waste_percent": 0,
                        "allergens": recipe.get("allergens", []) if recipe else [],
                        "storage_location": "cold",
                        "reorder_threshold": 0,
                        "preferred_supplier_id": None,
                        "alternate_supplier_ids": [],
                        "pack_size": 1,
                        "pack_unit": output_unit,
                        "average_cost": recipe.get("cost_per_yield", 0) if recipe else 0,
                        "price_history": [],
                        "created_at": now.isoformat(),
                        "updated_at": now.isoformat()
                    }
                    await db.ingredients.insert_one(new_prepared)
                
                # Calculate output value
                recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
                if recipe:
                    total_output_value += output_qty * recipe.get("cost_per_yield", 0)
                
                # Audit log
                await db.audit_logs.insert_one({
                    "log_id": f"audit_{uuid.uuid4().hex[:12]}",
                    "company_id": user.company_id,
                    "user_id": user.user_id,
                    "action_type": "production_output",
                    "entity_type": "recipe",
                    "entity_id": recipe_id,
                    "changes": {
                        "batch_id": batch_id,
                        "quantity_produced": output_qty,
                        "recipe_name": line.get("recipe_name")
                    },
                    "timestamp": now.isoformat()
                })
        
        update_data["posted_at"] = now.isoformat()
        update_data["posted_by"] = user.user_id
        update_data["total_output_value"] = round(total_output_value, 2)
    
    await db.production_batches.update_one(
        {"batch_id": batch_id},
        {"$set": update_data}
    )
    
    return {"message": f"Batch status updated to {new_status}", "batch_id": batch_id}

@production_router.put("/batches/{batch_id}/lines/{line_id}")
async def update_production_line(
    batch_id: str,
    line_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a production line (e.g., actual output qty)"""
    batch = await db.production_batches.find_one(
        {"batch_id": batch_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Production batch not found")
    
    if batch["status"] == "POSTED":
        raise HTTPException(status_code=400, detail="Cannot modify a posted batch")
    
    # Update the specific line
    lines = batch.get("lines", [])
    for i, line in enumerate(lines):
        if line["line_id"] == line_id:
            if "actual_output_qty" in data:
                lines[i]["actual_output_qty"] = data["actual_output_qty"]
            break
    
    await db.production_batches.update_one(
        {"batch_id": batch_id},
        {"$set": {"lines": lines, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Line updated", "line_id": line_id}

@production_router.delete("/batches/{batch_id}")
async def delete_production_batch(batch_id: str, user: User = Depends(get_current_user)):
    """Delete a production batch (only if PLANNED or VOIDED)"""
    batch = await db.production_batches.find_one(
        {"batch_id": batch_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Production batch not found")
    
    if batch["status"] in ["IN_PROGRESS", "POSTED"]:
        raise HTTPException(status_code=400, detail="Cannot delete batch in this status")
    
    await db.production_batches.delete_one({"batch_id": batch_id})
    return {"message": "Batch deleted", "batch_id": batch_id}

@production_router.post("/mise-en-place")
async def generate_mise_en_place(
    data: dict,
    user: User = Depends(get_current_user)
):
    """
    Generate Mise en Place checklist from active production batches.
    
    Mise en Place includes:
    - Ingredients to prepare (cut, weigh, portion, marinate)
    - Production base (sauces, broths, dressings)
    - Portioning
    - Partial production items
    
    Categories:
    1. Ingredientes Preparados - vegetables, proteins, herbs
    2. Producción Base - sauces, broths, dressings, creams
    3. Porcionado - proteins per serving, measured garnishes
    4. Producción Parcial - doughs, fillings, 70-80% preparations
    """
    batch_ids = data.get("batch_ids", [])
    
    if not batch_ids:
        raise HTTPException(status_code=400, detail="No batch IDs provided")
    
    # Get all specified batches
    batches = await db.production_batches.find(
        {"batch_id": {"$in": batch_ids}, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    
    if not batches:
        raise HTTPException(status_code=404, detail="No batches found")
    
    # Group by event
    events_data = {}
    
    for batch in batches:
        event_id = batch.get("linked_event_id") or "no_event"
        
        if event_id not in events_data:
            # Get event details if linked
            event = None
            if event_id != "no_event":
                event = await db.events.find_one(
                    {"event_id": event_id, "company_id": user.company_id},
                    {"_id": 0, "event_id": 1, "name": 1, "event_date": 1, "guest_count": 1, "num_guests": 1}
                )
            
            events_data[event_id] = {
                "event_id": event_id,
                "event_name": event.get("name", "Sin Evento") if event else "Producción General",
                "event_date": event.get("event_date") if event else None,
                "guest_count": event.get("guest_count") or event.get("num_guests", 0) if event else 0,
                "items": []
            }
        
        # Process each line in the batch
        for line in batch.get("lines", []):
            recipe_id = line.get("recipe_id")
            recipe_name = line.get("recipe_name", "")
            target_qty = line.get("target_output_qty", 0)
            output_unit = line.get("output_unit", "batch")
            
            # Get recipe details with BOM
            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id},
                {"_id": 0}
            )
            
            if not recipe:
                continue
            
            # Get all ingredients from recipe BOM
            for ingredient in recipe.get("ingredients", []):
                # Scale quantity based on target output
                portions_per_yield = recipe.get("portions_per_yield", 1) or 1
                scale = target_qty / portions_per_yield if portions_per_yield > 0 else 1
                
                item_name = ingredient.get("name", "")
                item_qty = (ingredient.get("quantity", 0) or 0) * scale
                item_unit = ingredient.get("unit", "")
                prep_method = ingredient.get("prep_method", "")
                
                # Categorize based on item type or prep method
                category = categorize_mise_en_place_item(item_name, prep_method, ingredient)
                
                events_data[event_id]["items"].append({
                    "name": item_name,
                    "quantity": round(item_qty, 2),
                    "unit": item_unit,
                    "recipe_name": recipe_name,
                    "prep_method": prep_method,
                    "category": category,
                    "notes": ingredient.get("notes", "")
                })
    
    # Organize items by category for each event
    result_events = []
    total_items = 0
    total_recipes = set()
    
    for event_id, evt_data in events_data.items():
        # Group items by category
        categories_map = {}
        for item in evt_data["items"]:
            cat = item["category"]
            if cat not in categories_map:
                categories_map[cat] = []
            categories_map[cat].append(item)
            total_items += 1
            if item.get("recipe_name"):
                total_recipes.add(item["recipe_name"])
        
        # Convert to list format
        categories_list = [
            {"name": cat_name, "items": items}
            for cat_name, items in categories_map.items()
        ]
        
        result_events.append({
            "event_id": evt_data["event_id"],
            "event_name": evt_data["event_name"],
            "event_date": evt_data["event_date"],
            "guest_count": evt_data["guest_count"],
            "categories": categories_list
        })
    
    return {
        "events": result_events,
        "total_items": total_items,
        "total_recipes": len(total_recipes),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

def categorize_mise_en_place_item(name: str, prep_method: str, ingredient: dict) -> str:
    """Categorize an item for Mise en Place based on its characteristics"""
    name_lower = name.lower()
    prep_lower = (prep_method or "").lower()
    
    # Producción Base - sauces, broths, dressings
    base_keywords = ["salsa", "sauce", "caldo", "broth", "aderezo", "dressing", "crema", "cream", "marinado", "marinade"]
    if any(kw in name_lower for kw in base_keywords):
        return "🍲 Producción Base"
    
    # Porcionado - proteins, measured garnishes
    if "porcion" in prep_lower or "portion" in prep_lower or "racion" in prep_lower:
        return "⚖️ Porcionado"
    
    # Producción Parcial - doughs, fillings
    partial_keywords = ["masa", "dough", "relleno", "filling", "mezcla", "mix", "base"]
    if any(kw in name_lower for kw in partial_keywords):
        return "🥣 Producción Parcial"
    
    # Ingredientes Preparados - vegetables, proteins, herbs (default)
    return "🥬 Ingredientes Preparados"

@production_router.get("/recipes-for-production")
async def get_recipes_for_production(
    only_stock_producing: bool = False,
    user: User = Depends(get_current_user)
):
    """Get recipes available for production batches"""
    query = {"company_id": user.company_id}
    
    recipes = await db.recipes.find(query, {"_id": 0}).to_list(500)
    
    result = []
    for r in recipes:
        recipe_type = r.get("recipe_type", "final_dish")
        produces_stock = recipe_type in ["base", "component"] or r.get("produces_stock", False)
        
        if only_stock_producing and not produces_stock:
            continue
        
        result.append({
            "recipe_id": r.get("recipe_id"),
            "name": r.get("name"),
            "recipe_type": recipe_type,
            "produces_stock": produces_stock,
            "yield_quantity": r.get("yield_quantity", 1),
            "yield_unit": r.get("yield_unit", "batch"),
            "cost_per_yield": r.get("cost_per_yield", 0)
        })
    
    return result

@production_router.post("/suggest-from-events")
async def suggest_production_from_events(
    data: dict,
    user: User = Depends(get_current_user)
):
    """
    Suggest production lines based on event recipes.
    Analyzes menus/recipes used in selected events and returns
    BASE/COMPONENT recipes that should be produced.
    """
    event_ids = data.get("event_ids", [])
    if not event_ids:
        return {"suggested_lines": [], "events": []}
    
    # Get events
    events = await db.events.find(
        {"event_id": {"$in": event_ids}, "company_id": user.company_id},
        {"_id": 0, "event_id": 1, "name": 1, "guest_count": 1, "num_guests": 1}
    ).to_list(100)
    
    # Collect all recipes needed
    recipe_requirements = {}  # recipe_id -> {qty_needed, events_using}
    
    for event in events:
        event_id = event.get("event_id")
        guest_count = event.get("guest_count") or event.get("num_guests") or 100
        
        # Get proposal for this event
        proposal = await db.proposals.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "proposal_id": 1}
        )
        
        if not proposal:
            continue
        
        # Get order items (Food items) for this proposal
        order_items = await db.order_items.find(
            {"proposal_id": proposal.get("proposal_id"), "item_type": "Food"},
            {"_id": 0}
        ).to_list(500)
        
        # Look for food items with recipes
        for item in order_items:
            recipe_id = item.get("reference_id")  # Order items use reference_id for recipe link
            if not recipe_id:
                continue
            
            # Get the recipe and its sub-recipes
            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id},
                {"_id": 0}
            )
            
            if not recipe:
                continue
            
            # Calculate portions needed
            qty = item.get("quantity", 1)
            portions_needed = qty * guest_count
            portions_per_yield = recipe.get("portions_per_yield", 1) or 1
            batches_needed = portions_needed / portions_per_yield if portions_per_yield > 0 else 1
            
            # Add sub-recipes (BASE/COMPONENT) to requirements
            for sub in recipe.get("sub_recipes", []):
                sub_recipe_id = sub.get("child_recipe_id") or sub.get("recipe_id")
                sub_qty = sub.get("quantity_used", sub.get("quantity", 1)) * batches_needed
                
                sub_recipe = await db.recipes.find_one(
                    {"recipe_id": sub_recipe_id, "company_id": user.company_id},
                    {"_id": 0}
                )
                
                if not sub_recipe:
                    continue
                
                sub_type = sub_recipe.get("recipe_type", "component")
                if sub_type not in ["base", "component"]:
                    continue
                
                if sub_recipe_id not in recipe_requirements:
                    recipe_requirements[sub_recipe_id] = {
                        "recipe_id": sub_recipe_id,
                        "recipe_name": sub_recipe.get("name"),
                        "recipe_type": sub_type,
                        "yield_unit": sub_recipe.get("yield_unit", "batch"),
                        "cost_per_yield": sub_recipe.get("cost_per_yield", 0),
                        "qty_needed": 0,
                        "events_using": []
                    }
                
                recipe_requirements[sub_recipe_id]["qty_needed"] += sub_qty
                if event.get("name") not in recipe_requirements[sub_recipe_id]["events_using"]:
                    recipe_requirements[sub_recipe_id]["events_using"].append(event.get("name"))
    
    # Convert to list and sort by qty needed
    suggested_lines = sorted(
        recipe_requirements.values(),
        key=lambda x: x["qty_needed"],
        reverse=True
    )
    
    return {
        "suggested_lines": suggested_lines,
        "events": [{"event_id": e["event_id"], "name": e["name"]} for e in events]
    }


@production_router.post("/event-plan")
async def production_event_plan(data: dict, user: User = Depends(get_current_user)):
    """P1-A — Production Plan View per Event.

    READ-ONLY computation: given an event_id (and optional guest_count_override),
    expand every recipe linked to the event's plated menu + proposal Food items,
    aggregate the required ingredient quantities, and report shortages vs on-hand
    and available (on_hand - reserved) inventory.

    Body:
      { "event_id": str, "guest_count_override": Optional[int] }

    Returns (no DB writes):
      {
        event_id, event_name, guest_count, currency_estimate,
        planned_recipes: [
          { recipe_id, recipe_name, source ("menu" | "proposal"), portions_required,
            scale_factor, total_cost, cost_per_portion }
        ],
        aggregated_ingredients: [
          { inventory_item_id, name, unit, required_qty, on_hand, reserved,
            available, shortage, total_cost }
        ],
        shortages: [ subset of aggregated_ingredients with shortage > 0 ],
        totals: { total_input_cost, ingredients_count, shortage_count }
      }
    """
    event_id = data.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    guest_count = int(data.get("guest_count_override") or event.get("guest_count") or event.get("num_guests") or 0)
    if guest_count <= 0:
        guest_count = 1  # fallback so math doesn't divide by zero

    # ---- 1) Collect (recipe_id, portions_required, source) tuples
    planned = []  # raw list before grouping
    seen = {}     # recipe_id -> aggregated entry for output

    # 1a) From plated menu (if linked via menu_id)
    menu_id = event.get("menu_id")
    if menu_id:
        plated_menu = await db.plated_menus.find_one(
            {"menu_id": menu_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if plated_menu:
            for course in plated_menu.get("courses", []):
                for item in course.get("items", []):
                    rid = item.get("recipe_id")
                    if not rid:
                        continue
                    portions = (item.get("portions_per_guest") or 1) * guest_count
                    planned.append({"recipe_id": rid, "portions_required": portions, "source": "menu"})

    # 1b) From proposal Food order_items (reference_id is the recipe_id)
    proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "proposal_id": 1}
    )
    if proposal:
        order_items = await db.order_items.find(
            {
                "proposal_id": proposal.get("proposal_id"),
                "item_type": "Food",
                "reference_type": {"$in": [None, "recipe", "Recipe"]},
            },
            {"_id": 0}
        ).to_list(500)
        for item in order_items:
            rid = item.get("reference_id")
            if not rid:
                continue
            # Heuristic: order item quantity is per guest unless explicitly absolute
            qty_per_guest = item.get("quantity") or 1
            portions = qty_per_guest * guest_count
            planned.append({"recipe_id": rid, "portions_required": portions, "source": "proposal"})

    # ---- 2) For each recipe expand ingredients with scale factor & aggregate
    aggregated = {}    # inventory_item_id -> aggregated dict
    total_input_cost = 0.0
    planned_recipes_out = []

    for p in planned:
        rid = p["recipe_id"]
        portions_required = float(p["portions_required"] or 0)
        if portions_required <= 0:
            continue

        recipe = await db.recipes.find_one(
            {"recipe_id": rid, "company_id": user.company_id},
            {"_id": 0}
        )
        if not recipe:
            continue

        recipe_yield = float(recipe.get("portions_per_yield") or recipe.get("yield_quantity") or 1) or 1
        scale_factor = portions_required / recipe_yield

        recipe_cost_lines = 0.0
        for ing in recipe.get("ingredients", []):
            iid = ing.get("ingredient_id") or ing.get("item_id")
            if not iid:
                continue
            inv = await db.ingredients.find_one(
                {"ingredient_id": iid, "company_id": user.company_id},
                {"_id": 0, "name": 1, "unit": 1, "cost_per_unit": 1,
                 "stock_quantity": 1, "reserved_quantity": 1}
            )
            base_qty = float(ing.get("quantity") or 0)
            qty_scaled = base_qty * scale_factor
            if qty_scaled <= 0:
                continue
            # PASE A: use cost_for_recipe_line so line_unit → base_unit
            # conversion is done properly. Multiplying qty_scaled (in
            # ing.unit) by cost_per_unit ($/purchase_unit) breaks whenever
            # ing.unit ≠ purchase_unit (e.g. recipe uses ml, ingredient
            # sold per botella).
            from utils.units import cost_for_recipe_line as _cfl_kf, UnitConversionError as _UCE_kf
            try:
                line_cost = _cfl_kf(qty_scaled, ing.get("unit") or (inv or {}).get("unit") or "unit", inv or {})
                cost_per_unit = round(line_cost / qty_scaled, 6) if qty_scaled > 0 else 0
            except _UCE_kf:
                line_cost = 0.0
                cost_per_unit = float((inv or {}).get("cost_per_base_unit") or 0)
            recipe_cost_lines += line_cost
            total_input_cost += line_cost

            entry = aggregated.get(iid)
            if not entry:
                entry = {
                    "inventory_item_id": iid,
                    "name": (inv or {}).get("name") or ing.get("name") or "Unknown",
                    "unit": ing.get("unit") or (inv or {}).get("unit") or "unit",
                    "required_qty": 0.0,
                    "on_hand": float((inv or {}).get("stock_quantity") or 0),
                    "reserved": float((inv or {}).get("reserved_quantity") or 0),
                    "total_cost": 0.0,
                    "cost_per_unit": cost_per_unit,
                }
                aggregated[iid] = entry
            entry["required_qty"] += qty_scaled
            entry["total_cost"] += line_cost

        cost_per_portion = recipe_cost_lines / portions_required if portions_required > 0 else 0
        # Group same recipe if it appears in both menu & proposal — sum portions
        key = rid + ":" + p["source"]
        if key in seen:
            seen[key]["portions_required"] += portions_required
            seen[key]["total_cost"] += recipe_cost_lines
        else:
            entry = {
                "recipe_id": rid,
                "recipe_name": recipe.get("name"),
                "source": p["source"],
                "portions_required": round(portions_required, 3),
                "scale_factor": round(scale_factor, 4),
                "total_cost": round(recipe_cost_lines, 4),
                "cost_per_portion": round(cost_per_portion, 4),
                "yield_unit": recipe.get("yield_unit", "portion"),
            }
            seen[key] = entry
            planned_recipes_out.append(entry)

    # Finalize aggregated ingredient list
    agg_list = []
    shortages = []
    for entry in aggregated.values():
        available = max(0.0, entry["on_hand"] - entry["reserved"])
        shortage = max(0.0, entry["required_qty"] - available)
        entry["required_qty"] = round(entry["required_qty"], 3)
        entry["on_hand"] = round(entry["on_hand"], 3)
        entry["reserved"] = round(entry["reserved"], 3)
        entry["available"] = round(available, 3)
        entry["shortage"] = round(shortage, 3)
        entry["total_cost"] = round(entry["total_cost"], 4)
        agg_list.append(entry)
        if shortage > 0:
            shortages.append(entry)

    agg_list.sort(key=lambda x: (-x["shortage"], x["name"] or ""))
    shortages.sort(key=lambda x: -x["shortage"])

    return {
        "event_id": event_id,
        "event_name": event.get("name"),
        "guest_count": guest_count,
        "planned_recipes": planned_recipes_out,
        "aggregated_ingredients": agg_list,
        "shortages": shortages,
        "totals": {
            "total_input_cost": round(total_input_cost, 4),
            "ingredients_count": len(agg_list),
            "shortage_count": len(shortages),
            "recipes_count": len(planned_recipes_out),
        },
    }


# --- Experience Design ---
# --- Event Blueprint (main event detail) ---
@orchestration_router.get("/blueprint/{event_id}")
async def get_event_blueprint(event_id: str, user: User = Depends(get_current_user)):
    """Get event with all blueprint information for event detail page"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Parse date fields
    for field in ["event_date", "end_date", "created_at", "updated_at"]:
        if event.get(field) and isinstance(event[field], str):
            try:
                event[field] = datetime.fromisoformat(event[field])
            except Exception:
                event[field] = None
    
    # Get client info
    if event.get("client_id"):
        client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0, "display_name": 1, "email": 1, "phone": 1})
        event["client_info"] = client or {}
    
    # Get blueprint data
    blueprint = await db.event_blueprints.find_one({"event_id": event_id}, {"_id": 0})
    event["blueprint"] = blueprint or {}
    
    # Get orchestration data
    event["has_blueprint"] = blueprint is not None
    event["has_run_of_show"] = await db.run_of_show.find_one({"event_id": event_id}) is not None
    team = await db.event_teams.find_one({"event_id": event_id})
    event["has_team"] = team is not None and len(team.get("assignees", [])) > 0
    
    return event

@orchestration_router.get("/experience/{event_id}")
async def get_experience_design(event_id: str, user: User = Depends(get_current_user)):
    """Get experience design for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    design = await db.experience_designs.find_one({"event_id": event_id}, {"_id": 0})
    
    return design or {
        "event_id": event_id,
        "color_palette": [],
        "materials": [],
        "moodboard_images": [],
        "catering_setup": None,
        "layout_zones": [],
        "notes": None
    }

@orchestration_router.put("/experience/{event_id}")
async def update_experience_design(event_id: str, data: ExperienceDesignCreate, user: User = Depends(get_current_user)):
    """Update experience design for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify experience design.")
    
    now = datetime.now(timezone.utc)
    design_data = data.dict()
    design_data["company_id"] = user.company_id
    design_data["updated_at"] = now.isoformat()
    
    await db.experience_designs.update_one(
        {"event_id": event_id},
        {"$set": design_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.experience_designs.find_one({"event_id": event_id}, {"_id": 0})

# --- Operational Flow ---
@orchestration_router.get("/operational-flow/{event_id}")
async def get_operational_flow(event_id: str, user: User = Depends(get_current_user)):
    """Get operational flow for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    flow = await db.operational_flows.find_one({"event_id": event_id}, {"_id": 0})
    
    if not flow:
        # Return default structure with 3 phases
        flow = {
            "event_id": event_id,
            "phases": [
                {"phase_id": f"phase_{uuid.uuid4().hex[:8]}", "name": "Pre-Event", "status": "pending", "checklist": []},
                {"phase_id": f"phase_{uuid.uuid4().hex[:8]}", "name": "Live", "status": "pending", "checklist": []},
                {"phase_id": f"phase_{uuid.uuid4().hex[:8]}", "name": "Post-Event", "status": "pending", "checklist": []},
            ],
            "dependencies": [],
            "risks": [],
            "overall_status": "planning"
        }
    
    return flow

@orchestration_router.put("/operational-flow/{event_id}")
async def update_operational_flow(event_id: str, data: OperationalFlowCreate, user: User = Depends(get_current_user)):
    """Update operational flow for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify operational flow.")
    
    now = datetime.now(timezone.utc)
    flow_data = data.dict()
    flow_data["company_id"] = user.company_id
    flow_data["updated_at"] = now.isoformat()
    
    await db.operational_flows.update_one(
        {"event_id": event_id},
        {"$set": flow_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.operational_flows.find_one({"event_id": event_id}, {"_id": 0})

# --- Run of Show ---
@orchestration_router.get("/run-of-show/templates")
async def get_run_of_show_templates(user: User = Depends(get_current_user)):
    """Get available Run of Show templates"""
    return RUN_OF_SHOW_TEMPLATES

@orchestration_router.get("/run-of-show/{event_id}")
async def get_run_of_show(event_id: str, user: User = Depends(get_current_user)):
    """Get Run of Show for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    ros = await db.run_of_show.find_one({"event_id": event_id}, {"_id": 0})
    
    return ros or {
        "event_id": event_id,
        "time_blocks": [],
        "template_name": None,
        "contingency_notes": None
    }

@orchestration_router.put("/run-of-show/{event_id}")
async def update_run_of_show(event_id: str, data: RunOfShowCreate, user: User = Depends(get_current_user)):
    """Update Run of Show for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify run of show.")
    
    now = datetime.now(timezone.utc)
    ros_data = data.dict()
    ros_data["company_id"] = user.company_id
    ros_data["updated_at"] = now.isoformat()
    
    await db.run_of_show.update_one(
        {"event_id": event_id},
        {"$set": ros_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.run_of_show.find_one({"event_id": event_id}, {"_id": 0})

@orchestration_router.post("/run-of-show/{event_id}/apply-template")
async def apply_run_of_show_template(event_id: str, template_key: str, user: User = Depends(get_current_user)):
    """Apply a template to Run of Show"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot apply template.")
    
    if template_key not in RUN_OF_SHOW_TEMPLATES:
        raise HTTPException(status_code=400, detail="Invalid template")
    
    template = RUN_OF_SHOW_TEMPLATES[template_key]
    now = datetime.now(timezone.utc)
    
    # Generate time blocks from template
    time_blocks = []
    for i, block in enumerate(template["blocks"]):
        time_blocks.append({
            "block_id": f"block_{uuid.uuid4().hex[:8]}",
            "start_time": block["start_time"],
            "end_time": block["end_time"],
            "title": block["title"],
            "description": None,
            "responsible_role": None,
            "location": None,
            "notes": None,
            "is_buffer": block.get("is_buffer", False),
            "order": i
        })
    
    ros_data = {
        "event_id": event_id,
        "company_id": user.company_id,
        "time_blocks": time_blocks,
        "template_name": template["name"],
        "contingency_notes": None,
        "updated_at": now.isoformat()
    }
    
    await db.run_of_show.update_one(
        {"event_id": event_id},
        {"$set": ros_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.run_of_show.find_one({"event_id": event_id}, {"_id": 0})

# --- Team & Roles ---
@orchestration_router.get("/team/{event_id}")
async def get_team_roles(event_id: str, user: User = Depends(get_current_user)):
    """Get team and roles for an event - synced from contract Service items"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get synced roles from order_items (Service type)
    synced_roles = []
    proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id})
    if proposal:
        service_items = await db.order_items.find(
            {"proposal_id": proposal["proposal_id"], "item_type": "Service"},
            {"_id": 0}
        ).to_list(100)
        
        for item in service_items:
            synced_roles.append({
                "role_id": f"synced_{item.get('item_id', '')}",
                "role_name": item.get("description", "Service"),
                "quantity": int(item.get("quantity", 1)),
                "is_synced": True,  # Flag to indicate this is from contract
                "is_billable": True,
                "unit_price": item.get("unit_price", 0),
                "total_price": item.get("total_price", 0),
                "assignees": [],
                "responsibilities": "",
                "contact_info": "",
                "capacity_notes": ""
            })
    
    # Get additional operational roles (non-billable)
    team = await db.event_team_roles.find_one({"event_id": event_id}, {"_id": 0})
    operational_roles = []
    if team:
        operational_roles = [r for r in team.get("roles", []) if not r.get("is_synced", False)]
    
    return {
        "event_id": event_id,
        "synced_roles": synced_roles,  # From contract (read-only quantities)
        "operational_roles": operational_roles,  # Non-billable additions
        "roles": synced_roles + operational_roles,  # Combined for backwards compatibility
        "coordinator_notes": team.get("coordinator_notes") if team else None,
        "is_locked": event.get("stage") == "Closed"
    }

@orchestration_router.put("/team/{event_id}")
async def update_team_roles(event_id: str, data: TeamRolesCreate, user: User = Depends(get_current_user)):
    """Update team and roles for an event - only operational roles and assignments"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify team roles.")
    
    now = datetime.now(timezone.utc)
    
    # Filter out synced roles from the update (preserve them from contract)
    incoming_roles = data.dict().get("roles", [])
    operational_roles = [r for r in incoming_roles if not r.get("is_synced", False)]
    
    team_data = {
        "event_id": event_id,
        "roles": operational_roles,  # Only store non-synced roles
        "coordinator_notes": data.coordinator_notes,
        "company_id": user.company_id,
        "updated_at": now.isoformat()
    }
    
    await db.event_team_roles.update_one(
        {"event_id": event_id},
        {"$set": team_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    # Return the full team data including synced roles
    return await get_team_roles(event_id, user)

@orchestration_router.put("/team/{event_id}/assignees")
async def update_team_assignees(event_id: str, role_id: str, assignees: List[str], user: User = Depends(get_current_user)):
    """Update assignees for a specific role (works for both synced and operational roles)"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify assignees.")
    
    # Store assignees separately to allow assignment to synced roles
    now = datetime.now(timezone.utc)
    await db.event_role_assignees.update_one(
        {"event_id": event_id, "role_id": role_id},
        {"$set": {"assignees": assignees, "updated_at": now.isoformat()}},
        upsert=True
    )
    
    return {"message": "Assignees updated"}

# --- Event Binder (Single Source of Truth) ---
@orchestration_router.get("/binder/{event_id}")
async def get_event_binder(event_id: str, user: User = Depends(get_current_user)):
    """Get complete Event Binder - aggregated read-only view of entire event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get client info
    client = None
    if event.get("client_id"):
        client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0})
    
    # Get proposal and contract info
    proposal = await db.proposals.find_one({"event_id": event_id}, {"_id": 0})
    order_items = []
    if proposal:
        order_items = await db.order_items.find(
            {"proposal_id": proposal["proposal_id"]},
            {"_id": 0}
        ).to_list(500)
    
    # Get all orchestration data
    blueprint = await db.event_blueprints.find_one({"event_id": event_id}, {"_id": 0})
    experience = await db.experience_designs.find_one({"event_id": event_id}, {"_id": 0})
    operational = await db.operational_flows.find_one({"event_id": event_id}, {"_id": 0})
    run_of_show = await db.run_of_show.find_one({"event_id": event_id}, {"_id": 0})
    team = await get_team_roles(event_id, user)
    production = await db.production_assets.find_one({"event_id": event_id}, {"_id": 0})
    review = await db.post_event_reviews.find_one({"event_id": event_id}, {"_id": 0})
    
    # Get financial data from invoices and payments
    invoices = await db.invoices.find({"event_id": event_id}, {"_id": 0}).to_list(100)
    payments = await db.payments.find({"event_id": event_id}, {"_id": 0}).to_list(100)
    
    # Calculate financial summary
    total_invoiced = sum(inv.get("total", 0) for inv in invoices)
    total_paid = sum(pmt.get("amount", 0) for pmt in payments if pmt.get("status") == "applied")
    total_cost = sum(item.get("total_cost", 0) or 0 for item in order_items)
    
    # Compile binder
    binder = {
        "event_id": event_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        
        # Event Snapshot
        "event_snapshot": {
            "name": event.get("name"),
            "event_type": event.get("event_type"),
            "event_date": event.get("event_date"),
            "venue": event.get("venue"),
            "guest_count": event.get("guest_count"),
            "stage": event.get("stage"),
            "status": event.get("status")
        },
        
        # Client Info
        "client": {
            "name": client.get("display_name") if client else None,
            "email": client.get("email") if client else None,
            "phone": client.get("phone") if client else None
        } if client else None,
        
        # Commercial Summary
        "commercial_summary": {
            "proposal_status": proposal.get("status") if proposal else None,
            "total_value": proposal.get("final_total") if proposal else 0,
            "order_items_count": len(order_items),
            "items_by_type": {
                "Food": len([i for i in order_items if i.get("item_type") == "Food"]),
                "Service": len([i for i in order_items if i.get("item_type") == "Service"]),
                "Rental": len([i for i in order_items if i.get("item_type") == "Rental"]),
                "Fee": len([i for i in order_items if i.get("item_type") == "Fee"])
            }
        },
        
        # Experience Design Elements
        "experience_design": {
            "color_palette": experience.get("color_palette", []) if experience else [],
            "catering_setup": experience.get("catering_setup") if experience else None,
            "zones_count": len(experience.get("layout_zones", [])) if experience else 0,
            "moodboard_count": len(experience.get("moodboard_images", [])) if experience else 0
        },
        
        # Blueprint
        "blueprint": {
            "objectives": blueprint.get("objectives") if blueprint else None,
            "scope_definition": blueprint.get("scope_definition") if blueprint else None,
            "critical_assumptions": blueprint.get("critical_assumptions") if blueprint else None,
            "constraints": blueprint.get("constraints") if blueprint else None,
            "success_criteria": blueprint.get("success_criteria") if blueprint else None
        },
        
        # Operational Status
        "operational_status": {
            "overall_status": operational.get("overall_status") if operational else "planning",
            "phases_count": len(operational.get("phases", [])) if operational else 0,
            "risks_count": len(operational.get("risks", [])) if operational else 0,
            "dependencies_count": len(operational.get("dependencies", [])) if operational else 0
        },
        
        # Run of Show Summary
        "run_of_show_summary": {
            "template_name": run_of_show.get("template_name") if run_of_show else None,
            "blocks_count": len(run_of_show.get("time_blocks", [])) if run_of_show else 0,
            "has_contingency_notes": bool(run_of_show.get("contingency_notes")) if run_of_show else False
        },
        
        # Team Summary
        "team_summary": {
            "total_roles": len(team.get("roles", [])),
            "synced_roles": len(team.get("synced_roles", [])),
            "operational_roles": len(team.get("operational_roles", [])),
            "total_staff_required": sum(r.get("quantity", 1) for r in team.get("roles", []))
        },
        
        # Production Status
        "production_status": {
            "preparation_status": production.get("preparation_status") if production else "not_started",
            "assets_count": len(production.get("assets", [])) if production else 0,
            "checklist_count": len(production.get("checklists", [])) if production else 0
        },
        
        # Financial Reality
        "financial_summary": {
            "total_invoiced": total_invoiced,
            "total_collected": total_paid,
            "balance_due": total_invoiced - total_paid,
            "total_cost": total_cost,
            "estimated_profit": total_invoiced - total_cost,
            "profit_margin": round((total_invoiced - total_cost) / total_invoiced * 100, 2) if total_invoiced > 0 else 0
        },
        
        # Post-Event Learnings
        "post_event": {
            "rating": review.get("rating") if review else None,
            "what_worked_count": len(review.get("what_worked", [])) if review else 0,
            "what_failed_count": len(review.get("what_failed", [])) if review else 0,
            "learnings_count": len(review.get("learnings", [])) if review else 0,
            "is_locked": review.get("is_locked", False) if review else False
        },
        
        # Binder notes (manual input)
        "binder_notes": event.get("binder_notes", ""),
        
        # Lock status
        "is_locked": event.get("stage") == "Closed"
    }
    
    return binder

@orchestration_router.put("/binder/{event_id}/notes")
async def update_binder_notes(event_id: str, notes: str, user: User = Depends(get_current_user)):
    """Update binder notes for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {"binder_notes": notes, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Binder notes updated"}

# --- Event Stage Management ---
@orchestration_router.post("/events/{event_id}/close")
async def close_event(event_id: str, user: User = Depends(get_current_user)):
    """Close an event - locks all orchestration data except Post-Event Review"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.get("stage") not in ["Won"]:
        raise HTTPException(status_code=400, detail="Only Won events can be closed")
    
    now = datetime.now(timezone.utc)
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {"stage": "Closed", "closed_at": now.isoformat(), "updated_at": now.isoformat()}}
    )
    
    return {"message": "Event closed successfully"}

@orchestration_router.post("/events/{event_id}/reopen")
async def reopen_event(event_id: str, user: User = Depends(get_current_user)):
    """Reopen a closed event (admin only)"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.get("stage") != "Closed":
        raise HTTPException(status_code=400, detail="Event is not closed")
    
    now = datetime.now(timezone.utc)
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {"stage": "Won", "updated_at": now.isoformat()}, "$unset": {"closed_at": ""}}
    )
    
    return {"message": "Event reopened successfully"}

# --- Production Assets ---
@orchestration_router.get("/production/{event_id}")
async def get_production_assets(event_id: str, user: User = Depends(get_current_user)):
    """Get production assets for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    production = await db.production_assets.find_one({"event_id": event_id}, {"_id": 0})
    
    return production or {
        "event_id": event_id,
        "assets": [],
        "checklists": [],
        "packing_list": [],
        "preparation_status": "not_started"
    }

@orchestration_router.put("/production/{event_id}")
async def update_production_assets(event_id: str, data: ProductionAssetsCreate, user: User = Depends(get_current_user)):
    """Update production assets for an event"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify production assets.")
    
    now = datetime.now(timezone.utc)
    production_data = data.dict()
    production_data["company_id"] = user.company_id
    production_data["updated_at"] = now.isoformat()
    
    await db.production_assets.update_one(
        {"event_id": event_id},
        {"$set": production_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.production_assets.find_one({"event_id": event_id}, {"_id": 0})

# --- Packing List Management ---

# --- Event Calendar ---
@orchestration_router.get("/events")
async def get_orchestration_events(user: User = Depends(get_current_user)):
    """Get events for orchestration (Committed/Won/Closed only)"""
    events = await db.events.find(
        {"company_id": user.company_id, "stage": {"$in": ["Committed", "Won", "Closed"]}},
        {"_id": 0}
    ).sort("event_date", 1).to_list(500)
    
    # Enrich with client info and orchestration flags
    for e in events:
        # Parse dates
        for field in ["event_date", "end_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except Exception:
                    e[field] = None
        
        # Get client name
        if e.get("client_id"):
            client = await db.clients.find_one({"client_id": e["client_id"]}, {"_id": 0, "display_name": 1})
            e["client_name"] = client.get("display_name") if client else ""
        
        # Check orchestration status
        event_id = e.get("event_id")
        e["has_blueprint"] = await db.event_blueprints.find_one({"event_id": event_id}) is not None
        e["has_run_of_show"] = await db.run_of_show.find_one({"event_id": event_id}) is not None
        team = await db.event_teams.find_one({"event_id": event_id})
        e["has_team"] = team is not None and len(team.get("assignees", [])) > 0
    
    return events

@orchestration_router.get("/calendar")
async def get_events_calendar(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get events for calendar view.

    Each event is enriched with:
      • ``services``  list of `{date, time, end_time, title, item_count, item_types, total, item_type}`
        derived from its proposal's order_items grouped by `(event_date, section_title, section_time)`.
      • ``calendar_dates`` list of "YYYY-MM-DD" dates where the event should appear (covers single
        date, multi-day ranges with `end_date`, and non-consecutive `event_dates`).
    """
    from collections import defaultdict

    def _norm_date(value) -> Optional[str]:
        """Normalize any date/datetime/ISO string to a YYYY-MM-DD string."""
        if not value:
            return None
        if isinstance(value, str):
            return value[:10] if len(value) >= 10 else None
        try:
            return value.isoformat()[:10]
        except Exception:
            return None

    def _expand_event_dates(ev: dict) -> List[str]:
        """All YYYY-MM-DD dates this event spans."""
        dates: set = set()
        explicit_dates = []
        for d in ev.get("event_dates") or []:
            nd = _norm_date(d)
            if nd:
                explicit_dates.append(nd)
                dates.add(nd)
        primary = _norm_date(ev.get("event_date"))
        if primary:
            dates.add(primary)
        # Only expand consecutively from primary→end_date when the user has NOT
        # provided an explicit non-consecutive `event_dates` list. This prevents
        # filling in skipped days (e.g. event_dates=[Mar 5, Mar 7, Mar 10] should
        # NOT include Mar 6, 8, 9 just because end_date=Mar 10).
        if explicit_dates:
            return sorted(dates)
        end = _norm_date(ev.get("end_date"))
        if primary and end and end > primary:
            try:
                from datetime import date as _date
                cur = _date.fromisoformat(primary)
                stop = _date.fromisoformat(end)
                while cur <= stop:
                    dates.add(cur.isoformat())
                    cur = cur.fromordinal(cur.toordinal() + 1)
            except Exception:
                pass
        return sorted(dates)

    # Build a permissive query: an event should appear in the window when ANY of its
    # primary date, end_date range, or event_dates list overlaps. Mongo can't easily
    # express "range overlap on heterogeneous string/datetime fields" so we fetch by
    # company and filter in-memory (events list is small per company).
    events = await db.events.find({"company_id": user.company_id}, {"_id": 0}).to_list(1000)

    # Pre-compute each event's date set and filter to the requested window.
    window_start = start_date[:10] if start_date else None
    window_end = end_date[:10] if end_date else None
    filtered: List[dict] = []
    for e in events:
        e_dates = _expand_event_dates(e)
        if not e_dates:
            # Keep TBD events (no date) so the UI can show them in "Sin fecha" buckets;
            # but only when the window is unrestricted.
            if not window_start and not window_end:
                e["calendar_dates"] = []
                filtered.append(e)
            continue
        if window_start and all(d < window_start for d in e_dates):
            continue
        if window_end and all(d > window_end for d in e_dates):
            continue
        e["calendar_dates"] = e_dates
        filtered.append(e)

    # Enrich with client names, milestones and proposal services.
    event_ids = [e.get("event_id") for e in filtered if e.get("event_id")]
    proposals_by_event: dict = {}
    if event_ids:
        cursor = db.proposals.find(
            {"event_id": {"$in": event_ids}, "company_id": user.company_id},
            {"_id": 0, "proposal_id": 1, "event_id": 1},
        )
        async for p in cursor:
            proposals_by_event[p["event_id"]] = p["proposal_id"]

    services_by_event: dict = defaultdict(list)
    if proposals_by_event:
        # Source services from `proposals.day_logistics` rows. Each row is
        # already 1 logical service (a delivery / meal / event slot) with its
        # own date + start time + end time + address + notes. This is the
        # user-curated source of truth — far cleaner than bucketing every
        # order_item by section_title/section_time, which previously turned
        # every line item ("Bocadillos", "Transporte", ...) into its own chip.
        # `service_type` is an optional dropdown set by the user; when missing
        # we auto-detect a meal label from the start time.
        def _auto_meal_label(time_str: str, lang: str = "es") -> str:
            try:
                hh = int((time_str or "").split(":", 1)[0])
            except Exception:
                return ""
            es = lang.lower().startswith("es")
            if 4 <= hh < 11:
                return "Desayuno" if es else "Breakfast"
            if 11 <= hh < 14:
                return "Almuerzo" if es else "Lunch"
            if 14 <= hh < 17:
                return "Merienda" if es else "Afternoon"
            if 17 <= hh < 23:
                return "Cena" if es else "Dinner"
            return "Coctel" if es else "Night"

        prop_cursor = db.proposals.find(
            {"proposal_id": {"$in": list(proposals_by_event.values())}},
            {"_id": 0, "proposal_id": 1, "day_logistics": 1},
        )
        proposal_to_event = {pid: eid for eid, pid in proposals_by_event.items()}
        async for p in prop_cursor:
            eid = proposal_to_event.get(p.get("proposal_id"))
            if not eid:
                continue
            for row in (p.get("day_logistics") or []):
                d = _norm_date(row.get("event_date"))
                if not d:
                    continue
                t = (row.get("delivery_time") or "").strip()
                end_t = (row.get("delivery_end_time") or "").strip() or None
                # service_type wins; otherwise auto-detect from delivery_time
                stype = (row.get("service_type") or "").strip()
                title = stype or _auto_meal_label(t)
                services_by_event[eid].append({
                    "date": d,
                    "time": t or None,
                    "end_time": end_t,
                    "title": title or None,
                    "service_type": stype or None,
                    "address": row.get("address") or None,
                    "instructions": row.get("instructions") or None,
                    "guest_count": row.get("guest_count"),
                    "item_count": 1,
                })
        # Sort each event's services by date then time
        for eid, svcs in services_by_event.items():
            svcs.sort(key=lambda s: ((s.get("date") or "9999"), (s.get("time") or "99:99"), (s.get("title") or "")))

    calendar_events: List[dict] = []
    for e in filtered:
        if e.get("client_id"):
            client = await db.clients.find_one({"client_id": e["client_id"]}, {"_id": 0, "display_name": 1})
            e["client_name"] = client.get("display_name") if client else None
        flow = await db.operational_flows.find_one({"event_id": e.get("event_id")}, {"_id": 0, "phases": 1})
        e["phases"] = flow.get("phases", []) if flow else []
        svcs = services_by_event.get(e.get("event_id"), [])
        # Attach undated services to the event's first calendar date so they still
        # surface in the calendar (and follow the event when shifted).
        cdates = e.get("calendar_dates") or []
        if svcs and cdates:
            fallback = cdates[0]
            for s in svcs:
                if not s.get("date"):
                    s["date"] = fallback
            svcs.sort(key=lambda s: ((s.get("date") or "9999"), (s.get("time") or "99:99"), (s.get("title") or "")))
        e["services"] = svcs
        calendar_events.append(e)

    # Detect conflicts: two or more events on the same day (use full calendar_dates list).
    events_by_date: dict = defaultdict(list)
    for e in calendar_events:
        for d in e.get("calendar_dates") or []:
            events_by_date[d].append(e.get("event_id"))
    conflicts = {date: ids for date, ids in events_by_date.items() if len(ids) > 1}

    return {
        "events": calendar_events,
        "conflicts": conflicts,
    }

# --- Post-Event Review ---
@orchestration_router.get("/review/{event_id}")
async def get_post_event_review(event_id: str, user: User = Depends(get_current_user)):
    """Get post-event review"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    review = await db.post_event_reviews.find_one({"event_id": event_id}, {"_id": 0})
    
    return review or {
        "event_id": event_id,
        "what_worked": [],
        "what_failed": [],
        "deviations": [],
        "learnings": [],
        "client_feedback": None,
        "team_feedback": None,
        "rating": None,
        "is_locked": False
    }

@orchestration_router.put("/review/{event_id}")
async def update_post_event_review(event_id: str, data: PostEventReviewCreate, user: User = Depends(get_current_user)):
    """Update post-event review"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if review is locked
    existing = await db.post_event_reviews.find_one({"event_id": event_id}, {"_id": 0})
    if existing and existing.get("is_locked"):
        raise HTTPException(status_code=400, detail="Review is locked and cannot be modified")
    
    now = datetime.now(timezone.utc)
    review_data = data.dict()
    review_data["company_id"] = user.company_id
    review_data["updated_at"] = now.isoformat()
    
    await db.post_event_reviews.update_one(
        {"event_id": event_id},
        {"$set": review_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.post_event_reviews.find_one({"event_id": event_id}, {"_id": 0})

@orchestration_router.post("/review/{event_id}/lock")
async def lock_post_event_review(event_id: str, user: User = Depends(get_current_user)):
    """Lock post-event review (make read-only)"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.post_event_reviews.update_one(
        {"event_id": event_id},
        {"$set": {"is_locked": True, "locked_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return {"message": "Review locked successfully"}

# ============== DELIVERY NOTES ENDPOINTS ==============

class DeliveryNoteCreate(BaseModel):
    event_id: str
    items: List[dict]  # [{inventory_item_id, name, inventory_type, qty_out, replacement_cost, unit}]
    notes: Optional[str] = None
    checkout_date: Optional[str] = None
    expected_return_date: Optional[str] = None
    direction: Optional[str] = "outbound"  # Sprint C: "outbound" | "return"
    # Optional pre-setup photos. Copied over from the source packing template
    # (when a template is applied) or captured on-the-fly for quick jobs.
    setup_photos: Optional[List[str]] = None
    template_id: Optional[str] = None  # provenance — the template this note came from, if any

class DeliveryNoteCheckIn(BaseModel):
    items: List[dict]  # [{inventory_item_id, qty_returned, notes}]

@delivery_notes_router.get("")
async def get_delivery_notes(user: User = Depends(get_current_user)):
    """Get all delivery notes for the company"""
    notes = await db.delivery_notes.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # Backfill legacy notes with direction="outbound" so FE never sees a null.
    for n in notes:
        n.setdefault("direction", "outbound")
    return notes


class ConflictCheckRequest(BaseModel):
    event_id: Optional[str] = None
    items: List[dict]  # [{inventory_item_id, qty_out}]
    checkout_date: Optional[str] = None
    expected_return_date: Optional[str] = None


@delivery_notes_router.post("/check-conflicts")
async def check_delivery_conflicts(
    data: ConflictCheckRequest, user: User = Depends(get_current_user)
):
    """Return per-item conflict analysis for a *proposed* delivery note.

    For each requested (inventory_item_id, qty_out) tuple, computes:
      * `current_stock`       — total qty in inventory.
      * `already_reserved`    — qty locked to other future events.
      * `currently_checked_out` — qty on active (non-returned) delivery notes.
      * `available`           — max(current_stock - reserved - checked_out, 0).
      * `shortage`            — max(qty_out - available, 0). 0 means no conflict.
      * `alternatives`        — up to 3 same-inventory-type items with the
                                requested qty in stock, so ops can substitute.
      * `blocking_notes`      — brief snapshot of notes that hold the item now.
      * `blocking_events`     — future events reserving the item.

    This endpoint is purely read-only: no reservation, no side effects. The UI
    calls it before creating a conduce to surface conflicts + alternatives.
    """
    company_id = user.company_id

    # Load current stock rows once — cheaper than N find_one calls.
    item_ids = [x.get("inventory_item_id") for x in (data.items or []) if x.get("inventory_item_id")]
    if not item_ids:
        return {"items": [], "has_conflict": False}
    ings = await db.ingredients.find(
        {"company_id": company_id, "ingredient_id": {"$in": item_ids}}, {"_id": 0},
    ).to_list(len(item_ids))
    ings_map = {i["ingredient_id"]: i for i in ings}

    # Aggregate active delivery-note checkouts by item id — an item is "out"
    # if there's a note with status pending/in_use/late and qty_returned <
    # qty_out. We exclude the proposed event's own past notes (if any).
    checkout_pipeline = [
        {"$match": {
            "company_id": company_id,
            "status": {"$in": ["pending", "in_use", "late", "overdue"]},
            "direction": {"$ne": "return"},
        }},
        {"$unwind": "$items"},
        {"$match": {"items.inventory_item_id": {"$in": item_ids}}},
        {"$group": {
            "_id": "$items.inventory_item_id",
            "qty_out_total": {"$sum": {"$subtract": [
                {"$ifNull": ["$items.qty_out", 0]},
                {"$ifNull": ["$items.qty_returned", 0]},
            ]}},
            "notes": {"$push": {
                "note_id": "$note_id",
                "note_number": "$note_number",
                "event_id": "$event_id",
                "checkout_date": "$checkout_date",
                "expected_return_date": "$expected_return_date",
                "qty": "$items.qty_out",
            }},
        }},
    ]
    checkout_map = {r["_id"]: r async for r in db.delivery_notes.aggregate(checkout_pipeline)}

    # Reservations: sum outstanding reservations across other events, EXCLUDING
    # the current event so a user editing his own reservation doesn't flag a
    # false conflict. Reservations live on `inventory_reservations`.
    reservation_pipeline = [
        {"$match": {
            "company_id": company_id,
            "status": {"$in": ["reserved", "pending"]},
            "inventory_item_id": {"$in": item_ids},
            **({"event_id": {"$ne": data.event_id}} if data.event_id else {}),
        }},
        {"$group": {
            "_id": "$inventory_item_id",
            "qty_reserved_total": {"$sum": "$qty"},
            "events": {"$push": {
                "event_id": "$event_id",
                "event_name": "$event_name",
                "qty": "$qty",
                "reserved_until": "$reserved_until",
            }},
        }},
    ]
    reserv_map = {r["_id"]: r async for r in db.inventory_reservations.aggregate(reservation_pipeline)}

    results = []
    has_conflict = False
    for req in data.items or []:
        iid = req.get("inventory_item_id")
        qty_want = float(req.get("qty_out") or 0)
        if not iid:
            continue
        inv = ings_map.get(iid, {}) or {}
        stock = float(inv.get("stock_quantity") or 0)
        reserved = float((reserv_map.get(iid) or {}).get("qty_reserved_total", 0) or 0)
        checked_out = float((checkout_map.get(iid) or {}).get("qty_out_total", 0) or 0)
        available = max(stock - reserved - checked_out, 0)
        shortage = max(qty_want - available, 0)

        # Alternatives: same inventory_type with enough available stock.
        alternatives = []
        if shortage > 0:
            itype = inv.get("inventory_type") or "item"
            candidate_ings = await db.ingredients.find(
                {"company_id": company_id,
                 "ingredient_id": {"$ne": iid},
                 "inventory_type": itype,
                 "stock_quantity": {"$gt": 0}},
                {"_id": 0, "ingredient_id": 1, "name": 1, "stock_quantity": 1,
                 "unit": 1, "cost_per_unit": 1, "replacement_cost": 1},
            ).limit(20).to_list(20)
            for c in candidate_ings:
                # Compute available for the candidate too so the UI shows a
                # meaningful "you can substitute with 20 of these" figure.
                cand_id = c["ingredient_id"]
                cand_reserved = float((reserv_map.get(cand_id) or {}).get("qty_reserved_total", 0) or 0)
                cand_checked = float((checkout_map.get(cand_id) or {}).get("qty_out_total", 0) or 0)
                cand_avail = max(float(c.get("stock_quantity") or 0) - cand_reserved - cand_checked, 0)
                if cand_avail >= qty_want:
                    alternatives.append({
                        "inventory_item_id": cand_id,
                        "name": c.get("name"),
                        "available": cand_avail,
                        "unit": c.get("unit"),
                        "replacement_cost": c.get("replacement_cost") or c.get("cost_per_unit") or 0,
                    })
                if len(alternatives) >= 3:
                    break

        if shortage > 0:
            has_conflict = True

        results.append({
            "inventory_item_id": iid,
            "name": inv.get("name") or req.get("name"),
            "qty_requested": qty_want,
            "current_stock": stock,
            "already_reserved": reserved,
            "currently_checked_out": checked_out,
            "available": available,
            "shortage": shortage,
            "conflict": shortage > 0,
            "blocking_notes": (checkout_map.get(iid) or {}).get("notes", [])[:5],
            "blocking_events": (reserv_map.get(iid) or {}).get("events", [])[:5],
            "alternatives": alternatives,
        })

    return {"has_conflict": has_conflict, "items": results}


@delivery_notes_router.post("")
async def create_delivery_note(data: DeliveryNoteCreate, user: User = Depends(get_current_user)):
    """Create a new delivery note (conduce) for an event"""
    now = datetime.now(timezone.utc)
    
    # Generate note number
    count = await db.delivery_notes.count_documents({"company_id": user.company_id})
    note_number = f"DN-{count + 1:04d}"
    
    note_id = f"dn_{uuid.uuid4().hex[:12]}"
    
    # Process items
    processed_items = []
    for item in data.items:
        processed_items.append({
            "inventory_item_id": item.get("inventory_item_id"),
            "name": item.get("name"),
            "inventory_type": item.get("inventory_type", "equipment"),
            "qty_out": item.get("qty_out", 0),
            "qty_returned": 0,
            "qty_lost": 0,
            "replacement_cost": item.get("replacement_cost", 0) if item.get("inventory_type") == "equipment" else 0,
            "loss_cost": 0,
            "unit": item.get("unit", "unit"),
            "status": "pending"
        })
    
    delivery_note = {
        "note_id": note_id,
        "note_number": note_number,
        "company_id": user.company_id,
        "event_id": data.event_id,
        "direction": data.direction or "outbound",
        "items": processed_items,
        "status": "pending",
        "checkout_date": data.checkout_date or now.isoformat(),
        "expected_return_date": data.expected_return_date,
        "checkin_date": None,
        "total_loss_cost": 0,
        "notes": data.notes,
        "setup_photos": list(data.setup_photos or []),
        "template_id": data.template_id,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.delivery_notes.insert_one(delivery_note)
    
    # Deduct from inventory (check-out) + auto-transition status.
    # Equipment items go to "En Evento" so they're not double-booked while out;
    # consumables/disposables have no reversible status, so we leave them.
    for item in processed_items:
        if not item["inventory_item_id"]:
            continue
        update = {"$inc": {"stock_quantity": -item["qty_out"]}}
        if item.get("inventory_type") == "equipment":
            update["$set"] = {"status": "En Evento", "updated_at": now.isoformat()}
        await db.ingredients.update_one(
            {"ingredient_id": item["inventory_item_id"]},
            update
        )
    
    return {"note_id": note_id, "note_number": note_number, "message": "Delivery note created"}


@delivery_notes_router.post("/scan-overdue")
async def trigger_overdue_scan(user: User = Depends(get_current_user)):
    """Manual trigger for the daily overdue scan. Useful for testing and for
    ops to force-refresh alerts without waiting for the 08:15 cron.

    Scoped to the caller's company_id (unlike the cron, which is global).
    """
    from scheduler import _send_overdue_delivery_note_alerts  # noqa: E402
    # For a per-tenant manual run we replicate the essential logic scoped by company.
    from routers.notifications import notify_org_admins  # noqa: E402
    today = datetime.now(timezone.utc).date()
    today_key = today.isoformat()
    today_str = today.strftime("%Y-%m-%d")

    sent = 0
    cursor = db.delivery_notes.find(
        {
            "company_id": user.company_id,
            "status": {"$in": ["pending", "partial"]},
            "expected_return_date": {"$lt": today_str, "$ne": None},
        },
        {"_id": 0},
    )
    async for note in cursor:
        already = await db.overdue_notes_log.find_one({
            "company_id": user.company_id,
            "note_id": note["note_id"],
            "day": today_key,
        })
        if already:
            continue
        try:
            dl = datetime.strptime(str(note["expected_return_date"])[:10], "%Y-%m-%d").date()
            days_overdue = (today - dl).days
        except Exception:
            days_overdue = None
        event_name = ""
        if note.get("event_id"):
            ev = await db.events.find_one({"event_id": note["event_id"], "company_id": user.company_id}, {"_id": 0, "event_name": 1, "name": 1})
            if ev:
                event_name = ev.get("event_name") or ev.get("name") or ""
        note_number = note.get("note_number") or note["note_id"][-8:]
        msg = f"Retorno esperado {note['expected_return_date']}"
        if days_overdue and days_overdue > 0:
            msg += f" · hace {days_overdue}d"
        if event_name:
            msg += f" · {event_name}"
        await notify_org_admins(
            org_id=user.company_id,
            notification_type="delivery_note_overdue",
            title=f"⏰ Conduce vencido: {note_number}",
            message=msg,
            link=f"/ops-supplies/checkin?note_id={note['note_id']}",
            metadata={"note_id": note["note_id"], "days_overdue": days_overdue},
            priority="high",
        )
        await db.overdue_notes_log.insert_one({
            "company_id": user.company_id,
            "note_id": note["note_id"],
            "day": today_key,
            "days_overdue": days_overdue,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        sent += 1
    return {"notifications_sent": sent, "checked_at": datetime.now(timezone.utc).isoformat()}


@delivery_notes_router.get("/pending-returns")
async def get_pending_returns(user: User = Depends(get_current_user)):
    """Aggregated dashboard: delivery notes still out AND supplier rentals still out.

    Buckets each item by urgency based on the expected return date vs. today:
      - overdue    : deadline has already passed
      - due_soon   : deadline is today or within the next 2 days
      - upcoming   : deadline is 3+ days away
      - no_date    : no expected return date was recorded (delivery notes only)
    """
    today = datetime.now(timezone.utc).date()

    def _bucket(deadline_str: Optional[str]) -> str:
        if not deadline_str:
            return "no_date"
        try:
            dl = datetime.strptime(str(deadline_str)[:10], "%Y-%m-%d").date()
        except Exception:
            return "no_date"
        delta = (dl - today).days
        if delta < 0:
            return "overdue"
        if delta <= 2:
            return "due_soon"
        return "upcoming"

    # ---- Delivery notes still out (pending or partial) ----
    notes_cursor = db.delivery_notes.find(
        {
            "company_id": user.company_id,
            "status": {"$in": ["pending", "partial"]},
        },
        {"_id": 0},
    ).sort("expected_return_date", 1)
    notes = await notes_cursor.to_list(500)

    # Preload event names for context
    event_ids = list({n.get("event_id") for n in notes if n.get("event_id")})
    events_map: Dict[str, str] = {}
    if event_ids:
        events = await db.events.find(
            {"event_id": {"$in": event_ids}, "company_id": user.company_id},
            {"_id": 0, "event_id": 1, "event_name": 1, "name": 1, "event_date": 1},
        ).to_list(len(event_ids))
        for ev in events:
            events_map[ev["event_id"]] = ev.get("event_name") or ev.get("name") or ""

    notes_buckets: Dict[str, list] = {"overdue": [], "due_soon": [], "upcoming": [], "no_date": []}
    for n in notes:
        equipment_items = [i for i in (n.get("items") or []) if i.get("inventory_type") == "equipment"]
        pending_equipment = [i for i in equipment_items if (i.get("status") or "pending") in ("pending", "partial")]
        if not pending_equipment and n.get("status") != "pending":
            # If nothing left to return, skip.
            continue
        bucket = _bucket(n.get("expected_return_date"))
        try:
            days_diff = (
                datetime.strptime(str(n["expected_return_date"])[:10], "%Y-%m-%d").date() - today
            ).days if n.get("expected_return_date") else None
        except Exception:
            days_diff = None
        notes_buckets[bucket].append({
            "note_id": n.get("note_id"),
            "note_number": n.get("note_number"),
            "event_id": n.get("event_id"),
            "event_name": events_map.get(n.get("event_id") or "", ""),
            "checkout_date": n.get("checkout_date"),
            "expected_return_date": n.get("expected_return_date"),
            "status": n.get("status"),
            "pending_items_count": len(pending_equipment) or len(equipment_items),
            "total_items_count": len(equipment_items) or len(n.get("items") or []),
            "days_diff": days_diff,
        })

    # ---- Supplier rentals still out ----
    rentals_cursor = db.ingredients.find(
        {
            "company_id": user.company_id,
            "origin": "Alquilado",
            "$or": [
                {"rental_return_status": {"$in": ["pending", "overdue"]}},
                {"rental_return_status": {"$exists": False}},
            ],
        },
        {"_id": 0},
    )
    rentals = await rentals_cursor.to_list(500)

    supplier_ids = list({r.get("rental_supplier_id") for r in rentals if r.get("rental_supplier_id")})
    suppliers_map: Dict[str, str] = {}
    if supplier_ids:
        sups = await db.suppliers.find(
            {"supplier_id": {"$in": supplier_ids}, "company_id": user.company_id},
            {"_id": 0, "supplier_id": 1, "name": 1},
        ).to_list(len(supplier_ids))
        for s in sups:
            suppliers_map[s["supplier_id"]] = s.get("name", "")

    rentals_buckets: Dict[str, list] = {"overdue": [], "due_soon": [], "upcoming": [], "no_date": []}
    for r in rentals:
        deadline = r.get("rental_return_deadline")
        bucket = _bucket(deadline)
        try:
            days_diff = (
                datetime.strptime(str(deadline)[:10], "%Y-%m-%d").date() - today
            ).days if deadline else None
        except Exception:
            days_diff = None
        rentals_buckets[bucket].append({
            "ingredient_id": r.get("ingredient_id"),
            "name": r.get("name"),
            "stock_quantity": r.get("stock_quantity", 0),
            "unit": r.get("unit"),
            "rental_supplier_id": r.get("rental_supplier_id"),
            "rental_supplier_name": suppliers_map.get(r.get("rental_supplier_id") or "", ""),
            "rental_pickup_date": r.get("rental_pickup_date"),
            "rental_return_deadline": deadline,
            "rental_cost_per_unit_day": r.get("rental_cost_per_unit_day"),
            "status": r.get("status"),
            "days_diff": days_diff,
        })

    return {
        "summary": {
            "notes_overdue": len(notes_buckets["overdue"]),
            "notes_due_soon": len(notes_buckets["due_soon"]),
            "notes_upcoming": len(notes_buckets["upcoming"]),
            "notes_no_date": len(notes_buckets["no_date"]),
            "rentals_overdue": len(rentals_buckets["overdue"]),
            "rentals_due_soon": len(rentals_buckets["due_soon"]),
            "rentals_upcoming": len(rentals_buckets["upcoming"]),
            "total_pending": (
                len(notes_buckets["overdue"])
                + len(notes_buckets["due_soon"])
                + len(notes_buckets["upcoming"])
                + len(notes_buckets["no_date"])
                + len(rentals_buckets["overdue"])
                + len(rentals_buckets["due_soon"])
                + len(rentals_buckets["upcoming"])
            ),
        },
        "delivery_notes": notes_buckets,
        "rentals": rentals_buckets,
        "today": today.isoformat(),
    }


@delivery_notes_router.get("/{note_id}")
async def get_delivery_note(note_id: str, user: User = Depends(get_current_user)):
    """Get a specific delivery note"""
    note = await db.delivery_notes.find_one(
        {"note_id": note_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    return note

@delivery_notes_router.get("/{note_id}/print")
async def print_delivery_note(note_id: str, user: User = Depends(get_current_user)):
    """Branded print-ready HTML for a Delivery Note (Conduce)."""
    from fastapi.responses import HTMLResponse as _HR
    from utils.print_templates import render_branded_html, get_company_branding
    note = await db.delivery_notes.find_one(
        {"note_id": note_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    branding = await get_company_branding(user.company_id, template_type="DeliveryNote", lang="es")

    items = note.get("items") or note.get("lines") or []
    rows = ""
    for i, it in enumerate(items, 1):
        rows += (
            f"<tr><td>{i}</td><td>{it.get('name','') or it.get('item_name','')}</td>"
            f"<td class='num'>{it.get('quantity',0)} {it.get('unit','')}</td>"
            f"<td>{it.get('notes','') or ''}</td></tr>"
        )
    body = f"""
      <div class="grid-2">
        <div class="box">
          <div class="label">Cliente / Destino</div>
          <div class="val" style="font-size:13px">{note.get('client_name','') or note.get('destination','') or '—'}</div>
        </div>
        <div class="box">
          <div class="label">Evento</div>
          <div class="val" style="font-size:13px">{note.get('event_name','') or '—'}</div>
        </div>
        <div class="box">
          <div class="label">Fecha de entrega</div>
          <div class="val" style="font-size:13px">{note.get('delivery_date','') or note.get('check_out_date','') or ''}</div>
        </div>
        <div class="box">
          <div class="label">Devolución esperada</div>
          <div class="val" style="font-size:13px">{note.get('expected_return_date','') or '—'}</div>
        </div>
      </div>
      <h2>Ítems entregados</h2>
      <table>
        <thead><tr><th>#</th><th>Descripción</th><th class='num'>Cantidad</th><th>Observaciones</th></tr></thead>
        <tbody>{rows or '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px">Sin ítems</td></tr>'}</tbody>
      </table>
      <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:60px">
        <div style="border-top:1px solid #94a3b8;padding-top:6px;text-align:center;font-size:10px;color:#64748b">
          Entrega por (nombre y firma)
        </div>
        <div style="border-top:1px solid #94a3b8;padding-top:6px;text-align:center;font-size:10px;color:#64748b">
          Recibe (nombre y firma)
        </div>
      </div>
    """
    html = render_branded_html(
        branding=branding,
        title=f"Conduce #{note.get('note_number') or note_id[:8]}",
        subtitle=note.get("status", ""),
        document_type="Conduce",
        body_html=body,
    )
    return _HR(html)



@delivery_notes_router.put("/{note_id}/check-in")
async def check_in_delivery_note(note_id: str, data: DeliveryNoteCheckIn, user: User = Depends(get_current_user)):
    """Record check-in (return) of items from a delivery note.

    Each incoming item may include:
      - qty_returned    : int
      - condition       : "bueno" | "dañado" | "faltante"   (Sprint C)
      - condition_note  : optional operator note
      - photo_url       : optional URL (uploaded via /api/uploads/*)
    Items marked dañado/faltante are also logged into ``damaged_items_log``
    for the Asset Count "Daños y Faltantes" tab. Bueno items go back to
    "En Almacén" (unchanged legacy behavior).
    """
    note = await db.delivery_notes.find_one(
        {"note_id": note_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")

    now = datetime.now(timezone.utc)
    total_loss_cost = 0
    all_returned = True
    damaged_log_entries = []

    for incoming_item in data.items:
        item_id = incoming_item.get("inventory_item_id")
        raw_condition = (incoming_item.get("condition") or "").strip().lower()
        # Normalize legacy synonyms so the FE can send either language
        if raw_condition in ("good", "ok", "bien"):
            raw_condition = "bueno"
        elif raw_condition in ("damaged", "broken"):
            raw_condition = "dañado"
        elif raw_condition in ("missing", "lost"):
            raw_condition = "faltante"
        condition = raw_condition or "bueno"
        cond_note = incoming_item.get("condition_note") or incoming_item.get("note")
        photo_url = incoming_item.get("photo_url")

        for note_item in note["items"]:
            if note_item.get("inventory_item_id") == item_id or note_item.get("name") == incoming_item.get("name"):
                if note_item["inventory_type"] == "equipment":
                    qty_returned = incoming_item.get("qty_returned", 0)
                    qty_out = note_item["qty_out"]
                    qty_lost = max(0, qty_out - qty_returned)
                    replacement_cost = note_item.get("replacement_cost", 0) or 0
                    loss_cost = qty_lost * replacement_cost

                    note_item["qty_returned"] = qty_returned
                    note_item["qty_lost"] = qty_lost
                    note_item["loss_cost"] = loss_cost
                    note_item["condition"] = condition
                    if cond_note:
                        note_item["condition_note"] = cond_note
                    if photo_url:
                        note_item["photo_url"] = photo_url
                    if qty_lost == 0 and condition == "bueno":
                        note_item["status"] = "returned"
                    elif qty_lost == 0 and condition in ("dañado",):
                        # Physically returned but damaged — still counts as returned
                        note_item["status"] = "returned_damaged"
                    else:
                        note_item["status"] = "partial"

                    total_loss_cost += loss_cost
                    if qty_lost > 0 or condition in ("dañado", "faltante"):
                        all_returned = False

                    # --- Inventory transitions (Sprint C aware) ---
                    if item_id:
                        if condition == "bueno" and qty_returned > 0:
                            await db.ingredients.update_one(
                                {"ingredient_id": item_id},
                                {"$inc": {"stock_quantity": qty_returned},
                                 "$set": {"status": "En Almacén", "updated_at": now.isoformat()}}
                            )
                        elif condition == "dañado":
                            # Mark item unit as Dañado — we don't return the qty to
                            # sellable stock because it needs repair/replacement.
                            await db.ingredients.update_one(
                                {"ingredient_id": item_id},
                                {"$set": {"status": "Dañado", "updated_at": now.isoformat()}}
                            )
                        elif condition == "faltante" or (qty_lost > 0 and qty_returned == 0):
                            await db.ingredients.update_one(
                                {"ingredient_id": item_id},
                                {"$set": {"status": "Perdido", "updated_at": now.isoformat()}}
                            )

                    # --- Damaged/Lost registry entry ---
                    if condition in ("dañado", "faltante"):
                        # Fall back to note-side identifiers so the log is never
                        # blank (edge case when FE forgets to send inventory_item_id).
                        log_item_id = item_id or note_item.get("inventory_item_id") or ""
                        log_item_name = (
                            note_item.get("name")
                            or incoming_item.get("name")
                            or log_item_id
                            or "Unknown item"
                        )
                        damaged_log_entries.append({
                            "log_id": f"dlog_{uuid.uuid4().hex[:12]}",
                            "company_id": user.company_id,
                            "note_id": note_id,
                            "note_number": note.get("note_number"),
                            "event_id": note.get("event_id"),
                            "inventory_item_id": log_item_id,
                            "item_name": log_item_name,
                            "condition": condition,
                            "qty": qty_lost if condition == "faltante" else max(qty_out - qty_returned, 0) or qty_out,
                            "replacement_cost_per_unit": replacement_cost,
                            "total_cost": (qty_lost if condition == "faltante" else max(qty_out - qty_returned, 0) or qty_out) * replacement_cost,
                            "condition_note": cond_note,
                            "photo_url": photo_url,
                            "reported_by": user.user_id,
                            "reported_at": now.isoformat(),
                        })
                else:
                    note_item["status"] = "consumed"
                break

    if damaged_log_entries:
        await db.damaged_items_log.insert_many(damaged_log_entries)
        # Sprint G — Auto-bill damaged/missing items to the event's invoice
        # if one exists. Non-blocking: any error is logged and the check-in
        # continues so ops flow is never disrupted.
        for entry in damaged_log_entries:
            try:
                await _try_bill_damage_to_invoice(entry, user, source="checkin")
            except Exception as _e:
                pass

    status = "returned" if all_returned else "partial"
    await db.delivery_notes.update_one(
        {"note_id": note_id},
        {"$set": {
            "items": note["items"],
            "status": status,
            "direction": note.get("direction", "outbound"),  # ensure field is set
            "checkin_date": now.isoformat(),
            "total_loss_cost": total_loss_cost,
            "updated_at": now.isoformat()
        }}
    )
    return {
        "message": "Check-in recorded",
        "status": status,
        "total_loss_cost": total_loss_cost,
        "damaged_items_logged": len(damaged_log_entries),
    }

# Edit Delivery Note (before check-in)
# ============== DAMAGED / MISSING ITEMS LOG (Sprint C) ==============
damaged_items_router = APIRouter(prefix="/damaged-items-log", tags=["Damaged Items Log"])


@damaged_items_router.get("")
async def list_damaged_items(
    condition: Optional[str] = None,     # bueno | dañado | faltante
    event_id: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    user: User = Depends(get_current_user),
):
    """Registry of items reported as damaged or missing on delivery-note check-in.

    Feeds the "Daños y Faltantes" tab of Conteo de Activos. Supports filters
    by condition, event, and year+month (based on reported_at).
    """
    query: Dict[str, Any] = {"company_id": user.company_id}
    if condition and condition in ("dañado", "faltante", "danado"):
        # accept ascii "danado" as legacy alias
        query["condition"] = "dañado" if condition in ("dañado", "danado") else condition
    if event_id:
        query["event_id"] = event_id
    if year and month:
        # Date-range filter on reported_at (iso string starts with YYYY-MM)
        month_str = f"{year:04d}-{month:02d}"
        query["reported_at"] = {"$regex": f"^{month_str}"}
    entries = await db.damaged_items_log.find(query, {"_id": 0}).sort("reported_at", -1).to_list(1000)
    # Enrich with event name
    event_ids = list({e.get("event_id") for e in entries if e.get("event_id")})
    events_map = {}
    if event_ids:
        evs = await db.events.find(
            {"event_id": {"$in": event_ids}, "company_id": user.company_id},
            {"_id": 0, "event_id": 1, "event_name": 1, "name": 1, "event_date": 1}
        ).to_list(len(event_ids))
        events_map = {ev["event_id"]: ev for ev in evs}
    for e in entries:
        ev = events_map.get(e.get("event_id") or "")
        e["event_name"] = (ev.get("event_name") or ev.get("name") or "") if ev else ""
        e["event_date"] = ev.get("event_date") if ev else None

    # Totals for the FE
    total_cost = sum(float(e.get("total_cost") or 0) for e in entries)
    damaged_count = sum(1 for e in entries if e.get("condition") == "dañado")
    missing_count = sum(1 for e in entries if e.get("condition") == "faltante")
    return {
        "entries": entries,
        "totals": {
            "count": len(entries),
            "damaged": damaged_count,
            "missing": missing_count,
            "total_replacement_cost": total_cost,
        },
    }


api_router.include_router(damaged_items_router)


async def _try_bill_damage_to_invoice(entry: dict, user, source: str = "manual") -> Optional[dict]:
    """Append a damage line to the event's invoice.

    Rules:
      - Requires `entry.event_id` and `entry.total_cost > 0`.
      - Uses the first *open* invoice attached to the event. If none, refuses.
      - Idempotent: if this log entry has been billed already, refuses.

    Returns the invoice snapshot (invoice_id, invoice_number, line_added,
    new_total) on success, or None if nothing was billed.
    """
    if not entry.get("event_id"):
        return None
    total_cost = float(entry.get("total_cost") or 0)
    if total_cost <= 0:
        return None

    # Idempotency: refuse if already billed
    existing = await db.damaged_items_log.find_one(
        {"log_id": entry.get("log_id"), "company_id": user.company_id}, {"_id": 0}
    )
    if existing and existing.get("billed_invoice_id"):
        return None

    invoice = await db.invoices.find_one(
        {
            "company_id": user.company_id,
            "event_id": entry["event_id"],
            "status": {"$in": ["open", "sent", "overdue", "partial"]},
        },
        {"_id": 0}
    )
    if not invoice:
        return None

    condition_es = "Faltante" if entry.get("condition") == "faltante" else "Dañado"
    line = {
        "description": f"Reposición {condition_es}: {entry.get('item_name', 'item')}",
        "quantity": float(entry.get("qty") or 1),
        "unit_price": float(entry.get("replacement_cost_per_unit") or 0),
        "discount_percent": 0,
        "notes": entry.get("condition_note") or "",
        "damage_log_id": entry.get("log_id"),
        "auto_generated": True,
        "source": source,
    }
    if line["unit_price"] <= 0:
        # Fallback: distribute total_cost evenly across qty
        line["unit_price"] = round(total_cost / max(line["quantity"], 1), 2)

    now = datetime.now(timezone.utc)
    new_lines = (invoice.get("lines") or []) + [line]
    subtotal = sum(
        float(l.get("quantity", 0)) * float(l.get("unit_price", 0)) *
        (1 - float(l.get("discount_percent", 0)) / 100)
        for l in new_lines
    )
    tax_amount = subtotal * (float(invoice.get("tax_rate") or 0) / 100)
    total = subtotal * (1 - float(invoice.get("discount_percent") or 0) / 100) + tax_amount
    balance_due = round(total - float(invoice.get("paid_amount") or 0), 2)

    await db.invoices.update_one(
        {"invoice_id": invoice["invoice_id"], "company_id": user.company_id},
        {"$set": {
            "lines": new_lines,
            "subtotal": round(subtotal, 2),
            "total": round(total, 2),
            "balance_due": balance_due,
            "updated_at": now.isoformat(),
        }}
    )
    # Stamp the log entry
    await db.damaged_items_log.update_one(
        {"log_id": entry.get("log_id"), "company_id": user.company_id},
        {"$set": {
            "billed_invoice_id": invoice["invoice_id"],
            "billed_invoice_number": invoice.get("invoice_number"),
            "billed_at": now.isoformat(),
            "billed_amount": round(line["quantity"] * line["unit_price"], 2),
            "billed_source": source,
        }}
    )
    return {
        "invoice_id": invoice["invoice_id"],
        "invoice_number": invoice.get("invoice_number"),
        "line_added": line,
        "new_total": round(total, 2),
        "balance_due": balance_due,
    }


@damaged_items_router.post("/{log_id}/bill")
async def bill_damage_manually(log_id: str, user: User = Depends(get_current_user)):
    """Manual trigger for the auto-bill helper — used from the Damages UI
    when auto-billing was skipped (no invoice yet, or manual approval flow).
    """
    entry = await db.damaged_items_log.find_one(
        {"log_id": log_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Damage log entry not found")
    if entry.get("billed_invoice_id"):
        raise HTTPException(status_code=400, detail=f"Ya facturado en {entry.get('billed_invoice_number')}")
    result = await _try_bill_damage_to_invoice(entry, user, source="manual")
    if not result:
        raise HTTPException(
            status_code=400,
            detail="No hay factura abierta para este evento o el costo es cero"
        )
    return result


# ============== DELIVERY NOTES ENDPOINTS (continued) ==============
class DeliveryNoteUpdate(BaseModel):
    items: List[dict] = []  # Updated items list
    notes: Optional[str] = None
    setup_photos: Optional[List[str]] = None  # allow editing the photo gallery inline

@delivery_notes_router.put("/{note_id}")
async def update_delivery_note(note_id: str, data: DeliveryNoteUpdate, user: User = Depends(get_current_user)):
    """Update a delivery note - only allowed for pending notes"""
    note = await db.delivery_notes.find_one({
        "note_id": note_id,
        "company_id": user.company_id
    })
    
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    
    if note.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Cannot edit a delivery note that has been checked-in")
    
    now = datetime.now(timezone.utc)
    
    # Calculate inventory adjustments
    old_items = {item["inventory_item_id"]: item for item in note.get("items", [])}
    new_items = {item["inventory_item_id"]: item for item in data.items}
    
    # Restore inventory for removed/reduced items
    for item_id, old_item in old_items.items():
        old_qty = old_item.get("qty_out", 0)
        new_qty = new_items.get(item_id, {}).get("qty_out", 0)
        
        if new_qty < old_qty:
            # Return difference to inventory
            diff = old_qty - new_qty
            await db.ingredients.update_one(
                {"ingredient_id": item_id},
                {"$inc": {"stock_quantity": diff}}
            )
    
    # Deduct inventory for added/increased items
    for item_id, new_item in new_items.items():
        new_qty = new_item.get("qty_out", 0)
        old_qty = old_items.get(item_id, {}).get("qty_out", 0)
        
        if new_qty > old_qty:
            # Deduct difference from inventory
            diff = new_qty - old_qty
            await db.ingredients.update_one(
                {"ingredient_id": item_id},
                {"$inc": {"stock_quantity": -diff}}
            )
    
    # Prepare items with required fields
    updated_items = []
    for item in data.items:
        updated_items.append({
            "inventory_item_id": item.get("inventory_item_id"),
            "name": item.get("name"),
            "inventory_type": item.get("inventory_type", "equipment"),
            "category": item.get("category", ""),
            "qty_out": item.get("qty_out", 0),
            "qty_returned": 0,
            "qty_lost": 0,
            "loss_cost": 0,
            "replacement_cost": item.get("replacement_cost", 0),
            "unit": item.get("unit", "unit"),
            "notes": item.get("notes", ""),
            "status": "pending"
        })
    
    # Count equipment and disposables
    equipment_count = sum(1 for i in updated_items if i.get("inventory_type") == "equipment")
    disposable_count = sum(1 for i in updated_items if i.get("inventory_type") in ["disposable", "event_supply"])
    
    update_data = {
        "items": updated_items,
        "equipment_count": equipment_count,
        "disposable_count": disposable_count,
        "updated_at": now.isoformat()
    }
    
    if data.notes is not None:
        update_data["notes"] = data.notes
    if data.setup_photos is not None:
        update_data["setup_photos"] = list(data.setup_photos)
    
    await db.delivery_notes.update_one(
        {"note_id": note_id},
        {"$set": update_data}
    )
    
    return {
        "message": "Delivery note updated",
        "note_id": note_id,
        "items_count": len(updated_items)
    }


@delivery_notes_router.post("/{note_id}/photos")
async def upload_delivery_note_photo(
    note_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Attach a setup / on-site photo to a delivery note. Called from the
    conduce UI so ops staff can snap a picture of the assembled setup
    (or the pre-setup reference) directly against the delivery note.
    """
    note = await db.delivery_notes.find_one(
        {"note_id": note_id, "company_id": user.company_id}, {"_id": 0, "setup_photos": 1},
    )
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG/PNG/WebP/GIF/HEIC")

    ext = (file.filename or "").split(".")[-1].lower() if "." in (file.filename or "") else "jpg"
    ext = ext if ext.isalnum() and len(ext) <= 5 else "jpg"
    filename = f"dn_{note_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    _photo_bytes = file.file.read()
    filepath.write_bytes(_photo_bytes)
    photo_url = f"/api/uploads/{filename}"

    existing = list((note or {}).get("setup_photos") or [])
    if len(existing) >= 10:
        raise HTTPException(status_code=400, detail="Max 10 photos per delivery note")
    existing.append(photo_url)
    await db.delivery_notes.update_one(
        {"note_id": note_id, "company_id": user.company_id},
        {"$set": {"setup_photos": existing, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"photo_url": photo_url, "setup_photos": existing}


@delivery_notes_router.delete("/{note_id}/photos")
async def remove_delivery_note_photo(
    note_id: str,
    photo_url: str,
    user: User = Depends(get_current_user),
):
    note = await db.delivery_notes.find_one(
        {"note_id": note_id, "company_id": user.company_id}, {"_id": 0, "setup_photos": 1},
    )
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    existing = list((note or {}).get("setup_photos") or [])
    new_photos = [p for p in existing if p != photo_url]
    await db.delivery_notes.update_one(
        {"note_id": note_id, "company_id": user.company_id},
        {"$set": {"setup_photos": new_photos, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Only unlink locally-owned uploads for this delivery note.
    if photo_url.startswith("/api/uploads/") and f"dn_{note_id}_" in photo_url:
        try:
            (UPLOADS_DIR / photo_url.split("/")[-1]).unlink(missing_ok=True)
        except Exception:
            pass
    return {"setup_photos": new_photos}

# Delete/Cancel Delivery Note
@delivery_notes_router.delete("/{note_id}")
async def delete_delivery_note(note_id: str, user: User = Depends(get_current_user)):
    """Cancel/delete a delivery note - only allowed for pending notes"""
    note = await db.delivery_notes.find_one({
        "note_id": note_id,
        "company_id": user.company_id
    })
    
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    
    if note.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Cannot delete a delivery note that has been checked-in")
    
    # Restore all items to inventory
    for item in note.get("items", []):
        item_id = item.get("inventory_item_id")
        qty_out = item.get("qty_out", 0)
        if item_id and qty_out > 0:
            await db.ingredients.update_one(
                {"ingredient_id": item_id},
                {"$inc": {"stock_quantity": qty_out}}
            )
    
    # Delete the note
    await db.delivery_notes.delete_one({"note_id": note_id})
    
    return {"message": "Delivery note cancelled", "note_id": note_id}



# Direct /clients endpoint (alias to /crm/clients for backward compatibility)
@api_router.get("/clients")
async def get_clients_direct(user: User = Depends(get_current_user)):
    """Get all clients for this company - direct endpoint"""
    clients = await db.clients.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("display_name", 1).to_list(1000)
    return clients


# Include all routers
api_router.include_router(auth_router)
api_router.include_router(crm_router)
api_router.include_router(companies_router)  # B2B Company management
api_router.include_router(leads_router)
api_router.include_router(contacts_router)
api_router.include_router(lead_forms_router)
api_router.include_router(webhooks_router)  # External integrations (Zapier, Make, Meta)
api_router.include_router(events_router)
api_router.include_router(recipes_router)
api_router.include_router(recipes_bulk_router)
api_router.include_router(plated_menus_router)
api_router.include_router(inventory_router)
api_router.include_router(packing_templates_router)
api_router.include_router(nav_badges_router)
api_router.include_router(hr_alerts_router)
api_router.include_router(suppliers_router)
api_router.include_router(supplier_contracts_router)  # /api/supplier-contracts/*
api_router.include_router(operations_router)
api_router.include_router(purchase_list_router)
api_router.include_router(documents_router)
api_router.include_router(finance_router)
api_router.include_router(settings_router)
api_router.include_router(portal_router)
api_router.include_router(public_catalog_router)
api_router.include_router(reports_router)
api_router.include_router(event_order_router)
api_router.include_router(proposals_router)
api_router.include_router(audit_router)
api_router.include_router(purchase_orders_router)
api_router.include_router(expenses_router)
api_router.include_router(allergens_router)
api_router.include_router(business_clarity_router)
api_router.include_router(orchestration_router)
api_router.include_router(production_router)
api_router.include_router(buffet_factors_router)
api_router.include_router(kitchen_beo_router)
api_router.include_router(cost_audit_router)
# menu_engineering_router included later after import from routers/menu_engineering.py
api_router.include_router(cost_variance_router)
api_router.include_router(delivery_notes_router)
api_router.include_router(people_ops_router)

# ============== OPS SUPPLIES AGREEMENTS ROUTER ==============
ops_supplies_router = APIRouter(prefix="/ops-supplies", tags=["Operations Supplies"])

@ops_supplies_router.get("/agreements")
async def get_ops_agreements(user: User = Depends(get_current_user)):
    """Get all agreements for the company"""
    agreements = await db.ops_agreements.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(length=500)
    return agreements

@ops_supplies_router.post("/agreements")
async def create_ops_agreement(data: dict, user: User = Depends(get_current_user)):
    """Create a new agreement"""
    agreement_id = str(uuid.uuid4())
    agreement = {
        "agreement_id": agreement_id,
        "company_id": user.company_id,
        "title": data.get("title", ""),
        "agreement_type": data.get("agreement_type", "rental"),
        "supplier_id": data.get("supplier_id", ""),
        "start_date": data.get("start_date", ""),
        "end_date": data.get("end_date", ""),
        "terms": data.get("terms", ""),
        "monthly_cost": data.get("monthly_cost", 0),
        "deposit": data.get("deposit", 0),
        "status": data.get("status", "active"),
        "documents": data.get("documents", []),
        "notes": data.get("notes", ""),
        "created_at": datetime.now(timezone.utc),
        "created_by": user.user_id
    }
    await db.ops_agreements.insert_one(agreement)
    del agreement["_id"]
    return agreement

@ops_supplies_router.put("/agreements/{agreement_id}")
async def update_ops_agreement(agreement_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update an agreement"""
    result = await db.ops_agreements.update_one(
        {"agreement_id": agreement_id, "company_id": user.company_id},
        {"$set": {
            "title": data.get("title", ""),
            "agreement_type": data.get("agreement_type", "rental"),
            "supplier_id": data.get("supplier_id", ""),
            "start_date": data.get("start_date", ""),
            "end_date": data.get("end_date", ""),
            "terms": data.get("terms", ""),
            "monthly_cost": data.get("monthly_cost", 0),
            "deposit": data.get("deposit", 0),
            "status": data.get("status", "active"),
            "documents": data.get("documents", []),
            "notes": data.get("notes", ""),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return {"success": True}

@ops_supplies_router.delete("/agreements/{agreement_id}")
async def delete_ops_agreement(agreement_id: str, user: User = Depends(get_current_user)):
    """Delete an agreement"""
    result = await db.ops_agreements.delete_one(
        {"agreement_id": agreement_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return {"success": True}

@ops_supplies_router.post("/asset-loss")
async def register_asset_loss(data: dict, user: User = Depends(get_current_user)):
    """Register an asset loss"""
    loss_id = str(uuid.uuid4())
    loss = {
        "loss_id": loss_id,
        "company_id": user.company_id,
        "item_id": data.get("item_id"),
        "item_name": data.get("item_name"),
        "quantity": data.get("quantity", 1),
        "unit_value": data.get("unit_value", 0),
        "total_value": data.get("total_value", 0),
        "reason": data.get("reason", "lost"),  # lost, damaged, stolen, broken
        "resolution": data.get("resolution", "operational_expense"),  # operational_expense, bill_client
        "client_id": data.get("client_id"),
        "event_id": data.get("event_id"),
        "notes": data.get("notes", ""),
        "count_period": data.get("count_period"),
        "status": "pending" if data.get("resolution") == "bill_client" else "processed",
        "created_at": datetime.now(timezone.utc),
        "created_by": user.user_id
    }
    await db.asset_losses.insert_one(loss)
    del loss["_id"]
    return loss

@ops_supplies_router.get("/asset-losses")
async def get_asset_losses(user: User = Depends(get_current_user)):
    """Get all asset losses for the company"""
    losses = await db.asset_losses.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=500)
    return losses

@ops_supplies_router.get("/asset-losses/report")
async def get_asset_loss_report(user: User = Depends(get_current_user)):
    """Get asset loss report summary"""
    losses = await db.asset_losses.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(length=1000)
    
    # Calculate totals
    total_losses = len(losses)
    total_value = sum(l.get("total_value", 0) for l in losses)
    operational_expenses = sum(l.get("total_value", 0) for l in losses if l.get("resolution") == "operational_expense")
    billed_to_clients = sum(l.get("total_value", 0) for l in losses if l.get("resolution") == "bill_client")
    
    # Group by reason
    by_reason = {}
    for l in losses:
        reason = l.get("reason", "unknown")
        if reason not in by_reason:
            by_reason[reason] = {"count": 0, "value": 0}
        by_reason[reason]["count"] += 1
        by_reason[reason]["value"] += l.get("total_value", 0)
    
    # Group by month
    by_month = {}
    for l in losses:
        period = l.get("count_period") or l.get("created_at", "")[:7]
        if period not in by_month:
            by_month[period] = {"count": 0, "value": 0}
        by_month[period]["count"] += 1
        by_month[period]["value"] += l.get("total_value", 0)
    
    return {
        "total_losses": total_losses,
        "total_value": total_value,
        "operational_expenses": operational_expenses,
        "billed_to_clients": billed_to_clients,
        "by_reason": by_reason,
        "by_month": by_month,
        "recent_losses": losses[:10]
    }

api_router.include_router(ops_supplies_router)

# ============== ORGANIZATION & SAAS ENDPOINTS ==============

async def get_user_membership(user_id: str, company_id: str) -> Optional[dict]:
    """Get user's membership in an organization"""
    # Support both company_id and organization_id fields, with or without status
    return await db.memberships.find_one(
        {
            "user_id": user_id,
            "$and": [
                {"$or": [{"company_id": company_id}, {"organization_id": company_id}]},
                {"$or": [{"status": "active"}, {"status": {"$exists": False}}]}
            ]
        },
        {"_id": 0}
    )

async def check_permission(user: User, permission: str) -> bool:
    """Check if user has a specific permission in their active org"""
    if not user.company_id:
        return False
    membership = await get_user_membership(user.user_id, user.company_id)
    if not membership:
        # Legacy users without membership get owner permissions
        return True
    role = membership.get("role", "viewer")
    return ROLE_PERMISSIONS.get(role, {}).get(permission, False)

async def get_current_period() -> str:
    """Get current period string (YYYY-MM)"""
    now = datetime.now(timezone.utc)
    return f"{now.year}-{now.month:02d}"

async def get_or_create_usage_meter(company_id: str) -> dict:
    """Get or create usage meter for current period"""
    period = await get_current_period()
    meter = await db.usage_meters.find_one(
        {"company_id": company_id, "period": period},
        {"_id": 0}
    )
    if not meter:
        meter = {
            "meter_id": f"meter_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "period": period,
            "metrics": {
                "events_created": 0,
                "active_users": 0,
                "supplier_invoices": 0,
                "proposals_created": 0,
                "storage_mb": 0
            },
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.usage_meters.insert_one(meter)
        if "_id" in meter:
            del meter["_id"]
    return meter

async def increment_usage(company_id: str, metric: str, amount: int = 1):
    """Increment a usage metric"""
    period = await get_current_period()
    await db.usage_meters.update_one(
        {"company_id": company_id, "period": period},
        {
            "$inc": {f"metrics.{metric}": amount},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        upsert=True
    )

async def check_usage_limit(company_id: str, metric: str) -> dict:
    """Check if organization is within usage limits"""
    # Get subscription and plan
    subscription = await db.subscriptions.find_one(
        {"company_id": company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0}
    )
    if not subscription:
        return {"allowed": True, "warning": False, "message": None}
    
    plan = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
    if not plan:
        return {"allowed": True, "warning": False, "message": None}
    
    # Get current usage
    meter = await get_or_create_usage_meter(company_id)
    current_usage = meter.get("metrics", {}).get(metric, 0)
    
    # Map metric to limit field
    limit_map = {
        "events_created": "events_per_month",
        "active_users": "active_users",
        "supplier_invoices": "supplier_invoices_per_month",
        "proposals_created": "proposals_per_month",
        "storage_mb": "storage_mb"
    }
    
    limit_field = limit_map.get(metric)
    if not limit_field:
        return {"allowed": True, "warning": False, "message": None}

    # Per-company override takes precedence over the plan limit. The company
    # document may carry a `limit_overrides` dict (e.g. {"events_per_month": 100})
    # populated by a Super Admin from the admin panel. Any field not present
    # falls back to the plan's default.
    override_limit = None
    company_doc = await db.companies.find_one(
        {"company_id": company_id},
        {"_id": 0, "limit_overrides": 1},
    )
    if company_doc and isinstance(company_doc.get("limit_overrides"), dict):
        candidate = company_doc["limit_overrides"].get(limit_field)
        try:
            if candidate is not None:
                override_limit = int(candidate)
        except (TypeError, ValueError):
            override_limit = None

    limit = override_limit if override_limit is not None else plan.get("limits", {}).get(limit_field, 999)
    percentage = (current_usage / limit * 100) if limit > 0 else 0
    
    if current_usage >= limit:
        return {
            "allowed": False,
            "warning": True,
            "percentage": percentage,
            "current": current_usage,
            "limit": limit,
            "message": f"Has alcanzado el límite de {limit} para {metric}. Actualiza tu plan para continuar."
        }
    elif percentage >= 80:
        return {
            "allowed": True,
            "warning": True,
            "percentage": percentage,
            "current": current_usage,
            "limit": limit,
            "message": f"Estás usando {percentage:.0f}% de tu límite de {metric}."
        }
    
    return {"allowed": True, "warning": False, "percentage": percentage, "current": current_usage, "limit": limit}

async def ensure_default_plans():
    """Ensure default plans exist in database and update existing ones with new fields"""
    for plan_data in DEFAULT_PLANS:
        existing = await db.plans.find_one({"plan_id": plan_data["plan_id"]})
        if not existing:
            await db.plans.insert_one(plan_data)
        else:
            # Update existing plans with new limits/features if missing
            update_needed = False
            new_limits = existing.get("limits", {})
            new_features = existing.get("features", {})
            
            # Check for new limit fields
            for key in ["execution_goals_per_month"]:
                if key not in new_limits:
                    new_limits[key] = plan_data.get("limits", {}).get(key, 3)
                    update_needed = True
            
            # Check for new feature fields
            for key in ["execution_hub"]:
                if key not in new_features:
                    new_features[key] = plan_data.get("features", {}).get(key, True)
                    update_needed = True
            
            if update_needed:
                await db.plans.update_one(
                    {"plan_id": plan_data["plan_id"]},
                    {"$set": {"limits": new_limits, "features": new_features}}
                )

# Initialize plans on startup
@app.on_event("startup")
async def startup_validate_critical_helpers():
    """MULTI-TENANT SAFETY NET (auto-detects regressions like the one on
    2026-02-08 where `_generate_proposal_number` was broken by a stale
    `from server import ...`). Refuses to serve traffic if any helper
    that's imported across router boundaries is missing / broken.
    Runs BEFORE any tenant request lands. Cheap: pure imports, ~5ms."""
    import logging
    log = logging.getLogger("startup_validation")

    validations = []

    async def _check(desc: str, thunk):
        try:
            result = thunk()
            if hasattr(result, "__await__"):
                result = await result
            validations.append(("ok", desc))
        except Exception as exc:
            validations.append(("FAIL", f"{desc} → {type(exc).__name__}: {exc}"))

    # Helpers that were moved across module boundaries during the P1/P2 refactor.
    # If ANY of these break at import time, the whole app is broken for every
    # tenant — we want to know at boot, not on the first user click.
    await _check(
        "routers.proposals.generate_proposal_number importable",
        lambda: __import__("routers.proposals", fromlist=["generate_proposal_number"]).generate_proposal_number,
    )
    await _check(
        "routers.recipes.calculate_recipe_cost importable",
        lambda: __import__("routers.recipes", fromlist=["calculate_recipe_cost"]).calculate_recipe_cost,
    )
    await _check(
        "routers.buffet_factors._resolve_buffet_factor importable",
        lambda: __import__("routers.buffet_factors", fromlist=["_resolve_buffet_factor"])._resolve_buffet_factor,
    )
    await _check(
        "routers.plated_menus.calculate_menu_cost importable",
        lambda: __import__("routers.plated_menus", fromlist=["calculate_menu_cost"]).calculate_menu_cost,
    )
    await _check(
        "server.get_margin_policy_doc importable",
        lambda: get_margin_policy_doc,
    )
    await _check(
        "server.check_usage_limit importable",
        lambda: check_usage_limit,
    )
    await _check(
        "server.increment_usage importable",
        lambda: increment_usage,
    )
    # Exercise the late-import wrappers themselves so an ImportError inside a
    # `from server import ...` late binding surfaces here rather than at
    # request time (this is the exact class of bug we just fixed).
    from routers.proposals import _generate_proposal_number as _prop_gen
    from routers.events import _generate_proposal_number as _ev_gen
    from routers.events import _check_usage_limit, _increment_usage
    await _check("routers.proposals._generate_proposal_number wrapper", lambda: _prop_gen)
    await _check("routers.events._generate_proposal_number wrapper", lambda: _ev_gen)
    await _check("routers.events._check_usage_limit wrapper", lambda: _check_usage_limit)
    await _check("routers.events._increment_usage wrapper", lambda: _increment_usage)

    failures = [v for v in validations if v[0] == "FAIL"]
    if failures:
        # Fail loudly and REFUSE to serve traffic. Multi-tenant means every
        # tenant would hit the broken path — better to crash the pod, let
        # Kubernetes restart it, and let a human notice than to silently 500.
        for _, msg in failures:
            log.critical("STARTUP VALIDATION FAILED: %s", msg)
        raise RuntimeError(
            f"Refusing to serve traffic — {len(failures)} critical helper(s) "
            f"broken at import time. See CRITICAL logs above."
        )
    log.info("✅ Startup validation passed: %d cross-module helpers wired correctly.", len(validations))


@app.on_event("startup")
async def startup_init_plans():
    await ensure_default_plans()
    # Initialize default addons
    await ensure_default_addons()
    # Create database indexes for performance
    from config import create_indexes
    await create_indexes()
    # Migrate company_entities: normalize id fields
    await _migrate_company_entity_ids()
    # Multi-tenant self-healing migrations (idempotent, safe to run on every boot)
    await _migrate_reconcile_terminated_employees()
    await _migrate_deactivate_orphaned_users()
    # Version-gated legacy data repair — runs once per REPAIR_VERSION bump.
    # Sanitizes recipes/ingredients/suppliers/plated_menus so strict Pydantic
    # response models can never crash reads for tenants with legacy rows.
    try:
        from utils.legacy_repair import run_legacy_repair_if_needed
        await run_legacy_repair_if_needed(db)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"legacy_repair failed to run (non-fatal): {e}")
    # Start background scheduler (daily sales alerts cron)
    try:
        from scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Scheduler failed to start: {e}")


async def _migrate_reconcile_terminated_employees():
    """Self-healing (all tenants): for every offboarding record with status in
    ['approved', 'processed'], ensure the corresponding employee.status is
    'terminated'. Fixes historical cases where an approve step didn't propagate
    to the employee record. Idempotent — safe on every boot.
    """
    try:
        approved = await db.offboarding.find(
            {"status": {"$in": ["approved", "processed"]}},
            {"_id": 0, "employee_id": 1, "company_id": 1, "termination_date": 1},
        ).to_list(20000)
        fixed = 0
        for rec in approved:
            emp_id = rec.get("employee_id")
            company_id = rec.get("company_id")
            if not emp_id or not company_id:
                continue
            r = await db.employees.update_one(
                {"company_id": company_id, "employee_id": emp_id, "status": {"$ne": "terminated"}},
                {"$set": {
                    "status": "terminated",
                    "termination_date": rec.get("termination_date"),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            if r.modified_count:
                fixed += 1
        if fixed:
            print(f"[Migration] Reconciled {fixed} terminated employees across all tenants")
    except Exception as e:
        print(f"[Migration] reconcile_terminated_employees skipped: {e}")


async def _migrate_deactivate_orphaned_users():
    """Self-healing (all tenants): users whose ONLY memberships are in
    [removed, revoked, suspended, inactive] should have `is_active=false`.
    Prevents deleted users from surfacing in CRM salesperson dropdowns and
    other user-selection lists.
    Idempotent — safe on every boot.
    """
    try:
        # Aggregate memberships by user_id → set of statuses
        pipeline = [
            {"$group": {"_id": "$user_id", "statuses": {"$addToSet": "$status"}}},
        ]
        cursor = db.memberships.aggregate(pipeline)
        inactive_statuses = {"removed", "revoked", "suspended", "inactive", "pending"}
        orphan_user_ids: list[str] = []
        async for row in cursor:
            uid = row.get("_id")
            statuses = set(row.get("statuses") or [])
            if not uid or not statuses:
                continue
            # If all memberships are in inactive_statuses, mark user inactive
            if statuses and statuses.issubset(inactive_statuses):
                orphan_user_ids.append(uid)

        fixed = 0
        if orphan_user_ids:
            for chunk_start in range(0, len(orphan_user_ids), 500):
                chunk = orphan_user_ids[chunk_start:chunk_start + 500]
                r = await db.users.update_many(
                    {"user_id": {"$in": chunk}, "is_active": {"$ne": False}},
                    {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                fixed += r.modified_count
        if fixed:
            print(f"[Migration] Deactivated {fixed} orphaned users across all tenants")
    except Exception as e:
        print(f"[Migration] deactivate_orphaned_users skipped: {e}")


async def _migrate_company_entity_ids():
    """One-time migration: ensure all company_entities have company_entity_id field"""
    try:
        # Fix records with 'entity_id' but no 'company_entity_id'
        r1 = await db.company_entities.update_many(
            {"company_entity_id": {"$exists": False}, "entity_id": {"$exists": True}},
            [{"$set": {"company_entity_id": "$entity_id"}}]
        )
        # Fix records with 'id' but no 'company_entity_id'
        r2 = await db.company_entities.update_many(
            {"company_entity_id": {"$exists": False}, "id": {"$exists": True}},
            [{"$set": {"company_entity_id": "$id", "organization_id": {"$ifNull": ["$organization_id", "$company_id"]}}}]
        )
        if r1.modified_count or r2.modified_count:
            print(f"[Migration] Fixed company_entity_ids: {r1.modified_count + r2.modified_count} records")
    except Exception as e:
        print(f"[Migration] company_entity_id migration skipped: {e}")

# ---- Plans Endpoints ----

@org_router.get("/plans")
async def get_plans():
    """Get all available subscription plans"""
    plans = await db.plans.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(20)
    return plans

@org_router.get("/plans/{plan_id}")
async def get_plan(plan_id: str):
    """Get a specific plan"""
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

# ---- Organization Endpoints ----

@org_router.get("/current")
async def get_current_organization(user: User = Depends(get_current_user)):
    """Get current user's active organization with subscription details"""
    if not user.company_id:
        raise HTTPException(status_code=404, detail="No organization found")
    
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Get subscription
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id},
        {"_id": 0}
    )
    
    # Get plan if subscription exists
    plan = None
    if subscription:
        plan = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
    
    # Get usage
    usage = await get_or_create_usage_meter(user.company_id)
    
    # Get membership
    membership = await get_user_membership(user.user_id, user.company_id)
    
    return {
        "organization": company,
        "subscription": subscription,
        "plan": plan,
        "usage": usage,
        "membership": membership,
        "role": membership.get("role", "owner") if membership else "owner"
    }

@org_router.get("/my-organizations")
async def get_my_organizations(user: User = Depends(get_current_user)):
    """Get all organizations the user belongs to"""
    # Find memberships - support both status and no-status (for backwards compatibility)
    memberships = await db.memberships.find(
        {
            "user_id": user.user_id,
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        },
        {"_id": 0}
    ).to_list(50)
    
    orgs = []
    for membership in memberships:
        # Support both company_id and organization_id fields
        org_id = membership.get("company_id") or membership.get("organization_id")
        if not org_id:
            continue
            
        company = await db.companies.find_one(
            {"company_id": org_id},
            {"_id": 0}
        )
        if company:
            orgs.append({
                "organization": company,
                "role": membership["role"],
                "is_active": company["company_id"] == user.company_id
            })
    
    # If user has company_id but no membership (legacy), add it
    if user.company_id and not any(o["organization"]["company_id"] == user.company_id for o in orgs):
        company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
        if company:
            orgs.append({
                "organization": company,
                "role": "owner",
                "is_active": True
            })
    
    return orgs

# REMOVED: /switch/{company_id} endpoint - caused critical bug that corrupted user company_id
# The OrgSwitcher UI component has also been removed

# ============== AGENCY DASHBOARD ENDPOINTS ==============

agency_router = APIRouter(prefix="/agency", tags=["agency"])

@agency_router.get("/clients-overview")
async def get_agency_clients_overview(user: User = Depends(get_current_user)):
    """Get overview of all clients the agency user has access to (as collaborator)"""
    from datetime import timedelta
    
    # Get all memberships where user is a collaborator (not owner)
    memberships = await db.memberships.find({
        "user_id": user.user_id,
        "role": {"$in": ["social_contributor", "social_viewer"]},
        "$or": [{"status": "active"}, {"status": {"$exists": False}}]
    }).to_list(50)
    
    clients = []
    total_pending = 0
    total_scheduled_week = 0
    now = datetime.now(timezone.utc)
    week_from_now = now + timedelta(days=7)
    
    for membership in memberships:
        org_id = membership.get("company_id") or membership.get("organization_id")
        if not org_id:
            continue
        
        # Get company info
        company = await db.companies.find_one({"company_id": org_id}, {"_id": 0})
        if not company:
            continue
        
        # Get stats for this client's social content
        scheduled_count = await db.social_posts.count_documents({
            "company_id": org_id,
            "status": "scheduled"
        })
        
        ideas_count = await db.content_ideas.count_documents({
            "company_id": org_id
        })
        
        pending_count = await db.social_posts.count_documents({
            "company_id": org_id,
            "status": "draft",
            "needs_approval": True
        })
        
        published_count = await db.social_posts.count_documents({
            "company_id": org_id,
            "status": "published"
        })
        
        # Count scheduled this week
        scheduled_week = await db.social_posts.count_documents({
            "company_id": org_id,
            "status": "scheduled",
            "scheduled_at": {"$gte": now.isoformat(), "$lte": week_from_now.isoformat()}
        })
        
        total_pending += pending_count
        total_scheduled_week += scheduled_week
        
        clients.append({
            "company_id": company["company_id"],
            "name": company.get("name", "Unknown"),
            "logo_url": company.get("logo_url"),
            "role": membership["role"],
            "is_active": company["company_id"] == user.company_id,
            "stats": {
                "scheduled": scheduled_count,
                "ideas": ideas_count,
                "pending": pending_count,
                "published": published_count
            }
        })
    
    return {
        "clients": clients,
        "stats": {
            "total": len(clients),
            "pendingApproval": total_pending,
            "scheduledThisWeek": total_scheduled_week
        }
    }

@agency_router.get("/pending-approvals")
async def get_pending_approvals(user: User = Depends(get_current_user)):
    """Get all pending approval items across all client organizations"""
    # Get all memberships where user is a collaborator
    memberships = await db.memberships.find({
        "user_id": user.user_id,
        "role": {"$in": ["social_contributor", "social_viewer"]},
        "$or": [{"status": "active"}, {"status": {"$exists": False}}]
    }).to_list(50)
    
    org_ids = [m.get("company_id") or m.get("organization_id") for m in memberships]
    org_ids = [oid for oid in org_ids if oid]
    
    if not org_ids:
        return {"pending": []}
    
    # Get pending posts from all orgs
    pending = await db.social_posts.find({
        "company_id": {"$in": org_ids},
        "status": "draft",
        "needs_approval": True
    }, {"_id": 0}).to_list(100)
    
    # Enrich with company names
    for post in pending:
        company = await db.companies.find_one(
            {"company_id": post.get("company_id")},
            {"name": 1, "logo_url": 1, "_id": 0}
        )
        post["company_name"] = company.get("name") if company else "Unknown"
        post["company_logo"] = company.get("logo_url") if company else None
    
    return {"pending": pending}

api_router.include_router(agency_router)

@org_router.post("/create")
async def create_organization(data: OrganizationCreate, user: User = Depends(get_current_user)):
    """Create a new organization (onboarding step 1)"""
    now = datetime.now(timezone.utc)
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    
    company = {
        "company_id": company_id,
        "name": data.name,
        "currency": data.currency,
        "timezone": data.timezone,
        "billing_email": data.billing_email or user.email,
        "status": "active",
        "onboarding_completed": False,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "es",
        "default_tax_rate": 0.0,
        "time_format": "24h",
        "proposal_item_types": [],
        "created_at": now.isoformat()
    }
    
    await db.companies.insert_one(company)
    
    # Create owner membership
    membership = {
        "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "user_id": user.user_id,
        "role": "owner",
        "status": "active",
        "invited_by": None,
        "joined_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.memberships.insert_one(membership)
    
    # Update user's company
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"company_id": company_id, "active_org_id": company_id}}
    )
    
    del company["_id"]
    return company

@org_router.put("/update")
async def update_organization(data: dict, user: User = Depends(get_current_user)):
    """Update organization settings"""
    if not await check_permission(user, "manage_settings"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    allowed_fields = ["name", "currency", "timezone", "billing_email", "logo_url", 
                      "primary_color", "secondary_color", "default_language", "time_format"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    await db.companies.update_one(
        {"company_id": user.company_id},
        {"$set": update_data}
    )
    
    return await get_current_organization(user)

@org_router.post("/complete-onboarding")
async def complete_onboarding(user: User = Depends(get_current_user)):
    """Mark onboarding as complete"""
    await db.companies.update_one(
        {"company_id": user.company_id},
        {"$set": {"onboarding_completed": True}}
    )
    return {"success": True}

# ---- Subscription Endpoints ----

@org_router.post("/subscribe/{plan_id}")
async def subscribe_to_plan(plan_id: str, billing_cycle: str = "monthly", user: User = Depends(get_current_user)):
    """Subscribe organization to a plan (onboarding step 2-3)"""
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    now = datetime.now(timezone.utc)
    
    # Calculate period end
    if billing_cycle == "yearly":
        period_end = now + timedelta(days=365)
    else:
        period_end = now + timedelta(days=30)
    
    # For free/starter plan or trial
    is_trial = plan["price_monthly"] == 0
    trial_end = now + timedelta(days=14) if not is_trial else None
    
    subscription = {
        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "plan_id": plan_id,
        "status": "trialing" if trial_end else "active",
        "billing_cycle": billing_cycle,
        "current_period_start": now.isoformat(),
        "current_period_end": period_end.isoformat(),
        "cancel_at_period_end": False,
        "canceled_at": None,
        "trial_ends_at": trial_end.isoformat() if trial_end else None,
        "stripe_subscription_id": None,
        "stripe_customer_id": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # Remove existing subscription
    await db.subscriptions.delete_many({"company_id": user.company_id})
    
    await db.subscriptions.insert_one(subscription)
    del subscription["_id"]
    
    return subscription

@org_router.get("/subscription")
async def get_subscription(user: User = Depends(get_current_user)):
    """Get current subscription details"""
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id},
        {"_id": 0}
    )
    if not subscription:
        return None
    
    plan = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
    usage = await get_or_create_usage_meter(user.company_id)
    
    return {
        "subscription": subscription,
        "plan": plan,
        "usage": usage
    }

@org_router.post("/subscription/cancel")
async def cancel_subscription(user: User = Depends(get_current_user)):
    """Cancel subscription at period end"""
    if not await check_permission(user, "manage_billing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    now = datetime.now(timezone.utc)
    await db.subscriptions.update_one(
        {"company_id": user.company_id},
        {"$set": {
            "cancel_at_period_end": True,
            "canceled_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    return {"success": True, "message": "Subscription will be canceled at period end"}

@org_router.post("/subscription/reactivate")
async def reactivate_subscription(user: User = Depends(get_current_user)):
    """Reactivate a canceled subscription"""
    if not await check_permission(user, "manage_billing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.subscriptions.update_one(
        {"company_id": user.company_id},
        {"$set": {
            "cancel_at_period_end": False,
            "canceled_at": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True}

@org_router.post("/subscription/upgrade/{plan_id}")
async def upgrade_subscription(plan_id: str, user: User = Depends(get_current_user)):
    """Upgrade/downgrade subscription to a different plan"""
    if not await check_permission(user, "manage_billing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    now = datetime.now(timezone.utc)
    
    # Get current subscription
    current_sub = await db.subscriptions.find_one({"company_id": user.company_id})
    billing_cycle = current_sub.get("billing_cycle", "monthly") if current_sub else "monthly"
    
    # Calculate new period
    if billing_cycle == "yearly":
        period_end = now + timedelta(days=365)
    else:
        period_end = now + timedelta(days=30)
    
    await db.subscriptions.update_one(
        {"company_id": user.company_id},
        {"$set": {
            "plan_id": plan_id,
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": period_end.isoformat(),
            "cancel_at_period_end": False,
            "canceled_at": None,
            "trial_ends_at": None,
            "updated_at": now.isoformat()
        }}
    )
    
    return {"success": True, "plan": plan}

# ---- Usage Endpoints ----

@org_router.get("/usage")
async def get_usage(user: User = Depends(get_current_user)):
    """Get current usage metrics and limits"""
    usage = await get_or_create_usage_meter(user.company_id)
    
    # Get plan limits
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id},
        {"_id": 0}
    )
    
    limits = {}
    warnings = []
    
    if subscription:
        plan = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
        if plan:
            limits = plan.get("limits", {})
            
            # Check each metric for warnings
            metrics_to_check = [
                ("events_created", "events_per_month", "eventos"),
                ("active_users", "active_users", "usuarios"),
                ("supplier_invoices", "supplier_invoices_per_month", "facturas de proveedores"),
                ("proposals_created", "proposals_per_month", "propuestas")
            ]
            
            for metric, limit_field, label in metrics_to_check:
                current = usage.get("metrics", {}).get(metric, 0)
                limit = limits.get(limit_field, 999)
                if limit > 0:
                    percentage = (current / limit * 100)
                    if percentage >= 80:
                        warnings.append({
                            "metric": metric,
                            "label": label,
                            "current": current,
                            "limit": limit,
                            "percentage": round(percentage, 1),
                            "exceeded": current >= limit
                        })
    
    return {
        "period": usage.get("period"),
        "metrics": usage.get("metrics", {}),
        "limits": limits,
        "warnings": warnings
    }

@org_router.get("/usage/check/{metric}")
async def check_usage_for_action(metric: str, user: User = Depends(get_current_user)):
    """Check if a specific action is allowed based on usage limits"""
    result = await check_usage_limit(user.company_id, metric)
    return result

# ---- Team/Membership Endpoints ----

@org_router.get("/members")
async def get_members(user: User = Depends(get_current_user), include_suspended: bool = False):
    """Get all members of the organization"""
    # Build query - include memberships with status=active, or no status field at all
    if include_suspended:
        query = {
            "company_id": user.company_id,
            "$or": [
                {"status": "active"},
                {"status": "suspended"},
                {"status": {"$exists": False}},
                {"status": None}
            ]
        }
    else:
        query = {
            "company_id": user.company_id,
            "$or": [
                {"status": "active"},
                {"status": {"$exists": False}},
                {"status": None}
            ]
        }
    
    memberships = await db.memberships.find(query, {"_id": 0}).to_list(100)
    
    # Get custom roles for this company to resolve role names
    custom_roles = await db.roles.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    custom_roles_map = {r["role_id"]: r for r in custom_roles}
    
    # Enrich with user data
    members = []
    for mem in memberships:
        user_data = await db.users.find_one({"user_id": mem["user_id"]}, {"_id": 0})
        if user_data:
            # Resolve role name
            role_id = mem["role"]
            role_name = role_id  # Default to role_id
            role_name_es = role_id
            
            # Check if it's a custom role
            if role_id in custom_roles_map:
                role_name = custom_roles_map[role_id].get("name", role_id)
                role_name_es = custom_roles_map[role_id].get("name_es", role_name)
            
            members.append({
                "membership_id": mem.get("membership_id"),
                "user_id": mem.get("user_id"),
                "email": user_data.get("email"),
                "name": user_data.get("name"),
                "phone": user_data.get("phone"),
                "picture": user_data.get("picture"),
                "role": role_id,
                "role_name": role_name,
                "role_name_es": role_name_es,
                "status": mem.get("status", "active"),
                "joined_at": mem.get("joined_at", mem.get("created_at")),
                "is_current_user": mem.get("user_id") == user.user_id
            })
    
    return members

@org_router.put("/members/{membership_id}/role")
async def update_member_role(membership_id: str, role: str, user: User = Depends(get_current_user)):
    """Update a member's role"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check if role is a system role or a custom role
    is_valid_role = role in ROLE_PERMISSIONS
    if not is_valid_role:
        # Check if it's a custom role for this company
        custom_role = await db.roles.find_one({"role_id": role, "company_id": user.company_id})
        if not custom_role:
            raise HTTPException(status_code=400, detail="Invalid role")
    
    membership = await db.memberships.find_one({"membership_id": membership_id})
    if not membership or membership["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Prevent changing own role if owner
    if membership["user_id"] == user.user_id and membership["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot change owner's role")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"role": role, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}

@org_router.delete("/members/{membership_id}")
async def remove_member(membership_id: str, user: User = Depends(get_current_user)):
    """Remove a member from the organization"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    membership = await db.memberships.find_one({"membership_id": membership_id})
    if not membership or membership["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if membership["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove owner")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"status": "removed", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Also deactivate the user so they don't appear in selection lists (CRM, mentions, etc.)
    member_user_id = membership.get("user_id")
    if member_user_id:
        # Only deactivate if this was their only active membership for this company
        other_active = await db.memberships.find_one({
            "user_id": member_user_id,
            "company_id": user.company_id,
            "membership_id": {"$ne": membership_id},
            "status": {"$nin": ["removed", "revoked", "suspended"]}
        })
        if not other_active:
            await db.users.update_one(
                {"user_id": member_user_id, "company_id": user.company_id},
                {"$set": {"is_active": False, "status": "inactive",
                          "deactivated_at": datetime.now(timezone.utc).isoformat(),
                          "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            # Auto-unassign any leads owned by this deactivated user so the
            # CRM sales report doesn't leave them stuck under an "Inactivo"
            # badge with 75 orphan leads (as reported by the user).
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                await db.leads.update_many(
                    {"owner_id": member_user_id, "company_id": user.company_id},
                    {"$set": {"owner_id": None, "owner_email": None,
                              "reassigned_at": now_iso,
                              "reassigned_reason": "user_deactivated"}},
                )
            except Exception:
                pass
    
    return {"success": True}


class MemberUpdate(BaseModel):
    """Update member details"""
    name: Optional[str] = None
    phone: Optional[str] = None


@org_router.put("/members/{membership_id}")
async def update_member(membership_id: str, data: MemberUpdate, user: User = Depends(get_current_user)):
    """Update a member's details (name, phone, etc.)"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    membership = await db.memberships.find_one({"membership_id": membership_id})
    if not membership or membership["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Update the user record
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name:
        update_data["name"] = data.name
    if data.phone is not None:
        update_data["phone"] = data.phone
    
    await db.users.update_one(
        {"user_id": membership["user_id"]},
        {"$set": update_data}
    )
    
    return {"success": True}


@org_router.put("/members/{membership_id}/suspend")
async def suspend_member(membership_id: str, user: User = Depends(get_current_user)):
    """Suspend a member (they cannot log in but data is preserved)"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    membership = await db.memberships.find_one({"membership_id": membership_id})
    if not membership or membership["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if membership["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot suspend owner")
    
    if membership["user_id"] == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"status": "suspended", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}


@org_router.put("/members/{membership_id}/activate")
async def activate_member(membership_id: str, user: User = Depends(get_current_user)):
    """Reactivate a suspended member"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    membership = await db.memberships.find_one({"membership_id": membership_id})
    if not membership or membership["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Member not found")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"status": "active", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}


class DirectMemberCreate(BaseModel):
    """Create a member directly with password (no email invitation)"""
    email: str
    name: str
    password: str
    role: str = "viewer"


@org_router.post("/members/create-direct")
async def create_member_direct(data: DirectMemberCreate, user: User = Depends(get_current_user)):
    """Create a new team member directly with password (no email required)"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Validate role - check system roles and custom roles
    is_valid_role = data.role in ROLE_PERMISSIONS
    if not is_valid_role:
        custom_role = await db.roles.find_one({"role_id": data.role, "company_id": user.company_id})
        if not custom_role:
            raise HTTPException(status_code=400, detail="Invalid role")
    
    # Check if email already exists
    existing_user = await db.users.find_one({"email": data.email})
    if existing_user:
        # Check if already a member of this org
        existing_membership = await db.memberships.find_one({
            "user_id": existing_user["user_id"],
            "company_id": user.company_id,
            "status": "active"
        })
        if existing_membership:
            raise HTTPException(status_code=400, detail="Este usuario ya es miembro de esta organización")
        
        # Add existing user to this org
        now = datetime.now(timezone.utc)
        membership_id = f"mem_{uuid.uuid4().hex[:12]}"
        
        await db.memberships.insert_one({
            "membership_id": membership_id,
            "user_id": existing_user["user_id"],
            "company_id": user.company_id,
            "role": data.role,
            "status": "active",
            "joined_at": now.isoformat(),
            "updated_at": now.isoformat()
        })
        
        return {
            "success": True,
            "message": "Usuario existente agregado al equipo",
            "user_id": existing_user["user_id"],
            "membership_id": membership_id
        }
    
    # Create new user
    now = datetime.now(timezone.utc)
    new_user_id = f"user_{uuid.uuid4().hex[:12]}"
    membership_id = f"mem_{uuid.uuid4().hex[:12]}"
    
    # Hash password
    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Create user
    user_doc = {
        "user_id": new_user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": password_hash,
        "company_id": user.company_id,
        "role": data.role,
        "is_super_admin": False,
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    await db.users.insert_one(user_doc)
    
    # Create membership
    membership_doc = {
        "membership_id": membership_id,
        "user_id": new_user_id,
        "company_id": user.company_id,
        "role": data.role,
        "status": "active",
        "joined_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.memberships.insert_one(membership_doc)
    
    return {
        "success": True,
        "message": "Usuario creado y agregado al equipo",
        "user_id": new_user_id,
        "membership_id": membership_id,
        "email": data.email
    }


# ---- Invitation Endpoints ----

@org_router.get("/invitations")
async def get_invitations(user: User = Depends(get_current_user)):
    """Get pending invitations for the organization"""
    invitations = await db.invitations.find(
        {"company_id": user.company_id, "status": "pending"},
        {"_id": 0}
    ).to_list(100)
    return invitations

@org_router.post("/invitations")
async def create_invitation(data: InvitationCreate, user: User = Depends(get_current_user)):
    """Create a new team invitation (onboarding step 4)"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check usage limit for users
    limit_check = await check_usage_limit(user.company_id, "active_users")
    if not limit_check["allowed"]:
        raise HTTPException(status_code=403, detail=limit_check["message"])
    
    # Check if email already invited or member
    existing_invite = await db.invitations.find_one({
        "company_id": user.company_id,
        "email": data.email,
        "status": "pending"
    })
    if existing_invite:
        raise HTTPException(status_code=400, detail="User already invited")
    
    existing_user = await db.users.find_one({"email": data.email})
    if existing_user:
        existing_membership = await db.memberships.find_one({
            "company_id": user.company_id,
            "user_id": existing_user["user_id"],
            "status": "active"
        })
        if existing_membership:
            raise HTTPException(status_code=400, detail="User already a member")
    
    now = datetime.now(timezone.utc)
    invitation = {
        "invitation_id": f"inv_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "email": data.email,
        "role": data.role,
        "token": uuid.uuid4().hex,
        "invited_by": user.user_id,
        "expires_at": (now + timedelta(days=7)).isoformat(),
        "accepted_at": None,
        "status": "pending",
        "created_at": now.isoformat()
    }
    
    await db.invitations.insert_one(invitation)
    del invitation["_id"]
    
    return invitation

@org_router.post("/invitations/{invitation_id}/resend")
async def resend_invitation(invitation_id: str, user: User = Depends(get_current_user)):
    """Resend an invitation (extend expiry)"""
    invitation = await db.invitations.find_one({"invitation_id": invitation_id})
    if not invitation or invitation["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    now = datetime.now(timezone.utc)
    await db.invitations.update_one(
        {"invitation_id": invitation_id},
        {"$set": {
            "token": uuid.uuid4().hex,
            "expires_at": (now + timedelta(days=7)).isoformat(),
            "status": "pending"
        }}
    )
    
    return {"success": True}

@org_router.delete("/invitations/{invitation_id}")
async def revoke_invitation(invitation_id: str, user: User = Depends(get_current_user)):
    """Revoke a pending invitation"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.invitations.update_one(
        {"invitation_id": invitation_id, "company_id": user.company_id},
        {"$set": {"status": "revoked"}}
    )
    
    return {"success": True}

@org_router.post("/invitations/accept/{token}")
async def accept_invitation(token: str, user: User = Depends(get_current_user)):
    """Accept an invitation to join an organization"""
    invitation = await db.invitations.find_one({
        "token": token,
        "email": user.email,
        "status": "pending"
    })
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    # Check expiry
    expires_at = datetime.fromisoformat(invitation["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        await db.invitations.update_one(
            {"invitation_id": invitation["invitation_id"]},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    now = datetime.now(timezone.utc)
    
    # Create membership
    membership = {
        "membership_id": f"mem_{uuid.uuid4().hex[:12]}",
        "company_id": invitation["company_id"],
        "user_id": user.user_id,
        "role": invitation["role"],
        "status": "active",
        "invited_by": invitation["invited_by"],
        "joined_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.memberships.insert_one(membership)
    
    # Update invitation
    await db.invitations.update_one(
        {"invitation_id": invitation["invitation_id"]},
        {"$set": {"status": "accepted", "accepted_at": now.isoformat()}}
    )
    
    # Increment active users
    await increment_usage(invitation["company_id"], "active_users")
    
    return {"success": True, "company_id": invitation["company_id"]}

# ---- Billing Stub Endpoints ----

@org_router.get("/billing")
async def get_billing_info(user: User = Depends(get_current_user)):
    """Get billing information (stub)"""
    # Allow owner/admin or legacy users without membership
    can_access = await check_permission(user, "manage_billing")
    if not can_access:
        # Check if legacy user (has company_id but no membership)
        membership = await get_user_membership(user.user_id, user.company_id)
        if membership is None:
            can_access = True  # Legacy users get full access
    
    if not can_access:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    subscription = await db.subscriptions.find_one({"company_id": user.company_id}, {"_id": 0})
    
    # If no subscription, create a default Starter plan subscription
    if not subscription:
        now = datetime.now(timezone.utc)
        subscription = {
            "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "plan_id": "plan_starter",
            "status": "active",
            "billing_cycle": "monthly",
            "current_period_start": now.isoformat(),
            "current_period_end": (now + timedelta(days=30)).isoformat(),
            "cancel_at_period_end": False,
            "canceled_at": None,
            "trial_ends_at": None,
            "stripe_subscription_id": None,
            "stripe_customer_id": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.subscriptions.insert_one(subscription)
        if "_id" in subscription:
            del subscription["_id"]
    
    plan = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
    
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    
    # Stub billing invoices (would come from Stripe in real implementation)
    billing_invoices = [
        {
            "invoice_id": "inv_stub_001",
            "date": "2026-01-01",
            "amount": plan["price_monthly"] if plan else 0,
            "status": "paid",
            "description": f"Suscripción {plan['display_name_es'] if plan else 'Starter'} - Enero 2026"
        }
    ] if plan and plan["price_monthly"] > 0 else []
    
    return {
        "subscription": subscription,
        "plan": plan,
        "billing_email": company.get("billing_email") if company else None,
        "payment_method": {
            "type": "card",
            "last4": "4242",
            "brand": "visa",
            "exp_month": 12,
            "exp_year": 2028
        } if plan and plan["price_monthly"] > 0 else None,
        "invoices": billing_invoices,
        "next_invoice_date": subscription.get("current_period_end") if subscription else None
    }

@org_router.post("/billing/payment-method")
async def update_payment_method(data: dict, user: User = Depends(get_current_user)):
    """Update payment method (stub - would integrate with Stripe)"""
    if not await check_permission(user, "manage_billing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # In real implementation, this would:
    # 1. Create Stripe PaymentMethod
    # 2. Attach to Customer
    # 3. Set as default
    
    return {
        "success": True,
        "message": "Payment method updated (stub)",
        "integration_point": "Stripe.paymentMethods.create() -> Stripe.paymentMethods.attach() -> Stripe.customers.update()"
    }

# ---- Stripe Subscription Checkout ----

class SubscriptionCheckoutRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"  # monthly or yearly
    origin_url: str

STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

@org_router.post("/billing/checkout")
async def create_subscription_checkout(
    request: Request,
    data: SubscriptionCheckoutRequest,
    user: User = Depends(get_current_user)
):
    """Create Stripe checkout session for plan upgrade/subscription"""
    if not await check_permission(user, "manage_billing"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get plan details from server-side (never trust frontend for pricing)
    plan = await db.plans.find_one({"plan_id": data.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Get price based on billing cycle
    if data.billing_cycle == "yearly":
        amount = float(plan["price_yearly"])
        description = f"{plan['display_name_es']} - Anual"
    else:
        amount = float(plan["price_monthly"])
        description = f"{plan['display_name_es']} - Mensual"
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Free plans don't require payment")
    
    # Build URLs from provided origin
    success_url = f"{data.origin_url}/settings?tab=billing&checkout=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{data.origin_url}/settings?tab=billing&checkout=canceled"
    
    # Create webhook URL
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/org/webhook/stripe"
    
    # Initialize Stripe checkout
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Create checkout session
    metadata = {
        "company_id": user.company_id,
        "user_id": user.user_id,
        "plan_id": data.plan_id,
        "billing_cycle": data.billing_cycle,
        "type": "subscription_upgrade"
    }
    
    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency=plan.get("currency", "USD").lower(),
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record BEFORE redirect
    now = datetime.now(timezone.utc)
    transaction = {
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "session_id": session.session_id,
        "company_id": user.company_id,
        "user_id": user.user_id,
        "amount": amount,
        "currency": plan.get("currency", "USD"),
        "plan_id": data.plan_id,
        "billing_cycle": data.billing_cycle,
        "description": description,
        "payment_status": "initiated",
        "metadata": metadata,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.subscription_transactions.insert_one(transaction)
    
    return {
        "checkout_url": session.url,
        "session_id": session.session_id
    }

@org_router.get("/billing/checkout/status/{session_id}")
async def get_subscription_checkout_status(session_id: str, user: User = Depends(get_current_user)):
    """Get Stripe checkout status and process subscription if successful"""
    
    # Get transaction record
    transaction = await db.subscription_transactions.find_one(
        {"session_id": session_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed, return status
    if transaction["payment_status"] in ["paid", "completed"]:
        return {
            "status": "complete",
            "payment_status": transaction["payment_status"],
            "message": "Subscription already activated"
        }
    
    # Check with Stripe
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        status = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        logger.error(f"Error checking Stripe status: {e}")
        return {
            "status": "error",
            "payment_status": transaction["payment_status"],
            "message": "Error checking payment status"
        }
    
    now = datetime.now(timezone.utc)
    
    # Process based on status
    if status.payment_status == "paid":
        # Double-check to prevent duplicate processing
        fresh_txn = await db.subscription_transactions.find_one({"session_id": session_id})
        if fresh_txn and fresh_txn.get("payment_status") in ["paid", "completed"]:
            return {
                "status": "complete",
                "payment_status": "paid",
                "message": "Subscription already activated"
            }
        
        # Update transaction status
        await db.subscription_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "stripe_payment_status": status.payment_status,
                "amount_total": status.amount_total,
                "updated_at": now.isoformat()
            }}
        )
        
        # Activate the subscription
        plan_id = transaction["plan_id"]
        billing_cycle = transaction["billing_cycle"]
        
        # Calculate period end
        if billing_cycle == "yearly":
            period_end = now + timedelta(days=365)
        else:
            period_end = now + timedelta(days=30)
        
        # Update or create subscription
        await db.subscriptions.update_one(
            {"company_id": user.company_id},
            {"$set": {
                "plan_id": plan_id,
                "status": "active",
                "billing_cycle": billing_cycle,
                "current_period_start": now.isoformat(),
                "current_period_end": period_end.isoformat(),
                "cancel_at_period_end": False,
                "canceled_at": None,
                "trial_ends_at": None,
                "last_payment_date": now.isoformat(),
                "updated_at": now.isoformat()
            }},
            upsert=True
        )
        
        # Update company plan
        await db.companies.update_one(
            {"company_id": user.company_id},
            {"$set": {"plan_id": plan_id}}
        )
        
        return {
            "status": "complete",
            "payment_status": "paid",
            "message": "Subscription activated successfully",
            "plan_id": plan_id
        }
    
    elif status.status == "expired":
        await db.subscription_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "updated_at": now.isoformat()}}
        )
        return {
            "status": "expired",
            "payment_status": "expired",
            "message": "Checkout session expired"
        }
    
    else:
        return {
            "status": status.status,
            "payment_status": status.payment_status,
            "message": "Payment processing"
        }

@org_router.post("/webhook/stripe")
async def handle_subscription_webhook(request: Request):
    """Handle Stripe webhook events for subscriptions"""
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")
    
    try:
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        # Process webhook event
        event_type = webhook_response.event_type
        session_id = webhook_response.session_id
        metadata = webhook_response.metadata
        
        if event_type == "checkout.session.completed":
            # Update transaction
            await db.subscription_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": "paid",
                    "webhook_event_id": webhook_response.event_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Activate subscription if not already done
            if metadata.get("type") == "subscription_upgrade":
                company_id = metadata.get("company_id")
                plan_id = metadata.get("plan_id")
                billing_cycle = metadata.get("billing_cycle", "monthly")
                
                now = datetime.now(timezone.utc)
                period_end = now + timedelta(days=365 if billing_cycle == "yearly" else 30)
                
                await db.subscriptions.update_one(
                    {"company_id": company_id},
                    {"$set": {
                        "plan_id": plan_id,
                        "status": "active",
                        "billing_cycle": billing_cycle,
                        "current_period_start": now.isoformat(),
                        "current_period_end": period_end.isoformat(),
                        "cancel_at_period_end": False,
                        "updated_at": now.isoformat()
                    }},
                    upsert=True
                )
        
        return {"received": True}
    
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ---- Role Check Endpoint ----

@org_router.get("/permissions")
async def get_my_permissions(user: User = Depends(get_current_user)):
    """Get current user's permissions in active organization"""
    membership = await get_user_membership(user.user_id, user.company_id)
    role = membership.get("role", "owner") if membership else "owner"
    
    # Check if it's a system role
    if role in ROLE_PERMISSIONS:
        permissions = ROLE_PERMISSIONS[role]
    else:
        # It's a custom role - fetch from database
        custom_role = await db.roles.find_one(
            {"role_id": role, "company_id": user.company_id},
            {"_id": 0}
        )
        if custom_role:
            # Convert custom role permissions array to dict format
            role_perms = custom_role.get("permissions", [])
            permissions = {
                "manage_billing": "settings.billing" in role_perms or "settings.manage" in role_perms,
                "manage_plans": "settings.plans" in role_perms or "settings.manage" in role_perms,
                "manage_members": "settings.users" in role_perms or "settings.manage" in role_perms,
                "manage_settings": "settings.manage" in role_perms,
                "manage_events": "events.edit" in role_perms or "events.create" in role_perms,
                "manage_inventory": "culinary.manage" in role_perms,
                "view_business_clarity": "finance.view" in role_perms,
                "manage_business_clarity": "finance.reports" in role_perms,
                "view_all": True,
                "view_crm": "crm.view" in role_perms,
                "manage_crm": "crm.edit" in role_perms or "crm.create" in role_perms
            }
        else:
            # Fallback to viewer permissions
            permissions = ROLE_PERMISSIONS["viewer"]
    
    # Check if user is the organization creator/owner - always grant manage_members
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0, "created_by": 1, "owner_id": 1})
    if company:
        is_org_owner = (company.get("created_by") == user.user_id or 
                        company.get("owner_id") == user.user_id)
        if is_org_owner:
            # Organization creator always has full permissions
            permissions = dict(permissions)  # Make a copy
            permissions["manage_members"] = True
            permissions["manage_settings"] = True
            permissions["manage_billing"] = True
    
    # Also check if this is the only member (likely the creator)
    member_count = await db.memberships.count_documents({"company_id": user.company_id, "status": "active"})
    if member_count == 1:
        permissions = dict(permissions)
        permissions["manage_members"] = True
    
    return {
        "role": role,
        "permissions": permissions
    }

# Include org_router after all endpoints are defined
api_router.include_router(org_router)

# ============== SUPER ADMIN PORTAL ==============

async def get_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that verifies user is a super admin"""
    if not user.is_super_admin:
        raise HTTPException(status_code=404, detail="Not found")
    return user

async def log_super_admin_action(admin_user_id: str, action: str, target_org_id: str = None, details: dict = None):
    """Log super admin actions for audit"""
    await db.super_admin_audit.insert_one({
        "audit_id": f"sa_audit_{uuid.uuid4().hex[:12]}",
        "admin_user_id": admin_user_id,
        "action": action,
        "target_org_id": target_org_id,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

# ---- Super Admin: Organizations List ----

@super_admin_router.get("/organizations")
async def list_all_organizations(
    search: str = None,
    status: str = None,
    plan: str = None,
    industry: str = None,
    page: int = 1,
    limit: int = 50,
    admin: User = Depends(get_super_admin)
):
    """List all organizations with filters (Super Admin only)"""
    query = {}
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if status:
        query["status"] = status
    if industry:
        query["industry_template"] = industry
    
    # Get organizations
    orgs = await db.companies.find(query, {"_id": 0}).skip((page - 1) * limit).limit(limit).to_list(limit)
    total = await db.companies.count_documents(query)
    
    # Enrich with subscription and usage data
    enriched_orgs = []
    current_period = await get_current_period()
    
    for org in orgs:
        # Get subscription
        subscription = await db.subscriptions.find_one(
            {"company_id": org["company_id"]},
            {"_id": 0}
        )
        
        # Get plan
        plan_data = None
        if subscription:
            plan_data = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
            if plan and plan_data and plan_data["plan_id"] != plan:
                continue  # Filter by plan
        
        # Get usage
        usage = await db.usage_meters.find_one(
            {"company_id": org["company_id"], "period": current_period},
            {"_id": 0}
        )
        
        # Count members
        members_count = await db.memberships.count_documents({
            "company_id": org["company_id"],
            "status": "active"
        })
        
        enriched_orgs.append({
            "organization": org,
            "subscription": subscription,
            "plan": plan_data,
            "usage": usage.get("metrics", {}) if usage else {},
            "members_count": members_count,
            "limits": plan_data.get("limits", {}) if plan_data else {}
        })
    
    return {
        "organizations": enriched_orgs,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@super_admin_router.post("/organizations")
async def create_organization(data: dict, admin: User = Depends(get_super_admin)):  # noqa: F811
    """Create a new organization (Super Admin only)"""
    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Nombre es requerido")
    
    now = datetime.now(timezone.utc)
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    
    company_doc = {
        "company_id": company_id,
        "name": name,
        "industry_template": data.get("industry_template", "general"),
        "logo_url": None,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "es",
        "currency": "USD",
        "default_tax_rate": 0.0,
        "status": "active",
        "created_at": now.isoformat(),
        "created_by_admin": admin.user_id
    }
    await db.companies.insert_one(company_doc)
    
    await log_super_admin_action(admin.user_id, "create_organization", company_id, {"name": name})
    
    return {"success": True, "company_id": company_id, "name": name}


@super_admin_router.get("/organizations/{company_id}")
async def get_organization_detail(company_id: str, admin: User = Depends(get_super_admin)):
    """Get detailed organization info (Super Admin only)"""
    org = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Get subscription
    subscription = await db.subscriptions.find_one({"company_id": company_id}, {"_id": 0})
    
    # Get plan
    plan_data = None
    if subscription:
        plan_data = await db.plans.find_one({"plan_id": subscription["plan_id"]}, {"_id": 0})
    
    # Get usage for current and last 3 months
    current_period = await get_current_period()
    usage_history = await db.usage_meters.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("period", -1).limit(4).to_list(4)
    
    # Get members count
    members_count = await db.memberships.count_documents({
        "company_id": company_id,
        "status": "active"
    })
    
    # Get events count
    events_count = await db.events.count_documents({"company_id": company_id})
    
    # Get internal notes
    internal_notes = await db.org_internal_notes.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    # Get organization config for industry
    org_config = await db.organization_configs.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    # Get active modules
    active_modules = await db.organization_addons.find(
        {"company_id": company_id, "status": "active", "addon_type": "module"},
        {"_id": 0}
    ).to_list(20)
    
    active_module_keys = [
        a.get("addon_id", "").replace("addon_", "") 
        for a in active_modules
    ]
    
    return {
        "organization": org,
        "subscription": subscription,
        "plan": plan_data,
        "limit_overrides": org.get("limit_overrides") or {},
        "usage_history": usage_history,
        "current_usage": usage_history[0] if usage_history else None,
        "members_count": members_count,
        "events_count": events_count,
        "internal_notes": internal_notes.get("notes", "") if internal_notes else "",
        "industry_template": org.get("industry_template", "events_hospitality"),
        "org_config": org_config,
        "active_modules": active_modules,
        "active_module_keys": active_module_keys
    }

@super_admin_router.put("/organizations/{company_id}/notes")
async def update_org_internal_notes(company_id: str, data: dict, admin: User = Depends(get_super_admin)):
    """Update internal support notes for an organization"""
    await db.org_internal_notes.update_one(
        {"company_id": company_id},
        {"$set": {"notes": data.get("notes", ""), "updated_by": admin.user_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    await log_super_admin_action(admin.user_id, "update_notes", company_id)
    return {"success": True}


@super_admin_router.put("/organizations/{company_id}/account-type")
async def update_org_account_type(company_id: str, data: dict, admin: User = Depends(get_super_admin)):
    """Update organization account type (normal, demo, influencer, partner)"""
    account_type = data.get("account_type", "")
    
    # Validate account type
    valid_types = ["", "demo", "influencer", "partner"]
    if account_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid account type. Must be one of: {valid_types}")
    
    org = await db.companies.find_one({"company_id": company_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Update or remove account_type
    if account_type:
        await db.companies.update_one(
            {"company_id": company_id},
            {"$set": {"account_type": account_type, "account_type_updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        # Remove account_type field for "normal" accounts
        await db.companies.update_one(
            {"company_id": company_id},
            {"$unset": {"account_type": ""}}
        )
    
    await log_super_admin_action(admin.user_id, "change_account_type", company_id, {
        "old_type": org.get("account_type", "normal"),
        "new_type": account_type or "normal"
    })
    
    return {"success": True, "account_type": account_type or "normal"}


@super_admin_router.put("/organizations/{company_id}/suspend")
async def suspend_organization(company_id: str, data: dict = None, admin: User = Depends(get_super_admin)):
    """Suspend an organization (Super Admin only)"""
    org = await db.companies.find_one({"company_id": company_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    reason = data.get("reason", "No reason provided") if data else "No reason provided"
    
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"status": "suspended", "suspended_at": datetime.now(timezone.utc).isoformat(), "suspension_reason": reason}}
    )
    
    await log_super_admin_action(admin.user_id, "suspend_org", company_id, {"reason": reason})
    
    return {"success": True, "status": "suspended"}

@super_admin_router.put("/organizations/{company_id}/reactivate")
async def reactivate_organization(company_id: str, admin: User = Depends(get_super_admin)):
    """Reactivate a suspended organization (Super Admin only)"""
    org = await db.companies.find_one({"company_id": company_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"status": "active"}, "$unset": {"suspended_at": "", "suspension_reason": ""}}
    )
    
    await log_super_admin_action(admin.user_id, "reactivate_org", company_id)
    
    return {"success": True, "status": "active"}

@super_admin_router.put("/organizations/{company_id}/subscription/override")
async def override_subscription_status(company_id: str, data: dict, admin: User = Depends(get_super_admin)):
    """Override subscription status (DANGER ZONE - for testing only)"""
    new_status = data.get("status")
    if new_status not in ["trialing", "active", "past_due", "canceled", "paused"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    await db.subscriptions.update_one(
        {"company_id": company_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_super_admin_action(admin.user_id, "override_subscription", company_id, {"new_status": new_status})
    
    return {"success": True, "status": new_status}

@super_admin_router.post("/organizations/{company_id}/reset-usage")
async def reset_usage_meter(company_id: str, admin: User = Depends(get_super_admin)):
    """Reset usage meter for current period (Super Admin only)"""
    current_period = await get_current_period()
    
    await db.usage_meters.update_one(
        {"company_id": company_id, "period": current_period},
        {"$set": {
            "metrics": {
                "events_created": 0,
                "active_users": 0,
                "supplier_invoices": 0,
                "proposals_created": 0,
                "storage_mb": 0
            },
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    await log_super_admin_action(admin.user_id, "reset_usage", company_id, {"period": current_period})
    
    return {"success": True, "period": current_period}


# ---- Super Admin: Legacy Data Repair (manual trigger + history) ----

@super_admin_router.post("/legacy-repair/run")
async def super_admin_run_legacy_repair(admin: User = Depends(get_super_admin)):
    """Force-run the legacy data repair NOW for all tenants, regardless of the
    version gate. Useful when a specific tenant reports crashes and you don't
    want to wait for the next deploy.
    """
    from utils.legacy_repair import _repair_one_company, REPAIR_VERSION
    companies = await db.companies.find({}, {"_id": 0, "company_id": 1}).to_list(None)
    totals = {"companies_processed": 0}
    rollup = {"recipes": 0, "ingredients": 0, "suppliers": 0, "plated_menus": 0}
    for c in companies:
        cid = c.get("company_id")
        if not cid:
            continue
        summary = await _repair_one_company(db, cid)
        await db.legacy_repair_history.insert_one({
            "company_id": cid,
            "run_at": datetime.now(timezone.utc).isoformat(),
            "version": REPAIR_VERSION,
            "triggered_by": f"super_admin:{admin.user_id}",
            "summary": summary,
        })
        for coll, res in summary.items():
            if isinstance(res, dict) and "repaired" in res:
                rollup[coll] = rollup.get(coll, 0) + res["repaired"]
        totals["companies_processed"] += 1
    await log_super_admin_action(admin.user_id, "legacy_repair_manual_run", None, {"totals": totals, "rollup": rollup})
    return {"success": True, "totals": totals, "rollup": rollup, "version": REPAIR_VERSION}


@super_admin_router.get("/legacy-repair/history")
async def super_admin_get_legacy_repair_history(
    company_id: str = None, limit: int = 50, admin: User = Depends(get_super_admin)
):
    """Return recent legacy-repair audit entries. If `company_id` is given,
    filters to that tenant only.
    """
    query = {"company_id": company_id} if company_id else {}
    docs = await db.legacy_repair_history.find(query, {"_id": 0}).sort("run_at", -1).to_list(limit)
    state = await db.repair_state.find_one({"key": "legacy_repair_version"}, {"_id": 0})
    return {"history": docs, "state": state or {}}


@super_admin_router.get("/diagnostics")
async def get_global_diagnostics(admin: User = Depends(get_super_admin)):
    """Get global system diagnostics (Super Admin only)"""
    # Count data across all collections
    total_companies = await db.companies.count_documents({})
    total_users = await db.users.count_documents({})
    total_clients = await db.clients.count_documents({})
    total_leads = await db.leads.count_documents({})
    total_events = await db.events.count_documents({})
    total_proposals = await db.proposals.count_documents({})
    total_invoices = await db.invoices.count_documents({})
    
    # Get data per company
    clients_pipeline = [
        {"$group": {"_id": "$company_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    clients_by_company = await db.clients.aggregate(clients_pipeline).to_list(20)
    
    leads_pipeline = [
        {"$group": {"_id": "$company_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    leads_by_company = await db.leads.aggregate(leads_pipeline).to_list(20)
    
    # Get orphaned data (data without valid company)
    company_ids = await db.companies.distinct("company_id")
    orphaned_clients = await db.clients.count_documents({"company_id": {"$nin": company_ids}})
    orphaned_leads = await db.leads.count_documents({"company_id": {"$nin": company_ids}})
    
    # Get recent errors from audit log
    recent_errors = await db.super_admin_audit.find(
        {"action": {"$regex": "error", "$options": "i"}},
        {"_id": 0}
    ).sort("timestamp", -1).limit(10).to_list(10)
    
    return {
        "summary": {
            "total_companies": total_companies,
            "total_users": total_users,
            "total_clients": total_clients,
            "total_leads": total_leads,
            "total_events": total_events,
            "total_proposals": total_proposals,
            "total_invoices": total_invoices
        },
        "data_by_company": {
            "clients": clients_by_company,
            "leads": leads_by_company
        },
        "issues": {
            "orphaned_clients": orphaned_clients,
            "orphaned_leads": orphaned_leads
        },
        "recent_errors": recent_errors
    }


@super_admin_router.get("/diagnostics/company/{company_id}")
async def get_company_diagnostics(company_id: str, admin: User = Depends(get_super_admin)):
    """Get detailed diagnostics for a specific company (Super Admin only)"""
    # Get company info
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Count data for this company
    clients_count = await db.clients.count_documents({"company_id": company_id})
    leads_count = await db.leads.count_documents({"company_id": company_id})
    events_count = await db.events.count_documents({"company_id": company_id})
    proposals_count = await db.proposals.count_documents({"company_id": company_id})
    
    # Get users
    memberships = await db.memberships.find({"company_id": company_id}, {"_id": 0}).to_list(50)
    users = []
    for mem in memberships:
        user = await db.users.find_one({"user_id": mem["user_id"]}, {"_id": 0, "email": 1, "name": 1, "last_login": 1})
        if user:
            users.append({**user, "role": mem["role"], "status": mem["status"]})
    
    # Sample data to check structure
    sample_client = await db.clients.find_one({"company_id": company_id}, {"_id": 0})
    sample_lead = await db.leads.find_one({"company_id": company_id}, {"_id": 0})
    
    # Check for data issues
    issues = []
    
    # Check for clients without display_name
    clients_no_name = await db.clients.count_documents({"company_id": company_id, "display_name": {"$in": [None, ""]}})
    if clients_no_name > 0:
        issues.append(f"{clients_no_name} clients without display_name")
    
    # Check for clients without status
    clients_no_status = await db.clients.count_documents({"company_id": company_id, "status": {"$exists": False}})
    if clients_no_status > 0:
        issues.append(f"{clients_no_status} clients without status field")
    
    # Check for leads without lead_type
    leads_no_type = await db.leads.count_documents({"company_id": company_id, "lead_type": {"$exists": False}})
    if leads_no_type > 0:
        issues.append(f"{leads_no_type} leads without lead_type")
    
    return {
        "company": company,
        "data_counts": {
            "clients": clients_count,
            "leads": leads_count,
            "events": events_count,
            "proposals": proposals_count
        },
        "users": users,
        "sample_client": sample_client,
        "sample_lead": sample_lead,
        "issues": issues
    }


@super_admin_router.post("/repair/migrate-data")
async def migrate_data_between_companies(
    data: dict,
    admin: User = Depends(get_super_admin)
):
    """Migrate data from one company_id to another (Super Admin only)
    
    Request body:
    {
        "source_company_id": "company_xxx",
        "target_company_id": "company_yyy",
        "data_types": ["clients", "leads", "events"],  # optional, defaults to all
        "dry_run": true  # optional, defaults to true
    }
    """
    source_id = data.get("source_company_id")
    target_id = data.get("target_company_id")
    data_types = data.get("data_types", ["clients", "leads", "events", "proposals", "invoices"])
    dry_run = data.get("dry_run", True)
    
    if not source_id or not target_id:
        raise HTTPException(status_code=400, detail="source_company_id and target_company_id are required")
    
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="Source and target cannot be the same")
    
    # Verify target company exists
    target_company = await db.companies.find_one({"company_id": target_id})
    if not target_company:
        raise HTTPException(status_code=404, detail=f"Target company {target_id} not found")
    
    results = {}
    
    collection_map = {
        "clients": db.clients,
        "leads": db.leads,
        "events": db.events,
        "proposals": db.proposals,
        "invoices": db.invoices
    }
    
    for data_type in data_types:
        if data_type not in collection_map:
            continue
            
        collection = collection_map[data_type]
        count = await collection.count_documents({"company_id": source_id})
        
        if dry_run:
            results[data_type] = {"would_migrate": count}
        else:
            if count > 0:
                result = await collection.update_many(
                    {"company_id": source_id},
                    {"$set": {"company_id": target_id, "migrated_at": datetime.now(timezone.utc).isoformat(), "migrated_from": source_id}}
                )
                results[data_type] = {"migrated": result.modified_count}
            else:
                results[data_type] = {"migrated": 0}
    
    if not dry_run:
        await log_super_admin_action(admin.user_id, "migrate_data", target_id, {
            "source": source_id,
            "results": results
        })
    
    return {
        "dry_run": dry_run,
        "source_company_id": source_id,
        "target_company_id": target_id,
        "results": results
    }


@super_admin_router.post("/repair/fix-client-fields")
async def fix_client_fields(
    data: dict,
    admin: User = Depends(get_super_admin)
):
    """Fix missing fields in clients (Super Admin only)
    
    Request body:
    {
        "company_id": "company_xxx",  # optional, if not provided fixes all
        "dry_run": true
    }
    """
    company_id = data.get("company_id")
    dry_run = data.get("dry_run", True)
    
    query = {"company_id": company_id} if company_id else {}
    
    # Find clients with issues
    clients_no_status = await db.clients.count_documents({**query, "status": {"$exists": False}})
    clients_no_display = await db.clients.count_documents({**query, "display_name": {"$in": [None, ""]}})
    clients_no_type = await db.clients.count_documents({**query, "client_type": {"$exists": False}})
    
    results = {
        "clients_without_status": clients_no_status,
        "clients_without_display_name": clients_no_display,
        "clients_without_client_type": clients_no_type
    }
    
    if not dry_run:
        # Fix status
        if clients_no_status > 0:
            await db.clients.update_many(
                {**query, "status": {"$exists": False}},
                {"$set": {"status": "Active"}}
            )
        
        # Fix display_name - use name, company_name, or client_name
        if clients_no_display > 0:
            clients = await db.clients.find({**query, "display_name": {"$in": [None, ""]}}).to_list(10000)
            for c in clients:
                display_name = c.get("name") or c.get("company_name") or c.get("client_name") or "Unknown"
                await db.clients.update_one(
                    {"client_id": c["client_id"]},
                    {"$set": {"display_name": display_name}}
                )
        
        # Fix client_type
        if clients_no_type > 0:
            await db.clients.update_many(
                {**query, "client_type": {"$exists": False}},
                {"$set": {"client_type": "Company"}}
            )
        
        results["fixed"] = True
        await log_super_admin_action(admin.user_id, "fix_client_fields", company_id, results)
    else:
        results["dry_run"] = True
    
    return results


@super_admin_router.post("/repair/cleanup-nan-values")
async def cleanup_nan_values_admin(
    data: dict,
    admin: User = Depends(get_super_admin)
):
    """Clean up 'nan' string values from all data (Super Admin only)
    
    Request body:
    {
        "company_id": "company_xxx",  # optional
        "dry_run": true
    }
    """
    company_id = data.get("company_id")
    dry_run = data.get("dry_run", True)
    
    query = {"company_id": company_id} if company_id else {}
    
    # Find documents with 'nan' string values
    nan_query = {
        "$or": [
            {"$expr": {"$regexMatch": {"input": {"$toString": "$estimated_value"}, "regex": "nan", "options": "i"}}},
        ]
    }
    
    leads_with_nan = await db.leads.count_documents({**query})
    clients_with_nan = await db.clients.count_documents({**query})
    
    results = {
        "leads_checked": leads_with_nan,
        "clients_checked": clients_with_nan
    }
    
    if not dry_run:
        # Clean leads
        updated_leads = 0
        leads = await db.leads.find(query).to_list(10000)
        for lead in leads:
            updates = {}
            for key, value in lead.items():
                if isinstance(value, str) and value.lower() == "nan":
                    updates[key] = None
                elif isinstance(value, float) and (value != value):  # NaN check
                    updates[key] = 0
            if updates:
                await db.leads.update_one({"lead_id": lead["lead_id"]}, {"$set": updates})
                updated_leads += 1
        
        # Clean clients
        updated_clients = 0
        clients = await db.clients.find(query).to_list(10000)
        for client in clients:
            updates = {}
            for key, value in client.items():
                if isinstance(value, str) and value.lower() == "nan":
                    updates[key] = None
                elif isinstance(value, float) and (value != value):
                    updates[key] = 0
            if updates:
                await db.clients.update_one({"client_id": client["client_id"]}, {"$set": updates})
                updated_clients += 1
        
        results["leads_cleaned"] = updated_leads
        results["clients_cleaned"] = updated_clients
        await log_super_admin_action(admin.user_id, "cleanup_nan_values", company_id, results)
    else:
        results["dry_run"] = True
    
    return results


@super_admin_router.delete("/repair/delete-orphaned-data")
async def delete_orphaned_data(
    dry_run: bool = True,
    admin: User = Depends(get_super_admin)
):
    """Delete data not associated with any valid company (Super Admin only)"""
    company_ids = await db.companies.distinct("company_id")
    
    orphaned_clients = await db.clients.count_documents({"company_id": {"$nin": company_ids}})
    orphaned_leads = await db.leads.count_documents({"company_id": {"$nin": company_ids}})
    orphaned_events = await db.events.count_documents({"company_id": {"$nin": company_ids}})
    
    results = {
        "orphaned_clients": orphaned_clients,
        "orphaned_leads": orphaned_leads,
        "orphaned_events": orphaned_events
    }
    
    if not dry_run:
        if orphaned_clients > 0:
            await db.clients.delete_many({"company_id": {"$nin": company_ids}})
        if orphaned_leads > 0:
            await db.leads.delete_many({"company_id": {"$nin": company_ids}})
        if orphaned_events > 0:
            await db.events.delete_many({"company_id": {"$nin": company_ids}})
        
        results["deleted"] = True
        await log_super_admin_action(admin.user_id, "delete_orphaned_data", None, results)
    else:
        results["dry_run"] = True
    
    return results


# ---- Super Admin: Organization Members ----

@super_admin_router.get("/usage-alerts")
async def get_usage_alerts(
    threshold: int = 80,
    admin: User = Depends(get_super_admin),
):
    """Return organizations whose current usage on any metric is >= `threshold`%
    of their effective limit (per-company override OR plan default).

    Each alert: ``{company_id, name, metric, label, current, limit, percentage,
                  source}``. Sorted by percentage desc.
    """
    from collections import defaultdict

    LIMIT_FIELDS = [
        ("events_created", "events_per_month", "Eventos"),
        ("active_users", "active_users", "Usuarios"),
        ("supplier_invoices", "supplier_invoices_per_month", "Facturas"),
        ("proposals_created", "proposals_per_month", "Propuestas"),
        ("storage_mb", "storage_mb", "Storage"),
    ]

    plans = {p["plan_id"]: p async for p in db.plans.find({}, {"_id": 0})}
    period = await get_current_period()
    meters = {m["company_id"]: m async for m in db.usage_meters.find({"period": period}, {"_id": 0})}

    alerts: list = []
    per_company: dict = defaultdict(list)

    companies_cursor = db.companies.find({}, {"_id": 0, "company_id": 1, "name": 1, "limit_overrides": 1})
    async for c in companies_cursor:
        cid = c.get("company_id")
        if not cid:
            continue
        sub = await db.subscriptions.find_one(
            {"company_id": cid, "status": {"$in": ["active", "trialing"]}},
            {"_id": 0, "plan_id": 1, "status": 1},
        )
        if not sub:
            continue
        plan_limits = (plans.get(sub.get("plan_id")) or {}).get("limits", {})
        overrides = c.get("limit_overrides") or {}
        meter_metrics = (meters.get(cid) or {}).get("metrics", {}) or {}

        for metric_key, limit_key, label in LIMIT_FIELDS:
            current = int(meter_metrics.get(metric_key, 0) or 0)
            override = overrides.get(limit_key)
            try:
                limit = int(override) if override is not None else int(plan_limits.get(limit_key, 0))
            except (TypeError, ValueError):
                limit = int(plan_limits.get(limit_key, 0))
            if limit <= 0:
                continue
            percentage = round(current / limit * 100, 1)
            if percentage >= threshold:
                entry = {
                    "company_id": cid,
                    "name": c.get("name"),
                    "metric": metric_key,
                    "limit_key": limit_key,
                    "label": label,
                    "current": current,
                    "limit": limit,
                    "percentage": percentage,
                    "source": "override" if override is not None else "plan",
                    "plan_id": sub.get("plan_id"),
                    "subscription_status": sub.get("status"),
                }
                alerts.append(entry)
                per_company[cid].append(entry)

    alerts.sort(key=lambda a: a["percentage"], reverse=True)
    return {
        "threshold": threshold,
        "period": period,
        "total": len(alerts),
        "companies_count": len(per_company),
        "alerts": alerts,
    }


@super_admin_router.put("/organizations/{company_id}/limit-overrides")
async def update_org_limit_overrides(
    company_id: str,
    data: dict = Body(...),
    admin: User = Depends(get_super_admin),
):
    """Set / clear per-company limit overrides. Pass an integer value to bump
    a specific limit, or `null` to remove the override and fall back to the
    plan's default. Supported keys: events_per_month, active_users,
    supplier_invoices_per_month, proposals_per_month, storage_mb,
    execution_goals_per_month.
    """
    valid_keys = {
        "events_per_month",
        "active_users",
        "supplier_invoices_per_month",
        "proposals_per_month",
        "storage_mb",
        "execution_goals_per_month",
    }
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "company_id": 1, "limit_overrides": 1})
    if company is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    current = dict(company.get("limit_overrides") or {})
    for k, v in (data or {}).items():
        if k not in valid_keys:
            continue
        if v is None or v == "" or v == "null":
            current.pop(k, None)
            continue
        try:
            current[k] = int(v)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Invalid value for {k}: {v}")
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"limit_overrides": current, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await log_super_admin_action(admin.user_id, "update_limit_overrides", company_id, details={"limit_overrides": current})
    return {"success": True, "limit_overrides": current}


@super_admin_router.get("/plans")
async def list_plans_admin(admin: User = Depends(get_super_admin)):
    """List all subscription plans (admin view)."""
    plans = await db.plans.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return plans


@super_admin_router.put("/plans/{plan_id}")
async def update_plan_admin(
    plan_id: str,
    data: dict = Body(...),
    admin: User = Depends(get_super_admin),
):
    """Update a plan's limits / features. Only `limits` (dict of ints) and
    `features` (dict of bools) are mutable from the admin panel. Other
    fields (name, price) require code changes."""
    plan = await db.plans.find_one({"plan_id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    patch: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "limits" in data and isinstance(data["limits"], dict):
        clean: dict = {}
        for k, v in data["limits"].items():
            try:
                clean[k] = int(v)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Invalid limit {k}: {v}")
        patch["limits"] = clean
    if "features" in data and isinstance(data["features"], dict):
        patch["features"] = {k: bool(v) for k, v in data["features"].items()}

    if len(patch) == 1:  # only the updated_at, nothing to do
        return {"success": True, "plan": {k: v for k, v in plan.items() if k != "_id"}, "changed": False}

    await db.plans.update_one({"plan_id": plan_id}, {"$set": patch})
    await log_super_admin_action(admin.user_id, "update_plan", details={"plan_id": plan_id, "patch": patch})
    updated = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    return {"success": True, "plan": updated, "changed": True}


@super_admin_router.get("/organizations/{company_id}/members")
async def get_org_members(company_id: str, admin: User = Depends(get_super_admin)):
    """Get all members of an organization (Super Admin only).

    Returns a merged list from BOTH the `memberships` collection AND the
    `users` collection (matched by `company_id`). Users without a formal
    membership record are returned with `has_membership=False` so the
    admin UI can offer a one-click "Create membership" repair button.
    """
    memberships = await db.memberships.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(500)

    members = []
    seen_user_ids = set()
    for mem in memberships:
        user_data = await db.users.find_one({"user_id": mem["user_id"]}, {"_id": 0})
        if user_data:
            seen_user_ids.add(mem["user_id"])
            members.append({
                "membership_id": mem.get("membership_id"),
                "user_id": mem["user_id"],
                "email": user_data.get("email"),
                "name": user_data.get("name"),
                "picture": user_data.get("picture"),
                "role": mem.get("role"),
                "status": mem.get("status"),
                "joined_at": mem.get("joined_at"),
                "last_active": user_data.get("last_login"),
                "has_membership": True,
            })

    # Catch users whose `users.company_id` points to this org but who don't
    # have a `memberships` row. Happens for accounts created via the legacy
    # registration flow or imported in bulk.
    orphan_users_cursor = db.users.find(
        {"company_id": company_id, "user_id": {"$nin": list(seen_user_ids)}},
        {"_id": 0},
    )
    async for u in orphan_users_cursor:
        members.append({
            "membership_id": None,
            "user_id": u.get("user_id"),
            "email": u.get("email"),
            "name": u.get("name"),
            "picture": u.get("picture"),
            "role": u.get("role") or None,
            "status": "active",
            "joined_at": u.get("created_at"),
            "last_active": u.get("last_login"),
            "has_membership": False,
        })

    return members


@super_admin_router.post("/organizations/{company_id}/members/from-user/{user_id}")
async def create_membership_from_user(
    company_id: str,
    user_id: str,
    data: dict = Body(default={}),
    admin: User = Depends(get_super_admin),
):
    """Create a `memberships` record for a user whose `users.company_id` already
    points to this org but who is missing a formal membership row. Idempotent.
    """
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    user_doc = await db.users.find_one({"user_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.memberships.find_one({"company_id": company_id, "user_id": user_id})
    if existing:
        return {"success": True, "membership_id": existing.get("membership_id"), "created": False}

    role = (data or {}).get("role") or user_doc.get("role") or "viewer"
    if role not in ["owner", "admin", "ops", "finance", "viewer"]:
        role = "viewer"
    now_iso = datetime.now(timezone.utc).isoformat()
    membership_id = f"mem_{uuid.uuid4().hex[:12]}"
    await db.memberships.insert_one({
        "membership_id": membership_id,
        "company_id": company_id,
        "user_id": user_id,
        "role": role,
        "status": "active",
        "joined_at": now_iso,
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by_admin": admin.user_id,
        "repair_source": "super_admin_create_from_user",
    })
    await log_super_admin_action(admin.user_id, "create_membership_from_user", company_id, details={"user_id": user_id, "role": role})
    return {"success": True, "membership_id": membership_id, "created": True}


@super_admin_router.put("/organizations/{company_id}/members/{membership_id}/role")
async def update_member_role_admin(company_id: str, membership_id: str, role: str, admin: User = Depends(get_super_admin)):
    """Update member role (Super Admin only)"""
    if role not in ["owner", "admin", "ops", "finance", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    membership = await db.memberships.find_one({"membership_id": membership_id, "company_id": company_id})
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"role": role, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_super_admin_action(admin.user_id, "change_member_role", company_id, {"membership_id": membership_id, "new_role": role})
    
    return {"success": True}

@super_admin_router.delete("/organizations/{company_id}/members/{membership_id}")
async def remove_member_admin(company_id: str, membership_id: str, admin: User = Depends(get_super_admin)):
    """Remove member from organization (Super Admin only)"""
    membership = await db.memberships.find_one({"membership_id": membership_id, "company_id": company_id})
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    
    await db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"status": "removed", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_super_admin_action(admin.user_id, "remove_member", company_id, {"membership_id": membership_id})
    
    return {"success": True}


class AddMemberRequest(BaseModel):
    """Request to add a new member to an organization"""
    email: str
    name: str
    password: str
    role: str = "viewer"


@super_admin_router.post("/organizations/{company_id}/members")
async def add_member_to_org(company_id: str, data: AddMemberRequest, admin: User = Depends(get_super_admin)):
    """Add a new user to an organization (Super Admin only)"""
    # Verify organization exists
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    
    # Check if email already exists
    existing_user = await db.users.find_one({"email": data.email})
    if existing_user:
        # Check if user is already a member of this org
        existing_membership = await db.memberships.find_one({
            "user_id": existing_user["user_id"],
            "company_id": company_id,
            "status": "active"
        })
        if existing_membership:
            raise HTTPException(status_code=400, detail="Este usuario ya es miembro de esta organización")
        
        # Add existing user to org with new membership
        now = datetime.now(timezone.utc)
        membership_id = f"mem_{uuid.uuid4().hex[:12]}"
        
        await db.memberships.insert_one({
            "membership_id": membership_id,
            "user_id": existing_user["user_id"],
            "company_id": company_id,
            "role": data.role if data.role in ["owner", "admin", "ops", "finance", "viewer"] else "viewer",
            "status": "active",
            "joined_at": now.isoformat(),
            "updated_at": now.isoformat()
        })
        
        await log_super_admin_action(admin.user_id, "add_member", company_id, {
            "user_id": existing_user["user_id"],
            "email": data.email,
            "role": data.role,
            "existing_user": True
        })
        
        return {
            "success": True,
            "message": "Usuario existente agregado a la organización",
            "user_id": existing_user["user_id"],
            "membership_id": membership_id
        }
    
    # Create new user
    now = datetime.now(timezone.utc)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    membership_id = f"mem_{uuid.uuid4().hex[:12]}"
    
    # Validate role
    role = data.role if data.role in ["owner", "admin", "ops", "finance", "viewer"] else "viewer"
    
    # Hash password
    password_hash = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Create user
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": password_hash,
        "company_id": company_id,
        "role": role,
        "is_super_admin": False,
        "created_at": now.isoformat(),
        "created_by_admin": admin.user_id
    }
    await db.users.insert_one(user_doc)
    
    # Create membership
    membership_doc = {
        "membership_id": membership_id,
        "user_id": user_id,
        "company_id": company_id,
        "role": role,
        "status": "active",
        "joined_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.memberships.insert_one(membership_doc)
    
    await log_super_admin_action(admin.user_id, "add_member", company_id, {
        "user_id": user_id,
        "email": data.email,
        "role": role,
        "new_user": True
    })
    
    return {
        "success": True,
        "message": "Usuario creado y agregado a la organización",
        "user_id": user_id,
        "membership_id": membership_id
    }


# ---- Super Admin: Audit Log ----

@super_admin_router.get("/organizations/{company_id}/audit")
async def get_org_audit_log(company_id: str, limit: int = 20, admin: User = Depends(get_super_admin)):
    """Get audit log for an organization (Super Admin only)"""
    # Get super admin actions on this org
    admin_actions = await db.super_admin_audit.find(
        {"target_org_id": company_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Get org-level audit (invitations, plan changes, etc.)
    # This is a simplified version - in production you'd have a proper audit collection
    
    audit_entries = []
    
    # Recent invitations
    invitations = await db.invitations.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    for inv in invitations:
        audit_entries.append({
            "type": "invitation",
            "action": f"Invited {inv['email']} as {inv['role']}",
            "timestamp": inv["created_at"],
            "status": inv["status"]
        })
    
    # Subscription changes (from admin actions)
    for action in admin_actions:
        audit_entries.append({
            "type": "admin_action",
            "action": action["action"],
            "details": action.get("details", {}),
            "timestamp": action["timestamp"],
            "admin_id": action["admin_user_id"]
        })
    
    # Sort by timestamp
    audit_entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return audit_entries[:limit]

@super_admin_router.get("/audit")
async def get_global_audit_log(limit: int = 50, admin: User = Depends(get_super_admin)):
    """Get global super admin audit log"""
    audit_log = await db.super_admin_audit.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Enrich with admin user names
    enriched = []
    for entry in audit_log:
        admin_user = await db.users.find_one({"user_id": entry["admin_user_id"]}, {"_id": 0, "name": 1, "email": 1})
        org = await db.companies.find_one({"company_id": entry.get("target_org_id")}, {"_id": 0, "name": 1}) if entry.get("target_org_id") else None
        
        enriched.append({
            **entry,
            "admin_name": admin_user.get("name") if admin_user else "Unknown",
            "admin_email": admin_user.get("email") if admin_user else "Unknown",
            "org_name": org.get("name") if org else None
        })
    
    return enriched

# ---- Super Admin: View As Mode ----

@super_admin_router.post("/view-as/{company_id}")
async def start_view_as_mode(company_id: str, admin: User = Depends(get_super_admin)):
    """Start read-only view-as mode for an organization"""
    org = await db.companies.find_one({"company_id": company_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Update user's view_as_org_id
    await db.users.update_one(
        {"user_id": admin.user_id},
        {"$set": {"view_as_org_id": company_id}}
    )
    
    await log_super_admin_action(admin.user_id, "start_view_as", company_id)
    
    return {"success": True, "view_as_org_id": company_id, "org_name": org.get("name")}

@super_admin_router.post("/exit-view-as")
async def exit_view_as_mode(admin: User = Depends(get_super_admin)):
    """Exit read-only view-as mode"""
    if admin.view_as_org_id:
        await log_super_admin_action(admin.user_id, "exit_view_as", admin.view_as_org_id)
    
    await db.users.update_one(
        {"user_id": admin.user_id},
        {"$unset": {"view_as_org_id": ""}}
    )
    
    return {"success": True}

@super_admin_router.get("/view-as/status")
async def get_view_as_status(admin: User = Depends(get_super_admin)):
    """Get current view-as status"""
    if not admin.view_as_org_id:
        return {"active": False}
    
    org = await db.companies.find_one({"company_id": admin.view_as_org_id}, {"_id": 0, "name": 1})
    return {
        "active": True,
        "org_id": admin.view_as_org_id,
        "org_name": org.get("name") if org else "Unknown"
    }

# ---- Super Admin: Stats Dashboard ----

@super_admin_router.get("/stats")
async def get_platform_stats(admin: User = Depends(get_super_admin)):
    """Get platform-wide statistics"""
    # Count organizations by status
    # Treat organizations without status field as "active" (legacy data)
    total_orgs = await db.companies.count_documents({})
    active_orgs = await db.companies.count_documents({
        "$or": [
            {"status": "active"},
            {"status": {"$exists": False}}
        ]
    })
    suspended_orgs = await db.companies.count_documents({"status": "suspended"})
    
    # Count subscriptions by plan
    plan_counts = {}
    plans = await db.plans.find({}, {"_id": 0, "plan_id": 1, "name": 1}).to_list(10)
    for plan in plans:
        count = await db.subscriptions.count_documents({"plan_id": plan["plan_id"]})
        plan_counts[plan["name"]] = count
    
    # Count total users
    total_users = await db.users.count_documents({})
    
    # Count events this month
    current_period = await get_current_period()
    events_this_month = 0
    usage_meters = await db.usage_meters.find({"period": current_period}, {"_id": 0, "metrics": 1}).to_list(1000)
    for meter in usage_meters:
        events_this_month += meter.get("metrics", {}).get("events_created", 0)
    
    return {
        "organizations": {
            "total": total_orgs,
            "active": active_orgs,
            "suspended": suspended_orgs
        },
        "subscriptions_by_plan": plan_counts,
        "total_users": total_users,
        "events_this_month": events_this_month
    }


@super_admin_router.get("/metrics/dashboard")
async def get_dashboard_metrics(admin: User = Depends(get_super_admin)):
    """Get comprehensive dashboard metrics for Super Admin"""
    
    # ========== ORGANIZATIONS BY INDUSTRY ==========
    orgs_by_industry = {
        "events_hospitality": await db.companies.count_documents({"industry_template": "events_hospitality"}),
        "professional_services": await db.companies.count_documents({"industry_template": "professional_services"}),
        "generic": await db.companies.count_documents({"industry_template": "generic"}),
        "not_set": await db.companies.count_documents({
            "$or": [
                {"industry_template": {"$exists": False}},
                {"industry_template": None}
            ]
        })
    }
    
    # ========== REVENUE BY MODULE ==========
    module_revenue = {}
    module_counts = {}
    
    # Get all active modules
    active_modules = await db.organization_addons.find(
        {"status": "active", "addon_type": "module"},
        {"_id": 0, "addon_id": 1, "addon_name": 1, "price_paid": 1}
    ).to_list(1000)
    
    for mod in active_modules:
        addon_id = mod.get("addon_id", "")
        price = mod.get("price_paid", 0)
        name = mod.get("addon_name", addon_id)
        
        if addon_id not in module_revenue:
            module_revenue[addon_id] = 0
            module_counts[addon_id] = 0
        
        module_revenue[addon_id] += price
        module_counts[addon_id] += 1
    
    # Format module data
    modules_data = []
    for addon_id, revenue in module_revenue.items():
        modules_data.append({
            "addon_id": addon_id,
            "name": addon_id.replace("addon_module_", "").replace("_", " ").title(),
            "monthly_revenue": revenue,
            "active_subscriptions": module_counts.get(addon_id, 0)
        })
    
    # Sort by revenue
    modules_data.sort(key=lambda x: x["monthly_revenue"], reverse=True)
    
    # ========== TOTAL MRR (Monthly Recurring Revenue) ==========
    total_mrr = sum(module_revenue.values())
    
    # ========== CONVERSION METRICS ==========
    # Paid transactions (successful payments)
    paid_transactions = await db.payment_transactions.count_documents({"payment_status": "paid"})
    pending_transactions = await db.payment_transactions.count_documents({"payment_status": "pending"})
    
    # Organizations with active modules (paying customers)
    orgs_with_modules = await db.organization_addons.distinct("company_id", {"status": "active", "addon_type": "module"})
    paying_customers = len(orgs_with_modules)
    
    # Total organizations
    total_orgs = await db.companies.count_documents({})
    
    # Conversion rate
    conversion_rate = (paying_customers / total_orgs * 100) if total_orgs > 0 else 0
    
    # ========== TOP MODULES (MOST POPULAR) ==========
    top_modules = modules_data[:5]
    
    # ========== RECENT TRANSACTIONS ==========
    recent_transactions = await db.payment_transactions.find(
        {"payment_status": "paid"},
        {"_id": 0, "transaction_id": 1, "amount": 1, "modules": 1, "user_email": 1, "payment_type": 1, "created_at": 1}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # ========== GROWTH METRICS ==========
    # New orgs this month
    now = datetime.now(timezone.utc)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_orgs_this_month = await db.companies.count_documents({
        "created_at": {"$gte": first_of_month.isoformat()}
    })
    
    # New users this month
    new_users_this_month = await db.users.count_documents({
        "created_at": {"$gte": first_of_month.isoformat()}
    })
    
    # ========== ORGANIZATION STATS ==========
    total_users = await db.users.count_documents({})
    active_orgs = await db.companies.count_documents({
        "$or": [{"status": "active"}, {"status": {"$exists": False}}]
    })
    
    return {
        "mrr": {
            "total": total_mrr,
            "currency": "USD"
        },
        "organizations": {
            "total": total_orgs,
            "active": active_orgs,
            "paying": paying_customers,
            "free": total_orgs - paying_customers,
            "new_this_month": new_orgs_this_month
        },
        "users": {
            "total": total_users,
            "new_this_month": new_users_this_month
        },
        "by_industry": orgs_by_industry,
        "modules": {
            "revenue_by_module": modules_data,
            "top_modules": top_modules,
            "total_active_subscriptions": sum(module_counts.values())
        },
        "conversion": {
            "rate": round(conversion_rate, 1),
            "paid_transactions": paid_transactions,
            "pending_transactions": pending_transactions
        },
        "recent_transactions": recent_transactions
    }


# ============== SUPER ADMIN: EXPORT & ALERTS ==============

from fastapi.responses import StreamingResponse  # noqa: F811
import io  # noqa: F811
import csv

@super_admin_router.get("/metrics/export/csv")
async def export_metrics_csv(admin: User = Depends(get_super_admin)):
    """Export dashboard metrics to CSV"""
    # Get all metrics data
    metrics = await get_dashboard_metrics(admin)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Summary Section
    writer.writerow(["=== KORA OS PLATFORM METRICS REPORT ==="])
    writer.writerow(["Generated", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")])
    writer.writerow([])
    
    # KPIs
    writer.writerow(["=== KEY PERFORMANCE INDICATORS ==="])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["MRR (Monthly Recurring Revenue)", f"${metrics['mrr']['total']:.2f}"])
    writer.writerow(["Total Organizations", metrics['organizations']['total']])
    writer.writerow(["Paying Customers", metrics['organizations']['paying']])
    writer.writerow(["Free Tier Customers", metrics['organizations']['free']])
    writer.writerow(["Conversion Rate", f"{metrics['conversion']['rate']}%"])
    writer.writerow(["Total Users", metrics['users']['total']])
    writer.writerow(["New Orgs This Month", metrics['organizations']['new_this_month']])
    writer.writerow(["New Users This Month", metrics['users']['new_this_month']])
    writer.writerow([])
    
    # Organizations by Industry
    writer.writerow(["=== ORGANIZATIONS BY INDUSTRY ==="])
    writer.writerow(["Industry", "Count", "Percentage"])
    total_by_industry = sum(metrics['by_industry'].values())
    for industry, count in metrics['by_industry'].items():
        pct = (count / total_by_industry * 100) if total_by_industry > 0 else 0
        writer.writerow([industry.replace("_", " ").title(), count, f"{pct:.1f}%"])
    writer.writerow([])
    
    # Revenue by Module
    writer.writerow(["=== REVENUE BY MODULE ==="])
    writer.writerow(["Module", "Active Subscriptions", "Monthly Revenue"])
    for mod in metrics['modules']['revenue_by_module']:
        writer.writerow([mod['name'], mod['active_subscriptions'], f"${mod['monthly_revenue']:.2f}"])
    writer.writerow([])
    
    # Recent Transactions
    writer.writerow(["=== RECENT TRANSACTIONS ==="])
    writer.writerow(["Transaction ID", "User Email", "Amount", "Type", "Date"])
    for tx in metrics['recent_transactions']:
        writer.writerow([
            tx['transaction_id'],
            tx['user_email'],
            f"${tx['amount']:.2f}",
            tx['payment_type'],
            tx['created_at'][:10] if tx.get('created_at') else ""
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=kora_metrics_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@super_admin_router.get("/metrics/export/excel")
async def export_metrics_excel(admin: User = Depends(get_super_admin)):
    """Export dashboard metrics to Excel"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    # Get all metrics data
    metrics = await get_dashboard_metrics(admin)
    
    wb = Workbook()
    
    # === Summary Sheet ===
    ws_summary = wb.active
    ws_summary.title = "Summary"
    
    # Styles
    header_font = Font(bold=True, size=14, color="FFFFFF")
    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    money_font = Font(bold=True, size=16, color="22C55E")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Title
    ws_summary['A1'] = "KORA OS PLATFORM METRICS"
    ws_summary['A1'].font = Font(bold=True, size=18)
    ws_summary['A2'] = f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    
    # KPIs
    row = 4
    ws_summary[f'A{row}'] = "KEY PERFORMANCE INDICATORS"
    ws_summary[f'A{row}'].font = header_font
    ws_summary[f'A{row}'].fill = header_fill
    ws_summary.merge_cells(f'A{row}:C{row}')
    
    kpis = [
        ("MRR", f"${metrics['mrr']['total']:.2f}"),
        ("Total Organizations", metrics['organizations']['total']),
        ("Paying Customers", metrics['organizations']['paying']),
        ("Free Tier", metrics['organizations']['free']),
        ("Conversion Rate", f"{metrics['conversion']['rate']}%"),
        ("Total Users", metrics['users']['total']),
        ("New Orgs (Month)", metrics['organizations']['new_this_month']),
        ("New Users (Month)", metrics['users']['new_this_month']),
    ]
    
    for i, (label, value) in enumerate(kpis):
        ws_summary[f'A{row+1+i}'] = label
        ws_summary[f'B{row+1+i}'] = value
        ws_summary[f'A{row+1+i}'].border = thin_border
        ws_summary[f'B{row+1+i}'].border = thin_border
    
    # Column widths
    ws_summary.column_dimensions['A'].width = 25
    ws_summary.column_dimensions['B'].width = 20
    ws_summary.column_dimensions['C'].width = 15
    
    # === Industry Sheet ===
    ws_industry = wb.create_sheet("By Industry")
    ws_industry['A1'] = "Industry"
    ws_industry['B1'] = "Count"
    ws_industry['C1'] = "Percentage"
    
    for cell in ['A1', 'B1', 'C1']:
        ws_industry[cell].font = Font(bold=True)
        ws_industry[cell].fill = PatternFill(start_color="E5E7EB", end_color="E5E7EB", fill_type="solid")
    
    total_by_industry = sum(metrics['by_industry'].values())
    for i, (industry, count) in enumerate(metrics['by_industry'].items(), start=2):
        pct = (count / total_by_industry * 100) if total_by_industry > 0 else 0
        ws_industry[f'A{i}'] = industry.replace("_", " ").title()
        ws_industry[f'B{i}'] = count
        ws_industry[f'C{i}'] = f"{pct:.1f}%"
    
    ws_industry.column_dimensions['A'].width = 25
    ws_industry.column_dimensions['B'].width = 10
    ws_industry.column_dimensions['C'].width = 12
    
    # === Modules Sheet ===
    ws_modules = wb.create_sheet("Revenue by Module")
    ws_modules['A1'] = "Module"
    ws_modules['B1'] = "Subscriptions"
    ws_modules['C1'] = "Monthly Revenue"
    
    for cell in ['A1', 'B1', 'C1']:
        ws_modules[cell].font = Font(bold=True)
        ws_modules[cell].fill = PatternFill(start_color="E5E7EB", end_color="E5E7EB", fill_type="solid")
    
    for i, mod in enumerate(metrics['modules']['revenue_by_module'], start=2):
        ws_modules[f'A{i}'] = mod['name']
        ws_modules[f'B{i}'] = mod['active_subscriptions']
        ws_modules[f'C{i}'] = f"${mod['monthly_revenue']:.2f}"
    
    ws_modules.column_dimensions['A'].width = 25
    ws_modules.column_dimensions['B'].width = 15
    ws_modules.column_dimensions['C'].width = 15
    
    # === Transactions Sheet ===
    ws_tx = wb.create_sheet("Transactions")
    ws_tx['A1'] = "Transaction ID"
    ws_tx['B1'] = "User Email"
    ws_tx['C1'] = "Amount"
    ws_tx['D1'] = "Type"
    ws_tx['E1'] = "Date"
    
    for cell in ['A1', 'B1', 'C1', 'D1', 'E1']:
        ws_tx[cell].font = Font(bold=True)
        ws_tx[cell].fill = PatternFill(start_color="E5E7EB", end_color="E5E7EB", fill_type="solid")
    
    for i, tx in enumerate(metrics['recent_transactions'], start=2):
        ws_tx[f'A{i}'] = tx['transaction_id']
        ws_tx[f'B{i}'] = tx['user_email']
        ws_tx[f'C{i}'] = f"${tx['amount']:.2f}"
        ws_tx[f'D{i}'] = tx['payment_type']
        ws_tx[f'E{i}'] = tx['created_at'][:10] if tx.get('created_at') else ""
    
    ws_tx.column_dimensions['A'].width = 20
    ws_tx.column_dimensions['B'].width = 30
    ws_tx.column_dimensions['C'].width = 12
    ws_tx.column_dimensions['D'].width = 15
    ws_tx.column_dimensions['E'].width = 12
    
    # Save to buffer
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=kora_metrics_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


@super_admin_router.get("/metrics/alerts")
async def get_platform_alerts(admin: User = Depends(get_super_admin)):
    """Get platform health alerts and anomalies"""
    alerts = []
    now = datetime.now(timezone.utc)
    
    # Get current metrics
    metrics = await get_dashboard_metrics(admin)
    
    # === CONVERSION RATE ALERTS ===
    conversion_rate = metrics['conversion']['rate']
    if conversion_rate < 10:
        alerts.append({
            "type": "critical",
            "category": "conversion",
            "title": "Critical: Very Low Conversion Rate",
            "message": f"Conversion rate is only {conversion_rate}%. Target is >20%.",
            "action": "Review pricing, onboarding flow, and module value propositions."
        })
    elif conversion_rate < 20:
        alerts.append({
            "type": "warning",
            "category": "conversion",
            "title": "Warning: Low Conversion Rate",
            "message": f"Conversion rate is {conversion_rate}%. Consider improving.",
            "action": "Analyze where users drop off in the payment flow."
        })
    
    # === MRR ALERTS ===
    mrr = metrics['mrr']['total']
    paying_customers = metrics['organizations']['paying']
    
    if paying_customers > 0:
        avg_revenue_per_customer = mrr / paying_customers
        if avg_revenue_per_customer < 25:
            alerts.append({
                "type": "info",
                "category": "revenue",
                "title": "Low Average Revenue Per Customer",
                "message": f"ARPC is ${avg_revenue_per_customer:.2f}. Most customers have minimal modules.",
                "action": "Consider upselling campaigns or bundle discounts."
            })
    
    # === PENDING PAYMENTS ALERTS ===
    pending = metrics['conversion']['pending_transactions']
    if pending > 5:
        alerts.append({
            "type": "warning",
            "category": "payments",
            "title": "Multiple Pending Payments",
            "message": f"{pending} payments are still pending.",
            "action": "Check for payment processing issues or abandoned checkouts."
        })
    
    # === INDUSTRY DISTRIBUTION ALERTS ===
    not_set = metrics['by_industry'].get('not_set', 0)
    total_orgs = metrics['organizations']['total']
    if total_orgs > 0 and not_set / total_orgs > 0.5:
        alerts.append({
            "type": "warning",
            "category": "data_quality",
            "title": "Many Organizations Without Industry",
            "message": f"{not_set} of {total_orgs} organizations ({not_set/total_orgs*100:.0f}%) have no industry set.",
            "action": "Consider requiring industry selection during registration."
        })
    
    # === MODULE ADOPTION ALERTS ===
    modules_data = metrics['modules']['revenue_by_module']
    if modules_data:
        # Check for modules with 0 revenue
        zero_revenue_modules = [m for m in modules_data if m['monthly_revenue'] == 0 and m['active_subscriptions'] > 0]
        if zero_revenue_modules:
            alerts.append({
                "type": "info",
                "category": "modules",
                "title": "Modules with No Revenue",
                "message": f"{len(zero_revenue_modules)} module(s) have subscriptions but $0 revenue (possibly admin-granted).",
                "action": "Review if these should be paid or promotional."
            })
    
    # === GROWTH ALERTS ===
    new_this_month = metrics['organizations']['new_this_month']
    if new_this_month == 0:
        alerts.append({
            "type": "warning",
            "category": "growth",
            "title": "No New Organizations This Month",
            "message": "No new organizations have registered this month.",
            "action": "Review marketing efforts and acquisition channels."
        })
    
    # === RECENTLY CANCELED MODULES ===
    week_ago = now - timedelta(days=7)
    canceled_count = await db.organization_addons.count_documents({
        "status": "canceled",
        "canceled_at": {"$gte": week_ago.isoformat()}
    })
    
    if canceled_count > 0:
        alerts.append({
            "type": "warning",
            "category": "churn",
            "title": f"{canceled_count} Module Cancellation(s) This Week",
            "message": f"{canceled_count} module subscriptions were canceled in the last 7 days.",
            "action": "Reach out to understand reasons for cancellation."
        })
    
    # Sort by type priority
    type_priority = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda x: type_priority.get(x['type'], 3))
    
    return {
        "alerts": alerts,
        "total_alerts": len(alerts),
        "critical_count": len([a for a in alerts if a['type'] == 'critical']),
        "warning_count": len([a for a in alerts if a['type'] == 'warning']),
        "info_count": len([a for a in alerts if a['type'] == 'info']),
        "checked_at": now.isoformat()
    }


# ---- Super Admin: Make User Super Admin (bootstrap) ----

@super_admin_router.post("/grant-super-admin/{user_email}")
async def grant_super_admin(user_email: str, admin: User = Depends(get_super_admin)):
    """Grant super admin privileges to a user (requires existing super admin)"""
    user = await db.users.find_one({"email": user_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"email": user_email},
        {"$set": {"is_super_admin": True}}
    )
    
    await log_super_admin_action(admin.user_id, "grant_super_admin", None, {"target_email": user_email})
    
    return {"success": True, "email": user_email}

# Bootstrap route - only works if no super admins exist
@super_admin_router.post("/bootstrap")
async def bootstrap_super_admin(user: User = Depends(get_current_user)):
    """Bootstrap first super admin (only works if no super admins exist)"""
    existing_super_admin = await db.users.find_one({"is_super_admin": True})
    if existing_super_admin:
        raise HTTPException(status_code=403, detail="Super admin already exists")
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"is_super_admin": True}}
    )
    
    return {"success": True, "message": "You are now a super admin"}

# ============== SUPER ADMIN CRM (Platform Sales Pipeline) ==============
# This is for EVOKE's own sales team - NOT tenant data access
# Tracks companies interested in becoming Evoke OS tenants

class PlatformProspect(BaseModel):
    company_name: str
    contact_name: str
    email: str
    phone: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None  # 1-10, 11-50, 51-200, 200+
    source: str = "website"  # website, referral, outbound, event, partner
    status: str = "new"  # new, contacted, qualified, demo, proposal, negotiation, won, lost
    notes: Optional[str] = None
    estimated_mrr: Optional[float] = None
    next_follow_up: Optional[str] = None
    assigned_to: Optional[str] = None
    interest_level: Optional[str] = None  # hot, warm, cold
    plan_interest: Optional[str] = None  # starter, professional, enterprise

class PlatformProspectUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    estimated_mrr: Optional[float] = None
    next_follow_up: Optional[str] = None
    assigned_to: Optional[str] = None
    interest_level: Optional[str] = None
    plan_interest: Optional[str] = None

@super_admin_router.get("/crm/prospects")
async def get_platform_prospects(
    status: str = None,
    source: str = None,
    assigned_to: str = None,
    search: str = None,
    admin: User = Depends(get_super_admin)
):
    """Get platform sales prospects (companies interested in becoming tenants)"""
    query = {}
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if assigned_to:
        query["assigned_to"] = assigned_to
    if search:
        query["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"contact_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    prospects = await db.platform_prospects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Stats
    total = await db.platform_prospects.count_documents({})
    pipeline_stats = await db.platform_prospects.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(20)
    by_status = {r["_id"]: r["count"] for r in pipeline_stats if r["_id"]}
    
    source_stats = await db.platform_prospects.aggregate([
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}
    ]).to_list(20)
    by_source = {r["_id"]: r["count"] for r in source_stats if r["_id"]}
    
    # Calculate potential MRR
    potential_mrr = sum(p.get("estimated_mrr", 0) or 0 for p in prospects if p.get("status") not in ["lost", "won"])
    
    return {
        "prospects": prospects,
        "stats": {
            "total": total,
            "by_status": by_status,
            "by_source": by_source,
            "potential_mrr": round(potential_mrr, 2)
        }
    }

@super_admin_router.post("/crm/prospects")
async def create_platform_prospect(data: PlatformProspect, admin: User = Depends(get_super_admin)):
    """Create a new platform sales prospect"""
    now = datetime.now(timezone.utc)
    prospect = {
        "prospect_id": f"prospect_{uuid.uuid4().hex[:12]}",
        "company_name": data.company_name,
        "contact_name": data.contact_name,
        "email": data.email,
        "phone": data.phone,
        "industry": data.industry,
        "company_size": data.company_size,
        "source": data.source,
        "status": data.status,
        "notes": data.notes,
        "estimated_mrr": data.estimated_mrr,
        "next_follow_up": data.next_follow_up,
        "assigned_to": data.assigned_to or admin.user_id,
        "interest_level": data.interest_level,
        "plan_interest": data.plan_interest,
        "created_by": admin.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.platform_prospects.insert_one(prospect)
    if "_id" in prospect:
        del prospect["_id"]
    return prospect

@super_admin_router.get("/crm/prospects/{prospect_id}")
async def get_platform_prospect(prospect_id: str, admin: User = Depends(get_super_admin)):
    """Get a specific platform prospect with activity history"""
    prospect = await db.platform_prospects.find_one({"prospect_id": prospect_id}, {"_id": 0})
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    # Get activity logs
    logs = await db.platform_prospect_logs.find(
        {"prospect_id": prospect_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"prospect": prospect, "logs": logs}

@super_admin_router.put("/crm/prospects/{prospect_id}")
async def update_platform_prospect(prospect_id: str, data: PlatformProspectUpdate, admin: User = Depends(get_super_admin)):
    """Update a platform prospect"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.platform_prospects.update_one(
        {"prospect_id": prospect_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    return {"success": True}

@super_admin_router.post("/crm/prospects/{prospect_id}/activity")
async def add_prospect_activity(prospect_id: str, data: dict, admin: User = Depends(get_super_admin)):
    """Add activity log to a prospect"""
    prospect = await db.platform_prospects.find_one({"prospect_id": prospect_id})
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    now = datetime.now(timezone.utc)
    log = {
        "log_id": f"plog_{uuid.uuid4().hex[:12]}",
        "prospect_id": prospect_id,
        "type": data.get("type", "note"),  # call, email, meeting, demo, note
        "content": data.get("content", ""),
        "created_by": admin.user_id,
        "created_at": now.isoformat()
    }
    await db.platform_prospect_logs.insert_one(log)
    
    # Update prospect's updated_at
    await db.platform_prospects.update_one(
        {"prospect_id": prospect_id},
        {"$set": {"updated_at": now.isoformat()}}
    )
    
    return {"success": True, "log_id": log["log_id"]}

@super_admin_router.delete("/crm/prospects/{prospect_id}")
async def delete_platform_prospect(prospect_id: str, admin: User = Depends(get_super_admin)):
    """Delete a platform prospect"""
    result = await db.platform_prospects.delete_one({"prospect_id": prospect_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Prospect not found")
    
    await db.platform_prospect_logs.delete_many({"prospect_id": prospect_id})
    return {"success": True}

@super_admin_router.get("/crm/follow-ups")
async def get_prospect_follow_ups(admin: User = Depends(get_super_admin)):
    """Get prospects with pending follow-ups"""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    prospects = await db.platform_prospects.find(
        {"next_follow_up": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(500)
    
    overdue = []
    today_list = []
    upcoming = []
    
    for prospect in prospects:
        follow_up = prospect.get("next_follow_up", "")
        if follow_up:
            if follow_up < today:
                overdue.append(prospect)
            elif follow_up == today:
                today_list.append(prospect)
            else:
                upcoming.append(prospect)
    
    return {
        "overdue": overdue,
        "today": today_list,
        "upcoming": upcoming[:10]
    }

@super_admin_router.get("/crm/stats")
async def get_platform_crm_stats(admin: User = Depends(get_super_admin)):
    """Get platform CRM statistics"""
    total = await db.platform_prospects.count_documents({})
    
    # By status
    pipeline_status = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "mrr": {"$sum": {"$ifNull": ["$estimated_mrr", 0]}}}}
    ]
    status_results = await db.platform_prospects.aggregate(pipeline_status).to_list(20)
    by_status = {r["_id"]: {"count": r["count"], "mrr": r["mrr"]} for r in status_results if r["_id"]}
    
    # Conversion metrics
    won = await db.platform_prospects.count_documents({"status": "won"})
    lost = await db.platform_prospects.count_documents({"status": "lost"})
    closed = won + lost
    win_rate = (won / closed * 100) if closed > 0 else 0
    
    # Pipeline value
    pipeline_value = await db.platform_prospects.aggregate([
        {"$match": {"status": {"$nin": ["won", "lost"]}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$estimated_mrr", 0]}}}}
    ]).to_list(1)
    total_pipeline = pipeline_value[0]["total"] if pipeline_value else 0
    
    return {
        "total": total,
        "by_status": by_status,
        "win_rate": round(win_rate, 2),
        "pipeline_value": round(total_pipeline, 2),
        "won_this_month": won,
        "lost_this_month": lost
    }

# ============== SUPER ADMIN BUSINESS INTELLIGENCE ==============

@super_admin_router.get("/bi/overview")
async def get_bi_overview(admin: User = Depends(get_super_admin)):
    """Get business intelligence overview with new pricing model"""
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    
    # Get pricing config
    pricing = await db.pricing_config.find_one({"active": True}, {"_id": 0})
    kora_core_price = pricing.get("kora_core_price", 69) if pricing else 69
    module_prices = pricing.get("module_prices", {
        "module_event_suite": 39,
        "module_culinary_intelligence": 29,
        "module_operations_supplies": 19,
        "module_demand_studio": 39
    }) if pricing else {}
    
    # Total organizations
    total_orgs = await db.companies.count_documents({})
    
    # Get organization configs to count modules
    org_configs = await db.organization_configs.find({}, {"_id": 0, "enabled_modules": 1, "company_id": 1}).to_list(1000)
    
    # Count subscriptions by status
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    trialing_subs = await db.subscriptions.count_documents({"status": "trialing"})
    
    # Count module usage
    module_counts = {
        "module_event_suite": 0,
        "module_culinary_intelligence": 0,
        "module_operations_supplies": 0,
        "module_demand_studio": 0
    }
    
    for config in org_configs:
        modules = config.get("enabled_modules", [])
        for mod in modules:
            if mod in module_counts:
                module_counts[mod] += 1
            # Handle old module names mapping to new
            if mod == "module_event_orchestration" or mod == "module_venues":
                module_counts["module_event_suite"] += 1
    
    # Calculate MRR based on new model
    # Kora Core ($69) × paying customers + Add-on modules
    paying_customers = active_subs
    mrr_core = paying_customers * kora_core_price
    mrr_addons = sum(module_counts[mod] * module_prices.get(mod, 0) for mod in module_counts)
    mrr = mrr_core + mrr_addons
    arr = mrr * 12
    
    # Subscription transactions this month
    month_start = f"{current_month}-01"
    transactions = await db.subscription_transactions.find(
        {"payment_status": "paid", "created_at": {"$gte": month_start}},
        {"_id": 0, "amount": 1}
    ).to_list(1000)
    
    revenue_this_month = sum(t.get("amount", 0) for t in transactions)
    
    # Churn - canceled this month
    canceled = await db.subscriptions.count_documents({
        "status": "canceled",
        "canceled_at": {"$gte": month_start}
    })
    
    return {
        "mrr": round(mrr, 2),
        "arr": round(arr, 2),
        "revenue_this_month": round(revenue_this_month, 2),
        "paying_customers": paying_customers,
        "trialing_customers": trialing_subs,
        "total_organizations": total_orgs,
        "churned_this_month": canceled,
        "period": current_month,
        # Module counts
        "module_event_suite": module_counts["module_event_suite"],
        "module_culinary_intelligence": module_counts["module_culinary_intelligence"],
        "module_operations_supplies": module_counts["module_operations_supplies"],
        "module_demand_studio": module_counts["module_demand_studio"],
        # Pricing for reference
        "kora_core_price": kora_core_price,
        "module_prices": module_prices
    }

@super_admin_router.get("/bi/payments")
async def get_bi_payments(
    period: str = None,
    admin: User = Depends(get_super_admin)
):
    """Get payment transactions for BI"""
    now = datetime.now(timezone.utc)
    if not period:
        period = now.strftime("%Y-%m")
    
    # Subscription payments
    sub_transactions = await db.subscription_transactions.find(
        {"created_at": {"$regex": f"^{period}"}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Aggregate by status
    by_status = {"paid": 0, "initiated": 0, "failed": 0, "expired": 0}
    total_revenue = 0
    
    for txn in sub_transactions:
        status = txn.get("payment_status", "initiated")
        if status in by_status:
            by_status[status] += 1
        if status == "paid":
            total_revenue += txn.get("amount", 0)
    
    return {
        "transactions": sub_transactions,
        "summary": {
            "total_transactions": len(sub_transactions),
            "by_status": by_status,
            "total_revenue": round(total_revenue, 2)
        },
        "period": period
    }

@super_admin_router.get("/bi/supplier-invoices")
async def get_bi_supplier_invoices(
    period: str = None,
    admin: User = Depends(get_super_admin)
):
    """Get supplier invoices across all organizations"""
    now = datetime.now(timezone.utc)
    if not period:
        period = now.strftime("%Y-%m")
    
    # Get all invoices for the period (across all orgs)
    invoices = await db.invoices.find(
        {"created_at": {"$regex": f"^{period}"}},
        {"_id": 0, "invoice_id": 1, "company_id": 1, "total": 1, "status": 1, "supplier_name": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(1000)
    
    # Also check purchase_orders_full
    pos = await db.purchase_orders_full.find(
        {"created_at": {"$regex": f"^{period}"}},
        {"_id": 0, "po_number": 1, "company_id": 1, "total": 1, "status": 1, "supplier_name": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(1000)
    
    # Aggregate
    total_invoiced = sum(inv.get("total", 0) for inv in invoices)
    total_pos = sum(po.get("total", 0) for po in pos)
    
    # By status
    invoice_by_status = {}
    for inv in invoices:
        status = inv.get("status", "pending")
        invoice_by_status[status] = invoice_by_status.get(status, 0) + 1
    
    po_by_status = {}
    for po in pos:
        status = po.get("status", "Draft")
        po_by_status[status] = po_by_status.get(status, 0) + 1
    
    return {
        "invoices": invoices[:100],
        "purchase_orders": pos[:100],
        "summary": {
            "total_invoiced": round(total_invoiced, 2),
            "total_pos": round(total_pos, 2),
            "invoice_count": len(invoices),
            "po_count": len(pos),
            "invoices_by_status": invoice_by_status,
            "pos_by_status": po_by_status
        },
        "period": period
    }

@super_admin_router.get("/bi/abc-analysis")
async def get_bi_abc_analysis(admin: User = Depends(get_super_admin)):
    """ABC Analysis - Classify organizations by value"""
    # Get all organizations with their subscription data
    orgs = await db.companies.find({}, {"_id": 0, "company_id": 1, "name": 1, "created_at": 1}).to_list(1000)
    
    plans_cache = {}
    async for plan in db.plans.find({}, {"_id": 0}):
        plans_cache[plan["plan_id"]] = plan
    
    org_values = []
    
    for org in orgs:
        company_id = org["company_id"]
        
        # Get subscription
        sub = await db.subscriptions.find_one({"company_id": company_id}, {"_id": 0})
        
        # Calculate value (annual revenue)
        annual_value = 0
        plan_name = "Starter"
        if sub:
            plan = plans_cache.get(sub.get("plan_id"), {})
            plan_name = plan.get("display_name_es", "Starter")
            if sub.get("billing_cycle") == "yearly":
                annual_value = plan.get("price_yearly", 0)
            else:
                annual_value = plan.get("price_monthly", 0) * 12
        
        # Count events created
        events_count = await db.events.count_documents({"company_id": company_id})
        
        # Count users
        users_count = await db.memberships.count_documents({"company_id": company_id, "status": "active"})
        if users_count == 0:
            users_count = await db.users.count_documents({"company_id": company_id})
        
        org_values.append({
            "company_id": company_id,
            "name": org.get("name", "Unknown"),
            "plan": plan_name,
            "annual_value": annual_value,
            "events_count": events_count,
            "users_count": users_count,
            "created_at": org.get("created_at")
        })
    
    # Sort by annual value (descending)
    org_values.sort(key=lambda x: x["annual_value"], reverse=True)
    
    # Calculate cumulative percentage and assign ABC
    total_value = sum(o["annual_value"] for o in org_values) or 1
    cumulative = 0
    
    for org in org_values:
        cumulative += org["annual_value"]
        percentage = (cumulative / total_value) * 100
        
        if percentage <= 80:
            org["abc_class"] = "A"
        elif percentage <= 95:
            org["abc_class"] = "B"
        else:
            org["abc_class"] = "C"
        
        org["cumulative_percentage"] = round(percentage, 2)
    
    # Summary
    a_count = sum(1 for o in org_values if o["abc_class"] == "A")
    b_count = sum(1 for o in org_values if o["abc_class"] == "B")
    c_count = sum(1 for o in org_values if o["abc_class"] == "C")
    
    a_value = sum(o["annual_value"] for o in org_values if o["abc_class"] == "A")
    b_value = sum(o["annual_value"] for o in org_values if o["abc_class"] == "B")
    c_value = sum(o["annual_value"] for o in org_values if o["abc_class"] == "C")
    
    return {
        "organizations": org_values,
        "summary": {
            "total_organizations": len(org_values),
            "total_annual_value": round(total_value, 2),
            "classes": {
                "A": {"count": a_count, "value": round(a_value, 2), "description": "Top 80% of revenue"},
                "B": {"count": b_count, "value": round(b_value, 2), "description": "Next 15% of revenue"},
                "C": {"count": c_count, "value": round(c_value, 2), "description": "Bottom 5% of revenue"}
            }
        }
    }

@super_admin_router.get("/bi/revenue-trend")
async def get_bi_revenue_trend(months: int = 6, admin: User = Depends(get_super_admin)):
    """Get revenue trend over past months"""
    now = datetime.now(timezone.utc)
    trends = []
    
    for i in range(months - 1, -1, -1):
        # Calculate month
        month_date = now - timedelta(days=30 * i)
        period = month_date.strftime("%Y-%m")
        
        # Get transactions for that month
        transactions = await db.subscription_transactions.find(
            {"payment_status": "paid", "created_at": {"$regex": f"^{period}"}},
            {"_id": 0, "amount": 1}
        ).to_list(1000)
        
        revenue = sum(t.get("amount", 0) for t in transactions)
        
        # Count new orgs that month
        new_orgs = await db.companies.count_documents({
            "created_at": {"$regex": f"^{period}"}
        })
        
        trends.append({
            "period": period,
            "revenue": round(revenue, 2),
            "new_organizations": new_orgs,
            "transactions": len(transactions)
        })
    
    return {"trends": trends}

# ============== SUPER ADMIN: PLATFORM FIXED COSTS (Expense Management) ==============

class PlatformFixedCostCreate(BaseModel):
    """Platform operational expense"""
    name: str
    amount: float
    category: str = "infrastructure"  # infrastructure, payments, marketing, personnel, other
    frequency: str = "monthly"  # monthly, yearly
    notes: Optional[str] = None

class PlatformFixedCostUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    frequency: Optional[str] = None
    notes: Optional[str] = None

@super_admin_router.get("/clarity/fixed-costs")
async def get_platform_fixed_costs(admin: User = Depends(get_super_admin)):
    """Get all platform fixed costs/expenses"""
    costs = await db.platform_expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Calculate totals
    monthly_total = sum(
        c["amount"] if c.get("frequency") == "monthly" else c["amount"] / 12 
        for c in costs
    )
    yearly_total = sum(
        c["amount"] * 12 if c.get("frequency") == "monthly" else c["amount"] 
        for c in costs
    )
    
    # By category
    by_category = {}
    for cost in costs:
        cat = cost.get("category", "other")
        monthly_amt = cost["amount"] if cost.get("frequency") == "monthly" else cost["amount"] / 12
        by_category[cat] = by_category.get(cat, 0) + monthly_amt
    
    return {
        "costs": costs,
        "summary": {
            "total_monthly": round(monthly_total, 2),
            "total_yearly": round(yearly_total, 2),
            "count": len(costs),
            "by_category": {k: round(v, 2) for k, v in by_category.items()}
        }
    }

@super_admin_router.post("/clarity/fixed-costs")
async def create_platform_fixed_cost(data: PlatformFixedCostCreate, admin: User = Depends(get_super_admin)):
    """Create a new platform fixed cost/expense"""
    now = datetime.now(timezone.utc)
    cost = {
        "cost_id": f"pcost_{uuid.uuid4().hex[:12]}",
        "name": data.name,
        "amount": data.amount,
        "category": data.category,
        "frequency": data.frequency,
        "notes": data.notes,
        "created_by": admin.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.platform_expenses.insert_one(cost)
    del cost["_id"]
    return cost

@super_admin_router.put("/clarity/fixed-costs/{cost_id}")
async def update_platform_fixed_cost(cost_id: str, data: PlatformFixedCostUpdate, admin: User = Depends(get_super_admin)):
    """Update a platform fixed cost"""
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.platform_expenses.update_one(
        {"cost_id": cost_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cost not found")
    
    updated = await db.platform_expenses.find_one({"cost_id": cost_id}, {"_id": 0})
    return updated

@super_admin_router.delete("/clarity/fixed-costs/{cost_id}")
async def delete_platform_fixed_cost(cost_id: str, admin: User = Depends(get_super_admin)):
    """Delete a platform fixed cost"""
    result = await db.platform_expenses.delete_one({"cost_id": cost_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cost not found")
    return {"success": True, "deleted": cost_id}

# ============== IMPORT/EXPORT ENDPOINTS ==============

import_export_router = APIRouter(prefix="/import-export", tags=["Import/Export"])

# --- EXPORT ENDPOINTS ---

@import_export_router.get("/clients/export")
async def export_clients(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export clients to CSV or Excel"""
    clients = await db.clients.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not clients:
        clients = []
    
    # Prepare data for export
    export_data = []
    for c in clients:
        export_data.append({
            "nombre": c.get("display_name") or c.get("name", ""),
            "email": c.get("email", ""),
            "telefono": c.get("phone", ""),
            "empresa": c.get("company", ""),
            "tipo": c.get("client_type") or c.get("type", "Individual"),
            "direccion": c.get("address", ""),
            "pagina_web": c.get("website", ""),
            "industria": c.get("industry", ""),
            "descripcion": c.get("description", ""),
            "linkedin": c.get("social_linkedin", ""),
            "instagram": c.get("social_instagram", ""),
            "notas": c.get("notes", ""),
            "etiquetas": ", ".join(c.get("tags", [])) if c.get("tags") else ""
        })
    
    df = pd.DataFrame(export_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Clientes')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=clientes.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=clientes.csv"}
        )

@import_export_router.get("/inventory/export")
async def export_inventory(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export inventory/ingredients to CSV or Excel"""
    items = await db.ingredients.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not items:
        items = []
    
    export_data = []
    for i in items:
        export_data.append({
            "nombre": i.get("name", ""),
            "categoria": i.get("category", ""),
            "unidad": i.get("unit", ""),
            "costo_por_unidad": i.get("cost_per_unit", 0),
            "stock_actual": i.get("stock_quantity", 0),
            "stock_minimo": i.get("min_stock", 0),
            "proveedor": i.get("supplier", ""),
            "ubicacion": i.get("location", ""),
            "notas": i.get("notes", "")
        })
    
    df = pd.DataFrame(export_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Inventario')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=inventario.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=inventario.csv"}
        )

@import_export_router.get("/recipes/export")
async def export_recipes(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export recipes to CSV or Excel"""
    recipes = await db.recipes.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not recipes:
        recipes = []
    
    export_data = []
    for r in recipes:
        # Format ingredients as string
        ingredients_str = ""
        for ing in r.get("ingredients", []):
            ingredients_str += f"{ing.get('name', '')}: {ing.get('quantity', '')} {ing.get('unit', '')}; "
        
        export_data.append({
            "nombre": r.get("name", ""),
            "categoria": r.get("category", ""),
            "porciones": r.get("servings", 1),
            "tiempo_preparacion": r.get("prep_time", ""),
            "costo_total": r.get("total_cost", 0),
            "ingredientes": ingredients_str.strip("; "),
            "instrucciones": r.get("instructions", ""),
            "notas": r.get("notes", "")
        })
    
    df = pd.DataFrame(export_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Recetas')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=recetas.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=recetas.csv"}
        )

# --- IMPORT ENDPOINTS ---

@import_export_router.post("/clients/import")
async def import_clients(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Import clients from CSV or Excel"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        
        # Normalize column names
        df.columns = df.columns.str.lower().str.strip()
        
        imported = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Map columns (support both Spanish and English)
                name = row.get('nombre') or row.get('name') or ""
                email = row.get('email') or ""
                phone = str(row.get('telefono') or row.get('phone') or "")
                company = row.get('empresa') or row.get('company') or ""
                
                if not name and not email:
                    errors.append(f"Fila {idx+2}: Nombre o email requerido")
                    continue
                
                # Check if client exists
                existing = await db.clients.find_one({
                    "company_id": user.company_id,
                    "$or": [
                        {"email": email} if email else {"email": ""},
                        {"name": name, "phone": phone}
                    ]
                })
                
                if existing:
                    # Update existing
                    await db.clients.update_one(
                        {"client_id": existing["client_id"]},
                        {"$set": {
                            "name": name or existing.get("name"),
                            "display_name": name or existing.get("display_name"),
                            "email": email or existing.get("email"),
                            "phone": phone or existing.get("phone"),
                            "company": company or existing.get("company"),
                            "address": row.get('direccion') or row.get('address') or existing.get("address", ""),
                            "website": row.get('pagina_web') or row.get('website') or existing.get("website", ""),
                            "industry": row.get('industria') or row.get('industry') or existing.get("industry", ""),
                            "description": row.get('descripcion') or row.get('description') or existing.get("description", ""),
                            "social_linkedin": row.get('linkedin') or existing.get("social_linkedin", ""),
                            "social_instagram": row.get('instagram') or existing.get("social_instagram", ""),
                            "notes": row.get('notas') or row.get('notes') or existing.get("notes", ""),
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                else:
                    # Create new
                    await db.clients.insert_one({
                        "client_id": f"client_{uuid.uuid4().hex[:12]}",
                        "company_id": user.company_id,
                        "name": name,
                        "display_name": name,
                        "email": email,
                        "phone": phone,
                        "company": company,
                        "type": row.get('tipo') or row.get('type') or "individual",
                        "client_type": row.get('tipo') or row.get('type') or "Individual",
                        "address": row.get('direccion') or row.get('address') or "",
                        "website": row.get('pagina_web') or row.get('website') or "",
                        "industry": row.get('industria') or row.get('industry') or "",
                        "description": row.get('descripcion') or row.get('description') or "",
                        "social_linkedin": row.get('linkedin') or "",
                        "social_instagram": row.get('instagram') or "",
                        "notes": row.get('notas') or row.get('notes') or "",
                        "tags": [],
                        "status": "Active",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                
                imported += 1
            except Exception as e:
                errors.append(f"Fila {idx+2}: {str(e)}")
        
        return {
            "success": True,
            "imported": imported,
            "errors": errors[:10] if errors else []
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar archivo: {str(e)}")

@import_export_router.post("/inventory/import")
async def import_inventory(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Import inventory/ingredients from CSV or Excel"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        
        df.columns = df.columns.str.lower().str.strip()
        
        imported = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                name = row.get('nombre') or row.get('name') or ""
                
                if not name:
                    errors.append(f"Fila {idx+2}: Nombre requerido")
                    continue
                
                # Check if ingredient exists
                existing = await db.ingredients.find_one({
                    "company_id": user.company_id,
                    "name": {"$regex": f"^{name}$", "$options": "i"}
                })
                
                cost = row.get('costo_por_unidad') or row.get('cost_per_unit') or row.get('costo') or 0
                stock = row.get('stock_actual') or row.get('stock_quantity') or row.get('stock') or 0

                # Handle NaN values
                if pd.isna(cost): cost = 0
                if pd.isna(stock): stock = 0

                # PASE A: incoming CSV "costo_por_unidad" is treated as
                # purchase_cost (price per pack). purchase_quantity_per_unit
                # defaults to 1 with purchase_unit = unit, which is the
                # degenerate-but-safe case (per-unit pricing). Ingredients
                # that need a real base-unit breakdown must be edited after
                # import; they'll show `purchase_incomplete=true` if the
                # unit is a container and no qty/base was provided.
                _pu = row.get('unidad') or row.get('unit') or "unidad"
                _bu = _pu  # importer keeps unit and base_unit aligned by default
                data = {
                    "name": name,
                    "category": row.get('categoria') or row.get('category') or "General",
                    "unit": _pu,
                    "base_unit": _bu,
                    "purchase_unit": _pu,
                    "purchase_quantity_per_unit": 1.0,
                    "purchase_cost": float(cost),
                    "cost_per_unit": float(cost),           # derived, matches purchase_cost
                    "cost_per_base_unit": float(cost),      # derived, qty=1
                    "purchase_incomplete": False,
                    "stock_quantity": float(stock),
                    "min_stock": float(row.get('stock_minimo') or row.get('min_stock') or 0) if not pd.isna(row.get('stock_minimo') or row.get('min_stock') or 0) else 0,
                    "supplier": row.get('proveedor') or row.get('supplier') or "",
                    "location": row.get('ubicacion') or row.get('location') or "",
                    "notes": row.get('notas') or row.get('notes') or "",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                if existing:
                    await db.ingredients.update_one(
                        {"ingredient_id": existing["ingredient_id"]},
                        {"$set": data}
                    )
                else:
                    data["ingredient_id"] = f"ing_{uuid.uuid4().hex[:12]}"
                    data["company_id"] = user.company_id
                    data["created_at"] = datetime.now(timezone.utc).isoformat()
                    await db.ingredients.insert_one(data)
                
                imported += 1
            except Exception as e:
                errors.append(f"Fila {idx+2}: {str(e)}")
        
        return {
            "success": True,
            "imported": imported,
            "errors": errors[:10] if errors else []
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar archivo: {str(e)}")

@import_export_router.post("/recipes/import")
async def import_recipes(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Import recipes from CSV or Excel"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        
        df.columns = df.columns.str.lower().str.strip()
        
        imported = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                name = row.get('nombre') or row.get('name') or ""
                
                if not name:
                    errors.append(f"Fila {idx+2}: Nombre requerido")
                    continue
                
                # Check if recipe exists
                existing = await db.recipes.find_one({
                    "company_id": user.company_id,
                    "name": {"$regex": f"^{name}$", "$options": "i"}
                })
                
                # Parse ingredients string (format: "ingrediente1: cantidad unidad; ingrediente2: cantidad unidad")
                ingredients = []
                ingredients_str = row.get('ingredientes') or row.get('ingredients') or ""
                if ingredients_str and not pd.isna(ingredients_str):
                    for ing_str in str(ingredients_str).split(";"):
                        ing_str = ing_str.strip()
                        if ":" in ing_str:
                            parts = ing_str.split(":")
                            ing_name = parts[0].strip()
                            qty_unit = parts[1].strip().split() if len(parts) > 1 else ["1", "unidad"]
                            ingredients.append({
                                "name": ing_name,
                                "quantity": float(qty_unit[0]) if qty_unit else 1,
                                "unit": qty_unit[1] if len(qty_unit) > 1 else "unidad"
                            })
                
                servings = row.get('porciones') or row.get('servings') or 1
                if pd.isna(servings): servings = 1
                
                data = {
                    "name": name,
                    "category": row.get('categoria') or row.get('category') or "General",
                    "servings": int(servings),
                    "prep_time": row.get('tiempo_preparacion') or row.get('prep_time') or "",
                    "instructions": row.get('instrucciones') or row.get('instructions') or "",
                    "notes": row.get('notas') or row.get('notes') or "",
                    "ingredients": ingredients,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                if existing:
                    await db.recipes.update_one(
                        {"recipe_id": existing["recipe_id"]},
                        {"$set": data}
                    )
                else:
                    data["recipe_id"] = f"recipe_{uuid.uuid4().hex[:12]}"
                    data["company_id"] = user.company_id
                    data["created_at"] = datetime.now(timezone.utc).isoformat()
                    data["total_cost"] = 0
                    await db.recipes.insert_one(data)
                
                imported += 1
            except Exception as e:
                errors.append(f"Fila {idx+2}: {str(e)}")
        
        return {
            "success": True,
            "imported": imported,
            "errors": errors[:10] if errors else []
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar archivo: {str(e)}")

# --- QUOTES/PROPOSALS EXPORT/IMPORT ---

@import_export_router.get("/quotes/export")
async def export_quotes(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export quotes/proposals to CSV or Excel"""
    quotes = await db.quotes.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not quotes:
        quotes = []
    
    export_data = []
    for q in quotes:
        # Get client name
        client = await db.clients.find_one({"client_id": q.get("client_id")}, {"name": 1})
        client_name = client.get("name", "") if client else ""
        
        # Format items
        items_str = ""
        for item in q.get("items", []):
            items_str += f"{item.get('name', '')}: {item.get('quantity', 1)} x ${item.get('unit_price', 0)}; "
        
        export_data.append({
            "numero_cotizacion": q.get("quote_number", ""),
            "cliente": client_name,
            "cliente_id": q.get("client_id", ""),
            "fecha": q.get("date", ""),
            "fecha_evento": q.get("event_date", ""),
            "estado": q.get("status", "draft"),
            "subtotal": q.get("subtotal", 0),
            "impuestos": q.get("tax_amount", 0),
            "total": q.get("total", 0),
            "items": items_str.strip("; "),
            "notas": q.get("notes", ""),
            "terminos": q.get("terms", "")
        })
    
    df = pd.DataFrame(export_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Cotizaciones')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=cotizaciones.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=cotizaciones.csv"}
        )

@import_export_router.post("/quotes/import")
async def import_quotes(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Import quotes from CSV or Excel"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        
        df.columns = df.columns.str.lower().str.strip()
        
        imported = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Find or create client
                client_name = row.get('cliente') or row.get('client') or ""
                client_id = row.get('cliente_id') or row.get('client_id') or ""
                
                if not client_id and client_name:
                    client = await db.clients.find_one({
                        "company_id": user.company_id,
                        "name": {"$regex": f"^{client_name}$", "$options": "i"}
                    })
                    if client:
                        client_id = client["client_id"]
                    else:
                        # Create new client
                        client_id = f"client_{uuid.uuid4().hex[:12]}"
                        await db.clients.insert_one({
                            "client_id": client_id,
                            "company_id": user.company_id,
                            "name": client_name,
                            "email": "",
                            "phone": "",
                            "type": "individual",
                            "created_at": datetime.now(timezone.utc).isoformat()
                        })
                
                if not client_id:
                    errors.append(f"Fila {idx+2}: Cliente requerido")
                    continue
                
                # Parse items (format: "item1: qty x $price; item2: qty x $price")
                items = []
                items_str = row.get('items') or ""
                if items_str and not pd.isna(items_str):
                    for item_str in str(items_str).split(";"):
                        item_str = item_str.strip()
                        if ":" in item_str:
                            parts = item_str.split(":")
                            item_name = parts[0].strip()
                            qty_price = parts[1].strip() if len(parts) > 1 else "1 x $0"
                            
                            # Parse "qty x $price"
                            qty = 1
                            price = 0
                            if "x" in qty_price:
                                qty_part, price_part = qty_price.split("x")
                                qty = float(qty_part.strip()) if qty_part.strip() else 1
                                price = float(price_part.replace("$", "").strip()) if price_part else 0
                            
                            items.append({
                                "name": item_name,
                                "quantity": qty,
                                "unit_price": price,
                                "total": qty * price
                            })
                
                # Calculate totals
                subtotal = sum(item.get("total", 0) for item in items)
                tax_rate = 0.16  # Default 16% tax
                tax_amount = row.get('impuestos') or row.get('tax_amount')
                if pd.isna(tax_amount):
                    tax_amount = subtotal * tax_rate
                total = row.get('total')
                if pd.isna(total):
                    total = subtotal + float(tax_amount)
                
                # Generate quote number
                quote_count = await db.quotes.count_documents({"company_id": user.company_id})
                quote_number = row.get('numero_cotizacion') or row.get('quote_number') or f"COT-{str(quote_count + 1).zfill(4)}"
                
                quote_data = {
                    "quote_id": f"quote_{uuid.uuid4().hex[:12]}",
                    "company_id": user.company_id,
                    "quote_number": str(quote_number),
                    "client_id": client_id,
                    "date": row.get('fecha') or row.get('date') or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "event_date": row.get('fecha_evento') or row.get('event_date') or "",
                    "status": row.get('estado') or row.get('status') or "draft",
                    "items": items,
                    "subtotal": float(subtotal),
                    "tax_amount": float(tax_amount),
                    "total": float(total),
                    "notes": row.get('notas') or row.get('notes') or "",
                    "terms": row.get('terminos') or row.get('terms') or "",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.quotes.insert_one(quote_data)
                imported += 1
                
            except Exception as e:
                errors.append(f"Fila {idx+2}: {str(e)}")
        
        return {
            "success": True,
            "imported": imported,
            "errors": errors[:10] if errors else []
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar archivo: {str(e)}")

# --- LEADS EXPORT/IMPORT ---

@import_export_router.get("/leads/template")
async def download_leads_template(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Download leads import template with correct headers"""
    template_data = [{
        "nombre": "Ejemplo Lead",
        "email": "ejemplo@empresa.com",
        "telefono": "+1 809 555 1234",
        "whatsapp": "+1 809 555 1234",
        "empresa": "Empresa Ejemplo SRL",
        "tipo_cliente": "Company",  # Company o Individual
        "direccion": "Av. Principal #123",
        "ciudad": "Santo Domingo",
        "pais": "República Dominicana",
        "rnc": "123-45678-9",
        "fuente": "import",
        "estado": "New",  # New, Contacted, NoResponse, Engaged, Qualified, Negotiation, Won, Lost
        "outreach_status": "New",  # Para leads de outreach
        "valor_estimado": 50000,
        "rango_presupuesto": "25000-75000",
        "tipo_evento": "Corporativo",
        "fecha_evento": "2026-03-15",
        "num_invitados": 100,
        "tipo_lead": "outreach",  # inbound o outreach
        "notas": "Notas adicionales sobre el lead"
    }]
    
    df = pd.DataFrame(template_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Template')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=leads_template.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=leads_template.csv"}
        )

@import_export_router.get("/leads/export")
async def export_leads(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export leads to CSV or Excel"""
    leads = await db.leads.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not leads:
        leads = []
    
    export_data = []
    for l in leads:
        # Get effective status - prefer outreach_status for outreach leads
        effective_status = l.get("outreach_status") or l.get("status", "New")
        
        export_data.append({
            "nombre": l.get("name") or l.get("lead_name", ""),
            "email": l.get("email", ""),
            "telefono": l.get("phone", ""),
            "whatsapp": l.get("whatsapp", ""),
            "empresa": l.get("company") or l.get("company_name", ""),
            "tipo_cliente": l.get("client_type", "Individual"),
            "direccion": l.get("address", ""),
            "ciudad": l.get("city", ""),
            "pais": l.get("country", ""),
            "rnc": l.get("rnc", ""),
            "fuente": l.get("source", ""),
            "estado": effective_status,
            "outreach_status": l.get("outreach_status", ""),
            "valor_estimado": l.get("estimated_value", 0),
            "rango_presupuesto": l.get("budget_range", ""),
            "tipo_evento": l.get("event_type", ""),
            "fecha_evento": l.get("event_date", ""),
            "num_invitados": l.get("guest_count") or l.get("estimated_guest_count", 0),
            "tipo_lead": l.get("lead_type", "inbound"),
            "notas": l.get("notes") or l.get("message", ""),
            "fecha_creacion": l.get("created_at", "")
        })
    
    df = pd.DataFrame(export_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Leads')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=leads.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=leads.csv"}
        )

@import_export_router.post("/leads/import")
async def import_leads(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    default_lead_type: Optional[str] = None,
    default_source: Optional[str] = None
):
    """Import leads from CSV or Excel - supports both lead format and client format"""
    
    def clean_value(val):
        """Clean pandas NaN values and 'nan' strings"""
        if val is None:
            return ""
        if pd.isna(val):
            return ""
        str_val = str(val).strip()
        if str_val.lower() == "nan" or str_val.lower() == "none" or str_val == "":
            return ""
        return str_val
    
    try:
        content = await file.read()
        
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        
        df.columns = df.columns.str.lower().str.strip()
        
        # Detect if this is a client-format file (has 'tipo' or 'pagina_web' columns but no 'estado' or 'valor_estimado')
        is_client_format = ('tipo' in df.columns or 'pagina_web' in df.columns) and 'estado' not in df.columns and 'valor_estimado' not in df.columns
        
        imported = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Handle both formats for name - clean NaN values
                name = clean_value(row.get('nombre')) or clean_value(row.get('name')) or ""
                email = clean_value(row.get('email')) or ""
                company = clean_value(row.get('empresa')) or clean_value(row.get('company')) or ""
                
                # If no name but has company, use company as name
                if not name and company:
                    name = company
                
                if not name and not email:
                    errors.append(f"Fila {idx+2}: Nombre o email requerido")
                    continue
                
                # Check if lead exists by email
                existing = None
                if email:
                    existing = await db.leads.find_one({
                        "company_id": user.company_id,
                        "email": email
                    })
                
                estimated_value = row.get('valor_estimado') or row.get('estimated_value') or 0
                if pd.isna(estimated_value): estimated_value = 0
                
                guest_count = row.get('num_invitados') or row.get('guest_count') or 0
                if pd.isna(guest_count): guest_count = 0
                
                # Handle 'tipo' column from client format -> lead_type
                lead_type_raw = row.get('tipo_lead') or row.get('lead_type') or row.get('tipo') or ""
                if pd.isna(lead_type_raw) or not str(lead_type_raw).strip():
                    lead_type_raw = default_lead_type or "outreach"
                lead_type = str(lead_type_raw).lower().strip()
                if lead_type not in ["inbound", "outreach"]:
                    lead_type = "outreach" if "outreach" in lead_type.lower() else "outreach"
                
                # Build notes from multiple fields (for client format)
                notes_parts = []
                if row.get('notas') and not pd.isna(row.get('notas')): notes_parts.append(str(row.get('notas')))
                if row.get('descripcion') and not pd.isna(row.get('descripcion')): notes_parts.append(f"Descripción: {row.get('descripcion')}")
                if row.get('industria') and not pd.isna(row.get('industria')): notes_parts.append(f"Industria: {row.get('industria')}")
                if row.get('pagina_web') and not pd.isna(row.get('pagina_web')): notes_parts.append(f"Web: {row.get('pagina_web')}")
                if row.get('linkedin') and not pd.isna(row.get('linkedin')): notes_parts.append(f"LinkedIn: {row.get('linkedin')}")
                if row.get('instagram') and not pd.isna(row.get('instagram')): notes_parts.append(f"Instagram: {row.get('instagram')}")
                combined_notes = " | ".join(notes_parts) if notes_parts else ""
                
                # Handle phone - convert scientific notation to string
                phone_raw = row.get('telefono') or row.get('phone') or ""
                if not pd.isna(phone_raw):
                    if isinstance(phone_raw, float):
                        phone_raw = str(int(phone_raw))
                    phone = str(phone_raw)
                else:
                    phone = ""
                
                # Handle status - normalize to Title case
                raw_status = row.get('estado') or row.get('status') or row.get('outreach_status') or "New"
                if pd.isna(raw_status): raw_status = "New"
                normalized_status = str(raw_status).strip().title()
                
                # Map common status values to CRM statuses
                status_map = {
                    "nuevo": "New", "new": "New",
                    "contactado": "Contacted", "contacted": "Contacted",
                    "sin respuesta": "NoResponse", "noresponse": "NoResponse", "no response": "NoResponse",
                    "interesado": "Engaged", "engaged": "Engaged",
                    "qualified": "Qualified", "calificado": "Qualified",
                    "negotiation": "Negotiation", "negociacion": "Negotiation", "negociación": "Negotiation",
                    "won": "Won", "ganado": "Won",
                    "lost": "Lost", "perdido": "Lost"
                }
                final_status = status_map.get(normalized_status.lower(), normalized_status)
                
                lead_data = {
                    "name": name,
                    "lead_name": name,  # For CRM UI compatibility
                    "email": clean_value(email),
                    "phone": clean_value(phone),
                    "whatsapp": clean_value(row.get('whatsapp')),
                    "company": company,
                    "company_name": company,  # For CRM UI
                    "client_type": clean_value(row.get('tipo_cliente')) or clean_value(row.get('client_type')) or ("Company" if is_client_format else "Individual"),
                    "address": clean_value(row.get('direccion')) or clean_value(row.get('address')),
                    "city": clean_value(row.get('ciudad')) or clean_value(row.get('city')),
                    "country": clean_value(row.get('pais')) or clean_value(row.get('country')) or "República Dominicana",
                    "rnc": clean_value(row.get('rnc')),
                    "source": clean_value(row.get('fuente')) or clean_value(row.get('source')) or default_source or "Outreach",
                    "status": final_status,
                    "estimated_value": float(estimated_value) if estimated_value else 0,
                    "budget_range": clean_value(row.get('rango_presupuesto')) or clean_value(row.get('budget_range')),
                    "event_type": clean_value(row.get('tipo_evento')) or clean_value(row.get('tipo_proyecto')) or clean_value(row.get('event_type')),
                    "event_date": clean_value(row.get('fecha_evento')) or clean_value(row.get('fecha_inicio')) or clean_value(row.get('event_date')),
                    "guest_count": int(guest_count) if guest_count else 0,
                    "estimated_guest_count": int(guest_count) if guest_count else 0,
                    "notes": combined_notes,
                    "message": combined_notes,  # For CRM UI
                    "lead_type": lead_type,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                # For outreach leads, also set outreach_status for compatibility with CRM UI
                if lead_type == "outreach":
                    lead_data["outreach_status"] = final_status
                
                if existing:
                    await db.leads.update_one(
                        {"lead_id": existing["lead_id"]},
                        {"$set": lead_data}
                    )
                else:
                    lead_data["lead_id"] = f"lead_{uuid.uuid4().hex[:12]}"
                    lead_data["company_id"] = user.company_id
                    lead_data["created_at"] = datetime.now(timezone.utc).isoformat()
                    await db.leads.insert_one(lead_data)
                
                # Company deduplication: if company_name exists, ensure it's in company_entities
                if company:
                    existing_company = await db.company_entities.find_one({
                        "organization_id": user.company_id,
                        "name": {"$regex": f"^{company.strip()}$", "$options": "i"}
                    })
                    if not existing_company:
                        await db.company_entities.insert_one({
                            "company_entity_id": f"ent_{uuid.uuid4().hex[:12]}",
                            "entity_id": f"ent_{uuid.uuid4().hex[:12]}",
                            "organization_id": user.company_id,
                            "name": company.strip(),
                            "status": "Lead",
                            "source": lead_data.get("source", "Outreach"),
                            "created_at": datetime.now(timezone.utc).isoformat()
                        })
                
                imported += 1
                
            except Exception as e:
                errors.append(f"Fila {idx+2}: {str(e)}")
        
        return {
            "success": True,
            "imported": imported,
            "errors": errors[:10] if errors else []
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar archivo: {str(e)}")

# --- EVENTS EXPORT/IMPORT ---

@import_export_router.get("/events/export")
async def export_events(
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Export events to CSV or Excel"""
    events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not events:
        events = []
    
    export_data = []
    for e in events:
        # Get client name
        client = await db.clients.find_one({"client_id": e.get("client_id")}, {"name": 1})
        client_name = client.get("name", "") if client else ""
        
        export_data.append({
            "nombre_evento": e.get("name", ""),
            "cliente": client_name,
            "cliente_id": e.get("client_id", ""),
            "fecha_inicio": e.get("start_date", ""),
            "fecha_fin": e.get("end_date", ""),
            "hora_inicio": e.get("start_time", ""),
            "hora_fin": e.get("end_time", ""),
            "ubicacion": e.get("location", ""),
            "tipo_evento": e.get("event_type", ""),
            "num_invitados": e.get("guest_count", 0),
            "estado": e.get("status", ""),
            "presupuesto": e.get("budget", 0),
            "notas": e.get("notes", "")
        })
    
    df = pd.DataFrame(export_data)
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Eventos')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=eventos.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=eventos.csv"}
        )

@import_export_router.post("/events/import")
async def import_events(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Import events from CSV or Excel"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
        
        df.columns = df.columns.str.lower().str.strip()
        
        imported = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                event_name = row.get('nombre_evento') or row.get('event_name') or row.get('nombre') or ""
                
                if not event_name:
                    errors.append(f"Fila {idx+2}: Nombre de evento requerido")
                    continue
                
                # Find or create client
                client_name = row.get('cliente') or row.get('client') or ""
                client_id = row.get('cliente_id') or row.get('client_id') or ""
                
                if not client_id and client_name:
                    client = await db.clients.find_one({
                        "company_id": user.company_id,
                        "name": {"$regex": f"^{client_name}$", "$options": "i"}
                    })
                    if client:
                        client_id = client["client_id"]
                    else:
                        client_id = f"client_{uuid.uuid4().hex[:12]}"
                        await db.clients.insert_one({
                            "client_id": client_id,
                            "company_id": user.company_id,
                            "name": client_name,
                            "email": "",
                            "phone": "",
                            "type": "individual",
                            "created_at": datetime.now(timezone.utc).isoformat()
                        })
                
                guest_count = row.get('num_invitados') or row.get('guest_count') or 0
                if pd.isna(guest_count): guest_count = 0
                
                budget = row.get('presupuesto') or row.get('budget') or 0
                if pd.isna(budget): budget = 0
                
                event_data = {
                    "event_id": f"event_{uuid.uuid4().hex[:12]}",
                    "company_id": user.company_id,
                    "name": event_name,
                    "client_id": client_id,
                    "start_date": str(row.get('fecha_inicio') or row.get('start_date') or ""),
                    "end_date": str(row.get('fecha_fin') or row.get('end_date') or ""),
                    "start_time": str(row.get('hora_inicio') or row.get('start_time') or ""),
                    "end_time": str(row.get('hora_fin') or row.get('end_time') or ""),
                    "location": row.get('ubicacion') or row.get('location') or "",
                    "event_type": row.get('tipo_evento') or row.get('event_type') or "other",
                    "guest_count": int(guest_count),
                    "status": row.get('estado') or row.get('status') or "inquiry",
                    "budget": float(budget),
                    "notes": row.get('notas') or row.get('notes') or "",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.events.insert_one(event_data)
                imported += 1
                
            except Exception as e:
                errors.append(f"Fila {idx+2}: {str(e)}")
        
        return {
            "success": True,
            "imported": imported,
            "errors": errors[:10] if errors else []
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar archivo: {str(e)}")

# --- TEMPLATES ---

# Industry-specific terminology for import/export
INDUSTRY_IMPORT_TERMINOLOGY = {
    "events_hospitality": {
        "main_entity": {"en": "event", "es": "evento"},
        "client": {"en": "client", "es": "cliente"},
        "event_type": {"en": "event_type", "es": "tipo_evento"},
        "event_date": {"en": "event_date", "es": "fecha_evento"},
        "guests": {"en": "guests", "es": "invitados"},
        "booking": {"en": "booking", "es": "reserva"},
    },
    "professional_services": {
        "main_entity": {"en": "project", "es": "proyecto"},
        "client": {"en": "client", "es": "cliente"},
        "event_type": {"en": "project_type", "es": "tipo_proyecto"},
        "event_date": {"en": "start_date", "es": "fecha_inicio"},
        "guests": {"en": "stakeholders", "es": "involucrados"},
        "booking": {"en": "engagement", "es": "compromiso"},
    },
    "healthcare": {
        "main_entity": {"en": "appointment", "es": "cita"},
        "client": {"en": "patient", "es": "paciente"},
        "event_type": {"en": "treatment_type", "es": "tipo_tratamiento"},
        "event_date": {"en": "appointment_date", "es": "fecha_cita"},
        "guests": {"en": "family_members", "es": "familiares"},
        "booking": {"en": "appointment", "es": "cita"},
    },
    "real_estate": {
        "main_entity": {"en": "showing", "es": "visita"},
        "client": {"en": "buyer_seller", "es": "comprador_vendedor"},
        "event_type": {"en": "property_type", "es": "tipo_propiedad"},
        "event_date": {"en": "showing_date", "es": "fecha_visita"},
        "guests": {"en": "viewers", "es": "visitantes"},
        "booking": {"en": "listing", "es": "listado"},
    },
    "education": {
        "main_entity": {"en": "course", "es": "curso"},
        "client": {"en": "student", "es": "estudiante"},
        "event_type": {"en": "course_type", "es": "tipo_curso"},
        "event_date": {"en": "start_date", "es": "fecha_inicio"},
        "guests": {"en": "participants", "es": "participantes"},
        "booking": {"en": "enrollment", "es": "inscripcion"},
    },
    "fitness": {
        "main_entity": {"en": "session", "es": "sesion"},
        "client": {"en": "member", "es": "miembro"},
        "event_type": {"en": "session_type", "es": "tipo_sesion"},
        "event_date": {"en": "session_date", "es": "fecha_sesion"},
        "guests": {"en": "participants", "es": "participantes"},
        "booking": {"en": "membership", "es": "membresia"},
    },
    "consulting": {
        "main_entity": {"en": "engagement", "es": "compromiso"},
        "client": {"en": "client", "es": "cliente"},
        "event_type": {"en": "engagement_type", "es": "tipo_compromiso"},
        "event_date": {"en": "start_date", "es": "fecha_inicio"},
        "guests": {"en": "participants", "es": "participantes"},
        "booking": {"en": "contract", "es": "contrato"},
    },
    "generic": {
        "main_entity": {"en": "service", "es": "servicio"},
        "client": {"en": "client", "es": "cliente"},
        "event_type": {"en": "service_type", "es": "tipo_servicio"},
        "event_date": {"en": "service_date", "es": "fecha_servicio"},
        "guests": {"en": "contacts", "es": "contactos"},
        "booking": {"en": "booking", "es": "reserva"},
    },
}

def get_industry_templates(industry: str, lang: str = "es"):
    """Get import/export templates with industry-specific terminology"""
    terms = INDUSTRY_IMPORT_TERMINOLOGY.get(industry, INDUSTRY_IMPORT_TERMINOLOGY["events_hospitality"])
    
    # Build column names based on industry
    event_type_col = terms["event_type"][lang]
    event_date_col = terms["event_date"][lang]
    guests_col = f"num_{terms['guests'][lang]}"
    client_col = terms["client"][lang]
    main_entity_col = f"nombre_{terms['main_entity'][lang]}"
    
    return {
        "clients": {
            "columns": ["nombre", "email", "telefono", "empresa", "tipo", "direccion", "pagina_web", "industria", "descripcion", "linkedin", "instagram", "notas"],
            "sample": [["Juan Pérez", "juan@email.com", "555-1234", "Empresa ABC", "corporate", "Calle 123", "https://empresa.com", "technology", "Desarrollo de software empresarial", "https://linkedin.com/company/empresa", "@empresa_abc", "Cliente VIP"]]
        },
        "inventory": {
            "columns": ["nombre", "categoria", "unidad", "costo_por_unidad", "stock_actual", "stock_minimo", "proveedor", "ubicacion", "notas"],
            "sample": [["Tomate", "Vegetales", "kg", 2.50, 100, 20, "Proveedor XYZ", "Bodega A", ""]]
        },
        "recipes": {
            "columns": ["nombre", "categoria", "porciones", "tiempo_preparacion", "ingredientes", "instrucciones", "notas"],
            "sample": [["Ensalada César", "Ensaladas", 4, "15 min", "Lechuga: 200 g; Pollo: 300 g; Aderezo: 50 ml", "1. Lavar lechuga...", ""]]
        },
        "quotes": {
            "columns": [client_col, "fecha", event_date_col, "estado", "items", "subtotal", "impuestos", "total", "notas"],
            "sample": [["Empresa ABC", "2026-01-15", "2026-02-01", "sent", "Servicio: 50 x $150; Extra: 1 x $500", 8000, 1280, 9280, "Proyecto corporativo"]]
        },
        "events": {
            "columns": [main_entity_col, client_col, "fecha_inicio", "fecha_fin", "hora_inicio", "hora_fin", "ubicacion", event_type_col, guests_col, "estado", "presupuesto", "notas"],
            "sample": [["Proyecto García", "Juan García", "2026-02-14", "2026-02-14", "16:00", "23:00", "Oficina Principal", "corporate", 10, "confirmed", 50000, "Incluye todos los servicios"]]
        },
        "leads": {
            "columns": ["nombre", "email", "telefono", "whatsapp", "empresa", "tipo_cliente", "direccion", "rnc", "fuente", "estado", "valor_estimado", "rango_presupuesto", event_type_col, event_date_col, guests_col, "tipo_lead", "notas"],
            "sample": [["María García", "maria@email.com", "555-9876", "555-9876", "Empresa XYZ", "Company", "Calle Principal 123", "123456789", "website", "new", 15000, "$10,000 - $20,000", "corporate", "2026-03-15", 100, "inbound", "Interesado en nuestros servicios"]]
        }
    }

@import_export_router.get("/templates/{type}")
async def get_import_template(
    type: str, 
    format: str = "csv",
    user: User = Depends(get_current_user)
):
    """Get import template for clients, inventory, recipes, quotes, or events - with industry-specific terminology"""
    
    # Get user's industry
    org_config = await db.organization_configs.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "industry_template": 1}
    )
    industry = org_config.get("industry_template", "events_hospitality") if org_config else "events_hospitality"
    
    # Get templates with industry-specific terminology
    templates = get_industry_templates(industry)
    
    if type not in templates:
        raise HTTPException(status_code=400, detail="Tipo inválido. Use: clients, inventory, recipes, quotes, events, leads")
    
    template = templates[type]
    df = pd.DataFrame(template["sample"], columns=template["columns"])
    
    # No-cache headers to ensure fresh templates are always downloaded
    no_cache_headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Template')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=template_{type}.xlsx",
                **no_cache_headers
            }
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=template_{type}.csv",
                **no_cache_headers
            }
        )

# Include import_export_router
api_router.include_router(import_export_router)

# ============== USER MANAGEMENT ENDPOINTS ==============

@super_admin_router.get("/users")
async def get_all_users(user: User = Depends(get_current_user)):
    """Get all users (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0, "password_hash": 0}).to_list(1000)
    return users

@super_admin_router.post("/users")
async def create_user(
    user_data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new user (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.get("email")})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = bcrypt.hashpw(
        user_data.get("password", "").encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")
    
    new_user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": user_data.get("email"),
        "name": user_data.get("name"),
        "hashed_password": hashed_password,
        "company_id": user_data.get("company_id"),
        "role": user_data.get("role", "user"),
        "is_super_admin": user_data.get("is_super_admin", False),
        "is_active": True,
        "permissions": {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(new_user)
    del new_user["hashed_password"]
    return {"success": True, "user": {k: v for k, v in new_user.items() if k != "_id"}}


@super_admin_router.get("/users/{user_id}/memberships")
async def get_user_memberships(user_id: str, user: User = Depends(get_current_user)):
    """Get all memberships for a user (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    memberships = await db.memberships.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with company names
    for m in memberships:
        cid = m.get("company_id") or m.get("organization_id")
        if cid:
            company = await db.companies.find_one({"company_id": cid}, {"_id": 0, "name": 1})
            m["company_name"] = company.get("name") if company else cid
            if not m.get("company_id"):
                m["company_id"] = cid
    
    return memberships


@super_admin_router.patch("/users/{user_id}")
async def update_user(  # noqa: F811
    user_id: str,
    updates: dict,
    user: User = Depends(get_current_user)
):
    """Update a user (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    allowed_fields = ["name", "role", "is_super_admin", "is_active", "company_id"]
    update_data = {k: v for k, v in updates.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

@super_admin_router.patch("/users/{user_id}/permissions")
async def update_user_permissions(
    user_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update user permissions (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    permissions = data.get("permissions", {})
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"permissions": permissions}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

@super_admin_router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Reset user password (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    new_password = data.get("new_password")
    if not new_password:
        raise HTTPException(status_code=400, detail="New password required")
    
    # Get target user info before update
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    hashed_password = bcrypt.hashpw(
        new_password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": hashed_password}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Send notification email to the user
    try:
        from services.email_service import send_password_changed_notification
        await send_password_changed_notification(
            to_email=target_user.get("email"),
            user_name=target_user.get("name", "Usuario"),
            changed_at=datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC"),
            changed_by=f"Administrador ({user.email})"
        )
    except Exception as e:
        logger.warning(f"Failed to send password change notification: {e}")
    
    return {"success": True}

@super_admin_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user: User = Depends(get_current_user)
):
    """Soft-delete a user (super admin only). The user is marked inactive
    (`is_active=false`, `status="inactive"`) instead of being removed from
    the DB, so historical data (leads, activity, audit trail) stays intact.
    Any leads currently assigned to them are auto-unassigned so they surface
    as "Sin Asignar" in the CRM sales report."""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")

    # Prevent self-deletion
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    now = datetime.now(timezone.utc).isoformat()
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "company_id": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Soft-delete: mark inactive so the CRM sales report shows them under
    # the "Inactivo" badge (amber) instead of hard-deleting.
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "is_active": False,
            "status": "inactive",
            "deactivated_at": now,
            "deactivated_by": user.user_id,
            "updated_at": now,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # Auto-unassign any leads owned by this user (keeps the sales report
    # clean without needing the "Reasignar leads huérfanos" button click).
    leads_updated = 0
    try:
        r_leads = await db.leads.update_many(
            {"owner_id": user_id, "company_id": target.get("company_id")},
            {"$set": {"owner_id": None, "owner_email": None,
                      "reassigned_at": now, "reassigned_reason": "user_deactivated"}},
        )
        leads_updated = r_leads.modified_count
    except Exception:
        pass

    return {"success": True, "soft_deleted": True, "leads_unassigned": leads_updated}


# ============== SUPER ADMIN: MODULE MANAGEMENT ==============

@super_admin_router.get("/organizations/{company_id}/modules")
async def get_org_modules(company_id: str, admin: User = Depends(get_super_admin)):
    """Get all modules for an organization (active and available)"""
    # Get active modules for this org
    active_addons = await db.organization_addons.find(
        {"company_id": company_id, "status": "active", "addon_type": "module"},
        {"_id": 0}
    ).to_list(50)
    
    # Get organization config for industry
    org = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    org_config = await db.organization_configs.find_one({"company_id": company_id}, {"_id": 0})
    
    # Get all available module definitions
    all_modules = await db.addon_definitions.find(
        {"type": "module", "is_active": True},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(50)
    
    # Map active module keys
    active_module_keys = [
        a.get("addon_id", "").replace("addon_", "") 
        for a in active_addons
    ]
    
    # Calculate monthly cost
    monthly_cost = sum(a.get("price_paid", 0) for a in active_addons)
    
    return {
        "company_id": company_id,
        "industry_template": org.get("industry_template", "events_hospitality") if org else "events_hospitality",
        "active_modules": active_addons,
        "active_module_keys": active_module_keys,
        "available_modules": all_modules,
        "monthly_module_cost": monthly_cost
    }


@super_admin_router.post("/organizations/{company_id}/modules/{module_key}/activate")
async def activate_module_for_org(company_id: str, module_key: str, admin: User = Depends(get_super_admin)):
    """Activate a module for an organization (Super Admin only - bypasses payment)"""
    # Check org exists
    org = await db.companies.find_one({"company_id": company_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Check module exists
    addon_id = f"addon_{module_key}"
    module_def = await db.addon_definitions.find_one({"addon_id": addon_id, "type": "module"})
    if not module_def:
        raise HTTPException(status_code=404, detail="Module not found")
    
    # Check if already active
    existing = await db.organization_addons.find_one({
        "company_id": company_id,
        "addon_id": addon_id,
        "status": "active"
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Module already active for this organization")
    
    now = datetime.now(timezone.utc)
    billing_end = now + timedelta(days=30)
    
    # Create organization addon record
    org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
    addon_doc = {
        "org_addon_id": org_addon_id,
        "company_id": company_id,
        "addon_id": addon_id,
        "addon_name": module_def.get("display_name_es", module_key),
        "addon_type": "module",
        "status": "active",
        "quantity": 1,
        "price_paid": module_def.get("price", 0),
        "pricing_type": "monthly",
        "currency": "USD",
        "billing_cycle_start": now.isoformat(),
        "billing_cycle_end": billing_end.isoformat(),
        "next_billing_date": billing_end.isoformat(),
        "auto_renew": True,
        "admin_granted": True,  # Mark as granted by admin
        "granted_by": admin.user_id,
        "purchased_by": admin.user_id,
        "purchased_at": now.isoformat()
    }
    
    await db.organization_addons.insert_one(addon_doc)
    
    # Log admin action
    await log_super_admin_action(admin.user_id, "activate_module", company_id, {"module": module_key})
    
    return {"success": True, "message": f"Module {module_key} activated for organization"}


@super_admin_router.delete("/organizations/{company_id}/modules/{module_key}/deactivate")
async def deactivate_module_for_org(company_id: str, module_key: str, admin: User = Depends(get_super_admin)):
    """Deactivate a module for an organization (Super Admin only)"""
    addon_id = f"addon_{module_key}"
    
    # Find active module
    existing = await db.organization_addons.find_one({
        "company_id": company_id,
        "addon_id": addon_id,
        "status": "active"
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Module not active for this organization")
    
    now = datetime.now(timezone.utc)
    
    # Deactivate module
    await db.organization_addons.update_one(
        {"org_addon_id": existing["org_addon_id"]},
        {"$set": {
            "status": "canceled",
            "admin_canceled": True,
            "canceled_by": admin.user_id,
            "canceled_at": now.isoformat()
        }}
    )
    
    # Log admin action
    await log_super_admin_action(admin.user_id, "deactivate_module", company_id, {"module": module_key})
    
    return {"success": True, "message": f"Module {module_key} deactivated for organization"}


@super_admin_router.post("/sync-addon-definitions")
async def sync_addon_definitions(admin: User = Depends(get_super_admin)):
    """
    Sync addon definitions from code to database (Super Admin only).
    Updates prices, names, and descriptions to match the latest code.
    """
    from routers.addons import DEFAULT_ADDONS
    
    updated = []
    created = []
    
    for addon_data in DEFAULT_ADDONS:
        addon_id = addon_data["addon_id"]
        
        # Check if exists
        existing = await db.addon_definitions.find_one({"addon_id": addon_id})
        
        if existing:
            # Update existing
            update_fields = {
                "price": addon_data.get("price"),
                "display_name_en": addon_data.get("display_name_en"),
                "display_name_es": addon_data.get("display_name_es"),
                "description_en": addon_data.get("description_en"),
                "description_es": addon_data.get("description_es"),
                "icon": addon_data.get("icon"),
                "is_active": addon_data.get("is_active", True),
                "sort_order": addon_data.get("sort_order", 0),
            }
            # Remove None values
            update_fields = {k: v for k, v in update_fields.items() if v is not None}
            
            await db.addon_definitions.update_one(
                {"addon_id": addon_id},
                {"$set": update_fields}
            )
            updated.append(addon_id)
        else:
            # Create new
            await db.addon_definitions.insert_one(addon_data)
            created.append(addon_id)
    
    await log_super_admin_action(admin.user_id, "sync_addon_definitions", None, {
        "updated": updated,
        "created": created
    })
    
    return {
        "success": True,
        "updated": len(updated),
        "created": len(created),
        "updated_addons": updated,
        "created_addons": created
    }


@super_admin_router.put("/organizations/{company_id}/industry")
async def update_org_industry(company_id: str, data: dict, admin: User = Depends(get_super_admin)):
    """Update organization's industry template (Super Admin only)"""
    industry_template = data.get("industry_template")
    
    valid_industries = ["events_hospitality", "professional_services", "generic"]
    if industry_template not in valid_industries:
        raise HTTPException(status_code=400, detail=f"Invalid industry. Must be one of: {valid_industries}")
    
    # Update company
    result = await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"industry_template": industry_template, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Update organization config
    from models.organization_config import INDUSTRY_TEMPLATES, IndustryTemplate
    template_enum = IndustryTemplate(industry_template) if industry_template in [e.value for e in IndustryTemplate] else IndustryTemplate.EVENTS_HOSPITALITY
    template_data = INDUSTRY_TEMPLATES.get(template_enum, INDUSTRY_TEMPLATES[IndustryTemplate.EVENTS_HOSPITALITY])
    
    await db.organization_configs.update_one(
        {"company_id": company_id},
        {"$set": {
            "industry_template": industry_template,
            "enabled_engagement_types": template_data["enabled_engagement_types"],
            "default_engagement_type": template_data["default_engagement_type"],
            "terminology": template_data.get("terminology", {}),
            "pipeline_stages": template_data["pipeline_stages"],
            "event_types": template_data["event_types"],
            "client_types": template_data["client_types"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Log admin action
    await log_super_admin_action(admin.user_id, "update_industry", company_id, {"industry_template": industry_template})
    
    return {"success": True, "industry_template": industry_template}


# ============== PRICING MANAGEMENT ==============
DEFAULT_KORA_CORE_PRICE = 69.00
DEFAULT_MODULE_PRICES = {
    "module_event_suite": 39.00,
    "module_culinary_intelligence": 29.00,
    "module_operations_supplies": 19.00,
    "module_demand_studio": 39.00,
}

@super_admin_router.get("/pricing")
async def get_pricing_config(admin: User = Depends(get_super_admin)):
    """Get current pricing configuration"""
    config = await db.pricing_config.find_one({"active": True}, {"_id": 0})
    
    if not config:
        return {
            "kora_core_price": DEFAULT_KORA_CORE_PRICE,
            "module_prices": DEFAULT_MODULE_PRICES,
            "is_default": True
        }
    
    return {
        "kora_core_price": config.get("kora_core_price", DEFAULT_KORA_CORE_PRICE),
        "module_prices": config.get("module_prices", DEFAULT_MODULE_PRICES),
        "is_default": False,
        "created_at": config.get("created_at"),
        "created_by": config.get("created_by")
    }


@super_admin_router.put("/pricing")
async def update_pricing_config(data: dict, admin: User = Depends(get_super_admin)):
    """Update pricing configuration (Super Admin only)"""
    now = datetime.now(timezone.utc)
    
    # Get current config to merge
    current = await db.pricing_config.find_one({"active": True})
    current_kora = current.get("kora_core_price", DEFAULT_KORA_CORE_PRICE) if current else DEFAULT_KORA_CORE_PRICE
    current_modules = current.get("module_prices", DEFAULT_MODULE_PRICES) if current else DEFAULT_MODULE_PRICES
    
    # Merge updates
    new_kora = data.get("kora_core_price", current_kora)
    new_modules = {**current_modules, **(data.get("module_prices") or {})}
    
    # Deactivate previous config
    await db.pricing_config.update_many(
        {"active": True},
        {"$set": {"active": False, "deactivated_at": now.isoformat()}}
    )
    
    # Create new config
    new_config = {
        "kora_core_price": new_kora,
        "module_prices": new_modules,
        "active": True,
        "created_at": now.isoformat(),
        "created_by": admin.user_id,
        "created_by_email": admin.email
    }
    
    await db.pricing_config.insert_one(new_config)
    
    # Log action
    await log_super_admin_action(admin.user_id, "update_pricing", None, {
        "kora_core_price": new_kora,
        "module_prices": new_modules
    })
    
    logger.info(f"Pricing updated by {admin.email}: Core=${new_kora}")
    
    return {
        "success": True,
        "message": "Pricing updated successfully",
        "kora_core_price": new_kora,
        "module_prices": new_modules
    }


@super_admin_router.get("/pricing/history")
async def get_pricing_history(limit: int = 10, admin: User = Depends(get_super_admin)):
    """Get pricing change history"""
    history = await db.pricing_config.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"history": history}


# ============== DEMO/INFLUENCER ACCOUNT CREATION ==============

class DemoAccountCreate(BaseModel):
    """Create a demo or influencer account with full access"""
    email: EmailStr
    name: str
    password: str
    organization_name: str
    industry_type: str = "events"  # events, agency, consulting, generic
    account_type: str = "demo"  # demo, influencer, partner
    modules_to_activate: List[str] = []  # List of module keys to activate
    trial_days: int = 365  # Default 1 year for demo/influencer accounts
    notes: Optional[str] = None


@super_admin_router.post("/demo-accounts")
async def create_demo_account(
    data: DemoAccountCreate,
    admin: User = Depends(get_super_admin)
):
    """
    Create a demo/influencer account with:
    - New organization
    - User as owner
    - Selected modules activated (no payment required)
    - Extended trial period
    """
    from industry_config_module.industry_config import get_industry_config
    
    # Check if email already exists (case-insensitive to avoid confusable duplicates)
    email_re = re.escape(data.email.strip())
    existing_user = await db.users.find_one({"email": {"$regex": f"^{email_re}$", "$options": "i"}})
    if existing_user:
        raise HTTPException(status_code=400, detail=f"Email '{data.email}' is already registered")

    # Check if organization name already exists (case-insensitive + trimmed)
    org_name_clean = data.organization_name.strip()
    org_re = re.escape(org_name_clean)
    existing_org = await db.companies.find_one({"name": {"$regex": f"^{org_re}$", "$options": "i"}})
    if existing_org:
        raise HTTPException(status_code=400, detail=f"Organization '{org_name_clean}' already exists. Use a different name or edit the existing organization.")
    
    now = datetime.now(timezone.utc)
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    # Map industry_type to industry_template
    industry_template_map = {
        "events": "events_hospitality",
        "agency": "professional_services", 
        "consulting": "professional_services",
        "generic": "generic"
    }
    industry_template = industry_template_map.get(data.industry_type, "generic")
    
    # Create organization in the correct collection
    org_doc = {
        "company_id": company_id,
        "name": data.organization_name,
        "industry_template": industry_template,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "es",
        "currency": "USD",
        "timezone": "America/Santo_Domingo",
        "status": "active",
        "account_type": data.account_type,  # demo, influencer, partner
        "admin_notes": data.notes,
        "created_by_admin": admin.user_id,
        "created_at": now.isoformat(),
        # Demo/Influencer/Partner accounts store the plaintext password so the
        # super-admin can share it with the demo team later. This ONLY applies
        # to non-paying accounts — real customer passwords are hashed only.
        "demo_password": data.password,
        "settings": {
            "currency": "USD",
            "timezone": "America/Santo_Domingo",
            "language": "es"
        }
    }
    await db.companies.insert_one(org_doc)
    
    # Create organization config with industry - FULL CONFIG
    from models.organization_config import INDUSTRY_TEMPLATES, IndustryTemplate
    
    # Map industry_type to IndustryTemplate enum
    template_enum_map = {
        "events": IndustryTemplate.EVENTS_HOSPITALITY,
        "agency": IndustryTemplate.PROFESSIONAL_SERVICES,
        "consulting": IndustryTemplate.PROFESSIONAL_SERVICES,
        "generic": IndustryTemplate.GENERIC
    }
    template_enum = template_enum_map.get(data.industry_type, IndustryTemplate.GENERIC)
    template_data = INDUSTRY_TEMPLATES.get(template_enum, INDUSTRY_TEMPLATES[IndustryTemplate.GENERIC])
    
    org_config_doc = {
        "config_id": f"cfg_{uuid.uuid4().hex[:8]}",
        "company_id": company_id,
        "industry_type": data.industry_type,
        "industry_template": industry_template,
        "enabled_engagement_types": template_data.get("enabled_engagement_types", ["event"]),
        "default_engagement_type": template_data.get("default_engagement_type", "event"),
        "terminology": template_data.get("terminology", {}),
        "pipeline_stages": template_data.get("pipeline_stages", []),
        "event_types": template_data.get("event_types", []),
        "client_types": template_data.get("client_types", []),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.organization_configs.insert_one(org_config_doc)
    
    # Create subscription with extended trial
    trial_end = now + timedelta(days=data.trial_days)
    subscription_doc = {
        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "plan_id": "plan_professional",
        "status": "trialing",
        "billing_cycle": "monthly",
        "current_period_start": now.isoformat(),
        "current_period_end": trial_end.isoformat(),
        "trial_ends_at": trial_end.isoformat(),
        "cancel_at_period_end": False,
        "is_demo_account": True,
        "account_type": data.account_type,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.subscriptions.insert_one(subscription_doc)
    
    # Hash password and create user
    hashed_password = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hashed_password,
        "company_id": company_id,
        "role": "owner",
        "is_super_admin": False,
        "is_active": True,
        "account_type": data.account_type,
        "created_at": now.isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Activate selected modules (admin bypass - no payment)
    activated_modules = []
    billing_end = trial_end
    
    # If no modules specified, use industry defaults
    modules_to_activate = data.modules_to_activate
    if not modules_to_activate:
        modules_to_activate = template_data.get("enabled_modules", [])
    
    for module_key in modules_to_activate:
        addon_id = f"addon_{module_key}"
        
        # Try to get addon definition for display name, but don't require it
        addon_def = await db.addon_definitions.find_one({"addon_id": addon_id})
        display_name = addon_def.get("display_name_es", module_key) if addon_def else module_key.replace("module_", "").replace("_", " ").title()
        
        org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
        org_addon_doc = {
            "org_addon_id": org_addon_id,
            "company_id": company_id,
            "addon_id": addon_id,
            "addon_name": display_name,
            "addon_type": "module",
            "status": "active",
            "quantity": 1,
            "price_paid": 0,  # Free for demo/influencer
            "pricing_type": "monthly",
            "currency": "USD",
            "billing_cycle_start": now.isoformat(),
            "billing_cycle_end": billing_end.isoformat(),
            "next_billing_date": None,  # No billing for demo accounts
            "auto_renew": False,
            "admin_granted": True,
            "account_type": data.account_type,
            "purchased_by": admin.user_id,
            "purchased_at": now.isoformat()
        }
        await db.organization_addons.insert_one(org_addon_doc)
        activated_modules.append(module_key)
    
    # Log admin action
    await log_super_admin_action(admin.user_id, "create_demo_account", company_id, {
        "email": data.email,
        "organization": data.organization_name,
        "industry": data.industry_type,
        "account_type": data.account_type,
        "modules": activated_modules,
        "trial_days": data.trial_days
    })

    # Seed sample data appropriate to the chosen industry so the user isn't
    # dropped into an empty shell on first login. Errors here are non-fatal;
    # the account is already usable without seed data.
    seed_counts: dict = {}
    try:
        from utils.demo_seed import seed_demo_data
        seed_counts = await seed_demo_data(db, company_id, data.industry_type, admin.user_id)
    except Exception as e:  # pragma: no cover — defensive; seed is best-effort
        logger.warning(f"[demo-seed] failed for company {company_id}: {e}")
        seed_counts = {"error": str(e)}

    return {
        "success": True,
        "seed_counts": seed_counts,
        "account": {
            "user_id": user_id,
            "email": data.email,
            "name": data.name,
            "company_id": company_id,
            "organization_name": data.organization_name,
            "industry_type": data.industry_type,
            "account_type": data.account_type,
            "trial_ends_at": trial_end.isoformat(),
            "activated_modules": activated_modules
        }
    }


@super_admin_router.get("/demo-accounts")
async def list_demo_accounts(admin: User = Depends(get_super_admin)):
    """List all demo/influencer/partner accounts"""
    # Get organizations with demo/influencer/partner account types
    orgs = await db.companies.find(
        {"account_type": {"$in": ["demo", "influencer", "partner"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with user and subscription info
    accounts = []
    for org in orgs:
        # Get owner user
        owner = await db.users.find_one(
            {"company_id": org["company_id"], "role": "owner"},
            {"_id": 0, "user_id": 1, "email": 1, "name": 1}
        )
        
        # Get subscription
        subscription = await db.subscriptions.find_one(
            {"company_id": org["company_id"]},
            {"_id": 0, "status": 1, "trial_ends_at": 1}
        )
        
        # Get active modules count
        modules_count = await db.organization_addons.count_documents({
            "company_id": org["company_id"],
            "status": "active",
            "addon_type": "module"
        })

        # Get industry_type from org_config so the UI can show the industry badge
        org_config = await db.organization_configs.find_one(
            {"company_id": org["company_id"]},
            {"_id": 0, "industry_type": 1, "industry_template": 1}
        )

        accounts.append({
            **org,
            # Never leak the plaintext password in the LIST response — only
            # signal whether one exists. The dedicated GET password endpoint
            # returns it on demand with a super-admin action log entry.
            "demo_password": None,
            "has_demo_password": bool(org.get("demo_password")),
            "industry_type": (org_config or {}).get("industry_type") or "generic",
            "industry_template": (org_config or {}).get("industry_template"),
            "owner": owner,
            "subscription_status": subscription.get("status") if subscription else "none",
            "trial_ends_at": subscription.get("trial_ends_at") if subscription else None,
            "active_modules_count": modules_count
        })
    
    return {"accounts": accounts, "total": len(accounts)}


@super_admin_router.get("/demo-accounts/{company_id}/password")
async def get_demo_account_password(
    company_id: str,
    admin: User = Depends(get_super_admin)
):
    """
    Return the plaintext password for a demo/influencer/partner account so
    the super-admin can share it with the demo team. Logs each retrieval.
    """
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    if company.get("account_type") not in ("demo", "influencer", "partner"):
        raise HTTPException(status_code=400, detail="Only demo/influencer/partner passwords can be retrieved")
    pw = company.get("demo_password")
    if not pw:
        raise HTTPException(status_code=404, detail="No stored password. Use 'Regenerate password' to create a new one.")

    owner = await db.users.find_one(
        {"company_id": company_id, "role": "owner"},
        {"_id": 0, "email": 1},
    )
    await log_super_admin_action(admin.user_id, "view_demo_password", company_id, {
        "organization": company.get("name"),
    })
    return {
        "success": True,
        "email": (owner or {}).get("email"),
        "password": pw,
    }


class RegeneratePasswordRequest(BaseModel):
    new_password: Optional[str] = None  # if omitted, one is generated


@super_admin_router.post("/demo-accounts/{company_id}/regenerate-password")
async def regenerate_demo_account_password(
    company_id: str,
    body: RegeneratePasswordRequest = Body(default_factory=RegeneratePasswordRequest),
    admin: User = Depends(get_super_admin)
):
    """
    Rotate the password of the demo account's owner user. Stores the new
    plaintext in `companies.demo_password` so the super-admin can re-share
    it later; also updates `users.password_hash`.
    """
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    if company.get("account_type") not in ("demo", "influencer", "partner"):
        raise HTTPException(status_code=400, detail="Only demo/influencer/partner passwords can be regenerated")

    # Generate a memorable password if the caller didn't send one
    new_password = (body.new_password or "").strip()
    if not new_password:
        import secrets, string
        alphabet = string.ascii_letters + string.digits
        new_password = "Demo" + "".join(secrets.choice(alphabet) for _ in range(9))

    owner = await db.users.find_one({"company_id": company_id, "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner user not found for this organization")

    hashed = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await db.users.update_one(
        {"user_id": owner["user_id"]},
        {"$set": {"password_hash": hashed, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {"demo_password": new_password, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await log_super_admin_action(admin.user_id, "regenerate_demo_password", company_id, {
        "organization": company.get("name"),
    })
    return {
        "success": True,
        "email": owner.get("email"),
        "password": new_password,
    }



@super_admin_router.delete("/demo-accounts/{company_id}")
async def delete_demo_account(
    company_id: str,
    admin: User = Depends(get_super_admin)
):
    """
    Permanently delete a demo/influencer/partner account and ALL of its
    data. Refuses to delete accounts that have been converted to `paid`
    or the admin's own organisation — those must go through the generic
    `DELETE /organizations/{company_id}` path with an extra confirmation.
    """
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")

    if company_id == admin.company_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own organization")

    if company.get("account_type") not in ("demo", "influencer", "partner"):
        raise HTTPException(
            status_code=400,
            detail="This endpoint only deletes demo/influencer/partner accounts. Use the organizations endpoint for paid accounts.",
        )

    org_name = company.get("name", company_id)

    # Wipe the org's data. Kept as an explicit whitelist so we don't
    # accidentally leak cross-tenant collections.
    collections_to_wipe = [
        "users", "memberships", "organization_members",
        "subscriptions", "organization_addons", "organization_configs",
        "events", "leads", "proposals", "clients",
        "ingredients", "recipes", "menus", "plated_menus",
        "production_batches", "purchase_orders", "delivery_notes",
        "reservations", "notifications", "buffet_factors",
        "social_accounts", "social_posts", "social_metrics",
        "document_templates", "company_settings",
    ]
    deleted_counts: dict = {}
    for coll_name in collections_to_wipe:
        try:
            res = await db[coll_name].delete_many({"company_id": company_id})
            if res.deleted_count:
                deleted_counts[coll_name] = res.deleted_count
        except Exception:
            # collection may not exist yet on a very fresh install
            pass

    # Delete the organisation itself last
    await db.companies.delete_one({"company_id": company_id})
    deleted_counts["companies"] = 1

    await log_super_admin_action(
        admin.user_id, "delete_demo_account", company_id,
        {"organization_name": org_name, "deleted_counts": deleted_counts},
    )
    return {"success": True, "message": f"Demo account '{org_name}' deleted", "deleted_counts": deleted_counts}


class ConvertDemoAccount(BaseModel):
    """Convert demo account to paid"""
    conversion_type: str  # "manual" or "stripe"
    plan_id: str = "plan_professional"
    extend_days: int = 30  # For manual conversion, extend by this many days
    notes: Optional[str] = None


@super_admin_router.post("/demo-accounts/{company_id}/convert")
async def convert_demo_account(
    company_id: str,
    data: ConvertDemoAccount,
    admin: User = Depends(get_super_admin)
):
    """
    Convert a demo/influencer account to a paid account.
    - manual: Admin directly converts to paid (no Stripe charge)
    - stripe: Generate a checkout link for the user to pay
    """
    import stripe
    
    # Verify company exists and is a demo account
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    if company.get("account_type") not in ["demo", "influencer", "partner"]:
        raise HTTPException(status_code=400, detail="Account is not a demo/influencer/partner account")
    
    now = datetime.now(timezone.utc)
    
    if data.conversion_type == "manual":
        # Manual conversion - admin marks as paid without Stripe
        new_period_end = now + timedelta(days=data.extend_days)
        
        await db.subscriptions.update_one(
            {"company_id": company_id},
            {"$set": {
                "status": "active",
                "is_demo_account": False,
                "converted_from_demo": True,
                "conversion_type": "manual",
                "converted_by": admin.user_id,
                "converted_at": now.isoformat(),
                "current_period_start": now.isoformat(),
                "current_period_end": new_period_end.isoformat(),
                "trial_ends_at": None,
                "admin_notes": data.notes,
                "updated_at": now.isoformat()
            }}
        )
        
        # Update company to remove demo flag
        await db.companies.update_one(
            {"company_id": company_id},
            {"$set": {
                "account_type": "paid",
                "converted_from": company.get("account_type"),
                "converted_at": now.isoformat()
            }}
        )
        
        # Log action
        await log_super_admin_action(admin.user_id, "convert_demo_to_paid_manual", company_id, {
            "previous_type": company.get("account_type"),
            "extend_days": data.extend_days,
            "notes": data.notes
        })
        
        return {
            "success": True,
            "conversion_type": "manual",
            "message": "Account converted to paid successfully",
            "new_period_end": new_period_end.isoformat()
        }
    
    elif data.conversion_type == "stripe":
        # Get owner user email
        owner = await db.users.find_one(
            {"company_id": company_id, "role": "owner"},
            {"_id": 0, "email": 1, "name": 1, "user_id": 1}
        )
        if not owner:
            raise HTTPException(status_code=404, detail="Owner user not found")
        
        # Create Stripe checkout session for conversion
        stripe_key = os.environ.get("STRIPE_SECRET_KEY")
        if not stripe_key:
            raise HTTPException(status_code=500, detail="Stripe not configured")
        
        stripe.api_key = stripe_key
        
        # Get the modules this account has active
        active_modules = await db.organization_addons.find(
            {"company_id": company_id, "status": "active", "addon_type": "module"},
            {"_id": 0, "addon_id": 1}
        ).to_list(20)
        
        # Calculate total monthly price based on modules
        total_price = 0
        line_items = []
        
        for module in active_modules:
            addon_def = await db.addon_definitions.find_one(
                {"addon_id": module["addon_id"]},
                {"_id": 0, "price": 1, "display_name_en": 1, "stripe_price_id": 1}
            )
            if addon_def:
                total_price += addon_def.get("price", 0)
                if addon_def.get("stripe_price_id"):
                    line_items.append({
                        "price": addon_def["stripe_price_id"],
                        "quantity": 1
                    })
        
        # If no stripe price IDs, create a simple checkout
        if not line_items:
            # Create ad-hoc price
            line_items = [{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Kora OS - {company['name']} Subscription",
                        "description": f"Monthly subscription with {len(active_modules)} modules"
                    },
                    "unit_amount": int(total_price * 100),  # Stripe uses cents
                    "recurring": {"interval": "month"}
                },
                "quantity": 1
            }]
        
        # Create checkout session
        frontend_url = os.environ.get("FRONTEND_URL", "https://ourkora.com")
        
        checkout_session = stripe.checkout.Session.create(
            customer_email=owner["email"],
            line_items=line_items,
            mode="subscription",
            success_url=f"{frontend_url}/settings?conversion=success&company_id={company_id}",
            cancel_url=f"{frontend_url}/settings?conversion=cancelled",
            metadata={
                "company_id": company_id,
                "conversion_from": company.get("account_type"),
                "converted_by_admin": admin.user_id
            },
            subscription_data={
                "metadata": {
                    "company_id": company_id,
                    "kora_plan": data.plan_id
                }
            }
        )
        
        # Store pending conversion info
        await db.pending_conversions.insert_one({
            "conversion_id": f"conv_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "checkout_session_id": checkout_session.id,
            "checkout_url": checkout_session.url,
            "owner_email": owner["email"],
            "created_by": admin.user_id,
            "created_at": now.isoformat(),
            "status": "pending",
            "expires_at": (now + timedelta(hours=24)).isoformat()
        })
        
        # Log action
        await log_super_admin_action(admin.user_id, "convert_demo_to_paid_stripe", company_id, {
            "previous_type": company.get("account_type"),
            "checkout_session_id": checkout_session.id,
            "owner_email": owner["email"]
        })
        
        return {
            "success": True,
            "conversion_type": "stripe",
            "checkout_url": checkout_session.url,
            "owner_email": owner["email"],
            "message": "Checkout link generated. Send to user or redirect them."
        }
    
    else:
        raise HTTPException(status_code=400, detail="Invalid conversion type. Use 'manual' or 'stripe'")


@super_admin_router.post("/demo-accounts/{company_id}/extend-trial")
async def extend_demo_trial(
    company_id: str,
    days: int = 30,
    admin: User = Depends(get_super_admin)
):
    """Extend the trial period for a demo account"""
    subscription = await db.subscriptions.find_one({"company_id": company_id})
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    current_end = datetime.fromisoformat(subscription["trial_ends_at"].replace("Z", "+00:00")) if subscription.get("trial_ends_at") else datetime.now(timezone.utc)
    new_end = current_end + timedelta(days=days)
    
    await db.subscriptions.update_one(
        {"company_id": company_id},
        {"$set": {
            "trial_ends_at": new_end.isoformat(),
            "current_period_end": new_end.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await log_super_admin_action(admin.user_id, "extend_demo_trial", company_id, {"extended_days": days})
    
    return {"success": True, "new_trial_ends_at": new_end.isoformat()}


class DemoAccountUpdate(BaseModel):
    """Update demo account details"""
    organization_name: Optional[str] = None
    modules_to_activate: Optional[List[str]] = None
    trial_days: Optional[int] = None
    notes: Optional[str] = None


@super_admin_router.get("/demo-accounts/{company_id}")
async def get_demo_account_detail(
    company_id: str,
    admin: User = Depends(get_super_admin)
):
    """Get detailed information about a specific demo account"""
    # Get organization
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Get owner
    owner = await db.users.find_one(
        {"company_id": company_id, "role": "owner"},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1}
    )
    
    # Get subscription
    subscription = await db.subscriptions.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    # Get active modules
    active_modules = await db.organization_addons.find(
        {"company_id": company_id, "status": "active", "addon_type": "module"},
        {"_id": 0, "addon_id": 1, "addon_name": 1}
    ).to_list(50)
    
    # Extract module keys from addon_ids
    module_keys = [m["addon_id"].replace("addon_", "") for m in active_modules]
    
    return {
        **company,
        "owner": owner,
        "subscription": subscription,
        "active_modules": module_keys,
        "active_modules_details": active_modules
    }


@super_admin_router.put("/demo-accounts/{company_id}")
async def update_demo_account(
    company_id: str,
    data: DemoAccountUpdate,
    admin: User = Depends(get_super_admin)
):
    """Update a demo/influencer account"""
    # Verify company exists and is a demo account
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    if company.get("account_type") not in ["demo", "influencer", "partner"]:
        raise HTTPException(status_code=400, detail="Account is not a demo/influencer/partner account")
    
    now = datetime.now(timezone.utc)
    updates = {"updated_at": now.isoformat()}
    changes_made = []
    
    # Update organization name if provided
    if data.organization_name and data.organization_name != company.get("name"):
        updates["name"] = data.organization_name
        changes_made.append(f"name: {company.get('name')} -> {data.organization_name}")
    
    # Update notes if provided
    if data.notes is not None:
        updates["admin_notes"] = data.notes
        changes_made.append("notes updated")
    
    # Update company
    if len(updates) > 1:  # More than just updated_at
        await db.companies.update_one({"company_id": company_id}, {"$set": updates})
    
    # Update trial period if provided
    if data.trial_days:
        subscription = await db.subscriptions.find_one({"company_id": company_id})
        if subscription:
            new_end = now + timedelta(days=data.trial_days)
            await db.subscriptions.update_one(
                {"company_id": company_id},
                {"$set": {
                    "trial_ends_at": new_end.isoformat(),
                    "current_period_end": new_end.isoformat(),
                    "updated_at": now.isoformat()
                }}
            )
            changes_made.append(f"trial_days: {data.trial_days}")
    
    # Update modules if provided
    if data.modules_to_activate is not None:
        # Get current modules
        current_modules = await db.organization_addons.find(
            {"company_id": company_id, "status": "active", "addon_type": "module"},
            {"_id": 0, "addon_id": 1}
        ).to_list(50)
        current_module_keys = set([m["addon_id"].replace("addon_", "") for m in current_modules])
        new_module_keys = set(data.modules_to_activate)
        
        # Modules to add
        modules_to_add = new_module_keys - current_module_keys
        # Modules to remove
        modules_to_remove = current_module_keys - new_module_keys
        
        # Get subscription end date for billing_cycle_end
        subscription = await db.subscriptions.find_one({"company_id": company_id})
        billing_end = datetime.fromisoformat(subscription["trial_ends_at"].replace("Z", "+00:00")) if subscription and subscription.get("trial_ends_at") else now + timedelta(days=365)
        
        # Add new modules
        for module_key in modules_to_add:
            addon_id = f"addon_{module_key}"
            org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
            org_addon_doc = {
                "org_addon_id": org_addon_id,
                "company_id": company_id,
                "addon_id": addon_id,
                "addon_name": module_key,
                "addon_type": "module",
                "status": "active",
                "quantity": 1,
                "price_paid": 0,
                "pricing_type": "monthly",
                "currency": "USD",
                "billing_cycle_start": now.isoformat(),
                "billing_cycle_end": billing_end.isoformat(),
                "auto_renew": False,
                "admin_granted": True,
                "account_type": company.get("account_type"),
                "purchased_by": admin.user_id,
                "purchased_at": now.isoformat()
            }
            await db.organization_addons.insert_one(org_addon_doc)
        
        # Deactivate removed modules
        for module_key in modules_to_remove:
            addon_id = f"addon_{module_key}"
            await db.organization_addons.update_many(
                {"company_id": company_id, "addon_id": addon_id},
                {"$set": {"status": "inactive", "deactivated_at": now.isoformat(), "deactivated_by": admin.user_id}}
            )
        
        if modules_to_add or modules_to_remove:
            changes_made.append(f"modules: +{len(modules_to_add)} -{len(modules_to_remove)}")
    
    # Log action
    await log_super_admin_action(admin.user_id, "update_demo_account", company_id, {
        "changes": changes_made
    })
    
    return {
        "success": True,
        "changes": changes_made,
        "message": f"Account updated successfully. Changes: {', '.join(changes_made) if changes_made else 'None'}"
    }


# ============== PRICING CONFIGURATION ==============

class PricingConfig(BaseModel):
    """Pricing configuration model"""
    kora_core_price: float = 69.0
    module_prices: dict = {}


@super_admin_router.get("/pricing")
async def get_pricing_config(admin: User = Depends(get_super_admin)):  # noqa: F811
    """Get current active pricing configuration"""
    pricing = await db.pricing_config.find_one(
        {"active": True},
        {"_id": 0}
    )
    
    if not pricing:
        # Return default pricing
        default_pricing = {
            "kora_core_price": 69.0,
            "module_prices": {
                "module_event_orchestration": 39.0,
                "module_culinary_intelligence": 29.0,
                "module_operations_supplies": 19.0,
                "module_venues": 19.0,
                "module_demand_studio": 39.0,
                "module_recruitment": 29.0
            },
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.pricing_config.insert_one(default_pricing)
        default_pricing.pop("_id", None)
        return default_pricing
    
    return pricing


@super_admin_router.put("/pricing")
async def update_pricing_config(  # noqa: F811
    config: PricingConfig,
    admin: User = Depends(get_super_admin)
):
    """Update pricing configuration - creates new version and marks old as inactive"""
    now = datetime.now(timezone.utc)
    
    # Deactivate current active pricing
    await db.pricing_config.update_many(
        {"active": True},
        {"$set": {"active": False, "deactivated_at": now.isoformat()}}
    )
    
    # Create new pricing config
    new_config = {
        "pricing_id": f"pricing_{uuid.uuid4().hex[:12]}",
        "kora_core_price": config.kora_core_price,
        "module_prices": config.module_prices,
        "active": True,
        "created_at": now.isoformat(),
        "created_by": admin.user_id,
        "created_by_email": admin.email
    }
    
    await db.pricing_config.insert_one(new_config)
    
    await log_super_admin_action(admin.user_id, "update_pricing", None, {
        "kora_core_price": config.kora_core_price,
        "module_prices": config.module_prices
    })
    
    return {"success": True, "message": "Pricing updated successfully"}


@super_admin_router.get("/pricing/history")
async def get_pricing_history(  # noqa: F811
    limit: int = 10,
    admin: User = Depends(get_super_admin)
):
    """Get pricing configuration history"""
    history = await db.pricing_config.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"history": history}


@super_admin_router.get("/modules/available")
async def get_available_modules(admin: User = Depends(get_super_admin)):
    """Get all available modules for configuration"""
    from routers.addons import MODULE_ADDONS, CORE_MODULES, BUNDLES, KORA_CORE_PRICING
    
    # Get all possible modules (core + addons)
    all_modules = []
    
    # Add core modules
    for mod in CORE_MODULES:
        all_modules.append({
            "key": mod["key"],
            "name_en": mod.get("name_en", mod["key"]),
            "name_es": mod.get("name_es", mod["key"]),
            "path": mod.get("path", ""),
            "icon": mod.get("icon", ""),
            "type": "core"
        })
    
    # Add addon modules
    for key, info in MODULE_ADDONS.items():
        all_modules.append({
            "key": key,
            "name_en": info.get("name_en", key),
            "name_es": info.get("name_es", key),
            "path": info.get("path", ""),
            "icon": info.get("icon", ""),
            "type": "addon",
            "price_monthly": info.get("price_monthly", 0),
            "price_annual": info.get("price_annual", 0)
        })
    
    return {
        "modules": all_modules,
        "bundles": BUNDLES,
        "kora_core": KORA_CORE_PRICING
    }


@super_admin_router.get("/bundles")
async def get_bundles(admin: User = Depends(get_super_admin)):
    """Get all available bundles"""
    from routers.addons import BUNDLES
    return {"bundles": BUNDLES}


@super_admin_router.get("/pricing-structure")
async def get_pricing_structure(admin: User = Depends(get_super_admin)):
    """Get complete pricing structure including Core, Bundles, and Add-ons"""
    from routers.addons import MODULE_ADDONS, BUNDLES, KORA_CORE_PRICING
    
    # Check for custom pricing overrides in DB
    custom_pricing = await db.pricing_config.find_one({"active": True}, {"_id": 0})
    
    addons = {}
    for key, info in MODULE_ADDONS.items():
        addons[key] = {
            "name_en": info.get("name_en", key),
            "name_es": info.get("name_es", key),
            "price_monthly": info.get("price_monthly", 0),
            "price_annual": info.get("price_annual", 0)
        }
    
    return {
        "kora_core": custom_pricing.get("kora_core", KORA_CORE_PRICING) if custom_pricing else KORA_CORE_PRICING,
        "bundles": custom_pricing.get("bundles", BUNDLES) if custom_pricing else BUNDLES,
        "addons": custom_pricing.get("addons", addons) if custom_pricing else addons
    }


# ============== CUSTOM DEALS ==============

class CustomDealCreate(BaseModel):
    """Create a custom deal for negotiation"""
    deal_name: str
    deal_code: Optional[str] = None  # Discount code (optional)
    company_id: Optional[str] = None  # Link to specific company (optional)
    
    # Custom pricing
    kora_core_price_monthly: Optional[float] = None
    kora_core_price_annual: Optional[float] = None
    bundle_price_monthly: Optional[float] = None
    bundle_price_annual: Optional[float] = None
    addon_prices: Optional[dict] = None  # {module_key: {monthly: X, annual: Y}}
    
    # Discounts
    discount_percent: Optional[float] = None  # General discount percentage
    discount_months: Optional[int] = None  # Duration of discount (e.g., 6 months)
    
    # Metadata
    expires_at: Optional[str] = None
    notes: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None


class CustomDealUpdate(BaseModel):
    """Update an existing deal"""
    deal_name: Optional[str] = None
    deal_code: Optional[str] = None
    company_id: Optional[str] = None
    kora_core_price_monthly: Optional[float] = None
    kora_core_price_annual: Optional[float] = None
    bundle_price_monthly: Optional[float] = None
    bundle_price_annual: Optional[float] = None
    addon_prices: Optional[dict] = None
    discount_percent: Optional[float] = None
    discount_months: Optional[int] = None
    expires_at: Optional[str] = None
    notes: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    is_active: Optional[bool] = None


@super_admin_router.post("/deals")
async def create_custom_deal(
    deal: CustomDealCreate,
    admin: User = Depends(get_super_admin)
):
    """Create a new custom pricing deal"""
    now = datetime.now(timezone.utc)
    
    # Generate deal code if not provided
    deal_code = deal.deal_code or f"DEAL-{uuid.uuid4().hex[:8].upper()}"
    
    # Check if deal code already exists
    existing = await db.custom_deals.find_one({"deal_code": deal_code})
    if existing:
        raise HTTPException(status_code=400, detail="Deal code already exists")
    
    deal_doc = {
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "deal_name": deal.deal_name,
        "deal_code": deal_code,
        "company_id": deal.company_id,
        
        # Custom pricing
        "kora_core_price_monthly": deal.kora_core_price_monthly,
        "kora_core_price_annual": deal.kora_core_price_annual,
        "bundle_price_monthly": deal.bundle_price_monthly,
        "bundle_price_annual": deal.bundle_price_annual,
        "addon_prices": deal.addon_prices or {},
        
        # Discounts
        "discount_percent": deal.discount_percent,
        "discount_months": deal.discount_months,
        
        # Metadata
        "contact_name": deal.contact_name,
        "contact_email": deal.contact_email,
        "notes": deal.notes,
        "expires_at": deal.expires_at,
        
        # Status
        "is_active": True,
        "times_used": 0,
        "created_by": admin.user_id,
        "created_by_email": admin.email,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        
        # History
        "history": [{
            "action": "created",
            "by": admin.email,
            "at": now.isoformat(),
            "notes": deal.notes
        }]
    }
    
    await db.custom_deals.insert_one(deal_doc)
    
    await log_super_admin_action(admin.user_id, "create_deal", None, {
        "deal_name": deal.deal_name,
        "deal_code": deal_code
    })
    
    deal_doc.pop("_id", None)
    return {"success": True, "deal": deal_doc}


@super_admin_router.get("/deals")
async def list_custom_deals(
    active_only: bool = False,
    company_id: Optional[str] = None,
    admin: User = Depends(get_super_admin)
):
    """List all custom pricing deals"""
    query = {}
    if active_only:
        query["is_active"] = True
    if company_id:
        query["company_id"] = company_id
    
    deals = await db.custom_deals.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"deals": deals}


@super_admin_router.get("/deals/{deal_id}")
async def get_custom_deal(
    deal_id: str,
    admin: User = Depends(get_super_admin)
):
    """Get a specific deal by ID or code"""
    deal = await db.custom_deals.find_one(
        {"$or": [{"deal_id": deal_id}, {"deal_code": deal_id}]},
        {"_id": 0}
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@super_admin_router.put("/deals/{deal_id}")
async def update_custom_deal(
    deal_id: str,
    update: CustomDealUpdate,
    admin: User = Depends(get_super_admin)
):
    """Update an existing deal"""
    deal = await db.custom_deals.find_one({"deal_id": deal_id})
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    now = datetime.now(timezone.utc)
    
    # Build update dict
    update_dict = {"updated_at": now.isoformat()}
    changes = []
    
    for field, value in update.dict(exclude_unset=True).items():
        if value is not None:
            old_value = deal.get(field)
            if old_value != value:
                update_dict[field] = value
                changes.append(f"{field}: {old_value} → {value}")
    
    if changes:
        # Add to history
        history_entry = {
            "action": "updated",
            "by": admin.email,
            "at": now.isoformat(),
            "changes": changes
        }
        
        await db.custom_deals.update_one(
            {"deal_id": deal_id},
            {
                "$set": update_dict,
                "$push": {"history": history_entry}
            }
        )
    
    await log_super_admin_action(admin.user_id, "update_deal", deal_id, {"changes": changes})
    
    return {"success": True, "changes": changes}


@super_admin_router.delete("/deals/{deal_id}")
async def delete_custom_deal(
    deal_id: str,
    admin: User = Depends(get_super_admin)
):
    """Deactivate a deal (soft delete)"""
    deal = await db.custom_deals.find_one({"deal_id": deal_id})
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    now = datetime.now(timezone.utc)
    
    await db.custom_deals.update_one(
        {"deal_id": deal_id},
        {
            "$set": {"is_active": False, "deactivated_at": now.isoformat()},
            "$push": {"history": {
                "action": "deactivated",
                "by": admin.email,
                "at": now.isoformat()
            }}
        }
    )
    
    await log_super_admin_action(admin.user_id, "deactivate_deal", deal_id, {})
    
    return {"success": True, "message": "Deal deactivated"}


@super_admin_router.post("/deals/{deal_id}/apply/{company_id}")
async def apply_deal_to_company(
    deal_id: str,
    company_id: str,
    admin: User = Depends(get_super_admin)
):
    """Apply a deal to a specific company from admin panel"""
    deal = await db.custom_deals.find_one({"deal_id": deal_id, "is_active": True})
    if not deal:
        raise HTTPException(status_code=404, detail="Active deal not found")
    
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    now = datetime.now(timezone.utc)
    
    # Apply deal to company
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {
            "custom_deal_id": deal["deal_id"],
            "custom_deal_code": deal["deal_code"],
            "custom_deal_applied_at": now.isoformat(),
            "custom_deal_applied_by": admin.user_id
        }}
    )
    
    # Update deal usage
    await db.custom_deals.update_one(
        {"deal_id": deal_id},
        {
            "$inc": {"times_used": 1},
            "$push": {"history": {
                "action": "applied",
                "by": admin.email,
                "at": now.isoformat(),
                "company_id": company_id,
                "company_name": company.get("name")
            }}
        }
    )
    
    await log_super_admin_action(admin.user_id, "apply_deal", deal_id, {
        "company_id": company_id,
        "company_name": company.get("name")
    })
    
    return {"success": True, "message": f"Deal applied to {company.get('name')}"}


# Public endpoint to validate and apply deal code during registration
@app.post("/api/deals/validate")
async def validate_deal_code(code: str):
    """Validate a deal code (public endpoint for registration)"""
    deal = await db.custom_deals.find_one({
        "deal_code": code.upper(),
        "is_active": True
    }, {"_id": 0, "history": 0})
    
    if not deal:
        raise HTTPException(status_code=404, detail="Invalid or expired deal code")
    
    # Check expiration
    if deal.get("expires_at"):
        expires = datetime.fromisoformat(deal["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Deal code has expired")
    
    return {
        "valid": True,
        "deal_name": deal.get("deal_name"),
        "discount_percent": deal.get("discount_percent"),
        "discount_months": deal.get("discount_months"),
        "kora_core_price_monthly": deal.get("kora_core_price_monthly"),
        "kora_core_price_annual": deal.get("kora_core_price_annual"),
        "bundle_price_monthly": deal.get("bundle_price_monthly"),
        "bundle_price_annual": deal.get("bundle_price_annual")
    }


class KoraCoreConfig(BaseModel):
    """Kora Core configuration model"""
    core_modules: List[str] = []  # List of module keys included in core
    description_en: Optional[str] = None
    description_es: Optional[str] = None


@super_admin_router.get("/kora-core-config")
async def get_kora_core_config(admin: User = Depends(get_super_admin)):
    """Get current Kora Core module configuration"""
    from routers.addons import CORE_MODULES, MODULE_ADDONS
    
    config = await db.kora_core_config.find_one(
        {"active": True},
        {"_id": 0}
    )
    
    if not config:
        # Return default - all core modules + no addons
        default_core_keys = [m["key"] for m in CORE_MODULES]
        default_config = {
            "core_modules": default_core_keys,
            "description_en": "System Pulse, Client Engagement, Execution Hub, Partners, Business Clarity, People Ops, Settings",
            "description_es": "System Pulse, Client Engagement, Execution Hub, Partners, Business Clarity, People Ops, Configuración",
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.kora_core_config.insert_one(default_config)
        default_config.pop("_id", None)
        return default_config
    
    return config


@super_admin_router.put("/kora-core-config")
async def update_kora_core_config(
    config: KoraCoreConfig,
    admin: User = Depends(get_super_admin)
):
    """Update Kora Core module configuration"""
    now = datetime.now(timezone.utc)
    
    # Deactivate current config
    await db.kora_core_config.update_many(
        {"active": True},
        {"$set": {"active": False, "deactivated_at": now.isoformat()}}
    )
    
    # Create new config
    new_config = {
        "config_id": f"core_config_{uuid.uuid4().hex[:12]}",
        "core_modules": config.core_modules,
        "description_en": config.description_en,
        "description_es": config.description_es,
        "active": True,
        "created_at": now.isoformat(),
        "created_by": admin.user_id,
        "created_by_email": admin.email
    }
    
    await db.kora_core_config.insert_one(new_config)
    
    await log_super_admin_action(admin.user_id, "update_kora_core_config", None, {
        "core_modules": config.core_modules
    })
    
    return {"success": True, "message": "Kora Core configuration updated"}


@super_admin_router.delete("/organizations/{company_id}")
async def delete_organization(
    company_id: str,
    admin: User = Depends(get_super_admin)
):
    """
    Permanently delete an organization and all related data.
    This is a destructive action and cannot be undone.
    """
    # Verify organization exists
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Prevent deleting super admin's own organization
    if company_id == admin.company_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own organization")
    
    org_name = company.get("name", company_id)
    
    # Delete all related data
    deleted_counts = {}
    
    # Delete users
    result = await db.users.delete_many({"company_id": company_id})
    deleted_counts["users"] = result.deleted_count
    
    # Delete memberships
    result = await db.memberships.delete_many({"company_id": company_id})
    deleted_counts["memberships"] = result.deleted_count
    
    # Delete organization_members
    result = await db.organization_members.delete_many({"company_id": company_id})
    deleted_counts["organization_members"] = result.deleted_count
    
    # Delete subscriptions
    result = await db.subscriptions.delete_many({"company_id": company_id})
    deleted_counts["subscriptions"] = result.deleted_count
    
    # Delete organization_addons
    result = await db.organization_addons.delete_many({"company_id": company_id})
    deleted_counts["addons"] = result.deleted_count
    
    # Delete organization_configs
    result = await db.organization_configs.delete_many({"company_id": company_id})
    deleted_counts["configs"] = result.deleted_count
    
    # Delete events
    result = await db.events.delete_many({"company_id": company_id})
    deleted_counts["events"] = result.deleted_count
    
    # Delete leads/clients
    result = await db.leads.delete_many({"company_id": company_id})
    deleted_counts["leads"] = result.deleted_count
    
    # Delete proposals
    result = await db.proposals.delete_many({"company_id": company_id})
    deleted_counts["proposals"] = result.deleted_count
    
    # Delete invoices
    result = await db.supplier_invoices.delete_many({"company_id": company_id})
    deleted_counts["invoices"] = result.deleted_count
    
    # Delete usage meters
    result = await db.usage_meters.delete_many({"company_id": company_id})
    deleted_counts["usage_meters"] = result.deleted_count
    
    # Delete notifications
    result = await db.notifications.delete_many({"company_id": company_id})
    deleted_counts["notifications"] = result.deleted_count
    
    # Delete automation rules
    result = await db.automation_rules.delete_many({"company_id": company_id})
    deleted_counts["automation_rules"] = result.deleted_count
    
    # Finally, delete the organization itself
    result = await db.companies.delete_one({"company_id": company_id})
    deleted_counts["company"] = result.deleted_count
    
    # Log action
    await log_super_admin_action(admin.user_id, "delete_organization", company_id, {
        "organization_name": org_name,
        "deleted_counts": deleted_counts
    })
    
    return {
        "success": True,
        "message": f"Organization '{org_name}' and all related data deleted",
        "deleted_counts": deleted_counts
    }


# ============== BULK DATA REPAIR ==============

@super_admin_router.post("/repair-all-organizations")
async def repair_all_organizations(admin: User = Depends(get_super_admin)):
    """
    Bulk repair: ensures every company has a valid organization_config
    (with industry_type) and an active/trialing subscription.
    Safe to run multiple times — skips companies that are already complete.
    """
    from routers.auth import ensure_user_data_complete

    companies = await db.companies.find({}, {"_id": 0, "company_id": 1, "name": 1}).to_list(5000)
    repaired = []
    skipped = 0

    for company in companies:
        cid = company["company_id"]

        # Check current state
        org_config = await db.organization_configs.find_one({"company_id": cid})
        has_industry = bool(org_config and org_config.get("industry_type"))

        active_sub = await db.subscriptions.find_one({
            "company_id": cid,
            "status": {"$in": ["active", "trialing"]}
        })

        if has_industry and active_sub:
            skipped += 1
            continue

        # Repair
        await ensure_user_data_complete(cid)
        fixes = []
        if not org_config:
            fixes.append("created_org_config")
        elif not has_industry:
            fixes.append("added_industry_type")
        if not active_sub:
            fixes.append("created_trial_subscription")

        repaired.append({"company_id": cid, "name": company.get("name", ""), "fixes": fixes})

    await log_super_admin_action(admin.user_id, "repair_all_organizations", details={
        "repaired_count": len(repaired),
        "skipped_count": skipped,
    })

    return {
        "success": True,
        "repaired": len(repaired),
        "skipped": skipped,
        "total": len(companies),
        "details": repaired,
    }


# ============== TRIAL EXPIRATION CHECK ENDPOINT ==============

@api_router.get("/subscription/trial-status")
async def get_trial_status(user: User = Depends(get_current_user)):
    """
    Check if user's trial has expired or is about to expire.
    Returns info needed to show payment modal.
    """
    if not user.company_id:
        return {"has_trial": False, "expired": False}
    
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id},
        {"_id": 0}
    )
    
    if not subscription:
        return {"has_trial": False, "expired": False}
    
    now = datetime.now(timezone.utc)
    trial_ends_at = None
    
    if subscription.get("trial_ends_at"):
        trial_ends_str = subscription["trial_ends_at"]
        if isinstance(trial_ends_str, str):
            trial_ends_at = datetime.fromisoformat(trial_ends_str.replace("Z", "+00:00"))
        else:
            trial_ends_at = trial_ends_str
    
    is_demo = subscription.get("is_demo_account", False) or subscription.get("account_type") in ["demo", "influencer", "partner"]
    is_trialing = subscription.get("status") == "trialing"
    
    if not trial_ends_at:
        return {
            "has_trial": is_trialing,
            "is_demo_account": is_demo,
            "expired": False,
            "days_remaining": None
        }
    
    days_remaining = (trial_ends_at - now).days
    expired = days_remaining < 0
    expiring_soon = 0 <= days_remaining <= 7  # Warn 7 days before
    
    # Get company info
    company = await db.companies.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "name": 1, "account_type": 1}
    )
    
    # Get active modules for pricing
    active_modules = await db.organization_addons.find(
        {"company_id": user.company_id, "status": "active", "addon_type": "module"},
        {"_id": 0, "addon_id": 1}
    ).to_list(20)
    
    # Calculate monthly cost
    monthly_cost = 0
    for mod in active_modules:
        addon_def = await db.addon_definitions.find_one(
            {"addon_id": mod["addon_id"]},
            {"_id": 0, "price": 1}
        )
        if addon_def:
            monthly_cost += addon_def.get("price", 0)
    
    return {
        "has_trial": is_trialing,
        "is_demo_account": is_demo,
        "account_type": company.get("account_type") if company else None,
        "expired": expired,
        "expiring_soon": expiring_soon,
        "days_remaining": max(0, days_remaining),
        "trial_ends_at": trial_ends_at.isoformat(),
        "active_modules_count": len(active_modules),
        "estimated_monthly_cost": monthly_cost,
        "show_payment_modal": expired or expiring_soon
    }


# ============== DEMAND STUDIO ENDPOINTS ==============
# All Demand Studio endpoints moved to routers/demand_studio.py

# Include demand_studio_router
api_router.include_router(demand_studio_router)

# Include notes_router
api_router.include_router(notes_router)

# Include execution_hub_router
api_router.include_router(execution_hub_router)

# Include sharing_router (Cross-Organization Collaboration)
api_router.include_router(sharing_router)

# Include addons_router
api_router.include_router(addons_router)

# Include super_admin_router
api_router.include_router(super_admin_router)

# Include locations_router
api_router.include_router(locations_router)

# Include room_setup_router
api_router.include_router(room_setup_router)

# Include activity_logs_router
api_router.include_router(activity_logs_router)

# Include organization config router
from routers.organization_config import org_config_router
api_router.include_router(org_config_router)

# Include payments router
api_router.include_router(payments_router)
api_router.include_router(automation_router)

# Include integrations routers
from routers.integrations_api import integrations_api_router
from routers.integrations_admin import integrations_admin_router
api_router.include_router(integrations_api_router)  # /api/v1/integrations/*
api_router.include_router(integrations_admin_router, prefix="/super-admin")  # /api/super-admin/integrations/*

# Include Google Calendar router
from routers.google_calendar import router as google_calendar_router
api_router.include_router(google_calendar_router)  # /api/oauth/calendar/*

from routers.month_end_closing import router as month_end_router
app.include_router(month_end_router)  # /api/people-ops/month-end/*

from routers.fx import router as fx_router
app.include_router(fx_router)  # /api/fx/*
# Fase 1a · canonical price cascade resolver
from routers.pricing_resolver import pricing_router  # noqa: E402
app.include_router(pricing_router)

from routers.time_clock import router as time_clock_router
app.include_router(time_clock_router)  # /api/people-ops/time-clock/*

# Include Comms router (Kora Comms - omnichannel messaging)
from routers.comms import comms_router
api_router.include_router(comms_router)  # /api/comms/*

# Include Support Tickets router (Bug reports)
from routers.support_tickets import support_router
api_router.include_router(support_router)  # /api/support/*

# Include Studio router (Tezza-like editor + Feed)
from routers.studio import studio_router
api_router.include_router(studio_router)  # /api/studio/*

# Include Instagram OAuth router (real Instagram login flow)
from routers.instagram_oauth import instagram_oauth_router
api_router.include_router(instagram_oauth_router)  # /api/instagram/*

# Include Social Sharing router (external agency collaboration)
from routers.social_sharing import social_sharing_router
api_router.include_router(social_sharing_router)  # /api/social-sharing/*

# Include Account Sharing router (account-centric model)
from routers.account_sharing import account_sharing_router
api_router.include_router(account_sharing_router)  # /api/account-sharing/*

# Include Activity Feed router
from routers.activity_feed import activity_feed_router
api_router.include_router(activity_feed_router)  # /api/activity-feed/*

# Include Company Sharing router (granular permissions)
from routers.company_sharing import company_sharing_router
api_router.include_router(company_sharing_router)  # /api/company-sharing/*

# Include Emergency Restore router (TEMPORARY - delete after fix)
from routers.emergency_restore import emergency_router
api_router.include_router(emergency_router)  # /api/emergency/*

# User organizations endpoint - Get all organizations user has access to
@api_router.get("/user/organizations")
async def get_user_organizations(user: User = Depends(get_current_user)):
    """
    Get all organizations the user has access to:
    - Organizations they own/admin
    - Organizations shared with them (via memberships)
    If the user has no own company, one is auto-created.
    """
    organizations = []
    
    # 1. Determine user's own company ID
    own_company_id = user.company_id or user.active_org_id
    
    # 2. If no company_id, check memberships for owner/admin role
    if not own_company_id:
        own_membership = await db.memberships.find_one({
            "user_id": user.user_id,
            "role": {"$in": ["owner", "admin"]},
            "$or": [{"status": "active"}, {"status": {"$exists": False}}]
        }, {"_id": 0})
        if own_membership:
            own_company_id = own_membership.get("company_id") or own_membership.get("organization_id")
    
    # 3. If still no company, auto-create one for the user
    if not own_company_id:
        import uuid
        from datetime import datetime, timezone
        own_company_id = f"company_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        user_name = user.name or user.email.split("@")[0]
        company_doc = {
            "company_id": own_company_id,
            "name": f"{user_name}",
            "industry_template": "general",
            "logo_url": None,
            "primary_color": "#3A4D3F",
            "secondary_color": "#E5DCC5",
            "default_language": "es",
            "currency": "USD",
            "created_at": now.isoformat()
        }
        await db.companies.insert_one(company_doc)
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {"company_id": own_company_id}}
        )
    
    # 4. Fetch own company document
    own_company = await db.companies.find_one(
        {"company_id": own_company_id},
        {"_id": 0, "company_id": 1, "name": 1, "logo": 1, "logo_url": 1}
    )
    if own_company:
        organizations.append({
            "org_id": own_company["company_id"],
            "name": own_company.get("name", "Mi Empresa"),
            "logo": own_company.get("logo") or own_company.get("logo_url"),
            "is_own": True,
            "role": "owner"
        })
    
    # 5. Get organizations shared with user (via memberships), excluding own
    memberships = await db.memberships.find({
        "user_id": user.user_id,
        "$or": [{"status": "active"}, {"status": {"$exists": False}}]
    }).to_list(100)
    
    if memberships:
        shared_ids = set()
        membership_map = {}
        for m in memberships:
            cid = m.get("company_id") or m.get("organization_id")
            if cid and cid != own_company_id:
                shared_ids.add(cid)
                membership_map[cid] = m
        
        if shared_ids:
            shared_companies = await db.companies.find(
                {"company_id": {"$in": list(shared_ids)}},
                {"_id": 0, "company_id": 1, "name": 1, "logo": 1, "logo_url": 1}
            ).to_list(100)
            
            for company in shared_companies:
                membership = membership_map.get(company["company_id"], {})
                organizations.append({
                    "org_id": company["company_id"],
                    "name": company.get("name", "Empresa"),
                    "logo": company.get("logo") or company.get("logo_url"),
                    "is_own": False,
                    "role": membership.get("role", "viewer"),
                    "permissions": membership.get("permissions", {})
                })
    
    return organizations

# Include Notifications router
from routers.notifications import notifications_router
api_router.include_router(notifications_router)  # /api/notifications/*

# Include Culinary Digest router (Sprint 5)
from routers.culinary_digest import culinary_digest_router
api_router.include_router(culinary_digest_router)  # /api/culinary-digest/*
from routers.menu_engineering import menu_engineering_router as _me_router
api_router.include_router(_me_router)  # /api/menu-engineering/* (extracted in refactor sprint)

# Include Brand Hub router
from routers.brand_hub import brand_hub_router
api_router.include_router(brand_hub_router)  # /api/brand-hub/*

# Include Settings router
from routers.settings import settings_router
api_router.include_router(settings_router)  # /api/settings/*

# Include Partners router
from routers.partners import partners_router
api_router.include_router(partners_router)  # /api/partners/*

# Include Migration router
from routers.migration import migration_router
api_router.include_router(migration_router)  # /api/migration/*

# Include ITBIS router
from routers.itbis import itbis_router
api_router.include_router(itbis_router)  # /api/finance/itbis/*

# Include Exports router
from routers.exports import exports_router
api_router.include_router(exports_router)  # /api/exports/*

# Include Comments router
from routers.comments import comments_router
api_router.include_router(comments_router)  # /api/comments/*

# Include Presence router
from routers.presence import presence_router
api_router.include_router(presence_router)  # /api/presence/*

# Include Guest Flow router
from routers.guest_flow import guest_flow_router
api_router.include_router(guest_flow_router)  # /api/guest-flow/*
api_router.include_router(launch_router)  # /api/launch/*

# ============== E-INVOICING (Phase 0 — feature flag + config only) ==============
# Late inclusion because the factory needs `get_super_admin` which is defined
# further down in this file.
from routers.efactura import build_efactura_router as _build_efactura_router
_efactura_router, _efactura_super_router = _build_efactura_router(
    db=db,
    get_current_user=get_current_user,
    require_super_admin=get_super_admin,
    User=User,
)
api_router.include_router(_efactura_router)
api_router.include_router(_efactura_super_router)


# ============== VERSION ENDPOINT (cache-busting for multi-tenant) ==============
# Lightweight endpoint the frontend polls every couple of minutes. Whenever
# `build` changes between polls, the SPA prompts the user to reload — that's
# how we recover from CDN/browser-cached index.html across all tenants after
# a redeploy without anyone having to clear cache manually.
import subprocess as _subprocess

_START_TIME_ISO = datetime.now(timezone.utc).isoformat()
try:
    _GIT_COMMIT = _subprocess.check_output(
        ["git", "-C", "/app", "rev-parse", "--short", "HEAD"],
        stderr=_subprocess.DEVNULL, timeout=2,
    ).decode().strip()
except Exception:
    _GIT_COMMIT = os.environ.get("GIT_COMMIT", "dev")


@api_router.get("/version")
async def get_version():
    """Public endpoint — no auth, very cheap, called by every tab every 2min."""
    return {
        "version": "0.1.0",
        "build": _START_TIME_ISO,
        "commit": _GIT_COMMIT,
    }



# General file upload endpoint
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload a file (image or video) and return its URL"""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File type not allowed. Use images or videos.")
    
    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    filename = f"{uuid.uuid4().hex[:16]}.{ext}"
    filepath = UPLOADS_DIR / filename
    
    # Save file
    try:
        _content = await file.read()
        filepath.write_bytes(_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Return URL
    file_url = f"/api/uploads/{filename}"
    return {"url": file_url, "file_url": file_url, "filename": filename}

# Serve uploaded files
@api_router.get("/uploads/{filename}")
async def get_upload(filename: str):
    filepath = UPLOADS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)

# Serve partner attachment files
@api_router.get("/uploads/partner_attachments/{filename}")
async def get_partner_attachment_file(filename: str):
    filepath = UPLOADS_DIR / "partner_attachments" / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)

# Serve execution hub attachment files
@api_router.get("/uploads/exec_attachments/{filename}")
async def get_exec_attachment_file(filename: str):
    filepath = UPLOADS_DIR / "exec_attachments" / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)

@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        from scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass
    client.close()

# TEMPORARY DEBUG ENDPOINT - DELETE AFTER FIX
@api_router.get("/debug/whoami")
async def debug_whoami(request: Request):
    """Debug endpoint to see exactly what user is being resolved"""
    from routers.auth import get_current_user
    try:
        user = await get_current_user(request)
        # Get the actual company from DB
        company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0, "name": 1, "legal_name": 1})
        return {
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "company_id": user.company_id,
            "active_org_id": user.active_org_id,
            "company_name": company.get("name") if company else "NOT FOUND",
            "company_legal_name": company.get("legal_name") if company else None,
            "is_super_admin": user.is_super_admin
        }
    except Exception as e:
        return {"error": str(e)}

# IMPORTANT: app.include_router MUST be the last statement that touches api_router.
# FastAPI copies routes at call-time; anything added to api_router AFTER this line is silently orphaned (404).
app.include_router(api_router)
