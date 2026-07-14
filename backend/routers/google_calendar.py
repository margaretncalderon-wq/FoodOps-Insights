# routers/google_calendar.py - Google Calendar Integration for CRM Follow-ups
import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Any
import uuid

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import RedirectResponse
import requests
from cryptography.fernet import Fernet, InvalidToken as FernetInvalidToken
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

from config import db
from dependencies import get_current_user
from models.auth import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth/calendar", tags=["Google Calendar"])

# Environment variables
GOOGLE_CALENDAR_CLIENT_ID = os.environ.get("GOOGLE_CALENDAR_CLIENT_ID")
GOOGLE_CALENDAR_CLIENT_SECRET = os.environ.get("GOOGLE_CALENDAR_CLIENT_SECRET")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://ourkora.com")

# ==================== SCOPES ====================
# Narrower than legacy `auth/calendar` (which grants full R/W to ALL calendars).
# We only need:
#   * calendar.events                 → create / update / delete events
#   * calendar.calendarlist.readonly  → list calendars for the user to pick one
#   * userinfo.email                  → identify which Google account was connected
# NOTE: existing tenants connected under the broader legacy scope will keep
# working — Google returns the granted scopes on refresh and the API rejects
# unauthorized calls anyway. New OAuth grants after this deploy will use the
# tighter set.
CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
]

# Collections
CALENDAR_CONFIG_COLLECTION = "calendar_config"
CALENDAR_AUDIT_COLLECTION = "calendar_audit"


# ==================== ENCRYPTION AT REST ====================
_FERNET: Optional[Fernet] = None


def _fernet() -> Optional[Fernet]:
    """Lazy-load the token encryption key. Returns None if the key is missing
    so the module can still import in dev / tests, but any encryption /
    decryption call MUST require it and will raise a clear error."""
    global _FERNET
    if _FERNET is None:
        key = os.environ.get("CALENDAR_TOKEN_KEY")
        if not key:
            return None
        _FERNET = Fernet(key.encode() if isinstance(key, str) else key)
    return _FERNET


def _encrypt_tokens(tokens: dict) -> dict:
    """Persist tokens encrypted-at-rest. Returns a shape safe to store in
    Mongo: `{ _v: 1, ct: "<fernet-ciphertext>" }`. The plaintext dict never
    lands on disk. Falls back to plaintext with a WARNING when the key is
    missing (dev only) so we never silently ship insecure prod."""
    f = _fernet()
    if not f:
        logger.warning(
            "CALENDAR_TOKEN_KEY missing — storing calendar tokens in plaintext. "
            "This is NOT safe for production."
        )
        return tokens
    payload = json.dumps(tokens, default=str).encode("utf-8")
    return {"_v": 1, "ct": f.encrypt(payload).decode("ascii")}


def _decrypt_tokens(stored: Any) -> Optional[dict]:
    """Reverse of `_encrypt_tokens`. Also accepts LEGACY plaintext dicts so
    tenants connected before this migration keep working — first successful
    read/refresh re-encrypts them via `_persist_tokens_encrypted`."""
    if stored is None:
        return None
    if isinstance(stored, dict) and stored.get("_v") == 1 and "ct" in stored:
        f = _fernet()
        if not f:
            raise RuntimeError(
                "Encrypted calendar tokens found but CALENDAR_TOKEN_KEY is not set."
            )
        try:
            return json.loads(f.decrypt(stored["ct"].encode("ascii")).decode("utf-8"))
        except (FernetInvalidToken, ValueError) as e:
            logger.error(f"Failed to decrypt calendar tokens: {e}")
            return None
    # Legacy plaintext shape
    if isinstance(stored, dict):
        return stored
    return None


async def _persist_tokens_encrypted(company_id: str, tokens: dict) -> None:
    """Encrypt + save tokens for a company. Used both after OAuth callback and
    after every token refresh."""
    await db[CALENDAR_CONFIG_COLLECTION].update_one(
        {"company_id": company_id},
        {"$set": {"tokens": _encrypt_tokens(tokens)}},
    )


# ==================== AUDIT LOG ====================
async def _audit(
    company_id: Optional[str],
    action: str,
    *,
    user_id: Optional[str] = None,
    result: str = "success",
    kora_entity_type: Optional[str] = None,
    kora_entity_id: Optional[str] = None,
    google_event_id: Optional[str] = None,
    error: Optional[str] = None,
    extra: Optional[dict] = None,
) -> None:
    """Structured audit log for every calendar integration state change.

    NEVER logs the access_token, refresh_token, authorization_code, client
    secret, or full OAuth response body — callers must sanitize before
    passing anything via `error` or `extra`.
    """
    try:
        doc = {
            "company_id": company_id,
            "user_id": user_id,
            "action": action,
            "result": result,
            "kora_entity_type": kora_entity_type,
            "kora_entity_id": kora_entity_id,
            "google_event_id": google_event_id,
            "error": (error or "")[:500],  # truncate to keep log bounded
            "extra": extra or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db[CALENDAR_AUDIT_COLLECTION].insert_one(doc)
    except Exception as e:  # never let audit failures break the flow
        logger.warning(f"[calendar_audit] failed to write log: {e}")


def _sanitize_error(msg: Any) -> str:
    """Redact tokens / codes / long stack traces before surfacing an error to
    the frontend or the audit log."""
    s = str(msg or "")
    # Common secrets patterns
    for tok in ("access_token", "refresh_token", "client_secret", "authorization_code", "id_token"):
        if tok in s.lower():
            s = "[error contained sensitive token — redacted]"
            break
    return s[:200]


# ==================== OAUTH FLOW ====================

@router.get("/connect")
async def start_calendar_oauth(
    user: User = Depends(get_current_user),
    redirect_uri: Optional[str] = None
):
    """
    Start OAuth flow to connect Google Calendar.
    Only admins/owners can connect the shared calendar.
    """
    # Permission check - only admin/owner can connect calendar
    user_role = getattr(user, 'role_id', None)
    if user_role not in [None, "admin", "owner", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can connect the shared calendar")
    
    if not GOOGLE_CALENDAR_CLIENT_ID or not GOOGLE_CALENDAR_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google Calendar credentials not configured")
    
    # Build redirect URI
    actual_redirect_uri = redirect_uri or f"{FRONTEND_URL}/api/oauth/calendar/callback"
    
    # Store state for security. Format: `<company_id>:<user_id>:<nonce>`.
    # user_id is included so `connected_by_user_id` can be captured in the
    # callback where we don't have a Depends(user).
    state = f"{user.company_id}:{getattr(user, 'user_id', '') or ''}:{uuid.uuid4().hex[:24]}"
    await db[CALENDAR_CONFIG_COLLECTION].update_one(
        {"company_id": user.company_id},
        {"$set": {"oauth_state": state, "oauth_redirect": actual_redirect_uri}},
        upsert=True
    )
    
    # Build authorization URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CALENDAR_CLIENT_ID}&"
        f"redirect_uri={actual_redirect_uri}&"
        "response_type=code&"
        f"scope={' '.join(CALENDAR_SCOPES)}&"
        "access_type=offline&"
        "prompt=consent&"
        f"state={state}"
    )
    
    return {"authorization_url": auth_url, "state": state}


@router.get("/callback")
async def calendar_oauth_callback(
    code: str,
    state: str,
    error: Optional[str] = None
):
    """
    Handle OAuth callback from Google.
    """
    if error:
        await _audit(None, "oauth_callback", result="error", error=_sanitize_error(error))
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error={_sanitize_error(error)}")

    # Validate state and get company_id
    company_id = state.split(":")[0] if ":" in state else None
    if not company_id:
        await _audit(None, "oauth_callback", result="error", error="invalid_state")
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error=invalid_state")

    # Get stored config
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": company_id})
    if not config or config.get("oauth_state") != state:
        # Do NOT include the received state in the redirect (could be attacker-controlled).
        await _audit(company_id, "oauth_callback", result="error", error="state_mismatch")
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error=state_mismatch")

    redirect_uri = config.get("oauth_redirect", f"{FRONTEND_URL}/api/oauth/calendar/callback")

    # Exchange code for tokens
    try:
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CALENDAR_CLIENT_ID,
                "client_secret": GOOGLE_CALENDAR_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code"
            }
        )
        tokens = token_response.json()

        if "error" in tokens:
            safe_msg = _sanitize_error(tokens.get("error_description", tokens["error"]))
            await _audit(company_id, "oauth_callback", result="error", error=safe_msg)
            return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error={safe_msg}")

        # Get user info to identify the account
        user_info = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"}
        ).json()

        # Save tokens (encrypted) and config
        now = datetime.now(timezone.utc)
        granted_scopes = (tokens.get("scope") or "").split() if isinstance(tokens.get("scope"), str) else []
        await db[CALENDAR_CONFIG_COLLECTION].update_one(
            {"company_id": company_id},
            {"$set": {
                "tokens": _encrypt_tokens(tokens),
                "connected_email": user_info.get("email"),
                "connected_at": now.isoformat(),
                "connected_by_user_id": (state.split(":")[1] if ":" in state and len(state.split(":")) > 2 else None),
                "granted_scopes": granted_scopes,
                "is_connected": True,
                "oauth_state": None  # Clear state after use (single-use)
            }}
        )

        await _audit(
            company_id, "connected",
            result="success",
            extra={"email": user_info.get("email"), "scopes": granted_scopes},
        )
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_connected=true")

    except Exception as e:
        safe = _sanitize_error(e)
        await _audit(company_id, "oauth_callback", result="error", error=safe)
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error={safe}")


@router.get("/sync-status")
async def calendar_sync_status(user: User = Depends(get_current_user)):
    """Diagnostic snapshot of what is / isn't synced to Google Calendar.

    Helps users understand why they don't see anything in the calendar:
    typical cause is that existing records (created before connecting the
    calendar) don't have a `calendar_event_id` and were never backfilled.
    """
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config or not config.get("is_connected"):
        return {"is_connected": False}

    from datetime import date as _date
    today_iso = _date.today().isoformat()

    events_with_date = await db.events.count_documents({
        "company_id": user.company_id,
        "event_date_tbd": {"$ne": True},
        "event_date": {"$ne": None},
    })
    events_synced = await db.events.count_documents({
        "company_id": user.company_id,
        "calendar_event_id": {"$exists": True, "$ne": ""},
    })

    leads_pending = await db.leads.count_documents({
        "company_id": user.company_id,
        "next_follow_up_date": {"$ne": None, "$gte": today_iso},
    })
    leads_synced = await db.leads.count_documents({
        "company_id": user.company_id,
        "calendar_event_id": {"$exists": True, "$ne": ""},
    })
    clients_pending = await db.clients.count_documents({
        "company_id": user.company_id,
        "next_follow_up_date": {"$ne": None, "$gte": today_iso},
    })
    clients_synced = await db.clients.count_documents({
        "company_id": user.company_id,
        "calendar_event_id": {"$exists": True, "$ne": ""},
    })

    return {
        "is_connected": True,
        "shared_calendar_id": config.get("shared_calendar_id"),
        "shared_calendar_name": config.get("shared_calendar_name"),
        "events": {
            "with_date": events_with_date,
            "synced": events_synced,
            "pending": max(events_with_date - events_synced, 0),
        },
        "follow_ups": {
            "leads_upcoming": leads_pending,
            "leads_synced": leads_synced,
            "clients_upcoming": clients_pending,
            "clients_synced": clients_synced,
        },
        "last_backfill_at": config.get("last_backfill_at"),
    }


@router.post("/sync-all")
async def sync_all_to_calendar(user: User = Depends(get_current_user)):
    """Backfill push: force-sync all existing events + upcoming CRM follow-ups
    to the connected Google Calendar. Use after connecting for the first time
    (or after re-connecting to a new shared calendar) to see historical data
    show up on the calendar.

    Idempotent: records that already have a `calendar_event_id` are UPDATED
    (not duplicated) via the standard `events.update` API path.
    """
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config or not config.get("is_connected"):
        raise HTTPException(status_code=400, detail="Calendar not connected")
    if not config.get("shared_calendar_id"):
        raise HTTPException(status_code=400, detail="No shared calendar selected")

    from datetime import date as _date
    today_iso = _date.today().isoformat()

    result = {
        "events_pushed": 0,
        "events_failed": 0,
        "leads_pushed": 0,
        "leads_failed": 0,
        "clients_pushed": 0,
        "clients_failed": 0,
        "errors": [],
    }

    # 1) Catering events with a real date
    if config.get("auto_sync_events", True):
        async for ev in db.events.find({
            "company_id": user.company_id,
            "event_date_tbd": {"$ne": True},
            "event_date": {"$ne": None},
        }, {"_id": 0}):
            try:
                await auto_sync_event(user.company_id, ev["event_id"], action="upsert")
                result["events_pushed"] += 1
            except Exception as e:
                result["events_failed"] += 1
                result["errors"].append(f"event {ev.get('event_id')}: {str(e)[:120]}")

    # 2) CRM follow-ups (leads + clients with upcoming next_follow_up_date)
    if config.get("auto_sync_follow_ups", True):
        for entity_type, collection, id_field in [
            ("lead", db.leads, "lead_id"),
            ("client", db.clients, "client_id"),
        ]:
            async for entity in collection.find({
                "company_id": user.company_id,
                "next_follow_up_date": {"$ne": None, "$gte": today_iso},
            }, {"_id": 0}):
                try:
                    await auto_sync_follow_up(
                        user.company_id, entity_type, entity[id_field], entity
                    )
                    key = "leads_pushed" if entity_type == "lead" else "clients_pushed"
                    result[key] += 1
                except Exception as e:
                    key = "leads_failed" if entity_type == "lead" else "clients_failed"
                    result[key] += 1
                    result["errors"].append(f"{entity_type} {entity.get(id_field)}: {str(e)[:120]}")

    # Track when the last backfill ran so the UI can show it.
    await db[CALENDAR_CONFIG_COLLECTION].update_one(
        {"company_id": user.company_id},
        {"$set": {"last_backfill_at": datetime.now(timezone.utc).isoformat()}},
    )
    result["last_backfill_at"] = datetime.now(timezone.utc).isoformat()
    # Cap errors list to keep UI payload small
    result["errors"] = result["errors"][:20]
    return result


@router.get("/status")
async def get_calendar_status(user: User = Depends(get_current_user)):
    """Get the current Google Calendar connection status for the company."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one(
        {"company_id": user.company_id},
        {"_id": 0, "tokens": 0, "oauth_state": 0}  # Never expose sensitive data
    )

    if not config or not config.get("is_connected"):
        return {
            "is_connected": False,
            "connected_email": None,
            "shared_calendar_id": None,
            "shared_calendar_name": None
        }

    return {
        "is_connected": True,
        "connected_email": config.get("connected_email"),
        "connected_at": config.get("connected_at"),
        "connected_by_user_id": config.get("connected_by_user_id"),
        "granted_scopes": config.get("granted_scopes", []),
        "shared_calendar_id": config.get("shared_calendar_id"),
        "shared_calendar_name": config.get("shared_calendar_name"),
        "auto_sync_events": config.get("auto_sync_events", True),
        "auto_sync_follow_ups": config.get("auto_sync_follow_ups", True),
        "needs_reauthorization": bool(config.get("needs_reauthorization")),
    }


@router.put("/preferences")
async def update_calendar_preferences(
    auto_sync_events: Optional[bool] = None,
    auto_sync_follow_ups: Optional[bool] = None,
    user: User = Depends(get_current_user)
):
    """Toggle which entities sync automatically to Google Calendar."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config:
        raise HTTPException(status_code=400, detail="Calendar not connected")
    
    update_data: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if auto_sync_events is not None:
        update_data["auto_sync_events"] = auto_sync_events
    if auto_sync_follow_ups is not None:
        update_data["auto_sync_follow_ups"] = auto_sync_follow_ups
    
    await db[CALENDAR_CONFIG_COLLECTION].update_one(
        {"company_id": user.company_id},
        {"$set": update_data}
    )
    return {"success": True, **update_data}


@router.delete("/disconnect")
async def disconnect_calendar(user: User = Depends(get_current_user)):
    """Disconnect Google Calendar integration.

    Also revokes the refresh_token at Google so a stolen DB copy of a legacy
    plaintext token cannot be reused. Best-effort — never fails the disconnect
    just because Google's revoke endpoint is unreachable.
    """
    # Permission check
    user_role = getattr(user, 'role_id', None)
    if user_role not in [None, "admin", "owner", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can disconnect the calendar")

    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    revoked = False
    if config and config.get("tokens"):
        tokens = _decrypt_tokens(config["tokens"]) or {}
        rt = tokens.get("refresh_token") or tokens.get("access_token")
        if rt:
            try:
                r = requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": rt},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=5,
                )
                revoked = r.status_code in (200, 400)  # 400 = already invalid, treat as revoked
            except Exception as e:
                logger.warning(f"[calendar] revoke failed for {user.company_id}: {_sanitize_error(e)}")

    await db[CALENDAR_CONFIG_COLLECTION].update_one(
        {"company_id": user.company_id},
        {"$set": {
            "is_connected": False,
            "tokens": None,
            "connected_email": None,
            "shared_calendar_id": None,
            "shared_calendar_name": None,
            "needs_reauthorization": False,
            "disconnected_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    await _audit(
        user.company_id, "disconnected",
        user_id=getattr(user, "user_id", None),
        result="success",
        extra={"google_revoked": revoked},
    )
    return {"success": True, "message": "Calendar disconnected", "google_revoked": revoked}


# ==================== CALENDAR MANAGEMENT ====================

async def get_calendar_service(company_id: str):
    """Get an authenticated Google Calendar service for a company."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": company_id})

    if not config or not config.get("is_connected") or not config.get("tokens"):
        return None

    tokens = _decrypt_tokens(config["tokens"])
    if not tokens:
        return None

    creds = Credentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CALENDAR_CLIENT_ID,
        client_secret=GOOGLE_CALENDAR_CLIENT_SECRET,
        scopes=CALENDAR_SCOPES
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            tokens["access_token"] = creds.token
            if creds.expiry:
                tokens["expiry"] = creds.expiry.isoformat()
            # Re-persist the encrypted blob so both tokens + expiry are up-to-date
            # (and legacy-plaintext rows get transparently upgraded to encrypted).
            await _persist_tokens_encrypted(company_id, tokens)
            await _audit(company_id, "token_refreshed", result="success")
        except Exception as e:
            safe = _sanitize_error(e)
            logger.warning(f"[calendar] refresh failed for {company_id}: {safe}")
            await _audit(company_id, "token_refresh_failed", result="error", error=safe)
            # Mark as requiring reauthorization so the tenant UI knows.
            await db[CALENDAR_CONFIG_COLLECTION].update_one(
                {"company_id": company_id},
                {"$set": {"needs_reauthorization": True}},
            )
            return None

    return build("calendar", "v3", credentials=creds)


@router.get("/calendars")
async def list_calendars(user: User = Depends(get_current_user)):
    """List available calendars for selection as shared calendar."""
    service = await get_calendar_service(user.company_id)
    if not service:
        raise HTTPException(status_code=400, detail="Calendar not connected")
    
    try:
        calendars = service.calendarList().list().execute()
        return [
            {
                "id": cal["id"],
                "name": cal.get("summary", cal["id"]),
                "primary": cal.get("primary", False),
                "access_role": cal.get("accessRole")
            }
            for cal in calendars.get("items", [])
            if cal.get("accessRole") in ["owner", "writer"]  # Only calendars we can write to
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list calendars: {str(e)}")


@router.post("/calendars/select")
async def select_shared_calendar(
    calendar_id: str,
    user: User = Depends(get_current_user)
):
    """Select which calendar to use as the shared company calendar."""
    # Permission check
    user_role = getattr(user, 'role_id', None)
    if user_role not in [None, "admin", "owner", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can configure the shared calendar")
    
    service = await get_calendar_service(user.company_id)
    if not service:
        raise HTTPException(status_code=400, detail="Calendar not connected")
    
    try:
        # Verify we have access to this calendar
        cal = service.calendars().get(calendarId=calendar_id).execute()
        
        await db[CALENDAR_CONFIG_COLLECTION].update_one(
            {"company_id": user.company_id},
            {"$set": {
                "shared_calendar_id": calendar_id,
                "shared_calendar_name": cal.get("summary", calendar_id)
            }}
        )
        await _audit(
            user.company_id, "calendar_selected",
            user_id=getattr(user, "user_id", None),
            result="success",
            extra={"calendar_id": calendar_id, "calendar_name": cal.get("summary")},
        )

        return {
            "success": True,
            "calendar_id": calendar_id,
            "calendar_name": cal.get("summary")
        }
    except Exception as e:
        safe = _sanitize_error(e)
        await _audit(user.company_id, "calendar_selected", result="error", error=safe)
        raise HTTPException(status_code=400, detail=f"Cannot access calendar: {safe}")


@router.post("/calendars/create")
async def create_shared_calendar(
    name: str = Query(..., description="Name for the new shared calendar"),
    user: User = Depends(get_current_user)
):
    """Create a new calendar to use as the shared company calendar."""
    # Permission check
    user_role = getattr(user, 'role_id', None)
    if user_role not in [None, "admin", "owner", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can create calendars")
    
    service = await get_calendar_service(user.company_id)
    if not service:
        raise HTTPException(status_code=400, detail="Calendar not connected")
    
    try:
        # Create the calendar
        cal = service.calendars().insert(body={
            "summary": name,
            "description": "Kora CRM Follow-ups Calendar"
        }).execute()
        
        # Set as shared calendar
        await db[CALENDAR_CONFIG_COLLECTION].update_one(
            {"company_id": user.company_id},
            {"$set": {
                "shared_calendar_id": cal["id"],
                "shared_calendar_name": cal.get("summary", name)
            }}
        )
        
        return {
            "success": True,
            "calendar_id": cal["id"],
            "calendar_name": cal.get("summary")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create calendar: {str(e)}")


# ==================== EVENT SYNC ====================

@router.post("/sync/follow-up")
async def sync_follow_up_to_calendar(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """
    Sync a follow-up to Google Calendar.
    Creates or updates a calendar event for the follow-up.
    """
    # Get calendar config
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config or not config.get("is_connected") or not config.get("shared_calendar_id"):
        raise HTTPException(status_code=400, detail="Calendar not configured. Connect and select a calendar first.")
    
    calendar_id = config["shared_calendar_id"]
    
    # Get the entity (lead or client)
    if entity_type == "lead":
        entity = await db.leads.find_one({"lead_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        entity_name = entity.get("company_name") or entity.get("lead_name") or entity.get("contact_name") if entity else None
    elif entity_type == "client":
        entity = await db.clients.find_one({"client_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        entity_name = entity.get("display_name") or entity.get("company_name") if entity else None
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type.capitalize()} not found")
    
    follow_up_date = entity.get("next_follow_up_date")
    follow_up_type = entity.get("follow_up_type", "Call")
    
    if not follow_up_date:
        raise HTTPException(status_code=400, detail="No follow-up date set for this entity")
    
    # Get service
    service = await get_calendar_service(user.company_id)
    if not service:
        raise HTTPException(status_code=400, detail="Calendar connection expired. Please reconnect.")
    
    # Build event
    event_summary = f"[{follow_up_type}] {entity_name}"
    event_description = f"CRM Follow-up: {entity_type.capitalize()}\nType: {follow_up_type}"
    if entity.get("email"):
        event_description += f"\nEmail: {entity['email']}"
    if entity.get("phone"):
        event_description += f"\nPhone: {entity['phone']}"
    
    # Parse date (assume date only, create 30-min event at 9am)
    try:
        date_obj = datetime.strptime(follow_up_date, "%Y-%m-%d")
        start_time = date_obj.replace(hour=9, minute=0)
        end_time = start_time + timedelta(minutes=30)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid follow-up date format")
    
    event_body = {
        "summary": event_summary,
        "description": event_description,
        "start": {
            "dateTime": start_time.isoformat(),
            "timeZone": "America/Santo_Domingo"  # Default timezone
        },
        "end": {
            "dateTime": end_time.isoformat(),
            "timeZone": "America/Santo_Domingo"
        },
        "extendedProperties": {
            "private": {
                "kora_entity_type": entity_type,
                "kora_entity_id": entity_id,
                "kora_company_id": user.company_id
            }
        }
    }
    
    try:
        # Check if event already exists
        existing_event_id = entity.get("calendar_event_id")
        
        if existing_event_id:
            # Update existing event
            event = service.events().update(
                calendarId=calendar_id,
                eventId=existing_event_id,
                body=event_body
            ).execute()
        else:
            # Create new event
            event = service.events().insert(
                calendarId=calendar_id,
                body=event_body
            ).execute()
            
            # Save event ID to entity
            collection = db.leads if entity_type == "lead" else db.clients
            id_field = "lead_id" if entity_type == "lead" else "client_id"
            await collection.update_one(
                {id_field: entity_id},
                {"$set": {"calendar_event_id": event["id"]}}
            )
        
        return {
            "success": True,
            "event_id": event["id"],
            "event_link": event.get("htmlLink"),
            "action": "updated" if existing_event_id else "created"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync event: {str(e)}")


@router.delete("/sync/follow-up")
async def remove_follow_up_from_calendar(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a follow-up event from Google Calendar."""
    # Get calendar config
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config or not config.get("shared_calendar_id"):
        return {"success": True, "message": "No calendar configured"}
    
    calendar_id = config["shared_calendar_id"]
    
    # Get the entity
    if entity_type == "lead":
        entity = await db.leads.find_one({"lead_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        collection = db.leads
        id_field = "lead_id"
    elif entity_type == "client":
        entity = await db.clients.find_one({"client_id": entity_id, "company_id": user.company_id}, {"_id": 0})
        collection = db.clients
        id_field = "client_id"
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    event_id = entity.get("calendar_event_id")
    if not event_id:
        return {"success": True, "message": "No calendar event linked"}
    
    service = await get_calendar_service(user.company_id)
    if service:
        try:
            service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        except Exception as e:
            print(f"Failed to delete calendar event: {e}")
    
    # Remove event ID from entity
    await collection.update_one(
        {id_field: entity_id},
        {"$unset": {"calendar_event_id": ""}}
    )
    
    return {"success": True, "message": "Event removed from calendar"}


# ==================== AUTO-SYNC HELPERS ====================

async def auto_sync_follow_up(company_id: str, entity_type: str, entity_id: str, entity: dict):
    """
    Automatically sync a follow-up to calendar when created/updated.
    Called from CRM endpoints.
    """
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": company_id})
    if not config or not config.get("is_connected") or not config.get("shared_calendar_id"):
        return  # Calendar not configured, skip silently
    
    if not entity.get("next_follow_up_date"):
        # No follow-up date, remove from calendar if exists
        if entity.get("calendar_event_id"):
            service = await get_calendar_service(company_id)
            if service:
                try:
                    service.events().delete(
                        calendarId=config["shared_calendar_id"],
                        eventId=entity["calendar_event_id"]
                    ).execute()
                except:
                    pass
            # Clear event ID
            collection = db.leads if entity_type == "lead" else db.clients
            id_field = "lead_id" if entity_type == "lead" else "client_id"
            await collection.update_one({id_field: entity_id}, {"$unset": {"calendar_event_id": ""}})
        return
    
    # Sync the follow-up
    service = await get_calendar_service(company_id)
    if not service:
        return
    
    entity_name = entity.get("company_name") or entity.get("lead_name") or entity.get("contact_name") or entity.get("display_name") or "Unknown"
    follow_up_type = entity.get("follow_up_type", "Call")
    follow_up_date = entity.get("next_follow_up_date")
    
    try:
        date_obj = datetime.strptime(follow_up_date, "%Y-%m-%d")
        start_time = date_obj.replace(hour=9, minute=0)
        end_time = start_time + timedelta(minutes=30)
    except:
        return
    
    # Color follow-ups distinctly from events so the calendar doesn't feel
    # like a monochrome sea. Leads = lavender, Clients = grape.
    fu_color = "1" if entity_type == "lead" else "3"

    event_body = {
        "summary": f"📞 [{follow_up_type}] {entity_name}",
        "description": f"CRM Follow-up: {entity_type.capitalize()}",
        "colorId": fu_color,
        "start": {"dateTime": start_time.isoformat(), "timeZone": "America/Santo_Domingo"},
        "end": {"dateTime": end_time.isoformat(), "timeZone": "America/Santo_Domingo"},
        "extendedProperties": {
            "private": {
                "kora_entity_type": entity_type,
                "kora_entity_id": entity_id,
                "kora_company_id": company_id
            }
        }
    }
    
    try:
        existing_event_id = entity.get("calendar_event_id")
        if existing_event_id:
            event = service.events().update(
                calendarId=config["shared_calendar_id"],
                eventId=existing_event_id,
                body=event_body
            ).execute()
        else:
            event = service.events().insert(
                calendarId=config["shared_calendar_id"],
                body=event_body
            ).execute()
            
            collection = db.leads if entity_type == "lead" else db.clients
            id_field = "lead_id" if entity_type == "lead" else "client_id"
            await collection.update_one({id_field: entity_id}, {"$set": {"calendar_event_id": event["id"]}})
    except Exception as e:
        print(f"Auto-sync to calendar failed: {e}")


# ==================== CATERING EVENTS (engagements) ====================

def _stage_to_calendar_meta(event: dict) -> Tuple[str, str, str]:
    """Map a Kora event's stage / operational_status to Google Calendar
    `colorId`, a short prefix, and a human-readable stage label.

    Returns (color_id, prefix, label) so the calendar entry visually
    communicates the sales/operational status of the event at a glance.

    Google Calendar color IDs used:
      * 10  Basil (dark green)  → confirmed / committed / won
      * 5   Banana (yellow)     → in negotiation / definition_review / proposal
      * 8   Graphite (gray)     → early inquiries / drafts
      * 11  Tomato (red)        → cancelled / lost / archived
      * 7   Peacock (blue)      → in-progress / operational (default fallback)
    """
    stage_raw = (event.get("stage") or "").strip().lower()
    op_raw = (event.get("operational_status") or "").strip().lower()

    # Cancelled / lost / archived → red (highest priority — status always wins)
    if op_raw in ("cancelled", "canceled") or stage_raw in ("archived", "lost", "cancelled"):
        return ("11", "[CANCELADO]", "Cancelado")

    # Closed → dark green with "CERRADO" label
    if op_raw == "closed":
        return ("10", "[CERRADO]", "Cerrado")

    # Actively in production takes visual priority over "confirmed"
    if op_raw in ("in_progress", "in progress", "active"):
        return ("7", "[EN CURSO]", "En Curso")

    # Confirmed / won / committed → green
    if stage_raw in ("committed", "won", "closed", "confirmed"):
        return ("10", "[CONFIRMADO]", "Confirmado")

    # Definition review / proposal / negotiation → yellow (quoted)
    if stage_raw in ("definition_review", "proposal", "negotiation", "quoted", "scope_drafted"):
        return ("5", "[COTIZADO]", "Cotizado")

    # Early-stage inquiries → gray
    if stage_raw in ("inquiry_received", "context_captured", "lead", "discovery", "draft"):
        return ("8", "[BORRADOR]", "Borrador")

    # Anything unmapped → blue (safe neutral)
    return ("7", "[EVENTO]", stage_raw.replace("_", " ").title() or "Evento")


def _event_to_calendar_body(event: dict, client_name: Optional[str] = None) -> Optional[dict]:
    """Builds a Google Calendar event body from a Kora catering event document.
    Returns None if the event has no scheduling info (TBD / no date)."""
    if event.get("event_date_tbd"):
        return None
    
    name = event.get("name") or "Kora Event"
    event_type = event.get("event_type") or "Event"
    venue = event.get("venue")
    guest_count = event.get("guest_count")
    start_time_str = event.get("start_time")  # "HH:MM"
    end_time_str = event.get("end_time")
    event_date = event.get("event_date")
    end_date = event.get("end_date")
    
    if not event_date:
        return None
    
    # Parse event_date (datetime or ISO string)
    if isinstance(event_date, str):
        try:
            event_date = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
        except ValueError:
            return None
    
    # Construct start
    if start_time_str:
        try:
            hh, mm = [int(x) for x in start_time_str.split(":")[:2]]
            start_dt = event_date.replace(hour=hh, minute=mm, second=0, microsecond=0, tzinfo=None)
        except (ValueError, AttributeError):
            start_dt = event_date.replace(hour=12, minute=0, second=0, microsecond=0, tzinfo=None)
    else:
        start_dt = event_date.replace(hour=12, minute=0, second=0, microsecond=0, tzinfo=None)
    
    # Construct end
    if end_date and isinstance(end_date, str):
        try:
            end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            end_date = None
    
    if end_time_str:
        try:
            hh, mm = [int(x) for x in end_time_str.split(":")[:2]]
            base = end_date if end_date else event_date
            end_dt = base.replace(hour=hh, minute=mm, second=0, microsecond=0, tzinfo=None)
        except (ValueError, AttributeError):
            end_dt = start_dt + timedelta(hours=4)
    elif end_date:
        end_dt = end_date.replace(hour=18, minute=0, second=0, microsecond=0, tzinfo=None)
    else:
        end_dt = start_dt + timedelta(hours=4)
    
    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(hours=4)
    
    # Determine visual encoding for this event's stage/status
    color_id, prefix, stage_label = _stage_to_calendar_meta(event)

    # Description
    desc_lines = [f"Kora OS — {event_type}"]
    desc_lines.append(f"Estado: {stage_label}")
    if client_name:
        desc_lines.append(f"Client: {client_name}")
    if guest_count:
        desc_lines.append(f"Guests: {guest_count}")
    if event.get("budget"):
        desc_lines.append(f"Budget: {event.get('budget')}")
    if event.get("scope_summary"):
        desc_lines.append("")
        desc_lines.append(event["scope_summary"])

    return {
        "summary": f"{prefix} [{event_type}] {name}",
        "description": "\n".join(desc_lines),
        "location": venue or "",
        "colorId": color_id,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "America/Santo_Domingo"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "America/Santo_Domingo"},
        "extendedProperties": {
            "private": {
                "kora_entity_type": "event",
                "kora_entity_id": event.get("event_id", ""),
                "kora_company_id": event.get("company_id", ""),
                "kora_stage": (event.get("stage") or "").lower(),
                "kora_operational_status": (event.get("operational_status") or "").lower(),
            }
        }
    }


@router.post("/sync/event")
async def sync_event_to_calendar(
    event_id: str,
    user: User = Depends(get_current_user)
):
    """Manually sync a catering event to Google Calendar. Creates or updates the event."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config or not config.get("is_connected") or not config.get("shared_calendar_id"):
        raise HTTPException(status_code=400, detail="Calendar not configured. Connect and select a calendar first.")
    
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get client name (denormalize for description)
    client_name = None
    if event.get("client_id"):
        client_doc = await db.clients.find_one(
            {"client_id": event["client_id"], "company_id": user.company_id},
            {"_id": 0, "display_name": 1, "company_name": 1}
        )
        if client_doc:
            client_name = client_doc.get("display_name") or client_doc.get("company_name")
    
    body = _event_to_calendar_body(event, client_name)
    if not body:
        raise HTTPException(status_code=400, detail="Event has no scheduled date (TBD) and cannot be synced.")
    
    service = await get_calendar_service(user.company_id)
    if not service:
        raise HTTPException(status_code=400, detail="Calendar connection expired. Please reconnect.")
    
    try:
        existing_event_id = event.get("calendar_event_id")
        if existing_event_id:
            gevent = service.events().update(
                calendarId=config["shared_calendar_id"],
                eventId=existing_event_id,
                body=body
            ).execute()
            action = "updated"
        else:
            gevent = service.events().insert(
                calendarId=config["shared_calendar_id"],
                body=body
            ).execute()
            await db.events.update_one(
                {"event_id": event_id},
                {"$set": {"calendar_event_id": gevent["id"]}}
            )
            action = "created"
        
        return {
            "success": True,
            "event_id": gevent["id"],
            "event_link": gevent.get("htmlLink"),
            "action": action,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync event: {str(e)}")


@router.delete("/sync/event")
async def remove_event_from_calendar(
    event_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a catering event from Google Calendar (without deleting the Kora event)."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": user.company_id})
    if not config or not config.get("shared_calendar_id"):
        return {"success": True, "message": "No calendar configured"}
    
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "calendar_event_id": 1}
    )
    if not event or not event.get("calendar_event_id"):
        return {"success": True, "message": "Not synced"}
    
    service = await get_calendar_service(user.company_id)
    if not service:
        return {"success": False, "message": "Calendar connection expired"}
    
    try:
        service.events().delete(
            calendarId=config["shared_calendar_id"],
            eventId=event["calendar_event_id"]
        ).execute()
    except Exception as e:
        print(f"Calendar delete failed (ignored): {e}")
    
    await db.events.update_one(
        {"event_id": event_id},
        {"$unset": {"calendar_event_id": ""}}
    )
    return {"success": True, "action": "removed"}


# ==================== AUTO-SYNC HELPER (call from server.py event endpoints) ====================

async def auto_sync_event(company_id: str, event_id: str, action: str = "upsert", calendar_event_id_hint: Optional[str] = None):
    """Auto-sync a catering event to Google Calendar. Silently no-ops if calendar not configured.
    Use from create_event / update_event / delete_event in server.py.
    
    action: 'upsert' (create or update) | 'delete'
    calendar_event_id_hint: pass the calendar_event_id directly when the Kora event has already
        been deleted from db.events (so we can still remove it from Google Calendar).
    """
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": company_id})
    if not config or not config.get("is_connected") or not config.get("shared_calendar_id"):
        return
    if not config.get("auto_sync_events", True):
        # User can disable auto-sync via settings
        return
    
    event = await db.events.find_one({"event_id": event_id, "company_id": company_id}, {"_id": 0})
    
    # For deletions the event may already be gone — fall back to the hint.
    if action == "delete" and not event:
        if not calendar_event_id_hint:
            return
        service = await get_calendar_service(company_id)
        if not service:
            return
        try:
            service.events().delete(calendarId=config["shared_calendar_id"], eventId=calendar_event_id_hint).execute()
        except Exception as e:
            print(f"Auto-sync orphan delete failed: {e}")
        return
    
    if not event:
        return
    
    service = await get_calendar_service(company_id)
    if not service:
        return
    
    calendar_id = config["shared_calendar_id"]
    existing_event_id = event.get("calendar_event_id") or calendar_event_id_hint
    
    # Delete branch
    if action == "delete":
        if existing_event_id:
            try:
                service.events().delete(calendarId=calendar_id, eventId=existing_event_id).execute()
            except Exception as e:
                print(f"Auto-sync delete failed: {e}")
            await db.events.update_one(
                {"event_id": event_id},
                {"$unset": {"calendar_event_id": ""}}
            )
        return
    
    # Upsert
    client_name = None
    if event.get("client_id"):
        client_doc = await db.clients.find_one(
            {"client_id": event["client_id"], "company_id": company_id},
            {"_id": 0, "display_name": 1, "company_name": 1}
        )
        if client_doc:
            client_name = client_doc.get("display_name") or client_doc.get("company_name")
    
    body = _event_to_calendar_body(event, client_name)
    if not body:
        # TBD event: if it was synced before, remove it from calendar
        if existing_event_id:
            try:
                service.events().delete(calendarId=calendar_id, eventId=existing_event_id).execute()
            except Exception:
                pass
            await db.events.update_one({"event_id": event_id}, {"$unset": {"calendar_event_id": ""}})
        return
    
    try:
        if existing_event_id:
            service.events().update(calendarId=calendar_id, eventId=existing_event_id, body=body).execute()
        else:
            gevent = service.events().insert(calendarId=calendar_id, body=body).execute()
            await db.events.update_one(
                {"event_id": event_id},
                {"$set": {"calendar_event_id": gevent["id"]}}
            )
    except Exception as e:
        print(f"Auto-sync event failed: {e}")
