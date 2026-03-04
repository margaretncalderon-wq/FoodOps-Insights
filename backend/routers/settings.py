"""
Settings router for application-wide configuration
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from models.auth import User
from dependencies import get_current_user
from config import db

settings_router = APIRouter(prefix="/settings", tags=["Settings"])


# ==================== VARIABLE PAY CONFIGURATION ====================

@settings_router.get("/variable-pay-config")
async def get_variable_pay_config(user: User = Depends(get_current_user)):
    """Get variable pay configuration (overtime, commissions, bonuses, incentives)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    config = await db.variable_pay_config.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    if not config:
        # Return defaults
        config = {
            "company_id": company_id,
            "overtime_payment_type": "separate",
            "overtime_payment_day": 5,
            "commission_payment_type": "separate",
            "commission_payment_day": 10,
            "bonus_payment_type": "separate",
            "bonus_payment_day": 5,
            "incentive_payment_type": "separate",
            "incentive_payment_day": 5,
            "separate_payment_frequency": "monthly",
            "require_approval": True,
            "auto_include_approved": False
        }
    
    return config


@settings_router.post("/variable-pay-config")
async def save_variable_pay_config(data: dict, user: User = Depends(get_current_user)):
    """Save variable pay configuration"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    
    config = {
        "company_id": company_id,
        "overtime_payment_type": data.get("overtime_payment_type", "separate"),
        "overtime_payment_day": data.get("overtime_payment_day", 5),
        "commission_payment_type": data.get("commission_payment_type", "separate"),
        "commission_payment_day": data.get("commission_payment_day", 10),
        "bonus_payment_type": data.get("bonus_payment_type", "separate"),
        "bonus_payment_day": data.get("bonus_payment_day", 5),
        "incentive_payment_type": data.get("incentive_payment_type", "separate"),
        "incentive_payment_day": data.get("incentive_payment_day", 5),
        "separate_payment_frequency": data.get("separate_payment_frequency", "monthly"),
        "require_approval": data.get("require_approval", True),
        "auto_include_approved": data.get("auto_include_approved", False),
        "updated_at": now,
        "updated_by": user.user_id
    }
    
    await db.variable_pay_config.update_one(
        {"company_id": company_id},
        {"$set": config},
        upsert=True
    )
    
    return {"message": "Configuration saved", "config": config}
