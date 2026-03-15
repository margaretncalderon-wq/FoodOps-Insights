# routers/auth.py - Authentication routes
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel
import uuid
import bcrypt
import jwt
import httpx
import logging
import os
from urllib.parse import urlparse

from config import (
    db, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL
)
from models.auth import User, UserCreate, UserLogin, TokenResponse
from services.email_service import send_welcome_email

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])


# ============== COOKIE CONFIGURATION ==============

def get_cookie_domain(request: Request = None):
    """Extract domain for cookie setting - handles both production and preview environments"""
    # For ourkora.com, we need to set domain as .ourkora.com to work across subdomains
    frontend_url = os.environ.get("FRONTEND_URL", "https://ourkora.com")
    parsed = urlparse(frontend_url)
    domain = parsed.netloc
    
    # Remove port if present
    if ":" in domain:
        domain = domain.split(":")[0]
    
    # Check request headers for preview environments
    if request:
        origin = request.headers.get("origin", "") or request.headers.get("referer", "")
        host = request.headers.get("host", "")
        
        # For preview/localhost environments, don't set domain
        if any(x in (origin + host).lower() for x in ["preview", "emergent", "localhost", "127.0"]):
            return None
    
    # For production domains, set cookie for the root domain
    if domain and not domain.startswith("localhost") and not domain.startswith("127."):
        # Return domain with leading dot for subdomain support
        return f".{domain}" if not domain.startswith(".") else domain
    
    return None


def set_auth_cookie(response: Response, token: str, request: Request = None):
    """Set authentication cookie with proper configuration"""
    cookie_domain = get_cookie_domain(request)
    
    # Determine if we're in a secure context
    is_secure = True
    if request:
        origin = request.headers.get("origin", "") or request.headers.get("referer", "")
        if "localhost" in origin or "127.0" in origin:
            is_secure = False
    
    # Base cookie settings
    cookie_kwargs = {
        "key": "session_token",
        "value": token,
        "httponly": True,
        "secure": is_secure,
        "samesite": "lax" if not is_secure else "none",
        "path": "/",
        "max_age": JWT_EXPIRATION_HOURS * 3600
    }
    
    # Add domain for production (not for preview)
    if cookie_domain:
        cookie_kwargs["domain"] = cookie_domain
    
    response.set_cookie(**cookie_kwargs)


def clear_auth_cookie(response: Response, request: Request = None):
    """Clear authentication cookie"""
    cookie_domain = get_cookie_domain(request)
    
    cookie_kwargs = {
        "key": "session_token",
        "path": "/",
        "httponly": True,
        "secure": True,
        "samesite": "none"
    }
    
    if cookie_domain:
        cookie_kwargs["domain"] = cookie_domain
    
    response.delete_cookie(**cookie_kwargs)


# ============== HELPER FUNCTIONS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


async def ensure_user_data_complete(company_id: str, user_id: str = None):
    """
    Back-fill missing organization_config and subscription for a company.
    Called on every login/session to ensure data integrity for existing users.
    """
    if not company_id:
        return

    from models.organization_config import INDUSTRY_TEMPLATES, IndustryTemplate

    template_to_type = {
        "events_hospitality": "events",
        "professional_services": "agency",
        "generic": "generic",
    }

    # 1. Ensure organization_config exists and has industry_type
    org_config = await db.organization_configs.find_one({"company_id": company_id})
    if not org_config:
        # Get company's industry_template if available
        company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "industry_template": 1})
        industry_template = (company.get("industry_template") if company else None) or "events_hospitality"
        industry_type = template_to_type.get(industry_template, "events")

        try:
            template_enum = IndustryTemplate(industry_template)
        except ValueError:
            template_enum = IndustryTemplate.EVENTS_HOSPITALITY

        template_data = INDUSTRY_TEMPLATES.get(template_enum, INDUSTRY_TEMPLATES[IndustryTemplate.EVENTS_HOSPITALITY])
        now = datetime.now(timezone.utc).isoformat()
        await db.organization_configs.insert_one({
            "config_id": f"config_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "industry_template": industry_template,
            "industry_type": industry_type,
            "enabled_engagement_types": template_data["enabled_engagement_types"],
            "default_engagement_type": template_data["default_engagement_type"],
            "terminology": template_data.get("terminology", {}),
            "pipeline_stages": template_data["pipeline_stages"],
            "event_types": template_data["event_types"],
            "client_types": template_data["client_types"],
            "created_at": now,
            "updated_at": now,
        })
    elif not org_config.get("industry_type"):
        industry_template = org_config.get("industry_template", "events_hospitality")
        industry_type = template_to_type.get(industry_template, "events")
        await db.organization_configs.update_one(
            {"company_id": company_id},
            {"$set": {"industry_type": industry_type, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    # 2. Ensure active/trialing subscription exists
    active_sub = await db.subscriptions.find_one({
        "company_id": company_id,
        "status": {"$in": ["active", "trialing"]}
    })
    if not active_sub:
        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=7)
        await db.subscriptions.insert_one({
            "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "plan_id": "plan_professional",
            "status": "trialing",
            "trial_start": now.isoformat(),
            "trial_end": trial_end.isoformat(),
            "current_period_start": now.isoformat(),
            "current_period_end": trial_end.isoformat(),
            "created_at": now.isoformat(),
        })


def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> User:
    """Extract and validate user from JWT token (Authorization header preferred, cookie fallback)"""
    token = None
    
    # 1. Prefer Authorization header (most reliable)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    # 2. Fallback to session_token cookie
    if not token:
        token = request.cookies.get("session_token")
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Try JWT decode first (fastest, most common)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_doc = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user_doc)
    except jwt.ExpiredSignatureError:
        pass  # Fall through to session check
    except jwt.InvalidTokenError:
        pass  # Fall through to session check
    
    # Fallback: Check session table (for OAuth sessions)
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
    
    raise HTTPException(status_code=401, detail="Invalid or expired token")


# ============== AUTH ROUTES ==============

@auth_router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, request: Request, response: Response):
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
        # Set industry_type from template to avoid NameError
        type_from_template = {
            "events_hospitality": "events",
            "professional_services": "agency",
            "generic": "generic"
        }
        industry_type = type_from_template.get(industry_template, "events")
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
        "deal_code": data.deal_code,
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
        "company_name": company_name,  # Store company name with user
        "role": "admin",
        "deal_code": data.deal_code,
        "created_at": now.isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    set_auth_cookie(response, token, request)
    
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
    
    user = User(user_id=user_id, email=data.email, name=data.name, picture=None, company_id=company_id, company_name=company_name, role="admin", created_at=now)
    return TokenResponse(access_token=token, user=user)


@auth_router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, response: Response):
    user_doc = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Support both 'password' and 'password_hash' field names for backwards compatibility
    stored_password = user_doc.get("password_hash") or user_doc.get("password", "")
    if not stored_password or not verify_password(data.password, stored_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Back-fill missing data for existing users
    await ensure_user_data_complete(user_doc.get("company_id"), user_doc["user_id"])
    
    # Get company_name from user or from companies collection if not stored
    company_name = user_doc.get("company_name")
    if not company_name and user_doc.get("company_id"):
        company = await db.companies.find_one(
            {"company_id": user_doc["company_id"]},
            {"_id": 0, "name": 1}
        )
        company_name = company.get("name") if company else None
        # Back-fill company_name to user document
        if company_name:
            await db.users.update_one(
                {"user_id": user_doc["user_id"]},
                {"$set": {"company_name": company_name}}
            )

    token = create_jwt_token(user_doc["user_id"])
    set_auth_cookie(response, token, request)
    
    user = User(
        user_id=user_doc["user_id"], email=user_doc["email"], name=user_doc["name"],
        picture=user_doc.get("picture"), company_id=user_doc.get("company_id"),
        company_name=company_name,
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
        company_id = user_doc.get("company_id")
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
        # Back-fill missing data for existing users
        await ensure_user_data_complete(company_id, user_id)
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        company_id = f"company_{uuid.uuid4().hex[:12]}"
        
        company_doc = {"company_id": company_id, "name": f"{name}'s Company", "industry_template": "events_hospitality", "logo_url": None, "primary_color": "#3A4D3F", "secondary_color": "#E5DCC5", "default_language": "en", "currency": "USD", "default_tax_rate": 0.0, "created_at": now.isoformat()}
        await db.companies.insert_one(company_doc)
        
        user_doc = {"user_id": user_id, "email": email, "name": name, "picture": picture, "company_id": company_id, "role": "admin", "created_at": now.isoformat()}
        await db.users.insert_one(user_doc)
        
        # Create organization config and subscription for new Emergent OAuth users
        await ensure_user_data_complete(company_id, user_id)
    
    expires_at = now + timedelta(days=7)
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": session_token, "expires_at": expires_at.isoformat(), "created_at": now.isoformat()})
    
    set_auth_cookie(response, session_token, request)
    
    jwt_token = create_jwt_token(user_id)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"access_token": jwt_token, "user": user_doc}


@auth_router.get("/debug-cookies")
async def debug_cookies(request: Request):
    """Debug endpoint to check what cookies are received"""
    cookies = dict(request.cookies)
    headers = dict(request.headers)
    has_session = "session_token" in cookies
    cookie_domain = get_cookie_domain(request)
    frontend_url = os.environ.get("FRONTEND_URL", "not set")
    
    # Check if session is valid
    session_valid = False
    user_info = None
    if has_session:
        session = await db.user_sessions.find_one({"session_token": cookies.get("session_token")}, {"_id": 0, "user_id": 1, "expires_at": 1})
        if session:
            session_valid = True
            user_info = session.get("user_id", "")[:20]
    
    return {
        "has_session_cookie": has_session,
        "session_valid_in_db": session_valid,
        "user_id_prefix": user_info,
        "cookie_names": list(cookies.keys()),
        "session_token_prefix": cookies.get("session_token", "")[:20] + "..." if cookies.get("session_token") else None,
        "origin": headers.get("origin"),
        "referer": headers.get("referer"),
        "host": headers.get("host"),
        "frontend_url_env": frontend_url,
        "expected_cookie_domain": cookie_domain,
        "cors_origins": os.environ.get("CORS_ORIGINS", "not set")[:100]
    }


@auth_router.get("/me", response_model=User)
async def get_me(request: Request, response: Response, user: User = Depends(get_current_user)):
    """Get current authenticated user - used to restore session on page refresh.
    Also refreshes the JWT token if it's close to expiration."""
    # Auto-refresh: issue a fresh JWT on every /me call to keep sessions alive
    new_token = create_jwt_token(user.user_id)
    set_auth_cookie(response, new_token, request)
    
    return user


@auth_router.post("/refresh")
async def refresh_token(request: Request, response: Response, user: User = Depends(get_current_user)):
    """Refresh the JWT token - extends session by issuing a new token"""
    new_token = create_jwt_token(user.user_id)
    set_auth_cookie(response, new_token, request)
    return {"access_token": new_token, "user_id": user.user_id}


@auth_router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    clear_auth_cookie(response, request)
    return {"message": "Logged out successfully"}


# ============== GOOGLE OAUTH ==============

@auth_router.get("/google/login")
async def google_login(request: Request):
    """Initiate Google OAuth flow"""
    # Priority: query param from frontend > FRONTEND_URL env var
    redirect_uri_override = request.query_params.get("redirect_uri")
    if redirect_uri_override:
        redirect_uri = redirect_uri_override
    else:
        redirect_uri = f"{FRONTEND_URL}/auth/google/callback"
    
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        "&prompt=consent"
    )
    return {"auth_url": google_auth_url, "redirect_uri": redirect_uri}


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
        company_id = existing_user.get("company_id")
        
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"picture": picture, "name": name}}
        )
        
        # Back-fill missing organization_config and subscription
        await ensure_user_data_complete(company_id, user_id)
        
        # Create session
        session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"
        await db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        })
        
        set_auth_cookie(response, session_token, request)
        
        # Also create a JWT for immediate use by the frontend
        jwt_token = create_jwt_token(user_id)
        
        user_data = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        
        return {
            "success": True,
            "is_new_user": False,
            "access_token": jwt_token,
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
    deal_code = body.get("deal_code")
    
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
        "deal_code": deal_code,
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
        "deal_code": deal_code,
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
    
    set_auth_cookie(response, session_token, request)
    
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
    
    jwt_token = create_jwt_token(user_id)
    
    return {
        "success": True,
        "access_token": jwt_token,
        "user": user_data,
        "company": org_data,
        "message": "¡Bienvenido a Kora OS!"
    }


# ==================== FINANCE SETUP WIZARD ====================

# Generic cost center templates by business type (multi-industry)
COST_CENTER_TEMPLATES = {
    "general": [
        {"name": "General Administration", "name_es": "Administración General", "code": "ADM", "cc_type": "support"},
        {"name": "Sales & Marketing", "name_es": "Ventas y Marketing", "code": "MKT", "cc_type": "revenue"},
        {"name": "Operations", "name_es": "Operaciones", "code": "OPS", "cc_type": "operating"},
        {"name": "Technology", "name_es": "Tecnología", "code": "TEC", "cc_type": "support"},
    ],
    "services": [
        {"name": "General Administration", "name_es": "Administración General", "code": "ADM", "cc_type": "support"},
        {"name": "Business Development", "name_es": "Desarrollo de Negocios", "code": "BD", "cc_type": "revenue"},
        {"name": "Service Delivery", "name_es": "Entrega de Servicios", "code": "SVC", "cc_type": "operating"},
        {"name": "Client Success", "name_es": "Éxito del Cliente", "code": "CS", "cc_type": "revenue"},
        {"name": "Technology", "name_es": "Tecnología", "code": "TEC", "cc_type": "support"},
    ],
    "operations": [
        {"name": "General Administration", "name_es": "Administración General", "code": "ADM", "cc_type": "support"},
        {"name": "Production", "name_es": "Producción", "code": "PROD", "cc_type": "operating"},
        {"name": "Logistics", "name_es": "Logística", "code": "LOG", "cc_type": "operating"},
        {"name": "Quality Control", "name_es": "Control de Calidad", "code": "QC", "cc_type": "operating"},
        {"name": "Maintenance", "name_es": "Mantenimiento", "code": "MANT", "cc_type": "support"},
        {"name": "Sales", "name_es": "Ventas", "code": "VTA", "cc_type": "revenue"},
    ],
    "projects": [
        {"name": "General Administration", "name_es": "Administración General", "code": "ADM", "cc_type": "support"},
        {"name": "Project Management", "name_es": "Gestión de Proyectos", "code": "PM", "cc_type": "operating"},
        {"name": "Business Development", "name_es": "Desarrollo de Negocios", "code": "BD", "cc_type": "revenue"},
        {"name": "Resource Pool", "name_es": "Pool de Recursos", "code": "RES", "cc_type": "operating"},
    ],
    "hospitality": [
        {"name": "General Administration", "name_es": "Administración General", "code": "ADM", "cc_type": "support"},
        {"name": "Sales & Events", "name_es": "Ventas y Eventos", "code": "EVT", "cc_type": "revenue"},
        {"name": "Operations", "name_es": "Operaciones", "code": "OPS", "cc_type": "operating"},
        {"name": "Culinary", "name_es": "Cocina", "code": "COC", "cc_type": "operating"},
        {"name": "Internal Marketing", "name_es": "Marketing Interno", "code": "MKT", "cc_type": "revenue"},
    ],
}


class FinanceSetupRequest(BaseModel):
    """Request model for finance setup wizard"""
    enable_cost_centers: bool = True
    business_type: str = "general"  # general, services, operations, projects, hospitality
    custom_cost_centers: Optional[List[dict]] = None  # Override templates
    language: str = "en"


@auth_router.post("/finance-setup")
async def setup_company_finance(
    data: FinanceSetupRequest,
    user: User = Depends(get_current_user)
):
    """
    Initial finance setup wizard for new companies.
    Creates cost centers based on business type templates.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    created_cost_centers = []
    
    if data.enable_cost_centers:
        # Check if cost centers already exist
        existing_count = await db.cost_centers.count_documents({"company_id": company_id})
        if existing_count > 0:
            return {
                "message": "Cost centers already configured",
                "cost_centers_count": existing_count,
                "skipped": True
            }
        
        # Use custom cost centers if provided, otherwise use templates
        templates = data.custom_cost_centers or COST_CENTER_TEMPLATES.get(data.business_type, COST_CENTER_TEMPLATES["general"])
        
        for idx, template in enumerate(templates):
            cc_id = f"cc_{uuid.uuid4().hex[:12]}"
            name = template.get("name_es" if data.language == "es" else "name", template.get("name"))
            
            doc = {
                "cost_center_id": cc_id,
                "company_id": company_id,
                "name": name,
                "code": template.get("code"),
                "description": template.get("description") or template.get("description_es"),
                "cc_type": template.get("cc_type", "operating"),
                "annual_budget": template.get("annual_budget", 0),
                "monthly_budgets": {},
                "quarterly_budgets": {},
                "current_spend": 0.0,
                "responsible_user_id": None,
                "responsible_name": None,
                "parent_cost_center_id": None,
                "is_active": True,
                "is_system": True,
                "default_budget_enabled": True,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            
            await db.cost_centers.insert_one(doc)
            created_cost_centers.append({
                "cost_center_id": cc_id,
                "name": name,
                "code": template.get("code"),
                "cc_type": template.get("cc_type")
            })
    
    # Mark company as having completed finance setup
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {
            "finance_setup_completed": True,
            "finance_setup_date": now.isoformat(),
            "cost_centers_enabled": data.enable_cost_centers
        }}
    )
    
    return {
        "message": "Finance setup completed",
        "cost_centers_created": len(created_cost_centers),
        "cost_centers": created_cost_centers
    }


@auth_router.get("/finance-setup/templates")
async def get_finance_setup_templates(user: User = Depends(get_current_user)):
    """Get available cost center templates for finance setup wizard"""
    return {
        "business_types": [
            {"value": "general", "label": "General Business", "label_es": "Negocio General"},
            {"value": "services", "label": "Services Business", "label_es": "Negocio de Servicios"},
            {"value": "operations", "label": "Operations-Heavy", "label_es": "Operaciones Intensivas"},
            {"value": "projects", "label": "Project-Based", "label_es": "Basado en Proyectos"},
            {"value": "hospitality", "label": "Hospitality/Events", "label_es": "Hospitalidad/Eventos"},
        ],
        "templates": COST_CENTER_TEMPLATES
    }


@auth_router.get("/finance-setup/status")
async def get_finance_setup_status(user: User = Depends(get_current_user)):
    """Check if finance setup has been completed for the company"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"completed": False, "needs_setup": True}
    
    company = await db.companies.find_one(
        {"company_id": company_id},
        {"_id": 0, "finance_setup_completed": 1, "finance_setup_date": 1, "cost_centers_enabled": 1}
    )
    
    if not company:
        return {"completed": False, "needs_setup": True}
    
    # Check if has cost centers
    cc_count = await db.cost_centers.count_documents({"company_id": company_id})
    
    return {
        "completed": company.get("finance_setup_completed", False),
        "setup_date": company.get("finance_setup_date"),
        "cost_centers_enabled": company.get("cost_centers_enabled", False),
        "cost_centers_count": cc_count,
        "needs_setup": not company.get("finance_setup_completed", False) and cc_count == 0
    }
