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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'eep-evoque-secret-key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Create the main app
app = FastAPI(title="EEP Evoque Events Platform API")

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
crm_router = APIRouter(prefix="/crm", tags=["CRM"])
events_router = APIRouter(prefix="/events", tags=["Events"])
recipes_router = APIRouter(prefix="/recipes", tags=["Recipes"])
inventory_router = APIRouter(prefix="/inventory", tags=["Inventory"])
documents_router = APIRouter(prefix="/documents", tags=["Documents"])
settings_router = APIRouter(prefix="/settings", tags=["Settings"])
portal_router = APIRouter(prefix="/portal", tags=["Client Portal"])

# Configure logging
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
    created_at: datetime

# CRM Models
class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    pipeline_stage: str = "lead"
    tags: List[str] = []

class Client(BaseModel):
    client_id: str
    company_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    pipeline_stage: str
    tags: List[str] = []
    total_revenue: float = 0.0
    events_count: int = 0
    created_at: datetime
    updated_at: datetime

# Event Models (supports both single events and multi-day bookings)
class EventCreate(BaseModel):
    client_id: str
    name: str
    event_type: str
    event_date: datetime  # Start date
    end_date: Optional[datetime] = None  # For multi-day bookings
    is_booking: bool = False  # True for multi-day events
    venue: Optional[str] = None
    guest_count: int = 0
    budget: float = 0.0
    notes: Optional[str] = None
    status: str = "planning"

class Event(BaseModel):
    event_id: str
    company_id: str
    client_id: str
    name: str
    event_type: str
    event_date: datetime
    end_date: Optional[datetime] = None
    is_booking: bool = False
    venue: Optional[str] = None
    guest_count: int
    budget: float
    notes: Optional[str] = None
    status: str
    timeline: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    menu_items: List[str] = []
    documents: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime

# Recipe Models
class IngredientItem(BaseModel):
    ingredient_id: str
    name: str
    quantity: float
    unit: str
    cost_per_unit: float

class RecipeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str
    servings: int = 1
    prep_time_minutes: int = 0
    cook_time_minutes: int = 0
    ingredients: List[IngredientItem] = []
    instructions: List[str] = []
    image_url: Optional[str] = None

class Recipe(BaseModel):
    recipe_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    category: str
    servings: int
    prep_time_minutes: int
    cook_time_minutes: int
    ingredients: List[IngredientItem]
    instructions: List[str]
    total_cost: float
    cost_per_serving: float
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# Inventory Models
class IngredientCreate(BaseModel):
    name: str
    category: str
    unit: str
    cost_per_unit: float
    stock_quantity: float = 0.0
    min_stock_level: float = 0.0
    supplier_id: Optional[str] = None

class Ingredient(BaseModel):
    ingredient_id: str
    company_id: str
    name: str
    category: str
    unit: str
    cost_per_unit: float
    stock_quantity: float
    min_stock_level: float
    supplier_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class Supplier(BaseModel):
    supplier_id: str
    company_id: str
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime

# Document Models
class DocumentCreate(BaseModel):
    event_id: str
    document_type: str  # quote, beo, kitchen_sheet, packing_list, mise_en_place
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
    # Check cookie first
    token = request.cookies.get("session_token")
    # Then check Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if it's a session token (Google OAuth)
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
    
    # Try JWT token
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

# ============== AUTH ROUTES ==============

@auth_router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, response: Response):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    # Create company
    company_doc = {
        "company_id": company_id,
        "name": data.company_name or f"{data.name}'s Company",
        "logo_url": None,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "en",
        "currency": "USD",
        "created_at": now.isoformat()
    }
    await db.companies.insert_one(company_doc)
    
    # Create user
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
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_HOURS * 3600
    )
    
    user = User(
        user_id=user_id,
        email=data.email,
        name=data.name,
        picture=None,
        company_id=company_id,
        role="admin",
        created_at=now
    )
    return TokenResponse(access_token=token, user=user)

@auth_router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, response: Response):
    user_doc = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(data.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user_doc["user_id"])
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_HOURS * 3600
    )
    
    user = User(
        user_id=user_doc["user_id"],
        email=user_doc["email"],
        name=user_doc["name"],
        picture=user_doc.get("picture"),
        company_id=user_doc.get("company_id"),
        role=user_doc.get("role", "admin"),
        created_at=datetime.fromisoformat(user_doc["created_at"]) if isinstance(user_doc["created_at"], str) else user_doc["created_at"]
    )
    return TokenResponse(access_token=token, user=user)

@auth_router.post("/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Google OAuth session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Fetch user data from Emergent Auth
    async with httpx.AsyncClient() as client_http:
        resp = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
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
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user and company
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        
        company_doc = {
            "company_id": company_id,
            "name": f"{name}'s Company",
            "logo_url": None,
            "primary_color": "#3A4D3F",
            "secondary_color": "#E5DCC5",
            "default_language": "en",
            "currency": "USD",
            "created_at": now.isoformat()
        }
        await db.companies.insert_one(company_doc)
        
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "company_id": company_id,
            "role": "admin",
            "created_at": now.isoformat()
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    expires_at = now + timedelta(days=7)
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 3600
    )
    
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

# ============== CRM ROUTES ==============

@crm_router.get("/clients", response_model=List[Client])
async def get_clients(user: User = Depends(get_current_user)):
    clients = await db.clients.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    for c in clients:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
        if isinstance(c.get("updated_at"), str):
            c["updated_at"] = datetime.fromisoformat(c["updated_at"])
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
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.clients.insert_one(client_doc)
    client_doc["created_at"] = now
    client_doc["updated_at"] = now
    return Client(**client_doc)

@crm_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, user: User = Depends(get_current_user)):
    client = await db.clients.find_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if isinstance(client.get("created_at"), str):
        client["created_at"] = datetime.fromisoformat(client["created_at"])
    if isinstance(client.get("updated_at"), str):
        client["updated_at"] = datetime.fromisoformat(client["updated_at"])
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
    stages = ["lead", "contacted", "proposal", "negotiation", "won", "lost"]
    pipeline = {}
    for stage in stages:
        clients = await db.clients.find(
            {"company_id": user.company_id, "pipeline_stage": stage},
            {"_id": 0}
        ).to_list(100)
        for c in clients:
            if isinstance(c.get("created_at"), str):
                c["created_at"] = datetime.fromisoformat(c["created_at"])
            if isinstance(c.get("updated_at"), str):
                c["updated_at"] = datetime.fromisoformat(c["updated_at"])
        pipeline[stage] = clients
    return pipeline

# ============== EVENTS ROUTES ==============

@events_router.get("", response_model=List[Event])
async def get_events(user: User = Depends(get_current_user)):
    events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("event_date", 1).to_list(1000)
    
    for e in events:
        for field in ["event_date", "end_date", "created_at", "updated_at"]:
            if e.get(field) and isinstance(e[field], str):
                e[field] = datetime.fromisoformat(e[field])
        # Ensure documents field exists
        if "documents" not in e:
            e["documents"] = []
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
    
    # Update client events count
    await db.clients.update_one(
        {"client_id": data.client_id},
        {"$inc": {"events_count": 1}}
    )
    
    event_doc["event_date"] = data.event_date
    event_doc["end_date"] = data.end_date
    event_doc["created_at"] = now
    event_doc["updated_at"] = now
    return Event(**event_doc)

@events_router.post("/{event_id}/duplicate", response_model=Event)
async def duplicate_event(event_id: str, user: User = Depends(get_current_user)):
    """Duplicate an existing event or booking"""
    original = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not original:
        raise HTTPException(status_code=404, detail="Event not found")
    
    now = datetime.now(timezone.utc)
    new_event_id = f"event_{uuid.uuid4().hex[:12]}"
    
    # Create duplicate with new ID and reset certain fields
    new_event = {
        **original,
        "event_id": new_event_id,
        "name": f"{original['name']} (Copy)",
        "status": "planning",
        "tasks": [],  # Reset tasks
        "documents": [],  # Reset documents
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.events.insert_one(new_event)
    
    # Update client events count
    await db.clients.update_one(
        {"client_id": original["client_id"]},
        {"$inc": {"events_count": 1}}
    )
    
    for field in ["event_date", "end_date", "created_at", "updated_at"]:
        if new_event.get(field) and isinstance(new_event[field], str):
            new_event[field] = datetime.fromisoformat(new_event[field])
    
    return Event(**new_event)

@events_router.get("/{event_id}", response_model=Event)
async def get_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
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
    
    result = await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return await get_event(event_id, user)

@events_router.delete("/{event_id}")
async def delete_event(event_id: str, user: User = Depends(get_current_user)):
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.events.delete_one({"event_id": event_id})
    await db.clients.update_one(
        {"client_id": event["client_id"]},
        {"$inc": {"events_count": -1}}
    )
    return {"message": "Event deleted"}

@events_router.post("/{event_id}/tasks")
async def add_task(event_id: str, task: dict, user: User = Depends(get_current_user)):
    task["task_id"] = f"task_{uuid.uuid4().hex[:8]}"
    task["completed"] = False
    task["created_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$push": {"tasks": task}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return task

@events_router.put("/{event_id}/tasks/{task_id}")
async def update_task(event_id: str, task_id: str, task: dict, user: User = Depends(get_current_user)):
    await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id, "tasks.task_id": task_id},
        {"$set": {"tasks.$": {**task, "task_id": task_id}}}
    )
    return {"message": "Task updated"}

@events_router.post("/{event_id}/menu")
async def add_menu_item(event_id: str, data: dict, user: User = Depends(get_current_user)):
    recipe_id = data.get("recipe_id")
    result = await db.events.update_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"$addToSet": {"menu_items": recipe_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Menu item added"}

# ============== RECIPES ROUTES ==============

@recipes_router.get("/", response_model=List[Recipe])
async def get_recipes(user: User = Depends(get_current_user)):
    recipes = await db.recipes.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(1000)
    
    for r in recipes:
        for field in ["created_at", "updated_at"]:
            if isinstance(r.get(field), str):
                r[field] = datetime.fromisoformat(r[field])
    return recipes

@recipes_router.post("/", response_model=Recipe)
async def create_recipe(data: RecipeCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
    
    # Calculate total cost
    total_cost = sum(i.quantity * i.cost_per_unit for i in data.ingredients)
    cost_per_serving = total_cost / data.servings if data.servings > 0 else 0
    
    recipe_doc = {
        "recipe_id": recipe_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "ingredients": [i.model_dump() for i in data.ingredients],
        "total_cost": total_cost,
        "cost_per_serving": cost_per_serving,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.recipes.insert_one(recipe_doc)
    recipe_doc["created_at"] = now
    recipe_doc["updated_at"] = now
    return Recipe(**recipe_doc)

@recipes_router.get("/{recipe_id}", response_model=Recipe)
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    recipe = await db.recipes.find_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    for field in ["created_at", "updated_at"]:
        if isinstance(recipe.get(field), str):
            recipe[field] = datetime.fromisoformat(recipe[field])
    return Recipe(**recipe)

@recipes_router.put("/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: str, data: RecipeCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    total_cost = sum(i.quantity * i.cost_per_unit for i in data.ingredients)
    cost_per_serving = total_cost / data.servings if data.servings > 0 else 0
    
    update_data = data.model_dump()
    update_data["ingredients"] = [i.model_dump() for i in data.ingredients]
    update_data["total_cost"] = total_cost
    update_data["cost_per_serving"] = cost_per_serving
    update_data["updated_at"] = now.isoformat()
    
    result = await db.recipes.update_one(
        {"recipe_id": recipe_id, "company_id": user.company_id},
        {"$set": update_data}
    )
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
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"recipe_{uuid.uuid4().hex[:8]}",
        system_message="You are a professional chef and recipe cost analyst. Provide accurate ingredient quantities and cooking guidance. Always respond in JSON format."
    ).with_model("openai", "gpt-5.2")
    
    prompt = f"""Analyze this recipe and suggest accurate ingredient quantities:
Recipe: {recipe_name}
Servings: {servings}
Current ingredients: {ingredients}

Provide suggestions in this JSON format:
{{
  "ingredients": [
    {{"name": "ingredient name", "quantity": number, "unit": "unit", "notes": "any tips"}}
  ],
  "cooking_tips": ["tip1", "tip2"],
  "estimated_prep_time_minutes": number,
  "estimated_cook_time_minutes": number
}}"""
    
    try:
        response = await chat.send_message(UserMessage(text=prompt))
        import json
        # Try to parse JSON from response
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

# ============== INVENTORY ROUTES ==============

@inventory_router.get("/ingredients", response_model=List[Ingredient])
async def get_ingredients(user: User = Depends(get_current_user)):
    ingredients = await db.ingredients.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(1000)
    
    for i in ingredients:
        for field in ["created_at", "updated_at"]:
            if isinstance(i.get(field), str):
                i[field] = datetime.fromisoformat(i[field])
    return ingredients

@inventory_router.post("/ingredients", response_model=Ingredient)
async def create_ingredient(data: IngredientCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    ingredient_id = f"ing_{uuid.uuid4().hex[:12]}"
    
    ingredient_doc = {
        "ingredient_id": ingredient_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.ingredients.insert_one(ingredient_doc)
    ingredient_doc["created_at"] = now
    ingredient_doc["updated_at"] = now
    return Ingredient(**ingredient_doc)

@inventory_router.put("/ingredients/{ingredient_id}", response_model=Ingredient)
async def update_ingredient(ingredient_id: str, data: IngredientCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    result = await db.ingredients.update_one(
        {"ingredient_id": ingredient_id, "company_id": user.company_id},
        {"$set": {**data.model_dump(), "updated_at": now.isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    ingredient = await db.ingredients.find_one(
        {"ingredient_id": ingredient_id},
        {"_id": 0}
    )
    for field in ["created_at", "updated_at"]:
        if isinstance(ingredient.get(field), str):
            ingredient[field] = datetime.fromisoformat(ingredient[field])
    return Ingredient(**ingredient)

@inventory_router.delete("/ingredients/{ingredient_id}")
async def delete_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    result = await db.ingredients.delete_one({"ingredient_id": ingredient_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return {"message": "Ingredient deleted"}

@inventory_router.get("/suppliers", response_model=List[Supplier])
async def get_suppliers(user: User = Depends(get_current_user)):
    suppliers = await db.suppliers.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(1000)
    
    for s in suppliers:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
    return suppliers

@inventory_router.post("/suppliers", response_model=Supplier)
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
    supplier_doc["created_at"] = now
    return Supplier(**supplier_doc)

@inventory_router.get("/low-stock")
async def get_low_stock(user: User = Depends(get_current_user)):
    ingredients = await db.ingredients.find(
        {
            "company_id": user.company_id,
            "$expr": {"$lte": ["$stock_quantity", "$min_stock_level"]}
        },
        {"_id": 0}
    ).to_list(100)
    return ingredients

# ============== DOCUMENTS ROUTES ==============

@documents_router.get("/", response_model=List[Document])
async def get_documents(event_id: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {"company_id": user.company_id}
    if event_id:
        query["event_id"] = event_id
    
    documents = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for d in documents:
        for field in ["created_at", "updated_at", "signed_at"]:
            if d.get(field) and isinstance(d[field], str):
                d[field] = datetime.fromisoformat(d[field])
    return documents

@documents_router.post("/", response_model=Document)
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
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.documents.insert_one(doc)
    doc["created_at"] = now
    doc["updated_at"] = now
    return Document(**doc)

@documents_router.get("/{document_id}", response_model=Document)
async def get_document(document_id: str, user: User = Depends(get_current_user)):
    doc = await db.documents.find_one(
        {"document_id": document_id, "company_id": user.company_id},
        {"_id": 0}
    )
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
    signature = data.get("signature")  # Base64 signature image
    signed_by = data.get("signed_by", user.name)
    
    result = await db.documents.update_one(
        {"document_id": document_id, "company_id": user.company_id},
        {
            "$set": {
                "signature": signature,
                "signed_at": now.isoformat(),
                "signed_by": signed_by,
                "status": "signed",
                "updated_at": now.isoformat()
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document signed successfully"}

@documents_router.post("/generate/{event_id}/{doc_type}")
async def generate_document(event_id: str, doc_type: str, user: User = Depends(get_current_user)):
    """Generate a document (BEO, kitchen_sheet, packing_list, mise_en_place, quote) for an event"""
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    client = await db.clients.find_one(
        {"client_id": event["client_id"]},
        {"_id": 0}
    )
    
    # Get recipes for the event
    recipes = []
    for recipe_id in event.get("menu_items", []):
        recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
        if recipe:
            recipes.append(recipe)
    
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    
    # Generate content based on document type
    content = {
        "event": event,
        "client": client,
        "company": company,
        "recipes": recipes,
        "generated_at": now.isoformat()
    }
    
    # Get template settings for this document type
    template = await db.templates.find_one({
        "company_id": user.company_id,
        "type": doc_type
    }, {"_id": 0})
    
    # Apply template settings (e.g., hide prices for kitchen_sheet)
    template_settings = template.get("settings", {}) if template else {}
    content["template_settings"] = template_settings
    
    # Default: kitchen_sheet should not show prices
    if doc_type == "kitchen_sheet" and "show_prices" not in template_settings:
        content["template_settings"]["show_prices"] = False
    
    titles = {
        "contract": "Contract",
        "beo": "Banquet Event Order",
        "kitchen_sheet": "Kitchen Production Sheet",
        "packing_list": "Packing/Setup List",
        "mise_en_place": "Mise en Place Checklist",
        "quote": "Event Proposal",
        "invoice": "Invoice",
        "menu": "Menu"
    }
    
    titles_es = {
        "contract": "Contrato",
        "beo": "Orden de Evento de Banquete",
        "kitchen_sheet": "Hoja de Cocina",
        "packing_list": "Lista de Montaje",
        "mise_en_place": "Mise en Place",
        "quote": "Propuesta",
        "invoice": "Factura",
        "menu": "Menú"
    }
    
    # Use company language for title
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
    
    # Link document to event
    await db.events.update_one(
        {"event_id": event_id},
        {"$push": {"documents": {"document_id": document_id, "type": doc_type, "title": doc["title"]}}}
    )
    
    doc["created_at"] = now
    doc["updated_at"] = now
    return Document(**doc)

# ============== SETTINGS ROUTES ==============

@settings_router.get("/company", response_model=Company)
async def get_company_settings(user: User = Depends(get_current_user)):
    company = await db.companies.find_one({"company_id": user.company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if isinstance(company.get("created_at"), str):
        company["created_at"] = datetime.fromisoformat(company["created_at"])
    return Company(**company)

@settings_router.put("/company")
async def update_company_settings(data: dict, user: User = Depends(get_current_user)):
    allowed_fields = ["name", "logo_url", "primary_color", "secondary_color", "default_language", "currency"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    result = await db.companies.update_one(
        {"company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    return await get_company_settings(user)

@settings_router.get("/templates")
async def get_templates(user: User = Depends(get_current_user)):
    templates = await db.templates.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    return templates

@settings_router.post("/templates")
async def create_template(data: dict, user: User = Depends(get_current_user)):
    template_id = f"tpl_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    template_doc = {
        "template_id": template_id,
        "company_id": user.company_id,
        "name": data.get("name"),
        "type": data.get("type"),  # quote, beo, email, etc.
        "content": data.get("content", {}),
        "created_at": now.isoformat()
    }
    await db.templates.insert_one(template_doc)
    return template_doc

# ============== CLIENT PORTAL ROUTES ==============

@portal_router.get("/document/{document_id}")
async def get_portal_document(document_id: str, token: Optional[str] = None):
    """Public endpoint for clients to view documents"""
    doc = await db.documents.find_one({"document_id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    for field in ["created_at", "updated_at", "signed_at"]:
        if doc.get(field) and isinstance(doc[field], str):
            doc[field] = datetime.fromisoformat(doc[field])
    return doc

@portal_router.post("/document/{document_id}/sign")
async def client_sign_document(document_id: str, data: dict):
    """Public endpoint for clients to sign documents"""
    now = datetime.now(timezone.utc)
    signature = data.get("signature")
    signed_by = data.get("signed_by", "Client")
    
    result = await db.documents.update_one(
        {"document_id": document_id},
        {
            "$set": {
                "signature": signature,
                "signed_at": now.isoformat(),
                "signed_by": signed_by,
                "status": "signed",
                "updated_at": now.isoformat()
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document signed successfully"}

# ============== DASHBOARD ROUTES ==============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Count clients
    total_clients = await db.clients.count_documents({"company_id": user.company_id})
    
    # Count events
    total_events = await db.events.count_documents({"company_id": user.company_id})
    upcoming_events = await db.events.count_documents({
        "company_id": user.company_id,
        "event_date": {"$gte": now.isoformat()}
    })
    
    # Count recipes
    total_recipes = await db.recipes.count_documents({"company_id": user.company_id})
    
    # Count low stock ingredients
    low_stock = await db.ingredients.count_documents({
        "company_id": user.company_id,
        "$expr": {"$lte": ["$stock_quantity", "$min_stock_level"]}
    })
    
    # Pipeline stats
    pipeline_stats = {}
    stages = ["lead", "contacted", "proposal", "negotiation", "won", "lost"]
    for stage in stages:
        count = await db.clients.count_documents({
            "company_id": user.company_id,
            "pipeline_stage": stage
        })
        pipeline_stats[stage] = count
    
    # Recent events
    recent_events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("event_date", 1).limit(5).to_list(5)
    
    return {
        "total_clients": total_clients,
        "total_events": total_events,
        "upcoming_events": upcoming_events,
        "total_recipes": total_recipes,
        "low_stock_alerts": low_stock,
        "pipeline_stats": pipeline_stats,
        "recent_events": recent_events
    }

# ============== ROOT ROUTE ==============

@api_router.get("/")
async def root():
    return {"message": "EEP Evoque Events Platform API", "version": "1.0.0"}

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(crm_router)
api_router.include_router(events_router)
api_router.include_router(recipes_router)
api_router.include_router(inventory_router)
api_router.include_router(documents_router)
api_router.include_router(settings_router)
api_router.include_router(portal_router)

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
