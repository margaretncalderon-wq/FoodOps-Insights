from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone
from config import db
from models.auth import User
from routers.auth import get_current_user
import uuid
import re

guest_flow_router = APIRouter(prefix="/guest-flow", tags=["Guest Flow"])

# --- Helpers ---

def normalize_whatsapp(number: str) -> str:
    """Normalize WhatsApp number. Support DR (+1-809/829/849) and international."""
    digits = re.sub(r"[^\d]", "", number)
    # Dominican Republic: 809, 829, 849
    if len(digits) == 10 and digits[:3] in ("809", "829", "849"):
        return f"1{digits}"
    if len(digits) == 11 and digits[0] == "1" and digits[1:4] in ("809", "829", "849"):
        return digits
    # If already has country code (10+ digits), keep as is
    if len(digits) >= 10:
        return digits
    return digits


def format_whatsapp_link(number: str, message: str) -> str:
    """Generate WhatsApp click-to-chat link."""
    normalized = normalize_whatsapp(number)
    encoded_msg = message.replace(" ", "%20").replace("\n", "%0A")
    return f"https://wa.me/{normalized}?text={encoded_msg}"


# ============================================================
# ACTIVATION ENDPOINTS (Staff - Auth Required)
# ============================================================

@guest_flow_router.post("/activations")
async def create_activation(data: dict, user: User = Depends(get_current_user)):
    """Create a new activation for an event."""
    now = datetime.now(timezone.utc)
    activation_id = f"act_{uuid.uuid4().hex[:12]}"
    company_id = user.company_id or user.active_org_id

    activation = {
        "activation_id": activation_id,
        "event_id": data.get("event_id"),
        "company_id": company_id,
        "activation_name": data.get("activation_name", ""),
        "activation_type": data.get("activation_type", "photo_booth"),
        "date": data.get("date"),
        "status": "active",
        "queue_status": "inactive",
        "average_service_time": data.get("average_service_time", 3),
        "assigned_queue_manager": data.get("assigned_queue_manager"),
        "current_queue_number": 0,
        "now_serving_number": 0,
        "now_serving_entry_id": None,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }

    await db.gf_activations.insert_one(activation)
    activation.pop("_id", None)
    return activation


@guest_flow_router.get("/activations")
async def get_activations(
    event_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user)
):
    """Get activations for an event or all activations."""
    company_id = user.company_id or user.active_org_id
    query = {"company_id": company_id}
    if event_id:
        query["event_id"] = event_id

    activations = await db.gf_activations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return activations


@guest_flow_router.get("/activations/{activation_id}")
async def get_activation(activation_id: str, user: User = Depends(get_current_user)):
    """Get a single activation."""
    activation = await db.gf_activations.find_one({"activation_id": activation_id}, {"_id": 0})
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")
    return activation


@guest_flow_router.put("/activations/{activation_id}")
async def update_activation(activation_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update an activation."""
    now = datetime.now(timezone.utc)
    allowed = ["activation_name", "activation_type", "date", "status", "queue_status",
               "average_service_time", "assigned_queue_manager"]
    updates = {k: v for k, v in data.items() if k in allowed}
    updates["updated_at"] = now.isoformat()

    await db.gf_activations.update_one({"activation_id": activation_id}, {"$set": updates})
    return await db.gf_activations.find_one({"activation_id": activation_id}, {"_id": 0})


@guest_flow_router.post("/activations/{activation_id}/queue-action")
async def queue_action(activation_id: str, data: dict, user: User = Depends(get_current_user)):
    """Perform queue actions: activate, pause, resume, close, reset."""
    action = data.get("action")
    now = datetime.now(timezone.utc)

    activation = await db.gf_activations.find_one({"activation_id": activation_id}, {"_id": 0})
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")

    status_map = {
        "activate": "active",
        "pause": "paused",
        "resume": "active",
        "close": "closed"
    }

    if action == "reset":
        await db.gf_queue_entries.update_many(
            {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up"]}},
            {"$set": {"status": "canceled", "canceled_at": now.isoformat()}}
        )
        await db.gf_activations.update_one(
            {"activation_id": activation_id},
            {"$set": {"queue_status": "inactive", "current_queue_number": 0,
                      "now_serving_number": 0, "now_serving_entry_id": None, "updated_at": now.isoformat()}}
        )
        await _log_activity(activation_id, None, "queue_reset", user.user_id)
        return {"success": True, "queue_status": "inactive"}

    new_status = status_map.get(action)
    if not new_status:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    await db.gf_activations.update_one(
        {"activation_id": activation_id},
        {"$set": {"queue_status": new_status, "updated_at": now.isoformat()}}
    )
    await _log_activity(activation_id, None, f"queue_{action}", user.user_id)
    return {"success": True, "queue_status": new_status}


# ============================================================
# QUEUE ENTRY ENDPOINTS (Staff - Auth Required)
# ============================================================

@guest_flow_router.get("/activations/{activation_id}/queue")
async def get_queue(activation_id: str, status: Optional[str] = Query(None), user: User = Depends(get_current_user)):
    """Get queue entries for an activation."""
    query = {"activation_id": activation_id}
    if status:
        query["status"] = status
    entries = await db.gf_queue_entries.find(query, {"_id": 0}).sort("current_position", 1).to_list(500)
    return entries


@guest_flow_router.post("/activations/{activation_id}/call-next")
async def call_next(activation_id: str, user: User = Depends(get_current_user)):
    """Mark current as completed, call next guest."""
    now = datetime.now(timezone.utc)

    # Complete current serving
    current = await db.gf_queue_entries.find_one(
        {"activation_id": activation_id, "status": "now_serving"}, {"_id": 0}
    )
    if current:
        await db.gf_queue_entries.update_one(
            {"entry_id": current["entry_id"]},
            {"$set": {"status": "completed", "completed_at": now.isoformat()}}
        )
        await _log_activity(activation_id, current["entry_id"], "completed", user.user_id)

    # Find next waiting/almost_up guest
    next_guest = await db.gf_queue_entries.find_one(
        {"activation_id": activation_id, "status": {"$in": ["almost_up", "waiting"]}},
        {"_id": 0},
        sort=[("current_position", 1)]
    )

    if next_guest:
        await db.gf_queue_entries.update_one(
            {"entry_id": next_guest["entry_id"]},
            {"$set": {"status": "now_serving", "now_serving_at": now.isoformat()}}
        )
        await db.gf_activations.update_one(
            {"activation_id": activation_id},
            {"$set": {"now_serving_number": next_guest["queue_number"],
                      "now_serving_entry_id": next_guest["entry_id"], "updated_at": now.isoformat()}}
        )
        await _log_activity(activation_id, next_guest["entry_id"], "now_serving", user.user_id)

        # Mark the one after as almost_up
        after_next = await db.gf_queue_entries.find_one(
            {"activation_id": activation_id, "status": "waiting",
             "current_position": {"$gt": next_guest["current_position"]}},
            {"_id": 0},
            sort=[("current_position", 1)]
        )
        if after_next:
            await db.gf_queue_entries.update_one(
                {"entry_id": after_next["entry_id"]},
                {"$set": {"status": "almost_up", "almost_up_at": now.isoformat()}}
            )

        return {"success": True, "now_serving": next_guest}

    # No more guests
    await db.gf_activations.update_one(
        {"activation_id": activation_id},
        {"$set": {"now_serving_number": 0, "now_serving_entry_id": None, "updated_at": now.isoformat()}}
    )
    return {"success": True, "now_serving": None, "message": "Queue empty"}


@guest_flow_router.post("/queue/{entry_id}/action")
async def entry_action(entry_id: str, data: dict, user: User = Depends(get_current_user)):
    """Perform action on a queue entry: almost_up, complete, cancel, readd, move_up, move_down."""
    action = data.get("action")
    now = datetime.now(timezone.utc)

    entry = await db.gf_queue_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    activation_id = entry["activation_id"]

    if action == "almost_up":
        await db.gf_queue_entries.update_one(
            {"entry_id": entry_id},
            {"$set": {"status": "almost_up", "almost_up_at": now.isoformat()}}
        )

    elif action == "now_serving":
        # First complete any current serving
        await db.gf_queue_entries.update_many(
            {"activation_id": activation_id, "status": "now_serving"},
            {"$set": {"status": "completed", "completed_at": now.isoformat()}}
        )
        await db.gf_queue_entries.update_one(
            {"entry_id": entry_id},
            {"$set": {"status": "now_serving", "now_serving_at": now.isoformat()}}
        )
        await db.gf_activations.update_one(
            {"activation_id": activation_id},
            {"$set": {"now_serving_number": entry["queue_number"],
                      "now_serving_entry_id": entry_id, "updated_at": now.isoformat()}}
        )

    elif action == "complete":
        await db.gf_queue_entries.update_one(
            {"entry_id": entry_id},
            {"$set": {"status": "completed", "completed_at": now.isoformat()}}
        )
        if entry.get("status") == "now_serving":
            await db.gf_activations.update_one(
                {"activation_id": activation_id},
                {"$set": {"now_serving_number": 0, "now_serving_entry_id": None}}
            )

    elif action == "cancel":
        await db.gf_queue_entries.update_one(
            {"entry_id": entry_id},
            {"$set": {"status": "canceled", "canceled_at": now.isoformat()}}
        )
        # Recalculate positions
        await _recalculate_positions(activation_id)

    elif action == "readd":
        # Re-add at end of queue
        activation = await db.gf_activations.find_one({"activation_id": activation_id})
        last_pos = await db.gf_queue_entries.count_documents(
            {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up", "now_serving"]}}
        )
        await db.gf_queue_entries.update_one(
            {"entry_id": entry_id},
            {"$set": {"status": "waiting", "current_position": last_pos + 1,
                      "canceled_at": None, "completed_at": None}}
        )

    elif action == "move_up":
        pos = entry.get("current_position", 0)
        if pos > 1:
            above = await db.gf_queue_entries.find_one(
                {"activation_id": activation_id, "current_position": pos - 1,
                 "status": {"$in": ["waiting", "almost_up"]}}, {"_id": 0}
            )
            if above:
                await db.gf_queue_entries.update_one({"entry_id": entry_id}, {"$set": {"current_position": pos - 1}})
                await db.gf_queue_entries.update_one({"entry_id": above["entry_id"]}, {"$set": {"current_position": pos}})

    elif action == "move_down":
        pos = entry.get("current_position", 0)
        below = await db.gf_queue_entries.find_one(
            {"activation_id": activation_id, "current_position": pos + 1,
             "status": {"$in": ["waiting", "almost_up"]}}, {"_id": 0}
        )
        if below:
            await db.gf_queue_entries.update_one({"entry_id": entry_id}, {"$set": {"current_position": pos + 1}})
            await db.gf_queue_entries.update_one({"entry_id": below["entry_id"]}, {"$set": {"current_position": pos}})

    elif action == "update_notes":
        await db.gf_queue_entries.update_one(
            {"entry_id": entry_id}, {"$set": {"notes": data.get("notes", "")}}
        )

    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    await _log_activity(activation_id, entry_id, action, user.user_id, data.get("note"))

    updated = await db.gf_queue_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    return updated


@guest_flow_router.post("/queue/{entry_id}/whatsapp-link")
async def get_whatsapp_link(entry_id: str, data: dict, user: User = Depends(get_current_user)):
    """Generate WhatsApp click-to-chat link for a guest."""
    entry = await db.gf_queue_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    message_type = data.get("message_type", "next")
    first_name = entry.get("first_name") or entry.get("guest_name", "").split(" ")[0]

    messages = {
        "next": f"Hola {first_name}! Es tu turno en la activacion. Por favor acercate ahora.",
        "almost": f"Hola {first_name}! Estas a 2 turnos. Por favor mantente cerca.",
        "passed": f"Hola {first_name}! Tu turno ha pasado. Si aun estas interesado/a, por favor regresa al booth y nuestro equipo te asistira."
    }

    message = messages.get(message_type, messages["next"])
    link = format_whatsapp_link(entry["whatsapp_number"], message)
    return {"link": link, "message": message}


# ============================================================
# PUBLIC ENDPOINTS (No Auth - Guest Facing)
# ============================================================

@guest_flow_router.get("/public/activation/{activation_id}")
async def public_get_activation(activation_id: str):
    """Public: Get activation info for guest join page."""
    activation = await db.gf_activations.find_one(
        {"activation_id": activation_id},
        {"_id": 0, "activation_id": 1, "activation_name": 1, "queue_status": 1,
         "average_service_time": 1, "now_serving_number": 1, "activation_type": 1}
    )
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")

    # Count active queue
    total_waiting = await db.gf_queue_entries.count_documents(
        {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up"]}}
    )
    activation["total_in_queue"] = total_waiting
    return activation


@guest_flow_router.post("/public/join/{activation_id}")
async def public_join_queue(activation_id: str, data: dict):
    """Public: Guest joins the queue."""
    activation = await db.gf_activations.find_one({"activation_id": activation_id}, {"_id": 0})
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")

    if activation.get("queue_status") not in ("active",):
        raise HTTPException(status_code=400, detail="La cola no esta activa en este momento")

    guest_name = data.get("guest_name", "").strip()
    whatsapp = data.get("whatsapp_number", "").strip()
    group_size = data.get("group_size", 1)

    if not guest_name or not whatsapp:
        raise HTTPException(status_code=400, detail="Nombre y WhatsApp son requeridos")

    normalized = normalize_whatsapp(whatsapp)

    # Check duplicate
    existing = await db.gf_queue_entries.find_one({
        "activation_id": activation_id,
        "normalized_whatsapp_number": normalized,
        "status": {"$in": ["waiting", "almost_up", "now_serving"]}
    })
    if existing:
        return {"duplicate": True, "entry_id": existing["entry_id"],
                "queue_number": existing["queue_number"], "message": "Ya estas en la cola"}

    now = datetime.now(timezone.utc)
    entry_id = f"qe_{uuid.uuid4().hex[:12]}"

    # Assign next queue number
    new_number = (activation.get("current_queue_number") or 0) + 1
    await db.gf_activations.update_one(
        {"activation_id": activation_id},
        {"$set": {"current_queue_number": new_number, "updated_at": now.isoformat()}}
    )

    # Calculate position
    active_count = await db.gf_queue_entries.count_documents(
        {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up", "now_serving"]}}
    )

    first_name = guest_name.split(" ")[0] if guest_name else ""

    entry = {
        "entry_id": entry_id,
        "activation_id": activation_id,
        "guest_name": guest_name,
        "first_name": first_name,
        "whatsapp_number": whatsapp,
        "normalized_whatsapp_number": normalized,
        "group_size": group_size,
        "queue_number": new_number,
        "current_position": active_count + 1,
        "status": "waiting",
        "notes": "",
        "joined_at": now.isoformat(),
        "almost_up_at": None,
        "now_serving_at": None,
        "completed_at": None,
        "canceled_at": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }

    await db.gf_queue_entries.insert_one(entry)
    entry.pop("_id", None)

    await _log_activity(activation_id, entry_id, "joined", "guest")

    return {
        "entry_id": entry_id,
        "queue_number": new_number,
        "position": active_count + 1,
        "people_ahead": active_count,
        "estimated_wait": active_count * activation.get("average_service_time", 3)
    }


@guest_flow_router.get("/public/status/{entry_id}")
async def public_queue_status(entry_id: str):
    """Public: Guest checks their queue status."""
    entry = await db.gf_queue_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    activation = await db.gf_activations.find_one(
        {"activation_id": entry["activation_id"]},
        {"_id": 0, "activation_name": 1, "queue_status": 1, "average_service_time": 1,
         "now_serving_number": 1, "activation_type": 1}
    )

    # Calculate people ahead
    people_ahead = 0
    if entry["status"] in ("waiting", "almost_up"):
        people_ahead = await db.gf_queue_entries.count_documents({
            "activation_id": entry["activation_id"],
            "status": {"$in": ["waiting", "almost_up", "now_serving"]},
            "current_position": {"$lt": entry["current_position"]}
        })

    avg_time = activation.get("average_service_time", 3) if activation else 3

    return {
        "entry_id": entry["entry_id"],
        "activation_name": activation.get("activation_name", "") if activation else "",
        "activation_type": activation.get("activation_type", "") if activation else "",
        "queue_number": entry["queue_number"],
        "current_position": entry["current_position"],
        "people_ahead": people_ahead,
        "now_serving": activation.get("now_serving_number", 0) if activation else 0,
        "estimated_wait_minutes": people_ahead * avg_time,
        "status": entry["status"],
        "queue_status": activation.get("queue_status", "inactive") if activation else "inactive",
        "guest_name": entry["guest_name"]
    }


@guest_flow_router.get("/public/now-serving/{activation_id}")
async def public_now_serving(activation_id: str):
    """Public: Now serving display for monitors."""
    activation = await db.gf_activations.find_one(
        {"activation_id": activation_id},
        {"_id": 0, "activation_name": 1, "queue_status": 1, "now_serving_number": 1, "activation_type": 1}
    )
    if not activation:
        raise HTTPException(status_code=404, detail="Activation not found")

    # Get next few entries
    upcoming = await db.gf_queue_entries.find(
        {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up"]}},
        {"_id": 0, "queue_number": 1, "first_name": 1, "status": 1}
    ).sort("current_position", 1).limit(5).to_list(5)

    now_serving_entry = None
    if activation.get("now_serving_number"):
        ns = await db.gf_queue_entries.find_one(
            {"activation_id": activation_id, "status": "now_serving"},
            {"_id": 0, "queue_number": 1, "first_name": 1}
        )
        now_serving_entry = ns

    total_waiting = await db.gf_queue_entries.count_documents(
        {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up"]}}
    )

    return {
        "activation_name": activation["activation_name"],
        "activation_type": activation.get("activation_type", ""),
        "queue_status": activation["queue_status"],
        "now_serving_number": activation.get("now_serving_number", 0),
        "now_serving_entry": now_serving_entry,
        "upcoming": upcoming,
        "total_waiting": total_waiting
    }


@guest_flow_router.get("/activations/{activation_id}/stats")
async def get_activation_stats(activation_id: str, user: User = Depends(get_current_user)):
    """Get queue statistics for an activation."""
    pipeline = [
        {"$match": {"activation_id": activation_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = {}
    async for doc in db.gf_queue_entries.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    total = sum(status_counts.values())
    waiting = status_counts.get("waiting", 0) + status_counts.get("almost_up", 0)

    activation = await db.gf_activations.find_one({"activation_id": activation_id}, {"_id": 0})
    avg_time = activation.get("average_service_time", 3) if activation else 3

    return {
        "total_guests": total,
        "waiting": waiting,
        "now_serving": status_counts.get("now_serving", 0),
        "completed": status_counts.get("completed", 0),
        "canceled": status_counts.get("canceled", 0),
        "estimated_wait_minutes": waiting * avg_time,
        "status_breakdown": status_counts
    }


@guest_flow_router.get("/activations/{activation_id}/activity-log")
async def get_activity_log(activation_id: str, limit: int = 50, user: User = Depends(get_current_user)):
    """Get activity log for an activation."""
    logs = await db.gf_activity_log.find(
        {"activation_id": activation_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs


# --- Internal Helpers ---

async def _log_activity(activation_id, entry_id, action_type, performed_by, note=None):
    now = datetime.now(timezone.utc)
    await db.gf_activity_log.insert_one({
        "log_id": f"gflog_{uuid.uuid4().hex[:10]}",
        "activation_id": activation_id,
        "queue_entry_id": entry_id,
        "action_type": action_type,
        "performed_by": performed_by,
        "note": note,
        "timestamp": now.isoformat()
    })


async def _recalculate_positions(activation_id):
    """Recalculate queue positions after changes."""
    entries = await db.gf_queue_entries.find(
        {"activation_id": activation_id, "status": {"$in": ["waiting", "almost_up"]}},
        {"_id": 0}
    ).sort("current_position", 1).to_list(500)

    for i, entry in enumerate(entries):
        new_pos = i + 1
        if entry["current_position"] != new_pos:
            await db.gf_queue_entries.update_one(
                {"entry_id": entry["entry_id"]},
                {"$set": {"current_position": new_pos}}
            )
