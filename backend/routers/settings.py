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
