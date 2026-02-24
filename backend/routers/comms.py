# routers/comms.py - Kora Comms omnichannel messaging routes
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from config import db
from models.auth import User
from models.comms import (
    CommInboxCreate, CommInbox,
    CommChannelCreate, CommChannel,
    CommContactMapCreate, CommContactMap,
    CommConversationCreate, CommConversation, ConversationUpdate,
    CommMessageCreate, CommMessage,
    ConversationWithDetails, InboxStats
)
from routers.auth import get_current_user

comms_router = APIRouter(prefix="/comms", tags=["Comms"])
logger = logging.getLogger(__name__)


# ============== HELPER FUNCTIONS ==============

def sanitize_doc(doc: dict) -> dict:
    """Remove MongoDB _id and convert ObjectId to string"""
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


async def get_contact_info(contact_type: str, contact_id: str, organization_id: str) -> dict:
    """Get contact name and details from lead or client"""
    if contact_type == "lead":
        lead = await db.leads.find_one(
            {"lead_id": contact_id, "company_id": organization_id},
            {"_id": 0, "lead_name": 1, "email": 1, "phone": 1, "whatsapp": 1}
        )
        if lead:
            return {
                "contact_name": lead.get("lead_name"),
                "contact_email": lead.get("email"),
                "contact_phone": lead.get("phone") or lead.get("whatsapp")
            }
    elif contact_type == "client":
        client = await db.clients.find_one(
            {"client_id": contact_id, "company_id": organization_id},
            {"_id": 0, "name": 1, "email": 1, "phone": 1, "whatsapp": 1}
        )
        if client:
            return {
                "contact_name": client.get("name"),
                "contact_email": client.get("email"),
                "contact_phone": client.get("phone") or client.get("whatsapp")
            }
    return {"contact_name": None, "contact_email": None, "contact_phone": None}


async def get_user_name(user_id: str) -> str:
    """Get user name by id"""
    if not user_id:
        return None
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if user:
        return user.get("name") or user.get("email")
    return None


# ============== INBOX ENDPOINTS ==============

@comms_router.get("/inboxes")
async def get_inboxes(user: User = Depends(get_current_user)):
    """Get all inboxes for the organization"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        return []
    
    inboxes = await db.comm_inboxes.find(
        {"organization_id": org_id, "is_active": True},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    return inboxes


@comms_router.post("/inboxes")
async def create_inbox(data: CommInboxCreate, user: User = Depends(get_current_user)):
    """Create a new inbox"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    inbox = {
        "inbox_id": f"inbox_{uuid.uuid4().hex[:12]}",
        "organization_id": org_id,
        "name": data.name,
        "description": data.description,
        "is_active": data.is_active,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.comm_inboxes.insert_one(inbox)
    return sanitize_doc(inbox)


@comms_router.get("/inboxes/{inbox_id}")
async def get_inbox(inbox_id: str, user: User = Depends(get_current_user)):
    """Get inbox by ID"""
    org_id = user.company_id or user.active_org_id
    inbox = await db.comm_inboxes.find_one(
        {"inbox_id": inbox_id, "organization_id": org_id},
        {"_id": 0}
    )
    if not inbox:
        raise HTTPException(status_code=404, detail="Inbox not found")
    return inbox


@comms_router.delete("/inboxes/{inbox_id}")
async def delete_inbox(inbox_id: str, user: User = Depends(get_current_user)):
    """Soft delete an inbox"""
    org_id = user.company_id or user.active_org_id
    result = await db.comm_inboxes.update_one(
        {"inbox_id": inbox_id, "organization_id": org_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inbox not found")
    return {"success": True}


# ============== CHANNEL ENDPOINTS ==============

@comms_router.get("/channels")
async def get_channels(
    inbox_id: Optional[str] = None,
    provider: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get channels with optional filters"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        return []
    
    query = {"organization_id": org_id, "status": "active"}
    if inbox_id:
        query["inbox_id"] = inbox_id
    if provider:
        query["provider"] = provider
    
    channels = await db.comm_channels.find(query, {"_id": 0}).to_list(100)
    return channels


@comms_router.post("/channels")
async def create_channel(data: CommChannelCreate, user: User = Depends(get_current_user)):
    """Create a new channel"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Verify inbox exists
    inbox = await db.comm_inboxes.find_one(
        {"inbox_id": data.inbox_id, "organization_id": org_id}
    )
    if not inbox:
        raise HTTPException(status_code=404, detail="Inbox not found")
    
    now = datetime.now(timezone.utc)
    channel = {
        "channel_id": f"chan_{uuid.uuid4().hex[:12]}",
        "organization_id": org_id,
        "inbox_id": data.inbox_id,
        "provider": data.provider,
        "display_name": data.display_name,
        "external_account_id": data.external_account_id,
        "external_channel_id": data.external_channel_id,
        "config": data.config or {},
        "status": "active",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.comm_channels.insert_one(channel)
    return sanitize_doc(channel)


@comms_router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str, user: User = Depends(get_current_user)):
    """Soft delete a channel"""
    org_id = user.company_id or user.active_org_id
    result = await db.comm_channels.update_one(
        {"channel_id": channel_id, "organization_id": org_id},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Channel not found")
    return {"success": True}


# ============== CONVERSATION ENDPOINTS ==============

@comms_router.get("/conversations")
async def get_conversations(
    inbox_id: Optional[str] = None,
    channel_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,  # "me", "unassigned", or user_id
    contact_type: Optional[str] = None,
    contact_id: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: User = Depends(get_current_user)
):
    """Get conversations with filters"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        return []
    
    query = {"organization_id": org_id}
    
    if inbox_id:
        query["inbox_id"] = inbox_id
    if channel_id:
        query["channel_id"] = channel_id
    if status:
        query["status"] = status
    if contact_type:
        query["contact_type"] = contact_type
    if contact_id:
        query["contact_id"] = contact_id
    
    # Handle assignment filters
    if assigned_to == "me":
        query["assigned_user_id"] = user.user_id
    elif assigned_to == "unassigned":
        query["assigned_user_id"] = None
    elif assigned_to and assigned_to not in ["me", "unassigned"]:
        query["assigned_user_id"] = assigned_to
    
    conversations = await db.comm_conversations.find(
        query, {"_id": 0}
    ).sort("last_message_at", -1).skip(offset).limit(limit).to_list(limit)
    
    # Enrich with contact and channel details
    enriched = []
    for conv in conversations:
        # Get channel info
        channel = await db.comm_channels.find_one(
            {"channel_id": conv["channel_id"]},
            {"_id": 0, "provider": 1, "display_name": 1}
        )
        
        # Get inbox name
        inbox = await db.comm_inboxes.find_one(
            {"inbox_id": conv["inbox_id"]},
            {"_id": 0, "name": 1}
        )
        
        # Get contact info
        contact_info = await get_contact_info(
            conv["contact_type"], 
            conv["contact_id"], 
            org_id
        )
        
        # Get assigned user name
        assigned_user_name = await get_user_name(conv.get("assigned_user_id"))
        
        enriched.append({
            **conv,
            "inbox_name": inbox.get("name") if inbox else None,
            "channel_provider": channel.get("provider") if channel else None,
            "channel_display_name": channel.get("display_name") if channel else None,
            "contact_name": contact_info.get("contact_name"),
            "contact_email": contact_info.get("contact_email"),
            "contact_phone": contact_info.get("contact_phone"),
            "assigned_user_name": assigned_user_name
        })
    
    return enriched


@comms_router.post("/conversations")
async def create_conversation(data: CommConversationCreate, user: User = Depends(get_current_user)):
    """Create a new conversation"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Verify inbox and channel exist
    inbox = await db.comm_inboxes.find_one(
        {"inbox_id": data.inbox_id, "organization_id": org_id}
    )
    if not inbox:
        raise HTTPException(status_code=404, detail="Inbox not found")
    
    channel = await db.comm_channels.find_one(
        {"channel_id": data.channel_id, "organization_id": org_id}
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    # Check if conversation already exists for this contact/channel
    existing = await db.comm_conversations.find_one({
        "organization_id": org_id,
        "channel_id": data.channel_id,
        "contact_type": data.contact_type,
        "contact_id": data.contact_id
    })
    if existing:
        return sanitize_doc(existing)
    
    now = datetime.now(timezone.utc)
    conversation = {
        "conversation_id": f"conv_{uuid.uuid4().hex[:12]}",
        "organization_id": org_id,
        "inbox_id": data.inbox_id,
        "channel_id": data.channel_id,
        "contact_type": data.contact_type,
        "contact_id": data.contact_id,
        "subject": data.subject,
        "assigned_user_id": None,
        "status": "open",
        "priority": "normal",
        "last_message_at": None,
        "last_message_preview": None,
        "unread_count": 0,
        "external_thread_id": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.comm_conversations.insert_one(conversation)
    return sanitize_doc(conversation)


@comms_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: User = Depends(get_current_user)):
    """Get conversation by ID with full details"""
    org_id = user.company_id or user.active_org_id
    
    conv = await db.comm_conversations.find_one(
        {"conversation_id": conversation_id, "organization_id": org_id},
        {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Enrich with details
    channel = await db.comm_channels.find_one(
        {"channel_id": conv["channel_id"]},
        {"_id": 0, "provider": 1, "display_name": 1}
    )
    inbox = await db.comm_inboxes.find_one(
        {"inbox_id": conv["inbox_id"]},
        {"_id": 0, "name": 1}
    )
    contact_info = await get_contact_info(conv["contact_type"], conv["contact_id"], org_id)
    assigned_user_name = await get_user_name(conv.get("assigned_user_id"))
    
    return {
        **conv,
        "inbox_name": inbox.get("name") if inbox else None,
        "channel_provider": channel.get("provider") if channel else None,
        "channel_display_name": channel.get("display_name") if channel else None,
        **contact_info,
        "assigned_user_name": assigned_user_name
    }


@comms_router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str, 
    data: ConversationUpdate, 
    user: User = Depends(get_current_user)
):
    """Update conversation (assignment, status, priority)"""
    org_id = user.company_id or user.active_org_id
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.assigned_user_id is not None:
        update_data["assigned_user_id"] = data.assigned_user_id if data.assigned_user_id else None
    if data.status:
        update_data["status"] = data.status
    if data.priority:
        update_data["priority"] = data.priority
    
    result = await db.comm_conversations.update_one(
        {"conversation_id": conversation_id, "organization_id": org_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return await get_conversation(conversation_id, user)


@comms_router.post("/conversations/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: str,
    user_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Assign conversation to a user (or unassign if user_id is None)"""
    org_id = user.company_id or user.active_org_id
    
    # If assigning to someone, verify they exist in org
    if user_id:
        target_user = await db.users.find_one({"user_id": user_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
    
    result = await db.comm_conversations.update_one(
        {"conversation_id": conversation_id, "organization_id": org_id},
        {"$set": {
            "assigned_user_id": user_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return {"success": True, "assigned_user_id": user_id}


# ============== MESSAGE ENDPOINTS ==============

@comms_router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    limit: int = Query(default=50, le=200),
    before: Optional[str] = None,  # For pagination
    user: User = Depends(get_current_user)
):
    """Get messages in a conversation"""
    org_id = user.company_id or user.active_org_id
    
    # Verify conversation exists and user has access
    conv = await db.comm_conversations.find_one(
        {"conversation_id": conversation_id, "organization_id": org_id}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    query = {
        "conversation_id": conversation_id,
        "organization_id": org_id
    }
    
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.comm_messages.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Reverse to get chronological order
    messages.reverse()
    
    # Mark conversation as read (reset unread count)
    await db.comm_conversations.update_one(
        {"conversation_id": conversation_id},
        {"$set": {"unread_count": 0}}
    )
    
    return messages


@comms_router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    data: CommMessageCreate,
    user: User = Depends(get_current_user)
):
    """Send a message in a conversation"""
    org_id = user.company_id or user.active_org_id
    
    # Verify conversation exists
    conv = await db.comm_conversations.find_one(
        {"conversation_id": conversation_id, "organization_id": org_id}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Get channel for provider info
    channel = await db.comm_channels.find_one(
        {"channel_id": conv["channel_id"]},
        {"_id": 0, "provider": 1}
    )
    
    now = datetime.now(timezone.utc)
    message = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "organization_id": org_id,
        "conversation_id": conversation_id,
        "direction": data.direction,
        "provider": channel.get("provider") if channel else "manual",
        "message_type": data.message_type,
        "content_text": data.content_text,
        "content_html": data.content_html,
        "attachments": data.attachments,
        "external_message_id": None,
        "sent_by_user_id": user.user_id if data.direction == "outbound" else None,
        "sent_by_user_name": user.name if data.direction == "outbound" else None,
        "delivery_status": "sent" if data.direction == "outbound" else None,
        "is_internal_note": data.is_internal_note,
        "created_at": now.isoformat()
    }
    
    await db.comm_messages.insert_one(message)
    
    # Update conversation
    preview = (data.content_text or "")[:100]
    update_data = {
        "last_message_at": now.isoformat(),
        "last_message_preview": preview,
        "updated_at": now.isoformat()
    }
    
    # If inbound message, increment unread count
    if data.direction == "inbound":
        await db.comm_conversations.update_one(
            {"conversation_id": conversation_id},
            {"$set": update_data, "$inc": {"unread_count": 1}}
        )
    else:
        # Outbound - reopen if closed
        if conv.get("status") == "closed":
            update_data["status"] = "open"
        await db.comm_conversations.update_one(
            {"conversation_id": conversation_id},
            {"$set": update_data}
        )
    
    return sanitize_doc(message)


# ============== CONTACT TIMELINE ==============

@comms_router.get("/contact/{contact_type}/{contact_id}/messages")
async def get_contact_messages(
    contact_type: str,
    contact_id: str,
    limit: int = Query(default=50, le=200),
    user: User = Depends(get_current_user)
):
    """Get all messages for a contact across all channels (for CRM profile timeline)"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        return []
    
    # Get all conversations for this contact
    conversations = await db.comm_conversations.find(
        {
            "organization_id": org_id,
            "contact_type": contact_type,
            "contact_id": contact_id
        },
        {"_id": 0, "conversation_id": 1, "channel_id": 1}
    ).to_list(100)
    
    if not conversations:
        return []
    
    conv_ids = [c["conversation_id"] for c in conversations]
    
    # Get messages from all conversations
    messages = await db.comm_messages.find(
        {
            "organization_id": org_id,
            "conversation_id": {"$in": conv_ids}
        },
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Enrich with channel info
    channel_ids = list(set(c["channel_id"] for c in conversations))
    channels = await db.comm_channels.find(
        {"channel_id": {"$in": channel_ids}},
        {"_id": 0, "channel_id": 1, "provider": 1, "display_name": 1}
    ).to_list(100)
    channel_map = {c["channel_id"]: c for c in channels}
    
    conv_channel_map = {c["conversation_id"]: c["channel_id"] for c in conversations}
    
    enriched = []
    for msg in messages:
        channel_id = conv_channel_map.get(msg["conversation_id"])
        channel = channel_map.get(channel_id, {})
        enriched.append({
            **msg,
            "channel_provider": channel.get("provider"),
            "channel_display_name": channel.get("display_name")
        })
    
    return enriched


# ============== STATS ==============

@comms_router.get("/stats")
async def get_inbox_stats(
    inbox_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get inbox statistics"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        return InboxStats()
    
    base_query = {"organization_id": org_id}
    if inbox_id:
        base_query["inbox_id"] = inbox_id
    
    total = await db.comm_conversations.count_documents(base_query)
    open_count = await db.comm_conversations.count_documents({**base_query, "status": "open"})
    pending = await db.comm_conversations.count_documents({**base_query, "status": "pending"})
    closed = await db.comm_conversations.count_documents({**base_query, "status": "closed"})
    unassigned = await db.comm_conversations.count_documents({**base_query, "assigned_user_id": None, "status": {"$ne": "closed"}})
    my_convs = await db.comm_conversations.count_documents({**base_query, "assigned_user_id": user.user_id})
    
    return {
        "total_conversations": total,
        "open_conversations": open_count,
        "pending_conversations": pending,
        "closed_conversations": closed,
        "unassigned_conversations": unassigned,
        "my_conversations": my_convs
    }


# ============== SEED/TEST DATA ==============

@comms_router.post("/seed-test-data")
async def seed_test_data(user: User = Depends(get_current_user)):
    """Seed test inbox, channel, and sample conversations for Phase 0 testing"""
    org_id = user.company_id or user.active_org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    
    # Check if already seeded
    existing_inbox = await db.comm_inboxes.find_one({"organization_id": org_id})
    if existing_inbox:
        return {"message": "Test data already exists", "inbox_id": existing_inbox["inbox_id"]}
    
    # Create default inbox
    inbox = {
        "inbox_id": f"inbox_{uuid.uuid4().hex[:12]}",
        "organization_id": org_id,
        "name": "General Inbox",
        "description": "Default inbox for all communications",
        "is_active": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.comm_inboxes.insert_one(inbox)
    
    # Create manual channel for testing
    channel = {
        "channel_id": f"chan_{uuid.uuid4().hex[:12]}",
        "organization_id": org_id,
        "inbox_id": inbox["inbox_id"],
        "provider": "manual",
        "display_name": "Manual Messages",
        "external_account_id": None,
        "external_channel_id": None,
        "config": {},
        "status": "active",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.comm_channels.insert_one(channel)
    
    # Get some leads to create sample conversations
    leads = await db.leads.find(
        {"company_id": org_id},
        {"_id": 0, "lead_id": 1, "lead_name": 1}
    ).limit(3).to_list(3)
    
    created_convs = []
    for i, lead in enumerate(leads):
        conv = {
            "conversation_id": f"conv_{uuid.uuid4().hex[:12]}",
            "organization_id": org_id,
            "inbox_id": inbox["inbox_id"],
            "channel_id": channel["channel_id"],
            "contact_type": "lead",
            "contact_id": lead["lead_id"],
            "subject": None,
            "assigned_user_id": user.user_id if i == 0 else None,
            "status": "open",
            "priority": ["normal", "high", "normal"][i],
            "last_message_at": now.isoformat(),
            "last_message_preview": f"Sample message from {lead.get('lead_name', 'Lead')}",
            "unread_count": 1 if i > 0 else 0,
            "external_thread_id": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.comm_conversations.insert_one(conv)
        created_convs.append(conv["conversation_id"])
        
        # Add sample messages
        msg_in = {
            "message_id": f"msg_{uuid.uuid4().hex[:12]}",
            "organization_id": org_id,
            "conversation_id": conv["conversation_id"],
            "direction": "inbound",
            "provider": "manual",
            "message_type": "text",
            "content_text": f"Hola, estoy interesado en sus servicios. - {lead.get('lead_name', 'Lead')}",
            "content_html": None,
            "attachments": None,
            "external_message_id": None,
            "sent_by_user_id": None,
            "sent_by_user_name": None,
            "delivery_status": None,
            "is_internal_note": False,
            "created_at": now.isoformat()
        }
        await db.comm_messages.insert_one(msg_in)
    
    return {
        "message": "Test data created successfully",
        "inbox_id": inbox["inbox_id"],
        "channel_id": channel["channel_id"],
        "conversations_created": len(created_convs)
    }
