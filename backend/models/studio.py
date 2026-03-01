# models/studio.py - Tezza-like Studio and Feed models
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ============== BRAND LOOKS (PRESETS) ==============

class LookCategory(str, Enum):
    WARM = "warm"
    CLEAN = "clean"
    MOODY = "moody"
    FOOD = "food"
    VIBRANT = "vibrant"
    MINIMAL = "minimal"
    VINTAGE = "vintage"
    CUSTOM = "custom"


class BrandLookCreate(BaseModel):
    """Create a brand look preset"""
    name: str
    category: str = "custom"
    is_favorite: bool = False
    preview_image_url: Optional[str] = None
    settings_json: Dict[str, Any] = {}  # exposure, contrast, etc.
    brand_id: Optional[str] = None


class BrandLook(BaseModel):
    """Brand look preset model"""
    look_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    name: str
    category: str = "custom"
    is_favorite: bool = False
    preview_image_url: Optional[str] = None
    settings_json: Dict[str, Any] = {}
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


# ============== MEDIA ASSETS ==============

class MediaAssetStatus(str, Enum):
    UPLOADED = "uploaded"
    SELECTED = "selected"
    APPROVED = "approved"
    REJECTED = "rejected"


class MediaAssetCreate(BaseModel):
    """Create a media asset"""
    original_url: str
    type: str = "image"  # image, video
    campaign_id: Optional[str] = None
    metadata_json: Dict[str, Any] = {}
    current_edit_json: Dict[str, Any] = {}  # look_id, sliders, crop
    status: str = "uploaded"


class MediaAsset(BaseModel):
    """Media asset model"""
    asset_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    uploaded_by_user_id: str
    original_url: str
    type: str = "image"
    metadata_json: Dict[str, Any] = {}
    current_edit_json: Dict[str, Any] = {}
    exports_json: List[Dict[str, Any]] = []  # {size, url, created_at}
    status: str = "uploaded"
    created_at: datetime
    updated_at: datetime


class MediaAssetUpdate(BaseModel):
    """Update media asset"""
    current_edit_json: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    exports_json: Optional[List[Dict[str, Any]]] = None


# ============== INSTAGRAM CONNECTION ==============

class InstagramConnectionStatus(str, Enum):
    CONNECTED = "connected"
    ERROR = "error"
    RECONNECT_REQUIRED = "reconnect_required"
    DISCONNECTED = "disconnected"


class InstagramConnectionCreate(BaseModel):
    """Create Instagram connection"""
    ig_user_id: str
    ig_username: str
    page_id: Optional[str] = None
    access_token: str  # Will be encrypted before storage
    token_expires_at: Optional[datetime] = None
    brand_id: Optional[str] = None


class InstagramConnection(BaseModel):
    """Instagram connection model"""
    connection_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    connected_by_user_id: str
    ig_user_id: str
    ig_username: str
    page_id: Optional[str] = None
    status: str = "connected"
    last_sync_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# ============== INSTAGRAM MEDIA CACHE ==============

class InstagramMediaCache(BaseModel):
    """Cached Instagram published media"""
    cache_id: str
    connection_id: str
    tenant_id: str
    ig_media_id: str
    media_type: str  # IMAGE, VIDEO, CAROUSEL_ALBUM
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    timestamp: datetime
    permalink: str
    raw_json: Dict[str, Any] = {}
    synced_at: datetime


# ============== EXPORT SETTINGS ==============

class ExportSize(str, Enum):
    SQUARE = "1:1"
    PORTRAIT = "4:5"
    STORY = "9:16"
    LANDSCAPE = "16:9"


class ExportPackCreate(BaseModel):
    """Create export pack"""
    asset_id: str
    sizes: List[str] = ["1:1", "4:5", "9:16"]
    include_landscape: bool = False


# ============== FEATURE FLAGS ==============

class StudioFeatureFlags(BaseModel):
    """Feature flags for studio features"""
    enable_tezza_studio: bool = False
    enable_feed_view: bool = False
    enable_instagram_connect: bool = False


# Default studio slider values
DEFAULT_SLIDER_VALUES = {
    "exposure": 0,
    "contrast": 0,
    "highlights": 0,
    "shadows": 0,
    "temperature": 0,
    "saturation": 0,
    "grain": 0,
    "sharpen": 0,
    "vignette": 0,
    "glow": 0
}

# Default brand looks presets
DEFAULT_LOOKS = [
    {
        "name": "Natural",
        "category": "clean",
        "settings_json": {"exposure": 5, "contrast": 5, "highlights": -10, "shadows": 10, "saturation": 5}
    },
    {
        "name": "Warm Glow",
        "category": "warm",
        "settings_json": {"exposure": 10, "temperature": 15, "contrast": 10, "saturation": 10, "glow": 5}
    },
    {
        "name": "Cool Crisp",
        "category": "clean",
        "settings_json": {"exposure": 5, "temperature": -10, "contrast": 15, "highlights": 5, "sharpen": 10}
    },
    {
        "name": "Moody Dark",
        "category": "moody",
        "settings_json": {"exposure": -10, "contrast": 20, "highlights": -20, "shadows": -10, "vignette": 15}
    },
    {
        "name": "Food Pop",
        "category": "food",
        "settings_json": {"exposure": 10, "contrast": 15, "saturation": 20, "temperature": 5, "sharpen": 5}
    },
    {
        "name": "Vintage Film",
        "category": "vintage",
        "settings_json": {"exposure": 5, "contrast": -5, "highlights": -10, "grain": 20, "saturation": -10}
    },
    {
        "name": "High Contrast",
        "category": "vibrant",
        "settings_json": {"exposure": 0, "contrast": 30, "highlights": -15, "shadows": 15, "saturation": 15}
    },
    {
        "name": "Soft Minimal",
        "category": "minimal",
        "settings_json": {"exposure": 10, "contrast": -10, "highlights": 5, "shadows": 10, "saturation": -5}
    }
]
