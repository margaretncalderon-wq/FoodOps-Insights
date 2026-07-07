"""Supplier data models — extracted from server.py in the refactor sprint. LOGIC UNCHANGED."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr


class SupplierCreate(BaseModel):
    name: str
    legal_name: Optional[str] = None
    rnc: Optional[str] = None
    tax_id: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    category: str = "General"
    delivery_days: List[str] = []  # ["Monday", "Wednesday", "Friday"]
    minimum_order: float = 0.0
    lead_time: Optional[str] = None
    payment_terms: str = "net30"
    is_preferred: bool = False
    status: str = "Active"
    notes: Optional[str] = None


class Supplier(BaseModel):
    supplier_id: str
    company_id: str
    name: str
    legal_name: Optional[str] = None
    rnc: Optional[str] = None
    tax_id: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    category: str = "General"
    delivery_days: List[str] = []
    minimum_order: float = 0.0
    lead_time: Optional[str] = None
    payment_terms: str = "net30"
    is_preferred: bool = False
    status: str = "Active"
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        extra = "allow"


class SupplierItemCreate(BaseModel):
    supplier_id: str
    ingredient_id: str
    supplier_sku: str = ""
    supplier_item_name: str = ""
    purchase_unit: str = "unit"  # case, bag, box, gallon, lb, kg
    pack_size_conversion: float = 1.0  # e.g., 1 case = 12 units
    last_purchase_price: float = 0.0
    tax_rate: float = 0.0


class SupplierExtendedUpdate(BaseModel):
    company_name: Optional[str] = None
    payment_terms: Optional[str] = None  # Cash, Transfer, Credit, Mixed
    has_credit: Optional[bool] = None
    credit_limit: Optional[float] = None
    usual_delivery_days: Optional[List[str]] = None
    tax_id: Optional[str] = None  # RFC / NIT
