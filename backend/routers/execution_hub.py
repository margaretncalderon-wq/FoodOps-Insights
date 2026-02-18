# routers/execution_hub.py - Execution Hub Router
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from config import db
from dependencies import get_current_user, User
from models.execution_hub import (
    ExecutionGoal, ExecutionGoalCreate, ExecutionGoalUpdate,
    ExecutionTask, ExecutionTaskCreate, ExecutionTaskUpdate,
    ExecutionDecision, ExecutionDecisionCreate,
    ExecutionDependency, ExecutionDependencyCreate,
    ExecutionAccess, ExecutionAccessCreate,
    ExecutionStatus, TaskStatus, AccessRole, ExecutionContext,
    ChangeLogEntry, TaskAssignee, TaskNote, LinkedItem, MyPendingStats
)
from utils.activity_logger import log_activity, user_info

execution_hub_router = APIRouter(prefix="/execution-hub", tags=["Execution Hub"])


# ============== HELPER FUNCTIONS ==============

async def get_effective_goal_limit(company_id: str) -> int:
    """Get the effective execution goals limit (plan + addons)"""
    # Get base plan limits
    subscription = await db.subscriptions.find_one(
        {"company_id": company_id, "status": {"$in": ["active", "trialing"]}},
        {"_id": 0, "plan_id": 1}
    )
    plan_id = subscription.get("plan_id", "plan_starter") if subscription else "plan_starter"
    
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0, "limits": 1})
    base_limit = plan.get("limits", {}).get("execution_goals_per_month", 3) if plan else 3
    
    # Get limit boost addons
    limit_addons = await db.organization_addons.find({
        "company_id": company_id,
        "status": "active",
        "addon_type": "limit_boost"
    }, {"_id": 0, "addon_id": 1, "quantity": 1}).to_list(50)
    
    boost = 0
    for org_addon in limit_addons:
        addon_def = await db.addon_definitions.find_one(
            {"addon_id": org_addon["addon_id"]},
            {"_id": 0, "limit_key": 1, "limit_increase": 1}
        )
        if addon_def and addon_def.get("limit_key") == "execution_goals_per_month":
            boost += addon_def.get("limit_increase", 0) * org_addon.get("quantity", 1)
    
    return base_limit + boost


async def check_goal_limit(company_id: str) -> bool:
    """Check if organization can create more goals this month"""
    # Get current month's goal count
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    current_count = await db.execution_goals.count_documents({
        "company_id": company_id,
        "created_at": {"$gte": month_start.isoformat()}
    })
    
    limit = await get_effective_goal_limit(company_id)
    
    return current_count < limit


def add_change_log(user_id: str, user_name: str, action: str, field: str = None, 
                   from_value=None, to_value=None, note: str = None) -> dict:
    """Create a change log entry"""
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "field": field,
        "from_value": str(from_value) if from_value else None,
        "to_value": str(to_value) if to_value else None,
        "note": note
    }


async def check_goal_access(goal_id: str, user: User, min_role: AccessRole = AccessRole.VIEWER) -> dict:
    """Check if user has access to a goal and return the goal"""
    goal = await db.execution_goals.find_one(
        {"goal_id": goal_id},
        {"_id": 0}
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Meta de ejecución no encontrada")
    
    # Owner always has access
    if goal.get("owner_id") == user.user_id:
        return goal
    
    # Check company membership for internal users
    if goal.get("company_id") == user.company_id:
        return goal
    
    # Check explicit access for external collaborators
    access = await db.execution_access.find_one({
        "goal_id": goal_id,
        "user_id": user.user_id
    })
    
    if not access:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta meta")
    
    # Check minimum role
    role_hierarchy = {
        AccessRole.VIEWER: 0,
        AccessRole.COLLABORATOR: 1,
        AccessRole.TEAM_MEMBER: 2,
        AccessRole.OWNER: 3
    }
    
    if role_hierarchy.get(access.get("role"), 0) < role_hierarchy.get(min_role, 0):
        raise HTTPException(status_code=403, detail="No tienes permisos suficientes")
    
    return goal


async def send_execution_notification(email: str, subject: str, body: str):
    """Send email notification (placeholder - integrate with Resend)"""
    # TODO: Integrate with Resend when API key is available
    print(f"[EMAIL] To: {email}, Subject: {subject}")


# ============== EXECUTION GOALS ==============

@execution_hub_router.get("/usage")
async def get_execution_hub_usage(user: User = Depends(get_current_user)):
    """Get usage stats for Execution Hub (goals created this month vs limit)"""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Count goals created this month
    current_count = await db.execution_goals.count_documents({
        "company_id": user.company_id,
        "created_at": {"$gte": month_start.isoformat()}
    })
    
    # Get effective limit
    limit = await get_effective_goal_limit(user.company_id)
    
    return {
        "goals_created_this_month": current_count,
        "goals_limit": limit,
        "remaining": max(0, limit - current_count),
        "is_unlimited": limit >= 999,
        "can_create": current_count < limit
    }


@execution_hub_router.get("/goals")
async def get_execution_goals(
    user: User = Depends(get_current_user),
    status: Optional[str] = None,
    context_type: Optional[str] = None
):
    """Get all execution goals for the organization + shared goals"""
    query = {
        "$or": [
            {"company_id": user.company_id},
            {"owner_id": user.user_id}
        ]
    }
    
    if status:
        query["status"] = status
    if context_type:
        query["context_type"] = context_type
    
    goals = await db.execution_goals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Also get goals where user has explicit access
    shared_access = await db.execution_access.find(
        {"user_id": user.user_id},
        {"_id": 0, "goal_id": 1}
    ).to_list(100)
    
    shared_goal_ids = [a["goal_id"] for a in shared_access]
    if shared_goal_ids:
        shared_goals = await db.execution_goals.find(
            {"goal_id": {"$in": shared_goal_ids}},
            {"_id": 0}
        ).to_list(100)
        
        # Merge without duplicates
        existing_ids = {g["goal_id"] for g in goals}
        for sg in shared_goals:
            if sg["goal_id"] not in existing_ids:
                goals.append(sg)
    
    return goals


@execution_hub_router.get("/goals/active")
async def get_active_execution_goals(user: User = Depends(get_current_user)):
    """Get active execution goals (Planning, In Progress, Blocked)"""
    return await get_execution_goals(user, status=None)


@execution_hub_router.post("/goals")
async def create_execution_goal(
    data: ExecutionGoalCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """Create a new execution goal"""
    # Check goal limit
    can_create = await check_goal_limit(user.company_id)
    if not can_create:
        limit = await get_effective_goal_limit(user.company_id)
        raise HTTPException(
            status_code=403, 
            detail=f"Has alcanzado el límite de {limit} metas de ejecución este mes. Actualiza tu plan o compra un add-on para crear más."
        )
    
    now = datetime.now(timezone.utc)
    goal_id = f"goal_{uuid.uuid4().hex[:12]}"
    
    # Get context name if context_id provided
    context_name = None
    if data.context_type == ExecutionContext.EVENT and data.context_id:
        event = await db.events.find_one({"event_id": data.context_id}, {"name": 1})
        context_name = event.get("name") if event else None
    
    goal_doc = {
        "goal_id": goal_id,
        "company_id": user.company_id,
        "title": data.title,
        "objective": data.objective,
        "owner_id": user.user_id,
        "owner_name": user.name or user.email,
        "status": ExecutionStatus.PLANNING.value,
        "context_type": data.context_type.value,
        "context_id": data.context_id,
        "context_name": context_name,
        "impact_areas": [ia.value for ia in data.impact_areas],
        "start_date": data.start_date.isoformat() if data.start_date else None,
        "target_date": data.target_date.isoformat() if data.target_date else None,
        "notes": [],
        "linked_items": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.execution_goals.insert_one(goal_doc)
    del goal_doc["_id"]
    
    # Log activity
    await log_activity(
        module="execution_hub",
        action="create",
        entity_type="goal",
        entity_id=goal_id,
        entity_name=data.title,
        event_id=data.context_id if data.context_type == ExecutionContext.EVENT else None,
        **user_info(user)
    )
    
    return goal_doc


@execution_hub_router.get("/goals/{goal_id}")
async def get_execution_goal(goal_id: str, user: User = Depends(get_current_user)):
    """Get a single execution goal with all details"""
    goal = await check_goal_access(goal_id, user)
    
    # Get tasks
    tasks = await db.execution_tasks.find(
        {"goal_id": goal_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    # Get decisions
    decisions = await db.execution_decisions.find(
        {"goal_id": goal_id},
        {"_id": 0}
    ).sort("date", -1).to_list(100)
    
    # Get dependencies
    dependencies = await db.execution_dependencies.find(
        {"goal_id": goal_id},
        {"_id": 0}
    ).to_list(50)
    
    # Get access list
    access_list = await db.execution_access.find(
        {"goal_id": goal_id},
        {"_id": 0}
    ).to_list(50)
    
    return {
        **goal,
        "tasks": tasks,
        "decisions": decisions,
        "dependencies": dependencies,
        "access_list": access_list
    }


@execution_hub_router.put("/goals/{goal_id}")
async def update_execution_goal(
    goal_id: str,
    data: ExecutionGoalUpdate,
    user: User = Depends(get_current_user)
):
    """Update an execution goal"""
    goal = await check_goal_access(goal_id, user, AccessRole.OWNER)
    
    now = datetime.now(timezone.utc)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Convert enums to values
    if "status" in update_data:
        update_data["status"] = update_data["status"].value
    if "context_type" in update_data:
        update_data["context_type"] = update_data["context_type"].value
    if "impact_areas" in update_data:
        update_data["impact_areas"] = [ia.value for ia in update_data["impact_areas"]]
    
    # Convert dates
    for date_field in ["start_date", "target_date"]:
        if date_field in update_data and update_data[date_field]:
            update_data[date_field] = update_data[date_field].isoformat()
    
    update_data["updated_at"] = now.isoformat()
    
    await db.execution_goals.update_one(
        {"goal_id": goal_id},
        {"$set": update_data}
    )
    
    # Log activity
    await log_activity(
        module="execution_hub",
        action="update",
        entity_type="goal",
        entity_id=goal_id,
        entity_name=update_data.get("title", goal.get("title")),
        **user_info(user)
    )
    
    return await get_execution_goal(goal_id, user)


@execution_hub_router.delete("/goals/{goal_id}")
async def delete_execution_goal(goal_id: str, user: User = Depends(get_current_user)):
    """Delete an execution goal and all related data"""
    goal = await check_goal_access(goal_id, user, AccessRole.OWNER)
    
    # Delete all related data
    await db.execution_goals.delete_one({"goal_id": goal_id})
    await db.execution_tasks.delete_many({"goal_id": goal_id})
    await db.execution_decisions.delete_many({"goal_id": goal_id})
    await db.execution_dependencies.delete_many({"goal_id": goal_id})
    await db.execution_access.delete_many({"goal_id": goal_id})
    
    # Log activity
    await log_activity(
        module="execution_hub",
        action="delete",
        entity_type="goal",
        entity_id=goal_id,
        entity_name=goal.get("title"),
        **user_info(user)
    )
    
    return {"message": "Meta eliminada exitosamente"}


# ============== GOAL NOTES ==============

@execution_hub_router.post("/goals/{goal_id}/notes")
async def add_goal_note(
    goal_id: str,
    note: dict,
    user: User = Depends(get_current_user)
):
    """Add a note to an execution goal"""
    await check_goal_access(goal_id, user, AccessRole.COLLABORATOR)
    
    note_entry = {
        "note_id": f"note_{uuid.uuid4().hex[:8]}",
        "user_id": user.user_id,
        "user_name": user.name or user.email,
        "content": note.get("content", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.execution_goals.update_one(
        {"goal_id": goal_id},
        {
            "$push": {"notes": note_entry},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return note_entry


# ============== EXECUTION TASKS ==============

@execution_hub_router.get("/goals/{goal_id}/tasks")
async def get_goal_tasks(goal_id: str, user: User = Depends(get_current_user)):
    """Get all tasks for a goal"""
    await check_goal_access(goal_id, user)
    
    tasks = await db.execution_tasks.find(
        {"goal_id": goal_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    return tasks


@execution_hub_router.post("/goals/{goal_id}/tasks")
async def create_task(
    goal_id: str,
    data: ExecutionTaskCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """Create a new task for a goal"""
    goal = await check_goal_access(goal_id, user, AccessRole.TEAM_MEMBER)
    
    now = datetime.now(timezone.utc)
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    
    # Build assignees list
    assignees = []
    for assignee_id in data.assignee_ids:
        assignee_user = await db.users.find_one({"user_id": assignee_id}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})
        if assignee_user:
            assignees.append({
                "user_id": assignee_user["user_id"],
                "name": assignee_user.get("name") or assignee_user.get("email", ""),
                "email": assignee_user.get("email"),
                "role": AccessRole.TEAM_MEMBER.value,
                "is_external": False,
                "assigned_at": now.isoformat(),
                "assigned_by": user.user_id
            })
    
    # Initial change log
    change_log = [add_change_log(user.user_id, user.name or user.email, "created")]
    
    task_doc = {
        "task_id": task_id,
        "goal_id": goal_id,
        "company_id": user.company_id,
        "title": data.title,
        "description": data.description,
        "status": data.status.value,
        "assignees": assignees,
        "due_date": data.due_date.isoformat() if data.due_date else None,
        "notes": [],
        "change_log": change_log,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.execution_tasks.insert_one(task_doc)
    del task_doc["_id"]
    
    # Send notifications to assignees
    for assignee in assignees:
        if assignee.get("email") and assignee["user_id"] != user.user_id:
            background_tasks.add_task(
                send_execution_notification,
                assignee["email"],
                f"Nueva tarea asignada: {data.title}",
                f"Se te ha asignado la tarea '{data.title}' en la meta '{goal.get('title')}'."
            )
    
    return task_doc


@execution_hub_router.get("/tasks/{task_id}")
async def get_task(task_id: str, user: User = Depends(get_current_user)):
    """Get a single task with all details"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    await check_goal_access(task["goal_id"], user)
    return task


@execution_hub_router.put("/tasks/{task_id}")
async def update_task(
    task_id: str,
    data: ExecutionTaskUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """Update a task"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    goal = await check_goal_access(task["goal_id"], user, AccessRole.COLLABORATOR)
    
    # Collaborators can only update tasks assigned to them
    is_assignee = any(a["user_id"] == user.user_id for a in task.get("assignees", []))
    access = await db.execution_access.find_one({"goal_id": task["goal_id"], "user_id": user.user_id})
    
    if access and access.get("role") == AccessRole.COLLABORATOR.value and not is_assignee:
        raise HTTPException(status_code=403, detail="Solo puedes actualizar tareas asignadas a ti")
    
    now = datetime.now(timezone.utc)
    update_data = {}
    change_logs = []
    
    # Track changes
    if data.title and data.title != task.get("title"):
        change_logs.append(add_change_log(user.user_id, user.name or user.email, "field_changed", "title", task.get("title"), data.title))
        update_data["title"] = data.title
    
    if data.description is not None and data.description != task.get("description"):
        change_logs.append(add_change_log(user.user_id, user.name or user.email, "field_changed", "description"))
        update_data["description"] = data.description
    
    if data.status and data.status.value != task.get("status"):
        change_logs.append(add_change_log(user.user_id, user.name or user.email, "status_changed", "status", task.get("status"), data.status.value))
        update_data["status"] = data.status.value
    
    if data.due_date:
        update_data["due_date"] = data.due_date.isoformat()
    
    if update_data:
        update_data["updated_at"] = now.isoformat()
        
        await db.execution_tasks.update_one(
            {"task_id": task_id},
            {
                "$set": update_data,
                "$push": {"change_log": {"$each": change_logs}}
            }
        )
    
    return await get_task(task_id, user)


@execution_hub_router.post("/tasks/{task_id}/assignees")
async def add_task_assignee(
    task_id: str,
    assignee_data: dict,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """Add an assignee to a task"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    await check_goal_access(task["goal_id"], user, AccessRole.TEAM_MEMBER)
    
    assignee_id = assignee_data.get("user_id")
    assignee_user = await db.users.find_one({"user_id": assignee_id}, {"_id": 0})
    
    if not assignee_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    now = datetime.now(timezone.utc)
    new_assignee = {
        "user_id": assignee_user["user_id"],
        "name": assignee_user.get("name") or assignee_user.get("email", ""),
        "email": assignee_user.get("email"),
        "role": assignee_data.get("role", AccessRole.TEAM_MEMBER.value),
        "is_external": assignee_data.get("is_external", False),
        "assigned_at": now.isoformat(),
        "assigned_by": user.user_id
    }
    
    change_log = add_change_log(user.user_id, user.name or user.email, "assignee_added", "assignees", None, new_assignee["name"])
    
    await db.execution_tasks.update_one(
        {"task_id": task_id},
        {
            "$push": {"assignees": new_assignee, "change_log": change_log},
            "$set": {"updated_at": now.isoformat()}
        }
    )
    
    # Send notification
    if new_assignee.get("email"):
        goal = await db.execution_goals.find_one({"goal_id": task["goal_id"]}, {"title": 1})
        background_tasks.add_task(
            send_execution_notification,
            new_assignee["email"],
            f"Nueva tarea asignada: {task['title']}",
            f"Se te ha asignado la tarea '{task['title']}' en la meta '{goal.get('title')}'."
        )
    
    return await get_task(task_id, user)


@execution_hub_router.delete("/tasks/{task_id}/assignees/{assignee_id}")
async def remove_task_assignee(
    task_id: str,
    assignee_id: str,
    user: User = Depends(get_current_user)
):
    """Remove an assignee from a task"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    await check_goal_access(task["goal_id"], user, AccessRole.TEAM_MEMBER)
    
    # Find assignee name for change log
    assignee_name = next((a["name"] for a in task.get("assignees", []) if a["user_id"] == assignee_id), "Unknown")
    
    change_log = add_change_log(user.user_id, user.name or user.email, "assignee_removed", "assignees", assignee_name, None)
    
    await db.execution_tasks.update_one(
        {"task_id": task_id},
        {
            "$pull": {"assignees": {"user_id": assignee_id}},
            "$push": {"change_log": change_log},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {"message": "Asignado removido"}


# ============== TASK NOTES ==============

@execution_hub_router.post("/tasks/{task_id}/notes")
async def add_task_note(
    task_id: str,
    note: dict,
    user: User = Depends(get_current_user)
):
    """Add a note to a task"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    await check_goal_access(task["goal_id"], user, AccessRole.COLLABORATOR)
    
    # Collaborators can only add notes to tasks assigned to them
    is_assignee = any(a["user_id"] == user.user_id for a in task.get("assignees", []))
    access = await db.execution_access.find_one({"goal_id": task["goal_id"], "user_id": user.user_id})
    
    if access and access.get("role") == AccessRole.COLLABORATOR.value and not is_assignee:
        raise HTTPException(status_code=403, detail="Solo puedes agregar notas a tareas asignadas a ti")
    
    now = datetime.now(timezone.utc)
    note_entry = {
        "note_id": f"note_{uuid.uuid4().hex[:8]}",
        "user_id": user.user_id,
        "user_name": user.name or user.email,
        "content": note.get("content", ""),
        "created_at": now.isoformat()
    }
    
    change_log = add_change_log(user.user_id, user.name or user.email, "note_added")
    
    await db.execution_tasks.update_one(
        {"task_id": task_id},
        {
            "$push": {"notes": note_entry, "change_log": change_log},
            "$set": {"updated_at": now.isoformat()}
        }
    )
    
    return note_entry


# ============== DECISIONS ==============

@execution_hub_router.post("/goals/{goal_id}/decisions")
async def add_decision(
    goal_id: str,
    data: ExecutionDecisionCreate,
    user: User = Depends(get_current_user)
):
    """Add a decision to a goal"""
    await check_goal_access(goal_id, user, AccessRole.TEAM_MEMBER)
    
    now = datetime.now(timezone.utc)
    decision_doc = {
        "decision_id": f"dec_{uuid.uuid4().hex[:12]}",
        "goal_id": goal_id,
        "company_id": user.company_id,
        "decision": data.decision,
        "rationale": data.rationale,
        "decided_by": user.user_id,
        "decided_by_name": user.name or user.email,
        "date": now.isoformat(),
        "created_at": now.isoformat()
    }
    
    await db.execution_decisions.insert_one(decision_doc)
    del decision_doc["_id"]
    
    return decision_doc


# ============== DEPENDENCIES ==============

@execution_hub_router.post("/goals/{goal_id}/dependencies")
async def add_dependency(
    goal_id: str,
    data: ExecutionDependencyCreate,
    user: User = Depends(get_current_user)
):
    """Add a dependency to a goal"""
    await check_goal_access(goal_id, user, AccessRole.TEAM_MEMBER)
    
    now = datetime.now(timezone.utc)
    dep_doc = {
        "dependency_id": f"dep_{uuid.uuid4().hex[:12]}",
        "goal_id": goal_id,
        "company_id": user.company_id,
        "title": data.title,
        "description": data.description,
        "status": data.status,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "resolved_at": None,
        "resolved_by": None
    }
    
    await db.execution_dependencies.insert_one(dep_doc)
    del dep_doc["_id"]
    
    return dep_doc


@execution_hub_router.put("/dependencies/{dependency_id}")
async def update_dependency(
    dependency_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a dependency"""
    dep = await db.execution_dependencies.find_one({"dependency_id": dependency_id}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")
    
    await check_goal_access(dep["goal_id"], user, AccessRole.TEAM_MEMBER)
    
    update_data = {}
    if "status" in data:
        update_data["status"] = data["status"]
        if data["status"] == "resolved":
            update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
            update_data["resolved_by"] = user.user_id
    
    if "title" in data:
        update_data["title"] = data["title"]
    if "description" in data:
        update_data["description"] = data["description"]
    
    if update_data:
        await db.execution_dependencies.update_one(
            {"dependency_id": dependency_id},
            {"$set": update_data}
        )
    
    return await db.execution_dependencies.find_one({"dependency_id": dependency_id}, {"_id": 0})


# ============== LINKED ITEMS ==============

@execution_hub_router.post("/goals/{goal_id}/linked-items")
async def add_linked_item(
    goal_id: str,
    item_data: dict,
    user: User = Depends(get_current_user)
):
    """Link an item (event, vendor, menu, supply) to a goal"""
    await check_goal_access(goal_id, user, AccessRole.TEAM_MEMBER)
    
    linked_item = {
        "item_type": item_data.get("item_type"),
        "item_id": item_data.get("item_id"),
        "item_name": item_data.get("item_name"),
        "linked_at": datetime.now(timezone.utc).isoformat(),
        "linked_by": user.user_id
    }
    
    await db.execution_goals.update_one(
        {"goal_id": goal_id},
        {
            "$push": {"linked_items": linked_item},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return linked_item


@execution_hub_router.delete("/goals/{goal_id}/linked-items/{item_id}")
async def remove_linked_item(
    goal_id: str,
    item_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a linked item from a goal"""
    await check_goal_access(goal_id, user, AccessRole.TEAM_MEMBER)
    
    await db.execution_goals.update_one(
        {"goal_id": goal_id},
        {
            "$pull": {"linked_items": {"item_id": item_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {"message": "Item desvinculado"}


# ============== ACCESS / COLLABORATORS ==============

@execution_hub_router.post("/goals/{goal_id}/access")
async def invite_collaborator(
    goal_id: str,
    data: ExecutionAccessCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """Invite a collaborator to a goal"""
    goal = await check_goal_access(goal_id, user, AccessRole.OWNER)
    
    # Check if user exists, or create placeholder for external
    invited_user = await db.users.find_one({"email": data.user_email}, {"_id": 0})
    
    now = datetime.now(timezone.utc)
    access_id = f"access_{uuid.uuid4().hex[:12]}"
    
    access_doc = {
        "access_id": access_id,
        "goal_id": goal_id,
        "company_id": user.company_id,
        "user_id": invited_user["user_id"] if invited_user else f"pending_{uuid.uuid4().hex[:8]}",
        "user_email": data.user_email,
        "user_name": invited_user.get("name", data.user_email) if invited_user else data.user_email,
        "role": data.role.value,
        "is_external": data.is_external,
        "invited_by": user.user_id,
        "invited_by_name": user.name or user.email,
        "invited_at": now.isoformat(),
        "accepted_at": now.isoformat() if invited_user else None
    }
    
    await db.execution_access.insert_one(access_doc)
    del access_doc["_id"]
    
    # Send invitation email
    background_tasks.add_task(
        send_execution_notification,
        data.user_email,
        f"Te han invitado a colaborar: {goal['title']}",
        f"{user.name or user.email} te ha invitado a colaborar en la meta de ejecución '{goal['title']}'."
    )
    
    return access_doc


@execution_hub_router.delete("/goals/{goal_id}/access/{access_id}")
async def remove_collaborator(
    goal_id: str,
    access_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a collaborator from a goal"""
    await check_goal_access(goal_id, user, AccessRole.OWNER)
    
    await db.execution_access.delete_one({"access_id": access_id})
    
    return {"message": "Colaborador removido"}


# ============== MY PENDING (Widget for System Pulse) ==============

@execution_hub_router.get("/my-pending")
async def get_my_pending(user: User = Depends(get_current_user)):
    """Get pending items for the current user (for System Pulse widget)"""
    
    # Goals where user is owner
    owned_goals = await db.execution_goals.find(
        {
            "owner_id": user.user_id,
            "status": {"$in": ["planning", "in_progress", "blocked"]}
        },
        {"_id": 0, "goal_id": 1, "title": 1, "status": 1, "target_date": 1}
    ).to_list(50)
    
    # Tasks assigned to user
    assigned_tasks = await db.execution_tasks.find(
        {
            "assignees.user_id": user.user_id,
            "status": {"$in": ["pending", "in_progress"]}
        },
        {"_id": 0, "task_id": 1, "goal_id": 1, "title": 1, "status": 1, "due_date": 1}
    ).to_list(100)
    
    # Count blocked goals
    blocked_count = len([g for g in owned_goals if g.get("status") == "blocked"])
    
    return MyPendingStats(
        active_goals=len(owned_goals),
        pending_tasks=len(assigned_tasks),
        blocked_goals=blocked_count,
        decisions_waiting=0,  # TODO: implement if needed
        goals=owned_goals,
        tasks=assigned_tasks
    )


# ============== EXECUTION SIGNALS (for System Pulse) ==============

@execution_hub_router.get("/signals")
async def get_execution_signals(user: User = Depends(get_current_user)):
    """Get execution signals for System Pulse"""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    
    # Blocked goals
    blocked_goals = await db.execution_goals.find(
        {"company_id": user.company_id, "status": "blocked"},
        {"_id": 0, "goal_id": 1, "title": 1, "owner_name": 1}
    ).to_list(50)
    
    # Goals at risk (target_date approaching and not live)
    at_risk_goals = await db.execution_goals.find(
        {
            "company_id": user.company_id,
            "status": {"$in": ["planning", "in_progress"]},
            "target_date": {"$lte": (now + timedelta(days=7)).isoformat(), "$gte": now.isoformat()}
        },
        {"_id": 0, "goal_id": 1, "title": 1, "target_date": 1, "owner_name": 1}
    ).to_list(50)
    
    # Goals completed this week
    completed_goals = await db.execution_goals.find(
        {
            "company_id": user.company_id,
            "status": "live",
            "updated_at": {"$gte": week_ago.isoformat()}
        },
        {"_id": 0, "goal_id": 1, "title": 1, "owner_name": 1}
    ).to_list(50)
    
    signals = []
    
    for goal in blocked_goals:
        signals.append({
            "type": "goal_blocked",
            "severity": "critical",
            "title": "Meta Bloqueada",
            "message": f"'{goal['title']}' está bloqueada",
            "goal_id": goal["goal_id"],
            "owner": goal.get("owner_name")
        })
    
    for goal in at_risk_goals:
        signals.append({
            "type": "goal_at_risk",
            "severity": "warning",
            "title": "Meta en Riesgo",
            "message": f"'{goal['title']}' tiene fecha límite próxima",
            "goal_id": goal["goal_id"],
            "target_date": goal.get("target_date")
        })
    
    for goal in completed_goals:
        signals.append({
            "type": "goal_completed",
            "severity": "success",
            "title": "Meta Completada",
            "message": f"'{goal['title']}' fue completada esta semana",
            "goal_id": goal["goal_id"]
        })
    
    return {
        "signals": signals,
        "summary": {
            "blocked": len(blocked_goals),
            "at_risk": len(at_risk_goals),
            "completed_this_week": len(completed_goals)
        }
    }
