# routers/payments.py - Stripe Payments Router
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import uuid
import os
import logging

from config import db
from dependencies import get_current_user, User
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse, 
    CheckoutStatusResponse, CheckoutSessionRequest
)
from utils.activity_logger import log_activity, user_info

logger = logging.getLogger(__name__)

payments_router = APIRouter(prefix="/payments", tags=["Payments"])

# Stripe API Key
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")

# ============== PRICING CONFIGURATION ==============
# Kora Core (required subscription)
KORA_CORE_PRICE = 69.00  # Monthly subscription

# Kora Core includes these modules (no extra charge)
KORA_CORE_MODULES = [
    "module_system_pulse",
    "module_execution_hub", 
    "module_client_engagement",
    "module_business_clarity",
]

# Add-on module prices (monthly, in USD)
MODULE_PRICES = {
    "module_event_suite": 39.00,  # Event Orchestration + Venues combined
    "module_culinary_intelligence": 29.00,
    "module_operations_supplies": 19.00,
    "module_demand_studio": 39.00,
}

# Module display names
MODULE_NAMES = {
    "module_event_suite": "Event Suite",
    "module_culinary_intelligence": "Culinary Intelligence",
    "module_operations_supplies": "Operations Supplies",
    "module_demand_studio": "Demand Studio",
}

# Module key aliases (map old/sub-module keys to billing keys)
MODULE_KEY_ALIASES = {
    "module_event_orchestration": "module_event_suite",
    "module_venues": "module_event_suite",
}

# Trial period in days
TRIAL_PERIOD_DAYS = 7


# ============== MODELS ==============

class CreateCheckoutRequest(BaseModel):
    """Request to create a checkout session for subscription"""
    origin_url: str = Field(..., description="Frontend origin URL")
    selected_modules: List[str] = Field(default=[], description="List of module keys")
    industry_template: Optional[str] = None


class AddAddonCheckoutRequest(BaseModel):
    """Request to add an addon to existing subscription"""
    origin_url: str = Field(..., description="Frontend origin URL")
    addon_key: str = Field(..., description="Module key to add")


class PaymentTransaction(BaseModel):
    """Payment transaction record"""
    transaction_id: str
    company_id: str
    user_id: str
    user_email: str
    session_id: str
    amount: float
    currency: str
    payment_type: str  # "subscription" or "addon"
    modules: List[str]
    payment_status: str  # "pending", "paid", "failed", "expired"
    metadata: Dict
    created_at: str
    updated_at: str


# ============== HELPER FUNCTIONS ==============

def calculate_subscription_total(selected_modules: List[str], include_core: bool = True) -> float:
    """Calculate total subscription amount based on selected modules"""
    total = KORA_CORE_PRICE if include_core else 0.0
    counted_modules = set()  # Avoid double-counting aliased modules
    
    for module_key in selected_modules:
        # Resolve alias if exists
        billing_key = MODULE_KEY_ALIASES.get(module_key, module_key)
        
        if billing_key in MODULE_PRICES and billing_key not in counted_modules:
            total += MODULE_PRICES[billing_key]
            counted_modules.add(billing_key)
    
    return round(total, 2)


async def get_dynamic_prices():
    """Get prices from database if configured, otherwise use defaults"""
    try:
        config = await db.pricing_config.find_one({"active": True}, {"_id": 0})
        if config:
            return {
                "kora_core": config.get("kora_core_price", KORA_CORE_PRICE),
                "modules": config.get("module_prices", MODULE_PRICES)
            }
    except Exception:
        pass
    return {"kora_core": KORA_CORE_PRICE, "modules": MODULE_PRICES}


def get_stripe_checkout(host_url: str) -> StripeCheckout:
    """Initialize Stripe checkout with webhook URL"""
    webhook_url = f"{host_url}api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)


# ============== SUBSCRIPTION CHECKOUT ==============

@payments_router.post("/create-subscription-checkout")
async def create_subscription_checkout(
    data: CreateCheckoutRequest,
    user: User = Depends(get_current_user)
):
    """
    Create a Stripe checkout session for new subscription.
    All subscriptions include Kora Core ($69) + optional add-ons.
    7-day trial applies to everything.
    """
    # Get dynamic prices (from DB or defaults)
    prices = await get_dynamic_prices()
    
    # Calculate amount: Kora Core + selected add-ons
    amount = prices["kora_core"]
    for module_key in data.selected_modules:
        if module_key in prices["modules"]:
            amount += prices["modules"][module_key]
    amount = round(amount, 2)
    
    # Build description
    module_names = [MODULE_NAMES.get(m, m) for m in data.selected_modules if m in MODULE_PRICES]
    if module_names:
        description = f"Kora Core + {', '.join(module_names)}"
    else:
        description = "Kora Core"
    
    # Generate URLs dynamically from frontend origin
    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment/cancel"
    
    # Metadata for tracking
    metadata = {
        "company_id": user.company_id,
        "user_id": user.user_id,
        "user_email": user.email,
        "payment_type": "subscription",
        "modules": ",".join(data.selected_modules),
        "industry_template": data.industry_template or "events_hospitality",
        "description": description
    }
    
    try:
        # Initialize Stripe
        stripe_checkout = get_stripe_checkout(origin + "/")
        
        # Create checkout session
        checkout_request = CheckoutSessionRequest(
            amount=amount,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata
        )
        
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Create pending payment transaction BEFORE redirect
        now = datetime.now(timezone.utc)
        transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
        
        transaction_doc = {
            "transaction_id": transaction_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_email": user.email,
            "session_id": session.session_id,
            "amount": amount,
            "currency": "USD",
            "payment_type": "subscription",
            "modules": data.selected_modules,
            "industry_template": data.industry_template,
            "payment_status": "pending",
            "metadata": metadata,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.payment_transactions.insert_one(transaction_doc)
        
        logger.info(f"Created checkout session {session.session_id} for user {user.email}, amount ${amount}")
        
        return {
            "success": True,
            "checkout_url": session.url,
            "session_id": session.session_id,
            "amount": amount,
            "modules": data.selected_modules
        }
        
    except Exception as e:
        logger.error(f"Failed to create checkout session: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating payment session: {str(e)}")


@payments_router.post("/add-addon-checkout")
async def add_addon_checkout(
    data: AddAddonCheckoutRequest,
    user: User = Depends(get_current_user)
):
    """
    Create a Stripe checkout session to add a single addon to existing subscription.
    """
    # Validate addon exists
    if data.addon_key not in MODULE_PRICES:
        raise HTTPException(status_code=400, detail="Invalid addon module")
    
    # Check if already has this module
    existing_addons = await db.organization_addons.find_one({
        "company_id": user.company_id,
        "addon_id": f"addon_{data.addon_key}",
        "status": "active"
    })
    
    if existing_addons:
        raise HTTPException(status_code=400, detail="You already have this addon active")
    
    amount = MODULE_PRICES[data.addon_key]
    module_name = MODULE_NAMES.get(data.addon_key, data.addon_key)
    
    # Generate URLs
    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/payment/addon-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/settings?tab=addons"
    
    metadata = {
        "company_id": user.company_id,
        "user_id": user.user_id,
        "user_email": user.email,
        "payment_type": "addon",
        "addon_key": data.addon_key,
        "addon_name": module_name
    }
    
    try:
        stripe_checkout = get_stripe_checkout(origin + "/")
        
        checkout_request = CheckoutSessionRequest(
            amount=amount,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata
        )
        
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Create pending transaction
        now = datetime.now(timezone.utc)
        transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
        
        transaction_doc = {
            "transaction_id": transaction_id,
            "company_id": user.company_id,
            "user_id": user.user_id,
            "user_email": user.email,
            "session_id": session.session_id,
            "amount": amount,
            "currency": "USD",
            "payment_type": "addon",
            "modules": [data.addon_key],
            "payment_status": "pending",
            "metadata": metadata,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.payment_transactions.insert_one(transaction_doc)
        
        return {
            "success": True,
            "checkout_url": session.url,
            "session_id": session.session_id,
            "amount": amount,
            "addon": data.addon_key
        }
        
    except Exception as e:
        logger.error(f"Failed to create addon checkout: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating payment session: {str(e)}")


# ============== PAYMENT STATUS ==============

@payments_router.get("/status/{session_id}")
async def get_payment_status(
    session_id: str,
    user: User = Depends(get_current_user)
):
    """
    Check payment status and update transaction record.
    Frontend should poll this after returning from Stripe.
    """
    # Find transaction
    transaction = await db.payment_transactions.find_one({
        "session_id": session_id,
        "company_id": user.company_id
    })
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment transaction not found")
    
    # If already processed, return cached status
    if transaction.get("payment_status") in ["paid", "failed"]:
        return {
            "status": transaction.get("payment_status"),
            "payment_status": transaction.get("payment_status"),
            "amount": transaction.get("amount"),
            "modules": transaction.get("modules", [])
        }
    
    try:
        # Get status from Stripe
        origin = "https://kora-erp-fixes.preview.emergentagent.com/"
        stripe_checkout = get_stripe_checkout(origin)
        
        checkout_status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        now = datetime.now(timezone.utc)
        new_status = "pending"
        
        if checkout_status.payment_status == "paid":
            new_status = "paid"
        elif checkout_status.status == "expired":
            new_status = "expired"
        elif checkout_status.status == "complete" and checkout_status.payment_status == "paid":
            new_status = "paid"
        
        # Update transaction status
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": new_status,
                "stripe_status": checkout_status.status,
                "updated_at": now.isoformat()
            }}
        )
        
        # If payment successful, activate modules
        if new_status == "paid" and not transaction.get("modules_activated"):
            await activate_purchased_modules(
                company_id=transaction.get("company_id"),
                user_id=transaction.get("user_id"),
                modules=transaction.get("modules", []),
                payment_type=transaction.get("payment_type"),
                session_id=session_id
            )
            
            # Mark as activated to prevent double processing
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"modules_activated": True}}
            )
        
        return {
            "status": new_status,
            "payment_status": checkout_status.payment_status,
            "amount": checkout_status.amount_total / 100,  # Stripe returns cents
            "currency": checkout_status.currency,
            "modules": transaction.get("modules", [])
        }
        
    except Exception as e:
        logger.error(f"Error checking payment status: {e}")
        raise HTTPException(status_code=500, detail="Error checking payment status")


async def activate_purchased_modules(
    company_id: str,
    user_id: str,
    modules: List[str],
    payment_type: str,
    session_id: str
):
    """Activate purchased modules for the organization"""
    now = datetime.now(timezone.utc)
    billing_end = now + timedelta(days=30)
    
    for module_key in modules:
        if module_key not in MODULE_PRICES:
            continue
            
        addon_id = f"addon_{module_key}"
        org_addon_id = f"orgaddon_{uuid.uuid4().hex[:12]}"
        
        # Check if already exists
        existing = await db.organization_addons.find_one({
            "company_id": company_id,
            "addon_id": addon_id,
            "status": "active"
        })
        
        if existing:
            logger.info(f"Module {module_key} already active for company {company_id}")
            continue
        
        # Create organization addon record
        addon_doc = {
            "org_addon_id": org_addon_id,
            "company_id": company_id,
            "addon_id": addon_id,
            "addon_name": MODULE_NAMES.get(module_key, module_key),
            "addon_type": "module",
            "status": "active",
            "quantity": 1,
            "price_paid": MODULE_PRICES[module_key],
            "pricing_type": "monthly",
            "currency": "USD",
            "billing_cycle_start": now.isoformat(),
            "billing_cycle_end": billing_end.isoformat(),
            "next_billing_date": billing_end.isoformat(),
            "auto_renew": True,
            "stripe_session_id": session_id,
            "purchased_by": user_id,
            "purchased_at": now.isoformat()
        }
        
        await db.organization_addons.insert_one(addon_doc)
        
        logger.info(f"Activated module {module_key} for company {company_id}")
    
    # Create subscription record if it's a new subscription
    if payment_type == "subscription":
        subscription_id = f"sub_{uuid.uuid4().hex[:12]}"
        
        subscription_doc = {
            "subscription_id": subscription_id,
            "company_id": company_id,
            "plan_id": "plan_starter",
            "status": "active",
            "modules": modules,
            "monthly_amount": calculate_subscription_total(modules),
            "currency": "USD",
            "billing_cycle_start": now.isoformat(),
            "billing_cycle_end": billing_end.isoformat(),
            "next_billing_date": billing_end.isoformat(),
            "stripe_session_id": session_id,
            "created_by": user_id,
            "created_at": now.isoformat()
        }
        
        await db.subscriptions.insert_one(subscription_doc)


# ============== STRIPE WEBHOOK ==============

@payments_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        origin = "https://kora-erp-fixes.preview.emergentagent.com/"
        stripe_checkout = get_stripe_checkout(origin)
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        logger.info(f"Webhook received: {webhook_response.event_type} for session {webhook_response.session_id}")
        
        # Process webhook event
        if webhook_response.event_type == "checkout.session.completed":
            session_id = webhook_response.session_id
            
            # Find and update transaction
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            
            if transaction and not transaction.get("modules_activated"):
                now = datetime.now(timezone.utc)
                
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "payment_status": "paid",
                        "updated_at": now.isoformat()
                    }}
                )
                
                # Activate modules
                await activate_purchased_modules(
                    company_id=transaction.get("company_id"),
                    user_id=transaction.get("user_id"),
                    modules=transaction.get("modules", []),
                    payment_type=transaction.get("payment_type"),
                    session_id=session_id
                )
                
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"modules_activated": True}}
                )
        
        return {"status": "received"}
        
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}


# ============== PRICING INFO ==============

@payments_router.get("/pricing")
async def get_pricing_info():
    """Get available modules and their pricing (with dynamic prices from DB)"""
    prices = await get_dynamic_prices()
    
    modules = []
    for key, price in prices["modules"].items():
        modules.append({
            "key": key,
            "name": MODULE_NAMES.get(key, key),
            "price": price,
            "currency": "USD",
            "billing": "monthly"
        })
    
    return {
        "kora_core_price": prices["kora_core"],
        "kora_core_includes": ["System Pulse", "Execution Hub", "Client Engagement", "Business Clarity", "1 Location"],
        "modules": modules,
        "trial_days": TRIAL_PERIOD_DAYS,
        "currency": "USD"
    }


@payments_router.put("/pricing")
async def update_pricing(
    pricing_data: dict,
    user: User = Depends(get_current_user)
):
    """Update pricing (Super Admin only)"""
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    now = datetime.now(timezone.utc)
    
    # Deactivate previous config
    await db.pricing_config.update_many(
        {"active": True},
        {"$set": {"active": False, "deactivated_at": now.isoformat()}}
    )
    
    # Create new config
    config = {
        "kora_core_price": pricing_data.get("kora_core_price", KORA_CORE_PRICE),
        "module_prices": pricing_data.get("module_prices", MODULE_PRICES),
        "active": True,
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    await db.pricing_config.insert_one(config)
    
    return {"success": True, "message": "Pricing updated"}


@payments_router.get("/my-subscription")
async def get_my_subscription(user: User = Depends(get_current_user)):
    """Get current user's subscription and active modules"""
    # Get subscription
    subscription = await db.subscriptions.find_one(
        {"company_id": user.company_id, "status": "active"},
        {"_id": 0}
    )
    
    # Get active modules
    active_addons = await db.organization_addons.find(
        {"company_id": user.company_id, "status": "active", "addon_type": "module"},
        {"_id": 0}
    ).to_list(20)
    
    # Get payment history
    transactions = await db.payment_transactions.find(
        {"company_id": user.company_id, "payment_status": "paid"},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    active_module_keys = [
        a.get("addon_id", "").replace("addon_", "") 
        for a in active_addons
    ]
    
    # Calculate actual monthly cost (what user is paying now)
    # Only count non-demo/non-trial modules
    current_cost = 0.0
    for addon in active_addons:
        if addon.get("pricing_type") != "demo" and addon.get("price_paid", 0) > 0:
            module_key = addon.get("addon_id", "").replace("addon_", "")
            if module_key in MODULE_PRICES:
                current_cost += MODULE_PRICES[module_key]
    
    # Calculate cost after trial (what user will pay after trial ends)
    full_price_cost = calculate_subscription_total(active_module_keys, include_core=False)
    
    return {
        "subscription": subscription,
        "active_modules": active_addons,
        "active_module_keys": active_module_keys,
        "monthly_cost": current_cost,  # What user is paying NOW
        "monthly_cost_after_trial": full_price_cost,  # What user will pay after trial
        "payment_history": transactions
    }
