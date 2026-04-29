"""
Kora OS - Launch Event Waitlist & Founding 100
Captures emails for the May 1-3 stand event and 30% off founding offer.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

# DB connection
_mongo_url = os.environ.get("MONGO_URL")
_db_name = os.environ.get("DB_NAME")
_client = AsyncIOMotorClient(_mongo_url)
db = _client[_db_name]

launch_router = APIRouter(prefix="/launch", tags=["launch"])

FOUNDING_CAP = 100  # Total spots for Founding 100 offer


class WaitlistEntry(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=120)
    company: Optional[str] = Field(None, max_length=120)
    industry: Optional[str] = Field(None, max_length=80)
    interest: Optional[str] = Field(None, max_length=400)  # what they want to see
    source: Optional[str] = Field("landing", max_length=40)  # landing, stand, qr, etc.


@launch_router.get("/stats")
async def get_launch_stats():
    """Public counter — how many founding spots remain."""
    count = await db.launch_waitlist.count_documents({"is_founding": True})
    remaining = max(0, FOUNDING_CAP - count)
    return {
        "founding_cap": FOUNDING_CAP,
        "founding_claimed": count,
        "founding_remaining": remaining,
        "event_dates": ["2026-05-01", "2026-05-02", "2026-05-03"],
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

    return {
        "ok": True,
        "already_registered": False,
        "is_founding": is_founding,
        "founding_position": founding_position,
        "remaining": max(0, FOUNDING_CAP - (current_founding + (1 if is_founding else 0))),
    }
