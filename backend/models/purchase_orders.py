"""Purchase Order data models — extracted from server.py. LOGIC UNCHANGED."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class PurchaseOrderLineCreate(BaseModel):
    ingredient_id: str
    ingredient_name: str
    quantity_needed: float
    quantity_on_hand: float
    quantity_to_order: float
    purchase_unit: str
    pack_size: float = 1.0
    unit_cost: float
    total_cost: float
    notes: Optional[str] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    event_id: Optional[str] = None
    lines: List[PurchaseOrderLineCreate]
    notes: Optional[str] = None


class PurchaseOrderLineModel(BaseModel):
    line_id: str
    inventory_item_id: str
    item_name: str
    qty_ordered: float
    purchase_unit: str
    unit_cost: float
    line_total: float  # qty_ordered * unit_cost
    qty_received: float = 0.0
    notes: Optional[str] = None


class PurchaseOrderLineCreateModel(BaseModel):
    inventory_item_id: str
    item_name: str
    qty_ordered: float
    purchase_unit: str
    unit_cost: float
    notes: Optional[str] = None


class PurchaseOrderFullCreate(BaseModel):
    """Full Purchase Order create model"""
    supplier_id: str
    needed_by_date: Optional[datetime] = None
    payment_method: str = "Transfer"  # Cash, Transfer, Credit, Other
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineCreateModel] = []
    cost_center_id: Optional[str] = None  # Cost center assignment


class PurchaseOrderFull(BaseModel):
    """Full Purchase Order model"""
    po_id: str
    company_id: str
    po_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
    status: str = "Draft"  # Draft, Sent, PartiallyReceived, Received, Cancelled
    created_at: datetime
    updated_at: datetime
    needed_by_date: Optional[datetime] = None
    payment_method: str = "Transfer"
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineModel] = []
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None
    cost_center_id: Optional[str] = None  # Cost center assignment
    cost_center_name: Optional[str] = None
