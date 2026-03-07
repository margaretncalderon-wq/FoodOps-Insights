# ITBIS (Tax) router for Dominican Republic tax calculations
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

itbis_router = APIRouter(prefix="/finance/itbis", tags=["ITBIS"])


@itbis_router.get("/report")
async def get_itbis_report(
    month: int = Query(..., ge=0, le=11),
    year: int = Query(..., ge=2020, le=2030),
    user: User = Depends(get_current_user)
):
    """Get ITBIS report for a specific month"""
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    # Calculate date range for the month
    start_date = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 11:
        end_date = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 2, 1, 0, 0, 0, tzinfo=timezone.utc)
    
    # Get sales data
    sales_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "date": {"$gte": start_date, "$lt": end_date}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_gravado": {"$sum": "$subtotal"},
                "total_exento": {"$sum": {"$cond": [{"$eq": ["$itbis", 0]}, "$subtotal", 0]}},
                "itbis_cobrado": {"$sum": "$itbis"},
                "transaction_count": {"$sum": 1}
            }
        }
    ]
    
    sales_result = await db.sales_transactions.aggregate(sales_pipeline).to_list(1)
    sales_data = sales_result[0] if sales_result else {
        "total_gravado": 0,
        "total_exento": 0,
        "itbis_cobrado": 0,
        "transaction_count": 0
    }
    
    # Also check invoices collection for sales
    invoices_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "created_at": {"$gte": start_date, "$lt": end_date},
                "status": {"$in": ["sent", "paid", "partial"]}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_gravado": {"$sum": "$subtotal"},
                "itbis_cobrado": {"$sum": "$tax_amount"},
                "transaction_count": {"$sum": 1}
            }
        }
    ]
    
    invoices_result = await db.invoices.aggregate(invoices_pipeline).to_list(1)
    if invoices_result:
        inv_data = invoices_result[0]
        sales_data["total_gravado"] = sales_data.get("total_gravado", 0) + inv_data.get("total_gravado", 0)
        sales_data["itbis_cobrado"] = sales_data.get("itbis_cobrado", 0) + inv_data.get("itbis_cobrado", 0)
        sales_data["transaction_count"] = sales_data.get("transaction_count", 0) + inv_data.get("transaction_count", 0)
    
    # Get purchases data
    purchases_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "date": {"$gte": start_date, "$lt": end_date}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_gravado": {"$sum": "$subtotal"},
                "total_exento": {"$sum": {"$cond": [{"$eq": ["$itbis", 0]}, "$subtotal", 0]}},
                "itbis_pagado": {"$sum": "$itbis"},
                "transaction_count": {"$sum": 1}
            }
        }
    ]
    
    purchases_result = await db.purchase_transactions.aggregate(purchases_pipeline).to_list(1)
    purchases_data = purchases_result[0] if purchases_result else {
        "total_gravado": 0,
        "total_exento": 0,
        "itbis_pagado": 0,
        "transaction_count": 0
    }
    
    # Also check expenses collection for purchases with ITBIS
    expenses_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "created_at": {"$gte": start_date, "$lt": end_date},
                "invoice_itbis": {"$exists": True, "$gt": 0}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_gravado": {"$sum": "$invoice_subtotal"},
                "itbis_pagado": {"$sum": "$invoice_itbis"},
                "transaction_count": {"$sum": 1}
            }
        }
    ]
    
    expenses_result = await db.expenses.aggregate(expenses_pipeline).to_list(1)
    if expenses_result:
        exp_data = expenses_result[0]
        purchases_data["total_gravado"] = purchases_data.get("total_gravado", 0) + exp_data.get("total_gravado", 0)
        purchases_data["itbis_pagado"] = purchases_data.get("itbis_pagado", 0) + exp_data.get("itbis_pagado", 0)
        purchases_data["transaction_count"] = purchases_data.get("transaction_count", 0) + exp_data.get("transaction_count", 0)
    
    # Calculate balance
    itbis_cobrado = sales_data.get("itbis_cobrado", 0) or 0
    itbis_pagado = purchases_data.get("itbis_pagado", 0) or 0
    itbis_a_pagar = itbis_cobrado - itbis_pagado
    
    return {
        "period": {
            "month": month,
            "year": year,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        },
        "sales": {
            "total_gravado": sales_data.get("total_gravado", 0) or 0,
            "total_exento": sales_data.get("total_exento", 0) or 0,
            "itbis_cobrado": itbis_cobrado,
            "transaction_count": sales_data.get("transaction_count", 0) or 0
        },
        "purchases": {
            "total_gravado": purchases_data.get("total_gravado", 0) or 0,
            "total_exento": purchases_data.get("total_exento", 0) or 0,
            "itbis_pagado": itbis_pagado,
            "transaction_count": purchases_data.get("transaction_count", 0) or 0
        },
        "balance": {
            "itbis_cobrado": itbis_cobrado,
            "itbis_pagado": itbis_pagado,
            "itbis_a_pagar": itbis_a_pagar if itbis_a_pagar > 0 else 0,
            "credito_fiscal": abs(itbis_a_pagar) if itbis_a_pagar < 0 else 0
        }
    }



@itbis_router.get("/format-606")
async def download_format_606(
    month: int = Query(..., ge=0, le=11),
    year: int = Query(..., ge=2020, le=2030),
    user: User = Depends(get_current_user)
):
    """
    Download Format 606 (Purchases) for DGII - Dominican Republic
    Contains all purchases with NCF for the specified month
    """
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    # Get company info
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_rnc = company.get("tax_id", "") if company else ""
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    # Calculate date range
    start_date = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 11:
        end_date = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 2, 1, 0, 0, 0, tzinfo=timezone.utc)
    
    # Get expenses with NCF
    expenses = await db.expenses.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
    }, {"_id": 0}).to_list(None)
    
    # Also get purchase_transactions
    purchases = await db.purchase_transactions.find({
        "company_id": company_id,
        "date": {"$gte": start_date, "$lt": end_date}
    }, {"_id": 0}).to_list(None)
    
    # Combine and prepare data for 606
    rows = []
    for exp in expenses:
        ncf = exp.get("ncf") or exp.get("invoice_number", "")
        if not ncf:
            continue
        rows.append({
            "RNC/Cédula Proveedor": exp.get("supplier_rnc", ""),
            "Tipo ID": "1" if len(exp.get("supplier_rnc", "")) == 9 else "2",
            "NCF": ncf,
            "NCF Modificado": "",
            "Tipo Compra": "01",  # 01 = Gastos de personal
            "Fecha Comprobante": exp.get("invoice_date", exp.get("created_at", ""))[:10] if exp.get("invoice_date") or exp.get("created_at") else "",
            "Fecha Pago": exp.get("paid_at", "")[:10] if exp.get("paid_at") else "",
            "Monto Facturado Servicios": 0,
            "Monto Facturado Bienes": round(exp.get("invoice_subtotal") or exp.get("subtotal", 0), 2),
            "Total Monto Facturado": round(exp.get("invoice_total") or exp.get("total", 0), 2),
            "ITBIS Facturado": round(exp.get("invoice_itbis") or exp.get("tax_amount", 0), 2),
            "ITBIS Retenido": 0,
            "ITBIS sujeto a Proporcionalidad": 0,
            "ITBIS llevado al Costo": 0,
            "ITBIS por Adelantar": 0,
            "ITBIS percibido en compras": 0,
            "Tipo Retención ISR": "",
            "Monto Retención Renta": 0,
            "ISR Percibido en compras": 0,
            "Impuesto Selectivo al Consumo": 0,
            "Otros Impuestos/Tasas": 0,
            "Monto Propina Legal": 0,
            "Forma de Pago": "04" if exp.get("payment_method") == "Transfer" else "01"
        })
    
    for pur in purchases:
        ncf = pur.get("ncf") or pur.get("invoice_number", "")
        if not ncf:
            continue
        rows.append({
            "RNC/Cédula Proveedor": pur.get("supplier_rnc", ""),
            "Tipo ID": "1",
            "NCF": ncf,
            "NCF Modificado": "",
            "Tipo Compra": "02",  # 02 = Gastos por trabajos, suministros y servicios
            "Fecha Comprobante": str(pur.get("date", ""))[:10] if pur.get("date") else "",
            "Fecha Pago": "",
            "Monto Facturado Servicios": 0,
            "Monto Facturado Bienes": round(pur.get("subtotal", 0), 2),
            "Total Monto Facturado": round(pur.get("total", 0), 2),
            "ITBIS Facturado": round(pur.get("itbis", 0), 2),
            "ITBIS Retenido": 0,
            "ITBIS sujeto a Proporcionalidad": 0,
            "ITBIS llevado al Costo": 0,
            "ITBIS por Adelantar": 0,
            "ITBIS percibido en compras": 0,
            "Tipo Retención ISR": "",
            "Monto Retención Renta": 0,
            "ISR Percibido en compras": 0,
            "Impuesto Selectivo al Consumo": 0,
            "Otros Impuestos/Tasas": 0,
            "Monto Propina Legal": 0,
            "Forma de Pago": "04"
        })
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "606"
    
    # Header
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    
    # Company info rows
    ws["A1"] = "FORMATO 606 - COMPRAS DE BIENES Y SERVICIOS"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"RNC: {company_rnc}"
    ws["A3"] = f"Razón Social: {company_name}"
    ws["A4"] = f"Período: {month + 1:02d}/{year}"
    
    # Column headers starting at row 6
    if rows:
        df = pd.DataFrame(rows)
        headers = list(df.columns)
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=6, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
            cell.border = thin_border
        
        # Data rows
        for row_idx, row in enumerate(df.values, 7):
            for col_idx, value in enumerate(row, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.border = thin_border
                cell.alignment = Alignment(horizontal="center")
        
        # Adjust column widths
        for col in ws.columns:
            max_length = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 20)
    else:
        ws["A6"] = "No hay compras registradas para este período"
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"606_{company_rnc}_{year}{month + 1:02d}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@itbis_router.get("/format-607")
async def download_format_607(
    month: int = Query(..., ge=0, le=11),
    year: int = Query(..., ge=2020, le=2030),
    user: User = Depends(get_current_user)
):
    """
    Download Format 607 (Sales) for DGII - Dominican Republic
    Contains all sales with NCF for the specified month
    """
    company_id = user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID required")
    
    # Get company info
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    company_rnc = company.get("tax_id", "") if company else ""
    company_name = company.get("legal_name") or company.get("name", "") if company else ""
    
    # Calculate date range
    start_date = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 11:
        end_date = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 2, 1, 0, 0, 0, tzinfo=timezone.utc)
    
    # Get invoices
    invoices = await db.invoices.find({
        "company_id": company_id,
        "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()},
        "status": {"$in": ["sent", "paid", "partial"]}
    }, {"_id": 0}).to_list(None)
    
    # Get sales transactions
    sales = await db.sales_transactions.find({
        "company_id": company_id,
        "date": {"$gte": start_date, "$lt": end_date}
    }, {"_id": 0}).to_list(None)
    
    # Prepare data for 607
    rows = []
    for inv in invoices:
        ncf = inv.get("ncf") or inv.get("invoice_number", "")
        rows.append({
            "RNC/Cédula Cliente": inv.get("client_rnc", ""),
            "Tipo ID": "1" if len(inv.get("client_rnc", "")) == 9 else "2",
            "NCF": ncf,
            "NCF Modificado": "",
            "Tipo Ingreso": "01",  # 01 = Ingresos por operaciones
            "Fecha Comprobante": inv.get("invoice_date", inv.get("created_at", ""))[:10] if inv.get("invoice_date") or inv.get("created_at") else "",
            "Fecha Retención": "",
            "Monto Facturado": round(inv.get("subtotal", 0), 2),
            "ITBIS Facturado": round(inv.get("tax_amount", 0), 2),
            "ITBIS Retenido por Terceros": 0,
            "ITBIS Percibido": 0,
            "Retención Renta por Terceros": 0,
            "ISR Percibido": 0,
            "Impuesto Selectivo al Consumo": 0,
            "Otros Impuestos/Tasas": 0,
            "Monto Propina Legal": 0,
            "Efectivo": round(inv.get("total", 0), 2) if inv.get("payment_method") == "Cash" else 0,
            "Cheque/Transferencia": round(inv.get("total", 0), 2) if inv.get("payment_method") in ["Transfer", "Check"] else 0,
            "Tarjeta Débito/Crédito": round(inv.get("total", 0), 2) if inv.get("payment_method") == "Card" else 0,
            "Venta a Crédito": round(inv.get("total", 0), 2) if inv.get("status") != "paid" else 0,
            "Bonos o Certificados": 0,
            "Permuta": 0,
            "Otras Formas de Venta": 0
        })
    
    for sale in sales:
        ncf = sale.get("ncf") or sale.get("invoice_number", "")
        rows.append({
            "RNC/Cédula Cliente": sale.get("client_rnc", ""),
            "Tipo ID": "1",
            "NCF": ncf,
            "NCF Modificado": "",
            "Tipo Ingreso": "01",
            "Fecha Comprobante": str(sale.get("date", ""))[:10] if sale.get("date") else "",
            "Fecha Retención": "",
            "Monto Facturado": round(sale.get("subtotal", 0), 2),
            "ITBIS Facturado": round(sale.get("itbis", 0), 2),
            "ITBIS Retenido por Terceros": 0,
            "ITBIS Percibido": 0,
            "Retención Renta por Terceros": 0,
            "ISR Percibido": 0,
            "Impuesto Selectivo al Consumo": 0,
            "Otros Impuestos/Tasas": 0,
            "Monto Propina Legal": 0,
            "Efectivo": 0,
            "Cheque/Transferencia": round(sale.get("total", 0), 2),
            "Tarjeta Débito/Crédito": 0,
            "Venta a Crédito": 0,
            "Bonos o Certificados": 0,
            "Permuta": 0,
            "Otras Formas de Venta": 0
        })
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "607"
    
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    
    # Company info rows
    ws["A1"] = "FORMATO 607 - VENTAS DE BIENES Y SERVICIOS"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = f"RNC: {company_rnc}"
    ws["A3"] = f"Razón Social: {company_name}"
    ws["A4"] = f"Período: {month + 1:02d}/{year}"
    
    if rows:
        df = pd.DataFrame(rows)
        headers = list(df.columns)
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=6, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
            cell.border = thin_border
        
        for row_idx, row in enumerate(df.values, 7):
            for col_idx, value in enumerate(row, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.border = thin_border
                cell.alignment = Alignment(horizontal="center")
        
        for col in ws.columns:
            max_length = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 20)
    else:
        ws["A6"] = "No hay ventas registradas para este período"
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"607_{company_rnc}_{year}{month + 1:02d}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
