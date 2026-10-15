"""Proposal Notes (Bitácora) — threaded notes attached to a proposal.

Features:
- Categorized notes (change_request, client_request, internal, meeting, call, email)
- Visibility: internal_only | share_with_client
- Attachments via Emergent Object Storage (image/pdf/doc)
- Pin, reactions (emoji), @mentions → notifications
- Linked order_items (optional)
- Auto-notes from maybe_revoke_on_material_change
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from config import db
from dependencies import get_current_user
from models.auth import User
from utils.object_storage import APP_NAME, guess_mime, get_object, put_object

logger = logging.getLogger(__name__)

proposal_notes_router = APIRouter(prefix="/proposals", tags=["Proposal Notes"])
portal_messages_router = APIRouter(prefix="/portal", tags=["Client Portal Messages"])

NOTE_CATEGORIES = {
    "change_request", "client_request", "internal", "meeting", "call", "email", "system",
    "approval_question",
}
VISIBILITY_OPTIONS = {"internal_only", "share_with_client"}
MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024  # 15MB


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def sync_open_questions(proposal_id: str, company_id: str) -> int:
    """Recount open approval questions and mirror them onto the proposal's data_incomplete flag."""
    count = await db.proposal_notes.count_documents({
        "proposal_id": proposal_id, "company_id": company_id,
        "category": "approval_question", "is_deleted": {"$ne": True}, "resolved": {"$ne": True},
    })
    p = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": company_id},
        {"_id": 0, "data_incomplete": 1, "data_incomplete_source": 1},
    ) or {}
    update: Dict[str, Any] = {"open_questions_count": count}
    if count > 0 and not p.get("data_incomplete"):
        update.update({"data_incomplete": True, "data_incomplete_source": "open_questions"})
    elif count == 0 and p.get("data_incomplete_source") == "open_questions":
        update.update({"data_incomplete": False, "data_incomplete_source": None})
    await db.proposals.update_one({"proposal_id": proposal_id, "company_id": company_id}, {"$set": update})
    return count


def _extract_mentions(body: str) -> List[str]:
    """Grab @user_name mentions from body. Returns raw strings; caller resolves to user_ids."""
    return re.findall(r"@([A-Za-z0-9._-]{2,40})", body or "")


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    category: str = "internal"
    visibility: str = "internal_only"
    pinned: bool = False
    linked_item_ids: List[str] = []
    attachment_ids: List[str] = []  # ids of pre-uploaded attachments


class NoteUpdate(BaseModel):
    body: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[str] = None
    visibility: Optional[str] = None
    pinned: Optional[bool] = None
    linked_item_ids: Optional[List[str]] = None


class ReactionToggle(BaseModel):
    emoji: str = Field(min_length=1, max_length=4)


async def _ensure_proposal_access(proposal_id: str, company_id: str) -> Dict[str, Any]:
    p = await db.proposals.find_one(
        {"proposal_id": proposal_id, "company_id": company_id},
        {"_id": 0, "proposal_id": 1, "event_id": 1, "company_id": 1},
    )
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return p


async def _resolve_mentions(body: str, company_id: str) -> List[Dict[str, str]]:
    """Resolve @name mentions to concrete {user_id, name} entries scoped to the tenant."""
    tokens = _extract_mentions(body)
    if not tokens:
        return []
    users = await db.users.find(
        {"company_id": company_id, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1},
    ).to_list(500)
    resolved: List[Dict[str, str]] = []
    seen = set()
    for tok in tokens:
        tl = tok.lower()
        for u in users:
            name = (u.get("name") or "").lower()
            email_prefix = (u.get("email") or "").split("@")[0].lower()
            if tl == name.replace(" ", "") or tl == email_prefix or tl == name:
                if u["user_id"] not in seen:
                    resolved.append({"user_id": u["user_id"], "name": u.get("name") or tok})
                    seen.add(u["user_id"])
                break
    return resolved


@proposal_notes_router.get("/{proposal_id}/notes/mentionable")
async def list_mentionable_users(proposal_id: str, user: User = Depends(get_current_user)):
    """Active teammates for the @mention autocomplete. `handle` is what gets inserted."""
    await _ensure_proposal_access(proposal_id, user.company_id)
    users = await db.users.find(
        {"company_id": user.company_id, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1},
    ).sort("name", 1).to_list(500)
    out = []
    for u in users:
        handle = re.sub(r"[^A-Za-z0-9._-]", "", (u.get("email") or "").split("@")[0])
        if len(handle) < 2:
            continue
        out.append({"user_id": u["user_id"], "name": u.get("name") or handle, "email": u.get("email"),
                    "handle": handle, "picture": u.get("picture")})
    return {"users": out}


# ============== ATTACHMENT UPLOAD ==============

@proposal_notes_router.post("/{proposal_id}/notes/attachments")
async def upload_note_attachment(
    proposal_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Pre-upload an attachment, then reference its attachment_id in NoteCreate.
    Enforces a 15MB cap and company-scoped storage path."""
    await _ensure_proposal_access(proposal_id, user.company_id)
    data = await file.read()
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment exceeds 15MB limit")

    original = file.filename or "attachment"
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else "bin"
    attachment_id = f"att_{uuid.uuid4().hex[:12]}"
    storage_path = f"{APP_NAME}/proposals/{user.company_id}/{proposal_id}/{attachment_id}.{ext}"
    content_type = file.content_type or guess_mime(original)

    result = put_object(storage_path, data, content_type)

    doc = {
        "attachment_id": attachment_id,
        "proposal_id": proposal_id,
        "company_id": user.company_id,
        "storage_path": result["path"],
        "original_filename": original,
        "content_type": content_type,
        "size": result.get("size") or len(data),
        "uploaded_by": user.user_id,
        "uploaded_by_name": user.name,
        "is_deleted": False,
        "created_at": _now_iso(),
    }
    await db.note_attachments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@proposal_notes_router.get("/{proposal_id}/notes/attachments/{attachment_id}")
async def download_note_attachment(
    proposal_id: str,
    attachment_id: str,
    user: User = Depends(get_current_user),
):
    from fastapi.responses import Response
    rec = await db.note_attachments.find_one(
        {"attachment_id": attachment_id, "proposal_id": proposal_id,
         "company_id": user.company_id, "is_deleted": {"$ne": True}},
        {"_id": 0},
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Attachment not found")
    data, _ct = get_object(rec["storage_path"])
    return Response(
        content=data,
        media_type=rec.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{rec.get("original_filename", "file")}"'},
    )


# ============== NOTES CRUD ==============

@proposal_notes_router.get("/{proposal_id}/notes")
async def list_notes(
    proposal_id: str,
    category: Optional[str] = None,
    pinned_only: bool = False,
    user: User = Depends(get_current_user),
):
    await _ensure_proposal_access(proposal_id, user.company_id)
    q: Dict[str, Any] = {
        "proposal_id": proposal_id,
        "company_id": user.company_id,
        "is_deleted": {"$ne": True},
    }
    if category and category in NOTE_CATEGORIES:
        q["category"] = category
    if pinned_only:
        q["pinned"] = True

    notes = await db.proposal_notes.find(q, {"_id": 0}).to_list(500)
    # Hydrate attachments
    attachment_ids = {aid for n in notes for aid in (n.get("attachment_ids") or [])}
    atts: Dict[str, Dict[str, Any]] = {}
    if attachment_ids:
        rows = await db.note_attachments.find(
            {"attachment_id": {"$in": list(attachment_ids)}, "company_id": user.company_id},
            {"_id": 0, "attachment_id": 1, "original_filename": 1, "content_type": 1, "size": 1},
        ).to_list(500)
        atts = {r["attachment_id"]: r for r in rows}
    for n in notes:
        n["attachments"] = [atts[a] for a in (n.get("attachment_ids") or []) if a in atts]

    # Pinned first, newest first
    notes.sort(key=lambda n: (not n.get("pinned", False), -(datetime.fromisoformat(n["created_at"]).timestamp())))
    return {"notes": notes, "count": len(notes)}


@proposal_notes_router.post("/{proposal_id}/notes")
async def create_note(
    proposal_id: str,
    data: NoteCreate,
    user: User = Depends(get_current_user),
):
    proposal = await _ensure_proposal_access(proposal_id, user.company_id)

    if data.category not in NOTE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {data.category}")
    if data.visibility not in VISIBILITY_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid visibility: {data.visibility}")

    # Validate attachments belong to this proposal
    if data.attachment_ids:
        count = await db.note_attachments.count_documents({
            "attachment_id": {"$in": data.attachment_ids},
            "proposal_id": proposal_id,
            "company_id": user.company_id,
            "is_deleted": {"$ne": True},
        })
        if count != len(data.attachment_ids):
            raise HTTPException(status_code=400, detail="Some attachments do not belong to this proposal")

    mentions = await _resolve_mentions(data.body, user.company_id)

    note_id = f"note_{uuid.uuid4().hex[:12]}"
    now = _now_iso()
    doc = {
        "note_id": note_id,
        "proposal_id": proposal_id,
        "event_id": proposal.get("event_id"),
        "company_id": user.company_id,
        "author_id": user.user_id,
        "author_name": user.name,
        "category": data.category,
        "visibility": data.visibility,
        "body": data.body,
        "pinned": bool(data.pinned),
        "linked_item_ids": list(data.linked_item_ids or []),
        "attachment_ids": list(data.attachment_ids or []),
        "mentions": mentions,
        "reactions": [],
        "resolved": False,
        "resolved_by": None,
        "edited_at": None,
        "is_deleted": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.proposal_notes.insert_one(doc)
    doc.pop("_id", None)
    doc["open_questions_count"] = await sync_open_questions(proposal_id, user.company_id)

    # Fire mention notifications (best effort)
    if mentions:
        try:
            from routers.notifications import create_notification
            link = f"/events/{proposal.get('event_id')}?tab=notes&note={note_id}"
            for m in mentions:
                if m["user_id"] == user.user_id:
                    continue
                await create_notification(
                    user_id=m["user_id"],
                    notification_type="proposal_note_mention",
                    title=f"{user.name} te mencionó en una nota",
                    message=(data.body[:140] + ("…" if len(data.body) > 140 else "")),
                    link=link,
                    metadata={"proposal_id": proposal_id, "note_id": note_id},
                    priority="normal",
                    company_id=user.company_id,
                )
        except Exception as e:  # noqa: BLE001
            logger.warning(f"proposal_notes: mention notify failed: {e}")

    return doc


@proposal_notes_router.put("/{proposal_id}/notes/{note_id}")
async def update_note(
    proposal_id: str,
    note_id: str,
    data: NoteUpdate,
    user: User = Depends(get_current_user),
):
    note = await db.proposal_notes.find_one(
        {"note_id": note_id, "proposal_id": proposal_id, "company_id": user.company_id, "is_deleted": {"$ne": True}},
        {"_id": 0},
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    update: Dict[str, Any] = {}
    if data.body is not None and data.body.strip():
        update["body"] = data.body
        update["mentions"] = await _resolve_mentions(data.body, user.company_id)
    if data.category is not None:
        if data.category not in NOTE_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category: {data.category}")
        update["category"] = data.category
    if data.visibility is not None:
        if data.visibility not in VISIBILITY_OPTIONS:
            raise HTTPException(status_code=400, detail=f"Invalid visibility: {data.visibility}")
        update["visibility"] = data.visibility
    if data.pinned is not None:
        update["pinned"] = bool(data.pinned)
    if data.linked_item_ids is not None:
        update["linked_item_ids"] = list(data.linked_item_ids)

    if not update:
        return note

    update["edited_at"] = _now_iso()
    update["updated_at"] = update["edited_at"]
    await db.proposal_notes.update_one(
        {"note_id": note_id, "proposal_id": proposal_id, "company_id": user.company_id},
        {"$set": update},
    )
    await sync_open_questions(proposal_id, user.company_id)
    return await db.proposal_notes.find_one({"note_id": note_id}, {"_id": 0})


@proposal_notes_router.delete("/{proposal_id}/notes/{note_id}")
async def delete_note(
    proposal_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
):
    r = await db.proposal_notes.update_one(
        {"note_id": note_id, "proposal_id": proposal_id, "company_id": user.company_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True, "deleted_at": _now_iso(), "deleted_by": user.user_id}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    count = await sync_open_questions(proposal_id, user.company_id)
    return {"deleted": True, "open_questions_count": count}


@proposal_notes_router.post("/{proposal_id}/notes/{note_id}/resolve")
async def toggle_resolved(
    proposal_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
):
    """Toggle resolved state of an approval question."""
    note = await db.proposal_notes.find_one(
        {"note_id": note_id, "proposal_id": proposal_id, "company_id": user.company_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "resolved": 1, "category": 1},
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.get("category") != "approval_question":
        raise HTTPException(status_code=400, detail="Only approval questions can be resolved")
    resolved = not bool(note.get("resolved"))
    resolved_by = {"user_id": user.user_id, "name": user.name, "at": _now_iso()} if resolved else None
    await db.proposal_notes.update_one(
        {"note_id": note_id},
        {"$set": {"resolved": resolved, "resolved_by": resolved_by, "updated_at": _now_iso()}},
    )
    count = await sync_open_questions(proposal_id, user.company_id)
    return {"resolved": resolved, "resolved_by": resolved_by, "open_questions_count": count}


@proposal_notes_router.post("/{proposal_id}/notes/{note_id}/pin")
async def toggle_pin(
    proposal_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
):
    note = await db.proposal_notes.find_one(
        {"note_id": note_id, "proposal_id": proposal_id, "company_id": user.company_id},
        {"_id": 0, "pinned": 1},
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    new_pinned = not bool(note.get("pinned"))
    await db.proposal_notes.update_one(
        {"note_id": note_id},
        {"$set": {"pinned": new_pinned, "updated_at": _now_iso()}},
    )
    return {"pinned": new_pinned}


@proposal_notes_router.post("/{proposal_id}/notes/{note_id}/reactions")
async def toggle_reaction(
    proposal_id: str,
    note_id: str,
    data: ReactionToggle,
    user: User = Depends(get_current_user),
):
    """Toggle this user's reaction with the given emoji on the note."""
    note = await db.proposal_notes.find_one(
        {"note_id": note_id, "proposal_id": proposal_id, "company_id": user.company_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "reactions": 1},
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    reactions: List[Dict[str, Any]] = note.get("reactions") or []
    existing_idx = next(
        (i for i, r in enumerate(reactions) if r.get("user_id") == user.user_id and r.get("emoji") == data.emoji),
        None,
    )
    if existing_idx is not None:
        reactions.pop(existing_idx)
    else:
        reactions.append({"user_id": user.user_id, "name": user.name, "emoji": data.emoji, "at": _now_iso()})
    await db.proposal_notes.update_one(
        {"note_id": note_id},
        {"$set": {"reactions": reactions, "updated_at": _now_iso()}},
    )
    return {"reactions": reactions}


# ============== SYSTEM AUTO-NOTE HOOK ==============

async def record_system_note(
    proposal_id: str,
    company_id: str,
    body: str,
    author_name: str = "Sistema",
    author_id: str = "system",
    category: str = "system",
):
    """Insert a system-generated note (e.g., after auto-revoke).
    Fail-safe: never raises so callers in hot paths don't break.
    """
    try:
        proposal = await db.proposals.find_one(
            {"proposal_id": proposal_id, "company_id": company_id},
            {"_id": 0, "event_id": 1},
        )
        if not proposal:
            return
        now = _now_iso()
        await db.proposal_notes.insert_one({
            "note_id": f"note_{uuid.uuid4().hex[:12]}",
            "proposal_id": proposal_id,
            "event_id": proposal.get("event_id"),
            "company_id": company_id,
            "author_id": author_id,
            "author_name": author_name,
            "category": category,
            "visibility": "internal_only",
            "body": body,
            "pinned": False,
            "linked_item_ids": [],
            "attachment_ids": [],
            "mentions": [],
            "reactions": [],
            "edited_at": None,
            "is_deleted": False,
            "is_system": True,
            "created_at": now,
            "updated_at": now,
        })
    except Exception as e:  # noqa: BLE001
        logger.warning(f"proposal_notes: record_system_note failed: {e}")


# ============== CLIENT PORTAL MESSAGES ==============

class PortalMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    name: str = Field(min_length=1, max_length=120)
    email: Optional[str] = Field(default=None, max_length=200)


async def _portal_proposal(event_id: str) -> Dict[str, Any]:
    p = await db.proposals.find_one(
        {"event_id": event_id}, {"_id": 0, "proposal_id": 1, "company_id": 1, "event_id": 1}
    )
    if not p:
        raise HTTPException(status_code=404, detail="Event not found")
    return p


@portal_messages_router.get("/event/{event_id}/messages")
async def portal_list_messages(event_id: str):
    p = await _portal_proposal(event_id)
    notes = await db.proposal_notes.find(
        {"proposal_id": p["proposal_id"], "company_id": p["company_id"],
         "visibility": "share_with_client", "is_deleted": {"$ne": True}},
        {"_id": 0, "note_id": 1, "author_name": 1, "author_id": 1, "body": 1,
         "created_at": 1, "attachment_ids": 1, "is_client": 1},
    ).sort("created_at", 1).to_list(500)
    att_ids = {a for n in notes for a in (n.get("attachment_ids") or [])}
    atts: Dict[str, Dict[str, Any]] = {}
    if att_ids:
        rows = await db.note_attachments.find(
            {"attachment_id": {"$in": list(att_ids)}, "company_id": p["company_id"], "is_deleted": {"$ne": True}},
            {"_id": 0, "attachment_id": 1, "original_filename": 1, "content_type": 1, "size": 1},
        ).to_list(500)
        atts = {r["attachment_id"]: r for r in rows}
    out = []
    for n in notes:
        out.append({
            "note_id": n["note_id"],
            "author_name": n.get("author_name"),
            "is_client": bool(n.get("is_client")),
            "body": n.get("body"),
            "created_at": n.get("created_at"),
            "attachments": [atts[a] for a in (n.get("attachment_ids") or []) if a in atts],
        })
    return {"messages": out}


@portal_messages_router.get("/event/{event_id}/messages/attachments/{attachment_id}")
async def portal_download_attachment(event_id: str, attachment_id: str):
    from fastapi.responses import Response
    p = await _portal_proposal(event_id)
    shared = await db.proposal_notes.find_one({
        "proposal_id": p["proposal_id"], "visibility": "share_with_client",
        "is_deleted": {"$ne": True}, "attachment_ids": attachment_id,
    }, {"_id": 0, "note_id": 1})
    rec = await db.note_attachments.find_one(
        {"attachment_id": attachment_id, "proposal_id": p["proposal_id"], "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if not shared or not rec:
        raise HTTPException(status_code=404, detail="Attachment not found")
    data, _ct = get_object(rec["storage_path"])
    return Response(
        content=data,
        media_type=rec.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{rec.get("original_filename", "file")}"'},
    )


@portal_messages_router.post("/event/{event_id}/messages")
async def portal_post_message(event_id: str, data: PortalMessageCreate):
    p = await _portal_proposal(event_id)
    body = data.body.strip()
    name = data.name.strip()
    if not body or not name:
        raise HTTPException(status_code=400, detail="name and body are required")
    now = _now_iso()
    note_id = f"note_{uuid.uuid4().hex[:12]}"
    doc = {
        "note_id": note_id,
        "proposal_id": p["proposal_id"],
        "event_id": event_id,
        "company_id": p["company_id"],
        "author_id": "client",
        "author_name": name,
        "author_email": (data.email or "").strip() or None,
        "is_client": True,
        "category": "client_request",
        "visibility": "share_with_client",
        "body": body,
        "pinned": False,
        "linked_item_ids": [],
        "attachment_ids": [],
        "mentions": [],
        "reactions": [],
        "resolved": False,
        "resolved_by": None,
        "edited_at": None,
        "is_deleted": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.proposal_notes.insert_one(doc)
    try:
        from routers.notifications import notify_org_admins
        await notify_org_admins(
            org_id=p["company_id"],
            notification_type="portal_client_message",
            title=f"{name} escribió desde el portal",
            message=body[:140] + ("…" if len(body) > 140 else ""),
            link=f"/events/{event_id}?tab=notes&note={note_id}",
            metadata={"proposal_id": p["proposal_id"], "note_id": note_id, "event_id": event_id},
            priority="high",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"portal message notify failed: {e}")
    return {"note_id": note_id, "author_name": name, "is_client": True, "body": body, "created_at": now, "attachments": []}
