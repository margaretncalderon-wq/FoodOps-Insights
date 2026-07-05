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
    """End the active shift for the current user (or specified entry_id, admin only)."""
    company_id = user.company_id or user.active_org_id
    query: dict = {"company_id": company_id, "clock_out": None}
    
    is_admin = user.role in ("owner", "admin", "hr")
    
    if data.entry_id:
        if not is_admin:
            # Non-admin can only close their own entry; verify ownership
            emp = await _resolve_employee(user, None)
            query["entry_id"] = data.entry_id
            query["employee_id"] = emp["employee_id"]
        else:
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
    
    # Snapshot BEFORE state for audit
    before_state = {
        "clock_in": entry.get("clock_in"),
        "clock_out": entry.get("clock_out"),
        "total_minutes": entry.get("total_minutes"),
        "notes": entry.get("notes"),
    }
    
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
    
    now = datetime.now(timezone.utc).isoformat()
    update_data["updated_at"] = now
    await db.time_entries.update_one(
        {"entry_id": entry_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    # Audit log: record only changed fields
    after_state = {
        "clock_in": update_data.get("clock_in", before_state["clock_in"]),
        "clock_out": update_data.get("clock_out", before_state["clock_out"]),
        "total_minutes": update_data.get("total_minutes", before_state["total_minutes"]),
        "notes": update_data.get("notes", before_state["notes"]),
    }
    diff = {k: {"before": before_state[k], "after": after_state[k]} for k in before_state if before_state[k] != after_state[k]}
    if diff:
        await db.time_clock_audit.insert_one({
            "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
            "entry_id": entry_id,
            "company_id": company_id,
            "action": "update",
            "diff": diff,
            "before": before_state,
            "after": after_state,
            "changed_by": user.user_id,
            "changed_by_name": getattr(user, "name", None) or user.email,
            "changed_at": now,
        })
    
    return {"message": "Entry updated", "fields_changed": list(diff.keys())}


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user: User = Depends(get_current_user)):
    company_id, _ = await check_people_ops_access(user, "edit")
    entry = await db.time_entries.find_one({"entry_id": entry_id, "company_id": company_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    await db.time_entries.delete_one({"entry_id": entry_id, "company_id": company_id})
    
    # Audit log
    await db.time_clock_audit.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "entry_id": entry_id,
        "company_id": company_id,
        "action": "delete",
        "before": {
            "clock_in": entry.get("clock_in"),
            "clock_out": entry.get("clock_out"),
            "total_minutes": entry.get("total_minutes"),
            "notes": entry.get("notes"),
            "employee_id": entry.get("employee_id"),
            "employee_name": entry.get("employee_name"),
        },
        "changed_by": user.user_id,
        "changed_by_name": getattr(user, "name", None) or user.email,
        "changed_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"message": "Entry deleted"}


@router.get("/aggregate-daily")
async def aggregate_daily_worked(
    employee_id: str,
    start_date: str,
    end_date: str,
    user: User = Depends(get_current_user),
):
    """Aggregate time_entries for an employee into daily rows suitable for
    prefilling the Weekly Timesheet (OT) dialog.

    Per work_date, returns:
      - time_in  = earliest clock_in of the day (HH:MM)
      - time_out = latest clock_out of the day (HH:MM). If the last entry is
        still open (no clock_out), it is skipped so we don't estimate a fake
        exit time.
      - break_min = total minutes BETWEEN the entries within the day (gaps
        between one clock_out and the next clock_in). Approximates rest breaks.

    Only closed shifts are considered. Shifts crossing midnight are stored under
    their `work_date` field.
    """
    company_id, _ = await check_people_ops_access(user, "view")
    query = {
        "company_id": company_id,
        "employee_id": employee_id,
        "work_date": {"$gte": start_date, "$lte": end_date},
        "clock_out": {"$ne": None},
    }
    entries = await db.time_entries.find(query, {"_id": 0}).sort("clock_in", 1).to_list(2000)

    from datetime import datetime as _dt
    by_day: dict[str, list] = {}
    for e in entries:
        d = e.get("work_date")
        if not d:
            continue
        by_day.setdefault(d, []).append(e)

    out: list = []
    for d, rows in sorted(by_day.items()):
        rows.sort(key=lambda x: x.get("clock_in") or "")
        first_in = rows[0].get("clock_in")
        last_out = rows[-1].get("clock_out")
        if not first_in or not last_out:
            continue

        try:
            ti = _dt.fromisoformat(first_in.replace("Z", "+00:00"))
            to = _dt.fromisoformat(last_out.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue

        time_in = ti.strftime("%H:%M")
        time_out = to.strftime("%H:%M")

        # Sum gaps between entries → break minutes
        break_minutes = 0
        for i in range(len(rows) - 1):
            try:
                out_i = _dt.fromisoformat(rows[i]["clock_out"].replace("Z", "+00:00"))
                in_next = _dt.fromisoformat(rows[i + 1]["clock_in"].replace("Z", "+00:00"))
                gap = (in_next - out_i).total_seconds() / 60.0
                if gap > 0:
                    break_minutes += gap
            except (ValueError, AttributeError, KeyError):
                continue

        # Compute worked minutes from entries themselves (sum of total_minutes)
        worked_minutes = sum(int(r.get("total_minutes") or 0) for r in rows)

        out.append({
            "date": d,
            "time_in": time_in,
            "time_out": time_out,
            "break_min": int(round(break_minutes)),
            "worked_minutes": worked_minutes,
            "shift_count": len(rows),
            "source": "time_clock",
        })

    return {
        "employee_id": employee_id,
        "start_date": start_date,
        "end_date": end_date,
        "days": out,
        "total_days": len(out),
    }




@router.get("/entries/{entry_id}/audit")
async def get_entry_audit(entry_id: str, user: User = Depends(get_current_user)):
    """Return audit history for a specific time entry (admins/managers only)."""
    company_id, _ = await check_people_ops_access(user, "view")
    logs = await db.time_clock_audit.find(
        {"entry_id": entry_id, "company_id": company_id},
        {"_id": 0}
    ).sort("changed_at", -1).to_list(200)
    return logs


@router.get("/weekly-summary")
async def weekly_summary(
    week_start: Optional[str] = None,
    employee_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """Aggregates time entries by employee for the week containing week_start (default: this week).
    Flags OT breach when total weekly hours > weekly_hours_regular (or 44 default) and beyond 68 = legal cap (RD)."""
    company_id, _ = await check_people_ops_access(user, "view")
    
    if week_start:
        try:
            ref = date_cls.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(status_code=400, detail="week_start must be YYYY-MM-DD")
    else:
        ref = date_cls.today()
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
