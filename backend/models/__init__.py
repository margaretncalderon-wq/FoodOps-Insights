# models/__init__.py - Export all models
from models.auth import User, UserCreate, UserLogin, TokenResponse
from models.demand_studio import (
    MarketingCampaignCreate, MarketingCampaign,
    CampaignChannelCreate, CampaignChannel,
    CampaignSpendCreate, CampaignSpend,
    CampaignAssetCreate, CampaignAsset,
    MarketingActivationCreate, MarketingActivation,
    EmailTrackingCreate, EmailTracking,
    CampaignLeadLinkCreate, CampaignOpportunityLinkCreate, CampaignAccessCreate,
    NotificationCreate,
    SocialAccountCreate, SocialAccount,
    ContentPillarCreate, ContentPillar,
    SocialPostCreate, SocialPost,
    SocialPostAssetLinkCreate, SocialPostSpendLinkCreate,
    ContentIdeaCreate, ContentIdea
)
from models.business_clarity import (
    PaymentCreate, Payment, PaymentApplicationCreate,
    InvoicePaymentRequest, ClientCreditUpdate,
    SupplierPayableCreate, FixedCostCategoryCreate, FixedCostBudgetCreate,
    CashSnapshotCreate, PhysicalCountCreate
)
from models.crm import (
    LeadCreate, Lead, ContactCreate, Contact,
    ClientCreate, Client, CommLogCreate, CommLog,
    LeadFormCreate, LeadForm, LeadFormFieldConfig, CustomFieldConfig
)
from models.events import (
    EventCreate, Event, EventMenuCreate,
    EventBlueprintUpdate, ExperienceDesignCreate, OperationalFlowCreate, OperationalPhase,
    RunOfShowCreate, TimeBlock, TeamRolesCreate, EventRole,
    ProductionAssetsCreate, ProductionAsset, ChecklistItem, PostEventReviewCreate,
    EventScalingRequest, ScaledIngredient, ConsolidatedPurchaseList,
    CreatePOFromPurchaseListItem, CreatePOFromPurchaseListRequest,
    EventExtendedUpdate, EventOrderItemCreate, EventOrderItem, EventOrderCreate, EventOrder,
    RUN_OF_SHOW_TEMPLATES
)
