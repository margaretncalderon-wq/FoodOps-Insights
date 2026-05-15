"""
Culinary Weekly Digest — Sprint 5 of Phase 2.

Sends a weekly (configurable) summary of Culinary Intelligence insights to
selected recipients via email AND in-app notification.

Sections (all toggleable per-company):
  - exec_summary: total events, food cost, avg margin
  - stars_dogs: top 3 Stars + top 3 Dogs from Menu Engineering
  - staleness: plated menus with drift > 10%
  - variance: events with cost variance > 10% (critical)
  - low_stock: ingredients below par level that affect upcoming events
  - mise_en_place_gap: scaled-required vs production-batches gap
  - ai_recommendations: AI-generated bullets (uses Emergent LLM key)

Storage:
  - db.culinary_digest_settings: one doc per company_id with toggles + recipients
                                  + frequency + day_of_week + hour
  - db.culinary_digest_history: every dispatch is recorded for audit / dashboard
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from dependencies import get_current_user, User
from routers.notifications import create_notification

logger = logging.getLogger(__name__)

culinary_digest_router = APIRouter(prefix="/culinary-digest", tags=["Culinary Digest"])


# ============================== MODELS ==============================

DEFAULT_SECTIONS = {
    "exec_summary": True,
    "stars_dogs": True,
    "staleness": True,
    "variance": True,
    "low_stock": True,
    "mise_en_place_gap": True,
    "ai_recommendations": False,  # opt-in (cost)
}


class DigestSettings(BaseModel):
    enabled: bool = True
    frequency: str = "weekly"  # weekly | biweekly | monthly
    day_of_week: int = 0  # 0=Monday … 6=Sunday
    hour: int = 8  # 0..23 local time
    recipients_roles: List[str] = ["owner", "admin"]  # roles to receive
    recipient_emails_extra: List[str] = []  # extra non-user emails
    sections: Dict[str, bool] = {}  # section_key -> enabled

    model_config = {"extra": "allow"}


# ============================== HELPERS ==============================

async def _get_settings(company_id: str) -> Dict[str, Any]:
    doc = await db.culinary_digest_settings.find_one(
        {"company_id": company_id}, {"_id": 0}
    )
    if not doc:
        return {
            "company_id": company_id,
            "enabled": False,  # default off — user must opt in
            "frequency": "weekly",
            "day_of_week": 0,
            "hour": 8,
            "recipients_roles": ["owner", "admin"],
            "recipient_emails_extra": [],
            "sections": dict(DEFAULT_SECTIONS),
        }
    # Merge defaults so legacy docs gain new sections
    sections = dict(DEFAULT_SECTIONS)
    sections.update(doc.get("sections") or {})
    doc["sections"] = sections
    return doc


async def _resolve_recipients(company_id: str, settings: Dict[str, Any]) -> List[str]:
    """Return unique email list combining role-based users and extra emails."""
    roles = settings.get("recipients_roles") or []
    extra = settings.get("recipient_emails_extra") or []
    emails = set([e.strip().lower() for e in extra if e and "@" in e])
    if roles:
        users = await db.users.find(
            {"company_id": company_id, "role": {"$in": roles}},
            {"_id": 0, "email": 1},
        ).to_list(200)
        for u in users:
            email = (u.get("email") or "").strip().lower()
            if email and "@" in email:
                emails.add(email)
    return sorted(emails)


async def _exec_summary(company_id: str, since_iso: str) -> Dict[str, Any]:
    events = await db.events.find(
        {
            "company_id": company_id,
            "event_date": {"$gte": since_iso[:10]},  # YYYY-MM-DD comparison
        },
        {"_id": 0, "guest_count": 1, "estimated_revenue": 1, "total_cost": 1},
    ).to_list(2000)
    total_events = len(events)
    total_guests = sum(int(e.get("guest_count") or 0) for e in events)
    total_revenue = sum(float(e.get("estimated_revenue") or 0) for e in events)
    total_cost = sum(float(e.get("total_cost") or 0) for e in events)
    avg_margin_pct = ((total_revenue - total_cost) / total_revenue * 100) if total_revenue > 0 else 0
    return {
        "total_events": total_events,
        "total_guests": total_guests,
        "total_revenue": round(total_revenue, 2),
        "total_cost": round(total_cost, 2),
        "avg_margin_pct": round(avg_margin_pct, 2),
    }


async def _stars_and_dogs(company_id: str, user: User) -> Dict[str, Any]:
    """Reuse menu-engineering analyze function (defined in server.py)."""
    try:
        from server import analyze_menu_engineering  # late import to avoid cycle
    except Exception:
        return {"stars": [], "dogs": [], "available": False}
    try:
        analysis = await analyze_menu_engineering(days=30, user=user)
    except Exception as e:
        logger.warning(f"[digest] stars_dogs fetch failed for {company_id}: {e}")
        return {"stars": [], "dogs": [], "available": False}
    rows = analysis.get("recipes") or []
    stars = [r for r in rows if r.get("quadrant") == "star"][:3]
    dogs = [r for r in rows if r.get("quadrant") == "dog"][:3]
    return {"stars": stars, "dogs": dogs, "available": True}


async def _stale_menus(company_id: str) -> List[Dict[str, Any]]:
    """Plated menus with drift > 10% — surfaces what to refresh."""
    menus = await db.plated_menus.find(
        {"company_id": company_id},
        {"_id": 0, "menu_id": 1, "name": 1, "cost_per_guest": 1, "menu_type": 1},
    ).to_list(500)
    # Late import the staleness logic, but we can compute the live cost ourselves
    try:
        from server import calculate_menu_cost
    except Exception:
        return []
    out = []
    for m in menus:
        full = await db.plated_menus.find_one(
            {"menu_id": m["menu_id"], "company_id": company_id}, {"_id": 0, "courses": 1}
        )
        if not full:
            continue
        live = float(await calculate_menu_cost(full.get("courses", []), company_id))
        snap = float(m.get("cost_per_guest") or 0)
        if snap <= 0:
            continue
        drift_pct = ((live - snap) / snap) * 100
        if abs(drift_pct) >= 10:
            out.append({
                "menu_id": m["menu_id"],
                "name": m["name"],
                "menu_type": m.get("menu_type"),
                "snapshot": round(snap, 2),
                "live": round(live, 2),
                "drift_pct": round(drift_pct, 2),
            })
    out.sort(key=lambda x: abs(x["drift_pct"]), reverse=True)
    return out[:10]


async def _variance_critical(company_id: str, user: User) -> List[Dict[str, Any]]:
    """Events with cost variance ≥ 10% in last 30 days."""
    try:
        from server import list_cost_variance
    except Exception:
        return []
    try:
        res = await list_cost_variance(days=30, severity_filter="critical", user=user)
    except Exception as e:
        logger.warning(f"[digest] variance fetch failed: {e}")
        return []
    return (res.get("events") or [])[:10]


async def _low_stock_affecting_events(company_id: str, user: User) -> List[Dict[str, Any]]:
    """Ingredients whose available stock < required for any upcoming event in next 14 days."""
    upcoming = await db.events.find(
        {
            "company_id": company_id,
            "event_date": {
                "$gte": datetime.now(timezone.utc).date().isoformat(),
                "$lte": (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat(),
            },
        },
        {"_id": 0, "event_id": 1, "name": 1, "event_date": 1},
    ).to_list(200)

    try:
        from server import production_event_plan
    except Exception:
        return []

    aggregate_shortages = {}  # inv_id -> {name, unit, total_shortage, events: [...]}
    for ev in upcoming:
        try:
            plan = await production_event_plan({"event_id": ev["event_id"]}, user)
        except Exception:
            continue
        for s in (plan.get("shortages") or []):
            iid = s.get("inventory_item_id")
            if not iid:
                continue
            entry = aggregate_shortages.get(iid) or {
                "inventory_item_id": iid,
                "name": s.get("name"),
                "unit": s.get("unit"),
                "total_shortage": 0.0,
                "events": [],
            }
            entry["total_shortage"] += float(s.get("shortage") or 0)
            entry["events"].append({"event_id": ev["event_id"], "name": ev["name"], "event_date": ev.get("event_date")})
            aggregate_shortages[iid] = entry
    rows = list(aggregate_shortages.values())
    for r in rows:
        r["total_shortage"] = round(r["total_shortage"], 3)
    rows.sort(key=lambda x: -x["total_shortage"])
    return rows[:10]


async def _mise_en_place_gap(company_id: str) -> List[Dict[str, Any]]:
    """Recipes with a scaled production target but NO POSTED batch yet, for events
    in the next 7 days. Flags prep that hasn't started."""
    soon = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    upcoming = await db.events.find(
        {"company_id": company_id, "event_date": {"$gte": today, "$lte": soon}},
        {"_id": 0, "event_id": 1, "name": 1, "event_date": 1, "menu_id": 1},
    ).to_list(100)

    gaps = []
    for ev in upcoming:
        if not ev.get("menu_id"):
            continue
        menu = await db.plated_menus.find_one(
            {"menu_id": ev["menu_id"], "company_id": company_id},
            {"_id": 0, "courses": 1},
        )
        if not menu:
            continue
        recipe_ids = []
        for c in menu.get("courses", []):
            for it in c.get("items", []):
                rid = it.get("recipe_id")
                if rid:
                    recipe_ids.append(rid)
        if not recipe_ids:
            continue
        posted_batches = await db.production_batches.find(
            {
                "company_id": company_id,
                "linked_event_id": ev["event_id"],
                "status": "POSTED",
            },
            {"_id": 0, "lines": 1},
        ).to_list(50)
        posted_recipe_ids = set()
        for b in posted_batches:
            for line in (b.get("lines") or []):
                if line.get("recipe_id"):
                    posted_recipe_ids.add(line["recipe_id"])
        missing = [rid for rid in recipe_ids if rid not in posted_recipe_ids]
        if missing:
            recipe_names = await db.recipes.find(
                {"recipe_id": {"$in": missing}, "company_id": company_id},
                {"_id": 0, "name": 1, "recipe_id": 1},
            ).to_list(50)
            gaps.append({
                "event_id": ev["event_id"],
                "event_name": ev["name"],
                "event_date": ev["event_date"],
                "missing_recipes": [r["name"] for r in recipe_names],
                "missing_count": len(missing),
            })
    gaps.sort(key=lambda x: x["event_date"])
    return gaps[:10]


async def _ai_recommendations(digest_data: Dict[str, Any], company_name: str) -> List[str]:
    """Optional AI-generated action bullets (≤5). Uses Emergent LLM key.
    Falls back to empty list silently if anything fails (key, network, parsing)."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        return []
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return []
    try:
        # Build compact context
        prompt = (
            f"You are a catering operations advisor for {company_name}. Read the weekly digest "
            "data below and produce up to 5 concrete, prioritized, one-sentence action bullets "
            "the chef/owner should take this week. Be specific (mention dish names, % numbers, "
            "or counts). Output as a plain JSON array of strings, no preamble.\n\n"
            f"Digest data:\n{digest_data}"
        )
        chat = LlmChat(api_key=key, session_id=f"culinary-digest-{company_name}", system_message="You are a concise catering operations advisor.").with_model("openai", "gpt-4o-mini")
        resp = await chat.send_message(UserMessage(text=prompt))
        # Parse JSON array
        import json
        import re
        m = re.search(r"\[[\s\S]*\]", resp or "")
        if not m:
            return []
        parsed = json.loads(m.group(0))
        return [str(x) for x in parsed[:5]]
    except Exception as e:
        logger.warning(f"[digest] AI recs failed: {e}")
        return []


async def compute_digest(company_id: str, user: User, settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Compute the digest payload for one company.
    `user` must belong to `company_id` (used for endpoints that need User context)."""
    settings = settings or await _get_settings(company_id)
    sections = settings.get("sections") or DEFAULT_SECTIONS
    since_iso = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "name": 1})
    company_name = (company or {}).get("name", "Your Company")

    data: Dict[str, Any] = {
        "company_id": company_id,
        "company_name": company_name,
        "window_label": f"{(datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()} → {datetime.now(timezone.utc).date().isoformat()}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections_enabled": sections,
    }

    if sections.get("exec_summary"):
        data["exec_summary"] = await _exec_summary(company_id, since_iso)
    if sections.get("stars_dogs"):
        data["stars_dogs"] = await _stars_and_dogs(company_id, user)
    if sections.get("staleness"):
        data["staleness"] = await _stale_menus(company_id)
    if sections.get("variance"):
        data["variance"] = await _variance_critical(company_id, user)
    if sections.get("low_stock"):
        data["low_stock"] = await _low_stock_affecting_events(company_id, user)
    if sections.get("mise_en_place_gap"):
        data["mise_en_place_gap"] = await _mise_en_place_gap(company_id)
    if sections.get("ai_recommendations"):
        data["ai_recommendations"] = await _ai_recommendations(data, company_name)

    return data


def render_digest_html(data: Dict[str, Any], frontend_url: str = "") -> str:
    """Render the digest payload to a print-/email-friendly HTML string."""
    name = data.get("company_name", "")
    window = data.get("window_label", "")
    sections_enabled = data.get("sections_enabled", {})

    def block(title, body):
        return f'''<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr><td style="border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
            <h2 style="margin:0;font-size:16px;color:#1f2937;letter-spacing:0.3px;">{title}</h2>
          </td></tr>
          <tr><td style="padding-top:10px;">{body}</td></tr></table>'''

    blocks = []

    if sections_enabled.get("exec_summary") and data.get("exec_summary"):
        s = data["exec_summary"]
        blocks.append(block("📊 Resumen Ejecutivo (7 días)", f'''
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            {_kpi_cell("Eventos", s["total_events"])}
            {_kpi_cell("Invitados", s["total_guests"])}
            {_kpi_cell("Ingresos", f'${s["total_revenue"]:,.0f}')}
            {_kpi_cell("Margen prom.", f'{s["avg_margin_pct"]:.1f}%')}
          </tr></table>'''))

    if sections_enabled.get("stars_dogs") and data.get("stars_dogs"):
        sd = data["stars_dogs"]
        rows_html = ""
        for label, items, emoji, color in [
            ("⭐ Estrellas (promueve)", sd.get("stars", []), "⭐", "#10b981"),
            ("🐕 Dogs (revisa)", sd.get("dogs", []), "🐕", "#ef4444"),
        ]:
            if not items:
                continue
            list_html = "".join(
                f'<li style="margin-bottom:4px;"><b>{r.get("recipe_name")}</b> · '
                f'<span style="color:#6b7280;">${r.get("profit_per_portion", 0):.2f}/porción · pop {r.get("popularity_score")}</span></li>'
                for r in items
            )
            rows_html += f'<div style="margin-bottom:14px;"><div style="font-size:13px;color:{color};font-weight:700;margin-bottom:6px;">{label}</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937;">{list_html}</ul></div>'
        if rows_html:
            blocks.append(block("🍽️ Ingeniería de Menú (30 días)", rows_html))

    if sections_enabled.get("staleness") and data.get("staleness"):
        st = data["staleness"]
        if st:
            list_html = "".join(
                f'<li style="margin-bottom:4px;"><b>{r["name"]}</b> · <span style="color:#dc2626;">drift {r["drift_pct"]:+.1f}%</span> · ${r["snapshot"]} → ${r["live"]}</li>'
                for r in st
            )
            blocks.append(block("⚠️ Menús con costo desactualizado",
                f'<ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937;">{list_html}</ul>'))

    if sections_enabled.get("variance") and data.get("variance"):
        v = data["variance"]
        if v:
            list_html = "".join(
                f'<li style="margin-bottom:4px;"><b>{r["event_name"]}</b> · '
                f'<span style="color:#dc2626;font-weight:700;">{r["variance_percent"]:+.1f}%</span> · '
                f'real ${r["actual_cost"]:.0f} vs teórico ${r["theoretical_cost"]:.0f}</li>'
                for r in v
            )
            blocks.append(block("🚨 Variación de costo crítica (últimos 30 días)",
                f'<ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937;">{list_html}</ul>'))

    if sections_enabled.get("low_stock") and data.get("low_stock"):
        ls = data["low_stock"]
        if ls:
            list_html = "".join(
                f'<li style="margin-bottom:4px;"><b>{r["name"]}</b> · falta {r["total_shortage"]} {r["unit"]} para {len(r["events"])} evento(s)</li>'
                for r in ls
            )
            blocks.append(block("📦 Stock bajo que afecta próximos eventos",
                f'<ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937;">{list_html}</ul>'))

    if sections_enabled.get("mise_en_place_gap") and data.get("mise_en_place_gap"):
        gaps = data["mise_en_place_gap"]
        if gaps:
            list_html = "".join(
                f'<li style="margin-bottom:4px;"><b>{g["event_name"]}</b> ({g["event_date"]}) · {g["missing_count"]} receta(s) sin lote POSTED</li>'
                for g in gaps
            )
            blocks.append(block("🔪 Mise en place pendiente (próximos 7 días)",
                f'<ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937;">{list_html}</ul>'))

    if sections_enabled.get("ai_recommendations") and data.get("ai_recommendations"):
        recs = data["ai_recommendations"]
        if recs:
            list_html = "".join(f'<li style="margin-bottom:6px;">{r}</li>' for r in recs)
            blocks.append(block("🤖 Recomendaciones de IA",
                f'<ul style="margin:0;padding-left:18px;font-size:13px;color:#1f2937;">{list_html}</ul>'))

    return f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <tr><td>
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Culinary Weekly Digest</div>
      <h1 style="margin:6px 0 0 0;font-size:24px;color:#111827;">{name}</h1>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">{window}</div>
      {"".join(blocks)}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
        Generated by Kora OS · <a href="{frontend_url}/food-ops/menus" style="color:#6366f1;">Open Culinary Intelligence →</a>
      </div>
    </td></tr>
  </table>
</body></html>'''


def _kpi_cell(label, value):
    return f'''<td align="center" style="padding:12px 6px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;width:25%;">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;">{label}</div>
      <div style="font-size:20px;font-weight:700;color:#1f2937;margin-top:4px;">{value}</div>
    </td>'''


async def dispatch_digest(company_id: str, user: User, settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Compute, render, send email + create in-app notifications. Records history."""
    settings = settings or await _get_settings(company_id)

    data = await compute_digest(company_id, user, settings)
    recipients = await _resolve_recipients(company_id, settings)
    frontend_url = os.environ.get("FRONTEND_URL", "")
    html = render_digest_html(data, frontend_url)

    email_result = {"success": False, "skipped": True}
    if recipients:
        try:
            from utils.smtp_service import send_smtp_email
            import asyncio
            subject = f"📊 Culinary Weekly Digest — {data.get('company_name', '')}"
            email_result = await asyncio.to_thread(send_smtp_email, recipients, subject, html, None)
        except Exception as e:
            logger.exception(f"[digest] email send failed for {company_id}: {e}")
            email_result = {"success": False, "error": str(e)}

    # Build short in-app summary
    counts = {
        "stars": len((data.get("stars_dogs") or {}).get("stars") or []),
        "dogs": len((data.get("stars_dogs") or {}).get("dogs") or []),
        "stale": len(data.get("staleness") or []),
        "variance": len(data.get("variance") or []),
        "low_stock": len(data.get("low_stock") or []),
        "mep_gap": len(data.get("mise_en_place_gap") or []),
    }

    # Compute primary action (deeplink) — priority order: variance → staleness → low_stock → mep_gap → menu_engineering
    primary_action: Dict[str, Any] = {"type": "digest", "link": "/food-ops/menus?dialog=digest"}
    if counts["variance"] > 0:
        top_v = (data.get("variance") or [{}])[0]
        eid = top_v.get("event_id")
        primary_action = {
            "type": "variance",
            "event_id": eid,
            "link": f"/food-ops/menus?dialog=variance{'&event_id=' + eid if eid else ''}",
            "label": top_v.get("event_name") or "evento con variación crítica",
        }
    elif counts["stale"] > 0:
        top_s = (data.get("staleness") or [{}])[0]
        mid = top_s.get("menu_id")
        primary_action = {
            "type": "staleness",
            "menu_id": mid,
            "link": f"/food-ops/menus?dialog=staleness{'&menu_id=' + mid if mid else ''}",
            "label": top_s.get("name") or "menú desactualizado",
        }
    elif counts["low_stock"] > 0:
        primary_action = {
            "type": "low_stock",
            "link": "/food-ops/menus?dialog=event-plan",
            "label": f"{counts['low_stock']} insumos críticos",
        }
    elif counts["mep_gap"] > 0:
        top_m = (data.get("mise_en_place_gap") or [{}])[0]
        eid = top_m.get("event_id")
        primary_action = {
            "type": "mise_en_place",
            "event_id": eid,
            "link": f"/food-ops/menus?dialog=event-plan{'&event_id=' + eid if eid else ''}",
            "label": top_m.get("event_name") or "mise-en-place pendiente",
        }
    elif counts["dogs"] > 0 or counts["stars"] > 0:
        primary_action = {
            "type": "menu_engineering",
            "link": "/food-ops/menus?dialog=menu-engineering",
            "label": f"{counts['stars']} stars · {counts['dogs']} dogs",
        }

    title = "📊 Culinary Weekly Digest"
    pieces = []
    if counts["stale"]:
        pieces.append(f"{counts['stale']} menús desactualizados")
    if counts["variance"]:
        pieces.append(f"{counts['variance']} eventos con variación crítica")
    if counts["low_stock"]:
        pieces.append(f"{counts['low_stock']} ingredientes con stock bajo")
    message = " · ".join(pieces) if pieces else "Resumen semanal listo"

    # Notify each role-based user (in-app)
    notified_user_ids = []
    roles = settings.get("recipients_roles") or []
    if roles:
        users = await db.users.find(
            {"company_id": company_id, "role": {"$in": roles}},
            {"_id": 0, "user_id": 1},
        ).to_list(200)
        for u in users:
            try:
                await create_notification(
                    user_id=u["user_id"],
                    notification_type="culinary_digest",
                    title=title,
                    message=message,
                    link=primary_action["link"],
                    metadata={
                        "counts": counts,
                        "window": data.get("window_label"),
                        "primary_action": primary_action,
                    },
                    priority="normal",
                )
                notified_user_ids.append(u["user_id"])
            except Exception:
                continue

    # Record history
    history_doc = {
        "history_id": f"cdh_{datetime.now(timezone.utc).timestamp():.0f}",
        "company_id": company_id,
        "dispatched_at": datetime.now(timezone.utc).isoformat(),
        "recipients": recipients,
        "notified_user_ids": notified_user_ids,
        "email_result": email_result,
        "counts": counts,
        "primary_action": primary_action,
        "window_label": data.get("window_label"),
        "dispatched_by": user.user_id,
    }
    await db.culinary_digest_history.insert_one(history_doc)
    history_doc.pop("_id", None)

    return {
        "data": data,
        "recipients": recipients,
        "notified_user_ids": notified_user_ids,
        "email_result": email_result,
        "counts": counts,
        "primary_action": primary_action,
        "history_id": history_doc["history_id"],
    }


# ============================== ENDPOINTS ==============================

@culinary_digest_router.get("/settings")
async def get_digest_settings(user: User = Depends(get_current_user)):
    return await _get_settings(user.company_id)


@culinary_digest_router.put("/settings")
async def update_digest_settings(data: DigestSettings, user: User = Depends(get_current_user)):
    if data.frequency not in ("weekly", "biweekly", "monthly"):
        raise HTTPException(status_code=400, detail="frequency must be weekly|biweekly|monthly")
    if not (0 <= data.day_of_week <= 6):
        raise HTTPException(status_code=400, detail="day_of_week must be 0..6")
    if not (0 <= data.hour <= 23):
        raise HTTPException(status_code=400, detail="hour must be 0..23")

    # Merge defaults
    sections = dict(DEFAULT_SECTIONS)
    sections.update(data.sections or {})

    doc = {
        "company_id": user.company_id,
        "enabled": bool(data.enabled),
        "frequency": data.frequency,
        "day_of_week": int(data.day_of_week),
        "hour": int(data.hour),
        "recipients_roles": data.recipients_roles or [],
        "recipient_emails_extra": [e for e in (data.recipient_emails_extra or []) if "@" in e],
        "sections": sections,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user.user_id,
    }
    await db.culinary_digest_settings.update_one(
        {"company_id": user.company_id},
        {"$set": doc},
        upsert=True,
    )
    return doc


@culinary_digest_router.get("/preview")
async def preview_digest(user: User = Depends(get_current_user)):
    """Returns the structured data + rendered HTML for preview, no side-effects."""
    settings = await _get_settings(user.company_id)
    data = await compute_digest(user.company_id, user, settings)
    frontend_url = os.environ.get("FRONTEND_URL", "")
    html = render_digest_html(data, frontend_url)
    return {"data": data, "html": html, "settings": settings}


@culinary_digest_router.post("/generate-now")
async def generate_now(user: User = Depends(get_current_user)):
    """Manual trigger — sends email + creates in-app notifications + records history."""
    settings = await _get_settings(user.company_id)
    result = await dispatch_digest(user.company_id, user, settings)
    return result


@culinary_digest_router.get("/history")
async def get_digest_history(limit: int = 20, user: User = Depends(get_current_user)):
    cursor = db.culinary_digest_history.find(
        {"company_id": user.company_id},
        {"_id": 0},
    ).sort("dispatched_at", -1).limit(min(max(limit, 1), 100))
    return await cursor.to_list(100)
