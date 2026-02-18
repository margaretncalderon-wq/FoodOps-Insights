# routers/addons.py - Add-on Marketplace Router
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from config import db
from dependencies import get_current_user, User
from models.addons import (
    AddonDefinition, AddonDefinitionCreate,
    OrganizationAddon, OrganizationAddonCreate,
    AddonStatus, AddonType, AddonPricing,
    EffectiveLimits, EffectiveFeatures, AddonUsageLog
)
from utils.activity_logger import log_activity, user_info

addons_router = APIRouter(prefix="/addons", tags=["Add-ons"])


# ============== DEFAULT ADDON DEFINITIONS ==============

DEFAULT_ADDONS = [
    {
        "addon_id": "addon_extra_users_5",
        "name": "extra_users_5",
        "display_name_en": "Extra Users Pack (+5)",
        "display_name_es": "Pack Usuarios Extra (+5)",
        "description_en": "Add 5 additional active users to your organization",
        "description_es": "Añade 5 usuarios activos adicionales a tu organización",
        "type": "limit_boost",
        "pricing": "monthly",
        "price": 15.00,
        "currency": "USD",
        "limit_key": "active_users",
        "limit_increase": 5,
        "is_active": True,
        "sort_order": 1,
        "icon": "users",
        "compatible_plans": ["plan_starter", "plan_professional"],
        "stackable": True,
        "max_quantity": 10
    },
    {
        "addon_id": "addon_extra_events_10",
        "name": "extra_events_10",
        "display_name_en": "Extra Events Pack (+10)",
        "display_name_es": "Pack Eventos Extra (+10)",
        "description_en": "Add 10 additional events per month",
        "description_es": "Añade 10 eventos adicionales por mes",
        "type": "limit_boost",
        "pricing": "monthly",
        "price": 19.00,
        "currency": "USD",
        "limit_key": "events_per_month",
        "limit_increase": 10,
        "is_active": True,
        "sort_order": 2,
        "icon": "calendar",
        "compatible_plans": ["plan_starter", "plan_professional"],
        "stackable": True,
        "max_quantity": 5
    },
    {
        "addon_id": "addon_storage_1gb",
        "name": "storage_1gb",
        "display_name_en": "Extra Storage (+1GB)",
        "display_name_es": "Almacenamiento Extra (+1GB)",
        "description_en": "Add 1GB of additional storage space",
        "description_es": "Añade 1GB de espacio de almacenamiento adicional",
        "type": "limit_boost",
        "pricing": "monthly",
        "price": 5.00,
        "currency": "USD",
        "limit_key": "storage_mb",
        "limit_increase": 1000,
        "is_active": True,
        "sort_order": 3,
        "icon": "hard-drive",
        "compatible_plans": ["plan_starter", "plan_professional"],
        "stackable": True,
        "max_quantity": 10
    },
    {
        "addon_id": "addon_execution_goals_unlimited",
        "name": "execution_goals_unlimited",
        "display_name_en": "Unlimited Execution Goals",
        "display_name_es": "Metas de Ejecución Ilimitadas",
        "description_en": "Remove the limit on execution goals for Starter plan",
        "description_es": "Elimina el límite de metas de ejecución para el plan Inicial",
        "type": "limit_boost",
        "pricing": "monthly",
        "price": 9.00,
        "currency": "USD",
        "limit_key": "execution_goals_per_month",
        "limit_increase": 996,  # 3 + 996 = 999 (unlimited)
        "is_active": True,
        "sort_order": 4,
        "icon": "target",
        "compatible_plans": ["plan_starter"],
        "stackable": False,
        "max_quantity": 1
    },
    {
        "addon_id": "addon_culinary_intelligence",
        "name": "culinary_intelligence",
        "display_name_en": "Culinary Intelligence Module",
        "display_name_es": "Módulo Inteligencia Culinaria",
        "description_en": "Unlock recipes, costing, and food inventory management",
        "description_es": "Desbloquea recetas, costeo e inventario de alimentos",
        "type": "feature",
        "pricing": "monthly",
        "price": 25.00,
        "currency": "USD",
        "feature_key": "culinary_intelligence",
        "is_active": True,
        "sort_order": 5,
        "icon": "utensils",
        "compatible_plans": ["plan_starter"],
        "stackable": False,
        "max_quantity": 1
    },
    {
        "addon_id": "addon_advanced_reports",
        "name": "advanced_reports",
        "display_name_en": "Advanced Reports",
        "display_name_es": "Reportes Avanzados",
        "description_en": "Unlock advanced financial and operational reports",
        "description_es": "Desbloquea reportes financieros y operacionales avanzados",
        "type": "feature",
        "pricing": "monthly",
        "price": 15.00,
        "currency": "USD",
        "feature_key": "advanced_reports",
        "is_active": True,
        "sort_order": 6,
        "icon": "bar-chart-2",
        "compatible_plans": ["plan_starter"],
        "stackable": False,
        "max_quantity": 1
    },
    {
        "addon_id": "addon_priority_support",
        "name": "priority_support",
        "display_name_en": "Priority Support",
        "display_name_es": "Soporte Prioritario",
        "description_en": "Get priority email support with 24h response time",
        "description_es": "Obtén soporte prioritario por email con respuesta en 24h",
        "type": "service",
        "pricing": "monthly",
        "price": 29.00,
        "currency": "USD",
        "feature_key": "priority_support",
        "is_active": True,
        "sort_order": 7,
        "icon": "headphones",
        "compatible_plans": ["plan_starter", "plan_professional"],
        "stackable": False,
        "max_quantity": 1
    },
    {
        "addon_id": "addon_white_label",
        "name": "white_label",
        "display_name_en": "White Label Branding",
        "display_name_es": "Marca Blanca",
        "description_en": "Remove Kora branding and use your own logo and colors",
        "description_es": "Elimina la marca Kora y usa tu propio logo y colores",
        "type": "feature",
        "pricing": "monthly",
        "price": 49.00,
        "currency": "USD",
        "feature_key": "white_label",
        "is_active": True,
        "sort_order": 8,
        "icon": "palette",
        "compatible_plans": ["plan_starter", "plan_professional"],
        "stackable": False,
        "max_quantity": 1
    }
]


# ============== INITIALIZATION ==============

async def ensure_default_addons():
    """Ensure default addon definitions exist in database"""
    for addon_data in DEFAULT_ADDONS:
        existing = await db.addon_definitions.find_one({"addon_id": addon_data["addon_id"]})
        if not existing:
            await db.addon_definitions.insert_one(addon_data)


# ============== MARKETPLACE (Public) ==============

@addons_router.get("/marketplace")
async def get_addon_marketplace(user: User = Depends(get_current_user)):
    """Get all available add-ons for the current organization's plan"""
    # Get organization's current plan
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0, "plan_id": 1}
    )
    current_plan_id = subscription.get("plan_id", "plan_starter") if subscription else "plan_starter"
    
    # Get all active addons
    addons = await db.addon_definitions.find(
        {"is_active": True},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    
    # Filter by compatible plans
    compatible_addons = []
    for addon in addons:
        compatible_plans = addon.get("compatible_plans", [])
        if not compatible_plans or current_plan_id in compatible_plans:
            compatible_addons.append(addon)
    
    # Get organization's current addons to show which are already purchased
    org_addons = await db.organization_addons.find(
        {"company_id": user.company_id, "status": "active"},
        {"_id": 0, "addon_id": 1, "quantity": 1}
    ).to_list(50)
    
    purchased_map = {a["addon_id"]: a.get("quantity", 1) for a in org_addons}
    
    # Mark purchased addons
    for addon in compatible_addons:
        addon["is_purchased"] = addon["addon_id"] in purchased_map
        addon["purchased_quantity"] = purchased_map.get(addon["addon_id"], 0)
    
    return {
        "current_plan": current_plan_id,
        "addons": compatible_addons
    }


@addons_router.get("/definitions")
async def get_addon_definitions(user: User = Depends(get_current_user)):
    """Get all addon definitions (admin view)"""
    addons = await db.addon_definitions.find(
        {},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    return addons


# ============== ORGANIZATION ADDONS ==============

@addons_router.get("/organization")
async def get_organization_addons(user: User = Depends(get_current_user)):
    """Get all addons purchased by the organization"""
    addons = await db.organization_addons.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("purchased_at", -1).to_list(100)
    return addons


@addons_router.post("/purchase")
async def purchase_addon(
    data: OrganizationAddonCreate,
    user: User = Depends(get_current_user)
):
    """Purchase an add-on for the organization"""
    # Get addon definition
    addon_def = await db.addon_definitions.find_one(
        {"addon_id": data.addon_id, "is_active": True},
        {"_id": 0}
    )
    
    if not addon_def:
        raise HTTPException(status_code=404, detail="Add-on no encontrado")
    
    # Check plan compatibility
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0, "plan_id": 1}
    )
    current_plan_id = subscription.get("plan_id", "plan_starter") if subscription else "plan_starter"
    
    compatible_plans = addon_def.get("compatible_plans", [])
    if compatible_plans and current_plan_id not in compatible_plans:
        raise HTTPException(status_code=400, detail="Este add-on no es compatible con tu plan actual")
    
    # Check if already purchased (for non-stackable addons)
    existing = await db.organization_addons.find_one({
        "company_id": user.company_id,
        "addon_id": data.addon_id,
        "status": "active"
    })
    
    if existing and not addon_def.get("stackable", False):
        raise HTTPException(status_code=400, detail="Ya tienes este add-on activo")
    
    # Check max quantity
    total_quantity = (existing.get("quantity", 0) if existing else 0) + data.quantity
    if total_quantity > addon_def.get("max_quantity", 1):
        raise HTTPException(
            status_code=400, 
            detail=f"Cantidad máxima permitida: {addon_def.get('max_quantity', 1)}"
        )
    
    now = datetime.now(timezone.utc)
    
    # Calculate billing dates for recurring addons
    billing_cycle_start = None
    billing_cycle_end = None
    next_billing_date = None
    expires_at = None
    
    pricing_type = addon_def.get("pricing", "monthly")
    
    if pricing_type == "monthly":
        billing_cycle_start = now
        billing_cycle_end = now + timedelta(days=30)
        next_billing_date = billing_cycle_end
    elif pricing_type == "yearly":
        billing_cycle_start = now
        billing_cycle_end = now + timedelta(days=365)
        next_billing_date = billing_cycle_end
    elif pricing_type == "one_time":
        # No recurring billing
        pass
    
    # Create or update organization addon
    if existing and addon_def.get("stackable", False):
        # Update quantity for stackable addon
        await db.organization_addons.update_one(
            {"org_addon_id": existing["org_addon_id"]},
            {
                "$inc": {"quantity": data.quantity},
                "$set": {"updated_at": now.isoformat()}
            }
        )
        return await db.organization_addons.find_one(
            {"org_addon_id": existing["org_addon_id"]},
            {"_id": 0}
        )
    else:
        # Create new addon purchase
        org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
        
        org_addon_doc = {
            "org_addon_id": org_addon_id,
            "company_id": user.company_id,
            "addon_id": data.addon_id,
            "addon_name": addon_def.get("display_name_es", addon_def.get("name")),
            "addon_type": addon_def.get("type"),
            "status": "active",
            "quantity": data.quantity,
            "price_paid": addon_def.get("price", 0) * data.quantity,
            "pricing_type": pricing_type,
            "currency": addon_def.get("currency", "USD"),
            "billing_cycle_start": billing_cycle_start.isoformat() if billing_cycle_start else None,
            "billing_cycle_end": billing_cycle_end.isoformat() if billing_cycle_end else None,
            "next_billing_date": next_billing_date.isoformat() if next_billing_date else None,
            "auto_renew": True,
            "credits_remaining": addon_def.get("credits_amount"),
            "purchased_by": user.user_id,
            "purchased_at": now.isoformat(),
            "expires_at": expires_at
        }
        
        await db.organization_addons.insert_one(org_addon_doc)
        del org_addon_doc["_id"]
        
        return org_addon_doc


@addons_router.delete("/{org_addon_id}")
async def cancel_addon(org_addon_id: str, user: User = Depends(get_current_user)):
    """Cancel an active addon subscription"""
    org_addon = await db.organization_addons.find_one({
        "org_addon_id": org_addon_id,
        "company_id": user.company_id
    })
    
    if not org_addon:
        raise HTTPException(status_code=404, detail="Add-on no encontrado")
    
    if org_addon.get("status") != "active":
        raise HTTPException(status_code=400, detail="Este add-on no está activo")
    
    now = datetime.now(timezone.utc)
    
    await db.organization_addons.update_one(
        {"org_addon_id": org_addon_id},
        {
            "$set": {
                "status": "canceled",
                "auto_renew": False,
                "canceled_at": now.isoformat()
            }
        }
    )
    
    return {"message": "Add-on cancelado. Permanecerá activo hasta el fin del período de facturación."}


# ============== EFFECTIVE LIMITS & FEATURES ==============

@addons_router.get("/effective-limits")
async def get_effective_limits(user: User = Depends(get_current_user)):
    """Get the effective limits for the organization (base plan + addons)"""
    # Get base plan limits
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0, "plan_id": 1}
    )
    plan_id = subscription.get("plan_id", "plan_starter") if subscription else "plan_starter"
    
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0, "limits": 1})
    base_limits = plan.get("limits", {}) if plan else {}
    
    # Start with base limits
    effective = {
        "events_per_month": base_limits.get("events_per_month", 10),
        "active_users": base_limits.get("active_users", 3),
        "supplier_invoices_per_month": base_limits.get("supplier_invoices_per_month", 50),
        "storage_mb": base_limits.get("storage_mb", 500),
        "proposals_per_month": base_limits.get("proposals_per_month", 20),
        "execution_goals_per_month": base_limits.get("execution_goals_per_month", 3),
        "boosts_applied": []
    }
    
    # Get active limit boost addons
    limit_addons = await db.organization_addons.find({
        "company_id": user.company_id,
        "status": "active",
        "addon_type": "limit_boost"
    }, {"_id": 0}).to_list(50)
    
    # Get addon definitions for limit keys
    for org_addon in limit_addons:
        addon_def = await db.addon_definitions.find_one(
            {"addon_id": org_addon["addon_id"]},
            {"_id": 0, "limit_key": 1, "limit_increase": 1, "display_name_es": 1}
        )
        if addon_def and addon_def.get("limit_key"):
            limit_key = addon_def["limit_key"]
            increase = addon_def.get("limit_increase", 0) * org_addon.get("quantity", 1)
            if limit_key in effective:
                effective[limit_key] += increase
                effective["boosts_applied"].append(addon_def.get("display_name_es", org_addon["addon_id"]))
    
    return effective


@addons_router.get("/effective-features")
async def get_effective_features(user: User = Depends(get_current_user)):
    """Get the effective features for the organization (base plan + addons)"""
    # Get base plan features
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0, "plan_id": 1}
    )
    plan_id = subscription.get("plan_id", "plan_starter") if subscription else "plan_starter"
    
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0, "features": 1})
    base_features = plan.get("features", {}) if plan else {}
    
    # Start with base features
    effective = {
        "business_clarity": base_features.get("business_clarity", True),
        "culinary_intelligence": base_features.get("culinary_intelligence", False),
        "advanced_reports": base_features.get("advanced_reports", False),
        "api_access": base_features.get("api_access", False),
        "white_label": base_features.get("white_label", False),
        "priority_support": base_features.get("priority_support", False),
        "execution_hub": base_features.get("execution_hub", True),
        "addons_applied": []
    }
    
    # Get active feature addons
    feature_addons = await db.organization_addons.find({
        "company_id": user.company_id,
        "status": "active",
        "addon_type": {"$in": ["feature", "service"]}
    }, {"_id": 0}).to_list(50)
    
    # Get addon definitions for feature keys
    for org_addon in feature_addons:
        addon_def = await db.addon_definitions.find_one(
            {"addon_id": org_addon["addon_id"]},
            {"_id": 0, "feature_key": 1, "display_name_es": 1}
        )
        if addon_def and addon_def.get("feature_key"):
            feature_key = addon_def["feature_key"]
            if feature_key in effective:
                effective[feature_key] = True
                effective["addons_applied"].append(addon_def.get("display_name_es", org_addon["addon_id"]))
    
    return effective


# ============== COMBINED SUBSCRIPTION INFO ==============

@addons_router.get("/subscription-summary")
async def get_subscription_summary(user: User = Depends(get_current_user)):
    """Get complete subscription summary including plan, limits, features, and addons"""
    # Get subscription
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0}
    )
    
    plan_id = subscription.get("plan_id", "plan_starter") if subscription else "plan_starter"
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    
    # Get effective limits and features (includes addons)
    effective_limits = await get_effective_limits(user)
    effective_features = await get_effective_features(user)
    
    # Get active addons
    active_addons = await db.organization_addons.find(
        {"company_id": user.company_id, "status": "active"},
        {"_id": 0}
    ).to_list(50)
    
    # Calculate total addon cost
    monthly_addon_cost = sum(
        a.get("price_paid", 0) 
        for a in active_addons 
        if a.get("pricing_type") == "monthly"
    )
    
    return {
        "plan": plan,
        "subscription": subscription,
        "effective_limits": effective_limits,
        "effective_features": effective_features,
        "active_addons": active_addons,
        "monthly_addon_cost": monthly_addon_cost,
        "total_monthly_cost": (plan.get("price_monthly", 0) if plan else 0) + monthly_addon_cost
    }
