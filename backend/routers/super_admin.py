# routers/super_admin.py - Super Admin Router
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime, timezone
import logging

from config import db
from dependencies import get_current_user, User

logger = logging.getLogger(__name__)

super_admin_router = APIRouter(prefix="/super-admin", tags=["Super Admin"])

# Default pricing
DEFAULT_KORA_CORE_PRICE = 69.00
DEFAULT_MODULE_PRICES = {
    "module_event_suite": 39.00,
    "module_culinary_intelligence": 29.00,
    "module_operations_supplies": 19.00,
    "module_demand_studio": 39.00,
}


class PricingUpdateRequest(BaseModel):
    kora_core_price: Optional[float] = None
    module_prices: Optional[Dict[str, float]] = None


def require_super_admin(user: User):
    """Check if user is super admin"""
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return user


@super_admin_router.get("/pricing")
async def get_pricing_config(user: User = Depends(get_current_user)):
    """Get current pricing configuration"""
    require_super_admin(user)
    
    # Get active config from DB
    config = await db.pricing_config.find_one(
        {"active": True},
        {"_id": 0}
    )
    
    if not config:
        return {
            "kora_core_price": DEFAULT_KORA_CORE_PRICE,
            "module_prices": DEFAULT_MODULE_PRICES,
            "is_default": True
        }
    
    return {
        "kora_core_price": config.get("kora_core_price", DEFAULT_KORA_CORE_PRICE),
        "module_prices": config.get("module_prices", DEFAULT_MODULE_PRICES),
        "is_default": False,
        "created_at": config.get("created_at"),
        "created_by": config.get("created_by")
    }


@super_admin_router.put("/pricing")
async def update_pricing_config(
    data: PricingUpdateRequest,
    user: User = Depends(get_current_user)
):
    """Update pricing configuration (Super Admin only)"""
    require_super_admin(user)
    
    now = datetime.now(timezone.utc)
    
    # Get current config to merge
    current = await db.pricing_config.find_one({"active": True})
    current_kora = current.get("kora_core_price", DEFAULT_KORA_CORE_PRICE) if current else DEFAULT_KORA_CORE_PRICE
    current_modules = current.get("module_prices", DEFAULT_MODULE_PRICES) if current else DEFAULT_MODULE_PRICES
    
    # Merge updates
    new_kora = data.kora_core_price if data.kora_core_price is not None else current_kora
    new_modules = {**current_modules, **(data.module_prices or {})}
    
    # Deactivate previous config
    await db.pricing_config.update_many(
        {"active": True},
        {"$set": {"active": False, "deactivated_at": now.isoformat()}}
    )
    
    # Create new config
    new_config = {
        "kora_core_price": new_kora,
        "module_prices": new_modules,
        "active": True,
        "created_at": now.isoformat(),
        "created_by": user.user_id,
        "created_by_email": user.email
    }
    
    await db.pricing_config.insert_one(new_config)
    
    logger.info(f"Pricing updated by {user.email}: Core=${new_kora}, Modules={new_modules}")
    
    return {
        "success": True,
        "message": "Pricing updated successfully",
        "kora_core_price": new_kora,
        "module_prices": new_modules
    }


@super_admin_router.get("/pricing/history")
async def get_pricing_history(
    limit: int = 10,
    user: User = Depends(get_current_user)
):
    """Get pricing change history"""
    require_super_admin(user)
    
    history = await db.pricing_config.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"history": history}
