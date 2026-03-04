# routers/people_ops.py - People Operations / RRHH Routes
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from config import db
from models.auth import User
from models.people_ops import (
    CostCenterCreate, CostCenter, CostCenterUpdate,
    EmployeeCreate, Employee, EmployeeUpdate,
    SalaryChangeCreate, SalaryChange,
    EmployeeDocumentCreate, EmployeeDocument,
    PayrollConfigCreate, PayrollConfig,
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
