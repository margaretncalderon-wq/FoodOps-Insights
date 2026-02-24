# models/demand_studio.py - Demand Studio models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum


# ============== CAMPAIGN TRACKING ENUMS ==============

class ChannelType(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    HYBRID = "hybrid"


# ============== CAMPAIGN MODELS ==============

class MarketingCampaignCreate(BaseModel):
    """Create a marketing campaign"""
    name: str
    campaign_type: str = "brand"  # brand, acquisition, retention, reactivation
    objective: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: float = 0.0
    status: str = "draft"  # draft, active, paused, completed
    tags: List[str] = []
    notes: Optional[str] = None
    # Campaign Tracking (additive)
    campaign_code: Optional[str] = None  # Tracking code e.g. "TASTE-SJ-2026"
    channel_type: Optional[str] = None  # online, offline, hybrid


class MarketingCampaign(BaseModel):
    """Marketing campaign model"""
    campaign_id: str
    company_id: str
    name: str
    campaign_type: str = "brand"
    objective: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    budget: float = 0.0
    actual_spend: float = 0.0
    status: str = "draft"
    tags: List[str] = []
    notes: Optional[str] = None
    owner_user_id: Optional[str] = None
    leads_linked: int = 0
    opportunities_linked: int = 0
    # Campaign Tracking (additive)
    campaign_code: Optional[str] = None
    channel_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CampaignCodeUpdate(BaseModel):
    """Update campaign tracking code"""
    campaign_code: str


# ============== CHANNEL MODELS ==============

class CampaignChannelCreate(BaseModel):
    """Create a campaign channel"""
    campaign_id: str
    channel_type: str  # facebook, instagram, google_ads, email, sms, whatsapp, linkedin, tiktok, radio, print, event, other
    channel_name: Optional[str] = None
    budget_allocated: float = 0.0
    status: str = "active"  # active, paused, completed
    notes: Optional[str] = None


class CampaignChannel(BaseModel):
    """Campaign channel model"""
    channel_id: str
    company_id: str
    campaign_id: str
    channel_type: str
    channel_name: Optional[str] = None
    budget_allocated: float = 0.0
    actual_spend: float = 0.0
    status: str = "active"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ============== SPEND MODELS ==============

class CampaignSpendCreate(BaseModel):
    """Record campaign spend"""
    campaign_id: str
    channel_id: Optional[str] = None
    spend_type: str = "media"  # media, creative, agency, production, other
    category: str = "online"  # online, offline
    amount: float
    spend_date: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    invoice_ref: Optional[str] = None


class CampaignSpend(BaseModel):
    """Campaign spend record"""
    spend_id: str
    company_id: str
    campaign_id: str
    channel_id: Optional[str] = None
    spend_type: str = "media"
    category: str = "online"
    amount: float
    spend_date: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    invoice_ref: Optional[str] = None
    created_at: datetime


# ============== ASSET MODELS ==============

class CampaignAssetCreate(BaseModel):
    """Create a campaign asset"""
    campaign_id: str
    title: str
    asset_type: str = "image"  # image, video, copy, landing_page, document, other
    url_or_file_ref: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []


class CampaignAsset(BaseModel):
    """Campaign asset model"""
    asset_id: str
    company_id: str
    campaign_id: str
    title: str
    asset_type: str = "image"
    url_or_file_ref: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []
    created_at: datetime
    updated_at: datetime


# ============== ACTIVATION MODELS ==============

class MarketingActivationCreate(BaseModel):
    """Create a marketing activation"""
    name: str
    activation_type: str = "event"  # event, promo, partnership, sampling, popup, webinar, other
    campaign_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location: Optional[str] = None
    budget: float = 0.0
    status: str = "planned"  # planned, active, completed, cancelled
    notes: Optional[str] = None


class MarketingActivation(BaseModel):
    """Marketing activation model"""
    activation_id: str
    company_id: str
    name: str
    activation_type: str = "event"
    campaign_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location: Optional[str] = None
    budget: float = 0.0
    actual_spend: float = 0.0
    status: str = "planned"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ============== EMAIL TRACKING MODELS ==============

class EmailTrackingCreate(BaseModel):
    """Create email tracking record"""
    campaign_id: Optional[str] = None
    name: str
    segment: Optional[str] = None
    list_size: int = 0
    send_date: Optional[str] = None
    status: str = "draft"  # draft, scheduled, sent, completed
    cost: float = 0.0
    notes: Optional[str] = None


class EmailTracking(BaseModel):
    """Email tracking model"""
    email_id: str
    company_id: str
    campaign_id: Optional[str] = None
    name: str
    segment: Optional[str] = None
    list_size: int = 0
    sent_count: int = 0
    open_count: int = 0
    click_count: int = 0
    bounce_count: int = 0
    unsubscribe_count: int = 0
    send_date: Optional[str] = None
    status: str = "draft"
    cost: float = 0.0
    notes: Optional[str] = None
    # Enhanced tracking fields
    subject_line: Optional[str] = None
    preview_text: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    external_campaign_id: Optional[str] = None  # Mailchimp/Brevo campaign ID
    external_provider: Optional[str] = None  # mailchimp, brevo, sendgrid, etc.
    created_at: datetime
    updated_at: datetime


# ============== EMAIL SEQUENCE MODELS (PRE-DEVELOPMENT) ==============

class EmailSequenceCreate(BaseModel):
    """Create an email sequence (drip campaign)"""
    name: str
    description: Optional[str] = None
    trigger_type: str = "manual"  # manual, new_lead, status_change, form_submit
    trigger_config: Optional[dict] = None  # Config for automatic triggers
    status: str = "draft"  # draft, active, paused


class EmailSequence(BaseModel):
    """Email sequence (drip campaign) model"""
    sequence_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    trigger_type: str = "manual"
    trigger_config: Optional[dict] = None
    status: str = "draft"
    total_enrolled: int = 0
    total_completed: int = 0
    created_at: datetime
    updated_at: datetime


class EmailSequenceStepCreate(BaseModel):
    """Create a step in an email sequence"""
    sequence_id: str
    step_order: int
    delay_days: int = 0  # Days to wait after previous step (or enrollment)
    delay_hours: int = 0
    subject: str
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    template_id: Optional[str] = None  # Reference to email template


class EmailSequenceStep(BaseModel):
    """Email sequence step model"""
    step_id: str
    company_id: str
    sequence_id: str
    step_order: int
    delay_days: int = 0
    delay_hours: int = 0
    subject: str
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    template_id: Optional[str] = None
    sent_count: int = 0
    open_count: int = 0
    click_count: int = 0
    created_at: datetime
    updated_at: datetime


class EmailSequenceEnrollmentCreate(BaseModel):
    """Enroll a contact in a sequence"""
    sequence_id: str
    contact_type: str  # lead, client
    contact_id: str


class EmailSequenceEnrollment(BaseModel):
    """Contact enrollment in a sequence"""
    enrollment_id: str
    company_id: str
    sequence_id: str
    contact_type: str
    contact_id: str
    status: str = "active"  # active, paused, completed, unsubscribed
    current_step: int = 0
    next_send_at: Optional[datetime] = None
    enrolled_at: datetime
    completed_at: Optional[datetime] = None


class EmailTemplateCreate(BaseModel):
    """Create an email template"""
    name: str
    subject: str
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    category: str = "general"  # general, welcome, follow_up, promotion, etc.


class EmailTemplate(BaseModel):
    """Email template model"""
    template_id: str
    company_id: str
    name: str
    subject: str
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    category: str = "general"
    usage_count: int = 0
    created_at: datetime
    updated_at: datetime


# ============== LINK MODELS ==============

class CampaignLeadLinkCreate(BaseModel):
    """Link a lead to a campaign"""
    campaign_id: str
    lead_id: str


class CampaignOpportunityLinkCreate(BaseModel):
    """Link an opportunity/event to a campaign"""
    campaign_id: str
    event_id: str


class CampaignAccessCreate(BaseModel):
    """Grant access to a campaign"""
    campaign_id: str
    user_id: str
    access_level: str = "view"  # view, edit, admin


# ============== NOTIFICATION MODEL ==============

class NotificationCreate(BaseModel):
    """Create a notification"""
    user_id: str
    notification_type: str  # campaign_access, campaign_removed, system, etc.
    title: str
    message: str
    link: Optional[str] = None
    metadata: Optional[dict] = None


# ============== SOCIAL MEDIA MODELS ==============

class SocialAccountCreate(BaseModel):
    """Create a social media account"""
    platform: str  # instagram, tiktok, linkedin, facebook, youtube
    handle: str
    status: str = "active"  # active, paused


class SocialAccount(BaseModel):
    """Social media account model"""
    account_id: str
    company_id: str
    platform: str
    handle: str
    status: str = "active"
    created_at: datetime
    updated_at: datetime


class ContentPillarCreate(BaseModel):
    """Create a content pillar"""
    name: str
    description: Optional[str] = None


class ContentPillar(BaseModel):
    """Content pillar model"""
    pillar_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SocialPostCreate(BaseModel):
    """Create a social media post"""
    social_account_id: str
    campaign_id: Optional[str] = None
    pillar_id: Optional[str] = None
    format: str = "post"  # reel, carousel, post, story, live
    status: str = "idea"  # idea, drafted, scheduled, posted, archived
    title: str
    caption: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    scheduled_at: Optional[str] = None
    link_url: Optional[str] = None
    notes: Optional[str] = None


class SocialPost(BaseModel):
    """Social media post model"""
    post_id: str
    company_id: str
    social_account_id: str
    campaign_id: Optional[str] = None
    pillar_id: Optional[str] = None
    format: str = "post"
    status: str = "idea"
    title: str
    caption: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    scheduled_at: Optional[str] = None
    posted_at: Optional[str] = None
    link_url: Optional[str] = None
    notes: Optional[str] = None
    created_by_user_id: str
    owner_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SocialPostAssetLinkCreate(BaseModel):
    """Link an asset to a social post"""
    post_id: str
    asset_id: str


class SocialPostSpendLinkCreate(BaseModel):
    """Link spend to a social post"""
    post_id: str
    spend_id: str


class ContentIdeaCreate(BaseModel):
    """Create a content idea/inspiration"""
    title: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    pillar_id: Optional[str] = None
    tags: List[str] = []
    status: str = "new"  # new, reviewing, approved, used, archived


class ContentIdea(BaseModel):
    """Content idea/inspiration model"""
    idea_id: str
    company_id: str
    title: str
    description: Optional[str] = None
    source_url: Optional[str] = None
    pillar_id: Optional[str] = None
    tags: List[str] = []
    status: str = "new"
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime
