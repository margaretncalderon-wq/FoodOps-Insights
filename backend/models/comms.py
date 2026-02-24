# models/comms.py - Kora Comms omnichannel messaging models
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ============== ENUMS ==============

class ChannelProvider(str, Enum):
    WHATSAPP = "whatsapp"
    EMAIL = "email"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    MANUAL = "manual"  # For internal/manual messages


class ChannelStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ConversationStatus(str, Enum):
    OPEN = "open"
    PENDING = "pending"
    CLOSED = "closed"


class ConversationPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


class MessageDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class MessageType(str, Enum):
    TEXT = "text"
    TEMPLATE = "template"
    EMAIL = "email"
    MEDIA = "media"
    NOTE = "note"  # Internal notes


class DeliveryStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


# ============== INBOX MODELS ==============

class CommInboxCreate(BaseModel):
    """Create a shared inbox"""
    name: str
    description: Optional[str] = None
    is_active: bool = True


class CommInbox(BaseModel):
    """Shared inbox container"""
    inbox_id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


# ============== CHANNEL MODELS ==============

class CommChannelCreate(BaseModel):
    """Create a communication channel"""
    inbox_id: str
    provider: str  # whatsapp, email, instagram, facebook, manual
    display_name: str
    external_account_id: Optional[str] = None  # Meta WABA id, email account id
    external_channel_id: Optional[str] = None  # Phone number id, etc.
    config: Optional[dict] = None  # Provider-specific config


class CommChannel(BaseModel):
    """Communication channel endpoint"""
    channel_id: str
    organization_id: str
    inbox_id: str
    provider: str
    display_name: str
    external_account_id: Optional[str] = None
    external_channel_id: Optional[str] = None
    config: Optional[dict] = None
    status: str = "active"
    created_at: datetime
    updated_at: datetime


# ============== CONTACT MAP MODELS ==============

class CommContactMapCreate(BaseModel):
    """Map CRM contact to provider identity"""
    contact_type: str  # "lead" or "client"
    contact_id: str  # lead_id or client_id
    provider: str
    identity_value: str  # phone, email, username
    is_primary: bool = True


class CommContactMap(BaseModel):
    """CRM contact to provider identity mapping"""
    map_id: str
    organization_id: str
    contact_type: str
    contact_id: str
    provider: str
    identity_value: str
    is_primary: bool = True
    created_at: datetime


# ============== CONVERSATION MODELS ==============

class CommConversationCreate(BaseModel):
    """Create a conversation"""
    inbox_id: str
    channel_id: str
    contact_type: str  # "lead" or "client"
    contact_id: str
    subject: Optional[str] = None  # For email threads


class CommConversation(BaseModel):
    """Conversation thread"""
    conversation_id: str
    organization_id: str
    inbox_id: str
    channel_id: str
    contact_type: str
    contact_id: str
    subject: Optional[str] = None
    assigned_user_id: Optional[str] = None
    status: str = "open"
    priority: str = "normal"
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    unread_count: int = 0
    external_thread_id: Optional[str] = None  # Email thread id, etc.
    created_at: datetime
    updated_at: datetime


class ConversationUpdate(BaseModel):
    """Update conversation"""
    assigned_user_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None


# ============== MESSAGE MODELS ==============

class CommMessageCreate(BaseModel):
    """Create a message"""
    conversation_id: str
    direction: str = "outbound"
    message_type: str = "text"
    content_text: Optional[str] = None
    content_html: Optional[str] = None
    attachments: Optional[List[dict]] = None
    is_internal_note: bool = False  # True for internal notes


class CommMessage(BaseModel):
    """Message in a conversation"""
    message_id: str
    organization_id: str
    conversation_id: str
    direction: str
    provider: str
    message_type: str
    content_text: Optional[str] = None
    content_html: Optional[str] = None
    attachments: Optional[List[dict]] = None
    external_message_id: Optional[str] = None
    sent_by_user_id: Optional[str] = None
    sent_by_user_name: Optional[str] = None
    delivery_status: Optional[str] = None
    is_internal_note: bool = False
    created_at: datetime


# ============== API RESPONSE MODELS ==============

class ConversationWithDetails(BaseModel):
    """Conversation with contact and channel details"""
    conversation_id: str
    organization_id: str
    inbox_id: str
    inbox_name: Optional[str] = None
    channel_id: str
    channel_provider: Optional[str] = None
    channel_display_name: Optional[str] = None
    contact_type: str
    contact_id: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    subject: Optional[str] = None
    assigned_user_id: Optional[str] = None
    assigned_user_name: Optional[str] = None
    status: str
    priority: str
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime


class InboxStats(BaseModel):
    """Inbox statistics"""
    total_conversations: int = 0
    open_conversations: int = 0
    pending_conversations: int = 0
    closed_conversations: int = 0
    unassigned_conversations: int = 0
    my_conversations: int = 0
