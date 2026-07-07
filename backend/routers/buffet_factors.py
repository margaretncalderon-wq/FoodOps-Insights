"""
Buffet Consumption Factors — Sprint 1 of Culinary Intelligence Phase 2.

A buffet factor lets caterers say "for this recipe in a buffet, guests consume
X portions on average" — usually <1.0 because of variety. Used to compute a
Projected Event Cost in addition to the theoretical 1.0 portion/guest cost.

Extracted from server.py in the refactor sprint. LOGIC UNCHANGED.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User


buffet_factors_router = APIRouter(prefix="/buffet-factors", tags=["Buffet Factors"])


class BuffetFactorCreate(BaseModel):
    scope_type: str  # "recipe" | "category" | "default"
    scope_id: Optional[str] = None  # recipe_id or category name; null for default
    factor: float  # 0.1 .. 3.0
    applies_to_menu_types: List[str] = ["buffet"]
    notes: Optional[str] = None

    model_config = {"extra": "allow"}


async def _resolve_buffet_factor(recipe: Dict[str, Any], company_id: str, menu_type: str) -> float:
    """Return the effective consumption factor for a recipe in a given menu_type.

    Resolution cascade: recipe-specific → category → default → 1.0.
    Only applies when menu_type is in `applies_to_menu_types` of the factor doc.
    """
    if not menu_type:
        return 1.0

    # 1) Recipe-specific
    rec = await db.buffet_factors.find_one(
        {
            "company_id": company_id,
            "scope_type": "recipe",
            "scope_id": recipe.get("recipe_id"),
            "applies_to_menu_types": menu_type,
        },
        {"_id": 0, "factor": 1},
    )
    if rec and rec.get("factor") is not None:
        return float(rec["factor"])

    # 2) Category
    if recipe.get("category"):
        cat = await db.buffet_factors.find_one(
            {
                "company_id": company_id,
                "scope_type": "category",
                "scope_id": recipe.get("category"),
                "applies_to_menu_types": menu_type,
            },
            {"_id": 0, "factor": 1},
        )
        if cat and cat.get("factor") is not None:
            return float(cat["factor"])

    # 3) Default
    default = await db.buffet_factors.find_one(
        {
            "company_id": company_id,
            "scope_type": "default",
            "applies_to_menu_types": menu_type,
        },
        {"_id": 0, "factor": 1},
    )
    if default and default.get("factor") is not None:
        return float(default["factor"])

    return 1.0


@buffet_factors_router.get("")
async def list_buffet_factors(user: User = Depends(get_current_user)):
    factors = await db.buffet_factors.find(
        {"company_id": user.company_id}, {"_id": 0}
    ).sort([("scope_type", 1), ("scope_id", 1)]).to_list(500)
    return factors


@buffet_factors_router.post("")
async def create_buffet_factor(data: BuffetFactorCreate, user: User = Depends(get_current_user)):
    if data.scope_type not in ("recipe", "category", "default"):
        raise HTTPException(status_code=400, detail="scope_type must be recipe|category|default")
    if data.scope_type != "default" and not data.scope_id:
        raise HTTPException(status_code=400, detail="scope_id required for scope_type != default")
    if data.factor <= 0 or data.factor > 5:
        raise HTTPException(status_code=400, detail="factor must be between 0 and 5")
    if not data.applies_to_menu_types:
        raise HTTPException(status_code=400, detail="applies_to_menu_types cannot be empty")

    now = datetime.now(timezone.utc)
    factor_id = f"bfact_{uuid.uuid4().hex[:12]}"
    doc = {
        "factor_id": factor_id,
        "company_id": user.company_id,
        "scope_type": data.scope_type,
        "scope_id": data.scope_id,
        "factor": float(data.factor),
        "applies_to_menu_types": data.applies_to_menu_types,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id,
    }
    await db.buffet_factors.insert_one(doc)
    doc.pop("_id", None)
    return doc


@buffet_factors_router.put("/{factor_id}")
async def update_buffet_factor(factor_id: str, data: BuffetFactorCreate, user: User = Depends(get_current_user)):
    if data.factor <= 0 or data.factor > 5:
        raise HTTPException(status_code=400, detail="factor must be between 0 and 5")
    now = datetime.now(timezone.utc)
    update = {
        "scope_type": data.scope_type,
        "scope_id": data.scope_id,
        "factor": float(data.factor),
        "applies_to_menu_types": data.applies_to_menu_types,
        "notes": data.notes,
        "updated_at": now.isoformat(),
    }
    result = await db.buffet_factors.update_one(
        {"factor_id": factor_id, "company_id": user.company_id},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Factor not found")
    doc = await db.buffet_factors.find_one(
        {"factor_id": factor_id, "company_id": user.company_id}, {"_id": 0}
    )
    return doc


@buffet_factors_router.delete("/{factor_id}")
async def delete_buffet_factor(factor_id: str, user: User = Depends(get_current_user)):
    result = await db.buffet_factors.delete_one(
        {"factor_id": factor_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Factor not found")
    return {"message": "Deleted", "factor_id": factor_id}
