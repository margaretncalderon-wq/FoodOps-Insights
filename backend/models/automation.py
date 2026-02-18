# models/automation.py - Automation Engine Models
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class TriggerType(str, Enum):
    """Types of automation triggers"""
    LEAD_CREATED = "lead_created"
    LEAD_STATUS_CHANGED = "lead_status_changed"
    LEAD_ASSIGNED = "lead_assigned"
    CLIENT_CREATED = "client_created"
    CLIENT_INACTIVE_DAYS = "client_inactive_days"
    EVENT_CREATED = "event_created"
    EVENT_STATUS_CHANGED = "event_status_changed"
    EVENT_DATE_APPROACHING = "event_date_approaching"
    PROPOSAL_CREATED = "proposal_created"
    PROPOSAL_AMOUNT_THRESHOLD = "proposal_amount_threshold"
    FOLLOW_UP_OVERDUE = "follow_up_overdue"
    SCHEDULED = "scheduled"  # Cron-like scheduled trigger


class ActionType(str, Enum):
    """Types of automation actions"""
    CREATE_TASK = "create_task"
    SEND_NOTIFICATION = "send_notification"
    SEND_EMAIL = "send_email"
    UPDATE_FIELD = "update_field"
    ASSIGN_OWNER = "assign_owner"
    ADD_TAG = "add_tag"
    CREATE_FOLLOW_UP = "create_follow_up"
    MOVE_TO_STAGE = "move_to_stage"
    WEBHOOK = "webhook"


class AutomationStatus(str, Enum):
    """Automation rule status"""
    ACTIVE = "active"
    PAUSED = "paused"
    DRAFT = "draft"


class TriggerCondition(BaseModel):
    """Condition for triggering automation"""
    field: str
    operator: str  # equals, not_equals, greater_than, less_than, contains, is_empty, is_not_empty
    value: Any


class AutomationTrigger(BaseModel):
    """Trigger configuration for automation rule"""
    type: TriggerType
    conditions: Optional[List[TriggerCondition]] = []
    # For scheduled triggers
    schedule: Optional[str] = None  # Cron expression
    # For time-based triggers
    days: Optional[int] = None  # e.g., 30 days inactive


class AutomationAction(BaseModel):
    """Action to execute when automation triggers"""
    type: ActionType
    config: Dict[str, Any] = {}
    # Examples:
    # CREATE_TASK: {"title": "...", "assignee": "owner", "due_days": 3}
    # SEND_NOTIFICATION: {"message": "...", "recipients": ["owner", "admin"]}
    # UPDATE_FIELD: {"field": "status", "value": "qualified"}
    # ASSIGN_OWNER: {"user_id": "...", "round_robin": true}


class AutomationRule(BaseModel):
    """Complete automation rule definition"""
    rule_id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    trigger: AutomationTrigger
    actions: List[AutomationAction]
    status: AutomationStatus = AutomationStatus.DRAFT
    priority: int = 0  # Higher = runs first
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_triggered_at: Optional[datetime] = None
    trigger_count: int = 0


class AutomationLog(BaseModel):
    """Log entry for automation execution"""
    log_id: str
    organization_id: str
    rule_id: str
    rule_name: str
    trigger_type: str
    trigger_data: Dict[str, Any]
    actions_executed: List[Dict[str, Any]]
    status: str  # success, partial, failed
    error_message: Optional[str] = None
    executed_at: datetime


# Request/Response Models
class CreateRuleRequest(BaseModel):
    name: str
    description: Optional[str] = None
    trigger: AutomationTrigger
    actions: List[AutomationAction]
    status: AutomationStatus = AutomationStatus.DRAFT


class UpdateRuleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger: Optional[AutomationTrigger] = None
    actions: Optional[List[AutomationAction]] = None
    status: Optional[AutomationStatus] = None
    priority: Optional[int] = None
