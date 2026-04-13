# models/execution_hub.py - Execution Hub Models
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class ExecutionStatus(str, Enum):
    PLANNING = "planning"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    LIVE = "live"
    ARCHIVED = "archived"


class ImpactArea(str, Enum):
    COST = "cost"
    QUALITY = "quality"
    SPEED = "speed"
    RISK = "risk"


class ExecutionContext(str, Enum):
    EVENT = "event"
    DEPARTMENT = "department"
    ORGANIZATIONAL = "organizational"
    PERSONAL = "personal"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"


class AccessRole(str, Enum):
    OWNER = "owner"
    TEAM_MEMBER = "team_member"
    COLLABORATOR = "collaborator"
    VIEWER = "viewer"


# ============== CHANGE LOG ==============

class ChangeLogEntry(BaseModel):
    timestamp: datetime
    user_id: str
    user_name: str
    action: str  # status_changed, note_added, assignee_added, assignee_removed, etc.
    field: Optional[str] = None
    from_value: Optional[Any] = None
    to_value: Optional[Any] = None
    note: Optional[str] = None


# ============== TASK ASSIGNEE ==============

class TaskAssignee(BaseModel):
    user_id: str
    name: str
    email: Optional[str] = None
    role: AccessRole = AccessRole.TEAM_MEMBER
    is_external: bool = False
    assigned_at: datetime = Field(default_factory=lambda: datetime.now())
    assigned_by: Optional[str] = None


# ============== TASK NOTE ==============

class TaskNote(BaseModel):
    note_id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now())


# ============== EXECUTION TASK ==============

class ExecutionTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    assignee_ids: List[str] = []  # User IDs to assign
    due_date: Optional[datetime] = None


class ExecutionTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None


class ExecutionTask(BaseModel):
    task_id: str
    goal_id: str
    company_id: str
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    assignees: List[TaskAssignee] = []
    due_date: Optional[datetime] = None
    notes: List[TaskNote] = []
    change_log: List[ChangeLogEntry] = []
    created_by: str
    created_at: datetime
    updated_at: datetime


# ============== EXECUTION DECISION ==============

class ExecutionDecisionCreate(BaseModel):
    decision: str
    rationale: Optional[str] = None


class ExecutionDecision(BaseModel):
    decision_id: str
    goal_id: str
    company_id: str
    decision: str
    rationale: Optional[str] = None
    decided_by: str
    decided_by_name: str
    date: datetime
    created_at: datetime


# ============== EXECUTION DEPENDENCY ==============

class ExecutionDependencyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "pending"  # pending, resolved, blocked


class ExecutionDependency(BaseModel):
    dependency_id: str
    goal_id: str
    company_id: str
    title: str
    description: Optional[str] = None
    status: str = "pending"
    created_by: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None


# ============== LINKED ITEM ==============

class LinkedItem(BaseModel):
    item_type: str  # event, vendor, menu, supply
    item_id: str
    item_name: str
    linked_at: datetime = Field(default_factory=lambda: datetime.now())
    linked_by: str


# ============== EXECUTION GOAL ==============

class ExecutionGoalCreate(BaseModel):
    title: str
    objective: str
    context_type: ExecutionContext = ExecutionContext.ORGANIZATIONAL
    context_id: Optional[str] = None  # event_id, department, etc.
    impact_areas: List[ImpactArea] = []
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    visibility: Optional[str] = "org"  # "private" | "team" | "org"


class ExecutionGoalUpdate(BaseModel):
    title: Optional[str] = None
    objective: Optional[str] = None
    status: Optional[ExecutionStatus] = None
    context_type: Optional[ExecutionContext] = None
    context_id: Optional[str] = None
    impact_areas: Optional[List[ImpactArea]] = None
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    visibility: Optional[str] = None  # "private" | "team" | "org"


class ExecutionGoal(BaseModel):
    goal_id: str
    company_id: str
    title: str
    objective: str
    owner_id: str
    owner_name: str
    status: ExecutionStatus = ExecutionStatus.PLANNING
    context_type: ExecutionContext = ExecutionContext.ORGANIZATIONAL
    context_id: Optional[str] = None
    context_name: Optional[str] = None
    impact_areas: List[ImpactArea] = []
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    # General notes for the goal
    notes: List[TaskNote] = []
    # Linked items
    linked_items: List[LinkedItem] = []
    # Metadata
    created_at: datetime
    updated_at: datetime


# ============== EXECUTION ACCESS ==============

class ExecutionAccessCreate(BaseModel):
    user_email: str
    role: AccessRole = AccessRole.COLLABORATOR
    is_external: bool = True


class ExecutionAccess(BaseModel):
    access_id: str
    goal_id: str
    company_id: str
    user_id: str
    user_email: str
    user_name: str
    role: AccessRole
    is_external: bool = False
    invited_by: str
    invited_by_name: str
    invited_at: datetime
    accepted_at: Optional[datetime] = None


# ============== MY PENDING (Widget) ==============

class MyPendingStats(BaseModel):
    active_goals: int = 0
    pending_tasks: int = 0
    blocked_goals: int = 0
    decisions_waiting: int = 0
    follow_ups_due: int = 0  # Follow-ups due today or overdue
    goals: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    follow_ups: List[Dict[str, Any]] = []
