"""
Kora OS - Launch Event Waitlist & Founding 100
Captures emails for the May 1-3 stand event and 30% off founding offer.
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import logging

logger = logging.getLogger(__name__)

# DB connection
_mongo_url = os.environ.get("MONGO_URL")
_db_name = os.environ.get("DB_NAME")
_client = AsyncIOMotorClient(_mongo_url)
db = _client[_db_name]

launch_router = APIRouter(prefix="/launch", tags=["launch"])

# Launch Special offer (post-event):
# - Cap: first 50 companies after launch
# - Deadline: May 31, 2026 23:59 EST (whichever comes first)
FOUNDING_CAP = 50
LAUNCH_OFFER_DEADLINE = "2026-05-31T23:59:00-04:00"
LAUNCH_OFFER_LABEL = "Launch Special"


class WaitlistEntry(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=120)
    company: Optional[str] = Field(None, max_length=120)
    industry: Optional[str] = Field(None, max_length=80)
    interest: Optional[str] = Field(None, max_length=400)  # what they want to see
    source: Optional[str] = Field("landing", max_length=40)  # landing, stand, qr, etc.


@launch_router.get("/stats")
async def get_launch_stats():
    """Public counter — how many launch-special spots remain."""
    count = await db.launch_waitlist.count_documents({"is_founding": True})
    remaining = max(0, FOUNDING_CAP - count)
    return {
        "founding_cap": FOUNDING_CAP,
        "founding_claimed": count,
        "founding_remaining": remaining,
        "offer_label": LAUNCH_OFFER_LABEL,
        "offer_deadline": LAUNCH_OFFER_DEADLINE,
    }


@launch_router.post("/waitlist")
async def join_waitlist(entry: WaitlistEntry, request: Request):
    """Register on the launch waitlist. First 100 get the Founding offer."""
    email_lower = entry.email.lower().strip()

    existing = await db.launch_waitlist.find_one({"email": email_lower}, {"_id": 0})
    if existing:
        return {
            "ok": True,
            "already_registered": True,
            "is_founding": existing.get("is_founding", False),
            "founding_position": existing.get("founding_position"),
            "remaining": max(0, FOUNDING_CAP - await db.launch_waitlist.count_documents({"is_founding": True})),
        }

    current_founding = await db.launch_waitlist.count_documents({"is_founding": True})
    is_founding = current_founding < FOUNDING_CAP
    founding_position = current_founding + 1 if is_founding else None

    doc = {
        "waitlist_id": str(uuid.uuid4()),
        "email": email_lower,
        "name": entry.name.strip(),
        "company": (entry.company or "").strip(),
        "industry": (entry.industry or "").strip(),
        "interest": (entry.interest or "").strip(),
        "source": entry.source or "landing",
        "is_founding": is_founding,
        "founding_position": founding_position,
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent", "")[:300],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.launch_waitlist.insert_one(doc)

    # Fire-and-forget: confirmation email (won't block the response)
    asyncio.create_task(_send_waitlist_confirmation(doc))

    return {
        "ok": True,
        "already_registered": False,
        "is_founding": is_founding,
        "founding_position": founding_position,
        "remaining": max(0, FOUNDING_CAP - (current_founding + (1 if is_founding else 0))),
    }


def _build_waitlist_email(name: str, is_founding: bool, position: Optional[int], remaining: int, frontend_url: str) -> tuple[str, str, str]:
    """Returns (subject, html, text)."""
    if is_founding:
        subject = f"🎉 Eres Early-Adopter #{position} de Kora OS"
        hero_title = f"¡Eres Early-Adopter #{position}!"
        hero_sub = "Tu 30% off año 1 está reservado."
        body_intro = (
            f"Hola <strong>{name}</strong>,<br><br>"
            "Acabas de unirte a las primeras 50 empresas en Kora OS. "
            "Esto te da:"
        )
        bullets = [
            "✅ <strong>30% off año 1</strong> en Kora Core + add-ons",
            "✅ <strong>Badge Early-Adopter</strong> permanente en tu cuenta",
            "✅ <strong>Discord privado</strong> con el equipo de Kora",
            "✅ <strong>Onboarding 1:1</strong> con uno de nosotros",
            "✅ <strong>Prioridad</strong> en solicitudes del roadmap",
        ]
        next_steps = (
            "<strong>¿Qué sigue?</strong><br>"
            "En menos de 24 horas te escribimos personalmente con el link de activación, "
            "una invitación al Discord privado y para agendar tu onboarding 1:1."
        )
    else:
        subject = "Estás en la lista de Kora OS"
        hero_title = "¡Estás en la lista!"
        hero_sub = "Las plazas Early-Adopter ya se agotaron, pero tienes acceso prioritario."
        body_intro = (
            f"Hola <strong>{name}</strong>,<br><br>"
            "Gracias por unirte a la lista de Kora OS. Aunque las 50 plazas Early-Adopter ya se llenaron, "
            "tienes acceso prioritario al producto."
        )
        bullets = [
            "✅ <strong>Acceso prioritario</strong> antes que el público general",
            "✅ <strong>Soporte directo</strong> con el equipo durante tu primera semana",
            "✅ <strong>Promociones futuras</strong> exclusivas para la lista",
        ]
        next_steps = (
            "<strong>¿Qué sigue?</strong><br>"
            "Te escribimos en los próximos días con el link para empezar a usar Kora OS."
        )

    bullets_html = "".join(f'<li style="margin-bottom:6px;color:#1f2937;">{b}</li>' for b in bullets)

    cta_html = f'<a href="{frontend_url}" style="display:inline-block;background:#AED768;color:#1f2937;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;">Visitar Kora OS →</a>'

    html = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:24px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:32px 28px;background:#1f2937;color:#ffffff;text-align:center;">
          <div style="font-size:11px;color:#AED768;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Kora OS · Launch Special</div>
          <div style="font-size:28px;font-weight:800;margin-top:10px;">{hero_title}</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:8px;">{hero_sub}</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#1f2937;">{body_intro}</p>
          <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;">{bullets_html}</ul>
          <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#1f2937;">{next_steps}</p>
          <div style="text-align:center;padding:24px 0 8px;">{cta_html}</div>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #f1f5f9;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;">
            Recibes este email porque te registraste en la lista de Kora OS.<br>
            Quedan <strong>{remaining}</strong> plazas Launch Special. <a href="{frontend_url}" style="color:#6b7280;">ourkora.com</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>'''

    text = (
        f"{hero_title}\n\n{hero_sub}\n\n"
        f"Hola {name}, gracias por unirte a Kora OS. Visita {frontend_url} para más info."
    )
    return subject, html, text


async def _send_waitlist_confirmation(doc: dict):
    """Send confirmation email via SMTP. Logs but never raises."""
    try:
        from utils.smtp_service import send_smtp_email, is_smtp_configured

        if not is_smtp_configured():
            logger.info(f"[waitlist] SMTP not configured — skipping confirmation for {doc['email']}")
            return

        remaining = max(0, FOUNDING_CAP - await db.launch_waitlist.count_documents({"is_founding": True}))
        frontend_url = os.environ.get("FRONTEND_URL", "https://ourkora.com")
        subject, html, text = _build_waitlist_email(
            name=doc["name"],
            is_founding=doc["is_founding"],
            position=doc.get("founding_position"),
            remaining=remaining,
            frontend_url=frontend_url,
        )
        # Run blocking SMTP in a thread
        await asyncio.to_thread(send_smtp_email, [doc["email"]], subject, html, text)
        logger.info(f"[waitlist] confirmation queued for {doc['email']}")
    except Exception as e:
        logger.exception(f"[waitlist] confirmation send failed for {doc.get('email')}: {e}")
