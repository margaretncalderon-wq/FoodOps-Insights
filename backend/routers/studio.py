# routers/studio.py - Tezza-like Studio and Feed API routes
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os
import logging

from config import db, UPLOADS_DIR
from models.auth import User
from models.studio import (
    BrandLookCreate, BrandLook,
    MediaAssetCreate, MediaAsset, MediaAssetUpdate,
    InstagramConnectionCreate, InstagramConnection,
    InstagramMediaCache,
    StudioFeatureFlags,
    DEFAULT_LOOKS, DEFAULT_SLIDER_VALUES
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

studio_router = APIRouter(prefix="/studio", tags=["Studio"])


# ============== FEATURE FLAGS ==============

@studio_router.get("/feature-flags")
async def get_feature_flags(user: User = Depends(get_current_user)):
    """Get studio feature flags for organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return StudioFeatureFlags().dict()
    
    # Check org config for feature flags
    org = await db.organizations.find_one({"organization_id": company_id}, {"_id": 0})
    if not org:
        return StudioFeatureFlags().dict()
    
    features = org.get("studio_features", {})
    return {
        "enable_tezza_studio": features.get("enable_tezza_studio", True),  # Default enabled for demo
        "enable_feed_view": features.get("enable_feed_view", True),
        "enable_instagram_connect": features.get("enable_instagram_connect", True)
    }


@studio_router.put("/feature-flags")
async def update_feature_flags(flags: StudioFeatureFlags, user: User = Depends(get_current_user)):
    """Update studio feature flags (Admin/Owner only)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Check permissions
    membership = await db.memberships.find_one({
        "user_id": user.user_id,
        "organization_id": company_id
    })
    if not membership or membership.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.organizations.update_one(
        {"organization_id": company_id},
        {"$set": {"studio_features": flags.dict()}}
    )
    return flags.dict()


# ============== BRAND LOOKS (PRESETS) ==============

@studio_router.get("/looks")
async def get_looks(brand_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all brand looks including defaults"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        # Return default looks for users without org
        return [
            {**look, "look_id": f"default_{i}", "is_default": True}
            for i, look in enumerate(DEFAULT_LOOKS)
        ]
    
    query = {"tenant_id": company_id}
    if brand_id:
        query["brand_id"] = brand_id
    
    custom_looks = await db.brand_looks.find(query, {"_id": 0}).to_list(100)
    
    # Add default looks with is_default flag
    defaults = [
        {**look, "look_id": f"default_{i}", "is_default": True, "tenant_id": company_id}
        for i, look in enumerate(DEFAULT_LOOKS)
    ]
    
    # Custom looks first, then defaults
    all_looks = custom_looks + defaults
    return all_looks


@studio_router.post("/looks")
async def create_look(data: BrandLookCreate, user: User = Depends(get_current_user)):
    """Create a custom brand look"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    look_id = str(uuid.uuid4())
    
    look = {
        "look_id": look_id,
        "tenant_id": company_id,
        "brand_id": data.brand_id,
        "name": data.name,
        "category": data.category,
        "is_favorite": data.is_favorite,
        "preview_image_url": data.preview_image_url,
        "settings_json": data.settings_json,
        "created_by_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.brand_looks.insert_one(look)
    return {k: v for k, v in look.items() if k != "_id"}


@studio_router.put("/looks/{look_id}")
async def update_look(look_id: str, data: BrandLookCreate, user: User = Depends(get_current_user)):
    """Update a brand look"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    if look_id.startswith("default_"):
        raise HTTPException(status_code=400, detail="Cannot edit default looks")
    
    existing = await db.brand_looks.find_one({"look_id": look_id, "tenant_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Look not found")
    
    now = datetime.now(timezone.utc)
    updates = {
        "name": data.name,
        "category": data.category,
        "is_favorite": data.is_favorite,
        "preview_image_url": data.preview_image_url,
        "settings_json": data.settings_json,
        "updated_at": now.isoformat()
    }
    
    await db.brand_looks.update_one({"look_id": look_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


@studio_router.delete("/looks/{look_id}")
async def delete_look(look_id: str, user: User = Depends(get_current_user)):
    """Delete a brand look"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    if look_id.startswith("default_"):
        raise HTTPException(status_code=400, detail="Cannot delete default looks")
    
    result = await db.brand_looks.delete_one({"look_id": look_id, "tenant_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Look not found")
    return {"success": True}


@studio_router.post("/looks/{look_id}/favorite")
async def toggle_favorite(look_id: str, user: User = Depends(get_current_user)):
    """Toggle a look as favorite"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    look = await db.brand_looks.find_one({"look_id": look_id, "tenant_id": company_id})
    if not look:
        raise HTTPException(status_code=404, detail="Look not found")
    
    new_fav = not look.get("is_favorite", False)
    await db.brand_looks.update_one(
        {"look_id": look_id},
        {"$set": {"is_favorite": new_fav, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"is_favorite": new_fav}


# ============== MEDIA ASSETS ==============

@studio_router.get("/assets")
async def get_assets(
    campaign_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get media assets"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    query = {"tenant_id": company_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if status:
        query["status"] = status
    
    assets = await db.media_assets.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return assets


@studio_router.post("/assets")
async def create_asset(data: MediaAssetCreate, user: User = Depends(get_current_user)):
    """Create a media asset record"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    asset_id = str(uuid.uuid4())
    
    asset = {
        "asset_id": asset_id,
        "tenant_id": company_id,
        "brand_id": None,
        "campaign_id": data.campaign_id,
        "uploaded_by_user_id": user.user_id,
        "original_url": data.original_url,
        "type": data.type,
        "metadata_json": data.metadata_json,
        "current_edit_json": data.current_edit_json or {"sliders": DEFAULT_SLIDER_VALUES},
        "exports_json": [],
        "status": data.status,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.media_assets.insert_one(asset)
    return {k: v for k, v in asset.items() if k != "_id"}


@studio_router.post("/assets/upload")
async def upload_asset(
    file: UploadFile = File(...),
    campaign_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Upload a media file and create asset record"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File type not allowed")
    
    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    _filename = f"studio_{uuid.uuid4().hex[:16]}.{ext}"
    
    try:
        _content = await file.read()
        from utils.local_upload import save_bytes as _save
        _save(UPLOADS_DIR / _filename, _content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    filename = _filename
    filepath = UPLOADS_DIR / filename
    
    file_url = f"/api/uploads/{filename}"
    media_type = "video" if file.content_type.startswith("video/") else "image"
    
    # Create asset record
    now = datetime.now(timezone.utc)
    asset_id = str(uuid.uuid4())
    
    asset = {
        "asset_id": asset_id,
        "tenant_id": company_id,
        "brand_id": None,
        "campaign_id": campaign_id,
        "uploaded_by_user_id": user.user_id,
        "original_url": file_url,
        "type": media_type,
        "metadata_json": {
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size": len(_content)
        },
        "current_edit_json": {"sliders": DEFAULT_SLIDER_VALUES},
        "exports_json": [],
        "status": "uploaded",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.media_assets.insert_one(asset)
    return {k: v for k, v in asset.items() if k != "_id"}


@studio_router.get("/assets/{asset_id}")
async def get_asset(asset_id: str, user: User = Depends(get_current_user)):
    """Get a specific media asset"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    asset = await db.media_assets.find_one({"asset_id": asset_id, "tenant_id": company_id}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@studio_router.put("/assets/{asset_id}")
async def update_asset(asset_id: str, data: MediaAssetUpdate, user: User = Depends(get_current_user)):
    """Update a media asset (edits, status, exports)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    existing = await db.media_assets.find_one({"asset_id": asset_id, "tenant_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.current_edit_json is not None:
        updates["current_edit_json"] = data.current_edit_json
    if data.status is not None:
        updates["status"] = data.status
    if data.exports_json is not None:
        updates["exports_json"] = data.exports_json
    
    await db.media_assets.update_one({"asset_id": asset_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


@studio_router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user: User = Depends(get_current_user)):
    """Delete a media asset"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    result = await db.media_assets.delete_one({"asset_id": asset_id, "tenant_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"success": True}


@studio_router.post("/assets/{asset_id}/export")
async def add_export(
    asset_id: str, 
    size: str = "1:1",
    export_url: str = "",
    user: User = Depends(get_current_user)
):
    """Add an export variant to asset"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    asset = await db.media_assets.find_one({"asset_id": asset_id, "tenant_id": company_id})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    exports = asset.get("exports_json", [])
    exports.append({
        "size": size,
        "url": export_url,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    await db.media_assets.update_one(
        {"asset_id": asset_id},
        {"$set": {"exports_json": exports, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"exports_json": exports}


# ============== INSTAGRAM CONNECTION ==============

@studio_router.get("/instagram/connection")
async def get_instagram_connection(user: User = Depends(get_current_user)):
    """Get Instagram connection status"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return {"connected": False}
    
    connection = await db.instagram_connections.find_one(
        {"tenant_id": company_id, "status": {"$ne": "disconnected"}},
        {"_id": 0, "access_token_encrypted": 0}
    )
    
    if not connection:
        return {"connected": False}
    
    return {
        "connected": connection.get("status") == "connected",
        "connection": connection
    }


@studio_router.post("/instagram/connect")
async def connect_instagram(data: InstagramConnectionCreate, user: User = Depends(get_current_user)):
    """Store Instagram connection (after OAuth)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Check permissions - first check user's role directly, then membership
    user_role = user.role
    if not user_role:
        membership = await db.memberships.find_one({
            "user_id": user.user_id,
            "organization_id": company_id
        })
        user_role = membership.get("role") if membership else None
    
    if user_role not in ["owner", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin or Manager access required")
    
    now = datetime.now(timezone.utc)
    connection_id = str(uuid.uuid4())
    
    # Simple encryption placeholder - in production use proper encryption
    import base64
    access_token_encrypted = base64.b64encode(data.access_token.encode()).decode()
    
    connection = {
        "connection_id": connection_id,
        "tenant_id": company_id,
        "brand_id": data.brand_id,
        "connected_by_user_id": user.user_id,
        "ig_user_id": data.ig_user_id,
        "ig_username": data.ig_username,
        "page_id": data.page_id,
        "access_token_encrypted": access_token_encrypted,
        "token_expires_at": data.token_expires_at.isoformat() if data.token_expires_at else None,
        "status": "connected",
        "last_sync_at": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # Disconnect existing connections first
    await db.instagram_connections.update_many(
        {"tenant_id": company_id},
        {"$set": {"status": "disconnected"}}
    )
    
    await db.instagram_connections.insert_one(connection)
    
    # Return without encrypted token
    del connection["access_token_encrypted"]
    return {k: v for k, v in connection.items() if k != "_id"}


@studio_router.delete("/instagram/disconnect")
async def disconnect_instagram(user: User = Depends(get_current_user)):
    """Disconnect Instagram"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    await db.instagram_connections.update_many(
        {"tenant_id": company_id},
        {"$set": {"status": "disconnected", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


# ============== INSTAGRAM MEDIA CACHE ==============

@studio_router.get("/instagram/media")
async def get_instagram_media(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get cached Instagram media"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    connection = await db.instagram_connections.find_one(
        {"tenant_id": company_id, "status": "connected"}
    )
    if not connection:
        return []
    
    media = await db.instagram_media_cache.find(
        {"tenant_id": company_id, "connection_id": connection["connection_id"]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return media


@studio_router.post("/instagram/sync")
async def sync_instagram_media(user: User = Depends(get_current_user)):
    """Trigger Instagram media sync (placeholder for actual API call)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    connection = await db.instagram_connections.find_one(
        {"tenant_id": company_id, "status": "connected"}
    )
    if not connection:
        raise HTTPException(status_code=400, detail="Instagram not connected")
    
    # For MVP, we'll create mock data to demonstrate the UI
    # In production, this would call the Instagram Graph API
    now = datetime.now(timezone.utc)
    
    # Update last sync timestamp
    await db.instagram_connections.update_one(
        {"connection_id": connection["connection_id"]},
        {"$set": {"last_sync_at": now.isoformat()}}
    )
    
    return {
        "success": True,
        "message": "Sync initiated",
        "last_sync_at": now.isoformat()
    }


# ============== FEED HELPER: GET PLANNED POSTS ==============

@studio_router.get("/feed/planned")
async def get_planned_posts(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get planned/scheduled posts from Kora's social media queue"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    # Get posts that are scheduled or drafted (not posted) - include all pipeline statuses
    posts = await db.social_posts.find(
        {
            "company_id": company_id,
            "status": {"$nin": ["posted", "archived"]}
        },
        {"_id": 0}
    ).sort("scheduled_at", 1).limit(limit).to_list(limit)
    
    # Enrich with account info
    for post in posts:
        if post.get("social_account_id"):
            account = await db.social_accounts.find_one(
                {"account_id": post["social_account_id"]},
                {"_id": 0, "platform": 1, "handle": 1}
            )
            post["account"] = account
        
        # Add any linked media assets
        if post.get("post_id"):
            assets = await db.media_assets.find(
                {"post_id": post["post_id"], "tenant_id": company_id},
                {"_id": 0}
            ).to_list(10)
            post["media_assets"] = assets
    
    return posts


@studio_router.get("/feed/mixed")
async def get_mixed_feed(
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get mixed feed: published + planned posts interleaved by date"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    # Get planned posts
    planned = await db.social_posts.find(
        {
            "company_id": company_id,
            "status": {"$in": ["scheduled", "drafted"]}
        },
        {"_id": 0}
    ).to_list(limit)
    
    for post in planned:
        post["feed_type"] = "planned"
        post["feed_date"] = post.get("scheduled_at") or post.get("created_at")
    
    # Get published from Instagram cache
    connection = await db.instagram_connections.find_one(
        {"tenant_id": company_id, "status": "connected"}
    )
    
    published = []
    if connection:
        ig_media = await db.instagram_media_cache.find(
            {"tenant_id": company_id, "connection_id": connection["connection_id"]},
            {"_id": 0}
        ).limit(limit).to_list(limit)
        
        for media in ig_media:
            media["feed_type"] = "published"
            media["feed_date"] = media.get("timestamp")
        published = ig_media
    
    # Also get posted posts from Kora
    kora_posted = await db.social_posts.find(
        {"company_id": company_id, "status": "posted"},
        {"_id": 0}
    ).to_list(limit)
    
    for post in kora_posted:
        post["feed_type"] = "published"
        post["feed_date"] = post.get("posted_at") or post.get("scheduled_at")
    
    # Combine and sort by date
    all_items = planned + published + kora_posted
    
    def get_sort_date(item):
        date_str = item.get("feed_date")
        if not date_str:
            return datetime.min
        if isinstance(date_str, str):
            try:
                return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except Exception:
                return datetime.min
        return date_str
    
    all_items.sort(key=get_sort_date, reverse=True)
    return all_items[:limit]
