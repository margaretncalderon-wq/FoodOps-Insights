# routers/people_ops.py - People Operations / RRHH Routes
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import csv
import io

from config import db
from models.auth import User
from models.people_ops import (
    DepartmentCreate, Department, DepartmentUpdate,
    CostCenterCreate, CostCenter, CostCenterUpdate, CostCenterBudgetUpdate,
    EmployeeCreate, Employee, EmployeeUpdate,
    SalaryChangeCreate, SalaryChange,
    EmployeeDocumentCreate, EmployeeDocument,
    PayrollConfigCreate, PayrollConfig,
    PayrollPeriodCreate, PayrollPeriod, PayrollStatus,
    PayrollEntryCreate, PayrollEntry, PayrollEntryUpdate,
    PaymentFrequency,
    calculate_monthly_isr,
    get_country_overtime_defaults,
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


# ==================== DEPARTMENTS ====================

@people_ops_router.get("/departments")
async def get_departments_list(user: User = Depends(get_current_user)):
    """Get all departments for the organization with employee/cost center counts"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    departments = await db.departments.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("display_order", 1).to_list(100)
    
    # Get counts for each department
    for dept in departments:
        dept_id = dept.get("department_id")
        
        # Count employees
        emp_count = await db.employees.count_documents({
            "company_id": company_id,
            "department_id": dept_id,
            "status": {"$ne": "terminated"}
        })
        dept["employee_count"] = emp_count
        
        # Count cost centers
        cc_count = await db.cost_centers.count_documents({
            "company_id": company_id,
            "department_id": dept_id
        })
        dept["cost_center_count"] = cc_count
    
    return departments


@people_ops_router.post("/departments")
async def create_department(
    data: DepartmentCreate,
    user: User = Depends(get_current_user)
):
    """Create a new department"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    # Check for duplicates
    existing = await db.departments.find_one({
        "company_id": company_id,
        "name": data.name
    })
    if existing:
        raise HTTPException(status_code=400, detail="Department with this name already exists")
    
    now = datetime.now(timezone.utc)
    department_id = f"dept_{uuid.uuid4().hex[:12]}"
    
    # Get head user name if provided
    head_name = None
    if data.head_user_id:
        head_user = await db.users.find_one(
            {"user_id": data.head_user_id},
            {"_id": 0, "name": 1}
        )
        head_name = head_user.get("name") if head_user else None
    
    doc = {
        "department_id": department_id,
        "company_id": company_id,
        "name": data.name,
        "code": data.code,
        "description": data.description,
        "head_user_id": data.head_user_id,
        "head_name": head_name,
        "parent_department_id": data.parent_department_id,
        "display_order": data.display_order,
        "is_active": data.is_active,
        "employee_count": 0,
        "cost_center_count": 0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.departments.insert_one(doc)
    del doc["_id"]
    
    return doc


@people_ops_router.get("/departments/{department_id}")
async def get_department(
    department_id: str,
    user: User = Depends(get_current_user)
):
    """Get a specific department with details"""
    company_id = user.company_id or user.active_org_id
    
    dept = await db.departments.find_one(
        {"company_id": company_id, "department_id": department_id},
        {"_id": 0}
    )
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Get employees in this department
    employees = await db.employees.find(
        {"company_id": company_id, "department_id": department_id, "status": {"$ne": "terminated"}},
        {"_id": 0, "employee_id": 1, "full_name": 1, "job_title": 1, "profile_photo": 1}
    ).to_list(100)
    dept["employees"] = employees
    
    # Get cost centers in this department
    cost_centers = await db.cost_centers.find(
        {"company_id": company_id, "department_id": department_id},
        {"_id": 0, "cost_center_id": 1, "name": 1, "code": 1, "annual_budget": 1}
    ).to_list(50)
    dept["cost_centers"] = cost_centers
    
    return dept


@people_ops_router.put("/departments/{department_id}")
async def update_department(
    department_id: str,
    data: DepartmentUpdate,
    user: User = Depends(get_current_user)
):
    """Update a department"""
    company_id = user.company_id or user.active_org_id
    now = datetime.now(timezone.utc)
    
    # Verify exists
    existing = await db.departments.find_one(
        {"company_id": company_id, "department_id": department_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Department not found")
    
    update_doc = {"updated_at": now.isoformat()}
    
    if data.name is not None:
        update_doc["name"] = data.name
    if data.code is not None:
        update_doc["code"] = data.code
    if data.description is not None:
        update_doc["description"] = data.description
    if data.head_user_id is not None:
        update_doc["head_user_id"] = data.head_user_id
        # Get head name
        if data.head_user_id:
            head_user = await db.users.find_one(
                {"user_id": data.head_user_id},
                {"_id": 0, "name": 1}
            )
            update_doc["head_name"] = head_user.get("name") if head_user else None
        else:
            update_doc["head_name"] = None
    if data.parent_department_id is not None:
        update_doc["parent_department_id"] = data.parent_department_id
    if data.display_order is not None:
        update_doc["display_order"] = data.display_order
    if data.is_active is not None:
        update_doc["is_active"] = data.is_active
    
    await db.departments.update_one(
        {"department_id": department_id},
        {"$set": update_doc}
    )
    
    # Also update denormalized name in employees if name changed
    if data.name is not None:
        await db.employees.update_many(
            {"company_id": company_id, "department_id": department_id},
            {"$set": {"department": data.name}}
        )
    
    updated = await db.departments.find_one(
        {"department_id": department_id},
        {"_id": 0}
    )
    return updated


@people_ops_router.delete("/departments/{department_id}")
async def delete_department(
    department_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a department (soft delete - set inactive)"""
    company_id = user.company_id or user.active_org_id
    
    # Check if has employees or cost centers
    emp_count = await db.employees.count_documents({
        "company_id": company_id,
        "department_id": department_id,
        "status": {"$ne": "terminated"}
    })
    if emp_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete department with {emp_count} active employees. Reassign them first."
        )
    
    cc_count = await db.cost_centers.count_documents({
        "company_id": company_id,
        "department_id": department_id
    })
    if cc_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {cc_count} cost centers. Reassign them first."
        )
    
    # Soft delete
    await db.departments.update_one(
        {"department_id": department_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Department deactivated", "department_id": department_id}



# ==================== POSITIONS ====================

@people_ops_router.get("/positions")
async def get_positions(user: User = Depends(get_current_user)):
    """Get all positions for the organization"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")

    positions = await db.positions.find(
        {"company_id": company_id, "is_active": {"$ne": False}},
        {"_id": 0}
    ).sort("display_order", 1).to_list(200)

    for pos in positions:
        pos["employee_count"] = await db.employees.count_documents({
            "company_id": company_id,
            "position_id": pos["position_id"],
            "status": {"$ne": "terminated"}
        })

    return positions


@people_ops_router.post("/positions")
async def create_position(request: Request, user: User = Depends(get_current_user)):
    """Create a new position"""
    data = await request.json()
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")

    position_id = f"pos_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    doc = {
        "position_id": position_id,
        "company_id": company_id,
        "title": data.get("title", ""),
        "department_id": data.get("department_id"),
        "level": data.get("level", ""),
        "description": data.get("description", ""),
        "reports_to_position_id": data.get("reports_to_position_id"),
        "is_active": True,
        "display_order": data.get("display_order", 0),
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.positions.insert_one(doc)
    doc.pop("_id", None)
    doc["employee_count"] = 0
    return doc


@people_ops_router.put("/positions/{position_id}")
async def update_position(position_id: str, request: Request, user: User = Depends(get_current_user)):
    """Update a position"""
    data = await request.json()
    company_id = user.company_id or user.active_org_id

    existing = await db.positions.find_one(
        {"position_id": position_id, "company_id": company_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Position not found")

    allowed = ["title", "department_id", "level", "description", "reports_to_position_id", "display_order", "is_active"]
    updates = {k: data[k] for k in allowed if k in data}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.positions.update_one(
        {"position_id": position_id},
        {"$set": updates}
    )

    updated = await db.positions.find_one({"position_id": position_id}, {"_id": 0})
    updated["employee_count"] = await db.employees.count_documents({
        "company_id": company_id, "position_id": position_id, "status": {"$ne": "terminated"}
    })
    return updated


@people_ops_router.delete("/positions/{position_id}")
async def delete_position(position_id: str, user: User = Depends(get_current_user)):
    """Deactivate a position"""
    company_id = user.company_id or user.active_org_id
    existing = await db.positions.find_one(
        {"position_id": position_id, "company_id": company_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Position not found")

    emp_count = await db.employees.count_documents({
        "position_id": position_id, "status": {"$ne": "terminated"}
    })
    if emp_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete position with {emp_count} assigned employees")

    await db.positions.update_one(
        {"position_id": position_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Position deactivated", "position_id": position_id}



@people_ops_router.get("/org-chart")
async def get_org_chart(user: User = Depends(get_current_user)):
    """Get full org chart data: departments, positions with assigned employees, and vacancies"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")

    departments = await db.departments.find(
        {"company_id": company_id, "is_active": {"$ne": False}},
        {"_id": 0}
    ).sort("display_order", 1).to_list(200)

    positions = await db.positions.find(
        {"company_id": company_id, "is_active": {"$ne": False}},
        {"_id": 0}
    ).sort("display_order", 1).to_list(500)

    employees = await db.employees.find(
        {"company_id": company_id, "status": {"$ne": "terminated"}},
        {"_id": 0, "employee_id": 1, "full_name": 1, "first_name": 1, "last_name": 1,
         "email": 1, "job_title": 1, "department": 1, "department_id": 1,
         "position_id": 1, "contract_type": 1, "status": 1, "is_manager": 1,
         "hire_date": 1}
    ).to_list(2000)

    # Get open job postings (vacancies)
    vacancies = await db.job_postings.find(
        {"company_id": company_id, "status": "open"},
        {"_id": 0, "id": 1, "title": 1, "department": 1, "position_id": 1, "status": 1}
    ).to_list(200)

    # Build position map with employees
    pos_employees = {}
    for emp in employees:
        pid = emp.get("position_id")
        if pid:
            pos_employees.setdefault(pid, []).append(emp)

    # Build position map with vacancies
    pos_vacancies = {}
    for v in vacancies:
        pid = v.get("position_id")
        if pid:
            pos_vacancies.setdefault(pid, []).append(v)

    # Enrich positions
    for pos in positions:
        pid = pos["position_id"]
        pos["employees"] = pos_employees.get(pid, [])
        pos["vacancies"] = pos_vacancies.get(pid, [])
        pos["is_vacant"] = len(pos["employees"]) == 0
        pos["has_open_vacancy"] = len(pos["vacancies"]) > 0

    # Employees not assigned to any position
    assigned_emp_ids = set()
    for emps in pos_employees.values():
        for e in emps:
            assigned_emp_ids.add(e["employee_id"])
    unassigned_employees = [e for e in employees if e["employee_id"] not in assigned_emp_ids]

    return {
        "departments": departments,
        "positions": positions,
        "employees": employees,
        "vacancies": vacancies,
        "unassigned_employees": unassigned_employees
    }


@people_ops_router.patch("/employees/{employee_id}/assign-position")
async def assign_employee_position(employee_id: str, request: Request, user: User = Depends(get_current_user)):
    """Assign an employee to a position and department"""
    company_id, _ = await check_people_ops_access(user, "edit")
    data = await request.json()

    update = {}
    if "position_id" in data:
        update["position_id"] = data["position_id"]
        # Auto-set department from position
        if data["position_id"]:
            pos = await db.positions.find_one(
                {"position_id": data["position_id"], "company_id": company_id},
                {"_id": 0, "department_id": 1, "title": 1}
            )
            if pos:
                update["job_title"] = pos.get("title", "")
                dept_id = pos.get("department_id")
                if dept_id:
                    dept = await db.departments.find_one(
                        {"department_id": dept_id},
                        {"_id": 0, "name": 1}
                    )
                    update["department_id"] = dept_id
                    update["department"] = dept.get("name", "") if dept else ""

    if "department_id" in data and "position_id" not in data:
        update["department_id"] = data["department_id"]
        dept = await db.departments.find_one(
            {"department_id": data["department_id"]},
            {"_id": 0, "name": 1}
        )
        update["department"] = dept.get("name", "") if dept else ""

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await db.employees.update_one(
        {"employee_id": employee_id, "company_id": company_id},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")

    return {"message": "Position assigned", "updated": update}


# ==================== COST CENTERS ====================

@people_ops_router.get("/cost-centers")
async def get_cost_centers(user: User = Depends(get_current_user)):
    """Get all cost centers for the organization with calculated spend"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    cost_centers = await db.cost_centers.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    
    # Calculate current spend for each cost center from:
    # 1. Fixed Cost Categories linked to this cost center
    # 2. Payables assigned to this cost center
    # 3. Employee salaries in this cost center
    
    for cc in cost_centers:
        cc_id = cc.get("cost_center_id")
        total_spend = 0.0
        
        # 1. Get Fixed Cost actual from analysis (payables assigned to fixed cost categories linked to this CC)
        linked_categories = await db.fixed_cost_categories.find(
            {"company_id": company_id, "cost_center_id": cc_id},
            {"_id": 0, "category_id": 1}
        ).to_list(50)
        
        if linked_categories:
            cat_ids = [c["category_id"] for c in linked_categories]
            # Sum payables linked to these fixed cost categories
            payables_pipeline = [
                {"$match": {
                    "company_id": company_id,
                    "fixed_cost_category_id": {"$in": cat_ids},
                    "status": {"$ne": "cancelled"}
                }},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
            ]
            payables_result = await db.supplier_payables.aggregate(payables_pipeline).to_list(1)
            if payables_result:
                total_spend += payables_result[0].get("total", 0)
        
        # 2. Get payables directly assigned to this cost center
        direct_payables_pipeline = [
            {"$match": {
                "company_id": company_id,
                "cost_center": cc.get("code") or cc.get("name"),
                "status": {"$ne": "cancelled"}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        direct_result = await db.supplier_payables.aggregate(direct_payables_pipeline).to_list(1)
        if direct_result:
            total_spend += direct_result[0].get("total", 0)
        
        # 3. Get employee salary costs (monthly) for this cost center
        employees_pipeline = [
            {"$match": {
                "company_id": company_id,
                "cost_center": cc.get("code") or cc.get("name"),
                "status": "active"
            }},
            {"$group": {"_id": None, "total_salary": {"$sum": "$base_salary"}}}
        ]
        emp_result = await db.employees.aggregate(employees_pipeline).to_list(1)
        if emp_result:
            total_spend += emp_result[0].get("total_salary", 0)
        
        cc["current_spend"] = round(total_spend, 2)
        
        # Calculate utilization percentage if budget exists
        if cc.get("annual_budget") and cc["annual_budget"] > 0:
            cc["utilization"] = round((total_spend / cc["annual_budget"]) * 100, 1)
        else:
            cc["utilization"] = None
    
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
        "department_id": data.department_id,
        "department_name": None,  # Will be populated below
        "annual_budget": data.annual_budget,
        "current_spend": 0.0,
        "responsible_user_id": data.responsible_user_id,
        "responsible_name": responsible_name,
        "is_active": data.is_active,
        "is_system": data.is_system,
        # Extended fields
        "parent_cost_center_id": data.parent_cost_center_id,
        "cc_type": data.cc_type,
        "default_budget_enabled": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # Get department name if provided
    if data.department_id:
        dept = await db.departments.find_one(
            {"department_id": data.department_id},
            {"_id": 0, "name": 1}
        )
        doc["department_name"] = dept.get("name") if dept else None
    
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


@people_ops_router.get("/cost-centers/{cost_center_id}/usage")
async def get_cost_center_usage(
    cost_center_id: str,
    user: User = Depends(get_current_user)
):
    """Check if a cost center has associated data (employees, transactions, etc.)"""
    company_id = user.company_id or user.active_org_id
    
    # Check employees
    employees_count = await db.employees.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    # Check purchase orders
    po_count = await db.purchase_orders.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    # Check expenses
    expenses_count = await db.expenses.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    # Check budgets
    budgets_count = await db.cost_center_budgets.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    has_usage = employees_count > 0 or po_count > 0 or expenses_count > 0
    
    return {
        "cost_center_id": cost_center_id,
        "has_usage": has_usage,
        "employees": employees_count,
        "purchase_orders": po_count,
        "expenses": expenses_count,
        "budgets": budgets_count,
        "can_hard_delete": not has_usage
    }


@people_ops_router.delete("/cost-centers/{cost_center_id}")
async def delete_cost_center(
    cost_center_id: str,
    force: bool = False,
    user: User = Depends(get_current_user)
):
    """Delete a cost center. If it has transactions, soft delete (deactivate). Use force=true to delete anyway."""
    company_id = user.company_id or user.active_org_id
    
    # Check if cost center has employees assigned
    employees_count = await db.employees.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    # Check if cost center has purchase orders
    po_count = await db.purchase_orders.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    # Check if cost center has expenses
    expenses_count = await db.expenses.count_documents({
        "company_id": company_id,
        "cost_center_id": cost_center_id
    })
    
    has_transactions = employees_count > 0 or po_count > 0 or expenses_count > 0
    
    if has_transactions and not force:
        # Soft delete - just deactivate
        await db.cost_centers.update_one(
            {"cost_center_id": cost_center_id, "company_id": company_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {
            "message": "Cost center deactivated",
            "soft_delete": True,
            "reason": {
                "employees": employees_count,
                "purchase_orders": po_count,
                "expenses": expenses_count
            }
        }
    
    # Hard delete
    result = await db.cost_centers.delete_one({
        "cost_center_id": cost_center_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    # Also delete associated budgets
    await db.cost_center_budgets.delete_many({
        "cost_center_id": cost_center_id,
        "company_id": company_id
    })
    
    return {"message": "Cost center deleted", "soft_delete": False}


@people_ops_router.put("/cost-centers/{cost_center_id}/budget")
async def update_cost_center_budget(
    cost_center_id: str,
    data: CostCenterBudgetUpdate,
    user: User = Depends(get_current_user)
):
    """
    Update budget for a specific period.
    
    budget_type: "annual" | "quarterly" | "monthly"
    year: 2026
    period: 1-4 for quarterly, 1-12 for monthly (ignored for annual)
    amount: budget amount
    """
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    now = datetime.now(timezone.utc)
    
    # Build update based on budget type
    update_data = {"updated_at": now.isoformat()}
    
    if data.budget_type == "annual":
        update_data["annual_budget"] = data.amount
        # Also distribute to quarterly and monthly if not set
        quarterly_amount = data.amount / 4
        monthly_amount = data.amount / 12
        update_data["quarterly_budgets"] = {
            f"{data.year}-Q1": quarterly_amount,
            f"{data.year}-Q2": quarterly_amount,
            f"{data.year}-Q3": quarterly_amount,
            f"{data.year}-Q4": quarterly_amount
        }
        update_data["monthly_budgets"] = {
            f"{data.year}-{str(m).zfill(2)}": monthly_amount
            for m in range(1, 13)
        }
    
    elif data.budget_type == "quarterly":
        if not data.period or data.period < 1 or data.period > 4:
            raise HTTPException(status_code=400, detail="Quarter must be 1-4")
        
        key = f"{data.year}-Q{data.period}"
        # Get existing quarterly budgets
        existing = await db.cost_centers.find_one(
            {"cost_center_id": cost_center_id, "company_id": company_id},
            {"_id": 0, "quarterly_budgets": 1, "monthly_budgets": 1}
        )
        quarterly_budgets = existing.get("quarterly_budgets", {}) if existing else {}
        monthly_budgets = existing.get("monthly_budgets", {}) if existing else {}
        
        quarterly_budgets[key] = data.amount
        update_data["quarterly_budgets"] = quarterly_budgets
        
        # Distribute to months in this quarter
        monthly_amount = data.amount / 3
        start_month = (data.period - 1) * 3 + 1
        for m in range(start_month, start_month + 3):
            monthly_budgets[f"{data.year}-{str(m).zfill(2)}"] = monthly_amount
        update_data["monthly_budgets"] = monthly_budgets
        
        # Update annual as sum of quarterly
        total_annual = sum(quarterly_budgets.values())
        update_data["annual_budget"] = total_annual
    
    elif data.budget_type == "monthly":
        if not data.period or data.period < 1 or data.period > 12:
            raise HTTPException(status_code=400, detail="Month must be 1-12")
        
        key = f"{data.year}-{str(data.period).zfill(2)}"
        # Get existing monthly budgets
        existing = await db.cost_centers.find_one(
            {"cost_center_id": cost_center_id, "company_id": company_id},
            {"_id": 0, "monthly_budgets": 1, "quarterly_budgets": 1}
        )
        monthly_budgets = existing.get("monthly_budgets", {}) if existing else {}
        quarterly_budgets = existing.get("quarterly_budgets", {}) if existing else {}
        
        monthly_budgets[key] = data.amount
        update_data["monthly_budgets"] = monthly_budgets
        
        # Recalculate quarterly from monthly
        quarter = (data.period - 1) // 3 + 1
        q_key = f"{data.year}-Q{quarter}"
        q_start = (quarter - 1) * 3 + 1
        q_total = sum(
            monthly_budgets.get(f"{data.year}-{str(m).zfill(2)}", 0)
            for m in range(q_start, q_start + 3)
        )
        quarterly_budgets[q_key] = q_total
        update_data["quarterly_budgets"] = quarterly_budgets
        
        # Update annual as sum of all monthly for the year
        total_annual = sum(
            v for k, v in monthly_budgets.items() if k.startswith(str(data.year))
        )
        update_data["annual_budget"] = total_annual
    
    else:
        raise HTTPException(status_code=400, detail="Invalid budget_type. Use: annual, quarterly, monthly")
    
    result = await db.cost_centers.update_one(
        {"cost_center_id": cost_center_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    return {"message": f"Budget updated for {data.budget_type}", "updated": update_data}


@people_ops_router.get("/cost-centers/{cost_center_id}/budgets")
async def get_cost_center_budgets(
    cost_center_id: str,
    year: int = None,
    user: User = Depends(get_current_user)
):
    """Get all budget data for a cost center"""
    company_id = user.company_id or user.active_org_id
    year = year or datetime.now().year
    
    cc = await db.cost_centers.find_one(
        {"cost_center_id": cost_center_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    
    monthly = cc.get("monthly_budgets", {})
    quarterly = cc.get("quarterly_budgets", {})
    annual = cc.get("annual_budget", 0) or 0
    
    # Filter by year
    monthly_filtered = {k: v for k, v in monthly.items() if k.startswith(str(year))}
    quarterly_filtered = {k: v for k, v in quarterly.items() if k.startswith(str(year))}
    
    return {
        "cost_center": {
            "cost_center_id": cc.get("cost_center_id"),
            "name": cc.get("name"),
            "code": cc.get("code")
        },
        "year": year,
        "annual_budget": annual,
        "quarterly_budgets": quarterly_filtered,
        "monthly_budgets": monthly_filtered,
        "total_from_monthly": sum(monthly_filtered.values()),
        "total_from_quarterly": sum(quarterly_filtered.values())
    }


# ==================== JOB ROLES ====================

@people_ops_router.get("/job-roles")
async def get_job_roles(user: User = Depends(get_current_user)):
    """Get all job roles for the company"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    roles = await db.job_roles.find(
        {"company_id": company_id, "is_active": {"$ne": False}},
        {"_id": 0}
    ).sort("title", 1).to_list(500)
    
    # Get employee count per role
    for role in roles:
        count = await db.employees.count_documents({
            "company_id": company_id,
            "job_role_id": role.get("job_role_id"),
            "status": "active"
        })
        role["employee_count"] = count
    
    return roles


@people_ops_router.post("/job-roles")
async def create_job_role(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new job role"""
    company_id = user.company_id or user.active_org_id
    if not company_id:
        raise HTTPException(status_code=400, detail="No organization context")
    
    if not data.get("title"):
        raise HTTPException(status_code=400, detail="Title is required")
    
    now = datetime.now(timezone.utc)
    job_role = {
        "job_role_id": str(uuid.uuid4()),
        "company_id": company_id,
        "title": data.get("title"),
        "description": data.get("description", ""),
        "department_id": data.get("department_id"),
        "level": data.get("level"),  # e.g., "junior", "mid", "senior", "lead", "manager", "director"
        "min_salary": data.get("min_salary"),
        "max_salary": data.get("max_salary"),
        "requirements": data.get("requirements", []),
        "responsibilities": data.get("responsibilities", []),
        "is_active": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.job_roles.insert_one(job_role)
    job_role.pop("_id", None)
    
    return job_role


@people_ops_router.put("/job-roles/{job_role_id}")
async def update_job_role(
    job_role_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a job role"""
    company_id = user.company_id or user.active_org_id
    
    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    allowed_fields = ["title", "description", "department_id", "level", 
                      "min_salary", "max_salary", "requirements", "responsibilities", "is_active"]
    
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]
    
    result = await db.job_roles.update_one(
        {"job_role_id": job_role_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job role not found")
    
    return {"message": "Job role updated"}


@people_ops_router.delete("/job-roles/{job_role_id}")
async def delete_job_role(
    job_role_id: str,
    user: User = Depends(get_current_user)
):
    """Delete a job role (soft delete if has employees)"""
    company_id = user.company_id or user.active_org_id
    
    # Check if any employees have this role
    employee_count = await db.employees.count_documents({
        "company_id": company_id,
        "job_role_id": job_role_id
    })
    
    if employee_count > 0:
        # Soft delete
        await db.job_roles.update_one(
            {"job_role_id": job_role_id, "company_id": company_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": f"Job role deactivated ({employee_count} employees have this role)", "soft_delete": True}
    
    # Hard delete
    result = await db.job_roles.delete_one({
        "job_role_id": job_role_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job role not found")
    
    return {"message": "Job role deleted", "soft_delete": False}


@people_ops_router.get("/job-roles/{job_role_id}")
async def get_job_role(
    job_role_id: str,
    user: User = Depends(get_current_user)
):
    """Get a single job role with details"""
    company_id = user.company_id or user.active_org_id
    
    role = await db.job_roles.find_one(
        {"job_role_id": job_role_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not role:
        raise HTTPException(status_code=404, detail="Job role not found")
    
    # Get employees with this role
    employees = await db.employees.find(
        {"company_id": company_id, "job_role_id": job_role_id, "status": "active"},
        {"_id": 0, "employee_id": 1, "full_name": 1, "department": 1}
    ).to_list(100)
    
    role["employees"] = employees
    role["employee_count"] = len(employees)
    
    return role


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
        "job_role_id": data.job_role_id,
        "department": data.department,
        "department_id": data.department_id,
        "cost_center_id": data.cost_center_id,
        "cost_center_name": cost_center_name,
        "manager_id": data.manager_id,
        "manager_name": manager_name,
        "is_manager": data.is_manager,
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
    """Get list of departments - merged from org structure and employee records"""
    company_id = user.company_id or user.active_org_id
    
    # Get departments from org structure (db.departments)
    org_depts = await db.departments.find(
        {"company_id": company_id},
        {"_id": 0, "name": 1}
    ).to_list(200)
    org_dept_names = [d["name"] for d in org_depts if d.get("name")]
    
    # Get departments from employee records (legacy)
    emp_depts = await db.employees.distinct("department", {"company_id": company_id})
    emp_dept_names = [d for d in emp_depts if d]
    
    # Merge and deduplicate
    all_depts = sorted(set(org_dept_names + emp_dept_names))
    return all_depts


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
    
    # Resolve country: payroll_config.country_code → company.country_code/country → "DO" legacy default
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "country": 1, "country_code": 1})
    raw_country = (config or {}).get("country_code") if config else None
    if not raw_country and company:
        raw_country = company.get("country_code") or company.get("country")
    
    # Normalize country names → ISO-2 codes (lightweight mapping)
    _country_aliases = {
        "republica dominicana": "DO", "república dominicana": "DO", "dominican republic": "DO",
        "mexico": "MX", "méxico": "MX",
        "colombia": "CO",
        "united states": "US", "usa": "US", "us": "US", "estados unidos": "US",
        "spain": "ES", "españa": "ES",
        "puerto rico": "PR",
        "argentina": "AR",
        "chile": "CL",
        "peru": "PE", "perú": "PE",
    }
    key = (raw_country or "").strip().lower()
    if key in _country_aliases:
        country_code = _country_aliases[key]
    elif raw_country and len(raw_country) == 2:
        country_code = raw_country.upper()
    else:
        country_code = "DO"  # safe default
    
    ot_defaults = get_country_overtime_defaults(country_code)
    
    if not config:
        # Return default config (with country-aware OT rates)
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
            "overtime_rate_35": ot_defaults["overtime_rate_35"],
            "overtime_rate_night": ot_defaults["overtime_rate_night"],
            "overtime_rate_holiday": ot_defaults["overtime_rate_holiday"],
            "overtime_rate_100": ot_defaults["overtime_rate_100"],
            "overtime_hours_per_month": ot_defaults["overtime_hours_per_month"],
            "country_code": country_code,
            "include_regalia": True,
            "regalia_months": 12
        }
    
    # Backfill new fields on legacy configs
    config.setdefault("overtime_rate_night", ot_defaults["overtime_rate_night"])
    config.setdefault("overtime_rate_holiday", config.get("overtime_rate_100", ot_defaults["overtime_rate_holiday"]))
    config.setdefault("overtime_hours_per_month", ot_defaults["overtime_hours_per_month"])
    config.setdefault("country_code", country_code)
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
        "overtime_rate_night": data.overtime_rate_night,
        "overtime_rate_holiday": data.overtime_rate_holiday,
        "overtime_rate_100": data.overtime_rate_100,
        "overtime_hours_per_month": data.overtime_hours_per_month,
        "country_code": (data.country_code or "").upper()[:2] or None,
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
    """Create a new payroll period and generate entries for all active employees.
    
    payment_kind:
      - "regular": full payroll (salario + OT + bonos - deducciones)
      - "overtime_only": only pays approved overtime in the range (no salary, no AFP/ARS/ISR)
    """
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    period_id = f"period_{uuid.uuid4().hex[:12]}"
    payment_kind = (data.payment_kind or "regular").lower()
    if payment_kind not in ("regular", "overtime_only"):
        raise HTTPException(status_code=400, detail="payment_kind must be 'regular' or 'overtime_only'")
    
    # Get payroll config (with country-aware OT rates already backfilled)
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0})
    if not config:
        company = await db.companies.find_one({"company_id": company_id}, {"_id": 0, "country": 1, "country_code": 1})
        cc = (company or {}).get("country_code") or (company or {}).get("country") or "DO"
        ot_def = get_country_overtime_defaults(cc)
        config = {
            "afp_employee_rate": 2.87, "afp_employer_rate": 7.10,
            "ars_employee_rate": 3.04, "ars_employer_rate": 7.09,
            "srl_rate": 1.20, "infotep_rate": 1.0,
            "isr_enabled": True,
            "overtime_rate_35": ot_def["overtime_rate_35"],
            "overtime_rate_night": ot_def["overtime_rate_night"],
            "overtime_rate_holiday": ot_def["overtime_rate_holiday"],
            "overtime_rate_100": ot_def["overtime_rate_100"],
            "overtime_hours_per_month": ot_def["overtime_hours_per_month"],
        }
    
    rate_35 = config.get("overtime_rate_35", 1.35)
    rate_night = config.get("overtime_rate_night", 1.15)
    rate_holiday = config.get("overtime_rate_holiday", 2.0)
    rate_100 = config.get("overtime_rate_100", 2.0)
    hours_per_month = config.get("overtime_hours_per_month", 192.0) or 192.0
    
    # Auto-generate period_name if missing
    period_name = (data.period_name or "").strip()
    if not period_name:
        try:
            start_dt = datetime.strptime(data.start_date, "%Y-%m-%d")
            month_name = start_dt.strftime("%B")
            year = start_dt.year
            if data.period_type == PaymentFrequency.BIWEEKLY:
                half = "1" if start_dt.day <= 15 else "2"
                prefix = "Horas Extras" if payment_kind == "overtime_only" else "Quincena"
                period_name = f"{prefix} {half} - {month_name} {year}"
            elif data.period_type == PaymentFrequency.MONTHLY:
                prefix = "Horas Extras" if payment_kind == "overtime_only" else "Nómina"
                period_name = f"{prefix} {month_name} {year}"
            else:
                period_name = f"{month_name} {year}"
        except Exception:
            period_name = f"Nómina {data.start_date} → {data.end_date}"
    
    # Create period
    period_doc = {
        "period_id": period_id,
        "company_id": company_id,
        "period_name": period_name,
        "period_type": data.period_type.value,
        "payment_kind": payment_kind,
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
    
    # ---- Collect approved & unpaid OT entries to include in this period
    # Match by date range (date is YYYY-MM-DD string)
    ot_query: dict = {
        "company_id": company_id,
        "status": "approved",
        "date": {"$gte": data.start_date, "$lte": data.end_date},
        # not already attached to another period
        "$or": [{"payroll_period_id": None}, {"payroll_period_id": {"$exists": False}}],
    }
    if data.include_overtime_ids:
        ot_query = {"company_id": company_id, "overtime_id": {"$in": data.include_overtime_ids}}
    
    include_ot = data.auto_include_overtime
    ot_by_employee: dict = {}
    if include_ot:
        ot_list = await db.overtime_requests.find(ot_query, {"_id": 0}).to_list(2000)
        for ot in ot_list:
            emp_id = ot.get("employee_id")
            if not emp_id:
                continue
            acc = ot_by_employee.setdefault(emp_id, {"hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0, "ot_ids": []})
            acc["hours_35"] += float(ot.get("hours_35") or 0)
            acc["hours_night"] += float(ot.get("hours_night") or 0)
            acc["hours_holiday"] += float(ot.get("hours_holiday") or 0)
            acc["hours_100"] += float(ot.get("hours_100") or 0)
            acc["ot_ids"].append(ot.get("overtime_id"))
    
    # Get employees: for "overtime_only" only employees with OT in range; for "regular" all active
    if payment_kind == "overtime_only":
        emp_ids = list(ot_by_employee.keys())
        employees = await db.employees.find(
            {"company_id": company_id, "employee_id": {"$in": emp_ids}},
            {"_id": 0}
        ).to_list(1000) if emp_ids else []
    else:
        employees = await db.employees.find(
            {"company_id": company_id, "status": "active"},
            {"_id": 0}
        ).to_list(1000)
    
    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0
    total_employer_cost = 0.0
    
    for emp in employees:
        base_salary = float(emp.get("base_salary") or 0)
        freq = emp.get("payment_frequency", "biweekly")
        
        # period_salary = how much salary this employee gets for this period
        if payment_kind == "overtime_only":
            period_salary = 0.0
        else:
            if freq == "monthly" and data.period_type.value == "biweekly":
                period_salary = base_salary / 2
            elif freq == "biweekly" and data.period_type.value == "monthly":
                period_salary = base_salary * 2
            else:
                period_salary = base_salary
        
        # Hourly rate derived from MONTHLY salary equivalent
        monthly_salary_eq = base_salary if freq == "monthly" else (base_salary * 2 if freq == "biweekly" else base_salary * 4)
        hourly_rate = (monthly_salary_eq / hours_per_month) if hours_per_month else 0
        
        # Pull OT for this employee
        ot_data = ot_by_employee.get(emp.get("employee_id"), {"hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0, "ot_ids": []})
        h35, hn, hh, h100 = ot_data["hours_35"], ot_data["hours_night"], ot_data["hours_holiday"], ot_data["hours_100"]
        amt_35 = h35 * hourly_rate * rate_35
        amt_night = hn * hourly_rate * rate_night
        amt_holiday = hh * hourly_rate * rate_holiday
        amt_100 = h100 * hourly_rate * rate_100
        ot_total = amt_35 + amt_night + amt_holiday + amt_100
        
        gross_salary = period_salary + ot_total
        
        # Deductions (only for regular payroll; overtime-only periods have no AFP/ARS/ISR by default)
        if payment_kind == "overtime_only":
            afp_emp = ars_emp = period_isr = loan_deduction = 0.0
            loan_id = None
            afp_employer = ars_employer = srl_employer = infotep_employer = 0.0
        else:
            afp_emp = period_salary * (config.get("afp_employee_rate", 2.87) / 100)
            ars_emp = period_salary * (config.get("ars_employee_rate", 3.04) / 100)
            monthly_salary = period_salary * 2 if data.period_type.value == "biweekly" else period_salary
            monthly_isr = calculate_monthly_isr(monthly_salary) if config.get("isr_enabled", True) else 0
            period_isr = monthly_isr / 2 if data.period_type.value == "biweekly" else monthly_isr
            
            loan_deduction = 0.0
            loan_id = None
            if emp.get("active_loan_balance", 0) > 0:
                active_loan = await db.loans.find_one({
                    "company_id": company_id,
                    "employee_id": emp.get("employee_id"),
                    "status": "active"
                }, {"_id": 0, "loan_id": 1, "installment_amount": 1, "remaining_balance": 1})
                if active_loan:
                    loan_id = active_loan.get("loan_id")
                    installment = active_loan.get("installment_amount", 0)
                    remaining = active_loan.get("remaining_balance", 0)
                    loan_deduction = min(installment, remaining)
            
            afp_employer = period_salary * (config.get("afp_employer_rate", 7.10) / 100)
            ars_employer = period_salary * (config.get("ars_employer_rate", 7.09) / 100)
            srl_employer = period_salary * (config.get("srl_rate", 1.20) / 100)
            infotep_employer = period_salary * (config.get("infotep_rate", 1.0) / 100)
        
        total_emp_deductions = afp_emp + ars_emp + period_isr + loan_deduction
        net_salary = gross_salary - total_emp_deductions
        employer_cost = period_salary + ot_total + afp_employer + ars_employer + srl_employer + infotep_employer
        
        entry_id = f"entry_{uuid.uuid4().hex[:12]}"
        entry_doc = {
            "entry_id": entry_id,
            "period_id": period_id,
            "company_id": company_id,
            "employee_id": emp.get("employee_id"),
            "employee_name": emp.get("full_name"),
            "employee_number": emp.get("employee_number"),
            "department": emp.get("department"),
            "cost_center_id": emp.get("cost_center_id"),
            "cost_center_name": emp.get("cost_center_name"),
            
            "base_salary": round(period_salary, 2),
            "overtime_hours_35": round(h35, 2),
            "overtime_amount_35": round(amt_35, 2),
            "overtime_hours_night": round(hn, 2),
            "overtime_amount_night": round(amt_night, 2),
            "overtime_hours_holiday": round(hh, 2),
            "overtime_amount_holiday": round(amt_holiday, 2),
            "overtime_hours_100": round(h100, 2),
            "overtime_amount_100": round(amt_100, 2),
            "bonus": 0,
            "commission": 0,
            "other_earnings": 0,
            "other_earnings_description": None,
            "gross_salary": round(gross_salary, 2),
            
            "afp_employee": round(afp_emp, 2),
            "ars_employee": round(ars_emp, 2),
            "isr": round(period_isr, 2),
            "loan_deduction": round(loan_deduction, 2),
            "loan_id": loan_id,
            "other_deductions": 0,
            "other_deductions_description": None,
            "extra_deductions": [],
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
            "linked_overtime_ids": ot_data["ot_ids"],
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await db.payroll_entries.insert_one(entry_doc)
        
        total_gross += gross_salary
        total_deductions += total_emp_deductions
        total_net += net_salary
        total_employer_cost += employer_cost
    
    # Link the consumed OT requests to this period (prevents double-payment)
    consumed_ot_ids = [oid for acc in ot_by_employee.values() for oid in acc["ot_ids"]]
    if consumed_ot_ids:
        await db.overtime_requests.update_many(
            {"company_id": company_id, "overtime_id": {"$in": consumed_ot_ids}},
            {"$set": {"payroll_period_id": period_id, "status": "processed", "updated_at": now.isoformat()}}
        )
    
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
    
    period_doc.pop("_id", None)
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
    """Update a payroll entry (add overtime hours, bonus, extra deductions, etc.)"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    entry = await db.payroll_entries.find_one(
        {"entry_id": entry_id, "company_id": company_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Payroll entry not found")
    
    period = await db.payroll_periods.find_one(
        {"period_id": entry.get("period_id")},
        {"_id": 0, "status": 1, "payment_kind": 1, "period_type": 1}
    )
    if period and period.get("status") not in ["draft", "pending_approval"]:
        raise HTTPException(status_code=400, detail="Cannot edit entries for processed payroll")
    
    payment_kind = (period or {}).get("payment_kind", "regular")
    period_type = (period or {}).get("period_type", "biweekly")
    
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0}) or {}
    rate_35 = config.get("overtime_rate_35", 1.35)
    rate_night = config.get("overtime_rate_night", 1.15)
    rate_holiday = config.get("overtime_rate_holiday", 2.0)
    rate_100 = config.get("overtime_rate_100", 2.0)
    hours_per_month = config.get("overtime_hours_per_month", 192.0) or 192.0
    
    now = datetime.now(timezone.utc)
    
    # Hourly rate from BASE salary (period_salary is biweekly→×2 for monthly)
    base = float(entry.get("base_salary") or 0)
    monthly_salary_eq = base * 2 if period_type == "biweekly" else base if period_type == "monthly" else base * 4
    hourly_rate = (monthly_salary_eq / hours_per_month) if hours_per_month else 0
    
    update_data: dict = {}
    
    if data.overtime_hours_35 is not None:
        update_data["overtime_hours_35"] = data.overtime_hours_35
        update_data["overtime_amount_35"] = round(data.overtime_hours_35 * hourly_rate * rate_35, 2)
    if data.overtime_hours_night is not None:
        update_data["overtime_hours_night"] = data.overtime_hours_night
        update_data["overtime_amount_night"] = round(data.overtime_hours_night * hourly_rate * rate_night, 2)
    if data.overtime_hours_holiday is not None:
        update_data["overtime_hours_holiday"] = data.overtime_hours_holiday
        update_data["overtime_amount_holiday"] = round(data.overtime_hours_holiday * hourly_rate * rate_holiday, 2)
    if data.overtime_hours_100 is not None:
        update_data["overtime_hours_100"] = data.overtime_hours_100
        update_data["overtime_amount_100"] = round(data.overtime_hours_100 * hourly_rate * rate_100, 2)
    
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
    if data.extra_deductions is not None:
        # Normalize each item: ensure id, amount float, reason str
        cleaned = []
        for item in data.extra_deductions:
            try:
                amt = float(item.get("amount") or 0)
            except (TypeError, ValueError):
                amt = 0
            if amt <= 0:
                continue
            cleaned.append({
                "id": item.get("id") or f"ded_{uuid.uuid4().hex[:8]}",
                "amount": round(amt, 2),
                "reason": (item.get("reason") or "").strip() or "Descuento"
            })
        update_data["extra_deductions"] = cleaned
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    # ---- Recalculate gross/deductions/net
    salary_for_period = base  # base_salary is already the period-adjusted amount
    ot_35 = update_data.get("overtime_amount_35", entry.get("overtime_amount_35", 0))
    ot_night = update_data.get("overtime_amount_night", entry.get("overtime_amount_night", 0))
    ot_holiday = update_data.get("overtime_amount_holiday", entry.get("overtime_amount_holiday", 0))
    ot_100 = update_data.get("overtime_amount_100", entry.get("overtime_amount_100", 0))
    bonus = update_data.get("bonus", entry.get("bonus", 0))
    commission = update_data.get("commission", entry.get("commission", 0))
    other_earn = update_data.get("other_earnings", entry.get("other_earnings", 0))
    
    gross = salary_for_period + ot_35 + ot_night + ot_holiday + ot_100 + bonus + commission + other_earn
    
    # AFP/ARS/ISR only on regular payroll
    if payment_kind == "overtime_only":
        afp_emp = ars_emp = period_isr = 0.0
    else:
        afp_rate = config.get("afp_employee_rate", 2.87) / 100
        ars_rate = config.get("ars_employee_rate", 3.04) / 100
        afp_emp = round(salary_for_period * afp_rate, 2)
        ars_emp = round(salary_for_period * ars_rate, 2)
        monthly_gross = salary_for_period * 2 if period_type == "biweekly" else salary_for_period
        monthly_isr = calculate_monthly_isr(monthly_gross) if config.get("isr_enabled", True) else 0
        period_isr = round((monthly_isr / 2) if period_type == "biweekly" else monthly_isr, 2)
    
    loan = update_data.get("loan_deduction", entry.get("loan_deduction", 0))
    other_ded = update_data.get("other_deductions", entry.get("other_deductions", 0))
    extra_list = update_data.get("extra_deductions", entry.get("extra_deductions", []) or [])
    extra_sum = round(sum(float(d.get("amount") or 0) for d in extra_list), 2)
    
    total_deductions = afp_emp + ars_emp + period_isr + loan + other_ded + extra_sum
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
    
    await recalculate_period_totals(entry.get("period_id"))
    
    return {"message": "Entry updated", "net_salary": round(net, 2), "total_deductions": round(total_deductions, 2)}


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
    
    # Update loan balances for employees and record loan payments
    entries = await db.payroll_entries.find(
        {"period_id": period_id, "loan_deduction": {"$gt": 0}},
        {"_id": 0, "employee_id": 1, "loan_deduction": 1, "loan_id": 1}
    ).to_list(1000)
    
    for entry in entries:
        loan_amount = entry["loan_deduction"]
        employee_id = entry["employee_id"]
        loan_id = entry.get("loan_id")
        
        # Update employee's active loan balance
        await db.employees.update_one(
            {"employee_id": employee_id},
            {"$inc": {"active_loan_balance": -loan_amount}}
        )
        
        # Update the loan record itself
        if loan_id:
            loan = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
            if loan:
                new_balance = max(0, loan.get("remaining_balance", 0) - loan_amount)
                new_paid = loan.get("total_paid", 0) + loan_amount
                new_installments_paid = loan.get("installments_paid", 0) + 1
                
                update_data = {
                    "remaining_balance": round(new_balance, 2),
                    "total_paid": round(new_paid, 2),
                    "installments_paid": new_installments_paid,
                    "updated_at": now
                }
                
                # Mark loan as paid if balance is 0
                if new_balance <= 0:
                    update_data["status"] = "paid"
                    update_data["paid_date"] = now.isoformat()[:10]
                    # Also clear employee's active loan balance
                    await db.employees.update_one(
                        {"employee_id": employee_id},
                        {"$set": {"active_loan_balance": 0}}
                    )
                
                await db.loans.update_one(
                    {"loan_id": loan_id},
                    {"$set": update_data}
                )
                
                # Record loan payment
                payment_record = {
                    "payment_id": f"lpay_{uuid.uuid4().hex[:12]}",
                    "loan_id": loan_id,
                    "company_id": company_id,
                    "employee_id": employee_id,
                    "amount": loan_amount,
                    "payment_type": "payroll_deduction",
                    "payroll_period_id": period_id,
                    "balance_after": round(new_balance, 2),
                    "created_at": now
                }
                await db.loan_payments.insert_one(payment_record)
    
    await db.payroll_periods.update_one(
        {"period_id": period_id},
        {"$set": {
            "status": PayrollStatus.COMPLETED.value,
            "processed_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    # Record accounting entries for this payroll period
    # This creates entries in the centralized accounting_entries collection
    from services.accounting_engine import AccountingEngine
    try:
        engine = AccountingEngine(db, company_id, user.user_id)
        accounting_result = await engine.record_payroll_period(
            period_id,
            period.get("period_name", f"Periodo {period_id[:8]}")
        )
    except Exception as e:
        # Log error but don't fail the payroll process
        print(f"Warning: Failed to record accounting entries for payroll {period_id}: {e}")
        accounting_result = {"entries_recorded": 0, "error": str(e)}
    
    return {
        "message": "Payroll processed",
        "accounting": {
            "entries_recorded": accounting_result.get("entries_recorded", 0),
            "total_amount": accounting_result.get("total_amount", 0)
        }
    }


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
    """Create an overtime request (supports 4 OT categories: normal, night, holiday, 100%)"""
    company_id = user.company_id or user.active_org_id
    
    employee_id = data.get("employee_id")
    employee = await db.employees.find_one(
        {"company_id": company_id, "employee_id": employee_id},
        {"_id": 0, "full_name": 1, "base_salary": 1, "payment_frequency": 1}
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    config = await db.payroll_config.find_one({"company_id": company_id}, {"_id": 0}) or {}
    rate_35 = config.get("overtime_rate_35", 1.35)
    rate_night = config.get("overtime_rate_night", 1.15)
    rate_holiday = config.get("overtime_rate_holiday", 2.0)
    rate_100 = config.get("overtime_rate_100", 2.0)
    hours_per_month = config.get("overtime_hours_per_month", 192.0) or 192.0
    
    base_salary = float(employee.get("base_salary") or 0)
    freq = employee.get("payment_frequency", "biweekly")
    monthly_salary = base_salary if freq == "monthly" else (base_salary * 2 if freq == "biweekly" else base_salary * 4)
    hourly_rate = (monthly_salary / hours_per_month) if hours_per_month else 0
    
    h35 = float(data.get("hours_35") or 0)
    hn = float(data.get("hours_night") or 0)
    hh = float(data.get("hours_holiday") or 0)
    h100 = float(data.get("hours_100") or 0)
    
    estimated_amount = (
        h35 * hourly_rate * rate_35
        + hn * hourly_rate * rate_night
        + hh * hourly_rate * rate_holiday
        + h100 * hourly_rate * rate_100
    )
    
    overtime_id = f"ot_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    overtime = {
        "overtime_id": overtime_id,
        "company_id": company_id,
        "employee_id": employee_id,
        "employee_name": employee.get("full_name"),
        "date": data.get("date"),
        "hours_35": h35,
        "hours_night": hn,
        "hours_holiday": hh,
        "hours_100": h100,
        "total_hours": round(h35 + hn + hh + h100, 2),
        "estimated_amount": round(estimated_amount, 2),
        "status": "pending",
        "reason": data.get("reason"),
        "notes": data.get("notes"),
        "created_at": now,
        "updated_at": now
    }
    
    await db.overtime_requests.insert_one(overtime)
    
    return {"overtime_id": overtime_id, "estimated_amount": round(estimated_amount, 2)}


@people_ops_router.get("/overtime/pending-in-range")
async def get_pending_overtime_in_range(
    start_date: str,
    end_date: str,
    user: User = Depends(get_current_user)
):
    """Returns approved & unpaid overtime requests within a date range.
    Used in the 'Create Payroll Period' dialog to preview OT to be included."""
    company_id, _ = await check_people_ops_access(user, "view")
    ots = await db.overtime_requests.find({
        "company_id": company_id,
        "status": "approved",
        "date": {"$gte": start_date, "$lte": end_date},
        "$or": [{"payroll_period_id": None}, {"payroll_period_id": {"$exists": False}}],
    }, {"_id": 0}).sort("date", 1).to_list(2000)
    
    # Aggregate by employee
    by_emp: dict = {}
    for ot in ots:
        emp_id = ot.get("employee_id")
        if not emp_id:
            continue
        acc = by_emp.setdefault(emp_id, {
            "employee_id": emp_id,
            "employee_name": ot.get("employee_name"),
            "hours_35": 0.0, "hours_night": 0.0, "hours_holiday": 0.0, "hours_100": 0.0,
            "estimated_amount": 0.0,
            "ot_ids": [],
        })
        acc["hours_35"] += float(ot.get("hours_35") or 0)
        acc["hours_night"] += float(ot.get("hours_night") or 0)
        acc["hours_holiday"] += float(ot.get("hours_holiday") or 0)
        acc["hours_100"] += float(ot.get("hours_100") or 0)
        acc["estimated_amount"] += float(ot.get("estimated_amount") or 0)
        acc["ot_ids"].append(ot.get("overtime_id"))
    
    return {
        "summary_by_employee": list(by_emp.values()),
        "raw": ots,
        "total_ot_count": len(ots),
        "total_estimated_amount": round(sum(o.get("estimated_amount") or 0 for o in ots), 2),
    }


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
        "deductions_detail": "Préstamo activo" if pending_deductions > 0 else None,
        
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



# ==================== REGULATORY REPORTS ====================

@people_ops_router.get("/regulatory-reports")
async def get_regulatory_reports(
    report_type: Optional[str] = None,
    year: Optional[int] = None,
    user: User = Depends(get_current_user)
):
    """Get list of generated regulatory reports"""
    company_id, _ = await check_people_ops_access(user, "view")
    
    query = {"company_id": company_id}
    if report_type:
        query["report_type"] = report_type
    if year:
        query["year"] = year
    
    reports = await db.regulatory_reports.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return reports


@people_ops_router.post("/regulatory-reports/generate")
async def generate_regulatory_report(data: dict, user: User = Depends(get_current_user)):
    """Generate a regulatory report (DGT-3, TSS, IR-17, 606)"""
    company_id, _ = await check_people_ops_access(user, "admin")
    
    report_type = data.get("report_type")
    year = data.get("year")
    period = data.get("period")  # Month (01-12) or Quarter (Q1-Q4)
    
    if not all([report_type, year, period]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    now = datetime.now(timezone.utc)
    report_id = f"rpt_{uuid.uuid4().hex[:12]}"
    
    # Get employees and their payroll data for the period
    employees = await db.employees.find(
        {"company_id": company_id, "status": "active"},
        {"_id": 0}
    ).to_list(500)
    
    # Determine date range based on period
    if period.startswith("Q"):
        quarter_months = {
            "Q1": ["01", "02", "03"],
            "Q2": ["04", "05", "06"],
            "Q3": ["07", "08", "09"],
            "Q4": ["10", "11", "12"]
        }
        months = quarter_months.get(period, ["01", "02", "03"])
        date_start = f"{year}-{months[0]}-01"
        date_end = f"{year}-{months[-1]}-31"
    else:
        date_start = f"{year}-{period}-01"
        date_end = f"{year}-{period}-31"
    
    # Get payroll data for the period
    payroll_entries = await db.payroll_entries.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Get payroll periods to filter by date
    periods = await db.payroll_periods.find(
        {
            "company_id": company_id,
            "status": "completed",
            "payment_date": {"$gte": date_start, "$lte": date_end}
        },
        {"_id": 0, "period_id": 1}
    ).to_list(100)
    period_ids = [p["period_id"] for p in periods]
    
    # Filter payroll entries by period
    filtered_entries = [e for e in payroll_entries if e.get("period_id") in period_ids]
    
    # Aggregate by employee
    employee_data = {}
    for entry in filtered_entries:
        emp_id = entry.get("employee_id")
        if emp_id not in employee_data:
            emp = next((e for e in employees if e.get("employee_id") == emp_id), None)
            employee_data[emp_id] = {
                "employee_id": emp_id,
                "employee_name": emp.get("full_name") if emp else entry.get("employee_name"),
                "national_id": emp.get("national_id") if emp else None,
                "salary": 0,
                "afp_employee": 0,
                "afp_employer": 0,
                "ars_employee": 0,
                "ars_employer": 0,
                "isr": 0,
                "other_deductions": 0
            }
        
        employee_data[emp_id]["salary"] += entry.get("gross_salary", 0)
        employee_data[emp_id]["afp_employee"] += entry.get("afp_employee", 0)
        employee_data[emp_id]["afp_employer"] += entry.get("afp_employer", 0)
        employee_data[emp_id]["ars_employee"] += entry.get("ars_employee", 0)
        employee_data[emp_id]["ars_employer"] += entry.get("ars_employer", 0)
        employee_data[emp_id]["isr"] += entry.get("isr", 0)
    
    # Build report entries
    report_entries = []
    total_salaries = 0
    total_afp = 0
    total_ars = 0
    total_isr = 0
    
    for emp_id, emp_data in employee_data.items():
        afp_total = emp_data["afp_employee"] + emp_data["afp_employer"]
        ars_total = emp_data["ars_employee"] + emp_data["ars_employer"]
        
        report_entries.append({
            "employee_id": emp_id,
            "employee_name": emp_data["employee_name"],
            "national_id": emp_data["national_id"],
            "salary": round(emp_data["salary"], 2),
            "afp_employee": round(emp_data["afp_employee"], 2),
            "afp_employer": round(emp_data["afp_employer"], 2),
            "afp_total": round(afp_total, 2),
            "ars_employee": round(emp_data["ars_employee"], 2),
            "ars_employer": round(emp_data["ars_employer"], 2),
            "ars_total": round(ars_total, 2),
            "isr": round(emp_data["isr"], 2)
        })
        
        total_salaries += emp_data["salary"]
        total_afp += afp_total
        total_ars += ars_total
        total_isr += emp_data["isr"]
    
    # Calculate total amount based on report type
    if report_type == "tss":
        total_amount = total_afp + total_ars
    elif report_type == "dgii_ir17":
        total_amount = total_isr
    else:
        total_amount = total_afp + total_ars + total_isr
    
    # Save report
    report_doc = {
        "report_id": report_id,
        "company_id": company_id,
        "report_type": report_type,
        "year": year,
        "period": period,
        "employee_count": len(report_entries),
        "total_salaries": round(total_salaries, 2),
        "total_afp": round(total_afp, 2),
        "total_ars": round(total_ars, 2),
        "total_isr": round(total_isr, 2),
        "total_amount": round(total_amount, 2),
        "entries": report_entries,
        "created_at": now,
        "created_by": user.user_id
    }
    
    await db.regulatory_reports.insert_one(report_doc)
    del report_doc["_id"]
    
    return report_doc


@people_ops_router.get("/regulatory-reports/{report_id}")
async def get_regulatory_report(report_id: str, user: User = Depends(get_current_user)):
    """Get a specific regulatory report with all entries"""
    company_id, _ = await check_people_ops_access(user, "view")
    
    report = await db.regulatory_reports.find_one(
        {"report_id": report_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return report


@people_ops_router.get("/regulatory-reports/{report_id}/download")
async def download_regulatory_report(
    report_id: str, 
    format: str = "xlsx",
    user: User = Depends(get_current_user)
):
    """Download regulatory report as Excel or CSV in official format"""
    import openpyxl
    from openpyxl.styles import Font, Border, Side, Alignment, PatternFill
    from openpyxl.utils import get_column_letter
    
    company_id, _ = await check_people_ops_access(user, "view")
    
    report = await db.regulatory_reports.find_one(
        {"report_id": report_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Get company info for header
    company = await db.organizations.find_one(
        {"org_id": company_id},
        {"_id": 0, "name": 1, "rnc": 1, "address": 1}
    )
    company_name = company.get("name", "Empresa") if company else "Empresa"
    company_rnc = company.get("rnc", "") if company else ""
    
    entries = report.get("entries", [])
    report_type = report["report_type"]
    period_label = f"{report['period']} {report['year']}"
    
    if format == "xlsx":
        # Create Excel workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        
        # Styles
        header_font = Font(bold=True, size=14)
        subheader_font = Font(bold=True, size=11)
        table_header_font = Font(bold=True, size=10, color="FFFFFF")
        table_header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        currency_format = '#,##0.00'
        
        # ============ TSS REPORT FORMAT ============
        if report_type == "tss":
            ws.title = "TSS"
            
            # Header
            ws.merge_cells('A1:I1')
            ws['A1'] = "TESORERÍA DE LA SEGURIDAD SOCIAL (TSS)"
            ws['A1'].font = header_font
            ws['A1'].alignment = Alignment(horizontal='center')
            
            ws.merge_cells('A2:I2')
            ws['A2'] = "PLANILLA DE APORTES MENSUALES AL SISTEMA DOMINICANO DE SEGURIDAD SOCIAL"
            ws['A2'].font = subheader_font
            ws['A2'].alignment = Alignment(horizontal='center')
            
            ws['A4'] = "Empresa:"
            ws['B4'] = company_name
            ws['D4'] = "RNC:"
            ws['E4'] = company_rnc
            ws['G4'] = "Período:"
            ws['H4'] = period_label
            
            # Table header at row 6
            headers = ["No.", "Cédula/NSS", "Nombre del Trabajador", "Salario Cotizable",
                      "AFP Empleado", "AFP Empleador", "ARS Empleado", "ARS Empleador", "Total Aportes"]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=6, column=col, value=header)
                cell.font = table_header_font
                cell.fill = table_header_fill
                cell.border = border
                cell.alignment = Alignment(horizontal='center')
            
            # Data rows
            row_num = 7
            for idx, entry in enumerate(entries, 1):
                total_aporte = (entry.get("afp_employee", 0) + entry.get("afp_employer", 0) +
                              entry.get("ars_employee", 0) + entry.get("ars_employer", 0))
                
                row_data = [
                    idx,
                    entry.get("national_id", ""),
                    entry.get("employee_name", ""),
                    entry.get("salary", 0),
                    entry.get("afp_employee", 0),
                    entry.get("afp_employer", 0),
                    entry.get("ars_employee", 0),
                    entry.get("ars_employer", 0),
                    total_aporte
                ]
                for col, value in enumerate(row_data, 1):
                    cell = ws.cell(row=row_num, column=col, value=value)
                    cell.border = border
                    if col >= 4:  # Currency columns
                        cell.number_format = currency_format
                        cell.alignment = Alignment(horizontal='right')
                row_num += 1
            
            # Totals row
            ws.cell(row=row_num, column=1, value="TOTALES").font = Font(bold=True)
            ws.cell(row=row_num, column=4, value=report.get("total_salaries", 0)).number_format = currency_format
            ws.cell(row=row_num, column=5, value=sum(e.get("afp_employee", 0) for e in entries)).number_format = currency_format
            ws.cell(row=row_num, column=6, value=sum(e.get("afp_employer", 0) for e in entries)).number_format = currency_format
            ws.cell(row=row_num, column=7, value=sum(e.get("ars_employee", 0) for e in entries)).number_format = currency_format
            ws.cell(row=row_num, column=8, value=sum(e.get("ars_employer", 0) for e in entries)).number_format = currency_format
            ws.cell(row=row_num, column=9, value=report.get("total_amount", 0)).number_format = currency_format
            for col in range(1, 10):
                ws.cell(row=row_num, column=col).border = border
                ws.cell(row=row_num, column=col).font = Font(bold=True)
            
            # Column widths
            col_widths = [6, 15, 35, 15, 13, 13, 13, 13, 15]
            for i, width in enumerate(col_widths, 1):
                ws.column_dimensions[get_column_letter(i)].width = width
        
        # ============ DGT-3 REPORT FORMAT ============
        elif report_type == "dgt3":
            ws.title = "DGT-3"
            
            # Header
            ws.merge_cells('A1:H1')
            ws['A1'] = "MINISTERIO DE TRABAJO"
            ws['A1'].font = header_font
            ws['A1'].alignment = Alignment(horizontal='center')
            
            ws.merge_cells('A2:H2')
            ws['A2'] = "FORMULARIO DGT-3 - REGISTRO DE PERSONAL"
            ws['A2'].font = subheader_font
            ws['A2'].alignment = Alignment(horizontal='center')
            
            ws['A4'] = "Empresa:"
            ws['B4'] = company_name
            ws['D4'] = "RNC:"
            ws['E4'] = company_rnc
            ws['G4'] = "Período:"
            ws['H4'] = period_label
            
            # Table header at row 6
            headers = ["No.", "Cédula", "Nombre del Trabajador", "Cargo",
                      "Fecha Ingreso", "Salario Mensual", "AFP", "ARS"]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=6, column=col, value=header)
                cell.font = table_header_font
                cell.fill = table_header_fill
                cell.border = border
                cell.alignment = Alignment(horizontal='center')
            
            # Get employee details for position and hire date
            emp_ids = [e.get("employee_id") for e in entries]
            employees = await db.employees.find(
                {"employee_id": {"$in": emp_ids}},
                {"_id": 0, "employee_id": 1, "position": 1, "hire_date": 1}
            ).to_list(500)
            emp_map = {e["employee_id"]: e for e in employees}
            
            # Data rows
            row_num = 7
            for idx, entry in enumerate(entries, 1):
                emp_detail = emp_map.get(entry.get("employee_id"), {})
                hire_date = emp_detail.get("hire_date", "")
                if hire_date and isinstance(hire_date, str):
                    try:
                        hire_date = datetime.fromisoformat(hire_date.replace("Z", "+00:00")).strftime("%d/%m/%Y")
                    except:
                        pass
                
                row_data = [
                    idx,
                    entry.get("national_id", ""),
                    entry.get("employee_name", ""),
                    emp_detail.get("position", ""),
                    hire_date,
                    entry.get("salary", 0),
                    entry.get("afp_total", 0),
                    entry.get("ars_total", 0)
                ]
                for col, value in enumerate(row_data, 1):
                    cell = ws.cell(row=row_num, column=col, value=value)
                    cell.border = border
                    if col >= 6:  # Currency columns
                        cell.number_format = currency_format
                        cell.alignment = Alignment(horizontal='right')
                row_num += 1
            
            # Totals row
            ws.cell(row=row_num, column=1, value="TOTALES").font = Font(bold=True)
            ws.cell(row=row_num, column=6, value=report.get("total_salaries", 0)).number_format = currency_format
            ws.cell(row=row_num, column=7, value=report.get("total_afp", 0)).number_format = currency_format
            ws.cell(row=row_num, column=8, value=report.get("total_ars", 0)).number_format = currency_format
            for col in range(1, 9):
                ws.cell(row=row_num, column=col).border = border
                ws.cell(row=row_num, column=col).font = Font(bold=True)
            
            # Column widths
            col_widths = [6, 15, 35, 20, 12, 15, 12, 12]
            for i, width in enumerate(col_widths, 1):
                ws.column_dimensions[get_column_letter(i)].width = width
        
        # ============ IR-17 REPORT FORMAT ============
        elif report_type == "dgii_ir17":
            ws.title = "IR-17"
            
            ws.merge_cells('A1:F1')
            ws['A1'] = "DIRECCIÓN GENERAL DE IMPUESTOS INTERNOS (DGII)"
            ws['A1'].font = header_font
            ws['A1'].alignment = Alignment(horizontal='center')
            
            ws.merge_cells('A2:F2')
            ws['A2'] = "FORMULARIO IR-17 - DECLARACIÓN JURADA DE RETENCIONES"
            ws['A2'].font = subheader_font
            ws['A2'].alignment = Alignment(horizontal='center')
            
            ws['A4'] = "Empresa:"
            ws['B4'] = company_name
            ws['D4'] = "RNC:"
            ws['E4'] = company_rnc
            
            ws['A5'] = "Período:"
            ws['B5'] = period_label
            
            # Table header at row 7
            headers = ["No.", "Cédula/RNC", "Nombre/Razón Social", "Monto Pagado", "ISR Retenido", "Tipo"]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=7, column=col, value=header)
                cell.font = table_header_font
                cell.fill = table_header_fill
                cell.border = border
                cell.alignment = Alignment(horizontal='center')
            
            row_num = 8
            for idx, entry in enumerate(entries, 1):
                row_data = [
                    idx,
                    entry.get("national_id", ""),
                    entry.get("employee_name", ""),
                    entry.get("salary", 0),
                    entry.get("isr", 0),
                    "Empleado"
                ]
                for col, value in enumerate(row_data, 1):
                    cell = ws.cell(row=row_num, column=col, value=value)
                    cell.border = border
                    if col in [4, 5]:
                        cell.number_format = currency_format
                        cell.alignment = Alignment(horizontal='right')
                row_num += 1
            
            # Totals
            ws.cell(row=row_num, column=1, value="TOTALES").font = Font(bold=True)
            ws.cell(row=row_num, column=4, value=report.get("total_salaries", 0)).number_format = currency_format
            ws.cell(row=row_num, column=5, value=report.get("total_isr", 0)).number_format = currency_format
            for col in range(1, 7):
                ws.cell(row=row_num, column=col).border = border
                ws.cell(row=row_num, column=col).font = Font(bold=True)
            
            col_widths = [6, 15, 35, 15, 15, 12]
            for i, width in enumerate(col_widths, 1):
                ws.column_dimensions[get_column_letter(i)].width = width
        
        # ============ GENERIC/OTHER REPORTS ============
        else:
            ws.title = report_type.upper()
            
            ws.merge_cells('A1:H1')
            ws['A1'] = f"REPORTE: {report_type.upper()}"
            ws['A1'].font = header_font
            ws['A1'].alignment = Alignment(horizontal='center')
            
            ws['A3'] = "Empresa:"
            ws['B3'] = company_name
            ws['D3'] = "Período:"
            ws['E3'] = period_label
            
            headers = ["No.", "Cédula", "Nombre", "Salario", "AFP Empl.", "AFP Patr.", "ARS Empl.", "ARS Patr.", "ISR"]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=5, column=col, value=header)
                cell.font = table_header_font
                cell.fill = table_header_fill
                cell.border = border
            
            row_num = 6
            for idx, entry in enumerate(entries, 1):
                row_data = [idx, entry.get("national_id", ""), entry.get("employee_name", ""),
                           entry.get("salary", 0), entry.get("afp_employee", 0), entry.get("afp_employer", 0),
                           entry.get("ars_employee", 0), entry.get("ars_employer", 0), entry.get("isr", 0)]
                for col, value in enumerate(row_data, 1):
                    cell = ws.cell(row=row_num, column=col, value=value)
                    cell.border = border
                    if col >= 4:
                        cell.number_format = currency_format
                row_num += 1
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        filename = f"{report_type}_{report['period']}_{report['year']}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    else:
        # CSV format (simplified)
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header based on report type
        if report_type == "tss":
            writer.writerow([
                "No.", "Cédula", "Nombre", "Salario",
                "AFP Empleado", "AFP Empleador", "ARS Empleado", "ARS Empleador", "Total"
            ])
            for idx, entry in enumerate(entries, 1):
                total = (entry.get("afp_employee", 0) + entry.get("afp_employer", 0) +
                        entry.get("ars_employee", 0) + entry.get("ars_employer", 0))
                writer.writerow([
                    idx, entry.get("national_id", ""), entry.get("employee_name", ""),
                    entry.get("salary", 0), entry.get("afp_employee", 0), entry.get("afp_employer", 0),
                    entry.get("ars_employee", 0), entry.get("ars_employer", 0), total
                ])
        elif report_type == "dgii_ir17":
            writer.writerow(["No.", "Cédula", "Nombre", "Salario", "ISR Retenido"])
            for idx, entry in enumerate(entries, 1):
                writer.writerow([
                    idx, entry.get("national_id", ""), entry.get("employee_name", ""),
                    entry.get("salary", 0), entry.get("isr", 0)
                ])
        else:
            writer.writerow([
                "No.", "Cédula", "Nombre", "Salario", "AFP Empl.", "AFP Patr.",
                "ARS Empl.", "ARS Patr.", "ISR"
            ])
            for idx, entry in enumerate(entries, 1):
                writer.writerow([
                    idx, entry.get("national_id", ""), entry.get("employee_name", ""),
                    entry.get("salary", 0), entry.get("afp_employee", 0), entry.get("afp_employer", 0),
                    entry.get("ars_employee", 0), entry.get("ars_employer", 0), entry.get("isr", 0)
                ])
        
        # Totals row
        writer.writerow([])
        writer.writerow(["TOTALES", "", "", report.get("total_salaries", 0)])
        
        output.seek(0)
        filename = f"{report_type}_{report['period']}_{report['year']}.csv"
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )



# ==================== RECRUITMENT ====================

@people_ops_router.get("/recruitment/jobs")
async def get_job_postings(
    status: str = "open",
    user: User = Depends(get_current_user)
):
    """Get all job postings"""
    company_id, access_level = await check_people_ops_access(user)
    
    query = {"company_id": company_id}
    if status and status != "all":
        query["status"] = status
    
    jobs = await db.job_postings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return jobs


@people_ops_router.post("/recruitment/jobs")
async def create_job_posting(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new job posting"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    job = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "title": data.get("title"),
        "department": data.get("department"),
        "department_id": data.get("department_id"),
        "position_id": data.get("position_id"),
        "location": data.get("location"),
        "employment_type": data.get("employment_type", "full_time"),
        "salary_min": data.get("salary_min"),
        "salary_max": data.get("salary_max"),
        "description": data.get("description"),
        "requirements": data.get("requirements"),
        "status": data.get("status", "open"),
        "scorecard_criteria": data.get("scorecard_criteria", []),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.job_postings.insert_one(job)
    return {"id": job["id"], "message": "Job posting created"}


@people_ops_router.put("/recruitment/jobs/{job_id}")
async def update_job_posting(
    job_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a job posting"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    update_data = {
        "title": data.get("title"),
        "department": data.get("department"),
        "location": data.get("location"),
        "employment_type": data.get("employment_type"),
        "salary_min": data.get("salary_min"),
        "salary_max": data.get("salary_max"),
        "description": data.get("description"),
        "requirements": data.get("requirements"),
        "status": data.get("status"),
        "scorecard_criteria": data.get("scorecard_criteria"),
        "updated_at": datetime.now(timezone.utc)
    }
    
    # Remove None values
    update_data = {k: v for k, v in update_data.items() if v is not None}
    
    result = await db.job_postings.update_one(
        {"id": job_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job posting not found")
    
    return {"message": "Job posting updated"}


@people_ops_router.get("/recruitment/candidates")
async def get_candidates(
    job_id: Optional[str] = None,
    stage: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all candidates"""
    company_id, access_level = await check_people_ops_access(user)
    
    query = {"company_id": company_id}
    if job_id:
        query["job_posting_id"] = job_id
    if stage:
        query["stage"] = stage
    
    candidates = await db.recruitment_candidates.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return candidates


@people_ops_router.post("/recruitment/candidates")
async def create_candidate(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new candidate"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    candidate = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "first_name": data.get("first_name"),
        "last_name": data.get("last_name"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "job_posting_id": data.get("job_posting_id"),
        "source": data.get("source"),
        "resume_url": data.get("resume_url"),
        "notes": data.get("notes"),
        "stage": data.get("stage", "new"),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.recruitment_candidates.insert_one(candidate)
    return {"id": candidate["id"], "message": "Candidate created"}


@people_ops_router.put("/recruitment/candidates/{candidate_id}")
async def update_candidate(
    candidate_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a candidate"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    update_data = {
        "first_name": data.get("first_name"),
        "last_name": data.get("last_name"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "job_posting_id": data.get("job_posting_id"),
        "source": data.get("source"),
        "resume_url": data.get("resume_url"),
        "notes": data.get("notes"),
        "stage": data.get("stage"),
        "updated_at": datetime.now(timezone.utc)
    }
    
    update_data = {k: v for k, v in update_data.items() if v is not None}
    
    result = await db.recruitment_candidates.update_one(
        {"id": candidate_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    return {"message": "Candidate updated"}


@people_ops_router.patch("/recruitment/candidates/{candidate_id}/stage")
async def update_candidate_stage(
    candidate_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update candidate stage"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    new_stage = data.get("stage")
    if not new_stage:
        raise HTTPException(status_code=400, detail="Stage is required")
    
    result = await db.recruitment_candidates.update_one(
        {"id": candidate_id, "company_id": company_id},
        {"$set": {
            "stage": new_stage,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    return {"message": "Stage updated"}


@people_ops_router.patch("/recruitment/candidates/{candidate_id}/scorecard")
async def update_candidate_scorecard(
    candidate_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update candidate scorecard evaluation"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    scorecard = data.get("scorecard", [])
    
    result = await db.recruitment_candidates.update_one(
        {"id": candidate_id, "company_id": company_id},
        {"$set": {
            "scorecard": scorecard,
            "scorecard_updated_at": datetime.now(timezone.utc),
            "scorecard_updated_by": user.user_id,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    return {"message": "Scorecard updated"}



@people_ops_router.post("/recruitment/candidates/{candidate_id}/hire")
async def hire_candidate(candidate_id: str, data: dict, user: User = Depends(get_current_user)):
    """Convert a candidate to an employee"""
    company_id, _ = await check_people_ops_access(user, "edit")

    candidate = await db.recruitment_candidates.find_one(
        {"id": candidate_id, "company_id": company_id},
        {"_id": 0}
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Get the job posting for department/position info
    job = None
    if candidate.get("job_posting_id"):
        job = await db.job_postings.find_one(
            {"id": candidate["job_posting_id"], "company_id": company_id},
            {"_id": 0}
        )

    # Check duplicate email
    existing = await db.employees.find_one({"company_id": company_id, "email": candidate.get("email")})
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this email already exists")

    now = datetime.now(timezone.utc)
    employee_id = f"emp_{uuid.uuid4().hex[:12]}"
    count = await db.employees.count_documents({"company_id": company_id})
    employee_number = f"EMP-{str(count + 1).zfill(4)}"

    # Resolve department name
    department_name = data.get("department") or (job.get("department") if job else "")
    department_id = data.get("department_id") or (job.get("department_id") if job else None)
    position_id = data.get("position_id") or (job.get("position_id") if job else None)
    job_title = data.get("job_title") or (job.get("title") if job else "")

    if department_id and not department_name:
        dept = await db.departments.find_one({"department_id": department_id}, {"_id": 0, "name": 1})
        department_name = dept.get("name", "") if dept else ""

    employee_doc = {
        "employee_id": employee_id,
        "company_id": company_id,
        "employee_number": employee_number,
        "first_name": candidate.get("first_name", ""),
        "last_name": candidate.get("last_name", ""),
        "full_name": f"{candidate.get('first_name', '')} {candidate.get('last_name', '')}".strip(),
        "email": candidate.get("email", ""),
        "phone": candidate.get("phone", ""),
        "job_title": job_title,
        "department": department_name,
        "department_id": department_id,
        "position_id": position_id,
        "contract_type": data.get("contract_type", "full_time"),
        "hire_date": data.get("hire_date", now.strftime("%Y-%m-%d")),
        "base_salary": data.get("base_salary", 0),
        "payment_frequency": data.get("payment_frequency", "biweekly"),
        "status": "active",
        "is_manager": data.get("is_manager", False),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }

    await db.employees.insert_one(employee_doc)

    # Update candidate stage to hired
    await db.recruitment_candidates.update_one(
        {"id": candidate_id, "company_id": company_id},
        {"$set": {"stage": "hired", "hired_employee_id": employee_id, "updated_at": now}}
    )

    # Close the job posting if all positions filled (optional)

    # Remove _id before returning
    employee_doc.pop("_id", None)
    return {"message": "Candidate hired successfully", "employee_id": employee_id, "employee": employee_doc}


# ==================== ONBOARDING ====================

@people_ops_router.get("/onboarding")
async def get_onboardings(
    status: str = "in_progress",
    user: User = Depends(get_current_user)
):
    """Get all onboardings"""
    company_id, access_level = await check_people_ops_access(user)
    
    query = {"company_id": company_id}
    if status and status != "all":
        query["status"] = status
    
    onboardings = await db.employee_onboardings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return onboardings


@people_ops_router.post("/onboarding")
async def create_onboarding(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new onboarding process"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    # Check if employee already has an active onboarding
    existing = await db.employee_onboardings.find_one({
        "company_id": company_id,
        "employee_id": data.get("employee_id"),
        "status": {"$nin": ["completed"]}
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Employee already has an active onboarding")
    
    now = datetime.now(timezone.utc)
    onboarding = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "employee_id": data.get("employee_id"),
        "start_date": data.get("start_date"),
        "target_completion_date": data.get("target_completion_date"),
        "notes": data.get("notes"),
        "checklist": data.get("checklist", []),
        "status": data.get("status", "not_started"),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.employee_onboardings.insert_one(onboarding)
    return {"id": onboarding["id"], "message": "Onboarding created"}


@people_ops_router.patch("/onboarding/{onboarding_id}/task/{task_id}")
async def update_onboarding_task(
    onboarding_id: str,
    task_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a specific task in onboarding checklist"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    onboarding = await db.employee_onboardings.find_one({
        "id": onboarding_id,
        "company_id": company_id
    })
    
    if not onboarding:
        raise HTTPException(status_code=404, detail="Onboarding not found")
    
    # Update the specific task
    checklist = onboarding.get("checklist", [])
    task_found = False
    for task in checklist:
        if task.get("id") == task_id:
            task["completed"] = data.get("completed", False)
            task["completed_at"] = datetime.now(timezone.utc).isoformat() if data.get("completed") else None
            task["completed_by"] = user.user_id if data.get("completed") else None
            task_found = True
            break
    
    if not task_found:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if all tasks completed
    all_completed = all(t.get("completed", False) for t in checklist)
    new_status = onboarding.get("status")
    if all_completed and new_status != "completed":
        new_status = "in_progress"  # Keep in progress until manually marked complete
    elif not any(t.get("completed", False) for t in checklist):
        new_status = "not_started"
    else:
        new_status = "in_progress"
    
    await db.employee_onboardings.update_one(
        {"id": onboarding_id, "company_id": company_id},
        {"$set": {
            "checklist": checklist,
            "status": new_status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Task updated"}


@people_ops_router.patch("/onboarding/{onboarding_id}/status")
async def update_onboarding_status(
    onboarding_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update onboarding status"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    new_status = data.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status is required")
    
    result = await db.employee_onboardings.update_one(
        {"id": onboarding_id, "company_id": company_id},
        {"$set": {
            "status": new_status,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Onboarding not found")
    
    return {"message": "Status updated"}


# ==================== PERFORMANCE ====================

@people_ops_router.get("/performance/reviews")
async def get_performance_reviews(
    year: Optional[int] = None,
    period: Optional[str] = None,
    employee_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get performance reviews"""
    company_id, access_level = await check_people_ops_access(user)
    
    query = {"company_id": company_id}
    if year:
        query["year"] = year
    if period and period != "all":
        query["period"] = period
    if employee_id:
        query["employee_id"] = employee_id
    
    reviews = await db.performance_reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return reviews


@people_ops_router.post("/performance/reviews")
async def create_performance_review(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new performance review"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    review = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "employee_id": data.get("employee_id"),
        "period": data.get("period", "annual"),
        "year": data.get("year", now.year),
        "ratings": data.get("ratings", {}),
        "self_assessment": data.get("self_assessment"),
        "manager_assessment": data.get("manager_assessment"),
        "goals_achieved": data.get("goals_achieved"),
        "areas_for_improvement": data.get("areas_for_improvement"),
        "development_plan": data.get("development_plan"),
        "overall_rating": data.get("overall_rating", 3),
        "status": data.get("status", "draft"),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.performance_reviews.insert_one(review)
    return {"id": review["id"], "message": "Review created"}


@people_ops_router.put("/performance/reviews/{review_id}")
async def update_performance_review(
    review_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a performance review"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    update_data = {
        "employee_id": data.get("employee_id"),
        "period": data.get("period"),
        "year": data.get("year"),
        "ratings": data.get("ratings"),
        "self_assessment": data.get("self_assessment"),
        "manager_assessment": data.get("manager_assessment"),
        "goals_achieved": data.get("goals_achieved"),
        "areas_for_improvement": data.get("areas_for_improvement"),
        "development_plan": data.get("development_plan"),
        "overall_rating": data.get("overall_rating"),
        "status": data.get("status"),
        "updated_at": datetime.now(timezone.utc)
    }
    
    update_data = {k: v for k, v in update_data.items() if v is not None}
    
    result = await db.performance_reviews.update_one(
        {"id": review_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    
    return {"message": "Review updated"}


@people_ops_router.get("/performance/goals")
async def get_performance_goals(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get performance goals"""
    company_id, access_level = await check_people_ops_access(user)
    
    query = {"company_id": company_id}
    if employee_id:
        query["employee_id"] = employee_id
    if status and status != "all":
        query["status"] = status
    
    goals = await db.performance_goals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return goals


@people_ops_router.post("/performance/goals")
async def create_performance_goal(
    data: dict,
    user: User = Depends(get_current_user)
):
    """Create a new performance goal"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    now = datetime.now(timezone.utc)
    goal = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "employee_id": data.get("employee_id"),
        "title": data.get("title"),
        "description": data.get("description"),
        "target_date": data.get("target_date"),
        "progress": data.get("progress", 0),
        "status": data.get("status", "in_progress"),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.performance_goals.insert_one(goal)
    return {"id": goal["id"], "message": "Goal created"}


@people_ops_router.put("/performance/goals/{goal_id}")
async def update_performance_goal(
    goal_id: str,
    data: dict,
    user: User = Depends(get_current_user)
):
    """Update a performance goal"""
    company_id, access_level = await check_people_ops_access(user, "edit")
    
    update_data = {
        "employee_id": data.get("employee_id"),
        "title": data.get("title"),
        "description": data.get("description"),
        "target_date": data.get("target_date"),
        "progress": data.get("progress"),
        "status": data.get("status"),
        "updated_at": datetime.now(timezone.utc)
    }
    
    update_data = {k: v for k, v in update_data.items() if v is not None}
    
    result = await db.performance_goals.update_one(
        {"id": goal_id, "company_id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return {"message": "Goal updated"}


# ============== DEPARTMENT BACKFILL MIGRATION ==============

@people_ops_router.post("/departments/backfill")
async def backfill_department_ids(user: User = Depends(get_current_user)):
    """
    Migration: Backfill department_id for employees that have a 'department' string
    but no 'department_id'. Matches the department string against existing departments.
    """
    company_id = user.company_id
    if user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner/admin can run migrations")

    # Get all departments for matching
    departments = await db.departments.find(
        {"company_id": company_id},
        {"_id": 0, "department_id": 1, "name": 1}
    ).to_list(200)

    if not departments:
        return {"message": "No departments found. Create departments first.", "updated": 0, "skipped": 0, "no_match": []}

    # Build name -> department_id lookup (case-insensitive)
    dept_map = {}
    for d in departments:
        dept_map[d["name"].strip().lower()] = d["department_id"]

    # Find employees without department_id but with a department string
    employees = await db.employees.find(
        {
            "company_id": company_id,
            "$or": [
                {"department_id": None},
                {"department_id": {"$exists": False}}
            ],
            "department": {"$exists": True, "$ne": None, "$ne": ""}
        },
        {"_id": 0, "employee_id": 1, "name": 1, "department": 1}
    ).to_list(5000)

    updated = 0
    skipped = 0
    no_match = []

    for emp in employees:
        dept_str = (emp.get("department") or "").strip().lower()
        if not dept_str:
            skipped += 1
            continue

        matched_id = dept_map.get(dept_str)
        if matched_id:
            await db.employees.update_one(
                {"employee_id": emp["employee_id"], "company_id": company_id},
                {"$set": {"department_id": matched_id}}
            )
            updated += 1
        else:
            no_match.append({
                "employee_id": emp["employee_id"],
                "name": emp.get("name", ""),
                "department": emp.get("department", "")
            })

    # Also update cost_center department links
    cost_centers = await db.cost_centers.find(
        {
            "company_id": company_id,
            "$or": [
                {"department_id": None},
                {"department_id": {"$exists": False}}
            ],
            "department_name": {"$exists": True, "$ne": None, "$ne": ""}
        },
        {"_id": 0, "cost_center_id": 1, "department_name": 1}
    ).to_list(200)

    cc_updated = 0
    for cc in cost_centers:
        cc_dept = (cc.get("department_name") or "").strip().lower()
        matched_id = dept_map.get(cc_dept)
        if matched_id:
            await db.cost_centers.update_one(
                {"cost_center_id": cc["cost_center_id"], "company_id": company_id},
                {"$set": {"department_id": matched_id}}
            )
            cc_updated += 1

    return {
        "message": f"Backfill complete. {updated} employees updated, {cc_updated} cost centers linked.",
        "updated": updated,
        "cc_updated": cc_updated,
        "skipped": skipped,
        "no_match": no_match[:50],
        "available_departments": [d["name"] for d in departments]
    }

