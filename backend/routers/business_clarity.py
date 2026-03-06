# routers/business_clarity.py - Business Clarity routes
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import math

from config import db
from models.auth import User
from models.business_clarity import (
    PaymentCreate, Payment, PaymentApplicationCreate,
    InvoicePaymentRequest, ClientCreditUpdate,
    SupplierPayableCreate, FixedCostCategoryCreate, FixedCostBudgetCreate,
    CashSnapshotCreate, PhysicalCountCreate,
    InvoiceCreate, InvoiceLineCreate
)
from routers.auth import get_current_user
from utils.activity_logger import log_activity, user_info
from services.accounting_engine import AccountingEngine, TransactionType

# Stripe integration
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import os

business_clarity_router = APIRouter(prefix="/business-clarity", tags=["Business Clarity"])

# Stripe API Key
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')


# ============== PERMISSION HELPERS ==============

def check_finance_permission(user: User, action: str = "modify"):
    """
    Check if user has finance-level permissions.
    Finance actions require: owner, admin, or finance role.
    """
    allowed_roles = ["owner", "admin", "finance"]
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=403, 
            detail=f"Permission denied: {action} requires Finance, Admin, or Owner role"
        )

def check_edit_permission(user: User, action: str = "edit"):
    """
    Check if user has edit-level permissions.
    Edit actions require: owner, admin, finance, or editor role.
    """
    allowed_roles = ["owner", "admin", "finance", "editor"]
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=403, 
            detail=f"Permission denied: {action} requires Editor+ role"
        )

def check_owner_permission(user: User, action: str = "admin action"):
    """
    Check if user is owner (for critical operations).
    """
    if user.role != "owner":
        raise HTTPException(
            status_code=403, 
            detail=f"Permission denied: {action} requires Owner role"
        )


# ============== PERMISSIONS AUDIT ==============

PERMISSION_MATRIX = {
    "people_ops": {
        "name": "People Ops / RRHH",
        "description": "Gestión de empleados, nómina, vacaciones, offboarding",
        "modules": {
            "employees": {
                "name": "Empleados",
                "view": ["owner", "admin", "hr", "manager"],
                "edit": ["owner", "admin", "hr"],
                "delete": ["owner", "admin"]
            },
            "payroll": {
                "name": "Nómina",
                "view": ["owner", "admin", "hr"],
                "edit": ["owner", "admin", "hr"],
                "approve": ["owner", "admin"]
            },
            "time_off": {
                "name": "Vacaciones/Licencias",
                "view": ["owner", "admin", "hr", "manager"],
                "edit": ["owner", "admin", "hr"],
                "approve": ["owner", "admin", "hr", "manager"]
            },
            "offboarding": {
                "name": "Offboarding/Liquidaciones",
                "view": ["owner", "admin", "hr"],
                "edit": ["owner", "admin", "hr"],
                "approve": ["owner", "admin"]
            },
            "cost_centers": {
                "name": "Centros de Costo",
                "view": ["owner", "admin", "hr", "finance"],
                "edit": ["owner", "admin"],
                "budget": ["owner", "admin", "finance"]
            }
        }
    },
    "business_clarity": {
        "name": "Business Clarity / Finanzas",
        "description": "Facturas, pagos, reportes financieros, cuentas por pagar/cobrar",
        "modules": {
            "invoices": {
                "name": "Facturas",
                "view": ["owner", "admin", "finance", "editor", "viewer"],
                "create": ["owner", "admin", "finance", "editor"],
                "edit": ["owner", "admin", "finance", "editor"],
                "delete": ["owner", "admin", "finance"]
            },
            "payments": {
                "name": "Pagos",
                "view": ["owner", "admin", "finance", "viewer"],
                "create": ["owner", "admin", "finance"],
                "edit": ["owner", "admin", "finance"],
                "delete": ["owner", "admin"]
            },
            "supplier_payables": {
                "name": "Cuentas por Pagar",
                "view": ["owner", "admin", "finance", "viewer"],
                "create": ["owner", "admin", "finance"],
                "approve": ["owner", "admin", "finance"]
            },
            "fixed_costs": {
                "name": "Costos Fijos",
                "view": ["owner", "admin", "finance", "viewer"],
                "edit": ["owner", "admin", "finance"],
                "delete": ["owner", "admin", "finance"]
            },
            "reports": {
                "name": "Reportes Financieros",
                "executive": ["owner", "admin", "finance"],
                "sales": ["owner", "admin", "finance", "editor"],
                "pl_statement": ["owner", "admin", "finance"],
                "budget_alerts": ["owner", "admin", "finance", "hr"],
                "regulatory": ["owner", "admin", "finance"]
            },
            "close_period": {
                "name": "Cierre de Período",
                "view": ["owner", "admin", "finance"],
                "execute": ["owner", "admin"]
            }
        }
    },
    "demand_studio": {
        "name": "Demand Studio / Marketing",
        "description": "Campañas, contenido, métricas de redes sociales",
        "modules": {
            "campaigns": {
                "name": "Campañas",
                "view": ["owner", "admin", "editor", "viewer"],
                "create": ["owner", "admin", "editor"],
                "edit": ["owner", "admin", "editor"]
            },
            "social_metrics": {
                "name": "Métricas Sociales",
                "view": ["owner", "admin", "editor", "viewer"],
                "connect": ["owner", "admin", "editor"],
                "manual_entry": ["owner", "admin", "editor"]
            },
            "content": {
                "name": "Contenido",
                "view": ["owner", "admin", "editor", "viewer"],
                "create": ["owner", "admin", "editor"],
                "publish": ["owner", "admin", "editor"]
            }
        }
    }
}


@business_clarity_router.get("/permissions/audit")
async def get_permissions_audit(
    user: User = Depends(get_current_user),
    module: str = None
):
    """
    Get the permissions matrix for auditing who has access to what.
    Only owners and admins can view this.
    """
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can view permissions audit")
    
    if module and module in PERMISSION_MATRIX:
        return {
            "module": module,
            "permissions": PERMISSION_MATRIX[module],
            "requesting_user": {
                "user_id": user.user_id,
                "role": user.role,
                "email": user.email
            }
        }
    
    return {
        "permissions_matrix": PERMISSION_MATRIX,
        "role_descriptions": {
            "owner": "Acceso completo a todos los módulos y configuraciones",
            "admin": "Acceso completo excepto configuraciones críticas de seguridad",
            "hr": "Acceso a People Ops, limitado en aprobación de nómina",
            "finance": "Acceso a Business Clarity y reportes financieros",
            "manager": "Vista limitada de su equipo en People Ops",
            "editor": "Crear y editar contenido, facturas, campañas",
            "viewer": "Solo lectura en módulos asignados"
        },
        "requesting_user": {
            "user_id": user.user_id,
            "role": user.role,
            "email": user.email
        }
    }


@business_clarity_router.get("/permissions/my-access")
async def get_my_permissions(user: User = Depends(get_current_user)):
    """
    Get what the current user can access based on their role.
    """
    role = user.role
    my_access = {}
    
    for area_key, area_data in PERMISSION_MATRIX.items():
        area_access = {
            "name": area_data["name"],
            "description": area_data["description"],
            "modules": {}
        }
        
        for module_key, module_data in area_data["modules"].items():
            module_access = {"name": module_data["name"], "permissions": []}
            
            for action, allowed_roles in module_data.items():
                if action == "name":
                    continue
                if isinstance(allowed_roles, list) and role in allowed_roles:
                    module_access["permissions"].append(action)
            
            if module_access["permissions"]:
                area_access["modules"][module_key] = module_access
        
        if area_access["modules"]:
            my_access[area_key] = area_access
    
    return {
        "user": {
            "user_id": user.user_id,
            "email": user.email,
            "role": role
        },
        "access": my_access
    }


@business_clarity_router.get("/dashboard")
async def get_business_clarity_dashboard(user: User = Depends(get_current_user), target_margin: int = 30):
    """Get Business Clarity executive dashboard"""
    now = datetime.now(timezone.utc)
    
    def parse_due_date(due_date):
        """Parse due_date to timezone-aware datetime"""
        if due_date is None:
            return None
        if isinstance(due_date, datetime):
            if due_date.tzinfo is None:
                return due_date.replace(tzinfo=timezone.utc)
            return due_date
        if isinstance(due_date, str):
            try:
                dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except:
                return None
        return None
    
    # Get invoices with balances
    invoices = await db.invoices.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    total_receivables = sum(inv.get("balance_due", inv.get("total", 0)) for inv in invoices if inv.get("status") != "paid")
    
    # Calculate overdue with safe datetime parsing
    total_overdue = 0
    for inv in invoices:
        if inv.get("status") == "paid":
            continue
        due_dt = parse_due_date(inv.get("due_date"))
        if due_dt and due_dt < now:
            total_overdue += inv.get("balance_due", inv.get("total", 0))
    
    # Get payables
    payables = await db.supplier_payables.find(
        {"company_id": user.company_id, "status": {"$ne": "paid"}},
        {"_id": 0}
    ).to_list(1000)
    total_payables = sum(p.get("balance_due", p.get("amount", 0)) for p in payables)
    
    # Get recent payments
    recent_payments = await db.payments.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Aging buckets
    aging = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
    for inv in invoices:
        if inv.get("status") == "paid":
            continue
        balance = inv.get("balance_due", inv.get("total", 0))
        due_dt = parse_due_date(inv.get("due_date"))
        if due_dt:
            days_overdue = (now - due_dt).days
            if days_overdue <= 0:
                aging["current"] += balance
            elif days_overdue <= 30:
                aging["1_30"] += balance
            elif days_overdue <= 60:
                aging["31_60"] += balance
            elif days_overdue <= 90:
                aging["61_90"] += balance
            else:
                aging["90_plus"] += balance
        else:
            aging["current"] += balance
    
    # ============== PROFIT SIGNALS (Decision Indicators) ==============
    # Get event profitability data
    events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0, "event_id": 1, "total_quoted": 1, "total_cost": 1}
    ).to_list(1000)
    
    # Calculate margin for each event
    negative_margin_count = 0
    below_target_count = 0  # Below target margin
    
    for event in events:
        revenue = event.get("total_quoted", 0)
        costs = event.get("total_cost", 0)
        if revenue > 0:
            margin = ((revenue - costs) / revenue) * 100
            if margin < 0:
                negative_margin_count += 1
            elif margin < target_margin:
                below_target_count += 1
    
    # Unassigned costs (payables without event_id)
    all_payables = await db.supplier_payables.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    unassigned_costs = sum(
        p.get("balance_due", p.get("amount", 0)) 
        for p in all_payables 
        if not p.get("event_id") and p.get("status") != "paid"
    )
    
    # Cash gap: paid to suppliers vs collected from clients
    total_paid_to_suppliers = sum(
        p.get("amount", 0) - p.get("balance_due", p.get("amount", 0))
        for p in all_payables
    )
    
    paid_payments = await db.payments.find(
        {"company_id": user.company_id},
        {"_id": 0, "amount": 1}
    ).to_list(1000)
    total_collected = sum(p.get("amount", 0) for p in paid_payments)
    
    profit_signals = {
        "negative_margin_count": negative_margin_count,
        "below_target_count": below_target_count,
        "unassigned_costs": round(unassigned_costs, 2),
        "paid_to_suppliers": round(total_paid_to_suppliers, 2),
        "collected_from_clients": round(total_collected, 2)
    }
    
    return {
        "total_receivables": round(total_receivables, 2),
        "total_overdue": round(total_overdue, 2),
        "total_payables": round(total_payables, 2),
        "aging_buckets": {k: round(v, 2) for k, v in aging.items()},
        "recent_payments": recent_payments,
        "invoices_count": len(invoices),
        "open_invoices_count": len([i for i in invoices if i.get("status") != "paid"]),
        "profit_signals": profit_signals
    }

# ============== INVOICE MANAGEMENT ==============

@business_clarity_router.get("/invoices")
async def get_all_invoices(
    client_id: Optional[str] = None,
    event_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all invoices with payment status"""
    query = {"company_id": user.company_id}
    if client_id:
        query["client_id"] = client_id
    if event_id:
        query["event_id"] = event_id
    if status:
        query["status"] = status
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with client and event names
    for inv in invoices:
        if inv.get("client_id"):
            client = await db.clients.find_one({"client_id": inv["client_id"]}, {"_id": 0, "display_name": 1})
            inv["client_name"] = client.get("display_name") if client else None
        if inv.get("event_id"):
            event = await db.events.find_one({"event_id": inv["event_id"]}, {"_id": 0, "name": 1})
            inv["event_name"] = event.get("name") if event else None
    
    return invoices

@business_clarity_router.post("/invoices")
async def create_invoice(data: InvoiceCreate, user: User = Depends(get_current_user)):
    """Create a new invoice"""
    check_edit_permission(user, "create invoices")
    
    now = datetime.now(timezone.utc)
    
    # Calculate totals
    subtotal = sum(
        line.quantity * line.unit_price * (1 - line.discount_percent / 100)
        for line in data.lines
    )
    tax_amount = subtotal * (data.tax_rate / 100)
    total = subtotal * (1 - data.discount_percent / 100) + tax_amount
    
    # Generate invoice number
    count = await db.invoices.count_documents({"company_id": user.company_id})
    invoice_number = f"INV-{now.year}-{str(count + 1).zfill(4)}"
    
    invoice = {
        "invoice_id": f"inv_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "client_id": data.client_id,
        "event_id": data.event_id,
        "invoice_number": invoice_number,
        "issue_date": now.isoformat(),
        "due_date": data.due_date.isoformat(),
        "lines": [line.model_dump() for line in data.lines],
        "subtotal": round(subtotal, 2),
        "discount_percent": data.discount_percent,
        "tax_rate": data.tax_rate,
        "total": round(total, 2),
        "paid_amount": 0.0,
        "balance_due": round(total, 2),
        "status": "open",
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.invoices.insert_one(invoice)
    
    # Get client name for accounting entry
    client = await db.clients.find_one({"client_id": data.client_id}, {"_id": 0, "name": 1})
    invoice["client_name"] = client.get("name") if client else "Cliente"
    
    # Record in accounting engine (revenue)
    try:
        accounting_engine = AccountingEngine(db, user.company_id, user.user_id)
        await accounting_engine.record_invoice(invoice)
    except Exception as e:
        # Log error but don't fail the invoice creation
        import logging
        logging.error(f"Failed to record invoice in accounting engine: {e}")
    
    # Log activity
    await log_activity(
        module="business_clarity",
        action="create",
        entity_type="invoice",
        entity_id=invoice["invoice_id"],
        entity_name=invoice_number,
        event_id=data.event_id,
        **user_info(user)
    )
    
    del invoice["_id"]
    return invoice

@business_clarity_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: User = Depends(get_current_user)):
    """Get invoice details with payment history"""
    invoice = await db.invoices.find_one(
        {"invoice_id": invoice_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get payment applications
    applications = await db.payment_applications.find(
        {"invoice_id": invoice_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get payment details for each application
    for app in applications:
        payment = await db.payments.find_one(
            {"payment_id": app["payment_id"]},
            {"_id": 0, "payment_date": 1, "payment_method": 1, "reference": 1}
        )
        if payment:
            app["payment_date"] = payment.get("payment_date")
            app["payment_method"] = payment.get("payment_method")
            app["reference"] = payment.get("reference")
    
    invoice["payment_applications"] = applications
    
    return invoice

# ============== PAYMENT MANAGEMENT ==============

@business_clarity_router.post("/payments")
async def create_payment(data: PaymentCreate, user: User = Depends(get_current_user)):
    """Create a payment record"""
    check_finance_permission(user, "record payments")
    
    now = datetime.now(timezone.utc)
    
    payment = {
        "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "client_id": data.client_id,
        "amount": data.amount,
        "payment_method": data.payment_method,
        "payment_date": (data.payment_date or now).isoformat(),
        "reference": data.reference,
        "notes": data.notes,
        "stripe_session_id": data.stripe_session_id,
        "status": "completed",
        "applied_amount": 0.0,
        "unapplied_amount": data.amount,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.payments.insert_one(payment)
    
    # Log activity
    await log_activity(
        module="business_clarity",
        action="create",
        entity_type="payment",
        entity_id=payment["payment_id"],
        entity_name=f"${data.amount:.2f} - {data.payment_method}",
        **user_info(user)
    )
    
    del payment["_id"]
    return payment

@business_clarity_router.get("/payments")
async def get_payments(
    client_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all payments"""
    query = {"company_id": user.company_id}
    if client_id:
        query["client_id"] = client_id
    
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with client names
    for pay in payments:
        if pay.get("client_id"):
            client = await db.clients.find_one({"client_id": pay["client_id"]}, {"_id": 0, "display_name": 1})
            pay["client_name"] = client.get("display_name") if client else None
    
    return payments

@business_clarity_router.post("/payments/{payment_id}/apply")
async def apply_payment_to_invoices(payment_id: str, data: PaymentApplicationCreate, user: User = Depends(get_current_user)):
    """Apply a payment to one or multiple invoices"""
    now = datetime.now(timezone.utc)
    
    # Get payment
    payment = await db.payments.find_one(
        {"payment_id": payment_id, "company_id": user.company_id}
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    unapplied = payment.get("unapplied_amount", payment.get("amount", 0))
    total_to_apply = sum(app["amount_applied"] for app in data.applications)
    
    if total_to_apply > unapplied + 0.01:  # Small tolerance for floating point
        raise HTTPException(status_code=400, detail=f"Cannot apply ${total_to_apply:.2f}. Only ${unapplied:.2f} available.")
    
    applications_created = []
    
    for app in data.applications:
        invoice_id = app["invoice_id"]
        amount_to_apply = app["amount_applied"]
        
        # Get invoice
        invoice = await db.invoices.find_one(
            {"invoice_id": invoice_id, "company_id": user.company_id}
        )
        if not invoice:
            continue
        
        balance_due = invoice.get("balance_due", invoice.get("total", 0))
        actual_apply = min(amount_to_apply, balance_due)
        
        if actual_apply <= 0:
            continue
        
        # Create application record
        application = {
            "application_id": f"app_{uuid.uuid4().hex[:12]}",
            "payment_id": payment_id,
            "invoice_id": invoice_id,
            "amount_applied": actual_apply,
            "created_at": now.isoformat()
        }
        await db.payment_applications.insert_one(application)
        
        # Update invoice
        new_paid = invoice.get("paid_amount", 0) + actual_apply
        new_balance = invoice.get("total", 0) - new_paid
        new_status = "paid" if new_balance <= 0.01 else ("partially_paid" if new_paid > 0 else "open")
        
        await db.invoices.update_one(
            {"invoice_id": invoice_id},
            {"$set": {
                "paid_amount": round(new_paid, 2),
                "balance_due": round(max(0, new_balance), 2),
                "status": new_status,
                "updated_at": now.isoformat()
            }}
        )
        
        del application["_id"]
        applications_created.append(application)
    
    # Update payment
    total_applied = sum(a["amount_applied"] for a in applications_created)
    new_applied = payment.get("applied_amount", 0) + total_applied
    new_unapplied = payment.get("amount", 0) - new_applied
    
    await db.payments.update_one(
        {"payment_id": payment_id},
        {"$set": {
            "applied_amount": round(new_applied, 2),
            "unapplied_amount": round(max(0, new_unapplied), 2),
            "updated_at": now.isoformat()
        }}
    )
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "payment_applied",
        "entity_type": "payment",
        "entity_id": payment_id,
        "details": {"applications": [{"invoice_id": a["invoice_id"], "amount": a["amount_applied"]} for a in applications_created]},
        "created_at": now.isoformat()
    })
    
    return {"applications": applications_created, "total_applied": total_applied}

# ============== STRIPE PAYMENT INTEGRATION ==============

@business_clarity_router.post("/checkout/session")
async def create_stripe_checkout(request: Request, data: InvoicePaymentRequest, user: User = Depends(get_current_user)):
    """Create Stripe checkout session for invoice payment"""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    # Get invoices and calculate total
    invoices = []
    total_amount = 0.0
    client_id = None
    
    for inv_id in data.invoice_ids:
        invoice = await db.invoices.find_one(
            {"invoice_id": inv_id, "company_id": user.company_id},
            {"_id": 0}
        )
        if invoice and invoice.get("balance_due", 0) > 0:
            invoices.append(invoice)
            total_amount += invoice.get("balance_due", invoice.get("total", 0))
            if not client_id:
                client_id = invoice.get("client_id")
    
    if not invoices:
        raise HTTPException(status_code=400, detail="No invoices with balance due")
    
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be greater than 0")
    
    now = datetime.now(timezone.utc)
    
    # Create Stripe checkout
    host_url = data.origin_url
    webhook_url = f"{str(request.base_url).rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    success_url = f"{host_url}/business-clarity/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{host_url}/business-clarity/invoices"
    
    metadata = {
        "company_id": user.company_id,
        "client_id": client_id or "",
        "invoice_ids": ",".join(data.invoice_ids),
        "user_id": user.user_id
    }
    
    checkout_request = CheckoutSessionRequest(
        amount=float(total_amount),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = {
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "client_id": client_id,
        "invoice_ids": data.invoice_ids,
        "amount": round(total_amount, 2),
        "currency": "usd",
        "session_id": session.session_id,
        "payment_status": "initiated",
        "metadata": metadata,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.payment_transactions.insert_one(transaction)
    
    return {"url": session.url, "session_id": session.session_id}

@business_clarity_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, user: User = Depends(get_current_user)):
    """Get Stripe checkout status and process payment if successful"""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    # Get transaction
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "company_id": user.company_id}
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed, return current status
    if transaction.get("payment_status") == "paid":
        return {
            "status": "complete",
            "payment_status": "paid",
            "amount": transaction.get("amount"),
            "payment_id": transaction.get("payment_id")
        }
    
    # Check Stripe status
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status = await stripe_checkout.get_checkout_status(session_id)
    
    now = datetime.now(timezone.utc)
    
    if status.payment_status == "paid" and transaction.get("payment_status") != "paid":
        # Process the payment
        client_id = transaction.get("client_id")
        amount = transaction.get("amount", 0)
        invoice_ids = transaction.get("invoice_ids", [])
        
        # Create payment record
        payment = {
            "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "client_id": client_id,
            "amount": amount,
            "payment_method": "card",
            "payment_date": now.isoformat(),
            "reference": f"Stripe: {session_id}",
            "notes": f"Online payment via Stripe",
            "stripe_session_id": session_id,
            "status": "completed",
            "applied_amount": 0.0,
            "unapplied_amount": amount,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.payments.insert_one(payment)
        
        # Auto-apply to invoices
        remaining = amount
        for inv_id in invoice_ids:
            if remaining <= 0:
                break
            
            invoice = await db.invoices.find_one({"invoice_id": inv_id, "company_id": user.company_id})
            if not invoice:
                continue
            
            balance = invoice.get("balance_due", invoice.get("total", 0))
            to_apply = min(remaining, balance)
            
            if to_apply > 0:
                # Create application
                app = {
                    "application_id": f"app_{uuid.uuid4().hex[:12]}",
                    "payment_id": payment["payment_id"],
                    "invoice_id": inv_id,
                    "amount_applied": to_apply,
                    "created_at": now.isoformat()
                }
                await db.payment_applications.insert_one(app)
                
                # Update invoice
                new_paid = invoice.get("paid_amount", 0) + to_apply
                new_balance = invoice.get("total", 0) - new_paid
                new_status = "paid" if new_balance <= 0.01 else "partially_paid"
                
                await db.invoices.update_one(
                    {"invoice_id": inv_id},
                    {"$set": {
                        "paid_amount": round(new_paid, 2),
                        "balance_due": round(max(0, new_balance), 2),
                        "status": new_status,
                        "updated_at": now.isoformat()
                    }}
                )
                
                remaining -= to_apply
        
        # Update payment applied amounts
        applied = amount - remaining
        await db.payments.update_one(
            {"payment_id": payment["payment_id"]},
            {"$set": {
                "applied_amount": round(applied, 2),
                "unapplied_amount": round(remaining, 2),
                "updated_at": now.isoformat()
            }}
        )
        
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "payment_id": payment["payment_id"],
                "updated_at": now.isoformat()
            }}
        )
        
        # Audit log
        await db.audit_logs.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "company_id": user.company_id,
            "user_id": user.user_id,
            "action": "stripe_payment_completed",
            "entity_type": "payment",
            "entity_id": payment["payment_id"],
            "details": {"amount": amount, "session_id": session_id, "invoice_ids": invoice_ids},
            "created_at": now.isoformat()
        })
        
        return {
            "status": "complete",
            "payment_status": "paid",
            "amount": amount,
            "payment_id": payment["payment_id"]
        }
    
    elif status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "updated_at": now.isoformat()}}
        )
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount": status.amount_total / 100 if status.amount_total else 0
    }

# Stripe Webhook - Note: This should be at api_router level, keeping in business_clarity for now
@business_clarity_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    try:
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        if STRIPE_API_KEY:
            stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
            webhook_response = await stripe_checkout.handle_webhook(body, signature)
            
            if webhook_response and webhook_response.payment_status == "paid":
                # Find and update transaction
                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

# ============== CLIENT FINANCIAL VIEW ==============

@business_clarity_router.get("/clients/{client_id}/financial")
async def get_client_financial_view(client_id: str, user: User = Depends(get_current_user)):
    """Get client account statement / financial view"""
    # Get client
    client = await db.clients.find_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get all invoices for client
    invoices = await db.invoices.find(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("issue_date", 1).to_list(1000)
    
    # Enrich invoices with event names
    for inv in invoices:
        if inv.get("event_id"):
            event = await db.events.find_one({"event_id": inv["event_id"]}, {"_id": 0, "name": 1})
            inv["event_name"] = event.get("name") if event else None
    
    # Get all payments for client
    payments = await db.payments.find(
        {"client_id": client_id, "company_id": user.company_id},
        {"_id": 0}
    ).sort("payment_date", 1).to_list(1000)
    
    # Get payment applications
    for pay in payments:
        applications = await db.payment_applications.find(
            {"payment_id": pay["payment_id"]},
            {"_id": 0}
        ).to_list(100)
        pay["applications"] = applications
    
    # Calculate running balance (activity log)
    activity = []
    balance = 0.0
    
    # Combine invoices and payments, sort by date
    all_items = []
    for inv in invoices:
        all_items.append({
            "type": "invoice",
            "date": inv.get("issue_date"),
            "data": inv
        })
    for pay in payments:
        all_items.append({
            "type": "payment",
            "date": pay.get("payment_date"),
            "data": pay
        })
    
    all_items.sort(key=lambda x: x["date"] or "")
    
    for item in all_items:
        if item["type"] == "invoice":
            inv = item["data"]
            balance += inv.get("total", 0)
            activity.append({
                "date": inv.get("issue_date"),
                "type": "invoice",
                "description": f"Invoice {inv.get('invoice_number')}",
                "reference": inv.get("invoice_id"),
                "debit": inv.get("total", 0),
                "credit": 0,
                "balance": round(balance, 2)
            })
        else:
            pay = item["data"]
            balance -= pay.get("amount", 0)
            activity.append({
                "date": pay.get("payment_date"),
                "type": "payment",
                "description": f"Payment ({pay.get('payment_method', 'N/A')})",
                "reference": pay.get("payment_id"),
                "debit": 0,
                "credit": pay.get("amount", 0),
                "balance": round(balance, 2)
            })
    
    # Summary
    total_invoiced = sum(inv.get("total", 0) for inv in invoices)
    total_paid = sum(pay.get("amount", 0) for pay in payments)
    current_balance = total_invoiced - total_paid
    
    # Credit warnings
    warnings = []
    if client.get("has_credit") and client.get("credit_limit", 0) > 0:
        if current_balance > client.get("credit_limit", 0):
            warnings.append(f"Credit limit exceeded: ${current_balance:.2f} / ${client.get('credit_limit', 0):.2f}")
    
    overdue_invoices = [inv for inv in invoices if inv.get("status") not in ["paid"] and inv.get("due_date")]
    now = datetime.now(timezone.utc)
    for inv in overdue_invoices:
        try:
            due_dt = datetime.fromisoformat(inv["due_date"].replace("Z", "+00:00"))
            if due_dt < now:
                warnings.append(f"Overdue invoice: {inv.get('invoice_number')} (${inv.get('balance_due', 0):.2f})")
        except:
            pass
    
    return {
        "client": client,
        "invoices": invoices,
        "payments": payments,
        "activity": activity,
        "summary": {
            "total_invoiced": round(total_invoiced, 2),
            "total_paid": round(total_paid, 2),
            "current_balance": round(current_balance, 2),
            "invoices_count": len(invoices),
            "payments_count": len(payments)
        },
        "warnings": warnings
    }

# ============== ACCOUNTS RECEIVABLE ==============

@business_clarity_router.get("/accounts-receivable")
async def get_accounts_receivable(user: User = Depends(get_current_user)):
    """Get accounts receivable with aging analysis"""
    now = datetime.now(timezone.utc)
    
    # Get all open invoices
    invoices = await db.invoices.find(
        {"company_id": user.company_id, "status": {"$ne": "paid"}},
        {"_id": 0}
    ).to_list(1000)
    
    ar_records = []
    aging = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
    total_outstanding = 0
    total_overdue = 0
    
    for inv in invoices:
        balance = inv.get("balance_due", inv.get("total", 0))
        total_outstanding += balance
        
        # Get client and event names
        client_name = None
        event_name = None
        if inv.get("client_id"):
            client = await db.clients.find_one({"client_id": inv["client_id"]}, {"_id": 0, "display_name": 1})
            client_name = client.get("display_name") if client else None
        if inv.get("event_id"):
            event = await db.events.find_one({"event_id": inv["event_id"]}, {"_id": 0, "name": 1})
            event_name = event.get("name") if event else None
        
        # Calculate aging
        days_overdue = 0
        status = "current"
        due_date = inv.get("due_date")
        
        if due_date:
            try:
                due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                days_overdue = max(0, (now - due_dt).days)
                
                if days_overdue > 0:
                    total_overdue += balance
                    status = "overdue"
                    if days_overdue <= 30:
                        aging["1_30"] += balance
                    elif days_overdue <= 60:
                        aging["31_60"] += balance
                    elif days_overdue <= 90:
                        aging["61_90"] += balance
                    else:
                        aging["90_plus"] += balance
                else:
                    aging["current"] += balance
            except:
                aging["current"] += balance
        else:
            aging["current"] += balance
        
        ar_records.append({
            "invoice_id": inv.get("invoice_id"),
            "invoice_number": inv.get("invoice_number"),
            "client_id": inv.get("client_id"),
            "client_name": client_name,
            "event_id": inv.get("event_id"),
            "event_name": event_name,
            "issue_date": inv.get("issue_date"),
            "due_date": due_date,
            "total": inv.get("total", 0),
            "paid_amount": inv.get("paid_amount", 0),
            "balance_due": balance,
            "days_overdue": days_overdue,
            "status": status
        })
    
    # Sort by days overdue desc
    ar_records.sort(key=lambda x: x["days_overdue"], reverse=True)
    
    return {
        "records": ar_records,
        "aging_buckets": {k: round(v, 2) for k, v in aging.items()},
        "summary": {
            "total_outstanding": round(total_outstanding, 2),
            "total_overdue": round(total_overdue, 2),
            "total_current": round(aging["current"], 2),
            "invoices_count": len(ar_records),
            "overdue_count": len([r for r in ar_records if r["status"] == "overdue"])
        }
    }

# ============== ACCOUNTS PAYABLE ==============

@business_clarity_router.get("/accounts-payable")
async def get_accounts_payable(user: User = Depends(get_current_user)):
    """Get accounts payable overview"""
    # Get payables from supplier_payables collection
    payables = await db.supplier_payables.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Also include unpaid expenses
    expenses = await db.expenses.find(
        {"company_id": user.company_id, "payment_status": {"$ne": "Paid"}},
        {"_id": 0}
    ).to_list(1000)
    
    records = []
    total_pending = 0
    total_paid = 0
    
    for exp in expenses:
        supplier_name = None
        event_name = None
        
        if exp.get("supplier_id"):
            supplier = await db.suppliers.find_one({"supplier_id": exp["supplier_id"]}, {"_id": 0, "name": 1})
            supplier_name = supplier.get("name") if supplier else None
        if exp.get("event_id"):
            event = await db.events.find_one({"event_id": exp["event_id"]}, {"_id": 0, "name": 1})
            event_name = event.get("name") if event else None
        
        amount = exp.get("amount", 0)
        status = exp.get("payment_status", "Pending")
        
        if status != "Paid":
            total_pending += amount
        else:
            total_paid += amount
        
        records.append({
            "payable_id": exp.get("expense_id"),
            "type": "expense",
            "supplier_id": exp.get("supplier_id"),
            "supplier_name": supplier_name,
            "event_id": exp.get("event_id"),
            "event_name": event_name,
            "cost_center": exp.get("cost_center"),
            "fixed_cost_category_id": exp.get("fixed_cost_category_id"),
            "description": exp.get("description", exp.get("vendor_name")),
            "amount": amount,
            "paid_amount": 0 if status != "Paid" else amount,
            "balance_due": amount if status != "Paid" else 0,
            "status": status.lower(),
            "date": exp.get("expense_date") or exp.get("created_at"),
            "due_date": exp.get("due_date")
        })
    
    # Add supplier payables
    for pay in payables:
        supplier_name = pay.get("supplier_name")  # First check stored supplier_name
        event_name = None
        
        if not supplier_name and pay.get("supplier_id"):
            supplier = await db.suppliers.find_one({"supplier_id": pay["supplier_id"]}, {"_id": 0, "name": 1})
            supplier_name = supplier.get("name") if supplier else None
        if pay.get("event_id"):
            event = await db.events.find_one({"event_id": pay["event_id"]}, {"_id": 0, "name": 1})
            event_name = event.get("name") if event else None
        
        balance = pay.get("balance_due", pay.get("amount", 0))
        if pay.get("status") != "paid":
            total_pending += balance
        
        records.append({
            "payable_id": pay.get("payable_id"),
            "type": "payable",
            "supplier_id": pay.get("supplier_id"),
            "supplier_name": supplier_name,
            "event_id": pay.get("event_id"),
            "event_name": event_name,
            "cost_center": pay.get("cost_center"),
            "fixed_cost_category_id": pay.get("fixed_cost_category_id"),
            "description": pay.get("description"),
            "amount": pay.get("amount", 0),
            "paid_amount": pay.get("paid_amount", 0),
            "balance_due": balance,
            "status": pay.get("status", "pending"),
            "date": pay.get("created_at"),
            "due_date": pay.get("due_date")
        })
    
    # Sort by date desc
    records.sort(key=lambda x: x.get("date") or "", reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_pending": round(total_pending, 2),
            "total_paid": round(total_paid, 2),
            "records_count": len(records),
            "pending_count": len([r for r in records if r["status"] not in ["paid"]])
        }
    }

# Assign payable to event or cost center
class PayableAssignment(BaseModel):
    event_id: Optional[str] = None
    cost_center: Optional[str] = None
    fixed_cost_category_id: Optional[str] = None

@business_clarity_router.put("/payables/{payable_id}/assign")
async def assign_payable(payable_id: str, data: PayableAssignment, user: User = Depends(get_current_user)):
    """Assign a payable/expense to an event, cost center, or fixed cost category"""
    now = datetime.now(timezone.utc)
    
    # Handle "none" values from frontend
    event_id = data.event_id if data.event_id and data.event_id != "none" else None
    cost_center = data.cost_center if data.cost_center and data.cost_center != "none" else None
    fixed_cost_category_id = data.fixed_cost_category_id if data.fixed_cost_category_id and data.fixed_cost_category_id != "none" else None
    
    # Build update data based on assignment type (mutually exclusive)
    update_data = {"updated_at": now.isoformat()}
    cost_center_id_for_accounting = None
    cost_center_name_for_accounting = None
    
    if event_id:
        update_data["event_id"] = event_id
        update_data["cost_center"] = None
        update_data["fixed_cost_category_id"] = None
    elif fixed_cost_category_id:
        update_data["fixed_cost_category_id"] = fixed_cost_category_id
        update_data["event_id"] = None
        update_data["cost_center"] = None
        # Get the cost center linked to this fixed cost category
        fc_cat = await db.fixed_cost_categories.find_one(
            {"category_id": fixed_cost_category_id, "company_id": user.company_id},
            {"_id": 0, "cost_center_id": 1}
        )
        if fc_cat and fc_cat.get("cost_center_id"):
            cost_center_id_for_accounting = fc_cat["cost_center_id"]
            cc = await db.cost_centers.find_one(
                {"cost_center_id": cost_center_id_for_accounting},
                {"_id": 0, "name": 1}
            )
            cost_center_name_for_accounting = cc.get("name") if cc else None
    elif cost_center:
        update_data["cost_center"] = cost_center
        update_data["event_id"] = None
        update_data["fixed_cost_category_id"] = None
    else:
        update_data["event_id"] = None
        update_data["cost_center"] = None
        update_data["fixed_cost_category_id"] = None
    
    # Try to find in expenses first
    expense = await db.expenses.find_one({
        "expense_id": payable_id,
        "company_id": user.company_id
    })
    
    if expense:
        await db.expenses.update_one(
            {"expense_id": payable_id},
            {"$set": update_data}
        )
        
        # Record accounting entry if assigned to a cost center
        if cost_center_id_for_accounting:
            from services.accounting_engine import AccountingEngine
            try:
                engine = AccountingEngine(db, user.company_id, user.user_id)
                await engine.record_expense(
                    {**expense, "expense_id": payable_id},
                    cost_center_id_for_accounting,
                    cost_center_name_for_accounting
                )
            except Exception as e:
                print(f"Warning: Failed to record accounting entry: {e}")
        
        return {"message": "Expense assigned successfully", "type": "expense"}
    
    # Try in supplier_payables
    payable = await db.supplier_payables.find_one({
        "payable_id": payable_id,
        "company_id": user.company_id
    })
    
    if payable:
        await db.supplier_payables.update_one(
            {"payable_id": payable_id},
            {"$set": update_data}
        )
        
        # Record accounting entry if assigned to a cost center
        if cost_center_id_for_accounting:
            from services.accounting_engine import AccountingEngine
            try:
                engine = AccountingEngine(db, user.company_id, user.user_id)
                await engine.record_supplier_payable(
                    {**payable, "payable_id": payable_id},
                    cost_center_id_for_accounting,
                    cost_center_name_for_accounting
                )
            except Exception as e:
                print(f"Warning: Failed to record accounting entry: {e}")
        
        return {"message": "Payable assigned successfully", "type": "payable"}
    
    raise HTTPException(status_code=404, detail="Payable not found")


# ============== PAYMENT REGISTRATION FOR PAYABLES ==============

class RegisterPaymentRequest(BaseModel):
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None  # cash, transfer, check, card
    reference: Optional[str] = None  # payment reference/check number
    notes: Optional[str] = None


@business_clarity_router.post("/payables/{payable_id}/payments")
async def register_payable_payment(
    payable_id: str,
    data: RegisterPaymentRequest,
    user: User = Depends(get_current_user)
):
    """Register a payment (partial or full) for a payable/expense"""
    check_finance_permission(user, "register payments")
    
    now = datetime.now(timezone.utc)
    payment_date = data.payment_date or now.strftime("%Y-%m-%d")
    
    # Try to find in supplier_payables first
    payable = await db.supplier_payables.find_one({
        "payable_id": payable_id,
        "company_id": user.company_id
    })
    
    collection = "supplier_payables"
    id_field = "payable_id"
    
    if not payable:
        # Try expenses collection
        payable = await db.expenses.find_one({
            "expense_id": payable_id,
            "company_id": user.company_id
        })
        collection = "expenses"
        id_field = "expense_id"
    
    if not payable:
        raise HTTPException(status_code=404, detail="Payable not found")
    
    # Calculate new amounts
    current_paid = payable.get("paid_amount", 0) or 0
    total_amount = payable.get("amount", 0) or payable.get("total", 0)
    balance_due = payable.get("balance_due", total_amount - current_paid)
    
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    if data.amount > balance_due + 0.01:  # Small tolerance for rounding
        raise HTTPException(status_code=400, detail=f"Payment amount ({data.amount}) exceeds balance due ({balance_due})")
    
    new_paid = round(current_paid + data.amount, 2)
    new_balance = round(total_amount - new_paid, 2)
    new_status = "paid" if new_balance <= 0.01 else "partial"
    
    # Create payment record
    payment_id = f"pmt_{uuid.uuid4().hex[:12]}"
    payment_record = {
        "payment_id": payment_id,
        "payable_id": payable_id,
        "amount": round(data.amount, 2),
        "payment_date": payment_date,
        "payment_method": data.payment_method,
        "reference": data.reference,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    # Update the payable
    update_data = {
        "paid_amount": new_paid,
        "balance_due": new_balance,
        "status": new_status,
        "updated_at": now.isoformat(),
        "updated_by": user.user_id
    }
    
    # Add payment to history
    if collection == "supplier_payables":
        await db.supplier_payables.update_one(
            {"payable_id": payable_id, "company_id": user.company_id},
            {
                "$set": update_data,
                "$push": {"payments": payment_record}
            }
        )
    else:
        await db.expenses.update_one(
            {"expense_id": payable_id, "company_id": user.company_id},
            {
                "$set": update_data,
                "$push": {"payments": payment_record}
            }
        )
    
    return {
        "success": True,
        "payment": payment_record,
        "payable": {
            "payable_id": payable_id,
            "total_amount": total_amount,
            "paid_amount": new_paid,
            "balance_due": new_balance,
            "status": new_status
        }
    }


@business_clarity_router.post("/payables/{payable_id}/mark-paid")
async def mark_payable_as_paid(
    payable_id: str,
    user: User = Depends(get_current_user)
):
    """Mark a payable as fully paid (convenience endpoint)"""
    check_finance_permission(user, "register payments")
    
    now = datetime.now(timezone.utc)
    
    # Try supplier_payables first
    payable = await db.supplier_payables.find_one({
        "payable_id": payable_id,
        "company_id": user.company_id
    })
    
    collection = "supplier_payables"
    id_field = "payable_id"
    
    if not payable:
        payable = await db.expenses.find_one({
            "expense_id": payable_id,
            "company_id": user.company_id
        })
        collection = "expenses"
        id_field = "expense_id"
    
    if not payable:
        raise HTTPException(status_code=404, detail="Payable not found")
    
    total_amount = payable.get("amount", 0) or payable.get("total", 0)
    current_paid = payable.get("paid_amount", 0) or 0
    remaining = round(total_amount - current_paid, 2)
    
    # Create payment record for remaining amount
    payment_id = f"pmt_{uuid.uuid4().hex[:12]}"
    payment_record = {
        "payment_id": payment_id,
        "payable_id": payable_id,
        "amount": remaining,
        "payment_date": now.strftime("%Y-%m-%d"),
        "payment_method": None,
        "reference": None,
        "notes": "Marked as paid",
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    update_data = {
        "paid_amount": total_amount,
        "balance_due": 0,
        "status": "paid",
        "updated_at": now.isoformat(),
        "updated_by": user.user_id
    }
    
    if collection == "supplier_payables":
        await db.supplier_payables.update_one(
            {"payable_id": payable_id, "company_id": user.company_id},
            {
                "$set": update_data,
                "$push": {"payments": payment_record}
            }
        )
    else:
        await db.expenses.update_one(
            {"expense_id": payable_id, "company_id": user.company_id},
            {
                "$set": update_data,
                "$push": {"payments": payment_record}
            }
        )
    
    return {
        "success": True,
        "message": "Payable marked as paid",
        "payable_id": payable_id,
        "total_paid": total_amount
    }


@business_clarity_router.get("/payables/{payable_id}/payments")
async def get_payable_payments(
    payable_id: str,
    user: User = Depends(get_current_user)
):
    """Get payment history for a specific payable"""
    # Try supplier_payables first
    payable = await db.supplier_payables.find_one(
        {"payable_id": payable_id, "company_id": user.company_id},
        {"_id": 0}
    )
    
    if not payable:
        payable = await db.expenses.find_one(
            {"expense_id": payable_id, "company_id": user.company_id},
            {"_id": 0}
        )
    
    if not payable:
        raise HTTPException(status_code=404, detail="Payable not found")
    
    payments = payable.get("payments", [])
    total_amount = payable.get("amount", 0) or payable.get("total", 0)
    paid_amount = payable.get("paid_amount", 0) or 0
    
    return {
        "payments": payments,
        "summary": {
            "total_amount": total_amount,
            "paid_amount": paid_amount,
            "balance_due": round(total_amount - paid_amount, 2),
            "payment_count": len(payments)
        }
    }


# Create new supplier payable with optional cost center assignment
class CreateSupplierPayableRequest(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    description: str
    amount: float
    due_date: Optional[str] = None
    invoice_number: Optional[str] = None
    fixed_cost_category_id: Optional[str] = None
    event_id: Optional[str] = None


@business_clarity_router.post("/supplier-payables")
async def create_supplier_payable(
    data: CreateSupplierPayableRequest,
    user: User = Depends(get_current_user)
):
    """Create a new supplier payable with automatic accounting entry if linked to cost center"""
    check_finance_permission(user, "create supplier payables")
    
    now = datetime.now(timezone.utc)
    payable_id = f"pay_{uuid.uuid4().hex[:12]}"
    
    # Get supplier name if supplier_id provided
    supplier_name = data.supplier_name
    if data.supplier_id and not supplier_name:
        supplier = await db.suppliers.find_one(
            {"supplier_id": data.supplier_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        supplier_name = supplier.get("name") if supplier else None
    
    # Get cost center from fixed cost category
    cost_center_id = None
    cost_center_name = None
    if data.fixed_cost_category_id:
        fc_cat = await db.fixed_cost_categories.find_one(
            {"category_id": data.fixed_cost_category_id, "company_id": user.company_id},
            {"_id": 0, "cost_center_id": 1}
        )
        if fc_cat and fc_cat.get("cost_center_id"):
            cost_center_id = fc_cat["cost_center_id"]
            cc = await db.cost_centers.find_one(
                {"cost_center_id": cost_center_id},
                {"_id": 0, "name": 1}
            )
            cost_center_name = cc.get("name") if cc else None
    
    payable_doc = {
        "payable_id": payable_id,
        "company_id": user.company_id,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier_name,
        "description": data.description,
        "amount": round(data.amount, 2),
        "paid_amount": 0,
        "balance_due": round(data.amount, 2),
        "status": "pending",
        "due_date": data.due_date,
        "invoice_number": data.invoice_number,
        "fixed_cost_category_id": data.fixed_cost_category_id,
        "event_id": data.event_id,
        "cost_center_id": cost_center_id,
        "cost_center_name": cost_center_name,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    await db.supplier_payables.insert_one(payable_doc)
    
    # Record accounting entry if has cost center
    accounting_entry_id = None
    if cost_center_id:
        from services.accounting_engine import AccountingEngine
        try:
            engine = AccountingEngine(db, user.company_id, user.user_id)
            entry = await engine.record_supplier_payable(
                payable_doc,
                cost_center_id,
                cost_center_name
            )
            accounting_entry_id = entry.get("entry_id")
        except Exception as e:
            print(f"Warning: Failed to record accounting entry for payable {payable_id}: {e}")
    
    payable_doc.pop("_id", None)
    return {
        "payable": payable_doc,
        "accounting_entry_id": accounting_entry_id
    }


# ============== CLIENT CREDIT MANAGEMENT ==============

@business_clarity_router.put("/clients/{client_id}/credit")
async def update_client_credit(client_id: str, data: ClientCreditUpdate, user: User = Depends(get_current_user)):
    """Update client credit settings"""
    now = datetime.now(timezone.utc)
    
    result = await db.clients.update_one(
        {"client_id": client_id, "company_id": user.company_id},
        {"$set": {
            "has_credit": data.has_credit,
            "credit_limit": data.credit_limit,
            "payment_terms": data.payment_terms,
            "updated_at": now.isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "client_credit_updated",
        "entity_type": "client",
        "entity_id": client_id,
        "details": {"has_credit": data.has_credit, "credit_limit": data.credit_limit, "payment_terms": data.payment_terms},
        "created_at": now.isoformat()
    })
    
    return {"message": "Credit settings updated"}

# ============== EXECUTIVE REPORTS ==============

@business_clarity_router.get("/reports/financial-snapshot")
async def get_financial_snapshot(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get financial snapshot report including payroll costs"""
    query = {"company_id": user.company_id}
    
    # Date filtering
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    # Revenue (from invoices)
    invoices = await db.invoices.find(query, {"_id": 0}).to_list(1000)
    total_invoiced = sum(inv.get("total", 0) for inv in invoices)
    total_collected = sum(inv.get("paid_amount", 0) for inv in invoices)
    total_outstanding = total_invoiced - total_collected
    
    # Direct Expenses (from expenses collection - assigned to events)
    expenses_query = {"company_id": user.company_id}
    if start_date:
        expenses_query["expense_date"] = {"$gte": start_date}
    if end_date:
        if "expense_date" in expenses_query:
            expenses_query["expense_date"]["$lte"] = end_date
        else:
            expenses_query["expense_date"] = {"$lte": end_date}
    
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(1000)
    total_direct_expenses = sum(exp.get("amount", 0) for exp in expenses)
    expenses_paid = sum(exp.get("amount", 0) for exp in expenses if exp.get("status") == "paid")
    
    # Fixed Costs (from fixed_costs collection)
    fixed_costs_query = {"company_id": user.company_id, "status": "active"}
    fixed_costs = await db.fixed_costs.find(fixed_costs_query, {"_id": 0}).to_list(100)
    total_fixed_monthly = sum(fc.get("amount", 0) for fc in fixed_costs)
    
    # ========== PAYROLL COSTS ==========
    # Get completed payroll periods
    payroll_query = {"company_id": user.company_id, "status": "completed"}
    if start_date or end_date:
        payroll_query["payment_date"] = {}
        if start_date:
            payroll_query["payment_date"]["$gte"] = start_date
        if end_date:
            payroll_query["payment_date"]["$lte"] = end_date
        if not payroll_query["payment_date"]:
            del payroll_query["payment_date"]
    
    payroll_periods = await db.payroll_periods.find(payroll_query, {"_id": 0}).to_list(100)
    
    total_payroll_gross = sum(p.get("total_gross", 0) for p in payroll_periods)
    total_payroll_net = sum(p.get("total_net", 0) for p in payroll_periods)
    total_employer_cost = sum(p.get("total_employer_cost", 0) for p in payroll_periods)
    payroll_periods_count = len(payroll_periods)
    
    # If no payroll data, estimate from active employees
    if total_employer_cost == 0:
        active_employees = await db.employees.find(
            {"company_id": user.company_id, "status": "active"},
            {"_id": 0, "base_salary": 1, "payment_frequency": 1}
        ).to_list(500)
        
        monthly_estimate = 0
        for emp in active_employees:
            salary = emp.get("base_salary", 0)
            freq = emp.get("payment_frequency", "biweekly")
            if freq == "biweekly":
                monthly_estimate += salary * 2
            elif freq == "weekly":
                monthly_estimate += salary * 4
            else:
                monthly_estimate += salary
        # Add ~16% employer contributions estimate
        total_employer_cost = monthly_estimate * 1.16
        is_payroll_estimated = True
    else:
        is_payroll_estimated = False
    
    # ========== PROFIT CALCULATIONS ==========
    # Gross Profit = Revenue - Direct Costs
    gross_profit = total_invoiced - total_direct_expenses
    gross_margin = (gross_profit / total_invoiced * 100) if total_invoiced > 0 else 0
    
    # Operating Profit = Gross Profit - Fixed Costs - Payroll
    operating_profit = gross_profit - total_fixed_monthly - total_employer_cost
    operating_margin = (operating_profit / total_invoiced * 100) if total_invoiced > 0 else 0
    
    # Cash Position (Realized)
    cash_flow = total_collected - expenses_paid - total_payroll_net
    
    return {
        "period": {"start": start_date, "end": end_date},
        "revenue": {
            "total_invoiced": round(total_invoiced, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "collection_rate": round((total_collected / total_invoiced * 100) if total_invoiced > 0 else 0, 1)
        },
        "expenses": {
            "direct": round(total_direct_expenses, 2),
            "paid": round(expenses_paid, 2),
            "total": round(total_direct_expenses, 2),
            "assigned": round(total_direct_expenses, 2),
            "count": len(expenses)
        },
        "fixed_costs": {
            "monthly": round(total_fixed_monthly, 2),
            "count": len(fixed_costs)
        },
        "payroll": {
            "gross_paid": round(total_payroll_gross, 2),
            "net_paid": round(total_payroll_net, 2),
            "employer_cost": round(total_employer_cost, 2),
            "periods_count": payroll_periods_count,
            "is_estimated": is_payroll_estimated
        },
        "profit": {
            "gross": round(gross_profit, 2),
            "margin": round(gross_margin, 1),
            "operating": round(operating_profit, 2),
            "operating_margin": round(operating_margin, 1)
        },
        "cash_position": {
            "collected": round(total_collected, 2),
            "paid_suppliers": round(expenses_paid, 2),
            "paid_payroll": round(total_payroll_net, 2),
            "net_flow": round(cash_flow, 2)
        },
        "invoices_count": len(invoices),
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@business_clarity_router.get("/reports/client-revenue")
async def get_client_revenue_report(user: User = Depends(get_current_user)):
    """Get revenue by client report"""
    # Get all invoices grouped by client
    invoices = await db.invoices.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    client_revenue = {}
    for inv in invoices:
        cid = inv.get("client_id")
        if cid not in client_revenue:
            client_revenue[cid] = {
                "client_id": cid,
                "total_invoiced": 0,
                "total_paid": 0,
                "total_outstanding": 0,
                "invoices_count": 0
            }
        client_revenue[cid]["total_invoiced"] += inv.get("total", 0)
        client_revenue[cid]["total_paid"] += inv.get("paid_amount", 0)
        client_revenue[cid]["total_outstanding"] += inv.get("balance_due", 0)
        client_revenue[cid]["invoices_count"] += 1
    
    # Get client names
    records = []
    for cid, data in client_revenue.items():
        client = await db.clients.find_one({"client_id": cid}, {"_id": 0, "display_name": 1})
        data["client_name"] = client.get("display_name") if client else "Unknown"
        data["total_invoiced"] = round(data["total_invoiced"], 2)
        data["total_paid"] = round(data["total_paid"], 2)
        data["total_outstanding"] = round(data["total_outstanding"], 2)
        records.append(data)
    
    # Sort by total invoiced desc
    records.sort(key=lambda x: x["total_invoiced"], reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_revenue": round(sum(r["total_invoiced"] for r in records), 2),
            "total_collected": round(sum(r["total_paid"] for r in records), 2),
            "clients_count": len(records)
        }
    }

@business_clarity_router.get("/reports/supplier-spend")
async def get_supplier_spend_report(user: User = Depends(get_current_user)):
    """Get spending by supplier report"""
    # Get expenses grouped by supplier
    expenses = await db.expenses.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    supplier_spend = {}
    for exp in expenses:
        sid = exp.get("supplier_id") or "no_supplier"
        if sid not in supplier_spend:
            supplier_spend[sid] = {
                "supplier_id": sid if sid != "no_supplier" else None,
                "total_amount": 0,
                "paid_amount": 0,
                "pending_amount": 0,
                "transactions_count": 0
            }
        amount = exp.get("amount", 0)
        supplier_spend[sid]["total_amount"] += amount
        if exp.get("payment_status") == "Paid":
            supplier_spend[sid]["paid_amount"] += amount
        else:
            supplier_spend[sid]["pending_amount"] += amount
        supplier_spend[sid]["transactions_count"] += 1
    
    # Get supplier names
    records = []
    for sid, data in supplier_spend.items():
        if sid and sid != "no_supplier":
            supplier = await db.suppliers.find_one({"supplier_id": sid}, {"_id": 0, "name": 1})
            data["supplier_name"] = supplier.get("name") if supplier else "Unknown"
        else:
            data["supplier_name"] = "Other / No Supplier"
        data["total_amount"] = round(data["total_amount"], 2)
        data["paid_amount"] = round(data["paid_amount"], 2)
        data["pending_amount"] = round(data["pending_amount"], 2)
        records.append(data)
    
    # Sort by total amount desc
    records.sort(key=lambda x: x["total_amount"], reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_spend": round(sum(r["total_amount"] for r in records), 2),
            "total_paid": round(sum(r["paid_amount"] for r in records), 2),
            "total_pending": round(sum(r["pending_amount"] for r in records), 2),
            "suppliers_count": len(records)
        }
    }

@business_clarity_router.get("/reports/event-profitability")
async def get_event_profitability_report(user: User = Depends(get_current_user)):
    """Get event profitability summary"""
    # Get all events
    events = await db.events.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Get all clients for lookup
    clients = await db.clients.find(
        {"company_id": user.company_id},
        {"_id": 0, "client_id": 1, "display_name": 1}
    ).to_list(1000)
    client_map = {c["client_id"]: c.get("display_name", "") for c in clients}
    
    # Source labels for display
    source_labels = {
        "recurrent_client": "Recurrent Client",
        "inbound_lead": "Inbound Lead",
        "outbound": "Outbound",
        "referral": "Referral",
        "other": "Other"
    }
    
    records = []
    for event in events:
        event_id = event.get("event_id")
        
        # Get revenue from invoices
        invoices = await db.invoices.find(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "total": 1, "paid_amount": 1}
        ).to_list(100)
        revenue = sum(inv.get("total", 0) for inv in invoices)
        collected = sum(inv.get("paid_amount", 0) for inv in invoices)
        
        # Get costs from expenses
        expenses = await db.expenses.find(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "amount": 1}
        ).to_list(100)
        costs = sum(exp.get("amount", 0) for exp in expenses)
        
        # Get costs from order items internal cost
        order_items = await db.order_items.find(
            {"event_id": event_id, "company_id": user.company_id},
            {"_id": 0, "internal_cost": 1}
        ).to_list(100)
        internal_costs = sum(item.get("internal_cost") or 0 for item in order_items)
        total_costs = costs + internal_costs
        
        profit = revenue - total_costs
        margin = (profit / revenue * 100) if revenue > 0 else 0
        
        # Get source info
        source_key = event.get("source", "")
        source_display = source_labels.get(source_key, source_key or "N/A")
        
        # Get client name
        client_name = client_map.get(event.get("client_id"), "")
        
        records.append({
            "event_id": event_id,
            "event_name": event.get("name"),
            "event_date": event.get("event_date"),
            "event_type": event.get("event_type"),
            "status": event.get("status"),
            "stage": event.get("stage"),
            "source": source_key,
            "source_display": source_display,
            "client_id": event.get("client_id"),
            "client_name": client_name,
            "revenue": round(revenue, 2),
            "collected": round(collected, 2),
            "costs": round(total_costs, 2),
            "profit": round(profit, 2),
            "margin_percent": round(margin, 1)
        })
    
    # Sort by profit desc
    records.sort(key=lambda x: x["profit"], reverse=True)
    
    total_revenue = sum(r["revenue"] for r in records)
    total_costs = sum(r["costs"] for r in records)
    total_profit = sum(r["profit"] for r in records)
    
    # Group by source for summary
    source_summary = {}
    for r in records:
        src = r["source_display"]
        if src not in source_summary:
            source_summary[src] = {"count": 0, "revenue": 0, "profit": 0}
        source_summary[src]["count"] += 1
        source_summary[src]["revenue"] += r["revenue"]
        source_summary[src]["profit"] += r["profit"]
    
    return {
        "records": records,
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_costs": round(total_costs, 2),
            "total_profit": round(total_profit, 2),
            "average_margin": round((total_profit / total_revenue * 100) if total_revenue > 0 else 0, 1),
            "events_count": len(records)
        },
        "by_source": source_summary
    }

# ============== REPORT BY COST CENTER ==============

@business_clarity_router.get("/reports/by-cost-center")
async def get_cost_center_report(
    year: int = None,
    month: int = None,
    user: User = Depends(get_current_user)
):
    """Get P&L summary by cost center with budget vs actual - using actual payroll data"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    
    # Get all cost centers
    cost_centers = await db.cost_centers.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    
    if not cost_centers:
        return {"records": [], "summary": {}, "period": {"year": year, "month": month}}
    
    # Get fixed cost categories linked to cost centers
    fc_categories = await db.fixed_cost_categories.find(
        {"company_id": user.company_id, "cost_center_id": {"$ne": None}},
        {"_id": 0, "category_id": 1, "cost_center_id": 1, "name": 1}
    ).to_list(100)
    
    cc_to_categories = {}
    for cat in fc_categories:
        cc_id = cat.get("cost_center_id")
        if cc_id not in cc_to_categories:
            cc_to_categories[cc_id] = []
        cc_to_categories[cc_id].append(cat["category_id"])
    
    # Period date range
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Get completed payroll periods in this month
    payroll_periods = await db.payroll_periods.find(
        {
            "company_id": user.company_id,
            "status": "completed",
            "payment_date": {
                "$gte": start_date.isoformat()[:10],
                "$lt": end_date.isoformat()[:10]
            }
        },
        {"_id": 0, "period_id": 1}
    ).to_list(10)
    
    period_ids = [p["period_id"] for p in payroll_periods]
    
    records = []
    total_budget = 0
    total_actual = 0
    total_payroll = 0
    total_payables = 0
    
    for cc in cost_centers:
        cc_id = cc.get("cost_center_id")
        cc_code = cc.get("code") or cc.get("name")
        cc_name = cc.get("name")
        
        # Use granular monthly budget if available, otherwise divide annual
        monthly_budgets = cc.get("monthly_budgets") or {}
        budget_key = f"{year}-{str(month).zfill(2)}"
        if budget_key in monthly_budgets:
            monthly_budget = monthly_budgets[budget_key]
        else:
            annual_budget = cc.get("annual_budget") or 0
            monthly_budget = annual_budget / 12 if annual_budget > 0 else 0
        
        annual_budget = cc.get("annual_budget") or 0
        
        # 1. PAYROLL COSTS - Use actual payroll_entries with cost_center_id
        payroll_cost = 0
        is_payroll_actual = False
        
        if period_ids:
            # Get actual payroll entries for this cost center from completed periods
            payroll_pipeline = [
                {"$match": {
                    "company_id": user.company_id,
                    "period_id": {"$in": period_ids},
                    "cost_center_id": cc_id
                }},
                {"$group": {"_id": None, "total": {"$sum": "$total_employer_cost"}}}
            ]
            payroll_result = await db.payroll_entries.aggregate(payroll_pipeline).to_list(1)
            if payroll_result and payroll_result[0]["total"] > 0:
                payroll_cost = payroll_result[0]["total"]
                is_payroll_actual = True
        
        # Fallback: estimate from active employees if no completed payroll
        if not is_payroll_actual:
            emp_pipeline = [
                {"$match": {
                    "company_id": user.company_id,
                    "cost_center_id": cc_id,
                    "status": "active"
                }},
                {"$group": {"_id": None, "total": {"$sum": "$base_salary"}}}
            ]
            emp_result = await db.employees.aggregate(emp_pipeline).to_list(1)
            if emp_result:
                # Estimate with employer contributions (~16.4%)
                base_salary = emp_result[0]["total"]
                payroll_cost = base_salary * 1.164
        
        # 2. Supplier payables linked to this cost center's categories
        payables_cost = 0
        linked_categories = cc_to_categories.get(cc_id, [])
        if linked_categories:
            payables_pipeline = [
                {"$match": {
                    "company_id": user.company_id,
                    "fixed_cost_category_id": {"$in": linked_categories},
                    "status": {"$ne": "cancelled"},
                    "created_at": {
                        "$gte": start_date.isoformat(),
                        "$lt": end_date.isoformat()
                    }
                }},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
            ]
            payables_result = await db.supplier_payables.aggregate(payables_pipeline).to_list(1)
            payables_cost = payables_result[0]["total"] if payables_result else 0
        
        # 3. Direct expenses tagged to this cost center
        direct_expenses_pipeline = [
            {"$match": {
                "company_id": user.company_id,
                "cost_center": cc_code,
                "date": {
                    "$gte": start_date.isoformat(),
                    "$lt": end_date.isoformat()
                }
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        direct_result = await db.expenses.aggregate(direct_expenses_pipeline).to_list(1)
        direct_expenses = direct_result[0]["total"] if direct_result else 0
        
        # Total actual spend
        actual_spend = payroll_cost + payables_cost + direct_expenses
        
        # Calculate variance
        variance = monthly_budget - actual_spend
        variance_pct = ((variance / monthly_budget) * 100) if monthly_budget > 0 else 0
        utilization = (actual_spend / monthly_budget * 100) if monthly_budget > 0 else 0
        
        # Get transactions count for drilldown
        transactions_count = 0
        if linked_categories:
            transactions_count = await db.supplier_payables.count_documents({
                "company_id": user.company_id,
                "fixed_cost_category_id": {"$in": linked_categories},
                "status": {"$ne": "cancelled"}
            })
        
        records.append({
            "cost_center_id": cc_id,
            "code": cc_code,
            "name": cc_name,
            "annual_budget": round(annual_budget, 2),
            "monthly_budget": round(monthly_budget, 2),
            "actual_spend": round(actual_spend, 2),
            "payroll_cost": round(payroll_cost, 2),
            "payroll_is_actual": is_payroll_actual,
            "payables_cost": round(payables_cost, 2),
            "direct_expenses": round(direct_expenses, 2),
            "variance": round(variance, 2),
            "variance_pct": round(variance_pct, 1),
            "utilization": round(utilization, 1),
            "transactions_count": transactions_count,
            "status": "over" if actual_spend > monthly_budget and monthly_budget > 0 else "under" if variance > 0 else "on_budget"
        })
        
        total_budget += monthly_budget
        total_actual += actual_spend
        total_payroll += payroll_cost
        total_payables += payables_cost
    
    # Sort by actual spend descending
    records.sort(key=lambda x: x["actual_spend"], reverse=True)
    
    return {
        "records": records,
        "summary": {
            "total_budget": round(total_budget, 2),
            "total_actual": round(total_actual, 2),
            "total_variance": round(total_budget - total_actual, 2),
            "total_payroll": round(total_payroll, 2),
            "total_payables": round(total_payables, 2),
            "overall_utilization": round((total_actual / total_budget * 100) if total_budget > 0 else 0, 1)
        },
        "period": {
            "year": year,
            "month": month,
            "label": f"{year}-{str(month).zfill(2)}"
        }
    }

@business_clarity_router.get("/reports/cost-center/{cc_id}/transactions")
async def get_cost_center_transactions(
    cc_id: str,
    year: int = None,
    month: int = None,
    user: User = Depends(get_current_user)
):
    """Get detailed transactions for a cost center"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    
    # Get cost center info
    cc = await db.cost_centers.find_one(
        {"cost_center_id": cc_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    cc_code = cc.get("code") or cc.get("name")
    
    # Get linked categories
    fc_categories = await db.fixed_cost_categories.find(
        {"company_id": user.company_id, "cost_center_id": cc_id},
        {"_id": 0, "category_id": 1, "name": 1}
    ).to_list(50)
    
    category_ids = [c["category_id"] for c in fc_categories]
    category_names = {c["category_id"]: c["name"] for c in fc_categories}
    
    # Period range
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    transactions = []
    
    # 1. Payables linked to categories
    if category_ids:
        payables = await db.supplier_payables.find(
            {
                "company_id": user.company_id,
                "fixed_cost_category_id": {"$in": category_ids},
                "status": {"$ne": "cancelled"}
            },
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        
        for p in payables:
            transactions.append({
                "type": "payable",
                "description": p.get("description", "Supplier Payable"),
                "amount": p.get("amount", 0),
                "date": p.get("created_at", ""),
                "category": category_names.get(p.get("fixed_cost_category_id"), ""),
                "status": p.get("status", ""),
                "supplier": p.get("supplier_name", "")
            })
    
    # 2. Payroll entries for this cost center (actual payroll data)
    payroll_entries = await db.payroll_entries.find(
        {"company_id": user.company_id, "cost_center_id": cc_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    if payroll_entries:
        # Use actual payroll entries
        for entry in payroll_entries:
            transactions.append({
                "type": "payroll",
                "description": f"{entry.get('employee_name')} - Período Nómina",
                "amount": entry.get("total_employer_cost", 0),
                "date": entry.get("created_at", ""),
                "category": "Payroll",
                "status": "processed",
                "supplier": "",
                "details": {
                    "gross_salary": entry.get("gross_salary", 0),
                    "net_salary": entry.get("net_salary", 0),
                    "period_id": entry.get("period_id")
                }
            })
    else:
        # Fallback: show employees with estimated payroll
        employees = await db.employees.find(
            {"company_id": user.company_id, "cost_center_id": cc_id, "status": "active"},
            {"_id": 0, "full_name": 1, "base_salary": 1, "position": 1}
        ).to_list(100)
        
        for emp in employees:
            # Estimate with employer contributions (~16.4%)
            estimated_cost = emp.get("base_salary", 0) * 1.164
            transactions.append({
                "type": "payroll",
                "description": f"{emp.get('full_name')} - {emp.get('position', '')} (Estimado)",
                "amount": round(estimated_cost, 2),
                "date": "",
                "category": "Payroll",
                "status": "estimated",
                "supplier": ""
            })
    
    # Sort by amount descending
    transactions.sort(key=lambda x: x["amount"], reverse=True)
    
    return {
        "cost_center": cc,
        "transactions": transactions,
        "total": sum(t["amount"] for t in transactions),
        "period": {"year": year, "month": month}
    }


# ============== BUDGET ALERTS ==============

@business_clarity_router.get("/budget-alerts")
async def get_budget_alerts(
    threshold_warning: int = 80,
    threshold_critical: int = 100,
    user: User = Depends(get_current_user)
):
    """
    Get budget alerts for cost centers that exceed thresholds.
    
    Returns alerts when:
    - utilization >= 80% (warning)
    - utilization >= 100% (critical/over budget)
    """
    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month
    
    # Get all cost centers with budgets
    cost_centers = await db.cost_centers.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get fixed cost categories linked to cost centers
    fc_categories = await db.fixed_cost_categories.find(
        {"company_id": user.company_id, "cost_center_id": {"$ne": None}},
        {"_id": 0, "category_id": 1, "cost_center_id": 1}
    ).to_list(100)
    
    cc_to_categories = {}
    for cat in fc_categories:
        cc_id = cat.get("cost_center_id")
        if cc_id not in cc_to_categories:
            cc_to_categories[cc_id] = []
        cc_to_categories[cc_id].append(cat["category_id"])
    
    alerts = []
    
    for cc in cost_centers:
        cc_id = cc.get("cost_center_id")
        cc_code = cc.get("code") or cc.get("name")
        cc_name = cc.get("name")
        annual_budget = cc.get("annual_budget") or 0
        monthly_budget = annual_budget / 12 if annual_budget > 0 else 0
        
        if monthly_budget <= 0:
            continue  # Skip cost centers without budget
        
        # Calculate actual spend (same logic as report)
        total_spend = 0.0
        
        # 1. Payroll
        payroll_pipeline = [
            {"$match": {"company_id": user.company_id, "cost_center": cc_code, "status": "active"}},
            {"$group": {"_id": None, "total": {"$sum": "$base_salary"}}}
        ]
        payroll_result = await db.employees.aggregate(payroll_pipeline).to_list(1)
        total_spend += payroll_result[0]["total"] if payroll_result else 0
        
        # 2. Payables from linked categories
        linked_categories = cc_to_categories.get(cc_id, [])
        if linked_categories:
            payables_pipeline = [
                {"$match": {
                    "company_id": user.company_id,
                    "fixed_cost_category_id": {"$in": linked_categories},
                    "status": {"$ne": "cancelled"}
                }},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
            ]
            payables_result = await db.supplier_payables.aggregate(payables_pipeline).to_list(1)
            total_spend += payables_result[0]["total"] if payables_result else 0
        
        # Calculate utilization
        utilization = (total_spend / monthly_budget) * 100
        
        # Generate alerts based on thresholds
        if utilization >= threshold_critical:
            alerts.append({
                "alert_id": f"budget_{cc_id}_{year}_{month}",
                "type": "critical",
                "category": "budget",
                "title": f"{'Presupuesto excedido' if user.company_id else 'Budget exceeded'}: {cc_name}",
                "message": f"{cc_name} ha excedido su presupuesto mensual. Utilización: {utilization:.1f}%",
                "message_en": f"{cc_name} has exceeded its monthly budget. Utilization: {utilization:.1f}%",
                "cost_center_id": cc_id,
                "cost_center_name": cc_name,
                "cost_center_code": cc_code,
                "budget": round(monthly_budget, 2),
                "actual": round(total_spend, 2),
                "utilization": round(utilization, 1),
                "over_amount": round(total_spend - monthly_budget, 2),
                "threshold": threshold_critical,
                "period": f"{year}-{str(month).zfill(2)}",
                "created_at": now.isoformat()
            })
        elif utilization >= threshold_warning:
            alerts.append({
                "alert_id": f"budget_{cc_id}_{year}_{month}",
                "type": "warning",
                "category": "budget",
                "title": f"{'Presupuesto al límite' if user.company_id else 'Budget nearing limit'}: {cc_name}",
                "message": f"{cc_name} está cerca de su límite de presupuesto. Utilización: {utilization:.1f}%",
                "message_en": f"{cc_name} is nearing its budget limit. Utilization: {utilization:.1f}%",
                "cost_center_id": cc_id,
                "cost_center_name": cc_name,
                "cost_center_code": cc_code,
                "budget": round(monthly_budget, 2),
                "actual": round(total_spend, 2),
                "utilization": round(utilization, 1),
                "remaining": round(monthly_budget - total_spend, 2),
                "threshold": threshold_warning,
                "period": f"{year}-{str(month).zfill(2)}",
                "created_at": now.isoformat()
            })
    
    # Sort by severity (critical first) then by utilization
    alerts.sort(key=lambda x: (0 if x["type"] == "critical" else 1, -x["utilization"]))
    
    return {
        "alerts": alerts,
        "summary": {
            "total": len(alerts),
            "critical": len([a for a in alerts if a["type"] == "critical"]),
            "warning": len([a for a in alerts if a["type"] == "warning"]),
            "thresholds": {
                "warning": threshold_warning,
                "critical": threshold_critical
            }
        },
        "period": f"{year}-{str(month).zfill(2)}",
        "checked_at": now.isoformat()
    }

# ============== FIXED COSTS & BUDGET ==============

# Fixed Cost Category Model
class FixedCostCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    active: bool = True
    cost_center_id: Optional[str] = None  # Link to Cost Center

# Budget Model
class BudgetCreate(BaseModel):
    category_id: str
    period: str  # MONTHLY, QUARTERLY, YEARLY
    budget_amount: float
    start_date: str  # ISO date string
    end_date: Optional[str] = None
    notes: Optional[str] = ""

# --- Fixed Cost Categories ---
@business_clarity_router.get("/fixed-costs/categories")
async def get_fixed_cost_categories(user: User = Depends(get_current_user)):
    """Get all fixed cost categories"""
    categories = await db.fixed_cost_categories.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    return categories

@business_clarity_router.post("/fixed-costs/categories")
async def create_fixed_cost_category(data: FixedCostCategoryCreate, user: User = Depends(get_current_user)):
    """Create a new fixed cost category"""
    check_finance_permission(user, "manage fixed cost categories")
    
    now = datetime.now(timezone.utc)
    category_id = f"fcc_{uuid.uuid4().hex[:12]}"
    
    # Get cost center name if linked
    cost_center_name = None
    if data.cost_center_id:
        cc = await db.cost_centers.find_one(
            {"cost_center_id": data.cost_center_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        cost_center_name = cc.get("name") if cc else None
    
    category = {
        "category_id": category_id,
        "company_id": user.company_id,
        "name": data.name,
        "description": data.description,
        "active": data.active,
        "cost_center_id": data.cost_center_id,
        "cost_center_name": cost_center_name,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.fixed_cost_categories.insert_one(category)
    if "_id" in category:
        del category["_id"]
    return category

@business_clarity_router.put("/fixed-costs/categories/{category_id}")
async def update_fixed_cost_category(category_id: str, data: FixedCostCategoryCreate, user: User = Depends(get_current_user)):
    """Update a fixed cost category"""
    check_finance_permission(user, "manage fixed cost categories")
    
    now = datetime.now(timezone.utc)
    
    # Get cost center name if linked
    cost_center_name = None
    if data.cost_center_id:
        cc = await db.cost_centers.find_one(
            {"cost_center_id": data.cost_center_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        cost_center_name = cc.get("name") if cc else None
    
    result = await db.fixed_cost_categories.update_one(
        {"category_id": category_id, "company_id": user.company_id},
        {"$set": {
            "name": data.name,
            "description": data.description,
            "active": data.active,
            "cost_center_id": data.cost_center_id,
            "cost_center_name": cost_center_name,
            "updated_at": now.isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category updated"}

@business_clarity_router.delete("/fixed-costs/categories/{category_id}")
async def delete_fixed_cost_category(category_id: str, user: User = Depends(get_current_user)):
    """Delete a fixed cost category"""
    check_finance_permission(user, "delete fixed cost categories")
    
    result = await db.fixed_cost_categories.delete_one(
        {"category_id": category_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

# --- Budgets ---
@business_clarity_router.get("/fixed-costs/budgets")
async def get_budgets(user: User = Depends(get_current_user), period: str = None, year: int = None):
    """Get all budgets, optionally filtered by period and year"""
    query = {"company_id": user.company_id}
    if period:
        query["period"] = period
    
    budgets = await db.fixed_cost_budgets.find(query, {"_id": 0}).to_list(500)
    
    # Enrich with category names
    categories = await db.fixed_cost_categories.find(
        {"company_id": user.company_id},
        {"_id": 0, "category_id": 1, "name": 1}
    ).to_list(100)
    cat_map = {c["category_id"]: c["name"] for c in categories}
    
    for b in budgets:
        b["category_name"] = cat_map.get(b.get("category_id"), "Unknown")
    
    return budgets

@business_clarity_router.post("/fixed-costs/budgets")
async def create_budget(data: BudgetCreate, user: User = Depends(get_current_user)):
    """Create or update a budget for a category and period"""
    now = datetime.now(timezone.utc)
    budget_id = f"bud_{uuid.uuid4().hex[:12]}"
    
    # Check if budget already exists for this category and period
    existing = await db.fixed_cost_budgets.find_one({
        "company_id": user.company_id,
        "category_id": data.category_id,
        "period": data.period,
        "start_date": data.start_date
    })
    
    if existing:
        # Update existing
        await db.fixed_cost_budgets.update_one(
            {"budget_id": existing["budget_id"]},
            {"$set": {
                "budget_amount": data.budget_amount,
                "end_date": data.end_date,
                "notes": data.notes,
                "updated_at": now.isoformat()
            }}
        )
        return {"message": "Budget updated", "budget_id": existing["budget_id"]}
    
    budget = {
        "budget_id": budget_id,
        "company_id": user.company_id,
        "category_id": data.category_id,
        "period": data.period,
        "budget_amount": data.budget_amount,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.fixed_cost_budgets.insert_one(budget)
    return {"message": "Budget created", "budget_id": budget_id}

@business_clarity_router.delete("/fixed-costs/budgets/{budget_id}")
async def delete_budget(budget_id: str, user: User = Depends(get_current_user)):
    """Delete a budget"""
    result = await db.fixed_cost_budgets.delete_one(
        {"budget_id": budget_id, "company_id": user.company_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted"}

# --- Budget vs Actual Analysis ---
@business_clarity_router.get("/fixed-costs/analysis")
async def get_budget_analysis(user: User = Depends(get_current_user), period: str = "MONTHLY", year: int = None, month: int = None):
    """Get budget vs actual analysis for fixed costs"""
    now = datetime.now(timezone.utc)
    
    # Default to current year/month
    if not year:
        year = now.year
    if not month:
        month = now.month
    
    # Get all categories
    categories = await db.fixed_cost_categories.find(
        {"company_id": user.company_id, "active": True},
        {"_id": 0}
    ).to_list(100)
    
    # Get budgets for the period
    budgets = await db.fixed_cost_budgets.find(
        {"company_id": user.company_id, "period": period},
        {"_id": 0}
    ).to_list(500)
    budget_map = {b["category_id"]: b for b in budgets}
    
    # Calculate date range based on period
    if period == "MONTHLY":
        start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    elif period == "QUARTERLY":
        quarter = (month - 1) // 3
        start_month = quarter * 3 + 1
        start_date = datetime(year, start_month, 1, tzinfo=timezone.utc)
        end_month = start_month + 3
        if end_month > 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, end_month, 1, tzinfo=timezone.utc)
    else:  # YEARLY
        start_date = datetime(year, 1, 1, tzinfo=timezone.utc)
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    
    # Get actual expenses (overhead costs with cost_center)
    expenses = await db.expenses.find({
        "company_id": user.company_id,
        "$or": [
            {"cost_center": {"$exists": True, "$ne": None}},
            {"fixed_cost_category_id": {"$exists": True, "$ne": None}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Also check supplier payables with cost_center
    payables = await db.supplier_payables.find({
        "company_id": user.company_id,
        "$or": [
            {"cost_center": {"$exists": True, "$ne": None}},
            {"fixed_cost_category_id": {"$exists": True, "$ne": None}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Aggregate actual spend per category
    actual_by_category = {}
    
    for exp in expenses:
        cat_id = exp.get("fixed_cost_category_id") or exp.get("cost_center")
        if not cat_id:
            continue
        
        # Check if expense falls within the date range
        exp_date_str = exp.get("expense_date") or exp.get("created_at")
        if exp_date_str:
            try:
                if isinstance(exp_date_str, str):
                    exp_date = datetime.fromisoformat(exp_date_str.replace("Z", "+00:00"))
                else:
                    exp_date = exp_date_str
                if not (start_date <= exp_date < end_date):
                    continue
            except:
                pass
        
        amount = exp.get("amount", 0)
        if cat_id not in actual_by_category:
            actual_by_category[cat_id] = 0
        actual_by_category[cat_id] += amount
    
    for pay in payables:
        cat_id = pay.get("fixed_cost_category_id") or pay.get("cost_center")
        if not cat_id:
            continue
        
        pay_date_str = pay.get("created_at")
        if pay_date_str:
            try:
                if isinstance(pay_date_str, str):
                    pay_date = datetime.fromisoformat(pay_date_str.replace("Z", "+00:00"))
                else:
                    pay_date = pay_date_str
                if not (start_date <= pay_date < end_date):
                    continue
            except:
                pass
        
        amount = pay.get("amount", 0)
        if cat_id not in actual_by_category:
            actual_by_category[cat_id] = 0
        actual_by_category[cat_id] += amount
    
    # Build analysis results
    results = []
    total_budgeted = 0
    total_actual = 0
    
    for cat in categories:
        cat_id = cat["category_id"]
        budget = budget_map.get(cat_id, {})
        budgeted = budget.get("budget_amount", 0)
        actual = actual_by_category.get(cat_id, 0)
        
        # Also check by cost_center name match
        if actual == 0:
            # Try matching by category name to cost_center
            cat_name_lower = cat["name"].lower()
            for cc_key, cc_amount in actual_by_category.items():
                if cc_key and cc_key.lower() == cat_name_lower:
                    actual = cc_amount
                    break
        
        variance = budgeted - actual
        variance_pct = ((variance / budgeted) * 100) if budgeted > 0 else 0
        
        # Determine status
        if budgeted == 0:
            status = "NO_BUDGET"
        elif actual > budgeted:
            status = "OVER_BUDGET"
        elif actual > budgeted * 0.9:
            status = "WARNING"
        else:
            status = "OK"
        
        total_budgeted += budgeted
        total_actual += actual
        
        results.append({
            "category_id": cat_id,
            "category_name": cat["name"],
            "description": cat.get("description", ""),
            "budgeted": round(budgeted, 2),
            "actual": round(actual, 2),
            "variance": round(variance, 2),
            "variance_percent": round(variance_pct, 1),
            "status": status
        })
    
    # Sort by status priority (over budget first)
    status_order = {"OVER_BUDGET": 0, "WARNING": 1, "NO_BUDGET": 2, "OK": 3}
    results.sort(key=lambda x: (status_order.get(x["status"], 4), -x["actual"]))
    
    # Get event count for period
    events = await db.events.find({
        "company_id": user.company_id,
        "stage": {"$in": ["Committed", "Won", "Closed"]}
    }, {"_id": 0, "event_id": 1}).to_list(500)
    event_count = len(events) or 1
    
    # Calculate executive insights
    avg_fixed_per_event = total_actual / event_count if event_count > 0 else 0
    
    # Get total revenue for break-even calculation
    invoices = await db.invoices.find(
        {"company_id": user.company_id},
        {"_id": 0, "total": 1}
    ).to_list(1000)
    total_revenue = sum(inv.get("total", 0) for inv in invoices)
    
    break_even_per_event = (total_actual / event_count) if event_count > 0 else 0
    
    return {
        "period": period,
        "year": year,
        "month": month,
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        },
        "categories": results,
        "summary": {
            "total_budgeted": round(total_budgeted, 2),
            "total_actual": round(total_actual, 2),
            "total_variance": round(total_budgeted - total_actual, 2),
            "variance_percent": round(((total_budgeted - total_actual) / total_budgeted * 100) if total_budgeted > 0 else 0, 1),
            "overall_status": "OVER_BUDGET" if total_actual > total_budgeted else "WARNING" if total_actual > total_budgeted * 0.9 else "OK"
        },
        "insights": {
            "total_fixed_costs": round(total_actual, 2),
            "avg_fixed_per_event": round(avg_fixed_per_event, 2),
            "events_in_period": event_count,
            "break_even_revenue_per_event": round(break_even_per_event, 2)
        }
    }

# ============== PERIOD CLOSE & RECONCILIATION ==============

class PeriodCloseCreate(BaseModel):
    period_type: str = "monthly"  # monthly, quarterly
    year: int
    month: int
    notes: Optional[str] = None

class CloseExceptionUpdate(BaseModel):
    status: Optional[str] = None  # open, resolved, approved
    resolution_notes: Optional[str] = None
    assigned_event_id: Optional[str] = None
    categorization: Optional[str] = None  # waste, shrink, correction, overhead

class CashSnapshotCreate(BaseModel):
    opening_cash: float
    closing_cash: float
    cash_in: float
    cash_out: float
    notes: Optional[str] = None

@business_clarity_router.get("/period-close/periods")
async def get_period_close_periods(year: int = None, user: User = Depends(get_current_user)):
    """Get all period close records for the company"""
    query = {"company_id": user.company_id}
    if year:
        query["year"] = year
    
    periods = await db.period_close_snapshots.find(query, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(100)
    return periods

@business_clarity_router.get("/period-close/{year}/{month}")
async def get_period_close_detail(year: int, month: int, user: User = Depends(get_current_user)):
    """Get detailed period close information including readiness checklist"""
    period_key = f"{year}-{month:02d}"
    
    # Check if period exists
    existing = await db.period_close_snapshots.find_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"_id": 0}
    )
    
    # Calculate date range for the period
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # ===== CLOSE READINESS CHECKLIST =====
    readiness = {
        "receipts_completed": {"status": "ok", "count": 0, "issues": 0},
        "requisitions_recorded": {"status": "ok", "count": 0, "issues": 0},
        "missing_unit_costs": {"status": "ok", "count": 0, "items": []},
        "negative_stock": {"status": "ok", "count": 0, "items": []},
        "adjustments_reviewed": {"status": "ok", "count": 0, "pending": 0},
        "unassigned_usage": {"status": "ok", "count": 0, "value": 0}
    }
    
    # Check for missing unit costs in inventory (check both unit_cost and cost_per_unit)
    items_without_cost = await db.ingredients.find(
        {"company_id": user.company_id, 
         "$and": [
             {"$or": [{"unit_cost": None}, {"unit_cost": 0}, {"unit_cost": {"$exists": False}}]},
             {"$or": [{"cost_per_unit": None}, {"cost_per_unit": 0}, {"cost_per_unit": {"$exists": False}}]}
         ]
        },
        {"_id": 0, "ingredient_id": 1, "name": 1, "stock_quantity": 1}
    ).to_list(100)
    
    if items_without_cost:
        readiness["missing_unit_costs"] = {
            "status": "block",
            "count": len(items_without_cost),
            "items": items_without_cost[:10]  # Limit to 10 for preview
        }
    
    # Check for negative stock
    negative_stock_items = await db.ingredients.find(
        {"company_id": user.company_id, "stock_quantity": {"$lt": 0}},
        {"_id": 0, "ingredient_id": 1, "name": 1, "stock_quantity": 1}
    ).to_list(100)
    
    if negative_stock_items:
        readiness["negative_stock"] = {
            "status": "block",
            "count": len(negative_stock_items),
            "items": negative_stock_items[:10]
        }
    
    # Check stock movements without event_id (unassigned usage)
    unassigned_movements = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": {"$in": ["requisition", "production", "usage"]},
        "event_id": {"$in": [None, ""]},
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(500)
    
    unassigned_value = sum(m.get("quantity", 0) * m.get("unit_cost", 0) for m in unassigned_movements)
    if unassigned_movements:
        readiness["unassigned_usage"] = {
            "status": "warning",
            "count": len(unassigned_movements),
            "value": round(unassigned_value, 2)
        }
    
    # Check inventory adjustments
    adjustments = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": {"$in": ["adjustment", "count_variance", "waste", "shrink"]},
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(500)
    
    pending_adjustments = [a for a in adjustments if not a.get("categorized")]
    if pending_adjustments:
        readiness["adjustments_reviewed"] = {
            "status": "warning",
            "count": len(adjustments),
            "pending": len(pending_adjustments)
        }
    
    # Count receipts (stock in) for period
    receipts = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": "stock_in",
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    receipts_without_cost = [r for r in receipts if not r.get("unit_cost")]
    if receipts_without_cost:
        readiness["receipts_completed"] = {
            "status": "warning",
            "count": len(receipts),
            "issues": len(receipts_without_cost)
        }
    else:
        readiness["receipts_completed"]["count"] = len(receipts)
    
    # Count requisitions for period
    requisitions = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": {"$in": ["requisition", "production", "usage"]},
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(1000)
    readiness["requisitions_recorded"]["count"] = len(requisitions)
    
    # ===== INVENTORY VALUATION =====
    # Get opening inventory (from previous period snapshot or calculate)
    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    prev_snapshot = await db.period_close_snapshots.find_one(
        {"company_id": user.company_id, "year": prev_year, "month": prev_month},
        {"_id": 0, "inventory_valuation": 1}
    )
    
    opening_inventory = prev_snapshot.get("inventory_valuation", {}).get("closing_value", 0) if prev_snapshot else 0
    
    # Calculate purchases received in period
    purchases_value = sum(
        (r.get("quantity", 0) * r.get("unit_cost", 0)) for r in receipts
    )
    
    # Calculate current inventory value (closing)
    all_inventory = await db.ingredients.find(
        {"company_id": user.company_id},
        {"_id": 0, "stock_quantity": 1, "cost_per_unit": 1}
    ).to_list(1000)
    
    closing_inventory = sum(
        (i.get("stock_quantity", 0) * i.get("cost_per_unit", 0)) for i in all_inventory
    )
    
    # Calculate COGS: Opening + Purchases - Closing
    total_cogs = opening_inventory + purchases_value - closing_inventory
    
    inventory_valuation = {
        "opening_value": round(opening_inventory, 2),
        "purchases_received": round(purchases_value, 2),
        "closing_value": round(closing_inventory, 2),
        "cogs_calculated": round(max(0, total_cogs), 2)
    }
    
    # ===== COGS ALLOCATION (Event vs Overhead) =====
    # Event COGS: movements with event_id
    event_movements = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": {"$in": ["requisition", "production", "usage"]},
        "event_id": {"$nin": [None, ""]},
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    event_cogs = sum((m.get("quantity", 0) * m.get("unit_cost", 0)) for m in event_movements)
    
    # Overhead COGS: movements without event_id + adjustments
    overhead_cogs = unassigned_value + sum(
        abs(a.get("quantity", 0) * a.get("unit_cost", 0)) for a in adjustments
    )
    
    cogs_allocation = {
        "event_cogs": round(event_cogs, 2),
        "overhead_cogs": round(overhead_cogs, 2),
        "total_allocated": round(event_cogs + overhead_cogs, 2),
        "unassigned_requisitions": len(unassigned_movements),
        "adjustments_value": round(sum(abs(a.get("quantity", 0) * a.get("unit_cost", 0)) for a in adjustments), 2)
    }
    
    # Reconciliation status
    allocation_gap = abs(total_cogs - (event_cogs + overhead_cogs))
    reconciliation = {
        "status": "balanced" if allocation_gap < 1 else "gap",
        "calculated_cogs": round(total_cogs, 2),
        "allocated_cogs": round(event_cogs + overhead_cogs, 2),
        "gap_amount": round(allocation_gap, 2)
    }
    
    # ===== AR AGING at close =====
    invoices = await db.invoices.find(
        {"company_id": user.company_id, "status": {"$in": ["sent", "overdue", "partial"]}},
        {"_id": 0, "total_amount": 1, "amount_paid": 1, "due_date": 1, "created_at": 1}
    ).to_list(500)
    
    now = datetime.now(timezone.utc)
    ar_aging = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, "total": 0}
    
    for inv in invoices:
        balance = inv.get("total_amount", 0) - inv.get("amount_paid", 0)
        if balance <= 0:
            continue
        
        ar_aging["total"] += balance
        
        due_date_str = inv.get("due_date") or inv.get("created_at")
        if due_date_str:
            try:
                due_date = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")) if isinstance(due_date_str, str) else due_date_str
                days_overdue = (now - due_date).days
                
                if days_overdue <= 0:
                    ar_aging["current"] += balance
                elif days_overdue <= 30:
                    ar_aging["1_30"] += balance
                elif days_overdue <= 60:
                    ar_aging["31_60"] += balance
                elif days_overdue <= 90:
                    ar_aging["61_90"] += balance
                else:
                    ar_aging["90_plus"] += balance
            except:
                ar_aging["current"] += balance
    
    for k in ar_aging:
        ar_aging[k] = round(ar_aging[k], 2)
    
    # Determine if period can be closed
    has_blockers = (
        readiness["missing_unit_costs"]["status"] == "block" or
        readiness["negative_stock"]["status"] == "block"
    )
    
    can_close = not has_blockers and not (existing and existing.get("status") == "closed")
    
    return {
        "period_key": period_key,
        "year": year,
        "month": month,
        "status": existing.get("status", "open") if existing else "open",
        "closed_at": existing.get("closed_at") if existing else None,
        "closed_by": existing.get("closed_by") if existing else None,
        "readiness": readiness,
        "inventory_valuation": inventory_valuation,
        "cogs_allocation": cogs_allocation,
        "reconciliation": reconciliation,
        "ar_aging": ar_aging,
        "cash_snapshot": existing.get("cash_snapshot") if existing else None,
        "can_close": can_close,
        "has_blockers": has_blockers
    }

@business_clarity_router.get("/period-close/{year}/{month}/exceptions")
async def get_period_exceptions(year: int, month: int, filter_type: str = "all", user: User = Depends(get_current_user)):
    """Get actionable exceptions for a period"""
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    exceptions = []
    
    # Missing unit costs
    items_without_cost = await db.ingredients.find(
        {"company_id": user.company_id, "$or": [{"unit_cost": None}, {"unit_cost": 0}, {"unit_cost": {"$exists": False}}]},
        {"_id": 0, "ingredient_id": 1, "name": 1, "stock_quantity": 1, "unit": 1}
    ).to_list(100)
    
    for item in items_without_cost:
        exceptions.append({
            "exception_id": f"missing_cost_{item['ingredient_id']}",
            "type": "missing_cost",
            "severity": "block",
            "sku": item.get("name"),
            "item_id": item["ingredient_id"],
            "qty": item.get("stock_quantity", 0),
            "unit": item.get("unit", ""),
            "value_impact": 0,
            "source": "Inventory",
            "suggested_action": "Set unit cost",
            "status": "open"
        })
    
    # Negative stock
    negative_items = await db.ingredients.find(
        {"company_id": user.company_id, "stock_quantity": {"$lt": 0}},
        {"_id": 0, "ingredient_id": 1, "name": 1, "stock_quantity": 1, "unit_cost": 1, "unit": 1}
    ).to_list(100)
    
    for item in negative_items:
        exceptions.append({
            "exception_id": f"negative_stock_{item['ingredient_id']}",
            "type": "negative_stock",
            "severity": "block",
            "sku": item.get("name"),
            "item_id": item["ingredient_id"],
            "qty": item.get("stock_quantity", 0),
            "unit": item.get("unit", ""),
            "value_impact": round(item.get("stock_quantity", 0) * item.get("unit_cost", 0), 2),
            "source": "Inventory",
            "suggested_action": "Adjust stock or record receipt",
            "status": "open"
        })
    
    # Unassigned usage
    unassigned = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": {"$in": ["requisition", "production", "usage"]},
        "event_id": {"$in": [None, ""]},
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(200)
    
    for m in unassigned:
        exceptions.append({
            "exception_id": f"unassigned_{m.get('movement_id', m.get('ingredient_id'))}",
            "type": "unassigned",
            "severity": "warning",
            "sku": m.get("ingredient_name", m.get("name", "Unknown")),
            "item_id": m.get("ingredient_id"),
            "qty": m.get("quantity", 0),
            "unit": m.get("unit", ""),
            "value_impact": round(m.get("quantity", 0) * m.get("unit_cost", 0), 2),
            "source": "Requisition",
            "suggested_action": "Assign to event or categorize as overhead",
            "status": "open"
        })
    
    # Filter by type
    if filter_type == "blocking":
        exceptions = [e for e in exceptions if e["severity"] == "block"]
    elif filter_type == "warnings":
        exceptions = [e for e in exceptions if e["severity"] == "warning"]
    elif filter_type == "resolved":
        exceptions = [e for e in exceptions if e["status"] == "resolved"]
    
    return {
        "period_key": f"{year}-{month:02d}",
        "exceptions": exceptions,
        "summary": {
            "total": len(exceptions),
            "blocking": len([e for e in exceptions if e["severity"] == "block"]),
            "warnings": len([e for e in exceptions if e["severity"] == "warning"]),
            "resolved": len([e for e in exceptions if e["status"] == "resolved"])
        }
    }

@business_clarity_router.put("/period-close/exceptions/{exception_id}")
async def update_exception(exception_id: str, data: CloseExceptionUpdate, user: User = Depends(get_current_user)):
    """Update an exception (fix, assign, categorize)"""
    # Parse exception type from ID
    parts = exception_id.split("_")
    exc_type = parts[0] if parts else ""
    item_id = "_".join(parts[1:]) if len(parts) > 1 else ""
    
    if exc_type == "missing" and item_id:
        # This would update unit cost - handled via inventory endpoint
        pass
    elif exc_type == "negative" and item_id:
        # Would need stock adjustment
        pass
    elif exc_type == "unassigned" and item_id:
        # Update movement with event_id or categorization
        if data.assigned_event_id:
            await db.stock_movements.update_one(
                {"movement_id": item_id, "company_id": user.company_id},
                {"$set": {"event_id": data.assigned_event_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        elif data.categorization:
            await db.stock_movements.update_one(
                {"movement_id": item_id, "company_id": user.company_id},
                {"$set": {"categorization": data.categorization, "categorized": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    # Log the resolution
    await db.close_exception_log.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "exception_id": exception_id,
        "action": "updated",
        "resolution_notes": data.resolution_notes,
        "updated_by": user.user_id,
        "updated_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"success": True, "exception_id": exception_id}

@business_clarity_router.post("/period-close/{year}/{month}/cash-snapshot")
async def save_cash_snapshot(year: int, month: int, data: CashSnapshotCreate, user: User = Depends(get_current_user)):
    """Save manual cash snapshot for a period"""
    snapshot = {
        "snapshot_id": f"cash_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "year": year,
        "month": month,
        "opening_cash": data.opening_cash,
        "closing_cash": data.closing_cash,
        "cash_in": data.cash_in,
        "cash_out": data.cash_out,
        "notes": data.notes,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert cash snapshot
    await db.cash_snapshots.update_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"$set": snapshot},
        upsert=True
    )
    
    return snapshot

@business_clarity_router.post("/period-close/{year}/{month}/close")
async def close_period(year: int, month: int, notes: str = "", user: User = Depends(get_current_user)):
    """Close a period - locks all data and creates snapshot"""
    # Check user role (only Finance or Owner can close)
    if user.role not in ["owner", "admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only Finance or Owner can close periods")
    
    # Get period detail to check readiness
    period_detail = await get_period_close_detail(year, month, user)
    
    if period_detail["has_blockers"]:
        raise HTTPException(status_code=400, detail="Cannot close period with blocking issues")
    
    # Check if already closed
    existing = await db.period_close_snapshots.find_one(
        {"company_id": user.company_id, "year": year, "month": month}
    )
    
    if existing and existing.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Period already closed")
    
    # Get cash snapshot if exists
    cash_snapshot = await db.cash_snapshots.find_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"_id": 0}
    )
    
    now = datetime.now(timezone.utc)
    
    # Create period close snapshot
    snapshot = {
        "snapshot_id": f"pclose_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "year": year,
        "month": month,
        "period_key": f"{year}-{month:02d}",
        "status": "closed",
        "inventory_valuation": period_detail["inventory_valuation"],
        "cogs_allocation": period_detail["cogs_allocation"],
        "reconciliation": period_detail["reconciliation"],
        "ar_aging": period_detail["ar_aging"],
        "cash_snapshot": cash_snapshot,
        "close_notes": notes,
        "closed_by": user.user_id,
        "closed_by_name": user.name,
        "closed_at": now.isoformat(),
        "created_at": now.isoformat()
    }
    
    # Upsert snapshot
    await db.period_close_snapshots.update_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"$set": snapshot},
        upsert=True
    )
    
    # Create audit log
    await db.period_close_audit_log.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "year": year,
        "month": month,
        "action": "close",
        "user_id": user.user_id,
        "user_name": user.name,
        "notes": notes,
        "timestamp": now.isoformat()
    })
    
    return {"success": True, "snapshot_id": snapshot["snapshot_id"], "status": "closed"}

@business_clarity_router.post("/period-close/{year}/{month}/reopen")
async def reopen_period(year: int, month: int, reason: str, user: User = Depends(get_current_user)):
    """Reopen a closed period - Owner only"""
    # Only owner can reopen
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only Owner can reopen closed periods")
    
    if not reason or len(reason) < 10:
        raise HTTPException(status_code=400, detail="Reason required (minimum 10 characters)")
    
    existing = await db.period_close_snapshots.find_one(
        {"company_id": user.company_id, "year": year, "month": month}
    )
    
    if not existing or existing.get("status") != "closed":
        raise HTTPException(status_code=400, detail="Period is not closed")
    
    now = datetime.now(timezone.utc)
    
    # Update status to open
    await db.period_close_snapshots.update_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"$set": {
            "status": "open",
            "reopened_at": now.isoformat(),
            "reopened_by": user.user_id,
            "reopen_reason": reason
        }}
    )
    
    # Audit log
    await db.period_close_audit_log.insert_one({
        "log_id": f"audit_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "year": year,
        "month": month,
        "action": "reopen",
        "user_id": user.user_id,
        "user_name": user.name,
        "notes": reason,
        "timestamp": now.isoformat()
    })
    
    return {"success": True, "status": "open"}

# ============== PHYSICAL INVENTORY CHECK (Conteo Físico) ==============

class PhysicalCountItem(BaseModel):
    ingredient_id: str
    counted_qty: float
    notes: Optional[str] = None

class PhysicalCountCreate(BaseModel):
    items: List[PhysicalCountItem]
    count_date: Optional[str] = None
    notes: Optional[str] = None

@business_clarity_router.get("/period-close/{year}/{month}/physical-count")
async def get_physical_count_status(year: int, month: int, user: User = Depends(get_current_user)):
    """Get physical inventory count status for the period"""
    period_key = f"{year}-{month:02d}"
    
    # Get existing count for period
    existing_count = await db.physical_inventory_counts.find_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"_id": 0}
    )
    
    # Get all inventory items for comparison
    all_items = await db.ingredients.find(
        {"company_id": user.company_id},
        {"_id": 0, "ingredient_id": 1, "name": 1, "stock_quantity": 1, "unit_cost": 1, "unit": 1, "category": 1}
    ).to_list(1000)
    
    # Build comparison if count exists
    comparison = []
    total_system_value = 0
    total_counted_value = 0
    total_variance_value = 0
    items_with_variance = 0
    
    if existing_count and existing_count.get("items"):
        count_items = {ci["ingredient_id"]: ci for ci in existing_count.get("items", [])}
        
        for item in all_items:
            iid = item.get("ingredient_id")
            system_qty = item.get("stock_quantity", 0)
            unit_cost = item.get("unit_cost", 0) or item.get("cost_per_unit", 0) or 0
            
            counted_data = count_items.get(iid)
            counted_qty = counted_data.get("counted_qty", system_qty) if counted_data else None
            
            variance_qty = (counted_qty - system_qty) if counted_qty is not None else 0
            variance_value = variance_qty * unit_cost
            
            system_value = system_qty * unit_cost
            counted_value = (counted_qty * unit_cost) if counted_qty is not None else system_value
            
            total_system_value += system_value
            total_counted_value += counted_value
            total_variance_value += abs(variance_value)
            
            if abs(variance_qty) > 0.01:
                items_with_variance += 1
            
            comparison.append({
                "ingredient_id": iid,
                "name": item.get("name"),
                "category": item.get("category"),
                "unit": item.get("unit"),
                "system_qty": round(system_qty, 2),
                "counted_qty": round(counted_qty, 2) if counted_qty is not None else None,
                "variance_qty": round(variance_qty, 2),
                "unit_cost": round(unit_cost, 2),
                "variance_value": round(variance_value, 2),
                "status": "counted" if counted_qty is not None else "pending",
                "notes": counted_data.get("notes") if counted_data else None
            })
    else:
        # No count yet - show all items as pending
        for item in all_items:
            system_qty = item.get("stock_quantity", 0)
            unit_cost = item.get("unit_cost", 0) or item.get("cost_per_unit", 0) or 0
            system_value = system_qty * unit_cost
            total_system_value += system_value
            
            comparison.append({
                "ingredient_id": item.get("ingredient_id"),
                "name": item.get("name"),
                "category": item.get("category"),
                "unit": item.get("unit"),
                "system_qty": round(system_qty, 2),
                "counted_qty": None,
                "variance_qty": 0,
                "unit_cost": round(unit_cost, 2),
                "variance_value": 0,
                "status": "pending",
                "notes": None
            })
    
    items_counted = len([c for c in comparison if c["status"] == "counted"])
    items_pending = len([c for c in comparison if c["status"] == "pending"])
    
    return {
        "period_key": period_key,
        "has_count": existing_count is not None,
        "count_date": existing_count.get("count_date") if existing_count else None,
        "counted_by": existing_count.get("counted_by_name") if existing_count else None,
        "summary": {
            "total_items": len(all_items),
            "items_counted": items_counted,
            "items_pending": items_pending,
            "items_with_variance": items_with_variance,
            "completion_percent": round((items_counted / len(all_items) * 100) if all_items else 0, 1),
            "total_system_value": round(total_system_value, 2),
            "total_counted_value": round(total_counted_value, 2),
            "total_variance_value": round(total_variance_value, 2)
        },
        "items": comparison,
        "is_complete": items_pending == 0 and len(all_items) > 0
    }

@business_clarity_router.post("/period-close/{year}/{month}/physical-count")
async def save_physical_count(year: int, month: int, data: PhysicalCountCreate, user: User = Depends(get_current_user)):
    """Save physical inventory count for the period"""
    now = datetime.now(timezone.utc)
    
    count_doc = {
        "count_id": f"pcount_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "year": year,
        "month": month,
        "period_key": f"{year}-{month:02d}",
        "items": [item.dict() for item in data.items],
        "count_date": data.count_date or now.isoformat()[:10],
        "notes": data.notes,
        "counted_by": user.user_id,
        "counted_by_name": user.name,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # Upsert
    await db.physical_inventory_counts.update_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"$set": count_doc},
        upsert=True
    )
    
    return {"success": True, "count_id": count_doc["count_id"]}

@business_clarity_router.post("/period-close/{year}/{month}/physical-count/apply")
async def apply_physical_count_adjustments(year: int, month: int, user: User = Depends(get_current_user)):
    """Apply physical count variances as inventory adjustments"""
    # Check user role
    if user.role not in ["owner", "admin", "finance"]:
        raise HTTPException(status_code=403, detail="Only Finance+ can apply count adjustments")
    
    # Get count
    count = await db.physical_inventory_counts.find_one(
        {"company_id": user.company_id, "year": year, "month": month}
    )
    
    if not count:
        raise HTTPException(status_code=404, detail="No physical count found for this period")
    
    now = datetime.now(timezone.utc)
    adjustments_made = 0
    
    for item in count.get("items", []):
        iid = item.get("ingredient_id")
        counted_qty = item.get("counted_qty")
        
        if counted_qty is None:
            continue
        
        # Get current system qty
        ingredient = await db.ingredients.find_one(
            {"ingredient_id": iid, "company_id": user.company_id},
            {"_id": 0, "stock_quantity": 1, "unit_cost": 1}
        )
        
        if not ingredient:
            continue
        
        system_qty = ingredient.get("stock_quantity", 0)
        variance = counted_qty - system_qty
        
        if abs(variance) < 0.01:
            continue
        
        # Apply adjustment
        await db.ingredients.update_one(
            {"ingredient_id": iid, "company_id": user.company_id},
            {"$set": {"stock_quantity": counted_qty, "updated_at": now.isoformat()}}
        )
        
        # Log the adjustment
        await db.inventory_adjustments.insert_one({
            "adjustment_id": f"adj_{uuid.uuid4().hex[:8]}",
            "company_id": user.company_id,
            "ingredient_id": iid,
            "adjustment": variance,
            "adjustment_type": "physical_count",
            "reason": f"Physical count adjustment for {year}-{month:02d}",
            "previous_quantity": system_qty,
            "new_quantity": counted_qty,
            "user_id": user.user_id,
            "period_key": f"{year}-{month:02d}",
            "created_at": now.isoformat()
        })
        
        adjustments_made += 1
    
    # Mark count as applied
    await db.physical_inventory_counts.update_one(
        {"company_id": user.company_id, "year": year, "month": month},
        {"$set": {"applied": True, "applied_at": now.isoformat(), "applied_by": user.user_id}}
    )
    
    return {"success": True, "adjustments_made": adjustments_made}

@business_clarity_router.get("/period-close/{year}/{month}/event-allocation")
async def get_event_allocation_preview(year: int, month: int, user: User = Depends(get_current_user)):
    """Get COGS allocation preview by event for the period"""
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Get events in period
    events = await db.events.find({
        "company_id": user.company_id,
        "event_date": {"$gte": start_date.isoformat()[:10], "$lt": end_date.isoformat()[:10]}
    }, {"_id": 0, "event_id": 1, "event_name": 1, "client_id": 1, "total_price": 1}).to_list(200)
    
    # Get movements by event
    movements = await db.stock_movements.find({
        "company_id": user.company_id,
        "movement_type": {"$in": ["requisition", "production", "usage"]},
        "event_id": {"$nin": [None, ""]},
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(2000)
    
    # Aggregate COGS by event
    event_cogs = {}
    for m in movements:
        eid = m.get("event_id")
        if eid:
            if eid not in event_cogs:
                event_cogs[eid] = 0
            event_cogs[eid] += m.get("quantity", 0) * m.get("unit_cost", 0)
    
    # Build allocation preview
    allocation = []
    for e in events:
        eid = e.get("event_id")
        cogs = event_cogs.get(eid, 0)
        revenue = e.get("total_price", 0)
        margin = revenue - cogs if revenue > 0 else 0
        margin_pct = (margin / revenue * 100) if revenue > 0 else 0
        
        # Check if all requisitions for this event have costs
        event_movements = [m for m in movements if m.get("event_id") == eid]
        has_missing_costs = any(not m.get("unit_cost") for m in event_movements)
        
        allocation.append({
            "event_id": eid,
            "event_name": e.get("event_name"),
            "event_cogs": round(cogs, 2),
            "revenue": round(revenue, 2),
            "margin": round(margin, 2),
            "margin_percent": round(margin_pct, 1),
            "completeness": "incomplete" if has_missing_costs else "complete"
        })
    
    # Sort by margin (lowest first to highlight issues)
    allocation.sort(key=lambda x: x["margin_percent"])
    
    return {
        "period_key": f"{year}-{month:02d}",
        "events": allocation,
        "summary": {
            "total_events": len(allocation),
            "complete": len([a for a in allocation if a["completeness"] == "complete"]),
            "incomplete": len([a for a in allocation if a["completeness"] == "incomplete"]),
            "total_event_cogs": round(sum(a["event_cogs"] for a in allocation), 2)
        }
    }

@business_clarity_router.get("/period-close/{year}/{month}/audit-log")
async def get_period_audit_log(year: int, month: int, user: User = Depends(get_current_user)):
    """Get audit log for a period"""
    logs = await db.period_close_audit_log.find(
        {"company_id": user.company_id, "year": year, "month": month},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    
    return logs


# ============== ASSET VALUE REPORT ==============

@business_clarity_router.get("/reports/asset-value")
async def get_asset_value_report(user: User = Depends(get_current_user)):
    """Get comprehensive asset value report combining inventory and losses"""
    
    # Get all equipment/operational inventory items
    equipment_items = await db.ingredients.find(
        {
            "company_id": user.company_id,
            "inventory_type": {"$in": ["equipment", "event_supply"]}
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Calculate total asset value (purchase value based on cost_per_unit * stock)
    total_asset_value = 0
    total_replacement_value = 0
    assets_by_category = {}
    
    for item in equipment_items:
        stock = item.get("stock_quantity", 0)
        unit_cost = item.get("cost_per_unit", 0)
        replacement_cost = item.get("replacement_cost", 0) or unit_cost
        category = item.get("category", "general")
        
        item_value = stock * unit_cost
        item_replacement = stock * replacement_cost
        
        total_asset_value += item_value
        total_replacement_value += item_replacement
        
        if category not in assets_by_category:
            assets_by_category[category] = {
                "count": 0,
                "total_stock": 0,
                "value": 0,
                "replacement_value": 0
            }
        assets_by_category[category]["count"] += 1
        assets_by_category[category]["total_stock"] += stock
        assets_by_category[category]["value"] += item_value
        assets_by_category[category]["replacement_value"] += item_replacement
    
    # Get all asset losses
    losses = await db.asset_losses.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Calculate loss totals
    total_loss_value = sum(l.get("total_value", 0) for l in losses)
    operational_expense_losses = sum(
        l.get("total_value", 0) 
        for l in losses 
        if l.get("resolution") == "operational_expense"
    )
    billed_to_client_losses = sum(
        l.get("total_value", 0) 
        for l in losses 
        if l.get("resolution") == "bill_client"
    )
    pending_losses = sum(
        l.get("total_value", 0) 
        for l in losses 
        if l.get("status") == "pending"
    )
    
    # Group losses by reason
    losses_by_reason = {}
    for l in losses:
        reason = l.get("reason", "unknown")
        if reason not in losses_by_reason:
            losses_by_reason[reason] = {"count": 0, "value": 0}
        losses_by_reason[reason]["count"] += 1
        losses_by_reason[reason]["value"] += l.get("total_value", 0)
    
    # Group losses by month for trend analysis
    losses_by_month = {}
    for l in losses:
        created = l.get("created_at")
        if created:
            if isinstance(created, str):
                period = created[:7]  # YYYY-MM
            else:
                period = created.strftime("%Y-%m")
        else:
            period = l.get("count_period", "unknown")
        
        if period not in losses_by_month:
            losses_by_month[period] = {"count": 0, "value": 0}
        losses_by_month[period]["count"] += 1
        losses_by_month[period]["value"] += l.get("total_value", 0)
    
    # Sort months chronologically
    sorted_months = sorted(losses_by_month.items(), key=lambda x: x[0])
    
    # Top losses (most valuable items lost)
    top_losses = sorted(losses, key=lambda x: x.get("total_value", 0), reverse=True)[:10]
    
    # Calculate loss rate
    loss_rate = (total_loss_value / total_asset_value * 100) if total_asset_value > 0 else 0
    
    # Recovery metrics
    recovered_value = billed_to_client_losses  # Value recovered by billing clients
    net_loss = total_loss_value - recovered_value
    recovery_rate = (recovered_value / total_loss_value * 100) if total_loss_value > 0 else 0
    
    return {
        "assets": {
            "total_value": round(total_asset_value, 2),
            "replacement_value": round(total_replacement_value, 2),
            "items_count": len(equipment_items),
            "by_category": {
                k: {
                    "count": v["count"],
                    "total_stock": v["total_stock"],
                    "value": round(v["value"], 2),
                    "replacement_value": round(v["replacement_value"], 2)
                }
                for k, v in assets_by_category.items()
            }
        },
        "losses": {
            "total_value": round(total_loss_value, 2),
            "total_count": len(losses),
            "operational_expense": round(operational_expense_losses, 2),
            "billed_to_clients": round(billed_to_client_losses, 2),
            "pending": round(pending_losses, 2),
            "by_reason": {
                k: {"count": v["count"], "value": round(v["value"], 2)}
                for k, v in losses_by_reason.items()
            },
            "by_month": [
                {"period": period, "count": data["count"], "value": round(data["value"], 2)}
                for period, data in sorted_months
            ],
            "recent": [
                {
                    "loss_id": l.get("loss_id"),
                    "item_name": l.get("item_name"),
                    "quantity": l.get("quantity"),
                    "total_value": round(l.get("total_value", 0), 2),
                    "reason": l.get("reason"),
                    "resolution": l.get("resolution"),
                    "status": l.get("status"),
                    "created_at": l.get("created_at").isoformat() if hasattr(l.get("created_at"), 'isoformat') else l.get("created_at")
                }
                for l in top_losses
            ]
        },
        "metrics": {
            "loss_rate": round(loss_rate, 2),
            "recovery_rate": round(recovery_rate, 2),
            "recovered_value": round(recovered_value, 2),
            "net_loss": round(net_loss, 2),
            "avg_loss_per_incident": round(total_loss_value / len(losses), 2) if losses else 0
        },
        "summary": {
            "current_asset_value": round(total_asset_value, 2),
            "total_losses_absorbed": round(operational_expense_losses, 2),
            "total_billed_to_clients": round(billed_to_client_losses, 2),
            "pending_resolution": round(pending_losses, 2),
            "effective_asset_base": round(total_asset_value - net_loss, 2)
        }
    }


# ==================== MARKETING ROI ====================

class MarketingROIFilters(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    activation_id: Optional[str] = None


@business_clarity_router.get("/marketing-roi")
async def get_marketing_roi_dashboard(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Marketing ROI dashboard - tracks internal marketing investment vs returns"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Date filtering
    date_filter = {}
    if start_date:
        date_filter["$gte"] = start_date
    if end_date:
        date_filter["$lte"] = end_date
    
    # Get internal cost center client
    cost_center = await db.clients.find_one({
        "company_id": company_id,
        "is_internal_cost_center": True
    }, {"_id": 0, "client_id": 1, "display_name": 1})
    
    cost_center_id = cost_center.get("client_id") if cost_center else None
    
    # 1. Get all marketing activations (internal events)
    activation_query = {"company_id": company_id}
    if date_filter:
        activation_query["created_at"] = date_filter
    
    activations = await db.marketing_activations.find(
        activation_query,
        {"_id": 0}
    ).to_list(1000)
    
    # 2. Get internal events (events linked to cost center)
    internal_events_query = {
        "company_id": company_id,
        "$or": [
            {"is_internal_event": True},
            {"client_id": cost_center_id} if cost_center_id else {"is_internal_event": True}
        ]
    }
    if date_filter:
        internal_events_query["created_at"] = date_filter
    
    internal_events = await db.events.find(
        internal_events_query,
        {"_id": 0}
    ).to_list(500)
    
    # 3. Get leads attributed to activations
    leads_with_activation = await db.leads.find({
        "company_id": company_id,
        "activation_id": {"$exists": True, "$ne": None}
    }, {"_id": 0}).to_list(1000)
    
    # Also get leads where source matches an activation name
    activation_names = [a.get("name", "").lower() for a in activations if a.get("name")]
    leads_by_source = await db.leads.find({
        "company_id": company_id,
        "source": {"$in": [a.get("name") for a in activations if a.get("name")]}
    }, {"_id": 0}).to_list(1000)
    
    # Combine leads
    all_attributed_leads = {l["lead_id"]: l for l in leads_with_activation}
    for lead in leads_by_source:
        if lead["lead_id"] not in all_attributed_leads:
            all_attributed_leads[lead["lead_id"]] = lead
    attributed_leads = list(all_attributed_leads.values())
    
    # 4. Count conversions (leads that became events or clients)
    converted_leads = [l for l in attributed_leads if l.get("status") == "Converted" or l.get("converted_event_id")]
    
    # 5. Get revenue from converted events
    converted_event_ids = [l.get("converted_event_id") for l in converted_leads if l.get("converted_event_id")]
    revenue_from_conversions = 0.0
    
    if converted_event_ids:
        converted_events = await db.events.find({
            "event_id": {"$in": converted_event_ids}
        }, {"_id": 0, "total_price": 1, "budget": 1}).to_list(500)
        
        for event in converted_events:
            revenue_from_conversions += event.get("total_price") or event.get("budget") or 0
    
    # Calculate totals
    total_investment = sum(a.get("budget", 0) or 0 for a in activations)
    total_internal_events_cost = sum(e.get("budget", 0) or 0 for e in internal_events)
    total_leads = len(attributed_leads)
    total_conversions = len(converted_leads)
    conversion_rate = (total_conversions / total_leads * 100) if total_leads > 0 else 0
    
    # ROI calculation
    total_cost = total_investment + total_internal_events_cost
    roi = ((revenue_from_conversions - total_cost) / total_cost * 100) if total_cost > 0 else 0
    cost_per_lead = total_cost / total_leads if total_leads > 0 else 0
    cost_per_conversion = total_cost / total_conversions if total_conversions > 0 else 0
    
    # Build activation breakdown
    activation_breakdown = []
    for activation in activations:
        act_id = activation.get("activation_id")
        act_name = activation.get("name", "")
        
        # Count leads for this activation
        act_leads = [l for l in attributed_leads 
                     if l.get("activation_id") == act_id or 
                        l.get("source", "").lower() == act_name.lower()]
        act_conversions = [l for l in act_leads 
                          if l.get("status") == "Converted" or l.get("converted_event_id")]
        
        # Revenue from this activation's conversions
        act_event_ids = [l.get("converted_event_id") for l in act_conversions if l.get("converted_event_id")]
        act_revenue = 0.0
        if act_event_ids:
            act_events = await db.events.find({
                "event_id": {"$in": act_event_ids}
            }, {"_id": 0, "total_price": 1, "budget": 1}).to_list(100)
            act_revenue = sum(e.get("total_price") or e.get("budget") or 0 for e in act_events)
        
        act_cost = activation.get("budget", 0) or 0
        act_roi = ((act_revenue - act_cost) / act_cost * 100) if act_cost > 0 else 0
        
        activation_breakdown.append({
            "activation_id": act_id,
            "name": act_name,
            "type": activation.get("activation_type", "other"),
            "status": activation.get("status", "Active"),
            "budget": act_cost,
            "leads_generated": len(act_leads),
            "conversions": len(act_conversions),
            "conversion_rate": (len(act_conversions) / len(act_leads) * 100) if act_leads else 0,
            "revenue_generated": act_revenue,
            "roi": round(act_roi, 1),
            "linked_event_name": activation.get("linked_event_name"),
            "campaign_name": activation.get("campaign_name")
        })
    
    # Sort by ROI descending
    activation_breakdown.sort(key=lambda x: x["roi"], reverse=True)
    
    return {
        "summary": {
            "total_investment": round(total_investment, 2),
            "total_internal_events_cost": round(total_internal_events_cost, 2),
            "total_cost": round(total_cost, 2),
            "total_leads_generated": total_leads,
            "total_conversions": total_conversions,
            "conversion_rate": round(conversion_rate, 1),
            "revenue_from_conversions": round(revenue_from_conversions, 2),
            "roi_percentage": round(roi, 1),
            "cost_per_lead": round(cost_per_lead, 2),
            "cost_per_conversion": round(cost_per_conversion, 2)
        },
        "cost_center": {
            "client_id": cost_center_id,
            "name": cost_center.get("display_name") if cost_center else None,
            "total_events": len(internal_events)
        },
        "activation_breakdown": activation_breakdown,
        "internal_events": [{
            "event_id": e.get("event_id"),
            "name": e.get("name"),
            "budget": e.get("budget", 0),
            "date": e.get("event_date"),
            "linked_activation_name": e.get("linked_activation_name")
        } for e in internal_events[:20]],
        "recent_attributed_leads": [{
            "lead_id": l.get("lead_id"),
            "lead_name": l.get("lead_name"),
            "source": l.get("source"),
            "activation_name": l.get("activation_name"),
            "status": l.get("status"),
            "converted": bool(l.get("converted_event_id")),
            "created_at": l.get("created_at")
        } for l in sorted(attributed_leads, key=lambda x: x.get("created_at", ""), reverse=True)[:20]]
    }


@business_clarity_router.get("/marketing-roi/activations")
async def get_marketing_activations_for_roi(user: User = Depends(get_current_user)):
    """Get list of activations for lead attribution dropdown"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    activations = await db.marketing_activations.find(
        {"company_id": company_id},
        {"_id": 0, "activation_id": 1, "name": 1, "activation_type": 1, "status": 1}
    ).sort("name", 1).to_list(500)
    
    return activations



# ============== PAYROLL COST SUMMARY ==============

@business_clarity_router.get("/payroll-summary")
async def get_payroll_summary_for_clarity(user: User = Depends(get_current_user)):
    """Get payroll cost summary for Business Clarity dashboard"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month
    
    # Get all completed payroll periods for this year
    periods = await db.payroll_periods.find(
        {
            "company_id": company_id,
            "status": "completed"
        },
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    # Calculate YTD totals
    ytd_gross = 0
    ytd_net = 0
    ytd_employer_cost = 0
    ytd_deductions = 0
    periods_this_year = 0
    
    monthly_costs = {}  # month -> cost
    
    for period in periods:
        payment_date = period.get("payment_date", "")
        if payment_date:
            try:
                payment_dt = datetime.fromisoformat(payment_date.replace("Z", "+00:00")) if isinstance(payment_date, str) else payment_date
                if payment_dt.year == current_year:
                    periods_this_year += 1
                    ytd_gross += period.get("total_gross", 0)
                    ytd_net += period.get("total_net", 0)
                    ytd_employer_cost += period.get("total_employer_cost", 0)
                    ytd_deductions += period.get("total_deductions", 0)
                    
                    # Track by month
                    month_key = payment_dt.month
                    if month_key not in monthly_costs:
                        monthly_costs[month_key] = {"gross": 0, "net": 0, "employer_cost": 0}
                    monthly_costs[month_key]["gross"] += period.get("total_gross", 0)
                    monthly_costs[month_key]["net"] += period.get("total_net", 0)
                    monthly_costs[month_key]["employer_cost"] += period.get("total_employer_cost", 0)
            except:
                pass
    
    # Get current month's data
    current_month_data = monthly_costs.get(current_month, {"gross": 0, "net": 0, "employer_cost": 0})
    
    # Get active employees count and total monthly payroll
    active_employees = await db.employees.count_documents({
        "company_id": company_id,
        "status": "active"
    })
    
    # Calculate estimated monthly payroll from employee base salaries
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0, "base_salary": 1, "payment_frequency": 1}
    ).to_list(500)
    
    estimated_monthly_gross = 0
    for emp in employees:
        salary = emp.get("base_salary", 0)
        freq = emp.get("payment_frequency", "biweekly")
        if freq == "biweekly":
            estimated_monthly_gross += salary * 2
        elif freq == "weekly":
            estimated_monthly_gross += salary * 4
        else:
            estimated_monthly_gross += salary
    
    # Get pending payroll (draft/pending_approval)
    pending_periods = await db.payroll_periods.find(
        {
            "company_id": company_id,
            "status": {"$in": ["draft", "pending_approval", "approved"]}
        },
        {"_id": 0, "period_id": 1, "period_name": 1, "status": 1, "total_net": 1, "payment_date": 1}
    ).to_list(10)
    
    # Calculate average monthly cost (YTD)
    months_with_data = len(monthly_costs)
    avg_monthly_cost = ytd_employer_cost / months_with_data if months_with_data > 0 else estimated_monthly_gross * 1.16  # Estimate with 16% employer contributions
    
    # Get last 6 months trend
    monthly_trend = []
    for i in range(5, -1, -1):
        month_num = current_month - i
        year = current_year
        if month_num <= 0:
            month_num += 12
            year -= 1
        
        month_name = datetime(year, month_num, 1).strftime("%b")
        cost_data = monthly_costs.get(month_num, {"employer_cost": 0}) if year == current_year else {"employer_cost": 0}
        monthly_trend.append({
            "month": month_name,
            "year": year,
            "cost": round(cost_data.get("employer_cost", 0), 2)
        })
    
    return {
        "active_employees": active_employees,
        "estimated_monthly_payroll": round(estimated_monthly_gross, 2),
        "estimated_monthly_employer_cost": round(estimated_monthly_gross * 1.16, 2),  # Base + ~16% contributions
        
        "ytd": {
            "gross_paid": round(ytd_gross, 2),
            "net_paid": round(ytd_net, 2),
            "total_employer_cost": round(ytd_employer_cost, 2),
            "total_deductions": round(ytd_deductions, 2),
            "periods_completed": periods_this_year
        },
        
        "current_month": {
            "gross": round(current_month_data["gross"], 2),
            "net": round(current_month_data["net"], 2),
            "employer_cost": round(current_month_data["employer_cost"], 2)
        },
        
        "avg_monthly_cost": round(avg_monthly_cost, 2),
        
        "pending_payrolls": [{
            "period_id": p.get("period_id"),
            "period_name": p.get("period_name"),
            "status": p.get("status"),
            "amount": round(p.get("total_net", 0), 2),
            "payment_date": p.get("payment_date")
        } for p in pending_periods],
        
        "monthly_trend": monthly_trend
    }


# ==================== SALES REPORTS ====================

@business_clarity_router.get("/reports/sales/general")
async def get_sales_general_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """General sales report - invoices and returns in a period"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Default to current month
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get invoices in period
    invoices = await db.invoices.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Calculate totals
    total_invoiced = sum(inv.get("total", 0) for inv in invoices if inv.get("status") != "cancelled")
    total_collected = sum(inv.get("total", 0) - inv.get("balance_due", 0) for inv in invoices)
    total_returns = sum(abs(inv.get("total", 0)) for inv in invoices if inv.get("total", 0) < 0)
    
    invoice_count = len([i for i in invoices if i.get("total", 0) > 0])
    return_count = len([i for i in invoices if i.get("total", 0) < 0])
    
    return {
        "period": {"start": start_date, "end": end_date},
        "summary": {
            "total_invoiced": round(total_invoiced, 2),
            "total_collected": round(total_collected, 2),
            "total_returns": round(total_returns, 2),
            "net_sales": round(total_invoiced - total_returns, 2),
            "invoice_count": invoice_count,
            "return_count": return_count
        },
        "invoices": [{
            "invoice_id": inv.get("invoice_id"),
            "invoice_number": inv.get("invoice_number"),
            "client_name": inv.get("client_name"),
            "date": inv.get("created_at", "")[:10],
            "total": inv.get("total", 0),
            "balance_due": inv.get("balance_due", 0),
            "status": inv.get("status")
        } for inv in invoices[:100]]  # Limit to 100 for display
    }


@business_clarity_router.get("/reports/sales/by-client")
async def get_sales_by_client_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Sales by client - total billing per client"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    invoices = await db.invoices.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        "status": {"$ne": "cancelled"}
    }, {"_id": 0}).to_list(5000)
    
    # Group by client
    client_sales = {}
    for inv in invoices:
        client_id = inv.get("client_id") or "unknown"
        client_name = inv.get("client_name") or "Sin Cliente"
        
        if client_id not in client_sales:
            client_sales[client_id] = {
                "client_id": client_id,
                "client_name": client_name,
                "total_invoiced": 0,
                "total_collected": 0,
                "total_outstanding": 0,
                "invoice_count": 0
            }
        
        client_sales[client_id]["total_invoiced"] += inv.get("total", 0)
        collected = inv.get("total", 0) - inv.get("balance_due", 0)
        client_sales[client_id]["total_collected"] += collected
        client_sales[client_id]["total_outstanding"] += inv.get("balance_due", 0)
        client_sales[client_id]["invoice_count"] += 1
    
    # Sort by total invoiced
    records = sorted(client_sales.values(), key=lambda x: x["total_invoiced"], reverse=True)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "total_clients": len(records),
        "records": [{
            **r,
            "total_invoiced": round(r["total_invoiced"], 2),
            "total_collected": round(r["total_collected"], 2),
            "total_outstanding": round(r["total_outstanding"], 2)
        } for r in records]
    }


@business_clarity_router.get("/reports/sales/by-salesperson")
async def get_sales_by_salesperson_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Sales by salesperson - invoices per seller"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get events (sales) with assigned salesperson
    events = await db.events.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Get users for name lookup
    users = await db.users.find({"company_id": company_id}, {"_id": 0, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1}).to_list(500)
    user_map = {u["user_id"]: u.get("name") or f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or "Usuario" for u in users}
    
    # Group by salesperson
    sales_by_person = {}
    for ev in events:
        seller_id = ev.get("assigned_to") or ev.get("created_by") or "unassigned"
        seller_name = user_map.get(seller_id, "Sin Asignar")
        
        if seller_id not in sales_by_person:
            sales_by_person[seller_id] = {
                "salesperson_id": seller_id,
                "salesperson_name": seller_name,
                "total_revenue": 0,
                "event_count": 0,
                "closed_count": 0
            }
        
        sales_by_person[seller_id]["total_revenue"] += ev.get("final_price", 0) or ev.get("price", 0)
        sales_by_person[seller_id]["event_count"] += 1
        if ev.get("status") in ["completed", "closed", "paid"]:
            sales_by_person[seller_id]["closed_count"] += 1
    
    records = sorted(sales_by_person.values(), key=lambda x: x["total_revenue"], reverse=True)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "total_salespeople": len(records),
        "records": [{
            **r,
            "total_revenue": round(r["total_revenue"], 2),
            "close_rate": round((r["closed_count"] / r["event_count"] * 100) if r["event_count"] > 0 else 0, 1)
        } for r in records]
    }


@business_clarity_router.get("/reports/sales/by-item")
async def get_sales_by_item_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Sales by item - billing and quantity per item"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get invoice lines from events
    events = await db.events.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Group by item
    item_sales = {}
    for ev in events:
        for item in ev.get("items", []):
            item_id = item.get("item_id") or item.get("item_type_id") or "unknown"
            item_name = item.get("name") or item.get("item_name") or "Item"
            
            if item_id not in item_sales:
                item_sales[item_id] = {
                    "item_id": item_id,
                    "item_name": item_name,
                    "quantity_sold": 0,
                    "total_revenue": 0,
                    "avg_unit_price": 0
                }
            
            qty = item.get("quantity", 1)
            price = item.get("unit_price", 0) * qty if item.get("unit_price") else item.get("total", 0)
            item_sales[item_id]["quantity_sold"] += qty
            item_sales[item_id]["total_revenue"] += price
    
    # Calculate averages
    for item in item_sales.values():
        if item["quantity_sold"] > 0:
            item["avg_unit_price"] = round(item["total_revenue"] / item["quantity_sold"], 2)
    
    records = sorted(item_sales.values(), key=lambda x: x["total_revenue"], reverse=True)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "total_items": len(records),
        "records": [{
            **r,
            "total_revenue": round(r["total_revenue"], 2)
        } for r in records]
    }


@business_clarity_router.get("/reports/sales/item-profitability")
async def get_item_profitability_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Item profitability - revenue, cost, and margin per item"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get item types with cost info
    item_types = await db.item_types.find({"company_id": company_id}, {"_id": 0}).to_list(500)
    item_cost_map = {it["item_type_id"]: it.get("unit_cost", 0) for it in item_types}
    
    # Get events for revenue
    events = await db.events.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Calculate profitability per item
    item_profit = {}
    for ev in events:
        for item in ev.get("items", []):
            item_id = item.get("item_type_id") or item.get("item_id") or "unknown"
            item_name = item.get("name") or item.get("item_name") or "Item"
            
            if item_id not in item_profit:
                item_profit[item_id] = {
                    "item_id": item_id,
                    "item_name": item_name,
                    "quantity_sold": 0,
                    "total_revenue": 0,
                    "total_cost": 0
                }
            
            qty = item.get("quantity", 1)
            revenue = item.get("unit_price", 0) * qty if item.get("unit_price") else item.get("total", 0)
            cost = item_cost_map.get(item_id, 0) * qty
            
            item_profit[item_id]["quantity_sold"] += qty
            item_profit[item_id]["total_revenue"] += revenue
            item_profit[item_id]["total_cost"] += cost
    
    # Calculate margins
    records = []
    for item in item_profit.values():
        profit = item["total_revenue"] - item["total_cost"]
        margin = (profit / item["total_revenue"] * 100) if item["total_revenue"] > 0 else 0
        records.append({
            **item,
            "total_revenue": round(item["total_revenue"], 2),
            "total_cost": round(item["total_cost"], 2),
            "profit": round(profit, 2),
            "margin_percent": round(margin, 1)
        })
    
    records = sorted(records, key=lambda x: x["profit"], reverse=True)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "total_items": len(records),
        "records": records
    }


# ============== ACCOUNTING ENGINE REPORTS ==============

@business_clarity_router.get("/reports/profit-loss")
async def get_profit_loss_report(
    user: User = Depends(get_current_user),
    year: int = None,
    month: int = None
):
    """
    Get Profit & Loss summary from the accounting engine.
    Aggregates all revenue, costs, and calculates gross profit.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not year:
        year = now.year
    if not month:
        month = now.month
    
    accounting_engine = AccountingEngine(db, company_id, user.user_id)
    summary = await accounting_engine.get_profit_loss_summary(year, month)
    
    return {
        "year": year,
        "month": month,
        **summary
    }


@business_clarity_router.get("/reports/cost-center-actual")
async def get_cost_center_actual_report(
    user: User = Depends(get_current_user),
    year: int = None,
    month: int = None
):
    """
    Get actual spending by cost center from accounting entries.
    This shows REAL transacted amounts vs budgeted.
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not year:
        year = now.year
    if not month:
        month = now.month
    
    accounting_engine = AccountingEngine(db, company_id, user.user_id)
    summary = await accounting_engine.get_cost_center_summary(year, month)
    
    # Get budgets from cost_centers collection (monthly_budgets field)
    month_key = f"{year}-{str(month).zfill(2)}"
    cost_centers = await db.cost_centers.find(
        {"company_id": company_id},
        {"_id": 0, "cost_center_id": 1, "monthly_budgets": 1, "annual_budget": 1}
    ).to_list(100)
    
    # Build budget map from monthly_budgets or annual_budget/12
    budget_map = {}
    for cc in cost_centers:
        cc_id = cc.get("cost_center_id")
        monthly_budgets = cc.get("monthly_budgets", {})
        if month_key in monthly_budgets:
            budget_map[cc_id] = monthly_budgets[month_key]
        elif cc.get("annual_budget"):
            budget_map[cc_id] = cc["annual_budget"] / 12
    
    # Enhance with budget comparison
    total_budget = 0
    for item in summary:
        cc_id = item.get("cost_center_id")
        if cc_id:
            item["budget"] = budget_map.get(cc_id, 0)
            total_budget += item["budget"]
            item["variance"] = round(item["budget"] - item["total_amount"], 2) if item["budget"] else None
            item["utilization_percent"] = round(
                (item["total_amount"] / item["budget"]) * 100, 1
            ) if item["budget"] > 0 else None
    
    return {
        "year": year,
        "month": month,
        "cost_centers": summary,
        "totals": {
            "total_actual": round(sum(s["total_amount"] for s in summary), 2),
            "total_budget": round(total_budget, 2)
        }
    }


@business_clarity_router.get("/reports/budget-alerts")
async def get_budget_alerts(
    user: User = Depends(get_current_user),
    year: int = None,
    month: int = None,
    warning_threshold: float = 80.0,
    critical_threshold: float = 90.0
):
    """
    Get budget alerts for cost centers that exceed thresholds.
    - Warning: >= 80% utilization (yellow)
    - Critical: >= 90% utilization (red)
    - Exceeded: > 100% utilization (dark red)
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not year:
        year = now.year
    if not month:
        month = now.month
    
    # Get actual spending
    accounting_engine = AccountingEngine(db, company_id, user.user_id)
    summary = await accounting_engine.get_cost_center_summary(year, month)
    
    # Get budgets
    month_key = f"{year}-{str(month).zfill(2)}"
    cost_centers = await db.cost_centers.find(
        {"company_id": company_id},
        {"_id": 0, "cost_center_id": 1, "name": 1, "monthly_budgets": 1, "annual_budget": 1}
    ).to_list(100)
    
    budget_map = {}
    name_map = {}
    for cc in cost_centers:
        cc_id = cc.get("cost_center_id")
        name_map[cc_id] = cc.get("name")
        monthly_budgets = cc.get("monthly_budgets", {})
        if month_key in monthly_budgets:
            budget_map[cc_id] = monthly_budgets[month_key]
        elif cc.get("annual_budget"):
            budget_map[cc_id] = cc["annual_budget"] / 12
    
    # Build alerts
    alerts = []
    for item in summary:
        cc_id = item.get("cost_center_id")
        if not cc_id:
            continue
            
        actual = item.get("total_amount", 0)
        budget = budget_map.get(cc_id, 0)
        
        if budget <= 0:
            continue
            
        utilization = (actual / budget) * 100
        
        if utilization >= critical_threshold:
            severity = "exceeded" if utilization > 100 else "critical"
            alerts.append({
                "cost_center_id": cc_id,
                "cost_center_name": item.get("cost_center_name") or name_map.get(cc_id),
                "actual": round(actual, 2),
                "budget": round(budget, 2),
                "utilization_percent": round(utilization, 1),
                "variance": round(budget - actual, 2),
                "severity": severity,
                "message": f"{'Excedido' if severity == 'exceeded' else 'Crítico'}: {round(utilization, 1)}% del presupuesto utilizado"
            })
        elif utilization >= warning_threshold:
            alerts.append({
                "cost_center_id": cc_id,
                "cost_center_name": item.get("cost_center_name") or name_map.get(cc_id),
                "actual": round(actual, 2),
                "budget": round(budget, 2),
                "utilization_percent": round(utilization, 1),
                "variance": round(budget - actual, 2),
                "severity": "warning",
                "message": f"Advertencia: {round(utilization, 1)}% del presupuesto utilizado"
            })
    
    # Sort by severity (exceeded > critical > warning) and utilization
    severity_order = {"exceeded": 0, "critical": 1, "warning": 2}
    alerts.sort(key=lambda x: (severity_order.get(x["severity"], 3), -x["utilization_percent"]))
    
    return {
        "year": year,
        "month": month,
        "thresholds": {
            "warning": warning_threshold,
            "critical": critical_threshold
        },
        "alerts": alerts,
        "summary": {
            "total_alerts": len(alerts),
            "exceeded_count": len([a for a in alerts if a["severity"] == "exceeded"]),
            "critical_count": len([a for a in alerts if a["severity"] == "critical"]),
            "warning_count": len([a for a in alerts if a["severity"] == "warning"])
        }
    }


@business_clarity_router.get("/reports/sales/client-statement/{client_id}")
async def get_client_statement(
    client_id: str,
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Client account statement - detailed transactions"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Get client info
    client = await db.clients.find_one(
        {"company_id": company_id, "client_id": client_id},
        {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = (now - timedelta(days=365)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get invoices for client
    invoices = await db.invoices.find({
        "company_id": company_id,
        "client_id": client_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).sort("created_at", 1).to_list(1000)
    
    # Get payments for client
    payments = await db.payments.find({
        "company_id": company_id,
        "client_id": client_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).sort("created_at", 1).to_list(1000)
    
    # Build transaction history
    transactions = []
    running_balance = 0
    
    for inv in invoices:
        running_balance += inv.get("total", 0)
        transactions.append({
            "date": inv.get("created_at", "")[:10],
            "type": "invoice",
            "reference": inv.get("invoice_number"),
            "description": f"Factura {inv.get('invoice_number')}",
            "debit": round(inv.get("total", 0), 2),
            "credit": 0,
            "balance": round(running_balance, 2)
        })
    
    for pay in payments:
        running_balance -= pay.get("amount", 0)
        transactions.append({
            "date": pay.get("created_at", "")[:10],
            "type": "payment",
            "reference": pay.get("payment_id", "")[:12],
            "description": f"Pago - {pay.get('payment_method', 'Efectivo')}",
            "debit": 0,
            "credit": round(pay.get("amount", 0), 2),
            "balance": round(running_balance, 2)
        })
    
    # Sort by date
    transactions.sort(key=lambda x: x["date"])
    
    # Recalculate running balance after sorting
    running_balance = 0
    for t in transactions:
        running_balance += t["debit"] - t["credit"]
        t["balance"] = round(running_balance, 2)
    
    return {
        "client": {
            "client_id": client_id,
            "name": client.get("name") or client.get("company_name"),
            "email": client.get("email"),
            "phone": client.get("phone")
        },
        "period": {"start": start_date, "end": end_date},
        "opening_balance": 0,
        "closing_balance": round(running_balance, 2),
        "total_invoiced": round(sum(t["debit"] for t in transactions), 2),
        "total_paid": round(sum(t["credit"] for t in transactions), 2),
        "transactions": transactions
    }


# ==================== ADMINISTRATIVE REPORTS ====================

@business_clarity_router.get("/reports/admin/income-expense")
async def get_income_expense_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Income and expense report by category"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get invoices (income)
    invoices = await db.invoices.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        "status": {"$ne": "cancelled"}
    }, {"_id": 0}).to_list(5000)
    
    # Get supplier payables (expenses)
    payables = await db.supplier_payables.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Get fixed costs
    fixed_costs = await db.fixed_cost_entries.find({
        "company_id": company_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Group income by category (using event type as category)
    income_by_category = {}
    for inv in invoices:
        category = inv.get("category") or inv.get("event_type") or "Ventas"
        if category not in income_by_category:
            income_by_category[category] = {"category": category, "type": "income", "total": 0, "count": 0}
        income_by_category[category]["total"] += inv.get("total", 0)
        income_by_category[category]["count"] += 1
    
    # Group expenses by category
    expense_by_category = {}
    for pay in payables:
        category = pay.get("category") or "Proveedores"
        if category not in expense_by_category:
            expense_by_category[category] = {"category": category, "type": "expense", "total": 0, "count": 0}
        expense_by_category[category]["total"] += pay.get("amount", 0)
        expense_by_category[category]["count"] += 1
    
    for fc in fixed_costs:
        category = fc.get("category") or "Costos Fijos"
        if category not in expense_by_category:
            expense_by_category[category] = {"category": category, "type": "expense", "total": 0, "count": 0}
        expense_by_category[category]["total"] += fc.get("amount", 0)
        expense_by_category[category]["count"] += 1
    
    total_income = sum(c["total"] for c in income_by_category.values())
    total_expense = sum(c["total"] for c in expense_by_category.values())
    
    return {
        "period": {"start": start_date, "end": end_date},
        "summary": {
            "total_income": round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "net_result": round(total_income - total_expense, 2)
        },
        "income_categories": [{**c, "total": round(c["total"], 2)} for c in sorted(income_by_category.values(), key=lambda x: x["total"], reverse=True)],
        "expense_categories": [{**c, "total": round(c["total"], 2)} for c in sorted(expense_by_category.values(), key=lambda x: x["total"], reverse=True)]
    }


@business_clarity_router.get("/reports/admin/inventory-valuation")
async def get_inventory_valuation_report(user: User = Depends(get_current_user)):
    """Inventory valuation report - current stock value"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Get all inventory items (ingredients/products)
    ingredients = await db.ingredients.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Get item types for additional inventory
    item_types = await db.item_types.find(
        {"company_id": company_id, "track_inventory": True},
        {"_id": 0}
    ).to_list(500)
    
    inventory_items = []
    total_value = 0
    total_items = 0
    
    # Process ingredients
    for ing in ingredients:
        qty = ing.get("stock_quantity", 0)
        cost = ing.get("cost_per_unit", 0) or ing.get("unit_cost", 0)
        value = qty * cost
        
        inventory_items.append({
            "item_id": ing.get("ingredient_id"),
            "item_name": ing.get("name"),
            "category": ing.get("category", "Ingredientes"),
            "quantity": qty,
            "unit": ing.get("unit", "unidad"),
            "unit_cost": round(cost, 2),
            "total_value": round(value, 2),
            "last_purchase": ing.get("last_purchase_date"),
            "min_stock": ing.get("min_stock", 0)
        })
        total_value += value
        total_items += qty
    
    # Process item types with inventory
    for it in item_types:
        qty = it.get("stock_quantity", 0)
        cost = it.get("unit_cost", 0)
        value = qty * cost
        
        inventory_items.append({
            "item_id": it.get("item_type_id"),
            "item_name": it.get("name"),
            "category": it.get("category", "Productos"),
            "quantity": qty,
            "unit": "unidad",
            "unit_cost": round(cost, 2),
            "total_value": round(value, 2),
            "last_purchase": it.get("updated_at"),
            "min_stock": it.get("min_stock", 0)
        })
        total_value += value
        total_items += qty
    
    # Sort by value
    inventory_items.sort(key=lambda x: x["total_value"], reverse=True)
    
    # Group by category for summary
    by_category = {}
    for item in inventory_items:
        cat = item["category"]
        if cat not in by_category:
            by_category[cat] = {"category": cat, "item_count": 0, "total_value": 0}
        by_category[cat]["item_count"] += 1
        by_category[cat]["total_value"] += item["total_value"]
    
    return {
        "as_of": datetime.now(timezone.utc).isoformat()[:10],
        "summary": {
            "total_value": round(total_value, 2),
            "total_items": len(inventory_items),
            "total_units": round(total_items, 2)
        },
        "by_category": [{**c, "total_value": round(c["total_value"], 2)} for c in sorted(by_category.values(), key=lambda x: x["total_value"], reverse=True)],
        "items": inventory_items
    }


@business_clarity_router.get("/reports/admin/transactions")
async def get_transactions_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """All money movements in a period"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get incoming payments
    payments_in = await db.payments.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Get outgoing payments (supplier payments)
    payments_out = await db.supplier_payments.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    transactions = []
    
    for p in payments_in:
        transactions.append({
            "date": p.get("created_at", "")[:10],
            "type": "income",
            "type_label": "Cobro",
            "reference": p.get("payment_id", "")[:12],
            "description": p.get("client_name") or p.get("description") or "Pago recibido",
            "method": p.get("payment_method", "Efectivo"),
            "amount": round(p.get("amount", 0), 2),
            "direction": "in"
        })
    
    for p in payments_out:
        transactions.append({
            "date": p.get("created_at", "")[:10],
            "type": "expense",
            "type_label": "Pago",
            "reference": p.get("payment_id", "")[:12],
            "description": p.get("supplier_name") or p.get("description") or "Pago a proveedor",
            "method": p.get("payment_method", "Transferencia"),
            "amount": round(p.get("amount", 0), 2),
            "direction": "out"
        })
    
    # Sort by date descending
    transactions.sort(key=lambda x: x["date"], reverse=True)
    
    total_in = sum(t["amount"] for t in transactions if t["direction"] == "in")
    total_out = sum(t["amount"] for t in transactions if t["direction"] == "out")
    
    return {
        "period": {"start": start_date, "end": end_date},
        "summary": {
            "total_income": round(total_in, 2),
            "total_expense": round(total_out, 2),
            "net_flow": round(total_in - total_out, 2),
            "transaction_count": len(transactions)
        },
        "transactions": transactions[:200]  # Limit for display
    }


@business_clarity_router.get("/reports/admin/purchases")
async def get_purchases_report(
    user: User = Depends(get_current_user),
    start_date: str = None,
    end_date: str = None
):
    """Supplier invoices/purchases report"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # Get supplier payables
    payables = await db.supplier_payables.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(5000)
    
    # Group by supplier
    by_supplier = {}
    for p in payables:
        supplier_id = p.get("supplier_id") or "unknown"
        supplier_name = p.get("supplier_name") or "Proveedor"
        
        if supplier_id not in by_supplier:
            by_supplier[supplier_id] = {
                "supplier_id": supplier_id,
                "supplier_name": supplier_name,
                "total_amount": 0,
                "paid_amount": 0,
                "pending_amount": 0,
                "invoice_count": 0
            }
        
        amount = p.get("amount", 0)
        paid = p.get("paid_amount", 0)
        by_supplier[supplier_id]["total_amount"] += amount
        by_supplier[supplier_id]["paid_amount"] += paid
        by_supplier[supplier_id]["pending_amount"] += (amount - paid)
        by_supplier[supplier_id]["invoice_count"] += 1
    
    suppliers = sorted(by_supplier.values(), key=lambda x: x["total_amount"], reverse=True)
    
    total_purchases = sum(p.get("amount", 0) for p in payables)
    total_paid = sum(p.get("paid_amount", 0) for p in payables)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "summary": {
            "total_purchases": round(total_purchases, 2),
            "total_paid": round(total_paid, 2),
            "total_pending": round(total_purchases - total_paid, 2),
            "invoice_count": len(payables),
            "supplier_count": len(suppliers)
        },
        "by_supplier": [{
            **s,
            "total_amount": round(s["total_amount"], 2),
            "paid_amount": round(s["paid_amount"], 2),
            "pending_amount": round(s["pending_amount"], 2)
        } for s in suppliers],
        "recent_purchases": [{
            "payable_id": p.get("payable_id"),
            "invoice_number": p.get("invoice_number"),
            "supplier_name": p.get("supplier_name"),
            "date": p.get("created_at", "")[:10],
            "due_date": p.get("due_date", "")[:10] if p.get("due_date") else None,
            "amount": round(p.get("amount", 0), 2),
            "status": p.get("status", "pending")
        } for p in sorted(payables, key=lambda x: x.get("created_at", ""), reverse=True)[:50]]
    }



# ============== ACCOUNTING ENGINE / MOTOR DE CONTABILIZACIÓN ==============

from services.accounting_engine import AccountingEngine, TransactionType

@business_clarity_router.get("/accounting/entries")
async def get_accounting_entries(
    cost_center_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get accounting entries with optional filters"""
    query = {
        "company_id": user.company_id,
        "is_reversed": False
    }
    
    if cost_center_id:
        query["cost_center_id"] = cost_center_id
    if transaction_type:
        query["transaction_type"] = transaction_type
    if start_date:
        query["transaction_date"] = {"$gte": start_date}
    if end_date:
        if "transaction_date" in query:
            query["transaction_date"]["$lt"] = end_date
        else:
            query["transaction_date"] = {"$lt": end_date}
    
    entries = await db.accounting_entries.find(
        query,
        {"_id": 0}
    ).sort("transaction_date", -1).to_list(500)
    
    return entries


@business_clarity_router.get("/accounting/unassigned")
async def get_unassigned_entries(user: User = Depends(get_current_user)):
    """Get entries without a cost center assigned - for the 'assignment queue'"""
    engine = AccountingEngine(db, user.company_id, user.user_id)
    entries = await engine.get_unassigned_entries()
    
    return {
        "count": len(entries),
        "entries": entries
    }


class AssignCostCenterRequest(BaseModel):
    entry_id: str
    cost_center_id: str


@business_clarity_router.post("/accounting/assign-cost-center")
async def assign_entry_cost_center(
    data: AssignCostCenterRequest,
    user: User = Depends(get_current_user)
):
    """Assign a cost center to an unassigned accounting entry"""
    # Get cost center name
    cc = await db.cost_centers.find_one(
        {"cost_center_id": data.cost_center_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    engine = AccountingEngine(db, user.company_id, user.user_id)
    result = await engine.assign_cost_center(
        data.entry_id,
        data.cost_center_id,
        cc["name"]
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to assign"))
    
    return result


@business_clarity_router.get("/accounting/summary")
async def get_accounting_summary(
    year: int = None,
    month: int = None,
    user: User = Depends(get_current_user)
):
    """Get spending summary by cost center from accounting entries"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    
    engine = AccountingEngine(db, user.company_id, user.user_id)
    summary = await engine.get_cost_center_summary(year, month)
    
    # Get cost centers for budget info
    cost_centers = await db.cost_centers.find(
        {"company_id": user.company_id},
        {"_id": 0}
    ).to_list(100)
    
    cc_map = {cc.get("cost_center_id"): cc for cc in cost_centers}
    
    # Enrich with budget data
    for item in summary:
        cc_id = item.get("cost_center_id")
        if cc_id and cc_id in cc_map:
            cc = cc_map[cc_id]
            monthly_budgets = cc.get("monthly_budgets") or {}
            budget_key = f"{year}-{str(month).zfill(2)}"
            if budget_key in monthly_budgets:
                item["budget"] = monthly_budgets[budget_key]
            else:
                annual = cc.get("annual_budget") or 0
                item["budget"] = annual / 12
            
            item["variance"] = item["budget"] - item["total_amount"]
            item["utilization"] = (item["total_amount"] / item["budget"] * 100) if item["budget"] > 0 else 0
    
    return {
        "period": {"year": year, "month": month},
        "summary": summary,
        "totals": {
            "total_amount": sum(s["total_amount"] for s in summary),
            "total_transactions": sum(s["total_transactions"] for s in summary),
            "unassigned_amount": sum(s["total_amount"] for s in summary if not s.get("cost_center_id"))
        }
    }


class ReverseEntryRequest(BaseModel):
    entry_id: str
    reason: str


@business_clarity_router.post("/accounting/reverse")
async def reverse_accounting_entry(
    data: ReverseEntryRequest,
    user: User = Depends(get_current_user)
):
    """Reverse an accounting entry (create counter-entry for corrections)"""
    engine = AccountingEngine(db, user.company_id, user.user_id)
    result = await engine.reverse_entry(data.entry_id, data.reason)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to reverse"))
    
    return result


@business_clarity_router.get("/accounting/by-type-summary")
async def get_accounting_by_type(
    year: int = None,
    month: int = None,
    user: User = Depends(get_current_user)
):
    """Get spending summary grouped by transaction type"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    
    start_date = f"{year}-{str(month).zfill(2)}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{str(month + 1).zfill(2)}-01"
    
    pipeline = [
        {"$match": {
            "company_id": user.company_id,
            "is_reversed": False,
            "transaction_date": {"$gte": start_date, "$lt": end_date}
        }},
        {"$group": {
            "_id": "$transaction_type",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"total": -1}}
    ]
    
    results = await db.accounting_entries.aggregate(pipeline).to_list(20)
    
    return {
        "period": {"year": year, "month": month},
        "by_type": [{
            "type": r["_id"],
            "total": round(r["total"], 2),
            "count": r["count"]
        } for r in results],
        "total": round(sum(r["total"] for r in results), 2)
    }



@business_clarity_router.get("/accounting/trends")
async def get_accounting_trends(
    months: int = 6,
    user: User = Depends(get_current_user)
):
    """Get spending trends by cost center over multiple months for dashboard visualization"""
    now = datetime.now(timezone.utc)
    
    # Generate list of months to query
    month_list = []
    for i in range(months - 1, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_list.append({"year": year, "month": month, "label": f"{year}-{str(month).zfill(2)}"})
    
    # Get all cost centers
    cost_centers = await db.cost_centers.find(
        {"company_id": user.company_id, "is_active": True},
        {"_id": 0}
    ).to_list(50)
    
    # Build trend data
    trends_by_cc = {}
    monthly_totals = []
    
    for period in month_list:
        start_date = f"{period['year']}-{str(period['month']).zfill(2)}-01"
        if period['month'] == 12:
            end_date = f"{period['year'] + 1}-01-01"
        else:
            end_date = f"{period['year']}-{str(period['month'] + 1).zfill(2)}-01"
        
        # Aggregate spending by cost center for this month
        pipeline = [
            {"$match": {
                "company_id": user.company_id,
                "is_reversed": False,
                "transaction_date": {"$gte": start_date, "$lt": end_date}
            }},
            {"$group": {
                "_id": "$cost_center_id",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }}
        ]
        
        results = await db.accounting_entries.aggregate(pipeline).to_list(100)
        
        month_total = 0
        for r in results:
            cc_id = r["_id"]
            amount = round(r["total"], 2)
            month_total += amount
            
            if cc_id not in trends_by_cc:
                trends_by_cc[cc_id] = {
                    "cost_center_id": cc_id,
                    "name": "Sin asignar" if not cc_id else None,
                    "data": []
                }
            
            trends_by_cc[cc_id]["data"].append({
                "month": period["label"],
                "amount": amount,
                "count": r["count"]
            })
        
        # Fill zeros for cost centers with no data this month
        for cc_id in trends_by_cc:
            if not any(d["month"] == period["label"] for d in trends_by_cc[cc_id]["data"]):
                trends_by_cc[cc_id]["data"].append({
                    "month": period["label"],
                    "amount": 0,
                    "count": 0
                })
        
        monthly_totals.append({
            "month": period["label"],
            "total": round(month_total, 2)
        })
    
    # Add cost center names and budget info
    cc_map = {cc["cost_center_id"]: cc for cc in cost_centers}
    for cc_id, trend in trends_by_cc.items():
        if cc_id and cc_id in cc_map:
            trend["name"] = cc_map[cc_id].get("name")
            trend["code"] = cc_map[cc_id].get("code")
            annual_budget = cc_map[cc_id].get("annual_budget") or 0
            trend["monthly_budget"] = round(annual_budget / 12, 2)
        
        # Sort data by month
        trend["data"].sort(key=lambda x: x["month"])
        
        # Calculate trend (comparing last month to average of previous months)
        if len(trend["data"]) >= 2:
            last_month = trend["data"][-1]["amount"]
            prev_avg = sum(d["amount"] for d in trend["data"][:-1]) / (len(trend["data"]) - 1) if len(trend["data"]) > 1 else 0
            if prev_avg > 0:
                trend["trend_pct"] = round(((last_month - prev_avg) / prev_avg) * 100, 1)
            else:
                trend["trend_pct"] = 100 if last_month > 0 else 0
        else:
            trend["trend_pct"] = 0
    
    # Convert to list and sort by total spend
    trends_list = list(trends_by_cc.values())
    trends_list.sort(key=lambda x: sum(d["amount"] for d in x["data"]), reverse=True)
    
    # Calculate overall stats
    current_month_total = monthly_totals[-1]["total"] if monthly_totals else 0
    prev_month_total = monthly_totals[-2]["total"] if len(monthly_totals) >= 2 else 0
    mom_change = round(((current_month_total - prev_month_total) / prev_month_total * 100) if prev_month_total > 0 else 0, 1)
    
    return {
        "months": [m["label"] for m in month_list],
        "trends": trends_list,
        "monthly_totals": monthly_totals,
        "summary": {
            "current_month": current_month_total,
            "previous_month": prev_month_total,
            "mom_change": mom_change,
            "total_cost_centers": len([t for t in trends_list if t.get("cost_center_id")])
        }
    }



# ============== PETTY CASH (CAJA CHICA) ==============

class PettyCashTransactionCreate(BaseModel):
    transaction_type: str  # "deposit" or "withdrawal"
    amount: float
    description: str
    category: Optional[str] = None  # office_supplies, transportation, food, cleaning, misc
    receipt_number: Optional[str] = None
    vendor_name: Optional[str] = None
    transaction_date: Optional[str] = None
    notes: Optional[str] = None


@business_clarity_router.get("/petty-cash")
async def get_petty_cash(
    user: User = Depends(get_current_user),
    limit: int = 50
):
    """Get petty cash balance and recent transactions"""
    company_id = user.company_id
    
    # Get petty cash fund record
    fund = await db.petty_cash_funds.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    if not fund:
        # Create default fund
        fund = {
            "fund_id": f"pcf_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "fund_limit": 5000.00,
            "current_balance": 0.00,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.petty_cash_funds.insert_one(fund)
    
    # Get recent transactions
    transactions = await db.petty_cash_transactions.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("transaction_date", -1).limit(limit).to_list(limit)
    
    # Calculate totals
    total_deposits = sum(t.get("amount", 0) for t in transactions if t.get("transaction_type") == "deposit")
    total_withdrawals = sum(t.get("amount", 0) for t in transactions if t.get("transaction_type") == "withdrawal")
    
    return {
        "fund": fund,
        "transactions": transactions,
        "summary": {
            "current_balance": fund.get("current_balance", 0),
            "fund_limit": fund.get("fund_limit", 5000),
            "total_deposits": total_deposits,
            "total_withdrawals": total_withdrawals,
            "transaction_count": len(transactions)
        }
    }


@business_clarity_router.post("/petty-cash/transactions")
async def create_petty_cash_transaction(
    data: PettyCashTransactionCreate,
    user: User = Depends(get_current_user)
):
    """Record a petty cash deposit or withdrawal"""
    check_finance_permission(user, "manage petty cash")
    
    company_id = user.company_id
    now = datetime.now(timezone.utc)
    
    # Get current fund
    fund = await db.petty_cash_funds.find_one({"company_id": company_id}, {"_id": 0})
    if not fund:
        fund = {
            "fund_id": f"pcf_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "fund_limit": 5000.00,
            "current_balance": 0.00,
            "created_at": now.isoformat()
        }
        await db.petty_cash_funds.insert_one(fund)
    
    current_balance = fund.get("current_balance", 0)
    
    # Validate withdrawal
    if data.transaction_type == "withdrawal":
        if data.amount > current_balance:
            raise HTTPException(status_code=400, detail=f"Insufficient funds. Available: {current_balance}")
        new_balance = current_balance - data.amount
    else:  # deposit
        new_balance = current_balance + data.amount
    
    # Create transaction
    transaction_id = f"pct_{uuid.uuid4().hex[:12]}"
    transaction = {
        "transaction_id": transaction_id,
        "company_id": company_id,
        "transaction_type": data.transaction_type,
        "amount": round(data.amount, 2),
        "description": data.description,
        "category": data.category,
        "receipt_number": data.receipt_number,
        "vendor_name": data.vendor_name,
        "transaction_date": data.transaction_date or now.strftime("%Y-%m-%d"),
        "balance_after": round(new_balance, 2),
        "notes": data.notes,
        "created_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    await db.petty_cash_transactions.insert_one(transaction)
    
    # Update fund balance
    await db.petty_cash_funds.update_one(
        {"company_id": company_id},
        {"$set": {"current_balance": round(new_balance, 2), "updated_at": now.isoformat()}}
    )
    
    return {
        "transaction": {k: v for k, v in transaction.items() if k != "_id"},
        "new_balance": round(new_balance, 2)
    }


@business_clarity_router.put("/petty-cash/fund-limit")
async def update_petty_cash_fund_limit(
    fund_limit: float,
    user: User = Depends(get_current_user)
):
    """Update the petty cash fund limit"""
    check_finance_permission(user, "manage petty cash")
    
    await db.petty_cash_funds.update_one(
        {"company_id": user.company_id},
        {
            "$set": {
                "fund_limit": round(fund_limit, 2),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    return {"success": True, "new_limit": round(fund_limit, 2)}


# ============== CASH FLOW REPORT ==============

@business_clarity_router.get("/cash-flow")
async def get_cash_flow_report(
    user: User = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = "month"  # day, week, month
):
    """Get cash flow report with inflows and outflows"""
    company_id = user.company_id
    now = datetime.now(timezone.utc)
    
    # Default to current month if no dates
    if not start_date:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    
    # ===== INFLOWS (Money Coming In) =====
    
    # 1. Payments received from clients
    client_payments = await db.payments.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    total_client_payments = sum(p.get("amount", 0) for p in client_payments)
    
    # 2. Petty cash deposits
    petty_deposits = await db.petty_cash_transactions.find({
        "company_id": company_id,
        "transaction_type": "deposit",
        "transaction_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(500)
    
    total_petty_deposits = sum(t.get("amount", 0) for t in petty_deposits)
    
    # ===== OUTFLOWS (Money Going Out) =====
    
    # 1. Supplier payable payments
    payable_payments_pipeline = [
        {"$match": {"company_id": company_id}},
        {"$unwind": {"path": "$payments", "preserveNullAndEmptyArrays": False}},
        {"$match": {
            "payments.payment_date": {"$gte": start_date, "$lte": end_date}
        }},
        {"$group": {
            "_id": None,
            "total": {"$sum": "$payments.amount"},
            "count": {"$sum": 1},
            "payments": {"$push": "$payments"}
        }}
    ]
    
    payable_result = await db.supplier_payables.aggregate(payable_payments_pipeline).to_list(1)
    total_supplier_payments = payable_result[0]["total"] if payable_result else 0
    supplier_payment_count = payable_result[0]["count"] if payable_result else 0
    
    # 2. Petty cash withdrawals
    petty_withdrawals = await db.petty_cash_transactions.find({
        "company_id": company_id,
        "transaction_type": "withdrawal",
        "transaction_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(500)
    
    total_petty_withdrawals = sum(t.get("amount", 0) for t in petty_withdrawals)
    
    # 3. Payroll payments (if any recorded)
    payroll_payments = await db.payroll_runs.find({
        "company_id": company_id,
        "status": "paid",
        "payment_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0, "total_net_pay": 1, "payment_date": 1}).to_list(100)
    
    total_payroll = sum(p.get("total_net_pay", 0) for p in payroll_payments)
    
    # ===== PENDING (Future Cash Needs) =====
    
    # Pending payables by due date
    pending_payables = await db.supplier_payables.find({
        "company_id": company_id,
        "status": {"$in": ["pending", "partial"]},
        "balance_due": {"$gt": 0}
    }, {"_id": 0, "payable_id": 1, "supplier_name": 1, "description": 1, "balance_due": 1, "due_date": 1}).to_list(500)
    
    # Group pending by due period
    overdue = []
    due_this_week = []
    due_this_month = []
    due_later = []
    
    today = now.strftime("%Y-%m-%d")
    week_end = (now + timedelta(days=7)).strftime("%Y-%m-%d")
    month_end = (now.replace(day=1) + timedelta(days=32)).replace(day=1).strftime("%Y-%m-%d")
    
    for pay in pending_payables:
        due = pay.get("due_date")
        if not due:
            due_later.append(pay)
        elif due < today:
            overdue.append(pay)
        elif due <= week_end:
            due_this_week.append(pay)
        elif due < month_end:
            due_this_month.append(pay)
        else:
            due_later.append(pay)
    
    # ===== SUMMARY =====
    
    total_inflows = total_client_payments + total_petty_deposits
    total_outflows = total_supplier_payments + total_petty_withdrawals + total_payroll
    net_cash_flow = total_inflows - total_outflows
    
    return {
        "period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "inflows": {
            "client_payments": {
                "total": round(total_client_payments, 2),
                "count": len(client_payments)
            },
            "petty_cash_deposits": {
                "total": round(total_petty_deposits, 2),
                "count": len(petty_deposits)
            },
            "total": round(total_inflows, 2)
        },
        "outflows": {
            "supplier_payments": {
                "total": round(total_supplier_payments, 2),
                "count": supplier_payment_count
            },
            "petty_cash_withdrawals": {
                "total": round(total_petty_withdrawals, 2),
                "count": len(petty_withdrawals)
            },
            "payroll": {
                "total": round(total_payroll, 2),
                "count": len(payroll_payments)
            },
            "total": round(total_outflows, 2)
        },
        "net_cash_flow": round(net_cash_flow, 2),
        "pending_obligations": {
            "overdue": {
                "total": round(sum(p.get("balance_due", 0) for p in overdue), 2),
                "count": len(overdue),
                "items": overdue[:5]
            },
            "due_this_week": {
                "total": round(sum(p.get("balance_due", 0) for p in due_this_week), 2),
                "count": len(due_this_week),
                "items": due_this_week[:5]
            },
            "due_this_month": {
                "total": round(sum(p.get("balance_due", 0) for p in due_this_month), 2),
                "count": len(due_this_month)
            },
            "due_later": {
                "total": round(sum(p.get("balance_due", 0) for p in due_later), 2),
                "count": len(due_later)
            },
            "total_pending": round(sum(p.get("balance_due", 0) for p in pending_payables), 2)
        }
    }


# ============== CASH FLOW PROJECTION ==============

@business_clarity_router.get("/cash-flow/projection")
async def get_cash_flow_projection(
    user: User = Depends(get_current_user)
):
    """
    Get cash flow projection for the next 30/60/90 days.
    Based on:
    - Expected inflows: Open invoices (accounts receivable) by due date
    - Expected outflows: Pending payables by due date, recurring fixed costs
    """
    company_id = user.company_id
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    # Calculate date ranges
    day_30 = (now + timedelta(days=30)).strftime("%Y-%m-%d")
    day_60 = (now + timedelta(days=60)).strftime("%Y-%m-%d")
    day_90 = (now + timedelta(days=90)).strftime("%Y-%m-%d")
    
    # ===== EXPECTED INFLOWS (Accounts Receivable) =====
    open_invoices = await db.invoices.find({
        "company_id": company_id,
        "status": {"$ne": "paid"},
        "balance_due": {"$gt": 0}
    }, {"_id": 0, "invoice_id": 1, "client_id": 1, "invoice_number": 1, 
        "balance_due": 1, "due_date": 1, "total": 1}).to_list(500)
    
    # Group by period
    ar_overdue = []
    ar_30_days = []
    ar_60_days = []
    ar_90_days = []
    ar_beyond = []
    
    for inv in open_invoices:
        due = inv.get("due_date", "")[:10] if inv.get("due_date") else None
        balance = inv.get("balance_due", 0)
        
        # Get client name
        if inv.get("client_id"):
            client = await db.clients.find_one(
                {"client_id": inv["client_id"]}, 
                {"_id": 0, "display_name": 1, "company_name": 1}
            )
            inv["client_name"] = client.get("display_name") or client.get("company_name") if client else None
        
        if not due or due < today:
            ar_overdue.append(inv)
        elif due <= day_30:
            ar_30_days.append(inv)
        elif due <= day_60:
            ar_60_days.append(inv)
        elif due <= day_90:
            ar_90_days.append(inv)
        else:
            ar_beyond.append(inv)
    
    # ===== EXPECTED OUTFLOWS (Accounts Payable) =====
    pending_payables = await db.supplier_payables.find({
        "company_id": company_id,
        "status": {"$in": ["pending", "partial"]},
        "balance_due": {"$gt": 0}
    }, {"_id": 0, "payable_id": 1, "supplier_name": 1, "description": 1,
        "balance_due": 1, "due_date": 1, "amount": 1}).to_list(500)
    
    # Also get unpaid expenses
    pending_expenses = await db.expenses.find({
        "company_id": company_id,
        "payment_status": {"$ne": "Paid"}
    }, {"_id": 0, "expense_id": 1, "vendor_name": 1, "description": 1,
        "amount": 1, "due_date": 1}).to_list(500)
    
    # Combine payables and expenses
    all_payables = []
    for p in pending_payables:
        all_payables.append({
            "id": p.get("payable_id"),
            "name": p.get("supplier_name") or p.get("description"),
            "amount": p.get("balance_due", p.get("amount", 0)),
            "due_date": p.get("due_date"),
            "type": "payable"
        })
    for e in pending_expenses:
        all_payables.append({
            "id": e.get("expense_id"),
            "name": e.get("vendor_name") or e.get("description"),
            "amount": e.get("amount", 0),
            "due_date": e.get("due_date"),
            "type": "expense"
        })
    
    # Group by period
    ap_overdue = []
    ap_30_days = []
    ap_60_days = []
    ap_90_days = []
    ap_beyond = []
    
    for p in all_payables:
        due = p.get("due_date", "")[:10] if p.get("due_date") else None
        
        if not due or due < today:
            ap_overdue.append(p)
        elif due <= day_30:
            ap_30_days.append(p)
        elif due <= day_60:
            ap_60_days.append(p)
        elif due <= day_90:
            ap_90_days.append(p)
        else:
            ap_beyond.append(p)
    
    # ===== CALCULATE PROJECTIONS =====
    def sum_amounts(items, key="balance_due"):
        return round(sum(i.get(key, i.get("amount", 0)) for i in items), 2)
    
    # Cumulative projections
    inflow_30 = sum_amounts(ar_overdue) + sum_amounts(ar_30_days)
    inflow_60 = inflow_30 + sum_amounts(ar_60_days)
    inflow_90 = inflow_60 + sum_amounts(ar_90_days)
    
    outflow_30 = sum_amounts(ap_overdue, "amount") + sum_amounts(ap_30_days, "amount")
    outflow_60 = outflow_30 + sum_amounts(ap_60_days, "amount")
    outflow_90 = outflow_60 + sum_amounts(ap_90_days, "amount")
    
    # Net projections
    net_30 = inflow_30 - outflow_30
    net_60 = inflow_60 - outflow_60
    net_90 = inflow_90 - outflow_90
    
    return {
        "as_of_date": today,
        "projection": {
            "30_days": {
                "expected_inflows": inflow_30,
                "expected_outflows": outflow_30,
                "net_projection": net_30,
                "date_range": f"{today} - {day_30}"
            },
            "60_days": {
                "expected_inflows": inflow_60,
                "expected_outflows": outflow_60,
                "net_projection": net_60,
                "date_range": f"{today} - {day_60}"
            },
            "90_days": {
                "expected_inflows": inflow_90,
                "expected_outflows": outflow_90,
                "net_projection": net_90,
                "date_range": f"{today} - {day_90}"
            }
        },
        "inflows_detail": {
            "overdue": {
                "total": sum_amounts(ar_overdue),
                "count": len(ar_overdue),
                "items": ar_overdue[:5]
            },
            "next_30_days": {
                "total": sum_amounts(ar_30_days),
                "count": len(ar_30_days),
                "items": ar_30_days[:5]
            },
            "30_to_60_days": {
                "total": sum_amounts(ar_60_days),
                "count": len(ar_60_days),
                "items": ar_60_days[:3]
            },
            "60_to_90_days": {
                "total": sum_amounts(ar_90_days),
                "count": len(ar_90_days),
                "items": ar_90_days[:3]
            }
        },
        "outflows_detail": {
            "overdue": {
                "total": sum_amounts(ap_overdue, "amount"),
                "count": len(ap_overdue),
                "items": ap_overdue[:5]
            },
            "next_30_days": {
                "total": sum_amounts(ap_30_days, "amount"),
                "count": len(ap_30_days),
                "items": ap_30_days[:5]
            },
            "30_to_60_days": {
                "total": sum_amounts(ap_60_days, "amount"),
                "count": len(ap_60_days),
                "items": ap_60_days[:3]
            },
            "60_to_90_days": {
                "total": sum_amounts(ap_90_days, "amount"),
                "count": len(ap_90_days),
                "items": ap_90_days[:3]
            }
        },
        "liquidity_alert": net_30 < 0 or net_60 < 0 or net_90 < 0
    }


# ============== PAYMENT RECORDS (RECEIVED & MADE) ==============

@business_clarity_router.get("/all-payments")
async def get_all_payments(
    user: User = Depends(get_current_user),
    payment_direction: Optional[str] = None,  # "received" or "made"
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100
):
    """Get all payments - both received (from clients) and made (to suppliers)"""
    company_id = user.company_id
    
    all_payments = []
    
    # ===== RECEIVED PAYMENTS (from clients) =====
    if not payment_direction or payment_direction == "received":
        client_payments = await db.payments.find(
            {"company_id": company_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        
        for pay in client_payments:
            # Get client name
            client = await db.clients.find_one(
                {"client_id": pay.get("client_id")},
                {"_id": 0, "name": 1, "company_name": 1}
            )
            client_name = client.get("company_name") or client.get("name") if client else "Unknown"
            
            all_payments.append({
                "payment_id": pay.get("payment_id"),
                "direction": "received",
                "direction_label": "Received",
                "direction_label_es": "Recibido",
                "entity_type": "client",
                "entity_name": client_name,
                "amount": pay.get("amount", 0),
                "payment_method": pay.get("payment_method"),
                "reference": pay.get("reference"),
                "payment_date": pay.get("created_at", "")[:10],
                "status": pay.get("status", "applied"),
                "notes": pay.get("notes")
            })
    
    # ===== MADE PAYMENTS (to suppliers) =====
    if not payment_direction or payment_direction == "made":
        # Get from supplier_payables with embedded payments
        payables_with_payments = await db.supplier_payables.find(
            {"company_id": company_id, "payments": {"$exists": True, "$ne": []}},
            {"_id": 0}
        ).to_list(500)
        
        for payable in payables_with_payments:
            supplier_name = payable.get("supplier_name") or "Unknown Supplier"
            for pmt in payable.get("payments", []):
                all_payments.append({
                    "payment_id": pmt.get("payment_id"),
                    "payable_id": payable.get("payable_id"),
                    "direction": "made",
                    "direction_label": "Made",
                    "direction_label_es": "Realizado",
                    "entity_type": "supplier",
                    "entity_name": supplier_name,
                    "description": payable.get("description"),
                    "amount": pmt.get("amount", 0),
                    "payment_method": pmt.get("payment_method"),
                    "reference": pmt.get("reference"),
                    "payment_date": pmt.get("payment_date"),
                    "notes": pmt.get("notes")
                })
    
    # Sort by date descending
    all_payments.sort(key=lambda x: x.get("payment_date", ""), reverse=True)
    
    # Apply date filters
    if start_date:
        all_payments = [p for p in all_payments if p.get("payment_date", "") >= start_date]
    if end_date:
        all_payments = [p for p in all_payments if p.get("payment_date", "") <= end_date]
    
    # Calculate totals
    received_total = sum(p["amount"] for p in all_payments if p["direction"] == "received")
    made_total = sum(p["amount"] for p in all_payments if p["direction"] == "made")
    
    return {
        "payments": all_payments[:limit],
        "summary": {
            "total_received": round(received_total, 2),
            "total_made": round(made_total, 2),
            "net": round(received_total - made_total, 2),
            "received_count": len([p for p in all_payments if p["direction"] == "received"]),
            "made_count": len([p for p in all_payments if p["direction"] == "made"])
        }
    }



# ============== UNIFIED VENDORS (Partners + Suppliers) ==============

@business_clarity_router.get("/vendors")
async def get_unified_vendors(
    user: User = Depends(get_current_user),
    search: Optional[str] = None
):
    """Get unified list of vendors from both Partners and Suppliers collections"""
    company_id = user.company_id
    vendors = []
    
    # Get from Partners (preferred partners marked as suppliers/vendors)
    partners_query = {"company_id": company_id}
    if search:
        partners_query["$or"] = [
            {"partner_name": {"$regex": search, "$options": "i"}},
            {"legal_name": {"$regex": search, "$options": "i"}}
        ]
    
    partners = await db.partners.find(
        partners_query,
        {"_id": 0, "partner_id": 1, "partner_name": 1, "legal_name": 1, "partner_type": 1, "status": 1, "email": 1, "phone": 1}
    ).to_list(500)
    
    for p in partners:
        vendors.append({
            "vendor_id": p["partner_id"],
            "name": p["partner_name"],
            "legal_name": p.get("legal_name"),
            "source": "partners",
            "type": p.get("partner_type"),
            "status": p.get("status"),
            "email": p.get("email"),
            "phone": p.get("phone")
        })
    
    # Get from Suppliers (culinary suppliers)
    suppliers_query = {"company_id": company_id}
    if search:
        suppliers_query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"contact_name": {"$regex": search, "$options": "i"}}
        ]
    
    suppliers = await db.suppliers.find(
        suppliers_query,
        {"_id": 0, "supplier_id": 1, "name": 1, "contact_name": 1, "email": 1, "phone": 1, "category": 1}
    ).to_list(500)
    
    for s in suppliers:
        # Check if already in vendors (linked partner)
        existing = next((v for v in vendors if v.get("linked_supplier_id") == s["supplier_id"]), None)
        if not existing:
            vendors.append({
                "vendor_id": s["supplier_id"],
                "name": s["name"],
                "legal_name": None,
                "source": "suppliers",
                "type": s.get("category", "supplier"),
                "status": "active",
                "email": s.get("email"),
                "phone": s.get("phone")
            })
    
    # Sort by name
    vendors.sort(key=lambda x: x["name"].lower() if x.get("name") else "")
    
    return {
        "vendors": vendors,
        "total": len(vendors),
        "from_partners": len(partners),
        "from_suppliers": len(suppliers)
    }


@business_clarity_router.post("/vendors")
async def create_vendor(
    name: str,
    vendor_type: str = "supplier",
    email: Optional[str] = None,
    phone: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Create a new vendor (creates a Partner record)"""
    company_id = user.company_id
    now = datetime.now(timezone.utc)
    
    # Create as Partner for unified management
    partner_id = f"partner_{uuid.uuid4().hex[:12]}"
    
    partner_data = {
        "partner_id": partner_id,
        "company_id": company_id,
        "partner_name": name,
        "legal_name": name,
        "partner_type": "supplier" if vendor_type == "supplier" else vendor_type,
        "status": "approved",
        "is_preferred": False,
        "email": email,
        "phone": phone,
        "created_at": now.isoformat(),
        "created_by": user.user_id,
        "updated_at": now.isoformat(),
        "updated_by": user.user_id
    }
    
    await db.partners.insert_one(partner_data)
    
    return {
        "vendor_id": partner_id,
        "name": name,
        "source": "partners",
        "type": vendor_type,
        "status": "approved"
    }
