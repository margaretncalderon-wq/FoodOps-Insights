# routers/comments.py - Comments and Mentions Router
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from config import db
from models.auth import User
from models.comments import CommentCreate, CommentUpdate
from routers.auth import get_current_user

comments_router = APIRouter(prefix="/comments", tags=["Comments"])


@comments_router.get("/{entity_type}/{entity_id}")
async def get_comments(
    entity_type: str,
    entity_id: str,
    user: User = Depends(get_current_user)
):
    """Get all comments for an entity"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    comments = await db.comments.find(
        {
            "company_id": company_id,
            "entity_type": entity_type,
            "entity_id": entity_id
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    return comments


@comments_router.post("")
async def create_comment(data: CommentCreate, user: User = Depends(get_current_user)):
    """Create a new comment"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    comment_id = f"comment_{uuid.uuid4().hex[:12]}"
    
    comment = {
        "comment_id": comment_id,
        "company_id": company_id,
        "entity_type": data.entity_type,
        "entity_id": data.entity_id,
        "content": data.content,
        "mentions": [m.model_dump() for m in (data.mentions or [])],
        "parent_comment_id": data.parent_comment_id,
        "author_id": user.user_id,
        "author_name": user.name or user.email,
        "author_email": user.email,
        "author_picture": user.picture,
        "is_edited": False,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "reactions": {}
    }
    
    await db.comments.insert_one(comment)
    comment.pop("_id", None)
    
    # Create notifications for mentioned users
    for mention in (data.mentions or []):
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "user_id": mention.user_id,
            "type": "mention",
            "title": f"{user.name or user.email} te mencionó en un comentario",
            "message": data.content[:100] + ("..." if len(data.content) > 100 else ""),
            "entity_type": data.entity_type,
            "entity_id": data.entity_id,
            "comment_id": comment_id,
            "from_user_id": user.user_id,
            "from_user_name": user.name or user.email,
            "is_read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification)
    
    return comment


@comments_router.put("/{comment_id}")
async def update_comment(
    comment_id: str,
    data: CommentUpdate,
    user: User = Depends(get_current_user)
):
    """Update a comment (only by author)"""
    company_id = user.company_id or user.active_org_id
    
    # Check ownership
    existing = await db.comments.find_one({
        "comment_id": comment_id,
        "company_id": company_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if existing["author_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this comment")
    
    now = datetime.now(timezone.utc)
    
    await db.comments.update_one(
        {"comment_id": comment_id},
        {"$set": {
            "content": data.content,
            "mentions": [m.model_dump() for m in (data.mentions or [])],
            "is_edited": True,
            "updated_at": now.isoformat()
        }}
    )
    
    updated = await db.comments.find_one({"comment_id": comment_id}, {"_id": 0})
    return updated


@comments_router.delete("/{comment_id}")
async def delete_comment(comment_id: str, user: User = Depends(get_current_user)):
    """Delete a comment (only by author or admin)"""
    company_id = user.company_id or user.active_org_id
    
    existing = await db.comments.find_one({
        "comment_id": comment_id,
        "company_id": company_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Allow author or admin to delete
    if existing["author_id"] != user.user_id and user.role not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
    
    await db.comments.delete_one({"comment_id": comment_id})
    
    # Also delete any replies to this comment
    await db.comments.delete_many({"parent_comment_id": comment_id})
    
    return {"success": True, "deleted_id": comment_id}


@comments_router.post("/{comment_id}/react")
async def add_reaction(
    comment_id: str,
    emoji: str,
    user: User = Depends(get_current_user)
):
    """Add/toggle a reaction on a comment"""
    company_id = user.company_id or user.active_org_id
    
    existing = await db.comments.find_one({
        "comment_id": comment_id,
        "company_id": company_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    reactions = existing.get("reactions", {})
    
    # Toggle reaction
    if emoji in reactions:
        if user.user_id in reactions[emoji]:
            reactions[emoji].remove(user.user_id)
            if len(reactions[emoji]) == 0:
                del reactions[emoji]
        else:
            reactions[emoji].append(user.user_id)
    else:
        reactions[emoji] = [user.user_id]
    
    await db.comments.update_one(
        {"comment_id": comment_id},
        {"$set": {"reactions": reactions}}
    )
    
    return {"success": True, "reactions": reactions}


@comments_router.get("/mentions/users")
async def get_mentionable_users(
    search: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get users that can be mentioned (team members and agency collaborators)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        return []
    
    # Get company team members
    query = {"company_id": company_id}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    users = await db.users.find(
        query,
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1, "role": 1}
    ).limit(20).to_list(20)
    
    # Also get collaborators from company_memberships
    memberships = await db.company_memberships.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(50)
    
    # Combine and dedupe
    user_ids = set(u["user_id"] for u in users)
    for m in memberships:
        if m["user_id"] not in user_ids:
            users.append({
                "user_id": m["user_id"],
                "name": m.get("name", m["email"]),
                "email": m["email"],
                "picture": None,
                "role": "collaborator"
            })
    
    return users


@comments_router.get("/my-notifications")
async def get_my_notifications(
    unread_only: bool = False,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get notifications for the current user"""
    query = {"user_id": user.user_id}
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Count unread
    unread_count = await db.notifications.count_documents({
        "user_id": user.user_id,
        "is_read": False
    })
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }


@comments_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    """Mark a notification as read"""
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"is_read": True}}
    )
    return {"success": True}


@comments_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": user.user_id, "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"success": True}
