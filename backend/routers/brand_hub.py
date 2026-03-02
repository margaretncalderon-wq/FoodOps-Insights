# routers/brand_hub.py - Brand Hub and Campaign DNA API routes with Token Resolver
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from config import db
from models.auth import User
from models.brand_hub import (
    BrandKitCreate, BrandKit,
    ThemeTokensCreate, ThemeTokens,
    LookPackCreate, LookPack,
    MessagingPackCreate, MessagingPack,
    TemplateCreate, Template,
    PlaybookPageCreate, PlaybookPage,
    CampaignDNACreate, CampaignDNA,
    ResolvedBrandConfig,
    DEFAULT_BRAND_KIT_TOKENS, DEFAULT_MESSAGING, DEFAULT_EXPORT_RULES
)
from models.studio import DEFAULT_LOOKS
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

brand_hub_router = APIRouter(prefix="/brand-hub", tags=["Brand Hub"])


# ============== TOKEN RESOLVER (CRITICAL) ==============

async def resolve_brand_config(
    tenant_id: str,
    brand_id: Optional[str] = None,
    campaign_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Resolve effective configuration by merging brand and campaign levels.
    Campaign overrides brand when both exist.
    """
    # 1. Get brand kit (base)
    brand_kit = None
    if brand_id:
        brand_kit = await db.brand_kits.find_one(
            {"tenant_id": tenant_id, "brand_id": brand_id},
            {"_id": 0}
        )
    if not brand_kit:
        brand_kit = await db.brand_kits.find_one(
            {"tenant_id": tenant_id, "brand_id": None},
            {"_id": 0}
        )
    
    base_tokens = DEFAULT_BRAND_KIT_TOKENS.copy()
    base_logos = {}
    
    if brand_kit:
        base_tokens = deep_merge(base_tokens, brand_kit.get("tokens_json", {}))
        base_logos = brand_kit.get("logos_json", {})
    
    # 2. Get theme token overrides (campaign-level)
    effective_tokens = base_tokens.copy()
    if campaign_id:
        theme_override = await db.theme_tokens.find_one(
            {"tenant_id": tenant_id, "campaign_id": campaign_id},
            {"_id": 0}
        )
        if theme_override and theme_override.get("tokens_json"):
            effective_tokens = deep_merge(effective_tokens, theme_override["tokens_json"])
    
    # 3. Get look pack
    look_pack = None
    default_look_id = None
    campaign_dna = None  # Initialize to avoid UnboundLocalError
    
    # First check campaign DNA for look pack
    if campaign_id:
        campaign_dna = await db.campaign_dna.find_one(
            {"tenant_id": tenant_id, "campaign_id": campaign_id},
            {"_id": 0}
        )
        if campaign_dna:
            default_look_id = campaign_dna.get("default_look_id")
            if campaign_dna.get("look_pack_id"):
                look_pack = await db.look_packs.find_one(
                    {"pack_id": campaign_dna["look_pack_id"]},
                    {"_id": 0}
                )
    
    # Fall back to brand default look pack
    if not look_pack:
        look_pack = await db.look_packs.find_one(
            {"tenant_id": tenant_id, "brand_id": brand_id, "is_default": True},
            {"_id": 0}
        )
    
    # Get looks from pack or all brand looks
    effective_looks = []
    if look_pack and look_pack.get("look_ids"):
        for look_id in look_pack["look_ids"]:
            look = await db.brand_looks.find_one({"look_id": look_id}, {"_id": 0})
            if look:
                effective_looks.append(look)
    else:
        # Get all brand looks
        cursor = db.brand_looks.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).limit(50)
        effective_looks = await cursor.to_list(50)
    
    # Add default looks if no custom looks
    if not effective_looks:
        effective_looks = [
            {**look, "look_id": f"default_{i}", "is_default": True}
            for i, look in enumerate(DEFAULT_LOOKS)
        ]
    
    # 4. Get messaging pack
    messaging_pack = None
    if campaign_id:
        # Check campaign DNA for messaging pack
        if campaign_dna and campaign_dna.get("messaging_pack_id"):
            messaging_pack = await db.messaging_packs.find_one(
                {"pack_id": campaign_dna["messaging_pack_id"]},
                {"_id": 0}
            )
        # Or campaign-specific messaging
        if not messaging_pack:
            messaging_pack = await db.messaging_packs.find_one(
                {"tenant_id": tenant_id, "campaign_id": campaign_id},
                {"_id": 0}
            )
    
    # Fall back to brand messaging
    if not messaging_pack:
        messaging_pack = await db.messaging_packs.find_one(
            {"tenant_id": tenant_id, "brand_id": brand_id, "campaign_id": None},
            {"_id": 0}
        )
    
    effective_messaging = DEFAULT_MESSAGING.copy()
    if messaging_pack:
        effective_messaging = {
            "tone_json": messaging_pack.get("tone_json", DEFAULT_MESSAGING["tone_json"]),
            "hooks_json": messaging_pack.get("hooks_json", DEFAULT_MESSAGING["hooks_json"]),
            "ctas_json": messaging_pack.get("ctas_json", DEFAULT_MESSAGING["ctas_json"]),
            "forbidden_json": messaging_pack.get("forbidden_json", DEFAULT_MESSAGING["forbidden_json"]),
            "blocks_json": messaging_pack.get("blocks_json", [])
        }
    
    # 5. Get templates (campaign overrides brand by type)
    brand_templates = await db.templates.find(
        {"tenant_id": tenant_id, "brand_id": brand_id, "campaign_id": None},
        {"_id": 0}
    ).to_list(100)
    
    campaign_templates = []
    if campaign_id:
        campaign_templates = await db.templates.find(
            {"tenant_id": tenant_id, "campaign_id": campaign_id},
            {"_id": 0}
        ).to_list(100)
    
    # Merge: campaign templates override brand templates by type+name
    templates_map = {f"{t['type']}_{t['name']}": t for t in brand_templates}
    for ct in campaign_templates:
        templates_map[f"{ct['type']}_{ct['name']}"] = ct
    effective_templates = list(templates_map.values())
    
    # 6. Get export rules
    export_rules = DEFAULT_EXPORT_RULES.copy()
    if campaign_dna and campaign_dna.get("export_rules_json"):
        export_rules = deep_merge(export_rules, campaign_dna["export_rules_json"])
    
    return {
        "brand_id": brand_id,
        "campaign_id": campaign_id,
        "effective_tokens": effective_tokens,
        "effective_logos": base_logos,
        "effective_looks": effective_looks,
        "default_look_id": default_look_id,
        "effective_messaging": effective_messaging,
        "effective_templates": effective_templates,
        "export_rules": export_rules
    }


def deep_merge(base: Dict, override: Dict) -> Dict:
    """Deep merge two dictionaries, override takes precedence"""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


# ============== RESOLVER ENDPOINT ==============

@brand_hub_router.get("/resolve")
async def get_resolved_config(
    brand_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get resolved brand/campaign configuration"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        return ResolvedBrandConfig().dict()
    
    config = await resolve_brand_config(tenant_id, brand_id, campaign_id)
    return config


# ============== BRAND KIT ==============

@brand_hub_router.get("/kits")
async def get_brand_kits(brand_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get brand kits"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        return []
    
    query = {"tenant_id": tenant_id}
    if brand_id:
        query["brand_id"] = brand_id
    
    kits = await db.brand_kits.find(query, {"_id": 0}).to_list(20)
    
    # Return default if none exist
    if not kits:
        return [{
            "kit_id": "default",
            "tenant_id": tenant_id,
            "brand_id": brand_id,
            "tokens_json": DEFAULT_BRAND_KIT_TOKENS,
            "logos_json": {},
            "is_default": True
        }]
    
    return kits


@brand_hub_router.post("/kits")
async def create_brand_kit(data: BrandKitCreate, user: User = Depends(get_current_user)):
    """Create or update brand kit"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    
    # Check if kit exists
    existing = await db.brand_kits.find_one({
        "tenant_id": tenant_id,
        "brand_id": data.brand_id
    })
    
    if existing:
        # Update
        await db.brand_kits.update_one(
            {"kit_id": existing["kit_id"]},
            {"$set": {
                "tokens_json": data.tokens_json,
                "logos_json": data.logos_json,
                "updated_at": now.isoformat()
            }}
        )
        return {**existing, "tokens_json": data.tokens_json, "logos_json": data.logos_json, "_id": None}
    
    # Create
    kit_id = str(uuid.uuid4())
    kit = {
        "kit_id": kit_id,
        "tenant_id": tenant_id,
        "brand_id": data.brand_id,
        "tokens_json": data.tokens_json or DEFAULT_BRAND_KIT_TOKENS,
        "logos_json": data.logos_json or {},
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.brand_kits.insert_one(kit)
    return {k: v for k, v in kit.items() if k != "_id"}


@brand_hub_router.put("/kits/{kit_id}")
async def update_brand_kit(kit_id: str, data: BrandKitCreate, user: User = Depends(get_current_user)):
    """Update brand kit"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    existing = await db.brand_kits.find_one({"kit_id": kit_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Brand kit not found")
    
    now = datetime.now(timezone.utc)
    updates = {
        "tokens_json": data.tokens_json,
        "logos_json": data.logos_json,
        "updated_at": now.isoformat()
    }
    
    await db.brand_kits.update_one({"kit_id": kit_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


# ============== LOOK PACKS ==============

@brand_hub_router.get("/look-packs")
async def get_look_packs(
    brand_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get look packs"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        return []
    
    query = {"tenant_id": tenant_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    elif brand_id:
        query["brand_id"] = brand_id
        query["campaign_id"] = None
    
    packs = await db.look_packs.find(query, {"_id": 0}).to_list(50)
    return packs


@brand_hub_router.post("/look-packs")
async def create_look_pack(data: LookPackCreate, user: User = Depends(get_current_user)):
    """Create look pack"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    pack_id = str(uuid.uuid4())
    
    # If setting as default, unset other defaults
    if data.is_default:
        await db.look_packs.update_many(
            {"tenant_id": tenant_id, "brand_id": data.brand_id, "campaign_id": data.campaign_id},
            {"$set": {"is_default": False}}
        )
    
    pack = {
        "pack_id": pack_id,
        "tenant_id": tenant_id,
        "brand_id": data.brand_id,
        "campaign_id": data.campaign_id,
        "name": data.name,
        "description": data.description,
        "is_default": data.is_default,
        "look_ids": data.look_ids,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.look_packs.insert_one(pack)
    return {k: v for k, v in pack.items() if k != "_id"}


@brand_hub_router.put("/look-packs/{pack_id}")
async def update_look_pack(pack_id: str, data: LookPackCreate, user: User = Depends(get_current_user)):
    """Update look pack"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    existing = await db.look_packs.find_one({"pack_id": pack_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Look pack not found")
    
    now = datetime.now(timezone.utc)
    
    if data.is_default:
        await db.look_packs.update_many(
            {"tenant_id": tenant_id, "brand_id": data.brand_id, "campaign_id": data.campaign_id, "pack_id": {"$ne": pack_id}},
            {"$set": {"is_default": False}}
        )
    
    updates = {
        "name": data.name,
        "description": data.description,
        "is_default": data.is_default,
        "look_ids": data.look_ids,
        "updated_at": now.isoformat()
    }
    
    await db.look_packs.update_one({"pack_id": pack_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


@brand_hub_router.delete("/look-packs/{pack_id}")
async def delete_look_pack(pack_id: str, user: User = Depends(get_current_user)):
    """Delete look pack"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    result = await db.look_packs.delete_one({"pack_id": pack_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Look pack not found")
    return {"success": True}


# ============== MESSAGING PACKS ==============

@brand_hub_router.get("/messaging-packs")
async def get_messaging_packs(
    brand_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get messaging packs"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        return []
    
    query = {"tenant_id": tenant_id}
    if campaign_id:
        query["campaign_id"] = campaign_id
    elif brand_id:
        query["brand_id"] = brand_id
    
    packs = await db.messaging_packs.find(query, {"_id": 0}).to_list(50)
    
    # Return default if none exist
    if not packs:
        return [{
            "pack_id": "default",
            "tenant_id": tenant_id,
            "name": "Default",
            "is_default": True,
            **DEFAULT_MESSAGING
        }]
    
    return packs


@brand_hub_router.post("/messaging-packs")
async def create_messaging_pack(data: MessagingPackCreate, user: User = Depends(get_current_user)):
    """Create messaging pack"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    pack_id = str(uuid.uuid4())
    
    pack = {
        "pack_id": pack_id,
        "tenant_id": tenant_id,
        "brand_id": data.brand_id,
        "campaign_id": data.campaign_id,
        "name": data.name,
        "tone_json": data.tone_json or DEFAULT_MESSAGING["tone_json"],
        "hooks_json": data.hooks_json or DEFAULT_MESSAGING["hooks_json"],
        "ctas_json": data.ctas_json or DEFAULT_MESSAGING["ctas_json"],
        "forbidden_json": data.forbidden_json or DEFAULT_MESSAGING["forbidden_json"],
        "blocks_json": data.blocks_json,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.messaging_packs.insert_one(pack)
    return {k: v for k, v in pack.items() if k != "_id"}


@brand_hub_router.put("/messaging-packs/{pack_id}")
async def update_messaging_pack(pack_id: str, data: MessagingPackCreate, user: User = Depends(get_current_user)):
    """Update messaging pack"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    existing = await db.messaging_packs.find_one({"pack_id": pack_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Messaging pack not found")
    
    now = datetime.now(timezone.utc)
    updates = {
        "name": data.name,
        "tone_json": data.tone_json,
        "hooks_json": data.hooks_json,
        "ctas_json": data.ctas_json,
        "forbidden_json": data.forbidden_json,
        "blocks_json": data.blocks_json,
        "updated_at": now.isoformat()
    }
    
    await db.messaging_packs.update_one({"pack_id": pack_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


# ============== TEMPLATES ==============

# Pre-designed template library
DEFAULT_TEMPLATES = [
    {
        "name": "Post Promocional",
        "name_en": "Promotional Post",
        "type": "social_post",
        "category": "promotion",
        "template_json": {
            "layout": "image_top",
            "aspect_ratio": "1:1",
            "elements": [
                {"type": "image", "position": "top", "height": "60%"},
                {"type": "headline", "font": "heading", "size": "24px", "color": "{{primary}}"},
                {"type": "body", "font": "body", "size": "14px", "color": "{{text}}"},
                {"type": "cta", "style": "button", "bg": "{{accent}}", "color": "#ffffff"}
            ]
        },
        "preview_url": "https://static.prod-images.emergentagent.com/jobs/498de423-fc83-40fd-8ce9-82c36a9c0056/images/e5c392519df042c42835438d4bd44e39dd9bcabb96f215c7e168d117dd276ff0.png",
        "auto_applies_tokens": True
    },
    {
        "name": "Story con CTA",
        "name_en": "Story with CTA",
        "type": "story",
        "category": "engagement",
        "template_json": {
            "layout": "fullscreen",
            "aspect_ratio": "9:16",
            "elements": [
                {"type": "background_image", "position": "full"},
                {"type": "gradient_overlay", "direction": "bottom", "color": "{{primary}}"},
                {"type": "headline", "position": "center", "font": "heading", "size": "32px", "color": "#ffffff"},
                {"type": "swipe_up", "text": "Ver más", "color": "{{accent}}"}
            ]
        },
        "preview_url": "https://static.prod-images.emergentagent.com/jobs/498de423-fc83-40fd-8ce9-82c36a9c0056/images/11747e4499fb2dbc7129fc41837a1450b6fe07b0bb336fba35329cb1fcdcc8be.png",
        "auto_applies_tokens": True
    },
    {
        "name": "Carrusel Producto",
        "name_en": "Product Carousel",
        "type": "carousel",
        "category": "product",
        "template_json": {
            "layout": "slides",
            "aspect_ratio": "4:5",
            "slides": [
                {"type": "cover", "elements": [{"type": "headline"}, {"type": "logo"}]},
                {"type": "product", "elements": [{"type": "image"}, {"type": "title"}, {"type": "price"}]},
                {"type": "cta", "elements": [{"type": "headline"}, {"type": "button"}]}
            ]
        },
        "preview_url": "https://static.prod-images.emergentagent.com/jobs/498de423-fc83-40fd-8ce9-82c36a9c0056/images/c861f2867e210b64a66d62809a5472cbf8bbe353e942bcc8410426823d908f30.png",
        "auto_applies_tokens": True
    },
    {
        "name": "Email Newsletter",
        "name_en": "Newsletter Email",
        "type": "email",
        "category": "newsletter",
        "template_json": {
            "layout": "single_column",
            "sections": [
                {"type": "header", "logo": True, "bg": "{{primary}}"},
                {"type": "hero", "image": True, "headline": True},
                {"type": "content", "columns": 1},
                {"type": "cta_block", "button_bg": "{{accent}}"},
                {"type": "footer", "social_links": True}
            ]
        },
        "preview_url": "https://static.prod-images.emergentagent.com/jobs/498de423-fc83-40fd-8ce9-82c36a9c0056/images/00a9c4222665da2329ee152e1bc2282950b734e40c51dc15ae3c3cc660ae6b5c.png",
        "auto_applies_tokens": True
    },
    {
        "name": "Email Promocional",
        "name_en": "Promotional Email",
        "type": "email",
        "category": "promotion",
        "template_json": {
            "layout": "centered",
            "sections": [
                {"type": "header", "minimal": True},
                {"type": "hero_banner", "full_width": True},
                {"type": "offer_block", "bg": "{{accent}}", "countdown": True},
                {"type": "products_grid", "columns": 2},
                {"type": "cta_button", "size": "large"},
                {"type": "footer"}
            ]
        },
        "preview_url": "https://static.prod-images.emergentagent.com/jobs/498de423-fc83-40fd-8ce9-82c36a9c0056/images/05a74a4b77a38403b0f636e150acc836e64217e0c08fa2613e89de836b0ab494.png",
        "auto_applies_tokens": True
    },
    {
        "name": "Quote Card",
        "name_en": "Quote Card",
        "type": "social_post",
        "category": "engagement",
        "template_json": {
            "layout": "centered",
            "aspect_ratio": "1:1",
            "elements": [
                {"type": "background", "color": "{{surface}}"},
                {"type": "quote_mark", "color": "{{primary}}", "opacity": 0.2},
                {"type": "quote_text", "font": "accent", "size": "20px", "color": "{{text}}"},
                {"type": "author", "font": "body", "size": "14px", "color": "{{text_muted}}"}
            ]
        },
        "preview_url": "https://static.prod-images.emergentagent.com/jobs/498de423-fc83-40fd-8ce9-82c36a9c0056/images/7e618e4a1bb9844d087587b14332805eae6161a0a81d442f7ee8bf73cfe73ba5.png",
        "auto_applies_tokens": True
    }
]


@brand_hub_router.get("/templates/library")
async def get_template_library(user: User = Depends(get_current_user)):
    """Get pre-designed template library"""
    return DEFAULT_TEMPLATES


@brand_hub_router.post("/templates/seed-defaults")
async def seed_default_templates(user: User = Depends(get_current_user)):
    """Seed default templates for the organization"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    created = []
    updated = []
    
    for tpl in DEFAULT_TEMPLATES:
        # Check if already exists
        existing = await db.templates.find_one({
            "tenant_id": tenant_id,
            "name": tpl["name"],
            "type": tpl["type"]
        })
        
        if existing:
            # Update existing template with preview_url if missing
            if not existing.get("preview_url") and tpl.get("preview_url"):
                await db.templates.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "preview_url": tpl.get("preview_url"),
                        "template_json": tpl["template_json"],
                        "updated_at": now.isoformat()
                    }}
                )
                updated.append(tpl["name"])
        else:
            template_id = str(uuid.uuid4())
            template = {
                "template_id": template_id,
                "tenant_id": tenant_id,
                "brand_id": None,
                "campaign_id": None,
                "name": tpl["name"],
                "type": tpl["type"],
                "category": tpl.get("category"),
                "template_json": tpl["template_json"],
                "preview_url": tpl.get("preview_url"),
                "auto_applies_tokens": tpl.get("auto_applies_tokens", True),
                "is_default": True,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            await db.templates.insert_one(template)
            created.append(tpl["name"])
    
    return {"created": created, "updated": updated, "count": len(created) + len(updated)}


@brand_hub_router.get("/templates")
async def get_templates(
    brand_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get templates"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        return []
    
    query = {"tenant_id": tenant_id}
    if campaign_id:
        query["$or"] = [
            {"campaign_id": campaign_id},
            {"brand_id": brand_id, "campaign_id": None}
        ]
    elif brand_id:
        query["brand_id"] = brand_id
    if type:
        query["type"] = type
    
    templates = await db.templates.find(query, {"_id": 0}).to_list(100)
    return templates


@brand_hub_router.post("/templates")
async def create_template(data: TemplateCreate, user: User = Depends(get_current_user)):
    """Create template"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    template_id = str(uuid.uuid4())
    
    template = {
        "template_id": template_id,
        "tenant_id": tenant_id,
        "brand_id": data.brand_id,
        "campaign_id": data.campaign_id,
        "name": data.name,
        "type": data.type,
        "template_json": data.template_json,
        "preview_url": data.preview_url,
        "auto_applies_tokens": data.auto_applies_tokens,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.templates.insert_one(template)
    return {k: v for k, v in template.items() if k != "_id"}


@brand_hub_router.put("/templates/{template_id}")
async def update_template(template_id: str, data: TemplateCreate, user: User = Depends(get_current_user)):
    """Update template"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    existing = await db.templates.find_one({"template_id": template_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    
    now = datetime.now(timezone.utc)
    updates = {
        "name": data.name,
        "type": data.type,
        "template_json": data.template_json,
        "preview_url": data.preview_url,
        "auto_applies_tokens": data.auto_applies_tokens,
        "updated_at": now.isoformat()
    }
    
    await db.templates.update_one({"template_id": template_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


@brand_hub_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: User = Depends(get_current_user)):
    """Delete template"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    result = await db.templates.delete_one({"template_id": template_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}


# ============== PLAYBOOK PAGES ==============

@brand_hub_router.get("/playbooks")
async def get_playbook_pages(
    brand_id: Optional[str] = None,
    search: Optional[str] = None,
    pinned_only: bool = False,
    user: User = Depends(get_current_user)
):
    """Get playbook pages"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        return []
    
    query = {"tenant_id": tenant_id}
    if brand_id:
        query["brand_id"] = brand_id
    if pinned_only:
        query["pinned"] = True
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"tags": {"$in": [search]}}
        ]
    
    pages = await db.playbook_pages.find(query, {"_id": 0}).sort([("pinned", -1), ("updated_at", -1)]).to_list(100)
    return pages


@brand_hub_router.post("/playbooks")
async def create_playbook_page(data: PlaybookPageCreate, user: User = Depends(get_current_user)):
    """Create playbook page"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    page_id = str(uuid.uuid4())
    
    page = {
        "page_id": page_id,
        "tenant_id": tenant_id,
        "brand_id": data.brand_id,
        "title": data.title,
        "content_rich_json": data.content_rich_json,
        "pinned": data.pinned,
        "tags": data.tags,
        "attachments_json": data.attachments_json,
        "created_by_user_id": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.playbook_pages.insert_one(page)
    return {k: v for k, v in page.items() if k != "_id"}


@brand_hub_router.get("/playbooks/{page_id}")
async def get_playbook_page(page_id: str, user: User = Depends(get_current_user)):
    """Get single playbook page"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    page = await db.playbook_pages.find_one({"page_id": page_id, "tenant_id": tenant_id}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Playbook page not found")
    return page


@brand_hub_router.put("/playbooks/{page_id}")
async def update_playbook_page(page_id: str, data: PlaybookPageCreate, user: User = Depends(get_current_user)):
    """Update playbook page"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    existing = await db.playbook_pages.find_one({"page_id": page_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Playbook page not found")
    
    now = datetime.now(timezone.utc)
    updates = {
        "title": data.title,
        "content_rich_json": data.content_rich_json,
        "pinned": data.pinned,
        "tags": data.tags,
        "attachments_json": data.attachments_json,
        "updated_at": now.isoformat()
    }
    
    await db.playbook_pages.update_one({"page_id": page_id}, {"$set": updates})
    return {**existing, **updates, "_id": None}


@brand_hub_router.delete("/playbooks/{page_id}")
async def delete_playbook_page(page_id: str, user: User = Depends(get_current_user)):
    """Delete playbook page"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    result = await db.playbook_pages.delete_one({"page_id": page_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playbook page not found")
    return {"success": True}


@brand_hub_router.post("/playbooks/{page_id}/pin")
async def toggle_playbook_pin(page_id: str, user: User = Depends(get_current_user)):
    """Toggle playbook page pin status"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    page = await db.playbook_pages.find_one({"page_id": page_id, "tenant_id": tenant_id})
    if not page:
        raise HTTPException(status_code=404, detail="Playbook page not found")
    
    new_pinned = not page.get("pinned", False)
    await db.playbook_pages.update_one(
        {"page_id": page_id},
        {"$set": {"pinned": new_pinned, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"pinned": new_pinned}


# ============== CAMPAIGN DNA ==============

@brand_hub_router.get("/campaign-dna/{campaign_id}")
async def get_campaign_dna(campaign_id: str, user: User = Depends(get_current_user)):
    """Get campaign DNA"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    dna = await db.campaign_dna.find_one(
        {"tenant_id": tenant_id, "campaign_id": campaign_id},
        {"_id": 0}
    )
    
    if not dna:
        # Return default DNA structure
        return {
            "dna_id": None,
            "campaign_id": campaign_id,
            "theme_overrides_json": {},
            "default_look_id": None,
            "look_pack_id": None,
            "messaging_pack_id": None,
            "export_rules_json": DEFAULT_EXPORT_RULES,
            "is_default": True
        }
    
    return dna


@brand_hub_router.post("/campaign-dna")
async def create_campaign_dna(data: CampaignDNACreate, user: User = Depends(get_current_user)):
    """Create or update campaign DNA"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    now = datetime.now(timezone.utc)
    
    # Check if DNA exists
    existing = await db.campaign_dna.find_one({
        "tenant_id": tenant_id,
        "campaign_id": data.campaign_id
    })
    
    if existing:
        # Update
        updates = {
            "theme_overrides_json": data.theme_overrides_json,
            "default_look_id": data.default_look_id,
            "look_pack_id": data.look_pack_id,
            "messaging_pack_id": data.messaging_pack_id,
            "export_rules_json": data.export_rules_json,
            "updated_at": now.isoformat()
        }
        await db.campaign_dna.update_one({"dna_id": existing["dna_id"]}, {"$set": updates})
        return {**existing, **updates, "_id": None}
    
    # Create
    dna_id = str(uuid.uuid4())
    dna = {
        "dna_id": dna_id,
        "tenant_id": tenant_id,
        "campaign_id": data.campaign_id,
        "theme_overrides_json": data.theme_overrides_json,
        "default_look_id": data.default_look_id,
        "look_pack_id": data.look_pack_id,
        "messaging_pack_id": data.messaging_pack_id,
        "export_rules_json": data.export_rules_json or DEFAULT_EXPORT_RULES,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.campaign_dna.insert_one(dna)
    return {k: v for k, v in dna.items() if k != "_id"}


@brand_hub_router.put("/campaign-dna/{campaign_id}")
async def update_campaign_dna(campaign_id: str, data: CampaignDNACreate, user: User = Depends(get_current_user)):
    """Update campaign DNA"""
    tenant_id = user.company_id or user.active_org_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="No organization found")
    
    # Ensure data campaign_id matches
    data.campaign_id = campaign_id
    return await create_campaign_dna(data, user)
