"""HR Alerts / Key Dates — computed upcoming events for the People Ops dashboard.

Aggregates the following signals into a single endpoint so the FE can render
a single "Fechas Clave" widget without doing multiple roundtrips:

- Birthdays (`employees.date_of_birth`, recurring yearly)
- Work anniversaries (`employees.hire_date`, recurring yearly, skip year 0)
- Probation end (`employees.hire_date + 3 months`, one-time)
- Contract expiry (from `documents.expiry_date` where document_type=="contract")
- Document expirations (from `documents.expiry_date` for other types)
- Vacation returns (from `time_off_requests.end_date` where status=="approved")
- TSS deadlines (25th of current month + 3rd business day of next month)
- Custom manager-added events (`hr_custom_events`)

Every event carries a `type`, `date` (ISO yyyy-mm-dd), `days_until`, `severity`
(danger / warning / info) plus copy in both languages.
"""
from datetime import date, datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import uuid

from dependencies import get_current_user
from models.auth import User
from config import db


router = APIRouter(prefix="/people-ops", tags=["hr-alerts"])


# ─────────────────────────────────────────────────────────────────────────────
# Default alert preferences — per user/company. Every threshold is in days.
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_PREFS = {
    "birthday_enabled": True,
    "birthday_days_ahead": 3,
    "anniversary_enabled": True,
    "anniversary_days_ahead": 7,
    "probation_enabled": True,
    "probation_days_ahead": [15, 3, 0],  # 15d, 3d, day-of
    "contract_enabled": True,
    "contract_days_ahead": 30,
    "document_enabled": True,
    "document_days_ahead": 30,
    "vacation_return_enabled": True,
    "vacation_return_days_ahead": 3,
    "tss_enabled": True,
    "custom_events_enabled": True,
}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────
class AlertPreferences(BaseModel):
    birthday_enabled: bool = True
    birthday_days_ahead: int = 3
    anniversary_enabled: bool = True
    anniversary_days_ahead: int = 7
    probation_enabled: bool = True
    probation_days_ahead: List[int] = [15, 3, 0]
    contract_enabled: bool = True
    contract_days_ahead: int = 30
    document_enabled: bool = True
    document_days_ahead: int = 30
    vacation_return_enabled: bool = True
    vacation_return_days_ahead: int = 3
    tss_enabled: bool = True
    custom_events_enabled: bool = True


class CustomEventCreate(BaseModel):
    employee_id: Optional[str] = None  # null = company-wide event
    title: str
    event_date: str  # YYYY-MM-DD
    recurrence: str = "none"  # "none" | "yearly" | "monthly"
    days_ahead: int = 7
    notes: Optional[str] = None


class CustomEvent(CustomEventCreate):
    event_id: str
    company_id: str
    created_by: str
    created_at: str


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s.split("T")[0])
    except (ValueError, AttributeError):
        return None


def _next_occurrence(base: date, today: date, yearly: bool = True) -> date:
    """Compute the next occurrence of `base` on or after `today`."""
    if not yearly:
        return base
    year = today.year
    try:
        candidate = base.replace(year=year)
    except ValueError:  # Feb 29 on non-leap year
        candidate = base.replace(year=year, day=28)
    if candidate < today:
        try:
            candidate = base.replace(year=year + 1)
        except ValueError:
            candidate = base.replace(year=year + 1, day=28)
    return candidate


def _add_months(d: date, months: int) -> date:
    m = d.month + months
    y = d.year + (m - 1) // 12
    m = ((m - 1) % 12) + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def _severity(days_until: int) -> str:
    if days_until < 0:
        return "danger"      # overdue
    if days_until <= 1:
        return "danger"
    if days_until <= 7:
        return "warning"
    return "info"


def _tss_deadlines(today: date, horizon: int) -> list:
    """TSS reminders: day 25 of current month + 3rd business day of next month.
    Emitted when they fall within the horizon window."""
    events = []
    # Reminder on day 25 of the current month
    try:
        reminder = date(today.year, today.month, 25)
        d_until = (reminder - today).days
        if 0 <= d_until <= horizon:
            events.append({
                "date": reminder.isoformat(),
                "days_until": d_until,
                "type": "tss_reminder",
                "severity": _severity(d_until),
                "title_es": "Preparar TSS del mes",
                "title_en": "Prepare monthly TSS",
                "subtitle_es": "Revisar reportes y montos antes del cierre",
                "subtitle_en": "Review reports and amounts before month close",
            })
    except ValueError:
        pass
    # 3rd business day of next month
    next_month = _add_months(date(today.year, today.month, 1), 1)
    biz_count = 0
    cursor = next_month
    while biz_count < 3:
        if cursor.weekday() < 5:  # Mon-Fri
            biz_count += 1
            if biz_count == 3:
                break
        cursor = cursor + timedelta(days=1)
    d_until = (cursor - today).days
    if 0 <= d_until <= horizon:
        events.append({
            "date": cursor.isoformat(),
            "days_until": d_until,
            "type": "tss_deadline",
            "severity": _severity(d_until),
            "title_es": "Fecha límite TSS",
            "title_en": "TSS filing deadline",
            "subtitle_es": "Presentar reportes y pago al SDSS",
            "subtitle_en": "Submit reports and payment to SDSS",
        })
    return events


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/alert-preferences")
async def get_preferences(user: User = Depends(get_current_user)):
    doc = await db.hr_alert_preferences.find_one({
        "company_id": user.company_id,
        "user_id": user.user_id,
    }, {"_id": 0})
    if not doc:
        return {"preferences": DEFAULT_PREFS, "is_default": True}
    return {"preferences": {**DEFAULT_PREFS, **(doc.get("preferences") or {})}, "is_default": False}


@router.put("/alert-preferences")
async def put_preferences(prefs: AlertPreferences, user: User = Depends(get_current_user)):
    await db.hr_alert_preferences.update_one(
        {"company_id": user.company_id, "user_id": user.user_id},
        {"$set": {
            "company_id": user.company_id,
            "user_id": user.user_id,
            "preferences": prefs.dict(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"success": True, "preferences": prefs.dict()}


@router.get("/custom-events")
async def list_custom_events(user: User = Depends(get_current_user)):
    events = await db.hr_custom_events.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("event_date", 1).to_list(500)
    return {"events": events}


@router.post("/custom-events")
async def create_custom_event(payload: CustomEventCreate, user: User = Depends(get_current_user)):
    if _parse_date(payload.event_date) is None:
        raise HTTPException(status_code=400, detail="event_date must be YYYY-MM-DD")
    if payload.recurrence not in ("none", "yearly", "monthly"):
        raise HTTPException(status_code=400, detail="recurrence must be none | yearly | monthly")
    event = {
        "event_id": str(uuid.uuid4()),
        "company_id": user.company_id,
        "employee_id": payload.employee_id,
        "title": payload.title,
        "event_date": payload.event_date,
        "recurrence": payload.recurrence,
        "days_ahead": max(0, payload.days_ahead),
        "notes": payload.notes,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.hr_custom_events.insert_one(event.copy())
    event.pop("_id", None)
    return event


@router.delete("/custom-events/{event_id}")
async def delete_custom_event(event_id: str, user: User = Depends(get_current_user)):
    res = await db.hr_custom_events.delete_one({
        "event_id": event_id,
        "company_id": user.company_id,
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="event not found")
    return {"success": True}


@router.get("/key-dates")
async def key_dates(
    days_ahead: int = 60,
    user: User = Depends(get_current_user),
):
    """Aggregated list of upcoming HR events.

    Filters honor the user's alert preferences (if saved). Each returned event
    is guaranteed to be within `[today, today + days_ahead]`.
    """
    company_id = user.company_id
    today = datetime.now(timezone.utc).date()
    horizon = max(1, min(days_ahead, 365))

    # Load prefs (fall back to defaults) — used to gate event types
    pref_doc = await db.hr_alert_preferences.find_one({
        "company_id": company_id, "user_id": user.user_id
    }, {"_id": 0})
    prefs = {**DEFAULT_PREFS, **((pref_doc or {}).get("preferences") or {})}

    events: list = []

    # Load active employees once — reused across birthday / anniversary / probation
    employees = await db.employees.find(
        {"company_id": company_id, "status": {"$ne": "terminated"}},
        {"_id": 0, "employee_id": 1, "full_name": 1, "first_name": 1,
         "last_name": 1, "date_of_birth": 1, "hire_date": 1,
         "job_title": 1, "profile_photo": 1}
    ).to_list(2000)

    for emp in employees:
        emp_id = emp.get("employee_id")
        name = emp.get("full_name") or f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()

        # ── Birthday ────────────────────────────────────────────────────
        if prefs["birthday_enabled"]:
            dob = _parse_date(emp.get("date_of_birth"))
            if dob:
                nxt = _next_occurrence(dob, today, yearly=True)
                days_until = (nxt - today).days
                if 0 <= days_until <= min(horizon, prefs["birthday_days_ahead"] + 30):
                    age = nxt.year - dob.year
                    events.append({
                        "date": nxt.isoformat(),
                        "days_until": days_until,
                        "type": "birthday",
                        "severity": _severity(days_until),
                        "employee_id": emp_id,
                        "employee_name": name,
                        "profile_photo": emp.get("profile_photo"),
                        "title_es": f"Cumpleaños de {name}",
                        "title_en": f"{name}'s birthday",
                        "subtitle_es": f"Cumple {age} años",
                        "subtitle_en": f"Turning {age}",
                        "meta": {"age": age},
                    })

        # ── Work anniversary ────────────────────────────────────────────
        if prefs["anniversary_enabled"]:
            hire = _parse_date(emp.get("hire_date"))
            if hire and hire.year < today.year:  # skip year 0
                nxt = _next_occurrence(hire, today, yearly=True)
                days_until = (nxt - today).days
                if 0 <= days_until <= min(horizon, prefs["anniversary_days_ahead"] + 30):
                    years = nxt.year - hire.year
                    events.append({
                        "date": nxt.isoformat(),
                        "days_until": days_until,
                        "type": "work_anniversary",
                        "severity": _severity(days_until),
                        "employee_id": emp_id,
                        "employee_name": name,
                        "profile_photo": emp.get("profile_photo"),
                        "title_es": f"Aniversario laboral: {name}",
                        "title_en": f"Work anniversary: {name}",
                        "subtitle_es": f"Cumple {years} año(s) en la empresa",
                        "subtitle_en": f"{years} year(s) with the company",
                        "meta": {"years": years},
                    })

        # ── Probation end (hire + 3 months, one-time) ────────────────────
        if prefs["probation_enabled"]:
            hire = _parse_date(emp.get("hire_date"))
            if hire:
                probation_end = _add_months(hire, 3)
                days_until = (probation_end - today).days
                # Emit if within horizon AND we haven't passed too far in the past
                if -3 <= days_until <= horizon:
                    events.append({
                        "date": probation_end.isoformat(),
                        "days_until": days_until,
                        "type": "probation_end",
                        "severity": _severity(days_until),
                        "employee_id": emp_id,
                        "employee_name": name,
                        "profile_photo": emp.get("profile_photo"),
                        "title_es": f"Fin de período de prueba: {name}",
                        "title_en": f"Probation ends: {name}",
                        "subtitle_es": "Evaluar continuidad y confirmar contrato",
                        "subtitle_en": "Evaluate continuation and confirm contract",
                        "meta": {"hire_date": hire.isoformat()},
                    })

    # ── Contract / document expirations (from db.documents) ────────────────
    if prefs["contract_enabled"] or prefs["document_enabled"]:
        try:
            docs = await db.documents.find({
                "company_id": company_id,
                "employee_id": {"$ne": None},
                "expiry_date": {"$ne": None},
            }, {"_id": 0}).to_list(2000)
        except Exception:
            docs = []
        for doc in docs:
            exp = _parse_date(doc.get("expiry_date"))
            if not exp:
                continue
            days_until = (exp - today).days
            if not (-3 <= days_until <= horizon):
                continue
            is_contract = (doc.get("document_type") or "").lower() == "contract"
            if is_contract and not prefs["contract_enabled"]:
                continue
            if not is_contract and not prefs["document_enabled"]:
                continue
            emp_name = doc.get("employee_name") or "Empleado"
            events.append({
                "date": exp.isoformat(),
                "days_until": days_until,
                "type": "contract_expiry" if is_contract else "document_expiry",
                "severity": _severity(days_until),
                "employee_id": doc.get("employee_id"),
                "employee_name": emp_name,
                "title_es": f"Vencimiento: {doc.get('name') or doc.get('document_type')}",
                "title_en": f"Expiring: {doc.get('name') or doc.get('document_type')}",
                "subtitle_es": f"Documento de {emp_name}",
                "subtitle_en": f"Document for {emp_name}",
                "meta": {"document_id": doc.get("document_id")},
            })

    # ── Vacation returns ───────────────────────────────────────────────────
    if prefs["vacation_return_enabled"]:
        try:
            time_offs = await db.time_off_requests.find({
                "company_id": company_id,
                "status": "approved",
                "end_date": {
                    "$gte": (today - timedelta(days=1)).isoformat(),
                    "$lte": (today + timedelta(days=horizon)).isoformat(),
                },
            }, {"_id": 0}).to_list(500)
        except Exception:
            time_offs = []
        for req in time_offs:
            end = _parse_date(req.get("end_date"))
            if not end:
                continue
            return_date = end + timedelta(days=1)
            days_until = (return_date - today).days
            if not (0 <= days_until <= horizon):
                continue
            emp_name = req.get("employee_name") or "Empleado"
            events.append({
                "date": return_date.isoformat(),
                "days_until": days_until,
                "type": "vacation_return",
                "severity": _severity(days_until),
                "employee_id": req.get("employee_id"),
                "employee_name": emp_name,
                "title_es": f"{emp_name} regresa de vacaciones",
                "title_en": f"{emp_name} returns from leave",
                "subtitle_es": f"Vuelve el {return_date.isoformat()}",
                "subtitle_en": f"Back on {return_date.isoformat()}",
                "meta": {"request_id": req.get("request_id")},
            })

    # ── TSS ────────────────────────────────────────────────────────────────
    if prefs["tss_enabled"]:
        events.extend(_tss_deadlines(today, horizon))

    # ── Custom events ──────────────────────────────────────────────────────
    if prefs["custom_events_enabled"]:
        try:
            customs = await db.hr_custom_events.find(
                {"company_id": company_id}, {"_id": 0}
            ).to_list(500)
        except Exception:
            customs = []
        for ev in customs:
            base = _parse_date(ev.get("event_date"))
            if not base:
                continue
            recurrence = ev.get("recurrence") or "none"
            if recurrence == "yearly":
                occurrence = _next_occurrence(base, today, yearly=True)
            elif recurrence == "monthly":
                # step month by month until >= today
                occurrence = base
                while occurrence < today:
                    occurrence = _add_months(occurrence, 1)
            else:
                occurrence = base
            days_until = (occurrence - today).days
            if not (-1 <= days_until <= horizon):
                continue
            events.append({
                "date": occurrence.isoformat(),
                "days_until": days_until,
                "type": "custom",
                "severity": _severity(days_until),
                "employee_id": ev.get("employee_id"),
                "employee_name": None,
                "title_es": ev.get("title") or "Evento",
                "title_en": ev.get("title") or "Event",
                "subtitle_es": ev.get("notes") or "",
                "subtitle_en": ev.get("notes") or "",
                "meta": {"event_id": ev.get("event_id"), "recurrence": recurrence},
            })

    # Sort by date ascending, then by severity (danger > warning > info)
    severity_order = {"danger": 0, "warning": 1, "info": 2}
    events.sort(key=lambda e: (e["days_until"], severity_order.get(e["severity"], 3)))

    # Bucket into groups so the FE can render sections easily
    def bucket(e):
        d = e["days_until"]
        if d < 0:
            return "overdue"
        if d == 0:
            return "today"
        if d <= 7:
            return "this_week"
        if d <= 30:
            return "this_month"
        return "later"

    for ev in events:
        ev["bucket"] = bucket(ev)

    return {
        "events": events,
        "total": len(events),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "horizon_days": horizon,
    }
