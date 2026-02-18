# routers/automation.py - Automation Engine Router
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from config import db
from dependencies import get_current_user, User
from models.automation import (
    AutomationRule, AutomationLog, AutomationStatus,
    CreateRuleRequest, UpdateRuleRequest,
    TriggerType, ActionType
)

logger = logging.getLogger(__name__)

automation_router = APIRouter(prefix="/automation", tags=["Automation"])


# ============== RULE CRUD ==============

@automation_router.get("/rules")
async def list_automation_rules(
    status: Optional[str] = None,
    trigger_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List all automation rules for the organization"""
    query = {"organization_id": user.company_id}
    
    if status:
        query["status"] = status
    if trigger_type:
        query["trigger.type"] = trigger_type
    
    rules = await db.automation_rules.find(
        query,
        {"_id": 0}
    ).sort("priority", -1).to_list(100)
    
    return {"rules": rules, "count": len(rules)}


@automation_router.get("/rules/{rule_id}")
async def get_automation_rule(
    rule_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific automation rule"""
    rule = await db.automation_rules.find_one(
        {"rule_id": rule_id, "organization_id": user.company_id},
        {"_id": 0}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return rule


@automation_router.post("/rules")
async def create_automation_rule(
    data: CreateRuleRequest,
    user: User = Depends(get_current_user)
):
    """Create a new automation rule"""
    now = datetime.now(timezone.utc)
    
    rule = {
        "rule_id": f"rule_{uuid.uuid4().hex[:12]}",
        "organization_id": user.company_id,
        "name": data.name,
        "description": data.description,
        "trigger": data.trigger.dict(),
        "actions": [a.dict() for a in data.actions],
        "status": data.status.value,
        "priority": 0,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": None,
        "last_triggered_at": None,
        "trigger_count": 0
    }
    
    await db.automation_rules.insert_one(rule)
    
    logger.info(f"Automation rule created: {rule['rule_id']} by {user.email}")
    
    # Remove _id before returning
    rule.pop("_id", None)
    return rule


@automation_router.put("/rules/{rule_id}")
async def update_automation_rule(
    rule_id: str,
    data: UpdateRuleRequest,
    user: User = Depends(get_current_user)
):
    """Update an automation rule"""
    now = datetime.now(timezone.utc)
    
    # Check rule exists
    existing = await db.automation_rules.find_one(
        {"rule_id": rule_id, "organization_id": user.company_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Build update
    update = {"updated_at": now.isoformat()}
    
    if data.name is not None:
        update["name"] = data.name
    if data.description is not None:
        update["description"] = data.description
    if data.trigger is not None:
        update["trigger"] = data.trigger.dict()
    if data.actions is not None:
        update["actions"] = [a.dict() for a in data.actions]
    if data.status is not None:
        update["status"] = data.status.value
    if data.priority is not None:
        update["priority"] = data.priority
    
    await db.automation_rules.update_one(
        {"rule_id": rule_id},
        {"$set": update}
    )
    
    # Return updated rule
    rule = await db.automation_rules.find_one(
        {"rule_id": rule_id},
        {"_id": 0}
    )
    
    return rule


@automation_router.delete("/rules/{rule_id}")
async def delete_automation_rule(
    rule_id: str,
    user: User = Depends(get_current_user)
):
    """Delete an automation rule"""
    result = await db.automation_rules.delete_one(
        {"rule_id": rule_id, "organization_id": user.company_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    logger.info(f"Automation rule deleted: {rule_id} by {user.email}")
    
    return {"success": True, "message": "Rule deleted"}


@automation_router.post("/rules/{rule_id}/toggle")
async def toggle_automation_rule(
    rule_id: str,
    user: User = Depends(get_current_user)
):
    """Toggle automation rule status (active/paused)"""
    rule = await db.automation_rules.find_one(
        {"rule_id": rule_id, "organization_id": user.company_id}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    new_status = "paused" if rule["status"] == "active" else "active"
    
    await db.automation_rules.update_one(
        {"rule_id": rule_id},
        {"$set": {
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "status": new_status}


@automation_router.post("/rules/{rule_id}/test")
async def test_automation_rule(
    rule_id: str,
    test_data: dict = {},
    user: User = Depends(get_current_user)
):
    """Test an automation rule with sample data (dry run)"""
    rule = await db.automation_rules.find_one(
        {"rule_id": rule_id, "organization_id": user.company_id},
        {"_id": 0}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Simulate execution
    simulated_actions = []
    for action in rule.get("actions", []):
        simulated_actions.append({
            "type": action["type"],
            "config": action.get("config", {}),
            "would_execute": True,
            "preview": _generate_action_preview(action, test_data)
        })
    
    return {
        "rule_id": rule_id,
        "trigger": rule.get("trigger"),
        "test_data": test_data,
        "simulated_actions": simulated_actions,
        "dry_run": True
    }


def _generate_action_preview(action: dict, test_data: dict) -> str:
    """Generate human-readable preview of what action would do"""
    action_type = action.get("type")
    config = action.get("config", {})
    
    previews = {
        "create_task": f"Create task: {config.get('title', 'New Task')}",
        "send_notification": f"Send notification: {config.get('message', '...')[:50]}",
        "send_email": f"Send email to {config.get('recipient', 'contact')}",
        "update_field": f"Set {config.get('field', '?')} = {config.get('value', '?')}",
        "assign_owner": f"Assign to {config.get('user_id', 'user')}",
        "add_tag": f"Add tag: {config.get('tag', '?')}",
        "create_follow_up": f"Create follow-up in {config.get('days', 3)} days",
        "move_to_stage": f"Move to stage: {config.get('stage', '?')}",
        "webhook": f"Call webhook: {config.get('url', '...')[:30]}"
    }
    
    return previews.get(action_type, f"Execute {action_type}")


# ============== EXECUTION LOGS ==============

@automation_router.get("/logs")
async def list_automation_logs(
    rule_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user)
):
    """List automation execution logs"""
    query = {"organization_id": user.company_id}
    
    if rule_id:
        query["rule_id"] = rule_id
    if status:
        query["status"] = status
    
    logs = await db.automation_logs.find(
        query,
        {"_id": 0}
    ).sort("executed_at", -1).limit(limit).to_list(limit)
    
    return {"logs": logs, "count": len(logs)}


@automation_router.get("/logs/{log_id}")
async def get_automation_log(
    log_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific automation log"""
    log = await db.automation_logs.find_one(
        {"log_id": log_id, "organization_id": user.company_id},
        {"_id": 0}
    )
    
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    
    return log


# ============== TEMPLATES ==============

@automation_router.get("/templates")
async def list_automation_templates(
    user: User = Depends(get_current_user)
):
    """Get pre-built automation rule templates"""
    templates = [
        {
            "template_id": "lead_welcome",
            "name": "Lead Welcome",
            "name_es": "Bienvenida a Lead",
            "description": "Send welcome notification when new lead is created",
            "description_es": "Enviar notificación de bienvenida cuando se crea un nuevo lead",
            "category": "leads",
            "trigger": {
                "type": "lead_created",
                "conditions": []
            },
            "actions": [
                {
                    "type": "send_notification",
                    "config": {"message": "New lead created: {{lead_name}}", "recipients": ["owner"]}
                },
                {
                    "type": "create_follow_up",
                    "config": {"days": 1, "title": "Initial contact with {{lead_name}}"}
                }
            ]
        },
        {
            "template_id": "lead_qualification",
            "name": "Lead Qualification Alert",
            "name_es": "Alerta de Calificación de Lead",
            "description": "Notify manager when proposal exceeds threshold",
            "description_es": "Notificar al gerente cuando la propuesta excede el umbral",
            "category": "leads",
            "trigger": {
                "type": "proposal_amount_threshold",
                "conditions": [{"field": "amount", "operator": "greater_than", "value": 5000}]
            },
            "actions": [
                {
                    "type": "send_notification",
                    "config": {"message": "High-value proposal: ${{amount}} - {{event_name}}", "recipients": ["admin"]}
                },
                {
                    "type": "add_tag",
                    "config": {"tag": "high-value"}
                }
            ]
        },
        {
            "template_id": "inactive_client",
            "name": "Inactive Client Reactivation",
            "name_es": "Reactivación de Cliente Inactivo",
            "description": "Create task when client has no activity for 30 days",
            "description_es": "Crear tarea cuando el cliente no tiene actividad por 30 días",
            "category": "clients",
            "trigger": {
                "type": "client_inactive_days",
                "days": 30
            },
            "actions": [
                {
                    "type": "create_task",
                    "config": {"title": "Reactivate client: {{client_name}}", "assignee": "owner", "due_days": 3}
                },
                {
                    "type": "add_tag",
                    "config": {"tag": "needs-attention"}
                }
            ]
        },
        {
            "template_id": "event_reminder",
            "name": "Event Preparation Reminder",
            "name_es": "Recordatorio de Preparación de Evento",
            "description": "Create preparation tasks 7 days before event",
            "description_es": "Crear tareas de preparación 7 días antes del evento",
            "category": "events",
            "trigger": {
                "type": "event_date_approaching",
                "days": 7
            },
            "actions": [
                {
                    "type": "create_task",
                    "config": {"title": "Prepare for event: {{event_name}}", "assignee": "owner", "due_days": 5}
                },
                {
                    "type": "send_notification",
                    "config": {"message": "Event {{event_name}} is in 7 days", "recipients": ["owner"]}
                }
            ]
        },
        {
            "template_id": "follow_up_overdue",
            "name": "Overdue Follow-up Alert",
            "name_es": "Alerta de Seguimiento Vencido",
            "description": "Escalate when follow-up is overdue",
            "description_es": "Escalar cuando el seguimiento está vencido",
            "category": "leads",
            "trigger": {
                "type": "follow_up_overdue",
                "conditions": []
            },
            "actions": [
                {
                    "type": "send_notification",
                    "config": {"message": "Overdue follow-up for {{lead_name}}", "recipients": ["owner", "admin"]}
                }
            ]
        }
    ]
    
    return {"templates": templates}


@automation_router.post("/templates/{template_id}/create")
async def create_from_template(
    template_id: str,
    customization: dict = {},
    user: User = Depends(get_current_user)
):
    """Create a new rule from a template"""
    # Get templates
    templates_response = await list_automation_templates(user)
    templates = templates_response["templates"]
    
    template = next((t for t in templates if t["template_id"] == template_id), None)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Create rule from template
    now = datetime.now(timezone.utc)
    
    rule = {
        "rule_id": f"rule_{uuid.uuid4().hex[:12]}",
        "organization_id": user.company_id,
        "name": customization.get("name", template["name"]),
        "description": customization.get("description", template.get("description")),
        "trigger": template["trigger"],
        "actions": template["actions"],
        "status": "draft",
        "priority": 0,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": None,
        "last_triggered_at": None,
        "trigger_count": 0,
        "from_template": template_id
    }
    
    # Apply customizations
    if "trigger" in customization:
        rule["trigger"].update(customization["trigger"])
    if "actions" in customization:
        rule["actions"] = customization["actions"]
    
    await db.automation_rules.insert_one(rule)
    rule.pop("_id", None)
    
    return rule


# ============== STATS ==============

@automation_router.get("/stats")
async def get_automation_stats(
    user: User = Depends(get_current_user)
):
    """Get automation statistics for dashboard"""
    org_id = user.company_id
    
    # Count rules by status
    active_count = await db.automation_rules.count_documents({"organization_id": org_id, "status": "active"})
    paused_count = await db.automation_rules.count_documents({"organization_id": org_id, "status": "paused"})
    draft_count = await db.automation_rules.count_documents({"organization_id": org_id, "status": "draft"})
    
    # Recent executions (last 24h)
    yesterday = (datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)).isoformat()
    recent_logs = await db.automation_logs.count_documents({
        "organization_id": org_id,
        "executed_at": {"$gte": yesterday}
    })
    
    # Success rate (last 7 days)
    week_ago = (datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)).isoformat()
    total_executions = await db.automation_logs.count_documents({
        "organization_id": org_id,
        "executed_at": {"$gte": week_ago}
    })
    successful = await db.automation_logs.count_documents({
        "organization_id": org_id,
        "executed_at": {"$gte": week_ago},
        "status": "success"
    })
    
    success_rate = (successful / total_executions * 100) if total_executions > 0 else 100
    
    return {
        "rules": {
            "active": active_count,
            "paused": paused_count,
            "draft": draft_count,
            "total": active_count + paused_count + draft_count
        },
        "executions": {
            "today": recent_logs,
            "success_rate": round(success_rate, 1)
        }
    }
