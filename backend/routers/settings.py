"""
Settings router for application-wide configuration
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
import uuid

from models.auth import User
from dependencies import get_current_user
from config import db

settings_router = APIRouter(prefix="/settings", tags=["Settings"])


# ==================== VARIABLE PAY CONFIGURATION ====================

@settings_router.get("/variable-pay-config")
async def get_variable_pay_config(user: User = Depends(get_current_user)):
    """Get variable pay configuration (overtime, commissions, bonuses, incentives)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    config = await db.variable_pay_config.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    if not config:
        # Return defaults
        config = {
            "company_id": company_id,
            "overtime_payment_type": "separate",
            "overtime_payment_day": 5,
            "commission_payment_type": "separate",
            "commission_payment_day": 10,
            "bonus_payment_type": "separate",
            "bonus_payment_day": 5,
            "incentive_payment_type": "separate",
            "incentive_payment_day": 5,
            "benefits_payment_type": "with_payroll",
            "benefits_payment_day": 1,
            "separate_payment_frequency": "monthly",
            "require_approval": True,
            "auto_include_approved": False
        }
    
    return config


@settings_router.post("/variable-pay-config")
async def save_variable_pay_config(data: dict, user: User = Depends(get_current_user)):
    """Save variable pay configuration"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    
    config = {
        "company_id": company_id,
        "overtime_payment_type": data.get("overtime_payment_type", "separate"),
        "overtime_payment_day": data.get("overtime_payment_day", 5),
        "commission_payment_type": data.get("commission_payment_type", "separate"),
        "commission_payment_day": data.get("commission_payment_day", 10),
        "bonus_payment_type": data.get("bonus_payment_type", "separate"),
        "bonus_payment_day": data.get("bonus_payment_day", 5),
        "incentive_payment_type": data.get("incentive_payment_type", "separate"),
        "incentive_payment_day": data.get("incentive_payment_day", 5),
        "benefits_payment_type": data.get("benefits_payment_type", "with_payroll"),
        "benefits_payment_day": data.get("benefits_payment_day", 1),
        "separate_payment_frequency": data.get("separate_payment_frequency", "monthly"),
        "require_approval": data.get("require_approval", True),
        "auto_include_approved": data.get("auto_include_approved", False),
        "updated_at": now,
        "updated_by": user.user_id
    }
    
    await db.variable_pay_config.update_one(
        {"company_id": company_id},
        {"$set": config},
        upsert=True
    )
    
    return {"message": "Configuration saved", "config": config}


# ==================== VARIABLE PAY DASHBOARD SUMMARY ====================

@settings_router.get("/variable-pay-summary")
async def get_variable_pay_summary(user: User = Depends(get_current_user)):
    """Get summary of pending variable pay items for dashboard widget"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Get variable pay config for payment days
    config = await db.variable_pay_config.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    if not config:
        config = {
            "overtime_payment_type": "separate",
            "overtime_payment_day": 5,
            "commission_payment_type": "separate", 
            "commission_payment_day": 10,
            "bonus_payment_type": "separate",
            "bonus_payment_day": 5,
            "incentive_payment_type": "separate",
            "incentive_payment_day": 5
        }
    
    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year
    
    # Get pending overtime (approved but not processed)
    pending_overtime = await db.overtime_requests.find(
        {"company_id": company_id, "status": "approved"},
        {"_id": 0, "estimated_amount": 1}
    ).to_list(500)
    overtime_total = sum(ot.get("estimated_amount", 0) for ot in pending_overtime)
    
    # Get employees with commissions for potential commission calculation
    employees_with_commission = await db.employees.find(
        {"company_id": company_id, "status": "active", "commission_rate": {"$gt": 0}},
        {"_id": 0, "employee_id": 1, "full_name": 1, "commission_rate": 1}
    ).to_list(100)
    
    # Get draft variable pay runs
    draft_runs = await db.variable_pay_runs.find(
        {"company_id": company_id, "status": {"$in": ["draft", "pending_approval", "approved"]}},
        {"_id": 0, "run_id": 1, "run_name": 1, "pay_type": 1, "total_net": 1, "status": 1, "payment_date": 1}
    ).to_list(20)
    
    summary = {
        "overtime": {
            "pending_count": len(pending_overtime),
            "pending_amount": round(overtime_total, 2),
            "payment_day": config.get("overtime_payment_day", 5),
            "payment_type": config.get("overtime_payment_type", "separate")
        },
        "commission": {
            "employees_eligible": len(employees_with_commission),
            "payment_day": config.get("commission_payment_day", 10),
            "payment_type": config.get("commission_payment_type", "separate")
        },
        "bonus": {
            "payment_day": config.get("bonus_payment_day", 5),
            "payment_type": config.get("bonus_payment_type", "separate")
        },
        "incentive": {
            "payment_day": config.get("incentive_payment_day", 5),
            "payment_type": config.get("incentive_payment_type", "separate")
        },
        "pending_runs": draft_runs,
        "current_month": current_month,
        "current_year": current_year
    }
    
    return summary


# ==================== EMPLOYEE PAYMENT HISTORY ====================

@settings_router.get("/employee-payment-history/{employee_id}")
async def get_employee_payment_history(
    employee_id: str,
    year: Optional[int] = None,
    pay_type: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get complete payment history for an employee"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    if not year:
        year = datetime.now().year
    
    history = []
    totals = {
        "payroll": 0,
        "overtime": 0,
        "commission": 0,
        "bonus": 0,
        "incentive": 0,
        "benefits_in_kind": 0,
        "total_gross": 0,
        "total_net": 0
    }
    
    # 1. Get payroll entries
    if not pay_type or pay_type == "payroll":
        payroll_entries = await db.payroll_entries.find(
            {"company_id": company_id, "employee_id": employee_id},
            {"_id": 0}
        ).to_list(100)
        
        for entry in payroll_entries:
            # Get period info
            period = await db.payroll_periods.find_one(
                {"period_id": entry.get("period_id")},
                {"_id": 0, "period_name": 1, "payment_date": 1, "status": 1}
            )
            if period and period.get("status") == "completed":
                payment_date = period.get("payment_date", "")
                if payment_date and str(year) in str(payment_date):
                    history.append({
                        "type": "payroll",
                        "type_label": "Nómina",
                        "date": payment_date,
                        "description": period.get("period_name"),
                        "gross": entry.get("gross_salary", 0),
                        "deductions": entry.get("total_deductions", 0),
                        "net": entry.get("net_salary", 0),
                        "reference_id": entry.get("period_id")
                    })
                    totals["payroll"] += entry.get("net_salary", 0)
                    totals["total_gross"] += entry.get("gross_salary", 0)
                    totals["total_net"] += entry.get("net_salary", 0)
    
    # 2. Get variable pay entries (overtime, commission, bonus, incentive)
    vp_query = {"company_id": company_id, "employee_id": employee_id}
    if pay_type and pay_type != "payroll":
        vp_query["pay_type"] = pay_type
    
    vp_entries = await db.variable_pay_entries.find(
        vp_query,
        {"_id": 0}
    ).to_list(200)
    
    for entry in vp_entries:
        # Get run info to check if completed
        run = await db.variable_pay_runs.find_one(
            {"run_id": entry.get("run_id")},
            {"_id": 0, "run_name": 1, "payment_date": 1, "status": 1}
        )
        if run and run.get("status") == "completed":
            payment_date = run.get("payment_date", "")
            if payment_date and str(year) in str(payment_date):
                pay_type_entry = entry.get("pay_type", "other")
                type_labels = {
                    "overtime": "Horas Extras",
                    "commission": "Comisión",
                    "bonus": "Bono",
                    "incentive": "Incentivo"
                }
                history.append({
                    "type": pay_type_entry,
                    "type_label": type_labels.get(pay_type_entry, pay_type_entry),
                    "date": payment_date,
                    "description": run.get("run_name"),
                    "gross": entry.get("gross_amount", 0),
                    "deductions": entry.get("total_deductions", 0),
                    "net": entry.get("net_amount", 0),
                    "reference_id": entry.get("run_id"),
                    "details": {
                        "overtime_hours": (entry.get("overtime_hours_35", 0) or 0) + (entry.get("overtime_hours_100", 0) or 0),
                        "commission_sales": entry.get("total_sales"),
                        "commission_rate": entry.get("commission_rate"),
                        "pool_percentage": entry.get("pool_percentage")
                    }
                })
                totals[pay_type_entry] = totals.get(pay_type_entry, 0) + entry.get("net_amount", 0)
                totals["total_gross"] += entry.get("gross_amount", 0)
                totals["total_net"] += entry.get("net_amount", 0)
    
    # 3. Get benefits in kind (meals, etc.)
    if not pay_type or pay_type == "benefits_in_kind":
        benefits = await db.employee_benefits_log.find(
            {"company_id": company_id, "employee_id": employee_id},
            {"_id": 0}
        ).to_list(500)
        
        for benefit in benefits:
            benefit_date = benefit.get("date", "")
            if benefit_date and str(year) in str(benefit_date):
                history.append({
                    "type": "benefits_in_kind",
                    "type_label": "Beneficio en Especie",
                    "date": benefit_date,
                    "description": benefit.get("description", "Almuerzo/Beneficio"),
                    "gross": benefit.get("value", 0),
                    "deductions": 0,
                    "net": benefit.get("value", 0),
                    "reference_id": benefit.get("benefit_log_id"),
                    "details": {
                        "benefit_type": benefit.get("benefit_type"),
                        "cost_center_id": benefit.get("cost_center_id")
                    }
                })
                totals["benefits_in_kind"] += benefit.get("value", 0)
    
    # Sort by date descending
    history.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    return {
        "employee_id": employee_id,
        "year": year,
        "history": history,
        "totals": totals
    }


# ==================== BENEFITS IN KIND (MEALS, ETC.) ====================

@settings_router.post("/benefits-in-kind")
async def record_benefit_in_kind(data: dict, user: User = Depends(get_current_user)):
    """Record a benefit in kind (meal, transport, etc.) for an employee"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    benefit_log_id = f"bik_{uuid.uuid4().hex[:12]}"
    
    benefit_doc = {
        "benefit_log_id": benefit_log_id,
        "company_id": company_id,
        "employee_id": data.get("employee_id"),
        "employee_name": data.get("employee_name"),
        "benefit_type": data.get("benefit_type", "meal"),  # meal, transport, other
        "description": data.get("description", ""),
        "value": data.get("value", 0),
        "date": data.get("date", now.strftime("%Y-%m-%d")),
        "cost_center_id": data.get("cost_center_id"),
        "cost_center_name": data.get("cost_center_name"),
        "notes": data.get("notes"),
        "created_at": now,
        "created_by": user.user_id
    }
    
    await db.employee_benefits_log.insert_one(benefit_doc)
    
    # Also create an expense entry for the cost center if provided
    if data.get("cost_center_id"):
        expense_id = f"exp_{uuid.uuid4().hex[:12]}"
        expense_doc = {
            "expense_id": expense_id,
            "company_id": company_id,
            "cost_center_id": data.get("cost_center_id"),
            "description": f"Beneficio empleado: {data.get('employee_name')} - {data.get('description', benefit_doc['benefit_type'])}",
            "amount": data.get("value", 0),
            "date": data.get("date", now.strftime("%Y-%m-%d")),
            "category": "employee_benefit",
            "employee_id": data.get("employee_id"),
            "benefit_log_id": benefit_log_id,
            "created_at": now,
            "created_by": user.user_id
        }
        await db.cost_center_expenses.insert_one(expense_doc)
    
    return {"message": "Benefit recorded", "benefit_log_id": benefit_log_id}


@settings_router.post("/benefits-in-kind/bulk")
async def record_bulk_benefits(data: dict, user: User = Depends(get_current_user)):
    """Record benefits in kind for multiple employees at once (e.g., daily meals)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    employee_ids = data.get("employee_ids", [])
    benefit_type = data.get("benefit_type", "meal")
    value_per_employee = data.get("value_per_employee", 0)
    date = data.get("date", now.strftime("%Y-%m-%d"))
    cost_center_id = data.get("cost_center_id")
    cost_center_name = data.get("cost_center_name")
    description = data.get("description", "")
    
    if not employee_ids:
        raise HTTPException(status_code=400, detail="No employees provided")
    
    # Get employee names
    employees = await db.employees.find(
        {"employee_id": {"$in": employee_ids}, "company_id": company_id},
        {"_id": 0, "employee_id": 1, "full_name": 1}
    ).to_list(len(employee_ids))
    
    emp_names = {e["employee_id"]: e["full_name"] for e in employees}
    
    benefit_docs = []
    total_value = 0
    
    for emp_id in employee_ids:
        benefit_log_id = f"bik_{uuid.uuid4().hex[:12]}"
        benefit_doc = {
            "benefit_log_id": benefit_log_id,
            "company_id": company_id,
            "employee_id": emp_id,
            "employee_name": emp_names.get(emp_id, emp_id),
            "benefit_type": benefit_type,
            "description": description,
            "value": value_per_employee,
            "date": date,
            "cost_center_id": cost_center_id,
            "cost_center_name": cost_center_name,
            "notes": None,
            "created_at": now,
            "created_by": user.user_id
        }
        benefit_docs.append(benefit_doc)
        total_value += value_per_employee
    
    if benefit_docs:
        await db.employee_benefits_log.insert_many(benefit_docs)
    
    # Create single expense entry for the cost center
    if cost_center_id and total_value > 0:
        expense_id = f"exp_{uuid.uuid4().hex[:12]}"
        expense_doc = {
            "expense_id": expense_id,
            "company_id": company_id,
            "cost_center_id": cost_center_id,
            "description": f"{description or benefit_type} - {len(employee_ids)} empleados",
            "amount": total_value,
            "date": date,
            "category": "employee_benefit",
            "employee_count": len(employee_ids),
            "created_at": now,
            "created_by": user.user_id
        }
        await db.cost_center_expenses.insert_one(expense_doc)
    
    return {
        "message": f"Benefits recorded for {len(employee_ids)} employees",
        "total_value": total_value,
        "employee_count": len(employee_ids)
    }


@settings_router.get("/benefits-in-kind")
async def get_benefits_log(
    employee_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    benefit_type: Optional[str] = None,
    limit: int = 100,
    user: User = Depends(get_current_user)
):
    """Get benefits in kind log"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    query = {"company_id": company_id}
    if employee_id:
        query["employee_id"] = employee_id
    if benefit_type:
        query["benefit_type"] = benefit_type
    if date_from and date_to:
        query["date"] = {"$gte": date_from, "$lte": date_to}
    elif date_from:
        query["date"] = {"$gte": date_from}
    elif date_to:
        query["date"] = {"$lte": date_to}
    
    benefits = await db.employee_benefits_log.find(
        query,
        {"_id": 0}
    ).sort("date", -1).to_list(limit)
    
    return benefits


# ==================== VARIABLE PAY RUNS ====================

@settings_router.get("/variable-pay-runs")
async def get_variable_pay_runs(
    status: Optional[str] = None,
    pay_type: Optional[str] = None,
    limit: int = 20,
    user: User = Depends(get_current_user)
):
    """Get all variable pay runs for the organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if pay_type:
        query["pay_type"] = pay_type
    
    runs = await db.variable_pay_runs.find(
        query,
        {"_id": 0}
    ).sort("payment_date", -1).to_list(limit)
    
    return runs


@settings_router.post("/variable-pay-runs")
async def create_variable_pay_run(data: dict, user: User = Depends(get_current_user)):
    """
    Create a new variable pay run and generate entries for employees with approved items.
    
    pay_type: "overtime" | "commission" | "bonus" | "incentive" | "mixed"
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    run_id = f"vpr_{uuid.uuid4().hex[:12]}"
    pay_type = data.get("pay_type", "mixed")
    
    # Get payroll config for rates
    payroll_config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0})
    if not payroll_config:
        payroll_config = {
            "afp_employee_rate": 2.87,
            "ars_employee_rate": 3.04,
            "isr_enabled": True,
            "overtime_rate_35": 1.35,
            "overtime_rate_100": 2.0
        }
    
    # Create the run
    run_doc = {
        "run_id": run_id,
        "company_id": company_id,
        "run_name": data.get("run_name", f"Variable Pay - {now.strftime('%B %Y')}"),
        "pay_type": pay_type,
        "period_start": data.get("period_start"),
        "period_end": data.get("period_end"),
        "payment_date": data.get("payment_date"),
        "status": "draft",
        "total_employees": 0,
        "total_gross": 0.0,
        "total_deductions": 0.0,
        "total_net": 0.0,
        "notes": data.get("notes"),
        "approved_by": None,
        "approved_at": None,
        "processed_at": None,
        "created_at": now,
        "created_by": user.user_id
    }
    
    await db.variable_pay_runs.insert_one(run_doc)
    del run_doc["_id"]
    
    # Generate entries based on approved overtime/commissions/etc.
    entries = []
    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0
    
    if pay_type in ["overtime", "mixed"]:
        # Get approved overtime requests in the period
        overtime_query = {
            "company_id": company_id,
            "status": "approved"
        }
        if data.get("period_start") and data.get("period_end"):
            overtime_query["date"] = {
                "$gte": data.get("period_start"),
                "$lte": data.get("period_end")
            }
        
        approved_overtime = await db.overtime_requests.find(
            overtime_query,
            {"_id": 0}
        ).to_list(500)
        
        # Aggregate overtime by employee
        overtime_by_emp = {}
        for ot in approved_overtime:
            emp_id = ot.get("employee_id")
            if emp_id not in overtime_by_emp:
                overtime_by_emp[emp_id] = {
                    "employee_name": ot.get("employee_name"),
                    "hours_35": 0,
                    "hours_100": 0,
                    "amount": 0,
                    "overtime_ids": []
                }
            overtime_by_emp[emp_id]["hours_35"] += ot.get("hours_35", 0)
            overtime_by_emp[emp_id]["hours_100"] += ot.get("hours_100", 0)
            overtime_by_emp[emp_id]["amount"] += ot.get("estimated_amount", 0)
            overtime_by_emp[emp_id]["overtime_ids"].append(ot.get("overtime_id"))
        
        # Create entries for each employee with overtime
        for emp_id, ot_data in overtime_by_emp.items():
            employee = await db.employees.find_one(
                {"employee_id": emp_id},
                {"_id": 0, "full_name": 1, "employee_number": 1, "department": 1, 
                 "bank_name": 1, "bank_account": 1}
            )
            if not employee:
                continue
            
            gross = ot_data["amount"]
            
            # Calculate deductions
            afp = gross * (payroll_config.get("afp_employee_rate", 2.87) / 100)
            ars = gross * (payroll_config.get("ars_employee_rate", 3.04) / 100)
            # ISR on gross (simplified - should be based on annual projection)
            isr = 0
            if payroll_config.get("isr_enabled", True) and gross > 0:
                monthly_equiv = gross
                annual_equiv = monthly_equiv * 12
                if annual_equiv > 416220:
                    isr = gross * 0.15  # Simplified
            
            total_ded = afp + ars + isr
            net = gross - total_ded
            
            entry_id = f"vpe_{uuid.uuid4().hex[:12]}"
            entry = {
                "entry_id": entry_id,
                "run_id": run_id,
                "company_id": company_id,
                "employee_id": emp_id,
                "employee_name": employee.get("full_name") or ot_data["employee_name"],
                "employee_number": employee.get("employee_number"),
                "department": employee.get("department"),
                "pay_type": "overtime",
                
                # Overtime details
                "overtime_hours_35": ot_data["hours_35"],
                "overtime_hours_100": ot_data["hours_100"],
                "overtime_amount": round(ot_data["amount"], 2),
                "overtime_ids": ot_data["overtime_ids"],
                
                # Commission/Bonus/Incentive (none for overtime-only)
                "commission_amount": 0,
                "bonus_amount": 0,
                "incentive_amount": 0,
                
                # Totals
                "gross_amount": round(gross, 2),
                "afp_employee": round(afp, 2),
                "ars_employee": round(ars, 2),
                "isr": round(isr, 2),
                "total_deductions": round(total_ded, 2),
                "net_amount": round(net, 2),
                
                # Bank info
                "bank_name": employee.get("bank_name"),
                "bank_account": employee.get("bank_account"),
                
                "notes": None,
                "created_at": now
            }
            
            await db.variable_pay_entries.insert_one(entry)
            entries.append(entry)
            
            total_gross += gross
            total_deductions += total_ded
            total_net += net
    
    # ==================== COMMISSION CALCULATION ====================
    if pay_type in ["commission"]:
        # Get item types to check commissionability
        item_types = await db.item_types.find(
            {"company_id": company_id},
            {"_id": 0, "name": 1, "is_commissionable": 1}
        ).to_list(100)
        commissionable_types = {it.get("name") for it in item_types if it.get("is_commissionable", True)}
        
        # Get employees with commission rates
        employees_with_commission = await db.employees.find(
            {
                "company_id": company_id,
                "status": "active",
                "commission_rate": {"$gt": 0}
            },
            {"_id": 0}
        ).to_list(500)
        
        # Build user_id to employee_id mapping
        user_to_emp = {}
        for emp in employees_with_commission:
            if emp.get("user_id"):
                user_to_emp[emp["user_id"]] = emp
        
        # Get events closed in period assigned to employees
        events_query = {
            "company_id": company_id,
            "stage": {"$in": ["Committed", "Won", "Closed"]}
        }
        if data.get("period_start") and data.get("period_end"):
            events_query["updated_at"] = {
                "$gte": data.get("period_start"),
                "$lte": data.get("period_end") + "T23:59:59"
            }
        
        closed_events = await db.events.find(events_query, {"_id": 0}).to_list(500)
        
        # Calculate commissions by employee
        commissions_by_emp = {}
        for event in closed_events:
            assigned_to = event.get("assigned_to")
            if not assigned_to or assigned_to not in user_to_emp:
                continue
            
            emp = user_to_emp[assigned_to]
            emp_id = emp.get("employee_id")
            
            # Get proposal/invoice total for this event (commissionable items only)
            proposals = await db.proposals.find(
                {"company_id": company_id, "event_id": event.get("event_id"), "status": "accepted"},
                {"_id": 0, "items": 1, "grand_total": 1}
            ).to_list(10)
            
            event_total = 0
            for prop in proposals:
                for item in prop.get("items", []):
                    item_type = item.get("item_type", "Service")
                    # Only count commissionable items
                    if item_type in commissionable_types or not item_types:
                        event_total += item.get("total", 0) or (item.get("quantity", 1) * item.get("unit_price", 0))
            
            # If no proposals, use event budget
            if event_total == 0:
                event_total = event.get("budget", 0) or 0
            
            if event_total > 0:
                commission_rate = emp.get("commission_rate", 0)
                commission_amount = event_total * (commission_rate / 100)
                
                if emp_id not in commissions_by_emp:
                    commissions_by_emp[emp_id] = {
                        "employee": emp,
                        "total_sales": 0,
                        "commission_amount": 0,
                        "events": []
                    }
                
                commissions_by_emp[emp_id]["total_sales"] += event_total
                commissions_by_emp[emp_id]["commission_amount"] += commission_amount
                commissions_by_emp[emp_id]["events"].append({
                    "event_id": event.get("event_id"),
                    "event_name": event.get("name"),
                    "amount": event_total
                })
        
        # Create entries for commission recipients
        for emp_id, comm_data in commissions_by_emp.items():
            emp = comm_data["employee"]
            gross = comm_data["commission_amount"]
            
            if gross <= 0:
                continue
            
            # Calculate deductions
            afp = gross * (payroll_config.get("afp_employee_rate", 2.87) / 100)
            ars = gross * (payroll_config.get("ars_employee_rate", 3.04) / 100)
            isr = 0
            if payroll_config.get("isr_enabled", True) and gross > 0:
                annual_equiv = gross * 12
                if annual_equiv > 416220:
                    isr = gross * 0.15
            
            total_ded = afp + ars + isr
            net = gross - total_ded
            
            entry_id = f"vpe_{uuid.uuid4().hex[:12]}"
            entry = {
                "entry_id": entry_id,
                "run_id": run_id,
                "company_id": company_id,
                "employee_id": emp_id,
                "employee_name": emp.get("full_name"),
                "employee_number": emp.get("employee_number"),
                "department": emp.get("department"),
                "pay_type": "commission",
                
                # Commission details
                "commission_rate": emp.get("commission_rate", 0),
                "total_sales": round(comm_data["total_sales"], 2),
                "commission_amount": round(gross, 2),
                "commission_events": comm_data["events"],
                
                # Other types (none for commission-only)
                "overtime_amount": 0,
                "bonus_amount": 0,
                "incentive_amount": 0,
                
                # Totals
                "gross_amount": round(gross, 2),
                "afp_employee": round(afp, 2),
                "ars_employee": round(ars, 2),
                "isr": round(isr, 2),
                "total_deductions": round(total_ded, 2),
                "net_amount": round(net, 2),
                
                # Bank info
                "bank_name": emp.get("bank_name"),
                "bank_account": emp.get("bank_account"),
                
                "notes": None,
                "created_at": now
            }
            
            await db.variable_pay_entries.insert_one(entry)
            entries.append(entry)
            
            total_gross += gross
            total_deductions += total_ded
            total_net += net
    
    # ==================== BONUS/INCENTIVE (Manual entries - pool or fixed) ====================
    if pay_type in ["bonus", "incentive"]:
        # For bonus/incentive, we create empty entries and admin adds amounts manually
        # OR we can use a pool distribution based on employee percentages
        pool_amount = data.get("pool_amount", 0)
        manual_entries = data.get("manual_entries", [])  # List of {employee_id, amount}
        
        if pool_amount > 0:
            # Distribute pool based on incentive_pool_percentage
            employees_with_pool = await db.employees.find(
                {
                    "company_id": company_id,
                    "status": "active",
                    "incentive_pool_percentage": {"$gt": 0}
                },
                {"_id": 0}
            ).to_list(500)
            
            total_percentage = sum(e.get("incentive_pool_percentage", 0) for e in employees_with_pool)
            
            for emp in employees_with_pool:
                pct = emp.get("incentive_pool_percentage", 0)
                if pct <= 0 or total_percentage <= 0:
                    continue
                
                # Distribute proportionally
                gross = (pct / total_percentage) * pool_amount
                
                afp = gross * (payroll_config.get("afp_employee_rate", 2.87) / 100)
                ars = gross * (payroll_config.get("ars_employee_rate", 3.04) / 100)
                isr = 0
                if payroll_config.get("isr_enabled", True) and gross > 0:
                    annual_equiv = gross * 12
                    if annual_equiv > 416220:
                        isr = gross * 0.15
                
                total_ded = afp + ars + isr
                net = gross - total_ded
                
                entry_id = f"vpe_{uuid.uuid4().hex[:12]}"
                entry = {
                    "entry_id": entry_id,
                    "run_id": run_id,
                    "company_id": company_id,
                    "employee_id": emp.get("employee_id"),
                    "employee_name": emp.get("full_name"),
                    "employee_number": emp.get("employee_number"),
                    "department": emp.get("department"),
                    "pay_type": pay_type,
                    
                    # Pool distribution
                    "pool_percentage": pct,
                    "pool_amount": pool_amount,
                    "incentive_amount": round(gross, 2) if pay_type == "incentive" else 0,
                    "bonus_amount": round(gross, 2) if pay_type == "bonus" else 0,
                    
                    # Other types
                    "overtime_amount": 0,
                    "commission_amount": 0,
                    
                    # Totals
                    "gross_amount": round(gross, 2),
                    "afp_employee": round(afp, 2),
                    "ars_employee": round(ars, 2),
                    "isr": round(isr, 2),
                    "total_deductions": round(total_ded, 2),
                    "net_amount": round(net, 2),
                    
                    # Bank info
                    "bank_name": emp.get("bank_name"),
                    "bank_account": emp.get("bank_account"),
                    
                    "notes": None,
                    "created_at": now
                }
                
                await db.variable_pay_entries.insert_one(entry)
                entries.append(entry)
                
                total_gross += gross
                total_deductions += total_ded
                total_net += net
        
        elif manual_entries:
            # Manual entries - fixed amounts per employee
            for me in manual_entries:
                emp_id = me.get("employee_id")
                gross = me.get("amount", 0)
                
                if not emp_id or gross <= 0:
                    continue
                
                emp = await db.employees.find_one(
                    {"employee_id": emp_id, "company_id": company_id},
                    {"_id": 0}
                )
                if not emp:
                    continue
                
                afp = gross * (payroll_config.get("afp_employee_rate", 2.87) / 100)
                ars = gross * (payroll_config.get("ars_employee_rate", 3.04) / 100)
                isr = 0
                if payroll_config.get("isr_enabled", True) and gross > 0:
                    annual_equiv = gross * 12
                    if annual_equiv > 416220:
                        isr = gross * 0.15
                
                total_ded = afp + ars + isr
                net = gross - total_ded
                
                entry_id = f"vpe_{uuid.uuid4().hex[:12]}"
                entry = {
                    "entry_id": entry_id,
                    "run_id": run_id,
                    "company_id": company_id,
                    "employee_id": emp_id,
                    "employee_name": emp.get("full_name"),
                    "employee_number": emp.get("employee_number"),
                    "department": emp.get("department"),
                    "pay_type": pay_type,
                    
                    # Fixed amount
                    "incentive_amount": round(gross, 2) if pay_type == "incentive" else 0,
                    "bonus_amount": round(gross, 2) if pay_type == "bonus" else 0,
                    
                    # Other types
                    "overtime_amount": 0,
                    "commission_amount": 0,
                    
                    # Totals
                    "gross_amount": round(gross, 2),
                    "afp_employee": round(afp, 2),
                    "ars_employee": round(ars, 2),
                    "isr": round(isr, 2),
                    "total_deductions": round(total_ded, 2),
                    "net_amount": round(net, 2),
                    
                    # Bank info
                    "bank_name": emp.get("bank_name"),
                    "bank_account": emp.get("bank_account"),
                    
                    "notes": me.get("notes"),
                    "created_at": now
                }
                
                await db.variable_pay_entries.insert_one(entry)
                entries.append(entry)
                
                total_gross += gross
                total_deductions += total_ded
                total_net += net
    
    # Update run totals
    await db.variable_pay_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "total_employees": len(entries),
            "total_gross": round(total_gross, 2),
            "total_deductions": round(total_deductions, 2),
            "total_net": round(total_net, 2)
        }}
    )
    
    run_doc["total_employees"] = len(entries)
    run_doc["total_gross"] = round(total_gross, 2)
    run_doc["total_deductions"] = round(total_deductions, 2)
    run_doc["total_net"] = round(total_net, 2)
    
    return {"run": run_doc, "entries_created": len(entries)}


@settings_router.get("/variable-pay-runs/{run_id}")
async def get_variable_pay_run(run_id: str, user: User = Depends(get_current_user)):
    """Get a specific variable pay run with all entries"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not run:
        raise HTTPException(status_code=404, detail="Variable pay run not found")
    
    # Get all entries
    entries = await db.variable_pay_entries.find(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    ).sort("employee_name", 1).to_list(500)
    
    return {"run": run, "entries": entries}


@settings_router.put("/variable-pay-entries/{entry_id}")
async def update_variable_pay_entry(
    entry_id: str, 
    data: dict, 
    user: User = Depends(get_current_user)
):
    """Update a variable pay entry (add commission, bonus, incentive manually)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    entry = await db.variable_pay_entries.find_one(
        {"entry_id": entry_id, "company_id": company_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Check if run is still editable
    run = await db.variable_pay_runs.find_one(
        {"run_id": entry.get("run_id")},
        {"_id": 0, "status": 1}
    )
    if run and run.get("status") not in ["draft", "pending_approval"]:
        raise HTTPException(status_code=400, detail="Cannot edit entries for processed runs")
    
    # Get payroll config for deduction rates
    payroll_config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0})
    if not payroll_config:
        payroll_config = {"afp_employee_rate": 2.87, "ars_employee_rate": 3.04, "isr_enabled": True}
    
    now = datetime.now(timezone.utc)
    
    update_data = {}
    
    if "commission_amount" in data:
        update_data["commission_amount"] = data["commission_amount"]
    if "bonus_amount" in data:
        update_data["bonus_amount"] = data["bonus_amount"]
    if "incentive_amount" in data:
        update_data["incentive_amount"] = data["incentive_amount"]
    if "notes" in data:
        update_data["notes"] = data["notes"]
    
    # Recalculate totals
    overtime = entry.get("overtime_amount", 0)
    commission = update_data.get("commission_amount", entry.get("commission_amount", 0))
    bonus = update_data.get("bonus_amount", entry.get("bonus_amount", 0))
    incentive = update_data.get("incentive_amount", entry.get("incentive_amount", 0))
    
    gross = overtime + commission + bonus + incentive
    
    afp = gross * (payroll_config.get("afp_employee_rate", 2.87) / 100)
    ars = gross * (payroll_config.get("ars_employee_rate", 3.04) / 100)
    isr = 0
    if payroll_config.get("isr_enabled", True) and gross > 0:
        annual_equiv = gross * 12
        if annual_equiv > 416220:
            isr = gross * 0.15
    
    total_ded = afp + ars + isr
    net = gross - total_ded
    
    update_data["gross_amount"] = round(gross, 2)
    update_data["afp_employee"] = round(afp, 2)
    update_data["ars_employee"] = round(ars, 2)
    update_data["isr"] = round(isr, 2)
    update_data["total_deductions"] = round(total_ded, 2)
    update_data["net_amount"] = round(net, 2)
    update_data["updated_at"] = now
    
    await db.variable_pay_entries.update_one(
        {"entry_id": entry_id},
        {"$set": update_data}
    )
    
    # Recalculate run totals
    await recalculate_variable_pay_run_totals(entry.get("run_id"))
    
    return {"message": "Entry updated", "net_amount": round(net, 2)}


async def recalculate_variable_pay_run_totals(run_id: str):
    """Recalculate totals for a variable pay run"""
    entries = await db.variable_pay_entries.find(
        {"run_id": run_id},
        {"_id": 0, "gross_amount": 1, "total_deductions": 1, "net_amount": 1}
    ).to_list(500)
    
    total_gross = sum(e.get("gross_amount", 0) for e in entries)
    total_deductions = sum(e.get("total_deductions", 0) for e in entries)
    total_net = sum(e.get("net_amount", 0) for e in entries)
    
    await db.variable_pay_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "total_employees": len(entries),
            "total_gross": round(total_gross, 2),
            "total_deductions": round(total_deductions, 2),
            "total_net": round(total_net, 2),
            "updated_at": datetime.now(timezone.utc)
        }}
    )


@settings_router.post("/variable-pay-runs/{run_id}/submit")
async def submit_variable_pay_run(run_id: str, user: User = Depends(get_current_user)):
    """Submit variable pay run for approval"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft runs can be submitted")
    
    await db.variable_pay_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "status": "pending_approval",
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Variable pay run submitted for approval"}


@settings_router.post("/variable-pay-runs/{run_id}/approve")
async def approve_variable_pay_run(run_id: str, user: User = Depends(get_current_user)):
    """Approve variable pay run (admin only)"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check user role
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can approve variable pay runs")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Only pending runs can be approved")
    
    now = datetime.now(timezone.utc)
    await db.variable_pay_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_at": now,
            "updated_at": now
        }}
    )
    
    return {"message": "Variable pay run approved"}


@settings_router.post("/variable-pay-runs/{run_id}/process")
async def process_variable_pay_run(run_id: str, user: User = Depends(get_current_user)):
    """Process/complete variable pay run"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check user role
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can process variable pay runs")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved runs can be processed")
    
    now = datetime.now(timezone.utc)
    
    # Mark all included overtime requests as processed
    entries = await db.variable_pay_entries.find(
        {"run_id": run_id},
        {"_id": 0, "overtime_ids": 1}
    ).to_list(500)
    
    all_overtime_ids = []
    for entry in entries:
        ot_ids = entry.get("overtime_ids", [])
        if ot_ids:
            all_overtime_ids.extend(ot_ids)
    
    if all_overtime_ids:
        await db.overtime_requests.update_many(
            {"overtime_id": {"$in": all_overtime_ids}},
            {"$set": {
                "status": "processed",
                "payroll_period_id": run_id,
                "processed_at": now
            }}
        )
    
    await db.variable_pay_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "status": "completed",
            "processed_at": now,
            "updated_at": now
        }}
    )
    
    return {"message": "Variable pay run processed", "overtime_marked_processed": len(all_overtime_ids)}


@settings_router.post("/variable-pay-runs/{run_id}/revert")
async def revert_variable_pay_run(run_id: str, user: User = Depends(get_current_user)):
    """Revert variable pay run back to draft"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Cannot revert completed runs")
    
    await db.variable_pay_runs.update_one(
        {"run_id": run_id},
        {"$set": {
            "status": "draft",
            "approved_by": None,
            "approved_at": None,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Variable pay run reverted to draft"}


@settings_router.delete("/variable-pay-runs/{run_id}")
async def delete_variable_pay_run(run_id: str, user: User = Depends(get_current_user)):
    """Delete a draft variable pay run"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.get("status") not in ["draft"]:
        raise HTTPException(status_code=400, detail="Only draft runs can be deleted")
    
    # Delete entries first
    await db.variable_pay_entries.delete_many({"run_id": run_id})
    
    # Delete run
    await db.variable_pay_runs.delete_one({"run_id": run_id})
    
    return {"message": "Variable pay run deleted"}


@settings_router.get("/variable-pay-runs/{run_id}/bank-file")
async def get_variable_pay_bank_file(run_id: str, user: User = Depends(get_current_user)):
    """Generate bank file (CSV) for variable pay run"""
    from fastapi.responses import StreamingResponse
    import io
    import csv
    
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    run = await db.variable_pay_runs.find_one(
        {"run_id": run_id, "company_id": company_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    entries = await db.variable_pay_entries.find(
        {"run_id": run_id, "company_id": company_id, "net_amount": {"$gt": 0}},
        {"_id": 0}
    ).sort("employee_name", 1).to_list(500)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Employee Number",
        "Employee Name",
        "Bank Name",
        "Bank Account",
        "Net Amount",
        "Pay Type",
        "Reference"
    ])
    
    # Data rows
    for entry in entries:
        writer.writerow([
            entry.get("employee_number", ""),
            entry.get("employee_name", ""),
            entry.get("bank_name", ""),
            entry.get("bank_account", ""),
            entry.get("net_amount", 0),
            entry.get("pay_type", ""),
            f"{run.get('run_name', run_id)}"
        ])
    
    output.seek(0)
    
    filename = f"variable_pay_{run_id}_{run.get('pay_type', 'mixed')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

