"""Supplier Contracts — data models. Contracts tie a supplier to:
  * a validity window (start/end)
  * payment terms (net30, credit limit)
  * a Partners module record (optional, when the supplier is also a strategic partner)
  * accounting: every expense/bill/invoice recorded against this contract's
    supplier can be linked back via `contract_id` so we track invoiced-to-date
    and remaining balance.

Kept in its own model file so the eventual delivery-notes / asset-counts refactor
also stays clean.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class SupplierContractAttachment(BaseModel):
    """A signed PDF, addendum, price list, or any doc attached to a contract."""
    attachment_id: str
    file_name: str
    original_name: str
    mime_type: str
    file_size: int
    file_url: str
    description: Optional[str] = None
    uploaded_at: str
    uploaded_by: str


class SupplierContractCreate(BaseModel):
    supplier_id: str
    contract_number: Optional[str] = None  # auto-generated as CT-YYYY-####  if blank
    title: str
    description: Optional[str] = None
    start_date: str  # ISO YYYY-MM-DD
    end_date: Optional[str] = None  # nullable — evergreen contracts
    total_value: float = 0.0  # contracted total (informational)
    currency: str = "USD"
    payment_terms: str = "net30"  # net30, net15, cash, credit, mixed
    credit_limit: float = 0.0
    partner_id: Optional[str] = None  # link to `db.partners` when applicable
    cost_center: Optional[str] = None  # aligns with expenses/ingredients cost_center
    status: str = "Active"  # Draft, Active, Expired, Cancelled, Renewed
    notes: Optional[str] = None
    auto_renew: bool = False
    renewal_period_months: Optional[int] = None
    tags: List[str] = []


class SupplierContractUpdate(BaseModel):
    supplier_id: Optional[str] = None
    contract_number: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_value: Optional[float] = None
    currency: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    partner_id: Optional[str] = None
    cost_center: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    auto_renew: Optional[bool] = None
    renewal_period_months: Optional[int] = None
    tags: Optional[List[str]] = None


class SupplierContract(BaseModel):
    contract_id: str
    company_id: str
    supplier_id: str
    supplier_name: Optional[str] = None
    contract_number: str
    title: str
    description: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    total_value: float = 0.0
    currency: str = "USD"
    payment_terms: str = "net30"
    credit_limit: float = 0.0
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    cost_center: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None
    auto_renew: bool = False
    renewal_period_months: Optional[int] = None
    tags: List[str] = []
    attachments: List[SupplierContractAttachment] = []
    # Rollups computed at read-time from linked expenses/bills:
    invoiced_to_date: float = 0.0
    paid_to_date: float = 0.0
    balance_remaining: float = 0.0
    linked_expenses_count: int = 0
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

    class Config:
        extra = "allow"
