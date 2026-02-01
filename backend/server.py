from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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

# Stripe integration
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'eep-evoque-secret-key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7

# Create the main app
app = FastAPI(title="EEP Evoque Events Platform API")

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
crm_router = APIRouter(prefix="/crm", tags=["CRM"])
leads_router = APIRouter(prefix="/leads", tags=["Leads"])
contacts_router = APIRouter(prefix="/contacts", tags=["Contacts"])
lead_forms_router = APIRouter(prefix="/lead-forms", tags=["Lead Forms"])
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
business_clarity_router = APIRouter(prefix="/business-clarity", tags=["Business Clarity"])
orchestration_router = APIRouter(prefix="/orchestration", tags=["Event Orchestration"])

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== MODELS ==============

# Auth Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    company_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    company_id: Optional[str] = None
    role: str = "admin"
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

# Company Model
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
    created_at: datetime

# ============== NEW CRM MODELS ==============

# Lead Model (Inbound inquiries)
class LeadCreate(BaseModel):
    lead_name: str
    email: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
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
    rnc: Optional[str] = None
    client_type: str = "Individual"  # Individual, Company
    # CRM Enhancement fields (additive)
    lead_type: str = "inbound"  # inbound, outreach
    outreach_status: Optional[str] = None  # New, Contacted, NoResponse, Engaged
    next_follow_up_date: Optional[str] = None
    follow_up_type: Optional[str] = None  # Call, Email, Meeting, CheckIn

class Lead(BaseModel):
    lead_id: str
    company_id: str
    lead_name: str
    email: str
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
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

# Contact Model (People linked to Clients)
class ContactCreate(BaseModel):
    client_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    role: Optional[str] = None  # Alias for role_title
    role_title: Optional[str] = None
    is_primary: bool = False
    is_billing_contact: bool = False

class Contact(BaseModel):
    contact_id: str
    company_id: str
    client_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    role: Optional[str] = None
    role_title: Optional[str] = None
    is_primary: bool = False
    is_billing_contact: bool = False
    created_at: datetime

# Client Model (Qualified accounts - Company or Individual)
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
    created_at: datetime
    updated_at: datetime
    # CRM Enhancement fields (additive)
    owner_id: Optional[str] = None
    next_follow_up_date: Optional[str] = None
    follow_up_type: Optional[str] = None  # Call, Email, Meeting, CheckIn
    last_event_date: Optional[str] = None
    lifetime_value: float = 0.0

# CRM Communication Log Model (additive)
class CommLogCreate(BaseModel):
    entity_type: str  # lead, client
    entity_id: str  # lead_id or client_id
    comm_type: str  # call, email, meeting, note
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

# Lead Form Model (Configurable forms)
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

# Event Models with multi-day support and CRM pipeline
class EventCreate(BaseModel):
    client_id: str
    name: str
    event_type: str
    event_date: Optional[datetime] = None
    event_date_tbd: bool = False
    end_date: Optional[datetime] = None  # For multi-day events
    start_time: Optional[str] = None  # e.g., "14:00"
    end_time: Optional[str] = None  # e.g., "22:00"
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int = 0
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
    event_date: Optional[datetime] = None
    event_date_tbd: bool = False
    end_date: Optional[datetime] = None  # For multi-day events
    start_time: Optional[str] = None  # e.g., "14:00"
    end_time: Optional[str] = None  # e.g., "22:00"
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int
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
    # Existing fields
    timeline: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    menu_items: List[str] = []
    documents: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime

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

class Ingredient(BaseModel):
    ingredient_id: str
    company_id: str
    name: str
    category: str
    inventory_type: str = "food"
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
    created_at: datetime
    updated_at: datetime

# Supplier Item (SKU Mapping)
class SupplierItemCreate(BaseModel):
    supplier_id: str
    ingredient_id: str
    supplier_sku: str = ""
    supplier_item_name: str = ""
    purchase_unit: str = "unit"  # case, bag, box, gallon, lb, kg
    pack_size_conversion: float = 1.0  # e.g., 1 case = 12 units
    last_purchase_price: float = 0.0
    tax_rate: float = 0.0

# Recipe Models - GastroKaisen style
class RecipeIngredient(BaseModel):
    item_id: str  # ingredient_id or recipe_id (for sub-recipes)
    item_type: str = "ingredient"  # ingredient or recipe
    item_name: str
    quantity: float
    unit: str
    waste_factor_pct: float = 0.0  # Merma percentage (e.g., 10 = 10% waste)
    cost_per_unit: float = 0.0
    total_cost: float = 0.0
    net_quantity: float = 0.0  # quantity after waste applied

class RecipeComponentLink(BaseModel):
    """Link a parent recipe to a child recipe (sub-recipe)"""
    child_recipe_id: str
    child_recipe_name: str
    quantity_used: float
    unit: str
    cost_per_unit: float = 0.0
    total_cost: float = 0.0

class RecipeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    recipe_type: str = "final_dish"  # base, component, final_dish
    category: str = "main"
    yield_quantity: float = 1.0
    yield_unit: str = "portion"
    portion_size: float = 1.0
    portion_unit: str = "serving"
    portions_per_yield: float = 1.0  # How many portions from one yield
    prep_time_minutes: int = 0
    cook_time_minutes: int = 0
    labor_minutes: int = 0
    ingredients: List[RecipeIngredient] = []
    sub_recipes: List[RecipeComponentLink] = []  # Sub-recipes used in this recipe
    instructions: List[str] = []
    notes: Optional[str] = None
    sell_price: float = 0.0
    image_url: Optional[str] = None

class Recipe(BaseModel):
    recipe_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    recipe_type: str = "final_dish"  # base, component, final_dish
    category: str
    yield_quantity: float
    yield_unit: str
    portion_size: float = 1.0
    portion_unit: str = "serving"
    portions_per_yield: float = 1.0
    prep_time_minutes: int
    cook_time_minutes: int
    labor_minutes: int = 0
    ingredients: List[RecipeIngredient]
    sub_recipes: List[RecipeComponentLink] = []
    instructions: List[str]
    notes: Optional[str] = None
    total_cost: float  # Total cost including sub-recipes
    cost_per_yield: float
    cost_per_portion: float
    sell_price: float = 0.0
    food_cost_percent: float = 0.0
    image_url: Optional[str] = None
    # Extended fields
    allergens: List[str] = []
    work_category: Optional[str] = None
    recipe_code: Optional[str] = None
    verified_status: str = "Draft"
    created_at: datetime
    updated_at: datetime

# Menu Item Model
class MenuItemCreate(BaseModel):
    name: str
    recipe_id: str
    default_portions: int = 1
    portion_size: float = 1.0
    sell_price: float = 0.0
    category: str = "main"

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

# Event Menu Model
class EventMenuCreate(BaseModel):
    event_id: str
    menu_items: List[Dict[str, Any]]  # [{menu_item_id, quantity, portion_multiplier}]
    notes: Optional[str] = None

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

class InvoiceCreate(BaseModel):
    client_id: str
    event_id: Optional[str] = None
    due_date: datetime
    lines: List[InvoiceLineCreate]
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    notes: Optional[str] = None

# ============== BUSINESS CLARITY MODELS ==============

# Enhanced Payment Model for Business Clarity
class PaymentCreate(BaseModel):
    """Payment record for Business Clarity"""
    client_id: str
    amount: float
    payment_method: str = "transfer"  # cash, transfer, card, check, other
    payment_date: Optional[datetime] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    # For Stripe payments
    stripe_session_id: Optional[str] = None

class Payment(BaseModel):
    """Full Payment model"""
    payment_id: str
    company_id: str
    client_id: str
    amount: float
    payment_method: str
    payment_date: datetime
    reference: Optional[str] = None
    notes: Optional[str] = None
    stripe_session_id: Optional[str] = None
    status: str = "completed"  # pending, completed, failed
    created_at: datetime
    updated_at: datetime

class PaymentApplicationCreate(BaseModel):
    """Apply payment to invoices"""
    payment_id: str
    applications: List[Dict[str, Any]]  # [{invoice_id, amount_applied}]

class PaymentApplication(BaseModel):
    """Payment application to invoice"""
    application_id: str
    payment_id: str
    invoice_id: str
    amount_applied: float
    created_at: datetime

# Stripe Payment Transaction
class StripePaymentTransaction(BaseModel):
    """Track Stripe payment transactions"""
    transaction_id: str
    company_id: str
    client_id: str
    invoice_ids: List[str] = []
    amount: float
    currency: str = "usd"
    session_id: str
    payment_status: str = "initiated"  # initiated, pending, paid, failed, expired
    metadata: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime

# Extended Invoice Model for Business Clarity
class InvoiceExtended(BaseModel):
    """Extended Invoice with payment tracking"""
    invoice_id: str
    company_id: str
    client_id: str
    event_id: Optional[str] = None
    invoice_number: str
    issue_date: datetime
    due_date: datetime
    lines: List[Dict[str, Any]] = []
    subtotal: float = 0.0
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    total: float = 0.0
    # Payment tracking fields
    paid_amount: float = 0.0
    balance_due: float = 0.0
    status: str = "open"  # open, partially_paid, paid, overdue
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# Client Credit Context
class ClientCreditUpdate(BaseModel):
    """Update client credit settings"""
    has_credit: bool = False
    credit_limit: float = 0.0
    payment_terms: str = "immediate"  # immediate, net_7, net_15, net_30, custom

# Supplier Payable (for A/P tracking)
class SupplierPayableCreate(BaseModel):
    """Create supplier payable"""
    supplier_id: str
    event_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    amount: float
    description: Optional[str] = None
    due_date: Optional[datetime] = None

class SupplierPayable(BaseModel):
    """Supplier payable record"""
    payable_id: str
    company_id: str
    supplier_id: str
    event_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    amount: float
    paid_amount: float = 0.0
    balance_due: float = 0.0
    status: str = "pending"  # pending, partially_paid, paid
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

# Stripe Checkout Request for Invoice Payment
class InvoicePaymentRequest(BaseModel):
    """Request to pay invoice(s) via Stripe"""
    invoice_ids: List[str]
    origin_url: str

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

# Run of Show Templates
RUN_OF_SHOW_TEMPLATES = {
    "wedding": {
        "name": "Wedding Ceremony & Reception",
        "name_es": "Ceremonia y Recepción de Boda",
        "blocks": [
            {"start_time": "14:00", "end_time": "14:30", "title": "Guest Arrival", "title_es": "Llegada de Invitados", "is_buffer": False},
            {"start_time": "14:30", "end_time": "15:00", "title": "Ceremony", "title_es": "Ceremonia", "is_buffer": False},
            {"start_time": "15:00", "end_time": "15:30", "title": "Cocktail Hour", "title_es": "Hora del Cóctel", "is_buffer": False},
            {"start_time": "15:30", "end_time": "16:00", "title": "Photos", "title_es": "Fotos", "is_buffer": False},
            {"start_time": "16:00", "end_time": "16:30", "title": "Reception Entry", "title_es": "Entrada a Recepción", "is_buffer": False},
            {"start_time": "16:30", "end_time": "17:30", "title": "Dinner Service", "title_es": "Servicio de Cena", "is_buffer": False},
            {"start_time": "17:30", "end_time": "18:00", "title": "Speeches & Toasts", "title_es": "Discursos y Brindis", "is_buffer": False},
            {"start_time": "18:00", "end_time": "18:30", "title": "First Dance & Cake", "title_es": "Primer Baile y Pastel", "is_buffer": False},
            {"start_time": "18:30", "end_time": "22:00", "title": "Dancing & Party", "title_es": "Baile y Fiesta", "is_buffer": False},
            {"start_time": "22:00", "end_time": "22:30", "title": "Send Off", "title_es": "Despedida", "is_buffer": False},
        ]
    },
    "corporate": {
        "name": "Corporate Event",
        "name_es": "Evento Corporativo",
        "blocks": [
            {"start_time": "08:00", "end_time": "08:30", "title": "Registration & Coffee", "title_es": "Registro y Café", "is_buffer": False},
            {"start_time": "08:30", "end_time": "09:00", "title": "Welcome & Opening", "title_es": "Bienvenida y Apertura", "is_buffer": False},
            {"start_time": "09:00", "end_time": "10:30", "title": "Keynote Session", "title_es": "Sesión Principal", "is_buffer": False},
            {"start_time": "10:30", "end_time": "11:00", "title": "Coffee Break", "title_es": "Receso de Café", "is_buffer": True},
            {"start_time": "11:00", "end_time": "12:30", "title": "Breakout Sessions", "title_es": "Sesiones Paralelas", "is_buffer": False},
            {"start_time": "12:30", "end_time": "14:00", "title": "Networking Lunch", "title_es": "Almuerzo de Networking", "is_buffer": False},
            {"start_time": "14:00", "end_time": "15:30", "title": "Workshops", "title_es": "Talleres", "is_buffer": False},
            {"start_time": "15:30", "end_time": "16:00", "title": "Closing & Farewell", "title_es": "Cierre y Despedida", "is_buffer": False},
        ]
    },
    "social": {
        "name": "Social Gathering",
        "name_es": "Reunión Social",
        "blocks": [
            {"start_time": "18:00", "end_time": "18:30", "title": "Guest Arrival", "title_es": "Llegada de Invitados", "is_buffer": False},
            {"start_time": "18:30", "end_time": "19:30", "title": "Cocktails & Appetizers", "title_es": "Cócteles y Aperitivos", "is_buffer": False},
            {"start_time": "19:30", "end_time": "21:00", "title": "Dinner", "title_es": "Cena", "is_buffer": False},
            {"start_time": "21:00", "end_time": "21:30", "title": "Special Moment", "title_es": "Momento Especial", "is_buffer": False},
            {"start_time": "21:30", "end_time": "23:00", "title": "Entertainment", "title_es": "Entretenimiento", "is_buffer": False},
            {"start_time": "23:00", "end_time": "23:30", "title": "Farewell", "title_es": "Despedida", "is_buffer": False},
        ]
    },
    "blank": {
        "name": "Blank Template",
        "name_es": "Plantilla en Blanco",
        "blocks": []
    }
}

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
    current_stock: float = 0.0
    par_level: float = 0.0
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: float = 0.0
    status: str = "Active"
    created_at: datetime
    updated_at: datetime

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

# Event Order Line Item (individual items in the Contract & Event Order)
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

# Event Order (the main Contract & Event Order document)
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

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> User:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user_doc)
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_doc = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user_doc)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

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

@auth_router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, response: Response):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    company_doc = {
        "company_id": company_id,
        "name": data.company_name or f"{data.name}'s Company",
        "logo_url": None,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "en",
        "currency": "USD",
        "default_tax_rate": 0.0,
        "created_at": now.isoformat()
    }
    await db.companies.insert_one(company_doc)
    
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "picture": None,
        "company_id": company_id,
        "role": "admin",
        "created_at": now.isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True, samesite="none", path="/", max_age=JWT_EXPIRATION_HOURS * 3600)
    
    user = User(user_id=user_id, email=data.email, name=data.name, picture=None, company_id=company_id, role="admin", created_at=now)
    return TokenResponse(access_token=token, user=user)

@auth_router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, response: Response):
    user_doc = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(data.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user_doc["user_id"])
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True, samesite="none", path="/", max_age=JWT_EXPIRATION_HOURS * 3600)
    
    user = User(
        user_id=user_doc["user_id"], email=user_doc["email"], name=user_doc["name"],
        picture=user_doc.get("picture"), company_id=user_doc.get("company_id"),
        role=user_doc.get("role", "admin"),
        created_at=datetime.fromisoformat(user_doc["created_at"]) if isinstance(user_doc["created_at"], str) else user_doc["created_at"]
    )
    return TokenResponse(access_token=token, user=user)

@auth_router.post("/session")
async def exchange_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": session_id})
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        oauth_data = resp.json()
    
    email = oauth_data.get("email")
    name = oauth_data.get("name")
    picture = oauth_data.get("picture")
    session_token = oauth_data.get("session_token")
    
    now = datetime.now(timezone.utc)
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user_doc:
        user_id = user_doc["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        
        company_doc = {"company_id": company_id, "name": f"{name}'s Company", "logo_url": None, "primary_color": "#3A4D3F", "secondary_color": "#E5DCC5", "default_language": "en", "currency": "USD", "default_tax_rate": 0.0, "created_at": now.isoformat()}
        await db.companies.insert_one(company_doc)
        
        user_doc = {"user_id": user_id, "email": email, "name": name, "picture": picture, "company_id": company_id, "role": "admin", "created_at": now.isoformat()}
        await db.users.insert_one(user_doc)
    
    expires_at = now + timedelta(days=7)
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": session_token, "expires_at": expires_at.isoformat(), "created_at": now.isoformat()})
    
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 3600)
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user_doc

@auth_router.get("/me", response_model=User)
async def get_me(user: User = Depends(get_current_user)):
    return user

@auth_router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ============== NEW CRM ROUTES ==============

# ----- LEADS ROUTES -----
@leads_router.get("")
async def get_leads(
    user: User = Depends(get_current_user),
    status: Optional[str] = None,
    source: Optional[str] = None,
    event_type: Optional[str] = None
):
    """Get all leads with optional filters"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if event_type:
        query["event_type"] = event_type
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for lead in leads:
        for field in ["created_at", "updated_at"]:
            if lead.get(field) and isinstance(lead[field], str):
                lead[field] = datetime.fromisoformat(lead[field])
    return leads

@leads_router.post("")
async def create_lead(data: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new lead (internal)"""
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    
    lead_doc = {
        "lead_id": lead_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "status": "New",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.leads.insert_one(lead_doc)
    del lead_doc["_id"]
    lead_doc["created_at"] = now
    lead_doc["updated_at"] = now
    return lead_doc

@leads_router.get("/stats")
async def get_lead_stats(user: User = Depends(get_current_user)):
    """Get lead statistics"""
    total = await db.leads.count_documents({"company_id": user.company_id})
    new_count = await db.leads.count_documents({"company_id": user.company_id, "status": "New"})
    contacted = await db.leads.count_documents({"company_id": user.company_id, "status": "Contacted"})
    converted = await db.leads.count_documents({"company_id": user.company_id, "status": "Converted"})
    discarded = await db.leads.count_documents({"company_id": user.company_id, "status": "Discarded"})
    
    # By source
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}
    ]
    by_source = await db.leads.aggregate(pipeline).to_list(10)
    
    return {
        "total": total,
        "new": new_count,
        "contacted": contacted,
        "converted": converted,
        "discarded": discarded,
        "by_source": {s["_id"]: s["count"] for s in by_source if s["_id"]}
    }

@leads_router.get("/{lead_id}")
async def get_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Get a specific lead"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for field in ["created_at", "updated_at"]:
        if lead.get(field) and isinstance(lead[field], str):
            lead[field] = datetime.fromisoformat(lead[field])
    return lead

@leads_router.put("/{lead_id}")
async def update_lead(lead_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update a lead"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Don't allow updates to converted leads
    if lead.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Cannot update a converted lead")
    
    now = datetime.now(timezone.utc)
    update_data = {k: v for k, v in data.items() if k not in ["lead_id", "company_id", "created_at"]}
    update_data["updated_at"] = now.isoformat()
    
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update_data})
    return await get_lead(lead_id, user)

@leads_router.post("/{lead_id}/convert")
async def convert_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Convert a lead to Client + Contact + Event"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Lead already converted")
    
    now = datetime.now(timezone.utc)
    
    # Check for existing client by email or company name
    existing_client = None
    if lead.get("email"):
        existing_client = await db.clients.find_one({"company_id": user.company_id, "email": lead["email"]}, {"_id": 0})
    if not existing_client and lead.get("company_name"):
        existing_client = await db.clients.find_one({"company_id": user.company_id, "display_name": lead["company_name"]}, {"_id": 0})
    
    if existing_client:
        client_id = existing_client["client_id"]
    else:
        # Create new client
        client_id = f"client_{uuid.uuid4().hex[:12]}"
        client_type = "Company" if lead.get("company_name") else "Individual"
        display_name = lead.get("company_name") or lead.get("lead_name")
        
        client_doc = {
            "client_id": client_id,
            "company_id": user.company_id,
            "client_type": client_type,
            "display_name": display_name,
            "email": lead.get("email"),
            "phone": lead.get("phone"),
            "source": lead.get("source", "Website"),
            "tags": [],
            "notes": lead.get("message"),
            "status": "Active",
            "total_revenue": 0.0,
            "events_count": 0,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.clients.insert_one(client_doc)
    
    # Create contact for the client
    contact_id = f"contact_{uuid.uuid4().hex[:12]}"
    contact_doc = {
        "contact_id": contact_id,
        "company_id": user.company_id,
        "client_id": client_id,
        "name": lead.get("lead_name"),
        "email": lead.get("email"),
        "phone": lead.get("phone"),
        "role_title": None,
        "is_primary": True,
        "is_billing_contact": False,
        "created_at": now.isoformat()
    }
    # Only insert if contact doesn't already exist
    existing_contact = await db.contacts.find_one({"client_id": client_id, "email": lead.get("email")})
    if not existing_contact:
        await db.contacts.insert_one(contact_doc)
    
    # Create event
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    event_date = None
    event_date_tbd = True
    if lead.get("event_date") and lead.get("event_date") != "TBD":
        try:
            event_date = datetime.fromisoformat(lead["event_date"]).isoformat()
            event_date_tbd = False
        except:
            event_date_tbd = True
    
    event_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        "client_id": client_id,
        "name": f"{lead.get('event_type', 'Event')} - {lead.get('lead_name', 'New Event')}",
        "event_type": lead.get("event_type", "other"),
        "event_date": event_date,
        "event_date_tbd": event_date_tbd,
        "end_date": None,
        "is_booking": False,
        "venue": None,
        "guest_count": lead.get("estimated_guest_count") or 0,
        "budget": 0.0,
        "notes": lead.get("message"),
        "status": "planning",
        "stage": "Inquiry Received",
        "expected_value": None,
        "next_followup_date": None,
        "next_step": None,
        "lost_reason": None,
        "source": lead.get("source"),
        "timeline": [],
        "tasks": [],
        "menu_items": [],
        "documents": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.events.insert_one(event_doc)
    
    # Update client events count
    await db.clients.update_one({"client_id": client_id}, {"$inc": {"events_count": 1}})
    
    # Mark lead as converted
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "status": "Converted",
            "converted_client_id": client_id,
            "converted_event_id": event_id,
            "updated_at": now.isoformat()
        }}
    )
    
    return {
        "message": "Lead converted successfully",
        "client_id": client_id,
        "contact_id": contact_id,
        "event_id": event_id
    }

@leads_router.post("/{lead_id}/discard")
async def discard_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Mark a lead as discarded"""
    lead = await db.leads.find_one({"lead_id": lead_id, "company_id": user.company_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("status") == "Converted":
        raise HTTPException(status_code=400, detail="Cannot discard a converted lead")
    
    now = datetime.now(timezone.utc)
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"status": "Discarded", "updated_at": now.isoformat()}}
    )
    return {"message": "Lead discarded"}

# ----- CLIENTS ROUTES -----
@crm_router.get("/clients")
async def get_clients(user: User = Depends(get_current_user), status: Optional[str] = None):
    """Get all clients (qualified accounts)"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    
    clients = await db.clients.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for c in clients:
        for field in ["created_at", "updated_at"]:
            if c.get(field) and isinstance(c[field], str):
                c[field] = datetime.fromisoformat(c[field])
        # Ensure new fields have defaults
        if "display_name" not in c:
            c["display_name"] = c.get("name", c.get("company_name", ""))
        if "client_type" not in c:
            c["client_type"] = "Company" if c.get("company_name") else "Individual"
        if "status" not in c:
            c["status"] = "Active"
    return clients

@crm_router.post("/clients")
async def create_client(data: ClientCreate, user: User = Depends(get_current_user)):
    """Create a new client"""
    now = datetime.now(timezone.utc)
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    
    client_doc = {
        "client_id": client_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "total_revenue": 0.0,
        "events_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.clients.insert_one(client_doc)
    del client_doc["_id"]
    client_doc["created_at"] = now
    client_doc["updated_at"] = now
    return client_doc

@crm_router.get("/clients/{client_id}")
async def get_client(client_id: str, user: User = Depends(get_current_user)):
    """Get a specific client with contacts"""
    client = await db.clients.find_one({"client_id": client_id, "company_id": user.company_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    for field in ["created_at", "updated_at"]:
        if client.get(field) and isinstance(client[field], str):
            client[field] = datetime.fromisoformat(client[field])
    
    # Ensure new fields have defaults
    if "display_name" not in client:
        client["display_name"] = client.get("name", client.get("company_name", ""))
    if "client_type" not in client:
        client["client_type"] = "Company" if client.get("company_name") else "Individual"
    if "status" not in client:
        client["status"] = "Active"
    
    # Get contacts
    contacts = await db.contacts.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    for contact in contacts:
        if contact.get("created_at") and isinstance(contact["created_at"], str):
            contact["created_at"] = datetime.fromisoformat(contact["created_at"])
    client["contacts"] = contacts
    
    return client

@crm_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientCreate, user: User = Depends(get_current_user)):
    """Update a client"""
    now = datetime.now(timezone.utc)
    result = await db.clients.update_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"$set": {**data.model_dump(), "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return await get_client(client_id, user)

@crm_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: User = Depends(get_current_user)):
    """Delete a client"""
    result = await db.clients.delete_one({"client_id": client_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    # Also delete associated contacts
    await db.contacts.delete_many({"client_id": client_id})
    return {"message": "Client deleted"}

@crm_router.get("/stats")
async def get_crm_stats(user: User = Depends(get_current_user)):
    """Get CRM statistics"""
    total_clients = await db.clients.count_documents({"company_id": user.company_id})
    active_clients = await db.clients.count_documents({"company_id": user.company_id, "status": "Active"})
    total_leads = await db.leads.count_documents({"company_id": user.company_id})
    new_leads = await db.leads.count_documents({"company_id": user.company_id, "status": "New"})
    
    # CRM Enhancement stats
    outreach_leads = await db.leads.count_documents({"company_id": user.company_id, "lead_type": "outreach"})
    inbound_leads = await db.leads.count_documents({"company_id": user.company_id, "lead_type": {"$ne": "outreach"}})
    
    # Follow-ups due
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    follow_ups_due = await db.leads.count_documents({
        "company_id": user.company_id,
        "next_follow_up_date": {"$lte": today},
        "status": {"$nin": ["Converted", "Discarded"]}
    })
    client_follow_ups_due = await db.clients.count_documents({
        "company_id": user.company_id,
        "next_follow_up_date": {"$lte": today}
    })
    
    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "total_leads": total_leads,
        "new_leads": new_leads,
        "outreach_leads": outreach_leads,
        "inbound_leads": inbound_leads,
        "follow_ups_due": follow_ups_due + client_follow_ups_due
    }

# ============== CRM ENHANCED VIEWS (ADDITIVE) ==============

@crm_router.get("/outreach")
async def get_outreach_leads(user: User = Depends(get_current_user)):
    """Get outreach leads - proactively contacted by the team"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "lead_type": "outreach"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    for lead in leads:
        for field in ["created_at", "updated_at"]:
            if lead.get(field) and isinstance(lead[field], str):
                lead[field] = datetime.fromisoformat(lead[field])
    
    return leads

@crm_router.post("/outreach")
async def create_outreach_lead(data: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new outreach lead"""
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    
    lead_data = data.model_dump()
    lead_data.update({
        "lead_id": lead_id,
        "company_id": user.company_id,
        "lead_type": "outreach",
        "source": "Outreach",
        "status": "New",
        "outreach_status": "New",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    })
    
    await db.leads.insert_one(lead_data)
    del lead_data["_id"]
    return lead_data

@crm_router.put("/outreach/{lead_id}/status")
async def update_outreach_status(lead_id: str, outreach_status: str, user: User = Depends(get_current_user)):
    """Update outreach status for a lead"""
    valid_statuses = ["New", "Contacted", "NoResponse", "Engaged"]
    if outreach_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    now = datetime.now(timezone.utc)
    result = await db.leads.update_one(
        {"lead_id": lead_id, "company_id": user.company_id},
        {"$set": {
            "outreach_status": outreach_status,
            "last_contact_date": now.isoformat() if outreach_status in ["Contacted", "Engaged"] else None,
            "updated_at": now.isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Status updated"}

@crm_router.get("/inbound")
async def get_inbound_leads(user: User = Depends(get_current_user)):
    """Get inbound leads - contacts from forms, email, social"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "lead_type": {"$ne": "outreach"}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    for lead in leads:
        for field in ["created_at", "updated_at"]:
            if lead.get(field) and isinstance(lead[field], str):
                lead[field] = datetime.fromisoformat(lead[field])
    
    return leads

@crm_router.get("/follow-ups")
async def get_follow_ups(user: User = Depends(get_current_user)):
    """Get unified follow-up view across leads and clients"""
    # Get leads with follow-ups
    lead_follow_ups = await db.leads.find(
        {
            "company_id": user.company_id,
            "next_follow_up_date": {"$ne": None},
            "status": {"$nin": ["Converted", "Discarded"]}
        },
        {"_id": 0}
    ).sort("next_follow_up_date", 1).to_list(200)
    
    # Get clients with follow-ups
    client_follow_ups = await db.clients.find(
        {
            "company_id": user.company_id,
            "next_follow_up_date": {"$ne": None}
        },
        {"_id": 0}
    ).sort("next_follow_up_date", 1).to_list(200)
    
    # Combine and normalize
    follow_ups = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    for lead in lead_follow_ups:
        follow_ups.append({
            "entity_type": "lead",
            "entity_id": lead["lead_id"],
            "name": lead.get("lead_name"),
            "email": lead.get("email"),
            "phone": lead.get("phone"),
            "follow_up_date": lead.get("next_follow_up_date"),
            "follow_up_type": lead.get("follow_up_type", "Call"),
            "owner_id": lead.get("owner_id"),
            "status": "overdue" if lead.get("next_follow_up_date", "") < today else "pending",
            "source": lead.get("source"),
            "lead_status": lead.get("status")
        })
    
    for client in client_follow_ups:
        follow_ups.append({
            "entity_type": "client",
            "entity_id": client["client_id"],
            "name": client.get("display_name"),
            "email": client.get("email"),
            "phone": client.get("phone"),
            "follow_up_date": client.get("next_follow_up_date"),
            "follow_up_type": client.get("follow_up_type", "CheckIn"),
            "owner_id": client.get("owner_id"),
            "status": "overdue" if client.get("next_follow_up_date", "") < today else "pending",
            "source": "Client",
            "client_status": client.get("status")
        })
    
    # Sort by date
    follow_ups.sort(key=lambda x: x.get("follow_up_date", "9999-12-31"))
    
    return follow_ups

@crm_router.put("/follow-ups/{entity_type}/{entity_id}")
async def update_follow_up(
    entity_type: str, 
    entity_id: str, 
    next_follow_up_date: Optional[str] = None,
    follow_up_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Update follow-up for a lead or client"""
    now = datetime.now(timezone.utc)
    
    update_data = {"updated_at": now.isoformat()}
    if next_follow_up_date is not None:
        update_data["next_follow_up_date"] = next_follow_up_date if next_follow_up_date else None
    if follow_up_type is not None:
        update_data["follow_up_type"] = follow_up_type if follow_up_type else None
    
    if entity_type == "lead":
        result = await db.leads.update_one(
            {"lead_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    elif entity_type == "client":
        result = await db.clients.update_one(
            {"client_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    return {"message": "Follow-up updated"}

@crm_router.post("/follow-ups/{entity_type}/{entity_id}/complete")
async def complete_follow_up(entity_type: str, entity_id: str, user: User = Depends(get_current_user)):
    """Mark a follow-up as completed"""
    now = datetime.now(timezone.utc)
    
    update_data = {
        "next_follow_up_date": None,
        "follow_up_type": None,
        "last_contact_date": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    if entity_type == "lead":
        result = await db.leads.update_one(
            {"lead_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    elif entity_type == "client":
        result = await db.clients.update_one(
            {"client_id": entity_id, "company_id": user.company_id},
            {"$set": update_data}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    return {"message": "Follow-up completed"}

# --- Communication Log ---
@crm_router.get("/comms/{entity_type}/{entity_id}")
async def get_comm_logs(entity_type: str, entity_id: str, user: User = Depends(get_current_user)):
    """Get communication logs for a lead or client"""
    logs = await db.comm_logs.find(
        {"company_id": user.company_id, "entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    return logs

@crm_router.post("/comms")
async def create_comm_log(data: CommLogCreate, user: User = Depends(get_current_user)):
    """Create a communication log entry"""
    now = datetime.now(timezone.utc)
    log_id = f"comm_{uuid.uuid4().hex[:12]}"
    
    # Get owner name
    owner_name = None
    if user.user_id:
        user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
        owner_name = user_doc.get("name") if user_doc else None
    
    log_data = {
        "log_id": log_id,
        "company_id": user.company_id,
        "entity_type": data.entity_type,
        "entity_id": data.entity_id,
        "comm_type": data.comm_type,
        "subject": data.subject,
        "content": data.content,
        "direction": data.direction,
        "owner_id": user.user_id,
        "owner_name": owner_name,
        "created_at": now.isoformat()
    }
    
    await db.comm_logs.insert_one(log_data)
    del log_data["_id"]
    
    # Update last contact date
    if data.entity_type == "lead":
        await db.leads.update_one(
            {"lead_id": data.entity_id, "company_id": user.company_id},
            {"$set": {"last_contact_date": now.isoformat(), "updated_at": now.isoformat()}}
        )
    elif data.entity_type == "client":
        await db.clients.update_one(
            {"client_id": data.entity_id, "company_id": user.company_id},
            {"$set": {"last_contact_date": now.isoformat(), "updated_at": now.isoformat()}}
        )
    
    return log_data

# --- Owner Assignment ---
@crm_router.put("/assign/{entity_type}/{entity_id}")
async def assign_owner(entity_type: str, entity_id: str, owner_id: str, user: User = Depends(get_current_user)):
    """Assign an owner to a lead or client"""
    now = datetime.now(timezone.utc)
    
    if entity_type == "lead":
        result = await db.leads.update_one(
            {"lead_id": entity_id, "company_id": user.company_id},
            {"$set": {"owner_id": owner_id, "updated_at": now.isoformat()}}
        )
    elif entity_type == "client":
        result = await db.clients.update_one(
            {"client_id": entity_id, "company_id": user.company_id},
            {"$set": {"owner_id": owner_id, "updated_at": now.isoformat()}}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    return {"message": "Owner assigned"}

@crm_router.get("/by-owner/{owner_id}")
async def get_by_owner(owner_id: str, user: User = Depends(get_current_user)):
    """Get all leads and clients assigned to a specific owner"""
    leads = await db.leads.find(
        {"company_id": user.company_id, "owner_id": owner_id},
        {"_id": 0}
    ).to_list(500)
    
    clients = await db.clients.find(
        {"company_id": user.company_id, "owner_id": owner_id},
        {"_id": 0}
    ).to_list(500)
    
    return {"leads": leads, "clients": clients}

# --- Clients with Event History ---
@crm_router.get("/clients-with-events")
async def get_clients_with_events(user: User = Depends(get_current_user)):
    """Get clients with their event history, contacts and credit info"""
    clients = await db.clients.find(
        {"company_id": user.company_id, "status": "Active"},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    
    # Enrich with event data, contacts, and credit calculations
    for client in clients:
        # Get events with more detail
        events = await db.events.find(
            {"client_id": client["client_id"], "company_id": user.company_id},
            {"_id": 0, "event_id": 1, "name": 1, "event_date": 1, "stage": 1, "status": 1, "ordered_by": 1, "contact_person": 1, "event_type": 1}
        ).sort("event_date", -1).to_list(50)
        
        client["events"] = events
        client["events_count"] = len(events)
        
        # Calculate lifetime value and credit used from proposals/invoices
        total_value = 0
        credit_used = 0
        for event in events:
            proposal = await db.proposals.find_one(
                {"event_id": event["event_id"]},
                {"_id": 0, "final_total": 1}
            )
            if proposal:
                total_value += proposal.get("final_total", 0) or 0
            
            # Check unpaid invoices for credit used
            if client.get("has_credit"):
                invoice = await db.invoices.find_one(
                    {"event_id": event["event_id"], "status": {"$ne": "paid"}},
                    {"_id": 0, "total": 1}
                )
                if invoice:
                    credit_used += invoice.get("total", 0) or 0
        
        client["lifetime_value"] = total_value
        client["credit_used"] = credit_used
        
        # Calculate credit percentage
        if client.get("has_credit") and client.get("credit_limit", 0) > 0:
            client["credit_percentage"] = round((credit_used / client["credit_limit"]) * 100, 1)
        else:
            client["credit_percentage"] = 0
        
        # Get last event date
        if events:
            client["last_event_date"] = events[0].get("event_date")
        
        # Get contacts for this client (especially important for companies)
        contacts = await db.contacts.find(
            {"client_id": client["client_id"], "company_id": user.company_id},
            {"_id": 0}
        ).to_list(50)
        client["contacts"] = contacts
    
    return clients

# ----- CONTACTS ROUTES -----
@contacts_router.get("")
async def get_contacts(user: User = Depends(get_current_user), client_id: Optional[str] = None):
    """Get contacts, optionally filtered by client"""
    query = {"company_id": user.company_id}
    if client_id:
        query["client_id"] = client_id
    
    contacts = await db.contacts.find(query, {"_id": 0}).to_list(1000)
    for contact in contacts:
        if contact.get("created_at") and isinstance(contact["created_at"], str):
            contact["created_at"] = datetime.fromisoformat(contact["created_at"])
    return contacts

@contacts_router.post("")
async def create_contact(data: ContactCreate, user: User = Depends(get_current_user)):
    """Create a new contact"""
    # Verify client exists
    client = await db.clients.find_one({"client_id": data.client_id, "company_id": user.company_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    now = datetime.now(timezone.utc)
    contact_id = f"contact_{uuid.uuid4().hex[:12]}"
    
    # If this is primary, unset other primary contacts
    if data.is_primary:
        await db.contacts.update_many(
            {"client_id": data.client_id},
            {"$set": {"is_primary": False}}
        )
    
    contact_doc = {
        "contact_id": contact_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.contacts.insert_one(contact_doc)
    del contact_doc["_id"]
    contact_doc["created_at"] = now
    return contact_doc

@contacts_router.get("/{contact_id}")
async def get_contact(contact_id: str, user: User = Depends(get_current_user)):
    """Get a specific contact"""
    contact = await db.contacts.find_one({"contact_id": contact_id, "company_id": user.company_id}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if contact.get("created_at") and isinstance(contact["created_at"], str):
        contact["created_at"] = datetime.fromisoformat(contact["created_at"])
    return contact

@contacts_router.put("/{contact_id}")
async def update_contact(contact_id: str, data: ContactCreate, user: User = Depends(get_current_user)):
    """Update a contact"""
    contact = await db.contacts.find_one({"contact_id": contact_id, "company_id": user.company_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    # If setting as primary, unset other primary contacts
    if data.is_primary:
        await db.contacts.update_many(
            {"client_id": data.client_id, "contact_id": {"$ne": contact_id}},
            {"$set": {"is_primary": False}}
        )
    
    await db.contacts.update_one(
        {"contact_id": contact_id},
        {"$set": data.model_dump()}
    )
    return await get_contact(contact_id, user)

@contacts_router.delete("/{contact_id}")
async def delete_contact(contact_id: str, user: User = Depends(get_current_user)):
    """Delete a contact"""
    result = await db.contacts.delete_one({"contact_id": contact_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}

# ----- LEAD FORMS ROUTES -----
@lead_forms_router.get("")
async def get_lead_forms(user: User = Depends(get_current_user)):
    """Get all lead forms"""
    forms = await db.lead_forms.find({"company_id": user.company_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for form in forms:
        for field in ["created_at", "updated_at"]:
            if form.get(field) and isinstance(form[field], str):
                form[field] = datetime.fromisoformat(form[field])
    return forms

@lead_forms_router.post("")
async def create_lead_form(data: LeadFormCreate, user: User = Depends(get_current_user)):
    """Create a new lead form"""
    now = datetime.now(timezone.utc)
    form_id = f"form_{uuid.uuid4().hex[:12]}"
    
    form_doc = {
        "form_id": form_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "submissions_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.lead_forms.insert_one(form_doc)
    del form_doc["_id"]
    form_doc["created_at"] = now
    form_doc["updated_at"] = now
    return form_doc

@lead_forms_router.get("/{form_id}")
async def get_lead_form(form_id: str, user: User = Depends(get_current_user)):
    """Get a specific lead form"""
    form = await db.lead_forms.find_one({"form_id": form_id, "company_id": user.company_id}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Lead form not found")
    for field in ["created_at", "updated_at"]:
        if form.get(field) and isinstance(form[field], str):
            form[field] = datetime.fromisoformat(form[field])
    return form

@lead_forms_router.put("/{form_id}")
async def update_lead_form(form_id: str, data: LeadFormCreate, user: User = Depends(get_current_user)):
    """Update a lead form"""
    now = datetime.now(timezone.utc)
    result = await db.lead_forms.update_one(
        {"form_id": form_id, "company_id": user.company_id},
        {"$set": {**data.model_dump(), "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead form not found")
    return await get_lead_form(form_id, user)

@lead_forms_router.delete("/{form_id}")
async def delete_lead_form(form_id: str, user: User = Depends(get_current_user)):
    """Delete a lead form"""
    result = await db.lead_forms.delete_one({"form_id": form_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead form not found")
    return {"message": "Lead form deleted"}

# ----- PUBLIC LEAD FORM SUBMISSION -----
@lead_forms_router.get("/{form_id}/public")
async def get_public_lead_form(form_id: str):
    """Get public lead form configuration (no auth required)"""
    form = await db.lead_forms.find_one({"form_id": form_id, "is_active": True}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or inactive")
    
    # Get company info for logo
    company = await db.companies.find_one({"company_id": form["company_id"]}, {"_id": 0, "name": 1, "logo_url": 1, "primary_color": 1})
    
    # Return only public-safe fields
    return {
        "form_id": form["form_id"],
        "form_name": form["form_name"],
        "description": form.get("description"),
        "description_es": form.get("description_es"),
        "fields": form.get("fields", []),
        "custom_fields": form.get("custom_fields", []),
        "default_event_type": form.get("default_event_type"),
        "thank_you_message_en": form.get("thank_you_message_en", form.get("thank_you_message", "Thank you for your inquiry!")),
        "thank_you_message_es": form.get("thank_you_message_es", "¡Gracias por tu consulta! Te contactaremos pronto."),
        "banner_url": form.get("banner_url"),
        "show_logo": form.get("show_logo", True),
        "primary_color": form.get("primary_color") or (company.get("primary_color") if company else None),
        "company_name": company.get("name") if company else None,
        "company_logo": company.get("logo_url") if company and form.get("show_logo", True) else None
    }

@lead_forms_router.post("/{form_id}/submit")
async def submit_lead_form(form_id: str, data: dict):
    """Submit a lead form (no auth required - public endpoint)"""
    form = await db.lead_forms.find_one({"form_id": form_id, "is_active": True}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or inactive")
    
    now = datetime.now(timezone.utc)
    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    
    # Create lead from form submission
    lead_doc = {
        "lead_id": lead_id,
        "company_id": form["company_id"],
        "lead_name": data.get("lead_name", data.get("name", "")),
        "email": data.get("email", ""),
        "phone": data.get("phone"),
        "whatsapp": data.get("whatsapp"),
        "company_name": data.get("company_name"),
        "event_type": data.get("event_type", form.get("default_event_type", "other")),
        "event_date": data.get("event_date"),
        "estimated_guest_count": data.get("estimated_guest_count") or data.get("guest_count"),
        "budget_range": data.get("budget_range"),
        "message": data.get("message", data.get("notes", "")),
        "source": form.get("default_source", "Website"),
        "form_name": form["form_name"],
        "status": "New",
        "lead_type": "inbound",
        "owner_id": form.get("assign_owner_id"),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.leads.insert_one(lead_doc)
    
    # Update form submission count
    await db.lead_forms.update_one(
        {"form_id": form_id},
        {"$inc": {"submissions_count": 1}}
    )
    
    # TODO: Send email notification here
    
    return {
        "success": True,
        "message": form.get("thank_you_message", "Thank you for your inquiry!"),
        "lead_id": lead_id
    }

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
    reason = data.get("reason", "manual")
    
    ingredient = await db.ingredients.find_one({"ingredient_id": ingredient_id, "company_id": user.company_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
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
        "adjustment": adjustment,
        "reason": reason,
        "previous_quantity": ingredient.get("stock_quantity", 0),
        "new_quantity": new_quantity,
        "user_id": user.user_id,
        "created_at": now.isoformat()
    })
    
    return {"new_quantity": new_quantity}

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

@recipes_router.get("", response_model=List[Recipe])
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
        if "stage" not in e:
            e["stage"] = "Inquiry Received"
        # Add client info to event
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_info"] = {
            "display_name": client_info.get("display_name", client_info.get("name", "")),
            "client_type": client_info.get("client_type", "Individual")
        }
        # Add pending balance from invoices
        e["pending_balance"] = invoices_by_event.get(e.get("event_id"), 0)
    return events

# Legacy stage mapping to new Engagement Stages
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

def normalize_stage(stage: str) -> str:
    """Normalize legacy stages to new Engagement Stages"""
    if stage in LEGACY_STAGE_MAP:
        return LEGACY_STAGE_MAP[stage]
    return stage or "Inquiry Received"

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
        pipeline[stage] = events
    
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
    if "stage" not in event:
        event["stage"] = "Inquiry Received"
    
    # Get client info
    client = await db.clients.find_one({"client_id": event.get("client_id")}, {"_id": 0, "display_name": 1, "client_type": 1})
    if client:
        event["client_info"] = {
            "display_name": client.get("display_name", ""),
            "client_type": client.get("client_type", "Individual")
        }
    
    return event

@events_router.put("/{event_id}")
async def update_event(event_id: str, data: EventCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    update_data = data.model_dump()
    update_data["event_date"] = data.event_date.isoformat() if data.event_date else None
    update_data["end_date"] = data.end_date.isoformat() if data.end_date else None
    update_data["next_followup_date"] = data.next_followup_date.isoformat() if data.next_followup_date else None
    update_data["updated_at"] = now.isoformat()
    
    result = await db.events.update_one({"event_id": event_id, "company_id": user.company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return await get_event(event_id, user)

@events_router.delete("/{event_id}")
async def delete_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.events.delete_one({"event_id": event_id})
    await db.clients.update_one({"client_id": event["client_id"]}, {"$inc": {"events_count": -1}})
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

@documents_router.post("/generate/{event_id}/{doc_type}")
async def generate_document(event_id: str, doc_type: str, user: User = Depends(get_current_user)):
    """Generate a document for an event with full content including discounts/taxes"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    client = await db.clients.find_one({"client_id": event["client_id"]}, {"_id": 0})
    
    # Get recipes for the event
    recipes = []
    for recipe_id in event.get("menu_items", []):
        recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
        if recipe:
            recipes.append(recipe)
    
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    
    # Get template settings
    template = await db.templates.find_one({"company_id": user.company_id, "type": doc_type}, {"_id": 0})
    template_settings = template.get("settings", {}) if template else {}
    
    if doc_type == "kitchen_sheet" and "show_prices" not in template_settings:
        template_settings["show_prices"] = False
    
    # Calculate totals with taxes/discounts
    subtotal = sum(r.get("cost_per_portion", 0) * event.get("guest_count", 1) for r in recipes)
    discount_rate = template_settings.get("discount_percent", 0) / 100
    tax_rate = company.get("default_tax_rate", 0) / 100 if company else 0
    
    discount_amount = subtotal * discount_rate
    taxable_amount = subtotal - discount_amount
    tax_amount = taxable_amount * tax_rate
    total = taxable_amount + tax_amount
    
    content = {
        "event": event,
        "client": client,
        "company": company,
        "recipes": recipes,
        "template_settings": template_settings,
        "financials": {
            "subtotal": subtotal,
            "discount_percent": discount_rate * 100,
            "discount_amount": discount_amount,
            "tax_percent": tax_rate * 100,
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
    update_data = {k: v for k, v in data.items() if k in ["status", "notes", "due_date"]}
    update_data["updated_at"] = now.isoformat()
    
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
    return Company(**company)

@settings_router.put("/company")
async def update_company_settings(data: dict, user: User = Depends(get_current_user)):
    allowed_fields = ["name", "logo_url", "primary_color", "secondary_color", "default_language", "currency", "default_tax_rate", "time_format"]
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
    doc_types = [
        {"type": "contract", "name": "Contract", "name_es": "Contrato", "requires_signature": True, "show_prices": True},
        {"type": "quote", "name": "Proposal", "name_es": "Propuesta", "requires_signature": True, "show_prices": True},
        {"type": "invoice", "name": "Invoice", "name_es": "Factura", "requires_signature": False, "show_prices": True},
        {"type": "beo", "name": "Banquet Event Order", "name_es": "Orden de Evento", "requires_signature": False, "show_prices": True},
        {"type": "kitchen_sheet", "name": "Kitchen Sheet", "name_es": "Hoja de Cocina", "requires_signature": False, "show_prices": False},
        {"type": "packing_list", "name": "Packing/Setup List", "name_es": "Lista de Montaje", "requires_signature": False, "show_prices": False},
        {"type": "mise_en_place", "name": "Mise en Place", "name_es": "Mise en Place", "requires_signature": False, "show_prices": False},
        {"type": "menu", "name": "Menu", "name_es": "Menú", "requires_signature": False, "show_prices": False},
    ]
    
    templates = await db.templates.find({"company_id": user.company_id}, {"_id": 0}).to_list(100)
    templates_by_type = {t["type"]: t for t in templates}
    
    for dt in doc_types:
        if dt["type"] in templates_by_type:
            dt["custom_settings"] = templates_by_type[dt["type"]].get("settings", {})
            dt["template_id"] = templates_by_type[dt["type"]]["template_id"]
    
    return doc_types

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
    
    for event_id in data.event_ids:
        # Get event
        event = await db.events.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if not event:
            continue
        
        guest_count = event.get("guest_count", event.get("num_guests", 0)) or 0
        events_info.append({
            "event_id": event_id,
            "event_name": event.get("name"),
            "guest_count": guest_count,
            "date": event.get("event_date")
        })
        
        # Get event's menu/proposal items
        proposal = await db.proposals.find_one(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0}
        )
        
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
            item_qty = item.get("quantity", 1)
            portions_needed = guest_count * item_qty
            
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
    total_cost = 0
    
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
            stock_requisition.append({
                "inventory_item_id": item_id,
                "item_name": item["item_name"],
                "unit": item["unit"],
                "in_stock": round(min(item["in_stock"], item["total_required"]), 2),
                "total_required": item["total_required"],
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
    
    return {
        "events": events_info,
        "items_by_supplier": items_by_supplier,
        "stock_requisition": stock_requisition,  # Items from inventory (SR)
        "purchase_list": purchase_list,          # Items to buy (PL)
        "total_cost": round(total_cost, 2),
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

# ============== BUSINESS CLARITY ROUTES ==============

# Stripe API Key
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

@business_clarity_router.get("/dashboard")
async def get_business_clarity_dashboard(user: User = Depends(get_current_user)):
    """Get Business Clarity executive dashboard"""
    now = datetime.now(timezone.utc)
    
    def parse_due_date(due_date):
        """Parse due_date to timezone-aware datetime"""
        if due_date is None:
            return None
        if isinstance(due_date, datetime):
            if due_date.tzinfo is None:
                return due_date.replace(tzinfo=timezone.utc)
            return due_date
        if isinstance(due_date, str):
            try:
                dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except:
                return None
        return None
    
    # Get invoices with balances
    invoices = await db.invoices.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    total_receivables = sum(inv.get("balance_due", inv.get("total", 0)) for inv in invoices if inv.get("status") != "paid")
    
    # Calculate overdue with safe datetime parsing
    total_overdue = 0
    for inv in invoices:
        if inv.get("status") == "paid":
            continue
        due_dt = parse_due_date(inv.get("due_date"))
        if due_dt and due_dt < now:
            total_overdue += inv.get("balance_due", inv.get("total", 0))
    
    # Get payables
    payables = await db.supplier_payables.find(
        {"company_id": user.company_id, "status": {"$ne": "paid"}},
        {"_id": 0}
    ).to_list(1000)
    total_payables = sum(p.get("balance_due", p.get("amount", 0)) for p in payables)
    
    # Get recent payments
    recent_payments = await db.payments.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Aging buckets
    aging = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
    for inv in invoices:
        if inv.get("status") == "paid":
            continue
        balance = inv.get("balance_due", inv.get("total", 0))
        due_dt = parse_due_date(inv.get("due_date"))
        if due_dt:
            days_overdue = (now - due_dt).days
            if days_overdue <= 0:
                aging["current"] += balance
            elif days_overdue <= 30:
                aging["1_30"] += balance
            elif days_overdue <= 60:
                aging["31_60"] += balance
            elif days_overdue <= 90:
                aging["61_90"] += balance
            else:
                aging["90_plus"] += balance
        else:
            aging["current"] += balance
    
    return {
        "total_receivables": round(total_receivables, 2),
        "total_overdue": round(total_overdue, 2),
        "total_payables": round(total_payables, 2),
        "aging_buckets": {k: round(v, 2) for k, v in aging.items()},
        "recent_payments": recent_payments,
        "invoices_count": len(invoices),
        "open_invoices_count": len([i for i in invoices if i.get("status") != "paid"])
    }

# ============== INVOICE MANAGEMENT ==============

@business_clarity_router.get("/invoices")
async def get_all_invoices(
    client_id: Optional[str] = None,
    event_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all invoices with payment status"""
    query = {"company_id": user.company_id}
    if client_id:
        query["client_id"] = client_id
    if event_id:
        query["event_id"] = event_id
    if status:
        query["status"] = status
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with client and event names
    for inv in invoices:
        if inv.get("client_id"):
            client = await db.clients.find_one({"client_id": inv["client_id"]}, {"_id": 0, "display_name": 1})
            inv["client_name"] = client.get("display_name") if client else None
        if inv.get("event_id"):
            event = await db.events.find_one({"event_id": inv["event_id"]}, {"_id": 0, "name": 1})
            inv["event_name"] = event.get("name") if event else None
    
    return invoices

@business_clarity_router.post("/invoices")
async def create_invoice(data: InvoiceCreate, user: User = Depends(get_current_user)):
    """Create a new invoice"""
    now = datetime.now(timezone.utc)
    
    # Calculate totals
    subtotal = sum(
        line.quantity * line.unit_price * (1 - line.discount_percent / 100)
        for line in data.lines
    )
    tax_amount = subtotal * (data.tax_rate / 100)
    total = subtotal * (1 - data.discount_percent / 100) + tax_amount
    
    # Generate invoice number
    count = await db.invoices.count_documents({"company_id": user.company_id})
    invoice_number = f"INV-{now.year}-{str(count + 1).zfill(4)}"
    
    invoice = {
        "invoice_id": f"inv_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "client_id": data.client_id,
        "event_id": data.event_id,
        "invoice_number": invoice_number,
        "issue_date": now.isoformat(),
        "due_date": data.due_date.isoformat(),
        "lines": [line.model_dump() for line in data.lines],
        "subtotal": round(subtotal, 2),
        "discount_percent": data.discount_percent,
        "tax_rate": data.tax_rate,
        "total": round(total, 2),
        "paid_amount": 0.0,
        "balance_due": round(total, 2),
        "status": "open",
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.invoices.insert_one(invoice)
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "invoice_created",
        "entity_type": "invoice",
        "entity_id": invoice["invoice_id"],
        "details": {"invoice_number": invoice_number, "total": total},
        "created_at": now.isoformat()
    })
    
    del invoice["_id"]
    return invoice

@business_clarity_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: User = Depends(get_current_user)):
    """Get invoice details with payment history"""
    invoice = await db.invoices.find_one(
        {"invoice_id": invoice_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get payment applications
    applications = await db.payment_applications.find(
        {"invoice_id": invoice_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get payment details for each application
    for app in applications:
        payment = await db.payments.find_one(
            {"payment_id": app["payment_id"]},
            {"_id": 0, "payment_date": 1, "payment_method": 1, "reference": 1}
        )
        if payment:
            app["payment_date"] = payment.get("payment_date")
            app["payment_method"] = payment.get("payment_method")
            app["reference"] = payment.get("reference")
    
    invoice["payment_applications"] = applications
    
    return invoice

# ============== PAYMENT MANAGEMENT ==============

@business_clarity_router.post("/payments")
async def create_payment(data: PaymentCreate, user: User = Depends(get_current_user)):
    """Create a payment record"""
    now = datetime.now(timezone.utc)
    
    payment = {
        "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "client_id": data.client_id,
        "amount": data.amount,
        "payment_method": data.payment_method,
        "payment_date": (data.payment_date or now).isoformat(),
        "reference": data.reference,
        "notes": data.notes,
        "stripe_session_id": data.stripe_session_id,
        "status": "completed",
        "applied_amount": 0.0,
        "unapplied_amount": data.amount,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.payments.insert_one(payment)
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "payment_created",
        "entity_type": "payment",
        "entity_id": payment["payment_id"],
        "details": {"amount": data.amount, "method": data.payment_method, "client_id": data.client_id},
        "created_at": now.isoformat()
    })
    
    del payment["_id"]
    return payment

@business_clarity_router.get("/payments")
async def get_payments(
    client_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all payments"""
    query = {"company_id": user.company_id}
    if client_id:
        query["client_id"] = client_id
    
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with client names
    for pay in payments:
        if pay.get("client_id"):
            client = await db.clients.find_one({"client_id": pay["client_id"]}, {"_id": 0, "display_name": 1})
            pay["client_name"] = client.get("display_name") if client else None
    
    return payments

@business_clarity_router.post("/payments/{payment_id}/apply")
async def apply_payment_to_invoices(payment_id: str, data: PaymentApplicationCreate, user: User = Depends(get_current_user)):
    """Apply a payment to one or multiple invoices"""
    now = datetime.now(timezone.utc)
    
    # Get payment
    payment = await db.payments.find_one(
        {"payment_id": payment_id, "company_id": user.company_id}
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    unapplied = payment.get("unapplied_amount", payment.get("amount", 0))
    total_to_apply = sum(app["amount_applied"] for app in data.applications)
    
    if total_to_apply > unapplied + 0.01:  # Small tolerance for floating point
        raise HTTPException(status_code=400, detail=f"Cannot apply ${total_to_apply:.2f}. Only ${unapplied:.2f} available.")
    
    applications_created = []
    
    for app in data.applications:
        invoice_id = app["invoice_id"]
        amount_to_apply = app["amount_applied"]
        
        # Get invoice
        invoice = await db.invoices.find_one(
            {"invoice_id": invoice_id, "company_id": user.company_id}
        )
        if not invoice:
            continue
        
        balance_due = invoice.get("balance_due", invoice.get("total", 0))
        actual_apply = min(amount_to_apply, balance_due)
        
        if actual_apply <= 0:
            continue
        
        # Create application record
        application = {
            "application_id": f"app_{uuid.uuid4().hex[:12]}",
            "payment_id": payment_id,
            "invoice_id": invoice_id,
            "amount_applied": actual_apply,
            "created_at": now.isoformat()
        }
        await db.payment_applications.insert_one(application)
        
        # Update invoice
        new_paid = invoice.get("paid_amount", 0) + actual_apply
        new_balance = invoice.get("total", 0) - new_paid
        new_status = "paid" if new_balance <= 0.01 else ("partially_paid" if new_paid > 0 else "open")
        
        await db.invoices.update_one(
            {"invoice_id": invoice_id},
            {"$set": {
                "paid_amount": round(new_paid, 2),
                "balance_due": round(max(0, new_balance), 2),
                "status": new_status,
                "updated_at": now.isoformat()
            }}
        )
        
        del application["_id"]
        applications_created.append(application)
    
    # Update payment
    total_applied = sum(a["amount_applied"] for a in applications_created)
    new_applied = payment.get("applied_amount", 0) + total_applied
    new_unapplied = payment.get("amount", 0) - new_applied
    
    await db.payments.update_one(
        {"payment_id": payment_id},
        {"$set": {
            "applied_amount": round(new_applied, 2),
            "unapplied_amount": round(max(0, new_unapplied), 2),
            "updated_at": now.isoformat()
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "payment_applied",
        "entity_type": "payment",
        "entity_id": payment_id,
        "details": {"applications": [{"invoice_id": a["invoice_id"], "amount": a["amount_applied"]} for a in applications_created]},
        "created_at": now.isoformat()
    })
    
    return {"applications": applications_created, "total_applied": total_applied}

# ============== STRIPE PAYMENT INTEGRATION ==============

@business_clarity_router.post("/checkout/session")
async def create_stripe_checkout(request: Request, data: InvoicePaymentRequest, user: User = Depends(get_current_user)):
    """Create Stripe checkout session for invoice payment"""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    # Get invoices and calculate total
    invoices = []
    total_amount = 0.0
    client_id = None
    
    for inv_id in data.invoice_ids:
        invoice = await db.invoices.find_one(
            {"invoice_id": inv_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if invoice and invoice.get("balance_due", 0) > 0:
            invoices.append(invoice)
            total_amount += invoice.get("balance_due", invoice.get("total", 0))
            if not client_id:
                client_id = invoice.get("client_id")
    
    if not invoices:
        raise HTTPException(status_code=400, detail="No invoices with balance due")
    
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be greater than 0")
    
    now = datetime.now(timezone.utc)
    
    # Create Stripe checkout
    host_url = data.origin_url
    webhook_url = f"{str(request.base_url).rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    success_url = f"{host_url}/business-clarity/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{host_url}/business-clarity/invoices"
    
    metadata = {
        "company_id": user.company_id,
        "client_id": client_id or "",
        "invoice_ids": ",".join(data.invoice_ids),
        "user_id": user.user_id
    }
    
    checkout_request = CheckoutSessionRequest(
        amount=float(total_amount),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = {
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "client_id": client_id,
        "invoice_ids": data.invoice_ids,
        "amount": round(total_amount, 2),
        "currency": "usd",
        "session_id": session.session_id,
        "payment_status": "initiated",
        "metadata": metadata,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.payment_transactions.insert_one(transaction)
    
    return {"url": session.url, "session_id": session.session_id}

@business_clarity_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, user: User = Depends(get_current_user)):
    """Get Stripe checkout status and process payment if successful"""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    # Get transaction
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "company_id": user.company_id}
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed, return current status
    if transaction.get("payment_status") == "paid":
        return {
            "status": "complete",
            "payment_status": "paid",
            "amount": transaction.get("amount"),
            "payment_id": transaction.get("payment_id")
        }
    
    # Check Stripe status
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status = await stripe_checkout.get_checkout_status(session_id)
    
    now = datetime.now(timezone.utc)
    
    if status.payment_status == "paid" and transaction.get("payment_status") != "paid":
        # Process the payment
        client_id = transaction.get("client_id")
        amount = transaction.get("amount", 0)
        invoice_ids = transaction.get("invoice_ids", [])
        
        # Create payment record
        payment = {
            "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "client_id": client_id,
            "amount": amount,
            "payment_method": "card",
            "payment_date": now.isoformat(),
            "reference": f"Stripe: {session_id}",
            "notes": f"Online payment via Stripe",
            "stripe_session_id": session_id,
            "status": "completed",
            "applied_amount": 0.0,
            "unapplied_amount": amount,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.payments.insert_one(payment)
        
        # Auto-apply to invoices
        remaining = amount
        for inv_id in invoice_ids:
            if remaining <= 0:
                break
            
            invoice = await db.invoices.find_one({"invoice_id": inv_id, "company_id": user.company_id})
            if not invoice:
                continue
            
            balance = invoice.get("balance_due", invoice.get("total", 0))
            to_apply = min(remaining, balance)
            
            if to_apply > 0:
                # Create application
                app = {
                    "application_id": f"app_{uuid.uuid4().hex[:12]}",
                    "payment_id": payment["payment_id"],
                    "invoice_id": inv_id,
                    "amount_applied": to_apply,
                    "created_at": now.isoformat()
                }
                await db.payment_applications.insert_one(app)
                
                # Update invoice
                new_paid = invoice.get("paid_amount", 0) + to_apply
                new_balance = invoice.get("total", 0) - new_paid
                new_status = "paid" if new_balance <= 0.01 else "partially_paid"
                
                await db.invoices.update_one(
                    {"invoice_id": inv_id},
                    {"$set": {
                        "paid_amount": round(new_paid, 2),
                        "balance_due": round(max(0, new_balance), 2),
                        "status": new_status,
                        "updated_at": now.isoformat()
                    }}
                )
                
                remaining -= to_apply
        
        # Update payment applied amounts
        applied = amount - remaining
        await db.payments.update_one(
            {"payment_id": payment["payment_id"]},
            {"$set": {
                "applied_amount": round(applied, 2),
                "unapplied_amount": round(remaining, 2),
                "updated_at": now.isoformat()
            }}
        )
        
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "payment_id": payment["payment_id"],
                "updated_at": now.isoformat()
            }}
        )
        
        # Audit log
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "user_id": user.user_id,
            "action": "stripe_payment_completed",
            "entity_type": "payment",
            "entity_id": payment["payment_id"],
            "details": {"amount": amount, "session_id": session_id, "invoice_ids": invoice_ids},
            "created_at": now.isoformat()
        })
        
        return {
            "status": "complete",
            "payment_status": "paid",
            "amount": amount,
            "payment_id": payment["payment_id"]
        }
    
    elif status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "updated_at": now.isoformat()}}
        )
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount": status.amount_total / 100 if status.amount_total else 0
    }

# Stripe Webhook
@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        if STRIPE_API_KEY:
            stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
            webhook_response = await stripe_checkout.handle_webhook(body, signature)
            
            if webhook_response and webhook_response.payment_status == "paid":
                # Find and update transaction
                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

# ============== CLIENT FINANCIAL VIEW ==============

@business_clarity_router.get("/clients/{client_id}/financial")
async def get_client_financial_view(client_id: str, user: User = Depends(get_current_user)):
    """Get client account statement / financial view"""
    # Get client
    client = await db.clients.find_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get all invoices for client
    invoices = await db.invoices.find(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("issue_date", 1).to_list(1000)
    
    # Enrich invoices with event names
    for inv in invoices:
        if inv.get("event_id"):
            event = await db.events.find_one({"event_id": inv["event_id"]}, {"_id": 0, "name": 1})
            inv["event_name"] = event.get("name") if event else None
    
    # Get all payments for client
    payments = await db.payments.find(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("payment_date", 1).to_list(1000)
    
    # Get payment applications
    for pay in payments:
        applications = await db.payment_applications.find(
            {"payment_id": pay["payment_id"]},
            {"_id": 0}
        ).to_list(100)
        pay["applications"] = applications
    
    # Calculate running balance (activity log)
    activity = []
    balance = 0.0
    
    # Combine invoices and payments, sort by date
    all_items = []
    for inv in invoices:
        all_items.append({
            "type": "invoice",
            "date": inv.get("issue_date"),
            "data": inv
        })
    for pay in payments:
        all_items.append({
            "type": "payment",
            "date": pay.get("payment_date"),
            "data": pay
        })
    
    all_items.sort(key=lambda x: x["date"] or "")
    
    for item in all_items:
        if item["type"] == "invoice":
            inv = item["data"]
            balance += inv.get("total", 0)
            activity.append({
                "date": inv.get("issue_date"),
                "type": "invoice",
                "description": f"Invoice {inv.get('invoice_number')}",
                "reference": inv.get("invoice_id"),
                "debit": inv.get("total", 0),
                "credit": 0,
                "balance": round(balance, 2)
            })
        else:
            pay = item["data"]
            balance -= pay.get("amount", 0)
            activity.append({
                "date": pay.get("payment_date"),
                "type": "payment",
                "description": f"Payment ({pay.get('payment_method', 'N/A')})",
                "reference": pay.get("payment_id"),
                "debit": 0,
                "credit": pay.get("amount", 0),
                "balance": round(balance, 2)
            })
    
    # Summary
    total_invoiced = sum(inv.get("total", 0) for inv in invoices)
    total_paid = sum(pay.get("amount", 0) for pay in payments)
    current_balance = total_invoiced - total_paid
    
    # Credit warnings
    warnings = []
    if client.get("has_credit") and client.get("credit_limit", 0) > 0:
        if current_balance > client.get("credit_limit", 0):
            warnings.append(f"Credit limit exceeded: ${current_balance:.2f} / ${client.get('credit_limit', 0):.2f}")
    
    overdue_invoices = [inv for inv in invoices if inv.get("status") not in ["paid"] and inv.get("due_date")]
    now = datetime.now(timezone.utc)
    for inv in overdue_invoices:
        try:
            due_dt = datetime.fromisoformat(inv["due_date"].replace("Z", "+00:00"))
            if due_dt < now:
                warnings.append(f"Overdue invoice: {inv.get('invoice_number')} (${inv.get('balance_due', 0):.2f})")
        except:
            pass
    
    return {
        "client": client,
        "invoices": invoices,
        "payments": payments,
        "activity": activity,
        "summary": {
            "total_invoiced": round(total_invoiced, 2),
            "total_paid": round(total_paid, 2),
            "current_balance": round(current_balance, 2),
            "invoices_count": len(invoices),
            "payments_count": len(payments)
        },
        "warnings": warnings
    }

# ============== ACCOUNTS RECEIVABLE ==============

@business_clarity_router.get("/accounts-receivable")
async def get_accounts_receivable(user: User = Depends(get_current_user)):
    """Get accounts receivable with aging analysis"""
    now = datetime.now(timezone.utc)
    
    # Get all open invoices
    invoices = await db.invoices.find(
        {"company_id": user.company_id, "status": {"$ne": "paid"}},
        {"_id": 0}
    ).to_list(1000)
    
    ar_records = []
    aging = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
    total_outstanding = 0
    total_overdue = 0
    
    for inv in invoices:
        balance = inv.get("balance_due", inv.get("total", 0))
        total_outstanding += balance
        
        # Get client and event names
        client_name = None
        event_name = None
        if inv.get("client_id"):
            client = await db.clients.find_one({"client_id": inv["client_id"]}, {"_id": 0, "display_name": 1})
            client_name = client.get("display_name") if client else None
        if inv.get("event_id"):
            event = await db.events.find_one({"event_id": inv["event_id"]}, {"_id": 0, "name": 1})
            event_name = event.get("name") if event else None
        
        # Calculate aging
        days_overdue = 0
        status = "current"
        due_date = inv.get("due_date")
        
        if due_date:
            try:
                due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                days_overdue = max(0, (now - due_dt).days)
                
                if days_overdue > 0:
                    total_overdue += balance
                    status = "overdue"
                    if days_overdue <= 30:
                        aging["1_30"] += balance
                    elif days_overdue <= 60:
                        aging["31_60"] += balance
                    elif days_overdue <= 90:
                        aging["61_90"] += balance
                    else:
                        aging["90_plus"] += balance
                else:
                    aging["current"] += balance
            except:
                aging["current"] += balance
        else:
            aging["current"] += balance
        
        ar_records.append({
            "invoice_id": inv.get("invoice_id"),
            "invoice_number": inv.get("invoice_number"),
            "client_id": inv.get("client_id"),
            "client_name": client_name,
            "event_id": inv.get("event_id"),
            "event_name": event_name,
            "issue_date": inv.get("issue_date"),
            "due_date": due_date,
            "total": inv.get("total", 0),
            "paid_amount": inv.get("paid_amount", 0),
            "balance_due": balance,
            "days_overdue": days_overdue,
            "status": status
        })
    
    # Sort by days overdue desc
    ar_records.sort(key=lambda x: x["days_overdue"], reverse=True)
    
    return {
        "records": ar_records,
        "aging_buckets": {k: round(v, 2) for k, v in aging.items()},
        "summary": {
            "total_outstanding": round(total_outstanding, 2),
            "total_overdue": round(total_overdue, 2),
            "total_current": round(aging["current"], 2),
            "invoices_count": len(ar_records),
            "overdue_count": len([r for r in ar_records if r["status"] == "overdue"])
        }
    }

# ============== ACCOUNTS PAYABLE ==============

@business_clarity_router.get("/accounts-payable")
async def get_accounts_payable(user: User = Depends(get_current_user)):
    """Get accounts payable overview"""
    # Get payables from supplier_payables collection
    payables = await db.supplier_payables.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Also include unpaid expenses
    expenses = await db.expenses.find(
        {"company_id": user.company_id, "payment_status": {"$ne": "Paid"}},
        {"_id": 0}
    ).to_list(1000)
    
    records = []
    total_pending = 0
    total_paid = 0
    
    for exp in expenses:
        supplier_name = None
        event_name = None
        
        if exp.get("supplier_id"):
            supplier = await db.suppliers.find_one({"supplier_id": exp["supplier_id"]}, {"_id": 0, "name": 1})
            supplier_name = supplier.get("name") if supplier else None
        if exp.get("event_id"):
            event = await db.events.find_one({"event_id": exp["event_id"]}, {"_id": 0, "name": 1})
            event_name = event.get("name") if event else None
        
        amount = exp.get("amount", 0)
        status = exp.get("payment_status", "Pending")
        
        if status != "Paid":
            total_pending += amount
        else:
            total_paid += amount
        
        records.append({
            "payable_id": exp.get("expense_id"),
            "type": "expense",
            "supplier_id": exp.get("supplier_id"),
            "supplier_name": supplier_name,
            "event_id": exp.get("event_id"),
            "event_name": event_name,
            "description": exp.get("description", exp.get("vendor_name")),
            "amount": amount,
            "paid_amount": 0 if status != "Paid" else amount,
            "balance_due": amount if status != "Paid" else 0,
            "status": status.lower(),
            "date": exp.get("expense_date") or exp.get("created_at"),
            "due_date": exp.get("due_date")
        })
    
    # Add supplier payables
    for pay in payables:
        supplier_name = None
        event_name = None
        
        if pay.get("supplier_id"):
            supplier = await db.suppliers.find_one({"supplier_id": pay["supplier_id"]}, {"_id": 0, "name": 1})
            supplier_name = supplier.get("name") if supplier else None
        if pay.get("event_id"):
            event = await db.events.find_one({"event_id": pay["event_id"]}, {"_id": 0, "name": 1})
            event_name = event.get("name") if event else None
        
        balance = pay.get("balance_due", pay.get("amount", 0))
        if pay.get("status") != "paid":
            total_pending += balance
        
        records.append({
            "payable_id": pay.get("payable_id"),
            "type": "payable",
            "supplier_id": pay.get("supplier_id"),
            "supplier_name": supplier_name,
            "event_id": pay.get("event_id"),
            "event_name": event_name,
            "description": pay.get("description"),
            "amount": pay.get("amount", 0),
            "paid_amount": pay.get("paid_amount", 0),
            "balance_due": balance,
            "status": pay.get("status", "pending"),
            "date": pay.get("created_at"),
            "due_date": pay.get("due_date")
        })
    
    # Sort by date desc
    records.sort(key=lambda x: x.get("date") or "", reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_pending": round(total_pending, 2),
            "total_paid": round(total_paid, 2),
            "records_count": len(records),
            "pending_count": len([r for r in records if r["status"] not in ["paid"]])
        }
    }

# ============== CLIENT CREDIT MANAGEMENT ==============

@business_clarity_router.put("/clients/{client_id}/credit")
async def update_client_credit(client_id: str, data: ClientCreditUpdate, user: User = Depends(get_current_user)):
    """Update client credit settings"""
    now = datetime.now(timezone.utc)
    
    result = await db.clients.update_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"$set": {
            "has_credit": data.has_credit,
            "credit_limit": data.credit_limit,
            "payment_terms": data.payment_terms,
            "updated_at": now.isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "client_credit_updated",
        "entity_type": "client",
        "entity_id": client_id,
        "details": {"has_credit": data.has_credit, "credit_limit": data.credit_limit, "payment_terms": data.payment_terms},
        "created_at": now.isoformat()
    })
    
    return {"message": "Credit settings updated"}

# ============== EXECUTIVE REPORTS ==============

@business_clarity_router.get("/reports/financial-snapshot")
async def get_financial_snapshot(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get financial snapshot report"""
    query = {"company_id": user.company_id}
    
    # Date filtering
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    # Revenue (from invoices)
    invoices = await db.invoices.find(query, {"_id": 0}).to_list(1000)
    total_invoiced = sum(inv.get("total", 0) for inv in invoices)
    total_collected = sum(inv.get("paid_amount", 0) for inv in invoices)
    total_outstanding = total_invoiced - total_collected
    
    # Expenses
    expenses_query = {"company_id": user.company_id}
    if start_date:
        expenses_query["expense_date"] = {"$gte": start_date}
    if end_date:
        if "expense_date" in expenses_query:
            expenses_query["expense_date"]["$lte"] = end_date
        else:
            expenses_query["expense_date"] = {"$lte": end_date}
    
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(1000)
    total_expenses = sum(exp.get("amount", 0) for exp in expenses)
    
    # Profit
    gross_profit = total_collected - total_expenses
    
    return {
        "period": {"start": start_date, "end": end_date},
        "revenue": {
            "total_invoiced": round(total_invoiced, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "collection_rate": round((total_collected / total_invoiced * 100) if total_invoiced > 0 else 0, 1)
        },
        "expenses": {
            "total": round(total_expenses, 2),
            "count": len(expenses)
        },
        "profit": {
            "gross": round(gross_profit, 2),
            "margin": round((gross_profit / total_collected * 100) if total_collected > 0 else 0, 1)
        },
        "invoices_count": len(invoices),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@business_clarity_router.get("/reports/client-revenue")
async def get_client_revenue_report(user: User = Depends(get_current_user)):
    """Get revenue by client report"""
    # Get all invoices grouped by client
    invoices = await db.invoices.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    client_revenue = {}
    for inv in invoices:
        cid = inv.get("client_id")
        if cid not in client_revenue:
            client_revenue[cid] = {
                "client_id": cid,
                "total_invoiced": 0,
                "total_paid": 0,
                "total_outstanding": 0,
                "invoices_count": 0
            }
        client_revenue[cid]["total_invoiced"] += inv.get("total", 0)
        client_revenue[cid]["total_paid"] += inv.get("paid_amount", 0)
        client_revenue[cid]["total_outstanding"] += inv.get("balance_due", 0)
        client_revenue[cid]["invoices_count"] += 1
    
    # Get client names
    records = []
    for cid, data in client_revenue.items():
        client = await db.clients.find_one({"client_id": cid}, {"_id": 0, "display_name": 1})
        data["client_name"] = client.get("display_name") if client else "Unknown"
        data["total_invoiced"] = round(data["total_invoiced"], 2)
        data["total_paid"] = round(data["total_paid"], 2)
        data["total_outstanding"] = round(data["total_outstanding"], 2)
        records.append(data)
    
    # Sort by total invoiced desc
    records.sort(key=lambda x: x["total_invoiced"], reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_revenue": round(sum(r["total_invoiced"] for r in records), 2),
            "total_collected": round(sum(r["total_paid"] for r in records), 2),
            "clients_count": len(records)
        }
    }

@business_clarity_router.get("/reports/supplier-spend")
async def get_supplier_spend_report(user: User = Depends(get_current_user)):
    """Get spending by supplier report"""
    # Get expenses grouped by supplier
    expenses = await db.expenses.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    supplier_spend = {}
    for exp in expenses:
        sid = exp.get("supplier_id") or "no_supplier"
        if sid not in supplier_spend:
            supplier_spend[sid] = {
                "supplier_id": sid if sid != "no_supplier" else None,
                "total_amount": 0,
                "paid_amount": 0,
                "pending_amount": 0,
                "transactions_count": 0
            }
        amount = exp.get("amount", 0)
        supplier_spend[sid]["total_amount"] += amount
        if exp.get("payment_status") == "Paid":
            supplier_spend[sid]["paid_amount"] += amount
        else:
            supplier_spend[sid]["pending_amount"] += amount
        supplier_spend[sid]["transactions_count"] += 1
    
    # Get supplier names
    records = []
    for sid, data in supplier_spend.items():
        if sid and sid != "no_supplier":
            supplier = await db.suppliers.find_one({"supplier_id": sid}, {"_id": 0, "name": 1})
            data["supplier_name"] = supplier.get("name") if supplier else "Unknown"
        else:
            data["supplier_name"] = "Other / No Supplier"
        data["total_amount"] = round(data["total_amount"], 2)
        data["paid_amount"] = round(data["paid_amount"], 2)
        data["pending_amount"] = round(data["pending_amount"], 2)
        records.append(data)
    
    # Sort by total amount desc
    records.sort(key=lambda x: x["total_amount"], reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_spend": round(sum(r["total_amount"] for r in records), 2),
            "total_paid": round(sum(r["paid_amount"] for r in records), 2),
            "total_pending": round(sum(r["pending_amount"] for r in records), 2),
            "suppliers_count": len(records)
        }
    }

@business_clarity_router.get("/reports/event-profitability")
async def get_event_profitability_report(user: User = Depends(get_current_user)):
    """Get event profitability summary"""
    # Get all events
    events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    records = []
    for event in events:
        event_id = event.get("event_id")
        
        # Get revenue from invoices
        invoices = await db.invoices.find(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "total": 1, "paid_amount": 1}
        ).to_list(100)
        revenue = sum(inv.get("total", 0) for inv in invoices)
        collected = sum(inv.get("paid_amount", 0) for inv in invoices)
        
        # Get costs from expenses
        expenses = await db.expenses.find(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "amount": 1}
        ).to_list(100)
        costs = sum(exp.get("amount", 0) for exp in expenses)
        
        # Get costs from order items internal cost
        order_items = await db.order_items.find(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "internal_cost": 1}
        ).to_list(100)
        internal_costs = sum(item.get("internal_cost") or 0 for item in order_items)
        total_costs = costs + internal_costs
        
        profit = revenue - total_costs
        margin = (profit / revenue * 100) if revenue > 0 else 0
        
        records.append({
            "event_id": event_id,
            "event_name": event.get("name"),
            "event_date": event.get("event_date"),
            "status": event.get("status"),
            "revenue": round(revenue, 2),
            "collected": round(collected, 2),
            "costs": round(total_costs, 2),
            "profit": round(profit, 2),
            "margin_percent": round(margin, 1)
        })
    
    # Sort by profit desc
    records.sort(key=lambda x: x["profit"], reverse=True)
    
    total_revenue = sum(r["revenue"] for r in records)
    total_costs = sum(r["costs"] for r in records)
    total_profit = sum(r["profit"] for r in records)
    
    return {
        "records": records,
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_costs": round(total_costs, 2),
            "total_profit": round(total_profit, 2),
            "average_margin": round((total_profit / total_revenue * 100) if total_revenue > 0 else 0, 1),
            "events_count": len(records)
        }
    }

# ============== EVENT ORCHESTRATION ROUTES ==============

@orchestration_router.get("/events")
async def get_orchestration_events(user: User = Depends(get_current_user)):
    """Get only confirmed (Won) events for orchestration view - Execution Layer"""
    # REFACTOR: Only show events with stage "Won" or "Closed" for execution
    events = await db.events.find(
        {"company_id": user.company_id, "stage": {"$in": ["Committed", "Won", "Closed"]}},
        {"_id": 0}
    ).sort("event_date", -1).to_list(500)
    
    # Enrich with client names and orchestration status
    for e in events:
        if e.get("client_id"):
            client = await db.clients.find_one({"client_id": e["client_id"]}, {"_id": 0, "display_name": 1})
            e["client_name"] = client.get("display_name") if client else None
        
        # Check orchestration data existence
        blueprint = await db.event_blueprints.find_one({"event_id": e.get("event_id")}, {"_id": 0, "objectives": 1})
        e["has_blueprint"] = blueprint is not None and bool(blueprint.get("objectives"))
        
        run_of_show = await db.run_of_show.find_one({"event_id": e.get("event_id")}, {"_id": 0, "time_blocks": 1})
        e["has_run_of_show"] = run_of_show is not None and len(run_of_show.get("time_blocks", [])) > 0
        
        team = await db.event_team_roles.find_one({"event_id": e.get("event_id")}, {"_id": 0, "roles": 1})
        e["has_team"] = team is not None and len(team.get("roles", [])) > 0
        
        # Check if event is locked (Closed status)
        e["is_locked"] = e.get("stage") == "Closed"
    
    return events

# --- Event Blueprint ---
@orchestration_router.get("/blueprint/{event_id}")
async def get_event_blueprint(event_id: str, user: User = Depends(get_current_user)):
    """Get event blueprint (extended metadata)"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get blueprint extension
    blueprint = await db.event_blueprints.find_one(
        {"event_id": event_id},
        {"_id": 0}
    )
    
    return {
        "event": event,
        "blueprint": blueprint or {
            "objectives": None,
            "scope_definition": None,
            "critical_assumptions": None,
            "constraints": None,
            "success_criteria": None
        }
    }

@orchestration_router.put("/blueprint/{event_id}")
async def update_event_blueprint(event_id: str, data: EventBlueprintUpdate, user: User = Depends(get_current_user)):
    """Update event blueprint metadata"""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if event is locked (Closed stage)
    if event.get("stage") == "Closed":
        raise HTTPException(status_code=400, detail="Event is closed. Cannot modify blueprint.")
    
    now = datetime.now(timezone.utc)
    blueprint_data = data.dict(exclude_unset=True)
    blueprint_data["event_id"] = event_id
    blueprint_data["company_id"] = user.company_id
    blueprint_data["updated_at"] = now.isoformat()
    
    await db.event_blueprints.update_one(
        {"event_id": event_id},
        {"$set": blueprint_data, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True
    )
    
    return await db.event_blueprints.find_one({"event_id": event_id}, {"_id": 0})

# --- Experience Design ---
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

# --- Event Calendar ---
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
api_router.include_router(business_clarity_router)
api_router.include_router(orchestration_router)

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
