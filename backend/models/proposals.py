"""Proposal & Order Item data models — extracted from server.py. LOGIC UNCHANGED."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ProposalCreate(BaseModel):
    """Proposal acts as commercial proposal and client-facing contract"""
    valid_until: Optional[datetime] = None
    client_notes: Optional[str] = None
    payment_terms: Optional[str] = None


class ProposalUpdate(BaseModel):
    status: Optional[str] = None  # Draft, Sent, Accepted, Rejected  (legacy)
    document_status: Optional[str] = None  # Draft/Ready to Send/Pending Approval/Approved/Sent/Client Signed
    valid_until: Optional[datetime] = None
    client_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    payment_terms: Optional[str] = None
    # Text-only fields — these do NOT revoke approval.
    presentation_notes: Optional[str] = None
    # Data-quality flag — cleared by user from the UI when import/duplicate
    # copies have been cleaned.
    data_incomplete: Optional[bool] = None
    data_incomplete_source: Optional[str] = None


class Proposal(BaseModel):
    proposal_id: str
    event_id: str
    company_id: str
    proposal_number: str
    status: str = "Draft"  # Draft, Sent, Accepted, Rejected — LEGACY, kept for BC
    # New approval state machine (Feb 2026): Draft → Ready to Send →
    # Pending Approval → Approved → Sent → Client Signed. Backwards
    # compatible: when absent, derive from `status`.
    document_status: str = "Draft"
    valid_until: Optional[datetime] = None
    client_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    payment_terms: Optional[str] = None
    subtotal: float = 0.0
    discount_amount: float = 0.0
    tax_details: List[Dict[str, Any]] = []
    total_tax: float = 0.0
    total: float = 0.0
    # Internal financials (admin/owner only)
    total_cost: float = 0.0
    total_margin: float = 0.0
    margin_percentage: float = 0.0
    # Approval trail (Feb 2026)
    approved_by: Optional[Dict[str, Any]] = None
    approval_revoked_reason: Optional[str] = None
    approval_revoked_at: Optional[datetime] = None
    last_material_edit_at: Optional[datetime] = None
    # Automation / import lineage
    data_incomplete: bool = False
    data_incomplete_source: Optional[str] = None  # import | duplicate | automation | seed
    last_edited_at: datetime
    created_at: datetime

    class Config:
        extra = "allow"


# ============== ORDER ITEM MODELS (Unified Commercial Engine) ==============

class OrderItemCreate(BaseModel):
    """Unified order item - represents everything sold in an event"""
    item_type: str = "Service"  # Food, Service, Rental, Fee
    reference_id: Optional[str] = None  # menu_id / recipe_id (nullable)
    description: str  # Client-facing description
    long_description: Optional[str] = None  # Long/marketing description from the source recipe/menu
    quantity: float = 1.0
    unit_price: float = 0.0  # Visible to client
    internal_cost: Optional[float] = None  # Hidden, internal only
    discount_type: str = "percentage"  # "percentage" | "fixed"
    discount_value: float = 0.0  # Either % or absolute amount, depending on discount_type
    discount_pct: Optional[float] = None  # Deprecated alias; if set with no discount_value, interpreted as percentage
    tax_exempt: bool = False  # If True, this item is excluded from proposal taxes
    category_id: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: int = 0
    section_title: Optional[str] = None  # Custom section title for grouping
    section_time: Optional[str] = None   # Service time for section
    section_end_time: Optional[str] = None  # Optional end time for service window
    parent_item_id: Optional[str] = None    # Nested component of another item


class OrderItemUpdate(BaseModel):
    item_type: Optional[str] = None
    reference_id: Optional[str] = None
    description: Optional[str] = None
    long_description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    internal_cost: Optional[float] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    discount_pct: Optional[float] = None  # Deprecated alias
    tax_exempt: Optional[bool] = None
    category_id: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: Optional[int] = None
    section_title: Optional[str] = None
    section_time: Optional[str] = None
    section_end_time: Optional[str] = None
    parent_item_id: Optional[str] = None


class OrderItem(BaseModel):
    """Order item with calculated fields"""
    item_id: str
    event_id: str
    proposal_id: str
    item_type: str
    reference_id: Optional[str] = None
    description: str
    long_description: Optional[str] = None
    quantity: float
    unit_price: float
    internal_cost: Optional[float] = None
    discount_type: str = "percentage"
    discount_value: float = 0.0
    discount_amount: float = 0.0  # Computed absolute discount in money
    tax_exempt: bool = False
    total_price: float  # quantity * unit_price - discount_amount (>= 0)
    total_cost: Optional[float] = None  # quantity * internal_cost
    margin_amount: Optional[float] = None  # total_price - total_cost
    margin_percentage: Optional[float] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    internal_notes: Optional[str] = None
    event_date: Optional[str] = None
    sort_order: int
    section_title: Optional[str] = None
    section_time: Optional[str] = None
    section_end_time: Optional[str] = None
    parent_item_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
