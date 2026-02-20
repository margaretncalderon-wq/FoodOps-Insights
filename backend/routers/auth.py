# routers/auth.py - Authentication routes
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from datetime import datetime, timezone, timedelta
import uuid
import bcrypt
import jwt
import httpx
import logging

from config import (
    db, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL
)
from models.auth import User, UserCreate, UserLogin, TokenResponse
from services.email_service import send_welcome_email

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])


# ============== HELPER FUNCTIONS ==============

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
    """Extract and validate user from session token cookie or Authorization header"""
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check session table first
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
    
    # Try JWT decode
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
    
    company_name = data.company_name or f"{data.name}'s Company"
    
    # Support both industry_type (new) and industry_template (legacy)
    # industry_type takes precedence if provided
    if data.industry_type:
        # Map industry_type to industry_template
        type_to_template = {
            "events": "events_hospitality",
            "agency": "professional_services",
            "generic": "generic"
        }
        industry_template = type_to_template.get(data.industry_type, "events_hospitality")
        industry_type = data.industry_type
    else:
        industry_template = data.industry_template or "events_hospitality"
    company_doc = {
        "company_id": company_id,
        "name": company_name,
        "industry_template": industry_template,  # Store industry choice
        "logo_url": None,
        "primary_color": "#3A4D3F",
        "secondary_color": "#E5DCC5",
        "default_language": "en",
        "currency": "USD",
        "default_tax_rate": 0.0,
        "created_at": now.isoformat()
    }
    await db.companies.insert_one(company_doc)
    
    # Create organization config based on industry template
    config_id = f"config_{uuid.uuid4().hex[:12]}"
    from models.organization_config import INDUSTRY_TEMPLATES, IndustryTemplate
    
    template_enum = IndustryTemplate(industry_template) if industry_template in [e.value for e in IndustryTemplate] else IndustryTemplate.EVENTS_HOSPITALITY
    template_data = INDUSTRY_TEMPLATES.get(template_enum, INDUSTRY_TEMPLATES[IndustryTemplate.EVENTS_HOSPITALITY])
    
    config_doc = {
        "config_id": config_id,
        "company_id": company_id,
        "industry_template": industry_template,
        "industry_type": industry_type,  # Required for modules system
        "enabled_engagement_types": template_data["enabled_engagement_types"],
        "default_engagement_type": template_data["default_engagement_type"],
        "terminology": template_data.get("terminology", {}),
        "pipeline_stages": template_data["pipeline_stages"],
        "event_types": template_data["event_types"],
        "client_types": template_data["client_types"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.organization_configs.insert_one(config_doc)
    
    # Create subscription with 7-day free trial
    trial_end = now + timedelta(days=7)
    subscription_doc = {
        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "plan_id": "plan_professional",  # Start with professional plan trial
        "status": "trialing",
        "trial_start": now.isoformat(),
        "trial_end": trial_end.isoformat(),
        "current_period_start": now.isoformat(),
        "current_period_end": trial_end.isoformat(),
        "created_at": now.isoformat()
    }
    await db.subscriptions.insert_one(subscription_doc)
    
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
    
    # Send welcome email (non-blocking)
    try:
        await send_welcome_email(
            to_email=data.email,
            user_name=data.name,
            company_name=company_name,
            plan_name="Free"
        )
    except Exception as e:
        logger.warning(f"Failed to send welcome email to {data.email}: {e}")
    
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
        is_super_admin=user_doc.get("is_super_admin", False),
        created_at=datetime.fromisoformat(user_doc["created_at"]) if isinstance(user_doc["created_at"], str) else user_doc["created_at"]
    )
    return TokenResponse(access_token=token, user=user)


# ============== DEMO ACCOUNT MODULE ACTIVATION ==============

@auth_router.post("/activate-demo-modules")
async def activate_demo_modules(user: User = Depends(get_current_user)):
    """
    Activate standard modules for demo/test accounts.
    This allows users to test the full functionality without payment.
    Modules activated depend on the organization's industry.
    """
    from industry_config_module.industry_config import get_industry_config, IndustryType
    
    # Get organization's industry
    org_config = await db.organization_configs.find_one(
        {"company_id": user.company_id},
        {"industry_type": 1, "industry_template": 1}
    )
    
    industry_type = org_config.get("industry_type") if org_config else None
    if not industry_type:
        industry_template = org_config.get("industry_template", "events_hospitality") if org_config else "events_hospitality"
        template_to_type = {
            "events_hospitality": "events",
            "professional_services": "agency",
            "generic": "generic"
        }
        industry_type = template_to_type.get(industry_template, "events")
    
    # Get industry config to determine which modules to enable
    industry_config = get_industry_config(industry_type)
    enabled_modules_for_industry = industry_config.get("enabled_modules", [])
    
    # Define demo modules - only activate modules that are enabled for the industry
    ALL_DEMO_MODULES = [
        "module_event_orchestration",
        "module_demand_studio",
        "module_operations_supplies"  # Resource Management - only for industries that use it
    ]
    
    # Filter to only modules enabled for this industry
    DEMO_MODULES = [m for m in ALL_DEMO_MODULES if m in enabled_modules_for_industry]
    
    now = datetime.now(timezone.utc)
    billing_end = now + timedelta(days=30)
    
    activated = []
    for module_key in DEMO_MODULES:
        addon_id = f"addon_{module_key}"
        
        # Check if already active
        existing = await db.organization_addons.find_one({
            "company_id": user.company_id,
            "addon_id": addon_id,
            "status": "active"
        })
        
        if existing:
            continue  # Skip if already active
        
        # Create organization addon record
        org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
        addon_doc = {
            "org_addon_id": org_addon_id,
            "company_id": user.company_id,
            "addon_id": addon_id,
            "addon_name": module_key.replace("module_", "").replace("_", " ").title(),
            "addon_type": "module",
            "status": "active",
            "quantity": 1,
            "price_paid": 0,  # Free for demo
            "pricing_type": "demo",
            "currency": "USD",
            "billing_cycle_start": now.isoformat(),
            "billing_cycle_end": billing_end.isoformat(),
            "next_billing_date": billing_end.isoformat(),
            "auto_renew": False,
            "demo_account": True,
            "purchased_by": user.user_id,
            "purchased_at": now.isoformat()
        }
        
        await db.organization_addons.insert_one(addon_doc)
        activated.append(module_key)
    
    # Also create a demo subscription if none exists
    existing_sub = await db.subscriptions.find_one({
        "company_id": user.company_id,
        "status": {"$in": ["active", "trialing"]}
    })
    
    if not existing_sub:
        sub_doc = {
            "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "user_id": user.user_id,
            "plan_id": "plan_professional",
            "status": "trialing",
            "trial_end": (now + timedelta(days=7)).isoformat(),
            "demo_subscription": True,
            "created_at": now.isoformat()
        }
        await db.subscriptions.insert_one(sub_doc)
    
    return {
        "success": True,
        "activated_modules": activated,
        "message": f"Activated {len(activated)} modules for demo account"
    }


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


# ============== GOOGLE OAUTH ==============

@auth_router.get("/google/login")
async def google_login(request: Request):
    """Initiate Google OAuth flow"""
    frontend_url = FRONTEND_URL
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    
    # Clean the origin - remove any path components
    if origin:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        origin = f"{parsed.scheme}://{parsed.netloc}"
    
    if "localhost" in origin:
        frontend_url = "http://localhost:3000"
    elif origin and ("ourkora.com" in origin or "emergentagent.com" in origin or "emergent.host" in origin):
        frontend_url = origin.rstrip("/")
    
    redirect_uri = f"{frontend_url}/auth/google/callback"
    
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        "&prompt=consent"
    )
    return {"auth_url": google_auth_url}


@auth_router.post("/google/callback")
async def google_callback(request: Request, response: Response):
    """Handle Google OAuth callback"""
    body = await request.json()
    code = body.get("code")
    redirect_uri = body.get("redirect_uri", f"{FRONTEND_URL}/auth/google/callback")
    
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code required")
    
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            }
        )
        
        if token_response.status_code != 200:
            logger.error(f"Google token error: {token_response.text}")
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code")
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        
        # Get user info
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        
        google_user = userinfo_response.json()
    
    email = google_user.get("email")
    name = google_user.get("name")
    picture = google_user.get("picture")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email})
    
    if existing_user:
        # Existing user - log them in
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"picture": picture, "name": name}}
        )
        
        # Create session
        session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
        await db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        })
        
        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=7 * 24 * 60 * 60,
            path="/"
        )
        
        user_data = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        
        return {
            "success": True,
            "is_new_user": False,
            "user": user_data
        }
    else:
        # New user - require registration
        # Store temporary Google data for registration completion
        temp_token = f"google_temp_{uuid.uuid4().hex}"
        await db.google_temp_registrations.insert_one({
            "temp_token": temp_token,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        })
        
        return {
            "success": True,
            "is_new_user": True,
            "requires_registration": True,
            "temp_token": temp_token,
            "google_data": {
                "email": email,
                "name": name,
                "picture": picture
            }
        }


@auth_router.post("/google/complete-registration")
async def complete_google_registration(request: Request, response: Response):
    """Complete registration for new Google OAuth users"""
    body = await request.json()
    temp_token = body.get("temp_token")
    company_name = body.get("company_name")
    industry_template = body.get("industry_template", "events_hospitality")
    industry_type_input = body.get("industry_type")  # Support both formats
    
    # If industry_type is provided, map it to industry_template
    if industry_type_input:
        type_to_template = {
            "events": "events_hospitality",
            "agency": "professional_services",
            "generic": "generic"
        }
        industry_template = type_to_template.get(industry_type_input, industry_template)
    
    if not temp_token:
        raise HTTPException(status_code=400, detail="Token de registro temporal requerido")
    
    # Get temporary registration data
    temp_data = await db.google_temp_registrations.find_one({"temp_token": temp_token})
    if not temp_data:
        raise HTTPException(status_code=400, detail="Token inválido o expirado. Por favor, inicia sesión con Google nuevamente.")
    
    # Check expiration
    expires_at = temp_data.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.google_temp_registrations.delete_one({"temp_token": temp_token})
        raise HTTPException(status_code=400, detail="Token expirado. Por favor, inicia sesión con Google nuevamente.")
    
    email = temp_data["email"]
    name = temp_data["name"]
    picture = temp_data.get("picture")
    
    # Double-check user doesn't exist (race condition protection)
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        await db.google_temp_registrations.delete_one({"temp_token": temp_token})
        raise HTTPException(status_code=400, detail="Este email ya está registrado. Intenta iniciar sesión.")
    
    # Create company and user with FREE plan
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    company_id = f"company_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    # Create organization with industry template (new format)
    org_doc = {
        "company_id": company_id,
        "name": company_name or f"Empresa de {name}",
        "industry_template": industry_template,
        "status": "active",
        "created_at": now.isoformat(),
        "settings": {
            "currency": "USD",
            "timezone": "America/Santo_Domingo",
            "language": "es"
        }
    }
    await db.companies.insert_one(org_doc)
    
    # Create organization_configs record (IMPORTANT: used for industry-specific behavior)
    from models.organization_config import INDUSTRY_TEMPLATES, IndustryTemplate
    try:
        template_enum = IndustryTemplate(industry_template)
    except ValueError:
        template_enum = IndustryTemplate.EVENTS_HOSPITALITY
    
    template_data = INDUSTRY_TEMPLATES.get(template_enum, INDUSTRY_TEMPLATES[IndustryTemplate.EVENTS_HOSPITALITY])
    
    # Map industry_template to industry_type for the modules system
    industry_type_map = {
        "events_hospitality": "events",
        "professional_services": "agency",
        "generic": "generic"
    }
    industry_type = industry_type_map.get(industry_template, "events")
    
    org_config_doc = {
        "company_id": company_id,
        "industry_template": industry_template,
        "industry_type": industry_type,  # Required for modules system
        "enabled_engagement_types": template_data["enabled_engagement_types"],
        "default_engagement_type": template_data["default_engagement_type"],
        "terminology": template_data.get("terminology", {}),
        "pipeline_stages": template_data["pipeline_stages"],
        "event_types": template_data["event_types"],
        "client_types": template_data["client_types"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.organization_configs.insert_one(org_config_doc)
    
    # Create user as owner of their organization
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "company_id": company_id,
        "role": "owner",
        "is_super_admin": False,
        "auth_provider": "google",
        "created_at": now.isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Create membership
    await db.organization_members.insert_one({
        "membership_id": f"member_{uuid.uuid4().hex[:12]}",
        "company_id": company_id,
        "user_id": user_id,
        "role": "owner",
        "status": "active",
        "joined_at": now.isoformat()
    })
    
    # Clean up temp registration
    await db.google_temp_registrations.delete_one({"temp_token": temp_token})
    
    # Create session
    session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=7)).isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    user_data = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    org_data = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    
    # Send welcome email (non-blocking, doesn't fail registration if email fails)
    try:
        await send_welcome_email(
            to_email=email,
            user_name=name,
            company_name=company_name or f"Empresa de {name}",
            plan_name="Kora Core"
        )
    except Exception as e:
        logger.warning(f"Failed to send welcome email to {email}: {e}")
    
    return {
        "success": True,
        "user": user_data,
        "company": org_data,
        "message": "¡Bienvenido a Kora OS!"
    }
