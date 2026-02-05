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

# Stripe integration
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import os

business_clarity_router = APIRouter(prefix="/business-clarity", tags=["Business Clarity"])

# Stripe API Key
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

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
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "invoice_created",
        "entity_type": "invoice",
        "entity_id": invoice["invoice_id"],
        "details": {"invoice_number": invoice_number, "total": total},
        "created_at": now.isoformat()
    })
    
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
    
    # Audit log
    await db.audit_logs.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "company_id": user.company_id,
        "user_id": user.user_id,
        "action": "payment_created",
        "entity_type": "payment",
        "entity_id": payment["payment_id"],
        "details": {"amount": data.amount, "method": data.payment_method, "client_id": data.client_id},
        "created_at": now.isoformat()
    })
    
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
        supplier_name = None
        event_name = None
        
        if pay.get("supplier_id"):
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
    if event_id:
        update_data["event_id"] = event_id
        update_data["cost_center"] = None
        update_data["fixed_cost_category_id"] = None
    elif fixed_cost_category_id:
        update_data["fixed_cost_category_id"] = fixed_cost_category_id
        update_data["event_id"] = None
        update_data["cost_center"] = None
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
        return {"message": "Payable assigned successfully", "type": "payable"}
    
    raise HTTPException(status_code=404, detail="Payable not found")

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
    """Get financial snapshot report"""
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
    
    # Expenses
    expenses_query = {"company_id": user.company_id}
    if start_date:
        expenses_query["expense_date"] = {"$gte": start_date}
    if end_date:
        if "expense_date" in expenses_query:
            expenses_query["expense_date"]["$lte"] = end_date
        else:
            expenses_query["expense_date"] = {"$lte": end_date}
    
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(1000)
    total_expenses = sum(exp.get("amount", 0) for exp in expenses)
    
    # Profit
    gross_profit = total_collected - total_expenses
    
    return {
        "period": {"start": start_date, "end": end_date},
        "revenue": {
            "total_invoiced": round(total_invoiced, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "collection_rate": round((total_collected / total_invoiced * 100) if total_invoiced > 0 else 0, 1)
        },
        "expenses": {
            "total": round(total_expenses, 2),
            "count": len(expenses)
        },
        "profit": {
            "gross": round(gross_profit, 2),
            "margin": round((gross_profit / total_collected * 100) if total_collected > 0 else 0, 1)
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
        
        records.append({
            "event_id": event_id,
            "event_name": event.get("name"),
            "event_date": event.get("event_date"),
            "status": event.get("status"),
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
    
    return {
        "records": records,
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_costs": round(total_costs, 2),
            "total_profit": round(total_profit, 2),
            "average_margin": round((total_profit / total_revenue * 100) if total_revenue > 0 else 0, 1),
            "events_count": len(records)
        }
    }

# ============== FIXED COSTS & BUDGET ==============

# Fixed Cost Category Model
class FixedCostCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    active: bool = True

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
    now = datetime.now(timezone.utc)
    category_id = f"fcc_{uuid.uuid4().hex[:12]}"
    
    category = {
        "category_id": category_id,
        "company_id": user.company_id,
        "name": data.name,
        "description": data.description,
        "active": data.active,
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
    now = datetime.now(timezone.utc)
    
    result = await db.fixed_cost_categories.update_one(
        {"category_id": category_id, "company_id": user.company_id},
        {"$set": {
            "name": data.name,
            "description": data.description,
            "active": data.active,
            "updated_at": now.isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category updated"}

@business_clarity_router.delete("/fixed-costs/categories/{category_id}")
async def delete_fixed_cost_category(category_id: str, user: User = Depends(get_current_user)):
    """Delete a fixed cost category"""
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

