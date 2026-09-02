# routers/execution_hub.py - Execution Hub Router
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import os
from pathlib import Path

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

UPLOADS_DIR = Path("/app/backend/uploads")
EXEC_ATTACHMENTS_DIR = UPLOADS_DIR / "exec_attachments"
EXEC_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
    "video/mp4", "video/webm",
}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB


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
    
    visibility = goal.get("visibility", "org")
    
    # Same company checks (respecting visibility)
    if goal.get("company_id") == user.company_id:
        if visibility == "org" or visibility is None:
            return goal
        if visibility == "team":
            # Check if user is assigned to any task in this goal
            task = await db.execution_tasks.find_one({
                "goal_id": goal_id,
                "assignees.user_id": user.user_id
            })
            if task:
                return goal
        # visibility == "private" — fall through to explicit access check
    
    # Check explicit individual access (execution_access)
    access = await db.execution_access.find_one({
        "goal_id": goal_id,
        "user_id": user.user_id
    })
    if access:
        role_hierarchy = {
            AccessRole.VIEWER: 0,
            AccessRole.COLLABORATOR: 1,
            AccessRole.TEAM_MEMBER: 2,
            AccessRole.OWNER: 3
        }
        if role_hierarchy.get(access.get("role"), 0) < role_hierarchy.get(min_role, 0):
            raise HTTPException(status_code=403, detail="No tienes permisos suficientes")
        return goal
    
    # Check cross-org sharing (shared_entities)
    if user.company_id:
        shared = await db.shared_entities.find_one({
            "entity_id": goal_id,
            "entity_type": "project",
            "target_org_id": user.company_id,
            "status": "active"
        })
        if shared:
            return goal
    
    raise HTTPException(status_code=403, detail="No tienes acceso a esta meta")


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
    context_type: Optional[str] = None,
    scope: Optional[str] = None  # "owned" | "shared" | None (both)
):
    """Get execution goals filtered by visibility permissions"""
    goals = []
    seen_ids = set()
    
    # Get owned goals (unless scope is "shared" only)
    if scope != "shared":
        # 1. Goals owned by user (always visible regardless of visibility)
        owner_query = {"owner_id": user.user_id}
        if status:
            owner_query["status"] = status
        if context_type:
            owner_query["context_type"] = context_type
        
        owned_goals = await db.execution_goals.find(owner_query, {"_id": 0}).sort("created_at", -1).to_list(500)
        for g in owned_goals:
            g["_access_type"] = "owned"
            goals.append(g)
            seen_ids.add(g["goal_id"])
        
        # 2. Goals in user's org with visibility=org (everyone in org sees these)
        if user.company_id:
            org_query = {
                "company_id": user.company_id,
                "goal_id": {"$nin": list(seen_ids)},
                "$or": [
                    {"visibility": "org"},
                    {"visibility": {"$exists": False}},  # Backwards compat: no visibility = org
                ]
            }
            if status:
                org_query["status"] = status
            if context_type:
                org_query["context_type"] = context_type
            
            org_goals = await db.execution_goals.find(org_query, {"_id": 0}).sort("created_at", -1).to_list(500)
            for g in org_goals:
                g["_access_type"] = "owned"
                goals.append(g)
                seen_ids.add(g["goal_id"])
        
        # 3. Goals with visibility=team where user is assigned to a task
        if user.company_id:
            # Find tasks assigned to this user
            assigned_tasks = await db.execution_tasks.find(
                {"assignees.user_id": user.user_id},
                {"_id": 0, "goal_id": 1}
            ).to_list(200)
            assigned_goal_ids = list(set(t["goal_id"] for t in assigned_tasks) - seen_ids)
            
            if assigned_goal_ids:
                team_query = {
                    "goal_id": {"$in": assigned_goal_ids},
                    "visibility": "team",
                    "company_id": user.company_id
                }
                if status:
                    team_query["status"] = status
                
                team_goals = await db.execution_goals.find(team_query, {"_id": 0}).to_list(200)
                for g in team_goals:
                    g["_access_type"] = "owned"
                    goals.append(g)
                    seen_ids.add(g["goal_id"])
        
        # 4. Goals where user has explicit individual access (execution_access)
        shared_access = await db.execution_access.find(
            {"user_id": user.user_id},
            {"_id": 0, "goal_id": 1}
        ).to_list(100)
        
        explicit_goal_ids = [a["goal_id"] for a in shared_access if a["goal_id"] not in seen_ids]
        if explicit_goal_ids:
            explicit_goals = await db.execution_goals.find(
                {"goal_id": {"$in": explicit_goal_ids}},
                {"_id": 0}
            ).to_list(100)
            for sg in explicit_goals:
                sg["_access_type"] = "owned"
                goals.append(sg)
                seen_ids.add(sg["goal_id"])
    
    # 5. Cross-org shared goals (via shared_entities - explicit sharing only)
    if scope != "owned" and user.company_id:
        shared_entities = await db.shared_entities.find({
            "target_org_id": user.company_id,
            "entity_type": "project",
            "status": "active"
        }, {"_id": 0, "entity_id": 1, "source_org_name": 1, "permission_level": 1, "scope": 1}).to_list(100)
        
        if shared_entities:
            shared_goal_ids = [s["entity_id"] for s in shared_entities if s["entity_id"] not in seen_ids]
            shared_info = {s["entity_id"]: s for s in shared_entities}
            
            if shared_goal_ids:
                shared_goals = await db.execution_goals.find(
                    {"goal_id": {"$in": shared_goal_ids}},
                    {"_id": 0}
                ).to_list(100)
                
                for sg in shared_goals:
                    info = shared_info.get(sg["goal_id"], {})
                    sg["_access_type"] = "shared"
                    sg["_shared_from"] = info.get("source_org_name", "Unknown")
                    sg["_permission_level"] = info.get("permission_level", "view")
                    sg["_allowed_scope"] = info.get("scope", [])
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
        "visibility": data.visibility or "org",
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
    goal = await check_goal_access(goal_id, user, AccessRole.TEAM_MEMBER)
    
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
        "attachments": note.get("attachments", []),
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


@execution_hub_router.put("/goals/{goal_id}/notes/{note_id}")
async def update_goal_note(goal_id: str, note_id: str, note: dict, user: User = Depends(get_current_user)):
    """Update a goal note (only by the note author)"""
    await check_goal_access(goal_id, user)
    
    goal = await db.execution_goals.find_one({"goal_id": goal_id}, {"_id": 0, "notes": 1})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    note_found = False
    for n in (goal.get("notes") or []):
        if n.get("note_id") == note_id:
            if n.get("user_id") != user.user_id:
                raise HTTPException(status_code=403, detail="Solo puedes editar tus propias notas")
            note_found = True
            break
    
    if not note_found:
        raise HTTPException(status_code=404, detail="Note not found")
    
    await db.execution_goals.update_one(
        {"goal_id": goal_id, "notes.note_id": note_id},
        {"$set": {
            "notes.$.content": note.get("content", ""),
            "notes.$.attachments": note.get("attachments", []),
            "notes.$.edited_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"success": True}


@execution_hub_router.delete("/goals/{goal_id}/notes/{note_id}")
async def delete_goal_note(goal_id: str, note_id: str, user: User = Depends(get_current_user)):
    """Delete a goal note (only by the note author or goal owner)"""
    goal = await check_goal_access(goal_id, user)
    
    # Check if user is author or goal owner
    note_found = False
    for n in (goal.get("notes") or []):
        if n.get("note_id") == note_id:
            if n.get("user_id") != user.user_id and goal.get("owner_id") != user.user_id:
                raise HTTPException(status_code=403, detail="No tienes permisos para eliminar esta nota")
            note_found = True
            break
    
    if not note_found:
        raise HTTPException(status_code=404, detail="Note not found")
    
    await db.execution_goals.update_one(
        {"goal_id": goal_id},
        {"$pull": {"notes": {"note_id": note_id}}}
    )
    return {"success": True}



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


@execution_hub_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: User = Depends(get_current_user)):
    """Delete a task"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await check_goal_access(task["goal_id"], user, AccessRole.TEAM_MEMBER)
    
    await db.execution_tasks.delete_one({"task_id": task_id})
    
    # Update goal's task count
    remaining = await db.execution_tasks.count_documents({"goal_id": task["goal_id"]})
    await db.execution_goals.update_one(
        {"goal_id": task["goal_id"]},
        {"$set": {"tasks_count": remaining, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True}


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
        "attachments": note.get("attachments", []),
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


@execution_hub_router.put("/tasks/{task_id}/notes/{note_id}")
async def update_task_note(task_id: str, note_id: str, note: dict, user: User = Depends(get_current_user)):
    """Update a task note (only by the note author)"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await check_goal_access(task["goal_id"], user)
    
    note_found = False
    for n in (task.get("notes") or []):
        if n.get("note_id") == note_id:
            if n.get("user_id") != user.user_id:
                raise HTTPException(status_code=403, detail="Solo puedes editar tus propias notas")
            note_found = True
            break
    
    if not note_found:
        raise HTTPException(status_code=404, detail="Note not found")
    
    await db.execution_tasks.update_one(
        {"task_id": task_id, "notes.note_id": note_id},
        {"$set": {
            "notes.$.content": note.get("content", ""),
            "notes.$.attachments": note.get("attachments", []),
            "notes.$.edited_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"success": True}


@execution_hub_router.delete("/tasks/{task_id}/notes/{note_id}")
async def delete_task_note(task_id: str, note_id: str, user: User = Depends(get_current_user)):
    """Delete a task note (only by the note author or goal owner)"""
    task = await db.execution_tasks.find_one({"task_id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    goal = await check_goal_access(task["goal_id"], user)
    
    note_found = False
    for n in (task.get("notes") or []):
        if n.get("note_id") == note_id:
            if n.get("user_id") != user.user_id and goal.get("owner_id") != user.user_id:
                raise HTTPException(status_code=403, detail="No tienes permisos para eliminar esta nota")
            note_found = True
            break
    
    if not note_found:
        raise HTTPException(status_code=404, detail="Note not found")
    
    await db.execution_tasks.update_one(
        {"task_id": task_id},
        {"$pull": {"notes": {"note_id": note_id}}}
    )
    return {"success": True}



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
    
    # ===== FOLLOW-UPS DUE TODAY OR OVERDUE =====
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    company_id = user.company_id
    
    follow_ups = []
    
    # Get leads with follow-ups due today or overdue (owned by user or all if admin)
    lead_query = {
        "company_id": company_id,
        "next_follow_up_date": {"$ne": None, "$lte": tomorrow},
        "status": {"$nin": ["Converted", "Discarded"]}
    }
    # If user has owner_id, filter by it (sales users see only their own)
    user_role = getattr(user, 'role_id', None)
    if user_role == "sales":
        lead_query["owner_id"] = user.user_id
    
    leads_with_fu = await db.leads.find(lead_query, {
        "_id": 0, "lead_id": 1, "lead_name": 1, "contact_name": 1, "company_name": 1,
        "next_follow_up_date": 1, "follow_up_type": 1, "owner_id": 1
    }).to_list(50)
    
    for lead in leads_with_fu:
        fu_date = lead.get("next_follow_up_date", "")[:10] if lead.get("next_follow_up_date") else ""
        is_overdue = fu_date and fu_date < today
        follow_ups.append({
            "entity_type": "lead",
            "entity_id": lead["lead_id"],
            "name": lead.get("lead_name") or lead.get("contact_name") or lead.get("company_name"),
            "follow_up_date": lead.get("next_follow_up_date"),
            "follow_up_type": lead.get("follow_up_type", "Call"),
            "is_overdue": is_overdue,
            "link": f"/client-engagement/crm/leads/{lead['lead_id']}"
        })
    
    # Get clients with follow-ups due today or overdue
    client_query = {
        "company_id": company_id,
        "next_follow_up_date": {"$ne": None, "$lte": tomorrow}
    }
    if user_role == "sales":
        client_query["owner_id"] = user.user_id
    
    clients_with_fu = await db.clients.find(client_query, {
        "_id": 0, "client_id": 1, "display_name": 1, "company_name": 1,
        "next_follow_up_date": 1, "follow_up_type": 1, "owner_id": 1
    }).to_list(50)
    
    for client in clients_with_fu:
        fu_date = client.get("next_follow_up_date", "")[:10] if client.get("next_follow_up_date") else ""
        is_overdue = fu_date and fu_date < today
        follow_ups.append({
            "entity_type": "client",
            "entity_id": client["client_id"],
            "name": client.get("display_name") or client.get("company_name"),
            "follow_up_date": client.get("next_follow_up_date"),
            "follow_up_type": client.get("follow_up_type", "CheckIn"),
            "is_overdue": is_overdue,
            "link": f"/client-engagement/crm/clients/{client['client_id']}"
        })
    
    # Sort follow-ups: overdue first, then by date
    follow_ups.sort(key=lambda x: (not x.get("is_overdue", False), x.get("follow_up_date", "")))
    
    return MyPendingStats(
        active_goals=len(owned_goals),
        pending_tasks=len(assigned_tasks),
        blocked_goals=blocked_count,
        decisions_waiting=0,  # TODO: implement if needed
        follow_ups_due=len(follow_ups),
        goals=owned_goals,
        tasks=assigned_tasks,
        follow_ups=follow_ups
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


# ============== SEND TO EXECUTION HUB ==============

# Default tasks by industry for execution goals
INDUSTRY_DEFAULT_TASKS = {
    "events_hospitality": [
        {"title": "Confirmar venue y proveedores", "title_es": "Confirmar venue y proveedores", "order": 1},
        {"title": "Finalizar menú y detalles de catering", "title_es": "Finalizar menú y detalles de catering", "order": 2},
        {"title": "Coordinar logística y montaje", "title_es": "Coordinar logística y montaje", "order": 3},
        {"title": "Reunión de pre-evento con equipo", "title_es": "Reunión de pre-evento con equipo", "order": 4},
        {"title": "Confirmación final con cliente", "title_es": "Confirmación final con cliente", "order": 5},
        {"title": "Ejecución del evento", "title_es": "Ejecución del evento", "order": 6},
    ],
    "professional_services": [
        {"title": "Kick-off meeting con cliente", "title_es": "Kick-off meeting con cliente", "order": 1},
        {"title": "Definir entregables y cronograma", "title_es": "Definir entregables y cronograma", "order": 2},
        {"title": "Configuración inicial del proyecto", "title_es": "Configuración inicial del proyecto", "order": 3},
        {"title": "Revisión de avance semanal", "title_es": "Revisión de avance semanal", "order": 4},
        {"title": "QA y control de calidad", "title_es": "QA y control de calidad", "order": 5},
        {"title": "Entrega final y cierre", "title_es": "Entrega final y cierre", "order": 6},
    ],
    "generic": [
        {"title": "Planificación inicial", "title_es": "Planificación inicial", "order": 1},
        {"title": "Preparación de recursos", "title_es": "Preparación de recursos", "order": 2},
        {"title": "Ejecución del servicio", "title_es": "Ejecución del servicio", "order": 3},
        {"title": "Control de calidad", "title_es": "Control de calidad", "order": 4},
        {"title": "Cierre y seguimiento", "title_es": "Cierre y seguimiento", "order": 5},
    ],
}


@execution_hub_router.get("/default-tasks/{industry}")
async def get_default_tasks_for_industry(
    industry: str,
    user: User = Depends(get_current_user)
):
    """Get default tasks for an industry (used by frontend to show editable modal)"""
    tasks = INDUSTRY_DEFAULT_TASKS.get(industry, INDUSTRY_DEFAULT_TASKS["generic"])
    return {"industry": industry, "tasks": tasks}


@execution_hub_router.post("/from-event/{event_id}")
async def create_goal_from_event(
    event_id: str,
    data: dict,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user)
):
    """
    Create an Execution Hub goal from an event/project.
    Accepts custom tasks from the frontend modal.
    """
    # Check goal limit
    can_create = await check_goal_limit(user.company_id)
    if not can_create:
        limit = await get_effective_goal_limit(user.company_id)
        raise HTTPException(
            status_code=403, 
            detail=f"Has alcanzado el límite de {limit} metas de ejecución este mes."
        )
    
    # Get the event
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Evento/Proyecto no encontrado")
    
    # Check if goal already exists for this event
    existing_goal = await db.execution_goals.find_one({
        "context_type": "event",
        "context_id": event_id
    })
    if existing_goal:
        raise HTTPException(
            status_code=400, 
            detail="Ya existe una meta de ejecución para este evento/proyecto"
        )
    
    now = datetime.now(timezone.utc)
    goal_id = f"goal_{uuid.uuid4().hex[:12]}"
    
    # Create the goal
    goal_doc = {
        "goal_id": goal_id,
        "company_id": user.company_id,
        "title": data.get("title") or f"Ejecutar: {event['name']}",
        "objective": data.get("objective") or f"Completar exitosamente el proyecto/evento: {event['name']}",
        "owner_id": user.user_id,
        "owner_name": user.name or user.email,
        "status": ExecutionStatus.PLANNING.value,
        "visibility": data.get("visibility", "org"),
        "context_type": "event",
        "context_id": event_id,
        "context_name": event["name"],
        "impact_areas": data.get("impact_areas", ["quality", "speed"]),
        "start_date": now.isoformat(),
        "target_date": event.get("event_date") or event.get("end_date"),
        "notes": [],
        "linked_items": [
            {
                "item_type": "event",
                "item_id": event_id,
                "item_name": event["name"],
                "linked_at": now.isoformat(),
                "linked_by": user.user_id
            }
        ],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_from": "event_send_to_execution"
    }
    
    await db.execution_goals.insert_one(goal_doc)
    
    # Create tasks from the provided list
    tasks = data.get("tasks", [])
    created_tasks = []
    
    for idx, task_data in enumerate(tasks):
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        
        # Calculate due date based on event date and task order
        due_date = None
        if event.get("event_date"):
            try:
                event_date = datetime.fromisoformat(event["event_date"].replace("Z", "+00:00"))
                # Distribute tasks before event date
                days_before = max(1, (len(tasks) - idx) * 2)  # Earlier tasks have more days
                due_date = (event_date - timedelta(days=days_before)).isoformat()
            except Exception:
                pass
        
        task_doc = {
            "task_id": task_id,
            "goal_id": goal_id,
            "company_id": user.company_id,
            "title": task_data.get("title"),
            "description": task_data.get("description", ""),
            "status": "pending",
            "assignees": [{
                "user_id": user.user_id,
                "name": user.name or user.email,
                "email": user.email,
                "role": "team_member",
                "is_external": False,
                "assigned_at": now.isoformat(),
                "assigned_by": user.user_id
            }],
            "due_date": due_date,
            "notes": [],
            "change_log": [add_change_log(user.user_id, user.name or user.email, "created")],
            "created_by": user.user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "order": idx + 1
        }
        
        await db.execution_tasks.insert_one(task_doc)
        del task_doc["_id"]
        created_tasks.append(task_doc)
    
    # Update event to mark it as sent to execution hub
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {
            "execution_goal_id": goal_id,
            "sent_to_execution_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    # Log activity
    await log_activity(
        module="execution_hub",
        action="create_from_event",
        entity_type="goal",
        entity_id=goal_id,
        entity_name=goal_doc["title"],
        event_id=event_id,
        metadata={"tasks_count": len(created_tasks)},
        **user_info(user)
    )
    
    del goal_doc["_id"]
    
    return {
        "goal": goal_doc,
        "tasks": created_tasks,
        "message": "Meta de ejecución creada exitosamente"
    }



# ============== FILE ATTACHMENTS ==============

@execution_hub_router.post("/upload-attachment")
async def upload_execution_attachment(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Upload a file attachment for execution hub notes"""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no permitido. Usa imágenes, documentos PDF/Word/Excel, o videos."
        )
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande. Máximo 15MB.")
    
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    filename = f"exec_{uuid.uuid4().hex[:12]}.{ext}"
    filepath = EXEC_ATTACHMENTS_DIR / filename
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    is_image = file.content_type.startswith("image/")
    file_url = f"/api/uploads/exec_attachments/{filename}"
    
    return {
        "file_url": file_url,
        "filename": file.filename,
        "stored_name": filename,
        "content_type": file.content_type,
        "size": len(content),
        "is_image": is_image,
    }
