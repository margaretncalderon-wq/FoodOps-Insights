# routers/time_clock.py
# Time Clock / Attendance module.
# - Employees can clock in/out via the app
# - Admins/Managers can correct entries or add manual ones
# - Weekly summary aggregates hours and flags overtime breaches

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta, date as date_cls
import uuid

from config import db
from models.auth import User
from routers.auth import get_current_user
from routers.people_ops import check_people_ops_access

router = APIRouter(prefix="/api/people-ops/time-clock", tags=["Time Clock"])


# ==================== MODELS ====================

class ClockInRequest(BaseModel):
    employee_id: Optional[str] = None  # admin can clock in on behalf; defaults to current user
    notes: Optional[str] = None


class ClockOutRequest(BaseModel):
    entry_id: Optional[str] = None  # if None, closes the active entry of the user
    notes: Optional[str] = None


class ManualEntry(BaseModel):
    employee_id: str
    clock_in: str  # ISO datetime
    clock_out: str  # ISO datetime
    notes: Optional[str] = None


class TimeEntryUpdate(BaseModel):
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    notes: Optional[str] = None


# ==================== HELPERS ====================

async def _resolve_employee(user: User, employee_id: Optional[str]) -> dict:
    """Returns the employee doc. If employee_id provided, requires people_ops edit access.
    Otherwise tries to find the employee linked to the current user."""
    company_id = user.company_id or user.active_org_id
    if employee_id:
        # Admin / manager pathway
        company_id, _ = await check_people_ops_access(user, "edit")
        emp = await db.employees.find_one({"company_id": company_id, "employee_id": employee_id}, {"_id": 0})
    else:
        # Self pathway
        emp = await db.employees.find_one({"company_id": company_id, "user_id": user.user_id}, {"_id": 0})
        if not emp:
            # Fall back to matching email
            emp = await db.employees.find_one({"company_id": company_id, "email": user.email}, {"_id": 0}) if user.email else None
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


def _week_range(ref_date: date_cls) -> tuple[date_cls, date_cls]:
    """Mon-Sun ISO week containing ref_date."""
    start = ref_date - timedelta(days=ref_date.weekday())
    return start, start + timedelta(days=6)


# ==================== ENDPOINTS ====================

@router.get("/current")
async def get_current_shift(user: User = Depends(get_current_user)):
    """Returns the active (open) shift for the current user, if any."""
    emp = await _resolve_employee(user, None)
    open_entry = await db.time_entries.find_one(
        {"company_id": emp["company_id"], "employee_id": emp["employee_id"], "clock_out": None},
        {"_id": 0}
    )
    return {"employee_id": emp["employee_id"], "employee_name": emp.get("full_name"), "active_shift": open_entry}


@router.post("/clock-in")
async def clock_in(data: ClockInRequest, user: User = Depends(get_current_user)):
    """Start a shift. Closes any existing open shift first (defensive)."""
    emp = await _resolve_employee(user, data.employee_id)
    company_id = emp["company_id"]
    
    # Close any existing open shift (sanity)
    existing = await db.time_entries.find_one(
        {"company_id": company_id, "employee_id": emp["employee_id"], "clock_out": None},
        {"_id": 0, "entry_id": 1}
    )
    if existing:
        raise HTTPException(status_code=400, detail="There's already an active shift. Clock out first.")
    
    now = datetime.now(timezone.utc)
    entry_id = f"te_{uuid.uuid4().hex[:12]}"
    doc = {
        "entry_id": entry_id,
        "company_id": company_id,
        "employee_id": emp["employee_id"],
        "employee_name": emp.get("full_name"),
        "clock_in": now.isoformat(),
        "clock_out": None,
        "total_minutes": None,
        "work_date": now.date().isoformat(),
        "notes": data.notes,
        "source": "self" if not data.employee_id else "admin",
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.time_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/clock-out")
async def clock_out(data: ClockOutRequest, user: User = Depends(get_current_user)):
    """End the active shift for the current user (or specified entry_id)."""
    company_id = user.company_id or user.active_org_id
    query: dict = {"company_id": company_id, "clock_out": None}
    
    if data.entry_id:
        query["entry_id"] = data.entry_id
    else:
        # Self path: find user's employee
        emp = await _resolve_employee(user, None)
        query["employee_id"] = emp["employee_id"]
    
    entry = await db.time_entries.find_one(query, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="No active shift found")
    
    now = datetime.now(timezone.utc)
    clock_in_dt = datetime.fromisoformat(entry["clock_in"])
    total_minutes = max(0, int((now - clock_in_dt).total_seconds() / 60))
    
    notes = data.notes or entry.get("notes")
    
    await db.time_entries.update_one(
        {"entry_id": entry["entry_id"]},
        {"$set": {
            "clock_out": now.isoformat(),
            "total_minutes": total_minutes,
            "notes": notes,
            "updated_at": now.isoformat(),
        }}
    )
    
    return {
        "entry_id": entry["entry_id"],
        "clock_in": entry["clock_in"],
        "clock_out": now.isoformat(),
        "total_minutes": total_minutes,
        "total_hours": round(total_minutes / 60, 2),
    }


@router.post("/manual-entry")
async def manual_entry(data: ManualEntry, user: User = Depends(get_current_user)):
    """Admin adds a complete (closed) shift retroactively."""
    company_id, _ = await check_people_ops_access(user, "edit")
    emp = await db.employees.find_one(
        {"company_id": company_id, "employee_id": data.employee_id},
        {"_id": 0, "full_name": 1, "employee_id": 1}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    try:
        ci = datetime.fromisoformat(data.clock_in.replace("Z", "+00:00"))
        co = datetime.fromisoformat(data.clock_out.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use ISO 8601.")
    
    if co <= ci:
        raise HTTPException(status_code=400, detail="clock_out must be after clock_in")
    
    total_minutes = int((co - ci).total_seconds() / 60)
    now = datetime.now(timezone.utc)
    entry_id = f"te_{uuid.uuid4().hex[:12]}"
    doc = {
        "entry_id": entry_id,
        "company_id": company_id,
        "employee_id": data.employee_id,
        "employee_name": emp.get("full_name"),
        "clock_in": ci.isoformat(),
        "clock_out": co.isoformat(),
        "total_minutes": total_minutes,
        "work_date": ci.date().isoformat(),
        "notes": data.notes,
        "source": "manual",
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.time_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/entries")
async def list_entries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    employee_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """List time entries. Admins see all; regular users see only their own."""
    company_id = user.company_id or user.active_org_id
    query: dict = {"company_id": company_id}
    
    # Non-admins can only view their own
    is_admin = user.role in ("owner", "admin", "hr")
    if not is_admin:
        emp = await _resolve_employee(user, None)
        query["employee_id"] = emp["employee_id"]
    elif employee_id:
        query["employee_id"] = employee_id
    
    if start_date:
        query["work_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("work_date", {})["$lte"] = end_date
    
    entries = await db.time_entries.find(query, {"_id": 0}).sort("clock_in", -1).to_list(1000)
    return entries


@router.put("/entries/{entry_id}")
async def update_entry(entry_id: str, data: TimeEntryUpdate, user: User = Depends(get_current_user)):
    """Admin/manager corrects an entry."""
    company_id, _ = await check_people_ops_access(user, "edit")
    entry = await db.time_entries.find_one({"entry_id": entry_id, "company_id": company_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    update_data: dict = {}
    if data.clock_in:
        update_data["clock_in"] = data.clock_in
    if data.clock_out is not None:
        update_data["clock_out"] = data.clock_out
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    # Recompute total_minutes if both timestamps known
    ci_str = update_data.get("clock_in", entry["clock_in"])
    co_str = update_data.get("clock_out", entry.get("clock_out"))
    if ci_str and co_str:
        try:
            ci = datetime.fromisoformat(ci_str.replace("Z", "+00:00"))
            co = datetime.fromisoformat(co_str.replace("Z", "+00:00"))
            update_data["total_minutes"] = int((co - ci).total_seconds() / 60)
            update_data["work_date"] = ci.date().isoformat()
        except ValueError:
            pass
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.time_entries.update_one(
        {"entry_id": entry_id, "company_id": company_id},
        {"$set": update_data}
    )
    return {"message": "Entry updated"}


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user: User = Depends(get_current_user)):
    company_id, _ = await check_people_ops_access(user, "edit")
    res = await db.time_entries.delete_one({"entry_id": entry_id, "company_id": company_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Entry deleted"}


@router.get("/weekly-summary")
async def weekly_summary(
    week_start: Optional[str] = None,
    employee_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """Aggregates time entries by employee for the week containing week_start (default: this week).
    Flags OT breach when total weekly hours > weekly_hours_regular (or 44 default) and beyond 68 = legal cap (RD)."""
    company_id, _ = await check_people_ops_access(user, "view")
    
    ref = date_cls.fromisoformat(week_start) if week_start else date_cls.today()
    start, end = _week_range(ref)
    
    query: dict = {
        "company_id": company_id,
        "work_date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        "clock_out": {"$ne": None},
    }
    if employee_id:
        query["employee_id"] = employee_id
    
    entries = await db.time_entries.find(query, {"_id": 0}).to_list(2000)
    
    # Aggregate by employee
    by_emp: dict = {}
    for e in entries:
        emp_id = e["employee_id"]
        acc = by_emp.setdefault(emp_id, {
            "employee_id": emp_id,
            "employee_name": e.get("employee_name"),
            "total_minutes": 0,
            "entries_count": 0,
            "days_worked": set(),
        })
        acc["total_minutes"] += e.get("total_minutes") or 0
        acc["entries_count"] += 1
        acc["days_worked"].add(e["work_date"])
    
    # Decorate with employee.weekly_hours_regular and detect OT breach
    rows = []
    emp_ids = list(by_emp.keys())
    if emp_ids:
        emps = await db.employees.find(
            {"company_id": company_id, "employee_id": {"$in": emp_ids}},
            {"_id": 0, "employee_id": 1, "weekly_hours_regular": 1, "full_name": 1}
        ).to_list(500)
        emps_map = {e["employee_id"]: e for e in emps}
        for emp_id, acc in by_emp.items():
            emp = emps_map.get(emp_id, {})
            regular = float(emp.get("weekly_hours_regular") or 44.0)
            total_hours = round(acc["total_minutes"] / 60, 2)
            ot_hours = max(0, round(total_hours - regular, 2))
            rows.append({
                "employee_id": emp_id,
                "employee_name": acc["employee_name"] or emp.get("full_name"),
                "total_hours": total_hours,
                "total_minutes": acc["total_minutes"],
                "entries_count": acc["entries_count"],
                "days_worked": len(acc["days_worked"]),
                "weekly_hours_regular": regular,
                "ot_hours": ot_hours,
                "legal_cap_breach": total_hours > 68.0,  # RD legal max
                "ot_breach": ot_hours > 0,
            })
    
    rows.sort(key=lambda r: -r["total_hours"])
    
    return {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "rows": rows,
        "totals": {
            "employees": len(rows),
            "total_hours": round(sum(r["total_hours"] for r in rows), 2),
            "total_ot_hours": round(sum(r["ot_hours"] for r in rows), 2),
            "employees_with_ot": sum(1 for r in rows if r["ot_breach"]),
            "employees_breaching_legal_cap": sum(1 for r in rows if r["legal_cap_breach"]),
        }
    }
