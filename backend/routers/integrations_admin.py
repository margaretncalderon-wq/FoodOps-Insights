"""
Kora OS - Integration Management Router
Super Admin endpoints to manage external integrations and API keys
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import secrets
import hashlib

from config import db
from routers.auth import get_current_user
from models.auth import User

integrations_admin_router = APIRouter(prefix="/integrations", tags=["Integration Management"])


# ============== MODELS ==============

class CreateIntegrationRequest(BaseModel):
    """Create a new integration"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    company_id: str  # Which organization this integration belongs to
    permissions: List[str] = ["leads"]  # leads, invoices, events
    rate_limit_tier: str = "standard"  # standard, premium
    sandbox_mode: bool = False
    webhook_url: Optional[str] = None  # Optional webhook for callbacks
    notes: Optional[str] = None


class UpdateIntegrationRequest(BaseModel):
    """Update integration settings"""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None
    rate_limit_tier: Optional[str] = None
    sandbox_mode: Optional[bool] = None
    webhook_url: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # active, paused, revoked


class IntegrationWorkflowConfig(BaseModel):
    """Configure a workflow trigger for an integration event"""
    name: str
    trigger_event: str  # on_lead_company, on_lead_candidate, on_invoice_created, custom
    actions: List[Dict[str, Any]]  # List of actions to perform
    conditions: Optional[Dict[str, Any]] = None  # Optional conditions


# ============== HELPERS ==============

def generate_api_key(prefix: str = "sk_live") -> tuple:
    """Generate a new API key and return (key, hash)"""
    random_part = secrets.token_urlsafe(32)
    full_key = f"{prefix}_{random_part}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, key_hash


async def get_super_admin(user: User = Depends(get_current_user)) -> User:
    """Verify user is super admin"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


# ============== SUPER ADMIN ENDPOINTS ==============

@integrations_admin_router.get("/")
async def list_integrations(
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    admin: User = Depends(get_super_admin)
):
    """List all integrations (super admin)"""
    query = {}
    if company_id:
        query["company_id"] = company_id
    if status:
        query["status"] = status
    
    integrations = await db.integrations.find(
        query,
        {"_id": 0, "api_key_hash": 0}  # Don't expose the hash
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with stats
    for integration in integrations:
        # Get call count for last 24 hours
        day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        call_count = await db.integration_logs.count_documents({
            "integration_id": integration["integration_id"],
            "timestamp": {"$gte": day_ago}
        })
        integration["calls_24h"] = call_count
        
        # Get company name
        company = await db.companies.find_one(
            {"company_id": integration["company_id"]},
            {"_id": 0, "name": 1}
        )
        integration["company_name"] = company["name"] if company else "Unknown"
    
    return {"integrations": integrations, "total": len(integrations)}


@integrations_admin_router.post("/")
async def create_integration(
    data: CreateIntegrationRequest,
    admin: User = Depends(get_super_admin)
):
    """Create a new integration with API key (super admin)"""
    now = datetime.now(timezone.utc)
    
    # Verify company exists
    company = await db.companies.find_one({"company_id": data.company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Generate integration ID and API keys
    integration_id = f"int_{uuid.uuid4().hex[:12]}"
    
    # Generate live and test API keys
    live_key, live_hash = generate_api_key("sk_live")
    test_key, test_hash = generate_api_key("sk_test")
    
    integration_doc = {
        "integration_id": integration_id,
        "company_id": data.company_id,
        "name": data.name,
        "description": data.description,
        "permissions": data.permissions,
        "rate_limit_tier": data.rate_limit_tier,
        "sandbox_mode": data.sandbox_mode,
        "webhook_url": data.webhook_url,
        "notes": data.notes,
        "api_key_hash": live_hash,  # Primary key hash
        "test_key_hash": test_hash,  # Test key hash
        "api_key_prefix": live_key[:12] + "...",  # For display
        "test_key_prefix": test_key[:12] + "...",
        "status": "active",
        "created_by": admin.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.integrations.insert_one(integration_doc)
    
    # Log action
    await db.admin_audit_log.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "admin_id": admin.user_id,
        "action": "create_integration",
        "target_id": integration_id,
        "details": {"company_id": data.company_id, "name": data.name},
        "timestamp": now.isoformat()
    })
    
    return {
        "success": True,
        "integration_id": integration_id,
        "api_key": live_key,  # Only shown once!
        "test_api_key": test_key,  # Only shown once!
        "message": "Integration created. Save these API keys - they won't be shown again!"
    }


@integrations_admin_router.get("/{integration_id}")
async def get_integration(
    integration_id: str,
    admin: User = Depends(get_super_admin)
):
    """Get integration details"""
    integration = await db.integrations.find_one(
        {"integration_id": integration_id},
        {"_id": 0, "api_key_hash": 0, "test_key_hash": 0}
    )
    
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    # Get company info
    company = await db.companies.find_one(
        {"company_id": integration["company_id"]},
        {"_id": 0, "name": 1}
    )
    integration["company_name"] = company["name"] if company else "Unknown"
    
    # Get recent logs
    logs = await db.integration_logs.find(
        {"integration_id": integration_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(20).to_list(20)
    
    # Get stats
    day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    
    stats = {
        "calls_24h": await db.integration_logs.count_documents({
            "integration_id": integration_id,
            "timestamp": {"$gte": day_ago}
        }),
        "calls_7d": await db.integration_logs.count_documents({
            "integration_id": integration_id,
            "timestamp": {"$gte": week_ago}
        }),
        "errors_24h": await db.integration_logs.count_documents({
            "integration_id": integration_id,
            "timestamp": {"$gte": day_ago},
            "success": False
        })
    }
    
    return {
        "integration": integration,
        "recent_logs": logs,
        "stats": stats
    }


@integrations_admin_router.patch("/{integration_id}")
async def update_integration(
    integration_id: str,
    data: UpdateIntegrationRequest,
    admin: User = Depends(get_super_admin)
):
    """Update integration settings"""
    integration = await db.integrations.find_one({"integration_id": integration_id})
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.integrations.update_one(
        {"integration_id": integration_id},
        {"$set": update_data}
    )
    
    # Log action
    await db.admin_audit_log.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "admin_id": admin.user_id,
        "action": "update_integration",
        "target_id": integration_id,
        "details": update_data,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"success": True, "message": "Integration updated"}


@integrations_admin_router.post("/{integration_id}/regenerate-key")
async def regenerate_api_key(
    integration_id: str,
    key_type: str = "live",  # live or test
    admin: User = Depends(get_super_admin)
):
    """Regenerate API key for an integration"""
    integration = await db.integrations.find_one({"integration_id": integration_id})
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    prefix = "sk_live" if key_type == "live" else "sk_test"
    new_key, new_hash = generate_api_key(prefix)
    
    hash_field = "api_key_hash" if key_type == "live" else "test_key_hash"
    prefix_field = "api_key_prefix" if key_type == "live" else "test_key_prefix"
    
    await db.integrations.update_one(
        {"integration_id": integration_id},
        {"$set": {
            hash_field: new_hash,
            prefix_field: new_key[:12] + "...",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log action
    await db.admin_audit_log.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "admin_id": admin.user_id,
        "action": f"regenerate_{key_type}_key",
        "target_id": integration_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "success": True,
        "new_api_key": new_key,
        "message": f"New {key_type} API key generated. Save it - it won't be shown again!"
    }


@integrations_admin_router.delete("/{integration_id}")
async def revoke_integration(
    integration_id: str,
    admin: User = Depends(get_super_admin)
):
    """Revoke/delete an integration"""
    integration = await db.integrations.find_one({"integration_id": integration_id})
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    # Soft delete - mark as revoked
    await db.integrations.update_one(
        {"integration_id": integration_id},
        {"$set": {
            "status": "revoked",
            "revoked_by": admin.user_id,
            "revoked_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log action
    await db.admin_audit_log.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "admin_id": admin.user_id,
        "action": "revoke_integration",
        "target_id": integration_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"success": True, "message": "Integration revoked"}


@integrations_admin_router.get("/{integration_id}/logs")
async def get_integration_logs(
    integration_id: str,
    limit: int = 50,
    offset: int = 0,
    success_only: Optional[bool] = None,
    admin: User = Depends(get_super_admin)
):
    """Get logs for an integration"""
    query = {"integration_id": integration_id}
    if success_only is not None:
        query["success"] = success_only
    
    logs = await db.integration_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(offset).limit(limit).to_list(limit)
    
    total = await db.integration_logs.count_documents(query)
    
    return {"logs": logs, "total": total, "limit": limit, "offset": offset}


# ============== ORGANIZATION WORKFLOW CONFIGURATION ==============

@integrations_admin_router.get("/{integration_id}/workflows")
async def get_integration_workflows(
    integration_id: str,
    admin: User = Depends(get_super_admin)
):
    """Get workflows configured for this integration"""
    integration = await db.integrations.find_one({"integration_id": integration_id})
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    workflows = await db.integration_workflows.find(
        {"company_id": integration["company_id"]},
        {"_id": 0}
    ).to_list(100)
    
    return {"workflows": workflows}


@integrations_admin_router.post("/{integration_id}/workflows")
async def create_integration_workflow(
    integration_id: str,
    data: IntegrationWorkflowConfig,
    admin: User = Depends(get_super_admin)
):
    """Create a workflow for integration events"""
    integration = await db.integrations.find_one({"integration_id": integration_id})
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    now = datetime.now(timezone.utc)
    workflow_id = f"wf_{uuid.uuid4().hex[:12]}"
    
    workflow_doc = {
        "workflow_id": workflow_id,
        "company_id": integration["company_id"],
        "integration_id": integration_id,
        "name": data.name,
        "trigger_event": data.trigger_event,
        "actions": data.actions,
        "conditions": data.conditions,
        "status": "active",
        "created_by": admin.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.integration_workflows.insert_one(workflow_doc)
    
    return {"success": True, "workflow_id": workflow_id}


# ============== AVAILABLE EVENT TYPES ==============

@integrations_admin_router.get("/meta/event-types")
async def get_available_event_types(admin: User = Depends(get_super_admin)):
    """Get list of available event types for workflows"""
    return {
        "event_types": [
            {
                "type": "on_lead_company",
                "description": "Triggered when a company lead is created",
                "payload_fields": ["lead_id", "name", "email", "rnc", "source"]
            },
            {
                "type": "on_lead_candidate",
                "description": "Triggered when a candidate lead is created",
                "payload_fields": ["lead_id", "name", "email", "source"]
            },
            {
                "type": "on_lead_contractor",
                "description": "Triggered when a contractor lead is created",
                "payload_fields": ["lead_id", "name", "email", "source"]
            },
            {
                "type": "on_lead_created",
                "description": "Triggered when any lead is created",
                "payload_fields": ["lead_id", "lead_type", "name", "email", "source"]
            },
            {
                "type": "on_invoice_created",
                "description": "Triggered when an invoice is created",
                "payload_fields": ["invoice_id", "invoice_number", "client_id", "amount", "currency"]
            },
            {
                "type": "custom",
                "description": "Custom event type - define your own",
                "payload_fields": ["event_type", "payload"]
            }
        ],
        "available_actions": [
            {"type": "send_email", "description": "Send an email notification"},
            {"type": "create_task", "description": "Create a task for team member"},
            {"type": "update_crm_stage", "description": "Move lead to a different stage"},
            {"type": "webhook", "description": "Call an external webhook"},
            {"type": "slack_notification", "description": "Send Slack notification"},
            {"type": "assign_to_user", "description": "Assign to a specific user"}
        ]
    }
