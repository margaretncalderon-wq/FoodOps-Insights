# ITBIS (Tax) router for Dominican Republic tax calculations
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional
import logging

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
