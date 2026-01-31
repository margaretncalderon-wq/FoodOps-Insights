from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
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

ROOT_DIR = Path(__file__).parent
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
inventory_router = APIRouter(prefix="/inventory", tags=["Inventory"])
suppliers_router = APIRouter(prefix="/suppliers", tags=["Suppliers"])
operations_router = APIRouter(prefix="/operations", tags=["Operations Inventory"])
documents_router = APIRouter(prefix="/documents", tags=["Documents"])
finance_router = APIRouter(prefix="/finance", tags=["Finance"])
settings_router = APIRouter(prefix="/settings", tags=["Settings"])
portal_router = APIRouter(prefix="/portal", tags=["Client Portal"])
reports_router = APIRouter(prefix="/reports", tags=["Reports"])
event_order_router = APIRouter(prefix="/event-orders", tags=["Event Orders"])

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
    created_at: datetime

# ============== NEW CRM MODELS ==============

# Lead Model (Inbound inquiries)
class LeadCreate(BaseModel):
    lead_name: str
    email: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
    event_type: str
    event_date: Optional[str] = None  # Can be "TBD" or a date string
    estimated_guest_count: Optional[int] = None
    budget_range: Optional[str] = None
    message: Optional[str] = None
    source: str = "Website"  # Website, Instagram, QR, Referral, Other
    form_name: Optional[str] = None

class Lead(BaseModel):
    lead_id: str
    company_id: str
    lead_name: str
    email: str
    phone: Optional[str] = None
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

# Contact Model (People linked to Clients)
class ContactCreate(BaseModel):
    client_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
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
    address: Optional[str] = None
    source: str = "Direct"  # Website, Instagram, QR, Referral, Direct, Other
    tags: List[str] = []
    notes: Optional[str] = None
    status: str = "Active"  # Active, Inactive

class Client(BaseModel):
    client_id: str
    company_id: str
    client_type: str = "Individual"
    display_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    source: str = "Direct"
    tags: List[str] = []
    notes: Optional[str] = None
    status: str = "Active"
    total_revenue: float = 0.0
    events_count: int = 0
    created_at: datetime
    updated_at: datetime

# Lead Form Model (Configurable forms)
class LeadFormFieldConfig(BaseModel):
    field_name: str
    enabled: bool = True
    required: bool = False

class LeadFormCreate(BaseModel):
    form_name: str
    description: Optional[str] = None
    fields: List[LeadFormFieldConfig] = []
    default_source: str = "Website"
    default_event_type: Optional[str] = None
    assign_owner_id: Optional[str] = None
    is_active: bool = True
    thank_you_message: str = "Thank you for your inquiry! We will contact you soon."

class LeadForm(BaseModel):
    form_id: str
    company_id: str
    form_name: str
    description: Optional[str] = None
    fields: List[Dict[str, Any]] = []
    default_source: str = "Website"
    default_event_type: Optional[str] = None
    assign_owner_id: Optional[str] = None
    is_active: bool = True
    thank_you_message: str
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
    end_date: Optional[datetime] = None
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int = 0
    budget: float = 0.0
    notes: Optional[str] = None
    status: str = "planning"
    # CRM Pipeline fields
    stage: str = "Lead"  # Lead, Contacted, Proposal, Negotiation, Won, Lost
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
    end_date: Optional[datetime] = None
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int
    budget: float
    notes: Optional[str] = None
    status: str
    # CRM Pipeline fields
    stage: str = "Lead"
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
    prep_time_minutes: int = 0
    cook_time_minutes: int = 0
    labor_minutes: int = 0
    ingredients: List[RecipeIngredient] = []
    instructions: List[str] = []
    sell_price: float = 0.0
    image_url: Optional[str] = None

class Recipe(BaseModel):
    recipe_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    recipe_type: str = "final_dish"
    category: str
    yield_quantity: float
    yield_unit: str
    portion_size: float = 1.0
    portion_unit: str = "serving"
    prep_time_minutes: int
    cook_time_minutes: int
    labor_minutes: int = 0
    ingredients: List[RecipeIngredient]
    instructions: List[str]
    total_cost: float
    cost_per_yield: float
    cost_per_portion: float
    sell_price: float = 0.0
    food_cost_percent: float = 0.0
    image_url: Optional[str] = None
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

# Payment Model
class PaymentCreate(BaseModel):
    payment_type: str = "incoming"  # incoming, outgoing
    invoice_id: str
    invoice_type: str = "client"  # client, supplier
    payment_method: str = "transfer"  # cash, transfer, card, check, platform
    amount: float
    reference: Optional[str] = None
    notes: Optional[str] = None

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
    default_price: float = 0.0
    recipe_id: Optional[str] = None  # Link to recipe for food items
    unit: str = "unit"

class PicklistItem(BaseModel):
    item_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    category_id: str
    default_price: float
    recipe_id: Optional[str] = None
    unit: str
    created_at: datetime

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

# ============== CRM ROUTES - Enhanced ==============

@crm_router.get("/clients", response_model=List[Client])
async def get_clients(user: User = Depends(get_current_user)):
    clients = await db.clients.find({"company_id": user.company_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for c in clients:
        for field in ["created_at", "updated_at", "last_contact_date"]:
            if c.get(field) and isinstance(c[field], str):
                c[field] = datetime.fromisoformat(c[field])
        if "client_source" not in c:
            c["client_source"] = "direct"
    return clients

@crm_router.post("/clients", response_model=Client)
async def create_client(data: ClientCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    client_id = f"client_{uuid.uuid4().hex[:12]}"
    
    client_doc = {
        "client_id": client_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "total_revenue": 0.0,
        "events_count": 0,
        "last_contact_date": now.isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.clients.insert_one(client_doc)
    client_doc["created_at"] = now
    client_doc["updated_at"] = now
    client_doc["last_contact_date"] = now
    del client_doc["_id"]
    return Client(**client_doc)

@crm_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, user: User = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": client_id, "company_id": user.company_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for field in ["created_at", "updated_at", "last_contact_date"]:
        if client.get(field) and isinstance(client[field], str):
            client[field] = datetime.fromisoformat(client[field])
    if "client_source" not in client:
        client["client_source"] = "direct"
    return Client(**client)

@crm_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, data: ClientCreate, user: User = Depends(get_current_user)):
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
    result = await db.clients.delete_one({"client_id": client_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted"}

@crm_router.get("/pipeline")
async def get_pipeline(user: User = Depends(get_current_user)):
    stages = ["lead", "contacted", "proposal", "negotiation", "won", "lost", "converted"]
    pipeline = {}
    for stage in stages:
        clients = await db.clients.find({"company_id": user.company_id, "pipeline_stage": stage}, {"_id": 0}).to_list(100)
        for c in clients:
            for field in ["created_at", "updated_at"]:
                if c.get(field) and isinstance(c[field], str):
                    c[field] = datetime.fromisoformat(c[field])
            if "client_source" not in c:
                c["client_source"] = "direct"
        pipeline[stage] = clients
    return pipeline

@crm_router.get("/sources")
async def get_client_sources(user: User = Depends(get_current_user)):
    """Get client count by source"""
    sources = ["corporate", "planner", "referral", "direct"]
    result = {}
    for source in sources:
        count = await db.clients.count_documents({"company_id": user.company_id, "client_source": source})
        result[source] = count
    return result

@crm_router.get("/stats")
async def get_crm_stats(user: User = Depends(get_current_user)):
    """Get CRM statistics"""
    total = await db.clients.count_documents({"company_id": user.company_id})
    active = await db.clients.count_documents({"company_id": user.company_id, "pipeline_stage": {"$in": ["lead", "contacted", "proposal", "negotiation"]}})
    converted = await db.clients.count_documents({"company_id": user.company_id, "pipeline_stage": "converted"})
    won = await db.clients.count_documents({"company_id": user.company_id, "pipeline_stage": "won"})
    
    # Revenue by source
    pipeline = [
        {"$match": {"company_id": user.company_id}},
        {"$group": {"_id": "$client_source", "total_revenue": {"$sum": "$total_revenue"}, "count": {"$sum": 1}}}
    ]
    source_stats = await db.clients.aggregate(pipeline).to_list(10)
    
    return {
        "total_clients": total,
        "active_clients": active,
        "converted_clients": converted,
        "won_clients": won,
        "by_source": {s["_id"]: {"revenue": s["total_revenue"], "count": s["count"]} for s in source_stats if s["_id"]}
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
    return recipes

async def calculate_recipe_cost(ingredients: List[RecipeIngredient], company_id: str) -> tuple:
    """Calculate total cost for a recipe's ingredients, including nested recipes"""
    total_cost = 0.0
    updated_ingredients = []
    
    for ing in ingredients:
        if ing.item_type == "ingredient":
            # Get ingredient cost
            ingredient = await db.ingredients.find_one(
                {"ingredient_id": ing.item_id, "company_id": company_id},
                {"_id": 0}
            )
            if ingredient:
                cost_per_unit = ingredient.get("cost_per_unit", 0)
                # Apply yield/waste adjustment
                waste_percent = ingredient.get("yield_waste_percent", 0)
                if waste_percent > 0:
                    cost_per_unit = cost_per_unit / (1 - waste_percent / 100)
                line_cost = ing.quantity * cost_per_unit
                updated_ingredients.append({
                    **ing.model_dump(),
                    "cost_per_unit": cost_per_unit,
                    "total_cost": line_cost
                })
                total_cost += line_cost
            else:
                updated_ingredients.append(ing.model_dump())
        else:
            # Get sub-recipe cost
            sub_recipe = await db.recipes.find_one(
                {"recipe_id": ing.item_id, "company_id": company_id},
                {"_id": 0}
            )
            if sub_recipe:
                cost_per_yield = sub_recipe.get("cost_per_yield", 0)
                line_cost = ing.quantity * cost_per_yield
                updated_ingredients.append({
                    **ing.model_dump(),
                    "cost_per_unit": cost_per_yield,
                    "total_cost": line_cost
                })
                total_cost += line_cost
            else:
                updated_ingredients.append(ing.model_dump())
    
    return total_cost, updated_ingredients

@recipes_router.post("", response_model=Recipe)
async def create_recipe(data: RecipeCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
    
    # Calculate costs
    total_cost, updated_ingredients = await calculate_recipe_cost(data.ingredients, user.company_id)
    cost_per_yield = total_cost / data.yield_quantity if data.yield_quantity > 0 else 0
    cost_per_portion = cost_per_yield / data.portion_size if data.portion_size > 0 else cost_per_yield
    food_cost_percent = (cost_per_portion / data.sell_price * 100) if data.sell_price > 0 else 0
    
    recipe_doc = {
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "ingredients": updated_ingredients,
        "total_cost": total_cost,
        "cost_per_yield": cost_per_yield,
        "cost_per_portion": cost_per_portion,
        "food_cost_percent": food_cost_percent,
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
    return Recipe(**recipe)

@recipes_router.put("/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: str, data: RecipeCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    
    # Recalculate costs
    total_cost, updated_ingredients = await calculate_recipe_cost(data.ingredients, user.company_id)
    cost_per_yield = total_cost / data.yield_quantity if data.yield_quantity > 0 else 0
    cost_per_portion = cost_per_yield / data.portion_size if data.portion_size > 0 else cost_per_yield
    food_cost_percent = (cost_per_portion / data.sell_price * 100) if data.sell_price > 0 else 0
    
    update_data = {
        **data.model_dump(),
        "ingredients": updated_ingredients,
        "total_cost": total_cost,
        "cost_per_yield": cost_per_yield,
        "cost_per_portion": cost_per_portion,
        "food_cost_percent": food_cost_percent,
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
        total_cost, updated_ingredients = await calculate_recipe_cost(ingredients, user.company_id)
        
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
                "total_cost": total_cost,
                "cost_per_yield": cost_per_yield,
                "cost_per_portion": cost_per_portion,
                "food_cost_percent": food_cost_percent
            }}
        )
        updated_count += 1
    
    return {"updated_recipes": updated_count}

# ============== EVENT MENU & STOCK CHECK ==============

@events_router.get("")
async def get_events(user: User = Depends(get_current_user)):
    events = await db.events.find({"company_id": user.company_id}, {"_id": 0}).sort("event_date", 1).to_list(1000)
    
    # Get all client IDs to fetch client info
    client_ids = list(set(e.get("client_id") for e in events if e.get("client_id")))
    clients_data = {}
    if client_ids:
        clients = await db.clients.find({"client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1, "name": 1, "company_name": 1, "client_type": 1}).to_list(len(client_ids))
        clients_data = {c["client_id"]: c for c in clients}
    
    for e in events:
        for field in ["event_date", "end_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                e[field] = datetime.fromisoformat(e[field])
        if "documents" not in e:
            e["documents"] = []
        # Add client info to event
        client_info = clients_data.get(e.get("client_id"), {})
        e["client_info"] = {
            "name": client_info.get("name", ""),
            "company_name": client_info.get("company_name", ""),
            "client_type": client_info.get("client_type", "direct")
        }
    return events

@events_router.post("", response_model=Event)
async def create_event(data: EventCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    event_doc = {
        "event_id": event_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "event_date": data.event_date.isoformat(),
        "end_date": data.end_date.isoformat() if data.end_date else None,
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
    event_doc["created_at"] = now
    event_doc["updated_at"] = now
    return Event(**event_doc)

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

@events_router.get("/{event_id}", response_model=Event)
async def get_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    for field in ["event_date", "end_date", "created_at", "updated_at"]:
        if event.get(field) and isinstance(event[field], str):
            event[field] = datetime.fromisoformat(event[field])
    if "documents" not in event:
        event["documents"] = []
    return Event(**event)

@events_router.put("/{event_id}", response_model=Event)
async def update_event(event_id: str, data: EventCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    update_data = data.model_dump()
    update_data["event_date"] = data.event_date.isoformat()
    update_data["end_date"] = data.end_date.isoformat() if data.end_date else None
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
async def add_menu_item(event_id: str, data: dict, user: User = Depends(get_current_user)):
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
        "available": available,
        "short": short,
        "total_ingredients": len(required_ingredients)
    }

@events_router.post("/{event_id}/generate-purchase-list")
async def generate_purchase_list(event_id: str, user: User = Depends(get_current_user)):
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
    allowed_fields = ["name", "logo_url", "primary_color", "secondary_color", "default_language", "currency", "default_tax_rate"]
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
    
    return {
        "total_clients": total_clients,
        "total_events": total_events,
        "upcoming_events": upcoming_events,
        "total_recipes": total_recipes,
        "low_stock_alerts": low_stock,
        "pipeline_stats": pipeline_stats,
        "recent_events": recent_events
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
async def get_picklist_items(category_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get picklist items for quick selection"""
    query = {"company_id": user.company_id}
    if category_id:
        query["category_id"] = category_id
    
    items = await db.picklist_items.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return items

@settings_router.post("/picklist")
async def create_picklist_item(data: PicklistItemCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    item_id = f"pli_{uuid.uuid4().hex[:12]}"
    
    item_doc = {
        "item_id": item_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.picklist_items.insert_one(item_doc)
    del item_doc["_id"]
    return item_doc

@settings_router.put("/picklist/{item_id}")
async def update_picklist_item(item_id: str, data: PicklistItemCreate, user: User = Depends(get_current_user)):
    result = await db.picklist_items.update_one(
        {"item_id": item_id, "company_id": user.company_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item updated"}

@settings_router.delete("/picklist/{item_id}")
async def delete_picklist_item(item_id: str, user: User = Depends(get_current_user)):
    result = await db.picklist_items.delete_one({"item_id": item_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

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

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(crm_router)
api_router.include_router(events_router)
api_router.include_router(recipes_router)
api_router.include_router(inventory_router)
api_router.include_router(suppliers_router)
api_router.include_router(operations_router)
api_router.include_router(documents_router)
api_router.include_router(finance_router)
api_router.include_router(settings_router)
api_router.include_router(portal_router)
api_router.include_router(reports_router)
api_router.include_router(event_order_router)

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
