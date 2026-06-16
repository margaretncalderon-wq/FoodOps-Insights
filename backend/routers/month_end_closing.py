# routers/month_end_closing.py
# Personnel Month-End Closing module.
# Replicates the user's "Cierre de Mes" Google Sheet:
#   - Incentive pool = revenue_total × incentive_pool_pct
#   - Distributed per employee using fixed percentages (must sum to 100)
#   - Extras = sum of approved overtime estimated_amount in the month range
#   - Totals per employee = incentivo + extras + (optional) base/notes
#
# Access: admin / HR / managers (anyone who passes people_ops_access check)

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, date as date_cls
from calendar import monthrange
import uuid

from config import db
from models.auth import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/people-ops/month-end", tags=["Month-End Closing"])


# ==================== MODELS ====================

class IncentivePersonShare(BaseModel):
    employee_id: str
    pct: float = 0.0  # 0-100, % of pool


class MonthEndCreate(BaseModel):
    year: int
    month: int  # 1-12
    revenue_total: float = 0.0
    incentive_pool_pct: float = 0.0  # % of revenue that goes to incentives
    distribution: List[IncentivePersonShare] = []
    notes: Optional[str] = None


class MonthEndUpdate(BaseModel):
    revenue_total: Optional[float] = None
    incentive_pool_pct: Optional[float] = None
    distribution: Optional[List[IncentivePersonShare]] = None
    notes: Optional[str] = None


# ==================== HELPERS ====================

async def _resolve_company_and_access(user: User) -> str:
    """Returns company_id. Access: company admin OR people-ops admin OR manager.
    Raises 403 if not allowed."""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=403, detail="No company context")
    
    if user.role in ("owner", "admin", "hr"):
        return company_id
    
    # Check if user is linked to an employee marked as manager
    emp = await db.employees.find_one(
        {"company_id": company_id, "user_id": user.user_id},
        {"_id": 0, "is_manager": 1}
    )
    if emp and emp.get("is_manager"):
        return company_id
    
    raise HTTPException(status_code=403, detail="Access denied to Month-End Closing")


def _month_range(year: int, month: int) -> tuple[str, str]:
    """Returns (start_date, end_date) ISO strings for the given month."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1-12")
    last_day = monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"


async def _compute_breakdown(closing: dict) -> dict:
    """Computes the live breakdown: incentive amounts per person + extras (OT) per person + totals.
    For closed snapshots, returns the persisted snapshot instead."""
    if closing.get("status") == "closed" and closing.get("snapshot"):
        return closing["snapshot"]
    
    company_id = closing["company_id"]
    year = closing["year"]
    month = closing["month"]
    start_date, end_date = _month_range(year, month)
    
    revenue = float(closing.get("revenue_total") or 0)
    pool_pct = float(closing.get("incentive_pool_pct") or 0)
    incentive_pool = round(revenue * pool_pct / 100, 2)
    
    # ---- Pull employees referenced in distribution
    distribution = closing.get("distribution") or []
    emp_ids = [d["employee_id"] for d in distribution if d.get("employee_id")]
    employees_by_id = {}
    if emp_ids:
        emps = await db.employees.find(
            {"company_id": company_id, "employee_id": {"$in": emp_ids}},
            {"_id": 0, "employee_id": 1, "full_name": 1, "base_salary": 1}
        ).to_list(500)
        employees_by_id = {e["employee_id"]: e for e in emps}
    
    # ---- Pull OT approved/processed in range (we look at ALL company OTs to include people
    #      not in the incentive distribution; user can add Extras-only employees ad hoc)
    ot_docs = await db.overtime_requests.find({
        "company_id": company_id,
        "status": {"$in": ["approved", "processed"]},
        "date": {"$gte": start_date, "$lte": end_date},
    }, {"_id": 0}).to_list(2000)
    
    extras_by_emp: dict = {}
    for ot in ot_docs:
        emp_id = ot.get("employee_id")
        if not emp_id:
            continue
        acc = extras_by_emp.setdefault(emp_id, {
            "employee_id": emp_id,
            "employee_name": ot.get("employee_name"),
            "hours_total": 0.0,
            "extras_amount": 0.0,
        })
        acc["hours_total"] += float(ot.get("total_hours") or 0)
        acc["extras_amount"] += float(ot.get("estimated_amount") or 0)
    
    # ---- Build per-person rows
    pct_sum = round(sum(float(d.get("pct") or 0) for d in distribution), 2)
    rows: List[dict] = []
    used_emp_ids = set()
    
    for d in distribution:
        emp_id = d["employee_id"]
        emp = employees_by_id.get(emp_id) or {}
        pct = float(d.get("pct") or 0)
        incentive_amount = round(incentive_pool * pct / 100, 2)
        extras = extras_by_emp.get(emp_id, {"extras_amount": 0.0, "hours_total": 0.0})
        rows.append({
            "employee_id": emp_id,
            "employee_name": emp.get("full_name") or extras.get("employee_name") or "—",
            "pct": pct,
            "incentive_amount": incentive_amount,
            "hours_total": round(extras.get("hours_total", 0), 2),
            "extras_amount": round(extras.get("extras_amount", 0), 2),
            "total": round(incentive_amount + extras.get("extras_amount", 0), 2),
        })
        used_emp_ids.add(emp_id)
    
    # Append rows for employees with OT but NOT in distribution (extras-only)
    for emp_id, extras in extras_by_emp.items():
        if emp_id in used_emp_ids:
            continue
        rows.append({
            "employee_id": emp_id,
            "employee_name": extras.get("employee_name") or "—",
            "pct": 0.0,
            "incentive_amount": 0.0,
            "hours_total": round(extras.get("hours_total", 0), 2),
            "extras_amount": round(extras.get("extras_amount", 0), 2),
            "total": round(extras.get("extras_amount", 0), 2),
        })
    
    total_incentive = round(sum(r["incentive_amount"] for r in rows), 2)
    total_extras = round(sum(r["extras_amount"] for r in rows), 2)
    grand_total = round(total_incentive + total_extras, 2)
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "revenue_total": revenue,
        "incentive_pool_pct": pool_pct,
        "incentive_pool": incentive_pool,
        "distribution_pct_sum": pct_sum,
        "rows": rows,
        "totals": {
            "incentive": total_incentive,
            "extras": total_extras,
            "grand_total": grand_total,
        }
    }


# ==================== ENDPOINTS ====================

@router.get("")
async def list_closings(user: User = Depends(get_current_user)):
    """List all month-end closings for the company (lightweight)."""
    company_id = await _resolve_company_and_access(user)
    docs = await db.month_end_closings.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort([("year", -1), ("month", -1)]).to_list(120)
    return docs


@router.post("")
async def create_closing(data: MonthEndCreate, user: User = Depends(get_current_user)):
    """Create a new month-end closing (draft)."""
    company_id = await _resolve_company_and_access(user)
    
    # Reject duplicate for same year+month
    existing = await db.month_end_closings.find_one(
        {"company_id": company_id, "year": data.year, "month": data.month},
        {"_id": 0, "closing_id": 1, "status": 1}
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Closing for {data.year}-{data.month:02d} already exists (id={existing['closing_id']}, status={existing['status']})"
        )
    
    now = datetime.now(timezone.utc).isoformat()
    closing_id = f"close_{uuid.uuid4().hex[:12]}"
    
    doc = {
        "closing_id": closing_id,
        "company_id": company_id,
        "year": data.year,
        "month": data.month,
        "status": "draft",
        "revenue_total": data.revenue_total,
        "incentive_pool_pct": data.incentive_pool_pct,
        "distribution": [d.dict() for d in data.distribution],
        "notes": data.notes,
        "snapshot": None,
        "closed_at": None,
        "closed_by": None,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
    }
    await db.month_end_closings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{closing_id}")
async def get_closing(closing_id: str, user: User = Depends(get_current_user)):
    """Get a single closing with the live (or snapshot) breakdown."""
    company_id = await _resolve_company_and_access(user)
    doc = await db.month_end_closings.find_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Closing not found")
    
    breakdown = await _compute_breakdown(doc)
    return {**doc, "breakdown": breakdown}


@router.put("/{closing_id}")
async def update_closing(
    closing_id: str,
    data: MonthEndUpdate,
    user: User = Depends(get_current_user)
):
    """Update a draft closing's revenue/pct/distribution/notes."""
    company_id = await _resolve_company_and_access(user)
    
    doc = await db.month_end_closings.find_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Closing not found")
    if doc.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closing is already closed; cannot edit")
    
    update_data = data.dict(exclude_unset=True)
    if "distribution" in update_data and update_data["distribution"] is not None:
        update_data["distribution"] = [d if isinstance(d, dict) else d.dict() for d in update_data["distribution"]]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.month_end_closings.update_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    fresh = await db.month_end_closings.find_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"_id": 0}
    )
    breakdown = await _compute_breakdown(fresh)
    return {**fresh, "breakdown": breakdown}


@router.post("/{closing_id}/close")
async def close_closing(closing_id: str, user: User = Depends(get_current_user)):
    """Lock the closing and persist a snapshot of the breakdown."""
    company_id = await _resolve_company_and_access(user)
    
    doc = await db.month_end_closings.find_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Closing not found")
    if doc.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Already closed")
    
    breakdown = await _compute_breakdown(doc)
    now = datetime.now(timezone.utc).isoformat()
    
    await db.month_end_closings.update_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"$set": {
            "status": "closed",
            "snapshot": breakdown,
            "closed_at": now,
            "closed_by": user.user_id,
            "updated_at": now,
        }}
    )
    
    return {"message": "Closed", "closing_id": closing_id, "closed_at": now}


@router.post("/{closing_id}/reopen")
async def reopen_closing(closing_id: str, user: User = Depends(get_current_user)):
    """Reopen a closed closing for editing (admin-only)."""
    company_id = await _resolve_company_and_access(user)
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owner/admin can reopen a closed period")
    
    res = await db.month_end_closings.update_one(
        {"closing_id": closing_id, "company_id": company_id, "status": "closed"},
        {"$set": {
            "status": "draft",
            "snapshot": None,
            "closed_at": None,
            "closed_by": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Closed period not found")
    return {"message": "Reopened"}


@router.delete("/{closing_id}")
async def delete_closing(closing_id: str, user: User = Depends(get_current_user)):
    """Delete a draft closing (closed ones cannot be deleted)."""
    company_id = await _resolve_company_and_access(user)
    
    doc = await db.month_end_closings.find_one(
        {"closing_id": closing_id, "company_id": company_id},
        {"_id": 0, "status": 1}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Closing not found")
    if doc.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closed periods cannot be deleted (reopen first)")
    
    await db.month_end_closings.delete_one({"closing_id": closing_id, "company_id": company_id})
    return {"message": "Deleted"}


@router.get("/access/can-view")
async def can_view_module(user: User = Depends(get_current_user)):
    """Convenience endpoint for the frontend to know whether to show the tab/section."""
    try:
        await _resolve_company_and_access(user)
        return {"allowed": True, "role": user.role}
    except HTTPException:
        return {"allowed": False, "role": user.role}
