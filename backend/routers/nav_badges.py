"""Sprint N — Global Sidebar Nav Badges

A single aggregated endpoint that returns per-module signal counts so the
Layout sidebar can render passive notification badges next to each item.

Design goals:
- One roundtrip per Layout mount / route change.
- Defensive: if a collection or field is missing, return 0 (never 500).
- Signals are OPINIONATED — only surface items that actually need attention today.
- Response omits paths with `count = 0` to keep the payload small and let the FE
  render conditionally without null checks.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends

from dependencies import get_current_user
from models.auth import User
from config import db


router = APIRouter(prefix="/nav", tags=["nav-badges"])


async def _safe_count(coll, query):
    try:
        return await coll.count_documents(query)
    except Exception:
        return 0


@router.get("/global-badges")
async def global_nav_badges(user: User = Depends(get_current_user)):
    """Aggregated signal counts per module path.

    Returns a dict shaped as `{ path: { count, tone, tooltip_es, tooltip_en } }`.
    Paths with count == 0 are omitted so the frontend can iterate without checks.
    """
    company_id = user.company_id
    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    horizon_7 = (today + timedelta(days=7)).isoformat()

    badges: dict = {}

    # ── /client-engagement — overdue follow-ups on leads + clients ─────────────
    lead_overdue = await _safe_count(db.leads, {
        "company_id": company_id,
        "next_follow_up_date": {"$lte": today_str, "$ne": None},
        "status": {"$nin": ["closed_won", "closed_lost", "archived"]},
    })
    client_overdue = await _safe_count(db.clients, {
        "company_id": company_id,
        "next_follow_up_date": {"$lte": today_str, "$ne": None},
    })
    ce_total = lead_overdue + client_overdue
    if ce_total > 0:
        badges["/client-engagement"] = {
            "count": ce_total,
            "tone": "red" if ce_total > 5 else "amber",
            "tooltip_es": f"{ce_total} seguimiento(s) vencido(s)",
            "tooltip_en": f"{ce_total} overdue follow-up(s)",
        }

    # ── /event-orchestration — events in the next 7 days ───────────────────────
    upcoming_events = await _safe_count(db.events, {
        "company_id": company_id,
        "event_date": {"$gte": today_str, "$lte": horizon_7},
        "status": {"$nin": ["cancelled", "archived"]},
    })
    if upcoming_events > 0:
        badges["/event-orchestration"] = {
            "count": upcoming_events,
            "tone": "amber",
            "tooltip_es": f"{upcoming_events} evento(s) en los próximos 7 días",
            "tooltip_en": f"{upcoming_events} event(s) in the next 7 days",
        }

    # ── /ops-supplies — reuse the inventory nav-badges aggregation ─────────────
    try:
        overdue_notes = await db.delivery_notes.count_documents({
            "company_id": company_id,
            "status": {"$in": ["pending", "partial"]},
            "expected_return_date": {"$lt": today_str, "$ne": None},
        })
        over_reserved = 0
        async for it in db.ingredients.find(
            {"company_id": company_id, "inventory_type": {"$in": ["equipment", "event_supply", "disposable"]}},
            {"_id": 0, "stock_quantity": 1, "reserved_quantity": 1}
        ):
            if float(it.get("reserved_quantity") or 0) > float(it.get("stock_quantity") or 0):
                over_reserved += 1
        damages_open = await _safe_count(db.damaged_items_log, {
            "company_id": company_id,
            "billed_invoice_id": {"$exists": False},
            "condition": {"$in": ["dañado", "faltante"]},
        })
        ops_total = overdue_notes + over_reserved + damages_open
    except Exception:
        ops_total = 0
    if ops_total > 0:
        badges["/ops-supplies"] = {
            "count": ops_total,
            "tone": "red" if (overdue_notes + over_reserved) > 0 else "amber",
            "tooltip_es": f"{ops_total} señal(es) operativas (conduces vencidos / stock / daños)",
            "tooltip_en": f"{ops_total} operational signal(s) (overdue conduces / stock / damages)",
        }

    # ── /execution-hub — blocked goals ─────────────────────────────────────────
    blocked_goals = await _safe_count(db.execution_goals, {
        "company_id": company_id,
        "status": "blocked",
    })
    if blocked_goals > 0:
        badges["/execution-hub"] = {
            "count": blocked_goals,
            "tone": "red",
            "tooltip_es": f"{blocked_goals} meta(s) bloqueada(s)",
            "tooltip_en": f"{blocked_goals} blocked goal(s)",
        }

    # ── /business-clarity — overdue receivables ────────────────────────────────
    bc_total = 0
    try:
        # Prefer accounts_receivable if present; fallback to invoices with due_date
        ar_overdue = await db.accounts_receivable.count_documents({
            "company_id": company_id,
            "status": {"$ne": "paid"},
            "due_date": {"$lt": today_str, "$ne": None},
        })
        inv_overdue = await db.invoices.count_documents({
            "company_id": company_id,
            "status": {"$nin": ["paid", "void", "cancelled"]},
            "due_date": {"$lt": today_str, "$ne": None},
        })
        bc_total = ar_overdue + inv_overdue
    except Exception:
        bc_total = 0
    if bc_total > 0:
        badges["/business-clarity"] = {
            "count": bc_total,
            "tone": "red",
            "tooltip_es": f"{bc_total} factura(s) vencida(s)",
            "tooltip_en": f"{bc_total} overdue invoice(s)",
        }

    # ── /people-ops — pending deductions ───────────────────────────────────────
    pending_deductions = await _safe_count(db.pending_deductions, {
        "company_id": company_id,
        "status": {"$in": ["pending", "under_review"]},
    })
    if pending_deductions > 0:
        badges["/people-ops"] = {
            "count": pending_deductions,
            "tone": "amber",
            "tooltip_es": f"{pending_deductions} deducción(es) pendiente(s)",
            "tooltip_en": f"{pending_deductions} pending deduction(s)",
        }

    # ── /food-ops — recipes without prices (data hygiene) ──────────────────────
    try:
        recipes_no_price = await db.recipes.count_documents({
            "company_id": company_id,
            "$or": [
                {"cost_per_unit": {"$in": [None, 0]}},
                {"cost_per_unit": {"$exists": False}},
            ],
        })
    except Exception:
        recipes_no_price = 0
    if recipes_no_price > 0:
        badges["/food-ops"] = {
            "count": recipes_no_price,
            "tone": "amber",
            "tooltip_es": f"{recipes_no_price} receta(s) sin costo",
            "tooltip_en": f"{recipes_no_price} recipe(s) without cost",
        }

    return {"badges": badges, "generated_at": datetime.now(timezone.utc).isoformat()}
