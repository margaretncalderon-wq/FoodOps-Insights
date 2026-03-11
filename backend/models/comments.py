# models/comments.py - Comments and Mentions System
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class MentionCreate(BaseModel):
    """A mention of a user in a comment"""
    user_id: str
    user_name: str
    user_email: str


class CommentCreate(BaseModel):
    """Create a comment on any entity (post, idea, task, etc.)"""
    entity_type: str  # 'social_post', 'idea', 'task', 'partner', etc.
    entity_id: str
    content: str
    mentions: Optional[List[MentionCreate]] = []
    parent_comment_id: Optional[str] = None  # For threaded replies


class CommentUpdate(BaseModel):
    """Update a comment"""
    content: str
    mentions: Optional[List[MentionCreate]] = []


class Comment(BaseModel):
    """Full comment model"""
    comment_id: str
    company_id: str
    entity_type: str
    entity_id: str
    content: str
    mentions: List[dict] = []
    parent_comment_id: Optional[str] = None
    author_id: str
    author_name: str
    author_email: str
    author_picture: Optional[str] = None
    is_edited: bool = False
    created_at: str
    updated_at: str
    reactions: dict = {}  # {"👍": ["user_id1", "user_id2"], ...}
