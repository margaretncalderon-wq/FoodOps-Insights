# Migration router for historical data import
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import csv
import io
import logging

from models.auth import User
from dependencies import get_current_user, db

logger = logging.getLogger(__name__)

migration_router = APIRouter(prefix="/api/migration", tags=["migration"])


@migration_router.get("/history")
async def get_migration_history(user: User = Depends(get_current_user)):
    """Get migration import history"""
    company_id = user.company_id
    if not company_id:
        return []
    
    history = await db.migration_history.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return history


@migration_router.post("/parse")
async def parse_migration_file(
    file: UploadFile = File(...),
    type: str = Form(...),
    user: User = Depends(get_current_user)
):
    """Parse uploaded CSV/Excel file and return rows"""
    try:
        content = await file.read()
        
        # Try to decode as UTF-8, fallback to latin-1
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
        
        # Parse CSV
        rows = []
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            # Clean up row data
            cleaned_row = {}
            for key, value in row.items():
                if key:  # Skip empty keys
                    # Strip whitespace and handle encoding
                    clean_key = key.strip().lower().replace(' ', '_')
                    cleaned_row[clean_key] = value.strip() if value else ""
            rows.append(cleaned_row)
        
        return {"rows": rows, "count": len(rows)}
    
    except Exception as e:
        logger.error(f"Error parsing file: {e}")
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")


@migration_router.post("/import")
async def import_migration_data(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Import migration data"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    import_type = data.get("type")
    rows = data.get("data", [])
    period = data.get("period", {})
    
    if not import_type or not rows:
        raise HTTPException(status_code=400, detail="Type and data required")
    
    period_month = period.get("month", datetime.now().month - 1)
    period_year = period.get("year", datetime.now().year)
    
    now = datetime.now(timezone.utc)
    imported_count = 0
    errors = []
    
    try:
        # Process based on type
        if import_type == "sales":
            imported_count = await _import_sales(company_id, rows, period_month, period_year, user.user_id)
        elif import_type == "purchases":
            imported_count = await _import_purchases(company_id, rows, period_month, period_year, user.user_id)
        elif import_type == "inventory":
            imported_count = await _import_inventory(company_id, rows, user.user_id)
        elif import_type == "fixed_expenses":
            imported_count = await _import_fixed_expenses(company_id, rows, period_month, period_year, user.user_id)
        elif import_type == "variable_expenses":
            imported_count = await _import_variable_expenses(company_id, rows, period_month, period_year, user.user_id)
        elif import_type == "bank_balances":
            imported_count = await _import_bank_balances(company_id, rows, user.user_id)
        elif import_type == "accounts_receivable":
            imported_count = await _import_accounts_receivable(company_id, rows, user.user_id)
        elif import_type == "accounts_payable":
            imported_count = await _import_accounts_payable(company_id, rows, user.user_id)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown import type: {import_type}")
        
        # Log successful import
        await db.migration_history.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "type": import_type,
            "period_month": period_month,
            "period_year": period_year,
            "records_imported": imported_count,
            "status": "completed",
            "imported_by": user.user_id,
            "created_at": now
        })
        
        return {"imported": imported_count, "errors": errors}
    
    except Exception as e:
        logger.error(f"Import error: {e}")
        # Log failed import
        await db.migration_history.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "type": import_type,
            "period_month": period_month,
            "period_year": period_year,
            "records_imported": 0,
            "status": "error",
            "error_message": str(e),
            "imported_by": user.user_id,
            "created_at": now
        })
        raise HTTPException(status_code=500, detail=str(e))


async def _import_sales(company_id: str, rows: list, month: int, year: int, user_id: str) -> int:
    """Import sales transactions"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            # Parse amounts
            subtotal = float(row.get("subtotal", 0) or 0)
            itbis = float(row.get("itbis", 0) or 0)
            total = float(row.get("total", 0) or subtotal + itbis)
            
            # Parse date
            date_str = row.get("date", row.get("fecha", ""))
            try:
                if date_str:
                    sale_date = datetime.fromisoformat(date_str.replace("/", "-"))
                else:
                    sale_date = datetime(year, month + 1, 15)
            except:
                sale_date = datetime(year, month + 1, 15)
            
            sale = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "client_name": row.get("client", row.get("cliente", "")),
                "description": row.get("description", row.get("descripcion", "")),
                "subtotal": subtotal,
                "itbis": itbis,
                "total": total,
                "ncf": row.get("ncf", ""),
                "status": row.get("status", row.get("estado", "paid")),
                "date": sale_date,
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            await db.sales_transactions.insert_one(sale)
            count += 1
        except Exception as e:
            logger.error(f"Error importing sale row: {e}")
            continue
    
    return count


async def _import_purchases(company_id: str, rows: list, month: int, year: int, user_id: str) -> int:
    """Import purchase transactions"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            subtotal = float(row.get("subtotal", 0) or 0)
            itbis = float(row.get("itbis", 0) or 0)
            total = float(row.get("total", 0) or subtotal + itbis)
            
            date_str = row.get("date", row.get("fecha", ""))
            try:
                purchase_date = datetime.fromisoformat(date_str.replace("/", "-")) if date_str else datetime(year, month + 1, 15)
            except:
                purchase_date = datetime(year, month + 1, 15)
            
            purchase = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "vendor_name": row.get("vendor", row.get("proveedor", "")),
                "description": row.get("description", row.get("descripcion", "")),
                "subtotal": subtotal,
                "itbis": itbis,
                "total": total,
                "ncf": row.get("ncf", ""),
                "status": row.get("status", row.get("estado", "paid")),
                "date": purchase_date,
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            await db.purchase_transactions.insert_one(purchase)
            count += 1
        except Exception as e:
            logger.error(f"Error importing purchase row: {e}")
            continue
    
    return count


async def _import_inventory(company_id: str, rows: list, user_id: str) -> int:
    """Import initial inventory"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            quantity = float(row.get("quantity", row.get("cantidad", 0)) or 0)
            unit_cost = float(row.get("unit_cost", row.get("costo_unitario", 0)) or 0)
            total_value = float(row.get("total_value", row.get("valor_total", 0)) or quantity * unit_cost)
            
            item = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "sku": row.get("sku", row.get("codigo", "")),
                "name": row.get("name", row.get("nombre", "")),
                "category": row.get("category", row.get("categoria", "")),
                "quantity": quantity,
                "unit": row.get("unit", row.get("unidad", "unit")),
                "unit_cost": unit_cost,
                "total_value": total_value,
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            # Check if item exists by name
            existing = await db.inventory_items.find_one({
                "company_id": company_id,
                "name": item["name"]
            })
            
            if existing:
                # Update existing item
                await db.inventory_items.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "quantity": quantity,
                        "unit_cost": unit_cost,
                        "updated_at": now
                    }}
                )
            else:
                await db.inventory_items.insert_one(item)
            
            count += 1
        except Exception as e:
            logger.error(f"Error importing inventory row: {e}")
            continue
    
    return count


async def _import_fixed_expenses(company_id: str, rows: list, month: int, year: int, user_id: str) -> int:
    """Import fixed expenses"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            amount = float(row.get("amount", row.get("monto", 0)) or 0)
            
            date_str = row.get("date", row.get("fecha", ""))
            try:
                expense_date = datetime.fromisoformat(date_str.replace("/", "-")) if date_str else datetime(year, month + 1, 1)
            except:
                expense_date = datetime(year, month + 1, 1)
            
            expense = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "category": row.get("category", row.get("categoria", "other")),
                "description": row.get("description", row.get("descripcion", "")),
                "amount": amount,
                "frequency": row.get("frequency", row.get("frecuencia", "monthly")),
                "vendor": row.get("vendor", row.get("proveedor", "")),
                "date": expense_date,
                "expense_type": "fixed",
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            await db.expenses.insert_one(expense)
            count += 1
        except Exception as e:
            logger.error(f"Error importing fixed expense row: {e}")
            continue
    
    return count


async def _import_variable_expenses(company_id: str, rows: list, month: int, year: int, user_id: str) -> int:
    """Import variable expenses"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            amount = float(row.get("amount", row.get("monto", 0)) or 0)
            
            date_str = row.get("date", row.get("fecha", ""))
            try:
                expense_date = datetime.fromisoformat(date_str.replace("/", "-")) if date_str else datetime(year, month + 1, 15)
            except:
                expense_date = datetime(year, month + 1, 15)
            
            expense = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "category": row.get("category", row.get("categoria", "other")),
                "description": row.get("description", row.get("descripcion", "")),
                "amount": amount,
                "vendor": row.get("vendor", row.get("proveedor", "")),
                "event_id": row.get("event_id", row.get("id_evento", "")),
                "date": expense_date,
                "expense_type": "variable",
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            await db.expenses.insert_one(expense)
            count += 1
        except Exception as e:
            logger.error(f"Error importing variable expense row: {e}")
            continue
    
    return count


async def _import_bank_balances(company_id: str, rows: list, user_id: str) -> int:
    """Import initial bank balances"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            balance = float(row.get("balance", row.get("saldo", 0)) or 0)
            
            date_str = row.get("as_of_date", row.get("fecha_corte", ""))
            try:
                as_of_date = datetime.fromisoformat(date_str.replace("/", "-")) if date_str else now
            except:
                as_of_date = now
            
            account = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "account_name": row.get("account_name", row.get("nombre_cuenta", "")),
                "bank": row.get("bank", row.get("banco", "")),
                "account_number": row.get("account_number", row.get("no_cuenta", "")),
                "initial_balance": balance,
                "current_balance": balance,
                "as_of_date": as_of_date,
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            # Check if account exists
            existing = await db.bank_accounts.find_one({
                "company_id": company_id,
                "account_name": account["account_name"]
            })
            
            if existing:
                await db.bank_accounts.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "initial_balance": balance,
                        "current_balance": balance,
                        "updated_at": now
                    }}
                )
            else:
                await db.bank_accounts.insert_one(account)
            
            count += 1
        except Exception as e:
            logger.error(f"Error importing bank balance row: {e}")
            continue
    
    return count


async def _import_accounts_receivable(company_id: str, rows: list, user_id: str) -> int:
    """Import accounts receivable (pending customer balances)"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            amount = float(row.get("amount", row.get("monto", 0)) or 0)
            balance = float(row.get("balance", row.get("saldo", 0)) or amount)
            
            date_str = row.get("date", row.get("fecha", ""))
            due_date_str = row.get("due_date", row.get("fecha_vencimiento", ""))
            
            try:
                invoice_date = datetime.fromisoformat(date_str.replace("/", "-")) if date_str else now
            except:
                invoice_date = now
            
            try:
                due_date = datetime.fromisoformat(due_date_str.replace("/", "-")) if due_date_str else None
            except:
                due_date = None
            
            receivable = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "client_name": row.get("client", row.get("cliente", "")),
                "invoice_number": row.get("invoice_number", row.get("no_factura", "")),
                "invoice_date": invoice_date,
                "due_date": due_date,
                "original_amount": amount,
                "pending_balance": balance,
                "status": "pending" if balance > 0 else "paid",
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            await db.accounts_receivable.insert_one(receivable)
            count += 1
        except Exception as e:
            logger.error(f"Error importing receivable row: {e}")
            continue
    
    return count


async def _import_accounts_payable(company_id: str, rows: list, user_id: str) -> int:
    """Import accounts payable (pending vendor balances)"""
    count = 0
    now = datetime.now(timezone.utc)
    
    for row in rows:
        try:
            amount = float(row.get("amount", row.get("monto", 0)) or 0)
            balance = float(row.get("balance", row.get("saldo", 0)) or amount)
            
            date_str = row.get("date", row.get("fecha", ""))
            due_date_str = row.get("due_date", row.get("fecha_vencimiento", ""))
            
            try:
                invoice_date = datetime.fromisoformat(date_str.replace("/", "-")) if date_str else now
            except:
                invoice_date = now
            
            try:
                due_date = datetime.fromisoformat(due_date_str.replace("/", "-")) if due_date_str else None
            except:
                due_date = None
            
            payable = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "vendor_name": row.get("vendor", row.get("proveedor", "")),
                "invoice_number": row.get("invoice_number", row.get("no_factura", "")),
                "invoice_date": invoice_date,
                "due_date": due_date,
                "original_amount": amount,
                "pending_balance": balance,
                "status": "pending" if balance > 0 else "paid",
                "source": "migration",
                "created_by": user_id,
                "created_at": now
            }
            
            await db.accounts_payable.insert_one(payable)
            count += 1
        except Exception as e:
            logger.error(f"Error importing payable row: {e}")
            continue
    
    return count
