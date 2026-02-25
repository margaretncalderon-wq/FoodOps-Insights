# routers/support_tickets.py - Bug reports and support tickets
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone
import uuid
from config import db
from models.auth import User
from routers.auth import get_current_user

support_router = APIRouter(prefix="/support", tags=["Support"])


# ============== USER ENDPOINTS ==============

@support_router.post("/tickets")
async def create_ticket(data: dict, user: User = Depends(get_current_user)):
    """Create a new support ticket / bug report"""
    company_id = user.company_id or user.active_org_id
    
    now = datetime.now(timezone.utc)
    ticket = {
        "ticket_id": f"TKT-{uuid.uuid4().hex[:8].upper()}",
        "company_id": company_id,
        "user_id": user.user_id,
        "user_email": user.email,
        "user_name": user.name,
        "type": data.get("type", "bug"),  # bug, feature, question, other
        "subject": data.get("subject", ""),
        "description": data.get("description", ""),
        "page_url": data.get("page_url"),
        "browser_info": data.get("browser_info"),
        "screenshot_url": data.get("screenshot_url"),
        "priority": data.get("priority", "normal"),  # low, normal, high, urgent
        "status": "open",  # open, in_progress, resolved, closed
        "assigned_to": None,
        "resolution_notes": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "resolved_at": None
    }
    
    await db.support_tickets.insert_one(ticket)
    del ticket["_id"]
    
    return {"success": True, "ticket_id": ticket["ticket_id"], "message": "Ticket created successfully"}


@support_router.get("/tickets/mine")
async def get_my_tickets(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get tickets created by the current user"""
    query = {"user_id": user.user_id}
    if status:
        query["status"] = status
    
    tickets = await db.support_tickets.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return tickets


# ============== ADMIN ENDPOINTS ==============

@support_router.get("/admin/tickets")
async def admin_get_all_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    type: Optional[str] = None,
    company_id: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: User = Depends(get_current_user)
):
    """Get all support tickets (admin only)"""
    # Check if user is super admin
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if type:
        query["type"] = type
    if company_id:
        query["company_id"] = company_id
    
    tickets = await db.support_tickets.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    
    # Get total count
    total = await db.support_tickets.count_documents(query)
    
    return {
        "tickets": tickets,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@support_router.get("/admin/tickets/stats")
async def admin_get_ticket_stats(user: User = Depends(get_current_user)):
    """Get ticket statistics (admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    total = await db.support_tickets.count_documents({})
    open_count = await db.support_tickets.count_documents({"status": "open"})
    in_progress = await db.support_tickets.count_documents({"status": "in_progress"})
    resolved = await db.support_tickets.count_documents({"status": "resolved"})
    
    # By priority
    urgent = await db.support_tickets.count_documents({"status": "open", "priority": "urgent"})
    high = await db.support_tickets.count_documents({"status": "open", "priority": "high"})
    
    # By type
    bugs = await db.support_tickets.count_documents({"type": "bug"})
    features = await db.support_tickets.count_documents({"type": "feature"})
    
    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress,
        "resolved": resolved,
        "urgent_open": urgent,
        "high_open": high,
        "bugs": bugs,
        "feature_requests": features
    }


@support_router.get("/admin/tickets/{ticket_id}")
async def admin_get_ticket(ticket_id: str, user: User = Depends(get_current_user)):
    """Get a specific ticket (admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    ticket = await db.support_tickets.find_one(
        {"ticket_id": ticket_id}, {"_id": 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return ticket


@support_router.patch("/admin/tickets/{ticket_id}")
async def admin_update_ticket(
    ticket_id: str, 
    data: dict, 
    user: User = Depends(get_current_user)
):
    """Update a ticket (admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Allowed fields to update
    allowed = ["status", "priority", "assigned_to", "resolution_notes"]
    for field in allowed:
        if field in data:
            update_data[field] = data[field]
    
    # If resolving, set resolved_at
    if data.get("status") == "resolved":
        update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return {"success": True, "ticket_id": ticket_id}


@support_router.delete("/admin/tickets/{ticket_id}")
async def admin_delete_ticket(ticket_id: str, user: User = Depends(get_current_user)):
    """Delete a ticket (admin only)"""
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.support_tickets.delete_one({"ticket_id": ticket_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    return {"success": True}
