"""
Kora OS - External Integrations API Router
Allows external platforms (Staffdo, etc.) to integrate with Kora OS

Endpoints:
- POST /api/v1/integrations/leads - Create leads in CRM
- POST /api/v1/integrations/invoices - Create invoices
- POST /api/v1/integrations/events - Trigger custom workflows
"""

from fastapi import APIRouter, HTTPException, Request, Depends, Header
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import hashlib
import secrets
import time

from config import db

integrations_api_router = APIRouter(prefix="/v1/integrations", tags=["External Integrations API"])


# ============== MODELS ==============

class LeadType(str, Enum):
    COMPANY = "company"
    CANDIDATE = "candidate"
    CONTRACTOR = "contractor"
    OTHER = "other"


class CreateLeadRequest(BaseModel):
    """Create a lead via external integration"""
    type: LeadType = LeadType.OTHER
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    rnc: Optional[str] = None  # Tax ID for Dominican Republic
    source: Optional[str] = None  # e.g., "staffdo", "website"
    notes: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None  # Extra data from external system


class CreateInvoiceRequest(BaseModel):
    """Create an invoice via external integration"""
    client_rnc: Optional[str] = None  # Find client by RNC
    client_email: Optional[str] = None  # Or find by email
    client_name: Optional[str] = None  # Or create new client
    amount: float = Field(..., gt=0)
    currency: str = "USD"
    description: str
    items: Optional[List[Dict[str, Any]]] = None
    due_date: Optional[str] = None
    external_reference: Optional[str] = None  # Reference ID from external system
    metadata: Optional[Dict[str, Any]] = None


class TriggerEventRequest(BaseModel):
    """Trigger a custom event/workflow"""
    event_type: str = Field(..., min_length=1, max_length=100)
    payload: Dict[str, Any] = {}
    metadata: Optional[Dict[str, Any]] = None


class IntegrationResponse(BaseModel):
    """Standard response for integration endpoints"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    id: Optional[str] = None  # ID of created resource
    warnings: Optional[List[str]] = None


# ============== RATE LIMITING ==============

# In-memory rate limit store (in production, use Redis)
rate_limit_store: Dict[str, List[float]] = {}

RATE_LIMITS = {
    "standard": {"requests": 100, "window": 60},  # 100 requests per minute
    "premium": {"requests": 1000, "window": 60},  # 1000 requests per minute
}


async def check_rate_limit(api_key: str, tier: str = "standard") -> bool:
    """Check if request is within rate limits"""
    now = time.time()
    limit_config = RATE_LIMITS.get(tier, RATE_LIMITS["standard"])
    window = limit_config["window"]
    max_requests = limit_config["requests"]
    
    if api_key not in rate_limit_store:
        rate_limit_store[api_key] = []
    
    # Remove old entries outside the window
    rate_limit_store[api_key] = [
        ts for ts in rate_limit_store[api_key] 
        if now - ts < window
    ]
    
    if len(rate_limit_store[api_key]) >= max_requests:
        return False
    
    rate_limit_store[api_key].append(now)
    return True


# ============== API KEY AUTHENTICATION ==============

async def validate_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
) -> Dict[str, Any]:
    """Validate API key and return integration details"""
    
    if not x_api_key:
        raise HTTPException(
            status_code=401, 
            detail="Missing API key. Provide X-API-Key header."
        )
    
    # Hash the API key to compare with stored hash
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    
    # Check if it's a test key
    is_test_key = x_api_key.startswith("sk_test_")
    
    # Find integration by API key hash (check both live and test keys)
    if is_test_key:
        integration = await db.integrations.find_one({
            "test_key_hash": key_hash,
            "status": "active"
        })
    else:
        integration = await db.integrations.find_one({
            "api_key_hash": key_hash,
            "status": "active"
        })
    
    if not integration:
        # Log failed attempt
        await db.integration_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "type": "auth_failed",
            "api_key_prefix": x_api_key[:8] + "..." if len(x_api_key) > 8 else "invalid",
            "ip_address": request.client.host if request.client else "unknown",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # Check if integration is in sandbox mode (either test key or sandbox_mode enabled)
    is_sandbox = is_test_key or integration.get("sandbox_mode", False)
    
    # Check rate limit
    tier = integration.get("rate_limit_tier", "standard")
    if not await check_rate_limit(x_api_key, tier):
        raise HTTPException(
            status_code=429, 
            detail=f"Rate limit exceeded. Max {RATE_LIMITS[tier]['requests']} requests per minute."
        )
    
    # Update last used timestamp
    await db.integrations.update_one(
        {"integration_id": integration["integration_id"]},
        {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "integration_id": integration["integration_id"],
        "company_id": integration["company_id"],
        "name": integration["name"],
        "permissions": integration.get("permissions", []),
        "is_sandbox": is_sandbox or integration.get("sandbox_mode", False),
        "tier": tier
    }


def require_permission(permission: str):
    """Decorator to check if integration has required permission"""
    async def check_permission(integration: Dict = Depends(validate_api_key)):
        if permission not in integration.get("permissions", []):
            raise HTTPException(
                status_code=403, 
                detail=f"Integration does not have '{permission}' permission"
            )
        return integration
    return check_permission


# ============== LOGGING ==============

async def log_api_call(
    integration: Dict,
    endpoint: str,
    request_data: Dict,
    response_data: Dict,
    success: bool,
    error: Optional[str] = None
):
    """Log API call for debugging and analytics"""
    await db.integration_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "integration_id": integration["integration_id"],
        "company_id": integration["company_id"],
        "endpoint": endpoint,
        "request_data": request_data,
        "response_data": response_data,
        "success": success,
        "error": error,
        "is_sandbox": integration.get("is_sandbox", False),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


# ============== WORKFLOW TRIGGER ==============

async def trigger_integration_workflow(
    company_id: str,
    event_type: str,
    payload: Dict[str, Any],
    integration_id: str,
    is_sandbox: bool = False
):
    """Trigger workflows configured for this integration event"""
    
    # Find workflows configured for this event type
    workflows = await db.integration_workflows.find({
        "company_id": company_id,
        "trigger_event": event_type,
        "status": "active"
    }).to_list(50)
    
    triggered_workflows = []
    
    for workflow in workflows:
        # Create workflow execution record
        execution_id = f"exec_{uuid.uuid4().hex[:12]}"
        
        await db.workflow_executions.insert_one({
            "execution_id": execution_id,
            "workflow_id": workflow["workflow_id"],
            "company_id": company_id,
            "integration_id": integration_id,
            "trigger_event": event_type,
            "payload": payload,
            "is_sandbox": is_sandbox,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        triggered_workflows.append({
            "workflow_id": workflow["workflow_id"],
            "workflow_name": workflow.get("name"),
            "execution_id": execution_id
        })
    
    return triggered_workflows


# ============== ENDPOINTS ==============

@integrations_api_router.post("/leads", response_model=IntegrationResponse)
async def create_lead(
    request: Request,
    data: CreateLeadRequest,
    integration: Dict = Depends(require_permission("leads"))
):
    """
    Create a lead in the CRM from an external platform.
    
    Triggers workflows based on lead type:
    - company: on_lead_company
    - candidate: on_lead_candidate  
    - contractor: on_lead_contractor
    - other: on_lead_created
    """
    try:
        now = datetime.now(timezone.utc)
        company_id = integration["company_id"]
        is_sandbox = integration.get("is_sandbox", False)
        
        # Generate lead ID
        lead_id = f"lead_{uuid.uuid4().hex[:12]}"
        
        # Prepare lead document
        lead_doc = {
            "lead_id": lead_id,
            "company_id": company_id,
            "name": data.name,
            "email": data.email,
            "phone": data.phone,
            "company_name": data.company_name,
            "rnc": data.rnc,
            "lead_type": data.type.value,
            "source": data.source or integration["name"],
            "source_integration": integration["integration_id"],
            "notes": data.notes,
            "custom_fields": data.custom_fields or {},
            "external_metadata": data.metadata or {},
            "stage": "new",
            "status": "active",
            "is_sandbox": is_sandbox,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        # Insert lead (or use sandbox collection)
        collection = "leads_sandbox" if is_sandbox else "leads"
        await db[collection].insert_one(lead_doc)
        
        # Determine event type based on lead type
        event_type_map = {
            "company": "on_lead_company",
            "candidate": "on_lead_candidate",
            "contractor": "on_lead_contractor",
            "other": "on_lead_created"
        }
        event_type = event_type_map.get(data.type.value, "on_lead_created")
        
        # Trigger workflows
        triggered = await trigger_integration_workflow(
            company_id=company_id,
            event_type=event_type,
            payload={
                "lead_id": lead_id,
                "lead_type": data.type.value,
                "name": data.name,
                "email": data.email,
                "source": data.source
            },
            integration_id=integration["integration_id"],
            is_sandbox=is_sandbox
        )
        
        response = IntegrationResponse(
            success=True,
            message="Lead created successfully",
            id=lead_id,
            data={
                "lead_id": lead_id,
                "lead_type": data.type.value,
                "workflows_triggered": len(triggered),
                "is_sandbox": is_sandbox
            }
        )
        
        # Log the API call
        await log_api_call(
            integration=integration,
            endpoint="/leads",
            request_data=data.dict(),
            response_data=response.dict(),
            success=True
        )
        
        return response
        
    except Exception as e:
        await log_api_call(
            integration=integration,
            endpoint="/leads",
            request_data=data.dict(),
            response_data={},
            success=False,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))


@integrations_api_router.post("/invoices", response_model=IntegrationResponse)
async def create_invoice(
    request: Request,
    data: CreateInvoiceRequest,
    integration: Dict = Depends(require_permission("invoices"))
):
    """
    Create an invoice from an external platform.
    
    Client lookup priority:
    1. By RNC (tax ID)
    2. By email
    3. Create new client if not found
    
    Triggers: on_invoice_created workflow
    """
    try:
        now = datetime.now(timezone.utc)
        company_id = integration["company_id"]
        is_sandbox = integration.get("is_sandbox", False)
        
        # Find or create client
        client = None
        client_id = None
        warnings = []
        
        clients_collection = "clients_sandbox" if is_sandbox else "clients"
        
        # Try to find by RNC
        if data.client_rnc:
            client = await db[clients_collection].find_one({
                "company_id": company_id,
                "rnc": data.client_rnc
            })
        
        # Try to find by email
        if not client and data.client_email:
            client = await db[clients_collection].find_one({
                "company_id": company_id,
                "email": data.client_email
            })
        
        if client:
            client_id = client["client_id"]
        elif data.client_name:
            # Create new client
            client_id = f"client_{uuid.uuid4().hex[:12]}"
            await db[clients_collection].insert_one({
                "client_id": client_id,
                "company_id": company_id,
                "name": data.client_name,
                "email": data.client_email,
                "rnc": data.client_rnc,
                "source": "integration",
                "source_integration": integration["integration_id"],
                "is_sandbox": is_sandbox,
                "created_at": now.isoformat()
            })
            warnings.append("Client not found, created new client record")
        else:
            raise HTTPException(
                status_code=400, 
                detail="Client not found. Provide client_rnc, client_email, or client_name to create new."
            )
        
        # Generate invoice ID and number
        invoice_id = f"inv_{uuid.uuid4().hex[:12]}"
        
        # Get next invoice number for this company
        counter = await db.counters.find_one_and_update(
            {"company_id": company_id, "type": "invoice"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )
        invoice_number = f"INV-{counter['value']:06d}"
        
        # Calculate due date
        due_date = data.due_date
        if not due_date:
            due_date = (now + timedelta(days=30)).isoformat()
        
        # Prepare invoice document
        invoice_doc = {
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "company_id": company_id,
            "client_id": client_id,
            "amount": data.amount,
            "currency": data.currency,
            "description": data.description,
            "items": data.items or [],
            "due_date": due_date,
            "external_reference": data.external_reference,
            "source_integration": integration["integration_id"],
            "external_metadata": data.metadata or {},
            "status": "draft",
            "is_sandbox": is_sandbox,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        invoices_collection = "invoices_sandbox" if is_sandbox else "invoices"
        await db[invoices_collection].insert_one(invoice_doc)
        
        # Trigger workflows
        triggered = await trigger_integration_workflow(
            company_id=company_id,
            event_type="on_invoice_created",
            payload={
                "invoice_id": invoice_id,
                "invoice_number": invoice_number,
                "client_id": client_id,
                "amount": data.amount,
                "currency": data.currency
            },
            integration_id=integration["integration_id"],
            is_sandbox=is_sandbox
        )
        
        response = IntegrationResponse(
            success=True,
            message="Invoice created successfully",
            id=invoice_id,
            data={
                "invoice_id": invoice_id,
                "invoice_number": invoice_number,
                "client_id": client_id,
                "amount": data.amount,
                "currency": data.currency,
                "workflows_triggered": len(triggered),
                "is_sandbox": is_sandbox
            },
            warnings=warnings if warnings else None
        )
        
        await log_api_call(
            integration=integration,
            endpoint="/invoices",
            request_data=data.dict(),
            response_data=response.dict(),
            success=True
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        await log_api_call(
            integration=integration,
            endpoint="/invoices",
            request_data=data.dict(),
            response_data={},
            success=False,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))


@integrations_api_router.post("/events", response_model=IntegrationResponse)
async def trigger_event(
    request: Request,
    data: TriggerEventRequest,
    integration: Dict = Depends(require_permission("events"))
):
    """
    Trigger a custom event that can activate workflows.
    
    Use this for custom integrations where you define your own event types.
    Organizations can configure workflows to respond to these events.
    """
    try:
        now = datetime.now(timezone.utc)
        company_id = integration["company_id"]
        is_sandbox = integration.get("is_sandbox", False)
        
        # Create event record
        event_id = f"evt_{uuid.uuid4().hex[:12]}"
        
        event_doc = {
            "event_id": event_id,
            "company_id": company_id,
            "integration_id": integration["integration_id"],
            "event_type": data.event_type,
            "payload": data.payload,
            "metadata": data.metadata or {},
            "is_sandbox": is_sandbox,
            "created_at": now.isoformat()
        }
        
        events_collection = "integration_events_sandbox" if is_sandbox else "integration_events"
        await db[events_collection].insert_one(event_doc)
        
        # Trigger workflows for this event type
        triggered = await trigger_integration_workflow(
            company_id=company_id,
            event_type=data.event_type,
            payload=data.payload,
            integration_id=integration["integration_id"],
            is_sandbox=is_sandbox
        )
        
        response = IntegrationResponse(
            success=True,
            message=f"Event '{data.event_type}' triggered successfully",
            id=event_id,
            data={
                "event_id": event_id,
                "event_type": data.event_type,
                "workflows_triggered": len(triggered),
                "triggered_workflows": triggered,
                "is_sandbox": is_sandbox
            }
        )
        
        await log_api_call(
            integration=integration,
            endpoint="/events",
            request_data=data.dict(),
            response_data=response.dict(),
            success=True
        )
        
        return response
        
    except Exception as e:
        await log_api_call(
            integration=integration,
            endpoint="/events",
            request_data=data.dict(),
            response_data={},
            success=False,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))


@integrations_api_router.get("/health")
async def health_check(integration: Dict = Depends(validate_api_key)):
    """
    Health check endpoint to verify API key and connection.
    """
    return {
        "status": "healthy",
        "integration": integration["name"],
        "permissions": integration["permissions"],
        "is_sandbox": integration.get("is_sandbox", False),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
