# Migration router for historical data import
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import csv
import io
import logging
import re

from models.auth import User
from dependencies import get_current_user, db

logger = logging.getLogger(__name__)

migration_router = APIRouter(prefix="/migration", tags=["migration"])


def escape_regex(text: str) -> str:
    """Escape special regex characters in a string"""
    return re.escape(text) if text else ""


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
        
        # Try to decode as UTF-8 (with BOM handling), fallback to latin-1
        try:
            text = content.decode('utf-8-sig')  # utf-8-sig handles BOM
        except UnicodeDecodeError:
            try:
                text = content.decode('utf-8')
            except UnicodeDecodeError:
                text = content.decode('latin-1')
        
        # Detect delimiter (comma, semicolon, or tab)
        first_line = text.split('\n')[0] if text else ""
        delimiter = ','
        if ';' in first_line and ',' not in first_line:
            delimiter = ';'
        elif '\t' in first_line and ',' not in first_line:
            delimiter = '\t'
        
        logger.info(f"Parsing file with delimiter: '{delimiter}'")
        
        # Parse CSV
        rows = []
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        for row in reader:
            # Clean up row data
            cleaned_row = {}
            for key, value in row.items():
                if key:  # Skip empty keys
                    # Strip whitespace, normalize unicode, handle encoding
                    clean_key = key.strip().lower().replace(' ', '_').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n')
                    cleaned_row[clean_key] = value.strip() if value else ""
            if cleaned_row:  # Only add non-empty rows
                rows.append(cleaned_row)
        
        logger.info(f"Parsed {len(rows)} rows. First row keys: {list(rows[0].keys()) if rows else []}")
        
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
        if import_type == "clients":
            imported_count = await _import_clients(company_id, rows, user.user_id)
        elif import_type == "vendors":
            imported_count = await _import_vendors(company_id, rows, user.user_id)
        elif import_type == "sales":
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


# ==================== HELPER FUNCTIONS ====================

async def _find_or_create_client(company_id: str, rnc: str, name: str, user_id: str) -> dict:
    """Find client by RNC or name, or create if not exists - uses db.clients"""
    client = None
    
    # First try to find by RNC (if provided)
    if rnc:
        rnc_clean = rnc.strip().replace("-", "")
        client = await db.clients.find_one({
            "company_id": company_id,
            "$or": [{"rnc": rnc_clean}, {"tax_id": rnc_clean}]
        })
    
    # If not found by RNC, try by name (case-insensitive)
    if not client and name:
        name_clean = name.strip()
        name_escaped = escape_regex(name_clean)
        client = await db.clients.find_one({
            "company_id": company_id,
            "$or": [
                {"name": {"$regex": f"^{name_escaped}$", "$options": "i"}},
                {"display_name": {"$regex": f"^{name_escaped}$", "$options": "i"}}
            ]
        })
    
    # If still not found, create a new client
    if not client:
        now = datetime.now(timezone.utc)
        client = {
            "client_id": f"client_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "name": name.strip() if name else "Unknown",
            "display_name": name.strip() if name else "Unknown",
            "rnc": rnc.strip().replace("-", "") if rnc else None,
            "tax_id": rnc.strip().replace("-", "") if rnc else None,
            "type": "individual",
            "client_type": "Individual",
            "status": "Active",
            "tags": [],
            "source": "migration",
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.clients.insert_one(client)
    
    return client
    
    return client


async def _find_or_create_vendor(company_id: str, rnc: str, name: str, user_id: str, category: str = None) -> dict:
    """Find supplier by RNC or name, or create if not exists - uses db.suppliers"""
    supplier = None
    
    # First try to find by RNC (if provided)
    if rnc:
        rnc_clean = rnc.strip().replace("-", "")
        supplier = await db.suppliers.find_one({
            "company_id": company_id,
            "$or": [{"rnc": rnc_clean}, {"tax_id": rnc_clean}]
        })
    
    # If not found by RNC, try by name (case-insensitive)
    if not supplier and name:
        name_clean = name.strip()
        name_escaped = escape_regex(name_clean)
        supplier = await db.suppliers.find_one({
            "company_id": company_id,
            "name": {"$regex": f"^{name_escaped}$", "$options": "i"}
        })
    
    # If still not found, create a new supplier
    if not supplier:
        now = datetime.now(timezone.utc)
        supplier = {
            "supplier_id": f"supplier_{uuid.uuid4().hex[:12]}",
            "company_id": company_id,
            "name": name.strip() if name else "Unknown",
            "rnc": rnc.strip().replace("-", "") if rnc else None,
            "tax_id": rnc.strip().replace("-", "") if rnc else None,
            "category": category or "General",
            "payment_terms": "net30",
            "minimum_order": 0.0,
            "delivery_days": [],
            "status": "Active",
            "notes": "Auto-created during migration",
            "source": "migration",
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.suppliers.insert_one(supplier)
    
    return supplier


# ==================== IMPORT FUNCTIONS ====================

async def _import_clients(company_id: str, rows: list, user_id: str) -> int:
    """Import clients directory"""
    count = 0
    now = datetime.now(timezone.utc)
    
    logger.info(f"Starting client import with {len(rows)} rows")
    
    for idx, row in enumerate(rows):
        try:
            # Debug: log row keys
            if idx == 0:
                logger.info(f"First row keys: {list(row.keys())}")
                logger.info(f"First row data: {row}")
            
            # Try multiple field name variations - including slash variants
            name = (
                row.get("name") or 
                row.get("nombre") or 
                row.get("client_name") or 
                row.get("nombre_cliente") or
                row.get("razon_social") or
                row.get("razón_social") or
                row.get("nombre/razon_social") or  # Slash variant
                row.get("nombre/razón_social") or
                row.get("razon_social/nombre") or
                ""
            ).strip()
            
            if not name:
                logger.warning(f"Row {idx}: No name found, skipping. Keys: {list(row.keys())}")
                continue
            
            # Try multiple RNC field name variations - including slash variants
            rnc = (
                row.get("rnc") or 
                row.get("rnc_cedula") or 
                row.get("rnc/cedula") or  # Slash variant
                row.get("cedula") or
                row.get("cedula/rnc") or
                row.get("tax_id") or
                row.get("ruc") or
                ""
            ).strip().replace("-", "")
            
            # Get other fields with multiple variants
            contact = (row.get("contacto") or row.get("contact_name") or row.get("contact") or "").strip()
            email = (row.get("email") or row.get("correo") or "").strip()
            phone = (row.get("telefono") or row.get("phone") or row.get("tel") or "").strip()
            address = (row.get("direccion") or row.get("address") or "").strip()
            
            # Check if client already exists in db.clients collection
            existing = None
            if rnc:
                existing = await db.clients.find_one({
                    "company_id": company_id,
                    "$or": [{"rnc": rnc}, {"tax_id": rnc}]
                })
            if not existing:
                name_escaped = escape_regex(name)
                existing = await db.clients.find_one({
                    "company_id": company_id,
                    "$or": [
                        {"name": {"$regex": f"^{name_escaped}$", "$options": "i"}},
                        {"display_name": {"$regex": f"^{name_escaped}$", "$options": "i"}}
                    ]
                })
            
            if existing:
                # Update existing client with new data
                update_data = {"updated_at": now.isoformat()}
                if rnc and not existing.get("rnc"):
                    update_data["rnc"] = rnc
                    update_data["tax_id"] = rnc
                if contact:
                    update_data["contact_name"] = contact
                if email:
                    update_data["email"] = email
                if phone:
                    update_data["phone"] = phone
                if address:
                    update_data["address"] = address
                
                await db.clients.update_one(
                    {"client_id": existing["client_id"]},
                    {"$set": update_data}
                )
            else:
                # Create new client in db.clients collection (same format as app uses)
                client = {
                    "client_id": f"client_{uuid.uuid4().hex[:12]}",
                    "company_id": company_id,
                    "name": name,
                    "display_name": name,
                    "rnc": rnc or None,
                    "tax_id": rnc or None,
                    "contact_name": contact or None,
                    "email": email or None,
                    "phone": phone or None,
                    "address": address or None,
                    "type": "individual",
                    "client_type": "Individual",
                    "status": "Active",
                    "tags": [],
                    "source": "migration",
                    "created_by": user_id,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
                await db.clients.insert_one(client)
            
            count += 1
        except Exception as e:
            logger.error(f"Error importing client row {idx}: {e}")
            continue
    
    return count


async def _import_vendors(company_id: str, rows: list, user_id: str) -> int:
    """Import vendors/suppliers directory - saves to db.suppliers collection"""
    count = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    
    logger.info(f"Starting vendor/supplier import with {len(rows)} rows")
    
    for idx, row in enumerate(rows):
        try:
            # Debug first row
            if idx == 0:
                logger.info(f"First vendor row keys: {list(row.keys())}")
                logger.info(f"First vendor row data: {row}")
            
            # Try multiple field name variations for name
            name = (
                row.get("name") or 
                row.get("nombre") or 
                row.get("nombre/razon_social") or
                row.get("name/company") or
                row.get("company") or
                row.get("razon_social") or
                row.get("supplier_name") or
                row.get("vendor_name") or
                row.get("empresa") or
                ""
            ).strip()
            
            if not name:
                skipped += 1
                if skipped <= 5:
                    logger.warning(f"Vendor row {idx}: No name found, skipping. Keys: {list(row.keys())}")
                continue
            
            # Try multiple RNC field name variations
            rnc = (
                row.get("rnc") or 
                row.get("rnc/cedula") or
                row.get("rnc_cedula") or
                row.get("cedula") or
                row.get("tax_id") or
                ""
            ).strip().replace("-", "")
            
            # Get other fields
            contact = (row.get("contacto") or row.get("contact_name") or row.get("contact") or "").strip()
            email = (row.get("email") or row.get("correo") or "").strip()
            phone = (row.get("telefono") or row.get("phone") or row.get("tel") or "").strip()
            address = (row.get("direccion") or row.get("address") or "").strip()
            category = (row.get("categoria") or row.get("category") or row.get("tipo") or "General").strip()
            
            # Check if supplier already exists in db.suppliers collection
            existing = None
            if rnc:
                existing = await db.suppliers.find_one({
                    "company_id": company_id,
                    "$or": [{"rnc": rnc}, {"tax_id": rnc}]
                })
            if not existing:
                name_escaped = escape_regex(name)
                existing = await db.suppliers.find_one({
                    "company_id": company_id,
                    "name": {"$regex": f"^{name_escaped}$", "$options": "i"}
                })
            
            if existing:
                # Update existing supplier with new data
                update_data = {"updated_at": now.isoformat()}
                if rnc and not existing.get("rnc"):
                    update_data["rnc"] = rnc
                    update_data["tax_id"] = rnc
                if contact:
                    update_data["contact_name"] = contact
                if email:
                    update_data["email"] = email
                if phone:
                    update_data["phone"] = phone
                if address:
                    update_data["address"] = address
                if category:
                    update_data["category"] = category
                
                await db.suppliers.update_one(
                    {"supplier_id": existing["supplier_id"]},
                    {"$set": update_data}
                )
            else:
                # Create new supplier in db.suppliers collection (same format as app uses)
                supplier = {
                    "supplier_id": f"supplier_{uuid.uuid4().hex[:12]}",
                    "company_id": company_id,
                    "name": name,
                    "rnc": rnc or None,
                    "tax_id": rnc or None,
                    "contact_name": contact or None,
                    "email": email or None,
                    "phone": phone or None,
                    "address": address or None,
                    "category": category,
                    "payment_terms": "net30",
                    "minimum_order": 0.0,
                    "delivery_days": [],
                    "status": "Active",
                    "notes": f"Imported via migration",
                    "source": "migration",
                    "created_by": user_id,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
                await db.suppliers.insert_one(supplier)
            
            count += 1
        except Exception as e:
            logger.error(f"Error importing vendor row {idx}: {e}")
            continue
    
    logger.info(f"Vendor import complete: {count} imported, {skipped} skipped")
    return count


async def _import_sales(company_id: str, rows: list, month: int, year: int, user_id: str) -> int:
    """Import sales transactions with client linking"""
    count = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    
    logger.info(f"Starting sales import with {len(rows)} rows for period {month+1}/{year}")
    
    for idx, row in enumerate(rows):
        try:
            # Debug first row
            if idx == 0:
                logger.info(f"First sales row keys: {list(row.keys())}")
                logger.info(f"First sales row data: {row}")
            
            # Parse amounts - handle both comma and dot decimals
            def parse_amount(val):
                if not val:
                    return 0.0
                val_str = str(val).replace(",", ".").replace(" ", "").replace("$", "").replace("RD", "")
                try:
                    return float(val_str)
                except:
                    return 0.0
            
            subtotal = parse_amount(row.get("subtotal") or row.get("monto") or row.get("amount") or 0)
            itbis = parse_amount(row.get("itbis") or row.get("tax") or row.get("impuesto") or 0)
            total = parse_amount(row.get("total") or 0) or (subtotal + itbis)
            
            # Parse date - support multiple formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
            date_str = (row.get("date") or row.get("fecha") or row.get("fecha_factura") or "").strip()
            sale_date = None
            if date_str:
                # Try DD/MM/YYYY first (common in Latin America)
                for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"]:
                    try:
                        sale_date = datetime.strptime(date_str, fmt)
                        break
                    except:
                        continue
            if not sale_date:
                sale_date = datetime(year, month + 1, 15)  # Default to middle of period
            
            # Get client info with multiple field name variations
            client_rnc = (
                row.get("client_rnc") or row.get("rnc_cliente") or 
                row.get("rnc/cedula") or row.get("rnc") or row.get("cedula_cliente") or ""
            ).strip().replace("-", "")
            
            client_name = (
                row.get("client_name") or row.get("cliente") or row.get("client") or
                row.get("nombre_cliente") or row.get("nombre/razon_social") or row.get("razon_social") or ""
            ).strip()
            
            if not client_name and not client_rnc:
                skipped += 1
                if skipped <= 5:
                    logger.warning(f"Sales row {idx}: No client info found, skipping")
                continue
            
            # Find or create client
            client = await _find_or_create_client(company_id, client_rnc, client_name, user_id)
            
            # Create invoice in db.invoices (used by Business Clarity)
            invoice_id = f"inv_{uuid.uuid4().hex[:12]}"
            invoice = {
                "invoice_id": invoice_id,
                "company_id": company_id,
                "client_id": client.get("client_id") or client.get("id"),
                "client_name": client.get("display_name") or client.get("name"),
                "client_rnc": client.get("rnc") or client.get("tax_id"),
                "invoice_type": "client",  # client invoice (receivable)
                "invoice_number": (row.get("invoice_number") or row.get("numero_factura") or row.get("factura") or f"MIG-{count+1:04d}").strip(),
                "ncf": (row.get("ncf") or row.get("ncf_cliente") or "").strip(),
                "description": (row.get("description") or row.get("descripcion") or row.get("concepto") or "").strip(),
                "subtotal": subtotal,
                "tax_amount": itbis,
                "total": total,
                "paid_amount": total if (row.get("status") or row.get("estado") or "paid").lower() == "paid" else 0,
                "status": "paid" if (row.get("status") or row.get("estado") or "paid").lower() == "paid" else "pending",
                "invoice_date": sale_date.isoformat(),
                "due_date": sale_date.isoformat(),
                "period_month": month,
                "period_year": year,
                "source": "migration",
                "created_by": user_id,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            
            await db.invoices.insert_one(invoice)
            
            # Also save to sales_transactions for ITBIS reporting
            sale = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "invoice_id": invoice_id,
                "client_id": client.get("client_id") or client.get("id"),
                "client_name": client.get("display_name") or client.get("name"),
                "client_rnc": client.get("rnc") or client.get("tax_id"),
                "subtotal": subtotal,
                "itbis": itbis,
                "total": total,
                "ncf": invoice["ncf"],
                "date": sale_date.isoformat(),
                "period_month": month,
                "period_year": year,
                "source": "migration",
                "created_at": now.isoformat()
            }
            await db.sales_transactions.insert_one(sale)
            
            count += 1
        except Exception as e:
            logger.error(f"Error importing sale row {idx}: {e}")
            continue
    
    logger.info(f"Sales import complete: {count} imported, {skipped} skipped")
    return count


async def _import_purchases(company_id: str, rows: list, month: int, year: int, user_id: str) -> int:
    """Import purchase transactions with vendor linking"""
    count = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    
    logger.info(f"Starting purchases import with {len(rows)} rows for period {month+1}/{year}")
    
    for idx, row in enumerate(rows):
        try:
            # Debug first row
            if idx == 0:
                logger.info(f"First purchase row keys: {list(row.keys())}")
                logger.info(f"First purchase row data: {row}")
            
            # Parse amounts - handle both comma and dot decimals
            def parse_amount(val):
                if not val:
                    return 0.0
                val_str = str(val).replace(",", ".").replace(" ", "").replace("$", "").replace("RD", "")
                try:
                    return float(val_str)
                except:
                    return 0.0
            
            subtotal = parse_amount(row.get("subtotal") or row.get("monto") or row.get("amount") or 0)
            itbis = parse_amount(row.get("itbis") or row.get("tax") or row.get("impuesto") or 0)
            total = parse_amount(row.get("total") or 0) or (subtotal + itbis)
            
            # Parse date - support multiple formats
            date_str = (row.get("date") or row.get("fecha") or row.get("fecha_factura") or "").strip()
            purchase_date = None
            if date_str:
                for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"]:
                    try:
                        purchase_date = datetime.strptime(date_str, fmt)
                        break
                    except:
                        continue
            if not purchase_date:
                purchase_date = datetime(year, month + 1, 15)
            
            # Get vendor info with multiple field name variations
            vendor_rnc = (
                row.get("vendor_rnc") or row.get("rnc_proveedor") or row.get("supplier_rnc") or
                row.get("rnc/cedula") or row.get("rnc") or ""
            ).strip().replace("-", "")
            
            vendor_name = (
                row.get("vendor_name") or row.get("proveedor") or row.get("vendor") or row.get("supplier") or
                row.get("nombre_proveedor") or row.get("nombre/razon_social") or row.get("razon_social") or ""
            ).strip()
            
            if not vendor_name and not vendor_rnc:
                skipped += 1
                if skipped <= 5:
                    logger.warning(f"Purchase row {idx}: No vendor info found, skipping")
                continue
            
            # Find or create vendor
            vendor = await _find_or_create_vendor(company_id, vendor_rnc, vendor_name, user_id)
            
            purchase = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "vendor_id": vendor.get("supplier_id") or vendor.get("id"),
                "vendor_name": vendor.get("name"),
                "vendor_rnc": vendor.get("rnc") or vendor.get("tax_id"),
                "description": (row.get("description") or row.get("descripcion") or row.get("concepto") or "").strip(),
                "invoice_number": (row.get("invoice_number") or row.get("numero_factura") or row.get("factura") or "").strip(),
                "subtotal": subtotal,
                "itbis": itbis,
                "total": total,
                "ncf": (row.get("ncf") or row.get("ncf_proveedor") or "").strip(),
                "status": (row.get("status") or row.get("estado") or "paid").strip().lower(),
                "date": purchase_date.isoformat(),
                "period_month": month,
                "period_year": year,
                "source": "migration",
                "created_by": user_id,
                "created_at": now.isoformat()
            }
            
            await db.purchase_transactions.insert_one(purchase)
            count += 1
        except Exception as e:
            logger.error(f"Error importing purchase row {idx}: {e}")
            continue
    
    logger.info(f"Purchases import complete: {count} imported, {skipped} skipped")
    return count


async def _import_inventory(company_id: str, rows: list, user_id: str) -> int:
    """Import inventory items with brand and supplier support"""
    count = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    
    logger.info(f"Starting inventory import with {len(rows)} rows")
    
    for idx, row in enumerate(rows):
        try:
            # Debug first row
            if idx == 0:
                logger.info(f"First inventory row keys: {list(row.keys())}")
                logger.info(f"First inventory row data: {row}")
            
            # Parse name (required)
            name = (
                row.get("name") or row.get("nombre") or 
                row.get("producto") or row.get("product") or ""
            ).strip()
            
            if not name:
                skipped += 1
                if skipped <= 5:
                    logger.warning(f"Inventory row {idx}: No name found, skipping")
                continue
            
            # Parse amounts - handle comma decimals
            def parse_amount(val):
                if not val:
                    return 0.0
                val_str = str(val).replace(",", ".").replace(" ", "").replace("$", "").replace("RD", "")
                try:
                    return float(val_str)
                except:
                    return 0.0
            
            # Get all fields with multiple variations
            brand = (
                row.get("marca") or row.get("brand") or ""
            ).strip()
            
            supplier_name = (
                row.get("proveedor") or row.get("supplier") or 
                row.get("supplier_name") or ""
            ).strip()
            
            category = (
                row.get("categoria") or row.get("category") or 
                row.get("tipo") or "General"
            ).strip()
            
            unit_cost = parse_amount(
                row.get("valor_x_unidad") or row.get("valor_unidad") or
                row.get("unit_cost") or row.get("costo_unitario") or
                row.get("precio") or row.get("price") or 0
            )
            
            stock = parse_amount(
                row.get("stock") or row.get("shock") or  # "shock" might be typo for stock
                row.get("quantity") or row.get("cantidad") or
                row.get("existencia") or 0
            )
            
            unused = parse_amount(
                row.get("no_utilizado") or row.get("unused") or 0
            )
            
            total_value = parse_amount(
                row.get("valor_total") or row.get("total_value") or 0
            )
            if total_value == 0 and stock > 0 and unit_cost > 0:
                total_value = stock * unit_cost
            
            # Additional fields
            sku = (row.get("sku") or row.get("codigo") or row.get("code") or "").strip()
            unit = (row.get("unit") or row.get("unidad") or "unit").strip()
            min_stock = parse_amount(row.get("min_stock") or row.get("stock_minimo") or 0)
            location = (row.get("location") or row.get("ubicacion") or "").strip()
            
            # Find or create supplier if provided
            supplier_id = None
            if supplier_name:
                supplier = await _find_or_create_vendor(company_id, "", supplier_name, user_id, category)
                supplier_id = supplier.get("supplier_id")
            
            # Check if item exists by name or SKU
            existing = None
            if sku:
                existing = await db.ingredients.find_one({
                    "company_id": company_id,
                    "sku": sku
                })
            if not existing:
                name_escaped = escape_regex(name)
                existing = await db.ingredients.find_one({
                    "company_id": company_id,
                    "name": {"$regex": f"^{name_escaped}$", "$options": "i"}
                })
            
            if existing:
                # Update existing item
                update_data = {
                    "current_stock": stock,
                    "unit_cost": unit_cost,
                    "updated_at": now.isoformat()
                }
                if brand:
                    update_data["brand"] = brand
                if supplier_id:
                    update_data["preferred_supplier_id"] = supplier_id
                    update_data["supplier_name"] = supplier_name
                if category:
                    update_data["category"] = category
                if unused > 0:
                    update_data["unused_quantity"] = unused
                
                await db.ingredients.update_one(
                    {"ingredient_id": existing["ingredient_id"]},
                    {"$set": update_data}
                )
            else:
                # Create new inventory item
                item = {
                    "ingredient_id": f"ing_{uuid.uuid4().hex[:12]}",
                    "company_id": company_id,
                    "sku": sku or f"SKU-{uuid.uuid4().hex[:6].upper()}",
                    "name": name,
                    "brand": brand or None,
                    "category": category,
                    "preferred_supplier_id": supplier_id,
                    "supplier_name": supplier_name or None,
                    "unit": unit,
                    "unit_cost": round(unit_cost, 2),
                    "current_stock": stock,
                    "min_stock": min_stock,
                    "unused_quantity": unused,
                    "total_value": round(total_value, 2),
                    "location": location or None,
                    "status": "active",
                    "source": "migration",
                    "created_by": user_id,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
                await db.ingredients.insert_one(item)
            
            count += 1
        except Exception as e:
            logger.error(f"Error importing inventory row {idx}: {e}")
            continue
    
    logger.info(f"Inventory import complete: {count} imported, {skipped} skipped")
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
    """Import accounts receivable (pending customer balances) with client linking"""
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
            
            # Find or create client
            client_rnc = row.get("client_rnc", row.get("rnc_cliente", ""))
            client_name = row.get("client_name", row.get("client", row.get("cliente", "")))
            
            client = await _find_or_create_client(company_id, client_rnc, client_name, user_id)
            
            receivable = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "client_id": client["id"],
                "client_name": client["name"],
                "client_rnc": client.get("rnc"),
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
    """Import accounts payable (pending vendor balances) with vendor linking"""
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
            
            # Find or create vendor
            vendor_rnc = row.get("vendor_rnc", row.get("rnc_proveedor", ""))
            vendor_name = row.get("vendor_name", row.get("vendor", row.get("proveedor", "")))
            
            vendor = await _find_or_create_vendor(company_id, vendor_rnc, vendor_name, user_id)
            
            payable = {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "vendor_id": vendor["id"],
                "vendor_name": vendor["name"],
                "vendor_rnc": vendor.get("rnc"),
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
