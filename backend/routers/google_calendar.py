# routers/google_calendar.py - Google Calendar Integration for CRM Follow-ups
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import RedirectResponse
import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

from config import db
from dependencies import get_current_user
from models.auth import User

router = APIRouter(prefix="/oauth/calendar", tags=["Google Calendar"])

# Environment variables
GOOGLE_CALENDAR_CLIENT_ID = os.environ.get("GOOGLE_CALENDAR_CLIENT_ID")
GOOGLE_CALENDAR_CLIENT_SECRET = os.environ.get("GOOGLE_CALENDAR_CLIENT_SECRET")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://ourkora.com")

# Scopes for Calendar API
CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Collection for storing calendar config
CALENDAR_CONFIG_COLLECTION = "calendar_config"


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
    
    # Store state for security
    state = f"{user.company_id}:{uuid.uuid4().hex[:16]}"
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
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error={error}")
    
    # Validate state and get company_id
    company_id = state.split(":")[0] if ":" in state else None
    if not company_id:
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error=invalid_state")
    
    # Get stored config
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": company_id})
    if not config or config.get("oauth_state") != state:
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
            return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error={tokens.get('error_description', tokens['error'])}")
        
        # Get user info to identify the account
        user_info = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"}
        ).json()
        
        # Save tokens and config
        now = datetime.now(timezone.utc)
        await db[CALENDAR_CONFIG_COLLECTION].update_one(
            {"company_id": company_id},
            {"$set": {
                "tokens": tokens,
                "connected_email": user_info.get("email"),
                "connected_at": now.isoformat(),
                "is_connected": True,
                "oauth_state": None  # Clear state after use
            }}
        )
        
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_connected=true")
        
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/settings?calendar_error={str(e)}")


@router.get("/status")
async def get_calendar_status(user: User = Depends(get_current_user)):
    """Get the current Google Calendar connection status for the company."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one(
        {"company_id": user.company_id},
        {"_id": 0, "tokens": 0, "oauth_state": 0}  # Don't expose sensitive data
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
        "shared_calendar_id": config.get("shared_calendar_id"),
        "shared_calendar_name": config.get("shared_calendar_name"),
        "auto_sync_events": config.get("auto_sync_events", True),
        "auto_sync_follow_ups": config.get("auto_sync_follow_ups", True),
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
    """Disconnect Google Calendar integration."""
    # Permission check
    user_role = getattr(user, 'role_id', None)
    if user_role not in [None, "admin", "owner", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can disconnect the calendar")
    
    await db[CALENDAR_CONFIG_COLLECTION].update_one(
        {"company_id": user.company_id},
        {"$set": {
            "is_connected": False,
            "tokens": None,
            "connected_email": None,
            "shared_calendar_id": None,
            "shared_calendar_name": None
        }}
    )
    
    return {"success": True, "message": "Calendar disconnected"}


# ==================== CALENDAR MANAGEMENT ====================

async def get_calendar_service(company_id: str):
    """Get an authenticated Google Calendar service for a company."""
    config = await db[CALENDAR_CONFIG_COLLECTION].find_one({"company_id": company_id})
    
    if not config or not config.get("is_connected") or not config.get("tokens"):
        return None
    
    tokens = config["tokens"]
    
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
            # Save new access token
            await db[CALENDAR_CONFIG_COLLECTION].update_one(
                {"company_id": company_id},
                {"$set": {"tokens.access_token": creds.token}}
            )
        except Exception as e:
            print(f"Failed to refresh token: {e}")
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
        
        return {
            "success": True,
            "calendar_id": calendar_id,
            "calendar_name": cal.get("summary")
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot access calendar: {str(e)}")


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
    
    event_body = {
        "summary": f"[{follow_up_type}] {entity_name}",
        "description": f"CRM Follow-up: {entity_type.capitalize()}",
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
    
    # Description
    desc_lines = [f"Kora OS — {event_type}"]
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
        "summary": f"[{event_type}] {name}",
        "description": "\n".join(desc_lines),
        "location": venue or "",
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "America/Santo_Domingo"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "America/Santo_Domingo"},
        "extendedProperties": {
            "private": {
                "kora_entity_type": "event",
                "kora_entity_id": event.get("event_id", ""),
                "kora_company_id": event.get("company_id", ""),
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
