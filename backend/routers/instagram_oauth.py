# routers/instagram_oauth.py - Instagram OAuth 2.0 Flow (Simple Instagram Login like Tezza)
"""
Multi-tenant Instagram OAuth implementation.
Each tenant can connect their own Instagram Business/Creator account.
Kora has ONE Meta App, tenants authorize their individual accounts.

Flow:
1. GET /instagram/oauth/start - Returns Instagram auth URL for user
2. User authorizes on Instagram
3. GET /instagram/oauth/callback - Exchanges code for tokens, stores per-tenant
4. Automatic token refresh before 60-day expiry
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import RedirectResponse
from typing import Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import uuid
import os
import httpx
import logging
import base64
from urllib.parse import urlencode, quote

from config import db
from models.auth import User
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

instagram_oauth_router = APIRouter(prefix="/instagram", tags=["Instagram OAuth"])

# Instagram OAuth Config
INSTAGRAM_APP_ID = os.environ.get("INSTAGRAM_APP_ID", "")
INSTAGRAM_APP_SECRET = os.environ.get("INSTAGRAM_APP_SECRET", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://ourkora.com")

# Instagram API Endpoints
INSTAGRAM_AUTH_URL = "https://api.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_GRAPH_URL = "https://graph.instagram.com"

# Required scopes for read-only access
DEFAULT_SCOPES = "instagram_business_basic,instagram_business_manage_messages"


class OAuthStartResponse(BaseModel):
    auth_url: str
    state: str


class InstagramProfile(BaseModel):
    ig_user_id: str
    username: str
    account_type: Optional[str] = None
    media_count: Optional[int] = None
    profile_picture_url: Optional[str] = None


def encrypt_token(token: str) -> str:
    """Simple base64 encoding - in production use proper encryption (Fernet, KMS)"""
    return base64.b64encode(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    """Decrypt token"""
    return base64.b64decode(encrypted.encode()).decode()


@instagram_oauth_router.get("/oauth/start")
async def start_instagram_oauth(
    request: Request,
    user: User = Depends(get_current_user)
) -> OAuthStartResponse:
    """
    Start Instagram OAuth flow.
    Returns the Instagram authorization URL that the frontend should redirect to.
    """
    if not INSTAGRAM_APP_ID:
        raise HTTPException(
            status_code=503, 
            detail="Instagram integration not configured. Please set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET."
        )
    
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Check user permissions
    if user.role not in ["owner", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin or Manager access required")
    
    # Generate state token for CSRF protection (includes tenant info)
    state = f"{company_id}:{user.user_id}:{uuid.uuid4().hex[:16]}"
    state_encoded = base64.urlsafe_b64encode(state.encode()).decode()
    
    # Store state in database for verification
    await db.oauth_states.insert_one({
        "state": state_encoded,
        "tenant_id": company_id,
        "user_id": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "provider": "instagram"
    })
    
    # Build redirect URI - this must match EXACTLY what's configured in Meta App Dashboard
    # Use the preview URL for development, production URL for prod
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/instagram/oauth/callback"
    
    # Build Instagram authorization URL
    params = {
        "client_id": INSTAGRAM_APP_ID,
        "redirect_uri": redirect_uri,
        "scope": DEFAULT_SCOPES,
        "response_type": "code",
        "state": state_encoded
    }
    
    auth_url = f"{INSTAGRAM_AUTH_URL}?{urlencode(params)}"
    
    return OAuthStartResponse(auth_url=auth_url, state=state_encoded)


@instagram_oauth_router.get("/oauth/callback")
async def instagram_oauth_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...)
):
    """
    Handle Instagram OAuth callback.
    Exchanges authorization code for access token and stores it per-tenant.
    Redirects back to frontend settings page.
    """
    if not INSTAGRAM_APP_ID or not INSTAGRAM_APP_SECRET:
        raise HTTPException(status_code=503, detail="Instagram not configured")
    
    # Verify state token
    state_doc = await db.oauth_states.find_one({"state": state, "provider": "instagram"})
    if not state_doc:
        logger.error(f"Invalid OAuth state: {state}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/demand-studio/settings?ig_error=invalid_state",
            status_code=302
        )
    
    # Check expiry
    if datetime.fromisoformat(state_doc["expires_at"]) < datetime.now(timezone.utc):
        await db.oauth_states.delete_one({"state": state})
        return RedirectResponse(
            url=f"{FRONTEND_URL}/demand-studio/settings?ig_error=expired",
            status_code=302
        )
    
    tenant_id = state_doc["tenant_id"]
    user_id = state_doc["user_id"]
    
    # Delete used state
    await db.oauth_states.delete_one({"state": state})
    
    # Build redirect URI (must match exactly)
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/instagram/oauth/callback"
    
    try:
        # Exchange code for short-lived access token
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                INSTAGRAM_TOKEN_URL,
                data={
                    "client_id": INSTAGRAM_APP_ID,
                    "client_secret": INSTAGRAM_APP_SECRET,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code": code
                }
            )
            
            if token_response.status_code != 200:
                logger.error(f"Token exchange failed: {token_response.text}")
                return RedirectResponse(
                    url=f"{FRONTEND_URL}/demand-studio/settings?ig_error=token_exchange_failed",
                    status_code=302
                )
            
            token_data = token_response.json()
            short_lived_token = token_data.get("access_token")
            ig_user_id = str(token_data.get("user_id"))
            
            if not short_lived_token:
                return RedirectResponse(
                    url=f"{FRONTEND_URL}/demand-studio/settings?ig_error=no_token",
                    status_code=302
                )
            
            # Exchange for long-lived token (60 days)
            long_lived_response = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/access_token",
                params={
                    "grant_type": "ig_exchange_token",
                    "client_secret": INSTAGRAM_APP_SECRET,
                    "access_token": short_lived_token
                }
            )
            
            if long_lived_response.status_code == 200:
                long_lived_data = long_lived_response.json()
                access_token = long_lived_data.get("access_token", short_lived_token)
                expires_in = long_lived_data.get("expires_in", 5184000)  # Default 60 days
            else:
                logger.warning(f"Long-lived token exchange failed, using short-lived: {long_lived_response.text}")
                access_token = short_lived_token
                expires_in = 3600  # 1 hour for short-lived
            
            # Get user profile info
            profile_response = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/me",
                params={
                    "fields": "id,username,account_type,media_count",
                    "access_token": access_token
                }
            )
            
            ig_username = "instagram_user"
            account_type = None
            media_count = 0
            
            if profile_response.status_code == 200:
                profile_data = profile_response.json()
                ig_username = profile_data.get("username", ig_username)
                account_type = profile_data.get("account_type")
                media_count = profile_data.get("media_count", 0)
            
            # Calculate token expiry
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            
            # Store connection (disconnect existing first)
            now = datetime.now(timezone.utc)
            connection_id = str(uuid.uuid4())
            
            await db.instagram_connections.update_many(
                {"tenant_id": tenant_id},
                {"$set": {"status": "disconnected", "updated_at": now.isoformat()}}
            )
            
            connection = {
                "connection_id": connection_id,
                "tenant_id": tenant_id,
                "brand_id": None,
                "connected_by_user_id": user_id,
                "ig_user_id": ig_user_id,
                "ig_username": ig_username,
                "account_type": account_type,
                "media_count": media_count,
                "page_id": None,
                "access_token_encrypted": encrypt_token(access_token),
                "token_expires_at": token_expires_at.isoformat(),
                "status": "connected",
                "last_sync_at": None,
                "scopes": DEFAULT_SCOPES,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            
            await db.instagram_connections.insert_one(connection)
            
            logger.info(f"Instagram connected for tenant {tenant_id}: @{ig_username}")
            
            # Redirect back to settings with success
            return RedirectResponse(
                url=f"{FRONTEND_URL}/demand-studio/settings?ig_success=true&ig_username={ig_username}",
                status_code=302
            )
            
    except Exception as e:
        logger.exception(f"Instagram OAuth error: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/demand-studio/settings?ig_error=unknown",
            status_code=302
        )


@instagram_oauth_router.post("/oauth/refresh")
async def refresh_instagram_token(user: User = Depends(get_current_user)):
    """
    Refresh Instagram access token before expiry.
    Long-lived tokens can be refreshed to get another 60 days.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Get current connection
    connection = await db.instagram_connections.find_one({
        "tenant_id": company_id,
        "status": "connected"
    })
    
    if not connection:
        raise HTTPException(status_code=404, detail="No Instagram connection found")
    
    current_token = decrypt_token(connection["access_token_encrypted"])
    
    try:
        async with httpx.AsyncClient() as client:
            refresh_response = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/refresh_access_token",
                params={
                    "grant_type": "ig_refresh_token",
                    "access_token": current_token
                }
            )
            
            if refresh_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Token refresh failed")
            
            refresh_data = refresh_response.json()
            new_token = refresh_data.get("access_token")
            expires_in = refresh_data.get("expires_in", 5184000)
            
            # Update connection with new token
            new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            
            await db.instagram_connections.update_one(
                {"connection_id": connection["connection_id"]},
                {"$set": {
                    "access_token_encrypted": encrypt_token(new_token),
                    "token_expires_at": new_expires_at.isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            return {
                "success": True,
                "expires_at": new_expires_at.isoformat(),
                "message": "Token refreshed successfully"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Token refresh error: {e}")
        raise HTTPException(status_code=500, detail="Token refresh failed")


@instagram_oauth_router.get("/media")
async def get_instagram_media(
    user: User = Depends(get_current_user),
    limit: int = Query(25, ge=1, le=100)
):
    """
    Fetch recent media from connected Instagram account.
    Uses cached data if recent, otherwise fetches from API.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Get connection
    connection = await db.instagram_connections.find_one({
        "tenant_id": company_id,
        "status": "connected"
    })
    
    if not connection:
        raise HTTPException(status_code=404, detail="No Instagram connection found")
    
    # Check if we have recent cached data (less than 1 hour old)
    cache = await db.instagram_media_cache.find_one({
        "tenant_id": company_id,
        "ig_user_id": connection["ig_user_id"]
    })
    
    if cache:
        cache_age = datetime.now(timezone.utc) - datetime.fromisoformat(cache["fetched_at"])
        if cache_age.total_seconds() < 3600:  # 1 hour
            return {
                "media": cache.get("media_items", [])[:limit],
                "cached": True,
                "cached_at": cache["fetched_at"]
            }
    
    # Fetch fresh data from Instagram API
    access_token = decrypt_token(connection["access_token_encrypted"])
    
    try:
        async with httpx.AsyncClient() as client:
            media_response = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/me/media",
                params={
                    "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                    "limit": limit,
                    "access_token": access_token
                }
            )
            
            if media_response.status_code != 200:
                logger.error(f"Media fetch failed: {media_response.text}")
                # Return cached data if available
                if cache:
                    return {
                        "media": cache.get("media_items", [])[:limit],
                        "cached": True,
                        "cached_at": cache["fetched_at"],
                        "error": "API fetch failed, showing cached data"
                    }
                raise HTTPException(status_code=400, detail="Failed to fetch media")
            
            media_data = media_response.json()
            media_items = media_data.get("data", [])
            
            # Update cache
            now = datetime.now(timezone.utc)
            await db.instagram_media_cache.update_one(
                {"tenant_id": company_id, "ig_user_id": connection["ig_user_id"]},
                {"$set": {
                    "media_items": media_items,
                    "fetched_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }},
                upsert=True
            )
            
            # Update connection last sync
            await db.instagram_connections.update_one(
                {"connection_id": connection["connection_id"]},
                {"$set": {"last_sync_at": now.isoformat()}}
            )
            
            return {
                "media": media_items,
                "cached": False,
                "fetched_at": now.isoformat()
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Media fetch error: {e}")
        if cache:
            return {
                "media": cache.get("media_items", [])[:limit],
                "cached": True,
                "cached_at": cache["fetched_at"],
                "error": str(e)
            }
        raise HTTPException(status_code=500, detail="Failed to fetch media")


@instagram_oauth_router.get("/profile")
async def get_instagram_profile(user: User = Depends(get_current_user)):
    """Get current Instagram profile info"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    connection = await db.instagram_connections.find_one({
        "tenant_id": company_id,
        "status": "connected"
    })
    
    if not connection:
        raise HTTPException(status_code=404, detail="No Instagram connection found")
    
    access_token = decrypt_token(connection["access_token_encrypted"])
    
    try:
        async with httpx.AsyncClient() as client:
            profile_response = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/me",
                params={
                    "fields": "id,username,account_type,media_count,profile_picture_url",
                    "access_token": access_token
                }
            )
            
            if profile_response.status_code != 200:
                # Return cached profile from connection
                return InstagramProfile(
                    ig_user_id=connection["ig_user_id"],
                    username=connection["ig_username"],
                    account_type=connection.get("account_type"),
                    media_count=connection.get("media_count")
                )
            
            profile_data = profile_response.json()
            
            # Update connection with fresh data
            await db.instagram_connections.update_one(
                {"connection_id": connection["connection_id"]},
                {"$set": {
                    "ig_username": profile_data.get("username", connection["ig_username"]),
                    "account_type": profile_data.get("account_type"),
                    "media_count": profile_data.get("media_count", 0),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            return InstagramProfile(
                ig_user_id=profile_data.get("id", connection["ig_user_id"]),
                username=profile_data.get("username", connection["ig_username"]),
                account_type=profile_data.get("account_type"),
                media_count=profile_data.get("media_count"),
                profile_picture_url=profile_data.get("profile_picture_url")
            )
            
    except Exception as e:
        logger.exception(f"Profile fetch error: {e}")
        return InstagramProfile(
            ig_user_id=connection["ig_user_id"],
            username=connection["ig_username"],
            account_type=connection.get("account_type"),
            media_count=connection.get("media_count")
        )
