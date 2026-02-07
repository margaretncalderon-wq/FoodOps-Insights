# models/addons.py - Add-on Models for Individual Purchases
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class AddonStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELED = "canceled"
    PENDING_PAYMENT = "pending_payment"


class AddonType(str, Enum):
    FEATURE = "feature"          # Unlocks a feature
    LIMIT_BOOST = "limit_boost"  # Increases a limit
    CREDIT_PACK = "credit_pack"  # One-time credits (e.g., AI credits)
    SERVICE = "service"          # Professional service (e.g., setup, training)


class AddonPricing(str, Enum):
    ONE_TIME = "one_time"        # Pay once
    MONTHLY = "monthly"          # Recurring monthly
    YEARLY = "yearly"            # Recurring yearly
    USAGE = "usage"              # Pay per use


# ============== ADDON DEFINITION ==============

class AddonDefinition(BaseModel):
    """Definition of an available add-on in the marketplace"""
    addon_id: str
    name: str
    display_name_en: str
    display_name_es: str
    description_en: str
    description_es: str
    type: AddonType
    pricing: AddonPricing
    price: float
    currency: str = "USD"
    # What this addon provides
    feature_key: Optional[str] = None       # For FEATURE type: which feature to unlock
    limit_key: Optional[str] = None         # For LIMIT_BOOST: which limit to increase
    limit_increase: Optional[int] = None    # For LIMIT_BOOST: how much to add
    credits_amount: Optional[int] = None    # For CREDIT_PACK: number of credits
    # Metadata
    is_active: bool = True
    sort_order: int = 0
    icon: Optional[str] = None
    # Restrictions
    compatible_plans: List[str] = []        # Empty means all plans
    stackable: bool = False                 # Can buy multiple times?
    max_quantity: int = 1                   # Max quantity per org


class AddonDefinitionCreate(BaseModel):
    name: str
    display_name_en: str
    display_name_es: str
    description_en: str
    description_es: str
    type: AddonType
    pricing: AddonPricing
    price: float
    currency: str = "USD"
    feature_key: Optional[str] = None
    limit_key: Optional[str] = None
    limit_increase: Optional[int] = None
    credits_amount: Optional[int] = None
    compatible_plans: List[str] = []
    stackable: bool = False
    max_quantity: int = 1


# ============== ORGANIZATION ADDON (Purchase) ==============

class OrganizationAddon(BaseModel):
    """An add-on purchased by an organization"""
    org_addon_id: str
    company_id: str
    addon_id: str
    addon_name: str
    addon_type: AddonType
    status: AddonStatus = AddonStatus.ACTIVE
    quantity: int = 1
    # Pricing snapshot at purchase time
    price_paid: float
    pricing_type: AddonPricing
    currency: str = "USD"
    # For recurring addons
    billing_cycle_start: Optional[datetime] = None
    billing_cycle_end: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    auto_renew: bool = True
    # For credit packs
    credits_remaining: Optional[int] = None
    # Stripe integration (future)
    stripe_subscription_id: Optional[str] = None
    stripe_invoice_id: Optional[str] = None
    # Metadata
    purchased_by: str
    purchased_at: datetime
    canceled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class OrganizationAddonCreate(BaseModel):
    addon_id: str
    quantity: int = 1


# ============== EFFECTIVE LIMITS (Computed) ==============

class EffectiveLimits(BaseModel):
    """Computed limits for an organization (base plan + addons)"""
    events_per_month: int = 10
    active_users: int = 3
    supplier_invoices_per_month: int = 50
    storage_mb: int = 500
    proposals_per_month: int = 20
    execution_goals_per_month: int = 3
    # Addon boosts applied
    boosts_applied: List[str] = []


class EffectiveFeatures(BaseModel):
    """Computed features for an organization (base plan + addons)"""
    business_clarity: bool = True
    culinary_intelligence: bool = False
    advanced_reports: bool = False
    api_access: bool = False
    white_label: bool = False
    priority_support: bool = False
    execution_hub: bool = True
    # Addon features applied
    addons_applied: List[str] = []


# ============== ADDON USAGE LOG ==============

class AddonUsageLog(BaseModel):
    """Log of addon usage (for credit-based addons)"""
    log_id: str
    org_addon_id: str
    company_id: str
    user_id: str
    action: str  # e.g., "ai_generation", "export", etc.
    credits_used: int = 1
    metadata: Dict[str, Any] = {}
    created_at: datetime
