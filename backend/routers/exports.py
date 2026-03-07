# Excel Export router for Business Clarity data
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from typing import Optional
import logging
import io
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils.dataframe import dataframe_to_rows

from models.auth import User
from dependencies import get_current_user, db

logger = logging.getLogger(__name__)

exports_router = APIRouter(prefix="/exports", tags=["Exports"])

# Shared styling
HEADER_FILL = PatternFill(start_color="2E7D32", end_color="2E7D32", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
THIN_BORDER = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)


def create_excel_from_data(title: str, company_name: str, period: str, headers: list, rows: list, filename_prefix: str):
    """Helper to create formatted Excel files"""
    wb = Workbook()
    ws = wb.active
    # Remove invalid characters from sheet name (/ : * ? " < > |)
    safe_title = title.replace("/", "-").replace(":", "-").replace("*", "").replace("?", "").replace('"', "").replace("<", "").replace(">", "").replace("|", "")
    ws.title = safe_title[:31]  # Excel sheet name limit
    
    # Title and company info
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"Empresa: {company_name}"
    ws["A3"] = f"Período: {period}"
    ws["A4"] = f"Generado: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    # Headers at row 6
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=6, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = THIN_BORDER
    
    # Data rows
    if rows:
        for row_idx, row in enumerate(rows, 7):
            for col_idx, value in enumerate(row, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.border = THIN_BORDER
                if isinstance(value, (int, float)):
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="left")
        
        # Adjust column widths
        for col in ws.columns:
            max_length = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 25)
    else:
        ws["A7"] = "No hay datos para este período"
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


@exports_router.get("/expenses")
async def export_expenses(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Export expenses/payables to Excel for a custom date range"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    # Parse dates
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get company info
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    # Get expenses
    expenses = await db.expenses.find({
        "company_id": company_id,
        "$or": [
            {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}},
            {"invoice_date": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}}
        ]
    }, {"_id": 0}).sort("created_at", 1).to_list(None)
    
    headers = [
        "Fecha", "NCF", "# Factura", "Proveedor", "Descripción", 
        "Subtotal", "ITBIS", "Total", "Pagado", "Saldo", "Estado", "Método Pago"
    ]
    
    rows = []
    for exp in expenses:
        date_str = (exp.get("invoice_date") or exp.get("created_at", ""))[:10]
        rows.append([
            date_str,
            exp.get("ncf", ""),
            exp.get("invoice_number", ""),
            exp.get("supplier_name", ""),
            exp.get("description", ""),
            round(exp.get("invoice_subtotal") or exp.get("subtotal", 0), 2),
            round(exp.get("invoice_itbis") or exp.get("tax_amount", 0), 2),
            round(exp.get("invoice_total") or exp.get("total", 0), 2),
            round(exp.get("paid_amount", 0), 2),
            round((exp.get("invoice_total") or exp.get("total", 0)) - exp.get("paid_amount", 0), 2),
            exp.get("payment_status", exp.get("status", "")),
            exp.get("payment_method", "")
        ])
    
    period = f"{start_date} al {end_date}"
    buffer = create_excel_from_data(
        "LISTADO DE GASTOS / CUENTAS POR PAGAR",
        company_name, period, headers, rows, "gastos"
    )
    
    filename = f"gastos_{start_date}_{end_date}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@exports_router.get("/invoices")
async def export_invoices(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Export invoices to Excel for a custom date range"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    invoices = await db.invoices.find({
        "company_id": company_id,
        "created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}
    }, {"_id": 0}).sort("created_at", 1).to_list(None)
    
    headers = [
        "Fecha", "# Factura", "NCF", "Cliente", "Evento",
        "Subtotal", "ITBIS", "Total", "Pagado", "Saldo", "Estado", "Fecha Vencimiento"
    ]
    
    rows = []
    for inv in invoices:
        date_str = (inv.get("invoice_date") or inv.get("created_at", ""))[:10]
        rows.append([
            date_str,
            inv.get("invoice_number", ""),
            inv.get("ncf", ""),
            inv.get("client_name", ""),
            inv.get("event_name", ""),
            round(inv.get("subtotal", 0), 2),
            round(inv.get("tax_amount", 0), 2),
            round(inv.get("total", 0), 2),
            round(inv.get("paid_amount", 0), 2),
            round(inv.get("total", 0) - inv.get("paid_amount", 0), 2),
            inv.get("status", ""),
            (inv.get("due_date") or "")[:10] if inv.get("due_date") else ""
        ])
    
    period = f"{start_date} al {end_date}"
    buffer = create_excel_from_data(
        "LISTADO DE FACTURAS",
        company_name, period, headers, rows, "facturas"
    )
    
    filename = f"facturas_{start_date}_{end_date}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@exports_router.get("/payments-received")
async def export_payments_received(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Export client payments received to Excel"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    payments = await db.client_payments.find({
        "company_id": company_id,
        "payment_date": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}
    }, {"_id": 0}).sort("payment_date", 1).to_list(None)
    
    headers = [
        "Fecha Pago", "# Recibo", "Cliente", "# Factura", 
        "Monto", "Método Pago", "Referencia", "Notas"
    ]
    
    rows = []
    for pmt in payments:
        date_str = (pmt.get("payment_date") or pmt.get("created_at", ""))[:10]
        rows.append([
            date_str,
            pmt.get("receipt_number", pmt.get("payment_id", "")),
            pmt.get("client_name", ""),
            pmt.get("invoice_number", ""),
            round(pmt.get("amount", 0), 2),
            pmt.get("payment_method", ""),
            pmt.get("reference", ""),
            pmt.get("notes", "")
        ])
    
    period = f"{start_date} al {end_date}"
    buffer = create_excel_from_data(
        "PAGOS RECIBIDOS DE CLIENTES",
        company_name, period, headers, rows, "pagos_recibidos"
    )
    
    filename = f"pagos_recibidos_{start_date}_{end_date}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@exports_router.get("/payments-made")
async def export_payments_made(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Export payments made to suppliers to Excel"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    # Get supplier payments
    payments = await db.supplier_payments.find({
        "company_id": company_id,
        "payment_date": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}
    }, {"_id": 0}).sort("payment_date", 1).to_list(None)
    
    headers = [
        "Fecha Pago", "Proveedor", "# Factura", 
        "Monto", "Método Pago", "Referencia", "Notas"
    ]
    
    rows = []
    for pmt in payments:
        date_str = (pmt.get("payment_date") or pmt.get("created_at", ""))[:10]
        rows.append([
            date_str,
            pmt.get("supplier_name", ""),
            pmt.get("invoice_number", ""),
            round(pmt.get("amount", 0), 2),
            pmt.get("payment_method", ""),
            pmt.get("reference", ""),
            pmt.get("notes", "")
        ])
    
    period = f"{start_date} al {end_date}"
    buffer = create_excel_from_data(
        "PAGOS REALIZADOS A PROVEEDORES",
        company_name, period, headers, rows, "pagos_realizados"
    )
    
    filename = f"pagos_proveedores_{start_date}_{end_date}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@exports_router.get("/purchase-orders")
async def export_purchase_orders(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Export purchase orders to Excel"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    pos = await db.purchase_orders_full.find({
        "company_id": company_id,
        "created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}
    }, {"_id": 0}).sort("created_at", 1).to_list(None)
    
    headers = [
        "Fecha", "# OC", "Proveedor", "Estado", "NCF",
        "Subtotal", "ITBIS", "Total", "Método Pago", "Fecha Requerida"
    ]
    
    rows = []
    for po in pos:
        date_str = (po.get("created_at") or "")[:10]
        rows.append([
            date_str,
            po.get("po_number", ""),
            po.get("supplier_name", ""),
            po.get("status", ""),
            po.get("ncf", ""),
            round(po.get("subtotal", 0), 2),
            round(po.get("invoice_itbis", 0), 2),
            round(po.get("invoice_total") or po.get("total", 0), 2),
            po.get("payment_method", ""),
            (po.get("needed_by_date") or "")[:10] if po.get("needed_by_date") else ""
        ])
    
    period = f"{start_date} al {end_date}"
    buffer = create_excel_from_data(
        "ÓRDENES DE COMPRA",
        company_name, period, headers, rows, "ordenes_compra"
    )
    
    filename = f"ordenes_compra_{start_date}_{end_date}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@exports_router.get("/fixed-costs")
async def export_fixed_costs(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    user: User = Depends(get_current_user)
):
    """Export fixed costs/overhead to Excel"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    # Get fixed cost categories
    categories = await db.fixed_cost_categories.find({
        "company_id": company_id
    }, {"_id": 0}).to_list(None)
    cat_map = {c.get("category_id"): c for c in categories}
    
    # Get supplier_payables assigned to fixed costs
    payables = await db.supplier_payables.find({
        "company_id": company_id,
        "created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()},
        "fixed_cost_category_id": {"$exists": True}
    }, {"_id": 0}).sort("created_at", 1).to_list(None)
    
    headers = [
        "Fecha", "Categoría", "Centro de Costo", "Proveedor", "Descripción",
        "Monto", "Estado", "Recurrente"
    ]
    
    rows = []
    for pay in payables:
        date_str = (pay.get("created_at") or "")[:10]
        cat_id = pay.get("fixed_cost_category_id")
        cat = cat_map.get(cat_id, {})
        rows.append([
            date_str,
            cat.get("name", pay.get("category_name", "")),
            cat.get("cost_center_name", ""),
            pay.get("supplier_name", ""),
            pay.get("description", ""),
            round(pay.get("amount", 0), 2),
            pay.get("status", ""),
            "Sí" if pay.get("is_recurring") else "No"
        ])
    
    period = f"{start_date} al {end_date}"
    buffer = create_excel_from_data(
        "COSTOS FIJOS / OVERHEAD",
        company_name, period, headers, rows, "costos_fijos"
    )
    
    filename = f"costos_fijos_{start_date}_{end_date}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
