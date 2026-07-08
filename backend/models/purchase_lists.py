"""Purchase List data models — extracted from server.py in the refactor sprint. LOGIC UNCHANGED."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class PurchaseListItem(BaseModel):
    inventory_item_id: str
    item_name: str
    unit: str
    required_qty: float
    in_stock_qty: float
    to_purchase_qty: float
    unit_cost: float = 0.0
    total_cost: float = 0.0
    status: str = "Short"  # InStock, Short, Unknown


class PurchaseListCreate(BaseModel):
    event_id: str
    supplier_id: Optional[str] = None


class PurchaseList(BaseModel):
    purchase_list_id: str
    company_id: str
    event_id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    items: List[PurchaseListItem] = []
    total_cost: float = 0.0
    status: str = "Draft"  # Draft, Ordered, Received
    created_at: datetime
    updated_at: datetime
