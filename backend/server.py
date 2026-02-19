from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import io
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
from routers.crm import crm_router, leads_router, contacts_router, lead_forms_router
from routers.execution_hub import execution_hub_router
from routers.addons import addons_router, ensure_default_addons
from routers.locations import locations_router
from routers.room_setup import room_setup_router
from routers.activity_logs import activity_logs_router
from routers.payments import payments_router
from routers.automation import automation_router
from models.crm import (
    LeadCreate, Lead, ContactCreate, Contact,
    ClientCreate, Client, CommLogCreate, CommLog,
    LeadFormCreate, LeadForm, LeadFormFieldConfig, CustomFieldConfig
)

# Create the main app
app = FastAPI(title="Kora OS - Business Management Platform")

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
events_router = APIRouter(prefix="/events", tags=["Events"])
recipes_router = APIRouter(prefix="/recipes", tags=["Recipes"])
plated_menus_router = APIRouter(prefix="/plated-menus", tags=["Plated Menus"])
inventory_router = APIRouter(prefix="/inventory", tags=["Inventory"])
suppliers_router = APIRouter(prefix="/suppliers", tags=["Suppliers"])
operations_router = APIRouter(prefix="/operations", tags=["Operations Inventory"])
documents_router = APIRouter(prefix="/documents", tags=["Documents"])
finance_router = APIRouter(prefix="/finance", tags=["Finance"])
settings_router = APIRouter(prefix="/settings", tags=["Settings"])
portal_router = APIRouter(prefix="/portal", tags=["Client Portal"])
reports_router = APIRouter(prefix="/reports", tags=["Reports"])
event_order_router = APIRouter(prefix="/event-orders", tags=["Event Orders"])
proposals_router = APIRouter(prefix="/proposals", tags=["Proposals"])
audit_router = APIRouter(prefix="/audit", tags=["Audit"])
purchase_orders_router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])
expenses_router = APIRouter(prefix="/expenses", tags=["Expenses"])
allergens_router = APIRouter(prefix="/allergens", tags=["Allergens"])
# business_clarity_router imported from routers.business_clarity
orchestration_router = APIRouter(prefix="/orchestration", tags=["Event Orchestration"])
production_router = APIRouter(prefix="/production", tags=["Production"])
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

# Supplier Models - Enhanced
class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    delivery_days: List[str] = []  # ["Monday", "Wednesday", "Friday"]
    minimum_order: float = 0.0
    payment_terms: str = "net30"
    notes: Optional[str] = None

class Supplier(BaseModel):
    supplier_id: str
    company_id: str
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    delivery_days: List[str] = []
    minimum_order: float = 0.0
    payment_terms: str = "net30"
    notes: Optional[str] = None
    created_at: datetime

# Ingredient Models - Enhanced for recipe costing
class IngredientCreate(BaseModel):
    name: str
    category: str  # protein, dairy, produce, dry_goods, beverage, packaging, etc.
    inventory_type: str = "food"  # food, packaging, disposable, equipment, event_supply
    unit: str  # g, kg, ml, L, oz, lb, unit
    cost_per_unit: float = 0.0
    stock_quantity: float = 0.0
    min_stock_level: float = 0.0
    par_level: float = 0.0
    yield_waste_percent: float = 0.0
    allergens: List[str] = []
    storage_location: str = "dry"  # dry, fridge, freezer
    reorder_threshold: float = 0.0
    preferred_supplier_id: Optional[str] = None
    alternate_supplier_ids: List[str] = []
    pack_size: float = 1.0
    pack_unit: str = "unit"  # case, bag, box, gallon
    replacement_cost: float = 0.0  # For equipment - cost to replace if lost/damaged
    # Operations Supplies specific fields
    cost_center: str = "operations"  # operations, kitchen, service, logistics, admin
    purchase_date: Optional[str] = None  # For depreciation tracking
    useful_life_years: int = 5  # Expected lifespan for depreciation
    depreciation_rate: float = 20.0  # Annual depreciation percentage

class Ingredient(BaseModel):
    ingredient_id: str
    company_id: str
    name: str
    category: str
    inventory_type: str = "food"
    item_type: str = "RAW"  # RAW or PREPARED
    linked_recipe_id: Optional[str] = None  # For PREPARED items
    unit: str
    cost_per_unit: float
    stock_quantity: float
    min_stock_level: float
    par_level: float = 0.0
    yield_waste_percent: float = 0.0
    allergens: List[str] = []
    storage_location: str = "dry"
    reorder_threshold: float = 0.0
    preferred_supplier_id: Optional[str] = None
    alternate_supplier_ids: List[str] = []
    pack_size: float = 1.0
    pack_unit: str = "unit"
    average_cost: float = 0.0
    price_history: List[Dict[str, Any]] = []
    replacement_cost: float = 0.0  # For equipment - cost to replace if lost/damaged
    # Operations Supplies specific fields
    cost_center: str = "operations"
    purchase_date: Optional[str] = None
    useful_life_years: int = 5
    depreciation_rate: float = 20.0
    created_at: datetime

# Recipe Models - Enhanced for detailed costing
class RecipeIngredient(BaseModel):
    ingredient_id: str
    name: str
    quantity: float
    unit: str
    cost: float = 0.0

class RecipeCreate(BaseModel):
    name: str
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    category: str
    yield_quantity: float = 1.0
    yield_unit: str = "portion"  # portion, kg, L, unit
    prep_time: int = 0  # minutes
    cook_time: int = 0  # minutes
    difficulty: str = "medium"  # easy, medium, hard
    ingredients: List[RecipeIngredient] = []
    instructions: Optional[str] = None
    instructions_es: Optional[str] = None
    presentation_notes: Optional[str] = None
    chef_notes: Optional[str] = None
    photo_url: Optional[str] = None
    allergens: List[str] = []
    dietary_tags: List[str] = []  # vegetarian, vegan, gluten-free, etc.
    default_portion_price: float = 0.0  # Default selling price per portion
    recipe_type: str = "Final"  # Base, Component, Final - for recipe composition
    is_public: bool = False  # Can be used in menus
    # Sub-recipes (composition)
    sub_recipes: List[Dict[str, Any]] = []  # [{recipe_id, quantity, unit}]

class Recipe(BaseModel):
    recipe_id: str
    company_id: str
    name: str
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    category: str
    yield_quantity: float
    yield_unit: str
    prep_time: Optional[int] = 0
    cook_time: Optional[int] = 0
    difficulty: Optional[str] = "medium"
    ingredients: List[Dict[str, Any]] = []
    instructions: Optional[str] = None
    instructions_es: Optional[str] = None
    presentation_notes: Optional[str] = None
    chef_notes: Optional[str] = None
    photo_url: Optional[str] = None
    allergens: List[str] = []
    dietary_tags: List[str] = []
    default_portion_price: float = 0.0
    recipe_type: str = "Final"
    is_public: bool = False
    sub_recipes: List[Dict[str, Any]] = []
    # Calculated fields
    total_cost: float = 0.0
    cost_per_portion: float = 0.0
    margin_percentage: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Allow extra fields from DB
    class Config:
        extra = "allow"

# Supplier Item Models (linking suppliers to ingredients)
class SupplierItemCreate(BaseModel):
    supplier_id: str
    ingredient_id: str
    supplier_sku: str = ""
    supplier_item_name: str = ""
    purchase_unit: str = "unit"  # case, bag, box, gallon, lb, kg
    pack_size_conversion: float = 1.0  # e.g., 1 case = 12 units
    last_purchase_price: float = 0.0
    tax_rate: float = 0.0

# Plated Menu Models
class MenuCourse(BaseModel):
    """A course in a plated menu (Appetizer, Entree, Dessert, etc.)"""
    course_id: str
    course_name: str  # appetizer, salad, soup, entree, dessert
    course_order: int = 0
    items: List[Dict[str, Any]] = []  # [{recipe_id, recipe_name, portions_per_guest, notes}]

class PlatedMenuCreate(BaseModel):
    name: str
    description: Optional[str] = None
    menu_type: str = "plated"  # plated, buffet, cocktail, grab_and_go
    pricing_model: str = "per_guest"  # per_guest, fixed
    serving_style: str = "plated"  # plated, family_style, stations
    courses: List[MenuCourse] = []
    buffer_percentage: float = 0.0  # Extra % for prep loss/overage
    notes: Optional[str] = None

class PlatedMenu(BaseModel):
    menu_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    menu_type: str = "plated"
    pricing_model: str = "per_guest"
    serving_style: str = "plated"
    courses: List[MenuCourse] = []
    buffer_percentage: float = 0.0
    cost_per_guest: float = 0.0  # Calculated from recipe costs
    cost_with_buffer: float = 0.0  # cost_per_guest * (1 + buffer_percentage/100)
    notes: Optional[str] = None
    status: str = "active"  # active, archived
    created_at: datetime
    updated_at: datetime

# Purchase Order Models
class PurchaseOrderLineCreate(BaseModel):
    ingredient_id: str
    ingredient_name: str
    quantity_needed: float
    quantity_on_hand: float
    quantity_to_order: float
    purchase_unit: str
    pack_size: float = 1.0
    unit_cost: float
    total_cost: float
    notes: Optional[str] = None

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    event_id: Optional[str] = None
    lines: List[PurchaseOrderLineCreate]
    notes: Optional[str] = None

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

# ============== INVENTORY MODELS ==============

class InventoryItemCreate(BaseModel):
    name: str
    inventory_type: str = "Food"  # Food, Packaging, Disposable, Equipment, EventSupply
    category: Optional[str] = None
    unit: str = "unit"  # kg, lb, unit, liter, etc.
    pack_size: float = 1.0  # purchasing unit (e.g., 1kg bag, 24-pack)
    pack_unit: Optional[str] = None  # e.g., "bag", "case", "box"
    current_stock: float = 0.0
    par_level: float = 0.0  # minimum stock level for alerts
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: float = 0.0
    status: str = "Active"  # Active, Inactive

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    inventory_type: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    pack_size: Optional[float] = None
    pack_unit: Optional[str] = None
    current_stock: Optional[float] = None
    par_level: Optional[float] = None
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: Optional[float] = None
    status: Optional[str] = None

class InventoryItem(BaseModel):
    item_id: str
    company_id: str
    name: str
    inventory_type: str
    category: Optional[str] = None
    unit: str
    pack_size: float = 1.0
    pack_unit: Optional[str] = None
    current_stock: float = 0.0  # On Hand - physical stock
    reserved_quantity: float = 0.0  # Reserved for events (logical allocation)
    par_level: float = 0.0
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: float = 0.0
    status: str = "Active"
    created_at: datetime
    updated_at: datetime
    
    @property
    def available_quantity(self) -> float:
        """Available = On Hand - Reserved"""
        return max(0, self.current_stock - self.reserved_quantity)

class InventoryTransactionCreate(BaseModel):
    inventory_item_id: str
    event_id: Optional[str] = None
    transaction_type: str  # Purchase, Usage, Adjustment, Waste
    quantity: float
    unit_cost: Optional[float] = None
    notes: Optional[str] = None

class InventoryTransaction(BaseModel):
    transaction_id: str
    company_id: str
    inventory_item_id: str
    event_id: Optional[str] = None
    transaction_type: str
    quantity: float
    unit_cost: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by: str

# ============== PURCHASE LIST MODELS ==============

class PurchaseListItem(BaseModel):
    inventory_item_id: str
    item_name: str
    unit: str
    required_qty: float
    in_stock_qty: float
    to_purchase_qty: float
    unit_cost: float = 0.0
    total_cost: float = 0.0
    status: str = "Short"  # InStock, Short, Unknown

class PurchaseListCreate(BaseModel):
    event_id: str
    supplier_id: Optional[str] = None

class PurchaseList(BaseModel):
    purchase_list_id: str
    company_id: str
    event_id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[PurchaseListItem] = []
    total_cost: float = 0.0
    status: str = "Draft"  # Draft, Ordered, Received
    created_at: datetime
    updated_at: datetime

# ============== PROPOSAL MODELS (Client-facing Contract) ==============

class ProposalCreate(BaseModel):
    """Proposal acts as commercial proposal and client-facing contract"""
    valid_until: Optional[datetime] = None
    client_notes: Optional[str] = None
    payment_terms: Optional[str] = None

class ProposalUpdate(BaseModel):
    status: Optional[str] = None  # Draft, Sent, Accepted, Rejected
    valid_until: Optional[datetime] = None
    client_notes: Optional[str] = None
    payment_terms: Optional[str] = None

class Proposal(BaseModel):
    proposal_id: str
    event_id: str
    company_id: str
    proposal_number: str
    status: str = "Draft"  # Draft, Sent, Accepted, Rejected
    valid_until: Optional[datetime] = None
    client_notes: Optional[str] = None
    payment_terms: Optional[str] = None
    subtotal: float = 0.0
    discount_amount: float = 0.0
    tax_details: List[Dict[str, Any]] = []
    total_tax: float = 0.0
    total: float = 0.0
    # Internal financials (admin/owner only)
    total_cost: float = 0.0
    total_margin: float = 0.0
    margin_percentage: float = 0.0
    last_edited_at: datetime
    created_at: datetime

# ============== ORDER ITEM MODELS (Unified Commercial Engine) ==============

class OrderItemCreate(BaseModel):
    """Unified order item - represents everything sold in an event"""
    item_type: str = "Service"  # Food, Service, Rental, Fee
    reference_id: Optional[str] = None  # menu_id / recipe_id (nullable)
    description: str  # Client-facing description
    quantity: float = 1.0
    unit_price: float = 0.0  # Visible to client
    internal_cost: Optional[float] = None  # Hidden, internal only
    category_id: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: int = 0
    section_title: Optional[str] = None  # Custom section title for grouping
    section_time: Optional[str] = None   # Service time for section

class OrderItemUpdate(BaseModel):
    item_type: Optional[str] = None
    reference_id: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    internal_cost: Optional[float] = None
    category_id: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: Optional[int] = None
    section_title: Optional[str] = None
    section_time: Optional[str] = None

class OrderItem(BaseModel):
    """Order item with calculated fields"""
    item_id: str
    event_id: str
    proposal_id: str
    item_type: str
    reference_id: Optional[str] = None
    description: str
    quantity: float
    unit_price: float
    internal_cost: Optional[float] = None
    total_price: float  # quantity * unit_price
    total_cost: Optional[float] = None  # quantity * internal_cost
    margin_amount: Optional[float] = None  # total_price - total_cost
    margin_percentage: Optional[float] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: int
    created_at: datetime
    updated_at: datetime

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
    show_logo: bool = True
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

# Recipe Portion Format (Multiple pricing formats per recipe)
class RecipePortionFormatCreate(BaseModel):
    format_name: str  # "Plato", "Bowl 12oz", "Mini", "Tray 1/2"
    portions_obtained: float = 1.0
    portion_unit: str = "serving"  # serving, plate, bowl, tray, piece, ml, oz, g
    sell_price: float = 0.0
    sell_price_tax_included: bool = False
    target_margin_pct: Optional[float] = None
    is_default: bool = False
    notes: Optional[str] = None

class RecipePortionFormat(BaseModel):
    format_id: str
    recipe_id: str
    company_id: str
    format_name: str
    portions_obtained: float
    portion_unit: str
    sell_price: float
    sell_price_tax_included: bool = False
    target_margin_pct: Optional[float] = None
    suggested_price: float = 0.0  # Calculated from cost & target margin
    cost_per_portion: float = 0.0  # Calculated from recipe cost
    margin_pct: float = 0.0  # Calculated
    is_default: bool = False
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# Recipe Packaging Format
class RecipePackagingFormatCreate(BaseModel):
    packaging_inventory_item_id: str
    qty_per_portion: float = 1.0
    notes: Optional[str] = None

class RecipePackagingFormat(BaseModel):
    format_id: str
    recipe_id: str
    company_id: str
    packaging_inventory_item_id: str
    packaging_item_name: Optional[str] = None
    qty_per_portion: float
    notes: Optional[str] = None

# Extended Recipe fields (add to existing recipe)
class RecipeExtendedUpdate(BaseModel):
    allergens: Optional[List[str]] = None  # allergen_ids
    work_category: Optional[str] = None  # Partida de trabajo (prep station)
    recipe_code: Optional[str] = None  # Optional internal code
    verified_status: Optional[str] = None  # Draft, Verified

# Extended PlatedMenu fields (pricing)
class PlatedMenuExtendedUpdate(BaseModel):
    default_guest_count: Optional[int] = None
    sell_price_per_guest: Optional[float] = None
    target_margin_pct: Optional[float] = None
    suggested_sell_price_per_guest: Optional[float] = None
    tax_included: Optional[bool] = None

# Extended Supplier Model
class SupplierExtendedUpdate(BaseModel):
    company_name: Optional[str] = None
    payment_terms: Optional[str] = None  # Cash, Transfer, Credit, Mixed
    has_credit: Optional[bool] = None
    credit_limit: Optional[float] = None
    usual_delivery_days: Optional[List[str]] = None
    tax_id: Optional[str] = None  # RFC / NIT

# Extended Inventory Item (2 suppliers, purchase details)
class InventoryItemExtendedUpdate(BaseModel):
    secondary_supplier_id: Optional[str] = None
    purchase_unit: Optional[str] = None  # case, box, pack
    purchase_pack_size: Optional[float] = None  # units per case
    min_order_qty: Optional[float] = None
    lead_time_days: Optional[int] = None

# Inventory Price History
class InventoryPriceHistoryCreate(BaseModel):
    supplier_id: Optional[str] = None
    unit_cost: float
    purchase_unit: str
    source: str = "Manual"  # Manual, PO, Invoice
    notes: Optional[str] = None

class InventoryPriceHistory(BaseModel):
    history_id: str
    inventory_item_id: str
    company_id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    effective_date: datetime
    unit_cost: float
    purchase_unit: str
    source: str  # Manual, PO, Invoice
    notes: Optional[str] = None

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

class PurchaseOrderLineModel(BaseModel):
    line_id: str
    inventory_item_id: str
    item_name: str
    qty_ordered: float
    purchase_unit: str
    unit_cost: float
    line_total: float  # qty_ordered * unit_cost
    qty_received: float = 0.0
    notes: Optional[str] = None

class PurchaseOrderLineCreateModel(BaseModel):
    inventory_item_id: str
    item_name: str
    qty_ordered: float
    purchase_unit: str
    unit_cost: float
    notes: Optional[str] = None

class PurchaseOrderFullCreate(BaseModel):
    """Full Purchase Order create model"""
    supplier_id: str
    needed_by_date: Optional[datetime] = None
    payment_method: str = "Transfer"  # Cash, Transfer, Credit, Other
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineCreateModel] = []

class PurchaseOrderFull(BaseModel):
    """Full Purchase Order model"""
    po_id: str
    company_id: str
    po_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    status: str = "Draft"  # Draft, Sent, PartiallyReceived, Received, Cancelled
    created_at: datetime
    updated_at: datetime
    needed_by_date: Optional[datetime] = None
    payment_method: str = "Transfer"
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineModel] = []
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None

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
    inventory_item_id: Optional[str] = None  # Link to inventory for disposables
    unit: str = "unit"
    is_active: bool = True

class PicklistItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    item_type: Optional[str] = None
    default_price: Optional[float] = None
    internal_cost: Optional[float] = None
    recipe_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None

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
    inventory_item_id: Optional[str] = None
    unit: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

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

# ============== UNIT CONVERSION HELPERS ==============

UNIT_CONVERSIONS = {
    "g": {"kg": 0.001, "oz": 0.035274, "lb": 0.00220462},
    "kg": {"g": 1000, "oz": 35.274, "lb": 2.20462},
    "oz": {"g": 28.3495, "kg": 0.0283495, "lb": 0.0625},
    "lb": {"g": 453.592, "kg": 0.453592, "oz": 16},
    "ml": {"L": 0.001, "oz": 0.033814},
    "L": {"ml": 1000, "oz": 33.814},
    "unit": {"each": 1, "piece": 1},
    "each": {"unit": 1, "piece": 1},
}

def convert_units(quantity: float, from_unit: str, to_unit: str) -> float:
    """Convert quantity from one unit to another"""
    if from_unit == to_unit:
        return quantity
    if from_unit in UNIT_CONVERSIONS and to_unit in UNIT_CONVERSIONS.get(from_unit, {}):
        return quantity * UNIT_CONVERSIONS[from_unit][to_unit]
    return quantity  # Return as-is if no conversion found

# ============== AUTH ROUTES ==============
# All auth routes moved to routers/auth.py

# All CRM routes moved to routers/crm.py (leads, contacts, clients, lead_forms)

# ============== SUPPLIERS ROUTES ==============

@suppliers_router.get("", response_model=List[Supplier])
async def get_suppliers(user: User = Depends(get_current_user)):
    suppliers = await db.suppliers.find({"company_id": user.company_id}, {"_id": 0}).sort("name", 1).to_list(1000)
    for s in suppliers:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
        if "delivery_days" not in s:
            s["delivery_days"] = []
        if "minimum_order" not in s:
            s["minimum_order"] = 0.0
        if "payment_terms" not in s:
            s["payment_terms"] = "net30"
    return suppliers

@suppliers_router.post("", response_model=Supplier)
async def create_supplier(data: SupplierCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    supplier_id = f"sup_{uuid.uuid4().hex[:12]}"
    
    supplier_doc = {
        "supplier_id": supplier_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.suppliers.insert_one(supplier_doc)
    del supplier_doc["_id"]
    supplier_doc["created_at"] = now
    return Supplier(**supplier_doc)

@suppliers_router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, user: User = Depends(get_current_user)):
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id, "company_id": user.company_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if isinstance(supplier.get("created_at"), str):
        supplier["created_at"] = datetime.fromisoformat(supplier["created_at"])
    return Supplier(**supplier)

@suppliers_router.put("/{supplier_id}", response_model=Supplier)
async def update_supplier(supplier_id: str, data: SupplierCreate, user: User = Depends(get_current_user)):
    result = await db.suppliers.update_one(
        {"supplier_id": supplier_id, "company_id": user.company_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return await get_supplier(supplier_id, user)

@suppliers_router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: str, user: User = Depends(get_current_user)):
    result = await db.suppliers.delete_one({"supplier_id": supplier_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted"}

# Supplier Items (SKU mapping)
@suppliers_router.post("/items")
async def create_supplier_item(data: SupplierItemCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    item_id = f"si_{uuid.uuid4().hex[:12]}"
    
    item_doc = {
        "item_id": item_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.supplier_items.insert_one(item_doc)
    del item_doc["_id"]
    return item_doc

@suppliers_router.get("/items/by-ingredient/{ingredient_id}")
async def get_supplier_items_for_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    items = await db.supplier_items.find({"company_id": user.company_id, "ingredient_id": ingredient_id}, {"_id": 0}).to_list(100)
    return items

# ============== INVENTORY ROUTES - Enhanced ==============

@inventory_router.get("/ingredients", response_model=List[Ingredient])
async def get_ingredients(inventory_type: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if inventory_type:
        query["inventory_type"] = inventory_type
    
    ingredients = await db.ingredients.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    
    for i in ingredients:
        for field in ["created_at", "updated_at"]:
            if i.get(field) and isinstance(i[field], str):
                i[field] = datetime.fromisoformat(i[field])
        # Set defaults for new fields
        for field, default in [("inventory_type", "food"), ("par_level", 0.0), ("yield_waste_percent", 0.0), ("allergens", []), ("storage_location", "dry"), ("reorder_threshold", 0.0), ("alternate_supplier_ids", []), ("pack_size", 1.0), ("pack_unit", "unit"), ("average_cost", i.get("cost_per_unit", 0)), ("price_history", [])]:
            if field not in i:
                i[field] = default
    return ingredients

@inventory_router.post("/ingredients", response_model=Ingredient)
async def create_ingredient(data: IngredientCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"
    
    ingredient_doc = {
        "ingredient_id": ingredient_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "average_cost": data.cost_per_unit,
        "price_history": [{"price": data.cost_per_unit, "date": now.isoformat()}],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.ingredients.insert_one(ingredient_doc)
    del ingredient_doc["_id"]
    ingredient_doc["created_at"] = now
    ingredient_doc["updated_at"] = now
    return Ingredient(**ingredient_doc)

@inventory_router.get("/ingredients/{ingredient_id}", response_model=Ingredient)
async def get_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    for field in ["created_at", "updated_at"]:
        if ingredient.get(field) and isinstance(ingredient[field], str):
            ingredient[field] = datetime.fromisoformat(ingredient[field])
    return Ingredient(**ingredient)

@inventory_router.put("/ingredients/{ingredient_id}", response_model=Ingredient)
async def update_ingredient(ingredient_id: str, data: IngredientCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    
    # Get current ingredient to check price change
    current = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    update_data = {**data.model_dump(), "updated_at": now.isoformat()}
    
    # Log price change
    if current.get("cost_per_unit", 0) != data.cost_per_unit:
        price_history = current.get("price_history", [])
        price_history.append({"price": data.cost_per_unit, "date": now.isoformat(), "previous": current.get("cost_per_unit")})
        update_data["price_history"] = price_history
    
    await db.ingredients.update_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"$set": update_data})
    return await get_ingredient(ingredient_id, user)

@inventory_router.delete("/ingredients/{ingredient_id}")
async def delete_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    result = await db.ingredients.delete_one({"ingredient_id": ingredient_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return {"message": "Ingredient deleted"}

@inventory_router.post("/ingredients/{ingredient_id}/adjust")
async def adjust_stock(ingredient_id: str, data: dict, user: User = Depends(get_current_user)):
    """Adjust stock quantity (waste, breakage, count correction)"""
    now = datetime.now(timezone.utc)
    adjustment = data.get("adjustment", 0)
    adjustment_qty = data.get("adjustment_qty")  # Absolute quantity
    reason = data.get("reason", "manual")
    adjustment_type = data.get("adjustment_type", "manual")
    
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    # Support both adjustment (delta) and adjustment_qty (absolute)
    if adjustment_qty is not None:
        new_quantity = adjustment_qty
    else:
        new_quantity = ingredient.get("stock_quantity", 0) + adjustment
    
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id},
        {"$set": {"stock_quantity": new_quantity, "updated_at": now.isoformat()}}
    )
    
    # Log adjustment
    await db.inventory_adjustments.insert_one({
        "adjustment_id": f"adj_{uuid.uuid4().hex[:8]}",
        "company_id": user.company_id,
        "ingredient_id": ingredient_id,
        "adjustment": new_quantity - ingredient.get("stock_quantity", 0),
        "adjustment_type": adjustment_type,
        "reason": reason,
        "previous_quantity": ingredient.get("stock_quantity", 0),
        "new_quantity": new_quantity,
        "user_id": user.user_id,
        "created_at": now.isoformat()
    })
    
    return {"new_quantity": new_quantity, "success": True}

@inventory_router.patch("/ingredients/{ingredient_id}")
async def patch_ingredient(ingredient_id: str, data: dict, user: User = Depends(get_current_user)):
    """Partial update of ingredient (for unit_cost, stock_quantity, etc.)"""
    now = datetime.now(timezone.utc)
    
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    # Allowed fields for partial update
    allowed_fields = ["unit_cost", "cost_per_unit", "stock_quantity", "min_stock_level", "par_level", "notes"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields and v is not None}
    
    # Handle unit_cost/cost_per_unit aliasing
    if "unit_cost" in update_data:
        update_data["cost_per_unit"] = update_data.pop("unit_cost")
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    # Log price change
    if "cost_per_unit" in update_data and ingredient.get("cost_per_unit", 0) != update_data["cost_per_unit"]:
        price_history = ingredient.get("price_history", [])
        price_history.append({
            "price": update_data["cost_per_unit"],
            "date": now.isoformat(),
            "previous": ingredient.get("cost_per_unit", 0),
            "source": "period_close_fix"
        })
        update_data["price_history"] = price_history
    
    update_data["updated_at"] = now.isoformat()
    
    await db.ingredients.update_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    
    updated = await db.ingredients.find_one({"ingredient_id": ingredient_id}, {"_id": 0})
    return updated

@inventory_router.get("/low-stock")
async def get_low_stock(user: User = Depends(get_current_user)):
    """Get ingredients below reorder threshold or par level"""
    ingredients = await db.ingredients.find({
        "company_id": user.company_id,
        "$or": [
            {"$expr": {"$lte": ["$stock_quantity", "$min_stock_level"]}},
            {"$expr": {"$lte": ["$stock_quantity", "$par_level"]}}
        ]
    }, {"_id": 0}).to_list(100)
    return ingredients

@inventory_router.get("/valuation")
async def get_inventory_valuation(user: User = Depends(get_current_user)):
    """Get total inventory valuation"""
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {
            "_id": "$inventory_type",
            "total_value": {"$sum": {"$multiply": ["$stock_quantity", "$cost_per_unit"]}},
            "item_count": {"$sum": 1}
        }}
    ]
    result = await db.ingredients.aggregate(pipeline).to_list(10)
    return {r["_id"]: {"value": r["total_value"], "count": r["item_count"]} for r in result if r["_id"]}

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
            "estimated_cost": packs_to_order * pack_size * item.get("cost_per_unit", 0)
        })
    
    return by_supplier

# ============== INVENTORY TRANSACTIONS ==============

@inventory_router.get("/transactions")
async def get_inventory_transactions(
    item_id: Optional[str] = None,
    event_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get inventory transactions with optional filters"""
    query = {"company_id": user.company_id}
    if item_id:
        query["inventory_item_id"] = item_id
    if event_id:
        query["event_id"] = event_id
    if transaction_type:
        query["transaction_type"] = transaction_type
    
    transactions = await db.inventory_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for t in transactions:
        if t.get("created_at") and isinstance(t["created_at"], str):
            t["created_at"] = datetime.fromisoformat(t["created_at"])
    return transactions

@inventory_router.post("/reserve")
async def reserve_inventory(data: dict, user: User = Depends(get_current_user)):
    """
    Reserve inventory for Stock Requisition (SR).
    This DOES NOT deduct inventory - it only marks quantities as reserved.
    
    Inventory Math:
    - On Hand (current_stock): Unchanged
    - Reserved (reserved_quantity): Increases
    - Available: On Hand - Reserved (recalculated)
    
    Only Production can deduct from On Hand.
    """
    items = data.get("items", [])
    event_ids = data.get("event_ids", [])
    
    if not items:
        raise HTTPException(status_code=400, detail="No items to reserve")
    
    now = datetime.now(timezone.utc)
    reservations = []
    event_names = ", ".join([e.get("event_name", e.get("event_id", "")) for e in data.get("events", [])])
    
    for item in items:
        item_id = item.get("inventory_item_id") or item.get("ingredient_id")
        qty_to_reserve = item.get("qty_needed", item.get("quantity", 0))
        
        if not item_id or qty_to_reserve <= 0:
            continue
        
        # Get current inventory item
        inv_item = await db.ingredients.find_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"_id": 0}
        )
        
        if not inv_item:
            continue
        
        current_stock = inv_item.get("stock_quantity", 0)
        current_reserved = inv_item.get("reserved_quantity", 0)
        available = current_stock - current_reserved
        
        # Update reserved quantity (add to existing reserved)
        new_reserved = current_reserved + qty_to_reserve
        
        await db.ingredients.update_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"$set": {
                "reserved_quantity": new_reserved,
                "updated_at": now.isoformat()
            }}
        )
        
        # Create reservation record (not a deduction transaction)
        reservation_id = f"res_{uuid.uuid4().hex[:12]}"
        reservation_doc = {
            "reservation_id": reservation_id,
            "company_id": user.company_id,
            "inventory_item_id": item_id,
            "item_name": item.get("name", inv_item.get("name", "")),
            "event_ids": event_ids,
            "event_names": event_names,
            "quantity_reserved": qty_to_reserve,
            "previous_reserved": current_reserved,
            "new_reserved": new_reserved,
            "on_hand": current_stock,
            "available_after": current_stock - new_reserved,
            "status": "active",  # active, consumed, released
            "created_at": now.isoformat(),
            "created_by": user.user_id
        }
        await db.inventory_reservations.insert_one(reservation_doc)
        
        reservations.append({
            "item_id": item_id,
            "item_name": item.get("name", inv_item.get("name", "")),
            "quantity_reserved": qty_to_reserve,
            "on_hand": current_stock,
            "total_reserved": new_reserved,
            "available": current_stock - new_reserved
        })
    
    return {
        "message": "Inventory reserved successfully",
        "reservations": reservations,
        "event_ids": event_ids,
        "reserved_at": now.isoformat()
    }

@inventory_router.post("/release-reservation")
async def release_inventory_reservation(data: dict, user: User = Depends(get_current_user)):
    """
    Release reserved inventory (cancel reservation).
    Use when an event is cancelled or SR is voided.
    """
    reservation_ids = data.get("reservation_ids", [])
    item_ids = data.get("item_ids", [])
    event_ids = data.get("event_ids", [])
    
    now = datetime.now(timezone.utc)
    released = []
    
    # Find reservations to release
    query = {"company_id": user.company_id, "status": "active"}
    if reservation_ids:
        query["reservation_id"] = {"$in": reservation_ids}
    elif event_ids:
        query["event_ids"] = {"$in": event_ids}
    elif item_ids:
        query["inventory_item_id"] = {"$in": item_ids}
    else:
        raise HTTPException(status_code=400, detail="No reservations specified")
    
    reservations = await db.inventory_reservations.find(query, {"_id": 0}).to_list(500)
    
    for res in reservations:
        item_id = res.get("inventory_item_id")
        qty_to_release = res.get("quantity_reserved", 0)
        
        # Update inventory reserved quantity
        await db.ingredients.update_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"$inc": {"reserved_quantity": -qty_to_release}}
        )
        
        # Mark reservation as released
        await db.inventory_reservations.update_one(
            {"reservation_id": res["reservation_id"]},
            {"$set": {"status": "released", "released_at": now.isoformat()}}
        )
        
        released.append(res["reservation_id"])
    
    return {"message": f"Released {len(released)} reservations", "released_ids": released}

@inventory_router.get("/reservations")
async def get_inventory_reservations(
    event_id: Optional[str] = None,
    item_id: Optional[str] = None,
    status: Optional[str] = "active",
    user: User = Depends(get_current_user)
):
    """Get inventory reservations"""
    query = {"company_id": user.company_id}
    if event_id:
        query["event_ids"] = event_id
    if item_id:
        query["inventory_item_id"] = item_id
    if status:
        query["status"] = status
    
    reservations = await db.inventory_reservations.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return reservations

@inventory_router.post("/transactions")
async def create_inventory_transaction(data: InventoryTransactionCreate, user: User = Depends(get_current_user)):
    """Create an inventory transaction and update stock"""
    now = datetime.now(timezone.utc)
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
    
    # Get the inventory item
    item = await db.ingredients.find_one(
        {"ingredient_id": data.inventory_item_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Calculate stock change based on transaction type
    current_stock = item.get("stock_quantity", 0)
    if data.transaction_type == "Purchase":
        new_stock = current_stock + data.quantity
    elif data.transaction_type in ["Usage", "Waste"]:
        new_stock = max(0, current_stock - data.quantity)
    elif data.transaction_type == "Adjustment":
        new_stock = data.quantity  # Adjustment sets absolute value
    else:
        new_stock = current_stock
    
    # Update inventory stock
    await db.ingredients.update_one(
        {"ingredient_id": data.inventory_item_id, "company_id": user.company_id},
        {"$set": {"stock_quantity": new_stock, "updated_at": now.isoformat()}}
    )
    
    # Create transaction record
    transaction_doc = {
        "transaction_id": transaction_id,
        "company_id": user.company_id,
        "inventory_item_id": data.inventory_item_id,
        "event_id": data.event_id,
        "transaction_type": data.transaction_type,
        "quantity": data.quantity,
        "unit_cost": data.unit_cost or item.get("cost_per_unit", 0),
        "previous_stock": current_stock,
        "new_stock": new_stock,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    await db.inventory_transactions.insert_one(transaction_doc)
    del transaction_doc["_id"]
    transaction_doc["created_at"] = now
    
    return transaction_doc

# ============== PURCHASE LISTS ==============

purchase_list_router = APIRouter(prefix="/purchase-lists", tags=["Purchase Lists"])

@purchase_list_router.get("")
async def get_purchase_lists(event_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all purchase lists, optionally filtered by event"""
    query = {"company_id": user.company_id}
    if event_id:
        query["event_id"] = event_id
    
    lists = await db.purchase_lists.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for pl in lists:
        for field in ["created_at", "updated_at"]:
            if pl.get(field) and isinstance(pl[field], str):
                pl[field] = datetime.fromisoformat(pl[field])
    return lists

@purchase_list_router.get("/event/{event_id}/generate")
async def generate_purchase_list(event_id: str, user: User = Depends(get_current_user)):
    """Generate a purchase list for an event based on order items"""
    # Get event
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get proposal and order items
    proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not proposal:
        return {"items_by_supplier": {}, "total_items": 0, "message": "No proposal found"}
    
    order_items = await db.order_items.find(
        {"proposal_id": proposal["proposal_id"], "company_id": user.company_id, "item_type": "Food"},
        {"_id": 0}
    ).to_list(500)
    
    # Gather required ingredients from recipes/menus
    required_ingredients = {}
    guest_count = event.get("guest_count", 1)
    
    for order_item in order_items:
        quantity = order_item.get("quantity", 1)
        
        # Check if linked to a recipe
        recipe_id = order_item.get("recipe_id")
        if recipe_id:
            recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
            if recipe:
                recipe_yield = recipe.get("yield_quantity", 1)
                multiplier = quantity / recipe_yield
                
                for ing in recipe.get("ingredients", []):
                    if ing.get("item_type") == "ingredient":
                        item_id = ing.get("item_id")
                        needed_qty = ing.get("quantity", 0) * multiplier
                        if item_id in required_ingredients:
                            required_ingredients[item_id]["required_qty"] += needed_qty
                        else:
                            required_ingredients[item_id] = {
                                "inventory_item_id": item_id,
                                "item_name": ing.get("item_name", "Unknown"),
                                "unit": ing.get("unit", "unit"),
                                "required_qty": needed_qty
                            }
        
        # Check if linked to a menu
        menu_id = order_item.get("menu_id")
        if menu_id:
            menu = await db.menus.find_one({"menu_id": menu_id, "company_id": user.company_id}, {"_id": 0})
            if menu:
                for menu_item in menu.get("items", []):
                    recipe_id = menu_item.get("recipe_id")
                    if recipe_id:
                        recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
                        if recipe:
                            portions = menu_item.get("portions_per_guest", 1) * quantity
                            recipe_yield = recipe.get("yield_quantity", 1)
                            multiplier = portions / recipe_yield
                            
                            for ing in recipe.get("ingredients", []):
                                if ing.get("item_type") == "ingredient":
                                    item_id = ing.get("item_id")
                                    needed_qty = ing.get("quantity", 0) * multiplier
                                    if item_id in required_ingredients:
                                        required_ingredients[item_id]["required_qty"] += needed_qty
                                    else:
                                        required_ingredients[item_id] = {
                                            "inventory_item_id": item_id,
                                            "item_name": ing.get("item_name", "Unknown"),
                                            "unit": ing.get("unit", "unit"),
                                            "required_qty": needed_qty
                                        }
    
    # Compare with current stock and group by supplier
    items_by_supplier = {}
    
    for item_id, req in required_ingredients.items():
        # Get current inventory
        inv_item = await db.ingredients.find_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"_id": 0}
        )
        
        in_stock = inv_item.get("stock_quantity", 0) if inv_item else 0
        to_purchase = max(0, req["required_qty"] - in_stock)
        
        supplier_id = inv_item.get("preferred_supplier_id", "no_supplier") if inv_item else "no_supplier"
        
        # Get supplier name
        supplier_name = "No Supplier"
        if supplier_id and supplier_id != "no_supplier":
            supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
            if supplier:
                supplier_name = supplier.get("name", "Unknown")
        
        if supplier_id not in items_by_supplier:
            items_by_supplier[supplier_id] = {
                "supplier_id": supplier_id,
                "supplier_name": supplier_name,
                "items": [],
                "total_cost": 0
            }
        
        unit_cost = inv_item.get("cost_per_unit", 0) if inv_item else 0
        total_cost = to_purchase * unit_cost
        
        status = "InStock" if to_purchase == 0 else ("Short" if in_stock > 0 else "Unknown")
        
        items_by_supplier[supplier_id]["items"].append({
            "inventory_item_id": item_id,
            "item_name": req["item_name"],
            "unit": req["unit"],
            "required_qty": round(req["required_qty"], 2),
            "in_stock_qty": round(in_stock, 2),
            "to_purchase_qty": round(to_purchase, 2),
            "unit_cost": unit_cost,
            "total_cost": round(total_cost, 2),
            "status": status
        })
        items_by_supplier[supplier_id]["total_cost"] += total_cost
    
    return {
        "event_id": event_id,
        "event_name": event.get("name"),
        "items_by_supplier": items_by_supplier,
        "total_items": len(required_ingredients)
    }

@purchase_list_router.post("")
async def create_purchase_list(data: dict, user: User = Depends(get_current_user)):
    """Save a purchase list for an event"""
    now = datetime.now(timezone.utc)
    purchase_list_id = f"pl_{uuid.uuid4().hex[:12]}"
    
    # Check if event is closed
    event = await db.events.find_one(
        {"event_id": data.get("event_id"), "company_id": user.company_id},
        {"_id": 0}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot create purchase list for closed event")
    
    purchase_list_doc = {
        "purchase_list_id": purchase_list_id,
        "company_id": user.company_id,
        "event_id": data.get("event_id"),
        "supplier_id": data.get("supplier_id"),
        "supplier_name": data.get("supplier_name"),
        "items": data.get("items", []),
        "total_cost": data.get("total_cost", 0),
        "status": "Draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.purchase_lists.insert_one(purchase_list_doc)
    del purchase_list_doc["_id"]
    purchase_list_doc["created_at"] = now
    purchase_list_doc["updated_at"] = now
    
    return purchase_list_doc

@purchase_list_router.put("/{purchase_list_id}/status")
async def update_purchase_list_status(purchase_list_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update purchase list status (Draft, Ordered, Received)"""
    now = datetime.now(timezone.utc)
    
    pl = await db.purchase_lists.find_one(
        {"purchase_list_id": purchase_list_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Purchase list not found")
    
    # Check if event is closed
    event = await db.events.find_one(
        {"event_id": pl.get("event_id"), "company_id": user.company_id},
        {"_id": 0}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot modify purchase list for closed event")
    
    new_status = data.get("status", pl.get("status"))
    
    await db.purchase_lists.update_one(
        {"purchase_list_id": purchase_list_id},
        {"$set": {"status": new_status, "updated_at": now.isoformat()}}
    )
    
    # If marked as Received, optionally create Purchase transactions
    if new_status == "Received" and data.get("create_transactions", False):
        for item in pl.get("items", []):
            if item.get("to_purchase_qty", 0) > 0:
                transaction_doc = {
                    "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
                    "company_id": user.company_id,
                    "inventory_item_id": item.get("inventory_item_id"),
                    "event_id": pl.get("event_id"),
                    "transaction_type": "Purchase",
                    "quantity": item.get("to_purchase_qty", 0),
                    "unit_cost": item.get("unit_cost", 0),
                    "notes": f"From Purchase List {purchase_list_id}",
                    "created_at": now.isoformat(),
                    "created_by": user.user_id
                }
                await db.inventory_transactions.insert_one(transaction_doc)
                
                # Update stock
                await db.ingredients.update_one(
                    {"ingredient_id": item.get("inventory_item_id"), "company_id": user.company_id},
                    {"$inc": {"stock_quantity": item.get("to_purchase_qty", 0)}}
                )
    
    return {"message": "Purchase list updated", "status": new_status}

@purchase_list_router.delete("/{purchase_list_id}")
async def delete_purchase_list(purchase_list_id: str, user: User = Depends(get_current_user)):
    """Delete a purchase list"""
    pl = await db.purchase_lists.find_one(
        {"purchase_list_id": purchase_list_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Purchase list not found")
    
    # Check if event is closed
    event = await db.events.find_one(
        {"event_id": pl.get("event_id"), "company_id": user.company_id},
        {"_id": 0}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot delete purchase list for closed event")
    
    await db.purchase_lists.delete_one({"purchase_list_id": purchase_list_id})
    return {"message": "Purchase list deleted"}

# ============== RECIPES ROUTES - GastroKaisen Style ==============

@recipes_router.get("")
async def get_recipes(recipe_type: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if recipe_type:
        query["recipe_type"] = recipe_type
    
    recipes = await db.recipes.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    
    for r in recipes:
        for field in ["created_at", "updated_at"]:
            if r.get(field) and isinstance(r[field], str):
                r[field] = datetime.fromisoformat(r[field])
        for field, default in [("recipe_type", "final_dish"), ("yield_quantity", 1.0), ("yield_unit", "portion"), ("portion_size", 1.0), ("portion_unit", "serving"), ("labor_minutes", 0), ("cost_per_yield", r.get("cost_per_serving", 0)), ("cost_per_portion", r.get("cost_per_serving", 0)), ("sell_price", 0.0), ("food_cost_percent", 0.0)]:
            if field not in r:
                r[field] = default
        # Ensure extended fields have defaults for old recipes
        r.setdefault("allergens", [])
        r.setdefault("work_category", None)
        r.setdefault("recipe_code", None)
        r.setdefault("verified_status", "Draft")
        # Map old field names to new ones for backwards compatibility
        r.setdefault("prep_time", r.get("prep_time_minutes", 0))
        r.setdefault("cook_time", r.get("cook_time_minutes", 0))
        r.setdefault("difficulty", "medium")
        # Convert instructions array to string if needed
        if isinstance(r.get("instructions"), list):
            r["instructions"] = "\n".join(r["instructions"]) if r["instructions"] else ""
    return recipes

async def calculate_recipe_cost(ingredients: List[RecipeIngredient], sub_recipes: List[Dict] = None, company_id: str = "") -> tuple:
    """Calculate total cost for a recipe's ingredients and sub-recipes, including merma (waste)"""
    total_cost = 0.0
    updated_ingredients = []
    updated_sub_recipes = []
    
    # Calculate ingredient costs with waste factor (merma)
    for ing in ingredients:
        ing_dict = ing.model_dump() if hasattr(ing, 'model_dump') else dict(ing)
        
        if ing_dict.get("item_type") == "ingredient":
            # Get ingredient cost from inventory
            ingredient = await db.ingredients.find_one(
                {"ingredient_id": ing_dict.get("item_id"), "company_id": company_id},
                {"_id": 0}
            )
            if ingredient:
                base_cost_per_unit = ingredient.get("cost_per_unit", 0)
                waste_factor = ing_dict.get("waste_factor_pct", 0)
                
                # Apply waste factor (merma): if 10% waste, you need 10% more product
                # Effective cost = base_cost / (1 - waste_factor/100)
                if waste_factor > 0 and waste_factor < 100:
                    effective_cost_per_unit = base_cost_per_unit / (1 - waste_factor / 100)
                else:
                    effective_cost_per_unit = base_cost_per_unit
                
                # Calculate net quantity (what you actually use after waste)
                net_quantity = ing_dict.get("quantity", 0) * (1 + waste_factor / 100) if waste_factor > 0 else ing_dict.get("quantity", 0)
                line_cost = ing_dict.get("quantity", 0) * effective_cost_per_unit
                
                updated_ingredients.append({
                    **ing_dict,
                    "cost_per_unit": effective_cost_per_unit,
                    "total_cost": round(line_cost, 4),
                    "net_quantity": round(net_quantity, 4)
                })
                total_cost += line_cost
            else:
                updated_ingredients.append(ing_dict)
        else:
            # Get sub-recipe cost (legacy support for item_type="recipe")
            sub_recipe = await db.recipes.find_one(
                {"recipe_id": ing_dict.get("item_id"), "company_id": company_id},
                {"_id": 0}
            )
            if sub_recipe:
                cost_per_yield = sub_recipe.get("cost_per_yield", 0)
                line_cost = ing_dict.get("quantity", 0) * cost_per_yield
                updated_ingredients.append({
                    **ing_dict,
                    "cost_per_unit": cost_per_yield,
                    "total_cost": round(line_cost, 4)
                })
                total_cost += line_cost
            else:
                updated_ingredients.append(ing_dict)
    
    # Calculate sub-recipe costs (new structure)
    if sub_recipes:
        for sub in sub_recipes:
            sub_dict = sub if isinstance(sub, dict) else sub.model_dump()
            child_recipe_id = sub_dict.get("child_recipe_id")
            
            child_recipe = await db.recipes.find_one(
                {"recipe_id": child_recipe_id, "company_id": company_id},
                {"_id": 0}
            )
            if child_recipe:
                cost_per_yield = child_recipe.get("cost_per_yield", 0)
                line_cost = sub_dict.get("quantity_used", 0) * cost_per_yield
                updated_sub_recipes.append({
                    **sub_dict,
                    "cost_per_unit": cost_per_yield,
                    "total_cost": round(line_cost, 4)
                })
                total_cost += line_cost
            else:
                updated_sub_recipes.append(sub_dict)
    
    return round(total_cost, 2), updated_ingredients, updated_sub_recipes

async def check_circular_dependency(parent_id: str, child_id: str, company_id: str, visited: set = None) -> bool:
    """Check if adding child_id as sub-recipe of parent_id would create a circular dependency"""
    if visited is None:
        visited = set()
    
    if child_id in visited:
        return True  # Circular dependency detected
    
    if parent_id == child_id:
        return True  # Direct self-reference
    
    visited.add(parent_id)
    
    # Get child recipe
    child_recipe = await db.recipes.find_one(
        {"recipe_id": child_id, "company_id": company_id},
        {"_id": 0, "sub_recipes": 1}
    )
    
    if not child_recipe:
        return False
    
    # Check if parent is in child's sub-recipes
    for sub in child_recipe.get("sub_recipes", []):
        if sub.get("child_recipe_id") == parent_id:
            return True
        # Recursive check
        if await check_circular_dependency(parent_id, sub.get("child_recipe_id"), company_id, visited):
            return True
    
    return False

@recipes_router.post("", response_model=Recipe)
async def create_recipe(data: RecipeCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
    
    # Check for circular dependencies in sub-recipes
    for sub in data.sub_recipes:
        if await check_circular_dependency(recipe_id, sub.child_recipe_id, user.company_id):
            raise HTTPException(status_code=400, detail=f"Circular dependency detected with recipe {sub.child_recipe_name}")
    
    # Calculate costs including sub-recipes
    sub_recipes_data = [s.model_dump() for s in data.sub_recipes] if data.sub_recipes else []
    total_cost, updated_ingredients, updated_sub_recipes = await calculate_recipe_cost(
        data.ingredients, sub_recipes_data, user.company_id
    )
    
    # Calculate per-yield and per-portion costs
    cost_per_yield = total_cost / data.yield_quantity if data.yield_quantity > 0 else 0
    portions = data.portions_per_yield if data.portions_per_yield > 0 else 1
    cost_per_portion = cost_per_yield / portions
    food_cost_percent = (cost_per_portion / data.sell_price * 100) if data.sell_price > 0 else 0
    
    recipe_doc = {
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "ingredients": updated_ingredients,
        "sub_recipes": updated_sub_recipes,
        "total_cost": total_cost,
        "cost_per_yield": round(cost_per_yield, 4),
        "cost_per_portion": round(cost_per_portion, 4),
        "food_cost_percent": round(food_cost_percent, 2),
        # Extended fields with defaults
        "allergens": [],
        "work_category": None,
        "recipe_code": None,
        "verified_status": "Draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.recipes.insert_one(recipe_doc)
    del recipe_doc["_id"]
    recipe_doc["created_at"] = now
    recipe_doc["updated_at"] = now
    return Recipe(**recipe_doc)

@recipes_router.get("/{recipe_id}", response_model=Recipe)
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    for field in ["created_at", "updated_at"]:
        if recipe.get(field) and isinstance(recipe[field], str):
            recipe[field] = datetime.fromisoformat(recipe[field])
    # Ensure extended fields have defaults for old recipes
    recipe.setdefault("allergens", [])
    recipe.setdefault("work_category", None)
    recipe.setdefault("recipe_code", None)
    recipe.setdefault("verified_status", "Draft")
    return Recipe(**recipe)

@recipes_router.put("/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: str, data: RecipeCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    
    # Check for circular dependencies in sub-recipes
    for sub in data.sub_recipes:
        if await check_circular_dependency(recipe_id, sub.child_recipe_id, user.company_id):
            raise HTTPException(status_code=400, detail=f"Circular dependency detected with recipe {sub.child_recipe_name}")
    
    # Recalculate costs including sub-recipes
    sub_recipes_data = [s.model_dump() for s in data.sub_recipes] if data.sub_recipes else []
    total_cost, updated_ingredients, updated_sub_recipes = await calculate_recipe_cost(
        data.ingredients, sub_recipes_data, user.company_id
    )
    
    cost_per_yield = total_cost / data.yield_quantity if data.yield_quantity > 0 else 0
    portions = data.portions_per_yield if data.portions_per_yield > 0 else 1
    cost_per_portion = cost_per_yield / portions
    food_cost_percent = (cost_per_portion / data.sell_price * 100) if data.sell_price > 0 else 0
    
    update_data = {
        **data.model_dump(),
        "ingredients": updated_ingredients,
        "sub_recipes": updated_sub_recipes,
        "total_cost": total_cost,
        "cost_per_yield": round(cost_per_yield, 4),
        "cost_per_portion": round(cost_per_portion, 4),
        "food_cost_percent": round(food_cost_percent, 2),
        "updated_at": now.isoformat()
    }
    
    result = await db.recipes.update_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return await get_recipe(recipe_id, user)

@recipes_router.delete("/{recipe_id}")
async def delete_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    result = await db.recipes.delete_one({"recipe_id": recipe_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"message": "Recipe deleted"}

@recipes_router.post("/{recipe_id}/duplicate", response_model=Recipe)
async def duplicate_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    """Duplicate an existing recipe"""
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    now = datetime.now(timezone.utc)
    new_recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
    
    # Create new recipe with copied data
    new_recipe = {
        **recipe,
        "recipe_id": new_recipe_id,
        "name": f"{recipe['name']} (Copy)",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.recipes.insert_one(new_recipe)
    return new_recipe

@recipes_router.get("/{recipe_id}/cost-history")
async def get_recipe_cost_history(recipe_id: str, user: User = Depends(get_current_user)):
    """Get cost history for a recipe's ingredients"""
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    cost_history = []
    for ing in recipe.get("ingredients", []):
        if ing.get("item_type") == "ingredient":
            ingredient = await db.ingredients.find_one(
                {"ingredient_id": ing.get("item_id"), "company_id": user.company_id},
                {"_id": 0, "name": 1, "price_history": 1, "cost_per_unit": 1}
            )
            if ingredient:
                cost_history.append({
                    "item_id": ing.get("item_id"),
                    "item_name": ingredient.get("name"),
                    "current_cost": ingredient.get("cost_per_unit", 0),
                    "price_history": ingredient.get("price_history", [])
                })
    
    return {
        "recipe_id": recipe_id,
        "recipe_name": recipe.get("name"),
        "ingredient_cost_history": cost_history
    }

@recipes_router.post("/ai-analyze")
async def ai_analyze_recipe(data: dict, user: User = Depends(get_current_user)):
    """Use AI to analyze recipe and suggest quantities"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    recipe_name = data.get("name", "")
    servings = data.get("servings", 1)
    ingredients = data.get("ingredients", [])
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    chat = LlmChat(api_key=api_key, session_id=f"recipe_{uuid.uuid4().hex[:8]}", system_message="You are a professional chef and recipe cost analyst. Provide accurate ingredient quantities and cooking guidance. Always respond in JSON format.").with_model("openai", "gpt-5.2")
    
    prompt = f"""Analyze this recipe and suggest accurate ingredient quantities:
Recipe: {recipe_name}
Servings: {servings}
Current ingredients: {ingredients}

Provide suggestions in this JSON format:
{{"ingredients": [{{"name": "ingredient name", "quantity": number, "unit": "unit", "notes": "any tips"}}], "cooking_tips": ["tip1", "tip2"], "estimated_prep_time_minutes": number, "estimated_cook_time_minutes": number}}"""
    
    try:
        response = await chat.send_message(UserMessage(text=prompt))
        import json
        response_text = response.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        raise HTTPException(status_code=500, detail="AI analysis failed")

@recipes_router.post("/recalculate-all")
async def recalculate_all_recipes(user: User = Depends(get_current_user)):
    """Recalculate costs for all recipes (call when ingredient prices change)"""
    recipes = await db.recipes.find({"company_id": user.company_id}, {"_id": 0}).to_list(1000)
    updated_count = 0
    
    for recipe in recipes:
        ingredients = [RecipeIngredient(**i) for i in recipe.get("ingredients", [])]
        sub_recipes = recipe.get("sub_recipes", [])
        total_cost, updated_ingredients, updated_sub_recipes = await calculate_recipe_cost(ingredients, sub_recipes, user.company_id)
        
        yield_qty = recipe.get("yield_quantity", 1)
        portion_size = recipe.get("portion_size", 1)
        sell_price = recipe.get("sell_price", 0)
        
        cost_per_yield = total_cost / yield_qty if yield_qty > 0 else 0
        cost_per_portion = cost_per_yield / portion_size if portion_size > 0 else cost_per_yield
        food_cost_percent = (cost_per_portion / sell_price * 100) if sell_price > 0 else 0
        
        await db.recipes.update_one(
            {"recipe_id": recipe["recipe_id"]},
            {"$set": {
                "ingredients": updated_ingredients,
                "sub_recipes": updated_sub_recipes,
                "total_cost": total_cost,
                "cost_per_yield": cost_per_yield,
                "cost_per_portion": cost_per_portion,
                "food_cost_percent": food_cost_percent
            }}
        )
        updated_count += 1
    
    return {"updated_recipes": updated_count}

# ============== PLATED MENUS ==============

async def calculate_menu_cost(courses: List[Dict], company_id: str) -> float:
    """Calculate total cost per guest for a plated menu"""
    total_cost = 0.0
    
    for course in courses:
        for item in course.get("items", []):
            recipe_id = item.get("recipe_id")
            portions_per_guest = item.get("portions_per_guest", 1)
            
            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": company_id},
                {"_id": 0, "cost_per_portion": 1}
            )
            if recipe:
                total_cost += recipe.get("cost_per_portion", 0) * portions_per_guest
    
    return round(total_cost, 4)

@plated_menus_router.get("")
async def get_plated_menus(menu_type: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all plated menus"""
    query = {"company_id": user.company_id}
    if menu_type:
        query["menu_type"] = menu_type
    
    menus = await db.plated_menus.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for m in menus:
        for field in ["created_at", "updated_at"]:
            if m.get(field) and isinstance(m[field], str):
                m[field] = datetime.fromisoformat(m[field])
    return menus

@plated_menus_router.get("/{menu_id}")
async def get_plated_menu(menu_id: str, user: User = Depends(get_current_user)):
    """Get a single plated menu with recipe details"""
    menu = await db.plated_menus.find_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Enrich course items with recipe details
    for course in menu.get("courses", []):
        for item in course.get("items", []):
            recipe = await db.recipes.find_one(
                {"recipe_id": item.get("recipe_id"), "company_id": user.company_id},
                {"_id": 0, "name": 1, "cost_per_portion": 1, "recipe_type": 1, "yield_unit": 1}
            )
            if recipe:
                item["recipe_details"] = recipe
    
    for field in ["created_at", "updated_at"]:
        if menu.get(field) and isinstance(menu[field], str):
            menu[field] = datetime.fromisoformat(menu[field])
    
    return menu

@plated_menus_router.post("")
async def create_plated_menu(data: PlatedMenuCreate, user: User = Depends(get_current_user)):
    """Create a new plated menu"""
    now = datetime.now(timezone.utc)
    menu_id = f"pmenu_{uuid.uuid4().hex[:12]}"
    
    # Ensure course_ids are set
    courses_with_ids = []
    for i, course in enumerate(data.courses):
        course_dict = course.model_dump() if hasattr(course, 'model_dump') else dict(course)
        if not course_dict.get("course_id"):
            course_dict["course_id"] = f"course_{uuid.uuid4().hex[:8]}"
        course_dict["course_order"] = i
        courses_with_ids.append(course_dict)
    
    # Calculate cost per guest
    cost_per_guest = await calculate_menu_cost(courses_with_ids, user.company_id)
    buffer_pct = data.buffer_percentage or 0
    cost_with_buffer = cost_per_guest * (1 + buffer_pct / 100)
    
    menu_doc = {
        "menu_id": menu_id,
        "company_id": user.company_id,
        "name": data.name,
        "description": data.description,
        "menu_type": data.menu_type,
        "pricing_model": data.pricing_model,
        "serving_style": data.serving_style,
        "courses": courses_with_ids,
        "buffer_percentage": buffer_pct,
        "cost_per_guest": cost_per_guest,
        "cost_with_buffer": round(cost_with_buffer, 4),
        "notes": data.notes,
        "status": "active",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.plated_menus.insert_one(menu_doc)
    del menu_doc["_id"]
    menu_doc["created_at"] = now
    menu_doc["updated_at"] = now
    return menu_doc

@plated_menus_router.put("/{menu_id}")
async def update_plated_menu(menu_id: str, data: PlatedMenuCreate, user: User = Depends(get_current_user)):
    """Update a plated menu"""
    now = datetime.now(timezone.utc)
    
    # Ensure course_ids are set
    courses_with_ids = []
    for i, course in enumerate(data.courses):
        course_dict = course.model_dump() if hasattr(course, 'model_dump') else dict(course)
        if not course_dict.get("course_id"):
            course_dict["course_id"] = f"course_{uuid.uuid4().hex[:8]}"
        course_dict["course_order"] = i
        courses_with_ids.append(course_dict)
    
    # Recalculate cost per guest
    cost_per_guest = await calculate_menu_cost(courses_with_ids, user.company_id)
    buffer_pct = data.buffer_percentage or 0
    cost_with_buffer = cost_per_guest * (1 + buffer_pct / 100)
    
    update_data = {
        "name": data.name,
        "description": data.description,
        "menu_type": data.menu_type,
        "pricing_model": data.pricing_model,
        "serving_style": data.serving_style,
        "courses": courses_with_ids,
        "buffer_percentage": buffer_pct,
        "cost_per_guest": cost_per_guest,
        "cost_with_buffer": round(cost_with_buffer, 4),
        "notes": data.notes,
        "updated_at": now.isoformat()
    }
    
    result = await db.plated_menus.update_one(
        {"menu_id": menu_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    return await get_plated_menu(menu_id, user)

@plated_menus_router.delete("/{menu_id}")
async def delete_plated_menu(menu_id: str, user: User = Depends(get_current_user)):
    """Delete a plated menu"""
    result = await db.plated_menus.delete_one(
        {"menu_id": menu_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    return {"message": "Menu deleted"}

@plated_menus_router.post("/recalculate-all")
async def recalculate_all_menus(user: User = Depends(get_current_user)):
    """Recalculate costs for all menus (call when recipe costs change)"""
    menus = await db.plated_menus.find({"company_id": user.company_id}, {"_id": 0}).to_list(500)
    updated_count = 0
    
    for menu in menus:
        cost_per_guest = await calculate_menu_cost(menu.get("courses", []), user.company_id)
        buffer_pct = menu.get("buffer_percentage", 0)
        cost_with_buffer = cost_per_guest * (1 + buffer_pct / 100)
        
        await db.plated_menus.update_one(
            {"menu_id": menu["menu_id"]},
            {"$set": {
                "cost_per_guest": cost_per_guest,
                "cost_with_buffer": round(cost_with_buffer, 4)
            }}
        )
        updated_count += 1
    
    return {"updated_menus": updated_count}

# ============== EVENT MENU & STOCK CHECK ==============

@events_router.get("")
async def get_events(user: User = Depends(get_current_user), stage: Optional[str] = None):
    """Get all events with optional stage filter"""
    query = {"company_id": user.company_id}
    if stage:
        query["stage"] = stage
    
    events = await db.events.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get all client IDs to fetch client info
    client_ids = list(set(e.get("client_id") for e in events if e.get("client_id")))
    clients_data = {}
    if client_ids:
        clients = await db.clients.find({"client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1, "display_name": 1, "client_type": 1}).to_list(len(client_ids))
        clients_data = {c["client_id"]: c for c in clients}
    
    # Get all event IDs to fetch invoice balances
    event_ids = [e.get("event_id") for e in events if e.get("event_id")]
    invoices_by_event = {}
    if event_ids:
        invoices = await db.invoices.find(
            {"company_id": user.company_id, "event_id": {"$in": event_ids}, "status": {"$ne": "paid"}},
            {"_id": 0, "event_id": 1, "balance_due": 1}
        ).to_list(1000)
        for inv in invoices:
            eid = inv.get("event_id")
            if eid:
                invoices_by_event[eid] = invoices_by_event.get(eid, 0) + (inv.get("balance_due") or 0)
    
    for e in events:
        for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except:
                    e[field] = None
        if "documents" not in e:
            e["documents"] = []
        # Normalize stage (map legacy to new)
        original_stage = e.get("stage", "Inquiry Received")
        e["stage"] = normalize_stage(original_stage)
        # Add client info to event
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_info"] = {
            "display_name": client_info.get("display_name", client_info.get("name", "")),
            "client_type": client_info.get("client_type", "Individual")
        }
        # Add pending balance from invoices
        e["pending_balance"] = invoices_by_event.get(e.get("event_id"), 0)
    return events

@events_router.get("/pipeline")
async def get_events_pipeline(user: User = Depends(get_current_user)):
    """Get events grouped by engagement stage"""
    new_stages = ["Inquiry Received", "Context Captured", "Scope Drafted", "Definition In Review", "Committed", "Archived"]
    legacy_stages = ["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Approved", "Closed", "Lost"]
    all_stages = new_stages + legacy_stages
    
    pipeline = {stage: [] for stage in new_stages}  # Initialize with new stages only
    
    # Get all clients for client info
    all_clients = await db.clients.find({"company_id": user.company_id}, {"_id": 0, "client_id": 1, "display_name": 1, "client_type": 1}).to_list(1000)
    clients_data = {c["client_id"]: c for c in all_clients}
    
    # Get all invoices with pending balance for quick lookup
    all_invoices = await db.invoices.find(
        {"company_id": user.company_id, "status": {"$ne": "paid"}},
        {"_id": 0, "event_id": 1, "balance_due": 1}
    ).to_list(1000)
    invoices_by_event = {}
    for inv in all_invoices:
        eid = inv.get("event_id")
        if eid:
            invoices_by_event[eid] = invoices_by_event.get(eid, 0) + (inv.get("balance_due") or 0)
    
    # Get all events and normalize stages
    events = await db.events.find({"company_id": user.company_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    for e in events:
        for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except:
                    e[field] = None
        # Add client info
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_info"] = {
            "display_name": client_info.get("display_name", ""),
            "client_type": client_info.get("client_type", "Individual")
        }
        # Add pending balance from invoices
        e["pending_balance"] = invoices_by_event.get(e.get("event_id"), 0)
        
        # Normalize stage and add to correct pipeline bucket
        original_stage = e.get("stage", "Inquiry Received")
        normalized_stage = normalize_stage(original_stage)
        e["stage"] = normalized_stage  # Update event stage for frontend
        e["original_stage"] = original_stage  # Keep original for reference
        
        if normalized_stage in pipeline:
            pipeline[normalized_stage].append(e)
    
    return pipeline

@events_router.get("/confirmed")
async def get_confirmed_events(user: User = Depends(get_current_user)):
    """Get only confirmed (Won/Closed) events for procurement and purchases"""
    events = await db.events.find(
        {"company_id": user.company_id, "stage": {"$in": ["Committed", "Won", "Closed"]}},
        {"_id": 0}
    ).sort("event_date", -1).to_list(500)
    
    # Get all client IDs to fetch client info
    client_ids = list(set(e.get("client_id") for e in events if e.get("client_id")))
    clients_data = {}
    if client_ids:
        clients = await db.clients.find({"client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1, "display_name": 1}).to_list(len(client_ids))
        clients_data = {c["client_id"]: c for c in clients}
    
    for e in events:
        for field in ["event_date", "end_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                try:
                    e[field] = datetime.fromisoformat(e[field])
                except:
                    e[field] = None
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_name"] = client_info.get("display_name", "")
    
    return events

@events_router.post("")
async def create_event(data: EventCreate, user: User = Depends(get_current_user)):
    # Check usage limit
    limit_check = await check_usage_limit(user.company_id, "events_created")
    if not limit_check.get("allowed", True) == False:
        pass  # Allow if no limit info
    elif not limit_check["allowed"]:
        raise HTTPException(status_code=403, detail=limit_check.get("message", "Límite de eventos alcanzado"))
    
    now = datetime.now(timezone.utc)
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    event_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "event_date": data.event_date.isoformat() if data.event_date else None,
        "end_date": data.end_date.isoformat() if data.end_date else None,
        "next_followup_date": data.next_followup_date.isoformat() if data.next_followup_date else None,
        "timeline": [],
        "tasks": [],
        "menu_items": [],
        "documents": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.events.insert_one(event_doc)
    
    # Increment usage
    await increment_usage(user.company_id, "events_created")
    
    await db.clients.update_one({"client_id": data.client_id}, {"$inc": {"events_count": 1}})
    
    del event_doc["_id"]
    event_doc["event_date"] = data.event_date
    event_doc["end_date"] = data.end_date
    event_doc["next_followup_date"] = data.next_followup_date
    event_doc["created_at"] = now
    event_doc["updated_at"] = now
    return event_doc

@events_router.post("/{event_id}/duplicate", response_model=Event)
async def duplicate_event(event_id: str, user: User = Depends(get_current_user)):
    original = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    new_event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    new_event = {**original, "event_id": new_event_id, "name": f"{original['name']} (Copy)", "status": "planning", "tasks": [], "documents": [], "created_at": now.isoformat(), "updated_at": now.isoformat()}
    
    await db.events.insert_one(new_event)
    await db.clients.update_one({"client_id": original["client_id"]}, {"$inc": {"events_count": 1}})
    
    del new_event["_id"]
    for field in ["event_date", "end_date", "created_at", "updated_at"]:
        if new_event.get(field) and isinstance(new_event[field], str):
            new_event[field] = datetime.fromisoformat(new_event[field])
    
    return Event(**new_event)

@events_router.get("/{event_id}")
async def get_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    for field in ["event_date", "end_date", "next_followup_date", "created_at", "updated_at"]:
        if event.get(field) and isinstance(event[field], str):
            try:
                event[field] = datetime.fromisoformat(event[field])
            except:
                event[field] = None
    if "documents" not in event:
        event["documents"] = []
    # Normalize stage (map legacy to new)
    original_stage = event.get("stage", "Inquiry Received")
    event["stage"] = normalize_stage(original_stage)
    
    # Get client info
    client = await db.clients.find_one({"client_id": event.get("client_id")}, {"_id": 0, "display_name": 1, "client_type": 1})
    if client:
        event["client_info"] = {
            "display_name": client.get("display_name", ""),
            "client_type": client.get("client_type", "Individual")
        }
    
    return event

@events_router.put("/{event_id}")
async def update_event(event_id: str, data: EventUpdate, user: User = Depends(get_current_user)):
    # Get event name for logging
    old_event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "stage": 1}
    )
    
    if not old_event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    # Only include non-None values in update
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Convert dates to ISO strings if present
    if "event_date" in update_data and update_data["event_date"]:
        update_data["event_date"] = update_data["event_date"].isoformat()
    if "end_date" in update_data and update_data["end_date"]:
        update_data["end_date"] = update_data["end_date"].isoformat()
    if "next_followup_date" in update_data and update_data["next_followup_date"]:
        update_data["next_followup_date"] = update_data["next_followup_date"].isoformat()
    
    update_data["updated_at"] = now.isoformat()
    
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Log activity
    await log_activity(
        module="events",
        action="update",
        entity_type="event",
        entity_id=event_id,
        entity_name=data.name or old_event.get("name") if old_event else "Event",
        event_id=event_id,
        **user_info(user)
    )
    
    return await get_event(event_id, user)

@events_router.delete("/{event_id}")
async def delete_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_name = event.get("name", "Event")
    
    await db.events.delete_one({"event_id": event_id})
    await db.clients.update_one({"client_id": event["client_id"]}, {"$inc": {"events_count": -1}})
    
    # Log activity
    await log_activity(
        module="events",
        action="delete",
        entity_type="event",
        entity_id=event_id,
        entity_name=event_name,
        event_id=event_id,
        **user_info(user)
    )
    
    return {"message": "Event deleted"}

@events_router.post("/{event_id}/tasks")
async def add_task(event_id: str, task: dict, user: User = Depends(get_current_user)):
    task["task_id"] = f"task_{uuid.uuid4().hex[:8]}"
    task["completed"] = False
    task["created_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$push": {"tasks": task}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return task

@events_router.put("/{event_id}/tasks/{task_id}")
async def update_task(event_id: str, task_id: str, task: dict, user: User = Depends(get_current_user)):
    await db.events.update_one({"event_id": event_id, "company_id": user.company_id, "tasks.task_id": task_id}, {"$set": {"tasks.$": {**task, "task_id": task_id}}})
    return {"message": "Task updated"}

@events_router.post("/{event_id}/menu")
async def add_event_menu_item(event_id: str, data: dict, user: User = Depends(get_current_user)):
    recipe_id = data.get("recipe_id")
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$addToSet": {"menu_items": recipe_id}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Menu item added"}

@events_router.get("/{event_id}/stock-check")
async def check_event_stock(event_id: str, user: User = Depends(get_current_user)):
    """Check stock availability for event menu and generate purchase list"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    guest_count = event.get("guest_count", 1)
    menu_items = event.get("menu_items", [])
    
    # Calculate required ingredients
    required_ingredients = {}
    
    for recipe_id in menu_items:
        recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
        if not recipe:
            continue
        
        recipe_yield = recipe.get("yield_quantity", 1)
        multiplier = guest_count / recipe_yield
        
        for ing in recipe.get("ingredients", []):
            if ing.get("item_type") == "ingredient":
                ing_id = ing["item_id"]
                needed_qty = ing["quantity"] * multiplier
                
                if ing_id in required_ingredients:
                    required_ingredients[ing_id]["quantity_needed"] += needed_qty
                else:
                    required_ingredients[ing_id] = {
                        "ingredient_id": ing_id,
                        "name": ing.get("item_name", ""),
                        "quantity_needed": needed_qty,
                        "unit": ing.get("unit", "unit")
                    }
    
    # Check against current stock
    available = []
    short = []
    
    for ing_id, req in required_ingredients.items():
        ingredient = await db.ingredients.find_one({"ingredient_id": ing_id, "company_id": user.company_id}, {"_id": 0})
        if not ingredient:
            short.append({**req, "quantity_on_hand": 0, "shortage": req["quantity_needed"], "supplier_id": None})
            continue
        
        on_hand = ingredient.get("stock_quantity", 0)
        # Apply waste factor
        waste_percent = ingredient.get("yield_waste_percent", 0)
        effective_needed = req["quantity_needed"] * (1 + waste_percent / 100)
        
        if on_hand >= effective_needed:
            available.append({
                **req,
                "quantity_on_hand": on_hand,
                "surplus": on_hand - effective_needed
            })
        else:
            short.append({
                **req,
                "quantity_on_hand": on_hand,
                "shortage": effective_needed - on_hand,
                "supplier_id": ingredient.get("preferred_supplier_id"),
                "pack_size": ingredient.get("pack_size", 1),
                "pack_unit": ingredient.get("pack_unit", "unit"),
                "cost_per_unit": ingredient.get("cost_per_unit", 0)
            })
    
    return {
        "event_id": event_id,
        "guest_count": guest_count,
        "stock_requisition": available,  # Items we have in stock
        "purchase_list": short,           # Items we need to buy
        "available": available,           # Legacy support
        "short": short,                   # Legacy support
        "total_ingredients": len(required_ingredients)
    }

@events_router.post("/{event_id}/generate-purchase-list")
async def generate_event_purchase_list(event_id: str, user: User = Depends(get_current_user)):
    """Generate purchase orders grouped by supplier for event"""
    stock_check = await check_event_stock(event_id, user)
    short_items = stock_check.get("short", [])
    
    if not short_items:
        return {"message": "No items to purchase", "purchase_orders": []}
    
    # Group by supplier
    by_supplier = {}
    for item in short_items:
        supplier_id = item.get("supplier_id") or "no_supplier"
        if supplier_id not in by_supplier:
            by_supplier[supplier_id] = []
        
        pack_size = item.get("pack_size", 1)
        shortage = item.get("shortage", 0)
        packs_needed = math.ceil(shortage / pack_size)
        
        by_supplier[supplier_id].append({
            "ingredient_id": item["ingredient_id"],
            "ingredient_name": item["name"],
            "quantity_needed": item["quantity_needed"],
            "quantity_on_hand": item.get("quantity_on_hand", 0),
            "quantity_to_order": packs_needed * pack_size,
            "purchase_unit": item.get("pack_unit", "unit"),
            "pack_size": pack_size,
            "packs_to_order": packs_needed,
            "unit_cost": item.get("cost_per_unit", 0),
            "total_cost": packs_needed * pack_size * item.get("cost_per_unit", 0)
        })
    
    # Create purchase order drafts
    now = datetime.now(timezone.utc)
    purchase_orders = []
    
    for supplier_id, lines in by_supplier.items():
        if supplier_id == "no_supplier":
            continue
        
        po_id = f"po_{uuid.uuid4().hex[:12]}"
        total = sum(l["total_cost"] for l in lines)
        
        po_doc = {
            "po_id": po_id,
            "company_id": user.company_id,
            "supplier_id": supplier_id,
            "event_id": event_id,
            "lines": lines,
            "total_amount": total,
            "status": "draft",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.purchase_orders.insert_one(po_doc)
        del po_doc["_id"]
        purchase_orders.append(po_doc)
    
    return {
        "event_id": event_id,
        "purchase_orders": purchase_orders,
        "unassigned_items": by_supplier.get("no_supplier", [])
    }

# ============== PURCHASE ORDERS ==============

@events_router.get("/purchase-orders")
async def get_purchase_orders(status: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    
    pos = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return pos

@events_router.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update PO status: draft, ordered, partially_received, received"""
    new_status = data.get("status")
    if new_status not in ["draft", "ordered", "partially_received", "received"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    now = datetime.now(timezone.utc)
    result = await db.purchase_orders.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": {"status": new_status, "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return {"message": "Status updated"}

@events_router.post("/purchase-orders/{po_id}/receive")
async def receive_purchase_order(po_id: str, data: dict, user: User = Depends(get_current_user)):
    """Receive items from purchase order into inventory"""
    po = await db.purchase_orders.find_one({"po_id": po_id, "company_id": user.company_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    now = datetime.now(timezone.utc)
    received_items = data.get("items", [])  # [{ingredient_id, quantity_received}]
    
    for item in received_items:
        ing_id = item.get("ingredient_id")
        qty = item.get("quantity_received", 0)
        
        # Update inventory
        await db.ingredients.update_one(
            {"ingredient_id": ing_id, "company_id": user.company_id},
            {"$inc": {"stock_quantity": qty}, "$set": {"updated_at": now.isoformat()}}
        )
    
    # Update PO status
    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {"status": "received", "received_at": now.isoformat(), "updated_at": now.isoformat()}}
    )
    
    return {"message": "Items received into inventory"}

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
        except:
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
    from utils.activity_logger import log_activity, user_info
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
    
    content = {
        "event": event,
        "client": client,
        "company": company,
        "recipes": recipes,  # Legacy
        "order_items": order_items,  # New: all items
        "items_by_type": items_by_type,  # Grouped by type
        "items_by_day": items_by_day,  # Grouped by day
        "is_multiday": is_multiday,
        "template_settings": template_settings,
        "section_titles": section_titles,
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
        "status", "notes", "due_date", "invoice_type", "subtotal", 
        "tax_rate", "tax_amount", "discount_percent", "discount_amount", 
        "total", "lines", "terms", "payment_terms"
    ]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    update_data["updated_at"] = now.isoformat()
    
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

@settings_router.put("/company")
async def update_company_settings(data: dict, user: User = Depends(get_current_user)):
    allowed_fields = ["name", "logo_url", "primary_color", "secondary_color", "default_language", "currency", "default_tax_rate", "time_format", "proposal_item_types"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
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
async def client_sign_document(document_id: str, data: dict):
    now = datetime.now(timezone.utc)
    signature = data.get("signature")
    signed_by = data.get("signed_by", "Client")
    
    result = await db.documents.update_one(
        {"document_id": document_id},
        {"$set": {"signature": signature, "signed_at": now.isoformat(), "signed_by": signed_by, "status": "signed", "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document signed successfully"}

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
    # Check if it's a default category
    cat = await db.item_categories.find_one({"category_id": category_id, "company_id": user.company_id})
    if cat and cat.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default category")
    
    result = await db.item_categories.delete_one({"category_id": category_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

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
        
        # If linked to inventory, get inventory cost
        if item.get("inventory_item_id"):
            inv_item = await db.inventory.find_one({"item_id": item["inventory_item_id"]}, {"_id": 0, "name": 1, "unit_cost": 1})
            if inv_item:
                item["inventory_item_name"] = inv_item.get("name")
                inv_cost = inv_item.get("unit_cost") or 0
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
    """Create multiple picklist items at once"""
    now = datetime.now(timezone.utc)
    created_items = []
    
    for item_data in data.items:
        item_id = f"pli_{uuid.uuid4().hex[:12]}"
        item_doc = {
            "item_id": item_id,
            "company_id": user.company_id,
            **item_data.model_dump(),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.picklist_items.insert_one(item_doc)
        del item_doc["_id"]
        created_items.append(item_doc)
    
    return {"created": len(created_items), "items": created_items}

@settings_router.put("/picklist/{item_id}")
async def update_picklist_item(item_id: str, data: PicklistItemUpdate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
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
    """Get all document templates with custom fields"""
    templates = await db.document_templates.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    
    if not templates:
        # Create defaults
        now = datetime.now(timezone.utc)
        default_types = ["Proposal", "Invoice", "PackingList", "KitchenSheet", "ServiceSheet"]
        templates = []
        for ttype in default_types:
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
            del template["_id"]
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
        "show_logo": data.show_logo,
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
    }
]

@settings_router.get("/roles")
async def get_roles(user: User = Depends(get_current_user)):
    """Get all roles for the company"""
    roles = await db.roles.find({"company_id": user.company_id}, {"_id": 0}).to_list(50)
    
    # If no roles exist, return defaults
    if not roles:
        # Create default roles
        for role in DEFAULT_ROLES:
            role_doc = {**role, "company_id": user.company_id}
            await db.roles.update_one(
                {"role_id": role["role_id"], "company_id": user.company_id},
                {"$setOnInsert": role_doc},
                upsert=True
            )
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
        raise HTTPException(status_code=400, detail="Cannot modify system role")
    
    update_data = {
        "name": data.get("name", role.get("name")),
        "name_es": data.get("name_es", role.get("name_es")),
        "description": data.get("description", role.get("description")),
        "description_es": data.get("description_es", role.get("description_es")),
        "permissions": data.get("permissions", role.get("permissions", [])),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.roles.update_one({"role_id": role_id}, {"$set": update_data})
    updated = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
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

# ============== PROPOSALS ROUTES ==============

async def generate_proposal_number(company_id: str) -> str:
    """Generate sequential proposal number"""
    count = await db.proposals.count_documents({"company_id": company_id})
    year = datetime.now().year
    return f"PROP-{year}-{str(count + 1).zfill(4)}"

async def calculate_proposal_financials(proposal_id: str, company_id: str):
    """Calculate all financial totals for a proposal"""
    items = await db.order_items.find({"proposal_id": proposal_id, "company_id": company_id}, {"_id": 0}).to_list(500)
    
    # Get current proposal to read discount and tax settings
    proposal = await db.proposals.find_one({"proposal_id": proposal_id}, {"_id": 0})
    
    subtotal = 0
    total_cost = 0
    has_missing_cost = False
    
    for item in items:
        item_total = item.get("quantity", 1) * item.get("unit_price", 0)
        subtotal += item_total
        
        if item.get("internal_cost") is not None:
            total_cost += item.get("quantity", 1) * item["internal_cost"]
        else:
            has_missing_cost = True
    
    margin = subtotal - total_cost
    margin_pct = (margin / subtotal * 100) if subtotal > 0 else 0
    
    # Calculate discount (supports both fixed amount and percentage)
    discount_type = proposal.get("discount_type", "fixed") if proposal else "fixed"  # "fixed" or "percentage"
    discount_value = proposal.get("discount_value", 0) if proposal else 0
    
    if discount_type == "percentage":
        discount_amount = subtotal * (discount_value / 100)
    else:
        discount_amount = discount_value
    
    subtotal_after_discount = subtotal - discount_amount
    
    # Calculate taxes from stored tax_details
    total_tax = sum(t.get("amount", 0) for t in (proposal.get("tax_details", []) if proposal else []))
    
    # Calculate total (subtotal - discount + tax)
    total = subtotal_after_discount + total_tax
    
    return {
        "subtotal": subtotal,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "discount_amount": discount_amount,
        "total_tax": total_tax,
        "total": total,
        "total_cost": total_cost,
        "total_margin": margin,
        "margin_percentage": margin_pct,
        "has_missing_cost": has_missing_cost
    }

@proposals_router.get("/event/{event_id}")
async def get_event_proposal(event_id: str, user: User = Depends(get_current_user)):
    """Get or create the proposal for an event"""
    proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    
    if not proposal:
        # Create new proposal
        now = datetime.now(timezone.utc)
        proposal_id = f"prop_{uuid.uuid4().hex[:12]}"
        proposal_number = await generate_proposal_number(user.company_id)
        
        proposal = {
            "proposal_id": proposal_id,
            "event_id": event_id,
            "company_id": user.company_id,
            "proposal_number": proposal_number,
            "status": "Draft",
            "valid_until": None,
            "client_notes": None,
            "payment_terms": None,
            "subtotal": 0,
            "discount_amount": 0,
            "tax_details": [],
            "total_tax": 0,
            "total": 0,
            "total_cost": 0,
            "total_margin": 0,
            "margin_percentage": 0,
            "custom_field_values": {},
            "last_edited_at": now.isoformat(),
            "created_at": now.isoformat()
        }
        await db.proposals.insert_one(proposal)
        del proposal["_id"]
    
    # Get order items
    items = await db.order_items.find({"proposal_id": proposal["proposal_id"]}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    proposal["items"] = items
    
    # Recalculate financials
    financials = await calculate_proposal_financials(proposal["proposal_id"], user.company_id)
    proposal.update(financials)
    
    # Get event to check client credit
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    credit_warnings = []
    
    if event and event.get("client_id"):
        client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0})
        if client and client.get("has_credit") and client.get("credit_limit", 0) > 0:
            credit_limit = client["credit_limit"]
            # Calculate credit used from unpaid invoices
            unpaid_invoices = await db.invoices.find({
                "client_id": event["client_id"],
                "company_id": user.company_id,
                "status": {"$in": ["pending", "partial", "overdue"]}
            }, {"_id": 0}).to_list(500)
            
            credit_used = sum(inv.get("total", 0) - inv.get("paid_amount", 0) for inv in unpaid_invoices)
            proposal_total = proposal.get("total", 0)
            projected_credit = credit_used + proposal_total
            credit_percentage = (projected_credit / credit_limit) * 100 if credit_limit > 0 else 0
            
            # Add credit context to proposal
            proposal["client_credit"] = {
                "has_credit": True,
                "credit_limit": credit_limit,
                "credit_used": credit_used,
                "projected_with_proposal": projected_credit,
                "credit_percentage": round(credit_percentage, 1),
                "available_credit": max(0, credit_limit - credit_used)
            }
            
            # Generate warnings
            if projected_credit > credit_limit:
                over_amount = projected_credit - credit_limit
                credit_warnings.append({
                    "type": "credit_exceeded",
                    "severity": "high",
                    "message": f"⚠️ Esta propuesta excedería el límite de crédito del cliente por ${over_amount:,.2f}",
                    "message_en": f"⚠️ This proposal would exceed client credit limit by ${over_amount:,.2f}"
                })
            elif credit_percentage >= 80:
                credit_warnings.append({
                    "type": "credit_warning",
                    "severity": "medium",
                    "message": f"⚡ El cliente está usando {credit_percentage:.0f}% de su línea de crédito (${credit_used:,.2f} de ${credit_limit:,.2f})",
                    "message_en": f"⚡ Client is using {credit_percentage:.0f}% of their credit line (${credit_used:,.2f} of ${credit_limit:,.2f})"
                })
    
    proposal["credit_warnings"] = credit_warnings
    
    return proposal

@proposals_router.put("/{proposal_id}")
async def update_proposal(proposal_id: str, data: ProposalUpdate, user: User = Depends(get_current_user)):
    """Update proposal details"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed (read-only)
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit proposal for a closed event")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["last_edited_at"] = now.isoformat()
    
    # If changing status to Accepted, log it
    old_status = proposal.get("status")
    new_status = update_data.get("status")
    
    await db.proposals.update_one(
        {"proposal_id": proposal_id},
        {"$set": update_data}
    )
    
    # Create audit log if status changed to/from Accepted
    if old_status != new_status and (old_status == "Accepted" or new_status == "Accepted"):
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "status_change",
            "changes": {"old_status": old_status, "new_status": new_status},
            "timestamp": now.isoformat()
        })
    
    # AUTOMATION: When proposal is Accepted, move event to "Committed" stage
    if new_status == "Accepted" and old_status != "Accepted":
        await db.events.update_one(
            {"event_id": proposal["event_id"], "company_id": user.company_id},
            {"$set": {"stage": "Committed", "updated_at": now.isoformat()}}
        )
        logger.info(f"Event {proposal['event_id']} auto-moved to 'Committed' stage after proposal acceptance")
    
    return await get_event_proposal(proposal["event_id"], user)

@proposals_router.put("/{proposal_id}/financials")
async def update_proposal_financials(proposal_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update discount, taxes, and recalculate totals"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit proposal for a closed event")
    
    # Get base items subtotal
    items = await db.order_items.find({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0}).to_list(500)
    subtotal = sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in items)
    total_cost = sum(item.get("quantity", 1) * (item.get("internal_cost") or 0) for item in items)
    
    # Handle discount - supports both fixed amount and percentage
    discount_type = data.get("discount_type", proposal.get("discount_type", "fixed"))  # "fixed" or "percentage"
    discount_value = data.get("discount_value", proposal.get("discount_value", 0))
    
    if discount_type == "percentage":
        discount_amount = subtotal * (discount_value / 100)
    else:
        discount_amount = discount_value
    
    subtotal_after_discount = subtotal - discount_amount
    tax_ids = data.get("tax_ids", [])
    
    # Calculate taxes
    tax_details = []
    total_tax = 0
    for tax_id in tax_ids:
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
    margin = subtotal - total_cost
    margin_pct = (margin / subtotal * 100) if subtotal > 0 else 0
    
    update_data = {
        "subtotal": subtotal,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "discount_amount": discount_amount,
        "tax_details": tax_details,
        "total_tax": total_tax,
        "total": total,
        "total_cost": total_cost,
        "total_margin": margin,
        "margin_percentage": margin_pct,
        "payment_terms": data.get("payment_terms", proposal.get("payment_terms")),
        "client_notes": data.get("client_notes", proposal.get("client_notes")),
        "last_edited_at": now.isoformat()
    }
    
    await db.proposals.update_one(
        {"proposal_id": proposal_id},
        {"$set": update_data}
    )
    
    return await get_event_proposal(proposal["event_id"], user)

@proposals_router.put("/{proposal_id}/custom-fields")
async def update_proposal_custom_fields(proposal_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update custom field values for a proposal"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit custom fields for a closed event")
    
    await db.proposals.update_one(
        {"proposal_id": proposal_id},
        {"$set": {"custom_field_values": data.get("values", {}), "last_edited_at": now.isoformat()}}
    )
    
    return await get_event_proposal(proposal["event_id"], user)

# ============== ORDER ITEMS ROUTES ==============

@proposals_router.get("/{proposal_id}/items")
async def get_order_items(proposal_id: str, user: User = Depends(get_current_user)):
    """Get all order items for a proposal"""
    items = await db.order_items.find({"proposal_id": proposal_id, "company_id": user.company_id}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return items

@proposals_router.post("/{proposal_id}/items")
async def add_order_item(proposal_id: str, data: OrderItemCreate, user: User = Depends(get_current_user)):
    """Add an order item to a proposal"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot add items to a closed event")
    
    item_id = f"oi_{uuid.uuid4().hex[:12]}"
    
    # Calculate item financials
    total_price = data.quantity * data.unit_price
    total_cost = data.quantity * data.internal_cost if data.internal_cost else None
    margin_amount = total_price - total_cost if total_cost is not None else None
    margin_pct = (margin_amount / total_price * 100) if margin_amount is not None and total_price > 0 else None
    
    # Get category name
    category_name = None
    if data.category_id:
        cat = await db.item_categories.find_one({"category_id": data.category_id}, {"_id": 0, "name": 1})
        category_name = cat.get("name") if cat else None
    
    # If Food item with recipe, auto-calculate internal cost
    internal_cost = data.internal_cost
    if data.item_type == "Food" and data.reference_id:
        recipe = await db.recipes.find_one({"recipe_id": data.reference_id, "company_id": user.company_id}, {"_id": 0})
        if recipe:
            internal_cost = recipe.get("cost_per_portion") or recipe.get("cost_per_serving") or 0
            total_cost = data.quantity * internal_cost
            margin_amount = total_price - total_cost
            margin_pct = (margin_amount / total_price * 100) if total_price > 0 else 0
    
    item_doc = {
        "item_id": item_id,
        "event_id": proposal["event_id"],
        "proposal_id": proposal_id,
        "company_id": user.company_id,
        "item_type": data.item_type,
        "reference_id": data.reference_id,
        "description": data.description,
        "quantity": data.quantity,
        "unit_price": data.unit_price,
        "internal_cost": internal_cost,
        "total_price": total_price,
        "total_cost": total_cost,
        "margin_amount": margin_amount,
        "margin_percentage": margin_pct,
        "category_id": data.category_id,
        "category_name": category_name,
        "internal_notes": data.internal_notes,
        "event_date": data.event_date,
        "section_title": data.section_title,
        "section_time": data.section_time,
        "sort_order": data.sort_order,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.order_items.insert_one(item_doc)
    del item_doc["_id"]
    
    # Log if proposal is already accepted
    if proposal.get("status") == "Accepted":
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "add_item",
            "item_id": item_id,
            "item_description": data.description,
            "changes": {"quantity": data.quantity, "unit_price": data.unit_price},
            "impact_on_total": total_price,
            "timestamp": now.isoformat()
        })
    
    return item_doc

@proposals_router.put("/{proposal_id}/items/{item_id}")
async def update_order_item(proposal_id: str, item_id: str, data: OrderItemUpdate, user: User = Depends(get_current_user)):
    """Update an order item"""
    now = datetime.now(timezone.utc)
    
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot edit items in a closed event")
    
    item = await db.order_items.find_one({"item_id": item_id, "proposal_id": proposal_id, "company_id": user.company_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Recalculate financials
    quantity = update_data.get("quantity", item.get("quantity", 1))
    unit_price = update_data.get("unit_price", item.get("unit_price", 0))
    internal_cost = update_data.get("internal_cost", item.get("internal_cost"))
    
    total_price = quantity * unit_price
    total_cost = quantity * internal_cost if internal_cost is not None else None
    margin_amount = total_price - total_cost if total_cost is not None else None
    margin_pct = (margin_amount / total_price * 100) if margin_amount is not None and total_price > 0 else None
    
    update_data.update({
        "total_price": total_price,
        "total_cost": total_cost,
        "margin_amount": margin_amount,
        "margin_percentage": margin_pct,
        "updated_at": now.isoformat()
    })
    
    # Log if proposal is accepted
    old_total = item.get("total_price", 0)
    if proposal.get("status") == "Accepted":
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "edit_item",
            "item_id": item_id,
            "item_description": item.get("description"),
            "changes": update_data,
            "impact_on_total": total_price - old_total,
            "timestamp": now.isoformat()
        })
    
    await db.order_items.update_one(
        {"item_id": item_id},
        {"$set": update_data}
    )
    
    updated_item = await db.order_items.find_one({"item_id": item_id}, {"_id": 0})
    return updated_item

@proposals_router.delete("/{proposal_id}/items/{item_id}")
async def delete_order_item(proposal_id: str, item_id: str, user: User = Depends(get_current_user)):
    """Delete an order item"""
    proposal = await db.proposals.find_one({"proposal_id": proposal_id, "company_id": user.company_id})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Check if event is closed
    event = await db.events.find_one({"event_id": proposal["event_id"], "company_id": user.company_id})
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot delete items from a closed event")
    
    item = await db.order_items.find_one({"item_id": item_id, "proposal_id": proposal_id, "company_id": user.company_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Log if proposal is accepted
    if proposal.get("status") == "Accepted":
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:12]}",
            "event_id": proposal["event_id"],
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_name": user.name,
            "action_type": "remove_item",
            "item_id": item_id,
            "item_description": item.get("description"),
            "changes": {},
            "impact_on_total": -(item.get("total_price", 0)),
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    await db.order_items.delete_one({"item_id": item_id})
    return {"message": "Item deleted"}

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

# ============== EVENT FINANCIALS ROUTES ==============

@events_router.get("/{event_id}/financials")
async def get_event_financials(event_id: str, user: User = Depends(get_current_user)):
    """Get internal financials for an event (Admin/Owner only)"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not proposal:
        return {
            "total_revenue": 0,
            "total_cost": 0,
            "gross_margin": 0,
            "margin_percentage": 0,
            "by_item_type": {},
            "warnings": [],
            "has_proposal": False
        }
    
    # Get all items
    items = await db.order_items.find({"proposal_id": proposal["proposal_id"]}, {"_id": 0}).to_list(500)
    
    # Calculate by item type
    by_type = {}
    warnings = []
    total_revenue = 0
    total_cost = 0
    
    for item in items:
        itype = item.get("item_type", "Other")
        if itype not in by_type:
            by_type[itype] = {"revenue": 0, "cost": 0, "margin": 0, "count": 0}
        
        item_revenue = item.get("total_price", 0)
        item_cost = item.get("total_cost", 0) or 0
        
        by_type[itype]["revenue"] += item_revenue
        by_type[itype]["cost"] += item_cost
        by_type[itype]["margin"] += item_revenue - item_cost
        by_type[itype]["count"] += 1
        
        total_revenue += item_revenue
        total_cost += item_cost
        
        # Check for missing cost
        if item.get("internal_cost") is None:
            warnings.append({
                "type": "missing_cost",
                "item_id": item.get("item_id"),
                "description": item.get("description"),
                "message": f"Missing internal cost for: {item.get('description')}"
            })
    
    gross_margin = total_revenue - total_cost
    margin_pct = (gross_margin / total_revenue * 100) if total_revenue > 0 else 0
    
    # Low margin warning (threshold: 20%)
    if margin_pct < 20 and total_revenue > 0:
        warnings.append({
            "type": "low_margin",
            "message": f"Low overall margin: {margin_pct:.1f}%"
        })
    
    return {
        "total_revenue": total_revenue,
        "total_cost": total_cost,
        "gross_margin": gross_margin,
        "margin_percentage": margin_pct,
        "by_item_type": by_type,
        "warnings": warnings,
        "has_proposal": True,
        "proposal_status": proposal.get("status"),
        "proposal_number": proposal.get("proposal_number")
    }

# ============== EXTENDED EVENT ROUTES ==============

@events_router.put("/{event_id}/extended")
async def update_event_extended(event_id: str, data: EventExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended event fields"""
    now = datetime.now(timezone.utc)
    
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = now.isoformat()
    
    # If closing event, log it
    if data.operational_status == "Closed" and event.get("operational_status") != "Closed":
        proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id})
        if proposal:
            await db.audit_logs.insert_one({
                "log_id": f"audit_{uuid.uuid4().hex[:12]}",
                "event_id": event_id,
                "proposal_id": proposal["proposal_id"],
                "company_id": user.company_id,
                "user_id": user.user_id,
                "user_name": user.name,
                "action_type": "event_closed",
                "changes": {"operational_status": "Closed"},
                "timestamp": now.isoformat()
            })
    
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": update_data}
    )
    
    return await db.events.find_one({"event_id": event_id}, {"_id": 0})

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
    
    # Filter and group items based on document type
    items_by_category = {}
    items_by_date = {}
    
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
        
        # Group by category
        if cat_id not in items_by_category:
            items_by_category[cat_id] = {"name": cat_name, "items": []}
        items_by_category[cat_id]["items"].append(item)
        
        # Group by date
        if date_key not in items_by_date:
            items_by_date[date_key] = []
        items_by_date[date_key].append(item)
    
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

# ============== RECIPE PORTION FORMATS ROUTES ==============

@recipes_router.get("/{recipe_id}/portion-formats")
async def get_recipe_portion_formats(recipe_id: str, user: User = Depends(get_current_user)):
    """Get all portion formats for a recipe"""
    formats = await db.recipe_portion_formats.find(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(50)
    return formats

@recipes_router.post("/{recipe_id}/portion-formats")
async def create_recipe_portion_format(recipe_id: str, data: RecipePortionFormatCreate, user: User = Depends(get_current_user)):
    """Create a new portion format for a recipe"""
    # Get recipe to calculate cost
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    now = datetime.now(timezone.utc)
    format_id = f"pformat_{uuid.uuid4().hex[:12]}"
    
    # Calculate cost per portion using total_cost divided by portions_obtained
    total_cost = recipe.get("total_cost", 0)
    cost_per_portion = total_cost / data.portions_obtained if data.portions_obtained > 0 else 0
    
    # Calculate suggested price if target margin provided
    suggested_price = 0.0
    margin_pct = 0.0
    if data.target_margin_pct and data.target_margin_pct > 0 and data.target_margin_pct < 100:
        suggested_price = cost_per_portion / (1 - data.target_margin_pct / 100)
    
    # Calculate actual margin if sell price provided
    if data.sell_price > 0:
        margin_pct = ((data.sell_price - cost_per_portion) / data.sell_price * 100) if data.sell_price > 0 else 0
    
    # If this is default, unset other defaults
    if data.is_default:
        await db.recipe_portion_formats.update_many(
            {"recipe_id": recipe_id, "company_id": user.company_id},
            {"$set": {"is_default": False}}
        )
    
    portion_format = {
        "format_id": format_id,
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        "format_name": data.format_name,
        "portions_obtained": data.portions_obtained,
        "portion_unit": data.portion_unit,
        "sell_price": data.sell_price,
        "sell_price_tax_included": data.sell_price_tax_included,
        "target_margin_pct": data.target_margin_pct,
        "suggested_price": round(suggested_price, 2),
        "cost_per_portion": round(cost_per_portion, 2),
        "margin_pct": round(margin_pct, 2),
        "is_default": data.is_default,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.recipe_portion_formats.insert_one(portion_format)
    del portion_format["_id"]
    return portion_format

@recipes_router.put("/{recipe_id}/portion-formats/{format_id}")
async def update_recipe_portion_format(recipe_id: str, format_id: str, data: RecipePortionFormatCreate, user: User = Depends(get_current_user)):
    """Update a portion format"""
    # Get recipe to recalculate cost
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    now = datetime.now(timezone.utc)
    recipe_cost_per_yield = recipe.get("cost_per_yield", 0)
    cost_per_portion = recipe_cost_per_yield / data.portions_obtained if data.portions_obtained > 0 else 0
    
    suggested_price = 0.0
    margin_pct = 0.0
    if data.target_margin_pct and data.target_margin_pct > 0 and data.target_margin_pct < 100:
        suggested_price = cost_per_portion / (1 - data.target_margin_pct / 100)
    if data.sell_price > 0:
        margin_pct = ((data.sell_price - cost_per_portion) / data.sell_price * 100) if data.sell_price > 0 else 0
    
    if data.is_default:
        await db.recipe_portion_formats.update_many(
            {"recipe_id": recipe_id, "company_id": user.company_id, "format_id": {"$ne": format_id}},
            {"$set": {"is_default": False}}
        )
    
    result = await db.recipe_portion_formats.update_one(
        {"format_id": format_id, "recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": {
            "format_name": data.format_name,
            "portions_obtained": data.portions_obtained,
            "portion_unit": data.portion_unit,
            "sell_price": data.sell_price,
            "sell_price_tax_included": data.sell_price_tax_included,
            "target_margin_pct": data.target_margin_pct,
            "suggested_price": round(suggested_price, 2),
            "cost_per_portion": round(cost_per_portion, 2),
            "margin_pct": round(margin_pct, 2),
            "is_default": data.is_default,
            "notes": data.notes,
            "updated_at": now.isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Portion format not found")
    return {"message": "Updated"}

@recipes_router.delete("/{recipe_id}/portion-formats/{format_id}")
async def delete_recipe_portion_format(recipe_id: str, format_id: str, user: User = Depends(get_current_user)):
    """Delete a portion format"""
    result = await db.recipe_portion_formats.delete_one(
        {"format_id": format_id, "recipe_id": recipe_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Portion format not found")
    return {"message": "Deleted"}

# ============== RECIPE PACKAGING FORMATS ROUTES ==============

@recipes_router.get("/{recipe_id}/packaging-formats")
async def get_recipe_packaging_formats(recipe_id: str, user: User = Depends(get_current_user)):
    """Get all packaging formats for a recipe"""
    formats = await db.recipe_packaging_formats.find(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(50)
    return formats

@recipes_router.post("/{recipe_id}/packaging-formats")
async def create_recipe_packaging_format(recipe_id: str, data: RecipePackagingFormatCreate, user: User = Depends(get_current_user)):
    """Create a new packaging format for a recipe"""
    # Get packaging item details including cost
    packaging_item = await db.ingredients.find_one(
        {"ingredient_id": data.packaging_inventory_item_id, "company_id": user.company_id},
        {"_id": 0, "name": 1, "cost_per_unit": 1, "unit": 1}
    )
    
    cost_per_unit = packaging_item.get("cost_per_unit", 0) if packaging_item else 0
    cost_per_portion = cost_per_unit * data.qty_per_portion
    
    format_id = f"pkgformat_{uuid.uuid4().hex[:12]}"
    packaging_format = {
        "format_id": format_id,
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        "packaging_inventory_item_id": data.packaging_inventory_item_id,
        "packaging_item_name": packaging_item.get("name") if packaging_item else None,
        "unit": packaging_item.get("unit") if packaging_item else None,
        "cost_per_unit": cost_per_unit,
        "cost_per_portion": round(cost_per_portion, 4),
        "qty_per_portion": data.qty_per_portion,
        "notes": data.notes
    }
    await db.recipe_packaging_formats.insert_one(packaging_format)
    del packaging_format["_id"]
    return packaging_format

@recipes_router.delete("/{recipe_id}/packaging-formats/{format_id}")
async def delete_recipe_packaging_format(recipe_id: str, format_id: str, user: User = Depends(get_current_user)):
    """Delete a packaging format"""
    result = await db.recipe_packaging_formats.delete_one(
        {"format_id": format_id, "recipe_id": recipe_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Packaging format not found")
    return {"message": "Deleted"}

# ============== RECIPE EXTENDED FIELDS ROUTES ==============

@recipes_router.put("/{recipe_id}/extended")
async def update_recipe_extended(recipe_id: str, data: RecipeExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended recipe fields (allergens, work_category, etc.)"""
    update_data = {}
    if data.allergens is not None:
        update_data["allergens"] = data.allergens
    if data.work_category is not None:
        update_data["work_category"] = data.work_category
    if data.recipe_code is not None:
        update_data["recipe_code"] = data.recipe_code
    if data.verified_status is not None:
        update_data["verified_status"] = data.verified_status
    
    if not update_data:
        return {"message": "No updates provided"}
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"message": "Updated"}

@recipes_router.post("/{recipe_id}/image")
async def upload_recipe_image(recipe_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload an image for a recipe"""
    # Verify recipe exists
    recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, WebP, GIF")
    
    # Create unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"recipe_{recipe_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    
    # Save file
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update recipe with image URL
    image_url = f"/api/uploads/{filename}"
    await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": {"image_url": image_url, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"image_url": image_url, "filename": filename}

@recipes_router.delete("/{recipe_id}/image")
async def delete_recipe_image(recipe_id: str, user: User = Depends(get_current_user)):
    """Delete recipe image"""
    recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    # Delete file if exists
    if recipe.get("image_url"):
        filename = recipe["image_url"].split("/")[-1]
        filepath = UPLOADS_DIR / filename
        if filepath.exists():
            filepath.unlink()
    
    # Update recipe
    await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": {"image_url": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Image deleted"}

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

@suppliers_router.put("/{supplier_id}/extended")
async def update_supplier_extended(supplier_id: str, data: SupplierExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended supplier fields (payment terms, credit)"""
    update_data = {}
    if data.company_name is not None:
        update_data["company_name"] = data.company_name
    if data.payment_terms is not None:
        update_data["payment_terms"] = data.payment_terms
    if data.has_credit is not None:
        update_data["has_credit"] = data.has_credit
    if data.credit_limit is not None:
        update_data["credit_limit"] = data.credit_limit
    if data.usual_delivery_days is not None:
        update_data["usual_delivery_days"] = data.usual_delivery_days
    if data.tax_id is not None:
        update_data["tax_id"] = data.tax_id
    
    if not update_data:
        return {"message": "No updates provided"}
    
    result = await db.suppliers.update_one(
        {"supplier_id": supplier_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Updated"}

# ============== INVENTORY EXTENDED FIELDS ROUTES ==============

@inventory_router.put("/ingredients/{item_id}/extended")
async def update_inventory_extended(item_id: str, data: InventoryItemExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended inventory item fields (2nd supplier, purchase details)"""
    update_data = {}
    if data.secondary_supplier_id is not None:
        update_data["secondary_supplier_id"] = data.secondary_supplier_id
    if data.purchase_unit is not None:
        update_data["purchase_unit"] = data.purchase_unit
    if data.purchase_pack_size is not None:
        update_data["purchase_pack_size"] = data.purchase_pack_size
    if data.min_order_qty is not None:
        update_data["min_order_qty"] = data.min_order_qty
    if data.lead_time_days is not None:
        update_data["lead_time_days"] = data.lead_time_days
    
    if not update_data:
        return {"message": "No updates provided"}
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.ingredients.update_one(
        {"ingredient_id": item_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return {"message": "Updated"}

# ============== INVENTORY PRICE HISTORY ROUTES ==============

@inventory_router.get("/ingredients/{item_id}/price-history")
async def get_inventory_price_history(item_id: str, user: User = Depends(get_current_user)):
    """Get price history for an inventory item"""
    history = await db.inventory_price_history.find(
        {"inventory_item_id": item_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("effective_date", -1).to_list(100)
    return history

@inventory_router.post("/ingredients/{item_id}/price-history")
async def add_inventory_price_history(item_id: str, data: InventoryPriceHistoryCreate, user: User = Depends(get_current_user)):
    """Add a price history entry for an inventory item"""
    # Get supplier name if provided
    supplier_name = None
    if data.supplier_id:
        supplier = await db.suppliers.find_one(
            {"supplier_id": data.supplier_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        supplier_name = supplier.get("name") if supplier else None
    
    now = datetime.now(timezone.utc)
    history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
    
    history_entry = {
        "history_id": history_id,
        "inventory_item_id": item_id,
        "company_id": user.company_id,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier_name,
        "effective_date": now.isoformat(),
        "unit_cost": data.unit_cost,
        "purchase_unit": data.purchase_unit,
        "source": data.source,
        "notes": data.notes
    }
    await db.inventory_price_history.insert_one(history_entry)
    del history_entry["_id"]
    
    # Update item's current cost
    await db.ingredients.update_one(
        {"ingredient_id": item_id, "company_id": user.company_id},
        {"$set": {"cost_per_unit": data.unit_cost, "updated_at": now.isoformat()}}
    )
    
    return history_entry

# ============== BULK UPLOAD BY SUPPLIER ==============

class BulkProductUpload(BaseModel):
    supplier_id: str
    products: List[dict]  # [{name, category, inventory_type, unit, cost_per_unit, stock_quantity}]

@inventory_router.post("/bulk-upload-by-supplier")
async def bulk_upload_products_by_supplier(data: BulkProductUpload, user: User = Depends(get_current_user)):
    """
    Upload multiple products for a specific supplier.
    Creates new items or updates existing ones (matched by name + supplier).
    Also records price history for each item.
    """
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    now = datetime.now(timezone.utc)
    created = 0
    updated = 0
    price_changes = 0
    
    for product in data.products:
        name = product.get("name", "").strip()
        if not name:
            continue
        
        # Check if item exists with this name and supplier
        existing = await db.ingredients.find_one(
            {
                "company_id": user.company_id,
                "name": {"$regex": f"^{name}$", "$options": "i"},
                "preferred_supplier_id": data.supplier_id
            },
            {"_id": 0}
        )
        
        new_cost = float(product.get("cost_per_unit", 0) or 0)
        
        if existing:
            # Update existing item
            old_cost = existing.get("cost_per_unit", 0)
            
            update_data = {
                "category": product.get("category") or existing.get("category"),
                "inventory_type": product.get("inventory_type") or existing.get("inventory_type"),
                "unit": product.get("unit") or existing.get("unit"),
                "cost_per_unit": new_cost,
                "updated_at": now.isoformat()
            }
            
            # Add stock if provided
            if product.get("stock_quantity"):
                update_data["stock_quantity"] = existing.get("stock_quantity", 0) + float(product.get("stock_quantity", 0))
            
            await db.ingredients.update_one(
                {"ingredient_id": existing["ingredient_id"]},
                {"$set": update_data}
            )
            
            # Record price change if different
            if new_cost > 0 and abs(new_cost - old_cost) > 0.001:
                history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
                await db.inventory_price_history.insert_one({
                    "history_id": history_id,
                    "inventory_item_id": existing["ingredient_id"],
                    "company_id": user.company_id,
                    "supplier_id": data.supplier_id,
                    "supplier_name": supplier.get("name"),
                    "old_price": old_cost,
                    "new_price": new_cost,
                    "effective_date": now.isoformat(),
                    "source": "bulk_upload",
                    "notes": f"Updated from supplier upload"
                })
                price_changes += 1
            
            updated += 1
        else:
            # Create new item
            ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"
            new_item = {
                "ingredient_id": ingredient_id,
                "company_id": user.company_id,
                "name": name,
                "category": product.get("category", "other"),
                "inventory_type": product.get("inventory_type", "food"),
                "unit": product.get("unit", "unit"),
                "cost_per_unit": new_cost,
                "stock_quantity": float(product.get("stock_quantity", 0) or 0),
                "reserved_quantity": 0,
                "par_level": float(product.get("par_level", 0) or 0),
                "min_stock_level": float(product.get("par_level", 0) or 0),
                "pack_size": float(product.get("pack_size", 1) or 1),
                "preferred_supplier_id": data.supplier_id,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            await db.ingredients.insert_one(new_item)
            
            # Record initial price
            if new_cost > 0:
                history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
                await db.inventory_price_history.insert_one({
                    "history_id": history_id,
                    "inventory_item_id": ingredient_id,
                    "company_id": user.company_id,
                    "supplier_id": data.supplier_id,
                    "supplier_name": supplier.get("name"),
                    "old_price": 0,
                    "new_price": new_cost,
                    "effective_date": now.isoformat(),
                    "source": "bulk_upload",
                    "notes": f"Initial price from supplier upload"
                })
            
            created += 1
    
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "price_changes": price_changes,
        "supplier_name": supplier.get("name")
    }

# Endpoint to update price from invoice
class InvoicePriceUpdate(BaseModel):
    supplier_id: str
    items: List[dict]  # [{inventory_item_id or name, new_price, quantity_received}]
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None

@inventory_router.post("/update-prices-from-invoice")
async def update_prices_from_invoice(data: InvoicePriceUpdate, user: User = Depends(get_current_user)):
    """
    Update inventory prices based on a received invoice.
    Records price history for audit trail.
    """
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    now = datetime.now(timezone.utc)
    updated = 0
    price_changes = []
    
    for item in data.items:
        item_id = item.get("inventory_item_id")
        item_name = item.get("name")
        new_price = float(item.get("new_price", 0) or 0)
        
        if not new_price:
            continue
        
        # Find item by ID or name
        query = {"company_id": user.company_id}
        if item_id:
            query["ingredient_id"] = item_id
        elif item_name:
            query["name"] = {"$regex": f"^{item_name}$", "$options": "i"}
        else:
            continue
        
        existing = await db.ingredients.find_one(query, {"_id": 0})
        if not existing:
            continue
        
        old_price = existing.get("cost_per_unit", 0)
        
        # Update price
        await db.ingredients.update_one(
            {"ingredient_id": existing["ingredient_id"]},
            {"$set": {
                "cost_per_unit": new_price,
                "updated_at": now.isoformat()
            }}
        )
        
        # Record price history
        history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
        history_entry = {
            "history_id": history_id,
            "inventory_item_id": existing["ingredient_id"],
            "company_id": user.company_id,
            "supplier_id": data.supplier_id,
            "supplier_name": supplier.get("name"),
            "old_price": old_price,
            "new_price": new_price,
            "effective_date": now.isoformat(),
            "source": "invoice",
            "invoice_number": data.invoice_number,
            "invoice_date": data.invoice_date,
            "notes": f"Price updated from invoice {data.invoice_number or ''}"
        }
        await db.inventory_price_history.insert_one(history_entry)
        
        change_pct = ((new_price - old_price) / old_price * 100) if old_price > 0 else 0
        price_changes.append({
            "item_name": existing["name"],
            "old_price": old_price,
            "new_price": new_price,
            "change_percent": round(change_pct, 1)
        })
        
        updated += 1
    
    return {
        "success": True,
        "updated": updated,
        "price_changes": price_changes,
        "supplier_name": supplier.get("name"),
        "invoice_number": data.invoice_number
    }

# ============== INVENTORY VALUE BY TYPE ==============

@inventory_router.get("/value-summary")
async def get_inventory_value_summary(user: User = Depends(get_current_user)):
    """Get inventory value breakdown by type"""
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {
            "_id": "$inventory_type",
            "total_value": {"$sum": {"$multiply": ["$stock_quantity", "$cost_per_unit"]}},
            "item_count": {"$sum": 1}
        }},
        {"$sort": {"total_value": -1}}
    ]
    results = await db.ingredients.aggregate(pipeline).to_list(20)
    
    summary = {
        "by_type": {r["_id"]: {"value": round(r["total_value"], 2), "count": r["item_count"]} for r in results},
        "total_value": round(sum(r["total_value"] for r in results), 2)
    }
    return summary

# ============== PURCHASE ORDERS ROUTES ==============

@purchase_orders_router.get("")
async def get_purchase_orders(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all purchase orders"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    pos = await db.purchase_orders_full.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return pos

@purchase_orders_router.get("/{po_id}")
async def get_purchase_order(po_id: str, user: User = Depends(get_current_user)):
    """Get a single purchase order"""
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po

@purchase_orders_router.post("")
async def create_purchase_order(data: PurchaseOrderFullCreate, user: User = Depends(get_current_user)):
    """Create a new purchase order"""
    # Get supplier name
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    now = datetime.now(timezone.utc)
    po_id = f"po_{uuid.uuid4().hex[:12]}"
    
    # Generate PO number
    count = await db.purchase_orders_full.count_documents({"company_id": user.company_id})
    po_number = f"PO-{now.year}-{str(count + 1).zfill(4)}"
    
    # Process lines
    lines = []
    subtotal = 0
    for line_data in data.lines:
        line_id = f"poline_{uuid.uuid4().hex[:12]}"
        line_total = line_data.qty_ordered * line_data.unit_cost
        lines.append({
            "line_id": line_id,
            "inventory_item_id": line_data.inventory_item_id,
            "item_name": line_data.item_name,
            "qty_ordered": line_data.qty_ordered,
            "purchase_unit": line_data.purchase_unit,
            "unit_cost": line_data.unit_cost,
            "line_total": round(line_total, 2),
            "qty_received": 0,
            "notes": line_data.notes
        })
        subtotal += line_total
    
    po = {
        "po_id": po_id,
        "company_id": user.company_id,
        "po_number": po_number,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier.get("name"),
        "status": "Draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "needed_by_date": data.needed_by_date.isoformat() if data.needed_by_date else None,
        "payment_method": data.payment_method,
        "notes": data.notes,
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

@purchase_orders_router.put("/{po_id}")
async def update_purchase_order(po_id: str, data: PurchaseOrderFullCreate, user: User = Depends(get_current_user)):
    """Update a purchase order (only if Draft)"""
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Can only edit Draft POs")
    
    # Get supplier name
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    
    now = datetime.now(timezone.utc)
    
    # Process lines
    lines = []
    subtotal = 0
    for line_data in data.lines:
        line_id = f"poline_{uuid.uuid4().hex[:12]}"
        line_total = line_data.qty_ordered * line_data.unit_cost
        lines.append({
            "line_id": line_id,
            "inventory_item_id": line_data.inventory_item_id,
            "item_name": line_data.item_name,
            "qty_ordered": line_data.qty_ordered,
            "purchase_unit": line_data.purchase_unit,
            "unit_cost": line_data.unit_cost,
            "line_total": round(line_total, 2),
            "qty_received": 0,
            "notes": line_data.notes
        })
        subtotal += line_total
    
    await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": {
            "supplier_id": data.supplier_id,
            "supplier_name": supplier.get("name") if supplier else None,
            "needed_by_date": data.needed_by_date.isoformat() if data.needed_by_date else None,
            "payment_method": data.payment_method,
            "notes": data.notes,
            "lines": lines,
            "subtotal": round(subtotal, 2),
            "total": round(subtotal, 2),
            "updated_at": now.isoformat()
        }}
    )
    return {"message": "Updated"}

@purchase_orders_router.put("/{po_id}/status")
async def update_purchase_order_status(po_id: str, status: str, user: User = Depends(get_current_user)):
    """Update PO status"""
    valid_statuses = ["Draft", "Sent", "PartiallyReceived", "Received", "Cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    now = datetime.now(timezone.utc)
    update_data = {"status": status, "updated_at": now.isoformat()}
    
    result = await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return {"message": "Status updated"}

@purchase_orders_router.post("/{po_id}/receive")
async def receive_purchase_order(
    po_id: str,
    received_lines: List[Dict[str, Any]],
    create_expense: bool = True,
    invoice_number: Optional[str] = None,
    invoice_date: Optional[datetime] = None,
    invoice_url: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """
    Receive items from a PO.
    received_lines: [{line_id, qty_received, unit_cost (optional override)}]
    Creates inventory transactions and optionally an expense record.
    """
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    now = datetime.now(timezone.utc)
    
    # Update PO lines with received quantities
    all_received = True
    updated_lines = []
    expense_lines = []
    
    for line in po.get("lines", []):
        received_info = next((r for r in received_lines if r.get("line_id") == line.get("line_id")), None)
        if received_info:
            new_qty_received = line.get("qty_received", 0) + received_info.get("qty_received", 0)
            unit_cost = received_info.get("unit_cost", line.get("unit_cost", 0))
            
            line["qty_received"] = new_qty_received
            line["unit_cost"] = unit_cost
            line["line_total"] = round(line.get("qty_ordered", 0) * unit_cost, 2)
            
            if new_qty_received < line.get("qty_ordered", 0):
                all_received = False
            
            # Create inventory transaction
            transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
            await db.inventory_transactions.insert_one({
                "transaction_id": transaction_id,
                "company_id": user.company_id,
                "inventory_item_id": line.get("inventory_item_id"),
                "event_id": None,
                "transaction_type": "Purchase",
                "quantity": received_info.get("qty_received", 0),
                "unit_cost": unit_cost,
                "notes": f"PO {po.get('po_number')}",
                "po_id": po_id,
                "created_at": now.isoformat(),
                "created_by": user.user_id
            })
            
            # Update inventory stock
            await db.ingredients.update_one(
                {"ingredient_id": line.get("inventory_item_id"), "company_id": user.company_id},
                {"$inc": {"stock_quantity": received_info.get("qty_received", 0)}}
            )
            
            # Add price history
            history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
            await db.inventory_price_history.insert_one({
                "history_id": history_id,
                "inventory_item_id": line.get("inventory_item_id"),
                "company_id": user.company_id,
                "supplier_id": po.get("supplier_id"),
                "supplier_name": po.get("supplier_name"),
                "effective_date": now.isoformat(),
                "unit_cost": unit_cost,
                "purchase_unit": line.get("purchase_unit", "unit"),
                "source": "PO",
                "notes": f"PO {po.get('po_number')}"
            })
            
            # Update item cost
            await db.ingredients.update_one(
                {"ingredient_id": line.get("inventory_item_id"), "company_id": user.company_id},
                {"$set": {"cost_per_unit": unit_cost, "updated_at": now.isoformat()}}
            )
            
            # Prepare expense line
            expense_lines.append({
                "inventory_item_id": line.get("inventory_item_id"),
                "description": line.get("item_name"),
                "quantity": received_info.get("qty_received", 0),
                "unit_cost": unit_cost,
                "tax_rate": 0
            })
        else:
            if line.get("qty_received", 0) < line.get("qty_ordered", 0):
                all_received = False
        
        updated_lines.append(line)
    
    # Update PO
    new_status = "Received" if all_received else "PartiallyReceived"
    subtotal = sum(l.get("line_total", 0) for l in updated_lines)
    
    await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": {
            "lines": updated_lines,
            "status": new_status,
            "subtotal": round(subtotal, 2),
            "total": round(subtotal, 2),
            "received_at": now.isoformat() if all_received else None,
            "received_by": user.user_id if all_received else None,
            "updated_at": now.isoformat()
        }}
    )
    
    # Create expense record if requested
    expense_id = None
    if create_expense and expense_lines:
        expense_id = f"expense_{uuid.uuid4().hex[:12]}"
        expense_total = sum(l["quantity"] * l["unit_cost"] for l in expense_lines)
        
        await db.expenses.insert_one({
            "expense_id": expense_id,
            "company_id": user.company_id,
            "supplier_id": po.get("supplier_id"),
            "supplier_name": po.get("supplier_name"),
            "po_id": po_id,
            "po_number": po.get("po_number"),
            "invoice_number": invoice_number,
            "invoice_date": invoice_date.isoformat() if invoice_date else now.isoformat(),
            "invoice_url": invoice_url,
            "due_date": None,
            "payment_method": po.get("payment_method", "Transfer"),
            "lines": expense_lines,
            "subtotal": round(expense_total, 2),
            "tax_amount": 0,
            "total": round(expense_total, 2),
            "amount": round(expense_total, 2),  # For compatibility
            "paid_amount": 0,
            "notes": f"Auto-created from PO {po.get('po_number')}",
            "description": f"PO {po.get('po_number')} - {po.get('supplier_name', 'Supplier')}",
            "status": "Pending",
            "payment_status": "Pending",  # For Business Clarity compatibility
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        })
    
    return {
        "message": "Items received",
        "new_status": new_status,
        "expense_id": expense_id
    }

@purchase_orders_router.delete("/{po_id}")
async def delete_purchase_order(po_id: str, user: User = Depends(get_current_user)):
    """Delete a purchase order (only if Draft)"""
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Can only delete Draft POs")
    
    await db.purchase_orders_full.delete_one({"po_id": po_id, "company_id": user.company_id})
    return {"message": "Deleted"}

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
        
        if not proposal:
            continue
        
        # Get order items
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
            
            # Get recipe
            recipe = await db.recipes.find_one(
                {"recipe_id": recipe_id, "company_id": user.company_id},
                {"_id": 0}
            )
            if not recipe:
                continue
            
            # Calculate portions needed
            # item.quantity already represents TOTAL portions/units ordered (not per-person)
            # Example: qty=150 means 150 portions total, qty=1500 means 1500 portions total
            item_qty = item.get("quantity", 1) or 1
            portions_needed = item_qty  # Direct use - quantity IS the total
            
            # Get yield info
            portions_per_yield = recipe.get("portions_per_yield", 1) or 1
            yields_needed = portions_needed / portions_per_yield
            
            # Apply buffer if requested
            if data.include_buffer:
                buffer_pct = 1.1  # 10% default buffer
                yields_needed *= buffer_pct
            
            # Process recipe ingredients
            for ing in recipe.get("ingredients", []):
                item_id = ing.get("item_id")
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
                effective_qty = qty_per_yield * (1 + waste_factor / 100) if waste_factor > 0 else qty_per_yield
                total_required = effective_qty * yields_needed
                
                if item_id in all_ingredients:
                    all_ingredients[item_id]["total_required"] += total_required
                    if recipe.get("name") not in all_ingredients[item_id]["recipes_used"]:
                        all_ingredients[item_id]["recipes_used"].append(recipe.get("name"))
                else:
                    all_ingredients[item_id] = {
                        "inventory_item_id": item_id,
                        "item_name": inv_item.get("name"),
                        "unit": inv_item.get("unit"),
                        "total_required": total_required,
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
                    item_id = ing.get("item_id")
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
                    effective_qty = qty_per_yield * (1 + waste_factor / 100) if waste_factor > 0 else qty_per_yield
                    total_required = effective_qty * sub_yields_needed
                    
                    if item_id in all_ingredients:
                        all_ingredients[item_id]["total_required"] += total_required
                        if sub_recipe.get("name") not in all_ingredients[item_id]["recipes_used"]:
                            all_ingredients[item_id]["recipes_used"].append(sub_recipe.get("name"))
                    else:
                        all_ingredients[item_id] = {
                            "inventory_item_id": item_id,
                            "item_name": inv_item.get("name"),
                            "unit": inv_item.get("unit"),
                            "total_required": total_required,
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
                item_id = ing.get("item_id")
                inv_item = await db.ingredients.find_one(
                    {"ingredient_id": item_id, "company_id": user.company_id},
                    {"_id": 0}
                )
                
                required_qty = (ing.get("quantity", 0) * multiplier)
                unit_cost = inv_item.get("cost_per_unit", 0) if inv_item else 0
                
                computed_inputs.append({
                    "inventory_item_id": item_id,
                    "item_name": ing.get("item_name", inv_item.get("name") if inv_item else "Unknown"),
                    "item_type": inv_item.get("item_type", "RAW") if inv_item else "RAW",
                    "required_qty": round(required_qty, 3),
                    "unit": ing.get("unit", "unit"),
                    "unit_cost": unit_cost,
                    "total_cost": round(required_qty * unit_cost, 2),
                    "in_stock": inv_item.get("stock_quantity", 0) if inv_item else 0
                })
                total_input_cost += required_qty * unit_cost
        
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
            except:
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
class PackingListItem(BaseModel):
    inventory_item_id: Optional[str] = None
    name: str
    inventory_type: str = "equipment"
    category: str = "other"
    quantity: int = 1
    unit: str = "unit"
    replacement_cost: float = 0
    notes: str = ""

class PackingListUpdate(BaseModel):
    items: List[dict]

@events_router.get("/{event_id}/packing-list")
async def get_event_packing_list(event_id: str, user: User = Depends(get_current_user)):
    """Get packing list items for an event"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get packing list from event or production assets
    packing_list = event.get("packing_list", [])
    
    if not packing_list:
        # Try production assets
        production = await db.production_assets.find_one(
            {"event_id": event_id},
            {"_id": 0, "packing_list": 1}
        )
        packing_list = production.get("packing_list", []) if production else []
    
    return packing_list

@events_router.put("/{event_id}/packing-list")
async def update_event_packing_list(event_id: str, data: PackingListUpdate, user: User = Depends(get_current_user)):
    """Update packing list items for an event"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    
    # Save to event document
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {
            "packing_list": data.items,
            "updated_at": now.isoformat()
        }}
    )
    
    return {"message": "Packing list updated", "items_count": len(data.items)}

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
                except:
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
    """Get events for calendar view"""
    query = {"company_id": user.company_id}
    
    # Date filtering
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        if date_filter:
            query["event_date"] = date_filter
    
    events = await db.events.find(query, {"_id": 0}).to_list(500)
    
    # Enrich with client names and milestones
    calendar_events = []
    for e in events:
        if e.get("client_id"):
            client = await db.clients.find_one({"client_id": e["client_id"]}, {"_id": 0, "display_name": 1})
            e["client_name"] = client.get("display_name") if client else None
        
        # Get milestones from operational flow
        flow = await db.operational_flows.find_one({"event_id": e.get("event_id")}, {"_id": 0, "phases": 1})
        e["phases"] = flow.get("phases", []) if flow else []
        
        calendar_events.append(e)
    
    # Detect conflicts (events on same day)
    from collections import defaultdict
    events_by_date = defaultdict(list)
    for e in calendar_events:
        if e.get("event_date"):
            date_str = str(e["event_date"])[:10] if isinstance(e["event_date"], str) else e["event_date"].isoformat()[:10]
            events_by_date[date_str].append(e.get("event_id"))
    
    conflicts = {date: ids for date, ids in events_by_date.items() if len(ids) > 1}
    
    return {
        "events": calendar_events,
        "conflicts": conflicts
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

class DeliveryNoteCheckIn(BaseModel):
    items: List[dict]  # [{inventory_item_id, qty_returned, notes}]

@delivery_notes_router.get("")
async def get_delivery_notes(user: User = Depends(get_current_user)):
    """Get all delivery notes for the company"""
    notes = await db.delivery_notes.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return notes

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
        "items": processed_items,
        "status": "pending",
        "checkout_date": data.checkout_date or now.isoformat(),
        "expected_return_date": data.expected_return_date,
        "checkin_date": None,
        "total_loss_cost": 0,
        "notes": data.notes,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.delivery_notes.insert_one(delivery_note)
    
    # Deduct from inventory (check-out)
    for item in processed_items:
        if item["inventory_item_id"]:
            await db.ingredients.update_one(
                {"ingredient_id": item["inventory_item_id"]},
                {"$inc": {"stock_quantity": -item["qty_out"]}}
            )
    
    return {"note_id": note_id, "note_number": note_number, "message": "Delivery note created"}

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

@delivery_notes_router.put("/{note_id}/check-in")
async def check_in_delivery_note(note_id: str, data: DeliveryNoteCheckIn, user: User = Depends(get_current_user)):
    """Record check-in (return) of items from a delivery note"""
    note = await db.delivery_notes.find_one(
        {"note_id": note_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not note:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    
    now = datetime.now(timezone.utc)
    total_loss_cost = 0
    all_returned = True
    
    updated_items = []
    for incoming_item in data.items:
        item_id = incoming_item.get("inventory_item_id")
        
        # Find matching item in note
        for note_item in note["items"]:
            if note_item.get("inventory_item_id") == item_id or note_item.get("name") == incoming_item.get("name"):
                # Only equipment requires return
                if note_item["inventory_type"] == "equipment":
                    qty_returned = incoming_item.get("qty_returned", 0)
                    qty_out = note_item["qty_out"]
                    qty_lost = max(0, qty_out - qty_returned)
                    loss_cost = qty_lost * note_item.get("replacement_cost", 0)
                    
                    note_item["qty_returned"] = qty_returned
                    note_item["qty_lost"] = qty_lost
                    note_item["loss_cost"] = loss_cost
                    note_item["status"] = "returned" if qty_lost == 0 else "partial"
                    
                    total_loss_cost += loss_cost
                    
                    if qty_lost > 0:
                        all_returned = False
                    
                    # Return items to inventory
                    if item_id and qty_returned > 0:
                        await db.ingredients.update_one(
                            {"ingredient_id": item_id},
                            {"$inc": {"stock_quantity": qty_returned}}
                        )
                else:
                    # Disposables don't return
                    note_item["status"] = "consumed"
                
                break
        
        updated_items.append(note_item)
    
    # Update note status
    status = "returned" if all_returned else "partial"
    
    await db.delivery_notes.update_one(
        {"note_id": note_id},
        {"$set": {
            "items": note["items"],
            "status": status,
            "checkin_date": now.isoformat(),
            "total_loss_cost": total_loss_cost,
            "updated_at": now.isoformat()
        }}
    )
    
    return {
        "message": "Check-in recorded",
        "status": status,
        "total_loss_cost": total_loss_cost
    }

# Edit Delivery Note (before check-in)
class DeliveryNoteUpdate(BaseModel):
    items: List[dict] = []  # Updated items list
    notes: Optional[str] = None

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
    
    await db.delivery_notes.update_one(
        {"note_id": note_id},
        {"$set": update_data}
    )
    
    return {
        "message": "Delivery note updated",
        "note_id": note_id,
        "items_count": len(updated_items)
    }

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

# Endpoint to get packing list supplies for an event
@events_router.get("/{event_id}/packing-list-supplies")
async def get_event_packing_list_supplies(event_id: str, user: User = Depends(get_current_user)):
    """Get operations supplies items from the packing list for an event"""
    # Get supplies type inventory items that might be in packing list
    supplies = await db.ingredients.find(
        {
            "company_id": user.company_id,
            "inventory_type": {"$in": ["equipment", "disposable", "event_supply"]}
        },
        {"_id": 0}
    ).to_list(500)
    
    # TODO: In the future, this should come from actual packing list data
    # For now, return available supplies that could be added to the event
    return supplies

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(crm_router)
api_router.include_router(leads_router)
api_router.include_router(contacts_router)
api_router.include_router(lead_forms_router)
api_router.include_router(events_router)
api_router.include_router(recipes_router)
api_router.include_router(plated_menus_router)
api_router.include_router(inventory_router)
api_router.include_router(suppliers_router)
api_router.include_router(operations_router)
api_router.include_router(purchase_list_router)
api_router.include_router(documents_router)
api_router.include_router(finance_router)
api_router.include_router(settings_router)
api_router.include_router(portal_router)
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
api_router.include_router(delivery_notes_router)

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
    agreement_id = str(uuid4())
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
    loss_id = str(uuid4())
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
    return await db.memberships.find_one(
        {"user_id": user_id, "company_id": company_id, "status": "active"},
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
    
    limit = plan.get("limits", {}).get(limit_field, 999)
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
async def startup_init_plans():
    await ensure_default_plans()
    # Initialize default addons
    await ensure_default_addons()
    # Create database indexes for performance
    from config import create_indexes
    await create_indexes()

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
    memberships = await db.memberships.find(
        {"user_id": user.user_id, "status": "active"},
        {"_id": 0}
    ).to_list(50)
    
    orgs = []
    for membership in memberships:
        company = await db.companies.find_one(
            {"company_id": membership["company_id"]},
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

@org_router.post("/switch/{company_id}")
async def switch_organization(company_id: str, user: User = Depends(get_current_user)):
    """Switch user's active organization"""
    # Check user has access to this org
    membership = await get_user_membership(user.user_id, company_id)
    
    # Also check if it's the user's legacy company
    user_data = await db.users.find_one({"user_id": user.user_id})
    is_legacy_company = user_data and user_data.get("company_id") == company_id
    
    if not membership and not is_legacy_company:
        raise HTTPException(status_code=403, detail="No access to this organization")
    
    # Update user's active org
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"company_id": company_id, "active_org_id": company_id}}
    )
    
    return {"success": True, "company_id": company_id}

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
async def get_members(user: User = Depends(get_current_user)):
    """Get all members of the organization"""
    memberships = await db.memberships.find(
        {"company_id": user.company_id, "status": "active"},
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with user data
    members = []
    for mem in memberships:
        user_data = await db.users.find_one({"user_id": mem["user_id"]}, {"_id": 0})
        if user_data:
            members.append({
                "membership_id": mem["membership_id"],
                "user_id": mem["user_id"],
                "email": user_data.get("email"),
                "name": user_data.get("name"),
                "picture": user_data.get("picture"),
                "role": mem["role"],
                "joined_at": mem["joined_at"],
                "is_current_user": mem["user_id"] == user.user_id
            })
    
    return members

@org_router.put("/members/{membership_id}/role")
async def update_member_role(membership_id: str, role: str, user: User = Depends(get_current_user)):
    """Update a member's role"""
    if not await check_permission(user, "manage_members"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if role not in ROLE_PERMISSIONS:
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
    
    return {"success": True}

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
    
    return {
        "role": role,
        "permissions": ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["viewer"])
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

# ---- Super Admin: Organization Members ----

@super_admin_router.get("/organizations/{company_id}/members")
async def get_org_members(company_id: str, admin: User = Depends(get_super_admin)):
    """Get all members of an organization (Super Admin only)"""
    memberships = await db.memberships.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(200)
    
    members = []
    for mem in memberships:
        user_data = await db.users.find_one({"user_id": mem["user_id"]}, {"_id": 0})
        if user_data:
            # Get last activity (simplified - last login would be better)
            members.append({
                "membership_id": mem["membership_id"],
                "user_id": mem["user_id"],
                "email": user_data.get("email"),
                "name": user_data.get("name"),
                "picture": user_data.get("picture"),
                "role": mem["role"],
                "status": mem["status"],
                "joined_at": mem["joined_at"],
                "last_active": user_data.get("last_login")
            })
    
    return members

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

from fastapi.responses import StreamingResponse
import io
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
            "nombre": c.get("name", ""),
            "email": c.get("email", ""),
            "telefono": c.get("phone", ""),
            "empresa": c.get("company", ""),
            "tipo": c.get("type", "individual"),
            "direccion": c.get("address", ""),
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
                            "email": email or existing.get("email"),
                            "phone": phone or existing.get("phone"),
                            "company": company or existing.get("company"),
                            "address": row.get('direccion') or row.get('address') or existing.get("address", ""),
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
                        "email": email,
                        "phone": phone,
                        "company": company,
                        "type": row.get('tipo') or row.get('type') or "individual",
                        "address": row.get('direccion') or row.get('address') or "",
                        "notes": row.get('notas') or row.get('notes') or "",
                        "tags": [],
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
                
                data = {
                    "name": name,
                    "category": row.get('categoria') or row.get('category') or "General",
                    "unit": row.get('unidad') or row.get('unit') or "unidad",
                    "cost_per_unit": float(cost),
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
        export_data.append({
            "nombre": l.get("name", ""),
            "email": l.get("email", ""),
            "telefono": l.get("phone", ""),
            "empresa": l.get("company", ""),
            "fuente": l.get("source", ""),
            "estado": l.get("status", "new"),
            "valor_estimado": l.get("estimated_value", 0),
            "tipo_evento": l.get("event_type", ""),
            "fecha_evento": l.get("event_date", ""),
            "num_invitados": l.get("guest_count", 0),
            "notas": l.get("notes", ""),
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
    user: User = Depends(get_current_user)
):
    """Import leads from CSV or Excel"""
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
                email = row.get('email') or ""
                
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
                
                lead_data = {
                    "name": name,
                    "email": email,
                    "phone": str(row.get('telefono') or row.get('phone') or ""),
                    "company": row.get('empresa') or row.get('company') or "",
                    "source": row.get('fuente') or row.get('source') or "import",
                    "status": row.get('estado') or row.get('status') or "new",
                    "estimated_value": float(estimated_value),
                    "event_type": row.get('tipo_evento') or row.get('event_type') or "",
                    "event_date": str(row.get('fecha_evento') or row.get('event_date') or ""),
                    "guest_count": int(guest_count),
                    "notes": row.get('notas') or row.get('notes') or "",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
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

@import_export_router.get("/templates/{type}")
async def get_import_template(type: str, format: str = "csv"):
    """Get import template for clients, inventory, recipes, quotes, or events"""
    templates = {
        "clients": {
            "columns": ["nombre", "email", "telefono", "empresa", "tipo", "direccion", "notas"],
            "sample": [["Juan Pérez", "juan@email.com", "555-1234", "Empresa ABC", "corporate", "Calle 123", "Cliente VIP"]]
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
            "columns": ["cliente", "fecha", "fecha_evento", "estado", "items", "subtotal", "impuestos", "total", "notas"],
            "sample": [["Empresa ABC", "2026-01-15", "2026-02-01", "sent", "Catering: 50 x $150; Decoración: 1 x $500", 8000, 1280, 9280, "Evento corporativo"]]
        },
        "events": {
            "columns": ["nombre_evento", "cliente", "fecha_inicio", "fecha_fin", "hora_inicio", "hora_fin", "ubicacion", "tipo_evento", "num_invitados", "estado", "presupuesto", "notas"],
            "sample": [["Boda García-López", "Juan García", "2026-02-14", "2026-02-14", "16:00", "23:00", "Jardín Las Palmas", "wedding", 150, "confirmed", 50000, "Incluye catering"]]
        },
        "leads": {
            "columns": ["nombre", "email", "telefono", "empresa", "fuente", "estado", "valor_estimado", "tipo_evento", "fecha_evento", "num_invitados", "notas"],
            "sample": [["María García", "maria@email.com", "555-9876", "Empresa XYZ", "website", "new", 15000, "corporate", "2026-03-15", 100, "Interesado en catering"]]
        }
    }
    
    if type not in templates:
        raise HTTPException(status_code=400, detail="Tipo inválido. Use: clients, inventory, recipes, quotes, events, leads")
    
    template = templates[type]
    df = pd.DataFrame(template["sample"], columns=template["columns"])
    
    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Template')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=template_{type}.xlsx"}
        )
    else:
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=template_{type}.csv"}
        )

# Include import_export_router
api_router.include_router(import_export_router)

# ============== USER MANAGEMENT ENDPOINTS ==============

@super_admin_router.get("/users")
async def get_all_users(user: User = Depends(get_current_user)):
    """Get all users (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
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

@super_admin_router.patch("/users/{user_id}")
async def update_user(
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
    """Delete a user (super admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    # Prevent self-deletion
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.users.delete_one({"user_id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}


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
    
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    now = datetime.now(timezone.utc)
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    # Create organization
    org_doc = {
        "company_id": company_id,
        "name": data.organization_name,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "es",
        "currency": "USD",
        "timezone": "America/Santo_Domingo",
        "status": "active",
        "account_type": data.account_type,  # demo, influencer, partner
        "admin_notes": data.notes,
        "created_by_admin": admin.user_id,
        "created_at": now.isoformat()
    }
    await db.companies.insert_one(org_doc)
    
    # Create organization config with industry
    industry_config = get_industry_config(data.industry_type)
    org_config_doc = {
        "config_id": f"cfg_{uuid.uuid4().hex[:8]}",
        "company_id": company_id,
        "industry_type": data.industry_type,
        "industry_template": {
            "events": "events_hospitality",
            "agency": "professional_services",
            "consulting": "professional_services",
            "generic": "generic"
        }.get(data.industry_type, "generic"),
        "terminology": {},
        "created_at": now.isoformat()
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
        modules_to_activate = industry_config.get("enabled_modules", [])
    
    for module_key in modules_to_activate:
        addon_id = f"addon_{module_key}"
        
        # Check if module addon definition exists
        addon_def = await db.addon_definitions.find_one({"addon_id": addon_id})
        if not addon_def:
            continue
        
        org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
        org_addon_doc = {
            "org_addon_id": org_addon_id,
            "company_id": company_id,
            "addon_id": addon_id,
            "addon_name": addon_def.get("display_name_es", module_key),
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
    
    return {
        "success": True,
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
        
        accounts.append({
            **org,
            "owner": owner,
            "subscription_status": subscription.get("status") if subscription else "none",
            "trial_ends_at": subscription.get("trial_ends_at") if subscription else None,
            "active_modules_count": modules_count
        })
    
    return {"accounts": accounts, "total": len(accounts)}


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

# Include execution_hub_router
api_router.include_router(execution_hub_router)

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

# Serve uploaded files
@api_router.get("/uploads/{filename}")
async def get_upload(filename: str):
    filepath = UPLOADS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
