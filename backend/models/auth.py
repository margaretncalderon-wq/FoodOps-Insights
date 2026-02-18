# models/auth.py - Authentication models
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    company_name: Optional[str] = None
    industry_template: Optional[str] = "events_hospitality"  # events_hospitality, professional_services, generic


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    company_id: Optional[str] = None
    role: str = "admin"  # Legacy role at company level
    active_org_id: Optional[str] = None  # Current active organization
    is_super_admin: bool = False  # Platform-level super admin flag
    view_as_org_id: Optional[str] = None  # For read-only view-as mode
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User
