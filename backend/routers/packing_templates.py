"""
Sprint F — Packing List Templates by Event Type
================================================
A packing template captures a *recipe* for what equipment/disposables an event
of a given type needs, expressed as **ratios per guest** with a minimum.

Example:
  Template "Buffet Francés" for 65 guests:
    - Bandeja dorada: 1 por cada 15 invitados, min 4  → ceil(65/15) = 5 bandejas
    - Servilletas:    2 por cada 1 invitado, min 100  → 130 servilletas
    - Mesa buffet:    1 por cada 30 invitados, min 1  → 3 mesas

Apply-time behavior:
  POST /api/packing-templates/{template_id}/apply?event_id=...  →
    computes suggested_qty per item and returns the payload to preview.
    (Actual reservation still goes through /api/inventory/reserve so guards apply.)
"""
from typing import List, Optional
from math import ceil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
import uuid
import shutil

from dependencies import get_current_user
from models.auth import User
from config import db, UPLOADS_DIR

packing_templates_router = APIRouter(prefix="/packing-templates", tags=["Packing Templates"])


class TemplateItem(BaseModel):
    inventory_item_id: str
    item_name: Optional[str] = None
    per_guests: float = Field(gt=0, description="How many guests one unit covers (e.g., 15 = 1 unit per 15 guests)")
    minimum_qty: float = 0
    notes: Optional[str] = None


class PackingTemplateCreate(BaseModel):
    name: str
    event_type: str  # buffet, brunch_box, picadera, brand_moment, etc.
    description: Optional[str] = None
    # Pre-setup photos so ops staff know how the layout should look when the
    # manager isn't on-site. Simple list of URLs (served via /api/uploads/*).
    # Uploaded through POST /packing-templates/{id}/photos.
    setup_photos: List[str] = []
    items: List[TemplateItem] = []


class PackingTemplateUpdate(BaseModel):
    name: Optional[str] = None
    event_type: Optional[str] = None
    description: Optional[str] = None
    setup_photos: Optional[List[str]] = None
    items: Optional[List[TemplateItem]] = None


def _sanitize(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@packing_templates_router.get("")
async def list_templates(event_type: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {"company_id": user.company_id}
    if event_type:
        q["event_type"] = event_type
    docs = await db.packing_templates.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return docs


@packing_templates_router.get("/{template_id}")
async def get_template(template_id: str, user: User = Depends(get_current_user)):
    doc = await db.packing_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return doc


@packing_templates_router.post("")
async def create_template(data: PackingTemplateCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = {
        "template_id": f"pkt_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "name": data.name,
        "event_type": data.event_type,
        "description": data.description,
        "setup_photos": list(data.setup_photos or []),
        "items": [i.model_dump() for i in data.items],
        "created_at": now.isoformat(),
        "created_by": user.user_id,
        "updated_at": now.isoformat(),
    }
    await db.packing_templates.insert_one(doc)
    return _sanitize(doc)


@packing_templates_router.put("/{template_id}")
async def update_template(template_id: str, data: PackingTemplateUpdate, user: User = Depends(get_current_user)):
    existing = await db.packing_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        updates["name"] = data.name
    if data.event_type is not None:
        updates["event_type"] = data.event_type
    if data.description is not None:
        updates["description"] = data.description
    if data.setup_photos is not None:
        updates["setup_photos"] = list(data.setup_photos)
    if data.items is not None:
        updates["items"] = [i.model_dump() for i in data.items]

    await db.packing_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id}, {"$set": updates}
    )
    return {"ok": True, "template_id": template_id}


@packing_templates_router.delete("/{template_id}")
async def delete_template(template_id: str, user: User = Depends(get_current_user)):
    r = await db.packing_templates.delete_one(
        {"template_id": template_id, "company_id": user.company_id}
    )
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


_ALLOWED_IMG_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}


@packing_templates_router.post("/{template_id}/photos")
async def upload_template_photo(
    template_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Attach a pre-setup photo to a packing template. Multiple photos are
    supported — each call appends to `setup_photos`. Ops staff see these
    photos on the delivery note so they know how to lay out the space
    even when the account manager isn't on-site.
    """
    tmpl = await db.packing_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0, "setup_photos": 1},
    )
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if file.content_type not in _ALLOWED_IMG_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG/PNG/WebP/GIF/HEIC")

    ext = (file.filename or "").split(".")[-1].lower() if "." in (file.filename or "") else "jpg"
    ext = ext if ext.isalnum() and len(ext) <= 5 else "jpg"
    filename = f"tpl_{template_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    photo_url = f"/api/uploads/{filename}"

    existing = list((tmpl or {}).get("setup_photos") or [])
    if len(existing) >= 10:
        raise HTTPException(status_code=400, detail="Max 10 photos per template")
    existing.append(photo_url)
    await db.packing_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": {"setup_photos": existing, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"photo_url": photo_url, "setup_photos": existing}


@packing_templates_router.delete("/{template_id}/photos")
async def remove_template_photo(
    template_id: str,
    photo_url: str,
    user: User = Depends(get_current_user),
):
    """Remove a photo from a template. `photo_url` must match exactly the
    stored URL (client passes it back). Also cleans the on-disk file if it
    belongs to this template — leaves it alone if the URL points elsewhere
    (defensive; someone may have manually linked an external image)."""
    tmpl = await db.packing_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0, "setup_photos": 1},
    )
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    existing = list((tmpl or {}).get("setup_photos") or [])
    new_photos = [p for p in existing if p != photo_url]
    await db.packing_templates.update_one(
        {"template_id": template_id, "company_id": user.company_id},
        {"$set": {"setup_photos": new_photos, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Best-effort file cleanup: only unlink if it's a local upload we own.
    if photo_url.startswith("/api/uploads/") and f"tpl_{template_id}_" in photo_url:
        try:
            (UPLOADS_DIR / photo_url.split("/")[-1]).unlink(missing_ok=True)
        except Exception:
            pass
    return {"setup_photos": new_photos}


@packing_templates_router.post("/{template_id}/preview")
async def preview_template(template_id: str, data: dict, user: User = Depends(get_current_user)):
    """Compute suggested qty per item without saving anything.

    Body: { event_id: str }  or  { guest_count: int, event_id?: str }
    Returns per-item suggested_qty enriched with current stock.
    """
    tmpl = await db.packing_templates.find_one(
        {"template_id": template_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    guest_count = data.get("guest_count")
    event_id = data.get("event_id")
    event = None
    if event_id:
        event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
        if event and (guest_count is None):
            guest_count = event.get("guest_count") or event.get("expected_guests") or 0

    if not guest_count or guest_count <= 0:
        raise HTTPException(status_code=400, detail="guest_count required (either in body or on the event)")

    # Load current stock in one shot
    item_ids = [t["inventory_item_id"] for t in (tmpl.get("items") or [])]
    ings = await db.ingredients.find(
        {"ingredient_id": {"$in": item_ids}, "company_id": user.company_id},
        {"_id": 0}
    ).to_list(len(item_ids)) if item_ids else []
    ings_map = {i["ingredient_id"]: i for i in ings}

    suggestions = []
    for t in tmpl.get("items", []):
        per_g = float(t.get("per_guests") or 1)
        min_q = float(t.get("minimum_qty") or 0)
        suggested = max(ceil(guest_count / per_g), min_q)
        ing = ings_map.get(t["inventory_item_id"], {})
        current_stock = float(ing.get("stock_quantity") or 0)
        current_reserved = float(ing.get("reserved_quantity") or 0)
        available = max(current_stock - current_reserved, 0)
        suggestions.append({
            "inventory_item_id": t["inventory_item_id"],
            "item_name": t.get("item_name") or ing.get("name", ""),
            "unit": ing.get("unit", "unit"),
            "per_guests": per_g,
            "minimum_qty": min_q,
            "suggested_qty": int(suggested) if suggested == int(suggested) else suggested,
            "current_stock": current_stock,
            "available": available,
            "would_overbook": suggested > available,
            "origin": ing.get("origin", "Propio"),
            "cost_per_unit": ing.get("cost_per_unit", 0),
            "rental_cost_per_unit_day": ing.get("rental_cost_per_unit_day", 0),
            "notes": t.get("notes"),
        })

    return {
        "template_id": template_id,
        "template_name": tmpl.get("name"),
        "guest_count": guest_count,
        "event_id": event_id,
        "event_name": (event or {}).get("event_name") or (event or {}).get("name"),
        "setup_photos": list(tmpl.get("setup_photos") or []),
        "items": suggestions,
    }


@packing_templates_router.post("/{template_id}/apply")
async def apply_template(template_id: str, data: dict, user: User = Depends(get_current_user)):
    """Preview + reserve in one call. Uses /reserve internally so all Sprint E
    conflict guards apply.

    Body: { event_id: str, guest_count?: int, allow_overbook?: bool }
    """
    event_id = data.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    preview = await preview_template(
        template_id,
        {"event_id": event_id, "guest_count": data.get("guest_count")},
        user,
    )
    # Import here to reuse the guarded reservation logic
    from routers.inventory import reserve_inventory

    reserve_payload = {
        "event_ids": [event_id],
        "events": [{"event_id": event_id, "event_name": preview.get("event_name") or ""}],
        "items": [
            {
                "inventory_item_id": s["inventory_item_id"],
                "qty_needed": s["suggested_qty"],
                "name": s["item_name"],
            }
            for s in preview["items"]
            if s["suggested_qty"] > 0
        ],
        "allow_overbook": bool(data.get("allow_overbook", False)),
    }
    result = await reserve_inventory(reserve_payload, user)
    result["template_id"] = template_id
    result["template_name"] = preview.get("template_name")
    # Propagate the pre-setup photos so any downstream flow (e.g. auto-creating
    # a delivery note from an application) can display them without a
    # second round-trip to fetch the template again.
    result["setup_photos"] = preview.get("setup_photos") or []
    result["preview_items"] = preview["items"]
    return result


# ---------- Seed helper (idempotent) ----------
DEFAULT_SEED = [
    {
        "name": "Buffet Francés",
        "event_type": "buffet",
        "description": "Setup estándar para servicio buffet con estaciones frías/calientes",
        "seed_items": [
            {"item_name": "Bandeja Dorada Redonda", "per_guests": 15, "minimum_qty": 4},
            {"item_name": "Mesa Buffet", "per_guests": 30, "minimum_qty": 1},
            {"item_name": "Chafing Dish", "per_guests": 20, "minimum_qty": 2},
            {"item_name": "Servilleta de Tela", "per_guests": 1, "minimum_qty": 20},
        ],
    },
    {
        "name": "Brunch Box",
        "event_type": "brunch_box",
        "description": "Servicio individual empacado por persona",
        "seed_items": [
            {"item_name": "Caja Brunch", "per_guests": 1, "minimum_qty": 10},
            {"item_name": "Servilleta Papel", "per_guests": 1, "minimum_qty": 20},
            {"item_name": "Cubiertos Desechables Set", "per_guests": 1, "minimum_qty": 20},
        ],
    },
    {
        "name": "Picadera",
        "event_type": "picadera",
        "description": "Coctel de pasabocas — bandejas circulando",
        "seed_items": [
            {"item_name": "Bandeja Plateada Redonda", "per_guests": 10, "minimum_qty": 4},
            {"item_name": "Servilleta de Coctel", "per_guests": 3, "minimum_qty": 60},
            {"item_name": "Copa de Vino", "per_guests": 2, "minimum_qty": 30},
        ],
    },
    {
        "name": "Brand Moment",
        "event_type": "brand_moment",
        "description": "Activación de marca con setup de foto/experiencia",
        "seed_items": [
            {"item_name": "Mesa Coctel", "per_guests": 20, "minimum_qty": 2},
            {"item_name": "Bandeja Dorada Redonda", "per_guests": 15, "minimum_qty": 3},
        ],
    },
]


@packing_templates_router.post("/seed-defaults")
async def seed_default_templates(user: User = Depends(get_current_user)):
    """Create the 4 default templates for the tenant (idempotent).

    Attempts to bind each seed item to an existing inventory item by name
    (case-insensitive). Items without a match are still saved with a
    placeholder inventory_item_id starting with "unmatched:" so the user can
    remap them later.
    """
    now = datetime.now(timezone.utc)
    created = 0
    skipped = 0
    for spec in DEFAULT_SEED:
        exists = await db.packing_templates.find_one(
            {"company_id": user.company_id, "name": spec["name"]},
            {"_id": 0, "template_id": 1}
        )
        if exists:
            skipped += 1
            continue
        items_out = []
        for si in spec["seed_items"]:
            match = await db.ingredients.find_one(
                {
                    "company_id": user.company_id,
                    "name": {"$regex": f"^{si['item_name']}$", "$options": "i"},
                    "inventory_type": {"$in": ["equipment", "event_supply", "disposable"]},
                },
                {"_id": 0, "ingredient_id": 1, "name": 1}
            )
            items_out.append({
                "inventory_item_id": match["ingredient_id"] if match else f"unmatched:{si['item_name']}",
                "item_name": match["name"] if match else si["item_name"],
                "per_guests": si["per_guests"],
                "minimum_qty": si["minimum_qty"],
                "notes": None,
            })
        await db.packing_templates.insert_one({
            "template_id": f"pkt_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "name": spec["name"],
            "event_type": spec["event_type"],
            "description": spec["description"],
            "items": items_out,
            "created_at": now.isoformat(),
            "created_by": user.user_id,
            "updated_at": now.isoformat(),
        })
        created += 1
    return {"created": created, "skipped_existing": skipped}
