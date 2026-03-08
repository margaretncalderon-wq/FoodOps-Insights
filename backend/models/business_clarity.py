# models/business_clarity.py - Business Clarity models
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime


# ============== INVOICE MODELS ==============

class InvoiceLineCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    linked_item_id: Optional[str] = None
    linked_item_type: Optional[str] = None  # menu_item, service, rental


class InvoiceCreate(BaseModel):
    client_id: str
    event_id: Optional[str] = None
    due_date: datetime
    lines: List[InvoiceLineCreate]
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    notes: Optional[str] = None


# ============== PAYMENT MODELS ==============

class PaymentCreate(BaseModel):
    """Payment record for Business Clarity"""
    client_id: str
    amount: float
    payment_method: str = "transfer"  # cash, transfer, card, check, other
    payment_date: Optional[datetime] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    stripe_session_id: Optional[str] = None


class Payment(BaseModel):
    """Full Payment model"""
    payment_id: str
    company_id: str
    client_id: str
    amount: float
    payment_method: str
    payment_date: datetime
    reference: Optional[str] = None
    notes: Optional[str] = None
    stripe_session_id: Optional[str] = None
    status: str = "completed"  # pending, completed, failed
    created_at: datetime
    updated_at: datetime


class PaymentApplicationCreate(BaseModel):
    """Apply payment to invoices"""
    payment_id: str
    applications: List[Dict[str, Any]]  # [{invoice_id, amount_applied}]


class PaymentApplication(BaseModel):
    """Payment application to invoice"""
    application_id: str
    payment_id: str
    invoice_id: str
    amount_applied: float
    created_at: datetime


# ============== STRIPE MODELS ==============

class StripePaymentTransaction(BaseModel):
    """Track Stripe payment transactions"""
    transaction_id: str
    company_id: str
    client_id: str
    invoice_ids: List[str] = []
    amount: float
    currency: str = "usd"
    session_id: str
    payment_status: str = "initiated"  # initiated, pending, paid, failed, expired
    metadata: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime


class InvoicePaymentRequest(BaseModel):
    """Request to pay invoice(s) via Stripe"""
    invoice_ids: List[str]
    origin_url: str


# ============== INVOICE MODELS ==============

class InvoiceExtended(BaseModel):
    """Extended Invoice with payment tracking"""
    invoice_id: str
    company_id: str
    client_id: str
    event_id: Optional[str] = None
    invoice_number: str
    issue_date: datetime
    due_date: datetime
    lines: List[Dict[str, Any]] = []
    subtotal: float = 0.0
    discount_percent: float = 0.0
    tax_rate: float = 0.0
    total: float = 0.0
    paid_amount: float = 0.0
    balance_due: float = 0.0
    status: str = "open"  # open, partially_paid, paid, overdue
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ============== CLIENT CREDIT MODELS ==============

class ClientCreditUpdate(BaseModel):
    """Update client credit settings"""
    has_credit: bool = False
    credit_limit: float = 0.0
    payment_terms: str = "immediate"  # immediate, net_7, net_15, net_30, custom


# ============== SUPPLIER PAYABLE MODELS ==============

class SupplierPayableCreate(BaseModel):
    """Create supplier payable"""
    supplier_id: str
    event_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    amount: float
    description: Optional[str] = None
    due_date: Optional[datetime] = None


class SupplierPayable(BaseModel):
    """Supplier payable record"""
    payable_id: str
    company_id: str
    supplier_id: str
    event_id: Optional[str] = None
    purchase_order_id: Optional[str] = None
    amount: float
    paid_amount: float = 0.0
    balance_due: float = 0.0
    status: str = "pending"  # pending, partially_paid, paid
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# ============== EXPENSE CATEGORIES MODELS (formerly Fixed Costs) ==============

# Category types for expense classification
EXPENSE_CATEGORY_TYPES = ["variable", "operating", "investment"]

class ExpenseCategoryCreate(BaseModel):
    """Create an expense category (extended from fixed cost category)"""
    name: str
    description: Optional[str] = None
    category_type: str = "operating"  # variable, operating, investment
    target_percent: Optional[float] = None  # Target as % of revenue (e.g., 30.0 for 30%)
    cost_center_id: Optional[str] = None
    active: bool = True


class ExpenseCategory(BaseModel):
    """Expense category (extended from fixed cost category)"""
    category_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    category_type: str = "operating"  # variable, operating, investment
    target_percent: Optional[float] = None
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None


# Backward compatibility aliases
FixedCostCategoryCreate = ExpenseCategoryCreate
FixedCostCategory = ExpenseCategory


class ExpenseCategoryBudgetCreate(BaseModel):
    """Create a budget for expense category"""
    category_id: str
    period: str = "MONTHLY"  # MONTHLY, QUARTERLY, YEARLY
    budget_amount: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None


class ExpenseCategoryBudget(BaseModel):
    """Budget entry for expense category"""
    budget_id: str
    company_id: str
    category_id: str
    period: str = "MONTHLY"
    budget_amount: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# Legacy aliases for backward compatibility
FixedCostBudgetCreate = ExpenseCategoryBudgetCreate
FixedCostBudget = ExpenseCategoryBudget


# ============== PERIOD CLOSE MODELS ==============

class PeriodStatus(BaseModel):
    """Period close status"""
    year: int
    month: int
    status: str = "open"  # open, in_review, closed
    closed_at: Optional[datetime] = None
    closed_by_user_id: Optional[str] = None
    reopened_count: int = 0


class CashSnapshotCreate(BaseModel):
    """Cash snapshot for period close"""
    bank_balance: float
    cash_on_hand: float
    pending_deposits: float = 0.0
    pending_payments: float = 0.0
    notes: Optional[str] = None


class PhysicalCountItem(BaseModel):
    """Physical count item for inventory"""
    ingredient_id: str
    expected_quantity: float
    actual_quantity: float
    variance: float = 0.0
    unit: str
    notes: Optional[str] = None


class PhysicalCountCreate(BaseModel):
    """Physical count submission"""
    items: List[PhysicalCountItem]
    counted_by: Optional[str] = None
    notes: Optional[str] = None
