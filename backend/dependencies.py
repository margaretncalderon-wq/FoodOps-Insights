# dependencies.py - Common dependencies for FastAPI
from fastapi import Depends, HTTPException, Request
from datetime import datetime, timezone
from typing import Optional
import jwt

from config import db, JWT_SECRET, JWT_ALGORITHM
from models.auth import User


async def get_current_user(request: Request) -> User:
    """Extract and validate user from session token cookie or Authorization header"""
    token = request.cookies.get("session_token")
    
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get user from database
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        
        # Check for super admin status
        is_super_admin = user_doc.get("is_super_admin", False)
        
        return User(
            user_id=user_doc["user_id"],
            email=user_doc["email"],
            name=user_doc["name"],
            picture=user_doc.get("picture"),
            company_id=user_doc.get("company_id"),
            role=user_doc.get("role", "admin"),
            active_org_id=user_doc.get("active_org_id"),
            is_super_admin=is_super_admin,
            view_as_org_id=user_doc.get("view_as_org_id"),
            created_at=datetime.fromisoformat(user_doc["created_at"]) if isinstance(user_doc["created_at"], str) else user_doc["created_at"]
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user_optional(request: Request) -> Optional[User]:
    """Same as get_current_user but returns None instead of raising exception"""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
