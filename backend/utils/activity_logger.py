# utils/activity_logger.py - Generic Activity Logging System
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from enum import Enum
import uuid
import logging

from config import db

logger = logging.getLogger(__name__)


class ActionType(str, Enum):
    """Standard action types across all modules"""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    MOVE = "move"
    RESIZE = "resize"
    ASSIGN = "assign"
    UNASSIGN = "unassign"
    COMPLETE = "complete"
    APPROVE = "approve"
    REJECT = "reject"
    ARCHIVE = "archive"
    RESTORE = "restore"
    EXPORT = "export"
    IMPORT = "import"
    COPY = "copy"
    STATUS_CHANGE = "status_change"
    COMMENT = "comment"
    ATTACH = "attach"
    DETACH = "detach"


class ModuleType(str, Enum):
    """All modules in the system"""
    AUTH = "auth"
    CRM = "crm"
    EVENTS = "events"
    ROOM_SETUP = "room_setup"
    LOCATIONS = "locations"
    EXECUTION_HUB = "execution_hub"
    DEMAND_STUDIO = "demand_studio"
    BUSINESS_CLARITY = "business_clarity"
    ADDONS = "addons"
    CULINARY = "culinary"
    OPERATIONS = "operations"
    SETTINGS = "settings"


async def log_activity(
    module: str,
    action: str,
    entity_type: str,
    entity_id: str,
    entity_name: str,
    user_id: str,
    user_name: str,
    user_email: str,
    company_id: str,
    event_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    parent_type: Optional[str] = None,
    field_changed: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    changes: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None
) -> dict:
    """
    Generic activity logger for all modules.
    
    Args:
        module: Which module (crm, events, room_setup, etc.)
        action: What action (create, update, delete, etc.)
        entity_type: Type of entity (client, event, room, goal, etc.)
        entity_id: ID of the entity
        entity_name: Display name of the entity
        user_id: ID of user performing action
        user_name: Name of user
        user_email: Email of user
        company_id: Company ID
        event_id: Optional event ID if action is event-related
        parent_id: Optional parent entity ID
        parent_type: Optional parent entity type
        field_changed: Specific field that changed
        old_value: Previous value (as string)
        new_value: New value (as string)
        changes: Dict of all field changes {field: {old: x, new: y}}
        metadata: Additional context data
        notes: Optional notes about the change
    
    Returns:
        The created log entry
    """
    logger.warning(f"[ACTIVITY_LOG CALLED] {module}/{action}/{entity_type}")
    
    log_entry = {
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "module": module,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "user_id": user_id,
        "user_name": user_name,
        "user_email": user_email,
        "company_id": company_id,
        "event_id": event_id,
        "parent_id": parent_id,
        "parent_type": parent_type,
        "field_changed": field_changed,
        "old_value": old_value,
        "new_value": new_value,
        "changes": changes,
        "metadata": metadata,
        "notes": notes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        await db.activity_logs.insert_one(log_entry)
        # Remove MongoDB _id before returning
        log_entry.pop("_id", None)
        logger.info(f"[ACTIVITY_LOG] {module}/{action}/{entity_type}: {entity_name}")
    except Exception as e:
        logger.error(f"[ACTIVITY_LOG ERROR] {e}")
    
    return log_entry
    
    return log_entry


async def get_activity_logs(
    company_id: str,
    module: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    event_id: Optional[str] = None,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
) -> list:
    """
    Get activity logs with various filters.
    """
    query = {"company_id": company_id}
    
    if module:
        query["module"] = module
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if event_id:
        query["event_id"] = event_id
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    
    logs = await db.activity_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    return logs


async def get_entity_history(
    company_id: str,
    entity_type: str,
    entity_id: str,
    limit: int = 100
) -> list:
    """
    Get complete history for a specific entity.
    """
    logs = await db.activity_logs.find(
        {
            "company_id": company_id,
            "entity_type": entity_type,
            "entity_id": entity_id
        },
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs


# Helper function to create user dict from User model
def user_info(user) -> dict:
    """Extract user info for logging"""
    return {
        "user_id": user.user_id,
        "user_name": user.name,
        "user_email": user.email,
        "company_id": user.company_id
    }
