"""
Kora OS - Automation Execution Service
Centralized service for executing automation rules
Used by both internal events and external integrations
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import uuid
import logging

from config import db
from models.automation import TriggerType, ActionType

logger = logging.getLogger(__name__)


# Mapping from integration events to automation trigger types
INTEGRATION_EVENT_TO_TRIGGER = {
    "on_lead_company": TriggerType.INTEGRATION_LEAD_COMPANY,
    "on_lead_candidate": TriggerType.INTEGRATION_LEAD_CANDIDATE,
    "on_lead_contractor": TriggerType.INTEGRATION_LEAD_CONTRACTOR,
    "on_lead_created": TriggerType.INTEGRATION_LEAD_CREATED,
    "on_invoice_created": TriggerType.INTEGRATION_INVOICE_CREATED,
}


async def execute_automation_rules(
    organization_id: str,
    trigger_type: str,
    payload: Dict[str, Any],
    source: str = "internal",
    integration_id: Optional[str] = None,
    is_sandbox: bool = False
) -> List[Dict[str, Any]]:
    """
    Find and execute automation rules matching the trigger type.
    
    Args:
        organization_id: The organization to find rules for
        trigger_type: The type of trigger (from TriggerType enum or integration event)
        payload: Data from the triggering event
        source: "internal" or "integration"
        integration_id: ID of the integration if source is "integration"
        is_sandbox: If true, log but don't execute real actions
    
    Returns:
        List of execution results
    """
    now = datetime.now(timezone.utc)
    executions = []
    
    # Convert integration event to trigger type if needed
    actual_trigger_type = trigger_type
    if source == "integration" and trigger_type in INTEGRATION_EVENT_TO_TRIGGER:
        actual_trigger_type = INTEGRATION_EVENT_TO_TRIGGER[trigger_type].value
    
    # Find active rules matching this trigger
    rules = await db.automation_rules.find({
        "organization_id": organization_id,
        "status": "active",
        "trigger.type": actual_trigger_type
    }).to_list(50)
    
    # Also check for generic integration triggers
    if source == "integration":
        # Add rules that trigger on any integration lead
        if "lead" in trigger_type:
            generic_rules = await db.automation_rules.find({
                "organization_id": organization_id,
                "status": "active",
                "trigger.type": TriggerType.INTEGRATION_LEAD_CREATED.value
            }).to_list(50)
            rules.extend(generic_rules)
    
    # Remove duplicates
    seen_rule_ids = set()
    unique_rules = []
    for rule in rules:
        if rule["rule_id"] not in seen_rule_ids:
            seen_rule_ids.add(rule["rule_id"])
            unique_rules.append(rule)
    
    logger.info(f"Found {len(unique_rules)} automation rules for trigger {actual_trigger_type} in org {organization_id}")
    
    for rule in unique_rules:
        # Check conditions if any
        if not await _check_conditions(rule.get("trigger", {}).get("conditions", []), payload):
            logger.debug(f"Rule {rule['rule_id']} conditions not met, skipping")
            continue
        
        # Execute actions
        execution_id = f"exec_{uuid.uuid4().hex[:12]}"
        action_results = []
        
        for action in rule.get("actions", []):
            try:
                if is_sandbox:
                    # Sandbox mode - log but don't execute
                    result = {
                        "action_type": action["type"],
                        "status": "simulated",
                        "message": f"[SANDBOX] Would execute: {action['type']}"
                    }
                else:
                    result = await _execute_action(
                        action_type=action["type"],
                        config=action.get("config", {}),
                        payload=payload,
                        organization_id=organization_id,
                        rule_id=rule["rule_id"]
                    )
                action_results.append(result)
            except Exception as e:
                logger.error(f"Error executing action {action['type']}: {e}")
                action_results.append({
                    "action_type": action["type"],
                    "status": "error",
                    "error": str(e)
                })
        
        # Log execution
        log_doc = {
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "execution_id": execution_id,
            "organization_id": organization_id,
            "rule_id": rule["rule_id"],
            "rule_name": rule.get("name"),
            "trigger_type": actual_trigger_type,
            "trigger_payload": payload,
            "source": source,
            "integration_id": integration_id,
            "is_sandbox": is_sandbox,
            "actions_executed": action_results,
            "status": "completed" if all(r.get("status") != "error" for r in action_results) else "partial_error",
            "executed_at": now.isoformat()
        }
        await db.automation_logs.insert_one(log_doc)
        
        executions.append({
            "rule_id": rule["rule_id"],
            "rule_name": rule.get("name"),
            "execution_id": execution_id,
            "actions_count": len(action_results),
            "status": log_doc["status"]
        })
    
    return executions


async def _check_conditions(conditions: List[Dict], payload: Dict) -> bool:
    """Check if all conditions are met"""
    if not conditions:
        return True
    
    for condition in conditions:
        field = condition.get("field", "")
        operator = condition.get("operator", "equals")
        value = condition.get("value")
        
        # Get field value from payload (support nested fields with dot notation)
        actual_value = payload
        for part in field.split("."):
            if isinstance(actual_value, dict):
                actual_value = actual_value.get(part)
            else:
                actual_value = None
                break
        
        # Evaluate condition
        if operator == "equals" and actual_value != value:
            return False
        elif operator == "not_equals" and actual_value == value:
            return False
        elif operator == "contains" and value not in str(actual_value or ""):
            return False
        elif operator == "greater_than":
            try:
                if float(actual_value or 0) <= float(value):
                    return False
            except (TypeError, ValueError):
                return False
        elif operator == "less_than":
            try:
                if float(actual_value or 0) >= float(value):
                    return False
            except (TypeError, ValueError):
                return False
        elif operator == "is_empty" and actual_value:
            return False
        elif operator == "is_not_empty" and not actual_value:
            return False
    
    return True


async def _execute_action(
    action_type: str,
    config: Dict[str, Any],
    payload: Dict[str, Any],
    organization_id: str,
    rule_id: str
) -> Dict[str, Any]:
    """Execute a single automation action"""
    now = datetime.now(timezone.utc)
    
    if action_type == ActionType.CREATE_TASK.value:
        # Create a task
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        task_doc = {
            "task_id": task_id,
            "company_id": organization_id,
            "title": _replace_variables(config.get("title", "Automated Task"), payload),
            "description": _replace_variables(config.get("description", ""), payload),
            "assignee_id": config.get("assignee", "owner"),
            "due_date": (datetime.now(timezone.utc) + 
                        __import__("datetime").timedelta(days=config.get("due_days", 3))).isoformat(),
            "status": "pending",
            "source": "automation",
            "source_rule_id": rule_id,
            "related_entity": payload.get("lead_id") or payload.get("event_id") or payload.get("invoice_id"),
            "created_at": now.isoformat()
        }
        await db.tasks.insert_one(task_doc)
        return {"action_type": action_type, "status": "success", "task_id": task_id}
    
    elif action_type == ActionType.SEND_NOTIFICATION.value:
        # Create in-app notification
        notification_id = f"notif_{uuid.uuid4().hex[:12]}"
        notification_doc = {
            "notification_id": notification_id,
            "company_id": organization_id,
            "type": "automation",
            "title": _replace_variables(config.get("title", "Automation Notification"), payload),
            "message": _replace_variables(config.get("message", ""), payload),
            "recipients": config.get("recipients", ["owner"]),
            "read": False,
            "source_rule_id": rule_id,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_doc)
        return {"action_type": action_type, "status": "success", "notification_id": notification_id}
    
    elif action_type == ActionType.UPDATE_FIELD.value:
        # Update a field on the entity
        entity_type = config.get("entity_type", "lead")
        entity_id_field = f"{entity_type}_id"
        entity_id = payload.get(entity_id_field)
        
        if entity_id:
            collection_map = {
                "lead": "leads",
                "client": "clients",
                "event": "events",
                "invoice": "invoices"
            }
            collection = collection_map.get(entity_type, "leads")
            
            await db[collection].update_one(
                {entity_id_field: entity_id, "company_id": organization_id},
                {"$set": {
                    config.get("field"): config.get("value"),
                    "updated_at": now.isoformat()
                }}
            )
            return {"action_type": action_type, "status": "success", "updated_entity": entity_id}
        return {"action_type": action_type, "status": "skipped", "reason": "No entity ID found"}
    
    elif action_type == ActionType.ADD_TAG.value:
        # Add a tag to the entity
        entity_id = payload.get("lead_id") or payload.get("client_id")
        if entity_id:
            collection = "leads" if "lead_id" in payload else "clients"
            await db[collection].update_one(
                {f"{'lead' if 'lead_id' in payload else 'client'}_id": entity_id},
                {"$addToSet": {"tags": config.get("tag")}}
            )
            return {"action_type": action_type, "status": "success", "tag": config.get("tag")}
        return {"action_type": action_type, "status": "skipped", "reason": "No entity ID found"}
    
    elif action_type == ActionType.MOVE_TO_STAGE.value:
        # Move lead/deal to a specific stage
        lead_id = payload.get("lead_id")
        if lead_id:
            await db.leads.update_one(
                {"lead_id": lead_id, "company_id": organization_id},
                {"$set": {
                    "stage": config.get("stage"),
                    "updated_at": now.isoformat()
                }}
            )
            return {"action_type": action_type, "status": "success", "new_stage": config.get("stage")}
        return {"action_type": action_type, "status": "skipped", "reason": "No lead ID found"}
    
    elif action_type == ActionType.CREATE_FOLLOW_UP.value:
        # Create a follow-up reminder
        follow_up_id = f"followup_{uuid.uuid4().hex[:12]}"
        follow_up_doc = {
            "follow_up_id": follow_up_id,
            "company_id": organization_id,
            "lead_id": payload.get("lead_id"),
            "client_id": payload.get("client_id"),
            "type": config.get("type", "call"),
            "notes": _replace_variables(config.get("notes", ""), payload),
            "due_date": (datetime.now(timezone.utc) + 
                        __import__("datetime").timedelta(days=config.get("days", 3))).isoformat(),
            "status": "pending",
            "source": "automation",
            "created_at": now.isoformat()
        }
        await db.follow_ups.insert_one(follow_up_doc)
        return {"action_type": action_type, "status": "success", "follow_up_id": follow_up_id}
    
    elif action_type == ActionType.WEBHOOK.value:
        # Call external webhook
        import aiohttp
        webhook_url = config.get("url")
        if webhook_url:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        webhook_url,
                        json={
                            "event": "automation_triggered",
                            "rule_id": rule_id,
                            "payload": payload,
                            "timestamp": now.isoformat()
                        },
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        return {
                            "action_type": action_type,
                            "status": "success" if response.status < 400 else "error",
                            "http_status": response.status
                        }
            except Exception as e:
                return {"action_type": action_type, "status": "error", "error": str(e)}
        return {"action_type": action_type, "status": "skipped", "reason": "No webhook URL"}
    
    elif action_type == ActionType.ASSIGN_OWNER.value:
        # Assign to a specific user or round-robin
        lead_id = payload.get("lead_id")
        if lead_id:
            assignee = config.get("user_id")
            if config.get("round_robin"):
                # Get next user in rotation
                assignee = await _get_next_assignee(organization_id)
            
            await db.leads.update_one(
                {"lead_id": lead_id, "company_id": organization_id},
                {"$set": {
                    "assigned_to": assignee,
                    "updated_at": now.isoformat()
                }}
            )
            return {"action_type": action_type, "status": "success", "assigned_to": assignee}
        return {"action_type": action_type, "status": "skipped", "reason": "No lead ID found"}
    
    else:
        return {"action_type": action_type, "status": "unknown_action"}


async def _get_next_assignee(organization_id: str) -> str:
    """Get next user for round-robin assignment"""
    # Get all active users in the organization
    users = await db.users.find(
        {"company_id": organization_id, "status": "active"},
        {"_id": 0, "user_id": 1}
    ).to_list(100)
    
    if not users:
        return None
    
    # Get last assigned user
    last_assignment = await db.assignment_rotation.find_one(
        {"organization_id": organization_id}
    )
    
    user_ids = [u["user_id"] for u in users]
    
    if last_assignment:
        last_index = user_ids.index(last_assignment["last_user_id"]) if last_assignment["last_user_id"] in user_ids else -1
        next_index = (last_index + 1) % len(user_ids)
    else:
        next_index = 0
    
    next_user = user_ids[next_index]
    
    # Update rotation
    await db.assignment_rotation.update_one(
        {"organization_id": organization_id},
        {"$set": {"last_user_id": next_user, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return next_user


def _replace_variables(text: str, payload: Dict[str, Any]) -> str:
    """Replace {{variable}} placeholders in text with values from payload"""
    if not text:
        return text
    
    import re
    
    def replacer(match):
        var_name = match.group(1)
        # Support nested variables like {{lead.name}}
        value = payload
        for part in var_name.split("."):
            if isinstance(value, dict):
                value = value.get(part, "")
            else:
                value = ""
                break
        return str(value) if value else ""
    
    return re.sub(r'\{\{(\w+(?:\.\w+)*)\}\}', replacer, text)


# Convenience function for integration events
async def trigger_integration_automation(
    company_id: str,
    event_type: str,
    payload: Dict[str, Any],
    integration_id: str,
    is_sandbox: bool = False
) -> List[Dict[str, Any]]:
    """
    Trigger automation rules from an integration event.
    This is the main entry point for integration-triggered automations.
    """
    return await execute_automation_rules(
        organization_id=company_id,
        trigger_type=event_type,
        payload=payload,
        source="integration",
        integration_id=integration_id,
        is_sandbox=is_sandbox
    )
