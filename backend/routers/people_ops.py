# routers/people_ops.py - People Operations / RRHH Routes
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import csv
import io

from config import db
from models.auth import User
from models.people_ops import (
    CostCenterCreate, CostCenter, CostCenterUpdate,
    EmployeeCreate, Employee, EmployeeUpdate,
    SalaryChangeCreate, SalaryChange,
    EmployeeDocumentCreate, EmployeeDocument,
    PayrollConfigCreate, PayrollConfig,
    PayrollPeriodCreate, PayrollPeriod, PayrollStatus,
    PayrollEntryCreate, PayrollEntry, PayrollEntryUpdate,
    PaymentFrequency,
    calculate_monthly_isr,
    COST_CENTER_TEMPLATES, AFP_PROVIDERS, ARS_PROVIDERS, BANKS_RD
)
from routers.auth import get_current_user

people_ops_router = APIRouter(prefix="/people-ops", tags=["People Ops"])


# ==================== PERMISSION HELPERS ====================

async def check_people_ops_access(user: User, required_level: str = "view"):
    """
    Check if user has access to People Ops module.
    Levels: view, edit, admin, payroll_approve
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Owner and admin always have full access
    if user.role in ["owner", "admin"]:
        return company_id, "admin"
    
    # Check if user has HR role or specific permissions
    if user.role == "hr":
        if required_level == "payroll_approve":
            raise HTTPException(status_code=403, detail="Only owner/admin can approve payroll")
        return company_id, "hr"
    
    # Managers can view their team
    if user.role == "manager":
        if required_level in ["view"]:
            return company_id, "manager"
        raise HTTPException(status_code=403, detail="Managers have limited access to People Ops")
    
    # Regular employees can only access self-service
    raise HTTPException(status_code=403, detail="Access denied to People Ops")


async def get_employee_self_service(user: User):
    """Get employee record for self-service portal"""
    company_id = user.company_id or user.active_org_id
    
    # Find employee by user_id
    employee = await db.employees.find_one({
        "company_id": company_id,
        "user_id": user.user_id
    }, {"_id": 0})
    
    return company_id, employee


# ==================== COST CENTERS ====================

@people_ops_router.get("/cost-centers")
async def get_cost_centers(user: User = Depends(get_current_user)):
    """Get all cost centers for the organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    cost_centers = await db.cost_centers.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    return cost_centers


@people_ops_router.get("/cost-centers/templates")
async def get_cost_center_templates(user: User = Depends(get_current_user)):
    """Get predefined cost center templates"""
    return COST_CENTER_TEMPLATES


@people_ops_router.post("/cost-centers")
async def create_cost_center(
    data: CostCenterCreate,
    user: User = Depends(get_current_user)
):
    """Create a new cost center"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check for duplicates
    existing = await db.cost_centers.find_one({
        "company_id": company_id,
        "name": data.name
    })
    if existing:
        raise HTTPException(status_code=400, detail="Cost center with this name already exists")
    
    now = datetime.now(timezone.utc)
    cost_center_id = f"cc_{uuid.uuid4().hex[:12]}"
    
    # Get responsible user name if provided
    responsible_name = None
    if data.responsible_user_id:
        resp_user = await db.users.find_one(
            {"user_id": data.responsible_user_id},
            {"_id": 0, "name": 1}
        )
        responsible_name = resp_user.get("name") if resp_user else None
    
    doc = {
        "cost_center_id": cost_center_id,
        "company_id": company_id,
        "name": data.name,
        "code": data.code,
        "description": data.description,
        "annual_budget": data.annual_budget,
        "current_spend": 0.0,
        "responsible_user_id": data.responsible_user_id,
        "responsible_name": responsible_name,
        "is_active": data.is_active,
        "is_system": data.is_system,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.cost_centers.insert_one(doc)
    del doc["_id"]
    
    return doc


@people_ops_router.post("/cost-centers/initialize-templates")
async def initialize_cost_center_templates(user: User = Depends(get_current_user)):
    """Initialize predefined cost center templates for the organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    created = []
    
    for template in COST_CENTER_TEMPLATES:
        # Check if already exists
        existing = await db.cost_centers.find_one({
            "company_id": company_id,
            "code": template["code"]
        })
        if existing:
            continue
        
        cost_center_id = f"cc_{uuid.uuid4().hex[:12]}"
        doc = {
            "cost_center_id": cost_center_id,
            "company_id": company_id,
            "name": template["name"],
            "code": template["code"],
            "description": template["description"],
            "annual_budget": None,
            "current_spend": 0.0,
            "responsible_user_id": None,
            "responsible_name": None,
            "is_active": True,
            "is_system": True,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        await db.cost_centers.insert_one(doc)
        created.append(template["name"])
    
    return {"message": f"Created {len(created)} cost centers", "created": created}


@people_ops_router.put("/cost-centers/{cost_center_id}")
async def update_cost_center(
    cost_center_id: str,
    data: CostCenterUpdate,
    user: User = Depends(get_current_user)
):
    """Update a cost center"""
    company_id = user.company_id or user.active_org_id
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Get responsible name if updating responsible
    if "responsible_user_id" in update_data and update_data["responsible_user_id"]:
        resp_user = await db.users.find_one(
            {"user_id": update_data["responsible_user_id"]},
            {"_id": 0, "name": 1}
        )
        update_data["responsible_name"] = resp_user.get("name") if resp_user else None
    
    result = await db.cost_centers.update_one(
        {"cost_center_id": cost_center_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    return {"message": "Cost center updated"}


@people_ops_router.delete("/cost-centers/{cost_center_id}")
async def delete_cost_center(
    cost_center_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a cost center (soft delete by setting inactive)"""
    company_id = user.company_id or user.active_org_id
    
    # Check if cost center has employees assigned
    employees_count = await db.employees.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    if employees_count > 0:
        # Soft delete - just deactivate
        await db.cost_centers.update_one(
            {"cost_center_id": cost_center_id, "company_id": company_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": f"Cost center deactivated (has {employees_count} employees)"}
    
    # Hard delete if no employees
    result = await db.cost_centers.delete_one({
        "cost_center_id": cost_center_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    return {"message": "Cost center deleted"}


# ==================== EMPLOYEES ====================

@people_ops_router.get("/employees")
async def get_employees(
    status: Optional[str] = None,
    department: Optional[str] = None,
    cost_center_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all employees"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if department:
        query["department"] = department
    if cost_center_id:
        query["cost_center_id"] = cost_center_id
    
    # If manager, only show their direct reports
    if access_level == "manager":
        query["manager_id"] = user.user_id
    
    employees = await db.employees.find(
        query,
        {"_id": 0}
    ).sort("full_name", 1).to_list(500)
    
    # Hide sensitive salary info for managers
    if access_level == "manager":
        for emp in employees:
            emp.pop("base_salary", None)
            emp.pop("bank_account", None)
    
    return employees


@people_ops_router.get("/employees/me")
async def get_my_employee_profile(user: User = Depends(get_current_user)):
    """Self-service: Get current user's employee profile"""
    company_id, employee = await get_employee_self_service(user)
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    
    # Hide some sensitive fields from self-service
    employee.pop("notes", None)
    
    return employee


@people_ops_router.get("/employees/{employee_id}")
async def get_employee(
    employee_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific employee"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    employee = await db.employees.find_one(
        {"employee_id": employee_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # If manager, only allow viewing direct reports
    if access_level == "manager" and employee.get("manager_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Can only view direct reports")
    
    return employee


@people_ops_router.post("/employees")
async def create_employee(
    data: EmployeeCreate,
    user: User = Depends(get_current_user)
):
    """Create a new employee"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    # Check for duplicate email
    existing = await db.employees.find_one({
        "company_id": company_id,
        "email": data.email
    })
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this email already exists")
    
    now = datetime.now(timezone.utc)
    employee_id = f"emp_{uuid.uuid4().hex[:12]}"
    
    # Generate employee number
    count = await db.employees.count_documents({"company_id": company_id})
    employee_number = f"EMP-{str(count + 1).zfill(4)}"
    
    # Get cost center name
    cost_center_name = None
    if data.cost_center_id:
        cc = await db.cost_centers.find_one(
            {"cost_center_id": data.cost_center_id},
            {"_id": 0, "name": 1}
        )
        cost_center_name = cc.get("name") if cc else None
    
    # Get manager name
    manager_name = None
    if data.manager_id:
        manager = await db.employees.find_one(
            {"employee_id": data.manager_id},
            {"_id": 0, "full_name": 1}
        )
        manager_name = manager.get("full_name") if manager else None
    
    doc = {
        "employee_id": employee_id,
        "company_id": company_id,
        "employee_number": employee_number,
        
        # Personal
        "first_name": data.first_name,
        "last_name": data.last_name,
        "full_name": f"{data.first_name} {data.last_name}",
        "email": data.email,
        "phone": data.phone,
        "personal_email": data.personal_email,
        "date_of_birth": data.date_of_birth,
        "national_id": data.national_id,
        "address": data.address,
        "city": data.city,
        "emergency_contact_name": data.emergency_contact_name,
        "emergency_contact_phone": data.emergency_contact_phone,
        "profile_photo": None,
        
        # Employment
        "job_title": data.job_title,
        "department": data.department,
        "cost_center_id": data.cost_center_id,
        "cost_center_name": cost_center_name,
        "manager_id": data.manager_id,
        "manager_name": manager_name,
        "hire_date": data.hire_date,
        "termination_date": None,
        "contract_type": data.contract_type.value,
        "status": data.status.value,
        
        # Compensation
        "base_salary": data.base_salary,
        "payment_frequency": data.payment_frequency.value,
        "currency": data.currency,
        "bank_name": data.bank_name,
        "bank_account": data.bank_account,
        "bank_account_type": data.bank_account_type,
        
        # Benefits
        "has_health_insurance": data.has_health_insurance,
        "has_pension": data.has_pension,
        "afp_provider": data.afp_provider,
        "ars_provider": data.ars_provider,
        
        # Vacation
        "vacation_days_entitled": 14.0,
        "vacation_days_used": 0.0,
        "vacation_days_available": 14.0,
        
        # Loans
        "active_loan_balance": 0.0,
        
        # Access
        "user_id": data.user_id,
        
        # Notes
        "notes": data.notes,
        
        # Metadata
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id
    }
    
    await db.employees.insert_one(doc)
    del doc["_id"]
    
    return doc


@people_ops_router.put("/employees/{employee_id}")
async def update_employee(
    employee_id: str,
    data: EmployeeUpdate,
    user: User = Depends(get_current_user)
):
    """Update an employee"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    # Handle enum values
    if "contract_type" in update_data:
        update_data["contract_type"] = update_data["contract_type"].value
    if "status" in update_data:
        update_data["status"] = update_data["status"].value
    if "payment_frequency" in update_data:
        update_data["payment_frequency"] = update_data["payment_frequency"].value
    
    # Update full_name if first/last name changed
    if "first_name" in update_data or "last_name" in update_data:
        current = await db.employees.find_one(
            {"employee_id": employee_id, "company_id": company_id},
            {"_id": 0, "first_name": 1, "last_name": 1}
        )
        if current:
            first = update_data.get("first_name", current.get("first_name", ""))
            last = update_data.get("last_name", current.get("last_name", ""))
            update_data["full_name"] = f"{first} {last}"
    
    # Update cost center name if changed
    if "cost_center_id" in update_data:
        cc = await db.cost_centers.find_one(
            {"cost_center_id": update_data["cost_center_id"]},
            {"_id": 0, "name": 1}
        )
        update_data["cost_center_name"] = cc.get("name") if cc else None
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.employees.update_one(
        {"employee_id": employee_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"message": "Employee updated"}


@people_ops_router.get("/employees/stats/summary")
async def get_employee_stats(user: User = Depends(get_current_user)):
    """Get employee statistics summary"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    # Count by status
    active = await db.employees.count_documents({"company_id": company_id, "status": "active"})
    on_leave = await db.employees.count_documents({"company_id": company_id, "status": "on_leave"})
    terminated = await db.employees.count_documents({"company_id": company_id, "status": "terminated"})
    
    # Count by department
    departments = await db.employees.aggregate([
        {"$match": {"company_id": company_id, "status": "active"}},
        {"$group": {"_id": "$department", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(50)
    
    # Count by contract type
    contract_types = await db.employees.aggregate([
        {"$match": {"company_id": company_id, "status": "active"}},
        {"$group": {"_id": "$contract_type", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    # Total payroll (if admin/hr)
    total_payroll = 0
    if access_level in ["admin", "hr"]:
        payroll_agg = await db.employees.aggregate([
            {"$match": {"company_id": company_id, "status": "active"}},
            {"$group": {"_id": None, "total": {"$sum": "$base_salary"}}}
        ]).to_list(1)
        total_payroll = payroll_agg[0]["total"] if payroll_agg else 0
    
    return {
        "total_employees": active + on_leave + terminated,
        "active": active,
        "on_leave": on_leave,
        "terminated": terminated,
        "by_department": [{"department": d["_id"] or "Unassigned", "count": d["count"]} for d in departments],
        "by_contract_type": [{"type": c["_id"], "count": c["count"]} for c in contract_types],
        "total_monthly_payroll": total_payroll if access_level in ["admin", "hr"] else None
    }


# ==================== REFERENCE DATA ====================

@people_ops_router.get("/reference/afp-providers")
async def get_afp_providers():
    """Get list of AFP providers in RD"""
    return AFP_PROVIDERS


@people_ops_router.get("/reference/ars-providers")
async def get_ars_providers():
    """Get list of ARS providers in RD"""
    return ARS_PROVIDERS


@people_ops_router.get("/reference/banks")
async def get_banks():
    """Get list of banks in RD for payroll"""
    return BANKS_RD


@people_ops_router.get("/reference/departments")
async def get_departments(user: User = Depends(get_current_user)):
    """Get list of departments used in the organization"""
    company_id = user.company_id or user.active_org_id
    
    departments = await db.employees.distinct("department", {"company_id": company_id})
    return [d for d in departments if d]


# ==================== SALARY CHANGES ====================

@people_ops_router.post("/employees/{employee_id}/salary-change")
async def record_salary_change(
    employee_id: str,
    data: SalaryChangeCreate,
    user: User = Depends(get_current_user)
):
    """Record a salary change for an employee"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    # Get employee
    employee = await db.employees.find_one(
        {"employee_id": employee_id, "company_id": company_id},
        {"_id": 0, "full_name": 1, "base_salary": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    now = datetime.now(timezone.utc)
    change_id = f"sc_{uuid.uuid4().hex[:12]}"
    
    change_percentage = ((data.new_salary - data.previous_salary) / data.previous_salary * 100) if data.previous_salary > 0 else 0
    
    change_doc = {
        "change_id": change_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "previous_salary": data.previous_salary,
        "new_salary": data.new_salary,
        "change_percentage": round(change_percentage, 2),
        "effective_date": data.effective_date,
        "reason": data.reason,
        "notes": data.notes,
        "approved_by": user.user_id if access_level == "admin" else None,
        "approved_at": now.isoformat() if access_level == "admin" else None,
        "created_at": now.isoformat()
    }
    
    await db.salary_changes.insert_one(change_doc)
    
    # Update employee's salary
    await db.employees.update_one(
        {"employee_id": employee_id},
        {"$set": {
            "base_salary": data.new_salary,
            "updated_at": now.isoformat()
        }}
    )
    
    del change_doc["_id"]
    return change_doc


@people_ops_router.get("/employees/{employee_id}/salary-history")
async def get_salary_history(
    employee_id: str,
    user: User = Depends(get_current_user)
):
    """Get salary change history for an employee"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    changes = await db.salary_changes.find(
        {"employee_id": employee_id, "company_id": company_id},
        {"_id": 0}
    ).sort("effective_date", -1).to_list(50)
    
    return changes


# ==================== PAYROLL CONFIGURATION ====================

@people_ops_router.get("/payroll/config")
async def get_payroll_config(user: User = Depends(get_current_user)):
    """Get payroll configuration for the organization"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    config = await db.payroll_config.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    if not config:
        # Return default config
        return {
            "config_id": None,
            "company_id": company_id,
            "payment_frequency": "biweekly",
            "payment_day_1": 15,
            "payment_day_2": 30,
            "afp_employee_rate": 2.87,
            "afp_employer_rate": 7.10,
            "ars_employee_rate": 3.04,
            "ars_employer_rate": 7.09,
            "srl_rate": 1.20,
            "infotep_rate": 1.0,
            "isr_enabled": True,
            "overtime_rate_35": 1.35,
            "overtime_rate_100": 2.0,
            "include_regalia": True,
            "regalia_months": 12
        }
    
    return config


@people_ops_router.post("/payroll/config")
async def save_payroll_config(
    data: PayrollConfigCreate,
    user: User = Depends(get_current_user)
):
    """Create or update payroll configuration"""
    company_id, access_level = await check_people_ops_access(user, "admin")
    
    now = datetime.now(timezone.utc)
    
    # Check if config exists
    existing = await db.payroll_config.find_one({"company_id": company_id})
    
    config_data = {
        "company_id": company_id,
        "payment_frequency": data.payment_frequency.value,
        "payment_day_1": data.payment_day_1,
        "payment_day_2": data.payment_day_2,
        "afp_employee_rate": data.afp_employee_rate,
        "afp_employer_rate": data.afp_employer_rate,
        "ars_employee_rate": data.ars_employee_rate,
        "ars_employer_rate": data.ars_employer_rate,
        "srl_rate": data.srl_rate,
        "infotep_rate": data.infotep_rate,
        "isr_enabled": data.isr_enabled,
        "overtime_rate_35": data.overtime_rate_35,
        "overtime_rate_100": data.overtime_rate_100,
        "include_regalia": data.include_regalia,
        "regalia_months": data.regalia_months,
        "updated_at": now.isoformat()
    }
    
    if existing:
        await db.payroll_config.update_one(
            {"company_id": company_id},
            {"$set": config_data}
        )
        config_data["config_id"] = existing.get("config_id")
    else:
        config_id = f"pconfig_{uuid.uuid4().hex[:12]}"
        config_data["config_id"] = config_id
        config_data["created_at"] = now.isoformat()
        await db.payroll_config.insert_one(config_data)
    
    return config_data


# ==================== PAYROLL PERIODS ====================

@people_ops_router.get("/payroll/periods")
async def get_payroll_periods(
    status: Optional[str] = None,
    limit: int = 20,
    user: User = Depends(get_current_user)
):
    """Get all payroll periods"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    
    periods = await db.payroll_periods.find(
        query,
        {"_id": 0}
    ).sort("payment_date", -1).to_list(limit)
    
    return periods


@people_ops_router.post("/payroll/periods")
async def create_payroll_period(
    data: PayrollPeriodCreate,
    user: User = Depends(get_current_user)
):
    """Create a new payroll period and generate entries for all active employees"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    period_id = f"period_{uuid.uuid4().hex[:12]}"
    
    # Get payroll config
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0})
    if not config:
        # Use defaults
        config = {
            "afp_employee_rate": 2.87,
            "afp_employer_rate": 7.10,
            "ars_employee_rate": 3.04,
            "ars_employer_rate": 7.09,
            "srl_rate": 1.20,
            "infotep_rate": 1.0,
            "isr_enabled": True,
            "overtime_rate_35": 1.35,
            "overtime_rate_100": 2.0
        }
    
    # Create period
    period_doc = {
        "period_id": period_id,
        "company_id": company_id,
        "period_name": data.period_name,
        "period_type": data.period_type.value,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "payment_date": data.payment_date,
        "status": PayrollStatus.DRAFT.value,
        "total_employees": 0,
        "total_gross": 0.0,
        "total_deductions": 0.0,
        "total_net": 0.0,
        "total_employer_cost": 0.0,
        "notes": data.notes,
        "approved_by": None,
        "approved_at": None,
        "processed_at": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.payroll_periods.insert_one(period_doc)
    
    # Get all active employees and create entries
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0}
    ).to_list(1000)
    
    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0
    total_employer_cost = 0.0
    
    for emp in employees:
        # Calculate salary for period
        base_salary = emp.get("base_salary", 0)
        freq = emp.get("payment_frequency", "biweekly")
        
        # Adjust salary based on frequency
        if freq == "monthly" and data.period_type.value == "biweekly":
            period_salary = base_salary / 2
        elif freq == "biweekly" and data.period_type.value == "monthly":
            period_salary = base_salary * 2
        else:
            period_salary = base_salary
        
        # Calculate deductions
        afp_emp = period_salary * (config.get("afp_employee_rate", 2.87) / 100)
        ars_emp = period_salary * (config.get("ars_employee_rate", 3.04) / 100)
        
        # ISR calculation (monthly equivalent)
        monthly_salary = period_salary * 2 if data.period_type.value == "biweekly" else period_salary
        monthly_isr = calculate_monthly_isr(monthly_salary) if config.get("isr_enabled", True) else 0
        period_isr = monthly_isr / 2 if data.period_type.value == "biweekly" else monthly_isr
        
        # Loan deduction
        loan_deduction = 0.0
        if emp.get("active_loan_balance", 0) > 0:
            # Default: deduct 10% of salary towards loan
            loan_deduction = min(period_salary * 0.1, emp.get("active_loan_balance", 0))
        
        total_emp_deductions = afp_emp + ars_emp + period_isr + loan_deduction
        net_salary = period_salary - total_emp_deductions
        
        # Employer contributions
        afp_employer = period_salary * (config.get("afp_employer_rate", 7.10) / 100)
        ars_employer = period_salary * (config.get("ars_employer_rate", 7.09) / 100)
        srl_employer = period_salary * (config.get("srl_rate", 1.20) / 100)
        infotep_employer = period_salary * (config.get("infotep_rate", 1.0) / 100)
        employer_cost = period_salary + afp_employer + ars_employer + srl_employer + infotep_employer
        
        entry_id = f"entry_{uuid.uuid4().hex[:12]}"
        entry_doc = {
            "entry_id": entry_id,
            "period_id": period_id,
            "company_id": company_id,
            "employee_id": emp.get("employee_id"),
            "employee_name": emp.get("full_name"),
            "employee_number": emp.get("employee_number"),
            "department": emp.get("department"),
            
            "base_salary": round(period_salary, 2),
            "overtime_hours_35": 0,
            "overtime_amount_35": 0,
            "overtime_hours_100": 0,
            "overtime_amount_100": 0,
            "bonus": 0,
            "commission": 0,
            "other_earnings": 0,
            "other_earnings_description": None,
            "gross_salary": round(period_salary, 2),
            
            "afp_employee": round(afp_emp, 2),
            "ars_employee": round(ars_emp, 2),
            "isr": round(period_isr, 2),
            "loan_deduction": round(loan_deduction, 2),
            "other_deductions": 0,
            "other_deductions_description": None,
            "total_deductions": round(total_emp_deductions, 2),
            
            "net_salary": round(net_salary, 2),
            
            "afp_employer": round(afp_employer, 2),
            "ars_employer": round(ars_employer, 2),
            "srl_employer": round(srl_employer, 2),
            "infotep_employer": round(infotep_employer, 2),
            "total_employer_cost": round(employer_cost, 2),
            
            "bank_name": emp.get("bank_name"),
            "bank_account": emp.get("bank_account"),
            
            "notes": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.payroll_entries.insert_one(entry_doc)
        
        total_gross += period_salary
        total_deductions += total_emp_deductions
        total_net += net_salary
        total_employer_cost += employer_cost
    
    # Update period totals
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "total_employees": len(employees),
            "total_gross": round(total_gross, 2),
            "total_deductions": round(total_deductions, 2),
            "total_net": round(total_net, 2),
            "total_employer_cost": round(total_employer_cost, 2)
        }}
    )
    
    del period_doc["_id"]
    period_doc["total_employees"] = len(employees)
    period_doc["total_gross"] = round(total_gross, 2)
    period_doc["total_deductions"] = round(total_deductions, 2)
    period_doc["total_net"] = round(total_net, 2)
    period_doc["total_employer_cost"] = round(total_employer_cost, 2)
    
    return period_doc


@people_ops_router.get("/payroll/periods/{period_id}")
async def get_payroll_period(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific payroll period with all entries"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    
    # Get all entries
    entries = await db.payroll_entries.find(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    ).sort("employee_name", 1).to_list(1000)
    
    return {
        "period": period,
        "entries": entries
    }


@people_ops_router.put("/payroll/entries/{entry_id}")
async def update_payroll_entry(
    entry_id: str,
    data: PayrollEntryUpdate,
    user: User = Depends(get_current_user)
):
    """Update a payroll entry (add overtime, bonus, etc.)"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    # Get entry
    entry = await db.payroll_entries.find_one(
        {"entry_id": entry_id, "company_id": company_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Payroll entry not found")
    
    # Check if period is still editable
    period = await db.payroll_periods.find_one(
        {"period_id": entry.get("period_id")},
        {"_id": 0, "status": 1}
    )
    if period and period.get("status") not in ["draft", "pending_approval"]:
        raise HTTPException(status_code=400, detail="Cannot edit entries for processed payroll")
    
    # Get config for rates
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0})
    overtime_rate_35 = config.get("overtime_rate_35", 1.35) if config else 1.35
    overtime_rate_100 = config.get("overtime_rate_100", 2.0) if config else 2.0
    
    now = datetime.now(timezone.utc)
    
    # Calculate hourly rate from base salary (assuming 23.83 working days, 8 hours)
    hourly_rate = entry.get("base_salary", 0) / (23.83 * 8 / 2) if entry.get("base_salary", 0) > 0 else 0
    
    update_data = {}
    
    if data.overtime_hours_35 is not None:
        update_data["overtime_hours_35"] = data.overtime_hours_35
        update_data["overtime_amount_35"] = round(data.overtime_hours_35 * hourly_rate * overtime_rate_35, 2)
    
    if data.overtime_hours_100 is not None:
        update_data["overtime_hours_100"] = data.overtime_hours_100
        update_data["overtime_amount_100"] = round(data.overtime_hours_100 * hourly_rate * overtime_rate_100, 2)
    
    if data.bonus is not None:
        update_data["bonus"] = data.bonus
    
    if data.commission is not None:
        update_data["commission"] = data.commission
    
    if data.other_earnings is not None:
        update_data["other_earnings"] = data.other_earnings
    
    if data.other_earnings_description is not None:
        update_data["other_earnings_description"] = data.other_earnings_description
    
    if data.loan_deduction is not None:
        update_data["loan_deduction"] = data.loan_deduction
    
    if data.other_deductions is not None:
        update_data["other_deductions"] = data.other_deductions
    
    if data.other_deductions_description is not None:
        update_data["other_deductions_description"] = data.other_deductions_description
    
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    # Recalculate totals
    base = entry.get("base_salary", 0)
    ot_35 = update_data.get("overtime_amount_35", entry.get("overtime_amount_35", 0))
    ot_100 = update_data.get("overtime_amount_100", entry.get("overtime_amount_100", 0))
    bonus = update_data.get("bonus", entry.get("bonus", 0))
    commission = update_data.get("commission", entry.get("commission", 0))
    other_earn = update_data.get("other_earnings", entry.get("other_earnings", 0))
    
    gross = base + ot_35 + ot_100 + bonus + commission + other_earn
    
    # Recalculate deductions on new gross
    afp_rate = config.get("afp_employee_rate", 2.87) / 100 if config else 0.0287
    ars_rate = config.get("ars_employee_rate", 3.04) / 100 if config else 0.0304
    
    afp_emp = round(gross * afp_rate, 2)
    ars_emp = round(gross * ars_rate, 2)
    
    # ISR on monthly equivalent
    monthly_gross = gross * 2  # Assuming biweekly
    monthly_isr = calculate_monthly_isr(monthly_gross) if (config and config.get("isr_enabled", True)) else 0
    period_isr = round(monthly_isr / 2, 2)
    
    loan = update_data.get("loan_deduction", entry.get("loan_deduction", 0))
    other_ded = update_data.get("other_deductions", entry.get("other_deductions", 0))
    
    total_deductions = afp_emp + ars_emp + period_isr + loan + other_ded
    net = gross - total_deductions
    
    update_data["gross_salary"] = round(gross, 2)
    update_data["afp_employee"] = afp_emp
    update_data["ars_employee"] = ars_emp
    update_data["isr"] = period_isr
    update_data["total_deductions"] = round(total_deductions, 2)
    update_data["net_salary"] = round(net, 2)
    update_data["updated_at"] = now.isoformat()
    
    await db.payroll_entries.update_one(
        {"entry_id": entry_id},
        {"$set": update_data}
    )
    
    # Recalculate period totals
    await recalculate_period_totals(entry.get("period_id"))
    
    return {"message": "Entry updated", "net_salary": round(net, 2)}


async def recalculate_period_totals(period_id: str):
    """Recalculate totals for a payroll period"""
    entries = await db.payroll_entries.find(
        {"period_id": period_id},
        {"_id": 0, "gross_salary": 1, "total_deductions": 1, "net_salary": 1, "total_employer_cost": 1}
    ).to_list(1000)
    
    total_gross = sum(e.get("gross_salary", 0) for e in entries)
    total_deductions = sum(e.get("total_deductions", 0) for e in entries)
    total_net = sum(e.get("net_salary", 0) for e in entries)
    total_employer = sum(e.get("total_employer_cost", 0) for e in entries)
    
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "total_employees": len(entries),
            "total_gross": round(total_gross, 2),
            "total_deductions": round(total_deductions, 2),
            "total_net": round(total_net, 2),
            "total_employer_cost": round(total_employer, 2),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )


# ==================== PAYROLL ACTIONS ====================

@people_ops_router.post("/payroll/periods/{period_id}/submit")
async def submit_payroll_for_approval(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Submit payroll period for approval"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    )
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft periods can be submitted")
    
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "status": PayrollStatus.PENDING_APPROVAL.value,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Payroll submitted for approval"}


@people_ops_router.post("/payroll/periods/{period_id}/approve")
async def approve_payroll(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Approve payroll period (admin only)"""
    company_id, access_level = await check_people_ops_access(user, "payroll_approve")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    )
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Only pending periods can be approved")
    
    now = datetime.now(timezone.utc)
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "status": PayrollStatus.APPROVED.value,
            "approved_by": user.user_id,
            "approved_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    return {"message": "Payroll approved"}


@people_ops_router.post("/payroll/periods/{period_id}/process")
async def process_payroll(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Mark payroll as processed/completed"""
    company_id, access_level = await check_people_ops_access(user, "payroll_approve")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    )
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved periods can be processed")
    
    now = datetime.now(timezone.utc)
    
    # Update loan balances for employees
    entries = await db.payroll_entries.find(
        {"period_id": period_id, "loan_deduction": {"$gt": 0}},
        {"_id": 0, "employee_id": 1, "loan_deduction": 1}
    ).to_list(1000)
    
    for entry in entries:
        await db.employees.update_one(
            {"employee_id": entry["employee_id"]},
            {"$inc": {"active_loan_balance": -entry["loan_deduction"]}}
        )
    
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "status": PayrollStatus.COMPLETED.value,
            "processed_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    return {"message": "Payroll processed"}


@people_ops_router.post("/payroll/periods/{period_id}/revert")
async def revert_payroll_to_draft(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Revert payroll back to draft (admin only, only if not processed)"""
    company_id, access_level = await check_people_ops_access(user, "payroll_approve")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    )
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    if period.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Cannot revert completed payroll")
    
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "status": PayrollStatus.DRAFT.value,
            "approved_by": None,
            "approved_at": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Payroll reverted to draft"}


# ==================== PAYROLL EXPORTS ====================

@people_ops_router.get("/payroll/periods/{period_id}/bank-file")
async def generate_bank_file(
    period_id: str,
    user: User = Depends(get_current_user)
):
    """Generate bank payment file (CSV) for the period"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    period = await db.payroll_periods.find_one(
        {"period_id": period_id, "company_id": company_id},
        {"_id": 0}
    )
    if not period:
        raise HTTPException(status_code=404, detail="Period not found")
    
    entries = await db.payroll_entries.find(
        {"period_id": period_id, "company_id": company_id, "bank_account": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(1000)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(["Nombre", "Banco", "Tipo Cuenta", "Numero Cuenta", "Monto", "Referencia"])
    
    # Data
    for entry in entries:
        writer.writerow([
            entry.get("employee_name", ""),
            entry.get("bank_name", ""),
            "Ahorros",  # Default
            entry.get("bank_account", ""),
            entry.get("net_salary", 0),
            f"{period.get('period_name', '')} - {entry.get('employee_number', '')}"
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=nomina_{period_id}.csv"}
    )


@people_ops_router.get("/payroll/entries/{entry_id}/payslip")
async def get_payslip_data(
    entry_id: str,
    user: User = Depends(get_current_user)
):
    """Get data for generating a payslip"""
    company_id, access_level = await check_people_ops_access(user, "view")
    
    entry = await db.payroll_entries.find_one(
        {"entry_id": entry_id, "company_id": company_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    period = await db.payroll_periods.find_one(
        {"period_id": entry.get("period_id")},
        {"_id": 0}
    )
    
    # Get employee details
    employee = await db.employees.find_one(
        {"employee_id": entry.get("employee_id")},
        {"_id": 0, "national_id": 1, "afp_provider": 1, "ars_provider": 1}
    )
    
    # Get company info
    org = await db.organizations.find_one(
        {"org_id": company_id},
        {"_id": 0, "name": 1, "rnc": 1}
    )
    
    return {
        "entry": entry,
        "period": period,
        "company_name": org.get("name") if org else None,
        "company_rnc": org.get("rnc") if org else None,
        "employee_national_id": employee.get("national_id") if employee else None,
        "afp_provider": employee.get("afp_provider") if employee else None,
        "ars_provider": employee.get("ars_provider") if employee else None
    }



# ==================== BENEFITS / COMPENSACIÓN ENDPOINTS ====================

@people_ops_router.get("/employees/{employee_id}/benefits")
async def get_employee_benefits(employee_id: str, user: User = Depends(get_current_user)):
    """Get all benefits for an employee"""
    company_id = user.company_id or user.active_org_id
    
    benefits = await db.employee_benefits.find(
        {"company_id": company_id, "employee_id": employee_id, "is_active": True},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return benefits


@people_ops_router.post("/employees/{employee_id}/benefits")
async def create_employee_benefit(
    employee_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Add a benefit to an employee"""
    company_id = user.company_id or user.active_org_id
    
    # Verify employee exists
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    benefit_id = f"ben_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    benefit = {
        "benefit_id": benefit_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "benefit_type": data.get("benefit_type", "other"),
        "name": data.get("name"),
        "amount": data.get("amount", 0),
        "frequency": data.get("frequency", "monthly"),
        "is_taxable": data.get("is_taxable", False),
        "is_deduction": data.get("is_deduction", False),
        "is_active": True,
        "effective_date": data.get("effective_date"),
        "end_date": data.get("end_date"),
        "notes": data.get("notes"),
        "created_at": now,
        "updated_at": now
    }
    
    await db.employee_benefits.insert_one(benefit)
    if "_id" in benefit:
        del benefit["_id"]
    
    return benefit


@people_ops_router.delete("/benefits/{benefit_id}")
async def delete_employee_benefit(benefit_id: str, user: User = Depends(get_current_user)):
    """Deactivate a benefit"""
    company_id = user.company_id or user.active_org_id
    
    result = await db.employee_benefits.update_one(
        {"company_id": company_id, "benefit_id": benefit_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Benefit not found")
    
    return {"message": "Benefit deactivated"}


# ==================== TIME OFF / VACACIONES ENDPOINTS ====================

@people_ops_router.get("/time-off/requests")
async def get_time_off_requests(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get time off requests"""
    company_id = user.company_id or user.active_org_id
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    
    requests = await db.time_off_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return requests


@people_ops_router.post("/time-off/requests")
async def create_time_off_request(data: dict, user: User = Depends(get_current_user)):
    """Create a time off request"""
    company_id = user.company_id or user.active_org_id
    
    employee_id = data.get("employee_id")
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1, "vacation_days_available": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Validate vacation balance if vacation type
    if data.get("time_off_type") == "vacation":
        available = employee.get("vacation_days_available", 0)
        requested = data.get("total_days", 0)
        if requested > available:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient vacation days. Available: {available}, Requested: {requested}"
            )
    
    request_id = f"tor_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    request = {
        "request_id": request_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "time_off_type": data.get("time_off_type", "vacation"),
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "total_days": data.get("total_days", 1),
        "status": "pending",
        "reason": data.get("reason"),
        "notes": data.get("notes"),
        "created_at": now,
        "updated_at": now
    }
    
    await db.time_off_requests.insert_one(request)
    
    return {"request_id": request_id, "message": "Time off request created"}


@people_ops_router.post("/time-off/requests/{request_id}/approve")
async def approve_time_off_request(request_id: str, user: User = Depends(get_current_user)):
    """Approve a time off request"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    request = await db.time_off_requests.find_one(
        {"company_id": company_id, "request_id": request_id},
        {"_id": 0}
    )
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")
    
    # Update request
    await db.time_off_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "approved",
            "reviewed_by": user.user_id,
            "reviewed_by_name": user.name,
            "reviewed_at": now,
            "updated_at": now
        }}
    )
    
    # Update employee vacation balance if vacation
    if request.get("time_off_type") == "vacation":
        await db.employees.update_one(
            {"employee_id": request.get("employee_id")},
            {"$inc": {
                "vacation_days_used": request.get("total_days", 0),
                "vacation_days_available": -request.get("total_days", 0)
            }}
        )
    
    return {"message": "Request approved"}


@people_ops_router.post("/time-off/requests/{request_id}/reject")
async def reject_time_off_request(
    request_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Reject a time off request"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.time_off_requests.update_one(
        {"company_id": company_id, "request_id": request_id, "status": "pending"},
        {"$set": {
            "status": "rejected",
            "reviewed_by": user.user_id,
            "reviewed_by_name": user.name,
            "reviewed_at": now,
            "rejection_reason": data.get("reason"),
            "updated_at": now
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or not pending")
    
    return {"message": "Request rejected"}


@people_ops_router.get("/time-off/balances")
async def get_time_off_balances(user: User = Depends(get_current_user)):
    """Get vacation/time off balances for all employees"""
    company_id = user.company_id or user.active_org_id
    
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0, "employee_id": 1, "full_name": 1, 
         "vacation_days_entitled": 1, "vacation_days_used": 1, "vacation_days_available": 1}
    ).to_list(500)
    
    # Get pending requests
    pending = await db.time_off_requests.find(
        {"company_id": company_id, "status": "pending", "time_off_type": "vacation"},
        {"_id": 0, "employee_id": 1, "total_days": 1}
    ).to_list(500)
    
    pending_by_emp = {}
    for p in pending:
        eid = p.get("employee_id")
        pending_by_emp[eid] = pending_by_emp.get(eid, 0) + p.get("total_days", 0)
    
    balances = []
    for emp in employees:
        balances.append({
            "employee_id": emp.get("employee_id"),
            "employee_name": emp.get("full_name"),
            "year": datetime.now().year,
            "vacation_entitled": emp.get("vacation_days_entitled", 14),
            "vacation_used": emp.get("vacation_days_used", 0),
            "vacation_pending": pending_by_emp.get(emp.get("employee_id"), 0),
            "vacation_available": emp.get("vacation_days_available", 14)
        })
    
    return balances


# ==================== OVERTIME / HORAS EXTRAS ENDPOINTS ====================

@people_ops_router.get("/overtime/requests")
async def get_overtime_requests(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get overtime requests"""
    company_id = user.company_id or user.active_org_id
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    
    requests = await db.overtime_requests.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return requests


@people_ops_router.post("/overtime/requests")
async def create_overtime_request(data: dict, user: User = Depends(get_current_user)):
    """Create an overtime request"""
    company_id = user.company_id or user.active_org_id
    
    employee_id = data.get("employee_id")
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1, "base_salary": 1, "payment_frequency": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Calculate hourly rate (monthly salary / 192 hours)
    base_salary = employee.get("base_salary", 0)
    freq = employee.get("payment_frequency", "biweekly")
    monthly_salary = base_salary * 2 if freq == "biweekly" else base_salary * 4 if freq == "weekly" else base_salary
    hourly_rate = monthly_salary / 192
    
    hours_35 = data.get("hours_35", 0)
    hours_100 = data.get("hours_100", 0)
    
    # Get config for rates
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0})
    rate_35 = config.get("overtime_rate_35", 1.35) if config else 1.35
    rate_100 = config.get("overtime_rate_100", 2.0) if config else 2.0
    
    estimated_amount = (hours_35 * hourly_rate * rate_35) + (hours_100 * hourly_rate * rate_100)
    
    overtime_id = f"ot_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    overtime = {
        "overtime_id": overtime_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "date": data.get("date"),
        "hours_35": hours_35,
        "hours_100": hours_100,
        "total_hours": hours_35 + hours_100,
        "estimated_amount": round(estimated_amount, 2),
        "status": "pending",
        "reason": data.get("reason"),
        "notes": data.get("notes"),
        "created_at": now,
        "updated_at": now
    }
    
    await db.overtime_requests.insert_one(overtime)
    
    return {"overtime_id": overtime_id, "estimated_amount": round(estimated_amount, 2)}


@people_ops_router.post("/overtime/requests/{overtime_id}/approve")
async def approve_overtime_request(overtime_id: str, user: User = Depends(get_current_user)):
    """Approve an overtime request"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.overtime_requests.update_one(
        {"company_id": company_id, "overtime_id": overtime_id, "status": "pending"},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": now,
            "updated_at": now
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or not pending")
    
    return {"message": "Overtime approved"}


@people_ops_router.post("/overtime/requests/{overtime_id}/reject")
async def reject_overtime_request(
    overtime_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Reject an overtime request"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.overtime_requests.update_one(
        {"company_id": company_id, "overtime_id": overtime_id, "status": "pending"},
        {"$set": {
            "status": "rejected",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": now,
            "rejection_reason": data.get("reason"),
            "updated_at": now
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or not pending")
    
    return {"message": "Overtime rejected"}


# ==================== LOANS / PRÉSTAMOS ENDPOINTS ====================

@people_ops_router.get("/loans")
async def get_loans(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get loans"""
    company_id = user.company_id or user.active_org_id
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if employee_id:
        query["employee_id"] = employee_id
    
    loans = await db.loans.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return loans


@people_ops_router.post("/loans")
async def create_loan_request(data: dict, user: User = Depends(get_current_user)):
    """Create a loan request"""
    company_id = user.company_id or user.active_org_id
    
    employee_id = data.get("employee_id")
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1, "base_salary": 1, "active_loan_balance": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Check if employee has existing active loan
    existing_loan = await db.loans.find_one({
        "company_id": company_id,
        "employee_id": employee_id,
        "status": "active"
    })
    if existing_loan:
        raise HTTPException(
            status_code=400,
            detail=f"Employee has an active loan with balance: ${existing_loan.get('remaining_balance', 0):,.2f}"
        )
    
    # Validate loan amount (max 2x monthly salary for personal loans)
    base_salary = employee.get("base_salary", 0)
    requested_amount = data.get("requested_amount", 0)
    loan_type = data.get("loan_type", "personal_loan")
    
    if loan_type == "salary_advance":
        max_amount = base_salary  # Max 1 salary for advances
    else:
        max_amount = base_salary * 2  # Max 2 salaries for loans
    
    if requested_amount > max_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Requested amount exceeds maximum allowed: ${max_amount:,.2f}"
        )
    
    loan_id = f"loan_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    installments = data.get("installments", 1)
    installment_amount = requested_amount / installments
    
    loan = {
        "loan_id": loan_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "loan_type": loan_type,
        "requested_amount": requested_amount,
        "approved_amount": 0,
        "installments": installments,
        "installment_amount": round(installment_amount, 2),
        "total_paid": 0,
        "remaining_balance": 0,
        "installments_paid": 0,
        "status": "pending",
        "reason": data.get("reason"),
        "notes": data.get("notes"),
        "created_at": now,
        "updated_at": now
    }
    
    await db.loans.insert_one(loan)
    
    return {"loan_id": loan_id, "installment_amount": round(installment_amount, 2)}


@people_ops_router.post("/loans/{loan_id}/approve")
async def approve_loan(
    loan_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Approve a loan request"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    loan = await db.loans.find_one(
        {"company_id": company_id, "loan_id": loan_id, "status": "pending"},
        {"_id": 0}
    )
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found or not pending")
    
    approved_amount = data.get("approved_amount", loan.get("requested_amount"))
    installments = data.get("installments", loan.get("installments"))
    installment_amount = approved_amount / installments
    
    await db.loans.update_one(
        {"loan_id": loan_id},
        {"$set": {
            "status": "active",
            "approved_amount": approved_amount,
            "remaining_balance": approved_amount,
            "installments": installments,
            "installment_amount": round(installment_amount, 2),
            "start_date": data.get("start_date", now.isoformat()[:10]),
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": now,
            "updated_at": now
        }}
    )
    
    # Update employee's active loan balance
    await db.employees.update_one(
        {"employee_id": loan.get("employee_id")},
        {"$set": {"active_loan_balance": approved_amount}}
    )
    
    return {"message": "Loan approved", "installment_amount": round(installment_amount, 2)}


@people_ops_router.post("/loans/{loan_id}/reject")
async def reject_loan(
    loan_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Reject a loan request"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.loans.update_one(
        {"company_id": company_id, "loan_id": loan_id, "status": "pending"},
        {"$set": {
            "status": "rejected",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": now,
            "rejection_reason": data.get("reason"),
            "updated_at": now
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Loan not found or not pending")
    
    return {"message": "Loan rejected"}


@people_ops_router.get("/loans/{loan_id}/payments")
async def get_loan_payments(loan_id: str, user: User = Depends(get_current_user)):
    """Get payment history for a loan"""
    company_id = user.company_id or user.active_org_id
    
    payments = await db.loan_payments.find(
        {"company_id": company_id, "loan_id": loan_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return payments


# ==================== OFFBOARDING / TERMINACIÓN ENDPOINTS ====================

@people_ops_router.get("/offboarding")
async def get_offboarding_records(
    status: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user)
):
    """Get offboarding records"""
    company_id = user.company_id or user.active_org_id
    
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    
    records = await db.offboarding.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return records


@people_ops_router.post("/offboarding")
async def create_offboarding(data: dict, user: User = Depends(get_current_user)):
    """Create an offboarding/termination record with liquidation calculation"""
    from models.people_ops import calculate_liquidation_rd, TerminationType
    
    company_id = user.company_id or user.active_org_id
    employee_id = data.get("employee_id")
    
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    if employee.get("status") == "terminated":
        raise HTTPException(status_code=400, detail="Employee is already terminated")
    
    termination_type = data.get("termination_type", "resignation")
    termination_date = data.get("termination_date")
    hire_date = employee.get("hire_date")
    base_salary = employee.get("base_salary", 0)
    
    # Get payment frequency to calculate monthly salary
    freq = employee.get("payment_frequency", "biweekly")
    if freq == "biweekly":
        monthly_salary = base_salary * 2
    elif freq == "weekly":
        monthly_salary = base_salary * 4
    else:
        monthly_salary = base_salary
    
    # Get vacation days owed
    vacation_days_owed = employee.get("vacation_days_available", 0)
    
    # Calculate regalia proportion (months worked in current year)
    from datetime import datetime as dt
    term_dt = dt.fromisoformat(termination_date)
    regalia_months_worked = term_dt.month  # Simple: months in current year
    
    # Get pending loan balance
    pending_deductions = employee.get("active_loan_balance", 0)
    
    # Calculate liquidation
    liquidation = calculate_liquidation_rd(
        termination_type=TerminationType(termination_type),
        hire_date=hire_date,
        termination_date=termination_date,
        base_salary=monthly_salary,
        vacation_days_owed=vacation_days_owed,
        regalia_months_worked=regalia_months_worked,
        pending_salary_days=data.get("pending_salary_days", 0),
        pending_deductions=pending_deductions
    )
    
    offboarding_id = f"off_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    offboarding = {
        "offboarding_id": offboarding_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "employee_number": employee.get("employee_number"),
        
        "termination_type": termination_type,
        "termination_date": termination_date,
        "last_working_day": data.get("last_working_day", termination_date),
        "hire_date": hire_date,
        "years_of_service": liquidation["years_of_service"],
        "reason": data.get("reason"),
        "notes": data.get("notes"),
        "status": "draft",
        
        "base_salary": monthly_salary,
        "daily_salary": liquidation["daily_salary"],
        
        "preaviso_days": liquidation["preaviso_days"],
        "preaviso_amount": liquidation["preaviso_amount"],
        
        "cesantia_days": liquidation["cesantia_days"],
        "cesantia_amount": liquidation["cesantia_amount"],
        
        "vacation_days_owed": vacation_days_owed,
        "vacation_amount": liquidation["vacation_amount"],
        
        "regalia_months_worked": regalia_months_worked,
        "regalia_proportion": liquidation["regalia_proportion"],
        
        "pending_salary_days": data.get("pending_salary_days", 0),
        "pending_salary_amount": liquidation["pending_salary_amount"],
        
        "pending_bonuses": data.get("pending_bonuses", 0),
        "pending_deductions": pending_deductions,
        "deductions_detail": f"Préstamo activo" if pending_deductions > 0 else None,
        
        "gross_liquidation": liquidation["gross_liquidation"],
        "total_deductions": liquidation["total_deductions"],
        "net_liquidation": liquidation["net_liquidation"],
        
        "created_at": now,
        "updated_at": now
    }
    
    await db.offboarding.insert_one(offboarding)
    
    return {
        "offboarding_id": offboarding_id,
        "liquidation": liquidation,
        "breakdown": liquidation["breakdown"]
    }


@people_ops_router.put("/offboarding/{offboarding_id}")
async def update_offboarding(
    offboarding_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update offboarding record (allows manual adjustments)"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    # Only allow updates if status is draft
    record = await db.offboarding.find_one(
        {"company_id": company_id, "offboarding_id": offboarding_id},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    if record.get("status") not in ["draft", "pending_approval"]:
        raise HTTPException(status_code=400, detail="Cannot update processed records")
    
    # Update allowed fields
    update_fields = {
        "updated_at": now
    }
    
    allowed_fields = [
        "termination_date", "last_working_day", "reason", "notes",
        "pending_salary_days", "pending_salary_amount", "pending_bonuses",
        "pending_deductions", "deductions_detail"
    ]
    
    for field in allowed_fields:
        if field in data:
            update_fields[field] = data[field]
    
    # Recalculate totals if amounts changed
    if any(f in data for f in ["pending_salary_amount", "pending_bonuses", "pending_deductions"]):
        gross = (
            record.get("preaviso_amount", 0) +
            record.get("cesantia_amount", 0) +
            record.get("vacation_amount", 0) +
            record.get("regalia_proportion", 0) +
            data.get("pending_salary_amount", record.get("pending_salary_amount", 0)) +
            data.get("pending_bonuses", record.get("pending_bonuses", 0))
        )
        deductions = data.get("pending_deductions", record.get("pending_deductions", 0))
        update_fields["gross_liquidation"] = round(gross, 2)
        update_fields["total_deductions"] = round(deductions, 2)
        update_fields["net_liquidation"] = round(gross - deductions, 2)
    
    await db.offboarding.update_one(
        {"offboarding_id": offboarding_id},
        {"$set": update_fields}
    )
    
    return {"message": "Record updated"}


@people_ops_router.post("/offboarding/{offboarding_id}/submit")
async def submit_offboarding(offboarding_id: str, user: User = Depends(get_current_user)):
    """Submit offboarding for approval"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.offboarding.update_one(
        {"company_id": company_id, "offboarding_id": offboarding_id, "status": "draft"},
        {"$set": {"status": "pending_approval", "updated_at": now}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Record not found or not in draft status")
    
    return {"message": "Submitted for approval"}


@people_ops_router.post("/offboarding/{offboarding_id}/approve")
async def approve_offboarding(offboarding_id: str, user: User = Depends(get_current_user)):
    """Approve offboarding and update employee status"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    record = await db.offboarding.find_one(
        {"company_id": company_id, "offboarding_id": offboarding_id},
        {"_id": 0}
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    if record.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Record is not pending approval")
    
    # Update offboarding record
    await db.offboarding.update_one(
        {"offboarding_id": offboarding_id},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": now,
            "updated_at": now
        }}
    )
    
    # Update employee status
    await db.employees.update_one(
        {"employee_id": record.get("employee_id")},
        {"$set": {
            "status": "terminated",
            "termination_date": record.get("termination_date"),
            "updated_at": now
        }}
    )
    
    return {"message": "Offboarding approved, employee terminated"}


@people_ops_router.post("/offboarding/{offboarding_id}/process")
async def process_offboarding(offboarding_id: str, user: User = Depends(get_current_user)):
    """Mark offboarding as processed (payment made)"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    result = await db.offboarding.update_one(
        {"company_id": company_id, "offboarding_id": offboarding_id, "status": "approved"},
        {"$set": {"status": "processed", "updated_at": now}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Record not found or not approved")
    
    return {"message": "Offboarding processed"}


# ==================== COMPENSATION SUMMARY ====================

@people_ops_router.get("/employees/{employee_id}/compensation-summary")
async def get_employee_compensation_summary(employee_id: str, user: User = Depends(get_current_user)):
    """Get full compensation summary for an employee"""
    company_id = user.company_id or user.active_org_id
    
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Get benefits
    benefits = await db.employee_benefits.find(
        {"company_id": company_id, "employee_id": employee_id, "is_active": True},
        {"_id": 0}
    ).to_list(50)
    
    # Calculate monthly totals
    base_salary = employee.get("base_salary", 0)
    freq = employee.get("payment_frequency", "biweekly")
    
    if freq == "biweekly":
        monthly_base = base_salary * 2
    elif freq == "weekly":
        monthly_base = base_salary * 4
    else:
        monthly_base = base_salary
    
    monthly_benefits = 0
    monthly_deductions = 0
    benefits_detail = []
    
    for b in benefits:
        amount = b.get("amount", 0)
        bfreq = b.get("frequency", "monthly")
        
        # Convert to monthly
        if bfreq == "biweekly":
            monthly_amount = amount * 2
        elif bfreq == "daily":
            monthly_amount = amount * 22  # Approx working days
        else:
            monthly_amount = amount
        
        if b.get("is_deduction"):
            monthly_deductions += monthly_amount
        else:
            monthly_benefits += monthly_amount
        
        benefits_detail.append({
            "name": b.get("name"),
            "type": b.get("benefit_type"),
            "amount": amount,
            "frequency": bfreq,
            "monthly_equivalent": round(monthly_amount, 2),
            "is_deduction": b.get("is_deduction", False),
            "is_taxable": b.get("is_taxable", False)
        })
    
    # Get active loan
    active_loan = await db.loans.find_one(
        {"company_id": company_id, "employee_id": employee_id, "status": "active"},
        {"_id": 0, "loan_id": 1, "remaining_balance": 1, "installment_amount": 1}
    )
    
    return {
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "base_salary": base_salary,
        "payment_frequency": freq,
        "monthly_base_salary": round(monthly_base, 2),
        "monthly_benefits": round(monthly_benefits, 2),
        "monthly_deductions": round(monthly_deductions, 2),
        "total_monthly_compensation": round(monthly_base + monthly_benefits - monthly_deductions, 2),
        "benefits_detail": benefits_detail,
        "active_loan": {
            "loan_id": active_loan.get("loan_id"),
            "remaining_balance": active_loan.get("remaining_balance"),
            "installment_amount": active_loan.get("installment_amount")
        } if active_loan else None,
        "vacation_days_available": employee.get("vacation_days_available", 14)
    }
