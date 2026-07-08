"""Purchase Order endpoints — extracted from server.py. LOGIC UNCHANGED."""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from models.purchase_orders import (
    PurchaseOrderFullCreate,
    PurchaseOrderLineCreateModel,
    PurchaseOrderLineModel,
)


logger = logging.getLogger(__name__)
purchase_orders_router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


# ============ BODY (endpoints) — extracted from server.py ============
# ============== PURCHASE ORDERS ROUTES ==============

@purchase_orders_router.get("")
async def get_purchase_orders(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all purchase orders"""
    query = {"company_id": user.company_id}
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    pos = await db.purchase_orders_full.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return pos

@purchase_orders_router.get("/{po_id}")
async def get_purchase_order(po_id: str, user: User = Depends(get_current_user)):
    """Get a single purchase order"""
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po

@purchase_orders_router.post("")
async def create_purchase_order(data: PurchaseOrderFullCreate, user: User = Depends(get_current_user)):
    """Create a new purchase order"""
    # Get supplier name
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    now = datetime.now(timezone.utc)
    po_id = f"po_{uuid.uuid4().hex[:12]}"
    
    # Generate PO number
    count = await db.purchase_orders_full.count_documents({"company_id": user.company_id})
    po_number = f"PO-{now.year}-{str(count + 1).zfill(4)}"
    
    # Process lines
    lines = []
    subtotal = 0
    for line_data in data.lines:
        line_id = f"poline_{uuid.uuid4().hex[:12]}"
        line_total = line_data.qty_ordered * line_data.unit_cost
        lines.append({
            "line_id": line_id,
            "inventory_item_id": line_data.inventory_item_id,
            "item_name": line_data.item_name,
            "qty_ordered": line_data.qty_ordered,
            "purchase_unit": line_data.purchase_unit,
            "unit_cost": line_data.unit_cost,
            "line_total": round(line_total, 2),
            "qty_received": 0,
            "notes": line_data.notes
        })
        subtotal += line_total
    
    po = {
        "po_id": po_id,
        "company_id": user.company_id,
        "po_number": po_number,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier.get("name"),
        "status": "Draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "needed_by_date": data.needed_by_date.isoformat() if data.needed_by_date else None,
        "payment_method": data.payment_method,
        "notes": data.notes,
        "lines": lines,
        "subtotal": round(subtotal, 2),
        "tax_amount": 0,
        "total": round(subtotal, 2),
        "received_at": None,
        "received_by": None,
        "cost_center_id": data.cost_center_id,
        "cost_center_name": None  # Will be populated if cost_center_id provided
    }
    
    # Get cost center name if ID provided
    if data.cost_center_id:
        cc = await db.cost_centers.find_one(
            {"cost_center_id": data.cost_center_id, "company_id": user.company_id},
            {"_id": 0, "name": 1}
        )
        if cc:
            po["cost_center_name"] = cc.get("name")
    
    await db.purchase_orders_full.insert_one(po)
    del po["_id"]
    return po

@purchase_orders_router.put("/{po_id}")
async def update_purchase_order(po_id: str, data: PurchaseOrderFullCreate, user: User = Depends(get_current_user)):
    """Update a purchase order (only if Draft)"""
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Can only edit Draft POs")
    
    # Get supplier name
    supplier = await db.suppliers.find_one(
        {"supplier_id": data.supplier_id, "company_id": user.company_id},
        {"_id": 0, "name": 1}
    )
    
    now = datetime.now(timezone.utc)
    
    # Process lines
    lines = []
    subtotal = 0
    for line_data in data.lines:
        line_id = f"poline_{uuid.uuid4().hex[:12]}"
        line_total = line_data.qty_ordered * line_data.unit_cost
        lines.append({
            "line_id": line_id,
            "inventory_item_id": line_data.inventory_item_id,
            "item_name": line_data.item_name,
            "qty_ordered": line_data.qty_ordered,
            "purchase_unit": line_data.purchase_unit,
            "unit_cost": line_data.unit_cost,
            "line_total": round(line_total, 2),
            "qty_received": 0,
            "notes": line_data.notes
        })
        subtotal += line_total
    
    await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": {
            "supplier_id": data.supplier_id,
            "supplier_name": supplier.get("name") if supplier else None,
            "needed_by_date": data.needed_by_date.isoformat() if data.needed_by_date else None,
            "payment_method": data.payment_method,
            "notes": data.notes,
            "lines": lines,
            "subtotal": round(subtotal, 2),
            "total": round(subtotal, 2),
            "updated_at": now.isoformat()
        }}
    )
    return {"message": "Updated"}

@purchase_orders_router.put("/{po_id}/status")
async def update_purchase_order_status(po_id: str, status: str, user: User = Depends(get_current_user)):
    """Update PO status"""
    valid_statuses = ["Draft", "Sent", "PartiallyReceived", "Received", "Cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    now = datetime.now(timezone.utc)
    update_data = {"status": status, "updated_at": now.isoformat()}
    
    result = await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return {"message": "Status updated"}

@purchase_orders_router.post("/{po_id}/receive")
async def receive_purchase_order(
    po_id: str,
    received_lines: List[Dict[str, Any]],
    create_expense: bool = False,  # Changed: Default to False - only create expense with invoice
    invoice_number: Optional[str] = None,
    invoice_date: Optional[datetime] = None,
    invoice_url: Optional[str] = None,
    ncf: Optional[str] = None,  # NCF (Número de Comprobante Fiscal) for DGII in Dominican Republic
    invoice_subtotal: Optional[float] = None,  # Invoice subtotal before taxes
    invoice_itbis: Optional[float] = None,  # ITBIS (18% tax in DR)
    invoice_total: Optional[float] = None,  # Total including taxes
    user: User = Depends(get_current_user)
):
    """
    Receive items from a PO.
    received_lines: [{line_id, qty_received, unit_cost (optional override)}]
    Creates inventory transactions. Expense/payable is only created if invoice_number or ncf is provided.
    """
    # Auto-enable expense creation when invoice is provided
    if invoice_number or ncf:
        create_expense = True
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    now = datetime.now(timezone.utc)
    
    # Update PO lines with received quantities
    all_received = True
    updated_lines = []
    expense_lines = []
    
    for line in po.get("lines", []):
        received_info = next((r for r in received_lines if r.get("line_id") == line.get("line_id")), None)
        if received_info:
            new_qty_received = line.get("qty_received", 0) + received_info.get("qty_received", 0)
            unit_cost = received_info.get("unit_cost", line.get("unit_cost", 0))
            
            line["qty_received"] = new_qty_received
            line["unit_cost"] = unit_cost
            line["line_total"] = round(line.get("qty_ordered", 0) * unit_cost, 2)
            
            if new_qty_received < line.get("qty_ordered", 0):
                all_received = False
            
            # Create inventory transaction
            transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
            await db.inventory_transactions.insert_one({
                "transaction_id": transaction_id,
                "company_id": user.company_id,
                "inventory_item_id": line.get("inventory_item_id"),
                "event_id": None,
                "transaction_type": "Purchase",
                "quantity": received_info.get("qty_received", 0),
                "unit_cost": unit_cost,
                "notes": f"PO {po.get('po_number')}",
                "po_id": po_id,
                "created_at": now.isoformat(),
                "created_by": user.user_id
            })
            
            # Update inventory stock
            await db.ingredients.update_one(
                {"ingredient_id": line.get("inventory_item_id"), "company_id": user.company_id},
                {"$inc": {"stock_quantity": received_info.get("qty_received", 0)}}
            )
            
            # Add price history
            history_id = f"pricehist_{uuid.uuid4().hex[:12]}"
            await db.inventory_price_history.insert_one({
                "history_id": history_id,
                "inventory_item_id": line.get("inventory_item_id"),
                "company_id": user.company_id,
                "supplier_id": po.get("supplier_id"),
                "supplier_name": po.get("supplier_name"),
                "effective_date": now.isoformat(),
                "unit_cost": unit_cost,
                "purchase_unit": line.get("purchase_unit", "unit"),
                "source": "PO",
                "notes": f"PO {po.get('po_number')}"
            })
            
            # Update item cost
            await db.ingredients.update_one(
                {"ingredient_id": line.get("inventory_item_id"), "company_id": user.company_id},
                {"$set": {"cost_per_unit": unit_cost, "updated_at": now.isoformat()}}
            )
            
            # Prepare expense line
            expense_lines.append({
                "inventory_item_id": line.get("inventory_item_id"),
                "description": line.get("item_name"),
                "quantity": received_info.get("qty_received", 0),
                "unit_cost": unit_cost,
                "tax_rate": 0
            })
        else:
            if line.get("qty_received", 0) < line.get("qty_ordered", 0):
                all_received = False
        
        updated_lines.append(line)
    
    # Update PO
    new_status = "Received" if all_received else "PartiallyReceived"
    subtotal = sum(l.get("line_total", 0) for l in updated_lines)
    
    # Build update document for PO
    po_update = {
        "lines": updated_lines,
        "status": new_status,
        "subtotal": round(subtotal, 2),
        "total": round(subtotal, 2),
        "received_at": now.isoformat() if all_received else None,
        "received_by": user.user_id if all_received else None,
        "updated_at": now.isoformat()
    }
    
    # Add invoice fields if provided
    if create_expense:
        if ncf:
            po_update["ncf"] = ncf
        if invoice_number:
            po_update["invoice_number"] = invoice_number
        if invoice_subtotal is not None:
            po_update["invoice_subtotal"] = round(invoice_subtotal, 2)
        if invoice_itbis is not None:
            po_update["invoice_itbis"] = round(invoice_itbis, 2)
        if invoice_total is not None:
            po_update["invoice_total"] = round(invoice_total, 2)
        if invoice_date:
            po_update["invoice_date"] = invoice_date.isoformat()
    
    await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": po_update}
    )
    
    # Create expense record if requested
    expense_id = None
    if create_expense and expense_lines:
        expense_id = f"expense_{uuid.uuid4().hex[:12]}"
        # Use invoice values if provided, otherwise calculate from lines
        calc_subtotal = sum(l["quantity"] * l["unit_cost"] for l in expense_lines)
        final_subtotal = invoice_subtotal if invoice_subtotal is not None else calc_subtotal
        final_itbis = invoice_itbis if invoice_itbis is not None else 0
        final_total = invoice_total if invoice_total is not None else (final_subtotal + final_itbis)
        
        await db.expenses.insert_one({
            "expense_id": expense_id,
            "company_id": user.company_id,
            "supplier_id": po.get("supplier_id"),
            "supplier_name": po.get("supplier_name"),
            "po_id": po_id,
            "po_number": po.get("po_number"),
            "ncf": ncf,  # NCF for DGII compliance (Dominican Republic)
            "invoice_number": invoice_number or ncf,  # Use NCF if no invoice number
            "invoice_date": invoice_date.isoformat() if invoice_date else now.isoformat(),
            "invoice_url": invoice_url,
            "invoice_subtotal": round(final_subtotal, 2),  # Subtotal before taxes
            "invoice_itbis": round(final_itbis, 2),  # ITBIS amount (18% in DR)
            "invoice_total": round(final_total, 2),  # Total including taxes
            "due_date": None,
            "payment_method": po.get("payment_method", "Transfer"),
            "lines": expense_lines,
            "subtotal": round(final_subtotal, 2),
            "tax_amount": round(final_itbis, 2),
            "total": round(final_total, 2),
            "amount": round(final_total, 2),  # For compatibility
            "paid_amount": 0,
            "notes": f"Auto-created from PO {po.get('po_number')}",
            "description": f"PO {po.get('po_number')} - {po.get('supplier_name', 'Supplier')}",
            "status": "Pending",
            "payment_status": "Pending",  # For Business Clarity compatibility
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        })
    
    return {
        "message": "Items received",
        "new_status": new_status,
        "expense_id": expense_id
    }

@purchase_orders_router.delete("/{po_id}")
async def delete_purchase_order(po_id: str, user: User = Depends(get_current_user)):
    """Delete a purchase order (only if Draft)"""
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.get("status") != "Draft":
        raise HTTPException(status_code=400, detail="Can only delete Draft POs")
    
    await db.purchase_orders_full.delete_one({"po_id": po_id, "company_id": user.company_id})
    return {"message": "Deleted"}


@purchase_orders_router.post("/{po_id}/register-invoice")
async def register_invoice_for_po(
    po_id: str,
    invoice_number: str,
    invoice_date: Optional[datetime] = None,
    invoice_url: Optional[str] = None,
    due_date: Optional[datetime] = None,
    tax_amount: float = 0,
    ncf: Optional[str] = None,  # NCF for DGII compliance (Dominican Republic)
    invoice_subtotal: Optional[float] = None,  # Subtotal before taxes
    invoice_itbis: Optional[float] = None,  # ITBIS amount (18% in DR)
    invoice_total: Optional[float] = None,  # Total including taxes
    user: User = Depends(get_current_user)
):
    """
    Register an invoice for a received PO that didn't have invoice at reception time.
    Creates the expense/payable record linked to this PO.
    Supports NCF and ITBIS fields for Dominican Republic compliance.
    """
    po = await db.purchase_orders_full.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    if po.get("status") not in ["PartiallyReceived", "Received"]:
        raise HTTPException(status_code=400, detail="PO must be received before registering invoice")
    
    # Check if expense already exists for this PO
    existing_expense = await db.expenses.find_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if existing_expense:
        raise HTTPException(status_code=400, detail=f"Invoice already registered: {existing_expense.get('invoice_number')}")
    
    now = datetime.now(timezone.utc)
    
    # Build expense lines from received PO lines
    expense_lines = []
    for line in po.get("lines", []):
        qty_received = line.get("qty_received", 0)
        if qty_received > 0:
            expense_lines.append({
                "inventory_item_id": line.get("inventory_item_id"),
                "item_name": line.get("item_name"),
                "quantity": qty_received,
                "unit": line.get("unit"),
                "unit_cost": line.get("unit_cost", 0),
                "total": round(qty_received * line.get("unit_cost", 0), 2)
            })
    
    if not expense_lines:
        raise HTTPException(status_code=400, detail="No received items to invoice")
    
    # Create expense record
    expense_id = f"expense_{uuid.uuid4().hex[:12]}"
    expense_subtotal = sum(l["total"] for l in expense_lines)
    
    # Use provided invoice values if available, otherwise calculate
    final_subtotal = invoice_subtotal if invoice_subtotal is not None else expense_subtotal
    final_itbis = invoice_itbis if invoice_itbis is not None else tax_amount
    final_total = invoice_total if invoice_total is not None else (final_subtotal + final_itbis)
    
    await db.expenses.insert_one({
        "expense_id": expense_id,
        "company_id": user.company_id,
        "supplier_id": po.get("supplier_id"),
        "supplier_name": po.get("supplier_name"),
        "po_id": po_id,
        "po_number": po.get("po_number"),
        "ncf": ncf,  # NCF for DGII compliance
        "invoice_number": invoice_number,
        "invoice_date": (invoice_date or now).isoformat(),
        "invoice_url": invoice_url,
        "invoice_subtotal": round(final_subtotal, 2),
        "invoice_itbis": round(final_itbis, 2),
        "invoice_total": round(final_total, 2),
        "due_date": due_date.isoformat() if due_date else None,
        "payment_method": po.get("payment_method", "Transfer"),
        "lines": expense_lines,
        "subtotal": round(final_subtotal, 2),
        "tax_amount": round(final_itbis, 2),
        "total": round(final_total, 2),
        "amount": round(final_total, 2),
        "paid_amount": 0,
        "notes": f"Invoice for PO {po.get('po_number')}",
        "description": f"PO {po.get('po_number')} - {po.get('supplier_name', 'Supplier')}",
        "status": "Pending",
        "payment_status": "Pending",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    })
    
    # Update PO with invoice reference
    po_update_fields = {
        "invoice_number": invoice_number,
        "invoice_date": (invoice_date or now).isoformat(),
        "invoice_registered_at": now.isoformat(),
        "expense_id": expense_id
    }
    if ncf:
        po_update_fields["ncf"] = ncf
    if invoice_subtotal is not None:
        po_update_fields["invoice_subtotal"] = round(final_subtotal, 2)
    if invoice_itbis is not None:
        po_update_fields["invoice_itbis"] = round(final_itbis, 2)
    if invoice_total is not None:
        po_update_fields["invoice_total"] = round(final_total, 2)
    
    await db.purchase_orders_full.update_one(
        {"po_id": po_id, "company_id": user.company_id},
        {"$set": po_update_fields}
    )
    
    return {
        "message": "Invoice registered successfully",
        "expense_id": expense_id,
        "total": round(final_total, 2)
    }


