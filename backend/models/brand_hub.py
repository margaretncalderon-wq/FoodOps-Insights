# models/brand_hub.py - Brand Hub and Campaign DNA models
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ============== BRAND KIT ==============

class BrandKitCreate(BaseModel):
    """Create/Update brand kit"""
    brand_id: Optional[str] = None
    tokens_json: Dict[str, Any] = {}  # colors, typography, etc.
    logos_json: Dict[str, Any] = {}  # primary, secondary, icon, etc.


class BrandKit(BaseModel):
    """Brand kit model - source of truth for brand visual identity"""
    kit_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    tokens_json: Dict[str, Any] = {}
    logos_json: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime


# Default brand kit tokens structure
DEFAULT_BRAND_KIT_TOKENS = {
    "colors": {
        "primary": "#6366f1",
        "secondary": "#8b5cf6", 
        "accent": "#f59e0b",
        "background": "#ffffff",
        "surface": "#f8fafc",
        "text": "#1e293b",
        "text_muted": "#64748b"
    },
    "typography": {
        "font_heading": "Inter",
        "font_body": "Inter",
        "font_accent": "Inter"
    },
    "buttons": {
        "radius": "8px",
        "style": "filled"  # filled, outline, ghost
    },
    "spacing": {
        "base": "16px"
    }
}


# ============== THEME TOKENS (CAMPAIGN OVERRIDES) ==============

class ThemeTokensCreate(BaseModel):
    """Create theme tokens override"""
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    tokens_json: Dict[str, Any] = {}


class ThemeTokens(BaseModel):
    """Theme tokens - campaign-level overrides"""
    tokens_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    tokens_json: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime


# ============== LOOK PACKS ==============

class LookPackCreate(BaseModel):
    """Create look pack"""
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    is_default: bool = False
    look_ids: List[str] = []


class LookPack(BaseModel):
    """Look pack - curated collection of looks"""
    pack_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    is_default: bool = False
    look_ids: List[str] = []  # Ordered list of look_ids
    created_at: datetime
    updated_at: datetime


class LookPackItem(BaseModel):
    """Look pack item with sort order"""
    pack_id: str
    look_id: str
    sort_order: int = 0


# ============== MESSAGING PACKS ==============

class MessagingPackCreate(BaseModel):
    """Create messaging pack"""
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str = "Default"
    tone_json: Dict[str, Any] = {}  # voice, style, rules
    hooks_json: List[Dict[str, Any]] = []  # approved hooks
    ctas_json: List[Dict[str, Any]] = []  # approved CTAs
    forbidden_json: List[str] = []  # forbidden phrases
    blocks_json: List[Dict[str, Any]] = []  # copy blocks


class MessagingPack(BaseModel):
    """Messaging pack - approved copy and tone"""
    pack_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str = "Default"
    tone_json: Dict[str, Any] = {}
    hooks_json: List[Dict[str, Any]] = []
    ctas_json: List[Dict[str, Any]] = []
    forbidden_json: List[str] = []
    blocks_json: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime


# Default messaging structure
DEFAULT_MESSAGING = {
    "tone_json": {
        "voice": "Professional yet approachable",
        "style": "Clear and concise",
        "rules": [
            "Use active voice",
            "Keep sentences short",
            "Be specific, not vague"
        ]
    },
    "hooks_json": [
        {"text": "Transform your [X] in just [time]", "category": "transformation"},
        {"text": "The secret to [result] that nobody talks about", "category": "curiosity"},
        {"text": "[Number] ways to [achieve goal]", "category": "list"}
    ],
    "ctas_json": [
        {"text": "Get Started", "type": "primary"},
        {"text": "Learn More", "type": "secondary"},
        {"text": "Book Now", "type": "action"},
        {"text": "Contact Us", "type": "contact"}
    ],
    "forbidden_json": [
        "Guarantee results",
        "Best in the world",
        "Limited time only"
    ]
}


# ============== TEMPLATES ==============

class TemplateType(str, Enum):
    REEL_COVER = "reel_cover"
    STORY_PROMO = "story_promo"
    CAROUSEL_COVER = "carousel_cover"
    QUOTE_TILE = "quote_tile"
    EMAIL_HEADER = "email_header"
    EMAIL_BLOCK = "email_block"
    SOCIAL_POST = "social_post"
    THUMBNAIL = "thumbnail"


class TemplateCreate(BaseModel):
    """Create template"""
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str
    type: str
    template_json: Dict[str, Any] = {}  # layers, positions, etc.
    preview_url: Optional[str] = None
    auto_applies_tokens: bool = True


class Template(BaseModel):
    """Template model"""
    template_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str
    type: str
    template_json: Dict[str, Any] = {}
    preview_url: Optional[str] = None
    auto_applies_tokens: bool = True
    created_at: datetime
    updated_at: datetime


# ============== PLAYBOOK PAGES ==============

class PlaybookPageCreate(BaseModel):
    """Create playbook page"""
    brand_id: Optional[str] = None
    title: str
    content_rich_json: Dict[str, Any] = {}  # Rich text content
    pinned: bool = False
    tags: List[str] = []
    attachments_json: List[Dict[str, Any]] = []


class PlaybookPage(BaseModel):
    """Playbook page - internal docs"""
    page_id: str
    tenant_id: str
    brand_id: Optional[str] = None
    title: str
    content_rich_json: Dict[str, Any] = {}
    pinned: bool = False
    tags: List[str] = []
    attachments_json: List[Dict[str, Any]] = []
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


# ============== CAMPAIGN DNA ==============

class CampaignDNACreate(BaseModel):
    """Create/Update campaign DNA"""
    campaign_id: str
    theme_overrides_json: Dict[str, Any] = {}  # Token overrides
    default_look_id: Optional[str] = None
    look_pack_id: Optional[str] = None
    messaging_pack_id: Optional[str] = None
    export_rules_json: Dict[str, Any] = {}  # sizes, safe zones


class CampaignDNA(BaseModel):
    """Campaign DNA - campaign-level configuration"""
    dna_id: str
    tenant_id: str
    campaign_id: str
    theme_overrides_json: Dict[str, Any] = {}
    default_look_id: Optional[str] = None
    look_pack_id: Optional[str] = None
    messaging_pack_id: Optional[str] = None
    export_rules_json: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime


# Default export rules
DEFAULT_EXPORT_RULES = {
    "sizes": ["1:1", "4:5", "9:16"],
    "include_landscape": False,
    "safe_zones": {
        "9:16": {"top": 250, "bottom": 250},  # Story safe area
        "1:1": {"all": 50}
    },
    "quality": 90
}


# ============== RESOLVED CONFIG (OUTPUT) ==============

class ResolvedBrandConfig(BaseModel):
    """Resolved brand/campaign configuration"""
    brand_id: Optional[str] = None
    campaign_id: Optional[str] = None
    effective_tokens: Dict[str, Any] = {}
    effective_logos: Dict[str, Any] = {}
    effective_looks: List[Dict[str, Any]] = []
    default_look_id: Optional[str] = None
    effective_messaging: Dict[str, Any] = {}
    effective_templates: List[Dict[str, Any]] = []
    export_rules: Dict[str, Any] = {}
